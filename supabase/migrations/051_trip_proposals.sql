-- Trip Proposals — Kickstarter-style trips that don't book until the
-- network hits a minimum commit threshold.
--
-- Lifecycle:
--   pending_ops_review — member submitted, ops sets min_seats + price
--   open               — accepting commits, no charges yet
--   funded             — hit min_seats, ops locked Tropic, deposits
--                        captured, converted to a real flight/excursion
--                        row (flight_id / excursion_id back-references)
--   expired            — T-5d auto-cancel without hitting min — no charges
--   declined           — ops said no upfront
--   withdrawn          — proposer pulled it before any other commits
--
-- 5-day operational runway: every proposal must auto-cancel at
-- T-5 days if the minimum isn't met, so Tropic, vendors, and ops
-- can confirm resources without losing availability. Enforced in the
-- proposals-sweep cron.

-- ─── trip_proposals ────────────────────────────────────────────────────────
create table if not exists public.trip_proposals (
  id                   text primary key
                         default 'TP-' || upper(substr(md5(random()::text), 1, 6)),
  proposer_id          text not null references public.members(id) on delete cascade,

  -- Same kind dichotomy as anchor_submissions / bookings.
  kind                 text not null check (kind in ('flight', 'excursion')),

  -- Shared fields. Flight payloads also include dest_code; excursion
  -- payloads also include stay_type. Free-form jsonb keeps the schema
  -- flexible across both shapes without a UNION-table mess.
  name                 text not null,
  date                 date not null,
  origin_code          text not null references public.airports(code),
  payload              jsonb not null default '{}'::jsonb,

  -- Ops-set fields (filled during review). null until ops approves.
  capacity_total       integer,
  min_seats            integer,
  price_per_seat_cents integer,

  -- Proposer "spread guarantee": they commit a firm party size
  -- (proposer_min_seats) and agree to cover up to proposer_max_seats
  -- total if the network underfills. At lock time, proposer's actual
  -- charge is:
  --   clamp(min_seats - network_committed, proposer_min, proposer_max)
  -- Example: Tom proposes 8-seater, min_seats=6, party=2, max=4.
  --   • 4 others commit → Tom pays for 2
  --   • 2 others commit → Tom pays for 4 (his cap)
  --   • 1 other commits → proposal can't make min, expires
  proposer_min_seats   integer not null default 1,
  proposer_max_seats   integer not null default 1,

  -- Lifecycle.
  status               text not null default 'pending_ops_review'
                         check (status in ('pending_ops_review','open','funded','expired','declined','withdrawn')),
  -- Computed at status='open': date - 5 days. Beyond this point the
  -- proposals-sweep cron starts checking for the min-seat threshold;
  -- if not met by then, the proposal auto-expires.
  expires_at           timestamptz,

  reviewed_at          timestamptz,
  reviewed_by          text references public.members(id) on delete set null,
  funded_at            timestamptz,
  expired_at           timestamptz,

  -- When funded, links to the resulting flight or excursion row.
  flight_id            text references public.flights(id) on delete set null,
  excursion_id         text references public.excursions(id) on delete set null,

  decline_reason       text,

  created_at           timestamptz not null default now()
);

create index if not exists trip_proposals_status_idx
  on public.trip_proposals(status, date);
create index if not exists trip_proposals_proposer_idx
  on public.trip_proposals(proposer_id, created_at desc);
create index if not exists trip_proposals_date_idx
  on public.trip_proposals(date);
create index if not exists trip_proposals_expires_at_idx
  on public.trip_proposals(expires_at)
  where status = 'open';

alter table public.trip_proposals enable row level security;

-- Everyone signed in reads open / funded proposals (they're on the
-- public boards). Proposer + admins see everything including their
-- pending / withdrawn ones.
drop policy if exists "Proposals visible on boards" on public.trip_proposals;
create policy "Proposals visible on boards" on public.trip_proposals
  for select using (
    auth.uid() is not null and (
      status in ('open','funded')
      or proposer_id = public.current_member_id()
      or public.is_admin()
    )
  );

