'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { adaptFlight, adaptExcursion, fmtDate, fmtMoney, fmtTime } from '@/lib/data'
import { KIND_ICONS } from '@/lib/icons'
import type { Flight, Excursion, ExcursionTemplate, Booking } from '@/lib/supabase/types'
import type { DisplayFlight, DisplayExcursion } from '@/lib/data'

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

// ─── Trip card ─────────────────────────────────────────────────────────────────

function FlightCard({
  flight,
  onCTA,
}: {
  flight: DisplayFlight
  onCTA: () => void
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
            {flight.origin_code}
            <span style={{ color: 'var(--ink-faint)', margin: '0 6px', fontSize: 14 }}>→</span>
            {flight.dest_code}
          </div>
          <div className="trip-card__meta">
            {flight.departTimeStr}
            {flight.durationStr ? ` · ${flight.durationStr}` : ''}
            {flight.seatsAvailable > 0
              ? ` · ${flight.seatsAvailable} seat${flight.seatsAvailable !== 1 ? 's' : ''} open`
              : ' · Full'}
          </div>
        </div>
      </div>
      <div className="trip-card__cta">
        <span style={{ color: 'var(--ink-light)', fontSize: 12 }}>
          {flight.name || `${flight.origin_code}–${flight.dest_code}`}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="trip-card__price">{fmtMoney(flight.price_per_seat)}<span style={{ fontWeight: 400, fontSize: 11, color: 'var(--ink-light)' }}>/seat</span></span>
          <button
            className="btn-primary"
            style={{ height: 30, padding: '0 14px', fontSize: 12, background: colors.dot }}
            onClick={e => { e.stopPropagation(); onCTA() }}
          >
            Take seat →
          </button>
        </div>
      </div>
    </div>
  )
}

function ExcursionCard({
  excursion,
  onCTA,
}: {
  excursion: DisplayExcursion
  onCTA: () => void
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
          <div className="trip-card__title" style={{ color: colors.accent }}>{kindLabel} · {excursion.origin_code}</div>
          <div className="trip-card__name">{excursion.name}</div>
          <div className="trip-card__meta">
            {excursion.startTimeStr !== '—' ? excursion.startTimeStr : ''}
            {excursion.templateMeta?.operator ? ` · ${excursion.templateMeta.operator}` : ''}
            {excursion.spotsAvailable > 0
              ? ` · ${excursion.spotsAvailable} spot${excursion.spotsAvailable !== 1 ? 's' : ''} open`
              : ' · Full'}
          </div>
        </div>
      </div>
      <div className="trip-card__cta">
        <span style={{ color: 'var(--ink-light)', fontSize: 12 }}>
          {excursion.stay_type === 'day_trip' ? 'Day trip' : excursion.stay_type === 'overnight' ? 'Overnight' : 'Multi-night'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {(excursion.price_per_pax || excursion.templateMeta?.price_per_pax) ? (
            <span className="trip-card__price">{fmtMoney(excursion.price_per_pax || excursion.templateMeta?.price_per_pax || 0)}<span style={{ fontWeight: 400, fontSize: 11, color: 'var(--ink-light)' }}>/person</span></span>
          ) : null}
          <button
            className="btn-primary"
            style={{ height: 30, padding: '0 14px', fontSize: 12, background: colors.dot }}
            onClick={e => { e.stopPropagation(); onCTA() }}
          >
            Reserve spot →
          </button>
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

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: member } = await supabase
        .from('members')
        .select('id')
        .eq('user_id', user.id)
        .single()

      const memberId = member?.id

      const [
        { data: rawFlights },
        { data: rawExcursions },
        { data: rawTemplates },
        { data: rawBookings },
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
        memberId
          ? supabase
              .from('bookings')
              .select('*')
              .eq('member_id', memberId)
              .in('status', ['pending', 'approved'])
          : Promise.resolve({ data: [] }),
      ])

      const templates: ExcursionTemplate[] = rawTemplates ?? []
      const bookings: Booking[] = (rawBookings as Booking[] | null) ?? []

      const adaptedFlights: DisplayFlight[] = (rawFlights ?? []).map(f => {
        const booksForFlight: Record<string, number> = {}
        bookings
          .filter(b => b.item_kind === 'flight' && b.item_id === f.id)
          .forEach(b => { booksForFlight[b.member_id] = (booksForFlight[b.member_id] ?? 0) + b.seats })
        const df = adaptFlight(f as Flight, booksForFlight, memberId)
        return df
      }).filter(f => f.seatsAvailable > 0)

      const adaptedExcursions: DisplayExcursion[] = (rawExcursions ?? []).map(e => {
        const booksForExc: Record<string, number> = {}
        bookings
          .filter(b => b.item_kind === 'excursion' && b.item_id === e.id)
          .forEach(b => { booksForExc[b.member_id] = (booksForExc[b.member_id] ?? 0) + b.seats })
        return adaptExcursion(e as Excursion, templates, booksForExc, memberId)
      }).filter(e => e.spotsAvailable > 0)

      setFlights(adaptedFlights)
      setExcursions(adaptedExcursions)
      setLoading(false)
    }

    load()
  }, [])

  // Apply filter
  const visibleFlights = (filter === 'all' || filter === 'flight') ? flights : []
  const visibleExcursions = excursions.filter(e => {
    if (filter === 'all') return true
    if (filter === 'flight') return false
    const icon = e.templateMeta?.icon ?? 'fish'
    return excursionFilter(icon) === filter
  })

  const totalOpen = visibleFlights.length + visibleExcursions.length

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="mono" style={{ marginBottom: 6 }}>DEPARTURES BOARD</p>
          <h1>Open seats &amp; spots.</h1>
          <p className="sub">
            {loading
              ? 'Loading available departures…'
              : `${totalOpen} departure${totalOpen !== 1 ? 's' : ''} with open availability`}
          </p>
        </div>
      </div>

      <div className="page-view">
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
            {visibleFlights.length > 0 && (
              <section style={{ marginBottom: 32 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <span style={{ color: 'var(--tropic)', display: 'flex', alignItems: 'center' }}>{KIND_ICONS['flight']}</span>
                  <p className="mono" style={{ margin: 0 }}>OPEN FLIGHTS · {visibleFlights.length}</p>
                </div>
                <div className="panel" style={{ overflow: 'visible', background: 'transparent', border: 'none', padding: 0 }}>
                  {visibleFlights.map(flight => (
                    <FlightCard
                      key={flight.id}
                      flight={flight}
                      onCTA={() => router.push(`/reserve/${flight.id}?kind=flight`)}
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
