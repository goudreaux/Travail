'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import ToastHost from '@/components/ToastHost'
import type { Member, Notification } from '@/lib/supabase/types'

export default function MemberLayout({ children }: { children: React.ReactNode }) {
  const [member, setMember] = useState<Member | null>(null)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const supabase = createClient()
  const pathname = usePathname()
  const router = useRouter()

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { data: memberData } = await db
      .from('members')
      .select('*')
      .eq('user_id', user.id)
      .single() as { data: Member | null }

    if (!memberData) {
      router.push('/login')
      return
    }

    setMember(memberData)

    // Load notifications and pending bookings in parallel
    const [{ data: notifs }, { data: bookings }] = await Promise.all([
      db
        .from('notifications')
        .select('*')
        .eq('member_id', memberData.id)
        .order('created_at', { ascending: false })
        .limit(40),
      db
        .from('bookings')
        .select('id')
        .eq('member_id', memberData.id)
        .eq('status', 'pending'),
    ])

    if (notifs) setNotifications(notifs)
    if (bookings) setPendingCount(bookings.length)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadData()
  }, [loadData])

  return (
    <div className="app">
      <Sidebar pathname={pathname} member={member} pendingCount={pendingCount} />
      <main className="main">
        <TopBar
          member={member}
          notifications={notifications}
          onNewTrip={() => router.push('/anchor-flight')}
          onOpenBookings={() => router.push('/bookings')}
        />
        {children}
      </main>
      <ToastHost />
    </div>
  )
}
