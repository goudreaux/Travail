'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type ActivityRow = {
  id: string
  created_at: string
  actor_member_id: string | null
  action: string
  summary: string
}

const ACTION_PILL: Record<string, string> = {
  booking_submitted: 'sun', booking_confirmed: 'moss', booking_declined: 'signal',
  booking_cancelled: 'ink', trip_cancelled: 'signal', waitlist_promoted: 'tropic',
  anchor_published: 'moss', anchor_declined: 'signal', member_created: 'tropic',
}

function timeAgo(s: string): string {
  const mins = Math.floor((Date.now() - new Date(s).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function AdminOverview() {
  const supabase = createClient()
  const [stats, setStats] = useState({ members: 0, activeTrips: 0, queue: 0, pendingBookings: 0, pendingAnchors: 0, cancellations: 0 })
  const [recent, setRecent] = useState<ActivityRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const [
      { count: memberCount },
      { count: flightCount },
      { count: excursionCount },
      { data: pendingBk },
      { count: pendingAnchorCount },
      { count: cancelCount },
      { data: activity },
    ] = await Promise.all([
      supabase.from('members').select('*', { count: 'exact', head: true }),
      supabase.from('flights').select('*', { count: 'exact', head: true }).in('status', ['open', 'full']),
      supabase.from('excursions').select('*', { count: 'exact', head: true }).in('status', ['open', 'full']),
      supabase.from('bookings').select('id').eq('status', 'pending'),
      supabase.from('anchor_submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      db.from('cancellation_requests').select('*', { count: 'exact', head: true }).eq('status', 'open'),
      db.from('activity_log').select('id, created_at, actor_member_id, action, summary').order('created_at', { ascending: false }).limit(12),
    ])

    // Round trips count once in the queue.
    const ids = new Set((pendingBk ?? []).map((b: { id: string }) => b.id))
    const pendingBookings = (pendingBk ?? []).filter((b: { id: string }) => !(b.id.endsWith('R') && ids.has(b.id.slice(0, -1)))).length
    const pendingAnchors = pendingAnchorCount ?? 0
    const cancellations = cancelCount ?? 0

    setStats({
      members: memberCount ?? 0,
      activeTrips: (flightCount ?? 0) + (excursionCount ?? 0),
      queue: pendingBookings + pendingAnchors + cancellations,
      pendingBookings, pendingAnchors, cancellations,
    })
    setRecent((activity ?? []) as ActivityRow[])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load()
    const ch = supabase
      .channel('overview-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'anchor_submissions' }, load)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load]) // eslint-disable-line react-hooks/exhaustive-deps

  const stat = (val: number, label: string, href: string, color?: string) => (
    <Link href={href} className="stat" style={{ textDecoration: 'none', display: 'block' }}>
      <div className="val" style={color ? { color } : {}}>{val}</div>
      <div className="label">{label}</div>
    </Link>
  )

  return (
    <div style={{ padding: 32 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--display)', fontSize: 30, fontWeight: 500, color: 'var(--ink)', margin: 0 }}>Operations</h1>
        <p style={{ fontSize: 13, color: 'var(--ink-light)', marginTop: 4, marginBottom: 0 }}>The state of the network at a glance.</p>
      </div>

      {/* Action-needed banner */}
      <Link
        href="/admin/queue"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
          background: stats.queue > 0 ? 'var(--night)' : 'var(--card)',
          border: `1px solid ${stats.queue > 0 ? 'transparent' : 'var(--hair)'}`,
          borderRadius: 14, padding: '18px 22px', marginBottom: 24, textDecoration: 'none',
        }}
      >
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: stats.queue > 0 ? 'var(--tropic)' : 'var(--ink-light)', marginBottom: 6 }}>
            Action Queue
          </div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 22, color: stats.queue > 0 ? '#fff' : 'var(--ink)' }}>
            {loading ? '…' : stats.queue > 0
              ? `${stats.queue} item${stats.queue !== 1 ? 's' : ''} need ops action`
              : 'Queue is clear'}
          </div>
          {stats.queue > 0 && (
            <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
              {stats.pendingBookings} booking{stats.pendingBookings !== 1 ? 's' : ''} · {stats.pendingAnchors} anchor{stats.pendingAnchors !== 1 ? 's' : ''} · {stats.cancellations} cancellation{stats.cancellations !== 1 ? 's' : ''}
            </div>
          )}
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: stats.queue > 0 ? 'var(--tropic)' : 'var(--tropic-d)', flexShrink: 0 }}>
          Open Queue →
        </span>
      </Link>

      {/* KPIs */}
      <div className="stat-grid" style={{ marginBottom: 32 }}>
        {stat(stats.members, 'Members', '/admin/members')}
        {stat(stats.activeTrips, 'Active Trips', '/admin/trips', 'var(--tropic-d)')}
        {stat(stats.pendingBookings, 'Pending Bookings', '/admin/queue', stats.pendingBookings > 0 ? 'var(--signal)' : undefined)}
        {stat(stats.pendingAnchors, 'Pending Anchors', '/admin/queue', stats.pendingAnchors > 0 ? 'var(--sun-d)' : undefined)}
      </div>

      {/* Recent activity */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h2 style={{ fontFamily: 'var(--display)', fontSize: 20, fontWeight: 500, margin: 0, color: 'var(--ink)' }}>Recent activity</h2>
        <Link href="/admin/activity" style={{ fontSize: 12.5, color: 'var(--tropic-d)', fontWeight: 500 }}>View all →</Link>
      </div>
      <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 12, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-light)', fontSize: 13 }}>Loading…</div>
        ) : recent.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-light)', fontSize: 13 }}>No activity yet.</div>
        ) : recent.map((r, i) => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderTop: i === 0 ? 'none' : '1px solid var(--hair)' }}>
            <span className={`pill ${ACTION_PILL[r.action] ?? 'ink'}`} style={{ fontSize: 9.5, flexShrink: 0 }}>
              {r.action.replace(/_/g, ' ')}
            </span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.summary}</span>
            <span style={{ flexShrink: 0, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-light)' }}>{timeAgo(r.created_at)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
