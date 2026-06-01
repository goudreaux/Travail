-- Location Library: make the airports table the single source of truth for
-- every origin and destination — name, code, type (role), and now coordinates.
--
-- Until now coordinates were hardcoded in src/lib/airport-coords.ts and the
-- venue destinations (St. Regis, Little Palm Island, Boca Grande, …) only
-- existed in code. This migration adds lat/lng (+ an active flag) and seeds the
-- table from those hardcoded values so the Concierge Library page, every
-- origin/destination picker, and the Route Map all read from one place.

alter table public.airports
  add column if not exists lat    double precision,
  add column if not exists lng    double precision,
  add column if not exists active boolean not null default true;

-- Seed / upsert every known location. For rows that already exist we only set
-- the coordinates (and keep the curated name/role); new venue rows are inserted
-- with a sensible name + role. Coordinates are [lng, lat].
insert into public.airports (code, name, sub, role, lng, lat) values
  ('KTPA',  'Tampa International',          'Tampa, FL',            'both',        -82.5332, 27.9755),
  ('KTPF',  'Davis Islands',               'Tampa, FL',            'origin',      -82.4490, 27.9156),
  ('KFXE',  'Fort Lauderdale Executive',   'Fort Lauderdale, FL',  'origin',      -80.1707, 26.1973),
  ('KSPG',  'Albert Whitted',              'St. Petersburg, FL',   'origin',      -82.6373, 27.7651),
  ('KEYW',  'Key West',                    'FL Keys',              'both',        -81.7595, 24.5561),
  ('KMTH',  'Marathon',                    'FL Keys',              'destination', -81.0514, 24.7262),
  ('KOPF',  'Opa-locka',                   'Miami, FL',            'destination', -80.2784, 25.9070),
  ('KGIF',  'Country Club of Winter Haven','Golf · Winter Haven',  'destination', -81.7329, 28.0228),
  ('LPI',   'Little Palm Island',          'FL Keys',              'destination', -81.4015, 24.6166),
  ('STR',   'St. Regis Hotel',             'Sarasota, FL',         'destination', -82.5307, 27.3364),
  ('LCC',   'Lochloosa Country Club',      'North Central FL',     'destination', -82.0900, 29.5100),
  ('BOCA',  'Boca Grande',                 'Tarpon · SW FL',       'destination', -82.2715, 26.7478),
  ('LKNONA','Lake Nona Golf Club',         'Golf · Orlando, FL',   'destination', -81.2519, 28.3772),
  ('MYBS',  'Bimini',                      'Bahamas',              'destination', -79.2647, 25.6998),
  ('MYAM',  'Marsh Harbour',               'Abaco, Bahamas',       'destination', -77.0835, 26.5114),
  ('MYAN',  'Andros',                      'Bahamas',              'destination', -78.0490, 25.0538),
  ('MYEF',  'Exuma',                       'Bahamas',              'destination', -75.8780, 23.5625),
  ('FLBAY', 'Florida Bay',                 'Everglades, FL',       'destination', -80.9500, 25.1500),
  ('TENTH', 'Ten Thousand Islands',        'SW FL',                'destination', -81.4500, 25.8500),
  ('DRTRT', 'Dry Tortugas',                'FL',                   'destination', -82.8732, 24.6285),
  ('OKEEC', 'Lake Okeechobee',             'FL',                   'destination', -80.8500, 26.9500),
  ('NFSPR', 'North Florida Springs',       'FL',                   'destination', -83.0000, 30.0000),
  ('TALQ',  'Lake Talquin',                'FL',                   'destination', -84.5500, 30.4200)
on conflict (code) do update set
  lng = excluded.lng,
  lat = excluded.lat;

-- Restore the 'CUSTOM' sentinel (originally from migration 049) as an INACTIVE
-- row. It has no coordinates and the app hides it from every picker, but it
-- must exist so a trip can carry dest_code='CUSTOM' before a real place is
-- assigned (flights.dest_code is a foreign key to airports.code). Inactive keeps
-- it out of the Library list and pickers while preserving referential integrity.
insert into public.airports (code, name, sub, role, active) values
  ('CUSTOM', 'Custom destination', 'Awaiting Concierge confirm', 'both', false)
on conflict (code) do update set active = false;
