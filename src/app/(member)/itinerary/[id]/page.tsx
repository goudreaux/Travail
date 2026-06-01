'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { fmtDate, fmtDur, fmtMoney, fmtTime, airportCity } from '@/lib/data'
import { asItinerary, fmtItineraryTime, generateDefaultItinerary, type ItineraryStep } from '@/lib/itinerary'
import { KIND_ICONS } from '@/lib/icons'
import { fetchRosters, type RosterEntry } from '@/components/Roster'
import type { Member, Booking, Flight, Excursion, ExcursionTemplate } from '@/lib/supabase/types'

// Read-only itinerary for a booked trip. Opened by tapping a trip card in
// My Trips (dashboard) or /bookings. Shows the relevant trip details — route,
// times, day plan, who's going — plus a compact booking summary. The boarding
// pass is a separate button (this page is the "what is this trip" view, the
// boarding pass is the "get me on the plane" view).

function addMins(t: string | null, mins: number): string {
  if (!t) return '—'
  const m = t.trim().match(/^(\d{1,2}):(\d{2})/)
  if (!m) return '—'
  const total = ((parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + mins) % 1440 + 1440) % 1440
  const hh = Math.floor(total / 60); const mm = total % 60
  const ampm = hh >= 12 ? 'PM' : 'AM'; const h12 = hh % 12 || 12
  return `${h12}:${String(mm).padStart(2, '0')} ${ampm}`
}

function Endpoint({ code, names }: { code: string; names: Record<string, string> }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 0, flex: 1 }}>
      <div style={{ fontFamily: 'var(--ui)', fontSize: 22, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.1, letterSpacing: '-0.02em' }}>{airportCity(code, names)}</div>
    </div>
  )
}

