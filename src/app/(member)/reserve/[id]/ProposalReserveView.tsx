'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { createClient } from '@/lib/supabase/client'
import { getStripe } from '@/lib/stripe-browser'
import PageHero from '@/components/PageHero'
import { ProposalCountdown, ProposalDeadlineTag } from '@/components/ProposalCard'
import { RosterStack, type RosterEntry } from '@/components/Roster'

// Member commits a seat on a Trip Proposal.
//
// Flow:
//   1. Load the proposal + existing commits + member-friend graph for
//      the same friend-highlight treatment used on flight/excursion
//      cards.
//   2. If the member already has a commit row, show a confirmation
//      view with "Withdraw" instead of the card-add form.
//   3. Otherwise POST /api/proposals/commit to mint a SetupIntent,
//      collect a card via Stripe Elements, then POST
//      /api/proposals/commit/finalize to attach the payment method.
//   4. Nothing is charged until ops locks the proposal. Until then
//      the commit can be withdrawn at any time.

interface Proposal {
  id: string
  proposer_id: string
  kind: 'flight' | 'excursion'
  name: string
  date: string
  origin_code: string
  payload: Record<string, unknown>
  capacity_total: number | null
  min_seats: number | null
  proposer_min_seats: number | null
  proposer_max_seats: number | null
  price_per_seat_cents: number | null
  expires_at: string | null
  status: string
}

