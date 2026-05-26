import React from 'react'

export const Icons = {
  feed: (<svg width="18" height="18" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><line x1="4" y1="6" x2="18" y2="6"/><line x1="4" y1="11" x2="18" y2="11"/><line x1="4" y1="16" x2="14" y2="16"/></svg>),
  cal: (<svg width="18" height="18" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="4" y="5" width="14" height="13" rx="1.5"/><line x1="4" y1="9" x2="18" y2="9"/><line x1="8" y1="3" x2="8" y2="6"/><line x1="14" y1="3" x2="14" y2="6"/></svg>),
  seat: (<svg width="18" height="18" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M5 11h12M5 11a3 3 0 0 1 0-6h12a3 3 0 0 1 0 6M5 11v6h12v-6M9 17v3M13 17v3"/></svg>),
  build: (<svg width="18" height="18" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 13l7-1 3-7h2l-1 7 5-1 1 1.5-5 3-1 4-2 0.5-1-3.5-3 0-1 0.5z"/></svg>),
  compass: (<svg width="18" height="18" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M14.5 7.5L12.5 12.5L7.5 14.5L9.5 9.5z"/></svg>),
  inbox: (<svg width="18" height="18" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6l8 6 8-6M3 6v11h16V6M3 6h16"/></svg>),
  network: (<svg width="18" height="18" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><ellipse cx="11" cy="11" rx="3.2" ry="8"/><line x1="3" y1="11" x2="19" y2="11"/></svg>),
  member: (<svg width="18" height="18" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="11" cy="8" r="3.5"/><path d="M4 18Q4 13 11 13Q18 13 18 18" strokeLinecap="round"/></svg>),
  bell: (<svg width="18" height="18" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M5 15h12M6 15v-5a5 5 0 0 1 10 0v5M9.5 17.5a1.5 1.5 0 0 0 3 0"/></svg>),
  phone: (<svg width="18" height="18" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M7 3.5c.5 2 .5 3 1.5 4-.5 1-1.5 2-2 2.5 1 2 2.5 3.5 4.5 4.5.5-.5 1.5-1.5 2.5-2 1 1 2 1 4 1.5v3c0 .8-.7 1.5-1.5 1.4C9.5 17.5 4.5 12.5 3.6 5 3.5 4.2 4.2 3.5 5 3.5z"/></svg>),
  search: (<svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="9" cy="9" r="6"/><line x1="13.5" y1="13.5" x2="18" y2="18"/></svg>),
  plus: (<svg width="14" height="14" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="11" y1="5" x2="11" y2="17"/><line x1="5" y1="11" x2="17" y2="11"/></svg>),
  send: (<svg width="18" height="18" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l16-7-7 16-2-7z"/></svg>),
  paper: (<svg width="18" height="18" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14 4l4 4-9 9-5 1 1-5z"/></svg>),
  more: (<svg width="18" height="18" viewBox="0 0 22 22" fill="currentColor"><circle cx="6" cy="11" r="1.5"/><circle cx="11" cy="11" r="1.5"/><circle cx="16" cy="11" r="1.5"/></svg>),
  pin: (<svg width="14" height="14" viewBox="0 0 22 22" fill="currentColor"><path d="M11 3l2 5 5 .5-3.5 3.5 1 5L11 14.5 6.5 17l1-5L4 8.5 9 8z"/></svg>),
  chevL: (<svg width="14" height="14" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M14 5l-6 6 6 6"/></svg>),
  chevR: (<svg width="14" height="14" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M8 5l6 6-6 6"/></svg>),
} as const

// Activity / excursion field-guide marks. All share the same grid (22×22),
// stroke width (1.5), round caps / joins, and currentColor stroke — so they
// inherit theme color and feel like one coherent set.
export const KIND_ICONS: Record<string, React.ReactElement> = {
  // Cessna 208 Caravan on floats — fuselage ellipse + high wing + tail fin
  // + pontoon and struts, with a single water line beneath.
  flight: (<svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="11" cy="9" rx="8" ry="1.4"/><path d="M7 8 L9 5 L13 5 L15 8"/><path d="M18 8 L20 5"/><line x1="5" y1="13" x2="17" y2="13"/><line x1="7" y1="10" x2="7" y2="13"/><line x1="15" y1="10" x2="15" y2="13"/><path d="M2 16.5 Q11 15.5 20 16.5"/></svg>),

  // Tarpon — leaf-shaped body with a forked tail, gill curve, eye, dorsal fin.
  fish: (<svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11 Q4.5 6 11 6 Q16 6 17.5 9 L17.5 13 Q16 16 11 16 Q4.5 16 3 11 Z"/><path d="M17.5 9 L20.5 6 L19.5 11 L20.5 16 L17.5 13"/><path d="M7 8.5 Q7.8 11 7 13.5"/><circle cx="5.2" cy="10" r="0.7" fill="currentColor"/><path d="M10 6 L11 4 L13 6"/></svg>),

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
}

// Canonical trip-type → icon, used for member interests across the app.
export const TRIP_TYPE_ICONS: Record<string, React.ReactElement> = {
  Fishing: KIND_ICONS.fish,
  Hunting: KIND_ICONS.quail,
  Golf: KIND_ICONS.golf,
  Leisure: KIND_ICONS.sun,
  Surfing: KIND_ICONS.wave,
}
