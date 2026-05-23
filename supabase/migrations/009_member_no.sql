-- Sequential member number, in signup order. The UUID `id` stays the primary
-- key (referenced by bookings, messages, etc.); member_no is the human-facing
-- number shown in the UI as "#7".

alter table public.members add column if not exists member_no integer;

-- Backfill existing members in the order they joined.
with ordered as (
  select id, row_number() over (order by joined_at asc nulls last, created_at asc) as rn
  from public.members
)
update public.members m
set member_no = o.rn
from ordered o
where m.id = o.id and m.member_no is null;

-- Auto-assign the next number to each new member.
create sequence if not exists public.members_member_no_seq;
select setval('public.members_member_no_seq', coalesce((select max(member_no) from public.members), 0));
alter table public.members alter column member_no set default nextval('public.members_member_no_seq');
alter sequence public.members_member_no_seq owned by public.members.member_no;

-- One number per member.
create unique index if not exists members_member_no_key on public.members(member_no);
