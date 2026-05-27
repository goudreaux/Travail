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
  const [statusFilter, setStatusFilter] = useState<'all' | 'friends' | 'pending' | 'unconnected'>('all')
  const [loading, setLoading] = useState(true)
  const [meId, setMeId] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingRequest[]>([])
  const [decidingId, setDecidingId] = useState<string | null>(null)
  // Friend relationship maps, keyed by counterparty member id.
  //   friendSet:           accepted friendships
  //   pendingFromMeSet:    I've sent them a request, awaiting their response
  //   pendingToMeSet:      they've sent me a request, awaiting my response
  const [friendSet, setFriendSet] = useState<Set<string>>(new Set())
  const [pendingFromMeSet, setPendingFromMeSet] = useState<Set<string>>(new Set())
  const [pendingToMeSet, setPendingToMeSet] = useState<Set<string>>(new Set())
  const [connectBusy, setConnectBusy] = useState<string | null>(null)

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

      // All friendships involving me — derive three sets used to power
      // the filter, the per-card state badge, and the pending-requests
      // panel above. One query for everything.
      if (myId) {
        const { data: allFs } = await supabase
          .from('friendships')
          .select('*')
          .or(`requester_id.eq.${myId},addressee_id.eq.${myId}`)
        const rows = (allFs ?? []) as Friendship[]
        const acc = new Set<string>()
        const fromMe = new Set<string>()
        const toMe = new Set<string>()
        for (const f of rows) {
          const other = f.requester_id === myId ? f.addressee_id : f.requester_id
          if (f.status === 'accepted') acc.add(other)
          else if (f.status === 'pending') {
            if (f.requester_id === myId) fromMe.add(other)
            else toMe.add(other)
          }
        }
        setFriendSet(acc)
        setPendingFromMeSet(fromMe)
        setPendingToMeSet(toMe)

        // Pending requests addressed to me — feeds the friend-request panel
        // at the top of the page and the badge-dot counts.
        const requesterMap: Record<string, Member> = {}
        for (const m of list) requesterMap[m.id] = m
        const items: PendingRequest[] = rows
          .filter(f => f.status === 'pending' && f.addressee_id === myId)
          .map(f => ({ friendshipId: f.id, requester: requesterMap[f.requester_id] }))
          .filter(p => !!p.requester)
        setPending(items)
        try {
          localStorage.setItem('travail.pending_friend_count', String(items.length))
          window.dispatchEvent(new CustomEvent('travail:pending-friend-count', { detail: items.length }))
        } catch { /* SSR / private browsing — best effort */ }
      }
      setLoading(false)
    }
    load()
  }, [])

  async function sendFriendRequest(otherId: string) {
    if (!meId || connectBusy) return
    setConnectBusy(otherId)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from('friendships') as any)
      .insert({ requester_id: meId, addressee_id: otherId, status: 'pending' })
    if (!error) {
      setPendingFromMeSet(prev => {
        const next = new Set(prev)
        next.add(otherId)
        return next
      })
    }
    setConnectBusy(null)
  }

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

  // Canonical home base regions — show every base as an option even when
  // no members are currently based there, so the filter reads as deliberate
  // rather than data-driven. Order is meaningful (Tampa Bay is the founding
  // home base, SFL is the second region).
  const HOME_BASES = ['Tampa Bay', 'SFL'] as const
  const TRIP_KINDS = ['Fishing', 'Hunting', 'Golf', 'Leisure', 'Surfing'] as const

  const filtersActive = baseFilter !== 'all' || interestFilter.size > 0 || search.trim().length > 0 || statusFilter !== 'all'
  function clearFilters() {
    setSearch('')
    setBaseFilter('all')
    setInterestFilter(new Set())
    setStatusFilter('all')
  }

  const q = search.trim().toLowerCase()
  const filtered = members.filter(m => {
    if (meId && m.id === meId) return false  // hide self from the directory
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
    if (statusFilter !== 'all') {
      const isFriend = friendSet.has(m.id)
      const isPending = pendingFromMeSet.has(m.id) || pendingToMeSet.has(m.id)
      if (statusFilter === 'friends' && !isFriend) return false
      if (statusFilter === 'pending' && !isPending) return false
      if (statusFilter === 'unconnected' && (isFriend || isPending)) return false
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
      />

      <div className="page-view">
        {/* Search — its own row under the hero so it reads as the primary
            way to find a member, with the filter card sitting beneath. */}
        {!loading && members.length > 0 && (
          <div className="network-search">
            <svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <circle cx="9" cy="9" r="6" /><line x1="13.5" y1="13.5" x2="18" y2="18" />
            </svg>
            <input
              type="text"
              placeholder="Search members…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Search members"
            />
            {search && (
              <button
                type="button"
                className="network-search__clear"
                onClick={() => setSearch('')}
                aria-label="Clear search"
              >
                <svg width="11" height="11" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <line x1="5" y1="5" x2="17" y2="17" />
                  <line x1="17" y1="5" x2="5" y2="17" />
                </svg>
              </button>
            )}
          </div>
        )}

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

        {/* Filter bar — home base + interest chips. Two labeled rows, the
            second a horizontal scroll on mobile. Clear control fades in
            once any filter (search included) is active. */}
        {!loading && members.length > 0 && (
          <div className="network-filters" role="group" aria-label="Member filters">
            <div className="network-filters__row" aria-label="Filter by home base">
              <span className="network-filters__label">Base</span>
              <button
                type="button"
                className={`chip${baseFilter === 'all' ? ' active' : ''}`}
                onClick={() => setBaseFilter('all')}
              >
                All
              </button>
              {HOME_BASES.map(base => (
                <button
                  key={base}
                  type="button"
                  className={`chip${baseFilter === base ? ' active' : ''}`}
                  onClick={() => setBaseFilter(base)}
                >
                  {fmtHomeBase(base) ?? base}
                </button>
              ))}
              {filtersActive && (
                <button
                  type="button"
                  className="network-filters__clear"
                  onClick={clearFilters}
                  aria-label="Clear all filters"
                >
                  <svg width="10" height="10" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <line x1="5" y1="5" x2="17" y2="17" />
                    <line x1="17" y1="5" x2="5" y2="17" />
                  </svg>
                  Clear
                </button>
              )}
            </div>
            <div className="network-filters__row" aria-label="Filter by connection">
              <span className="network-filters__label">Status</span>
              {([
                ['all', 'All'],
                ['friends', 'Friends'],
                ['pending', 'Pending'],
                ['unconnected', 'Not yet'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`chip${statusFilter === key ? ' active' : ''}`}
                  onClick={() => setStatusFilter(key)}
                >
                  {key === 'friends' && (
                    <svg width="11" height="11" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="4 11 9 16 18 6" />
                    </svg>
                  )}
                  {label}
                </button>
              ))}
            </div>
            <div className="network-filters__row" aria-label="Filter by interest">
              <span className="network-filters__label">Interest</span>
              {TRIP_KINDS.map(t => {
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
                    <span style={{ display: 'inline-flex', width: 13, height: 13, alignItems: 'center', justifyContent: 'center' }}>
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
          // Skeleton uses the same .biz-card shell so the layout is right
          // from the first paint — no scale jump on data hand-off.
          <div className="biz-grid" aria-hidden>
            {[...Array(6)].map((_, i) => (
              <div key={i} className="biz-card biz-card--skeleton" data-tier="founding_member" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <svg width="40" height="40" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.4">
              <circle cx="11" cy="11" r="8" /><circle cx="11" cy="11" rx="3.2" ry="8" />
              <line x1="3" y1="11" x2="19" y2="11" />
            </svg>
            <h3>No members match.</h3>
            <p>{search ? `Nothing matching "${search}".` : 'Adjust your filters to widen the search.'}</p>
            {filtersActive && (
              <button type="button" className="cta-outline" onClick={clearFilters} style={{ marginTop: 12 }}>
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="biz-grid">
            {filtered.map(member => {
              const ints = canonicalInterests(member.interests)
              const home = fmtHomeBase(member.home_base_code)
              const isFriend = friendSet.has(member.id)
              const sentByMe = pendingFromMeSet.has(member.id)
              const sentToMe = pendingToMeSet.has(member.id)
              const trips = (member as MemberWithCount).tripCount ?? 0
              const tierLabelStr = tierLabel(member.tier)
              return (
                <Link
                  key={member.id}
                  href={`/network/${member.id}`}
                  className={`biz-card${isFriend ? ' is-friend' : ''}`}
                  data-tier={member.tier}
                  aria-label={`${member.name}, ${tierLabelStr}`}
                >
                  {/* Foil edge strip — color from data-tier */}
                  <span className="biz-card__foil" aria-hidden />

                  {/* Top stamps: Travail mark on the left, member number on the right */}
                  <div className="biz-card__stamps">
                    <span className="biz-card__mark">TRAVAIL · MEMBER</span>
                    <span className="biz-card__no">
                      {member.member_no != null ? `№ ${String(member.member_no).padStart(3, '0')}` : memberCode(member)}
                    </span>
                  </div>

                  {/* Centered monogram + identity block */}
                  <div className="biz-card__head">
                    <div className="biz-card__monogram">
                      <Avatar member={member} size={64} />
                      {isFriend && (
                        <span className="biz-card__seal" title="Connected" aria-label="Connected">
                          <svg width="11" height="11" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="4 11 9 16 18 6" />
                          </svg>
                        </span>
                      )}
                    </div>
                    <div className="biz-card__id">
                      <div className="biz-card__name">{member.name}</div>
                      <div className="biz-card__title">
                        <span className="biz-card__tier">{tierLabelStr}</span>
                        {home && <>
                          <span className="biz-card__dot" aria-hidden>·</span>
                          <span className="biz-card__base">{home}</span>
                        </>}
                      </div>
                    </div>
                  </div>

                  {member.bio && (
                    <p className="biz-card__bio">&ldquo;{member.bio}&rdquo;</p>
                  )}

                  <div className="biz-card__rule" aria-hidden />

                  {/* Footer — interests + trip count */}
                  <div className="biz-card__foot">
                    <div className="biz-card__ints">
                      {ints.length > 0
                        ? ints.map(t => (
                            <span key={t} className="biz-card__int" title={t}>
                              <span style={{ display: 'inline-flex', width: 13, height: 13 }}>{TRIP_TYPE_ICONS[t]}</span>
                            </span>
                          ))
                        : <span className="biz-card__ints-empty">No interests listed</span>}
                    </div>
                    <span className="biz-card__trips">
                      {trips > 0 ? `${trips} trip${trips === 1 ? '' : 's'}` : '— trips'}
                    </span>
                  </div>

                  {/* Connection action — bottom band */}
                  <div className="biz-card__action">
                    {isFriend ? (
                      <span className="biz-card__state biz-card__state--friend">
                        <svg width="10" height="10" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="4 11 9 16 18 6" />
                        </svg>
                        Connected
                      </span>
                    ) : sentByMe ? (
                      <span className="biz-card__state biz-card__state--pending">Request sent</span>
                    ) : sentToMe ? (
                      <span className="biz-card__state biz-card__state--respond">Respond →</span>
                    ) : meId ? (
                      <button
                        type="button"
                        className="biz-card__connect"
                        onClick={e => { e.preventDefault(); e.stopPropagation(); sendFriendRequest(member.id) }}
                        disabled={connectBusy === member.id}
                        aria-label={`Connect with ${member.name}`}
                      >
                        {connectBusy === member.id ? 'Sending…' : '+ Connect'}
                      </button>
                    ) : null}
                    <span className="biz-card__chev" aria-hidden>→</span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
