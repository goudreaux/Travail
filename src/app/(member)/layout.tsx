'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { returnLegIds } from '@/lib/data'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import MobileNav from '@/components/MobileNav'
import PullToRefresh from '@/components/PullToRefresh'
import ToastHost from '@/components/ToastHost'
import SubscriptionBanner from '@/components/SubscriptionBanner'
import { useActivityBeacon, useLoginStamp } from '@/lib/use-activity-beacon'
import type { Member, Notification } from '@/lib/supabase/types'

export default function MemberLayout({ children }: { children: React.ReactNode }) {
  const [member, setMember] = useState<Member | null>(null)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)
  const [openSeatsCount, setOpenSeatsCount] = useState(0)
  const [notSetUp, setNotSetUp] = useState(false)
  const supabase = createClient()
  const pathname = usePathname()
  const router = useRouter()

  // Stamp login + emit activity beacons while the tab is open.
  // Both routes are best-effort — failures are swallowed so they
  // never affect the member's experience.
  useActivityBeacon()
  useLoginStamp(supabase)

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    let { data: memberData } = await db
      .from('members')
      .select('*')
      .eq('user_id', user.id)
      .single() as { data: Member | null }

    // Self-heal: link a pre-created member that shares this login's email.
    if (!memberData) {
      try {
        const { data: linked } = await db.rpc('link_my_member')
        if (linked) {
          const retry = await db.from('members').select('*').eq('user_id', user.id).single()
          memberData = retry.data as Member | null
        }
      } catch { /* fall through to the not-set-up screen */ }
    }

    if (!memberData) {
      setNotSetUp(true)
      return
    }

    // Subscription wall — any non-admin without an active sub gets bounced
    // to /onboarding/subscribe. Single source of truth, covers fresh
    // invites, recovery links, returning members whose sub lapsed, etc.
    // The /membership page is exempt so cancelled members can hit the
    // "Start membership" button to resubscribe; /contact is exempt so
    // they can still reach ops.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const status = (memberData as any).subscription_status ?? null
    const OK_STATUSES = ['active', 'trialing', 'incomplete', 'past_due', 'unpaid']
    const exemptPaths = ['/membership', '/contact']
    const isExempt = exemptPaths.some(p => pathname === p || pathname.startsWith(p + '/'))
    const shouldBounce = !memberData.is_admin && !OK_STATUSES.includes(status) && !isExempt
    // Diagnostic — remove once we've confirmed the gate is firing in prod.
    console.log('[sub-gate]', {
      pathname,
      memberId: memberData.id,
      is_admin: memberData.is_admin,
      status,
      isExempt,
      shouldBounce,
    })
    if (shouldBounce) {
      router.push('/onboarding/subscribe')
      return
    }

    setMember(memberData)

    const today = new Date().toISOString().slice(0, 10)

    const [{ data: notifs }, { data: bookings }, { data: openFlights }, { data: openExcursions }] = await Promise.all([
      db.from('notifications').select('*').eq('member_id', memberData.id).order('created_at', { ascending: false }).limit(40),
      db.from('bookings').select('id').eq('member_id', memberData.id).eq('status', 'pending'),
      db.from('flights').select('id, origin_code, dest_code').eq('status', 'open').gte('date', today),
      db.from('excursions').select('id').eq('status', 'open').gte('date', today),
    ])

    if (notifs) {
      setNotifications(notifs)
      setUnreadCount(notifs.filter((n: Notification) => !n.read).length)
    }
    if (bookings) setPendingCount(bookings.length)
    // Round trips (outbound + return) count as one.
    const fl = openFlights ?? []
    const rets = returnLegIds(fl)
    const seats = (fl.length - rets.size) + (openExcursions?.length ?? 0)
    setOpenSeatsCount(seats)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadData()
  }, [loadData])

  if (notSetUp) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--bg)' }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 18, padding: '40px 44px', maxWidth: 440, width: '100%', textAlign: 'center', boxShadow: '0 8px 40px rgba(13,51,64,0.08)' }}>
          <h2 className="display-i" style={{ fontSize: 26, color: 'var(--ink)', margin: '0 0 10px' }}>Almost there.</h2>
          <p style={{ fontSize: 14, color: 'var(--ink-light)', lineHeight: 1.6, margin: '0 0 22px' }}>
            Your login isn&rsquo;t linked to a member profile yet. Text or email Ops with the address you signed in with and we&rsquo;ll finish your setup.
          </p>
          <button
            className="btn-ghost"
            style={{ width: '100%' }}
            onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <Sidebar pathname={pathname} member={member} pendingCount={pendingCount} openSeatsCount={openSeatsCount} unreadCount={unreadCount} />
      <main className="main">
        <SubscriptionBanner status={member?.subscription_status} />
        <TopBar
          member={member}
          notifications={notifications}
          onOpenBookings={() => router.push('/bookings')}
        />
        {children}
      </main>
      <MobileNav pathname={pathname} isAdmin={!!member?.is_admin} openSeatsCount={openSeatsCount} />
      <PullToRefresh />
      <ToastHost />
    </div>
  )
}
