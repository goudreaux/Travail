// Shared origin + destination options for the proposal wizards (flight and
// excursion) and the Concierge proposal editor. Keeping one list means every
// surface offers the same places, and — critically — every code here resolves
// to coordinates in `airport-coords.ts`, so anything picked draws correctly on
// the Route Map (origin → destination).

export interface PlaceOption {
  code: string
  name: string
  sub: string
}

// Where a charter departs from.
export const PROPOSAL_ORIGINS: PlaceOption[] = [
  { code: 'KTPA', name: 'TPA',           sub: 'Tampa Intl · Tampa, FL' },
  { code: 'KTPF', name: 'Davis Islands', sub: 'Peter O. Knight · Tampa, FL' },
]

// Where it's going. Each code has coordinates in airport-coords.ts.
export const PROPOSAL_DESTS: PlaceOption[] = [
  { code: 'STR',    name: 'St. Regis Hotel · Sarasota', sub: 'Sarasota, FL' },
  { code: 'LCC',    name: 'Lochloosa Country Club',     sub: 'North Central FL' },
  { code: 'KEYW',   name: 'Key West',                   sub: 'FL Keys' },
  { code: 'LPI',    name: 'Little Palm Island',         sub: 'FL Keys' },
  { code: 'BOCA',   name: 'Boca Grande',                sub: 'Tarpon · SW FL' },
  { code: 'KGIF',   name: 'Country Club of Winter Haven', sub: 'Golf · Winter Haven, FL' },
  { code: 'LKNONA', name: 'Lake Nona Golf Club',        sub: 'Golf · Orlando, FL' },
  { code: 'KMTH',   name: 'Marathon',                   sub: 'FL Keys' },
  { code: 'KFXE',   name: 'Fort Lauderdale',            sub: 'SE FL' },
  { code: 'MYBS',   name: 'Bimini',                     sub: 'Bahamas' },
]

// Always-last "I'll describe it" option; the Concierge Team confirms coords.
export const CUSTOM_DEST: PlaceOption = {
  code: 'CUSTOM',
  name: 'Custom destination',
  sub: 'Request — the Concierge Team will confirm',
}

// Flat list (real dests + custom) for a <select>.
export const PROPOSAL_DEST_OPTIONS: PlaceOption[] = [...PROPOSAL_DESTS, CUSTOM_DEST]

export function destName(code: string | null | undefined): string {
  if (!code) return ''
  return PROPOSAL_DESTS.find(d => d.code === code)?.name ?? code
}
