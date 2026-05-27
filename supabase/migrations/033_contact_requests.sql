-- Contact requests — opt-in reveal of email + phone between members.
-- Independent of friendships: a member can be a friend yet keep contact
-- private, or share contact without being a friend.

create table if not exists public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id text not null references public.members(id) on delete cascade,
  addressee_id text not null references public.members(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','granted','declined','revoked')),
  note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint contact_requests_distinct_pair check (requester_id <> addressee_id)
);

-- One outstanding request per directed pair. (The reverse direction is a
-- separate row — A→B sharing doesn't imply B→A sharing.)
create unique index if not exists contact_requests_unique_direction
  on public.contact_requests (requester_id, addressee_id);

create index if not exists contact_requests_requester_idx on public.contact_requests (requester_id);
create index if not exists contact_requests_addressee_idx on public.contact_requests (addressee_id);

alter table public.contact_requests enable row level security;

-- Either party (and admins) can see the row.
create policy "Members can read own contact requests" on public.contact_requests
  for select using (
    requester_id = public.current_member_id()
    or addressee_id = public.current_member_id()
    or public.is_admin()
  );

-- Only the requester can open a request, only as pending.
create policy "Members can create contact requests" on public.contact_requests
  for insert with check (
    requester_id = public.current_member_id()
    and status = 'pending'
  );

-- Addressee decides (grant or decline). Addressee can also revoke a
-- previously granted share.
create policy "Addressee can decide contact request" on public.contact_requests
  for update using (
    addressee_id = public.current_member_id() or public.is_admin()
  ) with check (
    status in ('granted','declined','revoked')
  );

-- Requester may withdraw (delete their own pending/declined row).
create policy "Either side can remove contact request" on public.contact_requests
  for delete using (
    requester_id = public.current_member_id()
    or addressee_id = public.current_member_id()
    or public.is_admin()
  );

-- Stamp decided_at on status changes.
create or replace function public.contact_request_set_decided_at()
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

drop trigger if exists contact_requests_decided_at on public.contact_requests;
create trigger contact_requests_decided_at
  before update on public.contact_requests
  for each row execute function public.contact_request_set_decided_at();

-- Notify the counterparty on key transitions.
create or replace function public.contact_request_notify()
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
      'contact',
      'Contact info request',
      coalesce(v_name, 'A member') || ' is asking to share contact details.',
      jsonb_build_object('contact_request_id', new.id, 'requester_id', new.requester_id)
    );
  elsif (TG_OP = 'UPDATE' and old.status = 'pending' and new.status = 'granted') then
    select name into v_name from public.members where id = new.addressee_id;
    insert into public.notifications (member_id, kind, title, body, ref) values (
      new.requester_id,
      'contact',
      'Contact info shared',
      coalesce(v_name, 'A member') || ' shared their contact details with you.',
      jsonb_build_object('contact_request_id', new.id, 'addressee_id', new.addressee_id)
    );
  end if;
  return null;
end;
$$;

drop trigger if exists contact_requests_notify_insert on public.contact_requests;
create trigger contact_requests_notify_insert
  after insert on public.contact_requests
  for each row execute function public.contact_request_notify();

drop trigger if exists contact_requests_notify_update on public.contact_requests;
create trigger contact_requests_notify_update
  after update of status on public.contact_requests
  for each row execute function public.contact_request_notify();

-- SECURITY DEFINER reveal function — returns email + phone for the target
-- member iff the caller has a granted contact_request from themselves to
-- that member (or is an admin, or is the target themselves). Bypasses
-- member_sensitive RLS deliberately.
create or replace function public.get_member_contact(target_id text)
returns table (email text, phone text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me text;
  v_allowed boolean;
begin
  v_me := public.current_member_id();

  if v_me is null then
    return;
  end if;

  v_allowed := public.is_admin()
    or v_me = target_id
    or exists (
      select 1 from public.contact_requests
      where requester_id = v_me
        and addressee_id = target_id
        and status = 'granted'
    );

  if not v_allowed then
    return;
  end if;

  return query
    select s.email, s.phone
    from public.member_sensitive s
    where s.member_id = target_id;
end;
$$;

grant execute on function public.get_member_contact(text) to authenticated;
