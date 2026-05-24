-- Excursion templates no longer carry a fixed capacity — capacity is decided per
-- scheduled trip (seaplane / on the day), not baked into the catalog. Make the
-- column optional and clear it from the Field & Stream series.

alter table public.excursion_templates alter column capacity drop not null;

update public.excursion_templates set capacity = null where id like 'fs-%';
