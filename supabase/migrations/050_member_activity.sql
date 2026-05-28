-- Member activity + cancellation tracking.
--
-- Two related needs:
--   1. Track how active each member is — when they last logged in, how
--      many times, how long they spend in the app. Powers a "Member
--      stats" panel in /admin/developer and gives ops a feel for who's
--      engaged vs. who's drifting.
--   2. Track trip-cancel frequency so we can warn habitual cancellers
--      ("repeated cancels may put your membership under review") and
--      surface them to ops without enforcing automatically.
--
-- All denormalized fields are kept in sync via triggers — the app
-- doesn't need to remember to write them.

-- ─── 1. Activity columns on members ────────────────────────────────────────
alter table public.members
  add column if not exists last_login_at        timestamptz,
  add column if not exists last_active_at       timestamptz,
  add column if not exists login_count          integer not null default 0,
  add column if not exists total_session_minutes integer not null default 0,
  add column if not exists cancel_count_90d     integer not null default 0,
  add column if not exists cancel_count_lifetime integer not null default 0;

-- ─── 2. Per-session log ────────────────────────────────────────────────────
-- A "session" = one continuous use of the app. The beacon hook pings
-- /api/activity/beacon every 60s while the tab is open; the route
-- either opens a new session (no row yet, or the last row ended > 5
-- min ago) or extends the current one (touches ended_at to now()).
create table if not exists public.member_sessions (
  id              uuid primary key default gen_random_uuid(),
  member_id       text not null references public.members(id) on delete cascade,
  started_at      timestamptz not null default now(),
  ended_at        timestamptz not null default now(),
  page_views      integer not null default 1,
  user_agent      text,
  ip_hash         text,
  created_at      timestamptz not null default now()
);

create index if not exists member_sessions_member_idx
  on public.member_sessions(member_id, started_at desc);

alter table public.member_sessions enable row level security;

-- Admins read all sessions. Members read their own. Writes are
-- service-role only (the /api/activity/beacon route uses the admin
-- client so RLS doesn't bounce its writes).
drop policy if exists "Admins read all sessions" on public.member_sessions;
create policy "Admins read all sessions" on public.member_sessions
  for select using (public.is_admin());

drop policy if exists "Members read own sessions" on public.member_sessions;
create policy "Members read own sessions" on public.member_sessions
  for select using (member_id = public.current_member_id());

-- ─── 3. Recompute cancel_count_90d for a member ───────────────────────────
-- Called from a trigger on bookings whenever a row flips into/out of
-- the cancelled bucket. Also exposed as a function ops can hit
-- manually for backfill.
create or replace function public.recalc_member_cancel_counts(p_member_id text)
  returns void
  language sql
  security definer
  set search_path = public
as $$
  update public.members m
  set
    cancel_count_lifetime = coalesce((
      select count(*) from public.bookings b
      where b.member_id = m.id and b.status = 'cancelled'
    ), 0),
    cancel_count_90d = coalesce((
      select count(*) from public.bookings b
      where b.member_id = m.id
        and b.status = 'cancelled'
        and coalesce(b.cancelled_at, b.submitted_at) >= now() - interval '90 days'
    ), 0)
  where m.id = p_member_id
$$;

grant execute on function public.recalc_member_cancel_counts(text) to authenticated;

-- Trigger: any time a booking is inserted or its status changes,
-- recompute the affected member's cancel counts. Cheap — counts of
-- one member's bookings is a single index hit.
create or replace function public.bookings_update_member_cancel_counts()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    if new.member_id is not null then
      perform public.recalc_member_cancel_counts(new.member_id);
    end if;
  elsif (tg_op = 'UPDATE') then
    if (old.status is distinct from new.status) or (old.member_id is distinct from new.member_id) then
      if new.member_id is not null then
        perform public.recalc_member_cancel_counts(new.member_id);
      end if;
      if old.member_id is not null and old.member_id is distinct from new.member_id then
        perform public.recalc_member_cancel_counts(old.member_id);
      end if;
    end if;
  elsif (tg_op = 'DELETE') then
    if old.member_id is not null then
      perform public.recalc_member_cancel_counts(old.member_id);
    end if;
  end if;
  return null;
end$$;

drop trigger if exists bookings_member_cancel_counts on public.bookings;
create trigger bookings_member_cancel_counts
  after insert or update or delete on public.bookings
  for each row execute function public.bookings_update_member_cancel_counts();

-- Backfill: stamp counts on every existing member once.
do $$
declare r record;
begin
  for r in select id from public.members loop
    perform public.recalc_member_cancel_counts(r.id);
  end loop;
end$$;
