-- Optional per-trip hero image shown on the member cards. Null falls back to the
-- app's default image at display time.

alter table public.flights    add column if not exists image_url text;
alter table public.excursions  add column if not exists image_url text;
