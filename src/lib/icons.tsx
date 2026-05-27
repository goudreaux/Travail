import React from 'react'

export const Icons = {
  feed: (<svg width="18" height="18" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><line x1="4" y1="6" x2="18" y2="6"/><line x1="4" y1="11" x2="18" y2="11"/><line x1="4" y1="16" x2="14" y2="16"/></svg>),
  cal: (<svg width="18" height="18" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="4" y="5" width="14" height="13" rx="1.5"/><line x1="4" y1="9" x2="18" y2="9"/><line x1="8" y1="3" x2="8" y2="6"/><line x1="14" y1="3" x2="14" y2="6"/></svg>),
  seat: (<svg width="18" height="18" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M5 11h12M5 11a3 3 0 0 1 0-6h12a3 3 0 0 1 0 6M5 11v6h12v-6M9 17v3M13 17v3"/></svg>),
  build: (<svg width="18" height="18" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 13l7-1 3-7h2l-1 7 5-1 1 1.5-5 3-1 4-2 0.5-1-3.5-3 0-1 0.5z"/></svg>),
  compass: (<svg width="18" height="18" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M14.5 7.5L12.5 12.5L7.5 14.5L9.5 9.5z"/></svg>),
  // Delta-style filled airplane silhouette — tilted up-right (~35°) so it
  // reads as 'in flight' rather than static. Used for the Open Seats /
  // Live Departures slot.
  plane: (<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><g transform="rotate(35 12 12)"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></g></svg>),
  inbox: (<svg width="18" height="18" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6l8 6 8-6M3 6v11h16V6M3 6h16"/></svg>),
  network: (<svg width="18" height="18" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><ellipse cx="11" cy="11" rx="3.2" ry="8"/><line x1="3" y1="11" x2="19" y2="11"/></svg>),
  member: (<svg width="18" height="18" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="11" cy="8" r="3.5"/><path d="M4 18Q4 13 11 13Q18 13 18 18" strokeLinecap="round"/></svg>),
  bell: (<svg width="18" height="18" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M5 15h12M6 15v-5a5 5 0 0 1 10 0v5M9.5 17.5a1.5 1.5 0 0 0 3 0"/></svg>),
  phone: (<svg width="18" height="18" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M7 3.5c.5 2 .5 3 1.5 4-.5 1-1.5 2-2 2.5 1 2 2.5 3.5 4.5 4.5.5-.5 1.5-1.5 2.5-2 1 1 2 1 4 1.5v3c0 .8-.7 1.5-1.5 1.4C9.5 17.5 4.5 12.5 3.6 5 3.5 4.2 4.2 3.5 5 3.5z"/></svg>),
  search: (<svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="9" cy="9" r="6"/><line x1="13.5" y1="13.5" x2="18" y2="18"/></svg>),
  plus: (<svg width="14" height="14" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="11" y1="5" x2="11" y2="17"/><line x1="5" y1="11" x2="17" y2="11"/></svg>),
  send: (<svg width="18" height="18" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l16-7-7 16-2-7z"/></svg>),
  paper: (<svg width="18" height="18" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14 4l4 4-9 9-5 1 1-5z"/></svg>),
  // Carry-on / suitcase — used for the 'My Trips' nav slot. Sized to
  // match the visual mass of the other nav marks (~16×15 inside the
  // 22×22 grid).
  luggage: (<svg width="18" height="18" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><rect x="3" y="6" width="16" height="13" rx="2"/><line x1="11" y1="9" x2="11" y2="16"/></svg>),
  more: (<svg width="18" height="18" viewBox="0 0 22 22" fill="currentColor"><circle cx="6" cy="11" r="1.5"/><circle cx="11" cy="11" r="1.5"/><circle cx="16" cy="11" r="1.5"/></svg>),
  pin: (<svg width="14" height="14" viewBox="0 0 22 22" fill="currentColor"><path d="M11 3l2 5 5 .5-3.5 3.5 1 5L11 14.5 6.5 17l1-5L4 8.5 9 8z"/></svg>),
  chevL: (<svg width="14" height="14" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M14 5l-6 6 6 6"/></svg>),
  chevR: (<svg width="14" height="14" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M8 5l6 6-6 6"/></svg>),
} as const

// Activity / excursion field-guide marks. All share the same grid (22×22),
// stroke width (1.5), round caps / joins, and currentColor stroke — so they
// inherit theme color and feel like one coherent set.
export const KIND_ICONS: Record<string, React.ReactElement> = {
  // Private jet, side profile — Gulfstream-style silhouette as an outlined
  // line drawing. Tapered fuselage with a small cockpit window, vertical
  // tail fin at the back, swept-back wing underneath.
  flight: (<svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 11 L18 10 L21 11 L18 12 L2 12 Z"/><path d="M3 11 L5 7 L8 11"/><path d="M9 12 L6 15.5 L13 12.5"/><line x1="17.5" y1="11" x2="19.5" y2="11"/></svg>),

  // Sailfish / billfish — long pointed bill out front, S-curved body, tall
  // sail-like dorsal fin, forked tail, eye.
  fish: (<svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 11 L6 11"/><path d="M6 11 Q9 6 14 7 Q18 8 19 11 Q18 14 14 15 Q9 16 6 11 Z"/><path d="M9 7 L10 3 L13 3.5 L14 7.5" fill="currentColor"/><path d="M19 11 L21.5 8 L20.5 11 L21.5 14"/><circle cx="7.8" cy="10" r="0.55" fill="currentColor"/><path d="M11 15 L11 17"/></svg>),

  // Sloop — mast with filled mainsail + open jib, a hull underneath, water line.
  sail: (<svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="11" y1="2.5" x2="11" y2="15"/><path d="M11 4 L17 14 L11 14 Z" fill="currentColor"/><path d="M11 6 L7 14 L11 14"/><path d="M3 15 Q11 18 19 15 L17.5 17.5 Q11 18.5 4.5 17.5 Z"/><path d="M1 20 Q5 19 9 20 T 17 20 T 21 20"/></svg>),

  // Curling wave — a single iconic break filling the frame, water line beneath.
  wave: (<svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 14 Q5 12 8 13 Q11 11 13 8 Q16 4 20 5.5 Q19 8.5 16 9.5 Q13 10.5 12 14 Q10 17 6 17 Q3 17 2 14 Z"/><path d="M1 19.5 Q11 18 21 19.5"/></svg>),

  // Snorkel mask — two-lens rectangle with a strap break + tube going up,
  // water line below to set the scene.
  snorkel: (<svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="11" height="7" rx="1.5"/><line x1="7.5" y1="7" x2="7.5" y2="14"/><path d="M13 10.5 L15 10.5 L15 3 L17 3"/><path d="M1 18.5 Q6 17.5 11 18 T 21 18"/></svg>),

  // Pin flag on a green — pole + filled pennant + ball sitting just off the cup.
  golf: (<svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="18" x2="7" y2="3"/><path d="M7 3 L15 4.5 L7 7 Z" fill="currentColor"/><path d="M2 18 Q11 16 20 18.5"/><circle cx="13" cy="17.5" r="0.9" fill="currentColor"/></svg>),

  // Bobwhite quail — plump body, a teardrop crest tuft, eye, beak, legs, wing.
  quail: (<svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 14 Q3 8 8 8 L14 8 Q18 8 18 12 Q18 16 14 16 L7 16 Q3 16 3 14 Z"/><path d="M5 7.5 L4 4 M5.8 7.5 L5.5 3.5 M6.5 7.5 L7.5 4"/><circle cx="5.2" cy="10" r="0.6" fill="currentColor"/><path d="M2.5 10 L1 10"/><path d="M8 16 L8 19 M12 16 L12 19"/><path d="M9 11 Q12 12 15 11"/></svg>),

  // Wild boar — stocky body with snout + single tusk, eye, ear, back bristles,
  // legs, curly tail.
  hog: (<svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 14 Q3 9 8 9 L15 9 Q18.5 9 18.5 12 Q18.5 15 15 15 L5 15 Q3 15 3 14 Z"/><path d="M18.5 12 L21 11.5 L21 14 L18.5 14"/><path d="M20.5 14 L22 15"/><circle cx="17" cy="11" r="0.6" fill="currentColor"/><path d="M14 9 L13 7 L15 9"/><path d="M6 9 L6 7.5 M9 9 L9 7 M12 9 L12 7.5"/><path d="M6 15 L6 19 M9 15 L9 19 M14 15 L14 19 M17 15 L17 19"/><path d="M3 11.5 Q1.5 10.5 2 13"/></svg>),

  // Refined sun — disc + 4 long cardinal rays + 4 short diagonal rays.
  sun: (<svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="3.5"/><path d="M11 1.5 L11 4 M11 18 L11 20.5 M1.5 11 L4 11 M18 11 L20.5 11"/><path d="M4.6 4.6 L6 6 M16 16 L17.4 17.4 M17.4 4.6 L16 6 M6 16 L4.6 17.4"/></svg>),

  // Classic hunting rifle silhouette — barrel + receiver + angled stock as
  // one continuous outline, with a trigger guard loop and a small front-sight
  // blade. No scope. The general "Hunting" filter uses this mark; specific
  // quail / hog / deer / croc trips can still use their animal marks.
  rifle: (<svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 13.5 L7 10.5 L10 10.5 L10 9.5 L21 9.5 L21 10.5 L10 10.5 L10 13 L8.5 13 L7 13.5 L1 15.5 Z"/><path d="M8 13 Q9 14.5 10 13"/><line x1="9" y1="13" x2="9" y2="14"/><line x1="20" y1="9.5" x2="20" y2="8.5"/></svg>),

  // White-tailed deer antler rack — symmetric branching, dual main beams
  // with three tines each, small skull plate at the base.
  antlers: (<svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 18 Q8 14 5 11 Q3 7 4 3"/><path d="M8 14 L5 14 M5 11 L2 10 M4 7 L1 6"/><path d="M11 18 Q14 14 17 11 Q19 7 18 3"/><path d="M14 14 L17 14 M17 11 L20 10 M18 7 L21 6"/><path d="M9 19 L13 19"/></svg>),

  // Alligator / crocodile in side profile — low ridge-backed body with snout
  // on the right, eye, nostril, four short legs, tapered tail on the left.
  croc: (<svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 13 L3.5 12.5 L4 13 L5.5 12.5 L6 13 L7.5 12.5 L8 13 L9.5 12.5 L10 13 L11.5 12.5 L12 13 L13.5 12.5 L14 13 L15.5 12.5 L16 13"/><path d="M16 13 Q18 12.5 21 13.5 L21 14.5 Q19 15 16 14"/><path d="M2 13 Q4 15 8 14.5 L16 14"/><path d="M2 13 L0.5 12 M2 13 L0.5 14"/><circle cx="18" cy="13" r="0.5" fill="currentColor"/><circle cx="20.5" cy="13.5" r="0.3" fill="currentColor"/><path d="M5 15 L5 17 M8 15 L8 17 M13 15 L13 17 M16 14 L16 17"/></svg>),

  // Classic longboard standing upright — elongated pointed silhouette with
  // a center stringer line and a small fin at the tail.
  surfboard: (<svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 2 C8 4 7 8 7 12 C7 17 9 19 11 19 C13 19 15 17 15 12 C15 8 14 4 11 2"/><line x1="11" y1="4" x2="11" y2="18"/><path d="M10 19 L11 21.5 L12 19"/></svg>),

  // Recurve bow with horizontal arrow nocked + drawn. Vertical bow on the
  // left (curve opens to the right), taut bowstring, arrow shaft passing
  // through with a V-tip and small fletching on the back.
  bow: (<svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3 Q11 11 5 19"/><line x1="5" y1="3" x2="5" y2="19"/><line x1="2" y1="11" x2="20" y2="11"/><path d="M20 11 L17 9 M20 11 L17 13"/><path d="M2 11 L4 9.5 M2 11 L4 12.5"/></svg>),

  // Lobster — top-down silhouette with segmented body, three-fin tail fan
  // on the left, two raised claws and a pair of long swept antennae on the
  // right (the head end). For lobster-season excursions.
  lobster: (<svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="11" cy="11" rx="3.5" ry="2"/><line x1="9.5" y1="9.5" x2="9.5" y2="12.5"/><line x1="11" y1="9.3" x2="11" y2="12.7"/><line x1="12.5" y1="9.5" x2="12.5" y2="12.5"/><path d="M7.5 11 L5 9.5 M7.5 11 L4.5 11 M7.5 11 L5 12.5"/><path d="M14 10 L17 8 Q19 7 19 9 L17 9.5"/><path d="M14 12 L17 14 Q19 15 19 13 L17 12.5"/><path d="M14.5 10 Q17 4 21 3"/><path d="M14.5 12 Q17 18 21 19"/></svg>),
}

// Canonical trip-type → icon, used for member interests across the app.
// General Hunting uses the rifle mark; the animal-specific marks (quail,
// hog, antlers, croc) live in KIND_ICONS and can be wired into individual
// excursion templates as needed.
export const TRIP_TYPE_ICONS: Record<string, React.ReactElement> = {
  Fishing: KIND_ICONS.fish,
  Hunting: KIND_ICONS.rifle,
  Golf: KIND_ICONS.golf,
  Leisure: KIND_ICONS.sun,
  Surfing: KIND_ICONS.surfboard,
}

// Ordered list of every available mark — used by the admin form's icon
// picker so it always reflects the full library without drift.
export const ALL_ICONS = [
  'flight', 'sail', 'fish', 'lobster', 'snorkel', 'surfboard', 'wave',
  'rifle', 'bow', 'quail', 'hog', 'antlers', 'croc',
  'golf', 'sun',
] as const

// Auto-derive an icon from an excursion / activity name. Order matters —
// more specific keywords are checked first (e.g. lobster before fish,
// hog before generic hunt) so a "Lobster Mini Season" excursion picks
// the lobster mark rather than the fish mark.
//
// Returns null when nothing matches so callers can keep the existing
// value instead of forcing a default.
const ICON_KEYWORDS: Array<readonly [string, RegExp]> = [
  ['lobster',   /\b(lobster|crawfish|crayfish|shrimp|crab)\b/i],
  ['fish',      /\b(tarpon|snook|red\s*fish|redfish|bass|trout|grouper|snapper|sailfish|marlin|mahi|cobia|permit|swordfish|tuna|fly\s*fish|fish(?:ing|erman|er|es)?|catch|angler|angling|fly\s*rod|inshore|offshore)\b/i],
  ['snorkel',   /\b(snorkel(?:ing)?|scuba|dive|diving|reef|coral)\b/i],
  ['surfboard', /\b(surf(?:ing|board)?|swell|wakeboard|paddle\s*board)\b/i],
  ['sail',      /\b(sail(?:ing|boat)?|regatta|yacht|charter)\b/i],
  ['wave',      /\b(beach|wave|tide|ocean|cruise|swim)\b/i],
  ['antlers',   /\b(deer|buck|stag|elk|antler|venison|whitetail)\b/i],
  ['hog',       /\b(hog|boar|pig|javelina)\b/i],
  ['croc',      /\b(croc|crocodile|alligator|gator)\b/i],
  ['quail',     /\b(quail|bobwhite|dove|pheasant|partridge|upland|grouse)\b/i],
  ['bow',       /\b(bow(?:hunt|hunting)?|archery|arrow)\b/i],
  ['rifle',     /\b(rifle|shoot(?:ing)?|hunt(?:ing)?|target|sporting|skeet|clay)\b/i],
  ['golf',      /\b(golf|tee|fairway|country\s*club|pga|caddie|caddy|18\s*holes)\b/i],
  ['flight',    /\b(flight|fly(?:over|by)?|aviation|airplane|plane|jet|aircraft|aero|charter|transfer)\b/i],
  ['sun',       /\b(spa|pool|resort|relax|leisure|sunset|sundowner|lounge)\b/i],
]

export function suggestIconForActivity(name: string | null | undefined): string | null {
  if (!name) return null
  for (const [icon, re] of ICON_KEYWORDS) {
    if (re.test(name)) return icon
  }
  return null
}