export function ProposalReserveView({ proposalId }: { proposalId: string }) {
  const router = useRouter()
  const supabase = createClient()

  const [memberId, setMemberId] = useState<string | null>(null)
  const [memberName, setMemberName] = useState<string | null>(null)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [committed, setCommitted] = useState(0)
  const [networkCommitted, setNetworkCommitted] = useState(0)
  const [roster, setRoster] = useState<RosterEntry[]>([])
  const [myCommit, setMyCommit] = useState<{ id: string; seats: number; status: string } | null>(null)
  const [proposerName, setProposerName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [seats, setSeats] = useState(1)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [addSeatsOpen, setAddSeatsOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    let mid: string | null = null
    let mname: string | null = null
    if (user) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: m } = await (supabase as any)
        .from('members').select('id, name').eq('user_id', user.id).maybeSingle()
      mid = m?.id ?? null
      mname = m?.name ?? null
    }
    setMemberId(mid)
    setMemberName(mname)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: p } = await (supabase as any)
      .from('trip_proposals')
      .select('id, proposer_id, kind, name, date, origin_code, payload, capacity_total, min_seats, proposer_min_seats, proposer_max_seats, price_per_seat_cents, expires_at, status')
      .eq('id', proposalId).maybeSingle()
    setProposal((p as Proposal) ?? null)
    if (!p) { setLoading(false); return }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cms } = await (supabase as any)
      .from('trip_proposal_commits')
      .select('id, member_id, seats, status')
      .eq('proposal_id', proposalId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const active = ((cms ?? []) as any[]).filter(c => c.status === 'committed' || c.status === 'captured')
    const totalCommitted = active.reduce((s: number, c: { seats: number }) => s + (c.seats ?? 1), 0)
    setCommitted(totalCommitted)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const network = active.filter((c: any) => c.member_id !== p.proposer_id).reduce((s: number, c: { seats: number }) => s + (c.seats ?? 1), 0)
    setNetworkCommitted(network)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mine = active.find((c: any) => c.member_id === mid)
    setMyCommit(mine ? { id: mine.id, seats: mine.seats, status: mine.status } : null)

    const ids = [...new Set(active.map((c: { member_id: string }) => c.member_id))]
    if ((p as Proposal).proposer_id && !ids.includes((p as Proposal).proposer_id)) ids.push((p as Proposal).proposer_id)
    if (ids.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: ms } = await (supabase as any)
        .from('members').select('id, name, initials, avatar_url')
        .in('id', ids)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const byId: Record<string, any> = {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const m of ((ms ?? []) as any[])) byId[m.id] = m
      setProposerName(byId[(p as Proposal).proposer_id]?.name ?? null)
      setRoster(active.map((c: { member_id: string; seats: number }) => ({
        item_id: proposalId,
        member_id: c.member_id,
        name: byId[c.member_id]?.name ?? 'Member',
        initials: byId[c.member_id]?.initials ?? '?',
        avatar_url: byId[c.member_id]?.avatar_url ?? null,
        seats: c.seats,
      })))
    }

    setLoading(false)
  }, [proposalId]) // eslint-disable-line react-hooks/exhaustive-deps

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  async function startCommit() {
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/proposals/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId, seats }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Commit failed (${res.status})`)
      setClientSecret(data.clientSecret)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Commit failed')
    } finally {
      setSubmitting(false)
    }
  }

  async function withdraw() {
    if (!confirm('Withdraw your commit? Your card will not be charged.')) return
    try {
      const res = await fetch('/api/proposals/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Withdraw failed')
      router.push('/proposals')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Withdraw failed')
    }
  }

  if (loading) {
    return (
      <div className="page">
        <div className="page-view" style={{ textAlign: 'center', padding: 64, color: 'var(--ink-light)' }}>
          <div className="pending-indicator" /> Loading proposal…
        </div>
      </div>
    )
  }

  if (!proposal) {
    return (
      <div className="page">
        <PageHero accent="signal" eyebrow="PROPOSAL" title="Proposal not found" sub="It may have been withdrawn, declined, or already expired." />
        <div className="page-view"><Link href="/proposals">← Back to proposals</Link></div>
      </div>
    )
  }

  if (proposal.status !== 'open') {
    return (
      <div className="page">
        <PageHero accent="sun" eyebrow={`PROPOSAL · ${proposal.status.toUpperCase()}`} title={proposal.name} sub="This proposal isn't accepting new commits." />
        <div className="page-view"><Link href="/proposals">← Back to proposals</Link></div>
      </div>
    )
  }

  const min = proposal.min_seats ?? 0
  const cap = proposal.capacity_total ?? min
  // Network seats are what gates go-live; proposer's firm seats sit
  // outside the bar (rendered separately) so the math never reads
  // "5 of 4 committed."
  const seatsNeeded = Math.max(0, min - networkCommitted)
  const perSeatCents = proposal.price_per_seat_cents ?? 0
  const dateLabel = new Date(proposal.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const amProposer = !!memberId && memberId === proposal.proposer_id
  const proposerMin = proposal.proposer_min_seats ?? 1
  const proposerMax = proposal.proposer_max_seats ?? proposerMin
  // What the proposer ends up owing in the current state.
  const proposerSeatsNow = Math.max(proposerMin, Math.min(proposerMax, Math.max(0, min - networkCommitted)))
  const proposerSeatsBestCase = proposerMin
  const proposerSeatsWorstCase = proposerMax

  // Success state — card collected, commit row finalized.
  if (success) {
    return (
      <div className="page">
        <PageHero
          accent="moss"
          eyebrow="COMMITTED"
          title={`You're in on "${proposal.name}".`}
          sub={`Your card stays on file until the proposal locks or expires. No charge yet. We'll notify you the moment ${seatsNeeded > 1 ? `${seatsNeeded - seats} more seats are claimed` : 'ops locks it in'}.`}
        />
        <div className="page-view" style={{ display: 'flex', gap: 8 }}>
          <button className="btn-primary" onClick={() => router.push('/proposals')}>Back to proposals</button>
          <button className="btn-ghost" onClick={() => router.push('/seats')}>Browse open seats</button>
        </div>
      </div>
    )
  }

  // Existing commit — show status + withdraw.
  if (myCommit) {
    return (
      <div className="page">
        <PageHero
          accent="sun"
          eyebrow={`PROPOSAL · YOUR COMMIT`}
          title={proposal.name}
          sub={`${dateLabel} · proposed by ${proposerName ?? 'a member'}`}
        />
        <div className="page-view" style={{ maxWidth: 560 }}>
          <ProposalSummaryPanel
            network={networkCommitted}
            proposerFirm={Math.max(0, committed - networkCommitted)}
            min={min} cap={cap}
            perSeatCents={perSeatCents}
            expiresAt={proposal.expires_at}
            roster={roster}
            proposerName={proposerName}
          />
          <ProposalDetailsPanel proposal={proposal} roster={roster} />

          <div className="panel" style={{ padding: '20px 24px', marginTop: 16 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-light)', fontWeight: 600, marginBottom: 8 }}>
              Your commit
            </div>
            <div style={{ fontSize: 15, color: 'var(--ink)', marginBottom: 12 }}>
              {amProposer
                ? <>You proposed this trip. Your card is on file for <strong>{proposerSeatsBestCase}–{proposerSeatsWorstCase} seats</strong> ({proposerSeatsBestCase === proposerSeatsWorstCase ? `your firm party of ${proposerSeatsBestCase}` : `firm ${proposerSeatsBestCase}, up to ${proposerSeatsWorstCase} if the network underfills`}). With current commits you'd be charged for <strong>{proposerSeatsNow}</strong>.</>
                : <>You&apos;ve committed <strong>{myCommit.seats}</strong> seat{myCommit.seats === 1 ? '' : 's'}. Card on file, you won&apos;t be charged unless ops locks the trip.</>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-light)', lineHeight: 1.55, marginBottom: 16 }}>
              {amProposer
                ? 'As the proposer, withdrawing while others have committed requires ops involvement. If no other members have committed yet, you can pull it now and nothing happens.'
                : 'You can withdraw any time before the proposal locks. Nothing is charged on withdraw.'}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn-primary" onClick={() => setAddSeatsOpen(true)} style={{ background: 'var(--sun-d)' }}>
                + Add a seat (bringing someone?)
              </button>
              <button className="btn-ghost" onClick={withdraw} style={{ color: 'var(--signal)' }}>
                Withdraw my commit
              </button>
            </div>
          </div>

          {addSeatsOpen && (
            <AddSeatsPanel
              proposalId={proposalId}
              currentSeats={myCommit.seats}
              maxAdditional={amProposer
                ? Math.max(0, (proposal.proposer_max_seats ?? proposerMin) - myCommit.seats)
                : Math.max(0, (proposal.capacity_total ?? cap) - committed)}
              onClose={() => setAddSeatsOpen(false)}
              onAdded={() => { setAddSeatsOpen(false); load() }}
            />
          )}

          {error && (
            <div style={{ background: 'rgba(217,78,42,0.08)', border: '1px solid rgba(217,78,42,0.25)', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: 'var(--signal)', marginTop: 12 }}>
              {error}
            </div>
          )}
        </div>
      </div>
    )
  }

  // New-commit flow.
  return (
    <div className="page">
      <PageHero
        accent="sun"
        eyebrow="PROPOSAL · COMMIT A SEAT"
        title={proposal.name}
        sub={`${dateLabel} · proposed by ${proposerName ?? 'a member'}. Nothing is charged until the proposal locks.`}
      />
      <div className="page-view" style={{ maxWidth: 560 }}>
        <ProposalSummaryPanel
          network={networkCommitted}
          proposerFirm={Math.max(0, committed - networkCommitted)}
          min={min} cap={cap}
          perSeatCents={perSeatCents}
          expiresAt={proposal.expires_at}
          roster={roster}
          proposerName={proposerName}
        />
        <ProposalDetailsPanel proposal={proposal} roster={roster} />

        {!clientSecret && (
          <div className="panel" style={{ padding: '20px 24px', marginTop: 16 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-light)', fontWeight: 600, marginBottom: 10 }}>
              Your commit
            </div>
            <div className="field">
              <label className="field-lab">Seats</label>
              <input
                className="input"
                type="number"
                min={1}
                max={Math.max(1, cap - committed)}
                value={seats}
                onChange={e => setSeats(Math.max(1, Math.min(cap - committed, Number(e.target.value) || 1)))}
              />
              <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 4, fontFamily: 'var(--mono)' }}>
                {seats} × ${(perSeatCents / 100).toFixed(0)} = <strong style={{ color: 'var(--ink)' }}>${((seats * perSeatCents) / 100).toFixed(2)}</strong> if the proposal locks.
              </div>
            </div>
            <div style={{ background: 'rgba(0,179,199,0.06)', border: '1px solid rgba(0,179,199,0.20)', borderRadius: 10, padding: '12px 14px', fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.55, marginTop: 4, marginBottom: 16 }}>
              We&apos;ll save a card on file but won&apos;t charge it until ops confirms the trip with Tropic, and they only do that once the proposal hits its minimum {min} commit{min === 1 ? '' : 's'}.
            </div>
            {error && (
              <div style={{ background: 'rgba(217,78,42,0.08)', border: '1px solid rgba(217,78,42,0.25)', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: 'var(--signal)', marginBottom: 12 }}>
                {error}
              </div>
            )}
            <button className="btn-primary" onClick={startCommit} disabled={submitting} style={{ width: '100%' }}>
              {submitting ? 'Setting up…' : 'Continue to card on file →'}
            </button>
          </div>
        )}

        {clientSecret && (
          <div className="panel" style={{ padding: '20px 24px', marginTop: 16 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-light)', fontWeight: 600, marginBottom: 10 }}>
              Card on file · no charge yet
            </div>
            <Elements
              stripe={getStripe()}
              options={{
                clientSecret,
                appearance: {
                  theme: 'stripe',
                  variables: {
                    colorPrimary: '#e09418',
                    colorBackground: '#fffbf0',
                    colorText: '#0d3340',
                    colorDanger: '#d94e2a',
                    fontFamily: '-apple-system,BlinkMacSystemFont,"Inter Tight","Inter",sans-serif',
                    borderRadius: '10px',
                    spacingUnit: '4px',
                  },
                },
              }}
            >
              <CardForm onSuccess={() => setSuccess(true)} memberName={memberName ?? ''} />
            </Elements>
          </div>
        )}
      </div>
    </div>
  )
}

