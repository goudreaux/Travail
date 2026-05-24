-- Field & Stream Excursion Series — six Florida fishing templates, each with a
-- conservation story. Adds a description column to hold that narrative.
--
-- These run by seaplane: there is no destination airport — the aircraft sets
-- down on the water in the fishing region. The "destination" entries below are
-- named water-landing areas (regions), not airports.

alter table public.excursion_templates add column if not exists description text;

-- Water-landing regions (not airports — the seaplane lands on the water).
insert into public.airports (code, name, sub, role) values
  ('FLBAY', 'Florida Bay',          'Everglades · seaplane water landing',          'destination'),
  ('TENTH', 'Ten Thousand Islands', 'Mangrove backcountry · seaplane water landing','destination'),
  ('DRTRT', 'Dry Tortugas',         'Fort Jefferson · seaplane water landing',      'destination'),
  ('OKEEC', 'Lake Okeechobee',      'Big Water · seaplane water landing',           'destination'),
  ('NFSPR', 'North Florida Springs','Wacissa / Suwannee · seaplane water landing',  'destination'),
  ('TALQ',  'Lake Talquin',         'Ochlockonee system · seaplane water landing',  'destination')
on conflict (code) do nothing;

insert into public.excursion_templates (id, dest_code, name, operator, capacity, price_per_pax, icon, description) values
  ('fs-florida-bay', 'FLBAY', 'Florida Bay & the Everglades', 'Travail × Field & Stream', 4, 2400, 'fish',
   'Sight-fishing the skinny water for tarpon, snook, redfish, trout, and bonefish. The conservation story: Everglades restoration, freshwater flow, seagrass health, and the future of one of America''s great shallow-water fisheries.'),
  ('fs-ten-thousand-islands', 'TENTH', 'Ten Thousand Islands', 'Travail × Field & Stream', 4, 2300, 'fish',
   'Skiff fishing the mangrove maze for snook, redfish, tarpon, and tripletail. The conservation story: mangroves as fish nurseries, storm protection, wilderness access, and the pressure on Florida''s last wild coast.'),
  ('fs-dry-tortugas', 'DRTRT', 'Dry Tortugas & Fort Jefferson', 'Travail × Field & Stream', 6, 3200, 'fish',
   'A remote bluewater-and-reef run for snapper, grouper, and permit, anchored by the history of Fort Jefferson. The conservation story: protected waters, reef health, fishing access, and balancing recreation with preservation.'),
  ('fs-okeechobee', 'OKEEC', 'Lake Okeechobee Bass', 'Travail × Field & Stream', 4, 1800, 'fish',
   'Freshwater bass fishing on Florida''s biggest lake. The conservation story: water quality, lake management, vegetation, Everglades restoration, and how decisions upstream shape everything downstream.'),
  ('fs-north-fl-springs', 'NFSPR', 'North Florida Springs', 'Travail × Field & Stream', 4, 1900, 'fish',
   'A clear-water day on a spring-fed river like the Wacissa or Suwannee. The conservation story: groundwater, springs, development pressure, water clarity, and the link between aquifers and fish habitat.'),
  ('fs-talquin-ochlockonee', 'TALQ', 'Lake Talquin & Ochlockonee', 'Travail × Field & Stream', 4, 1750, 'fish',
   'A lake-and-river outing for crappie, bream, bass, and seasonal striped and white bass. Lake Talquin is a world-class black crappie fishery with healthy Florida bass and strong bream; the Ochlockonee adds seasonal striper runs. The conservation story: river systems, reservoirs, and how inland fisheries fit Florida''s bigger water picture.')
on conflict (id) do nothing;
