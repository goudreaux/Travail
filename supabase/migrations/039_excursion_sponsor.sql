-- Sponsor / co-presenter on excursions. First brand to wire in is
-- Field & Stream — used to mark excursions they've planned or are
-- sponsoring. Stored as a free text slug so we can add more partners
-- without a schema change for each one.

alter table public.excursions
  add column if not exists sponsor text;

-- Optional: also seed the column on excursion_templates so the
-- admin-side default rolls in when ops creates an excursion from a
-- template designed by a sponsor.
alter table public.excursion_templates
  add column if not exists sponsor text;
