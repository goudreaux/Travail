'use client'
import { useState, useEffect } from 'react'
import { fmtDate, airportCity } from '@/lib/data'
import { KIND_ICONS } from '@/lib/icons'
import { RosterStack, type RosterEntry } from '@/components/Roster'

// Shared Trip Proposal card. Uses the same `trip-card` layout +
// classes as FlightCard / ExcursionCard so the board reads as one
// visual family — date / icon block / content / image / CTA row.
// Differentiation is layered ON the same skeleton: a PROPOSAL eyebrow,
// dashed amber border, progress bar replacing the seat meter, and a
// live ticking countdown. Roster + friend highlighting come from the
// shared RosterStack component, so committers + your friends light
// up identically to the open-trip cards.

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
  // Network seats are what count toward the minimum. The proposer's
  // own firm seats are guaranteed and shown separately so the bar
  // doesn't pretend the trip is half-funded by the proposer's own
  // butt-in-a-seat. Spread guarantee covers the gap at the deadline,
  // not before.
  committed_seats: number          // total (network + proposer firm) — legacy / display
  network_seats: number            // commits from members OTHER than the proposer
  proposer_firm_seats: number      // proposer's current commit (their own firm party)
  is_my_commit: boolean
  am_proposer: boolean
  // Each committer becomes a RosterEntry — same shape as flight/excursion
  // rosters so RosterStack handles avatars + friend highlighting uniformly.
  roster: RosterEntry[]
  image_url: string | null
}

// Live countdown to expiry — escalates visually as the 5-day Tropic
// window closes. Calm → warning → urgent → critical tiers.
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
      fontSize: tier === 'critical' ? 12 : 10.5,
      color,
      fontWeight: tier === 'critical' || tier === 'urgent' ? 700 : 600,
      letterSpacing: '0.04em',
      animation: tier === 'critical' || tier === 'urgent' ? 'pulse-urgency 1.4s ease-in-out infinite' : undefined,
    }}>
      {tier === 'expired' ? 'EXPIRED' : `${txt} left`}
      <style>{`
        @keyframes pulse-urgency {
          0%,100% { opacity: 1; }
          50%     { opacity: 0.55; }
        }
      `}</style>
    </span>
  )
}

// Punchy "Xd left" / "Xh LEFT!" urgency tag for proposal cards.
// Mirrors the open-seats UrgencyTag visual language but reads off the
// proposal's commit deadline (expires_at) rather than departure time.
// Only renders when there's still a deadline to chase (open proposal,
// minimum not yet hit). Tiers escalate the closer it gets.
export function ProposalDeadlineTag({ expiresAt }: { expiresAt: string }) {
  const target = new Date(expiresAt).getTime()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])
  const ms = Math.max(0, target - now)
  if (ms === 0) return null
  const hours = ms / 3_600_000
  const days = Math.floor(hours / 24)

  const label =
    hours <= 6  ? `${Math.max(1, Math.round(hours))}H LEFT!`
    : hours <= 24 ? 'LAST DAY!'
    : hours <= 48 ? '1 DAY LEFT'
    : `${days}D LEFT`

  const critical = hours <= 24

  // Subtle red-toned chip — soft tinted fill + red ink rather than a
  // loud solid pill. Escalates only slightly when it's down to the last
  // day (deeper red, faint fade) so it draws the eye without shouting.
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontFamily: 'var(--mono)',
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
      color: critical ? '#c0341a' : '#c4452b',
      background: critical ? 'rgba(217,78,42,0.12)' : 'rgba(217,78,42,0.07)',
      border: `1px solid ${critical ? 'rgba(217,78,42,0.32)' : 'rgba(217,78,42,0.18)'}`,
      padding: '2.5px 7px',
      borderRadius: 5,
      animation: critical ? 'deadline-fade 1.8s ease-in-out infinite' : undefined,
      whiteSpace: 'nowrap',
    }}>
      ⏳ {label}
      <style>{`
        @keyframes deadline-fade {
          0%,100% { opacity: 1; }
          50%     { opacity: 0.6; }
        }
      `}</style>
    </span>
  )
}

