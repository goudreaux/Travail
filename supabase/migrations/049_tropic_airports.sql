-- Seed the airports the new anchor-flight wizard exposes to members.
--
-- The wizard restricts member-side route picking to Tropic Ocean Airways'
-- scheduled-flight footprint plus a free-form "Custom destination"
-- request path. Flights.origin_code / dest_code reference public.airports,
-- so every code the wizard can emit needs a row here or Ops's "publish
-- flight" step will fail the FK.
--
-- Idempotent — re-running won't disturb rows that already exist (admin
-- may have customized them).

insert into public.airports (code, name, sub, role)
values
  ('KTPA', 'Tampa International',           'Tampa, FL',         'origin'),
  ('KTPF', 'Davis Islands',                  'Tampa, FL',         'origin'),
  ('STR',  'St. Regis Hotel · Sarasota',     'Sarasota, FL',      'destination'),
  ('LCC',  'Lochloosa Country Club',         'North Central FL',  'destination'),
  ('KEYW', 'Key West Airport',               'FL Keys',           'destination'),
  ('LPI',  'Little Palm Island',             'FL Keys',           'destination'),
  -- Sentinel for the "Custom destination" wizard path. Lets the anchor
  -- submission carry destCode='CUSTOM' through to ops review; ops swaps
  -- in the real airport code on the published flight (and that real
  -- code is what FK-references this table). Marked 'both' so it can
  -- play either role if anyone ever inserts a flight referencing it
  -- before the swap (defensive — shouldn't normally happen).
  ('CUSTOM', 'Custom destination',           'Awaiting ops confirm', 'both')
on conflict (code) do nothing;
