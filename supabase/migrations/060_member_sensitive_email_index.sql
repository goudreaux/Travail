-- Case-insensitive email lookups on member_sensitive.
--
-- The OTP sign-in gate (/api/auth/request-code) and the notify-email Edge
-- Function both look up a member by email case-insensitively. At founder-cohort
-- size this is a trivial scan, but an expression index keeps it O(log n) as the
-- club grows. Matches the lower(email) pattern already used on referrals (048).
create index if not exists member_sensitive_lower_email_idx
  on public.member_sensitive (lower(email));
