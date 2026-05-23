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

export const KIND_ICONS: Record<string, React.ReactElement> = {
  flight: (<svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 13l7-1 3-7h2l-1 7 5-1 1 1.5-5 3-1 4-2 .5-1-3.5-3 0-1 .5z"/></svg>),
  fish: (<svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11c2-4 6-5 9-5s6 2 7 5c-1 3-4 5-7 5s-7-1-9-5z"/><path d="M19 11l3-2v4z"/><circle cx="15" cy="10" r="0.8" fill="currentColor"/></svg>),
  sail: (<svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M11 3v13M11 5l6 11H5z"/><path d="M3 19q3 1 5 0 t 5 0 t 5 0"/></svg>),
  wave: (<svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2 8q3-3 5 0 t 5 0 t 5 0 t 3 0"/><path d="M2 13q3-3 5 0 t 5 0 t 5 0 t 3 0"/><path d="M2 18q3-3 5 0 t 5 0 t 5 0 t 3 0"/></svg>),
  snorkel: (<svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="10" r="4"/><path d="M13 10h4v6"/><path d="M17 16h2"/></svg>),
  golf: (<svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="17" x2="7" y2="3"/><path d="M7 3l8 3-8 3" fill="currentColor"/><path d="M3 19q3-1 7-1t9 1"/></svg>),
  quail: (<svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 14q1-7 8-7 5 0 7 4 1 3-2 5l-3 1H6q-3 0-3-3z"/><path d="M15 7q1-2 0-3"/><circle cx="14" cy="10" r="0.8" fill="currentColor"/><path d="M5 17l-1 2 M9 17l-1 2"/></svg>),
  hog: (<svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11q1-4 6-4h6q3 0 4 3v2q0 3-3 3h-1q-1 2-3 2H7q-3 0-4-2z"/><circle cx="16" cy="10" r="0.8" fill="currentColor"/><path d="M18 13l2 1"/><path d="M6 16l-1 2 M10 16l-1 2"/></svg>),
}
