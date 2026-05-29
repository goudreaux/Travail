'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

// Ops-side roster of every member with subscription state. Past-due
// surfaces to the top because that's the queue ops works each morning.
// Click row → /admin/members?focus=<id> to open that member's detail
// (cancel button lives there).

interface Row {
  id: string
  name: string | null
  member_no: number | null
  subscription_status: string | null
  current_period_end: string | null
  subscription_price_id: string | null
  is_founding_member: boolean
  stripe_subscription_id: string | null
}

const STATUS_RANK: Record<string, number> = {
  past_due: 0,
  unpaid: 0,
  incomplete: 1,
  active: 2,
  trialing: 2,
  incomplete_expired: 3,
  canceled: 4,
  cancelled: 4,
}

const STATUS_PILL: Record<string, string> = {
  active: 'moss',
  trialing: 'moss',
  past_due: 'signal',
  unpaid: 'signal',
  incomplete: 'sun',
  incomplete_expired: 'ink',
  canceled: 'ink',
  cancelled: 'ink',
}

function fmtDate(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const TABS = [
  { key: 'all',         label: 'All' },
  { key: 'active',      label: 'Active' },
  { key: 'past_due',    label: 'Past due', urgent: true },
  { key: 'founding',    label: 'Founding' },
  { key: 'cancelled',   label: 'Cancelled' },
] as const

export default function AdminSubscriptionsPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<typeof TABS[number]['key']>('all')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { data } = await db
      .from('members')
      .select('id, name, member_no, subscription_status, current_period_end, subscription_price_id, is_founding_member, stripe_subscription_id')
      .order('name')
    const list = (data ?? []) as Row[]
    // Sort by status rank (past_due first), then by name.
    list.sort((a, b) => {
      const ra = STATUS_RANK[a.subscription_status ?? ''] ?? 5
      const rb = STATUS_RANK[b.subscription_status ?? ''] ?? 5
      if (ra !== rb) return ra - rb
      return (a.name ?? '').localeCompare(b.name ?? '')
    })
    setRows(list)
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  const filtered = rows.filter(r => {
    if (tab === 'active' && !(r.subscription_status === 'active' || r.subscription_status === 'trialing')) return false
    if (tab === 'past_due' && !(r.subscription_status === 'past_due' || r.subscription_status === 'unpaid')) return false
    if (tab === 'founding' && !r.is_founding_member) return false
    if (tab === 'cancelled' && !(r.subscription_status === 'canceled' || r.subscription_status === 'cancelled' || r.subscription_status === 'incomplete_expired')) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      if (!(r.name ?? '').toLowerCase().includes(q)
        && !(r.id ?? '').toLowerCase().includes(q)
        && !(r.stripe_subscription_id ?? '').toLowerCase().includes(q)) return false
    }
    return true
  })

  const pastDueCount = rows.filter(r => r.subscription_status === 'past_due' || r.subscription_status === 'unpaid').length
  const activeCount = rows.filter(r => r.subscription_status === 'active' || r.subscription_status === 'trialing').length
  const foundingCount = rows.filter(r => r.is_founding_member).length

  return (
    <div className="admin-page">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--display)', fontSize: 30, fontWeight: 500, color: 'var(--ink)', margin: 0 }}>Subscriptions</h1>
        <p style={{ fontSize: 13, color: 'var(--ink-light)', marginTop: 4, marginBottom: 0 }}>
          Membership roster. Past-due surfaces first, call ops gets the queue each morning.
        </p>
      </div>

      {/* Stat strip */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <StatChip label="Active" value={activeCount} accent="moss" />
        <StatChip label="Past due" value={pastDueCount} accent="signal" urgent={pastDueCount > 0} />
        <StatChip label="Founding" value={foundingCount} accent="sun" />
      </div>

      {/* Tabs + search */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 12.5,
              fontFamily: 'var(--ui)', fontWeight: tab === t.key ? 600 : 400,
              border: `1px solid ${tab === t.key ? 'var(--tropic)' : 'var(--hair-2)'}`,
              background: tab === t.key ? 'var(--tropic-glow)' : 'transparent',
              color: tab === t.key ? 'var(--tropic-d)' : ('urgent' in t && t.urgent && pastDueCount > 0 ? 'var(--signal)' : 'var(--ink-light)'),
              cursor: 'pointer',
            }}
          >
            {t.label}{'urgent' in t && t.urgent && pastDueCount > 0 ? ` · ${pastDueCount}` : ''}
          </button>
        ))}
      </div>
      <div style={{ marginBottom: 18 }}>
        <input className="input" type="text" placeholder="Search by name, member id, or stripe sub id…" value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 340 }} />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--ink-light)', fontSize: 14 }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 12, padding: 32, textAlign: 'center', color: 'var(--ink-light)', fontSize: 13 }}>
          No members match these filters.
        </div>
      ) : (
        <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 12, overflow: 'hidden' }}>
          {filtered.map((r, i) => {
            const pill = STATUS_PILL[r.subscription_status ?? ''] ?? 'ink'
            const statusLabel = r.subscription_status === 'past_due' ? 'past due'
              : r.subscription_status === 'incomplete_expired' ? 'expired'
              : r.subscription_status ?? 'none'
            return (
              <Link
                key={r.id}
                href={`/admin/members?focus=${r.id}`}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 18px', borderTop: i === 0 ? 'none' : '1px solid var(--hair)', textDecoration: 'none', color: 'inherit' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{r.name ?? 'Unnamed'}</span>
                    {r.is_founding_member && <span className="pill sun" style={{ fontSize: 9.5 }}>founding</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-faint)', fontFamily: 'var(--mono)', marginTop: 2 }}>
                    {r.id}{r.member_no ? ` · #${r.member_no}` : ''}{r.stripe_subscription_id ? `  ·  ${r.stripe_subscription_id}` : ''}
                  </div>
                </div>
                <div style={{ minWidth: 120, textAlign: 'right' }}>
                  <span className={`pill ${pill}`} style={{ fontSize: 9.5 }}>{statusLabel}</span>
                </div>
                <div style={{ minWidth: 130, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-light)' }}>
                  {fmtDate(r.current_period_end)}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatChip({ label, value, accent, urgent }: { label: string; value: number; accent: string; urgent?: boolean }) {
  return (
    <div style={{
      background: urgent ? 'rgba(217,78,42,0.08)' : 'var(--card)',
      border: `1px solid ${urgent ? 'rgba(217,78,42,0.30)' : 'var(--hair)'}`,
      borderRadius: 10,
      padding: '12px 18px',
      minWidth: 110,
    }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-light)', fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: 'var(--display)', fontSize: 24, color: `var(--${accent})`, fontWeight: 500 }}>{value}</div>
    </div>
  )
}
