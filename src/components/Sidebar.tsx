'use client'
import Link from 'next/link'
import { Icons } from '@/lib/icons'
import { memberCode, tierLabel } from '@/lib/data'
import type { Member } from '@/lib/supabase/types'

interface Props {
  pathname: string
  member: Member | null
  pendingCount?: number
  openSeatsCount?: number
  unreadCount?: number
}

const TIER_COLOR: Record<string, string> = {
  founder: '#c9a84c',
  founding_member: 'var(--tropic)',
  administrator: 'var(--sun)',
}

export default function Sidebar({ pathname, member, pendingCount = 0, openSeatsCount = 0, unreadCount = 0 }: Props) {
  const nav = [
    { href: '/',                   label: 'Feed',                icon: Icons.feed },
    { href: '/notifications',      label: 'Notifications',       icon: Icons.bell,   badge: unreadCount > 0 ? String(unreadCount) : undefined },
    { href: '/calendar',           label: 'Calendar',            icon: Icons.cal },
    { href: '/seats',              label: 'Open Seats',          icon: Icons.plane,   badge: openSeatsCount > 0 ? `${openSeatsCount} LIVE` : undefined, badgeColor: 'var(--tropic)' },
    { href: '/bookings',           label: 'My Trips',            icon: Icons.luggage, badge: pendingCount > 0 ? `${pendingCount} PENDING` : undefined, badgeColor: 'var(--signal)' },
    { href: '/plan',               label: 'Plan a trip',         icon: Icons.build },
    { href: '/contact',            label: 'Contact us',          icon: Icons.phone },
  ]

  const account = [
    { href: '/network',    label: 'Network',    icon: Icons.network },
    { href: '/membership', label: 'Membership', icon: Icons.member },
  ]

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  return (
    <aside className="side">
      {/* Member identity occupies the brand slot — tap to open membership. */}
      {member ? (
        <Link href="/membership" className="side-brand-member" aria-label="Open membership">
          <div className="side-brand-member__av" style={{ background: TIER_COLOR[member.tier] ?? 'var(--tropic-d)' }}>
            {member.initials}
          </div>
          <div className="side-brand-member__body">
            <div className="side-brand-member__name">{member.name}</div>
            <div className="side-brand-member__tier" style={{ color: TIER_COLOR[member.tier] ?? 'var(--tropic)' }}>
              {tierLabel(member.tier).toUpperCase()}{member.tier === 'administrator' ? '' : ` · ${memberCode(member)}`}
            </div>
          </div>
        </Link>
      ) : (
        <div className="side-brand-member" aria-hidden>
          <div className="side-brand-member__av" style={{ background: 'rgba(255,255,255,0.10)' }} />
          <div className="side-brand-member__body">
            <div style={{ height: 11, width: 110, background: 'rgba(255,255,255,0.10)', borderRadius: 4 }} />
            <div style={{ height: 8, width: 70, background: 'rgba(255,255,255,0.07)', borderRadius: 4, marginTop: 6 }} />
          </div>
        </div>
      )}

      {/* Primary navigation */}
      <div className="nav">
        {nav.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`item${isActive(item.href) ? ' active' : ''}`}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.badge && (
              <span className="badge" style={item.badgeColor ? { background: item.badgeColor } : undefined}>
                {item.badge}
              </span>
            )}
          </Link>
        ))}

        {/* Section divider */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          margin: '10px 0 4px',
          padding: '0 12px',
        }}>
          <span style={{
            fontFamily: 'var(--mono)',
            fontSize: 9,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.22)',
          }}>
            Account
          </span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
        </div>

        {account.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`item${isActive(item.href) ? ' active' : ''}`}
          >
            {item.icon}
            <span>{item.label}</span>
          </Link>
        ))}
      </div>

      {/* Admin-only: switch into the ops dashboard. Hidden for regular members. */}
      {member?.is_admin && (
        <Link
          href="/admin"
          aria-label="Switch to admin dashboard"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            margin: '4px 8px 8px',
            padding: '11px 12px',
            borderRadius: 10,
            background: 'var(--sun-glow)',
            border: '1px solid rgba(244,167,44,0.35)',
            color: 'var(--sun)',
            fontFamily: 'var(--ui)',
            fontSize: 13.5,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M11 2.5l7 2.5v5c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9v-5z" />
            <path d="M8 11l2 2 4-4.5" />
          </svg>
          <span style={{ flex: 1 }}>Admin Dashboard</span>
          <svg width="12" height="12" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.7 }}>
            <path d="M8 5l6 6-6 6" />
          </svg>
        </Link>
      )}

    </aside>
  )
}
