// Lng/lat for the airport + venue codes in Travail's current route footprint.
//
// The `airports` table (code, name, sub, role) has no coordinates, so the map
// needs them from somewhere. For this first ops-only version we keep them here
// in code — the footprint is small and known. When we promote the map to
// members we can move these into a `lat`/`lng` column on `airports` and seed
// from this same table; `coordFor` is the single read point either way.
//
// Coordinates are [longitude, latitude] — the order Mapbox GL expects.
export const AIRPORT_COORDS: Record<string, [number, number]> = {
  KTPA: [-82.5332, 27.9755], // Tampa International
  KTPF: [-82.4490, 27.9156], // Davis Islands (Peter O. Knight)
  KEYW: [-81.7595, 24.5561], // Key West International
  LPI:  [-81.4015, 24.6166], // Little Palm Island
  STR:  [-82.5307, 27.3364], // St. Regis · Sarasota
  LCC:  [-82.0900, 29.5100], // Lochloosa Country Club
}

export function coordFor(code: string | null | undefined): [number, number] | null {
  if (!code) return null
  return AIRPORT_COORDS[code.toUpperCase()] ?? null
}
