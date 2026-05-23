'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { genConfirmationCode } from '@/lib/data'
import type { Booking, Member, Flight, Excursion, BookingStatus } from '@/lib/supabase/types'

type BookingRow = Booking & {
  member: Pick<Member, 'name' | 'initials'> | null
  flight: Pick<Flight, 'name' | 'origin_code' | 'dest_code'> | null
  excursion: Pick<Excursion, 'name'> | null
}

function Toast({ msg, kind }: { msg: string; kind: 'success' | 'error' | 'info' }) {
  return <div className={`toast ${kind}`}>{msg}</div>
}

// One Bookings record list: Active (pending/approved), Closed (declined/
// cancelled/refunded), or All.
const TABS = ['active', 'closed', 'all'] as const
type Tab = typeof TABS[number]
const ACTIVE_STATUSES: BookingStatus[] = ['pending', 'approved']
const CLOSED_STATUSES: BookingStatus[] = ['declined', 'cancelled', 'refunded']
const TAB_LABEL: Record<Tab, string> = { active: 'Active', closed: 'Closed', all: 'All' }

export default function BookingsPage() {
  const supabase = createClient()
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('active')
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { data: bk } = await supabase
      .from('bookings')
      .select('*')
      .order('submitted_at', { ascending: false })
    const all = (bk ?? []) as unknown as BookingRow[]

    // No FK embeds in this DB — resolve members and polymorphic trips separately.
    const memberIds = [...new Set(all.map(b => b.member_id))]
    const flightIds = all.filter(b => b.item_kind === 'flight').map(b => b.item_id)
    const excIds = all.filter(b => b.item_kind === 'excursion').map(b => b.item_id)
    const { data: mem } = memberIds.length ? await db.from('members').select('id, name, initials').in('id', memberIds) : { data: [] }
    const { data: fl } = flightIds.length ? await db.from('flights').select('id, name, origin_code, dest_code').in('id', flightIds) : { data: [] }
    const { data: ex } = excIds.length ? await db.from('excursions').select('id, name').in('id', excIds) : { data: [] }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const memMap = new Map((mem ?? []).map((m: any) => [m.id, m]))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const flMap = new Map((fl ?? []).map((f: any) => [f.id, f]))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exMap = new Map((ex ?? []).map((e: any) => [e.id, e]))
    for (const b of all) {
      b.member = (memMap.get(b.member_id) ?? null) as BookingRow['member']
      if (b.item_kind === 'flight') b.flight = (flMap.get(b.item_id) ?? null) as BookingRow['flight']
      else b.excursion = (exMap.get(b.item_id) ?? null) as BookingRow['excursion']
    }

    all.sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())
    setBookings(all)
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  // Collapse round trips (outbound B-X + return B-XR) into one row, and the
  // combined total. Return legs are folded into the outbound.
  const ids = new Set(bookings.map(b => b.id))
  const isReturnLeg = (b: BookingRow) => b.item_kind === 'flight' && b.id.endsWith('R') && ids.has(b.id.slice(0, -1))
  const retOf = (b: BookingRow) => bookings.find(x => x.id === `${b.id}R`)
  const inTab = (s: string, t: Tab) => t === 'all' ? true : t === 'active' ? ACTIVE_STATUSES.includes(s as BookingStatus) : CLOSED_STATUSES.includes(s as BookingStatus)

  const rows = bookings.filter(b => !isReturnLeg(b))
  const filtered = rows.filter(b => inTab(b.status, tab))
  const counts: Record<Tab, number> = {
    active: rows.filter(b => inTab(b.status, 'active')).length,
    closed: rows.filter(b => inTab(b.status, 'closed')).length,
    all: rows.length,
  }
  const legIdsOf = (id: string) => ids.has(`${id}R`) ? [id, `${id}R`] : [id]

  async function approve(booking: BookingRow) {
    setWorking(booking.id)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any
      // Approve both legs of a round trip under one shared code.
      const legs = legIdsOf(booking.id).map(lid => bookings.find(b => b.id === lid)).filter(Boolean) as BookingRow[]
      const code = genConfirmationCode()
      for (const leg of legs) {
        const itemTable = leg.item_kind === 'flight' ? 'flights' : 'excursions'
        const { data: item } = await db.from(itemTable).select('*').eq('id', leg.item_id).single()
        if (!item) throw new Error('Trip not found')
        const capacity = leg.item_kind === 'flight' ? item.seats_total - item.seats_anchor : item.spots_total - item.spots_anchor
        const { data: approvedRows } = await db.from('bookings').select('seats').eq('item_kind', leg.item_kind).eq('item_id', leg.item_id).eq('status', 'approved')
        const taken = (approvedRows ?? []).reduce((s: number, r: { seats: number }) => s + r.seats, 0)
        if (taken + leg.seats > capacity) throw new Error(`Only ${Math.max(0, capacity - taken)} seat(s) left`)
      }
      const { error } = await db.from('bookings').update({
        status: 'approved', confirmation_code: code, decided_at: new Date().toISOString(),
      }).in('id', legs.map(l => l.id))
      if (error) throw error

      try {
        await supabase.from('notifications').insert({
          member_id: booking.member_id,
          kind: 'booking',
          title: 'Booking Confirmed',
          body: `Your booking has been confirmed. Confirmation code: ${code}`,
          ref: { booking_id: booking.id, confirmation_code: code },
        })
      } catch { /* notification is supplementary */ }

      showToast('Booking approved — ' + code)
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
      }).in('id', legIdsOf(id))
      if (error) throw error

      try {
        await supabase.from('notifications').insert({
          member_id: booking.member_id,
          kind: 'booking',
          title: 'Booking Declined',
          body: reason || 'Your booking request was not approved at this time.',
          ref: { booking_id: id },
        })
      } catch { /* notification is supplementary */ }

      showToast('Booking declined')
      setDeclineModal(null)
      setDeclineReason('')
      load()
    } catch (e: unknown) {
      showToast((e as Error).message ?? 'Decline failed', 'error')
    } finally { setWorking(null) }
  }

  // When a confirmed seat frees up, auto-promote the oldest waitlister into a
  // PENDING booking (Ops still confirms + charges).
  async function promoteWaitlist(itemKind: string, itemId: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const table = itemKind === 'flight' ? 'flights' : 'excursions'
    const { data: item } = await db.from(table).select('*').eq('id', itemId).single()
    if (!item) return
    const capacity = itemKind === 'flight' ? item.seats_total - item.seats_anchor : item.spots_total - item.spots_anchor
    const { data: approvedRows } = await db.from('bookings').select('seats').eq('item_kind', itemKind).eq('item_id', itemId).eq('status', 'approved')
    const taken = (approvedRows ?? []).reduce((s: number, r: { seats: number }) => s + r.seats, 0)
    if (taken >= capacity) return // still full
    const { data: wl } = await db.from('waitlist').select('*').eq('item_kind', itemKind).eq('item_id', itemId).order('created_at').limit(1)
    const first = (wl ?? [])[0]
    if (!first) return
    const price = itemKind === 'flight' ? item.price_per_seat : item.price_per_pax
    const fee = Math.round(price * 0.03)
    const id = 'B-' + Date.now().toString(36).toUpperCase()
    await db.from('bookings').insert({
      id, member_id: first.member_id, item_kind: itemKind, item_id: itemId,
      seats: 1, price_per_seat: price, fees: fee, total: price + fee, payment_method: 'card', status: 'pending',
    })
    await db.from('waitlist').delete().eq('id', first.id)
    try {
      await supabase.from('notifications').insert({
        member_id: first.member_id, kind: 'booking',
        title: 'A seat opened up', body: 'A seat opened on a trip you waitlisted — Ops is confirming it now.',
        ref: { item_kind: itemKind, item_id: itemId },
      })
    } catch { /* supplementary */ }
  }

  async function cancelBooking(booking: BookingRow) {
    if (!confirm('Cancel this booking? The member will be notified.')) return
    setWorking(booking.id)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any
      // Anchor rule: an anchor can't be cancelled while other members are booked.
      const table = booking.item_kind === 'flight' ? 'flights' : 'excursions'
      const { data: item } = await db.from(table).select('anchor_member_id').eq('id', booking.item_id).single()
      if (item?.anchor_member_id && item.anchor_member_id === booking.member_id) {
        const { data: others } = await db.from('bookings').select('id')
          .eq('item_kind', booking.item_kind).eq('item_id', booking.item_id)
          .neq('member_id', booking.member_id).in('status', ['pending', 'approved'])
        if ((others ?? []).length > 0) throw new Error('Anchor cannot cancel — other members are booked on this trip.')
      }

      const wasApproved = booking.status === 'approved'
      const legs = legIdsOf(booking.id).map(lid => bookings.find(b => b.id === lid)).filter(Boolean) as BookingRow[]
      const { error } = await supabase.from('bookings').update({
        status: 'cancelled', decided_at: new Date().toISOString(),
      }).in('id', legs.map(l => l.id))
      if (error) throw error

      try {
        await supabase.from('notifications').insert({
          member_id: booking.member_id, kind: 'booking',
          title: 'Booking Cancelled', body: 'Your reservation has been cancelled by Ops.',
          ref: { booking_id: booking.id },
        })
      } catch { /* supplementary */ }

      // Freed a confirmed seat on each leg → promote the waitlist.
      if (wasApproved) for (const leg of legs) await promoteWaitlist(leg.item_kind, leg.item_id)

      showToast('Booking cancelled')
      load()
    } catch (e: unknown) {
      showToast((e as Error).message ?? 'Cancel failed', 'error')
    } finally { setWorking(null) }
  }

  // Permanently remove a closed booking record (both legs of a round trip).
  // Passengers, messages, and cancellation requests cascade-delete with it.
  async function deleteBooking(booking: BookingRow) {
    if (!confirm('Permanently delete this closed booking record? This cannot be undone.')) return
    setWorking(booking.id)
    try {
      const { data, error } = await supabase.from('bookings').delete().in('id', legIdsOf(booking.id)).select()
      if (error) throw error
      if (!data || data.length === 0) throw new Error('Delete blocked — run migration 016 (admin delete policy on bookings)')
      showToast('Booking deleted')
      load()
    } catch (e: unknown) {
      showToast((e as Error).message ?? 'Delete failed', 'error')
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
        <p style={{ fontSize: 13, color: 'var(--ink-light)', marginTop: 4, marginBottom: 0 }}>Every flight and excursion booking. Round trips show as one record.</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 12.5,
              fontFamily: 'var(--ui)', fontWeight: tab === t ? 600 : 400,
              border: `1px solid ${tab === t ? 'var(--tropic)' : 'var(--hair-2)'}`,
              background: tab === t ? 'var(--tropic-glow)' : 'transparent',
              color: tab === t ? 'var(--tropic-d)' : 'var(--ink-light)',
              cursor: 'pointer',
            }}
          >
            {TAB_LABEL[t]}
            {counts[t] > 0 && (
              <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: tab === t ? 'var(--tropic-d)' : 'var(--ink-light)' }}>
                {counts[t]}
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
                      ? `${b.flight.origin_code} ${retOf(b) ? '⇄' : '→'} ${b.flight.dest_code}`
                      : b.excursion?.name ?? b.item_id.slice(0, 8)}
                  </td>
                  <td><span className={`pill ${b.item_kind === 'flight' ? 'tropic' : 'sun'}`}>{retOf(b) ? 'round trip' : b.item_kind}</span></td>
                  <td style={{ fontWeight: 600, color: 'var(--ink)' }}>{b.seats}</td>
                  <td style={{ fontWeight: 700, fontFamily: 'var(--mono)' }}>${(b.total + (retOf(b)?.total ?? 0)).toLocaleString()}</td>
                  <td><span className="pill ink">{b.payment_method}</span></td>
                  <td><span className={`pill ${statusColor[b.status]}`}>{b.status}</span></td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink-mid)', letterSpacing: '0.1em' }}>
                    {b.confirmation_code ?? '—'}
                  </td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-light)' }}>
                    {new Date(b.submitted_at).toLocaleDateString()}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {b.status === 'pending' && (
                        <>
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
                        </>
                      )}
                      <Link href={`/admin/inbox?b=${b.id}`} className="btn-ghost" style={{ height: 28, padding: '0 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center' }}>
                        Thread
                      </Link>
                      {(b.status === 'approved' || b.status === 'pending') && (
                        <button
                          className="btn-ghost"
                          style={{ height: 28, padding: '0 10px', fontSize: 12, color: 'var(--signal)', borderColor: 'rgba(217,78,42,0.3)' }}
                          disabled={working === b.id}
                          onClick={() => cancelBooking(b)}
                        >
                          Cancel
                        </button>
                      )}
                      {CLOSED_STATUSES.includes(b.status as BookingStatus) && (
                        <button
                          className="btn-ghost"
                          style={{ height: 28, padding: '0 10px', fontSize: 12, color: 'var(--signal)', borderColor: 'rgba(217,78,42,0.3)' }}
                          disabled={working === b.id}
                          onClick={() => deleteBooking(b)}
                        >
                          {working === b.id ? '…' : 'Delete'}
                        </button>
                      )}
                    </div>
                    {b.status !== 'pending' && b.decline_reason && (
                      <span style={{ fontSize: 11.5, color: 'var(--ink-light)', fontStyle: 'italic', maxWidth: 160, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 4 }} title={b.decline_reason}>
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
              No {tab === 'all' ? '' : tab} bookings.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
