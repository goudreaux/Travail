-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Members table
create table public.members (
  id text primary key,  -- e.g. "M-014"
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  initials text not null,
  tier text not null default 'founding',
  home_base_code text not null default 'KTPF',
  kyc_verified boolean not null default false,
  seat_credits integer not null default 0,
  card_last4 text,
  joined_at date not null default current_date,
  bio text,
  interests text,
  avatar_url text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Airports
create table public.airports (
  code text primary key,
  name text not null,
  sub text not null,
  role text not null check (role in ('origin', 'destination', 'both'))
);

-- Aircraft
create table public.aircraft (
  id text primary key,
  name text not null,
  desc text not null,
  capacity integer not null
);

-- Excursion templates
create table public.excursion_templates (
  id text primary key,
  dest_code text not null references public.airports(code),
  name text not null,
  operator text not null,
  capacity integer not null,
  price_per_pax integer not null,
  icon text not null default 'fish'
);

-- Flights
create table public.flights (
  id text primary key,
  anchor_member_id text not null,
  origin_code text not null references public.airports(code),
  dest_code text not null references public.airports(code),
  date date not null,
  depart_time text not null,
  duration_mins integer not null default 90,
  aircraft_id text not null references public.aircraft(id),
  name text not null,
  pitch text,
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  seats_total integer not null,
  seats_anchor integer not null default 0,
  price_per_seat integer not null,
  status text not null default 'pending_ops_review' check (status in ('pending_ops_review','published','declined','completed','cancelled')),
  created_at timestamptz not null default now()
);

-- Excursions
create table public.excursions (
  id text primary key,
  anchor_member_id text not null,
  template_id text not null references public.excursion_templates(id),
  origin_code text not null references public.airports(code),
  aircraft_id text not null references public.aircraft(id),
  date date not null,
  start_time text,
  depart_time text,
  arrive_time text,
  return_time text,
  stay_type text not null default 'day' check (stay_type in ('day', 'overnight')),
  name text not null,
  pitch text,
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  spots_total integer not null,
  spots_anchor integer not null default 0,
  status text not null default 'pending_ops_review' check (status in ('pending_ops_review','published','declined','completed','cancelled')),
  created_at timestamptz not null default now()
);

-- Bookings
create table public.bookings (
  id text primary key,
  member_id text not null references public.members(id),
  item_kind text not null check (item_kind in ('flight', 'excursion')),
  item_id text not null,
  seats integer not null default 1,
  price_per_seat integer not null,
  fees integer not null default 38,
  total integer not null,
  payment_method text not null default 'card' check (payment_method in ('card', 'credits')),
  status text not null default 'pending_ops_review' check (status in ('pending_ops_review','confirmed','declined','cancelled','completed')),
  confirmation_code text,
  decline_reason text,
  submitted_at timestamptz not null default now(),
  decided_at timestamptz
);

-- Anchor submissions
create table public.anchor_submissions (
  id text primary key,
  kind text not null check (kind in ('flight', 'excursion')),
  member_id text not null references public.members(id),
  payload jsonb not null default '{}',
  status text not null default 'pending_ops_review' check (status in ('pending_ops_review','published','declined','cancelled')),
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  published_item_id text,
  decline_reason text
);

-- Notifications
create table public.notifications (
  id text primary key,
  member_id text not null references public.members(id),
  kind text not null,
  title text not null,
  body text not null,
  ref jsonb,
  created_at timestamptz not null default now(),
  read boolean not null default false
);

-- Posts
create table public.posts (
  id text primary key default 'P-' || upper(substr(md5(random()::text), 1, 6)),
  author_id text not null,
  author_kind text not null default 'member' check (author_kind in ('member', 'ops')),
  body text not null,
  quote text,
  kind text not null default 'ops' check (kind in ('ops', 'anchor', 'trip')),
  likes integer not null default 0,
  created_at timestamptz not null default now()
);

-- Comments
create table public.comments (
  id text primary key default 'C-' || upper(substr(md5(random()::text), 1, 6)),
  post_id text not null references public.posts(id) on delete cascade,
  author_id text not null references public.members(id),
  body text not null,
  created_at timestamptz not null default now()
);

-- Indexes for common queries
create index on public.flights(status, date);
create index on public.excursions(status, date);
create index on public.bookings(member_id, status);
create index on public.bookings(item_kind, item_id);
create index on public.anchor_submissions(member_id, status);
create index on public.notifications(member_id, read, created_at desc);
create index on public.posts(created_at desc);
create index on public.comments(post_id);
create index on public.members(user_id);

-- Enable RLS on all tables
alter table public.members enable row level security;
alter table public.airports enable row level security;
alter table public.aircraft enable row level security;
alter table public.excursion_templates enable row level security;
alter table public.flights enable row level security;
alter table public.excursions enable row level security;
alter table public.bookings enable row level security;
alter table public.anchor_submissions enable row level security;
alter table public.notifications enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;

-- Helper function: get current member id from auth.uid()
create or replace function public.current_member_id()
returns text language sql stable security definer as $$
  select id from public.members where user_id = auth.uid() limit 1;
$$;

-- Helper function: is current user an admin?
create or replace function public.is_admin()
returns boolean language sql stable security definer as $$
  select coalesce((select is_admin from public.members where user_id = auth.uid() limit 1), false);
$$;

-- RLS Policies

-- Members: members can read all, admins can write
create policy "Members can view all members" on public.members for select using (auth.uid() is not null);
create policy "Members can update their own profile" on public.members for update using (user_id = auth.uid());
create policy "Admins can insert members" on public.members for insert with check (public.is_admin());
create policy "Admins can update any member" on public.members for update using (public.is_admin());

-- Airports: read for all authenticated
create policy "Anyone can read airports" on public.airports for select using (auth.uid() is not null);
create policy "Admins can manage airports" on public.airports for all using (public.is_admin());

-- Aircraft: read for all authenticated
create policy "Anyone can read aircraft" on public.aircraft for select using (auth.uid() is not null);
create policy "Admins can manage aircraft" on public.aircraft for all using (public.is_admin());

-- Excursion templates: read for all
create policy "Anyone can read templates" on public.excursion_templates for select using (auth.uid() is not null);
create policy "Admins can manage templates" on public.excursion_templates for all using (public.is_admin());

-- Flights: all authenticated can read published; admins can read all
create policy "Members can view published flights" on public.flights for select using (
  auth.uid() is not null and (status = 'published' or public.is_admin())
);
create policy "Admins can manage flights" on public.flights for all using (public.is_admin());
create policy "Members can insert flights (via anchor)" on public.flights for insert with check (auth.uid() is not null);

-- Excursions: same as flights
create policy "Members can view published excursions" on public.excursions for select using (
  auth.uid() is not null and (status = 'published' or public.is_admin())
);
create policy "Admins can manage excursions" on public.excursions for all using (public.is_admin());
create policy "Members can insert excursions" on public.excursions for insert with check (auth.uid() is not null);

-- Bookings: members see own; admins see all
create policy "Members can view their bookings" on public.bookings for select using (
  member_id = public.current_member_id() or public.is_admin()
);
create policy "Members can insert bookings" on public.bookings for insert with check (
  member_id = public.current_member_id() or public.is_admin()
);
create policy "Admins can update bookings" on public.bookings for update using (public.is_admin());
create policy "Members can cancel own booking" on public.bookings for update using (
  member_id = public.current_member_id() and status in ('pending_ops_review', 'confirmed')
);

-- Anchor submissions: members see own; admins see all
create policy "Members can view their anchors" on public.anchor_submissions for select using (
  member_id = public.current_member_id() or public.is_admin()
);
create policy "Members can insert anchors" on public.anchor_submissions for insert with check (
  member_id = public.current_member_id()
);
create policy "Admins can update anchors" on public.anchor_submissions for update using (public.is_admin());

-- Notifications: members see own; admins see all
create policy "Members can view their notifications" on public.notifications for select using (
  member_id = public.current_member_id() or public.is_admin()
);
create policy "System can insert notifications" on public.notifications for insert with check (
  member_id = public.current_member_id() or public.is_admin()
);
create policy "Members can update own notifications" on public.notifications for update using (
  member_id = public.current_member_id() or public.is_admin()
);

-- Posts: all authenticated can read; ops/admins can insert
create policy "Members can read posts" on public.posts for select using (auth.uid() is not null);
create policy "Admins can manage posts" on public.posts for all using (public.is_admin());
create policy "Members can insert posts" on public.posts for insert with check (auth.uid() is not null);
create policy "Members can update own post likes" on public.posts for update using (auth.uid() is not null);

-- Comments: all can read; members can insert own
create policy "Members can read comments" on public.comments for select using (auth.uid() is not null);
create policy "Members can insert comments" on public.comments for insert with check (
  author_id = public.current_member_id()
);

-- ═══════════════════════════════════════════════════════════════
-- SEED DATA
-- ═══════════════════════════════════════════════════════════════

-- Airports
insert into public.airports (code, name, sub, role) values
  ('KTPF', 'Davis Island', 'Tampa, FL', 'origin'),
  ('KSPG', 'Albert Whitted', 'St. Petersburg, FL', 'origin'),
  ('KFXE', 'Fort Lauderdale Exec', 'FL', 'origin'),
  ('KOPF', 'Opa-Locka', 'Miami, FL', 'origin'),
  ('X07',  'Islamorada', 'FL Keys', 'destination'),
  ('KMTH', 'Marathon', 'FL Keys', 'destination'),
  ('KEYW', 'Key West', 'FL Keys', 'destination'),
  ('MYBS', 'South Bimini', 'Bahamas', 'destination'),
  ('MYEF', 'Exuma · GGT', 'Bahamas', 'destination'),
  ('MYAM', 'Marsh Harbour', 'Bahamas · Abacos', 'destination'),
  ('MYAN', 'Andros Town', 'Bahamas', 'destination'),
  ('KGIF', 'Winter Haven', 'Central FL', 'destination');

-- Aircraft
insert into public.aircraft (id, name, desc, capacity) values
  ('c206',    'Cessna 206',           'Amphibious single', 4),
  ('caravan', 'Cessna Grand Caravan', 'Turboprop',         8);

-- Excursion templates (full Travail × F&S catalog)
insert into public.excursion_templates (id, dest_code, name, operator, capacity, price_per_pax, icon) values
  ('fs-lobster',   'KMTH', 'Lobster Mini Season',          'Bud N'' Mary''s × Field & Stream',      8, 2200, 'fish'),
  ('fs-mahi',      'MYBS', 'Mahi & Wahoo offshore',        'Bimini Big Game × Field & Stream',      8, 2800, 'fish'),
  ('fs-snapper',   'KEYW', 'Snapper season opener',        'Capt. Ron × Field & Stream',            8, 2100, 'fish'),
  ('fs-bones',     'MYAM', 'Bonefish on the Marls',        'Abaco Lodge × Field & Stream',          8, 2950, 'fish'),
  ('fs-sails',     'MYBS', 'Sailfish kickoff',             'Bimini Sportfish × Field & Stream',     8, 2750, 'fish'),
  ('fs-mutton',    'KMTH', 'Mutton snapper finale',        'Capt. Will Benson × Field & Stream',    8, 2400, 'fish'),
  ('fs-golf-week', 'KGIF', 'Lochloosa golf weekend',       'Lochloosa Club × Field & Stream',       8, 1450, 'golf'),
  ('fs-quail',     'KGIF', 'Quail opener',                 'Lochloosa Sporting × Field & Stream',   6, 1850, 'quail'),
  ('fs-hog',       'KGIF', 'Hog hunt · Live Oak',          'Live Oak Plantation × Field & Stream',  6, 2200, 'hog'),
  ('fs-golf-clays','KGIF', 'Lochloosa golf & clays day',   'Lochloosa Club × Field & Stream',       8, 1150, 'golf'),
  ('mth-flats',    'KMTH', 'Flats fishing · half-day',     'Capt. Will Benson',                     3, 850,  'fish'),
  ('mth-reef',     'KMTH', 'Reef snorkel + lunch',         'Marathon Marina',                       6, 220,  'snorkel'),
  ('eyw-sail',     'KEYW', 'Schooner day sail',            'America 2.0',                          12, 295,  'sail'),
  ('gif-golf',     'KGIF', 'CC of Winter Haven · 18',      'CC of Winter Haven',                    4, 240,  'golf');

-- Seed excursions (Travail curated launch lineup)
insert into public.excursions (id, anchor_member_id, template_id, origin_code, aircraft_id, date, start_time, depart_time, arrive_time, return_time, stay_type, name, pitch, visibility, spots_total, spots_anchor, status) values
  ('E-301', 'TRAVAIL', 'fs-lobster', 'KTPF', 'caravan', '2026-07-29', '2:00 PM',  '10:30 AM', '11:55 AM', '4:00 PM next day', 'overnight', 'Lobster Mini Season · Marathon', 'Two-day mini-season run. Dive boat reserved out of Bud N'' Mary''s both days, Lorelei dock dinner, Faro Blanco lodging. F&S editorial team on board for the launch.', 'public', 8, 0, 'published'),
  ('E-302', 'TRAVAIL', 'fs-mahi',    'KTPF', 'caravan', '2026-08-21', '6:30 AM',  '7:30 AM',  '9:00 AM',  '4:00 PM Sun',      'overnight', 'Mahi & Wahoo · Bimini',         'Three days offshore on the Bimini wall. Mahi running tight to the surface temp breaks, wahoo on the bottom troll. Captains hand-picked by Field & Stream.', 'public', 8, 0, 'published'),
  ('E-303', 'TRAVAIL', 'fs-snapper', 'KTPF', 'caravan', '2026-09-18', '5:00 AM',  '5:30 AM',  '7:00 AM',  '4:00 PM Sun',      'overnight', 'Snapper opener · Key West',     'Three-day push for the snapper opener. Yellowtails inside the reef, mutton on the wrecks. F&S photographer documenting the manifest.', 'public', 8, 0, 'published'),
  ('E-304', 'TRAVAIL', 'fs-bones',   'KTPF', 'caravan', '2026-10-16', '7:30 AM',  '7:30 AM',  '9:55 AM',  '3:00 PM Sun',      'overnight', 'Bonefish on the Marls · Marsh Harbour', 'Three days at Abaco Lodge. Walk the Marls flats with the Bahamian guides who put F&S on the map. Bring the 8-weight.', 'public', 8, 0, 'published'),
  ('E-305', 'TRAVAIL', 'fs-sails',   'KTPF', 'caravan', '2026-11-06', '7:00 AM',  '7:30 AM',  '9:00 AM',  '4:00 PM Sun',      'overnight', 'Sailfish kickoff · Bimini',     'Three days on the kite. North wind expected. Bimini Sportfish has the boats; F&S has the editorial team. Cocktails at Big John''s.', 'public', 8, 0, 'published'),
  ('E-306', 'TRAVAIL', 'fs-mutton',  'KTPF', 'caravan', '2026-11-20', '5:30 AM',  '7:00 AM',  '8:25 AM',  '4:00 PM Sun',      'overnight', 'Mutton snapper finale · Marathon', 'Three-day wreck push for late-season muttons. Season finale and F&S cover story.', 'public', 8, 0, 'published'),
  ('E-307', 'TRAVAIL', 'fs-golf-week','KTPF','caravan', '2026-08-08', '9:00 AM',  '7:30 AM',  '8:10 AM',  '4:00 PM Sun',      'overnight', 'Lochloosa golf weekend · Winter Haven', 'Two days at Lochloosa Club. Saturday round, lodge dinner, Sunday morning round before wheels-up.', 'public', 8, 0, 'published'),
  ('E-308', 'TRAVAIL', 'fs-quail',   'KTPF', 'caravan', '2026-09-12', '7:00 AM',  '6:00 AM',  '6:40 AM',  '5:30 PM',          'day',       'Quail opener · Lochloosa',      'Opening day. Truck-mounted dogs, native birds, lunch at the lodge between sessions. Six gunners.', 'public', 6, 0, 'published'),
  ('E-309', 'TRAVAIL', 'fs-hog',     'KTPF', 'caravan', '2026-10-24', '5:00 AM',  '5:30 AM',  '6:10 AM',  '4:00 PM Sun',      'overnight', 'Hog hunt · Live Oak Plantation', 'Two-day spot-and-stalk hog hunt with the Live Oak guides.', 'public', 6, 0, 'published'),
  ('E-310', 'TRAVAIL', 'fs-golf-clays','KTPF','caravan','2026-11-14', '8:30 AM',  '7:00 AM',  '7:40 AM',  '5:30 PM',          'day',       'Lochloosa golf & clays day',    'Eighteen in the morning, seventy-five sporting clays in the afternoon.', 'public', 8, 0, 'published');

-- Seed members (5 initial founding members — ops team adds more via admin)
-- Note: user_id will be NULL until they create accounts in Supabase Auth
-- The first member added with is_admin=true will be the ops account
insert into public.members (id, name, initials, tier, home_base_code, kyc_verified, seat_credits, card_last4, joined_at, is_admin) values
  ('M-001', 'Travail Ops',    'TX', 'founding', 'KTPF', true,  0,  null,   '2025-01-01', true),
  ('M-014', 'Tom Kersting',   'TK', 'founding', 'KTPF', true,  14, '4821', '2025-09-01', false),
  ('M-009', 'Tom Robins',     'TR', 'founding', 'KTPF', true,  8,  '0019', '2025-08-12', false),
  ('M-021', 'Kyle Park',      'KP', 'founding', 'KFXE', true,  11, '7711', '2025-10-04', false),
  ('M-005', 'Jeff Doolittle', 'JD', 'founding', 'KTPF', true,  5,  '2240', '2025-07-18', false),
  ('M-018', 'Charles Adams',  'CA', 'founding', 'KSPG', true,  6,  '1133', '2025-09-22', false);

-- Seed bookings (some trips are booked)
insert into public.bookings (id, member_id, item_kind, item_id, seats, price_per_seat, fees, total, payment_method, status, confirmation_code, submitted_at, decided_at) values
  ('B-101', 'M-014', 'excursion', 'E-301', 2, 2200, 175, 4575, 'card',    'confirmed', 'TVL-LOBS-014', '2026-05-02T10:00:00Z', '2026-05-02T10:30:00Z'),
  ('B-102', 'M-009', 'excursion', 'E-301', 1, 2200, 175, 2375, 'card',    'confirmed', 'TVL-LOBS-009', '2026-05-03T10:00:00Z', '2026-05-03T10:30:00Z'),
  ('B-103', 'M-021', 'excursion', 'E-301', 2, 2200, 175, 4575, 'card',    'confirmed', 'TVL-LOBS-021', '2026-05-04T10:00:00Z', '2026-05-04T10:30:00Z'),
  ('B-104', 'M-005', 'excursion', 'E-302', 1, 2800, 175, 2975, 'card',    'confirmed', 'TVL-MAHI-005', '2026-05-06T10:00:00Z', '2026-05-06T10:30:00Z'),
  ('B-105', 'M-018', 'excursion', 'E-302', 2, 2800, 175, 5775, 'card',    'confirmed', 'TVL-MAHI-018', '2026-05-07T10:00:00Z', '2026-05-07T10:30:00Z'),
  ('B-106', 'M-014', 'excursion', 'E-303', 1, 2100, 175, 2275, 'credits', 'confirmed', 'TVL-SNAP-014', '2026-05-08T10:00:00Z', '2026-05-08T10:30:00Z'),
  ('B-107', 'M-009', 'excursion', 'E-303', 1, 2100, 175, 2275, 'card',    'confirmed', 'TVL-SNAP-009', '2026-05-09T10:00:00Z', '2026-05-09T10:30:00Z'),
  ('B-108', 'M-021', 'excursion', 'E-304', 1, 2950, 175, 3125, 'card',    'confirmed', 'TVL-BONE-021', '2026-05-12T10:00:00Z', '2026-05-12T10:30:00Z'),
  ('B-109', 'M-005', 'excursion', 'E-307', 2, 1450, 175, 3075, 'card',    'confirmed', 'TVL-GOLF-005', '2026-05-27T10:00:00Z', '2026-05-27T10:30:00Z'),
  ('B-110', 'M-009', 'excursion', 'E-308', 1, 1850, 175, 2025, 'card',    'confirmed', 'TVL-QUAIL-009','2026-05-28T10:00:00Z', '2026-05-28T10:30:00Z'),
  ('B-111', 'M-018', 'excursion', 'E-308', 1, 1850, 175, 2025, 'card',    'confirmed', 'TVL-QUAIL-018','2026-05-29T10:00:00Z', '2026-05-29T10:30:00Z'),
  ('B-112', 'M-005', 'excursion', 'E-309', 1, 2200, 175, 2375, 'card',    'confirmed', 'TVL-HOG-005',  '2026-05-30T10:00:00Z', '2026-05-30T10:30:00Z');

-- Seed feed posts
insert into public.posts (id, author_id, author_kind, body, quote, kind, likes, created_at) values
  ('P-001', 'M-001', 'ops', 'Weather looking ideal for the Marathon run this week. Tides line up for a 2pm flats trip — Tom has a guide on standby. Three of you on the manifest already.', null, 'ops', 12, '2026-07-28T08:42:00Z'),
  ('P-002', 'M-014', 'member', 'Anchored a Marathon trip for the 29th. Sunset slip at the dockmaster''s, Keys Fisheries the night before. Three seats open — Charles you mentioned wanting in last month.', null, 'anchor', 8, '2026-07-27T18:14:00Z'),
  ('P-003', 'M-009', 'member', 'Bimini run last weekend — wahoo on the troll, conch salad at Joe''s, back home Sunday by 5. The new manifest flow at the FBO took 4 minutes.', 'The plane is the boring part. The day was the good part.', 'trip', 24, '2026-07-25T12:00:00Z');

-- Initial notification
insert into public.notifications (id, member_id, kind, title, body, created_at) values
  ('N-001', 'M-014', 'system', 'Welcome to Travail.', 'Your founding membership is active. Browse open seats or anchor your first trip.', '2026-05-14T08:00:00Z');