function FlightLeg({ label, f, names }: { label?: string; f: Flight; names: Record<string, string> }) {
  const dp = fmtDate(f.date)
  return (
    <div>
      {label && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tropic-d)', letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 12, fontWeight: 600 }}>{label}</div>
      )}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <Endpoint code={f.origin_code} names={names} />
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <div style={{ color: 'var(--tropic-d)', fontSize: 22, fontWeight: 500 }}>→</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--ink-light)', letterSpacing: '0.12em' }}>{fmtDur(f.duration_mins)}</div>
        </div>
        <Endpoint code={f.dest_code} names={names} />
      </div>
      <div style={{ display: 'flex', gap: 18, marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--hair-2)', flexWrap: 'wrap' }}>
        {[
          { label: 'Date', value: `${dp.dow} ${dp.mo} ${dp.day}` },
          { label: 'Departs', value: fmtTime(f.depart_time) },
          { label: 'Arrives', value: addMins(f.depart_time, f.duration_mins) },
          { label: 'Block', value: fmtDur(f.duration_mins) },
          { label: 'Operator', value: 'Travail Concierge' },
          { label: 'Aircraft', value: f.aircraft_id },
        ].map(({ label, value }) => (
          <div key={label}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--ink-light)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 3, fontWeight: 600 }}>{label}</div>
            <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function ItineraryPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const bookingId = params.id as string

  const [member, setMember] = useState<Member | null>(null)
  const [booking, setBooking] = useState<Booking | null>(null)
  const [flight, setFlight] = useState<Flight | null>(null)
  const [returnFlight, setReturnFlight] = useState<Flight | null>(null)
  const [excursion, setExcursion] = useState<Excursion | null>(null)
  const [template, setTemplate] = useState<ExcursionTemplate | null>(null)
  const [airportNames, setAirportNames] = useState<Record<string, string>>({})
  const [roster, setRoster] = useState<RosterEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: m } = await supabase.from('members').select('*').eq('user_id', user.id).single()
      if (!m) { router.push('/login'); return }
      setMember(m as Member)

      const { data: bk } = await supabase.from('bookings').select('*').eq('id', bookingId).single()
      if (!bk) { setNotFound(true); setLoading(false); return }
      setBooking(bk as Booking)
      const b = bk as Booking
      const kind = b.item_kind as 'flight' | 'excursion'

      const { data: airportData } = await supabase.from('airports').select('code, name')
      const am: Record<string, string> = {}
      for (const a of (airportData ?? [])) am[(a as { code: string }).code] = (a as { name: string }).name
      setAirportNames(am)

      if (kind === 'flight') {
        const { data: f } = await supabase.from('flights').select('*').eq('id', b.item_id).single()
        if (!f) { setNotFound(true); setLoading(false); return }
        setFlight(f as Flight)
        // Round-trip return leg = outbound id + 'R' (see lib/data returnLegIds).
        const retId = `${(f as Flight).id}R`
        const { data: ret } = await supabase.from('flights').select('*').eq('id', retId).maybeSingle()
        if (ret) setReturnFlight(ret as Flight)
      } else {
        const [{ data: exc }, { data: templates }] = await Promise.all([
          supabase.from('excursions').select('*').eq('id', b.item_id).single(),
          supabase.from('excursion_templates').select('*'),
        ])
        if (!exc) { setNotFound(true); setLoading(false); return }
        setExcursion(exc as Excursion)
        const tpl = (templates ?? []).find((t: ExcursionTemplate) => t.id === (exc as Excursion).template_id)
        if (tpl) setTemplate(tpl as ExcursionTemplate)
      }

      const rosters = await fetchRosters(supabase, kind, [b.item_id])
      setRoster(rosters[b.item_id] ?? [])
      setLoading(false)
    }
    load()
  }, [bookingId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="page"><div className="page-view" style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
        <div className="empty"><div className="pending-indicator" /><p>Loading itinerary…</p></div>
      </div></div>
    )
  }

  if (notFound || !booking) {
    return (
      <div className="page"><div className="page-view"><div className="empty">
        <h3>Trip not found.</h3>
        <p>This reservation no longer exists.</p>
        <Link href="/bookings" className="btn-ghost" style={{ marginTop: 8 }}>Back to my trips</Link>
      </div></div></div>
    )
  }

  const kind = booking.item_kind as 'flight' | 'excursion'
  const isRound = !!(flight && returnFlight)
  const trip = flight ?? excursion
  const dp = trip ? fmtDate(trip.date) : null
  const itemName = flight
    ? `${airportCity(flight.origin_code, airportNames)} ${isRound ? '⇄' : '→'} ${airportCity(flight.dest_code, airportNames)}`
    : excursion?.name ?? 'Trip'
  const heroSrc = (kind === 'flight' ? flight?.image_url : excursion?.image_url) || '/trip-default.jpeg'

  const statusTone: Record<string, string> = {
    approved: 'moss', pending: 'sun', declined: 'signal', cancelled: 'signal', refunded: 'sun',
  }

  return (
    <div className="page">
      <div className="page-view">
        <div className="builder">
          <div className="builder-form">
            {/* Hero */}
            <div className="reserve-hero">
              <img src={heroSrc} alt="" loading="eager" decoding="async" />
              <button type="button" className="reserve-hero__back" aria-label="Back" onClick={() => router.push('/bookings')}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
                </svg>
              </button>
            </div>

            <div className="reserve-sheet">
              {/* Header */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span className="mono" style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-light)' }}>
                    {kind === 'flight' ? 'Flight' : 'Excursion'}{isRound ? ' · round trip' : ''}
                  </span>
                  <span className={`pill ${statusTone[booking.status] ?? 'sun'}`} style={{ fontSize: 9, height: 18 }}>{booking.status}</span>
                </div>
                <h1 style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 32, fontWeight: 500, letterSpacing: '-0.015em', lineHeight: 1.05, color: 'var(--ink)', margin: 0 }}>
                  {itemName}
                </h1>
                {dp && (
                  <p style={{ fontSize: 13, color: 'var(--ink-light)', margin: '6px 0 0' }}>
                    {dp.dow}, {dp.mo} {dp.day}{template?.operator ? ` · ${template.operator}` : kind === 'flight' ? ' · Hosted by Travail Concierge' : ''}
                  </p>
                )}
              </div>

              {/* Booking summary */}
              <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 12, padding: '14px 16px', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                {[
                  { label: kind === 'flight' ? 'Seats' : 'Spots', value: String(booking.seats) },
                  ...(booking.confirmation_code ? [{ label: 'Confirmation', value: booking.confirmation_code }] : []),
                  { label: 'Total', value: fmtMoney(booking.total ?? 0) },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--ink-light)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 3, fontWeight: 600 }}>{label}</div>
                    <div style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 700, letterSpacing: label === 'Confirmation' ? '0.08em' : undefined }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Itinerary */}
              <div>
                <div className="field-lab" style={{ marginBottom: 10 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-light)', fontWeight: 600 }}>Itinerary</span>
                </div>
                <div className="reserve-card">
                  {kind === 'flight' && flight ? (
                    isRound && returnFlight ? (
                      <>
                        <FlightLeg label="Outbound" f={flight} names={airportNames} />
                        <div style={{ height: 1, background: 'var(--hair-2)', margin: '16px 0' }} />
                        <FlightLeg label="Return" f={returnFlight} names={airportNames} />
                      </>
                    ) : (
                      <FlightLeg f={flight} names={airportNames} />
                    )
                  ) : excursion ? (
                    <>
                      <div style={{ fontFamily: 'var(--ui)', fontSize: 22, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.1, letterSpacing: '-0.02em', marginBottom: 6 }}>{excursion.name}</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-light)', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600 }}>
                        From {airportCity(excursion.origin_code, airportNames)} · {excursion.stay_type.replace('_', ' ')}
                      </div>
                      <div style={{ display: 'flex', gap: 20, marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--hair-2)', flexWrap: 'wrap' }}>
                        {[
                          { label: 'Date', value: dp ? `${dp.dow} ${dp.mo} ${dp.day}` : '—' },
                          { label: 'Departs', value: fmtTime(excursion.depart_time ?? excursion.start_time) },
                          { label: 'Operator', value: template?.operator ?? 'Travail Concierge' },
                        ].map(({ label, value }) => (
                          <div key={label}>
                            <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--ink-light)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 3, fontWeight: 600 }}>{label}</div>
                            <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}>{value}</div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : null}
                </div>
              </div>

              {/* Day plan — excursions */}
              {kind === 'excursion' && excursion && (() => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const stored = asItinerary((excursion as any).itinerary)
                const steps: ItineraryStep[] = stored.length > 0 ? stored : generateDefaultItinerary({
                  originCode: excursion.origin_code,
                  destCode: template?.dest_code ?? null,
                  destName: template?.dest_code ? airportCity(template.dest_code, airportNames) : null,
                  departTime: excursion.depart_time,
                  arriveTime: excursion.arrive_time,
                  startTime: excursion.start_time,
                  returnTime: excursion.return_time,
                  operator: template?.operator ?? null,
                })
                if (steps.length === 0) return null
                return (
                  <div>
                    <div className="field-lab" style={{ marginBottom: 10 }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-light)', fontWeight: 600 }}>Day plan</span>
                    </div>
                    <ol className="dayplan">
                      {steps.map((s, i) => (
                        <li key={i} className="dayplan__step" style={{ animationDelay: `${i * 90}ms` }}>
                          <span className="dayplan__rail" aria-hidden />
                          <span className="dayplan__dot" aria-hidden>{s.icon && KIND_ICONS[s.icon] ? KIND_ICONS[s.icon] : <span className="dayplan__num">{i + 1}</span>}</span>
                          <div className="dayplan__body">
                            <div className="dayplan__time">{s.time ? fmtItineraryTime(s.time) : <span className="dayplan__tbd">TBD</span>}</div>
                            <div className="dayplan__label">{s.label}</div>
                            {s.sub && <div className="dayplan__sub">{s.sub}</div>}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                )
              })()}

              {/* Who's going */}
              {roster.length > 0 && (
                <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 14, padding: '16px 18px' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-light)', fontWeight: 600, marginBottom: 10 }}>Who&rsquo;s going</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {roster.map(e => (
                      <Link key={e.member_id} href={`/network/${e.member_id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'var(--warm)', borderRadius: 20, padding: '3px 12px 3px 8px', textDecoration: 'none' }}>
                        <span style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 500 }}>{e.name}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions — boarding pass is its own button */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
                <button
                  className="btn-primary"
                  style={{ width: '100%', height: 48, fontSize: 15, justifyContent: 'center' }}
                  onClick={() => router.push(`/boarding-pass/${booking.id}`)}
                >
                  View boarding pass →
                </button>
                <button className="btn-ghost" style={{ width: '100%' }} onClick={() => router.push(`/trip/${booking.id}`)}>
                  Message the Concierge Team about this trip
                </button>
              </div>
              <div className="reserve-page-pad" aria-hidden />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
