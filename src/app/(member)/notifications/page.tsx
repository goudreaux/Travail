'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import PageHero from '@/components/PageHero'
import { resolveNotificationRoute } from '@/lib/notifications'
import { useMember } from '@/lib/member-context'
import type { Notification } from '@/lib/supabase/types'

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function NotificationsPage() {
  const router = useRouter()
  const supabase = createClient()
  const { member } = useMember()
  const [notifs, setNotifs] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const memberId = member?.id
    if (!memberId) return
    async function load() {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('member_id', memberId as string)
        .order('created_at', { ascending: false })
        .limit(100)
      setNotifs((data ?? []) as Notification[])
      setLoading(false)
    }
    load()
  }, [member?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const unread = notifs.filter(n => !n.read).length

  async function markAllRead() {
    const ids = notifs.filter(n => !n.read).map(n => n.id)
    if (!ids.length) return
    setNotifs(prev => prev.map(n => ({ ...n, read: true })))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('notifications') as any).update({ read: true }).in('id', ids)
  }

  async function openNotif(n: Notification) {
    const route = resolveNotificationRoute(n)
    if (!n.read) {
      setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('notifications') as any).update({ read: true }).eq('id', n.id)
    }
    if (route) router.push(route)
  }

  return (
    <div className="page">
      <PageHero
        accent="signal"
        eyebrow="THE NETWORK"
        title="Notifications"
        sub={loading ? 'Loading…' : unread > 0 ? `${unread} unread` : 'You’re all caught up.'}
        metric={loading || unread === 0 ? undefined : { value: unread, label: 'unread' }}
        actions={unread > 0 ? (
          <button className="page-hero__btn" onClick={markAllRead}>Mark all read</button>
        ) : undefined}
      />

      <div className="page-view">
        {loading ? (
          <div className="empty"><div className="pending-indicator" /><p>Loading notifications…</p></div>
        ) : notifs.length === 0 ? (
          <div className="empty">
            <svg width="40" height="40" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M5 15h12M6 15v-5a5 5 0 0 1 10 0v5M9.5 17.5a1.5 1.5 0 0 0 3 0" /></svg>
            <h3>No notifications yet</h3>
            <p>Booking confirmations, anchor updates, and ops messages will show up here.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 720 }}>
            {notifs.map(n => {
              const route = resolveNotificationRoute(n)
              const interactive = route !== null
              // Mark unread announcements as read on first view of the
              // page (mouse not required). We don't auto-route, we just
              // clear the unread badge so the count is honest.
              const onClick = interactive ? () => openNotif(n) : undefined
              return (
                <div
                  key={n.id}
                  role={interactive ? 'button' : undefined}
                  tabIndex={interactive ? 0 : undefined}
                  onClick={onClick}
                  onKeyDown={interactive ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openNotif(n) } } : undefined}
                  style={{
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    background: n.read ? 'var(--card)' : 'var(--tropic-glow)',
                    border: '1px solid var(--hair)',
                    borderRadius: 12,
                    padding: '14px 16px',
                    cursor: interactive ? 'pointer' : 'default',
                    width: '100%',
                    opacity: interactive ? 1 : 0.92,
                    transition: 'background 0.12s ease',
                  }}
                  onMouseEnter={interactive ? e => { (e.currentTarget as HTMLElement).style.background = n.read ? 'var(--paper)' : 'rgba(0,179,199,0.18)' } : undefined}
                  onMouseLeave={interactive ? e => { (e.currentTarget as HTMLElement).style.background = n.read ? 'var(--card)' : 'var(--tropic-glow)' } : undefined}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 6, flexShrink: 0, background: n.read ? 'transparent' : 'var(--signal)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 3, alignItems: 'baseline' }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{n.title}</span>
                      <span className="mono" style={{ fontSize: 10, color: 'var(--ink-light)', whiteSpace: 'nowrap' }}>{timeAgo(n.created_at)}</span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.5 }}>{n.body}</div>
                    {!interactive && (
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', fontWeight: 600, marginTop: 8 }}>
                        Announcement · no action needed
                      </div>
                    )}
                  </div>
                  {interactive && (
                    <span style={{ color: 'var(--ink-light)', fontSize: 16, alignSelf: 'center', marginLeft: 4 }} aria-hidden>›</span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
