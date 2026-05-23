'use client'
import Link from 'next/link'
import { Icons } from '@/lib/icons'

const ITEMS = [
  { href: '/', label: 'Feed', icon: Icons.feed, exact: true },
  { href: '/seats', label: 'Seats', icon: Icons.seat },
  { href: '/bookings', label: 'Trips', icon: Icons.paper },
  { href: '/contact', label: 'Contact', icon: Icons.phone },
  { href: '/membership', label: 'Account', icon: Icons.member },
]

export default function MobileNav({ pathname }: { pathname: string }) {
  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname.startsWith(href))
  return (
    <nav className="mobile-nav">
      {ITEMS.map(it => (
        <Link key={it.href} href={it.href} className={`m-item${isActive(it.href, it.exact) ? ' active' : ''}`}>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{it.icon}</span>
          <span>{it.label}</span>
        </Link>
      ))}
    </nav>
  )
}
