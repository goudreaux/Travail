'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

// Member engagement table for the developer dashboard.
//
// Each row shows what we know about a single member's activity —
// last login + last action + login count + total session time +
// cancel count (90d and lifetime) + counts derived from joins
// (bookings made, anchors submitted, referrals submitted, completed
// trips). Default sort is last_active_at desc so the most engaged
// members surface first; click a header to flip.
//
// Data sources:
//   - members table (last_login_at, last_active_at, login_count,
//     total_session_minutes, cancel_count_90d, cancel_count_lifetime,
//     joined_at) — written by /api/activity/beacon + login + the
//     bookings cancel-count trigger from migration 050
//   - bookings (count where status != 'cancelled')
//   - anchor_submissions (count by member_id)
//   - referrals (count by referrer_id)

interface Row {
  id: string
  name: string | null
  joined_at: string | null
  last_login_at: string | null
  last_active_at: string | null
  login_count: number
  total_session_minutes: number
  cancel_count_90d: number
  cancel_count_lifetime: number
  subscription_status: string | null
  is_admin: boolean
  // Joins
  bookings_count: number
  anchors_count: number
  referrals_count: number
}

type SortKey =
  | 'name' | 'last_active_at' | 'last_login_at' | 'login_count'
  | 'total_session_minutes' | 'cancel_count_90d' | 'cancel_count_lifetime'
  | 'bookings_count' | 'anchors_count' | 'referrals_count' | 'joined_at'

