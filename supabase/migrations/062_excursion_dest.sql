-- Give excursions a direct destination code so every excursion — sponsored,
-- anchored, or templated — can draw origin → destination on the Route Map.
--
-- Until now the map inferred an excursion's destination from its template
-- (excursion_templates.dest_code). Sponsored / one-off excursions have no
-- template, so they had no destination to plot. This column is the single,
-- authoritative destination; the map reads it first and falls back to the
-- template only for older rows that predate this column.

alter table public.excursions
  add column if not exists dest_code text;

-- Backfill from the template so existing templated excursions keep mapping.
update public.excursions e
set dest_code = t.dest_code
from public.excursion_templates t
where e.template_id = t.id
  and e.dest_code is null;
