'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fmtDate, fmtTime, fmtMoney, returnLegIds } from '@/lib/data'
import { KIND_ICONS } from '@/lib/icons'
import type {
  Booking,
  AnchorSubmission,
  Flight,
  Excursion,
  ExcursionTemplate,
} from '@/lib/supabase/types'

// ─── Status helpers ────────────────────────────────────────────────────────────

type BookingStatus = Booking['status']
type SubmissionStatus = AnchorSubmission['status']

function bookingStatusLabel(status: BookingStatus): string {
  switch (status) {
    case 'pending':   return 'IN OPS REVIEW'
    case 'approved':  return 'CONFIRMED'
    case 'declined':  return 'DECLINED'
    case 'cancelled': return 'CANCELLED'
    case 'refunded':  return 'REFUNDED'
    default:          return (status as string).toUpperCase()
  }
}

function bookingStatusClass(status: BookingStatus): string {
  switch (status) {
    case 'pending':   return 'sun'
    case 'approved':  return 'moss'
    case 'declined':  return 'signal'
    case 'cancelled': return ''
    case 'refunded':  return 'ink'
    default:          return ''
  }
}

function submissionStatusLabel(status: SubmissionStatus): string {
  switch (status) {
    case 'pending':   return 'IN OPS REVIEW'
    case 'approved':  return 'APPROVED'
    case 'declined':  return 'DECLINED'
    case 'published': return 'LIVE'
    default:          return (status as string).toUpperCase()
  }
}

function submissionStatusClass(status: SubmissionStatus): string {
  switch (status) {
    case 'pending':   return 'sun'
    case 'approved':  return 'tropic'
    case 'declined':  return 'signal'
    case 'published': return 'moss'
    default:          return ''
  }
}

// ─── Enriched types ────────────────────────────────────────────────────────────

interface EnrichedBooking extends Booking {
  flight?: Flight
  excursion?: Excursion
  excursionTemplate?: ExcursionTemplate
}

interface EnrichedSubmission extends AnchorSubmission {
  flight?: Flight
  excursion?: Excursion
  excursionTemplate?: ExcursionTemplate
}

// ─── Booking card ──────────────────────────────────────────────────────────────

