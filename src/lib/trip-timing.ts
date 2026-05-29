// Single source of truth for every "is the clock against us?" decision
// on the platform. Anchors, proposals, and seat bookings all gate on
// proximity to departure — but for *different* reasons:
//
//   • Anchors  — limited by how late Tropic can still source a charter
//                (aircraft + crew). That's the HARD_SOURCING_FLOOR.
//   • Proposals— limited by whether the network has time to gather a
//                group at all. Inside the proposal lead floor there's no
//                runway to commit, so last-minute trips are anchor-only.
//   • Bookings — open trips stop taking new seats a fixed window before
//                takeoff so the manifest can be finalized.
//
// Keeping the thresholds here means the wizards, server routes, crons,
// and the seats board can never disagree about what "too late" means.

// ── Thresholds ──────────────────────────────────────────────────────

// Below this many hours to takeoff, Tropic can't confirm a *new*
// charter. Hard floor for both anchors and (last-minute) proposals.
export const HARD_SOURCING_FLOOR_HOURS = 48

// Already-open trips stop accepting new bookings this many hours before
// takeoff. Members can grab a seat right up to here (a booking inside
// the 72h cancellation window is allowed, just non-refundable); after
// this the departure is locked so ops has a stable manifest.
export const BOOKING_CUTOFF_HOURS = 12

// Minimum days between submit and trip date for a PROPOSAL. The network
// needs runway to commit before the auto-expire window starts; inside
// this, a trip should be anchored instead of proposed.
export const PROPOSAL_MIN_LEAD_DAYS = 7

// Proposals auto-expire this many days before departure if they haven't
// hit min_seats — the operational runway ops needs to lock Tropic.
export const PROPOSAL_RUNWAY_DAYS = 5

// ── Departure clock ─────────────────────────────────────────────────

// Hours from `now` until a trip's departure. `date` is a bare
// 'YYYY-MM-DD'; `time` is an optional 'HH:MM' (24h) or 'H:MM AM/PM'
// string. When no time is given we assume 8am local so an all-day-out
// trip doesn't read as midnight. Mirrors the trip's local wall clock —
// the same loose-tz handling the cancellation window uses, which has
// enough headroom that a few tz hours don't matter.
export function hoursUntilDeparture(date: string, time?: string | null, now: number = Date.now()): number {
  if (!date) return Infinity
  let hh = 8, mm = 0
  if (time) {
    const m = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i)
    if (m) {
      hh = parseInt(m[1], 10)
      mm = parseInt(m[2], 10)
      const ap = m[3]?.toUpperCase()
      if (ap === 'PM' && hh < 12) hh += 12
      if (ap === 'AM' && hh === 12) hh = 0
    }
  }
  const target = new Date(`${date}T00:00:00`)
  target.setHours(hh, mm, 0, 0)
  return (target.getTime() - now) / 3_600_000
}

// Whole-calendar-day lead between today and the trip date (date-only,
// ignores time of day). Proposals measure their lead floor in calendar
// days, so this keeps that gate stable regardless of clock time.
export function leadDays(date: string, now: number = Date.now()): number {
  if (!date) return Infinity
  const target = new Date(date + 'T00:00:00')
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

// ── Lead tier ───────────────────────────────────────────────────────

export type LeadTier =
  | 'standard'     // far enough out that everything works normally
  | 'last_minute'  // sourceable but tight — urgent, anchor-only
  | 'too_late'     // inside the sourcing floor — no new charter
  | 'departed'     // already gone

export function tripLeadTier(date: string, time?: string | null, now: number = Date.now()): LeadTier {
  const h = hoursUntilDeparture(date, time, now)
  if (h <= 0) return 'departed'
  if (h < HARD_SOURCING_FLOOR_HOURS) return 'too_late'
  if (leadDays(date, now) < PROPOSAL_MIN_LEAD_DAYS) return 'last_minute'
  return 'standard'
}

// ── Gate results ────────────────────────────────────────────────────

export type TimingGate =
  | { ok: true; tier: LeadTier; urgent: boolean }
  | { ok: false; tier: LeadTier; reason: string; suggestAnchor?: boolean }

// Can this trip still be ANCHORED? Allowed right down to the sourcing
// floor; flagged `urgent` once inside the proposal lead window so the
// wizard + ops can treat it as a rush.
export function canAnchor(date: string, time?: string | null, now: number = Date.now()): TimingGate {
  const tier = tripLeadTier(date, time, now)
  if (tier === 'departed') {
    return { ok: false, tier, reason: 'That date has already passed.' }
  }
  if (tier === 'too_late') {
    return {
      ok: false,
      tier,
      reason: `Anchors need at least ${HARD_SOURCING_FLOOR_HOURS} hours before takeoff so Tropic can confirm the aircraft and crew. This departure is too close.`,
    }
  }
  return { ok: true, tier, urgent: tier === 'last_minute' }
}

// Can this trip be PROPOSED? Only when there's real runway for the
// network to gather (>= the lead floor). Inside that, route to an
// anchor; inside the sourcing floor, it can't run at all.
export function canPropose(date: string, now: number = Date.now()): TimingGate {
  const days = leadDays(date, now)
  if (days >= PROPOSAL_MIN_LEAD_DAYS) {
    return { ok: true, tier: 'standard', urgent: false }
  }
  const tier = tripLeadTier(date, undefined, now)
  if (tier === 'too_late' || tier === 'departed') {
    return {
      ok: false,
      tier,
      reason: `This departure is under ${HARD_SOURCING_FLOOR_HOURS} hours out — too close to source a new charter.`,
    }
  }
  return {
    ok: false,
    tier: 'last_minute',
    suggestAnchor: true,
    reason: `Trips inside ${PROPOSAL_MIN_LEAD_DAYS} days are too close to gather a group in time. Anchor it instead — you commit the charter and open the extra seats to the network.`,
  }
}

// Can a member still book an open seat on this trip? Closes a fixed
// window before takeoff. Pure time check — the caller still applies the
// status/subscription gates.
export function canBookSeat(date: string, time?: string | null, now: number = Date.now()): { ok: true } | { ok: false; reason: string } {
  const h = hoursUntilDeparture(date, time, now)
  if (h <= 0) return { ok: false, reason: 'This trip has already departed.' }
  if (h < BOOKING_CUTOFF_HOURS) {
    return { ok: false, reason: `Booking closes ${BOOKING_CUTOFF_HOURS} hours before takeoff — this departure is locked.` }
  }
  return { ok: true }
}

// True once a trip is inside the booking cutoff (or gone). Convenience
// for board/render code that just wants to hide or disable a seat CTA.
export function isPastBookingCutoff(date: string, time?: string | null, now: number = Date.now()): boolean {
  return !canBookSeat(date, time, now).ok
}
