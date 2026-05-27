'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { fmtHomeBase, memberCode, tierLabel, tierPill, canonicalInterests } from '@/lib/data'
import { TRIP_TYPE_ICONS } from '@/lib/icons'
import PageHero from '@/components/PageHero'
import type { Member } from '@/lib/supabase/types'

function Avatar({ member, size = 52 }: { member: Member; size?: number }) {
  if (member.avatar_url) {
    return (
      <img
        src={member.avatar_url}
        alt={member.name}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          display: 'block',
          flexShrink: 0,
        }}
      />
    )
  }
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: 'var(--night)',
      color: 'var(--tropic)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--mono)',
      fontSize: size * 0.3,
      fontWeight: 600,
      letterSpacing: '0.06em',
      flexShrink: 0,
      border: '1px solid rgba(0,179,199,0.25)',
    }}>
      {member.initials}
    </div>
  )
}

function TierBadge({ tier }: { tier: string }) {
  return <span className={`pill ${tierPill(tier)}`}>{tierLabel(tier)}</span>
}

interface MemberWithCount extends Member {
  tripCount?: number
}

export default function NetworkPage() {
  const [members, setMembers] = useState<MemberWithCount[]>([])
  const [search, setSearch] = useState('')
  const [baseFilter, setBaseFilter] = useState<string>('all')
  const [interestFilter, setInterestFilter] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()

      const { data: membersData } = await supabase
        .from('members')
        .select('*')
        .order('joined_at', { ascending: true })

      if (!membersData) { setLoading(false); return }

      // Administrators are ops accounts — never listed in the member network.
      const visible = membersData.filter(m => m.tier !== 'administrator')

      // Load booking counts per member
      const { data: bookingsData } = await supabase
        .from('bookings')
        .select('member_id')
        .in('status', ['approved'])

      const countMap: Record<string, number> = {}
      if (bookingsData) {
        for (const b of bookingsData) {
          countMap[b.member_id] = (countMap[b.member_id] || 0) + 1
        }
      }

      setMembers(visible.map(m => ({ ...m, tripCount: countMap[m.id] || 0 })))
      setLoading(false)
    }
    load()
  }, [])

  // Unique home bases for the filter chips
  const homeBases = Array.from(new Set(members.map(m => m.home_base_code).filter(Boolean) as string[]))

  const q = search.trim().toLowerCase()
  const filtered = members.filter(m => {
    if (q && !(
      m.name.toLowerCase().includes(q) ||
      (m.home_base_code && m.home_base_code.toLowerCase().includes(q)) ||
      (m.bio && m.bio.toLowerCase().includes(q))
    )) return false
    if (baseFilter !== 'all' && m.home_base_code !== baseFilter) return false
    if (interestFilter.size > 0) {
      const ints = new Set(canonicalInterests(m.interests))
      let any = false
      for (const i of interestFilter) if (ints.has(i as 'Fishing' | 'Hunting' | 'Golf' | 'Leisure' | 'Surfing')) { any = true; break }
      if (!any) return false
    }
    return true
  })

  return (
    <div className="page">
      <PageHero
        accent="teal"
        eyebrow="The Network"
        title="Members."
        sub={loading ? 'Loading…' : `The ${members.length} founding members.`}
        metric={loading ? undefined : { value: members.length, label: 'Founding members', sub: 'In the wire' }}
        actions={
          <div className="search" style={{ maxWidth: 240 }}>
            <svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <circle cx="9" cy="9" r="6" /><line x1="13.5" y1="13.5" x2="18" y2="18" />
            </svg>
            <input
              type="text"
              placeholder="Search members..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        }
      />

      <div className="page-view">
        {/* Filter bar — home base + interest chips. Always visible above
            the list, scrollable horizontally on mobile if there are many
            home bases. */}
        {!loading && members.length > 0 && (
          <div className="network-filters">
            <div className="network-filters__row" aria-label="Filter by home base">
              <button
                type="button"
                className={`chip${baseFilter === 'all' ? ' active' : ''}`}
                onClick={() => setBaseFilter('all')}
              >
                All bases
              </button>
              {homeBases.map(code => (
                <button
                  key={code}
                  type="button"
                  className={`chip${baseFilter === code ? ' active' : ''}`}
                  onClick={() => setBaseFilter(code)}
                >
                  {fmtHomeBase(code) ?? code}
                </button>
              ))}
            </div>
            <div className="network-filters__row" aria-label="Filter by interest">
              {(['Fishing', 'Hunting', 'Golf', 'Leisure', 'Surfing'] as const).map(t => {
                const active = interestFilter.has(t)
                return (
                  <button
                    key={t}
                    type="button"
                    className={`chip${active ? ' active' : ''}`}
                    onClick={() => setInterestFilter(prev => {
                      const next = new Set(prev)
                      if (next.has(t)) next.delete(t)
                      else next.add(t)
                      return next
                    })}
                  >
                    <span style={{ display: 'inline-flex', width: 14, height: 14, alignItems: 'center', justifyContent: 'center' }}>
                      {TRIP_TYPE_ICONS[t]}
                    </span>
                    {t}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {loading ? (
          // Mirror the real .network-list layout so the page doesn't jump
          // scale on hand-off from skeleton to data (especially on mobile,
          // where the list collapses to skinny rows).
          <div className="network-list" aria-hidden>
            {[...Array(6)].map((_, i) => (
              <div key={i} className="network-card panel" style={{ opacity: 0.5, pointerEvents: 'none' }}>
                <div className="network-card__avatar">
                  <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--warm)', flexShrink: 0 }} />
                </div>
                <div className="network-card__body">
                  <div style={{ width: '60%', height: 12, background: 'var(--warm)', borderRadius: 4 }} />
                  <div style={{ width: '40%', height: 9, background: 'var(--warm)', borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <svg width="40" height="40" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.4">
              <circle cx="11" cy="11" r="8" /><circle cx="11" cy="11" rx="3.2" ry="8" />
              <line x1="3" y1="11" x2="19" y2="11" />
            </svg>
            <h3>No members found.</h3>
            <p>{search ? `No members matching "${search}".` : 'No members yet.'}</p>
          </div>
        ) : (
          <div className="network-list">
            {filtered.map(member => {
              const ints = canonicalInterests(member.interests)
              const home = fmtHomeBase(member.home_base_code)
              return (
                <Link key={member.id} href={`/network/${member.id}`} className="network-card panel">
                  <div className="network-card__avatar">
                    <Avatar member={member} size={52} />
                  </div>
                  <div className="network-card__body">
                    <div className="network-card__name-row">
                      <div className="network-card__name">{member.name}</div>
                      <TierBadge tier={member.tier} />
                    </div>
                    <div className="network-card__meta">
                      {home && (
                        <span className="network-card__home">
                          <svg width="11" height="11" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                            <path d="M11 3a6 6 0 0 1 6 6c0 4-6 10-6 10S5 13 5 9a6 6 0 0 1 6-6z" />
                            <circle cx="11" cy="9" r="2" />
                          </svg>
                          {home}
                        </span>
                      )}
                      <span className="network-card__code">{memberCode(member)}</span>
                    </div>
                    {member.bio && (
                      <p className="network-card__bio">{member.bio}</p>
                    )}
                    <div className="network-card__footer">
                      {ints.length > 0 && (
                        <div className="network-card__interests">
                          {ints.map(t => (
                            <span key={t} className="network-card__interest" title={t}>
                              <span style={{ display: 'flex', width: 13, height: 13 }}>{TRIP_TYPE_ICONS[t]}</span>
                            </span>
                          ))}
                        </div>
                      )}
                      <span className="network-card__trips">
                        {(member as MemberWithCount).tripCount
                          ? `${(member as MemberWithCount).tripCount} trip${(member as MemberWithCount).tripCount === 1 ? '' : 's'}`
                          : '—'}
                      </span>
                    </div>
                  </div>
                  <span className="network-card__chev" aria-hidden>›</span>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
