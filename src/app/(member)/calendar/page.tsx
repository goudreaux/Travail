'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { adaptFlight, adaptExcursion, fmtDate, fmtTime, fmtMoney, MONTHS, MONTHS_SHORT, DOWS_SHORT } from '@/lib/data'
import { KIND_ICONS } from '@/lib/icons'
import PageHero from '@/components/PageHero'
import type { Flight, Excursion, ExcursionTemplate, Booking } from '@/lib/supabase/types'
import type { DisplayFlight, DisplayExcursion } from '@/lib/data'

// ─── Color logic ──────────────────────────────────────────────────────────────

function getTripColor(kind: string): { dot: string; bg: string } {
  if (kind === 'flight') return { dot: 'var(--tropic)', bg: 'var(--tropic-glow)' }
  if (kind === 'fish' || kind === 'snorkel' || kind === 'sail' || kind === 'wave') return { dot: 'var(--sun)', bg: 'var(--sun-glow)' }
  if (kind === 'golf') return { dot: 'var(--moss)', bg: 'rgba(62,140,109,0.12)' }
  if (kind === 'quail' || kind === 'hog') return { dot: 'var(--signal)', bg: 'rgba(217,78,42,0.10)' }
  return { dot: 'var(--sun)', bg: 'var(--sun-glow)' }
}

function getExcursionKind(e: DisplayExcursion): string {
  return e.templateMeta?.icon ?? 'fish'
}

// ─── Calendar helpers ─────────────────────────────────────────────────────────

function calendarMonths(start: Date, count: number): { year: number; month: number }[] {
  const months: { year: number; month: number }[] = []
  for (let i = 0; i < count; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1)
    months.push({ year: d.getFullYear(), month: d.getMonth() })
  }
  return months
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function firstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalTrip {
  id: string
  kind: 'flight' | 'excursion'
  name: string
  date: string
  icon: string
  meta: string
  color: { dot: string; bg: string }
  isBooked: boolean
  flight?: DisplayFlight
  excursion?: DisplayExcursion
}

