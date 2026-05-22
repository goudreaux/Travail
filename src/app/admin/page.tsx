'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Booking, AnchorSubmission, Member, Flight, Excursion } from '@/lib/supabase/types'

type BookingWithDetails = Booking & {
  member: Pick<Member, 'name' | 'initials'> | null
  flight: Pick<Flight, 'name' | 'origin_code' | 'dest_code'> | null
  excursion: Pick<Excursion, 'name'> | null
}

type AnchorWithMember = AnchorSubmission & {
  member: Pick<Member, 'name' | 'initials'> | null
}

function genConfCode(): string {
  return 'TV' + Math.random().toString(36).toUpperCase().slice(2, 8)
}

function Toast({ msg, kind }: { msg: string; kind: 'success' | 'error' | 'info' }) {
  return (
    <div className={`toast ${kind}`} style={{ zIndex: 9999 }}>
      {msg}
    </div>
  )
}

export default function AdminDashboard() {
  const supabase = createClient()

  const [stats, setStats] = useState({ members: 0, activeTrips: 0, pendingBookings: 0, pendingAnchors: 0 })
  const [pendingBookings, setPendingBookings] = useState<BookingWithDetails[]>([])
  const [pendingAnchors, setPendingAnchors] = useState<AnchorWithMember[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ msg: string; kind: 'success' | 'error' | 'info' } | null>(null)
  const [declineModal, setDeclineModal] = useState<{ id: string; kind: 'booking' | 'anchor' } | null>(null)
  const [declineReason, setDeclineReason] = useState('')
  const [working, setWorking] = useState<string | null>(null)

  const showToast = (msg: string, kind: 'success' | 'error' | 'info' = 'success') => {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 3500)
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [
        { count: memberCount },
        { count: flightCount },
        { count: excursionCount },
        { count: pendingBookingCount },
        { count: pendingAnchorCount },
        { data: bookings },
        { data: anchors },
      ] = await Promise.all([
        supabase.from('members').select('*', { count: 'exact', head: true }),
        supabase.from('flights').select('*', { count: 'exact', head: true }).in('status', ['open', 'full']),
        supabase.from('excursions').select('*', { count: 'exact', head: true }).in('status', ['open', 'full']),
        supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('anchor_submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('bookings').select(`
          *,
          member:members!member_id(name, initials),
          flight:flights!inner(name, origin_code, dest_code)
        `).eq('status', 'pending').eq('item_kind', 'flight').order('submitted_at', { ascending: false }).limit(20),
        supabase.from('anchor_submissions').select(`
          *,
          member:members!member_id(name, initials)
        `).eq('status', 'pending').order('submitted_at', { ascending: false }).limit(20),
      ])

      // Also fetch excursion bookings
      const { data: excBookings } = await supabase.from('bookings').select(`
        *,
        member:members!member_id(name, initials),
        excursion:excursions!inner(name)
      `).eq('status', 'pending').eq('item_kind', 'excursion').order('submitted_at', { ascending: false }).limit(20)

      setStats({
        members: memberCount ?? 0,
        activeTrips: (flightCount ?? 0) + (excursionCount ?? 0),
        pendingBookings: pendingBookingCount ?? 0,
        pendingAnchors: pendingAnchorCount ?? 0,
      })

      const allBookings = [...(bookings ?? []), ...(excBookings ?? [])] as unknown as BookingWithDetails[]
      allBookings.sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())
      setPendingBookings(allBookings)
      setPendingAnchors((anchors ?? []) as unknown as AnchorWithMember[])
    } finally {
      setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData() }, [loadData])

  async function approveBooking(booking: BookingWithDetails) {
    setWorking(booking.id)
    try {
      const code = genConfCode()
      const { error } = await supabase.from('bookings').update({
        status: 'approved',
        confirmation_code: code,
        decided_at: new Date().toISOString(),
      }).eq('id', booking.id)
      if (error) throw error

      await supabase.from('notifications').insert({
        member_id: booking.member_id,
        kind: 'booking',
        title: 'Booking Confirmed',
        body: `Your booking has been confirmed. Confirmation code: ${code}`,
        ref: { booking_id: booking.id, confirmation_code: code },
      })

      showToast('Booking approved — ' + code)
      loadData()
    } catch (e) {
      showToast('Failed to approve booking', 'error')
      console.error(e)
    } finally {
      setWorking(null)
    }
  }

  async function declineBooking(id: string, reason: string) {
    setWorking(id)
    try {
      const booking = pendingBookings.find(b => b.id === id)
      if (!booking) return

      const { error } = await supabase.from('bookings').update({
        status: 'declined',
        decline_reason: reason,
        decided_at: new Date().toISOString(),
      }).eq('id', id)
      if (error) throw error

      await supabase.from('notifications').insert({
        member_id: booking.member_id,
        kind: 'booking',
        title: 'Booking Declined',
        body: reason || 'Your booking request was not approved at this time.',
        ref: { booking_id: id },
      })

      showToast('Booking declined')
      setDeclineModal(null)
      setDeclineReason('')
      loadData()
    } catch (e) {
      showToast('Failed to decline booking', 'error')
      console.error(e)
    } finally {
      setWorking(null)
    }
  }

  async function publishAnchor(anchor: AnchorWithMember) {
    setWorking(anchor.id)
    try {
      const payload = anchor.payload as Record<string, unknown>
      let publishedItemId: string | null = null

      if (anchor.kind === 'flight') {
        const { data: flight, error } = await supabase.from('flights').insert({
          anchor_member_id: anchor.member_id,
          origin_code: payload.origin_code as string,
          dest_code: payload.dest_code as string,
          date: payload.date as string,
          depart_time: payload.depart_time as string,
          duration_mins: payload.duration_mins as number,
          aircraft_id: payload.aircraft_id as string,
          name: payload.name as string,
          pitch: payload.pitch as string ?? null,
          visibility: (payload.visibility as 'members' | 'public') ?? 'members',
          seats_total: payload.seats_total as number,
          seats_anchor: (payload.seats_anchor as number) ?? 1,
          price_per_seat: payload.price_per_seat as number,
          status: 'open',
        }).select().single()
        if (error) throw error
        publishedItemId = flight.id

        // Auto-book anchor's own seats
        const anchorSeats = (payload.seats_anchor as number) ?? 1
        const pricePerSeat = payload.price_per_seat as number
        await supabase.from('bookings').insert({
          member_id: anchor.member_id,
          item_kind: 'flight',
          item_id: flight.id,
          seats: anchorSeats,
          price_per_seat: pricePerSeat,
          fees: 0,
          total: pricePerSeat * anchorSeats,
          payment_method: 'credits',
          status: 'approved',
          confirmation_code: genConfCode(),
          decided_at: new Date().toISOString(),
        })
      } else {
        const { data: excursion, error } = await supabase.from('excursions').insert({
          anchor_member_id: anchor.member_id,
          template_id: (payload.template_id as string) ?? null,
          origin_code: payload.origin_code as string,
          aircraft_id: (payload.aircraft_id as string) ?? null,
          date: payload.date as string,
          start_time: (payload.start_time as string) ?? null,
          depart_time: (payload.depart_time as string) ?? null,
          arrive_time: (payload.arrive_time as string) ?? null,
          return_time: (payload.return_time as string) ?? null,
          stay_type: (payload.stay_type as 'day_trip' | 'overnight' | 'multi_night') ?? 'day_trip',
          name: payload.name as string,
          pitch: (payload.pitch as string) ?? null,
          visibility: (payload.visibility as 'members' | 'public') ?? 'members',
          spots_total: payload.spots_total as number,
          spots_anchor: (payload.spots_anchor as number) ?? 1,
          status: 'open',
        }).select().single()
        if (error) throw error
        publishedItemId = excursion.id

        const anchorSpots = (payload.spots_anchor as number) ?? 1
        const price = (payload.price_per_pax as number) ?? 0
        await supabase.from('bookings').insert({
          member_id: anchor.member_id,
          item_kind: 'excursion',
          item_id: excursion.id,
          seats: anchorSpots,
          price_per_seat: price,
          fees: 0,
          total: price * anchorSpots,
          payment_method: 'credits',
          status: 'approved',
          confirmation_code: genConfCode(),
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
        body: `Your ${anchor.kind} "${payload.name}" has been published and is now open for bookings.`,
        ref: { anchor_id: anchor.id, item_id: publishedItemId, kind: anchor.kind },
      })

      showToast(`${anchor.kind === 'flight' ? 'Flight' : 'Excursion'} published successfully`)
      loadData()
    } catch (e) {
      showToast('Failed to publish anchor', 'error')
      console.error(e)
    } finally {
      setWorking(null)
    }
  }

  async function declineAnchor(id: string, reason: string) {
    setWorking(id)
    try {
      const anchor = pendingAnchors.find(a => a.id === id)
      if (!anchor) return

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
      })

      showToast('Anchor declined')
      setDeclineModal(null)
      setDeclineReason('')
      loadData()
    } catch (e) {
      showToast('Failed to decline anchor', 'error')
      console.error(e)
    } finally {
      setWorking(null)
    }
  }

  const S = { padding: '32px' }

  const statCard = (val: number, label: string, color?: string) => (
    <div className="stat">
      <div className="val" style={color ? { color } : {}}>{val}</div>
      <div className="label">{label}</div>
    </div>
  )

  const pill = (label: string, cls: string) => <span className={`pill ${cls}`}>{label}</span>

  return (
    <div style={S}>
      {toast && <Toast msg={toast.msg} kind={toast.kind} />}

      {/* Decline modal */}
      {declineModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(6,56,71,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{ background: 'var(--card)', borderRadius: 14, padding: 28, width: 420, boxShadow: '0 16px 64px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontFamily: 'var(--display)', fontSize: 20, color: 'var(--ink)', margin: '0 0 16px' }}>Decline — Add Reason</h3>
            <textarea
              className="input"
              style={{ minHeight: 80, width: '100%', marginBottom: 16 }}
              placeholder="Optional reason for member notification…"
              value={declineReason}
              onChange={e => setDeclineReason(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => { setDeclineModal(null); setDeclineReason('') }}>Cancel</button>
              <button
                className="btn-primary"
                style={{ background: 'var(--signal)' }}
                disabled={!!working}
                onClick={() => {
                  if (declineModal.kind === 'booking') declineBooking(declineModal.id, declineReason)
                  else declineAnchor(declineModal.id, declineReason)
                }}
              >
                Confirm Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'var(--display)', fontSize: 30, fontWeight: 500, color: 'var(--ink)', margin: 0 }}>Operations Dashboard</h1>
        <p style={{ fontSize: 13, color: 'var(--ink-light)', marginTop: 4, marginBottom: 0 }}>Review and manage bookings, anchor submissions, and member data.</p>
      </div>

      {/* Stats */}
      <div className="stat-grid" style={{ marginBottom: 32 }}>
        {statCard(stats.members, 'Total Members')}
        {statCard(stats.activeTrips, 'Active Trips', 'var(--tropic-d)')}
        {statCard(stats.pendingBookings, 'Pending Bookings', stats.pendingBookings > 0 ? 'var(--signal)' : undefined)}
        {statCard(stats.pendingAnchors, 'Pending Anchors', stats.pendingAnchors > 0 ? 'var(--sun-d)' : undefined)}
      </div>

      {loading && (
        <div style={{ textAlign: 'center', color: 'var(--ink-light)', padding: 48, fontSize: 14 }}>Loading…</div>
      )}

      {!loading && (
        <>
          {/* Pending Bookings */}
          <div style={{ marginBottom: 36 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <h2 style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 500, margin: 0, color: 'var(--ink)' }}>Pending Bookings</h2>
              {pendingBookings.length > 0 && <span className="pill signal">{pendingBookings.length}</span>}
            </div>
            {pendingBookings.length === 0 ? (
              <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 12, padding: '32px', textAlign: 'center', color: 'var(--ink-light)', fontSize: 13 }}>
                No pending bookings
              </div>
            ) : (
              <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 12, overflow: 'hidden' }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Trip</th>
                      <th>Kind</th>
                      <th>Seats</th>
                      <th>Total</th>
                      <th>Payment</th>
                      <th>Submitted</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingBookings.map(b => (
                      <tr key={b.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--tropic-glow)', color: 'var(--tropic-d)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                              {b.member?.initials ?? '?'}
                            </div>
                            <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{b.member?.name ?? 'Unknown'}</span>
                          </div>
                        </td>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                          {b.item_kind === 'flight' && b.flight
                            ? `${b.flight.origin_code} → ${b.flight.dest_code}`
                            : b.excursion?.name ?? b.item_id.slice(0, 8)}
                        </td>
                        <td>{pill(b.item_kind, b.item_kind === 'flight' ? 'tropic' : 'sun')}</td>
                        <td style={{ fontWeight: 600, color: 'var(--ink)' }}>{b.seats}</td>
                        <td style={{ fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>
                          ${b.total.toLocaleString()}
                        </td>
                        <td>{pill(b.payment_method, 'ink')}</td>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-light)' }}>
                          {new Date(b.submitted_at).toLocaleDateString()}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              className="btn-primary"
                              style={{ height: 30, padding: '0 12px', fontSize: 12 }}
                              disabled={working === b.id}
                              onClick={() => approveBooking(b)}
                            >
                              {working === b.id ? '…' : 'Approve'}
                            </button>
                            <button
                              className="btn-ghost"
                              style={{ height: 30, padding: '0 12px', fontSize: 12, color: 'var(--signal)', borderColor: 'rgba(217,78,42,0.3)' }}
                              disabled={working === b.id}
                              onClick={() => setDeclineModal({ id: b.id, kind: 'booking' })}
                            >
                              Decline
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pending Anchors */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <h2 style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 500, margin: 0, color: 'var(--ink)' }}>Anchor Queue</h2>
              {pendingAnchors.length > 0 && <span className="pill sun">{pendingAnchors.length}</span>}
            </div>
            {pendingAnchors.length === 0 ? (
              <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 12, padding: '32px', textAlign: 'center', color: 'var(--ink-light)', fontSize: 13 }}>
                No pending anchor submissions
              </div>
            ) : (
              <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 12, overflow: 'hidden' }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Kind</th>
                      <th>Trip Name</th>
                      <th>Route / Date</th>
                      <th>Seats</th>
                      <th>Submitted</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingAnchors.map(a => {
                      const p = a.payload as Record<string, unknown>
                      const route = a.kind === 'flight'
                        ? `${p.origin_code} → ${p.dest_code}`
                        : `${p.origin_code ?? ''}`
                      return (
                        <tr key={a.id}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--sun-glow)', color: 'var(--sun-d)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                                {a.member?.initials ?? '?'}
                              </div>
                              <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{a.member?.name ?? 'Unknown'}</span>
                            </div>
                          </td>
                          <td>{pill(a.kind, a.kind === 'flight' ? 'tropic' : 'sun')}</td>
                          <td style={{ fontWeight: 500, color: 'var(--ink)' }}>{p.name as string}</td>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                            {route}<br />
                            <span style={{ color: 'var(--ink-light)' }}>{p.date as string}</span>
                          </td>
                          <td style={{ fontWeight: 600, color: 'var(--ink)' }}>
                            {a.kind === 'flight' ? (p.seats_anchor as number ?? 1) : (p.spots_anchor as number ?? 1)} anchor
                          </td>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-light)' }}>
                            {new Date(a.submitted_at).toLocaleDateString()}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                className="btn-sun"
                                style={{ height: 30, padding: '0 12px', fontSize: 12 }}
                                disabled={working === a.id}
                                onClick={() => publishAnchor(a)}
                              >
                                {working === a.id ? '…' : 'Publish'}
                              </button>
                              <button
                                className="btn-ghost"
                                style={{ height: 30, padding: '0 12px', fontSize: 12, color: 'var(--signal)', borderColor: 'rgba(217,78,42,0.3)' }}
                                disabled={working === a.id}
                                onClick={() => setDeclineModal({ id: a.id, kind: 'anchor' })}
                              >
                                Decline
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
