'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

// Ops view of every email we've sent. Sourced from public.email_log,
// which sendMemberMail() / notifyOps() / notify-email Edge Function all
// insert into after their Resend call. Lets ops answer "did the trip
// cancellation email actually go out to Kayla?" without grepping Gmail.

interface EmailLogRow {
  id: string
  sent_at: string
  kind: string
  member_id: string | null
  to_email: string
  subject: string
  resend_id: string | null
  refs: Record<string, unknown>
  send_status: 'sent' | 'failed'
  send_error: string | null
  bcc_ops: boolean
}

const KIND_FILTERS = [
  { key: 'all',                  label: 'All' },
  { key: 'booking_receipt',      label: 'Receipts' },
  { key: 'settlement',           label: 'Settlements' },
  { key: 'pax_trip_complete',    label: 'Trip wrapped' },
  { key: 'trip_cancelled',       label: 'Cancelled' },
  { key: 'notify_email',         label: 'In-app' },
  { key: 'ops_notify',           label: 'Concierge alerts' },
] as const

const KIND_PILL: Record<string, string> = {
  booking_receipt:   'moss',
  settlement:        'tropic',
  pax_trip_complete: 'tropic',
  trip_cancelled:    'signal',
  notify_email:      'ink',
  ops_notify:        'sun',
}

function fmtStamp(s: string): string {
  return new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function EmailLogPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<EmailLogRow[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [kind, setKind] = useState<typeof KIND_FILTERS[number]['key']>('all')
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    let q = db.from('email_log').select('*').order('sent_at', { ascending: false }).limit(500)
    if (from) q = q.gte('sent_at', `${from}T00:00:00`)
    if (to) q = q.lte('sent_at', `${to}T23:59:59`)
    if (kind !== 'all') q = q.eq('kind', kind)
    const { data } = await q
    const list = (data ?? []) as EmailLogRow[]
    const memberIds = [...new Set(list.map(r => r.member_id).filter(Boolean) as string[])]
    if (memberIds.length) {
      const { data: mem } = await db.from('members').select('id, name').in('id', memberIds)
      const map: Record<string, string> = {}
      for (const m of (mem ?? []) as { id: string; name: string }[]) map[m.id] = m.name
      setNames(map)
    } else {
      setNames({})
    }
    setRows(list)
    setLoading(false)
  }, [from, to, kind]) // eslint-disable-line react-hooks/exhaustive-deps

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  const filtered = rows.filter(r => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      r.subject.toLowerCase().includes(q)
      || r.to_email.toLowerCase().includes(q)
      || (r.member_id ?? '').toLowerCase().includes(q)
      || (r.member_id && (names[r.member_id] ?? '').toLowerCase().includes(q))
      || (r.resend_id ?? '').toLowerCase().includes(q)
      || JSON.stringify(r.refs ?? {}).toLowerCase().includes(q)
    )
  })

  const sentCount = filtered.filter(r => r.send_status === 'sent').length
  const failedCount = filtered.filter(r => r.send_status === 'failed').length

  return (
    <div className="admin-page">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--display)', fontSize: 30, fontWeight: 500, color: 'var(--ink)', margin: 0 }}>Email log</h1>
        <p style={{ fontSize: 13, color: 'var(--ink-light)', marginTop: 4, marginBottom: 0 }}>
          Every transactional email: member receipts, settlements, cancellations, Concierge alerts. The structured twin of the ops@ BCC paper trail.
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', marginBottom: 14, flexWrap: 'wrap' }}>
        <div className="field" style={{ margin: 0 }}>
          <label className="field-lab">From</label>
          <input className="input" type="date" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label className="field-lab">To</label>
          <input className="input" type="date" value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <div className="field" style={{ margin: 0, flex: 1, minWidth: 200 }}>
          <label className="field-lab">Search</label>
          <input className="input" type="text" placeholder="subject, member, email, refs…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {(from || to || search) && (
          <button className="btn-ghost" style={{ height: 38 }} onClick={() => { setFrom(''); setTo(''); setSearch('') }}>Clear</button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
        {KIND_FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setKind(f.key)}
            style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 12.5,
              fontFamily: 'var(--ui)', fontWeight: kind === f.key ? 600 : 400,
              border: `1px solid ${kind === f.key ? 'var(--tropic)' : 'var(--hair-2)'}`,
              background: kind === f.key ? 'var(--tropic-glow)' : 'transparent',
              color: kind === f.key ? 'var(--tropic-d)' : 'var(--ink-light)',
              cursor: 'pointer',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-light)', marginBottom: 12, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {loading ? 'Loading…' : `${filtered.length} row${filtered.length === 1 ? '' : 's'} · ${sentCount} sent${failedCount > 0 ? ` · ${failedCount} failed` : ''}`}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--ink-light)', fontSize: 14 }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 12, padding: 32, textAlign: 'center', color: 'var(--ink-light)', fontSize: 13 }}>
          No emails match these filters.
        </div>
      ) : (
        <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 12, overflow: 'hidden' }}>
          {filtered.map((r, i) => {
            const pill = KIND_PILL[r.kind] ?? 'ink'
            const memberLabel = r.member_id ? (names[r.member_id] ?? r.member_id) : null
            const isOpen = expanded === r.id
            return (
              <div key={r.id}>
                <div
                  onClick={() => setExpanded(isOpen ? null : r.id)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 14, padding: '13px 18px',
                    borderTop: i === 0 ? 'none' : '1px solid var(--hair)',
                    cursor: 'pointer',
                    background: isOpen ? 'var(--paper)' : 'transparent',
                  }}
                >
                  <div style={{ minWidth: 150, flexShrink: 0, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-light)', paddingTop: 2 }}>
                    {fmtStamp(r.sent_at)}
                  </div>
                  <div style={{ flexShrink: 0, minWidth: 90 }}>
                    <span className={`pill ${pill}`} style={{ fontSize: 9.5 }}>{r.kind.replace(/_/g, ' ')}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.subject}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-faint)', fontFamily: 'var(--mono)', marginTop: 2 }}>
                      {r.to_email}{memberLabel ? `  ·  ${memberLabel}` : ''}{r.bcc_ops ? '  ·  bcc ops' : ''}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    {r.send_status === 'failed'
                      ? <span className="pill signal" style={{ fontSize: 9.5 }}>failed</span>
                      : <span className="pill moss" style={{ fontSize: 9.5 }}>sent</span>}
                  </div>
                </div>
                {isOpen && (
                  <div style={{ padding: '4px 18px 16px 182px', background: 'var(--paper)', borderTop: '1px dashed var(--hair)' }}>
                    {r.send_error && (
                      <div style={{ background: 'rgba(217,78,42,0.08)', border: '1px solid rgba(217,78,42,0.25)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--signal)', fontFamily: 'var(--mono)', marginBottom: 10 }}>
                        {r.send_error}
                      </div>
                    )}
                    {r.resend_id && (
                      <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-light)', marginBottom: 6 }}>
                        Resend id: <span style={{ color: 'var(--ink)' }}>{r.resend_id}</span>
                      </div>
                    )}
                    <details>
                      <summary style={{ cursor: 'pointer', fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-light)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>refs</summary>
                      <pre style={{ fontSize: 11, fontFamily: 'var(--mono)', background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 8, padding: 10, marginTop: 6, color: 'var(--ink)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowX: 'auto' }}>
{JSON.stringify(r.refs ?? {}, null, 2)}
                      </pre>
                    </details>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
