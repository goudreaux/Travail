'use client'
import { useState, useEffect } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { fmtDate, fmtDur, fmtMoney, fmtTime, airportSub, fmtHomeBase } from '@/lib/data'
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

export default function ReservePage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const supabase = createClient()

  const itemId = params.id as string
  const kind = (searchParams.get('kind') ?? 'flight') as 'flight' | 'excursion'
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

  // Submission state
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState<{ id: string; confirmationCode: string | null } | null>(null)
  const [error, setError] = useState('')

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

      setLoading(false)
    }
    load()
  }, [itemId, kind, returnId])

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
    if (s.phone.replace(/\D/g, '').length !== 10) { setError('Enter a 10-digit phone number for the guest.'); return }
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

  // Derived values
  const maxSeats = flight
    ? (returnFlight
        ? Math.max(0, Math.min(flight.seats_total - flight.seats_anchor, returnFlight.seats_total - returnFlight.seats_anchor))
        : Math.max(0, flight.seats_total - flight.seats_anchor))
    : excursion
    ? Math.max(0, excursion.spots_total - excursion.spots_anchor)
    : 0

  const pricePerSeat = flight
    ? (returnFlight ? flight.price_per_seat + returnFlight.price_per_seat : flight.price_per_seat)
    : excursion?.price_per_pax ?? template?.price_per_pax ?? 0

  const subtotal = pricePerSeat * seats
  const serviceFee = Math.round(subtotal * SERVICE_FEE_RATE)
  const total = subtotal + serviceFee

  const anchorMemberId = flight?.anchor_member_id ?? excursion?.anchor_member_id

  // Route display
  const originCode = flight?.origin_code ?? excursion?.origin_code ?? ''
  const destCode = flight?.dest_code ?? ''
  const itemDate = flight?.date ?? excursion?.date ?? ''
  const itemName = flight?.name ?? excursion?.name ?? ''
  const pitch = flight?.pitch ?? excursion?.pitch ?? ''
  const departTime = flight ? fmtTime(flight.depart_time) : fmtTime(excursion?.depart_time ?? null)
  const durationStr = flight ? fmtDur(flight.duration_mins) : (excursion?.stay_type === 'day_trip' ? 'Day trip' : excursion?.stay_type === 'overnight' ? 'Overnight' : 'Multi-night')

  async function handleSubmit() {
    if (!member) return
    setError('')

    if (seats > 1) {
      for (const s of guestSlots) {
        if (!s.savedGuestId) { setError('Select or add a guest for every additional seat.'); return }
        if (s.savedGuestId === NEW_GUEST && (!s.first_name.trim() || !s.last_name.trim())) {
          setError('Enter a first and last name for each new guest.'); return
        }
      }
    }

    setSubmitting(true)

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any

      // 1. Resolve guests — insert new ones into the member's roster so they're reusable.
      type Pax = { guest_id: string; first_name: string; last_name: string; email: string | null; phone: string | null }
      const guestPax: Pax[] = []
      for (const s of guestSlots) {
        if (s.savedGuestId === NEW_GUEST) {
          const { data: g, error: gErr } = await db.from('guests').insert({
            host_member_id: member.id,
            first_name: s.first_name.trim(),
            last_name: s.last_name.trim(),
            email: s.email.trim() || null,
            phone: s.phone.trim() || null,
          }).select().single()
          if (gErr) throw gErr
          guestPax.push({ guest_id: g.id, first_name: g.first_name, last_name: g.last_name, email: g.email, phone: g.phone })
        } else {
          const g = savedGuests.find(x => x.id === s.savedGuestId)
          if (g) guestPax.push({ guest_id: g.id, first_name: g.first_name, last_name: g.last_name, email: g.email, phone: g.phone })
        }
      }

      // 2. Create booking(s) — one per leg for round-trips.
      let bookingIds: string[] = []
      let primary: { id: string; confirmation_code: string | null }

      if (isRoundTrip && flight && returnFlight) {
        const rows = [flight, returnFlight].map(leg => {
          const sub = leg.price_per_seat * seats
          const fee = Math.round(sub * SERVICE_FEE_RATE)
          return {
            member_id: member.id, item_kind: 'flight', item_id: leg.id, seats,
            price_per_seat: leg.price_per_seat, fees: fee, total: sub + fee,
            payment_method: paymentMethod, status: 'pending',
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
            member_id: member.id, item_kind: kind, item_id: itemId, seats,
            price_per_seat: pricePerSeat, fees: serviceFee, total,
            payment_method: paymentMethod, status: 'pending',
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
        { booking_id: bid, guest_id: null, is_host: true, first_name: hostFirst ?? member.name, last_name: hostRest.join(' '), email: null, phone: null },
        ...guestPax.map(gp => ({
          booking_id: bid, guest_id: gp.guest_id, is_host: false,
          first_name: gp.first_name, last_name: gp.last_name, email: gp.email, phone: gp.phone,
        })),
      ])
      // Best-effort: the booking is the source of truth; don't fail it if the
      // manifest table isn't present yet.
      try {
        const { error: paxErr } = await db.from('booking_passengers').insert(paxRows)
        if (paxErr) throw paxErr
      } catch (paxErr) {
        console.error('Passenger manifest not recorded:', paxErr)
      }

      // 4. Notify.
      await supabase.from('notifications').insert({
        member_id: member.id,
        kind: 'booking',
        title: isRoundTrip ? 'Round-trip booking submitted' : 'Booking submitted for review',
        body: `Your reservation for "${itemName}"${seats > 1 ? ` (${seats} seats)` : ''} has been submitted. Ops will confirm shortly.`,
        ref: { kind, id: itemId, booking_id: primary.id },
        read: false,
      } as never)

      setSubmitted({ id: primary.id, confirmationCode: primary.confirmation_code })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
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
              <button className="btn-ghost" style={{ width: '100%' }} onClick={() => router.push('/inbox')}>
                Go to inbox
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

  // ── Main reservation builder ────────────────────────────────────────────────

  return (
    <div className="page">
      <div className="page-view">
        <div className="builder">
          {/* ── LEFT: Form ── */}
          <div className="builder-form">
            {/* Back link + header */}
            <div style={{ marginBottom: 4 }}>
              <Link
                href="/seats"
                className="mono"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 10,
                  color: 'var(--ink-mid)',
                  marginBottom: 16,
                  transition: 'color 0.12s',
                }}
              >
                ← OPEN SEATS
              </Link>
              <h1 style={{
                fontFamily: 'var(--display)',
                fontSize: 32,
                fontWeight: 500,
                letterSpacing: '-0.015em',
                lineHeight: 1.1,
                color: 'var(--ink)',
                margin: '0 0 6px',
              }}>
                Reserve your seat.
              </h1>
              {kind === 'flight' && flight ? (
                <p style={{ fontSize: 13, color: 'var(--ink-light)', margin: 0 }}>
                  {flight.origin_code} {isRoundTrip ? '⇄' : '→'} {flight.dest_code}{isRoundTrip ? ' · round trip' : ''} · {dp.dow}, {dp.mo} {dp.day} · Hosted by{' '}
                  <span style={{ color: 'var(--ink)' }}>Travail Ops</span>
                </p>
              ) : excursion ? (
                <p style={{ fontSize: 13, color: 'var(--ink-light)', margin: 0 }}>
                  {excursion.origin_code} · {dp.dow}, {dp.mo} {dp.day}
                  {template?.operator ? ` · ${template.operator}` : ''}
                </p>
              ) : null}
            </div>

            {/* 1. Itinerary display */}
            <div>
              <div className="field-lab" style={{ marginBottom: 10 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-light)', fontWeight: 600 }}>
                  1 — Itinerary
                </span>
              </div>
              <div style={{
                background: 'var(--night)',
                borderRadius: 12,
                padding: '20px 24px',
              }}>
                {kind === 'flight' && flight ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontFamily: 'var(--display)', fontSize: 42, fontWeight: 500, color: '#fff', lineHeight: 1, letterSpacing: '-0.02em' }}>
                        {flight.origin_code}
                      </div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', marginTop: 6, textTransform: 'uppercase' }}>
                        {airportSub(flight.origin_code)}
                      </div>
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div style={{ color: 'var(--tropic)', fontSize: 22 }}>→</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em' }}>
                        {fmtDur(flight.duration_mins)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontFamily: 'var(--display)', fontSize: 42, fontWeight: 500, color: '#fff', lineHeight: 1, letterSpacing: '-0.02em' }}>
                        {flight.dest_code}
                      </div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', marginTop: 6, textTransform: 'uppercase' }}>
                        {airportSub(flight.dest_code)}
                      </div>
                    </div>
                  </div>
                ) : excursion ? (
                  <div style={{ textAlign: 'center' }}>
                    <div className="display-i" style={{ fontSize: 28, color: '#fff', lineHeight: 1.2, marginBottom: 6 }}>
                      {excursion.name}
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                      {excursion.origin_code} · {excursion.stay_type.replace('_', ' ')}
                    </div>
                  </div>
                ) : null}

                {/* Time row */}
                <div style={{
                  display: 'flex',
                  gap: 20,
                  marginTop: 16,
                  paddingTop: 14,
                  borderTop: '1px solid rgba(255,255,255,0.08)',
                }}>
                  {[
                    { label: 'Date', value: `${dp.dow} ${dp.mo} ${dp.day}` },
                    { label: 'Departs', value: departTime },
                    { label: kind === 'flight' ? 'Block time' : 'Duration', value: durationStr },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 3 }}>
                        {label}
                      </div>
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>
                        {value}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Return leg */}
                {isRoundTrip && returnFlight && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
                      Return leg
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>
                      <span style={{ fontWeight: 500 }}>{returnFlight.origin_code} → {returnFlight.dest_code}</span>
                      <span>{(() => { const r = fmtDate(returnFlight.date); return `${r.dow} ${r.mo} ${r.day}` })()} · {fmtTime(returnFlight.depart_time)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 2. Seats picker */}
            <div className="field">
              <div className="field-lab">
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-light)', fontWeight: 600 }}>
                  2 — {kind === 'flight' ? 'Seats' : 'Spots'}
                </span>
              </div>
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
                  Bringing guests? You&rsquo;re seat 1 — add a seat for each guest and you&rsquo;ll register them below.
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
                  You hold seat 1. Register {seats - 1} guest{seats - 1 !== 1 ? 's' : ''} — pick from your saved guests, or add a new one and tap <strong>Save guest</strong>. New guests are saved for next time.
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
                              <input className="input" type="email" placeholder="Email" value={slot.email} onChange={e => updateSlot(i, { email: e.target.value })} />
                              <input className="input" inputMode="numeric" maxLength={12} placeholder="Phone * (xxx-xxx-xxxx)" value={slot.phone} onChange={e => updateSlot(i, { phone: formatPhone(e.target.value) })} />
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
                  3 — Passenger
                </div>
                <div style={{
                  background: 'var(--card)',
                  border: '1px solid var(--hair)',
                  borderRadius: 10,
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}>
                  {member.avatar_url ? (
                    <img
                      src={member.avatar_url}
                      alt={member.name}
                      style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                    />
                  ) : (
                    <div style={{
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      background: 'var(--night)',
                      color: 'var(--tropic)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: 'var(--mono)',
                      fontSize: 13,
                      fontWeight: 600,
                      flexShrink: 0,
                    }}>
                      {member.initials}
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 2 }}>
                      {member.name}
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span className="mono" style={{ fontSize: 9.5 }}>
                        #{member.id.slice(0, 8).toUpperCase()}
                      </span>
                      {member.kyc_verified && (
                        <span className="pill moss" style={{ fontSize: 9, height: 17 }}>Verified</span>
                      )}
                    </div>
                  </div>
                  {fmtHomeBase(member.home_base_code) && (
                    <span style={{ fontSize: 11, color: 'var(--ink-mid)' }}>
                      {fmtHomeBase(member.home_base_code)}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* 4. Payment */}
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-light)', fontWeight: 600, marginBottom: 10 }}>
                4 — Payment
              </div>
              <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 10, overflow: 'hidden' }}>
                {/* Card on file */}
                <div
                  className="toggle-row"
                  style={{ padding: '13px 16px', borderBottom: '1px solid var(--hair)' }}
                >
                  <div>
                    <div className="t-lab">Card on file</div>
                    <div className="t-sub">
                      {member?.card_last4
                        ? `••••  ••••  ••••  ${member.card_last4}`
                        : 'No card on file — contact Ops'}
                    </div>
                  </div>
                  <div className={`toggle${paymentMethod === 'card' ? ' active' : ''}`} style={{ pointerEvents: 'none' }} />
                </div>
              </div>
            </div>

            {/* 5. Trip pitch */}
            {pitch && (
              <div style={{
                background: 'var(--warm)',
                borderLeft: '3px solid var(--tropic)',
                borderRadius: '0 8px 8px 0',
                padding: '12px 16px',
              }}>
                <div className="mono" style={{ fontSize: 9, marginBottom: 6, color: 'var(--ink-mid)' }}>
                  {anchorMemberId ? 'ANCHOR SAYS' : 'TRIP PITCH'}
                </div>
                <p style={{
                  margin: 0,
                  fontSize: 14,
                  color: 'var(--ink-mid)',
                  fontStyle: 'italic',
                  fontFamily: 'var(--display)',
                  lineHeight: 1.55,
                }}>
                  "{pitch}"
                </p>
              </div>
            )}

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
          </div>

          {/* ── RIGHT: Preview / Confirm ── */}
          <div className="preview">
            <div className="preview-head">Confirm reservation</div>
            <div className="preview-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Trip name */}
              <div>
                <div className="mono" style={{ marginBottom: 4 }}>Trip</div>
                <div className="display-i" style={{ fontSize: 22, color: 'var(--ink)', lineHeight: 1.2 }}>
                  {itemName}
                </div>
              </div>

              {/* Summary grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 1,
                background: 'var(--hair)',
                borderRadius: 10,
                overflow: 'hidden',
                border: '1px solid var(--hair)',
              }}>
                {[
                  { label: 'Date', value: formatDateLong(itemDate).split(',')[0] + ', ' + formatDateLong(itemDate).split(',').slice(1).join(',').trim() },
                  { label: 'Push time', value: departTime },
                  { label: kind === 'flight' ? 'Block' : 'Duration', value: durationStr },
                  ...(kind === 'flight' && flight
                    ? [
                        { label: 'Operator', value: 'Travail Ops' },
                        { label: 'Aircraft', value: flight.aircraft_id },
                        { label: 'Route', value: `${flight.origin_code} → ${flight.dest_code}` },
                      ]
                    : [
                        { label: 'Operator', value: template?.operator ?? 'Travail Ops' },
                        { label: 'Origin', value: excursion?.origin_code ?? '' },
                      ]
                  ),
                  { label: kind === 'flight' ? 'Seats' : 'Spots', value: String(seats) },
                  { label: 'Per seat', value: fmtMoney(pricePerSeat) },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: 'var(--card)', padding: '10px 14px' }}>
                    <div className="mono" style={{ marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Pricing */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--ink-soft)' }}>
                  <span>{seats} seat{seats !== 1 ? 's' : ''} × {fmtMoney(pricePerSeat)}</span>
                  <span>{fmtMoney(subtotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--ink-light)' }}>
                  <span>Service fee (3%)</span>
                  <span>{fmtMoney(serviceFee)}</span>
                </div>
                <div style={{ height: 1, background: 'var(--hair)', margin: '2px 0' }} />
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Total</span>
                  <span style={{ fontFamily: 'var(--display)', fontSize: 28, fontWeight: 500, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
                    {fmtMoney(total)}
                  </span>
                </div>
              </div>

              {/* Payment display */}
              <div style={{
                background: 'var(--warm)',
                borderRadius: 8,
                padding: '10px 14px',
                fontSize: 12.5,
                color: 'var(--ink-mid)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                <svg width="14" height="14" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                  <rect x="2" y="6" width="18" height="13" rx="2" />
                  <line x1="2" y1="10" x2="20" y2="10" />
                </svg>
                {member?.card_last4
                  ? `Card ending ••${member.card_last4}`
                  : 'No payment on file'}
              </div>

              {/* Submit button */}
              <button
                className="btn-primary"
                style={{ width: '100%', height: 46, fontSize: 14, justifyContent: 'center' }}
                onClick={handleSubmit}
                disabled={submitting || maxSeats === 0 || !guestsComplete}
              >
                {submitting ? (
                  <>
                    <span className="pending-indicator" style={{ width: 14, height: 14, borderWidth: 2 }} />
                    Submitting to Ops…
                  </>
                ) : maxSeats === 0 ? (
                  'Fully booked'
                ) : (
                  'Submit to Ops →'
                )}
              </button>

              {/* Hold notice */}
              <div style={{ textAlign: 'center' }}>
                <span className="mono" style={{ fontSize: 9, color: 'var(--ink-faint)', letterSpacing: '0.1em' }}>
                  HOLD ONLY — CARD CAPTURED ON OPS CONFIRMATION
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
