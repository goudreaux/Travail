-- Member contact details (email + phone) live alongside DOB in the
-- admin-only member_sensitive table, not the publicly-readable members table.
-- The login link itself is members.user_id (the Supabase Auth UID); these are
-- contact/record fields for Ops.

alter table public.member_sensitive add column if not exists email text;
alter table public.member_sensitive add column if not exists phone text;
