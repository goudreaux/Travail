'use client'
import Link from 'next/link'
import { Icons } from '@/lib/icons'
import type { Member } from '@/lib/supabase/types'

interface Props {
  pathname: string
  member: Member | null
  pendingCount?: number
}

const TIER_COLOR: Record<string, string> = {
  explorer: 'var(--tropic)',
  anchor: 'var(--sun)',
  founder: '#c9a84c',
}

export default function Sidebar({ pathname, member, pendingCount = 0 }: Props) {
  const nav = [
    { href: '/',                   label: 'Feed',                icon: Icons.feed },
    { href: '/calendar',           label: 'Calendar',            icon: Icons.cal },
    { href: '/seats',              label: 'Open seats',          icon: Icons.seat,   badge: '5 LIVE', badgeColor: 'var(--tropic)' },
    { href: '/bookings',           label: 'Bookings',            icon: Icons.member, badge: pendingCount > 0 ? `${pendingCount} PENDING` : undefined, badgeColor: 'var(--signal)' },
    { href: '/anchor-flight',      label: 'Anchor a flight',     icon: Icons.build },
    { href: '/anchor-excursion',   label: 'Anchor an excursion', icon: Icons.compass },
    { href: '/inbox',              label: 'Inbox',               icon: Icons.inbox,  badge: '3', badgeColor: 'var(--signal)' },
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
      {/* Brand */}
      <div className="brand">
        <div className="brand-name">Travail</div>
        <div className="brand-tag">× Tropic Air</div>
      </div>

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

      {/* Member identity footer */}
      {member ? (
        <Link href="/membership" className="side-footer" style={{ display: 'block', textDecoration: 'none' }}>
          <div className="side-member">
            <div className="side-av" style={{ background: TIER_COLOR[member.tier] ?? 'var(--tropic-d)' }}>
              {member.initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="side-member-name" style={{
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {member.name}
              </div>
              <div className="side-member-tier" style={{ color: TIER_COLOR[member.tier] ?? 'var(--tropic)' }}>
                {member.tier.toUpperCase()} · {member.id.slice(0, 8).toUpperCase()}
              </div>
            </div>
            {/* Subtle chevron hint */}
            <svg width="12" height="12" viewBox="0 0 22 22" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.8" strokeLinecap="round">
              <path d="M8 5l6 6-6 6" />
            </svg>
          </div>
        </Link>
      ) : (
        /* Loading skeleton */
        <div className="side-footer">
          <div className="side-member" style={{ opacity: 0.35 }}>
            <div className="side-av" style={{ background: 'rgba(255,255,255,0.12)' }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ height: 10, width: 100, background: 'rgba(255,255,255,0.12)', borderRadius: 4 }} />
              <div style={{ height: 8, width: 66, background: 'rgba(255,255,255,0.08)', borderRadius: 4 }} />
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