function fmtRel(iso: string | null): string {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0) return '—'
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtMinutes(min: number): string {
  if (!min) return '—'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

export function MemberStatsPanel({
  collapsible = false,
  open = true,
  onToggle,
}: {
  collapsible?: boolean
  open?: boolean
  onToggle?: () => void
} = {}) {
  const supabase = createClient()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('last_active_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const [{ data: m }, { data: bk }, { data: an }, { data: rf }] = await Promise.all([
      db.from('members').select('id, name, joined_at, last_login_at, last_active_at, login_count, total_session_minutes, cancel_count_90d, cancel_count_lifetime, subscription_status, is_admin'),
      db.from('bookings').select('member_id, status'),
      db.from('anchor_submissions').select('member_id'),
      db.from('referrals').select('referrer_id'),
    ])
    const bookingsByMember = new Map<string, number>()
    for (const b of (bk ?? []) as { member_id: string | null; status: string }[]) {
      if (!b.member_id) continue
      if (b.status === 'cancelled') continue
      bookingsByMember.set(b.member_id, (bookingsByMember.get(b.member_id) ?? 0) + 1)
    }
    const anchorsByMember = new Map<string, number>()
    for (const a of (an ?? []) as { member_id: string | null }[]) {
      if (!a.member_id) continue
      anchorsByMember.set(a.member_id, (anchorsByMember.get(a.member_id) ?? 0) + 1)
    }
    const referralsByMember = new Map<string, number>()
    for (const r of (rf ?? []) as { referrer_id: string | null }[]) {
      if (!r.referrer_id) continue
      referralsByMember.set(r.referrer_id, (referralsByMember.get(r.referrer_id) ?? 0) + 1)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list: Row[] = ((m ?? []) as any[]).map(x => ({
      id: x.id,
      name: x.name,
      joined_at: x.joined_at ?? null,
      last_login_at: x.last_login_at ?? null,
      last_active_at: x.last_active_at ?? null,
      login_count: x.login_count ?? 0,
      total_session_minutes: x.total_session_minutes ?? 0,
      cancel_count_90d: x.cancel_count_90d ?? 0,
      cancel_count_lifetime: x.cancel_count_lifetime ?? 0,
      subscription_status: x.subscription_status ?? null,
      is_admin: !!x.is_admin,
      bookings_count: bookingsByMember.get(x.id) ?? 0,
      anchors_count: anchorsByMember.get(x.id) ?? 0,
      referrals_count: referralsByMember.get(x.id) ?? 0,
    }))
    setRows(list)
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  function setSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir(k === 'name' || k === 'joined_at' ? 'asc' : 'desc') }
  }

  const filtered = rows.filter(r => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (r.name ?? '').toLowerCase().includes(q) || r.id.toLowerCase().includes(q)
  })

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    const va = (a as unknown as Record<string, unknown>)[sortKey]
    const vb = (b as unknown as Record<string, unknown>)[sortKey]
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
    return String(va).localeCompare(String(vb)) * dir
  })

  // Aggregates for the strip above the table.
  const activeLast7 = rows.filter(r => r.last_active_at && (Date.now() - new Date(r.last_active_at).getTime()) < 7 * 86400000).length
  const activeLast30 = rows.filter(r => r.last_active_at && (Date.now() - new Date(r.last_active_at).getTime()) < 30 * 86400000).length
  const totalLogins = rows.reduce((s, r) => s + r.login_count, 0)
  const flaggedCancellers = rows.filter(r => r.cancel_count_90d >= 3).length

  function Header({ k, label, align }: { k: SortKey; label: string; align?: 'left' | 'right' }) {
    const active = sortKey === k
    return (
      <th
        onClick={() => setSort(k)}
        style={{
          cursor: 'pointer',
          textAlign: align ?? 'left',
          fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase',
          color: active ? 'var(--ink)' : 'var(--ink-light)', fontWeight: 700,
          padding: '10px 12px', userSelect: 'none', whiteSpace: 'nowrap',
        }}
      >
        {label}{active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
      </th>
    )
  }

  // When collapsed, swap the header for a button-based toggle and hide
  // everything below. When the parent isn't passing the collapsible
  // prop, render the original always-open header with the inline search.
  const showBody = !collapsible || open
  return (
    <div className="panel" style={{ marginBottom: 24 }}>
      {collapsible ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="panel-head"
          style={{
            width: '100%', background: 'transparent', border: 'none', cursor: 'pointer',
            textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}
        >
          <h3 style={{ margin: 0 }}>Member stats</h3>
          <span aria-hidden style={{
            fontSize: 16, color: 'var(--ink-light)',
            transition: 'transform 0.18s',
            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
            display: 'inline-block',
          }}>▾</span>
        </button>
      ) : (
        <div className="panel-head">
          <h3>Member stats</h3>
          <input
            className="input"
            placeholder="Search by name or member id…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ maxWidth: 240, height: 32, fontSize: 12 }}
          />
        </div>
      )}

      {showBody && collapsible && (
        <div style={{ padding: '14px 20px 0' }}>
          <input
            className="input"
            placeholder="Search by name or member id…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ maxWidth: 320, height: 32, fontSize: 12 }}
          />
        </div>
      )}

      {showBody && (<>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, padding: '14px 20px 0' }}>
        <Stat label="Active · 7 days"   value={activeLast7} />
        <Stat label="Active · 30 days"  value={activeLast30} />
        <Stat label="Lifetime logins"   value={totalLogins} />
        <Stat label="Cancel-flagged"    value={flaggedCancellers} urgent={flaggedCancellers > 0} />
      </div>

      <div style={{ padding: '14px 20px 20px', overflowX: 'auto' }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-light)', fontSize: 13 }}>Loading…</div>
        ) : sorted.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-light)', fontSize: 13 }}>No members match.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--hair)' }}>
                <Header k="name"                  label="Member" />
                <Header k="last_active_at"        label="Last active" />
                <Header k="last_login_at"         label="Last login" />
                <Header k="login_count"           label="Logins" align="right" />
                <Header k="total_session_minutes" label="Time on app" align="right" />
                <Header k="bookings_count"        label="Bookings" align="right" />
                <Header k="anchors_count"         label="Anchors" align="right" />
                <Header k="referrals_count"       label="Referrals" align="right" />
                <Header k="cancel_count_90d"      label="Cancels 90d" align="right" />
                <Header k="cancel_count_lifetime" label="Cancels life" align="right" />
                <Header k="joined_at"             label="Joined" />
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => {
                const flagged = r.cancel_count_90d >= 3
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--hair-2)' }}>
                    <td style={{ padding: '10px 12px', fontSize: 13 }}>
                      <div style={{ fontWeight: 500, color: 'var(--ink)' }}>
                        {r.name ?? '—'}
                        {r.is_admin && <span style={{ marginLeft: 6, fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--tropic-d)' }}>admin</span>}
                      </div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-faint)' }}>{r.id}</div>
                    </td>
                    <td style={{ padding: '10px 12px', fontFamily: 'var(--mono)', fontSize: 11.5, color: r.last_active_at ? 'var(--ink)' : 'var(--ink-faint)' }}>{fmtRel(r.last_active_at)}</td>
                    <td style={{ padding: '10px 12px', fontFamily: 'var(--mono)', fontSize: 11.5, color: r.last_login_at ? 'var(--ink)' : 'var(--ink-faint)' }}>{fmtRel(r.last_login_at)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>{r.login_count || '—'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>{fmtMinutes(r.total_session_minutes)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>{r.bookings_count || '—'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>{r.anchors_count || '—'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>{r.referrals_count || '—'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, color: flagged ? 'var(--signal)' : 'inherit', fontWeight: flagged ? 700 : 400 }}>
                      {r.cancel_count_90d || '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>{r.cancel_count_lifetime || '—'}</td>
                    <td style={{ padding: '10px 12px', fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink-light)' }}>
                      {r.joined_at ? new Date(r.joined_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      </>)}
    </div>
  )
}

function Stat({ label, value, urgent }: { label: string; value: number; urgent?: boolean }) {
  return (
    <div style={{
      background: urgent ? 'rgba(217,78,42,0.08)' : 'var(--paper)',
      border: `1px solid ${urgent ? 'rgba(217,78,42,0.25)' : 'var(--hair-2)'}`,
      borderRadius: 10,
      padding: '10px 14px',
    }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-light)', fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: 'var(--display)', fontSize: 22, color: urgent ? 'var(--signal)' : 'var(--ink)', fontWeight: 500 }}>{value}</div>
    </div>
  )
}