// Replaces SeatMeter for proposals — same height + structure, but the
// fill represents NETWORK commits toward min_seats with a tick mark at
// the min threshold so the network sees how far they have to go. The
// proposer's firm seats sit OUTSIDE this bar (rendered next to it) so
// the math never reads "5 of 4 committed."
function ProposalProgressBar({ network, proposerFirm, min, cap, proposerName, accent }: {
  network: number
  proposerFirm: number
  min: number
  cap: number
  proposerName: string | null
  accent: string
}) {
  // Network slots = capacity minus the proposer's firm party. The bar
  // visualizes filling THAT pool, not total seats — that's the math
  // that gates go-live.
  const networkSlots = Math.max(min, cap - proposerFirm)
  const pctOfSlots = networkSlots ? Math.min(100, Math.round((network / networkSlots) * 100)) : 0
  const minTickPct = min > 0 && networkSlots > 0 && min < networkSlots ? Math.round((min / networkSlots) * 100) : null
  const hitMin = min > 0 && network >= min

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-light)', letterSpacing: '0.06em' }}>
          <strong style={{ color: 'var(--ink)' }}>{network}</strong>
          <span style={{ margin: '0 4px', color: 'var(--ink-faint)' }}>of</span>
          <strong style={{ color: 'var(--ink)' }}>{min}</strong>
          <span style={{ margin: '0 4px', color: 'var(--ink-faint)' }}>network commits</span>
        </span>
        {proposerFirm > 0 && (
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--sun-d)', fontWeight: 700, letterSpacing: '0.06em' }}>
            +{proposerFirm} firm from {proposerName?.split(' ')[0] ?? 'proposer'}
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
          width: `${pctOfSlots}%`,
          background: hitMin
            ? 'linear-gradient(90deg, #3e8c6d 0%, #4ba883 100%)'
            : `linear-gradient(90deg, ${accent} 0%, ${accent} 100%)`,
          transition: 'width 0.3s ease',
        }} />
        {minTickPct != null && (
          <div style={{
            position: 'absolute',
            left: `${minTickPct}%`,
            top: -3, bottom: -3,
            borderLeft: '1px dashed var(--ink-light)',
          }} />
        )}
      </div>
    </div>
  )
}

