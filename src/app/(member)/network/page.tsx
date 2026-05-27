'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { fmtHomeBase, memberCode, tierLabel, tierPill, canonicalInterests } from '@/lib/data'
import { TRIP_TYPE_ICONS } from '@/lib/icons'
import PageHero from '@/components/PageHero'
import type { Member, Friendship } from '@/lib/supabase/types'

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

interface PendingRequest {
  friendshipId: string
  requester: Member
}

export default function NetworkPage() {
  const [members, setMembers] = useState<MemberWithCount[]>([])
  const [search, setSearch] = useState('')
  const [baseFilter, setBaseFilter] = useState<string>('all')
  const [interestFilter, setInterestFilter] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [meId, setMeId] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingRequest[]>([])
  const [decidingId, setDecidingId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()

      const { data: { user } } = await supabase.auth.getUser()
      const { data: meRow } = user
        ? await supabase.from('members').select('id').eq('user_id', user.id).maybeSingle()
        : { data: null }
      const myId = meRow?.id ?? null
      setMeId(myId)

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

      const list = visible.map(m => ({ ...m, tripCount: countMap[m.id] || 0 }))
      setMembers(list)

      // Pending friend requests addressed to me — used both for the
      // inline accept panel and the badge-dot counts surfaced via storage.
      if (myId) {
        const { data: pendingRows } = await supabase
          .from('friendships')
          .select('*')
          .eq('addressee_id', myId)
          .eq('status', 'pending')
        const requesterMap: Record<string, Member> = {}
        for (const m of list) requesterMap[m.id] = m
        const items: PendingRequest[] = ((pendingRows ?? []) as Friendship[])
          .map(f => ({ friendshipId: f.id, requester: requesterMap[f.requester_id] }))
          .filter(p => !!p.requester)
        setPending(items)
        // Broadcast count for nav badges via window event + localStorage.
        try {
          localStorage.setItem('travail.pending_friend_count', String(items.length))
          window.dispatchEvent(new CustomEvent('travail:pending-friend-count', { detail: items.length }))
        } catch { /* SSR / private browsing — best effort */ }
      }
      setLoading(false)
    }
    load()
  }, [])

  async function respondToRequest(friendshipId: string, action: 'accepted' | 'declined') {
    if (decidingId) return
    setDecidingId(friendshipId)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('friendships') as any)
      .update({ status: action })
      .eq('id', friendshipId)
    setPending(prev => {
      const next = prev.filter(p => p.friendshipId !== friendshipId)
      try {
        localStorage.setItem('travail.pending_friend_count', String(next.length))
        window.dispatchEvent(new CustomEvent('travail:pending-friend-count', { detail: next.length }))
      } catch { /* ignore */ }
      return next
    })
    setDecidingId(null)
  }

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
        {/* Inbound friend requests — surfaced at the top so the action
            is one tap from the list. Each row mirrors the member-card row
            shape so the page reads as continuous. */}
        {!loading && pending.length > 0 && (
          <div className="pending-friends panel" aria-label="Pending friend requests">
            <div className="pending-friends__head">
              <div>
                <div className="pending-friends__title">Friend request{pending.length > 1 ? 's' : ''}</div>
                <div className="pending-friends__sub">
                  {pending.length === 1
                    ? `${pending[0].requester.name.split(' ')[0]} wants to connect`
                    : `${pending.length} members want to connect`}
                </div>
              </div>
              <span className="pill signal" style={{ flexShrink: 0 }}>{pending.length}</span>
            </div>
            <div className="pending-friends__list">
              {pending.map(p => (
                <div key={p.friendshipId} className="pending-friends__row">
                  <Link
                    href={`/network/${p.requester.id}`}
                    className="pending-friends__who"
                  >
                    {p.requester.avatar_url ? (
                      <img
                        src={p.requester.avatar_url}
                        alt={p.requester.name}
                        style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                      />
                    ) : (
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%',
                        background: 'var(--night)', color: 'var(--tropic)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700,
                        flexShrink: 0,
                      }}>
                        {p.requester.initials}
                      </div>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div className="pending-friends__name">{p.requester.name}</div>
                      {fmtHomeBase(p.requester.home_base_code) && (
                        <div className="pending-friends__meta">{fmtHomeBase(p.requester.home_base_code)}</div>
                      )}
                    </div>
                  </Link>
                  <div className="pending-friends__actions">
                    <button
                      type="button"
                      className="cta-outline"
                      onClick={() => respondToRequest(p.friendshipId, 'accepted')}
                      disabled={decidingId === p.friendshipId}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => respondToRequest(p.friendshipId, 'declined')}
                      disabled={decidingId === p.friendshipId}
                      style={{ fontSize: 12, padding: '6px 12px' }}
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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
