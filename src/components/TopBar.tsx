'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Icons } from '@/lib/icons'
import { createClient } from '@/lib/supabase/client'
import type { Member, Notification } from '@/lib/supabase/types'

interface Props {
  member: Member | null
  notifications: Notification[]
  onOpenBookings: () => void
}

// Notification kind → icon + color palette
const KIND_META: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  booking: {
    icon: (
      <svg width="14" height="14" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <rect x="4" y="5" width="14" height="13" rx="1.5" />
        <line x1="4" y1="9" x2="18" y2="9" />
        <line x1="8" y1="3" x2="8" y2="6" />
        <line x1="14" y1="3" x2="14" y2="6" />
      </svg>
    ),
    color: 'var(--tropic-d)',
    bg: 'var(--tropic-glow)',
  },
  flight: {
    icon: (
      <svg width="14" height="14" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 13l7-1 3-7h2l-1 7 5-1 1 1.5-5 3-1 4-2 .5-1-3.5-3 0-1 .5z" />
      </svg>
    ),
    color: 'var(--tropic-d)',
    bg: 'var(--tropic-glow)',
  },
  excursion: {
    icon: (
      <svg width="14" height="14" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <path d="M14.5 7.5L12.5 12.5L7.5 14.5L9.5 9.5z" />
      </svg>
    ),
    color: 'var(--moss)',
    bg: 'rgba(62,140,109,0.12)',
  },
  message: {
    icon: (
      <svg width="14" height="14" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6l8 6 8-6M3 6v11h16V6M3 6h16" />
      </svg>
    ),
    color: 'var(--sun-d)',
    bg: 'var(--sun-glow)',
  },
  approval: {
    icon: (
      <svg width="14" height="14" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 11 9 16 18 6" />
      </svg>
    ),
    color: 'var(--moss)',
    bg: 'rgba(62,140,109,0.12)',
  },
  system: {
    icon: (
      <svg width="14" height="14" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="11" y1="7" x2="11" y2="12" />
        <circle cx="11" cy="15.5" r="0.7" fill="currentColor" />
      </svg>
    ),
    color: 'var(--ink-mid)',
    bg: 'var(--warm)',
  },
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function TopBar({ member, notifications, onOpenBookings }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [localNotifs, setLocalNotifs] = useState<Notification[]>(notifications)
  const drawerRef = useRef<HTMLDivElement>(null)
  const bellRef = useRef<HTMLButtonElement>(null)
  const supabase = createClient()
  const router = useRouter()

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // Sync when parent passes new notifications
  useEffect(() => {
    setLocalNotifs(notifications)
  }, [notifications])

  const unreadCount = localNotifs.filter(n => !n.read).length
  const hasUnread = unreadCount > 0

  // Outside-click closes drawer
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        drawerRef.current &&
        !drawerRef.current.contains(e.target as Node) &&
        bellRef.current &&
        !bellRef.current.contains(e.target as Node)
      ) {
        setDrawerOpen(false)
      }
    }
    if (drawerOpen) {
      document.addEventListener('mousedown', handleClick)
    }
    return () => document.removeEventListener('mousedown', handleClick)
  }, [drawerOpen])

  // Escape closes drawer
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [])

  async function markAllRead() {
    const unreadIds = localNotifs.filter(n => !n.read).map(n => n.id)
    if (!unreadIds.length) return
    // Optimistic update
    setLocalNotifs(prev => prev.map(n => ({ ...n, read: true })))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('notifications') as any)
      .update({ read: true })
      .in('id', unreadIds)
  }

  async function markOneRead(notif: Notification) {
    if (notif.read) return
    setLocalNotifs(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('notifications') as any)
      .update({ read: true })
      .eq('id', notif.id)
  }

  return (
    <div className="topbar">
      {/* Mobile: show brand wordmark (hidden on desktop via CSS) */}
      <div style={{
        fontFamily: 'var(--display)',
        fontStyle: 'italic',
        fontSize: 22,
        fontWeight: 500,
        color: 'var(--ink)',
        letterSpacing: '0.04em',
        display: 'none', // shown via media query in globals.css if needed
        flexShrink: 0,
      }}>
        Travail
      </div>

      {/* Search input */}
      <div className="search">
        {Icons.search}
        <input
          type="search"
          placeholder="Search flights, members, excursions…"
          aria-label="Search"
        />
      </div>

      {/* Right-side actions */}
      <div className="top-actions">

        {/* Bell button + notification drawer */}
        <div style={{ position: 'relative' }}>
          <button
            ref={bellRef}
            className={`icon-btn${hasUnread ? ' has-dot' : ''}`}
            onClick={() => setDrawerOpen(o => !o)}
            aria-label={`Notifications${hasUnread ? ` — ${unreadCount} unread` : ''}`}
            aria-expanded={drawerOpen}
          >
            {Icons.bell}
          </button>

          {drawerOpen && (
            <div className="notif-drawer" ref={drawerRef} role="dialog" aria-label="Notifications">
              {/* Drawer header */}
              <div className="notif-drawer-head">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  Notifications
                  {unreadCount > 0 && (
                    <span style={{
                      background: 'var(--signal)',
                      color: '#fff',
                      borderRadius: 20,
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '1px 7px',
                      lineHeight: 1.6,
                    }}>
                      {unreadCount}
                    </span>
                  )}
                </h3>
                {hasUnread && (
                  <button
                    onClick={markAllRead}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: 'var(--mono)',
                      fontSize: 9.5,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: 'var(--tropic)',
                      padding: '4px 0',
                      transition: 'color 0.12s',
                    }}
                  >
                    Mark all read
                  </button>
                )}
              </div>

              {/* Notification list */}
              <div className="notif-list">
                {localNotifs.length === 0 ? (
                  <div style={{
                    padding: '36px 18px',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 10,
                    color: 'var(--ink-faint)',
                  }}>
                    <div style={{ opacity: 0.3 }}>{Icons.bell}</div>
                    <span style={{ fontSize: 13 }}>No notifications yet</span>
                  </div>
                ) : (
                  localNotifs.map(notif => {
                    const meta = KIND_META[notif.kind] ?? KIND_META.system
                    return (
                      <div
                        key={notif.id}
                        className={`notif-item${!notif.read ? ' unread' : ''}`}
                        onClick={() => markOneRead(notif)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={e => e.key === 'Enter' && markOneRead(notif)}
                      >
                        <div
                          className="notif-icon"
                          style={{ color: meta.color, background: meta.bg }}
                        >
                          {meta.icon}
                        </div>
                        <div className="notif-content" style={{ flex: 1, minWidth: 0 }}>
                          <div className="n-title">{notif.title}</div>
                          <div className="n-body">{notif.body}</div>
                          <div className="n-ts">{timeAgo(notif.created_at)}</div>
                        </div>
                        {!notif.read && (
                          <div style={{
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            background: 'var(--tropic)',
                            flexShrink: 0,
                            alignSelf: 'flex-start',
                            marginTop: 6,
                          }} />
                        )}
                      </div>
                    )
                  })
                )}
              </div>

              {/* Drawer footer */}
              {localNotifs.length > 0 && (
                <div style={{
                  padding: '10px 18px',
                  borderTop: '1px solid var(--hair)',
                  display: 'flex',
                  justifyContent: 'center',
                }}>
                  <button
                    onClick={() => { setDrawerOpen(false); onOpenBookings() }}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: 'var(--mono)',
                      fontSize: 9.5,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: 'var(--ink-light)',
                      padding: '4px 0',
                      transition: 'color 0.12s',
                    }}
                  >
                    View all bookings →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Anchor CTAs — Flight (teal) + Excursion (gold) */}
        <Link href="/anchor-flight" className="btn-primary" style={{ height: 36, padding: '0 14px', fontSize: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          + Flight
        </Link>
        <Link href="/anchor-excursion" className="btn-sun" style={{ height: 36, padding: '0 14px', fontSize: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          + Exc.
        </Link>

        {/* Sign out — visible in every member window (desktop + mobile top bar) */}
        <button
          onClick={signOut}
          className="btn-ghost signout-btn"
          aria-label="Sign out"
          title="Sign out"
          style={{ height: 36, padding: '0 12px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
        >
          <svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" />
            <path d="M14 16l5-5-5-5" />
            <path d="M19 11H8" />
          </svg>
          <span className="signout-label">Sign out</span>
        </button>
      </div>
    </div>
  )
}
