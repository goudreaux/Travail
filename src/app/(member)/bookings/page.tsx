'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fmtDate, fmtTime, fmtMoney, returnLegIds, airportCity } from '@/lib/data'
import PageHero from '@/components/PageHero'
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

// A published anchor whose trip Ops has since cancelled (or deleted) is no longer
// live — treat it as cancelled so it leaves the member's active anchors.
function effectiveAnchorStatus(a: EnrichedSubmission): SubmissionStatus {
  if (a.status === 'published') {
    const item = a.kind === 'flight' ? a.flight : a.excursion
    if (!item || item.status === 'cancelled') return 'cancelled'
  }
  return a.status
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

function BookingCard({ booking, onNavigate, roundReturn, isExpanded, onSelect, airportName }: { booking: EnrichedBooking; onNavigate: () => void; roundReturn?: Flight; isExpanded: boolean; onSelect: () => void; airportName: Record<string, string> }) {
  const isBoarding = booking.status === 'approved'
  const isFlight = booking.item_kind === 'flight'
  const f = booking.flight
  const e = booking.excursion
  const tpl = booking.excursionTemplate

  const icon = isFlight ? 'flight' : (tpl?.icon ?? 'fish')
  const name = isFlight ? (f?.name ?? `Flight ${booking.item_id.slice(0, 6)}`) : (e?.name ?? `Excursion`)

  let dateLabel = ''
  if (isFlight && f) {
    const dp = fmtDate(f.date)
    dateLabel = dp.full.toUpperCase()
  } else if (e) {
    const dp = fmtDate(e.date)
    dateLabel = dp.full.toUpperCase()
  }
  const timeLabel = isFlight && f
    ? (roundReturn ? 'ROUND TRIP' : '')
    : (e?.start_time ? fmtTime(e.start_time).toUpperCase() : '')
  const seatsLabel = booking.seats === 1 ? '1 SEAT' : `${booking.seats} SEATS`

  const statusCls = bookingStatusClass(booking.status)
  const statusLabel = bookingStatusLabel(booking.status)
  const imageUrl = (isFlight ? f?.image_url : e?.image_url) || '/trip-default.jpeg'

  return (
    <div
      className={`my-trip-card s-${booking.status}`}
      data-expanded={isExpanded ? '1' : '0'}
      onClick={() => (isExpanded ? onNavigate() : onSelect())}
    >
      <img className="my-trip-card__img" src={imageUrl} alt="" />
      <div className="my-trip-card__top">
        <div className="my-trip-card__top-row">
          <h3 className="my-trip-card__route">
            {isFlight && f ? (
              <>
                <span>{airportCity(f.origin_code, airportName)}</span>
                <span className="my-trip-card__route-arrow">{roundReturn ? '⇄' : '→'}</span>
                <span>{airportCity(f.dest_code, airportName)}</span>
              </>
            ) : (
              <span>{name}</span>
            )}
          </h3>
          <span className={`pill${statusCls ? ' ' + statusCls : ''}`}>{statusLabel}</span>
        </div>
        <div className="my-trip-card__meta">
          {[dateLabel, timeLabel, seatsLabel, fmtMoney(booking.total).toUpperCase()].filter(Boolean).join(' · ')}
        </div>
      </div>
      <div className="my-trip-card__perf" aria-hidden>
        <span className="my-trip-card__perf-dash" />
      </div>
      <div className="my-trip-card__stub">
        <span className="my-trip-card__conf">
          {booking.confirmation_code ?? (booking.status === 'pending' ? 'PENDING REVIEW' : '—')}
        </span>
        {isBoarding && (
          <button
            className="btn-ghost-quiet"
            style={{ height: 28, padding: '0 12px', fontSize: 11.5 }}
            onClick={ev => { ev.stopPropagation(); onNavigate() }}
          >
            Boarding pass →
          </button>
        )}
      </div>
      {booking.status === 'declined' && booking.decline_reason && (
        <div style={{ padding: '0 18px 12px', position: 'relative', zIndex: 1, fontSize: 12.5, color: 'var(--signal)' }}>
          {booking.decline_reason}
        </div>
      )}
    </div>
  )
}

// ─── Anchor card ───────────────────────────────────────────────────────────────

function AnchorCard({ submission, isExpanded, onSelect, airportName }: { submission: EnrichedSubmission; isExpanded: boolean; onSelect: () => void; airportName: Record<string, string> }) {
  const isFlight = submission.kind === 'flight'
  const f = submission.flight
  const e = submission.excursion
  const tpl = submission.excursionTemplate
  const payload = submission.payload as Record<string, unknown>

  const icon = isFlight ? 'flight' : (tpl?.icon ?? (payload.icon as string | undefined) ?? 'fish')

  const name = isFlight ? (f?.name ?? (payload.name as string | undefined) ?? 'Flight submission') : (e?.name ?? (payload.name as string | undefined) ?? 'Excursion submission')
  let routeOrDate = ''

  if (isFlight && f) {
    const dp = fmtDate(f.date)
    routeOrDate = `${airportCity(f.origin_code, airportName)} → ${airportCity(f.dest_code, airportName)} · ${dp.full}`
  } else if (isFlight && payload) {
    routeOrDate = [payload.origin_code ? airportCity(String(payload.origin_code), airportName) : null, payload.dest_code ? airportCity(String(payload.dest_code), airportName) : null, payload.date].filter(Boolean).join(' · ')
  } else if (e) {
    const dp = fmtDate(e.date)
    routeOrDate = `${airportCity(e.origin_code, airportName)} · ${dp.full}`
  } else if (payload) {
    routeOrDate = [payload.origin_code ? airportCity(String(payload.origin_code), airportName) : null, payload.date].filter(Boolean).join(' · ')
  }

  const effStatus = effectiveAnchorStatus(submission)
  const statusCls = submissionStatusClass(effStatus)
  const statusLabel = submissionStatusLabel(effStatus)
  const imageUrl = (isFlight ? f?.image_url : e?.image_url) || '/trip-default.jpeg'
  const submittedLabel = `SUBMITTED ${new Date(submission.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()}`

  return (
    <div
      className="my-trip-card"
      data-expanded="1"
      onClick={onSelect}
    >
      <img className="my-trip-card__img" src={imageUrl} alt="" />
      <div className="my-trip-card__top">
        <div className="my-trip-card__top-row">
          <h3 className="my-trip-card__route"><span>{name}</span></h3>
          <span className={`pill${statusCls ? ' ' + statusCls : ''}`}>{statusLabel}</span>
        </div>
        <div className="my-trip-card__meta">
          {[
            isFlight ? 'ANCHOR FLIGHT' : 'ANCHOR EXCURSION',
            routeOrDate ? routeOrDate.toUpperCase() : '',
            submittedLabel,
          ].filter(Boolean).join(' · ')}
        </div>
      </div>
      <div className="my-trip-card__perf" aria-hidden>
        <span className="my-trip-card__perf-dash" />
      </div>
      <div className="my-trip-card__stub">
        {submission.status === 'published' && submission.published_item_id ? (
          <span className="my-trip-card__conf" style={{ color: effStatus === 'cancelled' ? 'var(--signal)' : 'var(--moss)' }}>
            {effStatus === 'cancelled' ? 'CANCELLED BY OPS' : 'LIVE & ACCEPTING BOOKINGS'}
          </span>
        ) : (
          <span className="my-trip-card__conf">{statusLabel}</span>
        )}
      </div>
      {submission.status === 'declined' && submission.decline_reason && (
        <div style={{ padding: '0 18px 12px', position: 'relative', zIndex: 1, fontSize: 12.5, color: 'var(--signal)' }}>
          {submission.decline_reason}
        </div>
      )}
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function BookingsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [bookings, setBookings] = useState<EnrichedBooking[]>([])
  const [anchors, setAnchors] = useState<EnrichedSubmission[]>([])
  const [airportName, setAirportName] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [showHistory, setShowHistory] = useState(false)
  // iOS Wallet-style stack: one card expanded at a time across the whole page.
  const [expandedId, setExpandedId] = useState<string | null>(null)

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
        { data: rawAirports },
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
        supabase.from('airports').select('code, name'),
      ] as const)

      const flights: Flight[] = (rawFlights ?? []) as Flight[]
      const excursions: Excursion[] = (rawExcursions ?? []) as Excursion[]
      const templates: ExcursionTemplate[] = (rawTemplates ?? []) as ExcursionTemplate[]
      const am: Record<string, string> = {}
      for (const a of (rawAirports ?? []) as { code: string; name: string }[]) am[a.code] = a.name
      setAirportName(am)

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

  // Collapse round trips (outbound + return) into one entry.
  const flightList = bookings.map(b => b.flight).filter(Boolean) as Flight[]
  const retIds = returnLegIds(flightList)
  const bookedFlightIds = new Set(bookings.filter(b => b.item_kind === 'flight').map(b => b.item_id))
  const flightById = new Map(flightList.map(f => [f.id, f]))
  const visibleBookings = bookings.filter(b => !(b.item_kind === 'flight' && retIds.has(b.item_id) && bookedFlightIds.has(b.item_id.slice(0, -1))))

  // Active vs closed — matches the ops dashboard split.
  const ACTIVE_BOOKING: BookingStatus[] = ['pending', 'approved']
  const ACTIVE_ANCHOR: SubmissionStatus[] = ['pending', 'approved', 'published']
  const activeBookings = visibleBookings.filter(b => ACTIVE_BOOKING.includes(b.status))
  const closedBookings = visibleBookings.filter(b => !ACTIVE_BOOKING.includes(b.status))
  const activeAnchors = anchors.filter(a => ACTIVE_ANCHOR.includes(effectiveAnchorStatus(a)))
  const closedAnchors = anchors.filter(a => !ACTIVE_ANCHOR.includes(effectiveAnchorStatus(a)))
  const historyCount = closedBookings.length + closedAnchors.length
  const confirmedCount = activeBookings.filter(b => b.status === 'approved').length
  const pendingCount = activeBookings.filter(b => b.status === 'pending').length

  // Wallet stack covers bookings only (anchors render unstacked). Default
  // expanded = first active booking, or first closed booking when history is open.
  const effectiveExpanded =
    expandedId
    ?? activeBookings[0]?.id
    ?? closedBookings[0]?.id
    ?? null

  return (
    <div className="page">
      <PageHero
        accent="moss"
        eyebrow="YOUR ACTIVITY"
        title="Bookings & anchors."
        sub={loading
          ? 'Loading your activity…'
          : `${activeBookings.length} active booking${activeBookings.length !== 1 ? 's' : ''}${confirmedCount > 0 ? ` · ${confirmedCount} confirmed` : ''}${pendingCount > 0 ? ` · ${pendingCount} pending` : ''}${activeAnchors.length > 0 ? ` · ${activeAnchors.length} active anchor${activeAnchors.length !== 1 ? 's' : ''}` : ''}`}
        metric={loading ? undefined : {
          value: activeBookings.length,
          label: activeAnchors.length > 0 ? `Active · ${activeAnchors.length} anchored` : 'Active trips',
          sub: 'On the board',
        }}
      />

      <div className="page-view">
        {loading ? (
          <div className="empty">
            <div className="pending-indicator" />
            <p>Loading your bookings…</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32, maxWidth: 760, width: '100%' }}>
            {/* Your Active Bookings */}
            <section>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <p className="mono" style={{ margin: 0 }}>YOUR ACTIVE BOOKINGS · {activeBookings.length}</p>
              </div>

              {activeBookings.length === 0 ? (
                <div className="panel">
                  <div className="empty" style={{ padding: '32px 20px' }}>
                    <svg width="36" height="36" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                      <path d="M5 11h12M5 11a3 3 0 0 1 0-6h12a3 3 0 0 1 0 6M5 11v6h12v-6M9 17v3M13 17v3"/>
                    </svg>
                    <h3>No active bookings</h3>
                    <p>Reserve a seat on an upcoming flight or excursion to get started.</p>
                  </div>
                </div>
              ) : (
                <div className="my-trips-stack">
                  {activeBookings.map(b => (
                    <BookingCard
                      key={b.id}
                      booking={b}
                      onNavigate={() => router.push(`/boarding-pass/${b.id}`)}
                      roundReturn={b.item_kind === 'flight' ? flightById.get(`${b.item_id}R`) : undefined}
                      isExpanded={effectiveExpanded === b.id}
                      onSelect={() => setExpandedId(b.id)}
                      airportName={airportName}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Your Active Anchors */}
            <section>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <p className="mono" style={{ margin: 0 }}>YOUR ACTIVE ANCHORS · {activeAnchors.length}</p>
                <button
                  className="btn-ghost"
                  style={{ height: 30, padding: '0 12px', fontSize: 12 }}
                  onClick={() => router.push('/anchor-flight')}
                >
                  + Anchor a trip
                </button>
              </div>

              {activeAnchors.length === 0 ? (
                <div className="panel">
                  <div className="empty" style={{ padding: '32px 20px' }}>
                    <svg width="36" height="36" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 3v16M3 11h16"/>
                    </svg>
                    <h3>No active anchors</h3>
                    <p>Anchor a flight or excursion to bring the group to your destination of choice.</p>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {activeAnchors.map(a => (
                    <AnchorCard
                      key={a.id}
                      submission={a}
                      isExpanded={true}
                      onSelect={() => {}} airportName={airportName}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Booking history (collapsible) */}
            {historyCount > 0 && (
              <section>
                <button
                  onClick={() => setShowHistory(v => !v)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 12,
                    padding: '14px 18px', cursor: 'pointer',
                  }}
                >
                  <span className="mono" style={{ color: 'var(--ink-mid)' }}>BOOKING HISTORY · {historyCount}</span>
                  <span style={{ color: 'var(--ink-light)', fontSize: 12 }}>{showHistory ? '▲ Hide' : '▼ Show'}</span>
                </button>

                {showHistory && (
                  <div className="my-trips-stack" style={{ marginTop: 12 }}>
                    {closedBookings.map(b => (
                      <BookingCard
                        key={b.id}
                        booking={b}
                        onNavigate={() => router.push(`/boarding-pass/${b.id}`)}
                        roundReturn={b.item_kind === 'flight' ? flightById.get(`${b.item_id}R`) : undefined}
                        isExpanded={effectiveExpanded === b.id}
                        onSelect={() => setExpandedId(b.id)}
                        airportName={airportName}
                      />
                    ))}
                    {closedAnchors.map(a => (
                      <AnchorCard
                        key={a.id}
                        submission={a}
                        isExpanded={effectiveExpanded === a.id}
                        onSelect={() => setExpandedId(a.id)} airportName={airportName}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
