-- 002_guests.sql — Guest registration
-- Run this in Supabase → SQL Editor before using guest registration at checkout.

-- A member's reusable roster of people they travel with.
create table if not exists public.guests (
  id uuid primary key default gen_random_uuid(),
  host_member_id text not null references public.members(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  member_id text references public.members(id) on delete set null,  -- set if the guest is also a Travail member
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists guests_host_member_idx on public.guests(host_member_id);

-- Who occupies each seat on a booking (snapshot, so history stays accurate).
create table if not exists public.booking_passengers (
  id uuid primary key default gen_random_uuid(),
  booking_id text not null references public.bookings(id) on delete cascade,
  guest_id uuid references public.guests(id) on delete set null,
  is_host boolean not null default false,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  created_at timestamptz not null default now()
);
create index if not exists booking_passengers_booking_idx on public.booking_passengers(booking_id);

alter table public.guests enable row level security;
alter table public.booking_passengers enable row level security;

-- Guests: a member manages their own roster; admins manage all.
create policy "Members manage own guests" on public.guests for all
  using (host_member_id in (select id from public.members where user_id = auth.uid()))
  with check (host_member_id in (select id from public.members where user_id = auth.uid()));
create policy "Admins manage all guests" on public.guests for all
  using (public.is_admin());

-- Booking passengers: tied to the owning member's bookings; admins manage all.
create policy "Members manage own booking passengers" on public.booking_passengers for all
  using (booking_id in (select id from public.bookings where member_id in (select id from public.members where user_id = auth.uid())))
  with check (booking_id in (select id from public.bookings where member_id in (select id from public.members where user_id = auth.uid())));
create policy "Admins manage all booking passengers" on public.booking_passengers for all
  using (public.is_admin());
