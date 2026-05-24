-- Administrators are excluded from the human-facing member numbering. They get
-- no member_no and never consume a number from the sequence, so the member
-- roster stays contiguous (#1, #2, …) without gaps where an admin would sit.

-- 1. Clear every number, then reassign cleanly to non-administrators only.
--    (Nulling first avoids transient unique-index collisions while reordering.)
update public.members set member_no = null;

with ordered as (
  select id, row_number() over (order by joined_at asc nulls last, created_at asc) as rn
  from public.members
  where tier <> 'administrator'
)
update public.members m
set member_no = o.rn
from ordered o
where m.id = o.id;

-- 2. Point the sequence at the highest assigned number.
select setval('public.members_member_no_seq', coalesce((select max(member_no) from public.members), 0));

-- 3. Replace the blanket column default with a trigger: administrators get NULL,
--    everyone else is auto-numbered when a number isn't supplied explicitly.
alter table public.members alter column member_no drop default;

create or replace function public.assign_member_no()
returns trigger
language plpgsql
as $$
begin
  if new.tier = 'administrator' then
    new.member_no := null;
  elsif new.member_no is null then
    new.member_no := nextval('public.members_member_no_seq');
  end if;
  return new;
end;
$$;

drop trigger if exists members_assign_member_no on public.members;
create trigger members_assign_member_no
  before insert or update on public.members
  for each row execute function public.assign_member_no();
