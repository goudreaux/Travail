-- Trip-proposal safety + ops cleanups.
--
-- Three jobs:
--   1. Lock-route idempotency — a lock_started_at sentinel on the
--      proposal row so two ops clicks (or two tabs) can't both
--      run the capture loop and double-charge members. The lock
--      route atomically flips this NULL → now() in a single
--      UPDATE; only one caller gets the row. Also closes the
--      withdraw-vs-lock race: withdraw refuses once
--      lock_started_at is set.
--   2. Atomic activity-beacon update — multiple tabs writing the
--      same total_session_minutes via read-modify-write loses
--      minutes. Move the bump into a SECURITY DEFINER RPC that
--      uses `column = column + delta`.
--   3. Extend guard_member_delete to also block on open or
--      pending Trip Proposals — without this, deleting a member
--      with live proposals silently cascades them away. Also
--      loosen the proposer_id FK from CASCADE to SET NULL so
--      terminal proposals (funded/expired/declined/withdrawn)
--      survive the member delete for audit purposes.

-- ─── 1. Lock sentinel on trip_proposals ───────────────────────────────────
alter table public.trip_proposals
  add column if not exists lock_started_at timestamptz;

create index if not exists trip_proposals_lock_started_at_idx
  on public.trip_proposals(lock_started_at)
  where lock_started_at is not null;

-- ─── 2. Atomic activity bump ─────────────────────────────────────────────
-- Single-row, single-statement update so concurrent tabs never lose
-- a minute. Caller is the service-role beacon route; we still set
-- search_path so this can't be tampered with.
create or replace function public.bump_member_activity(
  p_member_id text,
  p_delta_minutes integer
) returns void
language sql
security definer
set search_path = public
as $$
  update public.members
  set last_active_at = now(),
      total_session_minutes = greatest(0, total_session_minutes + coalesce(p_delta_minutes, 0))
  where id = p_member_id
$$;

grant execute on function public.bump_member_activity(text, integer) to authenticated;

-- ─── 3. Extend the member-delete guard to cover proposals ────────────────
-- Same shape as 046 but also counting any active Trip Proposal owned
-- by the member. Active = 'pending_ops_review' or 'open' — terminal
-- states are fine to leave attached via SET NULL FK behavior (below).
create or replace function public.guard_member_delete()
  returns trigger
  language plpgsql
as $$
declare
  live_count integer;
  live_proposal_count integer;
begin
  select count(*) into live_count
  from public.bookings
  where member_id = old.id
    and status in ('pending_ops_review', 'confirmed');
  if live_count > 0 then
    raise exception 'Member % has % live booking(s) — cancel them before deleting the member.', old.id, live_count
      using errcode = 'restrict_violation';
  end if;

  select count(*) into live_proposal_count
  from public.trip_proposals
  where proposer_id = old.id
    and status in ('pending_ops_review', 'open');
  if live_proposal_count > 0 then
    raise exception 'Member % has % active Trip Proposal(s) — withdraw or resolve them before deleting the member.', old.id, live_proposal_count
      using errcode = 'restrict_violation';
  end if;

  return old;
end$$;

-- Trigger is already attached from migration 046 — no need to recreate.

-- ─── 4. Loosen trip_proposals.proposer_id FK to SET NULL ─────────────────
-- The guard above now blocks active proposals. Terminal ones (funded,
-- expired, declined, withdrawn) survive the member delete for audit.
do $$
declare
  fk_name text;
begin
  select c.conname into fk_name
  from pg_constraint c
  where c.conrelid = 'public.trip_proposals'::regclass
    and c.contype = 'f'
    and c.confrelid = 'public.members'::regclass;
  if fk_name is not null then
    execute format('alter table public.trip_proposals drop constraint %I', fk_name);
  end if;
end$$;

alter table public.trip_proposals
  alter column proposer_id drop not null;

alter table public.trip_proposals
  add constraint trip_proposals_proposer_id_fkey
  foreign key (proposer_id) references public.members(id) on delete set null;
