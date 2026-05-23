-- 003_booking_messages.sql — in-app two-way thread per booking
-- Run in Supabase → SQL Editor before using trip threads.

create table if not exists public.booking_messages (
  id uuid primary key default gen_random_uuid(),
  booking_id text not null references public.bookings(id) on delete cascade,
  sender_member_id text references public.members(id) on delete set null,
  is_ops boolean not null default false,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists booking_messages_booking_idx on public.booking_messages(booking_id, created_at);

alter table public.booking_messages enable row level security;

-- The booking owner and any admin can read the thread.
create policy "Read own or admin booking messages" on public.booking_messages for select
  using (
    public.is_admin()
    or booking_id in (select id from public.bookings where member_id in (select id from public.members where user_id = auth.uid()))
  );

-- Posters must be the current member, on their own booking or as an admin.
create policy "Post to own or admin booking messages" on public.booking_messages for insert
  with check (
    sender_member_id in (select id from public.members where user_id = auth.uid())
    and (
      public.is_admin()
      or booking_id in (select id from public.bookings where member_id in (select id from public.members where user_id = auth.uid()))
    )
  );

-- Optional: live updates (safe to skip if it errors on your setup).
alter publication supabase_realtime add table public.booking_messages;
