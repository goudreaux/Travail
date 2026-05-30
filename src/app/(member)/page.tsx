'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { adaptFlight, adaptExcursion, returnLegIds, fmtMoney, airportCity, DisplayFlight, DisplayExcursion } from '@/lib/data'
import { isPastBookingCutoff } from '@/lib/trip-timing'
import { KIND_ICONS, Icons } from '@/lib/icons'
import { SeatMeter } from '@/components/SeatMeter'
import { fetchRosters, RosterStack, type RosterEntry } from '@/components/Roster'
import { ProposalCard, MyProposalCommitRow, loadOpenProposals, loadMyProposalCommits, type ProposalCardData, type MyProposalCommitData } from '@/components/ProposalCard'
import { SponsorBadge } from '@/components/SponsorBadge'
import { UrgencyTag } from '@/components/UrgencyTag'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Member, Booking, ExcursionTemplate, Flight, Excursion, AnchorSubmission } from '@/lib/supabase/types'

// Full airport name for a code — members don't know codes by heart.
function placeName(code: string, names: Record<string, string>): string {
  return names[code] ?? code
}

function flightColors() {
  return { accent: 'var(--tropic-d)', bg: 'var(--tropic-glow)', dot: 'var(--tropic)' }
}
function excColors(icon: string) {
  if (icon === 'golf') return { accent: 'var(--moss)', bg: 'rgba(62,140,109,0.10)', dot: 'var(--moss)' }
  if (icon === 'quail' || icon === 'hog') return { accent: 'var(--signal)', bg: 'rgba(217,78,42,0.10)', dot: 'var(--signal)' }
  return { accent: 'var(--sun-d)', bg: 'var(--sun-glow)', dot: 'var(--sun)' }
}
const excKindLabel = (icon: string) => icon === 'golf' ? 'GOLF' : (icon === 'quail' || icon === 'hog') ? 'HUNT' : 'EXCURSION'

type TripItem =
  | { kind: 'flight'; booking: Booking; flight: DisplayFlight; roundReturn?: DisplayFlight }
  | { kind: 'excursion'; booking: Booking; excursion: DisplayExcursion }

const TYPE_FILTERS = ['all', 'sponsored', 'flight', 'fish', 'sail', 'surf', 'snorkel', 'golf', 'hunt', 'wildlife', 'leisure'] as const
type TypeFilter = typeof TYPE_FILTERS[number]

// Filter chip catalogue — matches the Seats page. Only chips with at
// least one matching active item actually render (see availableFeedFilters
// below), so the bar always reflects what's bookable.
const FEED_FILTERS: { key: TypeFilter; label: string; icon?: string; tint?: string }[] = [
  { key: 'all',       label: 'All' },
  { key: 'sponsored', label: '★ Sponsored', tint: 'var(--sun-d)' },
  { key: 'flight',   label: 'Flights',  icon: 'flight',    tint: 'var(--tropic-d)' },
  { key: 'fish',     label: 'Fishing',  icon: 'fish',      tint: 'var(--sun-d)' },
  { key: 'sail',     label: 'Sailing',  icon: 'sail',      tint: 'var(--sun-d)' },
  { key: 'surf',     label: 'Surfing',  icon: 'wave', tint: 'var(--sun-d)' },
  { key: 'snorkel',  label: 'Snorkel',  icon: 'snorkel',   tint: 'var(--sun-d)' },
  { key: 'golf',     label: 'Golf',     icon: 'golf',      tint: 'var(--moss)' },
  { key: 'hunt',     label: 'Hunting',  icon: 'quail',     tint: 'var(--signal)' },
  { key: 'wildlife', label: 'Wildlife', icon: 'croc',      tint: 'var(--sun-d)' },
  { key: 'leisure',  label: 'Leisure',  icon: 'sun',       tint: 'var(--sun-d)' },
]

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

// Map every excursion icon to its canonical filter category. New icons
// land in 'leisure' so the chip set never silently mis-categorizes.
function excursionCategory(icon: string): TypeFilter {
  switch (icon) {
    case 'fish':
    case 'lobster':    return 'fish'
    case 'sail':       return 'sail'
    case 'wave':
    case 'surfboard':  return 'surf'
    case 'snorkel':    return 'snorkel'
    case 'golf':       return 'golf'
    case 'quail':
    case 'hog':
    case 'rifle':
    case 'bow':
    case 'antlers':    return 'hunt'
    case 'croc':       return 'wildlife'
    case 'sun':        return 'leisure'
    default:           return 'leisure'
  }
}

function excursionMatchesFilter(e: DisplayExcursion, filter: TypeFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'sponsored') return !!e.sponsor
  if (filter === 'flight') return false  // flights handled separately
  const icon = e.templateMeta?.icon ?? ''
  return excursionCategory(icon) === filter
}

