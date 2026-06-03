-- Member "Other Clubs" — free-form list of country clubs, social clubs, etc.
-- that a member belongs to, shown on their profile.
alter table public.members
  add column if not exists other_clubs text[];
