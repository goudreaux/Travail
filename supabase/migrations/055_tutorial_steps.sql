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
    'A members club for private aviation and curated experiences.',
    'Welcome aboard. Travail connects a small, vetted group of travelers who share private flights and one-of-a-kind trips. There are three ways to go: claim an open seat on a flight a member has already booked, anchor your own flight or excursion and let the network fill the cabin, or propose a trip and rally everyone around it. Your membership is $200 a month, and that rate is locked for life as long as your membership stays active. You''re already in, so let''s walk through how it all works.',
    'plane', false
  ),
  (
    'open_seats', 2, 'OPEN SEATS',
    'Take a seat on a flight that''s already booked.',
    'When a member charters a flight, the empty seats open to the rest of the network at a flat, per-seat price. Browse what''s available on the Seats page, tap any card to see the route, date, and price, then reserve your spot. The cost is fixed and shown up front, so there''s no bidding and no surprises. You pay for your seat, you fly.',
    'compass', false
  ),
  (
    'get_away', 3, 'GET AWAY',
    'Anchor your own flight or excursion.',
    'Want to set the itinerary yourself? Tap Get Away at the top of the screen. You can charter a seaplane or arrange a day out with one of our trusted operators. You authorize the full charter cost up front to hold the booking, then the network fills the open seats. Each time a seat sells, you''re refunded its share, so a full cabin can bring your own cost down to a single seat.',
    'spark', false
  ),
  (
    'proposals', 4, 'PROPOSALS',
    'Pitch a trip without paying for the whole thing.',
    'Have an idea but would rather not commit alone? Post a proposal with a date and let the network weigh in. Interested members reserve a spot with a card on file, but nothing is charged yet. If enough people commit within the five-day window, we lock in the booking and everyone''s deposit clears at once. If it doesn''t fill, no one is charged and the proposal quietly expires. Floating an idea costs nothing, so give it a try.',
    'target', false
  ),
  (
    'network', 5, 'THE NETWORK',
    'Refer the people you''d want in the next seat over.',
    'Travail stays small and deliberate by design. A trip is only as good as the people on it, so we grow entirely by referral. Invite friends from your Membership page and our team reviews each request before extending an invitation. Bring the people you''d genuinely enjoy sharing a cabin with.',
    'network', false
  ),
  (
    'install', 6, 'PIN IT TO YOUR PHONE',
    'Add Travail to your home screen.',
    'INSTALL_INSTRUCTIONS_PLACEHOLDER',
    'home', true
  ),
  (
    'closer', 7, 'YOU''RE ALL SET',
    'That''s the tour. Enjoy the ride.',
    'You now know the three ways to travel with us: Open Seats to ride along on a booked flight, Get Away to anchor your own, and Proposals to rally the network around a new idea. Everything lives in the navigation at the bottom of your screen whenever you need it. Tap Done when you''re ready and we''ll get out of your way.',
    'check', false
  )
on conflict (step_key) do nothing;