export default function FeedPage() {
  const [member, setMember] = useState<Member | null>(null)
  const [proposalCommits, setProposalCommits] = useState<MyProposalCommitData[]>([])
  const [flights, setFlights] = useState<DisplayFlight[]>([])
  const [excursions, setExcursions] = useState<DisplayExcursion[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [flightRosters, setFlightRosters] = useState<Record<string, RosterEntry[]>>({})
  const [excRosters, setExcRosters] = useState<Record<string, RosterEntry[]>>({})
  const [airportName, setAirportName] = useState<Record<string, string>>({})
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [loading, setLoading] = useState(true)
  // iOS Wallet-style stack: only one trip is expanded at a time. Null = "use
  // the first trip" (so the most-recent is open by default).
  const [expandedTripId, setExpandedTripId] = useState<string | null>(null)
  // Mobile-friendly collapsible sections on the feed. Everything opens
  // expanded — My Trips, Open Seats, and Open Proposals — so a member
  // sees the whole board the moment they log in, mobile included.
  // (When the board scales to many trips we can revisit collapsing
  // Open Seats / Proposals on mobile first-load to keep it scannable.)
  // Wallet-style sections. Each is independently collapsible. On DESKTOP every
  // section starts expanded (the columns layout). On MOBILE we want the iPhone
  // Wallet feel: My Trips expanded, the rest collapsed + tightly stacked — set
  // in the mount effect below so SSR/desktop are unaffected.
  const [myTripsOpen, setMyTripsOpen] = useState(true)
  const [openSeatsOpen, setOpenSeatsOpen] = useState(true)
  const [feedOpen, setFeedOpen] = useState(true)
  const [proposalsOpenInitial, setProposalsOpenInitial] = useState(true)
  // How many in-flight anchor submissions the pending-anchors strip
  // rendered. When > 0 we suppress the "nothing on the books" neg even
  // if there are no booked trips yet — a pending anchor IS something.
  const [pendingAnchorCount, setPendingAnchorCount] = useState(0)
  const supabase = createClient()
  const router = useRouter()

  // Mobile-only Wallet default: collapse everything except My Trips so the
  // member lands on a tidy stacked deck with the whole dashboard visible.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(max-width: 768px)').matches) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpenSeatsOpen(false)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFeedOpen(false)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProposalsOpenInitial(false)
    }
  }, [])

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
      // Best-effort: surface this member's live proposal commits on
      // the feed's My Trips panel. Failure is silent.
      loadMyProposalCommits(supabase, memberData.id).then(setProposalCommits).catch(() => {})

      const myId = memberData.id

      const [flightsRes, excursionsRes, bookingsRes, templatesRes, airportsRes] = await Promise.all([
        supabase.from('flights').select('*').in('status', ['open', 'full']),
        supabase.from('excursions').select('*').in('status', ['open', 'full']),
        supabase.from('bookings').select('*').eq('member_id', myId),
        supabase.from('excursion_templates').select('*'),
        supabase.from('airports').select('code, name'),
      ])

      const am: Record<string, string> = {}
      for (const a of (airportsRes.data ?? []) as { code: string; name: string }[]) am[a.code] = a.name
      setAirportName(am)

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

      // "Who's going" rosters for the open board — drives the FOMO tease.
      const [fRosters, eRosters] = await Promise.all([
        fetchRosters(supabase, 'flight', flightsData.map(f => f.id)),
        fetchRosters(supabase, 'excursion', excursionsData.map(e => e.id)),
      ])
      setFlightRosters(fRosters)
      setExcRosters(eRosters)

      setLoading(false)
    }

    load()

    // Real-time subscriptions
    const channel = supabase
      .channel('feed-realtime')
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
  // Private charters (is_private = true) are hidden from the public
  // Open Seats feed regardless of whether seats are technically
  // available — the anchor still sees them in My Trips and on their
  // boarding pass.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isPrivate = (t: any) => Boolean(t?.is_private)
  // `date >= today` is date-only; also drop anything inside the 12h booking
  // cutoff so the panel never advertises a seat that /reserve will reject
  // (mirrors the /seats board, which already hides past-cutoff trips).
  const openFlights = flights.filter(f => f.status === 'open' && f.date >= today && f.seatsAvailable > 0 && !openRetIds.has(f.id) && !isPrivate(f) && !isPastBookingCutoff(f.date, f.depart_time))
  const openExcursions = excursions.filter(e => e.status === 'open' && e.date >= today && e.spotsAvailable > 0 && !isPrivate(e) && !isPastBookingCutoff(e.date, e.depart_time ?? e.start_time))

  const filteredOpenItems = [
    ...((typeFilter === 'all' || typeFilter === 'flight') ? openFlights : [])
      .map(f => ({ type: 'flight' as const, item: f, date: f.date })),
    ...((typeFilter === 'all'
      ? openExcursions
      : typeFilter === 'flight'
        ? []
        : openExcursions.filter(e => excursionMatchesFilter(e, typeFilter))
    )).map(e => ({ type: 'excursion' as const, item: e, date: e.date })),
  ].sort((a, b) => a.date.localeCompare(b.date))

  // Only render filter chips that match at least one active item. "All"
  // is always present; "Flights" appears if there's a published flight;
  // each excursion category appears if there's at least one excursion
  // that maps to it.
  const activeFeedFilters = new Set<TypeFilter>(['all'])
  if (openFlights.length > 0) activeFeedFilters.add('flight')
  for (const e of openExcursions) {
    activeFeedFilters.add(excursionCategory(e.templateMeta?.icon ?? ''))
    if (e.sponsor) activeFeedFilters.add('sponsored')
  }
  const availableFeedFilters = FEED_FILTERS.filter(f => activeFeedFilters.has(f.key))
  // Reset the user's selection if the matching items disappear.
  const activeFeedFilterStr = [...activeFeedFilters].join(',')
  useEffect(() => {
    if (!activeFeedFilterStr.split(',').includes(typeFilter)) setTypeFilter('all')
  }, [typeFilter, activeFeedFilterStr])

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  })()

  const nextTrip = tripItems[0]
  const nextLabel = nextTrip
    ? (nextTrip.kind === 'flight'
        ? `${airportCity(nextTrip.flight.origin_code, airportName)} ${nextTrip.roundReturn ? '⇄' : '→'} ${airportCity(nextTrip.flight.dest_code, airportName)}`
        : nextTrip.excursion.name)
    : null
  const nextDate = nextTrip ? (nextTrip.kind === 'flight' ? nextTrip.flight.dateParts : nextTrip.excursion.dateParts) : null

  const firstName = member ? member.name.split(' ')[0] : null
  const now = new Date()
  const dateLabel = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()
  const timeLabel = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase()

  // Days until the next trip — drives one of the brief lines.
  const daysUntilNext = nextTrip
    ? Math.max(0, Math.round((new Date(nextTrip.kind === 'flight' ? nextTrip.flight.date : nextTrip.excursion.date).getTime() - now.getTime()) / 86400000))
    : null

  // Live concierge "brief" — a small wire that ticks through 3–4 curated lines
  // every 4s. Mix of computed (open seats, days out) and editorial copy so it
  // never feels dead.
  const totalOpen = openFlights.length + openExcursions.length
  const briefLines: string[] = []
  if (totalOpen > 0) briefLines.push(`${totalOpen} active ${totalOpen === 1 ? 'departure' : 'departures'} with open seats across the network`)
  if (nextTrip && daysUntilNext !== null) {
    briefLines.push(
      daysUntilNext === 0
        ? `Wheels up today, ${nextLabel}`
        : daysUntilNext === 1
        ? `Tomorrow, ${nextLabel}`
        : `${daysUntilNext} days out, ${nextLabel}`,
    )
  } else {
    // Cheeky nudge for members with an empty itinerary — picked once per
    // render so it doesn't feel scripted.
    const nudges = [
      'Your calendar looks suspiciously open.',
      'Pilots are caffeinated. Where to?',
      'A blank itinerary is a kind of invitation.',
      'The cabin’s prepped, just missing a passenger.',
      'Founders fly first. Pick a date.',
    ]
    briefLines.push(nudges[Math.floor(Math.random() * nudges.length)])
  }
  briefLines.push('Tomorrow’s brief lands at 6:00 a.m.')
  if (briefLines.length < 3) briefLines.push('Ops watching the wires for you')

  const [briefIdx, setBriefIdx] = useState(0)
  useEffect(() => {
    if (briefLines.length <= 1) return
    const i = setInterval(() => setBriefIdx(x => (x + 1) % briefLines.length), 8000)
    return () => clearInterval(i)
  }, [briefLines.length])

  return (
    <div className="page">
      <section className="feed-hero">
        <div className="feed-hero__glow feed-hero__glow--teal" aria-hidden />
        <div className="feed-hero__glow feed-hero__glow--sun" aria-hidden />

        {/* Top row: live status (left) + date (right) */}
        <div className="feed-hero__topline">
          <div className="feed-hero__live-chip">
            <span className="feed-hero__live-dot" aria-hidden />
            <span className="feed-hero__live-text">Live · {timeLabel} · Tampa Bay</span>
          </div>
          <div className="feed-hero__date">{dateLabel}</div>
        </div>

        {/* Refined italic greeting — smaller, single line */}
        <h1 className="feed-hero__welcome">
          <span className="feed-hero__welcome-pre">{greeting},</span>{' '}
          {firstName && <span className="feed-hero__welcome-name">{firstName}.</span>}
        </h1>

        {/* Hairline that grows in on mount */}
        <div className="feed-hero__rule" aria-hidden />

        {/* Live "brief" wire — rotating concierge lines */}
        <div className="feed-hero__brief" aria-live="polite">
          <span className="feed-hero__brief-label">The brief</span>
          <span key={briefIdx} className="feed-hero__brief-text">
            {briefLines[briefIdx]}
          </span>
        </div>

      </section>

      <div className="page-view feed-stack" style={{ display: 'flex', flexDirection: 'column', maxWidth: 1400, width: '100%' }}>
      {/* My trips (left/top) + open seats (right/bottom) */}
      <div className="dash-cols">
        {/* My Trips */}
        <div className="panel section-panel" data-collapsed={!myTripsOpen} style={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
          <button type="button" className="panel-head section-head" onClick={() => setMyTripsOpen(o => !o)} aria-expanded={myTripsOpen}>
            <div className="section-head__main">
              <div className="section-head__eyebrow section-head__eyebrow--tropic">On the board</div>
              <div className="ttl section-ttl">
                My <em>trips</em>
              </div>
            </div>
            <div className="section-head__actions">
              <span
                className="pill moss pill-pulse"
                onClick={(e) => { e.stopPropagation(); router.push('/bookings') }}
                style={{ cursor: 'pointer' }}
              >
                <span className="pill-pulse__dot" aria-hidden />
                {tripItems.length} UPCOMING
              </span>
              <span className="section-chev" aria-hidden>›</span>
            </div>
          </button>

          <div className="scroll-y" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {/* In-flight anchor submissions (awaiting review / quote ready
                / accepted) surface here so the member sees their pending
                trips on the feed without clicking into My Trips. */}
            {!loading && member && (
              <PendingAnchorsStrip memberId={member.id} airportName={airportName} onOpen={(href) => router.push(href)} onCount={setPendingAnchorCount} />
            )}
            {/* Live proposal commits — the member is tied to these
                trips (card on file) even though they aren't yet a
                bookable seat. Surface them right alongside pending
                anchors so My Trips reflects every commitment. */}
            {!loading && proposalCommits.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {proposalCommits.map(c => (
                  <MyProposalCommitRow key={c.proposalId} c={c} onOpen={() => router.push(`/reserve/${c.proposalId}?kind=proposal`)} />
                ))}
              </div>
            )}
            {loading ? (
              <div style={{ padding: '32px 0', display: 'flex', justifyContent: 'center' }}>
                <div className="pending-indicator" />
              </div>
            ) : tripItems.length === 0 && pendingAnchorCount === 0 && proposalCommits.length === 0 ? (
              <EmptyTripsNeg memberId={member?.id ?? null} onPlan={() => router.push('/plan')} />
            ) : tripItems.length === 0 ? null : (
              (() => {
                const effectiveExpanded = expandedTripId ?? tripItems[0]?.booking.id ?? null
                return (
                  <div className="my-trips-stack">
                    {tripItems.map(trip => {
                      const booking = trip.booking
                      const isExpanded = effectiveExpanded === booking.id
                      const onCardClick = (kind: 'flight' | 'excursion') => () => {
                        void kind
                        if (!isExpanded) {
                          setExpandedTripId(booking.id)
                        } else {
                          router.push(`/itinerary/${booking.id}`)
                        }
                      }
                      if (trip.kind === 'flight') {
                        const { flight } = trip
                        const dp = flight.dateParts
                        const seatsLabel = booking.seats === 1 ? '1 SEAT' : `${booking.seats} SEATS`
                        return (
                          <div
                            key={booking.id}
                            className={`my-trip-card s-${booking.status}`}
                            data-expanded={isExpanded ? '1' : '0'}
                            onClick={onCardClick('flight')}
                          >
                            <img className="my-trip-card__img" src={flight.image_url || '/trip-default.jpeg'} alt="" />
                            <div className="my-trip-card__top">
                              <div className="my-trip-card__top-row">
                                <h3 className="my-trip-card__route">
                                  <span>{airportCity(flight.origin_code, airportName)}</span>
                                  <span className="my-trip-card__route-arrow">{trip.roundReturn ? '⇄' : '→'}</span>
                                  <span>{airportCity(flight.dest_code, airportName)}</span>
                                </h3>
                                <span className={statusPillClass(booking.status)}>{statusLabel(booking.status)}</span>
                              </div>
                              <div className="my-trip-card__when">{`${dp.dow} ${dp.mo} ${dp.day}`}</div>
                              <div className="my-trip-card__meta">
                                {`${dp.dow} ${dp.mo} ${dp.day}`}
                                {flight.departTimeStr ? ` · ${flight.departTimeStr}` : ''}
                                {flight.durationStr ? ` · ${flight.durationStr}` : ''}
                                {` · ${seatsLabel}`}
                                {trip.roundReturn ? ' · ROUND TRIP' : ''}
                              </div>
                            </div>
                            <div className="my-trip-card__perf" aria-hidden>
                              <span className="my-trip-card__perf-dash" />
                            </div>
                            <div className="my-trip-card__stub">
                              <span className="my-trip-card__conf">{booking.confirmation_code ?? '—'}</span>
                              <button
                                className="btn-ghost-quiet"
                                style={{ height: 28, padding: '0 12px', fontSize: 11.5 }}
                                onClick={e => { e.stopPropagation(); router.push(`/boarding-pass/${booking.id}`) }}
                              >
                                Boarding pass →
                              </button>
                            </div>
                          </div>
                        )
                      } else {
                        const { excursion } = trip
                        const dp = excursion.dateParts
                        const operator = excursion.templateMeta?.operator
                        const spotsLabel = booking.seats === 1 ? '1 SPOT' : `${booking.seats} SPOTS`
                        return (
                          <div
                            key={booking.id}
                            className={`my-trip-card s-${booking.status}`}
                            data-expanded={isExpanded ? '1' : '0'}
                            onClick={onCardClick('excursion')}
                          >
                            <img className="my-trip-card__img" src={excursion.image_url || '/trip-default.jpeg'} alt="" />
                            <div className="my-trip-card__top">
                              <div className="my-trip-card__top-row">
                                <h3 className="my-trip-card__route"><span>{excursion.name}</span></h3>
                                <span className={statusPillClass(booking.status)}>{statusLabel(booking.status)}</span>
                              </div>
                              <div className="my-trip-card__when">{`${dp.dow} ${dp.mo} ${dp.day}`}</div>
                              <div className="my-trip-card__meta">
                                {`${dp.dow} ${dp.mo} ${dp.day}`}
                                {excursion.startTimeStr && excursion.startTimeStr !== '—' ? ` · ${excursion.startTimeStr}` : ''}
                                {operator ? ` · ${operator.toUpperCase()}` : ''}
                                {` · ${spotsLabel}`}
                              </div>
                            </div>
                            <div className="my-trip-card__perf" aria-hidden>
                              <span className="my-trip-card__perf-dash" />
                            </div>
                            <div className="my-trip-card__stub">
                              <span className="my-trip-card__conf">{booking.confirmation_code ?? '—'}</span>
                              <button
                                className="btn-ghost-quiet"
                                style={{ height: 28, padding: '0 12px', fontSize: 11.5 }}
                                onClick={e => { e.stopPropagation(); router.push(`/boarding-pass/${booking.id}`) }}
                              >
                                Boarding pass →
                              </button>
                            </div>
                          </div>
                        )
                      }
                    })}
                  </div>
                )
              })()
            )}
          </div>
        </div>

        {/* Open seats */}
        <div className="panel section-panel" data-collapsed={!openSeatsOpen} style={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
            <button type="button" className="panel-head section-head" onClick={() => setOpenSeatsOpen(o => !o)} aria-expanded={openSeatsOpen}>
              <div className="section-head__main">
                <div className="section-head__eyebrow section-head__eyebrow--sun">Live departures</div>
                <div className="ttl section-ttl">
                  Open <em>seats</em>
                </div>
              </div>
              <div className="section-head__actions">
                <span
                  className="pill tropic"
                  onClick={(e) => { e.stopPropagation(); router.push('/seats') }}
                  style={{ cursor: 'pointer' }}
                >
                  VIEW ALL →
                </span>
                <span className="section-chev" aria-hidden>›</span>
              </div>
            </button>

            {/* Filter chips — matches the Seats page: icon + label, with
                colour-tinted icons that go ink when the chip is active. */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--hair)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {availableFeedFilters.map(f => (
                <button
                  key={f.key}
                  className={`chip${typeFilter === f.key ? ' active' : ''}`}
                  onClick={() => setTypeFilter(f.key)}
                  style={{ height: 32, padding: '0 14px' }}
                >
                  {f.icon && (
                    <span style={{
                      color: typeFilter === f.key ? undefined : f.tint,
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

            {/* Cards */}
            <div className="scroll-y" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0, overflowY: 'auto' }}>
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
                    const colors = flightColors()
                    return (
                      <div key={f.id} className="trip-card" style={{ cursor: 'pointer' }} onClick={() => router.push(`/reserve/${f.id}?kind=flight`)}>
                        <div className="trip-card__main">
                          <div className="trip-card__date">
                            <div className="trip-card__date-mo">{dp.mo}</div>
                            <div className="trip-card__date-day">{dp.day}</div>
                            <div className="trip-card__date-dow">{dp.dow}</div>
                          </div>
                          <div className="trip-card__icon" style={{ background: colors.bg }}><span style={{ color: colors.dot }}>{KIND_ICONS['flight']}</span></div>
                          <div className="trip-card__content">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <div className="trip-card__title" style={{ color: colors.accent }}>FLIGHT · PRIVATE AVIATION</div>
                              <UrgencyTag date={f.date} time={f.depart_time} />
                            </div>
                            <div className="trip-card__name">{airportCity(f.origin_code, airportName)}<span style={{ color: 'var(--ink-faint)', margin: '0 6px', fontSize: 14 }}>→</span>{airportCity(f.dest_code, airportName)}</div>
                            <div className="trip-card__meta">{f.departTimeStr}{f.durationStr ? ` · ${f.durationStr}` : ''}</div>
                            <SeatMeter total={f.seats_total} available={f.seatsAvailable} accent={colors.dot} unit="seats" />
                            <RosterStack entries={flightRosters[f.id] ?? []} occupied={f.seats_total - f.seatsAvailable} />
                          </div>
                          <img className="trip-card__img" src={f.image_url || '/trip-default.jpeg'} alt="" />
                          <span className="trip-card__stamp" aria-hidden>{KIND_ICONS.flight}</span>
                        </div>
                        <div className="trip-card__cta">
                          <span style={{ color: 'var(--ink-light)', fontSize: 12 }}>{f.name || `${f.origin_code}–${f.dest_code}`}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span className="trip-card__price">{fmtMoney(f.price_per_seat)}<span style={{ fontWeight: 400, fontSize: 11, color: 'var(--ink-light)' }}>/seat</span></span>
                            <span className="cta-outline" style={{ color: colors.dot }}>Take seat →</span>
                          </div>
                        </div>
                      </div>
                    )
                  }
                  const e = item as DisplayExcursion
                  const dp = e.dateParts
                  const icon = e.templateMeta?.icon ?? 'fish'
                  const colors = excColors(icon)
                  const price = e.price_per_pax || e.templateMeta?.price_per_pax || 0
                  const isSponsored = !!e.sponsor
                  return (
                    <div key={e.id} className={`trip-card${isSponsored ? ' trip-card--sponsored' : ''}`} style={{ cursor: 'pointer' }} onClick={() => router.push(`/reserve/${e.id}?kind=excursion`)}>
                      {isSponsored && (
                        <span className="sponsored-ribbon" aria-label="Travail sponsored event">★ Travail Sponsored</span>
                      )}
                      <div className="trip-card__main">
                        <div className="trip-card__date">
                          <div className="trip-card__date-mo">{dp.mo}</div>
                          <div className="trip-card__date-day">{dp.day}</div>
                          <div className="trip-card__date-dow">{dp.dow}</div>
                        </div>
                        <div className="trip-card__icon" style={{ background: colors.bg }}><span style={{ color: colors.dot }}>{KIND_ICONS[icon] ?? KIND_ICONS['fish']}</span></div>
                        <div className="trip-card__content">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <div className="trip-card__title" style={{ color: colors.accent }}>{excKindLabel(icon)} · FROM {placeName(e.origin_code, airportName).toUpperCase()}</div>
                            <UrgencyTag date={e.date} time={e.depart_time} />
                          </div>
                          <div className="trip-card__name">{e.name}</div>
                          {isSponsored && (
                            <div style={{ marginTop: 6, maxWidth: '52%' }}>
                              <SponsorBadge sponsor={e.sponsor} size="pill" />
                              <div style={{ marginTop: 4, fontSize: 11, color: '#8a5a06', fontWeight: 700, lineHeight: 1.4 }}>
                                ✦ Special event, first to commit gets a seat.
                              </div>
                            </div>
                          )}
                          <div className="trip-card__meta">{e.startTimeStr !== '—' ? e.startTimeStr : ''}{e.templateMeta?.operator ? ` · ${e.templateMeta.operator}` : ''}</div>
                          <SeatMeter total={e.spots_total} available={e.spotsAvailable} accent={colors.dot} unit="spots" />
                          <RosterStack entries={excRosters[e.id] ?? []} occupied={e.spots_total - e.spotsAvailable} />
                        </div>
                        <img className="trip-card__img" src={e.image_url || '/trip-default.jpeg'} alt="" />
                        <span className="trip-card__stamp" aria-hidden>{KIND_ICONS[icon] ?? KIND_ICONS.fish}</span>
                      </div>
                      <div className="trip-card__cta">
                        <span style={{ color: 'var(--ink-light)', fontSize: 12 }}>{e.stay_type === 'day_trip' ? 'Day trip' : e.stay_type === 'overnight' ? 'Overnight' : 'Multi-night'}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          {price ? <span className="trip-card__price">{fmtMoney(price)}<span style={{ fontWeight: 400, fontSize: 11, color: 'var(--ink-light)' }}>/person</span></span> : null}
                          <span className="cta-outline" style={{ color: colors.dot }}>Reserve spot →</span>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
      </div>

      {/* Trip Proposals — below Open Seats per product, distinct
          visual treatment (amber/dashed) so the network reads
          "potential trips" vs. "live departures." Collapsible like
          the Open Seats panel above. */}
      <FeedProposalsSection memberId={member?.id ?? null} defaultOpen={proposalsOpenInitial} />

      {/* Feed — coming soon. Header matches the other section panels
          (eyebrow + section-ttl) so it reads as a peer, not an afterthought. */}
      <div className="panel section-panel" data-collapsed={!feedOpen} style={{ padding: 0 }}>
        <button type="button" className="panel-head section-head" onClick={() => setFeedOpen(o => !o)} aria-expanded={feedOpen}>
          <div className="section-head__main">
            <div className="section-head__eyebrow section-head__eyebrow--moss">The wire</div>
            <div className="ttl section-ttl">
              The <em>feed</em>
            </div>
          </div>
          <div className="section-head__actions">
            <span className="pill">Coming soon</span>
            <span className="section-chev" aria-hidden>›</span>
          </div>
        </button>
        <div className="feed" style={{ padding: '16px 20px', display: feedOpen ? 'block' : 'none' }}>
          <div className="empty">
            <svg width="40" height="40" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 11a7 7 0 0 1 7 7" /><path d="M4 5a13 13 0 0 1 13 13" /><circle cx="4.5" cy="17.5" r="1.2" fill="currentColor" stroke="none" />
            </svg>
            <h3>The feed is coming soon</h3>
            <p>Member stories, ops updates, and trip recaps will land here. Stay tuned.</p>
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}

// Trip Proposals strip on the main feed — uses the SAME section-panel /
// section-head / pill / chevron / chip-bar shell as the Open seats
// section above so it reads as a peer panel, not an afterthought.
// Reuses the shared ProposalCard which already mirrors the trip-card
// format used by Open Seats. Shows even when empty so the network
// always sees the "+ propose your own" entry point.
function FeedProposalsSection({ memberId, defaultOpen = true }: { memberId: string | null; defaultOpen?: boolean }) {
  const supabase = createClient()
  const router = useRouter()
  const [proposals, setProposals] = useState<ProposalCardData[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(defaultOpen)
  const [filter, setFilter] = useState<'all' | 'flight' | 'excursion' | 'mine'>('all')

  // Mirror the parent's initial state when it changes from the
  // mobile-collapse effect. After that, the user owns the toggle.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(defaultOpen)
  }, [defaultOpen])

  useEffect(() => {
    let cancelled = false
    async function go() {
      const list = await loadOpenProposals(supabase, memberId)
      if (!cancelled) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setProposals(list)
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLoading(false)
      }
    }
    go()
    return () => { cancelled = true }
  }, [memberId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sort by urgency (smallest expires_at first), then filter, then cap.
  const sorted = proposals.slice().sort((a, b) => {
    const ea = a.expires_at ? new Date(a.expires_at).getTime() : Infinity
    const eb = b.expires_at ? new Date(b.expires_at).getTime() : Infinity
    return ea - eb
  })
  const filtered = sorted.filter(p => {
    if (filter === 'all') return true
    if (filter === 'flight') return p.kind === 'flight'
    if (filter === 'excursion') return p.kind === 'excursion'
    if (filter === 'mine') return p.am_proposer || p.is_my_commit
    return true
  })
  const top = filtered.slice(0, 4)

  // The chips only show categories that have at least one proposal —
  // same pattern as Open seats' availableFeedFilters.
  const hasFlights = proposals.some(p => p.kind === 'flight')
  const hasExcursions = proposals.some(p => p.kind === 'excursion')
  const myCount = proposals.filter(p => p.am_proposer || p.is_my_commit).length
  const chips: { key: typeof filter; label: string; show: boolean }[] = [
    { key: 'all',       label: 'All',        show: true },
    { key: 'flight',    label: 'Flights',    show: hasFlights },
    { key: 'excursion', label: 'Excursions', show: hasExcursions },
    { key: 'mine',      label: 'Yours',      show: myCount > 0 },
  ]

  return (
    <div className="panel section-panel" data-collapsed={!open} style={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
      <button type="button" className="panel-head section-head" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <div className="section-head__main">
          <div className="section-head__eyebrow section-head__eyebrow--sun">Network proposals</div>
          <div className="ttl section-ttl">
            Open <em>proposals</em>
          </div>
        </div>
        <div className="section-head__actions">
          <span
            className="pill sun"
            onClick={(e) => { e.stopPropagation(); router.push('/proposals') }}
            style={{ cursor: 'pointer' }}
          >
            VIEW ALL →
          </span>
          <span className="section-chev" aria-hidden>›</span>
        </div>
      </button>

      {/* Filter chips — same layout as the Open seats chip bar above */}
      {proposals.length > 0 && (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--hair)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {chips.filter(c => c.show).map(c => {
            const active = filter === c.key
            return (
              <button
                key={c.key}
                onClick={(e) => { e.stopPropagation(); setFilter(c.key) }}
                style={{
                  padding: '6px 14px', borderRadius: 20, fontSize: 12.5,
                  fontFamily: 'var(--ui)', fontWeight: active ? 600 : 400,
                  border: `1px solid ${active ? 'var(--sun-d)' : 'var(--hair-2)'}`,
                  background: active ? 'rgba(244,167,44,0.10)' : 'transparent',
                  color: active ? 'var(--sun-d)' : 'var(--ink-light)',
                  cursor: 'pointer',
                }}
              >
                {c.label}
              </button>
            )
          })}
        </div>
      )}

      <div style={{ padding: '14px 16px 18px', display: open ? 'flex' : 'none', flexDirection: 'column', gap: 12 }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-light)', fontSize: 13 }}>Loading…</div>
        ) : proposals.length === 0 ? (
          <div style={{ padding: '24px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 13.5, color: 'var(--ink-soft)', marginBottom: 14 }}>
              No live proposals right now. Pitch a date and rally the network, you only pay if commits hit the minimum.
            </div>
            <Link href="/propose" className="cta-outline" style={{ color: 'var(--sun-d)', borderColor: 'var(--sun-d)', textDecoration: 'none' }}>
              Propose a trip →
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '16px 8px', textAlign: 'center', color: 'var(--ink-light)', fontSize: 13 }}>
            No proposals match this filter.
          </div>
        ) : (
          <>
            {top.map(p => (
              <ProposalCard key={p.id} p={p} onOpen={() => router.push(`/reserve/${p.id}?kind=proposal`)} />
            ))}
            {filtered.length > top.length && (
              <Link href="/proposals" style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--sun-d)', textDecoration: 'none', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: 8 }}>
                View all {filtered.length} proposals →
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// Empty-state copy for the My Trips section on the feed. Rotates
// through a stable (per-member, per-day) negging line so members get
// a cheeky-but-polite nudge to plan something without seeing the same
// line back-to-back. We seed off member id + the calendar date so the
// pick stays consistent through the day and rotates daily.
const EMPTY_TRIP_NEGS: { headline: string; sub: string }[] = [
  {
    headline: 'Suspiciously quiet here.',
    sub: 'Your manifest is empty. The cabin is not. Anchor a trip or take an open seat before someone else does.',
  },
  {
    headline: 'We checked twice, still nothing.',
    sub: 'The point of a private aviation club is the flying. Just saying.',
  },
  {
    headline: 'Membership is wasted on the grounded.',
    sub: 'Open seats are live. Tap below and rejoin the fun.',
  },
  {
    headline: 'Your boarding pass slot is gathering dust.',
    sub: 'Float a proposal, no risk if it doesn’t fund. Worst case: a date on the calendar.',
  },
  {
    headline: 'Wayfarers don’t sit still.',
    sub: 'A respectable adventurer’s calendar has at least one item on it. We won’t tell anyone, but consider this notice.',
  },
]

function EmptyTripsNeg({ memberId, onPlan }: { memberId: string | null; onPlan: () => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const seed = (memberId ?? 'anon') + today
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  const neg = EMPTY_TRIP_NEGS[h % EMPTY_TRIP_NEGS.length]

  return (
    <div className="empty" style={{ padding: '18px 20px 16px', textAlign: 'center' }}>
      {/* Compact empty state (F11) — with no upcoming trips this used to eat
          the whole first screen and push Open Seats below the fold. */}
      <span style={{ display: 'inline-block', opacity: 0.5, transform: 'scale(1.2)', color: 'var(--ink-light)' }} aria-hidden>
        {Icons.luggage}
      </span>
      <h3 style={{ marginTop: 8, fontFamily: 'var(--display)', fontStyle: 'italic', fontWeight: 500 }}>
        {neg.headline}
      </h3>
      <p style={{ maxWidth: 360, margin: '4px auto 12px', lineHeight: 1.5, fontSize: 13 }}>
        {neg.sub}
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button className="btn-primary" style={{ background: 'var(--sun)' }} onClick={onPlan}>
          Get away →
        </button>
      </div>
    </div>
  )
}

// Pending anchor submissions on the feed's My Trips section. Shows
// the member's in-flight anchors (awaiting review / quote ready /
// accepted) as compact status rows so they see everything they've
// submitted without leaving the feed. Loads its own data; reports the
// count up so the parent can suppress the empty-state neg when there's
// a pending anchor but no booked trips yet.
//
// Routing per state:
//   quoted          → /anchor-quote/[id]  (accept / decline lives there)
//   everything else → /bookings           (the full My Trips view)
const ANCHOR_FEED_STATES = ['pending', 'pending_ops_review', 'quoted', 'quote_accepted'] as const

function anchorFeedLabel(status: string): { label: string; pill: string; action: boolean } {
  switch (status) {
    case 'quoted':           return { label: 'QUOTE READY: REVIEW', pill: 'tropic', action: true }
    case 'quote_accepted':   return { label: 'ACCEPTED: PUBLISHING SOON', pill: 'tropic', action: false }
    case 'pending':
    case 'pending_ops_review': return { label: 'IN OPS REVIEW', pill: 'sun', action: false }
    default:                 return { label: status.toUpperCase(), pill: '', action: false }
  }
}

function PendingAnchorsStrip({
  memberId,
  airportName,
  onOpen,
  onCount,
}: {
  memberId: string
  airportName: Record<string, string>
  onOpen: (href: string) => void
  onCount: (n: number) => void
}) {
  const supabase = createClient()
  const [anchors, setAnchors] = useState<AnchorSubmission[]>([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('anchor_submissions')
        .select('*')
        .eq('member_id', memberId)
        .in('status', ANCHOR_FEED_STATES as unknown as string[])
        .order('submitted_at', { ascending: false })
      if (cancelled) return
      const rows = (data ?? []) as AnchorSubmission[]
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAnchors(rows)
      onCount(rows.length)
    }
    load()
    return () => { cancelled = true }
  }, [memberId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (anchors.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 4 }}>
      {anchors.map(a => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = (a.payload ?? {}) as any
        const meta = anchorFeedLabel(a.status as string)
        const origin = String(p.originCode ?? p.origin_code ?? '')
        const destName = String(p.destName ?? p.destCode ?? p.dest_code ?? '')
        const name = String(p.name ?? (a.kind === 'flight' ? 'Flight' : 'Excursion'))
        const date = String(p.date ?? '')
        const href = (a.status as string) === 'quoted' ? `/anchor-quote/${a.id}` : '/bookings'
        return (
          <button
            key={a.id}
            onClick={() => onOpen(href)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
              background: meta.action ? 'var(--tropic-glow)' : 'var(--paper)',
              border: `1px solid ${meta.action ? 'var(--tropic)' : 'var(--hair)'}`,
              borderRadius: 12, padding: '12px 14px', cursor: 'pointer', width: '100%',
            }}
          >
            <span style={{
              flexShrink: 0, width: 34, height: 34, borderRadius: 8,
              background: a.kind === 'flight' ? 'var(--tropic-glow)' : 'var(--sun-glow)',
              color: a.kind === 'flight' ? 'var(--tropic-d)' : 'var(--sun-d)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {a.kind === 'flight' ? KIND_ICONS.flight : KIND_ICONS.fish}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {name}
              </span>
              <span style={{ display: 'block', fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-light)', marginTop: 2 }}>
                {a.kind === 'flight' && origin ? `${placeName(origin, airportName)} → ${destName}` : (origin ? placeName(origin, airportName) : '')}
                {date ? ` · ${date}` : ''}
              </span>
            </span>
            <span className={`pill ${meta.pill}`} style={{ fontSize: 9, flexShrink: 0 }}>
              {meta.label}
            </span>
            {meta.action && (
              <span style={{ color: 'var(--tropic-d)', fontSize: 16, flexShrink: 0 }} aria-hidden>›</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
