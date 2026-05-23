'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Booking, AnchorSubmission, Member, Flight, Excursion, BookingStatus } from '@/lib/supabase/types'

// Unified history record — closed-out bookings and declined anchor submissions.
type HistoryRow = {
  id: string
  source: 'booking' | 'anchor'
  memberId: string
  memberName: string
  memberInitials: string
  kind: 'flight' | 'excursion'
  trip: string
  status: string
  seats: number | null
  total: number | null
  reason: string | null
  date: string // decided_at ?? submitted_at
}

const BOOKING_HISTORY_STATUSES: BookingStatus[] = ['declined', 'cancelled', 'refunded']

const statusColor: Record<string, string> = {
  declined: 'signal', cancelled: 'ink', refunded: 'ink',
}

export default function HistoryPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<HistoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const [{ data: bk }, { data: an }] = await Promise.all([
      supabase.from('bookings').select('*').in('status', BOOKING_HISTORY_STATUSES).order('decided_at', { ascending: false }),
      supabase.from('anchor_submissions').select('*').eq('status', 'declined').order('decided_at', { ascending: false }),
    ])

    const bookings = (bk ?? []) as unknown as Booking[]
    const anchors = (an ?? []) as unknown as AnchorSubmission[]

    // Resolve members + polymorphic trips (no FK embeds in this DB).
    const memberIds = [...new Set([...bookings.map(b => b.member_id), ...anchors.map(a => a.member_id)])]
    const flightIds = bookings.filter(b => b.item_kind === 'flight').map(b => b.item_id)
    const excIds = bookings.filter(b => b.item_kind === 'excursion').map(b => b.item_id)

    const [{ data: mem }, { data: fl }, { data: ex }] = await Promise.all([
      memberIds.length ? db.from('members').select('id, name, initials').in('id', memberIds) : Promise.resolve({ data: [] }),
      flightIds.length ? db.from('flights').select('id, name, origin_code, dest_code').in('id', flightIds) : Promise.resolve({ data: [] }),
      excIds.length ? db.from('excursions').select('id, name').in('id', excIds) : Promise.resolve({ data: [] }),
    ])

    type MemRef = Pick<Member, 'id' | 'name' | 'initials'>
    type FlRef = Pick<Flight, 'id' | 'name' | 'origin_code' | 'dest_code'>
    type ExRef = Pick<Excursion, 'id' | 'name'>
    const memMap = new Map<string, MemRef>((mem ?? []).map((m: MemRef) => [m.id, m]))
    const flMap = new Map<string, FlRef>((fl ?? []).map((f: FlRef) => [f.id, f]))
    const exMap = new Map<string, ExRef>((ex ?? []).map((e: ExRef) => [e.id, e]))

    const bookingRows: HistoryRow[] = bookings.map(b => {
      const m = memMap.get(b.member_id)
      const f = b.item_kind === 'flight' ? flMap.get(b.item_id) : undefined
      const e = b.item_kind === 'excursion' ? exMap.get(b.item_id) : undefined
      return {
        id: b.id,
        source: 'booking',
        memberId: b.member_id,
        memberName: m?.name ?? 'Unknown',
        memberInitials: m?.initials ?? '?',
        kind: b.item_kind,
        trip: f ? `${f.origin_code} → ${f.dest_code}` : e?.name ?? b.item_id.slice(0, 8),
        status: b.status,
        seats: b.seats,
        total: b.total,
        reason: b.decline_reason ?? null,
        date: b.decided_at ?? b.submitted_at,
      }
    })

    const anchorRows: HistoryRow[] = anchors.map(a => {
      const m = memMap.get(a.member_id)
      const p = (a.payload ?? {}) as Record<string, unknown>
      return {
        id: a.id,
        source: 'anchor',
        memberId: a.member_id,
        memberName: m?.name ?? 'Unknown',
        memberInitials: m?.initials ?? '?',
        kind: a.kind,
        trip: String(p.name ?? a.kind),
        status: 'declined',
        seats: null,
        total: null,
        reason: a.decline_reason ?? null,
        date: a.decided_at ?? a.submitted_at,
      }
    })

    const all = [...bookingRows, ...anchorRows].sort(
      (x, y) => new Date(y.date).getTime() - new Date(x.date).getTime()
    )
    setRows(all)
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const q = search.trim().toLowerCase()
  const filtered = q
    ? rows.filter(r => r.memberName.toLowerCase().includes(q) || r.trip.toLowerCase().includes(q))
    : rows

  return (
    <div style={{ padding: 32 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'var(--display)', fontSize: 30, fontWeight: 500, color: 'var(--ink)', margin: 0 }}>History</h1>
        <p style={{ fontSize: 13, color: 'var(--ink-light)', marginTop: 4, marginBottom: 0 }}>
          Closed-out records — declined &amp; cancelled bookings and declined anchor submissions, by member.
        </p>
      </div>

      <div className="search" style={{ maxWidth: 320, marginBottom: 20 }}>
        <svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
          <circle cx="9" cy="9" r="6" /><line x1="13.5" y1="13.5" x2="18" y2="18" />
        </svg>
        <input
          type="text"
          placeholder="Search by member or trip…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--ink-light)', fontSize: 14 }}>Loading…</div>
      ) : (
        <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 12, overflow: 'hidden' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Record</th>
                <th>Kind</th>
                <th>Trip</th>
                <th>Seats</th>
                <th>Total</th>
                <th>Status</th>
                <th>Reason</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={`${r.source}-${r.id}`}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--warm)', color: 'var(--ink-mid)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                        {r.memberInitials}
                      </div>
                      <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{r.memberName}</span>
                    </div>
                  </td>
                  <td><span className="pill ink">{r.source}</span></td>
                  <td><span className={`pill ${r.kind === 'flight' ? 'tropic' : 'sun'}`}>{r.kind}</span></td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{r.trip}</td>
                  <td style={{ fontWeight: 600, color: 'var(--ink)' }}>{r.seats ?? '—'}</td>
                  <td style={{ fontWeight: 700, fontFamily: 'var(--mono)' }}>{r.total != null ? `$${r.total.toLocaleString()}` : '—'}</td>
                  <td><span className={`pill ${statusColor[r.status] ?? 'ink'}`}>{r.status}</span></td>
                  <td style={{ fontSize: 11.5, color: 'var(--ink-light)', fontStyle: r.reason ? 'italic' : 'normal', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.reason ?? ''}>
                    {r.reason || '—'}
                  </td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-light)' }}>
                    {new Date(r.date).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--ink-light)', fontSize: 13 }}>
              {search ? `No history matching "${search}".` : 'No history yet.'}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 16, fontSize: 12, color: 'var(--ink-light)' }}>
        Active records live in <Link href="/admin/bookings" style={{ color: 'var(--tropic-d)' }}>Bookings</Link> and <Link href="/admin/anchors" style={{ color: 'var(--tropic-d)' }}>Anchors</Link>.
      </div>
    </div>
  )
}
