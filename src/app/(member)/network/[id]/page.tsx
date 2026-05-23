'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { fmtHomeBase, memberCode } from '@/lib/data'
import type { Member, Booking, Post } from '@/lib/supabase/types'

function Avatar({ member, size = 80 }: { member: Member; size?: number }) {
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
          border: '3px solid var(--card)',
          boxShadow: '0 2px 16px rgba(13,51,64,0.18)',
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
      fontSize: size * 0.28,
      fontWeight: 600,
      letterSpacing: '0.06em',
      flexShrink: 0,
      border: '3px solid var(--card)',
      boxShadow: '0 2px 16px rgba(13,51,64,0.18)',
    }}>
      {member.initials}
    </div>
  )
}

function TierBadge() {
  return <span className="pill sun">Founder</span>
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function timeAgo(dateStr: string) {
  const ms = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(ms / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

interface BookingWithItem extends Booking {
  itemName?: string
  itemOrigin?: string
  itemDest?: string
}

export default function MemberProfilePage() {
  const params = useParams()
  const memberId = params.id as string

  const [member, setMember] = useState<Member | null>(null)
  const [bookings, setBookings] = useState<BookingWithItem[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!memberId) return
    async function load() {
      const supabase = createClient()

      const [{ data: memberData }, { data: bookingData }, { data: postData }] = await Promise.all([
        supabase.from('members').select('*').eq('id', memberId).single(),
        supabase
          .from('bookings')
          .select('*')
          .eq('member_id', memberId)
          .in('status', ['approved', 'pending'])
          .order('submitted_at', { ascending: false }),
        supabase
          .from('posts')
          .select('*')
          .eq('author_id', memberId)
          .order('created_at', { ascending: false })
          .limit(5),
      ])

      if (!memberData) { setLoading(false); return }
      setMember(memberData)
      setPosts(postData || [])

      if (!bookingData || bookingData.length === 0) {
        setBookings([])
        setLoading(false)
        return
      }

      // Enrich bookings with item names
      const flightIds = bookingData.filter(b => b.item_kind === 'flight').map(b => b.item_id)
      const excursionIds = bookingData.filter(b => b.item_kind === 'excursion').map(b => b.item_id)

      const [{ data: flights }, { data: excursions }] = await Promise.all([
        flightIds.length > 0
          ? supabase.from('flights').select('id,name,origin_code,dest_code').in('id', flightIds)
          : { data: [] },
        excursionIds.length > 0
          ? supabase.from('excursions').select('id,name,origin_code').in('id', excursionIds)
          : { data: [] },
      ])

      const flightMap: Record<string, { name: string; origin_code: string; dest_code: string }> = {}
      for (const f of (flights || [])) flightMap[f.id] = f

      const excursionMap: Record<string, { name: string; origin_code: string }> = {}
      for (const e of (excursions || [])) excursionMap[e.id] = e

      const enriched: BookingWithItem[] = bookingData.map(b => {
        if (b.item_kind === 'flight' && flightMap[b.item_id]) {
          const f = flightMap[b.item_id]
          return { ...b, itemName: f.name, itemOrigin: f.origin_code, itemDest: f.dest_code }
        }
        if (b.item_kind === 'excursion' && excursionMap[b.item_id]) {
          const e = excursionMap[b.item_id]
          return { ...b, itemName: e.name, itemOrigin: e.origin_code }
        }
        return b
      })

      setBookings(enriched)
      setLoading(false)
    }
    load()
  }, [memberId])

  if (loading) {
    return (
      <div className="page">
        <div className="page-view" style={{ paddingTop: 40, display: 'flex', justifyContent: 'center' }}>
          <div style={{ color: 'var(--ink-faint)', fontSize: 13 }}>Loading profile...</div>
        </div>
      </div>
    )
  }

  if (!member) {
    return (
      <div className="page">
        <div className="page-view">
          <div className="empty">
            <h3>Member not found.</h3>
            <p>This member doesn't exist or has been removed.</p>
            <Link href="/network" className="btn-ghost" style={{ marginTop: 8 }}>Back to Network</Link>
          </div>
        </div>
      </div>
    )
  }

  const approvedTrips = bookings.filter(b => b.status === 'approved')

  return (
    <div className="page">
      <div className="page-view" style={{ maxWidth: 860 }}>
        {/* Back link */}
        <Link
          href="/network"
          className="mono"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 24,
            fontSize: 10.5,
            color: 'var(--ink-mid)',
            transition: 'color 0.12s',
          }}
        >
          ← Network
        </Link>

        {/* Profile hero */}
        <div className="panel" style={{ marginBottom: 20, overflow: 'visible' }}>
          {/* Dark hero banner */}
          <div style={{
            background: 'var(--night)',
            borderRadius: '11px 11px 0 0',
            height: 100,
            position: 'relative',
          }} />
          {/* Avatar + name */}
          <div style={{
            padding: '0 28px 24px',
            marginTop: -40,
            position: 'relative',
          }}>
            <Avatar member={member} size={80} />
            <div style={{ marginTop: 14, marginBottom: 16 }}>
              <div className="display-i" style={{
                fontSize: 32,
                color: 'var(--ink)',
                lineHeight: 1.1,
                marginBottom: 6,
              }}>
                {member.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <TierBadge />
                <span className="mono" style={{ fontSize: 9.5 }}>
                  {memberCode(member)}
                </span>
                {member.home_base_code && (
                  <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-mid)' }}>
                    · {fmtHomeBase(member.home_base_code)}
                  </span>
                )}
              </div>
            </div>

            {/* Meta row */}
            <div style={{
              display: 'flex',
              gap: 24,
              flexWrap: 'wrap',
            }}>
              <div>
                <div className="mono" style={{ marginBottom: 2, fontSize: 9.5 }}>Joined</div>
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 500 }}>
                  {formatDate(member.joined_at)}
                </div>
              </div>
              <div>
                <div className="mono" style={{ marginBottom: 2, fontSize: 9.5 }}>Trips</div>
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 500 }}>
                  {approvedTrips.length}
                </div>
              </div>
              {fmtHomeBase(member.home_base_code) && (
                <div>
                  <div className="mono" style={{ marginBottom: 2, fontSize: 9.5 }}>Home base</div>
                  <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 500 }}>
                    {fmtHomeBase(member.home_base_code)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="two-col" style={{ gridTemplateColumns: '1fr 320px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Bio */}
            {member.bio && (
              <div className="panel">
                <div className="panel-head">
                  <h3>About</h3>
                </div>
                <div style={{ padding: '16px 20px' }}>
                  <p style={{
                    fontSize: 14,
                    lineHeight: 1.65,
                    color: 'var(--ink-soft)',
                    margin: 0,
                  }}>
                    {member.bio}
                  </p>
                </div>
              </div>
            )}

            {/* Interests */}
            {member.interests && member.interests.length > 0 && (
              <div className="panel">
                <div className="panel-head">
                  <h3>Interests</h3>
                </div>
                <div style={{ padding: '16px 20px' }}>
                  <div className="chips">
                    {member.interests.map(interest => (
                      <span key={interest} className="chip active" style={{ cursor: 'default' }}>
                        {interest}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Trip history */}
            <div className="panel">
              <div className="panel-head">
                <h3>Trip history</h3>
                <span className="mono" style={{ fontSize: 9.5 }}>
                  {approvedTrips.length} trip{approvedTrips.length !== 1 ? 's' : ''} taken
                </span>
              </div>
              {approvedTrips.length === 0 ? (
                <div style={{ padding: '28px 20px', textAlign: 'center' }}>
                  <p style={{ fontSize: 13, color: 'var(--ink-faint)', margin: 0 }}>
                    No confirmed trips yet.
                  </p>
                </div>
              ) : (
                <div>
                  {approvedTrips.map((b, i) => (
                    <div
                      key={b.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 16,
                        padding: '12px 20px',
                        borderBottom: i < approvedTrips.length - 1 ? '1px solid var(--hair)' : 'none',
                      }}
                    >
                      <div style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        background: 'var(--night)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        <svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="var(--tropic)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 13l7-1 3-7h2l-1 7 5-1 1 1.5-5 3-1 4-2 .5-1-3.5-3 0-1 .5z" />
                        </svg>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13.5,
                          fontWeight: 500,
                          color: 'var(--ink)',
                          marginBottom: 2,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}>
                          {b.itemName || `${b.item_kind} booking`}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--ink-light)' }}>
                          {b.itemOrigin && b.itemDest
                            ? `${b.itemOrigin} → ${b.itemDest}`
                            : b.itemOrigin || ''}
                        </div>
                      </div>
                      <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-faint)', flexShrink: 0 }}>
                        {formatDate(b.submitted_at)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right rail — recent posts */}
          <div className="rail">
            <div className="panel">
              <div className="panel-head">
                <h3>Recent posts</h3>
              </div>
              {posts.length === 0 ? (
                <div style={{ padding: '24px 20px', textAlign: 'center' }}>
                  <p style={{ fontSize: 12.5, color: 'var(--ink-faint)', margin: 0 }}>
                    No posts yet.
                  </p>
                </div>
              ) : (
                <div>
                  {posts.map((post, i) => (
                    <div
                      key={post.id}
                      style={{
                        padding: '14px 18px',
                        borderBottom: i < posts.length - 1 ? '1px solid var(--hair)' : 'none',
                      }}
                    >
                      {post.quote && (
                        <div style={{
                          background: 'var(--warm)',
                          borderLeft: '3px solid var(--tropic)',
                          borderRadius: '0 6px 6px 0',
                          padding: '8px 12px',
                          marginBottom: 8,
                          fontSize: 12.5,
                          color: 'var(--ink-mid)',
                          fontStyle: 'italic',
                          fontFamily: 'var(--display)',
                        }}>
                          {post.quote}
                        </div>
                      )}
                      <p style={{
                        fontSize: 13,
                        color: 'var(--ink-soft)',
                        lineHeight: 1.55,
                        margin: '0 0 8px',
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical' as const,
                        overflow: 'hidden',
                      }}>
                        {post.body}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span className="pill" style={{ textTransform: 'capitalize' }}>
                          {post.kind.replace('_', ' ')}
                        </span>
                        <span className="mono" style={{ fontSize: 9.5 }}>
                          {timeAgo(post.created_at)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