drop policy if exists "Members propose trips" on public.trip_proposals;
create policy "Members propose trips" on public.trip_proposals
  for insert with check (proposer_id = public.current_member_id());

drop policy if exists "Proposer withdraws own pending" on public.trip_proposals;
create policy "Proposer withdraws own pending" on public.trip_proposals
  for update using (
    proposer_id = public.current_member_id()
    and status in ('pending_ops_review','open')
  ) with check (
    proposer_id = public.current_member_id()
    and status in ('pending_ops_review','open','withdrawn')
  );

drop policy if exists "Admins manage proposals" on public.trip_proposals;
create policy "Admins manage proposals" on public.trip_proposals
  for all using (public.is_admin()) with check (public.is_admin());


-- ─── trip_proposal_commits ─────────────────────────────────────────────────
-- One row per (member, proposal) pair. SetupIntent + payment method
-- id are saved at commit time; PaymentIntent is created when ops locks
-- the proposal.
create table if not exists public.trip_proposal_commits (
  id                       uuid primary key default gen_random_uuid(),
  proposal_id              text not null references public.trip_proposals(id) on delete cascade,
  member_id                text not null references public.members(id) on delete cascade,
  seats                    integer not null default 1 check (seats > 0),

  stripe_customer_id       text,
  stripe_setup_intent_id   text,
  payment_method_id        text,

  -- 'committed'      — card on file, awaiting funding
  -- 'released'       — proposal expired / withdrawn → no charge
  -- 'captured'       — PaymentIntent succeeded; member has a real booking
  -- 'capture_failed' — Stripe declined at capture time
  status                   text not null default 'committed'
                             check (status in ('committed','released','captured','capture_failed')),
  payment_intent_id        text,
  amount_cents             integer,

  committed_at             timestamptz not null default now(),
  released_at              timestamptz,
  captured_at              timestamptz,

  -- One commit per member per proposal.
  unique (proposal_id, member_id)
);

create index if not exists trip_proposal_commits_proposal_idx
  on public.trip_proposal_commits(proposal_id);
create index if not exists trip_proposal_commits_member_idx
  on public.trip_proposal_commits(member_id, committed_at desc);

alter table public.trip_proposal_commits enable row level security;

drop policy if exists "Commits visible to participants" on public.trip_proposal_commits;
create policy "Commits visible to participants" on public.trip_proposal_commits
  for select using (
    member_id = public.current_member_id()
    or public.is_admin()
    or proposal_id in (
      select id from public.trip_proposals
      where proposer_id = public.current_member_id()
    )
  );

drop policy if exists "Members commit themselves" on public.trip_proposal_commits;
create policy "Members commit themselves" on public.trip_proposal_commits
  for insert with check (member_id = public.current_member_id());

drop policy if exists "Members release own commit" on public.trip_proposal_commits;
create policy "Members release own commit" on public.trip_proposal_commits
  for update using (
    member_id = public.current_member_id()
    and status = 'committed'
  ) with check (
    member_id = public.current_member_id()
    and status in ('committed','released')
  );

drop policy if exists "Admins manage commits" on public.trip_proposal_commits;
create policy "Admins manage commits" on public.trip_proposal_commits
  for all using (public.is_admin()) with check (public.is_admin());


-- ─── Helper: count committed seats on a proposal ───────────────────────────
-- Trivial sql wrapper but lets the cron/sweep code stay readable.
create or replace function public.proposal_committed_seats(p_proposal_id text)
  returns integer
  language sql
  stable
  security definer
  set search_path = public
as $$
  select coalesce(sum(seats), 0)::integer
  from public.trip_proposal_commits
  where proposal_id = p_proposal_id
    and status in ('committed','captured')
$$;

grant execute on function public.proposal_committed_seats(text) to authenticated;
