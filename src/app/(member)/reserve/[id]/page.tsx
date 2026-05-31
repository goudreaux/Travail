'use client'
import { useState, useEffect } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { fmtDate, fmtDur, fmtMoney, fmtTime, airportCity } from '@/lib/data'
import { logActivity } from '@/lib/activity'
import { safeError } from '@/lib/pii-scrub'
import { asItinerary, fmtItineraryTime, generateDefaultItinerary, type ItineraryStep } from '@/lib/itinerary'
import { canBookSeat } from '@/lib/trip-timing'
import { KIND_ICONS } from '@/lib/icons'
import { BookingSuccessSplash } from '@/components/BookingSuccessSplash'
import { AnchorLiability } from '@/components/AnchorLiability'
import { ReservePaymentForm } from '@/components/ReservePaymentForm'
import { fetchRosters, type RosterEntry } from '@/components/Roster'
import { ProposalReserveView } from './ProposalReserveView'

// Roster avatar (image or initials) for the FOMO "who's going" block.
function rosterAvatar(e: RosterEntry, size: number) {
  if (e.avatar_url) {
    return <img src={e.avatar_url} alt={e.name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', display: 'block', border: '2px solid var(--paper)' }} />
  }
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--night)', color: 'var(--tropic)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: size * 0.34, fontWeight: 700, border: '2px solid var(--paper)', flexShrink: 0 }}>
      {e.initials}
    </div>
  )
}
import type { Member, Flight, Excursion, ExcursionTemplate } from '@/lib/supabase/types'
import { type Guest, type GuestSlot, NEW_GUEST, emptyGuestSlot } from '@/lib/guests'

const SERVICE_FEE_RATE = 0.03

function formatDateLong(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(year, month - 1, day)
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function formatPhone(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 10)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
}

