-- Sponsored excursions support — Travail / Tropic / Field & Stream-style
-- collabs that ops creates directly, with no anchoring member.
--
-- The only schema change needed is making excursions.anchor_member_id
-- nullable. Reserved seats (for employees / brand partners who get the
-- first batch of capacity) reuse the existing spots_anchor column —
-- semantically identical (count against capacity, not bookable by
-- members). The sponsor name (free text like "Travail × Tropic × Field
-- & Stream") goes in the existing sponsor column.
--
-- Existing app-side code already sends `anchor_member_id || null` when
-- saving an excursion, which would've failed today; this migration
-- unblocks that path.

alter table public.excursions
  alter column anchor_member_id drop not null;

-- For symmetry — flights might want sponsored variants later (a Tropic
-- demo flight, say). Cheap to make nullable now while we're touching
-- the schema, even if we don't expose it in UI yet.
alter table public.flights
  alter column anchor_member_id drop not null;
