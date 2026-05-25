-- Guests carry a date of birth (required in the app's guest-entry form). The
-- column is nullable at the DB level so existing guests and the host passenger
-- row aren't broken; the requirement is enforced in the UI for new guests.
alter table public.guests add column if not exists date_of_birth date;
alter table public.booking_passengers add column if not exists date_of_birth date;