function ProposalSummaryPanel({
  network, proposerFirm, min, cap, perSeatCents, expiresAt, roster, proposerName,
}: {
  network: number; proposerFirm: number; min: number; cap: number;
  perSeatCents: number; expiresAt: string | null; roster: RosterEntry[];
  proposerName: string | null
}) {
  const hitMin = min > 0 && network >= min
  const networkNeeded = Math.max(0, min - network)
  const networkSlots = Math.max(min, cap - proposerFirm)
  const pctOfSlots = networkSlots ? Math.min(100, Math.round((network / networkSlots) * 100)) : 0
  return (
    <div className="panel" style={{ padding: '18px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-light)', letterSpacing: '0.06em' }}>
          <strong style={{ color: 'var(--ink)' }}>{network}</strong>
          <span style={{ margin: '0 4px', color: 'var(--ink-faint)' }}>of</span>
          <strong style={{ color: 'var(--ink)' }}>{min}</strong>
          <span style={{ margin: '0 4px', color: 'var(--ink-faint)' }}>network commits</span>
        </span>
        {perSeatCents > 0 && (
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink)', fontWeight: 700 }}>
            ${(perSeatCents / 100).toFixed(0)}/seat
          </span>
        )}
      </div>
      {proposerFirm > 0 && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--sun-d)', fontWeight: 700, letterSpacing: '0.06em', marginBottom: 6 }}>
          +{proposerFirm} firm from {proposerName?.split(' ')[0] ?? 'proposer'} (guaranteed, not counted toward min)
        </div>
      )}
      <div style={{ height: 10, background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 999, overflow: 'hidden', position: 'relative' }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${pctOfSlots}%`,
          background: hitMin
            ? 'linear-gradient(90deg, #3e8c6d 0%, #4ba883 100%)'
            : 'linear-gradient(90deg, #f4a72c 0%, #e09418 100%)',
          transition: 'width 0.3s ease',
        }} />
        {min > 0 && networkSlots > 0 && min < networkSlots && (
          <div style={{
            position: 'absolute',
            left: `${Math.round((min / networkSlots) * 100)}%`,
            top: -3, bottom: -3,
            borderLeft: '1px dashed var(--ink-light)',
          }} />
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, fontSize: 12, color: 'var(--ink-soft)', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {hitMin
            ? <span style={{ color: 'var(--moss)', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '0.06em' }}>✓ MIN REACHED · AWAITING OPS</span>
            : <><strong style={{ color: 'var(--ink)' }}>{networkNeeded}</strong> more network seat{networkNeeded === 1 ? '' : 's'} to go</>}
          {expiresAt && !hitMin && <ProposalDeadlineTag expiresAt={expiresAt} />}
        </span>
        {expiresAt && !hitMin && <ProposalCountdown expiresAt={expiresAt} />}
      </div>
      {roster.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <RosterStack entries={roster} occupied={network + proposerFirm} />
        </div>
      )}
    </div>
  )
}

// Trip details + member-facing pitch + named committers — the
// "should I commit?" pitch sheet. Date is already in the PageHero, so
// this surfaces destination/route, depart/return times, stay type
// (excursion), the proposer's pitch line, and a named roster of who's
// already in. The ops-only "Notes for ops" stays hidden here.
function ProposalDetailsPanel({
  proposal, roster,
}: {
  proposal: Proposal; roster: RosterEntry[]
}) {
  const p = proposal.payload ?? {}
  const destName = (p.destName as string) || (p.destCode as string) || null
  const destCode = p.destCode as string | undefined
  const departTime = p.departTime as string | undefined
  const returnTime = p.returnTime as string | undefined
  const stayType = p.stayType as string | undefined
  const stayLabel = stayType === 'overnight' ? 'Overnight' : stayType === 'multi_night' ? 'Multi-night' : stayType === 'day_trip' ? 'Day trip' : null
  const pitch = (p.pitch as string | undefined)?.trim() || null
  const dateLabel = new Date(proposal.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  const rows: [string, string][] = [['Date', dateLabel]]
  if (proposal.kind === 'flight') {
    rows.push(['Route', `${proposal.origin_code} → ${destCode || destName || 'TBD'}`])
    if (departTime) rows.push(['Departs', departTime])
  } else {
    rows.push(['From', proposal.origin_code])
    if (destName) rows.push(['Destination', destName])
    if (stayLabel) rows.push(['Stay', stayLabel])
    if (departTime) rows.push(['Depart', departTime])
    if (returnTime) rows.push(['Return', returnTime])
  }

  return (
    <div className="panel" style={{ padding: '18px 24px', marginTop: 16 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-light)', fontWeight: 600, marginBottom: 10 }}>
        Trip details
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '6px 16px', fontSize: 13 }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: 'contents' }}>
            <div style={{ color: 'var(--ink-light)' }}>{k}</div>
            <div style={{ color: 'var(--ink)', fontWeight: 500 }}>{v}</div>
          </div>
        ))}
      </div>
      {pitch && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--hair)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--sun-d)', fontWeight: 700, marginBottom: 6 }}>
            The pitch
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.55, fontStyle: 'italic' }}>
            “{pitch}”
          </div>
        </div>
      )}
      {roster.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--hair)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-light)', fontWeight: 700, marginBottom: 8 }}>
            Who's in
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink)' }}>
            {roster.map(r => (
              <div key={r.member_id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{r.name}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-light)' }}>
                  {r.seats} seat{r.seats === 1 ? '' : 's'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CardForm({ onSuccess, memberName }: { onSuccess: () => void; memberName: string }) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setSubmitting(true)
    setError(null)
    try {
      const { error: confirmErr, setupIntent } = await stripe.confirmSetup({
        elements,
        confirmParams: { return_url: window.location.href },
        redirect: 'if_required',
      })
      if (confirmErr) {
        setError(confirmErr.message ?? 'Card declined.')
        setSubmitting(false)
        return
      }
      if (!setupIntent || setupIntent.status !== 'succeeded') {
        setError(`Setup status: ${setupIntent?.status ?? 'unknown'}.`)
        setSubmitting(false)
        return
      }
      // Persist the payment_method id on the commit row.
      const finalRes = await fetch('/api/proposals/commit/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setupIntentId: setupIntent.id }),
      })
      if (!finalRes.ok) {
        const j = await finalRes.json().catch(() => ({}))
        throw new Error(j.error ?? 'Failed to finalize commit')
      }
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save card')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <PaymentElement options={{ layout: 'tabs' }} />
      {error && (
        <div style={{ background: 'rgba(217,78,42,0.08)', border: '1px solid rgba(217,78,42,0.25)', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: 'var(--signal)', marginTop: 12 }}>
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="btn-primary"
        style={{ width: '100%', marginTop: 16 }}
      >
        {submitting ? 'Saving card…' : `Commit ${memberName ? memberName.split(' ')[0] : 'me'}'s seat${memberName ? '' : 's'} →`}
      </button>
      <div style={{ fontSize: 11, color: 'var(--ink-faint)', textAlign: 'center', marginTop: 10, fontFamily: 'var(--mono)', letterSpacing: '0.04em' }}>
        No charge until the proposal locks. Withdraw any time before then.
      </div>
    </form>
  )
}

