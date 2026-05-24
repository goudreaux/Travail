-- Field & Stream Excursion Series — six Florida fishing templates, each with a
-- conservation story. Adds a description column to hold that narrative.

alter table public.excursion_templates add column if not exists description text;

-- Destination landing areas (Key West already exists for the Dry Tortugas run).
insert into public.airports (code, name, sub, role) values
  ('X01',  'Everglades Airpark',        'Everglades / Florida Bay',   'destination'),
  ('KMKY', 'Marco Island Executive',    'Ten Thousand Islands',       'destination'),
  ('KOBE', 'Okeechobee County',         'Lake Okeechobee',            'destination'),
  ('KFPY', 'Perry-Foley',               'North Florida Springs',      'destination'),
  ('KTLH', 'Tallahassee Intl',          'Lake Talquin / Ochlockonee', 'destination')
on conflict (code) do nothing;

insert into public.excursion_templates (id, dest_code, name, operator, capacity, price_per_pax, icon, description) values
  ('fs-florida-bay', 'X01', 'Florida Bay & the Everglades', 'Travail × Field & Stream', 4, 2400, 'fish',
   'Sight-fishing the skinny water for tarpon, snook, redfish, trout, and bonefish. The conservation story: Everglades restoration, freshwater flow, seagrass health, and the future of one of America''s great shallow-water fisheries.'),
  ('fs-ten-thousand-islands', 'KMKY', 'Ten Thousand Islands', 'Travail × Field & Stream', 4, 2300, 'fish',
   'Skiff fishing the mangrove maze for snook, redfish, tarpon, and tripletail. The conservation story: mangroves as fish nurseries, storm protection, wilderness access, and the pressure on Florida''s last wild coast.'),
  ('fs-dry-tortugas', 'KEYW', 'Dry Tortugas & Fort Jefferson', 'Travail × Field & Stream', 6, 3200, 'fish',
   'A remote bluewater-and-reef run for snapper, grouper, and permit, anchored by the history of Fort Jefferson. The conservation story: protected waters, reef health, fishing access, and balancing recreation with preservation.'),
  ('fs-okeechobee', 'KOBE', 'Lake Okeechobee Bass', 'Travail × Field & Stream', 4, 1800, 'fish',
   'Freshwater bass fishing on Florida''s biggest lake. The conservation story: water quality, lake management, vegetation, Everglades restoration, and how decisions upstream shape everything downstream.'),
  ('fs-north-fl-springs', 'KFPY', 'North Florida Springs', 'Travail × Field & Stream', 4, 1900, 'fish',
   'A clear-water day on a spring-fed river like the Wacissa or Suwannee. The conservation story: groundwater, springs, development pressure, water clarity, and the link between aquifers and fish habitat.'),
  ('fs-talquin-ochlockonee', 'KTLH', 'Lake Talquin & Ochlockonee', 'Travail × Field & Stream', 4, 1750, 'fish',
   'A lake-and-river outing for crappie, bream, bass, and seasonal striped and white bass. Lake Talquin is a world-class black crappie fishery with healthy Florida bass and strong bream; the Ochlockonee adds seasonal striper runs. The conservation story: river systems, reservoirs, and how inland fisheries fit Florida''s bigger water picture.')
on conflict (id) do nothing;
