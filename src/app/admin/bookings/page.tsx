'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Booking, Member, Flight, Excursion } from '@/lib/supabase/types'

type BookingRow = Booking & {
  member: Pick<Member, 'name' | 'initials'> | null
  flight: Pick<Flight, 'name' | 'origin_code' | 'dest_code'> | null
  excursion: Pick<Excursion, 'name'> | null
}

function genConfCode(): string {
  return 'TV' + Math.random().toString(36).toUpperCase().slice(2, 8)
}

function Toast({ msg, kind }: { msg: string; kind: 'success' | 'error' | 'info' }) {
  return <div className={`toast ${kind}`}>{msg}</div>
}

const STATUS_FILTERS = ['all', 'pending', 'approved', 'declined', 'cancelled', 'refunded'] as const
type StatusFilter = typeof STATUS_FILTERS[number]

export default function BookingsPage() {
  const supabase = createClient()
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [working, setWorking] = useState<string | null>(null)
  const [declineModal, setDeclineModal] = useState<string | null>(null)
  const [declineReason, setDeclineReason] = useState('')
  const [toast, setToast] = useState<{ msg: string; kind: 'success' | 'error' | 'info' } | null>(null)

  const showToast = (msg: string, kind: 'success' | 'error' | 'info' = 'success') => {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 3500)
  }

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: flightBookings }, { data: excBookings }] = await Promise.all([
      supabase.from('bookings').select(`
        *,
        member:members!member_id(name, initials),
        flight:flights!inner(name, origin_code, dest_code)
      `).eq('item_kind', 'flight').order('submitted_at', { ascending: false }),
      supabase.from('bookings').select(`
        *,
        member:members!member_id(name, initials),
        excursion:excursions!inner(name)
      `).eq('item_kind', 'excursion').order('submitted_at', { ascending: false }),
    ])

    const all = [...(flightBookings ?? []), ...(excBookings ?? [])] as unknown as BookingRow[]
    all.sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())
    setBookings(all)
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const filtered = bookings.filter(b => statusFilter === 'all' || b.status === statusFilter)

  const counts: Record<string, number> = {}
  STATUS_FILTERS.forEach(s => {
    counts[s] = s === 'all' ? bookings.length : bookings.filter(b => b.status === s).length
  })

  async function approve(booking: BookingRow) {
    setWorking(booking.id)
    try {
      // Atomic function — checks seat availability and approves in one transaction
      const { data, error } = await supabase.rpc('confirm_booking' as never, { p_booking_id: booking.id } as never)
      if (error) throw error
      const res = data as { ok: boolean; error?: string; confirmation_code?: string }
      if (!res.ok) throw new Error(res.error ?? 'Seat unavailable')

      await supabase.from('notifications').insert({
        member_id: booking.member_id,
        kind: 'booking',
        title: 'Booking Confirmed',
        body: `Your booking has been confirmed. Confirmation code: ${res.confirmation_code}`,
        ref: { booking_id: booking.id, confirmation_code: res.confirmation_code },
      })

      showToast('Booking approved — ' + res.confirmation_code)
      load()
    } catch (e: unknown) {
      showToast((e as Error).message ?? 'Approval failed', 'error')
    } finally { setWorking(null) }
  }

  async function decline(id: string, reason: string) {
    setWorking(id)
    try {
      const booking = bookings.find(b => b.id === id)
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
      load()
    } catch (e: unknown) {
      showToast((e as Error).message ?? 'Decline failed', 'error')
    } finally { setWorking(null) }
  }

  const statusColor: Record<string, string> = {
    pending: 'sun', approved: 'moss', declined: 'signal',
    cancelled: 'ink', refunded: 'ink',
  }

  return (
    <div style={{ padding: 32 }}>
      {toast && <Toast msg={toast.msg} kind={toast.kind} />}

      {declineModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(6,56,71,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--card)', borderRadius: 14, padding: 28, width: 420, boxShadow: '0 16px 64px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontFamily: 'var(--display)', fontSize: 20, color: 'var(--ink)', margin: '0 0 16px' }}>Decline Booking</h3>
            <textarea
              className="input"
              style={{ minHeight: 80, width: '100%', marginBottom: 16 }}
              placeholder="Optional reason for member…"
              value={declineReason}
              onChange={e => setDeclineReason(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => { setDeclineModal(null); setDeclineReason('') }}>Cancel</button>
              <button
                className="btn-primary"
                style={{ background: 'var(--signal)' }}
                disabled={!!working}
                onClick={() => declineModal && decline(declineModal, declineReason)}
              >
                Confirm Decline
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'var(--display)', fontSize: 30, fontWeight: 500, color: 'var(--ink)', margin: 0 }}>Bookings</h1>
        <p style={{ fontSize: 13, color: 'var(--ink-light)', marginTop: 4, marginBottom: 0 }}>All flight and excursion bookings across all members.</p>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {STATUS_FILTERS.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 12.5,
              fontFamily: 'var(--ui)', fontWeight: statusFilter === s ? 600 : 400,
              border: `1px solid ${statusFilter === s ? 'var(--tropic)' : 'var(--hair-2)'}`,
              background: statusFilter === s ? 'var(--tropic-glow)' : 'transparent',
              color: statusFilter === s ? 'var(--tropic-d)' : 'var(--ink-light)',
              cursor: 'pointer',
            }}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
            {counts[s] > 0 && (
              <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: statusFilter === s ? 'var(--tropic-d)' : 'var(--ink-light)' }}>
                {counts[s]}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--ink-light)', fontSize: 14 }}>Loading…</div>
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
                <th>Status</th>
                <th>Confirmation</th>
                <th>Submitted</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(b => (
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
                  <td><span className={`pill ${b.item_kind === 'flight' ? 'tropic' : 'sun'}`}>{b.item_kind}</span></td>
                  <td style={{ fontWeight: 600, color: 'var(--ink)' }}>{b.seats}</td>
                  <td style={{ fontWeight: 700, fontFamily: 'var(--mono)' }}>${b.total.toLocaleString()}</td>
                  <td><span className="pill ink">{b.payment_method}</span></td>
                  <td><span className={`pill ${statusColor[b.status]}`}>{b.status}</span></td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink-mid)', letterSpacing: '0.1em' }}>
                    {b.confirmation_code ?? '—'}
                  </td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-light)' }}>
                    {new Date(b.submitted_at).toLocaleDateString()}
                  </td>
                  <td>
                    {b.status === 'pending' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn-primary"
                          style={{ height: 28, padding: '0 10px', fontSize: 12 }}
                          disabled={working === b.id}
                          onClick={() => approve(b)}
                        >
                          {working === b.id ? '…' : 'Approve'}
                        </button>
                        <button
                          className="btn-ghost"
                          style={{ height: 28, padding: '0 10px', fontSize: 12, color: 'var(--signal)', borderColor: 'rgba(217,78,42,0.3)' }}
                          disabled={working === b.id}
                          onClick={() => setDeclineModal(b.id)}
                        >
                          Decline
                        </button>
                      </div>
                    )}
                    {b.status !== 'pending' && b.decline_reason && (
                      <span style={{ fontSize: 11.5, color: 'var(--ink-light)', fontStyle: 'italic', maxWidth: 160, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b.decline_reason}>
                        {b.decline_reason}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--ink-light)', fontSize: 13 }}>
              No bookings with status: {statusFilter}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
