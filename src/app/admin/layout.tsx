'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import Image from 'next/image'
import MobileNav from '@/components/MobileNav'
import PullToRefresh from '@/components/PullToRefresh'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [pendingProposalCount, setPendingProposalCount] = useState(0)
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: member } = await supabase.from('members').select('is_admin').eq('user_id', user.id).single()
      if (!member?.is_admin) { router.push('/'); return }
      setIsAdmin(true)
    }
    check()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchPending = useCallback(async () => {
    const [{ data: bks }, { count: a }, { count: pp }] = await Promise.all([
      supabase.from('bookings').select('id').eq('status', 'pending'),
      supabase.from('anchor_submissions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from('trip_proposals').select('id', { count: 'exact', head: true }).eq('status', 'pending_ops_review'),
    ])
    // A round trip is two leg bookings (B-X + B-XR) — count it once.
    const ids = new Set((bks ?? []).map(b => b.id))
    const bookingCount = (bks ?? []).filter(b => !(b.id.endsWith('R') && ids.has(b.id.slice(0, -1)))).length
    setPendingCount(bookingCount + (a ?? 0))
    setPendingProposalCount(pp ?? 0)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isAdmin) return
    fetchPending()

    const ch = supabase
      .channel('admin-pending-count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, fetchPending)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'anchor_submissions' }, fetchPending)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_proposals' }, fetchPending)
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [isAdmin, fetchPending]) // eslint-disable-line react-hooks/exhaustive-deps

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (!isAdmin) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'var(--ui)', color: 'var(--ink-mid)' }}>
      Loading…
    </div>
  )

  const nav = [
    { href: '/admin', label: 'Overview', exact: true },
    { href: '/admin/queue', label: 'Queue', badge: pendingCount > 0 ? pendingCount : undefined },
    { href: '/admin/proposals', label: 'Proposals', badge: pendingProposalCount > 0 ? pendingProposalCount : undefined },
    { href: '/admin/trips', label: 'Trips & Excursions' },
    { href: '/admin/map', label: 'Route Map' },
    { href: '/admin/bookings', label: 'Bookings' },
    { href: '/admin/members', label: 'People' },
    { href: '/admin/subscriptions', label: 'Subscriptions' },
    { href: '/admin/activity', label: 'Activity' },
    { href: '/admin/email-log', label: 'Email log' },
    { href: '/admin/posts', label: 'Feed' },
    { href: '/admin/developer', label: 'Developer' },
  ]

  const isActive = (item: typeof nav[0]) => item.exact ? pathname === item.href : pathname.startsWith(item.href)

  return (
    <div className="admin-shell">
      <aside className="admin-aside">
        {/* Wordmark over a tropic-tagged OPS label. Whole block links
            back to the member app so admins can return in one tap. The
            member-facing co-brand (Travail × Tropic) lives on the topbar
            — the Ops sidebar stays clean. */}
        <Link
          href="/"
          aria-label="Travail Concierge · back to the member app"
          className="admin-brand"
        >
          <Image
            src="/travail-wordmark.png"
            alt="Travail"
            width={140}
            height={32}
            priority
            className="admin-brand__wordmark"
          />
          <div className="admin-brand__tag">Concierge Dashboard</div>
        </Link>
        {nav.map(item => (
          <Link key={item.href} href={item.href} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 12px', borderRadius: 8,
            fontFamily: 'var(--ui)', fontSize: 13.5, fontWeight: 500,
            color: isActive(item) ? '#fff' : 'rgba(255,255,255,0.6)',
            background: isActive(item) ? 'rgba(255,255,255,0.08)' : 'transparent',
            textDecoration: 'none',
          }}>
            <span>{item.label}</span>
            {item.badge !== undefined && (
              <span style={{
                background: 'var(--signal)', color: '#fff', borderRadius: 10,
                padding: '1px 7px', fontSize: 10.5, fontWeight: 700, fontFamily: 'var(--mono)',
                lineHeight: 1.6,
              }}>
                {item.badge}
              </span>
            )}
          </Link>
        ))}
        <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Link href="/" style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.4)', textDecoration: 'none', textTransform: 'uppercase' }}>
            ← Back to app
          </Link>
          <button
            onClick={signOut}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
              padding: '8px 10px', cursor: 'pointer',
              fontFamily: 'var(--ui)', fontSize: 12.5, fontWeight: 500,
              color: 'rgba(255,255,255,0.7)',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M8 3H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" />
              <path d="M14 16l5-5-5-5" />
              <path d="M19 11H8" />
            </svg>
            Sign out
          </button>
        </div>
      </aside>
      {/* Compact mobile top bar — only renders below 768px via CSS. Lets
          ops see what page they're on + jump back to the member app. */}
      <header className="admin-mobile-top">
        <div className="admin-mobile-top__brand">
          <span className="admin-mobile-top__name">Travail</span>
          <span className="admin-mobile-top__tag">CONCIERGE</span>
        </div>
        <Link href="/" className="admin-mobile-top__back" aria-label="Back to member app">
          ← App
        </Link>
        <button onClick={signOut} className="admin-mobile-top__signout" aria-label="Sign out">
          <svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" />
            <path d="M14 16l5-5-5-5" />
            <path d="M19 11H8" />
          </svg>
        </button>
      </header>
      <main className="admin-main">
        {children}
      </main>
      <MobileNav pathname={pathname} isAdmin />
      <PullToRefresh />
    </div>
  )
}
