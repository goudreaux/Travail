import type { Flight, Excursion, ExcursionTemplate } from './supabase/types'

// ─── Date/time constants ──────────────────────────────────────────────────────

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

export const DOWS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const DOWS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// ─── Airport data ─────────────────────────────────────────────────────────────

export interface AirportMeta {
  code: string
  name: string
  sub: string
  role: 'origin' | 'destination' | 'both'
}

export const ORIGINS: AirportMeta[] = [
  { code: 'TEB', name: 'Teterboro', sub: 'New York Metro', role: 'origin' },
  { code: 'VNY', name: 'Van Nuys', sub: 'Los Angeles', role: 'origin' },
  { code: 'PDK', name: 'DeKalb–Peachtree', sub: 'Atlanta', role: 'origin' },
  { code: 'ADS', name: 'Addison', sub: 'Dallas', role: 'origin' },
  { code: 'HOU', name: 'Hobby', sub: 'Houston', role: 'both' },
  { code: 'MDW', name: 'Midway', sub: 'Chicago', role: 'both' },
  { code: 'BOS', name: 'Logan', sub: 'Boston', role: 'both' },
  { code: 'MIA', name: 'Miami Intl', sub: 'Miami', role: 'both' },
  { code: 'OPF', name: 'Opa-locka Executive', sub: 'Miami North', role: 'origin' },
  { code: 'SAN', name: 'Lindbergh Field', sub: 'San Diego', role: 'both' },
]

export const DESTINATIONS: AirportMeta[] = [
  { code: 'HAV', name: 'José Martí Intl', sub: 'Havana, Cuba', role: 'destination' },
  { code: 'NAS', name: 'Lynden Pindling Intl', sub: 'Nassau, Bahamas', role: 'destination' },
  { code: 'GGT', name: 'Exuma Intl', sub: 'Great Exuma, Bahamas', role: 'destination' },
  { code: 'ELH', name: 'North Eleuthera', sub: 'Eleuthera, Bahamas', role: 'destination' },
  { code: 'TCB', name: 'Treasure Cay', sub: 'Abaco, Bahamas', role: 'destination' },
  { code: 'MBJ', name: 'Sangster Intl', sub: 'Montego Bay, Jamaica', role: 'destination' },
  { code: 'KIN', name: 'Norman Manley Intl', sub: 'Kingston, Jamaica', role: 'destination' },
  { code: 'UVF', name: 'Hewanorra Intl', sub: 'St Lucia', role: 'destination' },
  { code: 'SXM', name: 'Princess Juliana Intl', sub: 'St Maarten', role: 'destination' },
  { code: 'AXA', name: 'Clayton J Lloyd Intl', sub: 'Anguilla', role: 'destination' },
  { code: 'SKB', name: 'Robert L Bradshaw Intl', sub: 'St Kitts', role: 'destination' },
  { code: 'TAB', name: 'ANR Robinson Intl', sub: 'Tobago', role: 'destination' },
  { code: 'BGI', name: 'Grantley Adams Intl', sub: 'Barbados', role: 'destination' },
  { code: 'POS', name: 'Piarco Intl', sub: 'Trinidad', role: 'destination' },
  { code: 'CUR', name: 'Hato Intl', sub: 'Curaçao', role: 'destination' },
  { code: 'BON', name: 'Flamingo Intl', sub: 'Bonaire', role: 'destination' },
  { code: 'AUA', name: 'Queen Beatrix Intl', sub: 'Aruba', role: 'destination' },
  { code: 'PTP', name: 'Pointe-à-Pitre Intl', sub: 'Guadeloupe', role: 'destination' },
  { code: 'FDF', name: 'Martinique Aimé Césaire', sub: 'Martinique', role: 'destination' },
  { code: 'SBH', name: 'Gustaf III Airport', sub: 'St Barthélemy', role: 'destination' },
  { code: 'STT', name: 'Cyril E King Airport', sub: 'St Thomas, USVI', role: 'destination' },
  { code: 'STX', name: 'Henry E Rohlsen', sub: 'St Croix, USVI', role: 'destination' },
  { code: 'VQS', name: 'Vieques Airport', sub: 'Vieques, PR', role: 'destination' },
  { code: 'NEV', name: 'Vance W Amory Intl', sub: 'Nevis', role: 'destination' },
  { code: 'GND', name: 'Maurice Bishop Intl', sub: 'Grenada', role: 'destination' },
  { code: 'SVD', name: 'Argyle Intl', sub: 'St Vincent', role: 'destination' },
  { code: 'DOM', name: 'Douglas–Charles Airport', sub: 'Dominica', role: 'destination' },
  { code: 'SLU', name: 'George F L Charles', sub: 'Castries, St Lucia', role: 'destination' },
  { code: 'MNI', name: 'John A Osborne Airport', sub: 'Montserrat', role: 'destination' },
  { code: 'EIS', name: 'Terrance B Lettsome Intl', sub: 'Tortola, BVI', role: 'destination' },
  { code: 'VIJ', name: 'Virgin Gorda Airport', sub: 'Virgin Gorda, BVI', role: 'destination' },
  { code: 'NGD', name: 'Captain Auguste George', sub: 'Anegada, BVI', role: 'destination' },
  { code: 'ANU', name: 'V C Bird Intl', sub: 'Antigua', role: 'destination' },
]