export default function CalendarPage() {
  const router = useRouter()
  const supabase = createClient()

  const [flights, setFlights] = useState<DisplayFlight[]>([])
  const [excursions, setExcursions] = useState<DisplayExcursion[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const today = new Date()
  const todayIso = isoDate(today.getFullYear(), today.getMonth(), today.getDate())
  const months = calendarMonths(today, 6)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: member } = await supabase
        .from('members')
        .select('id')
        .eq('user_id', user.id)
        .single()

      if (!member) return

      const sixMonthsOut = new Date(today.getFullYear(), today.getMonth() + 6, 0)
      const dateLimit = sixMonthsOut.toISOString().split('T')[0]
      const dateStart = todayIso

      const [
        { data: rawFlights },
        { data: rawExcursions },
        { data: rawTemplates },
        { data: rawBookings },
      ] = await Promise.all([
        supabase
          .from('flights')
          .select('*')
          .in('status', ['open', 'full', 'departed'])
          .gte('date', dateStart)
          .lte('date', dateLimit)
          .order('date'),
        supabase
          .from('excursions')
          .select('*')
          .in('status', ['open', 'full', 'completed'])
          .gte('date', dateStart)
          .lte('date', dateLimit)
          .order('date'),
        supabase.from('excursion_templates').select('*'),
        supabase
          .from('bookings')
          .select('*')
          .eq('member_id', member.id)
          .in('status', ['pending', 'approved']),
      ])

      const templates: ExcursionTemplate[] = rawTemplates ?? []
      const bookings: Booking[] = rawBookings ?? []

      // Build booked item ids for the member
      const bookedFlightIds = new Set(
        bookings.filter(b => b.item_kind === 'flight').map(b => b.item_id)
      )
      const bookedExcursionIds = new Set(
        bookings.filter(b => b.item_kind === 'excursion').map(b => b.item_id)
      )

      const myFlightSeats: Record<string, number> = {}
      const myExcSpots: Record<string, number> = {}
      for (const b of bookings) {
        if (b.item_kind === 'flight') myFlightSeats[b.item_id] = (myFlightSeats[b.item_id] ?? 0) + b.seats
        else myExcSpots[b.item_id] = (myExcSpots[b.item_id] ?? 0) + b.seats
      }

      const adaptedFlights: DisplayFlight[] = (rawFlights ?? []).map(f =>
        adaptFlight(f as Flight, myFlightSeats[f.id] ?? 0, member.id)
      )

      const adaptedExcursions: DisplayExcursion[] = (rawExcursions ?? []).map(e =>
        adaptExcursion(e as Excursion, templates, myExcSpots[e.id] ?? 0, member.id)
      )

      setFlights(adaptedFlights)
      setExcursions(adaptedExcursions)
      setLoading(false)
    }

    load()
  }, [])

  // Build a map: date -> CalTrip[]
  const tripsByDate: Record<string, CalTrip[]> = {}

  flights.forEach(f => {
    const entry: CalTrip = {
      id: f.id,
      kind: 'flight',
      name: f.name,
      date: f.date,
      icon: 'flight',
      meta: `${f.origin_code} → ${f.dest_code} · ${f.departTimeStr} · ${fmtMoney(f.price_per_seat)}/seat`,
      color: getTripColor('flight'),
      isBooked: f.isBooked,
      flight: f,
    }
    if (!tripsByDate[f.date]) tripsByDate[f.date] = []
    tripsByDate[f.date].push(entry)
  })

  excursions.forEach(e => {
    const kind = getExcursionKind(e)
    const entry: CalTrip = {
      id: e.id,
      kind: 'excursion',
      name: e.name,
      date: e.date,
      icon: kind,
      meta: `${e.origin_code} · ${e.startTimeStr}${e.templateMeta ? ` · ${e.templateMeta.price_per_pax ? fmtMoney(e.templateMeta.price_per_pax) + '/person' : ''}` : ''}`,
      color: getTripColor(kind),
      isBooked: e.isBooked,
      excursion: e,
    }
    if (!tripsByDate[e.date]) tripsByDate[e.date] = []
    tripsByDate[e.date].push(entry)
  })

  const allTrips: CalTrip[] = [...Object.values(tripsByDate)].flat()
    .sort((a, b) => a.date.localeCompare(b.date))

  const selectedTrips = selectedDay ? (tripsByDate[selectedDay] ?? []) : []

  const totalFlights = flights.length
  const totalExcursions = excursions.length

  return (
    <div className="page">
      <PageHero
        eyebrow="FOUNDING SEASON · 6-MONTH HORIZON"
        title="Calendar"
        sub={`${totalFlights + totalExcursions} departures over the next 6 months${totalFlights > 0 ? ` · ${totalFlights} flight${totalFlights !== 1 ? 's' : ''}` : ''}${totalExcursions > 0 ? ` · ${totalExcursions} excursion${totalExcursions !== 1 ? 's' : ''}` : ''}`}
      />

      <div className="page-view">
        {loading ? (
          <div className="empty">
            <div className="pending-indicator" />
            <p>Loading calendar…</p>
          </div>
        ) : (
          <>
            {/* Responsive month grid (1-up on phones, 3-up on desktop) */}
            <div className="cal-months">
              {months.map(({ year, month }) => {
                const days = daysInMonth(year, month)
                const startDow = firstDayOfWeek(year, month)
                const cells: (number | null)[] = [
                  ...Array(startDow).fill(null),
                  ...Array.from({ length: days }, (_, i) => i + 1),
                ]

                return (
                  <div key={`${year}-${month}`} className="cal" style={{ background: 'var(--card)' }}>
                    <div className="cal-head">
                      <h3 style={{ fontFamily: 'var(--display)', fontWeight: 500, fontSize: 15 }}>
                        {MONTHS[month]} <span style={{ color: 'var(--ink-light)', fontSize: 13 }}>{year}</span>
                      </h3>
                    </div>
                    <div className="cal-grid">
                      <div className="cal-dow">
                        {DOWS_SHORT.map(d => (
                          <span key={d}>{d.slice(0, 1)}</span>
                        ))}
                      </div>
                      <div className="cal-cells">
                        {cells.map((day, idx) => {
                          if (day === null) {
                            return <div key={`empty-${idx}`} className="cal-cell empty" />
                          }
                          const dateStr = isoDate(year, month, day)
                          const tripsOnDay = tripsByDate[dateStr] ?? []
                          const isToday = dateStr === todayIso
                          const isSelected = dateStr === selectedDay
                          const hasTrips = tripsOnDay.length > 0
                          const tripColor = tripsOnDay[0]?.color.dot ?? 'var(--tropic)'
                          const anyBooked = tripsOnDay.some(t => t.isBooked)

                          return (
                            <div
                              key={dateStr}
                              className={`cal-cell${isToday ? ' today' : ''}${hasTrips ? ' has-trips' : ''}`}
                              style={{
                                outline: isSelected ? `2px solid ${tripColor}` : undefined,
                                outlineOffset: isSelected ? -2 : undefined,
                                cursor: hasTrips ? 'pointer' : 'default',
                              }}
                              onClick={() => {
                                if (hasTrips) setSelectedDay(isSelected ? null : dateStr)
                              }}
                            >
                              {hasTrips ? (
                                <span
                                  className="cal-day-badge"
                                  style={{
                                    background: tripColor,
                                    boxShadow: anyBooked ? `0 0 0 2px var(--card), 0 0 0 4px ${tripColor}` : undefined,
                                  }}
                                >
                                  {day}
                                  {tripsOnDay.length > 1 && (
                                    <span className="cal-count">{tripsOnDay.length}</span>
                                  )}
                                </span>
                              ) : (
                                <span style={{ fontSize: 12.5, lineHeight: 1, color: isToday ? 'var(--tropic-d)' : undefined, fontWeight: isToday ? 700 : undefined }}>{day}</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Day detail panel */}
            {selectedDay && selectedTrips.length > 0 && (
              <div
                className="panel"
                style={{ marginBottom: 24, animation: 'fade 0.2s ease' }}
              >
                <div className="panel-head">
                  <h3>
                    {(() => {
                      const p = fmtDate(selectedDay)
                      return p.full
                    })()}
                  </h3>
                  <button
                    className="btn-ghost"
                    style={{ height: 28, padding: '0 10px', fontSize: 12 }}
                    onClick={() => setSelectedDay(null)}
                  >
                    Close
                  </button>
                </div>
                <div style={{ padding: '8px 0' }}>
                  {selectedTrips.map(trip => (
                    <div
                      key={trip.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        padding: '12px 20px',
                        borderBottom: '1px solid var(--hair)',
                        cursor: 'pointer',
                        transition: 'background 0.12s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--warm)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}
                      onClick={() => router.push(`/reserve/${trip.id}?kind=${trip.kind}`)}
                    >
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 8,
                          background: trip.color.bg,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: trip.color.dot,
                          flexShrink: 0,
                        }}
                      >
                        {KIND_ICONS[trip.icon] ?? KIND_ICONS['fish']}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 2 }}>
                          {trip.name}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--ink-light)' }}>{trip.meta}</div>
                      </div>
                      {trip.isBooked && (
                        <span className="pill tropic">Booked</span>
                      )}
                      <span
                        style={{
                          fontSize: 12,
                          color: trip.color.dot,
                          fontWeight: 600,
                          fontFamily: 'var(--mono)',
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {trip.kind === 'flight' ? 'View flight →' : 'View trip →'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Full chronological trip list */}
            <div style={{ marginBottom: 12 }}>
              <p className="mono" style={{ marginBottom: 12 }}>ALL UPCOMING TRIPS</p>
            </div>

            {allTrips.length === 0 ? (
              <div className="empty">
                <svg width="40" height="40" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><rect x="4" y="5" width="14" height="13" rx="1.5"/><line x1="4" y1="9" x2="18" y2="9"/><line x1="8" y1="3" x2="8" y2="6"/><line x1="14" y1="3" x2="14" y2="6"/></svg>
                <h3>No trips scheduled</h3>
                <p>Check back soon — new flights and excursions are added regularly.</p>
              </div>
            ) : (
              <div className="flights">
                {allTrips.map(trip => {
                  const dp = fmtDate(trip.date)
                  return (
                    <div
                      key={`${trip.kind}-${trip.id}`}
                      className="flight"
                      style={{ borderLeft: `3px solid ${trip.color.dot}` }}
                      onClick={() => router.push(`/reserve/${trip.id}?kind=${trip.kind}`)}
                    >
                      <div className="date">
                        <span className="mo">{dp.mo}</span>
                        <span className="day">{dp.day}</span>
                        <span className="dow">{dp.dow}</span>
                      </div>
                      <div
                        style={{
                          width: 44,
                          flexShrink: 0,
                          background: trip.color.bg,
                          borderRight: '1px solid var(--hair)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: trip.color.dot,
                        }}
                      >
                        {KIND_ICONS[trip.icon] ?? KIND_ICONS['fish']}
                      </div>
                      <div className="body">
                        <div className="route">
                          {trip.kind === 'flight' && trip.flight ? (
                            <>
                              <span>{trip.flight.origin_code}</span>
                              <span className="arrow">→</span>
                              <span>{trip.flight.dest_code}</span>
                            </>
                          ) : (
                            <span style={{ fontFamily: 'var(--display)', fontSize: 16 }}>{trip.name}</span>
                          )}
                        </div>
                        <div className="meta">
                          {trip.kind === 'flight' && trip.flight ? (
                            <>
                              <span>{trip.flight.departTimeStr}</span>
                              <span>·</span>
                              <span>{trip.flight.durationStr}</span>
                              <span>·</span>
                              <span>{fmtMoney(trip.flight.price_per_seat)}/seat</span>
                              {trip.flight.seatsAvailable > 0 && (
                                <>
                                  <span>·</span>
                                  <span style={{ color: 'var(--moss)' }}>{trip.flight.seatsAvailable} open</span>
                                </>
                              )}
                            </>
                          ) : trip.excursion ? (
                            <>
                              <span>{trip.excursion.origin_code}</span>
                              <span>·</span>
                              <span>{trip.excursion.startTimeStr}</span>
                              {trip.excursion.spotsAvailable > 0 && (
                                <>
                                  <span>·</span>
                                  <span style={{ color: 'var(--moss)' }}>{trip.excursion.spotsAvailable} spots</span>
                                </>
                              )}
                            </>
                          ) : null}
                        </div>
                      </div>
                      <div className="seats" style={{ justifyContent: 'center', gap: 6, padding: '12px 16px' }}>
                        {trip.isBooked && <span className="pill tropic" style={{ fontSize: 10 }}>Booked</span>}
                        <span
                          style={{
                            fontSize: 11,
                            color: 'var(--ink-light)',
                            fontFamily: 'var(--mono)',
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                          }}
                        >
                          {trip.kind === 'flight' ? 'Flight' : (trip.excursion?.templateMeta?.name ? trip.excursion.templateMeta.name.split(' ').slice(0, 2).join(' ') : 'Excursion')}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
