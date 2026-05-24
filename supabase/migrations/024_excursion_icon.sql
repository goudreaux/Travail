-- Each excursion can carry its own trip-type icon, chosen when scheduling,
-- independent of (and overriding) the template's icon. Null falls back to the
-- template's icon at display time.

alter table public.excursions add column if not exists icon text;
