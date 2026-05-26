'use client'
import Link from 'next/link'
import { Icons } from '@/lib/icons'

const MEMBER_ITEMS = [
  { href: '/', label: 'Feed', icon: Icons.feed, exact: true },
  { href: '/seats', label: 'Seats', icon: Icons.compass },
  { href: '/bookings', label: 'Trips', icon: Icons.paper },
  { href: '/contact', label: 'Contact', icon: Icons.phone },
  { href: '/membership', label: 'Account', icon: Icons.member },
]

const ADMIN_ITEMS = [
  { href: '/admin', label: 'Overview', icon: Icons.feed, exact: true },
  { href: '/admin/queue', label: 'Queue', icon: Icons.bell },
  { href: '/admin/trips', label: 'Trips', icon: Icons.compass },
  { href: '/admin/bookings', label: 'Bookings', icon: Icons.paper },
  { href: '/admin/members', label: 'People', icon: Icons.member },
]

function iconWrap(icon: React.ReactNode) {
  return <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
}

export default function MobileNav({ pathname, isAdmin = false }: { pathname: string; isAdmin?: boolean }) {
  const adminMode = pathname === '/admin' || pathname.startsWith('/admin/')
  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname.startsWith(href))

  // In the ops dashboard, the bar becomes admin sections with a toggle back to
  // the member app.
  if (adminMode) {
    return (
      <nav className="mobile-nav">
        {ADMIN_ITEMS.map(it => (
          <Link key={it.href} href={it.href} className={`m-item${isActive(it.href, it.exact) ? ' active' : ''}`}>
            {iconWrap(it.icon)}
            <span>{it.label}</span>
          </Link>
        ))}
        <Link href="/" className="m-item m-toggle">
          {iconWrap(Icons.chevL)}
          <span>App</span>
        </Link>
      </nav>
    )
  }

  // Member app. Admins get a toggle into the ops dashboard.
  return (
    <nav className="mobile-nav">
      {MEMBER_ITEMS.map(it => (
        <Link key={it.href} href={it.href} className={`m-item${isActive(it.href, it.exact) ? ' active' : ''}`}>
          {iconWrap(it.icon)}
          <span>{it.label}</span>
        </Link>
      ))}
      {isAdmin && (
        <Link href="/admin" className="m-item m-toggle">
          {iconWrap(Icons.build)}
          <span>Ops</span>
        </Link>
      )}
    </nav>
  )
}
