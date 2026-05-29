-- Let sponsored excursions skip template_id + aircraft_id.
--
-- The original 001 schema made excursions.template_id and aircraft_id
-- NOT NULL (both FK-referenced). That was fine when every excursion
-- came from a member anchor flow that always picked a template +
-- aircraft. Sponsored excursions (Travail-funded, created from the ops
-- "+ Sponsored" modal) are free-form: a custom name, no template, and
-- the aircraft is whatever Tropic assigns later. The modal correctly
-- omits both, but the NOT NULL constraints rejected the insert.
--
-- Relax both to nullable. Member-anchored excursions still always set
-- them (the publish-anchor route defaults aircraft_id to 'caravan'),
-- so this only opens the door for the sponsored path.

alter table public.excursions alter column template_id drop not null;
alter table public.excursions alter column aircraft_id drop not null;
