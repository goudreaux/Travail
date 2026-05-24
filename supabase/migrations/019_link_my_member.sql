-- Self-heal member linking. If a logged-in user has no member record yet (e.g.
-- the invite link step didn't run, or they were created in Auth before the
-- profile), match their email to a pre-created member and link it. SECURITY
-- DEFINER so it can read auth.users and link across RLS, but it ONLY links a
-- member that shares the caller's email and isn't already linked.
create or replace function public.link_my_member()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  em text;
  mid text;
begin
  select email into em from auth.users where id = auth.uid();
  if em is null then return false; end if;

  select ms.member_id into mid
  from public.member_sensitive ms
  join public.members m on m.id = ms.member_id
  where lower(ms.email) = lower(em)
    and (m.user_id is null or m.user_id = '00000000-0000-0000-0000-000000000000')
  limit 1;

  if mid is null then return false; end if;

  update public.members set user_id = auth.uid() where id = mid;
  return true;
end;
$$;

grant execute on function public.link_my_member() to authenticated;