export function ProposalCard({ p, onOpen }: { p: ProposalCardData; onOpen: () => void }) {
  const min = p.min_seats ?? 0
  const cap = p.capacity_total ?? min
  const network = p.network_seats
  const proposerFirm = p.proposer_firm_seats
  const networkNeeded = Math.max(0, min - network)
  const dp = fmtDate(p.date)
  const destName = (p.payload?.destName as string) || (p.payload?.destCode as string) || null
  const accent = '#e09418'   // sun-d
  const accentBg = 'rgba(244,167,44,0.12)'
  const accentBorder = 'rgba(244,167,44,0.55)'
  const hitMin = min > 0 && network >= min
  const kindIcon = p.kind === 'flight' ? KIND_ICONS.flight : KIND_ICONS.fish

  return (
    <div
      className="trip-card"
      onClick={onOpen}
      style={{
        marginBottom: 12,
        border: `2px dashed ${accentBorder}`,
        boxShadow: 'none',
        position: 'relative',
      }}
    >
      {/* PROPOSAL ribbon stamped on the top-right corner so the card
          telegraphs its different status before the eye even reads the
          title. */}
      <span style={{
        position: 'absolute', top: 10, right: 10, zIndex: 2,
        fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.22em',
        textTransform: 'uppercase', color: '#1a0e02', fontWeight: 700,
        background: 'linear-gradient(135deg, #f4a72c 0%, #e09418 100%)',
        padding: '3px 8px', borderRadius: 4,
        boxShadow: '0 2px 4px rgba(0,0,0,0.10)',
      }}>
        PROPOSAL
      </span>

      <div className="trip-card__main">
        <div className="trip-card__date">
          <div className="trip-card__date-mo">{dp.mo}</div>
          <div className="trip-card__date-day">{dp.day}</div>
          <div className="trip-card__date-dow">{dp.dow}</div>
        </div>
        <div
          className="trip-card__icon"
          style={{ background: accentBg, borderRight: '1px solid var(--hair)' }}
        >
          <span style={{ color: accent }}>{kindIcon}</span>
        </div>
        <div className="trip-card__content">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div className="trip-card__title" style={{ color: accent }}>
              {p.kind === 'flight' ? 'FLIGHT' : 'EXCURSION'} · PROPOSAL
            </div>
            {!hitMin && p.expires_at && <ProposalDeadlineTag expiresAt={p.expires_at} />}
          </div>
          <div className="trip-card__name">
            {p.kind === 'flight'
              ? <>{airportCity(p.origin_code, {})}{destName && <> <span style={{ color: 'var(--ink-faint)', margin: '0 6px', fontSize: 14 }}>→</span> {destName}</>}</>
              : p.name}
          </div>
          <div className="trip-card__meta">
            {p.kind === 'flight'
              ? <>From {p.origin_code} · proposed by {p.proposer_name ?? 'a member'}</>
              : <>{p.name} · from {p.origin_code} · proposed by {p.proposer_name ?? 'a member'}</>}
          </div>
          <ProposalProgressBar network={network} proposerFirm={proposerFirm} min={min} cap={cap} proposerName={p.proposer_name} accent={accent} />
          <div onClick={e => e.stopPropagation()}>
            <RosterStack entries={p.roster ?? []} occupied={network + proposerFirm} />
          </div>
        </div>
        <img className="trip-card__img" src={p.image_url || '/trip-default.jpeg'} alt="" />
      </div>
      <div className="trip-card__cta">
        <span style={{ color: 'var(--ink-light)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          {hitMin ? (
            <span style={{ color: 'var(--moss)', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '0.06em' }}>
              ✓ MIN REACHED · AWAITING OPS LOCK
            </span>
          ) : (
            <>
              <strong style={{ color: 'var(--ink)' }}>{networkNeeded}</strong>
              <span>seat{networkNeeded === 1 ? '' : 's'} to go</span>
              {p.expires_at && (
                <>
                  <span style={{ color: 'var(--ink-faint)' }}>·</span>
                  <ProposalCountdown expiresAt={p.expires_at} />
                </>
              )}
            </>
          )}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {p.is_my_commit && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--tropic-d)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              ✓ Committed
            </span>
          )}
          {p.am_proposer && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: accent, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              ★ Your proposal
            </span>
          )}
          {p.price_per_seat_cents != null && (
            <span className="trip-card__price">
              ${(p.price_per_seat_cents / 100).toFixed(0)}
              <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--ink-light)' }}>/seat</span>
            </span>
          )}
          <button
            className="cta-outline"
            style={{ color: accent, borderColor: accent }}
            onClick={e => { e.stopPropagation(); onOpen() }}
          >
            {p.is_my_commit || p.am_proposer ? 'View →' : 'Commit a seat →'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Status the proposer sees while their proposal moves through the
// pipeline. Each maps to a pill + a plain-language line so the proposer
// always knows where things stand and what happens next.
const MY_PROPOSAL_STATUS: Record<string, { label: string; color: string; bg: string; note: string }> = {
  pending_ops_review: {
    label: 'PENDING REVIEW', color: '#8a5a06', bg: 'rgba(244,167,44,0.14)',
    note: "We're pricing this with the operator and setting the seat minimum. You'll get a notification the moment it goes live for the network.",
  },
  open: {
    label: 'LIVE', color: 'var(--tropic-d)', bg: 'rgba(0,179,199,0.12)',
    note: 'Live on the board now. The network is committing seats. If it hits the minimum before the window closes, it locks in and everyone is charged.',
  },
  funded: {
    label: 'FUNDED', color: '#2f6f56', bg: 'rgba(62,140,109,0.14)',
    note: 'It made the minimum and locked in. Everyone committed has been charged. Find it in My Trips.',
  },
  expired: {
    label: 'EXPIRED', color: 'var(--ink-light)', bg: 'var(--paper)',
    note: "It didn't reach the seat minimum in time, so it expired. No one was charged. Feel free to propose it again with more lead time.",
  },
  declined: {
    label: 'DECLINED', color: '#a23a23', bg: 'rgba(217,78,42,0.10)',
    note: 'Ops could not move this one forward.',
  },
  withdrawn: {
    label: 'WITHDRAWN', color: 'var(--ink-light)', bg: 'var(--paper)',
    note: 'You withdrew this proposal. No one was charged.',
  },
}

export interface MyProposalData {
  id: string
  kind: 'flight' | 'excursion'
  name: string
  date: string
  origin_code: string
  payload: Record<string, unknown>
  status: string
  min_seats: number | null
  capacity_total: number | null
  committed_seats: number          // total — legacy / display only
  network_seats: number            // counts toward min
  proposer_firm_seats: number      // proposer's own firm party (shown separately)
  expires_at: string | null
  decline_reason: string | null
}

// Compact status row for the proposer's own proposals, across every
// status. This is the "track your proposal through the process" view,
// distinct from the rich browse cards on the live board below.
export function MyProposalRow({ p, onOpen }: { p: MyProposalData; onOpen: () => void }) {
  const dp = fmtDate(p.date)
  const s = MY_PROPOSAL_STATUS[p.status] ?? MY_PROPOSAL_STATUS.pending_ops_review
  const min = p.min_seats ?? 0
  const destName = (p.payload?.destName as string) || (p.payload?.destCode as string) || null
  const title = p.kind === 'flight'
    ? `${airportCity(p.origin_code, {})}${destName ? ` → ${destName}` : ''}`
    : p.name
  const note = p.status === 'declined' && p.decline_reason ? p.decline_reason : s.note

  return (
    <div
      onClick={onOpen}
      style={{
        display: 'flex', gap: 12, alignItems: 'flex-start',
        background: 'var(--card)', border: '1px solid var(--hair-2)',
        borderRadius: 12, padding: '13px 15px', cursor: 'pointer',
      }}
    >
      <div style={{
        flexShrink: 0, width: 46, textAlign: 'center',
        fontFamily: 'var(--mono)', lineHeight: 1.15,
      }}>
        <div style={{ fontSize: 10, color: 'var(--ink-faint)', letterSpacing: '0.08em' }}>{dp.mo}</div>
        <div style={{ fontSize: 18, color: 'var(--ink)', fontWeight: 700 }}>{dp.day}</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
          <span style={{
            fontFamily: 'var(--mono)', fontSize: 8.5, fontWeight: 700, letterSpacing: '0.14em',
            color: s.color, background: s.bg, padding: '2px 7px', borderRadius: 4,
          }}>{s.label}</span>
          {p.status === 'open' && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-light)' }}>
              {p.network_seats}/{min} network · {p.proposer_firm_seats} your firm
            </span>
          )}
          {p.status === 'open' && p.expires_at && (
            <ProposalCountdown expiresAt={p.expires_at} />
          )}
        </div>
        <div style={{ fontFamily: 'var(--display)', fontSize: 15.5, color: 'var(--ink)', lineHeight: 1.25, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.45 }}>{note}</div>
      </div>
      <span style={{ flexShrink: 0, color: 'var(--ink-faint)', fontSize: 18, alignSelf: 'center' }}>›</span>
    </div>
  )
}

