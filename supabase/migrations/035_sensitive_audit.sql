-- PII access hardening for the Ops side of the app.
--
-- Today the admin members page bulk-SELECTs member_sensitive on every page
-- load — that's hundreds of rows of email/phone/DOB read in one go with no
-- record of who looked at what. This migration:
--
--   1) Exposes a presence-only view so the list view can still flag "no
--      email on file" / "no phone on file" without ever fetching the value.
--   2) Provides a SECURITY DEFINER helper that returns a single member's
--      contact row AND writes an audit row to activity_log for any admin
--      pull that isn't the admin reading their own data. Ordinary members
--      reading their own row are unaffected.
--
-- The underlying member_sensitive table keeps its existing RLS — admins
-- still have direct SELECT — so this is layered, not a hard cutover. We'll
-- migrate the client code to prefer these helpers, then revisit revoking
-- direct SELECT later once nothing in app code reads the table directly.

-- ─── 1. Presence-only view ──────────────────────────────────────────────────
-- security_invoker so the underlying RLS on member_sensitive still gates the
-- read. Admins get every row; ordinary members get only their own.
create or replace view public.members_has_contact
  with (security_invoker = true)
as
  select
    member_id,
    (email is not null and length(trim(email)) > 0) as has_email,
    (phone is not null and length(trim(phone)) > 0) as has_phone,
    (date_of_birth is not null) as has_dob,
    updated_at
  from public.member_sensitive;

grant select on public.members_has_contact to authenticated;

-- ─── 2. Audited per-member read ─────────────────────────────────────────────
-- Returns the contact row for target_id. Permitted callers:
--   • the member themselves (no audit row)
--   • an admin (writes an activity_log entry stamped with the actor)
--   • the service role (no audit — internal automation)
-- All other callers get nothing back.
create or replace function public.admin_get_member_sensitive(target_id text)
returns table (member_id text, email text, phone text, date_of_birth date, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me text;
  v_is_admin boolean;
begin
  v_me := public.current_member_id();
  v_is_admin := public.is_admin();

  -- Self read: allowed, no audit.
  if v_me is not null and v_me = target_id then
    return query
      select s.member_id, s.email, s.phone, s.date_of_birth, s.updated_at
      from public.member_sensitive s where s.member_id = target_id;
    return;
  end if;

  -- Admin read: allowed, audited.
  if v_is_admin then
    insert into public.activity_log (
      actor_kind, actor_member_id, subject_member_id, action, summary, meta
    ) values (
      'admin',
      v_me,
      target_id,
      'pii_read',
      'Admin viewed member contact details',
      jsonb_build_object('source', 'admin_get_member_sensitive')
    );
    return query
      select s.member_id, s.email, s.phone, s.date_of_birth, s.updated_at
      from public.member_sensitive s where s.member_id = target_id;
    return;
  end if;

  -- Anyone else: silent empty result.
  return;
end;
$$;

grant execute on function public.admin_get_member_sensitive(text) to authenticated;