// Guard the guest DOB against the "absolute nonsense" the form used to
// accept (future dates, impossible ages). DOB feeds the flight manifest,
// so it has to be a real, plausible past date. (F22)
function validateDob(dob: string): string | null {
  const d = new Date(dob + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return 'Enter a valid date of birth.'
  const now = new Date()
  if (d.getTime() > now.getTime()) return 'Date of birth can’t be in the future.'
  const years = (now.getTime() - d.getTime()) / (365.25 * 24 * 3600 * 1000)
  if (years > 120) return 'Enter a valid date of birth.'
  return null
}

function addMins(t: string | null, mins: number): string {
  if (!t) return '—'
  const [h, m] = t.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return '—'
  const total = ((h * 60 + m + mins) % 1440 + 1440) % 1440
  const hh = Math.floor(total / 60); const mm = total % 60
  const ampm = hh >= 12 ? 'PM' : 'AM'; const h12 = hh % 12 || 12
  return `${h12}:${String(mm).padStart(2, '0')} ${ampm}`
}

// Estimated block time (minutes) for a seaplane leg when the flight row has
// no duration set yet — so the reserve itinerary autofills Arrives/Block
// instead of showing "—" / "0m". Known FL city pairs first, then a sensible
// default for the network's typical hop.
const ROUTE_BLOCK_MINS: Record<string, number> = {
  'KTPF-KEYW': 75, 'KTPA-KEYW': 75, 'KTPF-LPI': 80, 'KTPA-LPI': 80,
  'KTPF-STR': 35, 'KTPA-STR': 35, 'KTPF-LCC': 55, 'KTPA-LCC': 55,
}
function estimateBlockMins(origin: string, dest: string): number {
  return ROUTE_BLOCK_MINS[`${origin}-${dest}`] ?? ROUTE_BLOCK_MINS[`${dest}-${origin}`] ?? 60
}

function Endpoint({ code, names }: { code: string; names: Record<string, string> }) {
  const name = airportCity(code, names)
  return (
    <div style={{ textAlign: 'center', minWidth: 0, flex: 1 }}>
      <div style={{ fontFamily: 'var(--ui)', fontSize: 22, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.1, letterSpacing: '-0.02em' }}>{name}</div>
    </div>
  )
}

function FlightLeg({ label, f, names }: { label?: string; f: Flight; names: Record<string, string> }) {
  const dp = fmtDate(f.date)
  // Autofill: use the row's duration when set, else estimate from the route so
  // the itinerary never shows "Arrives —" / "Block 0m".
  const blockMins = f.duration_mins && f.duration_mins > 0
    ? f.duration_mins
    : estimateBlockMins(f.origin_code, f.dest_code)
  return (
    <div>
      {label && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tropic-d)', letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 12, fontWeight: 600 }}>{label}</div>
      )}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <Endpoint code={f.origin_code} names={names} />
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <div style={{ color: 'var(--tropic-d)', fontSize: 22, fontWeight: 500 }}>→</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--ink-light)', letterSpacing: '0.12em' }}>{fmtDur(blockMins)}</div>
        </div>
        <Endpoint code={f.dest_code} names={names} />
      </div>
      <div style={{ display: 'flex', gap: 18, marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--hair-2)', flexWrap: 'wrap' }}>
        {[
          { label: 'Date', value: `${dp.dow} ${dp.mo} ${dp.day}` },
          { label: 'Departs', value: fmtTime(f.depart_time) },
          { label: 'Arrives', value: addMins(f.depart_time, blockMins) },
          { label: 'Block', value: fmtDur(blockMins) },
          { label: 'Operator', value: 'Travail Ops' },
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

export default function ReservePage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const supabase = createClient()

  const itemId = params.id as string
  const kindRaw = (searchParams.get('kind') ?? 'flight') as 'flight' | 'excursion' | 'proposal'
  // Trip Proposals own their own commit flow (SetupIntent only, no
  // immediate charge). Short-circuit here so the existing reserve
  // route doesn't try to load a flight/excursion row.
  if (kindRaw === 'proposal') return <ProposalReserveView proposalId={itemId} />
  const kind = kindRaw as 'flight' | 'excursion'
  const returnId = searchParams.get('return')

  const [member, setMember] = useState<Member | null>(null)
  const [flight, setFlight] = useState<Flight | null>(null)
  const [returnFlight, setReturnFlight] = useState<Flight | null>(null)
  const [excursion, setExcursion] = useState<Excursion | null>(null)
  const [template, setTemplate] = useState<ExcursionTemplate | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Form state
  const [seats, setSeats] = useState(1)
  const [paymentMethod] = useState<'card'>('card')
  const [savedGuests, setSavedGuests] = useState<Guest[]>([])
  const [guestSlots, setGuestSlots] = useState<GuestSlot[]>([])
  const [savingGuest, setSavingGuest] = useState<number | null>(null)
  const [airportNames, setAirportNames] = useState<Record<string, string>>({})

  // Submission state
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState<{ id: string; confirmationCode: string | null } | null>(null)
  // While the seaplane splash plays after a successful booking, we
  // hide the success card behind it. The splash dismisses itself.
  const [showSplash, setShowSplash] = useState(false)
  const [error, setError] = useState('')

  // Payment state — populated when the confirm sheet opens. clientSecret
  // is the Stripe handle that the embedded PaymentElement renders
  // against; legBreakdown is the server-derived per-leg totals we stamp
  // onto each booking row so paid_amount_cents matches what was charged.
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [paymentTotalCents, setPaymentTotalCents] = useState<number | null>(null)
  const [legBreakdown, setLegBreakdown] = useState<Array<{ itemId: string; totalCents: number }>>([])
  const [piLoading, setPiLoading] = useState(false)
  const [piError, setPiError] = useState<string | null>(null)
  // 402 from the payment route → member has no active membership. Browse-first
  // (F6): prompt them to subscribe rather than showing a dead error.
  const [piNeedsSub, setPiNeedsSub] = useState(false)
  // Saved card on the member's Stripe customer → one-tap pay (no re-enter).
  const [savedCard, setSavedCard] = useState<{ id: string; brand: string | null; last4: string | null } | null>(null)
  const [rosterPublic, setRosterPublic] = useState(true)
  const [roster, setRoster] = useState<RosterEntry[]>([])
  const [wlJoined, setWlJoined] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  // When the confirm sheet opens, ask the server for a PaymentIntent.
  // The server re-derives the total from the trip row so a tampered
  // client can't underpay. We re-fetch if the seat count changes or
  // the user closes + reopens (clientSecret expires after 24h anyway).
  // `isRoundTrip` is computed later in this component; recompute it
  // here from the same source so the effect can run early.
  const piRoundTrip = !!(returnFlight)
  const piReturnId = piRoundTrip && returnFlight ? returnFlight.id : null
  useEffect(() => {
    if (!confirmOpen) {
      setClientSecret(null)
      setPaymentTotalCents(null)
      setLegBreakdown([])
      setPiError(null)
      setPiNeedsSub(false)
      setSavedCard(null)
      return
    }
    let cancelled = false
    setPiLoading(true)
    setPiError(null)
    setPiNeedsSub(false)
    ;(async () => {
      try {
        const res = await fetch('/api/bookings/payment-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itemId,
            kind,
            seats,
            isRoundTrip: piRoundTrip,
            returnItemId: piReturnId,
          }),
        })
        const json = await res.json()
        if (cancelled) return
        if (!res.ok || !json.clientSecret) {
          if (res.status === 402) { setPiNeedsSub(true); return }
          setPiError(json.error ?? 'Could not start payment')
          return
        }
        setClientSecret(json.clientSecret)
        setPaymentTotalCents(json.totalCents)
        setSavedCard(json.savedCard ?? null)
        setLegBreakdown(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (json.breakdown as Array<any>).map(b => ({ itemId: b.itemId, totalCents: b.totalCents })),
        )
      } catch (e) {
        if (cancelled) return
        setPiError((e as Error).message ?? 'Network error')
      } finally {
        if (!cancelled) setPiLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [confirmOpen, seats, itemId, kind, piRoundTrip, piReturnId])

  // Make the device/browser Back gesture dismiss the confirm sheet and
  // return to the reservation builder — not navigate away to the feed.
  // The card form lives in a modal, which isn't its own history entry, so
  // without this Back leaves the page entirely. We push a throwaway entry
  // when the sheet opens; Back pops it (firing popstate) and just closes it.
  useEffect(() => {
    if (!confirmOpen) return
    window.history.pushState({ tvlReserveConfirm: true }, '')
    const onPop = () => setConfirmOpen(false)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [confirmOpen])

  // Closing via the × or backdrop unwinds the pushed entry too, so a later
  // Back doesn't land on a stale history state.
  const closeConfirm = () => {
    if (typeof window !== 'undefined' && (window.history.state as { tvlReserveConfirm?: boolean } | null)?.tvlReserveConfirm) {
      window.history.back()
    } else {
      setConfirmOpen(false)
    }
  }

  async function joinWaitlist() {
    if (!member) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: wlErr } = await (supabase as any).from('waitlist').insert({ member_id: member.id, item_kind: kind, item_id: itemId })
    if (!wlErr || wlErr.code === '23505') setWlJoined(true)
    else setError(wlErr.message ?? 'Could not join the waitlist.')
  }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: memberData } = await supabase
        .from('members')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (!memberData) { router.push('/login'); return }
      setMember(memberData as Member)

      // Airport code → name (for readable itinerary labels)
      const { data: airportData } = await supabase.from('airports').select('code, name')
      const am: Record<string, string> = {}
      for (const a of (airportData ?? [])) am[(a as { code: string }).code] = (a as { name: string }).name
      setAirportNames(am)

      // Member's saved guest roster (empty/erroring if the migration hasn't run yet)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: guestData } = await (supabase as any)
        .from('guests')
        .select('*')
        .eq('host_member_id', (memberData as Member).id)
        .order('first_name')
      setSavedGuests((guestData ?? []) as Guest[])

      if (kind === 'flight') {
        const { data } = await supabase.from('flights').select('*').eq('id', itemId).single()
        if (!data) { setNotFound(true); setLoading(false); return }
        setFlight(data as Flight)
        if (returnId) {
          const { data: retData } = await supabase.from('flights').select('*').eq('id', returnId).single()
          if (retData) setReturnFlight(retData as Flight)
        }
      } else {
        const [{ data: excData }, { data: templates }] = await Promise.all([
          supabase.from('excursions').select('*').eq('id', itemId).single(),
          supabase.from('excursion_templates').select('*'),
        ])
        if (!excData) { setNotFound(true); setLoading(false); return }
        setExcursion(excData as Excursion)
        const tpl = (templates ?? []).find((t: ExcursionTemplate) => t.id === (excData as Excursion).template_id)
        if (tpl) setTemplate(tpl as ExcursionTemplate)
      }

      // Who's already going (opted-in members only).
      const rosters = await fetchRosters(supabase, kind, [itemId])
      setRoster(rosters[itemId] ?? [])

      setLoading(false)
    }
    load()
  }, [itemId, kind, returnId])

  // Keep the roster live — a cancellation updates the trip row (via the booking
  // trigger), so the "who's going" list stays current without a refresh.
  useEffect(() => {
    const table = kind === 'flight' ? 'flights' : 'excursions'
    const ch = supabase
      .channel(`reserve-roster-${itemId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table, filter: `id=eq.${itemId}` }, async () => {
        const r = await fetchRosters(supabase, kind, [itemId])
        setRoster(r[itemId] ?? [])
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [itemId, kind]) // eslint-disable-line react-hooks/exhaustive-deps

  const isRoundTrip = !!(flight && returnFlight)

  // Keep one guest slot per seat beyond the member's own (seat 1).
  useEffect(() => {
    const need = Math.max(0, seats - 1)
    setGuestSlots(prev => {
      const next = prev.slice(0, need)
      while (next.length < need) next.push(emptyGuestSlot())
      return next
    })
  }, [seats])

  const updateSlot = (i: number, patch: Partial<GuestSlot>) =>
    setGuestSlots(prev => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))

  // Every guest slot must resolve to a saved guest (existing pick or one just saved).
  const guestsComplete =
    seats <= 1 ||
    (guestSlots.length === seats - 1 &&
      guestSlots.every(s => s.savedGuestId !== '' && s.savedGuestId !== NEW_GUEST))

  async function saveGuestSlot(i: number) {
    if (!member) return
    const s = guestSlots[i]
    if (!s.first_name.trim() || !s.last_name.trim()) { setError('Enter a first and last name for the guest.'); return }
    if (!s.date_of_birth) { setError('Enter the guest’s date of birth.'); return }
    const dobErr = validateDob(s.date_of_birth)
    if (dobErr) { setError(dobErr); return }
    const digits = s.phone.replace(/\D/g, '')
    if (digits.length !== 10) { setError('Enter a 10-digit phone number for the guest.'); return }
    if (/^(\d)\1{9}$/.test(digits)) { setError('Enter a real phone number for the guest.'); return }
    setError('')
    setSavingGuest(i)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from('guests').insert({
        host_member_id: member.id,
        first_name: s.first_name.trim(),
        last_name: s.last_name.trim(),
        email: s.email.trim() || null,
        phone: s.phone.trim(),
        date_of_birth: s.date_of_birth,
      }).select().single()
      if (error) throw error
      setSavedGuests(prev => [...prev, data as Guest])
      updateSlot(i, { savedGuestId: (data as Guest).id })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save guest.')
    } finally {
      setSavingGuest(null)
    }
  }

  // Derived values — true availability accounts for seats already taken.
  const flightAvail = (f: Flight) => Math.max(0, f.seats_total - f.seats_anchor - (f.seats_taken ?? 0))
  const maxSeats = flight
    ? (returnFlight
        ? Math.min(flightAvail(flight), flightAvail(returnFlight))
        : flightAvail(flight))
    : excursion
    ? Math.max(0, excursion.spots_total - excursion.spots_anchor - (excursion.spots_taken ?? 0))
    : 0
  const isFull = !loading && maxSeats <= 0

  // Member-bookable capacity (excludes anchor-held seats) so we can show how
  // many seats the trip actually has, not just the picker (F15).
  const bookableTotal = flight
    ? (returnFlight
        ? Math.min(flight.seats_total - flight.seats_anchor, returnFlight.seats_total - returnFlight.seats_anchor)
        : flight.seats_total - flight.seats_anchor)
    : excursion
    ? excursion.spots_total - excursion.spots_anchor
    : 0
  const unitWord = kind === 'flight' ? 'seat' : 'spot'

  // Booking cutoff — surface it BEFORE the member fills out the whole flow.
  // The payment endpoint enforces the same 12h gate server-side; checking it
  // here (for both legs of a round trip) means we never let someone build a
  // reservation only to be rejected at the card step. Closed wins over "full".
  const outCutoff = flight
    ? canBookSeat(flight.date, flight.depart_time)
    : excursion
    ? canBookSeat(excursion.date, excursion.depart_time ?? excursion.start_time)
    : null
  const retCutoff = returnFlight ? canBookSeat(returnFlight.date, returnFlight.depart_time) : null
  const closedReason = outCutoff && !outCutoff.ok ? outCutoff.reason : retCutoff && !retCutoff.ok ? retCutoff.reason : null
  const bookingClosed = !loading && !!closedReason

  const pricePerSeat = flight
    ? (returnFlight ? flight.price_per_seat + returnFlight.price_per_seat : flight.price_per_seat)
    : excursion?.price_per_pax ?? template?.price_per_pax ?? 0

  const subtotal = pricePerSeat * seats
  const serviceFee = Math.round(subtotal * SERVICE_FEE_RATE)
  const total = subtotal + serviceFee

  const anchorMemberId = flight?.anchor_member_id ?? excursion?.anchor_member_id

  // Route display
  const itemDate = flight?.date ?? excursion?.date ?? ''
  const itemName = flight?.name ?? excursion?.name ?? ''
  const pitch = flight?.pitch ?? excursion?.pitch ?? ''
  const departTime = flight ? fmtTime(flight.depart_time) : fmtTime(excursion?.depart_time ?? null)
  const durationStr = flight ? fmtDur(flight.duration_mins) : (excursion?.stay_type === 'day_trip' ? 'Day trip' : excursion?.stay_type === 'overnight' ? 'Overnight' : 'Multi-night')

  // handleSubmit fires after stripe.confirmPayment has already cleared
  // the card. The PaymentIntent id is stamped onto the outbound booking
  // and the per-leg paid amounts come from the server-computed
  // breakdown so we never trust the client with money math.
  async function handleSubmit(paymentIntentId: string) {
    if (!member) return
    setError('')

    if (seats > 1) {
      for (const s of guestSlots) {
        if (!s.savedGuestId) { setError('Select or add a guest for every additional seat.'); return }
        if (s.savedGuestId === NEW_GUEST && (!s.first_name.trim() || !s.last_name.trim() || !s.date_of_birth)) {
          setError('Enter a first name, last name, and date of birth for each new guest.'); return
        }
        if (s.savedGuestId === NEW_GUEST && !s.email.trim()) {
          // Email is required on new guests so ops can follow up about
          // membership conversion + keep ride-day comms going to them
          // directly. Empty is no longer acceptable.
          setError('Enter an email address for each new guest, we use it to follow up about membership.'); return
        }
        if (s.savedGuestId === NEW_GUEST && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email.trim())) {
          setError('Please enter a valid email for each new guest.'); return
        }
      }
    }

    setSubmitting(true)

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any

      // 1. Resolve guests — insert new ones into the member's roster so they're reusable.
      type Pax = { guest_id: string; first_name: string; last_name: string; email: string | null; phone: string | null; date_of_birth: string | null }
      const guestPax: Pax[] = []
      for (const s of guestSlots) {
        if (s.savedGuestId === NEW_GUEST) {
          const { data: g, error: gErr } = await db.from('guests').insert({
            host_member_id: member.id,
            first_name: s.first_name.trim(),
            last_name: s.last_name.trim(),
            email: s.email.trim() || null,
            phone: s.phone.trim() || null,
            date_of_birth: s.date_of_birth || null,
          }).select().single()
          if (gErr) throw gErr
          guestPax.push({ guest_id: g.id, first_name: g.first_name, last_name: g.last_name, email: g.email, phone: g.phone, date_of_birth: g.date_of_birth })
        } else {
          const g = savedGuests.find(x => x.id === s.savedGuestId)
          if (g) guestPax.push({ guest_id: g.id, first_name: g.first_name, last_name: g.last_name, email: g.email, phone: g.phone, date_of_birth: g.date_of_birth })
        }
      }

      // 2. Create booking(s) — one per leg for round-trips. The card has
      //    already been charged for the full total; we stamp the PI id
      //    on the outbound row and split paid_amount_cents per leg using
      //    the server breakdown. Status goes straight to 'approved' —
      //    no Ops gate because payment cleared.
      const paidAtIso = new Date().toISOString()
      const paidFor = (legItemId: string) =>
        legBreakdown.find(b => b.itemId === legItemId)?.totalCents ?? 0

      let bookingIds: string[] = []
      let primary: { id: string; confirmation_code: string | null }

      const stamp = Date.now().toString(36).toUpperCase()

      if (isRoundTrip && flight && returnFlight) {
        const rows = [flight, returnFlight].map((leg, idx) => {
          const sub = leg.price_per_seat * seats
          const fee = Math.round(sub * SERVICE_FEE_RATE)
          return {
            id: `B-${stamp}${idx === 0 ? '' : 'R'}`,
            member_id: member.id, item_kind: 'flight', item_id: leg.id, seats,
            price_per_seat: leg.price_per_seat, fees: fee, total: sub + fee,
            payment_method: paymentMethod, status: 'approved', show_on_roster: rosterPublic,
            // PI lives on the outbound only (the index is unique). The
            // return booking still records what was paid so settlement
            // math reads the same.
            stripe_payment_intent_id: idx === 0 ? paymentIntentId : null,
            paid_amount_cents: paidFor(leg.id),
            paid_at: paidAtIso,
            payment_status: 'succeeded',
          }
        })
        const { data: rowsData, error: insertError } = await supabase.from('bookings').insert(rows as never).select()
        if (insertError) throw insertError
        const arr = rowsData as { id: string; confirmation_code: string | null }[]
        bookingIds = arr.map(r => r.id)
        primary = arr[0]
      } else {
        const { data: bookingRaw, error: insertError } = await supabase
          .from('bookings')
          .insert({
            id: `B-${stamp}`,
            member_id: member.id, item_kind: kind, item_id: itemId, seats,
            price_per_seat: pricePerSeat, fees: serviceFee, total,
            payment_method: paymentMethod, status: 'approved', show_on_roster: rosterPublic,
            stripe_payment_intent_id: paymentIntentId,
            paid_amount_cents: paidFor(itemId),
            paid_at: paidAtIso,
            payment_status: 'succeeded',
          } as never)
          .select()
          .single()
        if (insertError) throw insertError
        primary = bookingRaw as { id: string; confirmation_code: string | null }
        bookingIds = [primary.id]
      }

      // 3. Record passengers (the member is always seat 1) on every leg.
      const [hostFirst, ...hostRest] = member.name.trim().split(/\s+/)
      const paxRows = bookingIds.flatMap(bid => [
        { booking_id: bid, guest_id: null, is_host: true, first_name: hostFirst ?? member.name, last_name: hostRest.join(' '), email: null, phone: null, date_of_birth: null },
        ...guestPax.map(gp => ({
          booking_id: bid, guest_id: gp.guest_id, is_host: false,
          first_name: gp.first_name, last_name: gp.last_name, email: gp.email, phone: gp.phone, date_of_birth: gp.date_of_birth,
        })),
      ])
      // Best-effort: the booking is the source of truth; don't fail it if the
      // manifest table isn't present yet.
      try {
        const { error: paxErr } = await db.from('booking_passengers').insert(paxRows)
        if (paxErr) throw paxErr
      } catch (paxErr) {
        safeError('Passenger manifest not recorded:', paxErr)
      }

      // 4. Notify (best-effort — booking already succeeded).
      try {
        const { error: notifErr } = await supabase.from('notifications').insert({
          member_id: member.id,
          kind: 'booking',
          title: isRoundTrip ? 'Round-trip booking confirmed' : 'Booking confirmed',
          body: `Your reservation for "${itemName}"${seats > 1 ? ` (${seats} seats)` : ''} is confirmed and your card has been charged ${fmtMoney(paymentTotalCents != null ? paymentTotalCents / 100 : total)}.`,
          ref: { kind, id: itemId, booking_id: primary.id },
          read: false,
        } as never)
        if (notifErr) throw notifErr
      } catch (notifErr) {
        safeError('Booking notification not recorded:', notifErr)
      }

      // Fire-and-forget branded receipt email. Stripe's auto receipt
      // also lands separately; this one carries Travail context
      // (trip name, confirmation code, boarding-pass deep link,
      // cancel policy). Never blocks the booking flow.
      for (const bid of bookingIds) {
        try {
          await fetch('/api/bookings/send-receipt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bookingId: bid }),
          })
        } catch { /* receipt failure is non-blocking */ }
      }

      logActivity({
        action: 'booking_submitted', actor_kind: 'member', actor_member_id: member.id,
        subject_member_id: member.id, booking_id: primary.id,
        item_kind: kind, item_id: itemId,
        summary: `${member.name} requested ${isRoundTrip ? 'round-trip ' : ''}${kind} "${itemName}"${seats > 1 ? ` (${seats} seats)` : ''}`,
        meta: { seats, round_trip: isRoundTrip, total },
      })

      setSubmitted({ id: primary.id, confirmationCode: primary.confirmation_code })
      // Play the seaplane splash; the success card sits beneath and
      // becomes visible when the splash dismisses itself.
      setShowSplash(true)
    } catch (err: unknown) {
      const msg = err instanceof Error
        ? err.message
        : (err && typeof err === 'object' && 'message' in err)
          ? String((err as { message: unknown }).message)
          : 'Something went wrong. Please try again.'
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  // ── States ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="page">
        <div className="page-view" style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
          <div className="empty">
            <div className="pending-indicator" />
            <p>Loading reservation…</p>
          </div>
        </div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="page">
        <div className="page-view">
          <div className="empty">
            <h3>Trip not found.</h3>
            <p>This departure no longer exists or has been cancelled.</p>
            <Link href="/seats" className="btn-ghost" style={{ marginTop: 8 }}>Back to open seats</Link>
          </div>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="page">
        {showSplash && (
          <BookingSuccessSplash
            caption={kind === 'flight' ? 'Flight requested' : 'Excursion requested'}
            sub="Ops will confirm shortly."
            onDone={() => setShowSplash(false)}
          />
        )}
        <div className="page-view" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 500 }}>
          <div style={{
            background: 'var(--card)',
            border: '1px solid var(--hair)',
            borderRadius: 18,
            padding: '48px 52px',
            maxWidth: 500,
            width: '100%',
            textAlign: 'center',
            boxShadow: '0 8px 40px rgba(13,51,64,0.08)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 24 }}>
              <div className="pending-indicator" />
              <span className="mono" style={{ color: 'var(--tropic-d)' }}>Pending Ops review</span>
            </div>
            <h2 className="display-i" style={{ fontSize: 34, color: 'var(--ink)', margin: '0 0 14px' }}>
              You're in the queue.
            </h2>
            <p style={{ fontSize: 14, color: 'var(--ink-light)', lineHeight: 1.65, margin: '0 0 8px' }}>
              Your seat{seats > 1 ? 's' : ''} on <strong>{itemName}</strong> {seats > 1 ? 'are' : 'is'} reserved pending Ops confirmation.
            </p>
            <p style={{ fontSize: 13, color: 'var(--ink-faint)', lineHeight: 1.5, margin: '0 0 32px' }}>
              Your card will only be captured when Ops confirms the flight manifest.
            </p>

            <div style={{
              background: 'var(--warm)',
              borderRadius: 10,
              padding: '14px 18px',
              marginBottom: 12,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span className="mono">Booking ID</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', color: 'var(--ink)' }}>
                {submitted.id.slice(0, 8).toUpperCase()}
              </span>
            </div>

            <div style={{
              background: 'var(--night)',
              borderRadius: 10,
              padding: '14px 18px',
              marginBottom: 28,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span className="mono" style={{ color: 'rgba(255,255,255,0.5)' }}>Total held</span>
              <span style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 500, color: '#fff' }}>
                {fmtMoney(total)}
              </span>
            </div>

            <div style={{ display: 'flex', gap: 10, flexDirection: 'column' }}>
              <button className="btn-ghost" style={{ width: '100%' }} onClick={() => router.push('/bookings')}>
                View my trips
              </button>
              <button className="btn-ghost" style={{ width: '100%' }} onClick={() => router.push('/seats')}>
                Back to open seats
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const dp = fmtDate(itemDate)

  // ── Booking cutoff → locked ─────────────────────────────────────────────────
  if (bookingClosed) {
    return (
      <div className="page">
        <div className="page-view" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 460 }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 18, padding: '44px 48px', maxWidth: 460, width: '100%', textAlign: 'center', boxShadow: '0 8px 40px rgba(13,51,64,0.08)' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--sun-d)', marginBottom: 10 }}>Booking closed</div>
            <h2 className="display-i" style={{ fontSize: 28, color: 'var(--ink)', margin: '0 0 8px' }}>Too close to takeoff.</h2>
            <p style={{ fontSize: 14, color: 'var(--ink-light)', lineHeight: 1.6, margin: '0 0 24px' }}>
              {closedReason}
            </p>
            <button className="btn-ghost" style={{ width: '100%' }} onClick={() => router.push('/seats')}>Back to open seats</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Full trip → waitlist ────────────────────────────────────────────────────
  if (isFull) {
    return (
      <div className="page">
        <div className="page-view" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 460 }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 18, padding: '44px 48px', maxWidth: 460, width: '100%', textAlign: 'center', boxShadow: '0 8px 40px rgba(13,51,64,0.08)' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--sun-d)', marginBottom: 10 }}>Fully booked</div>
            <h2 className="display-i" style={{ fontSize: 28, color: 'var(--ink)', margin: '0 0 8px' }}>{itemName || 'This trip'} is full.</h2>
            <p style={{ fontSize: 14, color: 'var(--ink-light)', lineHeight: 1.6, margin: '0 0 24px' }}>
              {kind === 'flight' && flight ? `${flight.origin_code} → ${flight.dest_code} · ` : ''}{dp ? `${dp.mo} ${dp.day}` : ''}. Join the waitlist and Ops will offer you the next seat that opens up.
            </p>
            {error && (
              <div style={{ background: 'rgba(217,78,42,0.08)', border: '1px solid rgba(217,78,42,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--signal)', marginBottom: 14 }}>{error}</div>
            )}
            {wlJoined ? (
              <div style={{ background: 'var(--tropic-glow)', borderRadius: 10, padding: '12px 16px', fontSize: 13.5, color: 'var(--tropic-d)', marginBottom: 16 }}>
                You&rsquo;re on the waitlist, we&rsquo;ll be in touch.
              </div>
            ) : (
              <button className="btn-ghost" style={{ width: '100%', height: 44, justifyContent: 'center', marginBottom: 10 }} onClick={joinWaitlist}>
                Join the waitlist
              </button>
            )}
            <button className="btn-ghost" style={{ width: '100%' }} onClick={() => router.push('/seats')}>Back to open seats</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Main reservation builder ────────────────────────────────────────────────

  return (
    <div className="page">
      <div className="page-view">
        <div className="builder">
          {/* ── LEFT: Form ── */}
          <div className="builder-form">
            {/* Trip hero image — matches the open-seats card it was tapped from.
                On mobile this bleeds edge-to-edge under the top bar (Airbnb-style). */}
            {(() => {
              const heroSrc = (kind === 'flight' ? flight?.image_url : excursion?.image_url) || '/trip-default.jpeg'
              return (
                <div className="reserve-hero">
                  <img
                    src={heroSrc}
                    alt=""
                    loading="eager"
                    decoding="async"
                    fetchPriority="high"
                  />
                  <button
                    type="button"
                    className="reserve-hero__back"
                    aria-label="Back"
                    onClick={() => router.back()}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="19" y1="12" x2="5" y2="12" />
                      <polyline points="12 19 5 12 12 5" />
                    </svg>
                  </button>
                </div>
              )
            })()}

            <div className="reserve-sheet">
            {/* Back link + header */}
            <div style={{ marginBottom: 4 }}>
              <h1 style={{
                fontFamily: 'var(--display)',
                fontStyle: 'italic',
                fontSize: 34,
                fontWeight: 500,
                letterSpacing: '-0.015em',
                lineHeight: 1.05,
                color: 'var(--ink)',
                margin: '0 0 6px',
              }}>
                Reserve your seat.
              </h1>
              {kind === 'flight' && flight ? (
                <p style={{ fontSize: 13, color: 'var(--ink-light)', margin: 0 }}>
                  {airportCity(flight.origin_code, airportNames)} {isRoundTrip ? '⇄' : '→'} {airportCity(flight.dest_code, airportNames)}{isRoundTrip ? ' · round trip' : ''} · {dp.dow}, {dp.mo} {dp.day} · Hosted by{' '}
                  <span style={{ color: 'var(--ink)' }}>Travail Ops</span>
                </p>
              ) : excursion ? (
                <p style={{ fontSize: 13, color: 'var(--ink-light)', margin: 0 }}>
                  {airportCity(excursion.origin_code, airportNames)} · {dp.dow}, {dp.mo} {dp.day}
                  {template?.operator ? ` · ${template.operator}` : ''}
                </p>
              ) : null}
            </div>

            {/* Pitch — pull-quote on the paper bg (no box) */}
            {pitch && (
              <div style={{ position: 'relative', padding: '14px 14px 14px 44px' }}>
                <div
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: -10,
                    fontFamily: 'var(--display)',
                    fontStyle: 'italic',
                    fontSize: 90,
                    lineHeight: 1,
                    color: 'rgba(13,51,64,0.16)',
                    pointerEvents: 'none',
                  }}
                >
                  &ldquo;
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--tropic-d)', marginBottom: 8 }}>
                  {anchorMemberId ? 'Why you should come' : 'The pitch'}
                </div>
                <p style={{ margin: 0, fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 21, lineHeight: 1.4, color: 'var(--ink)' }}>
                  {pitch}
                </p>
              </div>
            )}

            {/* Anchor liability ticker — visible only to the anchor.
                Live readout of what they owe at settlement given current
                bookings, plus the floor (their own seats only) if the
                trip fills. */}
            {member && anchorMemberId === member.id && (() => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const trip: any = flight ?? excursion
              if (!trip || !trip.anchor_captured_cents) return null
              const seatsTotal = (trip.seats_total ?? trip.spots_total ?? 0) as number
              const seatsAnchor = (trip.seats_anchor ?? trip.spots_anchor ?? 0) as number
              const seatsTaken = (trip.seats_taken ?? trip.spots_taken ?? 0) as number
              // Paid revenue ≈ pax seats sold × per-seat price. We use
              // the trip's published price_per_seat rather than summing
              // bookings client-side (RLS doesn't let an anchor see
              // others' booking rows directly). Forfeits are folded in
              // because their booking row stays counted in seats_taken
              // even when status=cancelled with was_forfeit=true (the
              // capacity trigger only decrements active seats).
              const perSeat = (trip.price_per_seat ?? trip.price_per_pax ?? 0) as number
              const paidPaxSeats = Math.max(0, seatsTaken - seatsAnchor)
              const paidRevenueCents = paidPaxSeats * perSeat * 100
              return (
                <div style={{ marginBottom: 18 }}>
                  <AnchorLiability
                    charterTotalCents={trip.anchor_captured_cents}
                    paidRevenueCents={paidRevenueCents}
                    seatsTotal={seatsTotal}
                    seatsAnchor={seatsAnchor}
                    seatsTaken={seatsTaken}
                  />
                </div>
              )
            })()}

            {/* 1. Itinerary display */}
            <div>
              <div className="field-lab" style={{ marginBottom: 10 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-light)', fontWeight: 600 }}>
                  1 · Itinerary
                </span>
              </div>
              <div className="reserve-card">
                {kind === 'flight' && flight ? (
                  isRoundTrip && returnFlight ? (
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
                    <div>
                      <div style={{ fontFamily: 'var(--ui)', fontSize: 22, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.1, letterSpacing: '-0.02em', marginBottom: 6 }}>
                        {excursion.name}
                      </div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-light)', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600 }}>
                        From {airportCity(excursion.origin_code, airportNames)} · {excursion.stay_type.replace('_', ' ')}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 20, marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--hair-2)', flexWrap: 'wrap' }}>
                      {[
                        { label: 'Date', value: `${dp.dow} ${dp.mo} ${dp.day}` },
                        { label: 'Departs', value: departTime },
                        { label: 'Duration', value: durationStr },
                        { label: 'Operator', value: template?.operator ?? 'Travail Ops' },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--ink-light)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 3, fontWeight: 600 }}>
                            {label}
                          </div>
                          <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}>
                            {value}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            {/* Day plan — excursions only. Bubble-down timeline of the
                major stops. Falls back to a generated default when the
                stored itinerary is null so members always see a plan;
                Ops edits to confirm before publish. */}
            {kind === 'excursion' && excursion && (() => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const stored = asItinerary((excursion as any).itinerary)
              const steps: ItineraryStep[] = stored.length > 0
                ? stored
                : generateDefaultItinerary({
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
              const allTBD = stored.length === 0 && steps.every(s => !s.time)
              return (
                <div>
                  <div className="field-lab" style={{ marginBottom: 10 }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-light)', fontWeight: 600 }}>
                      2 · Day plan
                    </span>
                    {allTBD && (
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.10em', color: 'var(--sun-d)', marginLeft: 10, fontWeight: 700 }}>
                        OPS CONFIRMS · TIMES MAY ADJUST
                      </span>
                    )}
                  </div>
                  <ol className="dayplan">
                    {steps.map((s, i) => (
                      <li
                        key={i}
                        className="dayplan__step"
                        style={{ animationDelay: `${i * 90}ms` }}
                      >
                        <span className="dayplan__rail" aria-hidden />
                        <span className="dayplan__dot" aria-hidden>
                          {s.icon && KIND_ICONS[s.icon] ? KIND_ICONS[s.icon] : <span className="dayplan__num">{i + 1}</span>}
                        </span>
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

            {/* Who's going — FOMO */}
            {roster.length > 0 && (() => {
              const totalGoing = roster.reduce((s, e) => s + e.seats, 0)
              const names = roster.map(e => e.name.split(' ')[0])
              const headline = names.length === 1
                ? `${names[0]} is going`
                : names.length === 2
                ? `${names[0]} & ${names[1]} are going`
                : `${names[0]}, ${names[1]} & ${names.length - 2} other${names.length - 2 > 1 ? 's' : ''} are going`
              return (
                <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 14, padding: '18px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ display: 'flex' }}>
                      {roster.slice(0, 5).map((e, i) => (
                        <div key={e.member_id} style={{ marginLeft: i === 0 ? 0 : -12, zIndex: 10 - i }}>
                          {rosterAvatar(e, 42)}
                        </div>
                      ))}
                      {roster.length > 5 && (
                        <div style={{ marginLeft: -12, width: 42, height: 42, borderRadius: '50%', background: 'var(--warm)', border: '2px solid var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--ink-mid)' }}>
                          +{roster.length - 5}
                        </div>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="display-i" style={{ fontSize: 18, color: 'var(--ink)', lineHeight: 1.2 }}>{headline}</div>
                      <div style={{ fontSize: 11, color: 'var(--tropic-d)', fontFamily: 'var(--mono)', letterSpacing: '0.06em', marginTop: 3 }}>
                        {totalGoing} ON THE MANIFEST · JOIN THEM
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                    {roster.map(e => (
                      <Link key={e.member_id} href={`/network/${e.member_id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'var(--warm)', borderRadius: 20, padding: '3px 12px 3px 3px', textDecoration: 'none' }}>
                        {rosterAvatar(e, 22)}
                        <span style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 500 }}>{e.name}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )
            })()}

            {/* 2. Seats picker */}
            <div className="field">
              <div className="field-lab">
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-light)', fontWeight: 600 }}>
                  2 · {kind === 'flight' ? 'Seats' : 'Spots'}
                </span>
              </div>
              {maxSeats > 0 && bookableTotal > 0 && (
                <div style={{ fontSize: 11.5, color: 'var(--ink-light)', fontFamily: 'var(--mono)', letterSpacing: '0.04em', margin: '0 0 8px' }}>
                  {maxSeats} of {bookableTotal} {bookableTotal === 1 ? unitWord : `${unitWord}s`} open
                </div>
              )}
              <div className="chips">
                {Array.from({ length: Math.min(maxSeats, 8) }, (_, i) => i + 1).map(n => (
                  <button
                    key={n}
                    className={`chip${seats === n ? ' active' : ''}`}
                    onClick={() => setSeats(n)}
                    style={{ minWidth: 52 }}
                  >
                    {n}
                  </button>
                ))}
              </div>
              {maxSeats === 0 && (
                <p style={{ fontSize: 12, color: 'var(--signal)', margin: '4px 0 0' }}>
                  This {kind} is currently full.
                </p>
              )}
              {maxSeats > 1 && seats === 1 && (
                <p style={{ fontSize: 12, color: 'var(--ink-light)', margin: '8px 0 0' }}>
                  Bringing guests? You&rsquo;re seat 1, add a seat for each guest and you&rsquo;ll register them below.
                </p>
              )}
            </div>

            {/* 2b. Guest registration */}
            {seats > 1 && (
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-light)', fontWeight: 600, marginBottom: 6 }}>
                  Guests · {seats - 1}
                </div>
                <p style={{ fontSize: 12.5, color: 'var(--ink-light)', margin: '0 0 12px', lineHeight: 1.5 }}>
                  You hold seat 1. Register {seats - 1} guest{seats - 1 !== 1 ? 's' : ''}: pick from your saved guests, or add a new one and tap <strong>Save guest</strong>. New guests are saved for next time.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {guestSlots.map((slot, i) => {
                    const selected = slot.savedGuestId && slot.savedGuestId !== NEW_GUEST
                      ? savedGuests.find(g => g.id === slot.savedGuestId)
                      : undefined
                    return (
                      <div key={i} style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 10, padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: slot.savedGuestId ? 12 : 0 }}>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-mid)', letterSpacing: '0.1em' }}>GUEST {i + 1}</span>
                          <select
                            className="select"
                            style={{ maxWidth: 240 }}
                            value={slot.savedGuestId}
                            onChange={e => updateSlot(i, { savedGuestId: e.target.value })}
                          >
                            <option value="">Select a guest…</option>
                            {savedGuests.map(g => (
                              <option key={g.id} value={g.id}>{g.first_name} {g.last_name}</option>
                            ))}
                            <option value={NEW_GUEST}>+ Add new guest</option>
                          </select>
                        </div>

                        {slot.savedGuestId === NEW_GUEST && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                              <input className="input" placeholder="First name *" value={slot.first_name} onChange={e => updateSlot(i, { first_name: e.target.value })} />
                              <input className="input" placeholder="Last name *" value={slot.last_name} onChange={e => updateSlot(i, { last_name: e.target.value })} />
                              <input className="input" type="email" placeholder="Email *" value={slot.email} onChange={e => updateSlot(i, { email: e.target.value })} />
                              <input className="input" inputMode="numeric" maxLength={12} placeholder="Phone * (xxx-xxx-xxxx)" value={slot.phone} onChange={e => updateSlot(i, { phone: formatPhone(e.target.value) })} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <label style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-light)' }}>Date of birth *</label>
                              <input className="input" type="date" max={new Date().toISOString().slice(0, 10)} value={slot.date_of_birth} onChange={e => updateSlot(i, { date_of_birth: e.target.value })} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                              <button
                                className="btn-primary"
                                style={{ height: 32, padding: '0 16px', fontSize: 12.5 }}
                                onClick={() => saveGuestSlot(i)}
                                disabled={savingGuest === i}
                              >
                                {savingGuest === i ? 'Saving…' : 'Save guest'}
                              </button>
                            </div>
                          </div>
                        )}

                        {selected && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ink-mid)' }}>
                            <span style={{ color: 'var(--moss)' }}>✓</span>
                            <span>{selected.first_name} {selected.last_name}{selected.phone ? ` · ${selected.phone}` : ''}{selected.email ? ` · ${selected.email}` : ''}</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 3. Passenger profile */}
            {member && (
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-light)', fontWeight: 600, marginBottom: 10 }}>
                  3 · Passenger
                </div>
                {/* Compact confirmation — members told us the full profile
                    card here was needless ("I know I'm the passenger"). Just
                    confirm who's flying. (F14/F20) */}
                <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ fontSize: 14, color: 'var(--ink)' }}>
                    Flying as <strong>{member.name}</strong>{seats > 1 ? ' · seat 1' : ''}
                  </div>
                  {member.kyc_verified && (
                    <span className="pill moss" style={{ fontSize: 9, height: 17, flexShrink: 0 }}>Verified</span>
                  )}
                </div>
              </div>
            )}

            {/* 4. Payment */}
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-light)', fontWeight: 600, marginBottom: 10 }}>
                4 · Payment
              </div>
              {/* Pax checkout collects/confirms the card via Stripe at the
                  confirm step — there's no stored "card on file" gate here.
                  Clean payment-method row instead of plain text. */}
              <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 13 }}>
                <div style={{ width: 42, height: 30, borderRadius: 7, background: 'linear-gradient(135deg,#0a3340 0%,#073744 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} aria-hidden>
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#5fc7d6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="5" width="20" height="14" rx="2" />
                    <line x1="2" y1="10" x2="22" y2="10" />
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                    {member?.card_last4 ? `Card ending in ${member.card_last4}` : 'Secure checkout'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-light)', marginTop: 2, lineHeight: 1.45 }}>
                    {member?.card_last4 ? 'Confirm or update it on the next step.' : 'Add your card on the next step.'} Nothing&rsquo;s charged until you tap Pay.
                  </div>
                </div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', flexShrink: 0 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="4" y="11" width="16" height="10" rx="2" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                  </svg>
                  Stripe
                </span>
              </div>
            </div>

            {/* 5. Flight roster visibility */}
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-light)', fontWeight: 600, marginBottom: 10 }}>
                5 · Flight roster
              </div>
              <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 10, overflow: 'hidden' }}>
                <div
                  className="toggle-row"
                  style={{ padding: '13px 16px', cursor: 'pointer' }}
                  role="checkbox"
                  aria-checked={rosterPublic}
                  onClick={() => setRosterPublic(v => !v)}
                >
                  <div>
                    <div className="t-lab">{rosterPublic ? 'Public, listed on the roster' : 'Private, hidden'}</div>
                    <div className="t-sub">
                      {rosterPublic
                        ? 'Other members can see you’re on this trip and open your profile.'
                        : 'You won’t appear on this trip’s roster. Guests are always private.'}
                    </div>
                  </div>
                  <div className={`toggle${rosterPublic ? ' active' : ''}`} />
                </div>
              </div>
            </div>

            {/* Subtle running price summary — so the breakdown + total are
                visible before the member commits to Reserve. Hairline only,
                no heavy box. Updates live with the seat count. */}
            <div style={{ borderTop: '1px solid var(--hair)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--ink-light)' }}>
                <span>{seats} {seats === 1 ? unitWord : `${unitWord}s`} × {fmtMoney(pricePerSeat)}</span>
                <span>{fmtMoney(subtotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--ink-light)' }}>
                <span>Service fee (3%)</span>
                <span>{fmtMoney(serviceFee)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 1 }}>
                <span style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}>Total</span>
                <span style={{ fontFamily: 'var(--ui)', fontSize: 17, color: 'var(--ink)', fontWeight: 700, letterSpacing: '-0.01em' }}>{fmtMoney(total)}</span>
              </div>
            </div>

            {error && (
              <div style={{
                background: 'rgba(217,78,42,0.08)',
                border: '1px solid rgba(217,78,42,0.2)',
                borderRadius: 8,
                padding: '10px 14px',
                fontSize: 13,
                color: 'var(--signal)',
              }}>
                {error}
              </div>
            )}

            {/* Why-disabled hint — without this the Reserve button just sits
                greyed out with no explanation when a guest slot is unfilled (F21). */}
            {seats > 1 && !guestsComplete && (
              <p style={{ fontSize: 12.5, color: 'var(--sun-d)', fontWeight: 600, margin: '0 0 -2px' }}>
                Register a guest for each added seat to continue — every seat needs a passenger.
              </p>
            )}

            {/* Desktop CTA — sticky bar handles mobile. Opens the confirm sheet. */}
            <button
              className="btn-primary reserve-inline-submit"
              style={{ width: '100%', height: 50, fontSize: 15, justifyContent: 'center', marginTop: 4 }}
              onClick={() => setConfirmOpen(true)}
              disabled={submitting || maxSeats === 0 || !guestsComplete}
            >
              {maxSeats === 0 ? 'Fully booked' : `Reserve seat${seats !== 1 ? 's' : ''} · ${fmtMoney(total)}`}
            </button>

            {/* Bottom-pad on mobile so the sticky CTA bar doesn't cover anything. */}
            <div className="reserve-page-pad" aria-hidden />
            </div>
          </div>
        </div>
      </div>

      {/* Sticky CTA bar (mobile) — fixed above the bottom nav. */}
      <div className="reserve-cta-bar">
        <div className="reserve-cta-bar__price">
          <div className="reserve-cta-bar__total">{fmtMoney(total)}</div>
          <div className="reserve-cta-bar__sub">
            {seats} {kind === 'flight' ? (seats === 1 ? 'seat' : 'seats') : (seats === 1 ? 'spot' : 'spots')}
            {' · '}fees incl.
          </div>
        </div>
        <button
          className="btn-primary"
          style={{ height: 46, padding: '0 22px', fontSize: 14, fontWeight: 600 }}
          onClick={() => setConfirmOpen(true)}
          disabled={submitting || maxSeats === 0 || !guestsComplete}
        >
          {maxSeats === 0 ? 'Fully booked' : 'Reserve →'}
        </button>
      </div>

      {/* Final confirmation sheet — shown after the member taps Reserve.
          This is the only place the full price + payment summary appears. */}
      {confirmOpen && (
        <div
          className="reserve-confirm"
          role="dialog"
          aria-modal="true"
          onClick={(e) => { if (e.target === e.currentTarget) closeConfirm() }}
        >
          <div className="reserve-confirm__sheet">
            <button
              type="button"
              className="reserve-confirm__close"
              aria-label="Close"
              onClick={closeConfirm}
            >
              ×
            </button>

            <div className="mono" style={{ fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--tropic-d)', marginBottom: 6, fontWeight: 600 }}>
              Confirm reservation
            </div>
            <h2 style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 26, fontWeight: 500, letterSpacing: '-0.015em', color: 'var(--ink)', margin: '0 0 18px', lineHeight: 1.1 }}>
              {itemName}
            </h2>

            {/* Pricing */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--ink-soft)' }}>
                <span>{seats} {kind === 'flight' ? (seats === 1 ? 'seat' : 'seats') : (seats === 1 ? 'spot' : 'spots')} × {fmtMoney(pricePerSeat)}</span>
                <span>{fmtMoney(subtotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--ink-light)' }}>
                <span>Service fee (3%)</span>
                <span>{fmtMoney(serviceFee)}</span>
              </div>
              <div style={{ height: 1, background: 'var(--hair)', margin: '4px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Total</span>
                <span style={{ fontFamily: 'var(--ui)', fontSize: 24, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
                  {fmtMoney(total)}
                </span>
              </div>
            </div>

            {/* Payment — Stripe PaymentElement embedded once we have a
                clientSecret from /api/bookings/payment-intent. Card is
                charged the moment the member taps the Pay button; the
                booking row is inserted on success with the PI id
                stamped on it. */}
            <div style={{ marginTop: 18 }}>
              {piLoading && (
                <div className="anchor-card anchor-card--loading">
                  <span className="pending-indicator" />
                  <span>Loading secure payment…</span>
                </div>
              )}
              {piNeedsSub && (
                <div style={{ textAlign: 'center', padding: '8px 4px 4px' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--tropic-d)', marginBottom: 8, fontWeight: 600 }}>
                    Membership required
                  </div>
                  <p style={{ fontSize: 14, color: 'var(--ink-light)', lineHeight: 1.6, margin: '0 0 16px' }}>
                    Start your membership to book this {kind === 'flight' ? 'seat' : 'spot'}. We&rsquo;ll bring you right back — your selection is saved.
                  </p>
                  <button className="btn-primary" style={{ width: '100%', height: 46, justifyContent: 'center' }} onClick={() => router.push('/onboarding/subscribe')}>
                    Start membership →
                  </button>
                </div>
              )}
              {piError && (
                <div className="anchor-card__error">{piError}</div>
              )}
              {!piLoading && !piError && clientSecret && paymentTotalCents != null && (
                <ReservePaymentForm
                  clientSecret={clientSecret}
                  totalCents={paymentTotalCents}
                  savedCard={savedCard}
                  submitLabel={`Pay ${fmtMoney(paymentTotalCents / 100)} & confirm →`}
                  onPaid={async ({ paymentIntentId }) => {
                    await handleSubmit(paymentIntentId)
                  }}
                />
              )}
              {error && (
                <div className="anchor-card__error" style={{ marginTop: 10 }}>{error}</div>
              )}
            </div>

            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <span className="mono" style={{ fontSize: 9, color: 'var(--ink-faint)', letterSpacing: '0.1em' }}>
                CHARGED ON CONFIRMATION · CANCELLABLE PER POLICY
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
