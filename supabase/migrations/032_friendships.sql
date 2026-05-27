-- Friendships — mutual connections between members. One row per
-- unordered pair, so we can't double-book a relationship in either
-- direction. status tracks the request lifecycle.

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id text not null references public.members(id) on delete cascade,
  addressee_id text not null references public.members(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint friendships_distinct_pair check (requester_id <> addressee_id)
);

-- Canonical uniqueness — at most one row per unordered pair, regardless
-- of who initiated. If the row exists and was declined, the existing pair
-- must be deleted before a new request can be opened.
create unique index if not exists friendships_canonical_pair
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

create index if not exists friendships_requester_idx on public.friendships (requester_id);
create index if not exists friendships_addressee_idx on public.friendships (addressee_id);

alter table public.friendships enable row level security;

-- Visible to either side and to admins.
create policy "Members can read own friendships" on public.friendships
  for select using (
    requester_id = public.current_member_id()
    or addressee_id = public.current_member_id()
    or public.is_admin()
  );

-- Only the requester can open a request, and only as pending.
create policy "Members can request friendships" on public.friendships
  for insert with check (
    requester_id = public.current_member_id()
    and status = 'pending'
  );

-- The addressee accepts/declines; either side can remove the row.
create policy "Addressee can decide friendship" on public.friendships
  for update using (
    addressee_id = public.current_member_id() or public.is_admin()
  ) with check (
    status in ('accepted','declined')
  );

create policy "Either side can remove friendship" on public.friendships
  for delete using (
    requester_id = public.current_member_id()
    or addressee_id = public.current_member_id()
    or public.is_admin()
  );

-- Stamp decided_at automatically when status leaves pending.
create or replace function public.friendship_set_decided_at()
returns trigger
language plpgsql
as $$
begin
  if new.status <> 'pending' and (old.status is distinct from new.status) then
    new.decided_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists friendships_decided_at on public.friendships;
create trigger friendships_decided_at
  before update on public.friendships
  for each row execute function public.friendship_set_decided_at();

-- Notify the addressee on request, and the requester on acceptance.
-- SECURITY DEFINER so the notification insert bypasses notifications RLS
-- (members can't normally insert notifications for other members).
create or replace function public.friendship_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if (TG_OP = 'INSERT') then
    select name into v_name from public.members where id = new.requester_id;
    insert into public.notifications (member_id, kind, title, body, ref) values (
      new.addressee_id,
      'friend',
      'New friend request',
      coalesce(v_name, 'A member') || ' wants to connect with you on Travail.',
      jsonb_build_object('friendship_id', new.id, 'requester_id', new.requester_id)
    );
  elsif (TG_OP = 'UPDATE' and old.status = 'pending' and new.status = 'accepted') then
    select name into v_name from public.members where id = new.addressee_id;
    insert into public.notifications (member_id, kind, title, body, ref) values (
      new.requester_id,
      'friend',
      'Friend request accepted',
      coalesce(v_name, 'A member') || ' accepted your friend request.',
      jsonb_build_object('friendship_id', new.id, 'addressee_id', new.addressee_id)
    );
  end if;
  return null;
end;
$$;

drop trigger if exists friendships_notify_insert on public.friendships;
create trigger friendships_notify_insert
  after insert on public.friendships
  for each row execute function public.friendship_notify();

drop trigger if exists friendships_notify_update on public.friendships;
create trigger friendships_notify_update
  after update of status on public.friendships
  for each row execute function public.friendship_notify();
