'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import PageHero from '@/components/PageHero'
import type { Member, Notification } from '@/lib/supabase/types'

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
  const [member, setMember] = useState<Member | null>(null)
  const [notifs, setNotifs] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: m } = await supabase.from('members').select('*').eq('user_id', user.id).single()
      if (!m) { router.push('/login'); return }
      setMember(m as Member)
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('member_id', (m as Member).id)
        .order('created_at', { ascending: false })
        .limit(100)
      setNotifs((data ?? []) as Notification[])
      setLoading(false)
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const unread = notifs.filter(n => !n.read).length

  async function markAllRead() {
    const ids = notifs.filter(n => !n.read).map(n => n.id)
    if (!ids.length) return
    setNotifs(prev => prev.map(n => ({ ...n, read: true })))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('notifications') as any).update({ read: true }).in('id', ids)
  }

  async function openNotif(n: Notification) {
    if (!n.read) {
      setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('notifications') as any).update({ read: true }).eq('id', n.id)
    }
    const ref = (n.ref ?? {}) as Record<string, unknown>
    const itemKind = ref.item_kind as string | undefined
    const itemId = ref.item_id as string | undefined
    if (itemKind && itemId) router.push(`/reserve/${itemId}?kind=${itemKind}`)
    else router.push('/bookings')
  }

  return (
    <div className="page">
      <PageHero
        eyebrow="THE NETWORK"
        title="Notifications."
        sub={loading ? 'Loading…' : unread > 0 ? `${unread} unread` : 'You’re all caught up.'}
        actions={unread > 0 ? (
          <button className="btn-ghost" onClick={markAllRead}>Mark all read</button>
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
            {notifs.map(n => (
              <button
                key={n.id}
                onClick={() => openNotif(n)}
                style={{
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  background: n.read ? 'var(--card)' : 'var(--tropic-glow)',
                  border: '1px solid var(--hair)',
                  borderRadius: 12,
                  padding: '14px 16px',
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 6, flexShrink: 0, background: n.read ? 'transparent' : 'var(--signal)' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 3 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{n.title}</span>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--ink-light)', whiteSpace: 'nowrap' }}>{timeAgo(n.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.5 }}>{n.body}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
