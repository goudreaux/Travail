'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

type ActivityRow = {
  id: string
  created_at: string
  actor_kind: string
  actor_member_id: string | null
  subject_member_id: string | null
  action: string
  summary: string
  booking_id: string | null
  item_kind: string | null
  item_id: string | null
  meta: Record<string, unknown>
}

const ACTION_META: Record<string, { label: string; pill: string }> = {
  booking_submitted: { label: 'Requested', pill: 'sun' },
  booking_confirmed: { label: 'Confirmed', pill: 'moss' },
  booking_declined: { label: 'Declined', pill: 'signal' },
  booking_cancelled: { label: 'Cancelled', pill: 'ink' },
  trip_cancelled: { label: 'Trip cancelled', pill: 'signal' },
  waitlist_joined: { label: 'Waitlisted', pill: 'tropic' },
  waitlist_promoted: { label: 'Promoted', pill: 'tropic' },
  anchor_published: { label: 'Published', pill: 'moss' },
  anchor_declined: { label: 'Declined', pill: 'signal' },
  member_created: { label: 'Member', pill: 'tropic' },
}

const ACTION_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'booking', label: 'Bookings' },
  { key: 'anchor', label: 'Anchors' },
  { key: 'member', label: 'Members' },
] as const

function fmtStamp(s: string): string {
  return new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function ActivityPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<ActivityRow[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [group, setGroup] = useState<typeof ACTION_FILTERS[number]['key']>('all')

  const load = useCallback(async () => {
    setLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    let q = db.from('activity_log').select('*').order('created_at', { ascending: false }).limit(500)
    if (from) q = q.gte('created_at', `${from}T00:00:00`)
    if (to) q = q.lte('created_at', `${to}T23:59:59`)
    const { data } = await q
    const list = (data ?? []) as ActivityRow[]

    const ids = [...new Set(list.flatMap(r => [r.actor_member_id, r.subject_member_id]).filter(Boolean) as string[])]
    if (ids.length) {
      const { data: mem } = await db.from('members').select('id, name').in('id', ids)
      const map: Record<string, string> = {}
      for (const m of (mem ?? []) as { id: string; name: string }[]) map[m.id] = m.name
      setNames(map)
    }
    setRows(list)
    setLoading(false)
  }, [from, to]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase
      .channel('activity-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = rows.filter(r => group === 'all' || r.action.startsWith(group))

  return (
    <div className="admin-page">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--display)', fontSize: 30, fontWeight: 500, color: 'var(--ink)', margin: 0 }}>Activity</h1>
        <p style={{ fontSize: 13, color: 'var(--ink-light)', marginTop: 4, marginBottom: 0 }}>
          Append-only record of every action across the network. Nothing is ever edited or deleted.
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="field" style={{ margin: 0 }}>
          <label className="field-lab">From</label>
          <input className="input" type="date" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label className="field-lab">To</label>
          <input className="input" type="date" value={to} onChange={e => setTo(e.target.value)} />
        </div>
        {(from || to) && (
          <button className="btn-ghost" style={{ height: 38 }} onClick={() => { setFrom(''); setTo('') }}>Clear dates</button>
        )}
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
          {ACTION_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setGroup(f.key)}
              style={{
                padding: '6px 14px', borderRadius: 20, fontSize: 12.5,
                fontFamily: 'var(--ui)', fontWeight: group === f.key ? 600 : 400,
                border: `1px solid ${group === f.key ? 'var(--tropic)' : 'var(--hair-2)'}`,
                background: group === f.key ? 'var(--tropic-glow)' : 'transparent',
                color: group === f.key ? 'var(--tropic-d)' : 'var(--ink-light)',
                cursor: 'pointer',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--ink-light)', fontSize: 14 }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 12, padding: 32, textAlign: 'center', color: 'var(--ink-light)', fontSize: 13 }}>
          No activity in this range.
        </div>
      ) : (
        <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 12, overflow: 'hidden' }}>
          {filtered.map((r, i) => {
            const meta = ACTION_META[r.action] ?? { label: r.action, pill: 'ink' }
            const actor = r.actor_member_id ? (names[r.actor_member_id] ?? 'Member') : (r.actor_kind === 'admin' ? 'Concierge Team' : r.actor_kind === 'system' ? 'System' : '—')
            return (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 14, padding: '13px 18px',
                borderTop: i === 0 ? 'none' : '1px solid var(--hair)',
              }}>
                <div style={{ minWidth: 150, flexShrink: 0, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-light)', paddingTop: 2 }}>
                  {fmtStamp(r.created_at)}
                </div>
                <div style={{ flexShrink: 0 }}>
                  <span className={`pill ${meta.pill}`} style={{ fontSize: 9.5 }}>{meta.label}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, color: 'var(--ink)' }}>{r.summary}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-faint)', fontFamily: 'var(--mono)', marginTop: 2 }}>
                    {actor}{r.booking_id ? `  ·  ${r.booking_id}` : ''}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
