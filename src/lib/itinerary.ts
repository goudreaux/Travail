// Excursion day-of itinerary — an ordered list of the day's major
// stops rendered as a bubble-down timeline on the /reserve page.
//
// Members anchoring a trip don't fill this in. Ops generates the
// default 5-step plan from the dates / times already on the excursion
// (depart, arrive, activity start, return, etc.), edits before
// publish, and the result is stored as JSONB on excursions.itinerary.

export interface ItineraryStep {
  time?: string | null     // 'HH:MM' (24h) or null if TBD
  label: string            // primary line — "Take off at KTPF"
  sub?: string | null      // optional secondary line — "Davis Island"
  icon?: string | null     // KIND_ICONS key — render the mark next to the dot
}

// Display helper: 'HH:MM' → '8:30 AM'. Returns the raw string back if
// it can't parse (so an ops-written "TBD" or "~ 9 AM" passes through).
export function fmtItineraryTime(t: string | null | undefined): string {
  if (!t) return ''
  const m = /^(\d{1,2}):(\d{2})/.exec(t)
  if (!m) return t
  const h = parseInt(m[1], 10)
  const min = m[2]
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${min} ${ampm}`
}

// Builds the canonical 5-step plan from an excursion's row data. Any
// step whose time is unknown stays as null — Ops fills it in before
// publish. The destination label uses the excursion's origin_code by
// default (round-trips return to origin); ops can edit freely.
export function generateDefaultItinerary(input: {
  originCode: string | null | undefined       // departure airport (KTPF, etc.)
  destCode?: string | null                    // optional explicit destination (e.g. excursion template dest_code)
  destName?: string | null                    // optional friendly destination ("Marsh Harbour")
  departTime?: string | null                  // wheels up from origin
  arriveTime?: string | null                  // touchdown at destination
  startTime?: string | null                   // activity check-in / start
  returnTime?: string | null                  // wheels up from destination
  operator?: string | null                    // 'Tropic Ocean Air' / charter operator
  guide?: string | null                       // ground operator / guide
}): ItineraryStep[] {
  const origin = input.originCode ?? 'origin'
  const dest = input.destName?.trim() || input.destCode || 'destination'
  const guideLabel = input.guide?.trim() || input.operator?.trim() || 'the activity guide'

  return [
    {
      time: input.departTime ?? null,
      label: `Take off at ${origin}`,
      sub: input.operator?.trim() || null,
      icon: 'flight',
    },
    {
      time: input.arriveTime ?? null,
      label: `Land at ${dest}`,
      sub: input.destCode || null,
      icon: 'flight',
    },
    {
      time: input.startTime ?? null,
      label: `Check in with ${guideLabel}`,
      sub: 'Activity begins',
      icon: 'sun',
    },
    {
      time: input.returnTime ?? null,
      label: `Wheels up from ${dest}`,
      sub: input.operator?.trim() || null,
      icon: 'flight',
    },
    {
      time: null,
      label: `Arrive back at ${origin}`,
      sub: 'Day complete',
      icon: 'flight',
    },
  ]
}

// Coerce whatever JSONB shape Postgres hands back into a clean
// ItineraryStep[]. Returns [] for null / non-array / empty values so
// callers can skip the section entirely when there's nothing to show.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function asItinerary(raw: any): ItineraryStep[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(s => s && typeof s === 'object')
    .map(s => ({
      time: typeof s.time === 'string' ? s.time : null,
      label: typeof s.label === 'string' ? s.label : '',
      sub: typeof s.sub === 'string' ? s.sub : null,
      icon: typeof s.icon === 'string' ? s.icon : null,
    }))
    .filter(s => s.label.length > 0)
}
