-- Keep `member_sensitive.email` in sync with `auth.users.email`.
--
-- Background: a member has two email fields. `auth.users.email` is the
-- login identity (created when they accept their Supabase Auth invite).
-- `member_sensitive.email` is the Ops-managed contact column read by the
-- notify-email Edge Function, the admin presence view, and the contact-
-- invite-resend flow.
--
-- For members who were invited directly through Supabase Auth (not
-- created through the admin People form), `auth.users.email` was set
-- but `member_sensitive` may have no row at all — which is why the
-- People page renders "NO EMAIL" for everyone, and why notification
-- emails silently no-op.
--
-- This migration:
--   1) Backfills `member_sensitive` from `auth.users.email` for every
--      member with a non-null `user_id` whose contact row is missing or
--      has an empty email.
--   2) Adds a SECURITY DEFINER trigger that re-syncs `member_sensitive`
--      whenever a row in `members.user_id` is set (linking to an auth
--      user) — so the next member to accept their invite gets their
--      contact row populated automatically.

-- ─── 1. One-time backfill ───────────────────────────────────────────────────
insert into public.member_sensitive (member_id, email)
select m.id, u.email
from public.members m
join auth.users u on u.id = m.user_id
where u.email is not null and length(trim(u.email)) > 0
on conflict (member_id) do update
  set email = excluded.email,
      updated_at = now()
  where public.member_sensitive.email is null
     or length(trim(public.member_sensitive.email)) = 0;

-- ─── 2. Keep the two in sync going forward ─────────────────────────────────
-- Fires when a member is created or their user_id is changed (the moment
-- an invited user accepts and we link them via link_my_member). Copies
-- the auth email into member_sensitive without overwriting an existing
-- ops-entered value.
create or replace function public.sync_member_email_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if new.user_id is null then return new; end if;
  select email into v_email from auth.users where id = new.user_id;
  if v_email is null or length(trim(v_email)) = 0 then return new; end if;

  insert into public.member_sensitive (member_id, email)
  values (new.id, v_email)
  on conflict (member_id) do update
    set email = excluded.email,
        updated_at = now()
    where public.member_sensitive.email is null
       or length(trim(public.member_sensitive.email)) = 0;

  return new;
end;
$$;

drop trigger if exists members_sync_email_on_insert on public.members;
create trigger members_sync_email_on_insert
  after insert on public.members
  for each row execute function public.sync_member_email_from_auth();

drop trigger if exists members_sync_email_on_user_id on public.members;
create trigger members_sync_email_on_user_id
  after update of user_id on public.members
  for each row
  when (new.user_id is distinct from old.user_id)
  execute function public.sync_member_email_from_auth();
