-- Editable tutorial copy.
--
-- The 7-step first-login tutorial used to be hardcoded in the React
-- component. Making it ops-tunable from /admin/developer means we can
-- iterate on copy without a deploy. Each row owns one step; the body
-- of the 'install' step is locked because it's a platform-aware
-- placeholder that the component swaps for iOS / Android / Desktop
-- instructions at render time.

create table if not exists public.tutorial_steps (
  step_key    text primary key,
  order_idx   integer not null,
  eyebrow     text not null,
  title       text not null,
  body        text not null,
  icon_key    text not null,            -- maps to an icon in the component
  is_locked   boolean not null default false,   -- true → body uneditable from UI
  updated_at  timestamptz not null default now()
);

create unique index if not exists tutorial_steps_order_idx_uniq
  on public.tutorial_steps(order_idx);

-- Anyone signed in can read tutorial copy (members render it). Admins
-- write. No public unauthenticated access.
alter table public.tutorial_steps enable row level security;

drop policy if exists "Authenticated read tutorial" on public.tutorial_steps;
create policy "Authenticated read tutorial" on public.tutorial_steps
  for select using (auth.uid() is not null);

drop policy if exists "Admins manage tutorial" on public.tutorial_steps;
create policy "Admins manage tutorial" on public.tutorial_steps
  for all using (public.is_admin()) with check (public.is_admin());

-- Seed with the current baked-in copy. Re-running is safe — we
-- only seed when the row doesn't already exist.
insert into public.tutorial_steps (step_key, order_idx, eyebrow, title, body, icon_key, is_locked)
values
  (
    'welcome', 1, 'WHAT THIS IS',
    'A members club for private aviation + curated experiences.',
    'Open seats on charter flights, member-anchored excursions, and network-proposed trips. $200/month, locked for life as long as your membership stays active. You''re already in.',
    'plane', false
  ),
  (
    'open_seats', 2, 'OPEN SEATS',
    'Take a seat on someone else''s plane.',
    'When a member anchors a charter, the spare seats open up to the network at a flat per-seat price. Tap a card on /seats to reserve. No card games — you pay, you fly.',
    'compass', false
  ),
  (
    'get_away', 3, 'GET AWAY',
    'Anchor your own trip — flight or excursion.',
    'Charter a seaplane or set up a day with an operator. You authorize the charter cost, network fills the seats, and you get refunded for every seat that sells. Tap "Get Away" up top.',
    'spark', false
  ),
  (
    'proposals', 4, 'PROPOSALS',
    'Pitch a trip without paying for the whole boat.',
    'Propose a date. The network commits cards on file. If enough members sign up by the 5-day window, ops locks Tropic and everyone''s deposit clears. If not, nobody pays. No risk — try it.',
    'target', false
  ),
  (
    'network', 5, 'THE NETWORK',
    'Refer the people you''d want next to you on the plane.',
    'Travail is a small, deliberate club. Refer friends from your Membership page; ops reviews each one. The network is only as good as who''s in it — bring people you''d actually want a row over from.',
    'network', false
  ),
  (
    'install', 6, 'PIN IT TO YOUR PHONE',
    'Add Travail to your home screen.',
    'INSTALL_INSTRUCTIONS_PLACEHOLDER',
    'home', true
  ),
  (
    'closer', 7, 'YOU''RE SET',
    'That''s the whole product. Have fun out there.',
    'Get Away to plan your first trip, Open Seats to ride along, Proposals to rally the network. Tap Done and we''ll close this and let you go.',
    'check', false
  )
on conflict (step_key) do nothing;
