'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import PageHero from '@/components/PageHero'
import { ProposalCard, loadOpenProposals, type ProposalCardData } from '@/components/ProposalCard'

// Dedicated Trip Proposals board. Same card renderer as /seats; this
// page exists so the proposals model has its own dedicated home on
// the sidebar / mobile nav and members can browse + filter the live
// proposals without /seats noise.

type Filter = 'all' | 'flight' | 'excursion' | 'mine'

export default function ProposalsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [proposals, setProposals] = useState<ProposalCardData[]>([])
  const [memberId, setMemberId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    let mid: string | null = null
    if (user) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: m } = await (supabase as any).from('members').select('id').eq('user_id', user.id).maybeSingle()
      mid = m?.id ?? null
    }
    setMemberId(mid)
    const list = await loadOpenProposals(supabase, mid)
    setProposals(list)
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

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
        {/* Filter chips */}
        {proposals.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                style={{
                  padding: '6px 14px', borderRadius: 20, fontSize: 12.5,
                  fontFamily: 'var(--ui)', fontWeight: filter === f.key ? 600 : 400,
                  border: `1px solid ${filter === f.key ? 'var(--sun-d)' : 'var(--hair-2)'}`,
                  background: filter === f.key ? 'rgba(244,167,44,0.10)' : 'transparent',
                  color: filter === f.key ? 'var(--sun-d)' : 'var(--ink-light)',
                  cursor: 'pointer',
                }}
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
