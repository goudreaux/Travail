-- Capture the member_sensitive table (member contact/PII for Ops) in version
-- control. It previously existed only in the live database — earlier migrations
-- merely altered it (008 added email/phone) and referenced it (019). A fresh
-- environment built from migrations therefore lacked the table entirely, which
-- breaks both the Ops member editor and auto-email (the notify-email Edge
-- Function reads the recipient address from member_sensitive.email).
--
-- This migration is idempotent: it creates the table if missing, backfills any
-- missing columns on a pre-existing copy, normalizes the FK to cascade on member
-- delete, and pins down the RLS the app relies on.

create table if not exists public.member_sensitive (
  member_id text primary key references public.members(id) on delete cascade,
  date_of_birth date,
  email text,
  phone text,
  updated_at timestamptz not null default now()
);

-- Backfill columns for any pre-existing copy of the table.
alter table public.member_sensitive add column if not exists date_of_birth date;
alter table public.member_sensitive add column if not exists email text;
alter table public.member_sensitive add column if not exists phone text;
alter table public.member_sensitive add column if not exists updated_at timestamptz not null default now();

-- Ensure deleting a member removes their contact row (so member delete can't be
-- blocked by a dangling FK).
do $$
declare fk text;
begin
  select conname into fk from pg_constraint
  where conrelid = 'public.member_sensitive'::regclass
    and contype = 'f'
    and confrelid = 'public.members'::regclass;
  if fk is not null then
    execute format('alter table public.member_sensitive drop constraint %I', fk);
  end if;
  alter table public.member_sensitive
    add constraint member_sensitive_member_id_fkey
    foreign key (member_id) references public.members(id) on delete cascade;
end $$;

alter table public.member_sensitive enable row level security;

-- Pin down the policy set. This table holds PII, so we clear whatever policies
-- exist and recreate exactly the access the app uses: admins manage every row;
-- members may read and upsert their own contact row. (The notify-email function
-- uses the service role and bypasses RLS.) This reproduces the live policies, so
-- applying it does not change behavior — it just captures them in version control.
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'member_sensitive'
  loop
    execute format('drop policy %I on public.member_sensitive', p.policyname);
  end loop;
end $$;

create policy "Admins can manage sensitive data" on public.member_sensitive
  for all using (public.is_admin()) with check (public.is_admin());

create policy "Members can upsert own sensitive data" on public.member_sensitive
  for all
  using (member_id = public.current_member_id())
  with check (member_id = public.current_member_id());

create policy "Members can view own sensitive data" on public.member_sensitive
  for select using (member_id = public.current_member_id());

grant select, insert, update, delete on public.member_sensitive to authenticated;
