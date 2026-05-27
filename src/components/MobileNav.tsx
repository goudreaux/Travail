'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icons } from '@/lib/icons'
import { createClient } from '@/lib/supabase/client'

// Bottom bar slot: 4 visible items max. "More" opens a bottom sheet
// with the secondary destinations so the bar stays uncluttered.
const MEMBER_PRIMARY = [
  { href: '/', label: 'Feed', icon: Icons.feed, exact: true },
  { href: '/seats', label: 'Seats', icon: Icons.compass, badgeKey: 'seats' as const },
  { href: '/bookings', label: 'My Trips', icon: Icons.luggage },
] as const

const MEMBER_SECONDARY = [
  { href: '/calendar', label: 'Calendar', icon: Icons.cal },
  { href: '/notifications', label: 'Notifications', icon: Icons.bell },
  { href: '/network', label: 'Network', icon: Icons.network },
  { href: '/plan', label: 'Plan a Trip', icon: Icons.plane },
  { href: '/contact', label: 'Contact us', icon: Icons.phone },
  { href: '/membership', label: 'Account', icon: Icons.member },
] as const

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

const MoreIcon = (
  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
    <circle cx="5" cy="11" r="1.5" fill="currentColor" />
    <circle cx="11" cy="11" r="1.5" fill="currentColor" />
    <circle cx="17" cy="11" r="1.5" fill="currentColor" />
  </svg>
)

export default function MobileNav({
  pathname,
  isAdmin = false,
  openSeatsCount = 0,
}: {
  pathname: string
  isAdmin?: boolean
  openSeatsCount?: number
}) {
  const adminMode = pathname === '/admin' || pathname.startsWith('/admin/')
  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname.startsWith(href))
  const [moreOpen, setMoreOpen] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Close the sheet on route change.
  useEffect(() => { setMoreOpen(false) }, [pathname])

  // Esc closes the sheet.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMoreOpen(false)
    }
    if (moreOpen) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [moreOpen])

  // Lock body scroll while the sheet is open.
  useEffect(() => {
    if (!moreOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [moreOpen])

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // Admin dashboard: still uses the simpler 5-slot layout — no "More".
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

  // Member app — 3 primary slots + More.
  const anySecondaryActive = MEMBER_SECONDARY.some(s => isActive(s.href))

  return (
    <>
      <nav className="mobile-nav">
        {MEMBER_PRIMARY.map(item => {
          const it = item as { href: string; label: string; icon: React.ReactNode; exact?: boolean; badgeKey?: 'seats' }
          const active = isActive(it.href, it.exact)
          const showDot = it.badgeKey === 'seats' && openSeatsCount > 0
          return (
            <Link key={it.href} href={it.href} className={`m-item${active ? ' active' : ''}`}>
              <span className="m-item__icon">
                {iconWrap(it.icon)}
                {showDot && <span className="m-item__alert" aria-hidden />}
              </span>
              <span>{it.label}</span>
            </Link>
          )
        })}

        <button
          type="button"
          className={`m-item${anySecondaryActive || moreOpen ? ' active' : ''}`}
          onClick={() => setMoreOpen(v => !v)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          aria-label="More options"
        >
          {iconWrap(MoreIcon)}
          <span>More</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="m-more" role="dialog" aria-modal="true">
          <div className="m-more__scrim" onClick={() => setMoreOpen(false)} aria-hidden />
          <div className="m-more__sheet">
            <div className="m-more__handle" aria-hidden />
            <div className="m-more__title">More</div>
            <ul className="m-more__list">
              {MEMBER_SECONDARY.map(it => (
                <li key={it.href}>
                  <Link href={it.href} className={`m-more__row${isActive(it.href) ? ' active' : ''}`}>
                    <span className="m-more__icon">{iconWrap(it.icon)}</span>
                    <span>{it.label}</span>
                    <span className="m-more__chev" aria-hidden>›</span>
                  </Link>
                </li>
              ))}
              {isAdmin && (
                <li>
                  <Link href="/admin" className="m-more__row m-more__row--admin">
                    <span className="m-more__icon">{iconWrap(Icons.build)}</span>
                    <span>Admin Dashboard</span>
                    <span className="m-more__chev" aria-hidden>›</span>
                  </Link>
                </li>
              )}
              <li>
                <button type="button" className="m-more__row m-more__row--signout" onClick={signOut}>
                  <span className="m-more__icon">
                    <svg width="18" height="18" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 3H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" />
                      <path d="M14 16l5-5-5-5" />
                      <path d="M19 11H8" />
                    </svg>
                  </span>
                  <span>Sign out</span>
                </button>
              </li>
            </ul>
            {/* Quiet utility footer — discoverable but never loud. */}
            <a
              href="/travail-company-policy.md"
              download="travail-company-policy.md"
              className="m-more__policy"
            >
              Company policy
            </a>
          </div>
        </div>
      )}
    </>
  )
}
