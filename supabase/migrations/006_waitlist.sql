-- 006_waitlist.sql — waitlist for full trips. Run in Supabase → SQL Editor.

create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  member_id text not null references public.members(id) on delete cascade,
  item_kind text not null check (item_kind in ('flight', 'excursion')),
  item_id text not null,
  created_at timestamptz not null default now(),
  unique (member_id, item_kind, item_id)
);
create index if not exists waitlist_item_idx on public.waitlist(item_kind, item_id, created_at);

alter table public.waitlist enable row level security;

create policy "Members manage own waitlist" on public.waitlist for all
  using (member_id in (select id from public.members where user_id = auth.uid()))
  with check (member_id in (select id from public.members where user_id = auth.uid()));
create policy "Admins manage all waitlist" on public.waitlist for all
  using (public.is_admin());
