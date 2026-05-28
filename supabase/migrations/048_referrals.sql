-- Member-to-ops referrals.
--
-- A member vouches for someone they think would be a fit for Travail.
-- Ops reviews each referral, optionally reaches out, and either invites
-- them as a member (which links the new member back to the referral row
-- so we can see who introduced whom) or declines.
--
-- Lifecycle:
--   pending    — member submitted, ops hasn't looked yet
--   contacted  — ops has reached out to the prospect (in-conversation)
--   invited    — ops invited them; invited_member_id is set
--   declined   — ops decided not to extend an invite
--   withdrawn  — referring member retracted before ops acted
--
-- The activity_log already handles status transitions for auditing —
-- we keep decided_at / decided_by on the row for fast list rendering
-- without needing to join activity_log every time.

create table if not exists public.referrals (
  id                 text primary key
                       default 'R-' || upper(substr(md5(random()::text), 1, 6)),
  referrer_id        text not null references public.members(id) on delete cascade,

  first_name         text not null,
  last_name          text not null,
  email              text not null,
  phone              text,

  -- Member's pitch: "why would they be a good fit?" Optional but the
  -- form encourages it. Trimmed to a sensible length at the app layer.
  why                text,

  status             text not null default 'pending'
                       check (status in ('pending','contacted','invited','declined','withdrawn')),
  ops_notes          text,
  decided_at         timestamptz,
  decided_by         text references public.members(id) on delete set null,
  invited_member_id  text references public.members(id) on delete set null,

  created_at         timestamptz not null default now()
);

create index if not exists referrals_referrer_idx
  on public.referrals(referrer_id, created_at desc);
create index if not exists referrals_status_idx
  on public.referrals(status, created_at desc);
create index if not exists referrals_email_idx
  on public.referrals(lower(email));

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.referrals enable row level security;

-- Members see their own referrals.
drop policy if exists "Members read own referrals" on public.referrals;
create policy "Members read own referrals" on public.referrals
  for select using (referrer_id = public.current_member_id() or public.is_admin());

-- Members submit referrals tied to their own member id.
drop policy if exists "Members insert own referrals" on public.referrals;
create policy "Members insert own referrals" on public.referrals
  for insert with check (referrer_id = public.current_member_id());

-- Members can withdraw a still-pending referral. They can NOT change
-- any other field — that's ops's domain. Status update beyond
-- withdrawn is admin-only.
drop policy if exists "Members withdraw own referrals" on public.referrals;
create policy "Members withdraw own referrals" on public.referrals
  for update using (
    referrer_id = public.current_member_id()
    and status = 'pending'
  ) with check (
    referrer_id = public.current_member_id()
    and status in ('pending','withdrawn')
  );

-- Admins do everything.
drop policy if exists "Admins manage referrals" on public.referrals;
create policy "Admins manage referrals" on public.referrals
  for all using (public.is_admin()) with check (public.is_admin());
