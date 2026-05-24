'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { adaptFlight, adaptExcursion, airportSub, returnLegIds, DisplayFlight, DisplayExcursion } from '@/lib/data'
import { KIND_ICONS } from '@/lib/icons'
import PostCard from '@/components/PostCard'
import PageHero from '@/components/PageHero'
import { useRouter } from 'next/navigation'
import type { Member, Booking, Post, ExcursionTemplate, Flight, Excursion } from '@/lib/supabase/types'

type PostWithDetails = Post & {
  author?: { name: string; initials: string } | null
  comments?: { id: string; body: string; created_at: string; author?: { name: string; initials: string } | null }[]
}

type TripItem =
  | { kind: 'flight'; booking: Booking; flight: DisplayFlight; roundReturn?: DisplayFlight }
  | { kind: 'excursion'; booking: Booking; excursion: DisplayExcursion }

const TYPE_FILTERS = ['all', 'fish', 'golf', 'hunt'] as const
type TypeFilter = typeof TYPE_FILTERS[number]

function statusPillClass(status: Booking['status']): string {
  if (status === 'approved') return 'pill moss'
  if (status === 'pending') return 'pill sun'
  if (status === 'declined' || status === 'cancelled') return 'pill signal'
  return 'pill'
}

function statusLabel(status: Booking['status']): string {
  if (status === 'approved') return 'CONFIRMED'
  if (status === 'pending') return 'PENDING'
  if (status === 'declined') return 'DECLINED'
  if (status === 'cancelled') return 'CANCELLED'
  if (status === 'refunded') return 'REFUNDED'
  return (status as string).toUpperCase()
}

function excursionMatchesFilter(e: DisplayExcursion, filter: TypeFilter): boolean {
  if (filter === 'all') return true
  const icon = e.templateMeta?.icon ?? ''
  const name = (e.name ?? '').toLowerCase()
  const tplName = (e.templateMeta?.name ?? '').toLowerCase()
  if (filter === 'fish') return icon === 'fish' || name.includes('fish') || tplName.includes('fish')
  if (filter === 'golf') return icon === 'golf' || name.includes('golf') || tplName.includes('golf')
  if (filter === 'hunt') return icon === 'quail' || icon === 'hog' || name.includes('hunt') || name.includes('shoot') || tplName.includes('hunt') || tplName.includes('shoot') || tplName.includes('quail')
  return true
}