// Modal to bump up an existing commit's seat count — for committers
// who are "bringing someone" during the commit window. Caps at
// remaining headroom (capacity for regular committers, proposer_max
// for the proposer).
function AddSeatsPanel({
  proposalId,
  currentSeats,
  maxAdditional,
  onClose,
  onAdded,
}: {
  proposalId: string
  currentSeats: number
  maxAdditional: number
  onClose: () => void
  onAdded: () => void
}) {
  const [add, setAdd] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    if (add < 1 || add > maxAdditional) {
      setError(`Add between 1 and ${maxAdditional} seat${maxAdditional === 1 ? '' : 's'}.`)
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/proposals/commit/add-seats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId, addSeats: add }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Add seats failed')
      onAdded()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Add seats failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(13,51,64,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, zIndex: 100,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--card)', borderRadius: 14, padding: 24,
          maxWidth: 420, width: '100%',
          boxShadow: '0 24px 56px rgba(0,0,0,0.18)',
        }}
      >
        <div style={{
          fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.22em',
          textTransform: 'uppercase', color: 'var(--sun-d)', fontWeight: 700, marginBottom: 6,
        }}>
          Add seats to your commit
        </div>
        <h3 style={{ fontFamily: 'var(--display)', fontSize: 20, margin: '0 0 8px', color: 'var(--ink)' }}>
          Bringing more people?
        </h3>
        <div style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.55, marginBottom: 16 }}>
          You currently have <strong>{currentSeats}</strong> seat{currentSeats === 1 ? '' : 's'} committed. Add more using the same card on file. No charge until ops locks the trip.
        </div>

        {maxAdditional === 0 ? (
          <div style={{ background: 'rgba(217,78,42,0.08)', border: '1px solid rgba(217,78,42,0.25)', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: 'var(--signal)', marginBottom: 14 }}>
            No seats left to add, proposal is at capacity for you.
          </div>
        ) : (
          <div className="field">
            <label className="field-lab">Seats to add (max {maxAdditional})</label>
            <input
              className="input"
              type="number"
              min={1}
              max={maxAdditional}
              value={add}
              onChange={e => setAdd(Math.max(1, Math.min(maxAdditional, Number(e.target.value) || 1)))}
            />
            <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 4, fontFamily: 'var(--mono)' }}>
              New total: {currentSeats + add} seat{currentSeats + add === 1 ? '' : 's'}
            </div>
          </div>
        )}

        {error && (
          <div style={{ background: 'rgba(217,78,42,0.08)', border: '1px solid rgba(217,78,42,0.25)', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: 'var(--signal)', marginTop: 10 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn-primary" disabled={submitting || maxAdditional === 0} onClick={submit}>
            {submitting ? 'Adding…' : `Add ${add} seat${add === 1 ? '' : 's'}`}
          </button>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
