-- App-wide settings — a single config row the ops team controls from the
-- developer dashboard. First use: "Closed for maintenance" mode, which
-- freezes every money/transaction path (bookings, commits, captures,
-- subscriptions) while leaving read-only access (boarding passes,
-- activity) untouched.
--
-- Singleton by design: id is pinned to 1 so there's exactly one row to
-- read and write. Readable by any signed-in member (so the app can show
-- a maintenance banner + disable transaction CTAs); writable only by
-- admins.

create table if not exists public.app_settings (
  id                  integer primary key default 1,
  maintenance_mode    boolean not null default false,
  -- Optional custom message shown to members; falls back to a default
  -- in the app when blank.
  maintenance_message text,
  updated_at          timestamptz not null default now(),
  updated_by          text references public.members(id) on delete set null,
  constraint app_settings_singleton check (id = 1)
);

-- Seed the single row so reads always find it.
insert into public.app_settings (id, maintenance_mode)
  values (1, false)
  on conflict (id) do nothing;

alter table public.app_settings enable row level security;

-- Any signed-in member can read the flag (for the banner + CTA gating).
create policy "Authenticated read app settings" on public.app_settings
  for select using (auth.uid() is not null);

-- Only admins can change it.
create policy "Admins manage app settings" on public.app_settings
  for all using (public.is_admin()) with check (public.is_admin());
