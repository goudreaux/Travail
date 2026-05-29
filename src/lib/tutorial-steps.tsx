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
    title: 'A members club for private aviation + curated experiences.',
    body: "Open seats on charter flights, member-anchored excursions, and network-proposed trips. $200/month, locked for life as long as your membership stays active. You're already in.",
  },
  {
    step_key: 'open_seats', order_idx: 2, icon_key: 'compass',
    eyebrow: 'OPEN SEATS',
    title: 'Take a seat on someone else’s plane.',
    body: 'When a member anchors a charter, the spare seats open up to the network at a flat per-seat price. Tap a card on /seats to reserve. No card games — you pay, you fly.',
  },
  {
    step_key: 'get_away', order_idx: 3, icon_key: 'spark',
    eyebrow: 'GET AWAY',
    title: 'Anchor your own trip — flight or excursion.',
    body: 'Charter a seaplane or set up a day with an operator. You authorize the charter cost, network fills the seats, and you get refunded for every seat that sells. Tap "Get Away" up top.',
  },
  {
    step_key: 'proposals', order_idx: 4, icon_key: 'target',
    eyebrow: 'PROPOSALS',
    title: 'Pitch a trip without paying for the whole boat.',
    body: 'Propose a date. The network commits cards on file. If enough members sign up by the 5-day window, ops locks Tropic and everyone’s deposit clears. If not, nobody pays. No risk — try it.',
  },
  {
    step_key: 'network', order_idx: 5, icon_key: 'network',
    eyebrow: 'THE NETWORK',
    title: 'Refer the people you’d want next to you on the plane.',
    body: "Travail is a small, deliberate club. Refer friends from your Membership page; ops reviews each one. The network is only as good as who's in it — bring people you'd actually want a row over from.",
  },
  {
    step_key: 'install', order_idx: 6, icon_key: 'home', is_locked: true,
    eyebrow: 'PIN IT TO YOUR PHONE',
    title: 'Add Travail to your home screen.',
    body: 'INSTALL_INSTRUCTIONS_PLACEHOLDER',
  },
  {
    step_key: 'closer', order_idx: 7, icon_key: 'check',
    eyebrow: 'YOU’RE SET',
    title: 'That’s the whole product. Have fun out there.',
    body: 'Get Away to plan your first trip, Open Seats to ride along, Proposals to rally the network. Tap Done and we’ll close this and let you go.',
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
