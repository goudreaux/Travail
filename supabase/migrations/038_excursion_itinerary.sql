-- Itinerary column on excursions — an ordered list of the day's
-- major stops (takeoff, land, activity check-in, wheels up, arrive).
-- Stored as JSONB so Ops can edit it freely in the admin editor
-- without a schema change for each new format.
--
-- The members /reserve page renders these steps as a bubble-down
-- timeline. Anchoring members don't fill this in — the field stays
-- null on submission, Ops generates defaults from the date / time
-- columns at publish time and edits before going live.
--
-- Shape (TypeScript-style):
--   [
--     { time: '08:30', label: 'Take off at KTPF', sub?: 'Davis Island' },
--     { time: '09:45', label: 'Land at Marsh Harbour', sub?: 'MHH' },
--     ...
--   ]

alter table public.excursions
  add column if not exists itinerary jsonb;
