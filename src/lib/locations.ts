// The Location Library — the airports table is the single source of truth for
// every origin and destination (name, code, type, coordinates). Forms feed
// their From/To pickers from here; the Route Map reads coordinates from here.
//
// `coordFor` in airport-coords.ts remains as a static fallback so the app keeps
// working before the 063 migration is applied (and as a safety net if a row is
// missing coordinates).

import { coordFor } from '@/lib/airport-coords'

export interface LibraryLocation {
  code: string
  name: string
  sub: string | null
  role: 'origin' | 'destination' | 'both'
  lat: number | null
  lng: number | null
  active: boolean
}

// Minimal shape we need from a Supabase client (client or server). Kept loose
// so this helper works from both 'use client' and route handlers.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (t: string) => any }

export async function fetchLocations(supabase: Db, opts?: { includeInactive?: boolean }): Promise<LibraryLocation[]> {
  const { data } = await supabase
    .from('airports')
    .select('code, name, sub, role, lat, lng, active')
    .order('name')
  const rows = (data ?? []) as LibraryLocation[]
  return opts?.includeInactive ? rows : rows.filter(r => r.active !== false)
}

export const asOrigins = (locs: LibraryLocation[]) =>
  locs.filter(l => l.role === 'origin' || l.role === 'both')

export const asDestinations = (locs: LibraryLocation[]) =>
  locs.filter(l => l.role === 'destination' || l.role === 'both')

// [lng, lat] for a code, from the library row if it has coordinates, otherwise
// the static fallback table.
export function coordsFromLocations(
  locs: LibraryLocation[],
  code: string | null | undefined,
): [number, number] | null {
  if (!code) return null
  const row = locs.find(l => l.code === code)
  if (row && row.lng != null && row.lat != null) return [row.lng, row.lat]
  return coordFor(code)
}
