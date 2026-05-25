'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { adaptFlight, adaptExcursion, fmtDate, fmtMoney } from '@/lib/data'
import { KIND_ICONS } from '@/lib/icons'
import PageHero from '@/components/PageHero'
import { fetchRosters, RosterStack, type RosterEntry } from '@/components/Roster'
import { SeatMeter } from '@/components/SeatMeter'
import type { Flight, Excursion, ExcursionTemplate, Booking } from '@/lib/supabase/types'
import type { DisplayFlight, DisplayExcursion } from '@/lib/data'

// Full airport name for a code (members don't know codes by heart). Codes are
// FK-bound to the airports table, so a lookup essentially always resolves.
function placeName(code: string, names: Record<string, string>): string {
  return names[code] ?? code
}

// ─── Color helpers ─────────────────────────────────────────────────────────────

type ActivityFilter = 'all' | 'fish' | 'golf' | 'hunt' | 'flight'

function getFlightColors() {
  return { accent: 'var(--tropic-d)', bg: 'var(--tropic-glow)', dot: 'var(--tropic)' }
}

function getExcursionColors(icon: string) {
  if (icon === 'golf') return { accent: 'var(--moss)', bg: 'rgba(62,140,109,0.10)', dot: 'var(--moss)' }
  if (icon === 'quail' || icon === 'hog') return { accent: 'var(--signal)', bg: 'rgba(217,78,42,0.10)', dot: 'var(--signal)' }
  // fish / snorkel / sail / wave → sun
  return { accent: 'var(--sun-d)', bg: 'var(--sun-glow)', dot: 'var(--sun)' }
}

function excursionFilter(icon: string): ActivityFilter {
  if (icon === 'golf') return 'golf'
  if (icon === 'quail' || icon === 'hog') return 'hunt'
  return 'fish'
}

// ─── Filter bar ────────────────────────────────────────────────────────────────

const FILTERS: { key: ActivityFilter; label: string; icon?: string }[] = [
  { key: 'all',    label: 'All' },
  { key: 'flight', label: 'Flights',     icon: 'flight' },
  { key: 'fish',   label: 'Fishing',     icon: 'fish' },
  { key: 'golf',   label: 'Golf',        icon: 'golf' },
  { key: 'hunt',   label: 'Hunt',        icon: 'quail' },
]

// ─── Book / Waitlist CTA ─────────────────────────────────────────────────────

function CtaButton({ available, waitlisted, onBook, onWaitlist, label, accent }: {
  available: number; waitlisted: boolean; onBook: () => void; onWaitlist: () => void; label: string; accent: string
}) {
  if (available > 0) {
    return (
      <button className="btn-primary" style={{ height: 30, padding: '0 14px', fontSize: 12, background: accent }} onClick={e => { e.stopPropagation(); onBook() }}>
        {label}
      </button>
    )
  }
  return (
    <button
      className="btn-ghost"
      disabled={waitlisted}
      style={{ height: 30, padding: '0 14px', fontSize: 12, opacity: waitlisted ? 0.7 : 1 }}
      onClick={e => { e.stopPropagation(); if (!waitlisted) onWaitlist() }}
    >
      {waitlisted ? 'On waitlist ✓' : 'Join waitlist'}
    </button>
  )
}

// ─── Round-trip grouping ─────────────────────────────────────────────────────
// Round-trips are stored as two flights: outbound "F-x" and return "F-xR" with
// swapped origin/dest. Pair them so the board shows one entry per round-trip.

type FlightEntry =
  | { kind: 'oneway'; flight: DisplayFlight }
  | { kind: 'round'; outbound: DisplayFlight; ret: DisplayFlight }

function buildFlightEntries(flights: DisplayFlight[]): FlightEntry[] {
  const byId = new Map(flights.map(f => [f.id, f]))
  const consumed = new Set<string>()
  const entries: FlightEntry[] = []
  for (const f of flights) {
    if (consumed.has(f.id)) continue
    const ret = byId.get(`${f.id}R`)
    if (ret && !consumed.has(ret.id) && ret.origin_code === f.dest_code && ret.dest_code === f.origin_code) {
      consumed.add(f.id); consumed.add(ret.id)
      entries.push({ kind: 'round', outbound: f, ret })
      continue
    }
    // A return leg whose outbound is present will be paired when we reach the outbound.
    if (f.id.endsWith('R')) {
      const ob = byId.get(f.id.slice(0, -1))
      if (ob && ob.dest_code === f.origin_code && ob.origin_code === f.dest_code) continue
    }
    consumed.add(f.id)
    entries.push({ kind: 'oneway', flight: f })
  }
  return entries
}

