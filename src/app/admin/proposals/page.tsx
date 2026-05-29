'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PROPOSAL_STATUS_LABEL, PROPOSAL_STATUS_PILL, type ProposalStatus } from '@/lib/proposals'

// Ops review queue for Trip Proposals.
//
// Three working modes:
//   pending_ops_review — set capacity / min_seats / price, approve or decline
//   open               — monitor commit progress, lock when min reached
//   terminal           — funded / expired / declined / withdrawn (read-only)

interface ProposalRow {
  id: string
  proposer_id: string
  proposer_name: string | null
  kind: 'flight' | 'excursion'
  name: string
  date: string
  origin_code: string
  payload: Record<string, unknown>
  capacity_total: number | null
  min_seats: number | null
  price_per_seat_cents: number | null
  proposer_min_seats: number | null
  proposer_max_seats: number | null
  status: ProposalStatus
  expires_at: string | null
  reviewed_at: string | null
  funded_at: string | null
  expired_at: string | null
  flight_id: string | null
  excursion_id: string | null
  decline_reason: string | null
  created_at: string
  // Derived
  committed_seats: number
  network_seats: number
  proposer_seats_now: number
}

function fmtDate(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function AdminProposalsPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<ProposalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'pending' | 'open' | 'terminal'>('pending')
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  function flash(msg: string, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  const load = useCallback(async () => {
    setLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { data: ps } = await db
      .from('trip_proposals')
      .select('*')
      .order('created_at', { ascending: false })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proposals = ((ps ?? []) as any[])
    const { data: cs } = proposals.length
      ? await db.from('trip_proposal_commits').select('proposal_id, member_id, seats, status').in('proposal_id', proposals.map(p => p.id))
      : { data: [] }
    const commits: Record<string, { committed: number; network: number; proposer: number }> = {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const c of ((cs ?? []) as any[])) {
      if (c.status !== 'committed' && c.status !== 'captured') continue
      const proposal = proposals.find((p: { id: string }) => p.id === c.proposal_id)
      if (!proposal) continue
      const cur = commits[c.proposal_id] ?? { committed: 0, network: 0, proposer: 0 }
      cur.committed += c.seats ?? 1
      if (c.member_id === proposal.proposer_id) cur.proposer += c.seats ?? 1
      else cur.network += c.seats ?? 1
      commits[c.proposal_id] = cur
    }
    const proposerIds = [...new Set(proposals.map(p => p.proposer_id).filter(Boolean))]
    let nameById: Record<string, string> = {}
    if (proposerIds.length) {
      const { data: ms } = await db.from('members').select('id, name').in('id', proposerIds)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const m of ((ms ?? []) as any[])) nameById[m.id] = m.name ?? ''
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list: ProposalRow[] = proposals.map((p: any) => {
      const c = commits[p.id] ?? { committed: 0, network: 0, proposer: 0 }
      const min = p.min_seats ?? 0
      const pMin = p.proposer_min_seats ?? 1
      const pMax = p.proposer_max_seats ?? pMin
      const proposerSeatsNow = Math.max(pMin, Math.min(pMax, Math.max(0, min - c.network)))
      return {
        id: p.id,
        proposer_id: p.proposer_id,
        proposer_name: nameById[p.proposer_id] ?? null,
        kind: p.kind,
        name: p.name,
        date: p.date,
        origin_code: p.origin_code,
        payload: (p.payload ?? {}) as Record<string, unknown>,
        capacity_total: p.capacity_total,
        min_seats: p.min_seats,
        price_per_seat_cents: p.price_per_seat_cents,
        proposer_min_seats: p.proposer_min_seats,
        proposer_max_seats: p.proposer_max_seats,
        status: p.status,
        expires_at: p.expires_at,
        reviewed_at: p.reviewed_at,
        funded_at: p.funded_at,
        expired_at: p.expired_at,
        flight_id: p.flight_id,
        excursion_id: p.excursion_id,
        decline_reason: p.decline_reason,
        created_at: p.created_at,
        committed_seats: c.committed,
        network_seats: c.network,
        proposer_seats_now: proposerSeatsNow,
      }
    })
    setRows(list)
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  const pendingRows  = rows.filter(r => r.status === 'pending_ops_review')
  const openRows     = rows.filter(r => r.status === 'open')
  const terminalRows = rows.filter(r => r.status === 'funded' || r.status === 'expired' || r.status === 'declined' || r.status === 'withdrawn')

  const visible =
    tab === 'pending'  ? pendingRows
    : tab === 'open'   ? openRows
    : terminalRows

  return (
    <div className="admin-page">
      {toast && (
        <div style={{ position: 'fixed', top: 16, right: 16, background: toast.ok ? 'var(--moss)' : 'var(--signal)', color: '#fff', padding: '10px 16px', borderRadius: 10, zIndex: 100, fontSize: 13, fontWeight: 600 }}>
          {toast.msg}
        </div>
      )}

      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontFamily: 'var(--display)', fontSize: 30, fontWeight: 500, color: 'var(--ink)', margin: 0 }}>Trip Proposals</h1>
        <p style={{ fontSize: 13, color: 'var(--ink-light)', marginTop: 4, marginBottom: 0 }}>
          Member-pitched trips. Set capacity / min / price during review. Lock when commits hit minimum at least 5 days before departure.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
        {([
          { key: 'pending',  label: 'Pending review', count: pendingRows.length, urgent: pendingRows.length > 0 },
          { key: 'open',     label: 'Live',           count: openRows.length },
          { key: 'terminal', label: 'Settled',        count: terminalRows.length },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 12.5,
              fontFamily: 'var(--ui)', fontWeight: tab === t.key ? 600 : 400,
              border: `1px solid ${tab === t.key ? 'var(--tropic)' : 'var(--hair-2)'}`,
              background: tab === t.key ? 'var(--tropic-glow)' : 'transparent',
              color: tab === t.key ? 'var(--tropic-d)' : (('urgent' in t && t.urgent) ? 'var(--signal)' : 'var(--ink-light)'),
              cursor: 'pointer',
            }}
          >
            {t.label} · {t.count}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--ink-light)' }}>Loading…</div>
      ) : visible.length === 0 ? (
        <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 12, padding: 32, textAlign: 'center', color: 'var(--ink-light)', fontSize: 13 }}>
          Nothing in this view.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {visible.map(r => (
            <ProposalRowCard
              key={r.id}
              row={r}
              busy={busy === r.id}
              onApprove={async (capacity, min, price) => {
                setBusy(r.id)
                try {
                  const res = await fetch('/api/admin/proposals/review', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ proposalId: r.id, decision: 'approve', capacityTotal: capacity, minSeats: min, pricePerSeatCents: price }),
                  })
                  const d = await res.json()
                  if (!res.ok) throw new Error(d.error ?? 'Approve failed')
                  flash('Approved, now live for commits.')
                  load()
                } catch (e) { flash(e instanceof Error ? e.message : 'Failed', false) }
                finally { setBusy(null) }
              }}
              onDecline={async (reason) => {
                setBusy(r.id)
                try {
                  const res = await fetch('/api/admin/proposals/review', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ proposalId: r.id, decision: 'decline', declineReason: reason }),
                  })
                  const d = await res.json()
                  if (!res.ok) throw new Error(d.error ?? 'Decline failed')
                  flash('Declined.')
                  load()
                } catch (e) { flash(e instanceof Error ? e.message : 'Failed', false) }
                finally { setBusy(null) }
              }}
              onLock={async () => {
                if (!confirm(`Lock "${r.name}"? This captures every commit's PaymentIntent off-session and creates the real ${r.kind} row.`)) return
                setBusy(r.id)
                try {
                  const res = await fetch('/api/admin/proposals/lock', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ proposalId: r.id }),
                  })
                  const d = await res.json()
                  if (!res.ok) throw new Error(d.error ?? 'Lock failed')
                  flash(`Locked: ${d.captured} captured, ${d.failed} failed.`)
                  load()
                } catch (e) { flash(e instanceof Error ? e.message : 'Failed', false) }
                finally { setBusy(null) }
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ProposalRowCard({
  row, busy, onApprove, onDecline, onLock,
}: {
  row: ProposalRow
  busy: boolean
  onApprove: (capacity: number, min: number, price: number) => Promise<void>
  onDecline: (reason: string) => Promise<void>
  onLock: () => Promise<void>
}) {
  const suggested = (row.payload ?? {}) as Record<string, unknown>
  const [capacity, setCapacity] = useState<number>(Number(suggested.suggested_capacity ?? 8) || 8)
  const [minSeats, setMinSeats] = useState<number>(Number(suggested.suggested_min_seats ?? 4) || 4)
  const [priceCents, setPriceCents] = useState<number>(50000)
  const [showDecline, setShowDecline] = useState(false)
  const [declineReason, setDeclineReason] = useState('')

  const pill = PROPOSAL_STATUS_PILL[row.status]
  const label = PROPOSAL_STATUS_LABEL[row.status]
  const destName = (row.payload?.destName as string) || (row.payload?.destCode as string) || null
  const dateLabel = new Date(row.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 12, padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span className={`pill ${pill}`} style={{ fontSize: 9.5 }}>{label}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-light)', fontWeight: 600 }}>
              {row.kind} · {row.id}
            </span>
          </div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 19, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.012em' }}>
            {row.name}
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-light)', marginTop: 4 }}>
            {dateLabel} · {row.origin_code}
            {destName && ` → ${destName}`}
            {' · '}proposed by {row.proposer_name ?? row.proposer_id}
          </div>
        </div>
        {row.kind === 'flight' && row.flight_id && (
          <a href={`/trip/${row.flight_id}`} style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tropic-d)', textDecoration: 'none', fontWeight: 600 }}>
            View trip →
          </a>
        )}
        {row.kind === 'excursion' && row.excursion_id && (
          <a href={`/trip/${row.excursion_id}`} style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tropic-d)', textDecoration: 'none', fontWeight: 600 }}>
            View trip →
          </a>
        )}
      </div>

      {/* Proposer spread context — always visible so ops sees what
          the proposer's on the hook for at the current commit count. */}
      <div style={{ background: 'var(--paper)', border: '1px solid var(--hair-2)', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.5, marginBottom: 12 }}>
        <strong style={{ color: 'var(--ink)' }}>Proposer spread:</strong> firm {row.proposer_min_seats ?? 1} seat{(row.proposer_min_seats ?? 1) === 1 ? '' : 's'}, up to {row.proposer_max_seats ?? row.proposer_min_seats ?? 1} guaranteed.
        {' '}Network has committed {row.network_seats}. Proposer's current charge would be <strong style={{ color: 'var(--ink)' }}>{row.proposer_seats_now} seat{row.proposer_seats_now === 1 ? '' : 's'}</strong>.
      </div>

      {row.status === 'pending_ops_review' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 10 }}>
            <div className="field" style={{ margin: 0 }}>
              <label className="field-lab">Capacity</label>
              <input className="input" type="number" min={1} max={20} value={capacity} onChange={e => setCapacity(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label className="field-lab">Minimum seats</label>
              <input className="input" type="number" min={1} max={capacity} value={minSeats} onChange={e => setMinSeats(Math.max(1, Math.min(capacity, Number(e.target.value) || 1)))} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label className="field-lab">Per-seat price ($)</label>
              <input className="input" type="number" min={0} step={1} value={Math.round(priceCents / 100)} onChange={e => setPriceCents(Math.max(0, Math.round((Number(e.target.value) || 0) * 100)))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" disabled={busy} onClick={() => onApprove(capacity, minSeats, priceCents)}>
              {busy ? 'Working…' : 'Approve · go live'}
            </button>
            {!showDecline ? (
              <button className="btn-ghost" onClick={() => setShowDecline(true)} style={{ color: 'var(--signal)' }}>Decline</button>
            ) : (
              <div style={{ display: 'flex', gap: 6, flex: 1 }}>
                <input className="input" placeholder="Decline reason…" value={declineReason} onChange={e => setDeclineReason(e.target.value)} />
                <button className="btn-primary" disabled={busy} style={{ background: 'var(--signal)' }} onClick={() => onDecline(declineReason)}>Confirm decline</button>
                <button className="btn-ghost" onClick={() => setShowDecline(false)}>Cancel</button>
              </div>
            )}
          </div>
        </>
      )}

      {row.status === 'open' && (
        <>
          <div style={{ marginBottom: 10, fontSize: 13, color: 'var(--ink-soft)' }}>
            <strong style={{ color: 'var(--ink)' }}>{row.committed_seats}</strong>/{row.min_seats ?? '?'} committed
            {' · expires '}{row.expires_at ? new Date(row.expires_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
            {row.price_per_seat_cents != null && ` · $${(row.price_per_seat_cents / 100).toFixed(0)}/seat`}
          </div>
          <button
            className="btn-primary"
            disabled={busy || (row.min_seats == null || row.committed_seats < row.min_seats)}
            onClick={onLock}
            title={row.min_seats != null && row.committed_seats >= row.min_seats ? '' : 'Waiting on commits to hit minimum'}
          >
            {busy ? 'Locking…' : row.committed_seats >= (row.min_seats ?? Infinity) ? 'Lock & capture all commits' : 'Waiting on commits'}
          </button>
        </>
      )}

      {row.status === 'declined' && row.decline_reason && (
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontStyle: 'italic' }}>Reason: {row.decline_reason}</div>
      )}
      {(row.status === 'funded' || row.status === 'expired' || row.status === 'withdrawn') && (
        <div style={{ fontSize: 12, color: 'var(--ink-light)', fontFamily: 'var(--mono)' }}>
          {row.status === 'funded' && row.funded_at && `Funded ${fmtDate(row.funded_at)}`}
          {row.status === 'expired' && row.expired_at && `Expired ${fmtDate(row.expired_at)}`}
          {row.status === 'withdrawn' && 'Withdrawn by proposer'}
        </div>
      )}
    </div>
  )
}
