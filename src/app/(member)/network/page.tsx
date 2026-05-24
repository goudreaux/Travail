'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { fmtHomeBase, memberCode, tierLabel, tierPill } from '@/lib/data'
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

  const filtered = members.filter(m =>
    search.trim() === '' ||
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    (m.home_base_code && m.home_base_code.toLowerCase().includes(search.toLowerCase())) ||
    (m.bio && m.bio.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="page">
      <PageHero
        eyebrow="The Network"
        title="Members."
        sub={loading ? 'Loading…' : `The ${members.length} founding members.`}
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
        {loading ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 16,
          }}>
            {[...Array(6)].map((_, i) => (
              <div key={i} className="panel" style={{ padding: 24, opacity: 0.4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                  <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--warm)' }} />
                  <div>
                    <div style={{ width: 120, height: 14, background: 'var(--warm)', borderRadius: 4, marginBottom: 6 }} />
                    <div style={{ width: 80, height: 10, background: 'var(--warm)', borderRadius: 4 }} />
                  </div>
                </div>
                <div style={{ width: '100%', height: 10, background: 'var(--warm)', borderRadius: 4, marginBottom: 6 }} />
                <div style={{ width: '80%', height: 10, background: 'var(--warm)', borderRadius: 4 }} />
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
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 16,
          }}>
            {filtered.map(member => (
              <Link
                key={member.id}
                href={`/network/${member.id}`}
                style={{ textDecoration: 'none', display: 'block' }}
              >
                <div
                  className="panel"
                  style={{
                    padding: 22,
                    cursor: 'pointer',
                    transition: 'border-color 0.15s, box-shadow 0.15s, transform 0.15s',
                  }}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLElement
                    el.style.borderColor = 'var(--tropic)'
                    el.style.boxShadow = '0 4px 20px rgba(0,179,199,0.08)'
                    el.style.transform = 'translateY(-2px)'
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLElement
                    el.style.borderColor = ''
                    el.style.boxShadow = ''
                    el.style.transform = ''
                  }}
                >
                  {/* Header row */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 14 }}>
                    <Avatar member={member} size={52} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="display-i" style={{
                        fontSize: 18,
                        lineHeight: 1.15,
                        color: 'var(--ink)',
                        marginBottom: 4,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>
                        {member.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <TierBadge tier={member.tier} />
                        <span className="mono" style={{ fontSize: 9.5 }}>
                          {memberCode(member)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Home base */}
                  {fmtHomeBase(member.home_base_code) && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      marginBottom: 10,
                    }}>
                      <svg width="12" height="12" viewBox="0 0 22 22" fill="none" stroke="var(--ink-light)" strokeWidth="1.7" strokeLinecap="round">
                        <path d="M11 3a6 6 0 0 1 6 6c0 4-6 10-6 10S5 13 5 9a6 6 0 0 1 6-6z" />
                        <circle cx="11" cy="9" r="2" />
                      </svg>
                      <span style={{ fontSize: 11, color: 'var(--ink-mid)' }}>
                        {fmtHomeBase(member.home_base_code)}
                      </span>
                    </div>
                  )}

                  {/* Bio */}
                  {member.bio ? (
                    <p style={{
                      fontSize: 12.5,
                      color: 'var(--ink-soft)',
                      lineHeight: 1.55,
                      margin: '0 0 12px',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical' as const,
                      overflow: 'hidden',
                    }}>
                      {member.bio}
                    </p>
                  ) : (
                    <p style={{
                      fontSize: 12.5,
                      color: 'var(--ink-faint)',
                      lineHeight: 1.55,
                      margin: '0 0 12px',
                      fontStyle: 'italic',
                    }}>
                      No bio yet.
                    </p>
                  )}

                  {/* Footer */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: 12,
                    borderTop: '1px solid var(--hair)',
                  }}>
                    <span style={{ fontSize: 12, color: 'var(--ink-light)' }}>
                      {(member as MemberWithCount).tripCount
                        ? `${(member as MemberWithCount).tripCount} trip${(member as MemberWithCount).tripCount === 1 ? '' : 's'}`
                        : 'No trips yet'}
                    </span>
                    <span style={{
                      fontSize: 11.5,
                      color: 'var(--tropic-d)',
                      fontWeight: 500,
                      letterSpacing: '0.02em',
                    }}>
                      View profile →
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