// "Your proposal commits" strip for the feed + My Trips page. Surfaces
// every proposal where the member has an active (committed/captured)
// commit, in any status — so a member can track a proposal they're
// tied to without hunting for it. Funded proposals turn into a real
// booking elsewhere, so we skip those here to avoid duplication.
export interface MyProposalCommitData {
  proposalId: string
  kind: 'flight' | 'excursion'
  name: string
  date: string
  origin_code: string
  payload: Record<string, unknown>
  status: string
  min_seats: number | null
  network_seats: number
  proposer_firm_seats: number
  my_seats: number
  am_proposer: boolean
  expires_at: string | null
  price_per_seat_cents: number | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadMyProposalCommits(supabase: any, memberId: string | null): Promise<MyProposalCommitData[]> {
  if (!memberId) return []
  // Find every commit row this member owns that's still live.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: myCommits } = await (supabase as any)
    .from('trip_proposal_commits')
    .select('proposal_id, seats, status')
    .eq('member_id', memberId)
    .in('status', ['committed', 'captured'])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const myRows = ((myCommits ?? []) as any[])
  if (myRows.length === 0) return []
  const proposalIds = myRows.map(c => c.proposal_id)
  const mySeatsByProp: Record<string, number> = {}
  for (const c of myRows) mySeatsByProp[c.proposal_id] = (mySeatsByProp[c.proposal_id] ?? 0) + (c.seats ?? 1)

  // Pull the proposals. Skip funded (those have their own booking
  // on the My Trips list) and skip terminal states (expired /
  // declined / withdrawn) since they're not actionable from a
  // tracker.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: props } = await (supabase as any)
    .from('trip_proposals')
    .select('id, proposer_id, kind, name, date, origin_code, payload, status, min_seats, expires_at, price_per_seat_cents')
    .in('id', proposalIds)
    .in('status', ['pending_ops_review', 'open'])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const propList = ((props ?? []) as any[])
  if (propList.length === 0) return []
  const liveIds = propList.map(p => p.id)

  // Tally network vs proposer firm for each live proposal so the
  // tracker row can show "X/Y network · Z firm" matching the board.
  const tally: Record<string, { network: number; proposerFirm: number; proposerId: string }> = {}
  for (const p of propList) tally[p.id] = { network: 0, proposerFirm: 0, proposerId: p.proposer_id }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allCommits } = await (supabase as any)
    .from('trip_proposal_commits')
    .select('proposal_id, member_id, seats, status')
    .in('proposal_id', liveIds)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const c of ((allCommits ?? []) as any[])) {
    if (c.status !== 'committed' && c.status !== 'captured') continue
    const t = tally[c.proposal_id]
    if (!t) continue
    if (c.member_id === t.proposerId) t.proposerFirm += c.seats ?? 1
    else t.network += c.seats ?? 1
  }

  return propList.map(p => ({
    proposalId: p.id,
    kind: p.kind,
    name: p.name,
    date: p.date,
    origin_code: p.origin_code,
    payload: (p.payload ?? {}) as Record<string, unknown>,
    status: p.status,
    min_seats: p.min_seats,
    network_seats: tally[p.id]?.network ?? 0,
    proposer_firm_seats: tally[p.id]?.proposerFirm ?? 0,
    my_seats: mySeatsByProp[p.id] ?? 0,
    am_proposer: p.proposer_id === memberId,
    expires_at: p.expires_at,
    price_per_seat_cents: p.price_per_seat_cents,
  }))
}

