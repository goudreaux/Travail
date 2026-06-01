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
  // Excursion activity destinations (resolved from the excursion template's
  // dest_code) so excursion routes draw airport → activity, not just a dot.
  KGIF: [-81.7329, 28.0228], // Winter Haven (CC of Winter Haven golf)
  KMTH: [-81.0514, 24.7262], // Marathon, FL Keys
  KSPG: [-82.6373, 27.7651], // Albert Whitted · St. Petersburg
  KOPF: [-80.2784, 25.9070], // Opa-locka / Miami
  KFXE: [-80.1707, 26.1973], // Fort Lauderdale Executive
  MYBS: [-79.2647, 25.6998], // Bimini, Bahamas
  MYAM: [-77.0835, 26.5114], // Marsh Harbour, Abaco
  MYAN: [-78.0490, 25.0538], // Andros, Bahamas
  MYEF: [-75.8780, 23.5625], // Exuma, Bahamas
  FLBAY: [-80.9500, 25.1500], // Florida Bay · Everglades
  TENTH: [-81.4500, 25.8500], // Ten Thousand Islands
  DRTRT: [-82.8732, 24.6285], // Dry Tortugas
  OKEEC: [-80.8500, 26.9500], // Lake Okeechobee
  NFSPR: [-83.0000, 30.0000], // North Florida Springs
  TALQ:  [-84.5500, 30.4200], // Lake Talquin
  BOCA:  [-82.2715, 26.7478], // Boca Grande, FL (tarpon)
  LKNONA: [-81.2519, 28.3772], // Lake Nona Golf Club · Orlando
}

export function coordFor(code: string | null | undefined): [number, number] | null {
  if (!code) return null
  return AIRPORT_COORDS[code.toUpperCase()] ?? null
}
