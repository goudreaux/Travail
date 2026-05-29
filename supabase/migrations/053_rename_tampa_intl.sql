-- Tighten the KTPA display label.
--
-- Originally seeded as "Tampa International" in migration 049, but the
-- wizards now show "TPA" — keep the airports table in sync so any UI
-- that joins to it (admin trip editor, queue, member emails) reads the
-- same short label everywhere.
update public.airports
set name = 'TPA'
where code = 'KTPA';