// ─── Trip card ─────────────────────────────────────────────────────────────────

function FlightCard({
  flight,
  onCTA,
  waitlisted,
  onWaitlist,
  roster,
  names,
}: {
  flight: DisplayFlight
  onCTA: () => void
  waitlisted: boolean
  onWaitlist: () => void
  roster?: RosterEntry[]
  names: Record<string, string>
}) {
  const dp = fmtDate(flight.date)
  const colors = getFlightColors()

  return (
    <div
      className="trip-card"
      style={{ marginBottom: 12 }}
      onClick={onCTA}
    >
      <div className="trip-card__main">
        <div className="trip-card__date">
          <div className="trip-card__date-mo">{dp.mo}</div>
          <div className="trip-card__date-day">{dp.day}</div>
          <div className="trip-card__date-dow">{dp.dow}</div>
        </div>
        <div
          className="trip-card__icon"
          style={{ background: colors.bg, borderRight: '1px solid var(--hair)' }}
        >
          <span style={{ color: colors.dot }}>{KIND_ICONS['flight']}</span>
        </div>
        <div className="trip-card__content">
          <div className="trip-card__title" style={{ color: colors.accent }}>FLIGHT · PRIVATE AVIATION</div>
          <div className="trip-card__name">
            {placeName(flight.origin_code, names)}
            <span style={{ color: 'var(--ink-faint)', margin: '0 6px', fontSize: 14 }}>→</span>
            {placeName(flight.dest_code, names)}
          </div>
          <div className="trip-card__meta">
            {flight.departTimeStr}
            {flight.durationStr ? ` · ${flight.durationStr}` : ''}
          </div>
          <SeatMeter total={flight.seats_total} available={flight.seatsAvailable} accent={colors.dot} unit="seats" />
          <div onClick={e => e.stopPropagation()}><RosterStack entries={roster ?? []} occupied={flight.seats_total - flight.seatsAvailable} /></div>
        </div>
        <img className="trip-card__img" src={flight.image_url || '/trip-default.jpeg'} alt="" />
      </div>
      <div className="trip-card__cta">
        <span style={{ color: 'var(--ink-light)', fontSize: 12 }}>
          {flight.name || `${flight.origin_code}–${flight.dest_code}`}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="trip-card__price">{fmtMoney(flight.price_per_seat)}<span style={{ fontWeight: 400, fontSize: 11, color: 'var(--ink-light)' }}>/seat</span></span>
          <CtaButton available={flight.seatsAvailable} waitlisted={waitlisted} onBook={onCTA} onWaitlist={onWaitlist} label="Take seat →" accent={colors.dot} />
        </div>
      </div>
    </div>
  )
}

function RoundTripCard({
  outbound,
  ret,
  onCTA,
  waitlisted,
  onWaitlist,
  roster,
  names,
}: {
  outbound: DisplayFlight
  ret: DisplayFlight
  onCTA: () => void
  waitlisted: boolean
  onWaitlist: () => void
  roster?: RosterEntry[]
  names: Record<string, string>
}) {
  const dpOut = fmtDate(outbound.date)
  const dpRet = fmtDate(ret.date)
  const colors = getFlightColors()
  const seatsLeft = Math.min(outbound.seatsAvailable, ret.seatsAvailable)
  const combined = outbound.price_per_seat + ret.price_per_seat

  return (
    <div className="trip-card" style={{ marginBottom: 12 }} onClick={onCTA}>
      <div className="trip-card__main">
        <div className="trip-card__date">
          <div className="trip-card__date-mo">{dpOut.mo}</div>
          <div className="trip-card__date-day">{dpOut.day}</div>
          <div className="trip-card__date-dow">{dpOut.dow}</div>
        </div>
        <div className="trip-card__icon" style={{ background: colors.bg, borderRight: '1px solid var(--hair)' }}>
          <span style={{ color: colors.dot }}>{KIND_ICONS['flight']}</span>
        </div>
        <div className="trip-card__content">
          <div className="trip-card__title" style={{ color: colors.accent }}>FLIGHT · ROUND TRIP</div>
          <div className="trip-card__name">
            {placeName(outbound.origin_code, names)}
            <span style={{ color: 'var(--ink-faint)', margin: '0 6px', fontSize: 14 }}>⇄</span>
            {placeName(outbound.dest_code, names)}
          </div>
          <div className="trip-card__meta">
            Out {dpOut.mo} {dpOut.day} · {outbound.departTimeStr}
            <span style={{ color: 'var(--ink-faint)', margin: '0 6px' }}>|</span>
            Return {dpRet.mo} {dpRet.day} · {ret.departTimeStr}
          </div>
          <SeatMeter total={outbound.seats_total} available={seatsLeft} accent={colors.dot} unit="seats" />
          <div onClick={e => e.stopPropagation()}><RosterStack entries={roster ?? []} occupied={outbound.seats_total - seatsLeft} /></div>
        </div>
        <img className="trip-card__img" src={outbound.image_url || '/trip-default.jpeg'} alt="" />
      </div>
      <div className="trip-card__cta">
        <span style={{ color: 'var(--ink-light)', fontSize: 12 }}>
          {outbound.name || `${outbound.origin_code}–${outbound.dest_code}`} · round trip
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="trip-card__price">{fmtMoney(combined)}<span style={{ fontWeight: 400, fontSize: 11, color: 'var(--ink-light)' }}>/seat round trip</span></span>
          <CtaButton available={seatsLeft} waitlisted={waitlisted} onBook={onCTA} onWaitlist={onWaitlist} label="Take seat →" accent={colors.dot} />
        </div>
      </div>
    </div>
  )
}

