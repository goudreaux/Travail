'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useMember } from '@/lib/member-context'
import PageHero from '@/components/PageHero'
import { ProposalCard, MyProposalRow, loadOpenProposals, loadMyProposals, type ProposalCardData, type MyProposalData } from '@/components/ProposalCard'

// Dedicated Trip Proposals board. Same card renderer as /seats; this
// page exists so the proposals model has its own dedicated home on
// the sidebar / mobile nav and members can browse + filter the live
// proposals without /seats noise.

type Filter = 'all' | 'flight' | 'excursion' | 'mine'

export default function ProposalsPage() {
  const router = useRouter()
  const supabase = createClient()
  const { member, loading: memberLoading } = useMember()
  const memberId = member?.id ?? null
  const [proposals, setProposals] = useState<ProposalCardData[]>([])
  const [mine, setMine] = useState<MyProposalData[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')

  const load = useCallback(async () => {
    setLoading(true)
    const [list, myList] = await Promise.all([
      loadOpenProposals(supabase, memberId),
      loadMyProposals(supabase, memberId),
    ])
    setProposals(list)
    setMine(myList)
    setLoading(false)
  }, [memberId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Wait for the shared member context to resolve so we personalize
  // (am_proposer / is_my_commit) on the first load instead of flashing.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!memberLoading) load() }, [load, memberLoading])

  const visible = proposals.filter(p => {
    if (filter === 'all') return true
    if (filter === 'flight') return p.kind === 'flight'
    if (filter === 'excursion') return p.kind === 'excursion'
    if (filter === 'mine') return p.am_proposer || p.is_my_commit
    return true
  })

  const myCount = proposals.filter(p => p.am_proposer || p.is_my_commit).length

  const FILTERS: { key: Filter; label: string; count?: number }[] = [
    { key: 'all',       label: 'All',       count: proposals.length },
    { key: 'flight',    label: 'Flights',   count: proposals.filter(p => p.kind === 'flight').length },
    { key: 'excursion', label: 'Excursions', count: proposals.filter(p => p.kind === 'excursion').length },
    { key: 'mine',      label: 'Yours',     count: myCount },
  ]

  return (
    <div className="page">
      <PageHero
        accent="sun"
        sansTitle
        eyebrow="TRIP PROPOSALS · NO RISK"
        title={proposals.length > 0 ? `${proposals.length} live proposal${proposals.length === 1 ? '' : 's'}` : 'No live proposals right now'}
        sub="Member-pitched trips waiting on the network to commit. If a proposal hits its minimum 5 days before takeoff, it locks in and everyone pays. If not, nobody pays."
        actions={(
          <button className="btn-primary" onClick={() => router.push('/propose')}>
            Propose a trip →
          </button>
        )}
      />

      <div className="page-view">
        {/* Your proposals — the proposer's own pipeline across every
            status (pending review, live, funded, expired, declined,
            withdrawn) so they can always see where a proposal stands and
            what happens next. The live board below is the network view. */}
        {!loading && mine.length > 0 && (
          <div style={{ marginBottom: 26 }}>
            <div style={{
              fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '0.16em',
              textTransform: 'uppercase', color: 'var(--ink-light)', marginBottom: 10,
            }}>
              Your proposals
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {mine.map(p => (
                <MyProposalRow
                  key={p.id}
                  p={p}
                  onOpen={() => router.push(`/reserve/${p.id}?kind=proposal`)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Filter chips */}
        {proposals.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
            {FILTERS.map(f => (
              <button
                key={f.key}
                className={`chip chip--sun${filter === f.key ? ' active' : ''}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}{typeof f.count === 'number' ? ` · ${f.count}` : ''}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--ink-light)', fontSize: 14 }}>
            <div className="pending-indicator" /> Loading proposals…
          </div>
        ) : visible.length === 0 ? (
          <div style={{
            background: 'var(--card)', border: '2px dashed rgba(244,167,44,0.30)',
            borderRadius: 14, padding: '36px 24px', textAlign: 'center',
          }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 20, color: 'var(--ink)', marginBottom: 8 }}>
              {proposals.length === 0 ? 'No live proposals right now.' : 'Nothing in this view.'}
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.55, maxWidth: 440, margin: '0 auto 16px' }}>
              {proposals.length === 0
                ? "Pitch a date and rally the network. You only pay if your commit threshold is met, and nobody pays if it falls through."
                : 'Try a different filter, or start your own proposal.'}
            </div>
            <button className="btn-primary" onClick={() => router.push('/propose')}>
              Propose a trip →
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {visible.map(p => (
              <ProposalCard
                key={p.id}
                p={p}
                onOpen={() => router.push(`/reserve/${p.id}?kind=proposal`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
