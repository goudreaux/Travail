'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Booking, AnchorSubmission, Member, Flight, Excursion, Aircraft } from '@/lib/supabase/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type Passenger = {
  id: string
  booking_id: string
  guest_id: string | null
  is_host: boolean
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
}

type BookingRow = Booking & {
  member: Pick<Member, 'name' | 'initials'> | null
  flight: Pick<Flight, 'name' | 'origin_code' | 'dest_code' | 'date'> | null
  excursion: Pick<Excursion, 'name' | 'date'> | null
  passengers?: Passenger[]
}

type AnchorRow = AnchorSubmission & {
  member: Pick<Member, 'name' | 'initials'> | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

function waitColor(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (m > 60) return 'var(--signal)'
  if (m > 20) return 'var(--sun-d)'
  return 'var(--tropic-d)'
}

function genCode(): string {
  return 'TV' + Math.random().toString(36).toUpperCase().slice(2, 8)
}

function Toast({ msg, kind }: { msg: string; kind: 'success' | 'error' | 'info' }) {
  return <div className={`toast ${kind}`}>{msg}</div>
}

function SectionHead({ label, count, sub }: { label: string; count: number; sub?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
      <h2 style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 500, color: 'var(--ink)', margin: 0 }}>
        {label}
      </h2>
      {count > 0 && (
        <span style={{
          background: 'var(--signal)', color: '#fff', borderRadius: 10,
          padding: '2px 9px', fontSize: 11, fontWeight: 700, fontFamily: 'var(--mono)',
        }}>
          {count}
        </span>
      )}
      <div style={{ flex: 1, height: 1, background: 'var(--hair-2)' }} />
      {sub && (
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--ink-faint)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          {sub}
        </span>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function QueuePage() {
  const supabase = createClient()
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [anchors, setAnchors] = useState<AnchorRow[]>([])
  const [aircraft, setAircraft] = useState<Aircraft[]>([])
  const [working, setWorking] = useState<string | null>(null)
  const [declineTarget, setDeclineTarget] = useState<{ id: string; kind: 'booking' | 'anchor' } | null>(null)
  const [declineReason, setDeclineReason] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; kind: 'success' | 'error' | 'info' } | null>(null)
  const [loading, setLoading] = useState(true)

  const showToast = useCallback((msg: string, kind: 'success' | 'error' | 'info' = 'success') => {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 4000)
  }, [])

  const loadBookings = useCallback(async () => {
    const [{ data: fb }, { data: eb }] = await Promise.all([
      supabase.from('bookings').select(`
        *, member:members!member_id(name, initials),
        flight:flights!inner(name, origin_code, dest_code, date)
      `).eq('item_kind', 'flight').eq('status', 'pending').order('submitted_at', { ascending: true }),
      supabase.from('bookings').select(`
        *, member:members!member_id(name, initials),
        excursion:excursions!inner(name, date)
      `).eq('item_kind', 'excursion').eq('status', 'pending').order('submitted_at', { ascending: true }),
    ])
    const all = [...(fb ?? []), ...(eb ?? [])] as unknown as BookingRow[]
    all.sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime())

    // Attach the passenger manifest (member + registered guests) for each booking.
    const ids = all.map(b => b.id)
    if (ids.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: pax } = await (supabase as any).from('booking_passengers').select('*').in('booking_id', ids)
      const byBooking: Record<string, Passenger[]> = {}
      for (const p of (pax ?? []) as Passenger[]) (byBooking[p.booking_id] ??= []).push(p)
      for (const b of all) b.passengers = byBooking[b.id] ?? []
    }
    setBookings(all)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadAnchors = useCallback(async () => {
    const { data } = await supabase
      .from('anchor_submissions')
      .select('*, member:members!member_id(name, initials)')
      .eq('status', 'pending')
      .order('submitted_at', { ascending: true })
    setAnchors((data ?? []) as unknown as AnchorRow[])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    Promise.all([
      loadBookings(),
      loadAnchors(),
      supabase.from('aircraft').select('*').then(({ data }) => setAircraft(data ?? [])),
    ]).then(() => setLoading(false))

    const ch = supabase
      .channel('queue-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bookings' }, () => {
        showToast('New booking request received', 'info')
        loadBookings()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bookings' }, () => loadBookings())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'anchor_submissions' }, () => {
        showToast('New anchor submission received', 'info')
        loadAnchors()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'anchor_submissions' }, () => loadAnchors())
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [loadBookings, loadAnchors, showToast]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Booking actions ───────────────────────────────────────────────────────

  async function approveBooking(b: BookingRow) {
    setWorking(b.id)
    try {
      // Atomic Postgres function — checks seat availability and approves in one transaction
      const { data, error } = await supabase.rpc('confirm_booking' as never, { p_booking_id: b.id } as never)
      if (error) throw error
      const res = data as { ok: boolean; error?: string; confirmation_code?: string }
      if (!res.ok) throw new Error(res.error ?? 'Seat unavailable')

      await supabase.from('notifications').insert({
        member_id: b.member_id,
        kind: 'booking',
        title: 'Booking Confirmed',
        body: `Your ${b.item_kind} reservation is confirmed. Confirmation code: ${res.confirmation_code}`,
        ref: { booking_id: b.id, confirmation_code: res.confirmation_code },
        read: false,
      } as never)

      showToast(`Confirmed — ${res.confirmation_code}`)
    } catch (e: unknown) {
      showToast((e as Error).message ?? 'Approval failed', 'error')
    } finally { setWorking(null) }
  }

  async function declineBooking(id: string, reason: string) {
    const b = bookings.find(x => x.id === id)
    if (!b) return
    setWorking(id)
    try {
      const { error } = await supabase.from('bookings').update({
        status: 'declined',
        decline_reason: reason,
        decided_at: new Date().toISOString(),
      }).eq('id', id)
      if (error) throw error

      await supabase.from('notifications').insert({
        member_id: b.member_id,
        kind: 'booking',
        title: 'Booking Declined',
        body: reason || 'Your booking request was not approved at this time.',
        ref: { booking_id: id },
        read: false,
      } as never)

      showToast('Booking declined')
    } catch (e: unknown) {
      showToast((e as Error).message ?? 'Decline failed', 'error')
    } finally { setWorking(null) }
  }

  // ── Anchor actions ────────────────────────────────────────────────────────

  function resolveAircraftId(shorthand: string | null | undefined): string | null {
    if (!shorthand) return null
    // If it's already a UUID, return as-is
    if (shorthand.includes('-')) return shorthand
    // Match c206 → capacity 4, caravan → capacity 8
    const capacity = shorthand === 'c206' ? 4 : 8
    return aircraft.find(a => a.capacity === capacity)?.id ?? null
  }

  async function publishAnchor(anchor: AnchorRow) {
    setWorking(anchor.id)
    try {
      const p = anchor.payload as Record<string, unknown>
      const code = genCode()
      let publishedItemId: string | null = null

      // Handle both camelCase (new forms) and snake_case (legacy) payload keys
      const originCode = String(p.originCode ?? p.origin_code ?? '')
      const destCode = String(p.destCode ?? p.dest_code ?? '')
      const date = String(p.date ?? '')
      const departTime = (p.departTime ?? p.depart_time ?? null) as string | null
      const aircraftId = resolveAircraftId((p.aircraftId ?? p.aircraft_id ?? null) as string | null)
      const name = String(p.name ?? '')
      const pitch = (p.pitch ?? null) as string | null

      if (anchor.kind === 'flight') {
        const seatsTotal = (p.seatsTotal ?? p.seats_total ?? 8) as number
        const seatsAnchor = (p.seatsAnchor ?? p.seats_anchor ?? 1) as number
        const pricePerSeat = (p.pricePerSeat ?? p.price_per_seat ?? 0) as number

        const { data: flight, error } = await supabase.from('flights').insert({
          anchor_member_id: anchor.member_id,
          origin_code: originCode,
          dest_code: destCode,
          date,
          depart_time: departTime,
          duration_mins: (p.duration_mins as number) ?? 0,
          aircraft_id: aircraftId,
          name,
          pitch,
          visibility: 'members',
          seats_total: seatsTotal,
          seats_anchor: seatsAnchor,
          price_per_seat: pricePerSeat,
          status: 'open',
        } as never).select().single()
        if (error) throw error
        publishedItemId = flight.id

        // Auto-approve anchor member's own seats
        await supabase.from('bookings').insert({
          member_id: anchor.member_id,
          item_kind: 'flight',
          item_id: flight.id,
          seats: seatsAnchor,
          price_per_seat: pricePerSeat,
          fees: 0,
          total: pricePerSeat * seatsAnchor,
          payment_method: 'credits',
          status: 'approved',
          confirmation_code: code,
          decided_at: new Date().toISOString(),
        })
      } else {
        // Excursion
        const spotsTotal = (p.spotsTotal ?? p.spots_total ?? 8) as number
        const spotsAnchor = (p.spotsAnchor ?? p.spots_anchor ?? 1) as number
        const pricePerPax = (p.pricePerPax ?? p.price_per_pax ?? 0) as number
        const tripType = p.tripType as string | undefined
        const stayType = tripType === 'overnight' ? 'overnight' : 'day_trip'

        const { data: exc, error } = await supabase.from('excursions').insert({
          anchor_member_id: anchor.member_id,
          template_id: null,
          origin_code: originCode,
          aircraft_id: aircraftId,
          date,
          start_time: (p.startTime ?? p.start_time ?? null) as string | null,
          depart_time: departTime,
          arrive_time: (p.arriveTime ?? p.arrive_time ?? null) as string | null,
          return_time: (p.returnTime ?? p.return_time ?? null) as string | null,
          stay_type: stayType as 'day_trip' | 'overnight' | 'multi_night',
          name,
          pitch,
          visibility: 'members',
          spots_total: spotsTotal,
          spots_anchor: spotsAnchor,
          price_per_pax: pricePerPax,
          status: 'open',
        }).select().single()
        if (error) throw error
        publishedItemId = exc.id

        await supabase.from('bookings').insert({
          member_id: anchor.member_id,
          item_kind: 'excursion',
          item_id: exc.id,
          seats: spotsAnchor,
          price_per_seat: pricePerPax,
          fees: 0,
          total: pricePerPax * spotsAnchor,
          payment_method: 'credits',
          status: 'approved',
          confirmation_code: code,
          decided_at: new Date().toISOString(),
        })
      }

      await supabase.from('anchor_submissions').update({
        status: 'published',
        decided_at: new Date().toISOString(),
        published_item_id: publishedItemId,
      }).eq('id', anchor.id)

      await supabase.from('notifications').insert({
        member_id: anchor.member_id,
        kind: 'approval',
        title: anchor.kind === 'flight' ? 'Flight Published' : 'Excursion Published',
        body: `Your ${anchor.kind} "${name}" is now live and open for bookings.`,
        ref: { anchor_id: anchor.id, item_id: publishedItemId, kind: anchor.kind },
        read: false,
      } as never)

      showToast(`Published — ${anchor.kind === 'flight' ? 'Flight' : 'Excursion'} is now live`)
    } catch (e: unknown) {
      showToast((e as Error).message ?? 'Publish failed', 'error')
    } finally { setWorking(null) }
  }

  async function declineAnchor(id: string, reason: string) {
    const anchor = anchors.find(a => a.id === id)
    if (!anchor) return
    setWorking(id)
    try {
      const { error } = await supabase.from('anchor_submissions').update({
        status: 'declined',
        decline_reason: reason,
        decided_at: new Date().toISOString(),
      }).eq('id', id)
      if (error) throw error

      await supabase.from('notifications').insert({
        member_id: anchor.member_id,
        kind: 'approval',
        title: 'Anchor Submission Declined',
        body: reason || 'Your anchor submission could not be approved at this time.',
        ref: { anchor_id: id },
        read: false,
      } as never)

      showToast('Submission declined')
    } catch (e: unknown) {
      showToast((e as Error).message ?? 'Decline failed', 'error')
    } finally { setWorking(null) }
  }

  async function handleDecline() {
    if (!declineTarget) return
    if (declineTarget.kind === 'booking') {
      await declineBooking(declineTarget.id, declineReason)
    } else {
      await declineAnchor(declineTarget.id, declineReason)
    }
    setDeclineTarget(null)
    setDeclineReason('')
  }

  if (loading) {
    return (
      <div style={{ padding: 32, paddingTop: 80, textAlign: 'center', color: 'var(--ink-light)', fontSize: 14 }}>
        Loading queue…
      </div>
    )
  }

  const totalPending = bookings.length + anchors.length

  return (
    <div style={{ padding: 32, maxWidth: 980 }}>
      {toast && <Toast msg={toast.msg} kind={toast.kind} />}

      {/* ── Decline modal ── */}
      {declineTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(6,56,71,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--card)', borderRadius: 14, padding: 28, width: 420, boxShadow: '0 16px 64px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontFamily: 'var(--display)', fontSize: 20, color: 'var(--ink)', margin: '0 0 16px' }}>
              Decline {declineTarget.kind === 'booking' ? 'Booking Request' : 'Anchor Submission'}
            </h3>
            <textarea
              className="input"
              style={{ minHeight: 80, width: '100%', marginBottom: 16 }}
              placeholder="Optional reason — sent to the member as a notification…"
              value={declineReason}
              onChange={e => setDeclineReason(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => { setDeclineTarget(null); setDeclineReason('') }}>
                Cancel
              </button>
              <button
                className="btn-primary"
                style={{ background: 'var(--signal)' }}
                disabled={!!working}
                onClick={handleDecline}
              >
                {working ? '…' : 'Confirm Decline'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 32, fontWeight: 500, color: 'var(--ink)', margin: 0 }}>
            Ops Queue
          </h1>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--tropic-glow)', border: '1px solid rgba(0,179,199,0.25)',
            borderRadius: 20, padding: '3px 12px 3px 9px',
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%', background: 'var(--tropic)',
              boxShadow: '0 0 0 3px rgba(0,179,199,0.2)',
            }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.14em', color: 'var(--tropic-d)', textTransform: 'uppercase' }}>
              Live
            </span>
          </div>
          {totalPending > 0 && (
            <span style={{
              background: 'var(--signal)', color: '#fff', borderRadius: 12,
              padding: '2px 10px', fontSize: 12, fontWeight: 700, fontFamily: 'var(--mono)',
            }}>
              {totalPending} pending
            </span>
          )}
        </div>
        <p style={{ fontSize: 13.5, color: 'var(--ink-light)', margin: 0 }}>
          Real-time action queue. Booking approvals are atomic — double-booking is prevented at the database level.
        </p>
      </div>

      {/* ── Booking Requests ── */}
      <section style={{ marginBottom: 52 }}>
        <SectionHead label="Booking Requests" count={bookings.length} sub="First come, first served" />

        {bookings.length === 0 ? (
          <div style={{
            background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 12,
            padding: 32, textAlign: 'center', color: 'var(--ink-light)', fontSize: 13,
          }}>
            Queue is clear — no pending booking requests.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {bookings.map((b, idx) => {
              const tripLabel = b.item_kind === 'flight' && b.flight
                ? `${b.flight.origin_code} → ${b.flight.dest_code}`
                : b.excursion?.name ?? 'Excursion'
              const tripDate = b.item_kind === 'flight' ? b.flight?.date : b.excursion?.date
              const wColor = waitColor(b.submitted_at)
              const isFirst = idx === 0

              return (
                <div key={b.id} style={{
                  background: 'var(--card)',
                  border: `1px solid ${isFirst || expanded === b.id ? 'var(--tropic)' : 'var(--hair)'}`,
                  borderRadius: 12,
                  overflow: 'hidden',
                  transition: 'border-color 0.15s',
                }}>
                  <div
                    style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}
                    onClick={() => setExpanded(expanded === b.id ? null : b.id)}
                  >
                  {/* Expand caret */}
                  <div style={{ color: 'var(--ink-faint)', fontSize: 10, width: 10, flexShrink: 0 }}>
                    {expanded === b.id ? '▲' : '▶'}
                  </div>

                  {/* Queue position */}
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                    background: isFirst ? 'var(--tropic-glow)' : 'var(--warm)',
                    border: `1.5px solid ${isFirst ? 'var(--tropic)' : 'var(--hair-2)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700,
                    color: isFirst ? 'var(--tropic-d)' : 'var(--ink-light)',
                  }}>
                    {idx + 1}
                  </div>

                  {/* Wait time */}
                  <div style={{ flexShrink: 0, textAlign: 'center', minWidth: 38 }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5, fontWeight: 700, color: wColor }}>
                      {timeAgo(b.submitted_at)}
                    </div>
                    <div style={{ width: 20, height: 2, borderRadius: 1, background: wColor, opacity: 0.35, margin: '4px auto 0' }} />
                  </div>

                  {/* Member avatar */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0, minWidth: 130 }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                      background: 'var(--tropic-glow)', color: 'var(--tropic-d)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700,
                    }}>
                      {b.member?.initials ?? '?'}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {b.member?.name ?? 'Unknown'}
                    </span>
                  </div>

                  {/* Trip */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 }}>
                      <span className={`pill ${b.item_kind === 'flight' ? 'tropic' : 'sun'}`} style={{ fontSize: 9 }}>
                        {b.item_kind}
                      </span>
                      <span style={{
                        fontSize: 13.5, fontWeight: 600, color: 'var(--ink)',
                        fontFamily: b.item_kind === 'flight' ? 'var(--mono)' : undefined,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {tripLabel}
                      </span>
                    </div>
                    {tripDate && (
                      <div style={{ fontSize: 11, color: 'var(--ink-light)', fontFamily: 'var(--mono)', letterSpacing: '0.04em' }}>
                        {tripDate}
                      </div>
                    )}
                  </div>

                  {/* Seats */}
                  <div style={{ flexShrink: 0, textAlign: 'center', minWidth: 48 }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--display)', lineHeight: 1 }}>
                      {b.seats}
                    </div>
                    <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--ink-faint)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 2 }}>
                      seat{b.seats !== 1 ? 's' : ''}
                    </div>
                  </div>

                  {/* Amount */}
                  <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 72 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--ink)' }}>
                      ${b.total.toLocaleString()}
                    </div>
                    <div style={{ fontSize: 9.5, fontFamily: 'var(--mono)', color: 'var(--ink-faint)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      {b.payment_method}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    <button
                      className="btn-primary"
                      style={{ height: 32, padding: '0 16px', fontSize: 12.5 }}
                      disabled={working === b.id}
                      onClick={() => approveBooking(b)}
                    >
                      {working === b.id ? '…' : 'Confirm'}
                    </button>
                    <button
                      className="btn-ghost"
                      style={{ height: 32, padding: '0 11px', fontSize: 12, color: 'var(--signal)', borderColor: 'rgba(217,78,42,0.25)' }}
                      disabled={working === b.id}
                      onClick={() => setDeclineTarget({ id: b.id, kind: 'booking' })}
                    >
                      Decline
                    </button>
                  </div>
                  </div>

                  {/* Passenger manifest */}
                  {expanded === b.id && (
                    <div style={{ borderTop: '1px solid var(--hair)', padding: '14px 18px', background: 'rgba(0,179,199,0.02)' }}>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.14em', color: 'var(--tropic-d)', textTransform: 'uppercase', marginBottom: 10 }}>
                        Passengers · {b.passengers?.length ?? 0}
                      </div>
                      {(b.passengers ?? []).length === 0 ? (
                        <div style={{ fontSize: 12, color: 'var(--ink-light)' }}>No passenger manifest recorded for this booking.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {b.passengers!.map(p => (
                            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, flexWrap: 'wrap' }}>
                              <span className={`pill ${p.is_host ? 'tropic' : 'ink'}`} style={{ fontSize: 9 }}>{p.is_host ? 'Member' : 'Guest'}</span>
                              <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{p.first_name} {p.last_name}</span>
                              {(p.phone || p.email) && (
                                <span style={{ color: 'var(--ink-light)', fontFamily: 'var(--mono)', fontSize: 11 }}>
                                  {[p.phone, p.email].filter(Boolean).join('  ·  ')}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Anchor Submissions ── */}
      <section>
        <SectionHead label="Anchor Submissions" count={anchors.length} sub="Review & publish" />

        {anchors.length === 0 ? (
          <div style={{
            background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 12,
            padding: 32, textAlign: 'center', color: 'var(--ink-light)', fontSize: 13,
          }}>
            No pending anchor submissions.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {anchors.map(a => {
              const p = a.payload as Record<string, unknown>
              const isOpen = expanded === a.id
              const originCode = String(p.originCode ?? p.origin_code ?? '')
              const destCode = String(p.destCode ?? p.dest_code ?? '')
              const date = String(p.date ?? '')
              const name = String(p.name ?? '—')
              const routeStr = a.kind === 'flight'
                ? `${originCode} → ${destCode}`
                : originCode

              return (
                <div key={a.id} style={{
                  background: 'var(--card)',
                  border: `1px solid ${isOpen ? 'var(--tropic)' : 'var(--hair)'}`,
                  borderRadius: 12,
                  overflow: 'hidden',
                  transition: 'border-color 0.15s',
                }}>
                  {/* Row */}
                  <div
                    style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}
                    onClick={() => setExpanded(isOpen ? null : a.id)}
                  >
                    <div style={{ color: 'var(--ink-faint)', fontSize: 10, flexShrink: 0, width: 12 }}>
                      {isOpen ? '▲' : '▶'}
                    </div>

                    {/* Wait time */}
                    <div style={{ flexShrink: 0, fontFamily: 'var(--mono)', fontSize: 11.5, fontWeight: 700, color: waitColor(a.submitted_at), minWidth: 38 }}>
                      {timeAgo(a.submitted_at)}
                    </div>

                    {/* Member */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0, minWidth: 130 }}>
                      <div style={{
                        width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                        background: 'var(--sun-glow)', color: 'var(--sun-d)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700,
                      }}>
                        {a.member?.initials ?? '?'}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {a.member?.name ?? 'Unknown'}
                      </span>
                    </div>

                    {/* Kind + name */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 }}>
                        <span className={`pill ${a.kind === 'flight' ? 'tropic' : 'sun'}`} style={{ fontSize: 9 }}>
                          {a.kind}
                        </span>
                        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {name}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-light)', letterSpacing: '0.04em' }}>
                        {routeStr}{date ? ` · ${date}` : ''}
                      </div>
                    </div>

                    {/* Seats */}
                    <div style={{ flexShrink: 0, textAlign: 'center', minWidth: 64 }}>
                      {a.kind === 'flight' ? (
                        <>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>
                            {((p.seatsAnchor ?? p.seats_anchor) as number) ?? '?'} / {((p.seatsTotal ?? p.seats_total) as number) ?? '?'}
                          </div>
                          <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>seats</div>
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>
                            {((p.spotsAnchor ?? p.spots_anchor) as number) ?? '?'} / {((p.spotsTotal ?? p.spots_total) as number) ?? '?'}
                          </div>
                          <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>spots</div>
                        </>
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                      <button
                        className="btn-sun"
                        style={{ height: 32, padding: '0 16px', fontSize: 12.5 }}
                        disabled={working === a.id}
                        onClick={() => publishAnchor(a)}
                      >
                        {working === a.id ? '…' : 'Publish'}
                      </button>
                      <button
                        className="btn-ghost"
                        style={{ height: 32, padding: '0 11px', fontSize: 12, color: 'var(--signal)', borderColor: 'rgba(217,78,42,0.25)' }}
                        disabled={working === a.id}
                        onClick={() => setDeclineTarget({ id: a.id, kind: 'anchor' })}
                      >
                        Decline
                      </button>
                    </div>
                  </div>

                  {/* Expanded payload */}
                  {isOpen && (
                    <div style={{ borderTop: '1px solid var(--hair)', padding: '16px 20px 20px', background: 'rgba(0,179,199,0.02)' }}>
                      <div style={{ fontSize: 10, fontFamily: 'var(--mono)', letterSpacing: '0.14em', color: 'var(--tropic-d)', marginBottom: 14, textTransform: 'uppercase' }}>
                        Full Payload · {a.id.slice(0, 8)}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '10px 20px' }}>
                        {Object.entries(p).map(([k, v]) => (
                          <div key={k}>
                            <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--ink-faint)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>
                              {k}
                            </div>
                            <div style={{
                              fontSize: 12.5,
                              color: (v === null || v === '') ? 'var(--ink-faint)' : 'var(--ink-soft)',
                              fontStyle: (v === null || v === '') ? 'italic' : 'normal',
                              fontWeight: (v !== null && v !== '') ? 500 : 400,
                            }}>
                              {(v === null || v === '') ? 'null' : typeof v === 'object' ? JSON.stringify(v) : String(v)}
                            </div>
                          </div>
                        ))}
                      </div>
                      {a.submitted_at && (
                        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--hair)', fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-faint)', letterSpacing: '0.06em' }}>
                          Submitted {new Date(a.submitted_at).toLocaleString()}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