function ExcursionCard({
  excursion,
  onCTA,
  waitlisted,
  onWaitlist,
  roster,
  names,
}: {
  excursion: DisplayExcursion
  onCTA: () => void
  waitlisted: boolean
  onWaitlist: () => void
  roster?: RosterEntry[]
  names: Record<string, string>
}) {
  const dp = fmtDate(excursion.date)
  const icon = excursion.templateMeta?.icon ?? 'fish'
  const colors = getExcursionColors(icon)
  const kindLabel = icon === 'golf' ? 'GOLF' : icon === 'quail' ? 'QUAIL HUNT' : icon === 'hog' ? 'HOG HUNT' : icon === 'fish' ? 'FISHING' : icon === 'snorkel' ? 'DIVING' : icon === 'sail' ? 'SAILING' : 'EXCURSION'

  return (
    <div
      className="trip-card"
      style={{ marginBottom: 12 }}
      onClick={onCTA}
    >
      <div className="trip-card__main">
        <div className="trip-card__date">
          <div className="trip-card__date-mo">{dp.mo}</div>
          <div className="trip-card__date-day">{dp.day}</div>
          <div className="trip-card__date-dow">{dp.dow}</div>
        </div>
        <div
          className="trip-card__icon"
          style={{ background: colors.bg, borderRight: '1px solid var(--hair)' }}
        >
          <span style={{ color: colors.dot }}>{KIND_ICONS[icon] ?? KIND_ICONS['fish']}</span>
        </div>
        <div className="trip-card__content">
          <div className="trip-card__title" style={{ color: colors.accent }}>{kindLabel} · FROM {placeName(excursion.origin_code, names).toUpperCase()}</div>
          <div className="trip-card__name">{excursion.name}</div>
          <div className="trip-card__meta">
            {excursion.startTimeStr !== '—' ? excursion.startTimeStr : ''}
            {excursion.templateMeta?.operator ? ` · ${excursion.templateMeta.operator}` : ''}
          </div>
          <SeatMeter total={excursion.spots_total} available={excursion.spotsAvailable} accent={colors.dot} unit="spots" />
          <div onClick={e => e.stopPropagation()}><RosterStack entries={roster ?? []} occupied={excursion.spots_total - excursion.spotsAvailable} /></div>
        </div>
        <img className="trip-card__img" src={excursion.image_url || '/trip-default.jpeg'} alt="" />
      </div>
      <div className="trip-card__cta">
        <span style={{ color: 'var(--ink-light)', fontSize: 12 }}>
          {excursion.stay_type === 'day_trip' ? 'Day trip' : excursion.stay_type === 'overnight' ? 'Overnight' : 'Multi-night'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {(excursion.price_per_pax || excursion.templateMeta?.price_per_pax) ? (
            <span className="trip-card__price">{fmtMoney(excursion.price_per_pax || excursion.templateMeta?.price_per_pax || 0)}<span style={{ fontWeight: 400, fontSize: 11, color: 'var(--ink-light)' }}>/person</span></span>
          ) : null}
          <CtaButton available={excursion.spotsAvailable} waitlisted={waitlisted} onBook={onCTA} onWaitlist={onWaitlist} label="Reserve spot →" accent={colors.dot} />
        </div>
      </div>
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function SeatsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [flights, setFlights] = useState<DisplayFlight[]>([])
  const [excursions, setExcursions] = useState<DisplayExcursion[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<ActivityFilter>('all')
  const [waitlisted, setWaitlisted] = useState<Set<string>>(new Set())
  const [memberId, setMemberId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [flightRosters, setFlightRosters] = useState<Record<string, RosterEntry[]>>({})
  const [excRosters, setExcRosters] = useState<Record<string, RosterEntry[]>>({})
  const [airportName, setAirportName] = useState<Record<string, string>>({})

  const load = useCallback(async (silent = false) => {
      if (!silent) setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: member } = await supabase
        .from('members')
        .select('id')
        .eq('user_id', user.id)
        .single()

      const memberId = member?.id
      setMemberId(memberId ?? null)

      const [
        { data: rawFlights },
        { data: rawExcursions },
        { data: rawTemplates },
        { data: rawBookings },
        { data: rawAirports },
      ] = await Promise.all([
        supabase
          .from('flights')
          .select('*')
          .in('status', ['open'])
          .order('date'),
        supabase
          .from('excursions')
          .select('*')
          .in('status', ['open'])
          .order('date'),
        supabase.from('excursion_templates').select('*'),
        // Only the viewer's own active bookings (all RLS allows). The cabin-wide
        // taken count comes from flights.seats_taken / excursions.spots_taken.
        memberId
          ? supabase
              .from('bookings')
              .select('*')
              .eq('member_id', memberId)
              .in('status', ['pending', 'approved'])
          : Promise.resolve({ data: [] }),
        supabase.from('airports').select('code, name'),
      ])

      const am: Record<string, string> = {}
      for (const a of (rawAirports ?? []) as { code: string; name: string }[]) am[a.code] = a.name
      setAirportName(am)

      const templates: ExcursionTemplate[] = rawTemplates ?? []
      const bookings: Booking[] = (rawBookings as Booking[] | null) ?? []

      const myFlightSeats: Record<string, number> = {}
      const myExcSpots: Record<string, number> = {}
      for (const b of bookings) {
        if (b.item_kind === 'flight') myFlightSeats[b.item_id] = (myFlightSeats[b.item_id] ?? 0) + b.seats
        else myExcSpots[b.item_id] = (myExcSpots[b.item_id] ?? 0) + b.seats
      }

      const adaptedFlights: DisplayFlight[] = (rawFlights ?? []).map(f =>
        adaptFlight(f as Flight, myFlightSeats[f.id] ?? 0, memberId)
      )

      const adaptedExcursions: DisplayExcursion[] = (rawExcursions ?? []).map(e =>
        adaptExcursion(e as Excursion, templates, myExcSpots[e.id] ?? 0, memberId)
      )

      // What this member is already waitlisted for
      if (memberId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: wl } = await (supabase as any).from('waitlist').select('item_id').eq('member_id', memberId)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setWaitlisted(new Set((wl ?? []).map((w: any) => w.item_id)))
      }

      // Public rosters (opted-in members) for the FOMO avatar stacks.
      const [fRosters, eRosters] = await Promise.all([
        fetchRosters(supabase, 'flight', (rawFlights ?? []).map(f => f.id)),
        fetchRosters(supabase, 'excursion', (rawExcursions ?? []).map(e => e.id)),
      ])
      setFlightRosters(fRosters)
      setExcRosters(eRosters)

      setFlights(adaptedFlights)
      setExcursions(adaptedExcursions)
      setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load()

    // Live seat counts: the booking trigger writes seats_taken/spots_taken onto
    // the flight/excursion rows (which members can read), so subscribing to those
    // tables surfaces other members' bookings without exposing who booked.
    const channel = supabase
      .channel('seats-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'flights' }, () => load(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'excursions' }, () => load(true))
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [load]) // eslint-disable-line react-hooks/exhaustive-deps

  async function joinWaitlist(itemKind: 'flight' | 'excursion', itemId: string) {
    if (!memberId) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('waitlist').insert({ member_id: memberId, item_kind: itemKind, item_id: itemId })
    // 23505 = already on the list — treat as success
    if (!error || error.code === '23505') {
      setWaitlisted(prev => new Set(prev).add(itemId))
      setToast('Added to the waitlist — Ops will offer the next open seat.')
    } else {
      setToast(error.message ?? 'Could not join waitlist.')
    }
    setTimeout(() => setToast(null), 3500)
  }

  // Apply filter
  const flightEntries = buildFlightEntries(flights)
  const visibleFlightEntries = (filter === 'all' || filter === 'flight') ? flightEntries : []
  const visibleExcursions = excursions.filter(e => {
    if (filter === 'all') return true
    if (filter === 'flight') return false
    const icon = e.templateMeta?.icon ?? 'fish'
    return excursionFilter(icon) === filter
  })

  const totalOpen = visibleFlightEntries.length + visibleExcursions.length

  return (
    <div className="page">
      {toast && <div className="toast success">{toast}</div>}
      <PageHero
        eyebrow="DEPARTURES BOARD"
        title="Open seats & spots."
        sub={loading ? 'Loading available departures…' : `${totalOpen} departure${totalOpen !== 1 ? 's' : ''} with open availability`}
      />

      <div className="page-view" style={{ maxWidth: 716 }}>
        {/* Filter bar */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          {FILTERS.map(f => (
            <button
              key={f.key}
              className={`chip${filter === f.key ? ' active' : ''}`}
              onClick={() => setFilter(f.key)}
              style={{ height: 32, padding: '0 14px' }}
            >
              {f.icon && (
                <span style={{
                  color: filter === f.key ? undefined : (
                    f.icon === 'flight' ? 'var(--tropic)' :
                    f.icon === 'fish' ? 'var(--sun-d)' :
                    f.icon === 'golf' ? 'var(--moss)' :
                    'var(--signal)'
                  ),
                  display: 'flex',
                  alignItems: 'center',
                }}>
                  {KIND_ICONS[f.icon]}
                </span>
              )}
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="empty">
            <div className="pending-indicator" />
            <p>Loading open seats…</p>
          </div>
        ) : totalOpen === 0 ? (
          <div className="empty">
            <svg width="40" height="40" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <path d="M5 11h12M5 11a3 3 0 0 1 0-6h12a3 3 0 0 1 0 6M5 11v6h12v-6M9 17v3M13 17v3"/>
            </svg>
            <h3>No open seats right now</h3>
            <p>All current departures are full or no trips match your filter. Check back soon.</p>
          </div>
        ) : (
          <>
            {/* Open Flights */}
            {visibleFlightEntries.length > 0 && (
              <section style={{ marginBottom: 32 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <span style={{ color: 'var(--tropic)', display: 'flex', alignItems: 'center' }}>{KIND_ICONS['flight']}</span>
                  <p className="mono" style={{ margin: 0 }}>OPEN FLIGHTS · {visibleFlightEntries.length}</p>
                </div>
                <div className="panel" style={{ overflow: 'visible', background: 'transparent', border: 'none', padding: 0 }}>
                  {visibleFlightEntries.map(entry => entry.kind === 'round' ? (
                    <RoundTripCard
                      key={entry.outbound.id}
                      outbound={entry.outbound}
                      ret={entry.ret}
                      onCTA={() => router.push(`/reserve/${entry.outbound.id}?kind=flight&return=${entry.ret.id}`)}
                      waitlisted={waitlisted.has(entry.outbound.id)}
                      onWaitlist={() => joinWaitlist('flight', entry.outbound.id)}
                      roster={flightRosters[entry.outbound.id]}
                      names={airportName}
                    />
                  ) : (
                    <FlightCard
                      key={entry.flight.id}
                      flight={entry.flight}
                      onCTA={() => router.push(`/reserve/${entry.flight.id}?kind=flight`)}
                      waitlisted={waitlisted.has(entry.flight.id)}
                      onWaitlist={() => joinWaitlist('flight', entry.flight.id)}
                      roster={flightRosters[entry.flight.id]}
                      names={airportName}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Open Excursions */}
            {visibleExcursions.length > 0 && (
              <section style={{ marginBottom: 32 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <span style={{ color: 'var(--sun)', display: 'flex', alignItems: 'center' }}>{KIND_ICONS['fish']}</span>
                  <p className="mono" style={{ margin: 0 }}>OPEN EXCURSIONS · {visibleExcursions.length}</p>
                </div>
                <div style={{ background: 'transparent', border: 'none', padding: 0 }}>
                  {visibleExcursions.map(excursion => (
                    <ExcursionCard
                      key={excursion.id}
                      excursion={excursion}
                      onCTA={() => router.push(`/reserve/${excursion.id}?kind=excursion`)}
                      waitlisted={waitlisted.has(excursion.id)}
                      onWaitlist={() => joinWaitlist('excursion', excursion.id)}
                      roster={excRosters[excursion.id]}
                      names={airportName}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
