// Helper for loading + serving the first-login tutorial copy.
//
// Copy lives in public.tutorial_steps (migration 055) so ops can edit
// it from /admin/developer without a deploy. The component falls back
// to BAKED_DEFAULTS if the table is empty or the fetch fails — this
// way the tutorial still works in dev environments where the migration
// hasn't been applied.
//
// Icons remain in code (SVG) and are referenced by string key. Keeping
// the SVG out of the DB avoids a "let ops edit icons too" rabbit hole
// while still giving every editable text field a real form input.

import React from 'react'

export interface TutorialStep {
  step_key: string
  order_idx: number
  eyebrow: string
  title: string
  body: string                 // 'INSTALL_INSTRUCTIONS_PLACEHOLDER' = render platform-aware install steps
  icon_key: string             // see ICONS map below
  is_locked?: boolean          // true → body is uneditable from /admin/developer
}

export const BAKED_DEFAULTS: TutorialStep[] = [
  {
    step_key: 'welcome', order_idx: 1, icon_key: 'plane',
    eyebrow: 'WHAT THIS IS',
    title: 'A members club for private aviation and curated experiences.',
    body: "Welcome aboard. Travail connects a small, vetted group of travelers who share private flights and one-of-a-kind trips. There are three ways to go: claim an open seat on a flight a member has already booked, anchor your own flight or excursion and let the network fill the cabin, or propose a trip and rally everyone around it. Your membership is $200 a month, and that rate is locked for life as long as your membership stays active. You're already in, so let's walk through how it all works.",
  },
  {
    step_key: 'open_seats', order_idx: 2, icon_key: 'compass',
    eyebrow: 'OPEN SEATS',
    title: "Take a seat on a flight that's already booked.",
    body: "When a member charters a flight, the empty seats open to the rest of the network at a flat, per-seat price. Browse what's available on the Seats page, tap any card to see the route, date, and price, then reserve your spot. The cost is fixed and shown up front, so there's no bidding and no surprises. You pay for your seat, you fly.",
  },
  {
    step_key: 'get_away', order_idx: 3, icon_key: 'spark',
    eyebrow: 'GET AWAY',
    title: 'Anchor your own flight or excursion.',
    body: "Want to set the itinerary yourself? Tap Get Away at the top of the screen. You can charter a seaplane or arrange a day out with one of our trusted operators. You authorize the full charter cost up front to hold the booking, then the network fills the open seats. Each time a seat sells, you're refunded its share, so a full cabin can bring your own cost down to a single seat.",
  },
  {
    step_key: 'proposals', order_idx: 4, icon_key: 'target',
    eyebrow: 'PROPOSALS',
    title: 'Pitch a trip without paying for the whole thing.',
    body: "Have an idea but would rather not commit alone? Post a proposal with a date and let the network weigh in. Interested members reserve a spot with a card on file, but nothing is charged yet. If enough people commit within the five-day window, we lock in the booking and everyone's deposit clears at once. If it doesn't fill, no one is charged and the proposal quietly expires. Floating an idea costs nothing, so give it a try.",
  },
  {
    step_key: 'network', order_idx: 5, icon_key: 'network',
    eyebrow: 'THE NETWORK',
    title: "Refer the people you'd want in the next seat over.",
    body: "Travail stays small and deliberate by design. A trip is only as good as the people on it, so we grow entirely by referral. Invite friends from your Membership page and our team reviews each request before extending an invitation. Bring the people you'd genuinely enjoy sharing a cabin with.",
  },
  {
    step_key: 'closer', order_idx: 6, icon_key: 'check',
    eyebrow: "YOU'RE ALL SET",
    title: "That's the tour. Enjoy the ride.",
    body: "You now know the three ways to travel with us: Open Seats to ride along on a booked flight, Get Away to anchor your own, and Proposals to rally the network around a new idea. Everything lives in the navigation at the bottom of your screen whenever you need it. Tap Done when you're ready and we'll get out of your way.",
  },
]

// Icon registry — each tutorial step references one of these by key.
// New icons get added here (not in the DB) and referenced via
// step.icon_key. Keeps the SVG out of the editable surface.
export const TUTORIAL_ICONS: Record<string, React.ReactNode> = {
  plane: (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor">
      <g transform="rotate(35 12 12)">
        <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
      </g>
    </svg>
  ),
  compass: (
    <svg width="36" height="36" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="11" cy="11" r="8" />
      <path d="M14.5 7.5L12.5 12.5L7.5 14.5L9.5 9.5z" />
    </svg>
  ),
  spark: (
    <svg width="36" height="36" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 13l7-1 3-7h2l-1 7 5-1 1 1.5-5 3-1 4-2 .5-1-3.5-3 0-1 .5z" />
    </svg>
  ),
  target: (
    <svg width="36" height="36" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="11" cy="11" r="8" />
      <circle cx="11" cy="11" r="4.5" />
      <circle cx="11" cy="11" r="1.5" fill="currentColor" />
    </svg>
  ),
  network: (
    <svg width="36" height="36" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="11" cy="11" r="8" />
      <ellipse cx="11" cy="11" rx="3.2" ry="8" />
      <line x1="3" y1="11" x2="19" y2="11" />
    </svg>
  ),
  home: (
    <svg width="36" height="36" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="3" width="12" height="16" rx="2" />
      <line x1="11" y1="16" x2="11" y2="16" />
    </svg>
  ),
  check: (
    <svg width="36" height="36" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12l5 5L20 6" />
    </svg>
  ),
}

// Load steps from DB with fallback to BAKED_DEFAULTS. Empty rows in DB
// (no rows at all) also fall back, so a forgotten migration doesn't
// break the tutorial.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadTutorialSteps(supabase: any): Promise<TutorialStep[]> {
  try {
    const { data, error } = await supabase
      .from('tutorial_steps')
      .select('*')
      .order('order_idx', { ascending: true })
    if (error) throw error
    const rows = (data ?? []) as TutorialStep[]
    if (rows.length === 0) return BAKED_DEFAULTS
    return rows
  } catch {
    return BAKED_DEFAULTS
  }
}