function BookingCard({ booking, onNavigate, roundReturn }: { booking: EnrichedBooking; onNavigate: () => void; roundReturn?: Flight }) {
  const isBoarding = booking.status === 'approved'
  const isFlight = booking.item_kind === 'flight'
  const f = booking.flight
  const e = booking.excursion
  const tpl = booking.excursionTemplate

  const icon = isFlight ? 'flight' : (tpl?.icon ?? 'fish')
  const name = isFlight ? (f?.name ?? `Flight ${booking.item_id.slice(0, 6)}`) : (e?.name ?? `Excursion`)

  let dateStr = ''
  let routeMeta = ''
  if (isFlight && f) {
    const dp = fmtDate(f.date)
    dateStr = dp.full + (roundReturn ? ` · returns ${fmtDate(roundReturn.date).full}` : '')
    routeMeta = `${f.origin_code} ${roundReturn ? '⇄' : '→'} ${f.dest_code}${roundReturn ? ' · round trip' : ''}`
  } else if (e) {
    const dp = fmtDate(e.date)
    dateStr = dp.full
    routeMeta = e.origin_code + (e.start_time ? ` · ${fmtTime(e.start_time)}` : '')
  }

  const statusCls = bookingStatusClass(booking.status)
  const statusLabel = bookingStatusLabel(booking.status)

  return (
    <div
      className={`my-trip-card s-${booking.status}`}
      style={{ cursor: 'pointer' }}
      onClick={onNavigate}
    >
      <div className="my-trip-card__header">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: isFlight ? 'var(--tropic-glow)' : 'var(--sun-glow)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isFlight ? 'var(--tropic)' : 'var(--sun-d)',
              flexShrink: 0,
            }}
          >
            {KIND_ICONS[icon] ?? KIND_ICONS['fish']}
          </div>
          <div>
            <div className="my-trip-card__title" style={{ fontStyle: 'italic' }}>{name}</div>
            <div className="my-trip-card__sub">
              {isFlight ? 'Flight' : 'Excursion'}
              {booking.seats > 1 ? ` · ${booking.seats} seats` : ' · 1 seat'}
            </div>
          </div>
        </div>
        <span className={`pill${statusCls ? ' ' + statusCls : ''}`}>{statusLabel}</span>
      </div>

      <div className="my-trip-card__body">
        {dateStr && (
          <div className="my-trip-card__row">
            <span className="label">Date</span>
            <span>{dateStr}</span>
          </div>
        )}
        {routeMeta && (
          <div className="my-trip-card__row">
            <span className="label">{isFlight ? 'Route' : 'Departure'}</span>
            <span>{routeMeta}</span>
          </div>
        )}
        <div className="my-trip-card__row">
          <span className="label">Total</span>
          <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{fmtMoney(booking.total)}</span>
        </div>
        {booking.status === 'declined' && booking.decline_reason && (
          <div className="my-trip-card__row">
            <span className="label">Reason</span>
            <span style={{ color: 'var(--signal)', fontSize: 13 }}>{booking.decline_reason}</span>
          </div>
        )}
      </div>

      <div className="my-trip-card__footer">
        <div>
          {booking.confirmation_code ? (
            <>
              <div style={{ fontSize: 10, fontFamily: 'var(--mono)', letterSpacing: '0.08em', color: 'var(--ink-faint)', textTransform: 'uppercase', marginBottom: 2 }}>Confirmation</div>
              <div className="my-trip-card__conf">{booking.confirmation_code}</div>
            </>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--ink-faint)', fontFamily: 'var(--mono)', letterSpacing: '0.06em' }}>
              {booking.status === 'pending' ? 'PENDING REVIEW' : 'NO CODE'}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 12,
            color: 'var(--ink-light)',
            fontFamily: 'var(--mono)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}>
            {new Date(booking.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          {isBoarding && (
            <span className="pill tropic">View pass →</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Anchor card ───────────────────────────────────────────────────────────────

function AnchorCard({ submission }: { submission: EnrichedSubmission }) {
  const isFlight = submission.kind === 'flight'
  const f = submission.flight
  const e = submission.excursion
  const tpl = submission.excursionTemplate
  const payload = submission.payload as Record<string, unknown>

  const icon = isFlight ? 'flight' : (tpl?.icon ?? (payload.icon as string | undefined) ?? 'fish')

  let name = isFlight ? (f?.name ?? (payload.name as string | undefined) ?? 'Flight submission') : (e?.name ?? (payload.name as string | undefined) ?? 'Excursion submission')
  let routeOrDate = ''

  if (isFlight && f) {
    const dp = fmtDate(f.date)
    routeOrDate = `${f.origin_code} → ${f.dest_code} · ${dp.full}`
  } else if (isFlight && payload) {
    routeOrDate = [payload.origin_code, payload.dest_code, payload.date].filter(Boolean).join(' · ')
  } else if (e) {
    const dp = fmtDate(e.date)
    routeOrDate = `${e.origin_code} · ${dp.full}`
  } else if (payload) {
    routeOrDate = [payload.origin_code, payload.date].filter(Boolean).join(' · ')
  }

  const statusCls = submissionStatusClass(submission.status)
  const statusLabel = submissionStatusLabel(submission.status)

  return (
    <div className="my-trip-card">
      <div className="my-trip-card__header">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: isFlight ? 'var(--tropic-glow)' : 'var(--sun-glow)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isFlight ? 'var(--tropic)' : 'var(--sun-d)',
              flexShrink: 0,
            }}
          >
            {KIND_ICONS[icon] ?? KIND_ICONS['fish']}
          </div>
          <div>
            <div className="my-trip-card__title" style={{ fontStyle: 'italic' }}>{name}</div>
            <div className="my-trip-card__sub">{isFlight ? 'Anchor flight' : 'Anchor excursion'} submission</div>
          </div>
        </div>
        <span className={`pill${statusCls ? ' ' + statusCls : ''}`}>{statusLabel}</span>
      </div>

      <div className="my-trip-card__body">
        {routeOrDate && (
          <div className="my-trip-card__row">
            <span className="label">{isFlight ? 'Route' : 'Departure'}</span>
            <span>{routeOrDate}</span>
          </div>
        )}
        <div className="my-trip-card__row">
          <span className="label">Submitted</span>
          <span>{new Date(submission.submitted_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
        </div>
        {submission.status === 'declined' && submission.decline_reason && (
          <div className="my-trip-card__row">
            <span className="label">Reason</span>
            <span style={{ color: 'var(--signal)', fontSize: 13 }}>{submission.decline_reason}</span>
          </div>
        )}
        {submission.status === 'published' && submission.published_item_id && (
          <div className="my-trip-card__row">
            <span className="label">Status</span>
            <span style={{ color: 'var(--moss)', fontWeight: 600 }}>Live and accepting bookings</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function BookingsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [bookings, setBookings] = useState<EnrichedBooking[]>([])
  const [anchors, setAnchors] = useState<EnrichedSubmission[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: member } = await supabase
        .from('members')
        .select('id')
        .eq('user_id', user.id)
        .single()

      if (!member) {
        router.push('/login')
        return
      }

      const [
        { data: rawBookings },
        { data: rawAnchors },
        { data: rawFlights },
        { data: rawExcursions },
        { data: rawTemplates },
      ] = await Promise.all([
        supabase
          .from('bookings')
          .select('*')
          .eq('member_id', member.id)
          .order('submitted_at', { ascending: false }),
        supabase
          .from('anchor_submissions')
          .select('*')
          .eq('member_id', member.id)
          .order('submitted_at', { ascending: false }),
        supabase.from('flights').select('*'),
        supabase.from('excursions').select('*'),
        supabase.from('excursion_templates').select('*'),
      ])

      const flights: Flight[] = (rawFlights ?? []) as Flight[]
      const excursions: Excursion[] = (rawExcursions ?? []) as Excursion[]
      const templates: ExcursionTemplate[] = (rawTemplates ?? []) as ExcursionTemplate[]

      // Enrich bookings
      const enrichedBookings: EnrichedBooking[] = (rawBookings ?? []).map(b => {
        const enriched: EnrichedBooking = { ...b } as EnrichedBooking
        if (b.item_kind === 'flight') {
          enriched.flight = flights.find(f => f.id === b.item_id)
        } else {
          enriched.excursion = excursions.find(e => e.id === b.item_id)
          if (enriched.excursion?.template_id) {
            enriched.excursionTemplate = templates.find(t => t.id === enriched.excursion?.template_id)
          }
        }
        return enriched
      })

      // Enrich anchor submissions
      const enrichedAnchors: EnrichedSubmission[] = (rawAnchors ?? []).map(a => {
        const enriched: EnrichedSubmission = { ...a } as EnrichedSubmission
        if (a.kind === 'flight' && a.published_item_id) {
          enriched.flight = flights.find(f => f.id === a.published_item_id)
        } else if (a.kind === 'excursion' && a.published_item_id) {
          enriched.excursion = excursions.find(e => e.id === a.published_item_id)
          if (enriched.excursion?.template_id) {
            enriched.excursionTemplate = templates.find(t => t.id === enriched.excursion?.template_id)
          }
        }
        return enriched
      })

      setBookings(enrichedBookings)
      setAnchors(enrichedAnchors)
      setLoading(false)
    }

    load()
  }, [])

  const confirmedCount = bookings.filter(b => b.status === 'approved').length
  const pendingCount = bookings.filter(b => b.status === 'pending').length

  // Collapse round trips (outbound + return) into one entry.
  const flightList = bookings.map(b => b.flight).filter(Boolean) as Flight[]
  const retIds = returnLegIds(flightList)
  const bookedFlightIds = new Set(bookings.filter(b => b.item_kind === 'flight').map(b => b.item_id))
  const flightById = new Map(flightList.map(f => [f.id, f]))
  const visibleBookings = bookings.filter(b => !(b.item_kind === 'flight' && retIds.has(b.item_id) && bookedFlightIds.has(b.item_id.slice(0, -1))))

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="mono" style={{ marginBottom: 6 }}>YOUR ACTIVITY</p>
          <h1>Bookings &amp; anchors.</h1>
          <p className="sub">
            {loading
              ? 'Loading your activity…'
              : `${bookings.length} booking${bookings.length !== 1 ? 's' : ''}${confirmedCount > 0 ? ` · ${confirmedCount} confirmed` : ''}${pendingCount > 0 ? ` · ${pendingCount} pending` : ''}${anchors.length > 0 ? ` · ${anchors.length} anchor submission${anchors.length !== 1 ? 's' : ''}` : ''}`
            }
          </p>
        </div>
      </div>

      <div className="page-view">
        {loading ? (
          <div className="empty">
            <div className="pending-indicator" />
            <p>Loading your bookings…</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            {/* Bookings section */}
            <section>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <p className="mono" style={{ margin: 0 }}>YOUR BOOKINGS · {bookings.length}</p>
              </div>

              {bookings.length === 0 ? (
                <div className="panel">
                  <div className="empty" style={{ padding: '32px 20px' }}>
                    <svg width="36" height="36" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                      <path d="M5 11h12M5 11a3 3 0 0 1 0-6h12a3 3 0 0 1 0 6M5 11v6h12v-6M9 17v3M13 17v3"/>
                    </svg>
                    <h3>No bookings yet</h3>
                    <p>Reserve a seat on an upcoming flight or excursion to get started.</p>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {visibleBookings.map(b => (
                    <BookingCard
                      key={b.id}
                      booking={b}
                      onNavigate={() => router.push(`/boarding-pass/${b.id}`)}
                      roundReturn={b.item_kind === 'flight' ? flightById.get(`${b.item_id}R`) : undefined}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Anchor submissions section */}
            <section>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <p className="mono" style={{ margin: 0 }}>YOUR ANCHORS · {anchors.length}</p>
                <button
                  className="btn-ghost"
                  style={{ height: 30, padding: '0 12px', fontSize: 12 }}
                  onClick={() => router.push('/anchor-flight')}
                >
                  + Anchor a trip
                </button>
              </div>

              {anchors.length === 0 ? (
                <div className="panel">
                  <div className="empty" style={{ padding: '32px 20px' }}>
                    <svg width="36" height="36" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 3v16M3 11h16"/>
                    </svg>
                    <h3>No anchors submitted</h3>
                    <p>Anchor a flight or excursion to bring the group to your destination of choice.</p>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {anchors.map(a => (
                    <AnchorCard key={a.id} submission={a} />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
