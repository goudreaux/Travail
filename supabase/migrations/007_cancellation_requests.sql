-- 007_cancellation_requests.sql — member-initiated cancellation requests
-- surfaced in the Ops Queue. Run in Supabase → SQL Editor.

create table if not exists public.cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id text not null references public.bookings(id) on delete cascade,
  member_id text not null references public.members(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now()
);
create index if not exists cancellation_requests_status_idx on public.cancellation_requests(status, created_at);

alter table public.cancellation_requests enable row level security;

create policy "Members manage own cancellation requests" on public.cancellation_requests for all
  using (member_id in (select id from public.members where user_id = auth.uid()))
  with check (member_id in (select id from public.members where user_id = auth.uid()));
create policy "Admins manage all cancellation requests" on public.cancellation_requests for all
  using (public.is_admin());
