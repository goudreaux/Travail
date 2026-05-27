'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { fmtDate, fmtTime, fmtDur, fmtMoney, airportCity, airportSub } from '@/lib/data'
import { fetchRosters, CoPassengerList, type RosterEntry } from '@/components/Roster'
import type { Member, Booking, Flight, Excursion, ExcursionTemplate } from '@/lib/supabase/types'

type Passenger = {
  id: string
  is_host: boolean
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
}

function Barcode({ value }: { value: string }) {
  const bars = Array.from(value).flatMap((ch, i) => {
    const n = ch.charCodeAt(0)
    return [0, 1, 2, 3].map(j => ({ key: `${i}-${j}`, w: ((n >> j) & 1) ? 3 : 1.5 }))
  })
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1.5, height: 46 }}>
      {bars.map(b => <div key={b.key} style={{ width: b.w, height: '100%', background: 'var(--ink)' }} />)}
    </div>
  )
}

export default function BoardingPassPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const bookingId = params.id as string

  const [member, setMember] = useState<Member | null>(null)
  const [booking, setBooking] = useState<Booking | null>(null)
  const [flight, setFlight] = useState<Flight | null>(null)
  const [excursion, setExcursion] = useState<Excursion | null>(null)
  const [template, setTemplate] = useState<ExcursionTemplate | null>(null)
  const [passengers, setPassengers] = useState<Passenger[]>([])
  const [roster, setRoster] = useState<RosterEntry[]>([])
  const [airportNames, setAirportNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [cancelRequested, setCancelRequested] = useState(false)

  async function requestCancel() {
    if (!member || !booking) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    // Surface it in the Ops Queue; ops follows up by text/phone.
    const { error } = await db.from('cancellation_requests').insert({ booking_id: booking.id, member_id: member.id })
    if (error && error.code !== '23505') return
    setCancelRequested(true)
  }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: m } = await supabase.from('members').select('*').eq('user_id', user.id).single()
      if (m) setMember(m as Member)

      const { data: b } = await supabase.from('bookings').select('*').eq('id', bookingId).single()
      if (!b) { setNotFound(true); setLoading(false); return }
      const bk = b as Booking
      setBooking(bk)

      if (bk.item_kind === 'flight') {
        const { data: f } = await supabase.from('flights').select('*').eq('id', bk.item_id).single()
        if (f) setFlight(f as Flight)
      } else {
        const { data: e } = await supabase.from('excursions').select('*').eq('id', bk.item_id).single()
        if (e) {
          const exc = e as Excursion
          setExcursion(exc)
          if (exc.template_id) {
            const { data: t } = await supabase.from('excursion_templates').select('*').eq('id', exc.template_id).single()
            if (t) setTemplate(t as ExcursionTemplate)
          }
        }
      }

      const { data: pax } = await db.from('booking_passengers').select('*').eq('booking_id', bookingId).order('is_host', { ascending: false })
      setPassengers((pax ?? []) as Passenger[])

      // Airport code → readable city name (passed to airportCity()).
      const { data: airportData } = await supabase.from('airports').select('code, name')
      const am: Record<string, string> = {}
      for (const a of (airportData ?? [])) am[(a as { code: string }).code] = (a as { name: string }).name
      setAirportNames(am)

      setLoading(false)
    }
    load()
  }, [bookingId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Live roster of fellow travelers (opted-in members, excluding yourself).
  // Re-fetches when the trip row changes (the booking trigger updates it on any
  // book/cancel), so a cancellation drops off without a refresh.
  useEffect(() => {
    if (!booking) return
    let active = true
    const table = booking.item_kind === 'flight' ? 'flights' : 'excursions'
    const loadRoster = async () => {
      const r = await fetchRosters(supabase, booking.item_kind, [booking.item_id])
      if (active) setRoster((r[booking.item_id] ?? []).filter(e => e.member_id !== member?.id))
    }
    loadRoster()
    const ch = supabase
      .channel(`bp-roster-${booking.item_id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table, filter: `id=eq.${booking.item_id}` }, () => loadRoster())
      .subscribe()
    return () => { active = false; supabase.removeChannel(ch) }
  }, [booking, member?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="page"><div className="page-view" style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
        <div className="empty"><div className="pending-indicator" /><p>Loading boarding pass…</p></div>
      </div></div>
    )
  }

  if (notFound || !booking) {
    return (
      <div className="page"><div className="page-view">
        <div className="empty">
          <h3>Boarding pass not found.</h3>
          <p>This booking no longer exists.</p>
          <Link href="/bookings" className="btn-ghost" style={{ marginTop: 8 }}>Back to bookings</Link>
        </div>
      </div></div>
    )
  }

  const isFlight = booking.item_kind === 'flight'
  const confirmed = booking.status === 'approved'
  const isAnchor = !!member && (flight?.anchor_member_id ?? excursion?.anchor_member_id) === member.id
  const code = booking.confirmation_code || booking.id
  const title = isFlight ? (flight?.name || `${flight?.origin_code} → ${flight?.dest_code}`) : (excursion?.name ?? 'Excursion')
  const dateStr = isFlight ? (flight ? fmtDate(flight.date).full : '') : (excursion ? fmtDate(excursion.date).full : '')
  const departTime = isFlight ? fmtTime(flight?.depart_time ?? null) : fmtTime(excursion?.depart_time ?? excursion?.start_time ?? null)

  const statusColor = confirmed ? 'var(--moss)' : booking.status === 'pending' ? 'var(--sun-d)' : 'var(--signal)'
  const statusLabel = confirmed ? 'CONFIRMED' : booking.status === 'pending' ? 'PENDING OPS REVIEW' : booking.status.toUpperCase()

  return (
    <div className="page">
      <div className="page-view" style={{ maxWidth: 640, margin: '0 auto' }}>
        <Link href="/bookings" className="mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--ink-mid)', marginBottom: 16, letterSpacing: '0.14em' }}>
          ← MY TRIPS
        </Link>

        <div className="boarding-pass">
          {/* Header — route IS the hero. Bold sans like the My Trips card
              type ramp, with a quiet eyebrow + status pill above. */}
          <div className="boarding-pass__hero">
            <div className="boarding-pass__hero-glow" aria-hidden />
            <div className="boarding-pass__hero-top">
              <div className="boarding-pass__eyebrow">Travail · Boarding pass</div>
              <span className="boarding-pass__status" style={{ color: statusColor }}>
                <span className="boarding-pass__status-dot" style={{ background: statusColor }} aria-hidden />
                {statusLabel}
              </span>
            </div>
            {isFlight && flight ? (
              <>
                <h1 className="boarding-pass__route-title">
                  {airportCity(flight.origin_code, airportNames)}
                  <span className="boarding-pass__route-arrow" aria-hidden>→</span>
                  {airportCity(flight.dest_code, airportNames)}
                </h1>
                <div className="boarding-pass__route-meta">
                  {dateStr} · {departTime}{flight.duration_mins ? ` · ${fmtDur(flight.duration_mins)} BLOCK` : ''} · {booking.seats === 1 ? '1 SEAT' : `${booking.seats} SEATS`}
                </div>
                <div className="boarding-pass__route-codes">
                  {flight.origin_code} → {flight.dest_code}
                  {flight.aircraft_id ? ` · ${flight.aircraft_id}` : ''}
                </div>
              </>
            ) : (
              <>
                <h1 className="boarding-pass__route-title">{title}</h1>
                <div className="boarding-pass__route-meta">
                  {dateStr} · {departTime}{excursion?.stay_type ? ` · ${excursion.stay_type.replace('_', ' ').toUpperCase()}` : ''} · {booking.seats === 1 ? '1 SPOT' : `${booking.seats} SPOTS`}
                </div>
                {template?.operator && (
                  <div className="boarding-pass__route-codes">{template.operator}</div>
                )}
              </>
            )}
          </div>

          {/* Manifest */}
          {passengers.length > 0 && (
            <div style={{ padding: '0 26px 18px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.12em', color: 'var(--ink-faint)', textTransform: 'uppercase', marginBottom: 8 }}>Manifest · {passengers.length}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {passengers.map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <span className={`pill ${p.is_host ? 'tropic' : 'ink'}`} style={{ fontSize: 9 }}>{p.is_host ? 'Member' : 'Guest'}</span>
                    <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{p.first_name} {p.last_name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Who else is going */}
          {roster.length > 0 && (
            <div style={{ padding: '0 26px 18px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.12em', color: 'var(--ink-faint)', textTransform: 'uppercase', marginBottom: 10 }}>
                Also going · {roster.reduce((s, e) => s + e.seats, 0)}
              </div>
              <CoPassengerList entries={roster} meId={member?.id ?? null} />
            </div>
          )}

          {/* Perforation — semicircle cutouts on the left + right edges
              with a dashed line between, matching the wallet stack. */}
          <div className="boarding-pass__perf" aria-hidden>
            <span className="boarding-pass__perf-dash" />
          </div>

          {/* Stub */}
          <div style={{ padding: '20px 26px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.12em', color: 'var(--ink-faint)', textTransform: 'uppercase', marginBottom: 4 }}>
                {confirmed ? 'Confirmation code' : 'Reference'}
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--ink)' }}>{code}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-light)', marginTop: 4 }}>Total {fmtMoney(booking.total)}</div>
            </div>
            <Barcode value={code} />
          </div>

          {!confirmed && (
            <div style={{ padding: '0 26px 20px' }}>
              <div style={{ background: 'var(--warm)', borderRadius: 8, padding: '10px 14px', fontSize: 12.5, color: 'var(--ink-mid)' }}>
                This pass activates once Ops confirms your reservation. You&rsquo;ll get a notification with your confirmation code.
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/contact" className="btn-ghost" style={{ height: 34, padding: '0 16px', fontSize: 12.5, display: 'inline-flex', alignItems: 'center' }}>
            Contact ops
          </Link>
          {(booking.status === 'pending' || booking.status === 'approved') && (
            cancelRequested ? (
              <span className="pill sun" style={{ height: 34, padding: '0 14px' }}>Cancellation requested</span>
            ) : (
              <button className="btn-ghost" style={{ height: 34, padding: '0 16px', fontSize: 12.5, color: 'var(--signal)', borderColor: 'rgba(217,78,42,0.3)' }} onClick={requestCancel}>
                Request cancellation
              </button>
            )
          )}
        </div>

        {isAnchor && (booking.status === 'pending' || booking.status === 'approved') && (
          <div style={{ marginTop: 10, background: 'var(--warm)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--ink-mid)', textAlign: 'center' }}>
            You anchored this trip. Ops can&rsquo;t cancel it if other members are booked.
          </div>
        )}
      </div>
    </div>
  )
}