// Compact "your proposal commit" row, shown on the feed + My Trips
// page. Inlines the same network-vs-min math the board uses so the
// member sees the same picture from every entry point.
export function MyProposalCommitRow({ c, onOpen }: { c: MyProposalCommitData; onOpen: () => void }) {
  const dp = fmtDate(c.date)
  const min = c.min_seats ?? 0
  const hitMin = min > 0 && c.network_seats >= min
  const needed = Math.max(0, min - c.network_seats)
  const destName = (c.payload?.destName as string) || (c.payload?.destCode as string) || null
  const title = c.kind === 'flight'
    ? `${c.origin_code}${destName ? ` → ${destName}` : ''}`
    : c.name

  const statusLabel = c.status === 'pending_ops_review'
    ? 'PENDING REVIEW'
    : hitMin ? 'MIN REACHED · AWAITING OPS' : `${needed} TO GO`
  const statusColor = c.status === 'pending_ops_review' ? '#8a5a06'
    : hitMin ? 'var(--moss-d)' : 'var(--sun-d)'
  const statusBg = c.status === 'pending_ops_review' ? 'rgba(244,167,44,0.14)'
    : hitMin ? 'rgba(62,140,109,0.14)' : 'rgba(244,167,44,0.12)'

  return (
    <div
      onClick={onOpen}
      style={{
        display: 'flex', gap: 12, alignItems: 'flex-start',
        background: 'var(--card)', border: '2px dashed rgba(244,167,44,0.45)',
        borderRadius: 12, padding: '13px 15px', cursor: 'pointer',
      }}
    >
      <div style={{ flexShrink: 0, width: 46, textAlign: 'center', fontFamily: 'var(--mono)', lineHeight: 1.15 }}>
        <div style={{ fontSize: 10, color: 'var(--ink-faint)', letterSpacing: '0.08em' }}>{dp.mo}</div>
        <div style={{ fontSize: 18, color: 'var(--ink)', fontWeight: 700 }}>{dp.day}</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
          <span style={{
            fontFamily: 'var(--mono)', fontSize: 8.5, fontWeight: 700, letterSpacing: '0.14em',
            color: '#1a0e02', background: 'linear-gradient(135deg, #f4a72c 0%, #e09418 100%)',
            padding: '2px 6px', borderRadius: 3,
          }}>PROPOSAL</span>
          <span style={{
            fontFamily: 'var(--mono)', fontSize: 8.5, fontWeight: 700, letterSpacing: '0.14em',
            color: statusColor, background: statusBg, padding: '2px 7px', borderRadius: 4,
          }}>{statusLabel}</span>
          {c.am_proposer && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 8.5, color: 'var(--sun-d)', fontWeight: 700, letterSpacing: '0.12em' }}>
              ★ YOURS
            </span>
          )}
          {c.status === 'open' && c.expires_at && !hitMin && (
            <ProposalDeadlineTag expiresAt={c.expires_at} />
          )}
        </div>
        <div style={{ fontFamily: 'var(--display)', fontSize: 15.5, color: 'var(--ink)', lineHeight: 1.25, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.45 }}>
          You're in for <strong style={{ color: 'var(--ink)' }}>{c.my_seats}</strong> seat{c.my_seats === 1 ? '' : 's'}
          {c.status === 'open' && <> · {c.network_seats}/{min} network committed</>}
          {c.price_per_seat_cents != null && <> · ${(c.price_per_seat_cents / 100).toFixed(0)}/seat</>}
        </div>
      </div>
      <span style={{ flexShrink: 0, color: 'var(--ink-faint)', fontSize: 18, alignSelf: 'center' }}>›</span>
    </div>
  )
}

