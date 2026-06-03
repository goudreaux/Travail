-- Tropic Blackout Dates — dates Tropic has told us they have no aircraft
-- available. The Concierge Team enters these on the dashboard calendar; they
-- flow through to the member calendar (marked unavailable) and block every
-- booking / anchor / proposal wizard from picking those dates.
--
-- One row per blacked-out date. Everyone can read (so members see them and the
-- wizards can validate); only admins can add/remove.
create table if not exists public.blackout_dates (
  date       date primary key,
  note       text,
  created_by text references public.members(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.blackout_dates enable row level security;

drop policy if exists "Anyone can read blackout dates" on public.blackout_dates;
create policy "Anyone can read blackout dates"
  on public.blackout_dates for select using (auth.uid() is not null);

drop policy if exists "Admins manage blackout dates" on public.blackout_dates;
create policy "Admins manage blackout dates"
  on public.blackout_dates for all using (public.is_admin());