export const ALL_AIRPORTS: AirportMeta[] = [...ORIGINS, ...DESTINATIONS]

// ─── Lookup helpers ───────────────────────────────────────────────────────────

export function airportName(code: string): string {
  const a = ALL_AIRPORTS.find(x => x.code === code)
  return a ? `${a.name} (${code})` : code
}

export function airportSub(code: string): string {
  const a = ALL_AIRPORTS.find(x => x.code === code)
  return a ? a.sub : ''
}

export function airportFull(code: string): AirportMeta | undefined {
  return ALL_AIRPORTS.find(x => x.code === code)
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

export function fmtDur(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function fmtDate(isoDate: string): { mo: string; day: string; dow: string; full: string } {
  // Parse as local date to avoid timezone shifting
  const [year, month, day] = isoDate.split('-').map(Number)
  const d = new Date(year, month - 1, day)
  return {
    mo: MONTHS_SHORT[d.getMonth()],
    day: String(d.getDate()),
    dow: DOWS_SHORT[d.getDay()],
    full: `${DOWS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`,
  }
}

export function fmtTime(timeStr: string | null): string {
  if (!timeStr) return '—'
  const [h, m] = timeStr.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

export function fmtMoney(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents)
}

// ─── Display types ────────────────────────────────────────────────────────────

export interface SeatSlot {
  idx: number
  kind: 'empty' | 'taken' | 'you' | 'anchor'
}

export interface DisplayFlight extends Flight {
  originMeta: AirportMeta | undefined
  destMeta: AirportMeta | undefined
  dateParts: { mo: string; day: string; dow: string; full: string }
  durationStr: string
  departTimeStr: string
  seatsAvailable: number
  seats: SeatSlot[]
  isAnchor: boolean
  isBooked: boolean
}

export interface DisplayExcursion extends Excursion {
  originMeta: AirportMeta | undefined
  dateParts: { mo: string; day: string; dow: string; full: string }
  startTimeStr: string
  departTimeStr: string
  arriveTimeStr: string
  returnTimeStr: string
  spotsAvailable: number
  templateMeta: ExcursionTemplate | undefined
  isAnchor: boolean
  isBooked: boolean
}

// ─── Adapt functions ──────────────────────────────────────────────────────────

export function adaptFlight(
  f: Flight,
  bookedSeatsByMember: Record<string, number> = {},
  currentMemberId?: string
): DisplayFlight {
  const totalBooked = Object.values(bookedSeatsByMember).reduce((a, b) => a + b, 0)
  const seatsAvailable = f.seats_total - f.seats_anchor - totalBooked

  const slots: SeatSlot[] = Array.from({ length: f.seats_total }, (_, idx) => {
    if (idx < f.seats_anchor) return { idx, kind: 'anchor' }
    const bookedIdx = idx - f.seats_anchor
    if (currentMemberId && bookedSeatsByMember[currentMemberId]) {
      const myStart = totalBooked - (bookedSeatsByMember[currentMemberId] ?? 0)
      if (bookedIdx >= myStart && bookedIdx < myStart + (bookedSeatsByMember[currentMemberId] ?? 0)) {
        return { idx, kind: 'you' }
      }
    }
    if (bookedIdx < totalBooked) return { idx, kind: 'taken' }
    return { idx, kind: 'empty' }
  })

  return {
    ...f,
    originMeta: airportFull(f.origin_code),
    destMeta: airportFull(f.dest_code),
    dateParts: fmtDate(f.date),
    durationStr: fmtDur(f.duration_mins),
    departTimeStr: fmtTime(f.depart_time),
    seatsAvailable,
    seats: slots,
    isAnchor: currentMemberId === f.anchor_member_id,
    isBooked: currentMemberId ? (bookedSeatsByMember[currentMemberId] ?? 0) > 0 : false,
  }
}

export function adaptExcursion(
  e: Excursion,
  templates: ExcursionTemplate[],
  bookedSpotsByMember: Record<string, number> = {},
  currentMemberId?: string
): DisplayExcursion {
  const totalBooked = Object.values(bookedSpotsByMember).reduce((a, b) => a + b, 0)
  const spotsAvailable = e.spots_total - e.spots_anchor - totalBooked
  const tpl = templates.find(t => t.id === e.template_id)

  return {
    ...e,
    originMeta: airportFull(e.origin_code),
    dateParts: fmtDate(e.date),
    startTimeStr: fmtTime(e.start_time),
    departTimeStr: fmtTime(e.depart_time),
    arriveTimeStr: fmtTime(e.arrive_time),
    returnTimeStr: fmtTime(e.return_time),
    spotsAvailable,
    templateMeta: tpl,
    isAnchor: currentMemberId === e.anchor_member_id,
    isBooked: currentMemberId ? (bookedSpotsByMember[currentMemberId] ?? 0) > 0 : false,
  }
}

// ─── Excursion templates catalog ──────────────────────────────────────────────

export interface TemplateCatalogEntry {
  name: string
  operator?: string
  icon: string
  capacity: number
  pricePerPax: number
  tags: string[]
}

export const EXCURSION_TEMPLATES_BY_DEST: Record<string, TemplateCatalogEntry[]> = {
  GGT: [
    {
      name: 'Deep Sea Fishing with Capt. Ray',
      operator: 'Exuma Charters',
      icon: 'fish',
      capacity: 6,
      pricePerPax: 650,
      tags: ['fishing', 'offshore', 'full-day'],
    },
    {
      name: 'Staniel Cay & Swimming Pigs Day Sail',
      operator: 'Exuma Sailing Co.',
      icon: 'sail',
      capacity: 10,
      pricePerPax: 480,
      tags: ['sail', 'sightseeing', 'pigs'],
    },
    {
      name: 'Thunderball Grotto Snorkel & Lunch',
      operator: 'Island Routes',
      icon: 'snorkel',
      capacity: 8,
      pricePerPax: 320,
      tags: ['snorkel', 'caves', 'lunch'],
    },
  ],
  NAS: [
    {
      name: 'Nassau Golf Day at Royal Blue',
      operator: 'Baha Mar Golf',
      icon: 'golf',
      capacity: 8,
      pricePerPax: 850,
      tags: ['golf', 'resort', 'full-day'],
    },
    {
      name: 'Private Atlantis Aquaventure Access',
      operator: 'Atlantis Resort',
      icon: 'wave',
      capacity: 12,
      pricePerPax: 420,
      tags: ['family', 'resort', 'water-park'],
    },
    {
      name: 'Offshore Billfish Charter',
      operator: 'Nassau Sport Fishing',
      icon: 'fish',
      capacity: 6,
      pricePerPax: 780,
      tags: ['fishing', 'billfish', 'full-day'],
    },
  ],
  MBJ: [
    {
      name: 'Quail Shoot at Tryall Estate',
      operator: 'Tryall Club',
      icon: 'quail',
      capacity: 8,
      pricePerPax: 1200,
      tags: ['shooting', 'sporting', 'full-day'],
    },
    {
      name: 'Tarpon & Bonefish Fly Fishing',
      operator: 'Jamaica Fly Fishing Co.',
      icon: 'fish',
      capacity: 4,
      pricePerPax: 750,
      tags: ['fishing', 'fly', 'flat'],
    },
    {
      name: 'Blue Mountain Coffee Estate Tour & Lunch',
      operator: 'Craighton Estate',
      icon: 'hog',
      capacity: 12,
      pricePerPax: 280,
      tags: ['food', 'culture', 'half-day'],
    },
    {
      name: 'Offshore Marlin Charter',
      operator: 'MBJ Sport Fishing',
      icon: 'fish',
      capacity: 6,
      pricePerPax: 950,
      tags: ['fishing', 'marlin', 'full-day'],
    },
  ],
  SBH: [
    {
      name: 'St Barths Day Sail — Île Fourchue',
      operator: 'Jicky Marine',
      icon: 'sail',
      capacity: 8,
      pricePerPax: 520,
      tags: ['sail', 'snorkel', 'lunch'],
    },
    {
      name: 'Spearfishing Half-Day',
      operator: 'St Barths Diving',
      icon: 'snorkel',
      capacity: 4,
      pricePerPax: 680,
      tags: ['spearfish', 'diving', 'half-day'],
    },
  ],
  AXA: [
    {
      name: 'Bonefishing on the Flats with Thomas',
      operator: 'Anguilla Fly Fishing',
      icon: 'fish',
      capacity: 4,
      pricePerPax: 640,
      tags: ['fishing', 'bonefish', 'flat'],
    },
    {
      name: 'Shoal Bay Snorkel & Beach Day',
      operator: 'Island Shuttle',
      icon: 'snorkel',
      capacity: 10,
      pricePerPax: 180,
      tags: ['snorkel', 'beach', 'half-day'],
    },
  ],
  BGI: [
    {
      name: 'Barbados Open-Water Freedive',
      operator: 'Freedivers Barbados',
      icon: 'snorkel',
      capacity: 6,
      pricePerPax: 420,
      tags: ['freedive', 'ocean', 'half-day'],
    },
    {
      name: 'Offshore Wahoo & Dorado Day',
      operator: 'Barbados Sport Fishing',
      icon: 'fish',
      capacity: 6,
      pricePerPax: 680,
      tags: ['fishing', 'wahoo', 'full-day'],
    },
  ],
  SXM: [
    {
      name: 'St Maarten Sunset Sail & Snorkel',
      operator: 'Aqua Mania Adventures',
      icon: 'sail',
      capacity: 10,
      pricePerPax: 390,
      tags: ['sail', 'sunset', 'snorkel'],
    },
    {
      name: 'Maho Beach & Plane Spotting Day',
      operator: 'Excursion by local guide',
      icon: 'wave',
      capacity: 12,
      pricePerPax: 120,
      tags: ['aviation', 'beach', 'fun'],
    },
  ],
  STT: [
    {
      name: 'USVI Kiteboarding Clinic',
      operator: 'Kiteboarding USVI',
      icon: 'wave',
      capacity: 6,
      pricePerPax: 540,
      tags: ['kite', 'watersports', 'full-day'],
    },
    {
      name: 'St Thomas Offshore Fishing',
      operator: 'USVI Sport Fishing',
      icon: 'fish',
      capacity: 6,
      pricePerPax: 720,
      tags: ['fishing', 'offshore', 'full-day'],
    },
  ],
  ANU: [
    {
      name: 'Antigua Sailing Week Pre-Race Practice',
      operator: 'Antigua Yacht Club',
      icon: 'sail',
      capacity: 8,
      pricePerPax: 580,
      tags: ['sail', 'racing', 'full-day'],
    },
    {
      name: 'Deep Sea Fishing — Blue Marlin',
      operator: 'Blue Water Charters',
      icon: 'fish',
      capacity: 6,
      pricePerPax: 860,
      tags: ['fishing', 'marlin', 'full-day'],
    },
  ],
  GND: [
    {
      name: 'Underwater Sculpture Park Dive',
      operator: 'Aquanauts Grenada',
      icon: 'snorkel',
      capacity: 8,
      pricePerPax: 290,
      tags: ['dive', 'art', 'half-day'],
    },
  ],
  HAV: [
    {
      name: 'Havana Cigars & Rum Private Tour',
      operator: 'Havana VIP Tours',
      icon: 'hog',
      capacity: 8,
      pricePerPax: 350,
      tags: ['culture', 'cigars', 'half-day'],
    },
    {
      name: 'Varadero Beach Charter & Snorkel',
      operator: 'Cuba Dive Centre',
      icon: 'snorkel',
      capacity: 10,
      pricePerPax: 280,
      tags: ['beach', 'snorkel', 'full-day'],
    },
  ],
  ELH: [
    {
      name: 'Eleuthera Bone Fishing',
      operator: 'Eleuthera Outfitters',
      icon: 'fish',
      capacity: 4,
      pricePerPax: 590,
      tags: ['fishing', 'bonefish', 'flat'],
    },
    {
      name: "Glass Window Bridge & Surfer's Beach",
      operator: 'Pink Sand Tours',
      icon: 'wave',
      capacity: 8,
      pricePerPax: 160,
      tags: ['sightseeing', 'beach', 'half-day'],
    },
  ],
  BON: [
    {
      name: 'Bonaire Shore Diving — Klein Bonaire',
      operator: 'Bonaire Dive & Adventure',
      icon: 'snorkel',
      capacity: 8,
      pricePerPax: 260,
      tags: ['dive', 'reef', 'full-day'],
    },
    {
      name: 'Flamingo Sanctuary Kayak',
      operator: 'Bonaire Eco Tours',
      icon: 'wave',
      capacity: 6,
      pricePerPax: 140,
      tags: ['kayak', 'nature', 'half-day'],
    },
  ],
}