// Loader for the proposer's own proposals across every status. RLS
// already lets a member read their own rows in any state, so this is a
// single proposer-scoped query plus a commit tally for the live ones.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadMyProposals(supabase: any, memberId: string | null): Promise<MyProposalData[]> {
  if (!memberId) return []
  const { data: rows } = await supabase
    .from('trip_proposals')
    .select('id, kind, name, date, origin_code, payload, status, min_seats, capacity_total, expires_at, decline_reason')
    .eq('proposer_id', memberId)
    .order('created_at', { ascending: false })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list = (rows ?? []) as any[]
  if (list.length === 0) return []

  // Tally seats per proposal, split into network vs proposer firm so
  // the proposer's tracker shows the same split everyone else sees.
  const ids = list.map(p => p.id)
  const tallied: Record<string, { network: number; proposerFirm: number }> = {}
  const { data: cms } = await supabase
    .from('trip_proposal_commits').select('proposal_id, member_id, seats, status').in('proposal_id', ids)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const c of ((cms ?? []) as any[])) {
    if (c.status !== 'committed' && c.status !== 'captured') continue
    const t = tallied[c.proposal_id] ?? { network: 0, proposerFirm: 0 }
    // For the proposer's own tracker, the proposer is `memberId`.
    if (c.member_id === memberId) t.proposerFirm += c.seats ?? 1
    else t.network += c.seats ?? 1
    tallied[c.proposal_id] = t
  }

  return list.map(p => {
    const t = tallied[p.id] ?? { network: 0, proposerFirm: 0 }
    return {
      id: p.id,
      kind: p.kind,
      name: p.name,
      date: p.date,
      origin_code: p.origin_code,
      payload: (p.payload ?? {}) as Record<string, unknown>,
      status: p.status,
      min_seats: p.min_seats,
      capacity_total: p.capacity_total,
      committed_seats: t.network + t.proposerFirm,
      network_seats: t.network,
      proposer_firm_seats: t.proposerFirm,
      expires_at: p.expires_at,
      decline_reason: p.decline_reason ?? null,
    }
  })
}

