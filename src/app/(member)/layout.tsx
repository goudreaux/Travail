'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { returnLegIds } from '@/lib/data'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import MobileNav from '@/components/MobileNav'
import PullToRefresh from '@/components/PullToRefresh'
import ToastHost from '@/components/ToastHost'
import AddToHomeScreen from '@/components/AddToHomeScreen'
import SubscriptionBanner from '@/components/SubscriptionBanner'
import { MaintenanceBanner } from '@/components/MaintenanceBanner'
import { FirstLoginTutorial } from '@/components/FirstLoginTutorial'
import { useActivityBeacon, useLoginStamp } from '@/lib/use-activity-beacon'
import { useActionItems } from '@/lib/use-action-items'
import { MemberProvider, useMember } from '@/lib/member-context'
import type { Member, Notification } from '@/lib/supabase/types'

export default function MemberLayout({ children }: { children: React.ReactNode }) {
  // Resolve the member once and share it with every page via context so they
  // stop repeating the getUser → members round-trips on each navigation.
  return (
    <MemberProvider>
      <MemberShell>{children}</MemberShell>
    </MemberProvider>
  )
}

function MemberShell({ children }: { children: React.ReactNode }) {
  const { member, setMember, notSetUp } = useMember()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)
  const [openSeatsCount, setOpenSeatsCount] = useState(0)
  const supabase = createClient()
  const pathname = usePathname()
  const router = useRouter()

  // Stamp login + emit activity beacons while the tab is open.
  // Both routes are best-effort — failures are swallowed so they
  // never affect the member's experience.
  useActivityBeacon()
  useLoginStamp(supabase)

  // Action items needing the member's attention — quotes to accept,
  // decided bookings, proposal state changes. Badged on My Trips +
  // Proposals in the nav.
  const actionItems = useActionItems(member?.id ?? null)

  // Sidebar/TopBar chrome counts. Keyed on the resolved member id so it runs
  // once the shared context has the row — no second identity lookup here.
  useEffect(() => {
    const memberId = member?.id
    if (!memberId) return
    let cancelled = false
    ;(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any
      const today = new Date().toISOString().slice(0, 10)
      const [{ data: notifs }, { data: bookings }, { data: openFlights }, { data: openExcursions }] = await Promise.all([
        db.from('notifications').select('*').eq('member_id', memberId).order('created_at', { ascending: false }).limit(40),
        db.from('bookings').select('id').eq('member_id', memberId).eq('status', 'pending'),
        db.from('flights').select('id, origin_code, dest_code').eq('status', 'open').gte('date', today),
        db.from('excursions').select('id').eq('status', 'open').gte('date', today),
      ])
      if (cancelled) return
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
    })()
    return () => { cancelled = true }
  }, [member?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (notSetUp) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--bg)' }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 18, padding: '40px 44px', maxWidth: 440, width: '100%', textAlign: 'center', boxShadow: '0 8px 40px rgba(13,51,64,0.08)' }}>
          <h2 className="display-i" style={{ fontSize: 26, color: 'var(--ink)', margin: '0 0 10px' }}>Almost there.</h2>
          <p style={{ fontSize: 14, color: 'var(--ink-light)', lineHeight: 1.6, margin: '0 0 22px' }}>
            Your login isn&rsquo;t linked to a member profile yet. Text or email your Travail concierge with the address you signed in with and we&rsquo;ll finish your setup.
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
      <Sidebar pathname={pathname} member={member} pendingCount={pendingCount} openSeatsCount={openSeatsCount} unreadCount={unreadCount} tripsAlertCount={actionItems.tripsCount} proposalsAlertCount={actionItems.proposalsCount} />
      <main className="main">
        <MaintenanceBanner />
        <SubscriptionBanner status={member?.subscription_status} />
        <TopBar
          member={member}
          notifications={notifications}
          onOpenBookings={() => router.push('/bookings')}
        />
        {children}
      </main>
      <MobileNav pathname={pathname} isAdmin={!!member?.is_admin} openSeatsCount={openSeatsCount} tripsAlertCount={actionItems.tripsCount} proposalsAlertCount={actionItems.proposalsCount} />
      <PullToRefresh />
      <ToastHost />
      <AddToHomeScreen />
      {/* One-shot welcome tutorial on first sign-in. Persistence is
          server-side via members.tutorial_completed_at (migration 054)
          so switching devices doesn't re-trigger it. */}
      {member && !(member as Member & { tutorial_completed_at?: string | null }).tutorial_completed_at && (
        <FirstLoginTutorial
          memberId={member.id}
          onDone={() => setMember(m => m ? ({ ...m, tutorial_completed_at: new Date().toISOString() } as Member) : m)}
        />
      )}
    </div>
  )
}
