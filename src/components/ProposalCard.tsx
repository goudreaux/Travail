'use client'
import { useEffect, useState } from 'react'

// Shared Trip Proposal card + live countdown. Rendered on /seats,
// /proposals, and the main feed so the urgency model stays consistent
// across every surface that surfaces a proposal.

export interface ProposalCardData {
  id: string
  kind: 'flight' | 'excursion'
  proposer_id: string
  proposer_name: string | null
  name: string
  date: string
  origin_code: string
  payload: Record<string, unknown>
  capacity_total: number | null
  min_seats: number | null
  price_per_seat_cents: number | null
  expires_at: string | null
  committed_seats: number
  is_my_commit: boolean
  am_proposer: boolean
}

// Live countdown to a proposal's expiry. Updates every second.
// Escalates visually as the deadline closes in.
export function ProposalCountdown({ expiresAt }: { expiresAt: string }) {
  const target = new Date(expiresAt).getTime()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const ms = Math.max(0, target - now)
  const totalSec = Math.floor(ms / 1000)
  const d = Math.floor(totalSec / 86400)
  const h = Math.floor((totalSec % 86400) / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60

  const tier =
    ms === 0 ? 'expired'
    : ms < 3600_000 ? 'critical'
    : ms < 24 * 3600_000 ? 'urgent'
    : ms < 48 * 3600_000 ? 'warning'
    : 'calm'

  const color =
    tier === 'expired' ? 'var(--ink-faint)'
    : tier === 'critical' ? '#d94e2a'
    : tier === 'urgent' ? '#d94e2a'
    : tier === 'warning' ? '#c97e0e'
    : 'var(--ink-light)'

  const parts: string[] = []
  if (d > 0) parts.push(`${d}d`)
  if (d > 0 || h > 0) parts.push(`${h}h`)
  parts.push(`${m}m`)
  if (d === 0) parts.push(`${s.toString().padStart(2, '0')}s`)
  const txt = ms === 0 ? 'EXPIRED' : parts.join(' ')

  return (
    <span style={{
      fontFamily: 'var(--mono)',
      fontSize: tier === 'critical' ? 13 : 11,
      color,
      fontWeight: tier === 'critical' || tier === 'urgent' ? 700 : 600,
      letterSpacing: '0.04em',
      animation: tier === 'critical' || tier === 'urgent' ? 'pulse-urgency 1.4s ease-in-out infinite' : undefined,
    }}>
      {tier === 'expired' ? '· EXPIRED' : `· ${txt} left`}
      <style>{`
        @keyframes pulse-urgency {
          0%,100% { opacity: 1; }
          50%     { opacity: 0.55; }
        }
      `}</style>
    </span>
  )
}

export function ProposalCard({ p, onOpen }: { p: ProposalCardData; onOpen: () => void }) {
  const min = p.min_seats ?? 0
  const cap = p.capacity_total ?? min
  const committed = p.committed_seats
  const pctOfCap = cap ? Math.min(100, Math.round((committed / cap) * 100)) : 0
  const seatsNeeded = Math.max(0, min - committed)
  const tripDate = new Date(p.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const destName = (p.payload?.destName as string) || (p.payload?.destCode as string) || null

  return (
    <div
      onClick={onOpen}
      style={{
        background: 'var(--card)',
        border: '2px dashed rgba(244,167,44,0.45)',
        borderRadius: 14,
        padding: '16px 18px',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(244,167,44,0.85)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 18px rgba(244,167,44,0.18)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(244,167,44,0.45)'; (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.22em',
          textTransform: 'uppercase', color: '#1a0e02', fontWeight: 700,
          background: 'linear-gradient(135deg, #f4a72c 0%, #e09418 100%)',
          padding: '3px 8px', borderRadius: 4, flexShrink: 0,
        }}>
          PROPOSAL · {p.kind === 'flight' ? 'FLIGHT' : 'EXCURSION'}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 17, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.012em', lineHeight: 1.25 }}>
            {p.name}
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-light)', marginTop: 3 }}>
            {tripDate}
            {destName && ` · ${destName}`}
            {p.proposer_name && ` · proposed by ${p.proposer_name.split(' ')[0]}`}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-soft)', letterSpacing: '0.08em' }}>
            <strong style={{ color: 'var(--ink)' }}>{committed}</strong> of {min} committed{cap > min ? ` · ${cap} max` : ''}
          </span>
          {p.price_per_seat_cents != null && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink)', fontWeight: 700 }}>
              ${(p.price_per_seat_cents / 100).toFixed(0)}/seat
            </span>
          )}
        </div>
        <div style={{
          height: 8,
          background: 'var(--paper)',
          border: '1px solid var(--hair)',
          borderRadius: 999,
          overflow: 'hidden',
          position: 'relative',
        }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${pctOfCap}%`,
            background: committed >= min
              ? 'linear-gradient(90deg, #3e8c6d 0%, #4ba883 100%)'
              : 'linear-gradient(90deg, #f4a72c 0%, #e09418 100%)',
            transition: 'width 0.3s ease',
          }} />
          {min > 0 && cap > 0 && min < cap && (
            <div style={{
              position: 'absolute',
              left: `${Math.round((min / cap) * 100)}%`,
              top: -3, bottom: -3,
              borderLeft: '1px dashed var(--ink-light)',
            }} />
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-light)' }}>
          {committed >= min ? (
            <span style={{ color: 'var(--moss)', fontWeight: 700 }}>✓ Minimum reached — awaiting ops lock</span>
          ) : (
            <>
              <strong style={{ color: 'var(--ink)' }}>{seatsNeeded}</strong> seat{seatsNeeded === 1 ? '' : 's'} to go
              {p.expires_at && <> <ProposalCountdown expiresAt={p.expires_at} /></>}
            </>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {p.is_my_commit && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--tropic-d)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              ✓ Committed
            </span>
          )}
          {p.am_proposer && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--sun-d)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              ★ Your proposal
            </span>
          )}
          <button
            className="cta-outline"
            style={{ color: 'var(--sun-d)', borderColor: 'var(--sun-d)' }}
            onClick={e => { e.stopPropagation(); onOpen() }}
          >
            {p.is_my_commit ? 'View →' : 'Commit a seat →'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Shared loader: fetches all status='open' proposals + their commit
// counts + proposer names. Returns the ProposalCardData[] used by
// every surface that lists proposals.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadOpenProposals(supabase: any, memberId: string | null): Promise<ProposalCardData[]> {
  const today = new Date().toISOString().slice(0, 10)
  const { data: propRows } = await supabase
    .from('trip_proposals')
    .select('id, proposer_id, kind, name, date, origin_code, payload, capacity_total, min_seats, price_per_seat_cents, expires_at, status')
    .eq('status', 'open')
    .gte('date', today)
    .order('date')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const propList = (propRows ?? []) as any[]
  if (propList.length === 0) return []

  const proposalIds = propList.map(p => p.id)
  const commitsByProposal: Record<string, { committed: number; mine: boolean }> = {}
  const proposerNames: Record<string, string> = {}

  const { data: cms } = await supabase
    .from('trip_proposal_commits').select('proposal_id, member_id, seats, status').in('proposal_id', proposalIds)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const c of ((cms ?? []) as any[])) {
    if (c.status !== 'committed' && c.status !== 'captured') continue
    const cur = commitsByProposal[c.proposal_id] ?? { committed: 0, mine: false }
    cur.committed += c.seats ?? 1
    if (memberId && c.member_id === memberId) cur.mine = true
    commitsByProposal[c.proposal_id] = cur
  }
  const proposerIds = [...new Set(propList.map(p => p.proposer_id))]
  const { data: ms } = await supabase.from('members').select('id, name').in('id', proposerIds)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const m of ((ms ?? []) as any[])) proposerNames[m.id] = m.name ?? ''

  return propList.map(p => {
    const c = commitsByProposal[p.id] ?? { committed: 0, mine: false }
    return {
      id: p.id,
      kind: p.kind,
      proposer_id: p.proposer_id,
      proposer_name: proposerNames[p.proposer_id] ?? null,
      name: p.name,
      date: p.date,
      origin_code: p.origin_code,
      payload: (p.payload ?? {}) as Record<string, unknown>,
      capacity_total: p.capacity_total,
      min_seats: p.min_seats,
      price_per_seat_cents: p.price_per_seat_cents,
      expires_at: p.expires_at,
      committed_seats: c.committed,
      is_my_commit: c.mine,
      am_proposer: !!memberId && p.proposer_id === memberId,
    }
  })
}
