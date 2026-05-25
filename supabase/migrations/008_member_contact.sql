-- Member contact details (email + phone) live alongside DOB in the
-- admin-only member_sensitive table, not the publicly-readable members table.
-- The login link itself is members.user_id (the Supabase Auth UID); these are
-- contact/record fields for Ops.

-- Create the table here (idempotently) so a fresh build has it before later
-- migrations alter/reference it. 027 finalizes columns, the cascade FK, and RLS.
create table if not exists public.member_sensitive (
  member_id text primary key references public.members(id) on delete cascade,
  date_of_birth date
);

alter table public.member_sensitive add column if not exists email text;
alter table public.member_sensitive add column if not exists phone text;