export default function FeedPage() {
  const [member, setMember] = useState<Member | null>(null)
  const [flights, setFlights] = useState<DisplayFlight[]>([])
  const [excursions, setExcursions] = useState<DisplayExcursion[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [posts, setPosts] = useState<PostWithDetails[]>([])
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: memberRaw } = await supabase
        .from('members')
        .select('*')
        .eq('user_id', user.id as string)
        .single()
      if (!memberRaw) { router.push('/login'); return }
      const memberData = memberRaw as unknown as Member
      setMember(memberData)

      const myId = memberData.id

      const [flightsRes, excursionsRes, bookingsRes, postsRes, templatesRes] = await Promise.all([
        supabase.from('flights').select('*').in('status', ['open', 'full']),
        supabase.from('excursions').select('*').in('status', ['open', 'full']),
        supabase.from('bookings').select('*').eq('member_id', myId),
        supabase
          .from('posts')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(20),
        supabase.from('excursion_templates').select('*'),
      ])

      const myBookings: Booking[] = (bookingsRes.data ?? []) as unknown as Booking[]

      // "My trips" must resolve every booked flight/excursion, even ones no longer
      // on the open board (full, departed, past). Fetch them by id and merge.
      const myFlightIds = [...new Set(myBookings.filter(b => b.item_kind === 'flight').map(b => b.item_id))]
      const myExcIds = [...new Set(myBookings.filter(b => b.item_kind === 'excursion').map(b => b.item_id))]
      const [bookedFlightsRes, bookedExcRes] = await Promise.all([
        myFlightIds.length ? supabase.from('flights').select('*').in('id', myFlightIds) : Promise.resolve({ data: [] }),
        myExcIds.length ? supabase.from('excursions').select('*').in('id', myExcIds) : Promise.resolve({ data: [] }),
      ])

      const flightMap = new Map<string, Flight>()
      for (const f of (flightsRes.data ?? []) as unknown as Flight[]) flightMap.set(f.id, f)
      for (const f of (bookedFlightsRes.data ?? []) as unknown as Flight[]) flightMap.set(f.id, f)
      const flightsData: Flight[] = [...flightMap.values()]

      const excMap = new Map<string, Excursion>()
      for (const e of (excursionsRes.data ?? []) as unknown as Excursion[]) excMap.set(e.id, e)
      for (const e of (bookedExcRes.data ?? []) as unknown as Excursion[]) excMap.set(e.id, e)
      const excursionsData: Excursion[] = [...excMap.values()]

      // The viewer's own active seats per trip; cabin-wide totals come from the
      // trigger-maintained seats_taken / spots_taken columns.
      const myFlightSeats: Record<string, number> = {}
      const myExcSpots: Record<string, number> = {}
      for (const b of myBookings) {
        if (b.status !== 'pending' && b.status !== 'approved') continue
        if (b.item_kind === 'flight') myFlightSeats[b.item_id] = (myFlightSeats[b.item_id] ?? 0) + b.seats
        else myExcSpots[b.item_id] = (myExcSpots[b.item_id] ?? 0) + b.seats
      }

      const tpls: ExcursionTemplate[] = templatesRes.data ?? []

      setFlights(
        flightsData.map(f =>
          adaptFlight(f, myFlightSeats[f.id] ?? 0, myId)
        )
      )
      setExcursions(
        excursionsData.map(e =>
          adaptExcursion(e, tpls, myExcSpots[e.id] ?? 0, myId)
        )
      )
      setBookings(myBookings)
      if (postsRes.data) setPosts((postsRes.data as unknown as PostWithDetails[]))
      setLoading(false)
    }

    load()

    // Real-time subscriptions
    const channel = supabase
      .channel('feed-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => {
        supabase
          .from('posts')
          .select('*, author:members!author_id(name, initials), comments(id, body, created_at, author:members!author_id(name, initials))')
          .order('created_at', { ascending: false })
          .limit(20)
          .then(({ data }) => { if (data) setPosts(data as unknown as PostWithDetails[]) })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, payload => {
        const changed = payload.new as Booking
        if (changed?.member_id) {
          setBookings(prev => {
            const idx = prev.findIndex(b => b.id === changed.id)
            if (idx >= 0) {
              const next = [...prev]
              next[idx] = changed
              return next
            }
            return [...prev, changed]
          })
        }
      })
      // Live seat counts — the booking trigger updates seats_taken/spots_taken on
      // these rows, so refresh the open-seats panel when they change.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'flights' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'excursions' }, () => load())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  // Build trip items by matching bookings to flights/excursions.
  // Round trips (outbound + return) collapse into one item.
  const flightsById = new Map(flights.map(f => [f.id, f]))
  const retIds = returnLegIds(flights)
  const bookedFlightIds = new Set(bookings.filter(b => b.item_kind === 'flight').map(b => b.item_id))
  const tripItems: TripItem[] = []
  for (const booking of bookings) {
    if (booking.status !== 'approved' && booking.status !== 'pending') continue
    if (booking.item_kind === 'flight') {
      // Skip the return leg — it merges into the outbound's card.
      if (retIds.has(booking.item_id) && bookedFlightIds.has(booking.item_id.slice(0, -1))) continue
      const flight = flightsById.get(booking.item_id)
      if (flight) {
        const ret = flightsById.get(`${booking.item_id}R`)
        const roundReturn = ret && bookedFlightIds.has(ret.id) ? ret : undefined
        tripItems.push({ kind: 'flight', booking, flight, roundReturn })
      }
    } else {
      const excursion = excursions.find(e => e.id === booking.item_id)
      if (excursion) tripItems.push({ kind: 'excursion', booking, excursion })
    }
  }
  // Sort by date ascending
  tripItems.sort((a, b) => {
    const da = a.kind === 'flight' ? a.flight.date : a.excursion.date
    const db = b.kind === 'flight' ? b.flight.date : b.excursion.date
    return da.localeCompare(db)
  })

  // All open, upcoming trips with availability (matches the Open seats board).
  const today = new Date().toISOString().slice(0, 10)
  const openRetIds = returnLegIds(flights)
  const openFlights = flights.filter(f => f.status === 'open' && f.date >= today && f.seatsAvailable > 0 && !openRetIds.has(f.id))
  const openExcursions = excursions.filter(e => e.status === 'open' && e.date >= today && e.spotsAvailable > 0)

  const filteredOpenItems = [
    ...openFlights.map(f => ({ type: 'flight' as const, item: f, date: f.date })),
    ...(typeFilter === 'all'
      ? openExcursions
      : openExcursions.filter(e => excursionMatchesFilter(e, typeFilter))
    ).map(e => ({ type: 'excursion' as const, item: e, date: e.date })),
  ].sort((a, b) => a.date.localeCompare(b.date))

  const newPostCount = posts.filter(p => {
    const diff = Date.now() - new Date(p.created_at).getTime()
    return diff < 1000 * 60 * 60 * 24 // within last 24h
  }).length

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  })()

  const nextTrip = tripItems[0]
  const nextLabel = nextTrip
    ? (nextTrip.kind === 'flight'
        ? `${nextTrip.flight.origin_code} ${nextTrip.roundReturn ? '⇄' : '→'} ${nextTrip.flight.dest_code}`
        : nextTrip.excursion.name)
    : null
  const nextDate = nextTrip ? (nextTrip.kind === 'flight' ? nextTrip.flight.dateParts : nextTrip.excursion.dateParts) : null

  return (
    <div className="page">
      <PageHero
        eyebrow="FOUNDING SEASON · TRAVAIL × FIELD & STREAM"
        title={`${greeting}${member ? `, ${member.name.split(' ')[0]}.` : '.'}`}
        sub="Your trips, what's open, and the latest from the network."
      >
        {nextTrip && nextDate && (
          <div style={{ marginTop: 20, display: 'inline-flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.13)', borderRadius: 999, padding: '7px 8px 7px 14px', flexWrap: 'wrap' }}>
            <span className="mono" style={{ fontSize: 9, letterSpacing: '0.16em', color: 'var(--tropic)' }}>NEXT UP</span>
            <span style={{ color: '#fff', fontSize: 13, fontWeight: 500 }}>{nextLabel}</span>
            <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, fontFamily: 'var(--mono)', background: 'rgba(255,255,255,0.06)', borderRadius: 999, padding: '3px 10px' }}>
              {nextDate.dow}, {nextDate.mo} {nextDate.day}
            </span>
          </div>
        )}
      </PageHero>

      <div className="page-view" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Hero strip */}
      <div className="hero">
        {/* LEFT: My Trips */}
        <div className="panel" style={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="panel-head">
            <div className="ttl" style={{ fontFamily: 'var(--display)', fontSize: 17, fontWeight: 500, color: 'var(--ink)' }}>
              My <em>trips</em>
            </div>
            <span className="pill ink">{tripItems.length} UPCOMING</span>
          </div>

          <div className="scroll-y" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
            {loading ? (
              <div style={{ padding: '32px 0', display: 'flex', justifyContent: 'center' }}>
                <div className="pending-indicator" />
              </div>
            ) : tripItems.length === 0 ? (
              <div className="empty" style={{ padding: '32px 16px' }}>
                <svg width="32" height="32" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 13l7-1 3-7h2l-1 7 5-1 1 1.5-5 3-1 4-2 .5-1-3.5-3 0-1 .5z" />
                </svg>
                <h3>No upcoming trips</h3>
                <p>Anchor a flight or join an open excursion to get started.</p>
              </div>
            ) : (
              tripItems.map(trip => {
                if (trip.kind === 'flight') {
                  const { flight, booking } = trip
                  const dp = flight.dateParts
                  return (
                    <div key={booking.id} className={`my-trip-card s-${booking.status}`} style={{ cursor: 'pointer' }} onClick={() => router.push(`/reserve/${booking.item_id}?kind=flight${trip.roundReturn ? `&return=${trip.roundReturn.id}` : ''}`)}>
                      <div className="my-trip-card__header">
                        <div>
                          <div className="my-trip-card__title">
                            {flight.origin_code} {trip.roundReturn ? '⇄' : '→'} {flight.dest_code}
                          </div>
                          <div className="my-trip-card__sub">
                            {trip.roundReturn ? 'Round trip · ' : ''}{dp.dow}, {dp.mo} {dp.day} · {flight.departTimeStr} · {flight.durationStr}
                          </div>
                        </div>
                        <span className={statusPillClass(booking.status)}>
                          {statusLabel(booking.status)}
                        </span>
                      </div>
                      <div className="my-trip-card__body">
                        <div className="my-trip-card__row">
                          <span className="label">From</span>
                          <span>{flight.originMeta?.name ?? flight.origin_code} ({flight.origin_code})</span>
                        </div>
                        <div className="my-trip-card__row">
                          <span className="label">To</span>
                          <span>{flight.destMeta?.name ?? flight.dest_code} ({flight.dest_code})</span>
                        </div>
                        {trip.roundReturn && (
                          <div className="my-trip-card__row">
                            <span className="label">Return</span>
                            <span>{trip.roundReturn.dateParts.dow}, {trip.roundReturn.dateParts.mo} {trip.roundReturn.dateParts.day} · {trip.roundReturn.departTimeStr}</span>
                          </div>
                        )}
                        <div className="my-trip-card__row">
                          <span className="label">Seats</span>
                          <span>{booking.seats}</span>
                        </div>
                        {flight.name && (
                          <div className="my-trip-card__row">
                            <span className="label">Trip</span>
                            <span>{flight.name}</span>
                          </div>
                        )}
                      </div>
                      <div className="my-trip-card__footer">
                        <span className="my-trip-card__conf">
                          {booking.confirmation_code ?? '—'}
                        </span>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            className="btn-primary"
                            style={{ height: 30, padding: '0 12px', fontSize: 12 }}
                            onClick={e => { e.stopPropagation(); router.push(`/boarding-pass/${booking.id}`) }}
                          >
                            Boarding pass
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                } else {
                  const { excursion, booking } = trip
                  const dp = excursion.dateParts
                  const icon = excursion.templateMeta?.icon ?? 'fish'
                  return (
                    <div key={booking.id} className={`my-trip-card s-${booking.status}`} style={{ cursor: 'pointer' }} onClick={() => router.push(`/reserve/${booking.item_id}?kind=excursion`)}>
                      <div className="my-trip-card__header">
                        <div>
                          <div className="my-trip-card__title">{excursion.name}</div>
                          <div className="my-trip-card__sub">
                            {dp.dow}, {dp.mo} {dp.day}
                            {excursion.startTimeStr && excursion.startTimeStr !== '—' ? ` · ${excursion.startTimeStr}` : ''}
                            {' · '}{excursion.stay_type.replace('_', ' ')}
                          </div>
                        </div>
                        <span className={statusPillClass(booking.status)}>
                          {statusLabel(booking.status)}
                        </span>
                      </div>
                      <div className="my-trip-card__body">
                        <div className="my-trip-card__row">
                          <span className="label">Origin</span>
                          <span>{excursion.originMeta?.name ?? excursion.origin_code} ({excursion.origin_code})</span>
                        </div>
                        {excursion.templateMeta?.operator && (
                          <div className="my-trip-card__row">
                            <span className="label">Operator</span>
                            <span>{excursion.templateMeta.operator}</span>
                          </div>
                        )}
                        <div className="my-trip-card__row">
                          <span className="label">Spots</span>
                          <span>{booking.seats}</span>
                        </div>
                      </div>
                      <div className="my-trip-card__footer">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ink-mid)' }}>
                          <span style={{ color: 'var(--ink-mid)' }}>{KIND_ICONS[icon] ?? KIND_ICONS['fish']}</span>
                          <span className="my-trip-card__conf">{booking.confirmation_code ?? '—'}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            className="btn-primary"
                            style={{ height: 30, padding: '0 12px', fontSize: 12 }}
                            onClick={e => { e.stopPropagation(); router.push(`/boarding-pass/${booking.id}`) }}
                          >
                            Boarding pass
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                }
              })
            )}
          </div>
        </div>

        {/* RIGHT column: Open seats */}
        <div className="panel" style={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="panel-head">
              <div className="ttl" style={{ fontFamily: 'var(--display)', fontSize: 17, fontWeight: 500, color: 'var(--ink)' }}>
                Open <em>seats</em>
              </div>
              <span
                className="pill tropic"
                onClick={() => router.push('/seats')}
                style={{ cursor: 'pointer' }}
              >
                VIEW ALL →
              </span>
            </div>

            {/* Filter chips */}
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--hair)', display: 'flex', gap: 6 }}>
              {TYPE_FILTERS.map(f => (
                <button
                  key={f}
                  className={`chip${typeFilter === f ? ' active' : ''}`}
                  onClick={() => setTypeFilter(f)}
                  style={{ height: 26, padding: '0 10px', fontSize: 11.5 }}
                >
                  {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>

            {/* Seat items */}
            <div className="seat-list" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {loading ? (
                <div style={{ padding: '24px', display: 'flex', justifyContent: 'center' }}>
                  <div className="pending-indicator" />
                </div>
              ) : filteredOpenItems.length === 0 ? (
                <div className="empty" style={{ padding: '28px 16px' }}>
                  <p>No open {typeFilter === 'all' ? 'seats' : typeFilter} trips right now.</p>
                </div>
              ) : (
                filteredOpenItems.map(({ type, item }) => {
                  if (type === 'flight') {
                    const f = item as DisplayFlight
                    const dp = f.dateParts
                    const available = f.seatsAvailable
                    return (
                      <div
                        key={f.id}
                        className="seat-item"
                        style={{ cursor: 'pointer' }}
                        onClick={() => router.push(`/seats/${f.id}?kind=flight`)}
                      >
                        <div className="s-av" style={{ background: 'var(--tropic-glow)', color: 'var(--tropic-d)' }}>
                          {KIND_ICONS['flight']}
                        </div>
                        <div className="s-name">
                          {f.origin_code} → {f.dest_code}
                          <div style={{ fontSize: 11, color: 'var(--ink-light)', marginTop: 1 }}>
                            {dp.mo} {dp.day} · {f.departTimeStr}
                          </div>
                        </div>
                        <span className="s-meta">
                          {available} OPEN
                        </span>
                      </div>
                    )
                  } else {
                    const e = item as DisplayExcursion
                    const dp = e.dateParts
                    const available = e.spotsAvailable
                    const icon = e.templateMeta?.icon ?? 'fish'
                    return (
                      <div
                        key={e.id}
                        className="seat-item"
                        style={{ cursor: 'pointer' }}
                        onClick={() => router.push(`/seats/${e.id}?kind=excursion`)}
                      >
                        <div className="s-av" style={{ background: 'var(--sun-glow)', color: 'var(--sun-d)' }}>
                          {KIND_ICONS[icon] ?? KIND_ICONS['fish']}
                        </div>
                        <div className="s-name">
                          {e.name}
                          <div style={{ fontSize: 11, color: 'var(--ink-light)', marginTop: 1 }}>
                            {dp.mo} {dp.day} · {airportSub(e.origin_code) || e.origin_code}
                          </div>
                        </div>
                        <span className="s-meta">
                          {available} OPEN
                        </span>
                      </div>
                    )
                  }
                })
              )}
            </div>
          </div>
      </div>

      {/* Feed */}
      <div className="panel" style={{ padding: 0 }}>
        <div className="panel-head">
          <div className="ttl" style={{ fontFamily: 'var(--display)', fontSize: 17, fontWeight: 500, color: 'var(--ink)' }}>
            The <em>feed</em>
          </div>
          {newPostCount > 0 && (
            <span className="pill tropic">{newPostCount} NEW</span>
          )}
        </div>
        <div className="feed scroll-y" style={{ padding: '16px 20px', maxHeight: 620 }}>
          {loading ? (
            <div style={{ padding: '32px 0', display: 'flex', justifyContent: 'center' }}>
              <div className="pending-indicator" />
            </div>
          ) : posts.length === 0 ? (
            <div className="empty">
              <h3>Nothing in the feed yet</h3>
              <p>Posts from ops and members will appear here.</p>
            </div>
          ) : (
            posts.map(p => (
              <PostCard key={p.id} post={p} member={member} />
            ))
          )}
        </div>
      </div>
      </div>
    </div>
  )
}
