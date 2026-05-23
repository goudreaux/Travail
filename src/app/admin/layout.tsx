'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
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
    const [{ count: b }, { count: a }] = await Promise.all([
      supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('anchor_submissions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ])
    setPendingCount((b ?? 0) + (a ?? 0))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isAdmin) return
    fetchPending()

    const ch = supabase
      .channel('admin-pending-count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, fetchPending)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'anchor_submissions' }, fetchPending)
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [isAdmin, fetchPending]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!isAdmin) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'var(--ui)', color: 'var(--ink-mid)' }}>
      Loading…
    </div>
  )

  const nav = [
    { href: '/admin', label: 'Dashboard', exact: true },
    { href: '/admin/queue', label: 'Action Queue', badge: pendingCount > 0 ? pendingCount : undefined },
    { href: '/admin/inbox', label: 'Inbox' },
    { href: '/admin/members', label: 'Members' },
    { href: '/admin/guests', label: 'Guests' },
    { href: '/admin/trips', label: 'Trips & Excursions' },
    { href: '/admin/bookings', label: 'Bookings' },
    { href: '/admin/posts', label: 'Feed Posts' },
    { href: '/admin/anchors', label: 'Anchor Archive' },
  ]

  const isActive = (item: typeof nav[0]) => item.exact ? pathname === item.href : pathname.startsWith(item.href)

  return (
    <div className="admin-shell" style={{ display: 'grid', gridTemplateColumns: '220px 1fr', minHeight: '100vh', background: 'var(--bg)' }}>
      <aside className="admin-aside" style={{
        background: 'var(--night)', padding: '24px 16px',
        display: 'flex', flexDirection: 'column', gap: 4,
        position: 'sticky', top: 0, height: '100vh',
      }}>
        <div style={{ padding: '6px 8px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 12 }}>
          <div style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 22, color: '#fff' }}>Travail</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.18em', color: 'var(--tropic)', marginTop: 3 }}>OPS DASHBOARD</div>
        </div>
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
        <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <Link href="/" style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.4)', textDecoration: 'none', textTransform: 'uppercase' }}>
            ← Back to app
          </Link>
        </div>
      </aside>
      <main style={{ padding: 0 }}>
        {children}
      </main>
    </div>
  )
}