// Shared loader: fetches all status='open' proposals + commit counts
// + proposer names + the committer roster (so friend highlighting
// works the same as flight/excursion cards). Single query family for
// every surface that lists proposals (/seats, /proposals, the feed).
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
  // Split commits into NETWORK (anyone but the proposer) and PROPOSER FIRM
  // (the proposer's own commit). The bar + min logic count network only;
  // the proposer's firm party is shown separately so we never say "5 of 4".
  const proposerByProposal: Record<string, string> = {}
  for (const p of propList) proposerByProposal[p.id] = p.proposer_id
  const commitsByProposal: Record<string, {
    network: number; proposerFirm: number; mine: boolean;
    rows: { member_id: string; seats: number }[]
  }> = {}
  const memberMeta: Record<string, { name: string; initials: string; avatar_url: string | null }> = {}

  const { data: cms } = await supabase
    .from('trip_proposal_commits').select('proposal_id, member_id, seats, status').in('proposal_id', proposalIds)
  const allCommitterIds = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const c of ((cms ?? []) as any[])) {
    if (c.status !== 'committed' && c.status !== 'captured') continue
    const cur = commitsByProposal[c.proposal_id] ?? { network: 0, proposerFirm: 0, mine: false, rows: [] }
    const isProposer = c.member_id === proposerByProposal[c.proposal_id]
    if (isProposer) cur.proposerFirm += c.seats ?? 1
    else cur.network += c.seats ?? 1
    if (memberId && c.member_id === memberId) cur.mine = true
    cur.rows.push({ member_id: c.member_id, seats: c.seats ?? 1 })
    commitsByProposal[c.proposal_id] = cur
    allCommitterIds.add(c.member_id)
  }
  const proposerIds = propList.map(p => p.proposer_id)
  for (const id of proposerIds) allCommitterIds.add(id)

  // Single members lookup for proposers + every committer so RosterStack
  // can render the same avatar treatment used on FlightCard/ExcursionCard.
  if (allCommitterIds.size) {
    const { data: ms } = await supabase
      .from('members').select('id, name, initials, avatar_url')
      .in('id', [...allCommitterIds])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const m of ((ms ?? []) as any[])) {
      memberMeta[m.id] = {
        name: m.name ?? '',
        initials: m.initials ?? (m.name ?? '?').split(/\s+/).map((w: string) => w[0] ?? '').join('').slice(0, 2).toUpperCase(),
        avatar_url: m.avatar_url ?? null,
      }
    }
  }

  return propList.map(p => {
    const c = commitsByProposal[p.id] ?? { network: 0, proposerFirm: 0, mine: false, rows: [] }
    const roster: RosterEntry[] = c.rows.map(r => ({
      item_id: p.id,
      member_id: r.member_id,
      name: memberMeta[r.member_id]?.name ?? 'Member',
      initials: memberMeta[r.member_id]?.initials ?? '?',
      avatar_url: memberMeta[r.member_id]?.avatar_url ?? null,
      seats: r.seats,
    }))
    return {
      id: p.id,
      kind: p.kind,
      proposer_id: p.proposer_id,
      proposer_name: memberMeta[p.proposer_id]?.name ?? null,
      name: p.name,
      date: p.date,
      origin_code: p.origin_code,
      payload: (p.payload ?? {}) as Record<string, unknown>,
      capacity_total: p.capacity_total,
      min_seats: p.min_seats,
      price_per_seat_cents: p.price_per_seat_cents,
      expires_at: p.expires_at,
      committed_seats: c.network + c.proposerFirm,
      network_seats: c.network,
      proposer_firm_seats: c.proposerFirm,
      is_my_commit: c.mine,
      am_proposer: !!memberId && p.proposer_id === memberId,
      roster,
      image_url: (p.payload?.imageUrl as string) || null,
    }
  })
}
