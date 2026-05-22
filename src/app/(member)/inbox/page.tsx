'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Member, Booking, Flight, Excursion } from '@/lib/supabase/types'

// Simple messages table type — may not exist, handled gracefully
interface Message {
  id: string
  thread_id: string
  author_id: string
  body: string
  created_at: string
}

interface Thread {
  id: string
  kind: 'trip' | 'dm'
  name: string
  subtitle: string
  lastMessage?: string
  lastTs?: string
  unread?: boolean
  avatar?: string
  initials?: string
  itemKind?: string
}

function timeShort(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays === 0) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function InboxPage() {
  const [member, setMember] = useState<Member | null>(null)
  const [threads, setThreads] = useState<Thread[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [allMembers, setAllMembers] = useState<Record<string, Member>>({})
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null)
  const [activeTab, setActiveTab] = useState<'trips' | 'dms'>('trips')
  const [composing, setComposing] = useState('')
  const [sending, setSending] = useState(false)
  const [messagesEnabled, setMessagesEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: memberData } = await supabase
        .from('members')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (!memberData) { setLoading(false); return }
      const currentMember = memberData as Member
      setMember(currentMember)

      // Load member's bookings to build trip threads
      const { data: bookingData } = await supabase
        .from('bookings')
        .select('*')
        .eq('member_id', currentMember.id)
        .in('status', ['pending', 'approved'])
        .order('submitted_at', { ascending: false })

      const { data: membersData } = await supabase.from('members').select('*')

      // Build members lookup
      const membersMap: Record<string, Member> = {}
      for (const m of (membersData ?? [])) {
        const mm = m as Member
        membersMap[mm.id] = mm
      }
      setAllMembers(membersMap)

      const bookings = (bookingData ?? []) as Booking[]

      if (bookings.length === 0) {
        setLoading(false)
        return
      }

      // Fetch flight/excursion names for trip threads
      const flightIds = bookings.filter(b => b.item_kind === 'flight').map(b => b.item_id)
      const excursionIds = bookings.filter(b => b.item_kind === 'excursion').map(b => b.item_id)

      type FlightSlim = Pick<Flight, 'id' | 'name' | 'origin_code' | 'dest_code' | 'date'>
      type ExcursionSlim = Pick<Excursion, 'id' | 'name' | 'origin_code' | 'date'>

      const rawFlightsResult = flightIds.length > 0
        ? await supabase.from('flights').select('id,name,origin_code,dest_code,date').in('id', flightIds)
        : { data: [] as FlightSlim[] }
      const rawExcursionsResult = excursionIds.length > 0
        ? await supabase.from('excursions').select('id,name,origin_code,date').in('id', excursionIds)
        : { data: [] as ExcursionSlim[] }

      const flightsData = (rawFlightsResult.data ?? []) as FlightSlim[]
      const excursionsData = (rawExcursionsResult.data ?? []) as ExcursionSlim[]

      const flightMap: Record<string, FlightSlim> = {}
      for (const f of flightsData) flightMap[f.id] = f

      const excursionMap: Record<string, ExcursionSlim> = {}
      for (const e of excursionsData) excursionMap[e.id] = e

      const builtThreads: Thread[] = bookings.map(b => {
        const threadId = `booking-${b.id}`
        if (b.item_kind === 'flight' && flightMap[b.item_id]) {
          const f = flightMap[b.item_id]
          const date = new Date(f.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          return {
            id: threadId,
            kind: 'trip' as const,
            name: f.name,
            subtitle: `${f.origin_code} → ${f.dest_code} · ${date}`,
            lastMessage: 'Ops will post manifest when confirmed.',
            lastTs: b.submitted_at,
            unread: false,
            itemKind: 'flight',
          }
        }
        if (b.item_kind === 'excursion' && excursionMap[b.item_id]) {
          const e = excursionMap[b.item_id]
          const date = new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          return {
            id: threadId,
            kind: 'trip' as const,
            name: e.name,
            subtitle: `${e.origin_code} · ${date}`,
            lastMessage: 'Ops will post manifest when confirmed.',
            lastTs: b.submitted_at,
            unread: false,
            itemKind: 'excursion',
          }
        }
        return {
          id: threadId,
          kind: 'trip' as const,
          name: `${b.item_kind} booking`,
          subtitle: timeShort(b.submitted_at),
          lastTs: b.submitted_at,
          unread: false,
        }
      })

      setThreads(builtThreads)

      // Try to load messages — gracefully handle if table doesn't exist
      try {
        const { data: msgData, error: msgError } = await supabase
          .from('messages' as 'members') // cast to satisfy types, actual table may differ
          .select('*')
          .order('created_at')

        if (!msgError && msgData) {
          setMessages(msgData as unknown as Message[])
        } else {
          setMessagesEnabled(false)
        }
      } catch {
        setMessagesEnabled(false)
      }

      setLoading(false)
    }
    load()
  }, [])

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, selectedThread])

  async function handleSend() {
    if (!composing.trim() || !selectedThread || !member) return
    setSending(true)

    if (!messagesEnabled) {
      // Gracefully show — messaging not yet provisioned
      setSending(false)
      setComposing('')
      return
    }

    try {
      await (supabase as unknown as { from: (t: string) => { insert: (d: unknown) => Promise<unknown> } })
        .from('messages')
        .insert({
          thread_id: selectedThread.id,
          author_id: member.id,
          body: composing.trim(),
        })

      // Reload messages for thread
      const { data: newMsgs } = await (supabase as unknown as { from: (t: string) => { select: (s: string) => { eq: (k: string, v: string) => { order: (o: string) => Promise<{ data: unknown[] | null }> } } } })
        .from('messages')
        .select('*')
        .eq('thread_id', selectedThread.id)
        .order('created_at')

      if (newMsgs) setMessages(newMsgs as unknown as Message[])
      setComposing('')
    } catch {
      // silent
    } finally {
      setSending(false)
    }
  }

  const tripThreads = threads.filter(t => t.kind === 'trip')
  const dmThreads = threads.filter(t => t.kind === 'dm')
  const activeThreads = activeTab === 'trips' ? tripThreads : dmThreads

  const threadMessages = messagesEnabled
    ? messages.filter(m => m.thread_id === selectedThread?.id)
    : []

  return (
    <div className="inbox">
      {/* ── Left panel: thread list ── */}
      <div className="inbox-list">
        <div className="inbox-tabs">
          <div
            className={`inbox-tab${activeTab === 'trips' ? ' active' : ''}`}
            onClick={() => setActiveTab('trips')}
          >
            Trip threads
            {tripThreads.length > 0 && (
              <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--ink-faint)' }}>
                {tripThreads.length}
              </span>
            )}
          </div>
          <div
            className={`inbox-tab${activeTab === 'dms' ? ' active' : ''}`}
            onClick={() => setActiveTab('dms')}
          >
            Direct
            {dmThreads.length > 0 && (
              <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--ink-faint)' }}>
                {dmThreads.length}
              </span>
            )}
          </div>
        </div>

        <div className="conv-list">
          {loading ? (
            <div style={{ padding: '24px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[...Array(3)].map((_, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, opacity: 0.4 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--warm)', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ width: '70%', height: 11, background: 'var(--warm)', borderRadius: 4, marginBottom: 6 }} />
                    <div style={{ width: '90%', height: 9, background: 'var(--warm)', borderRadius: 4 }} />
                  </div>
                </div>
              ))}
            </div>
          ) : activeThreads.length === 0 ? (
            <div style={{
              padding: '32px 20px',
              textAlign: 'center',
              color: 'var(--ink-faint)',
              fontSize: 12.5,
              lineHeight: 1.55,
            }}>
              {activeTab === 'trips'
                ? 'No trip threads yet.\nThreads open when Ops files a manifest.'
                : 'No direct messages yet.'}
            </div>
          ) : (
            activeThreads.map(thread => (
              <div
                key={thread.id}
                className={`conv${selectedThread?.id === thread.id ? ' active' : ''}${thread.unread ? ' unread' : ''}`}
                onClick={() => setSelectedThread(thread)}
              >
                <div
                  className="conv-av"
                  style={{
                    background: thread.itemKind === 'flight' ? 'var(--night)' : 'var(--warm)',
                    color: thread.itemKind === 'flight' ? 'var(--tropic)' : 'var(--ink-mid)',
                    fontSize: 11,
                  }}
                >
                  {thread.itemKind === 'flight' ? (
                    <svg width="14" height="14" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 13l7-1 3-7h2l-1 7 5-1 1 1.5-5 3-1 4-2 .5-1-3.5-3 0-1 .5z" />
                    </svg>
                  ) : thread.initials ? (
                    thread.initials
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <circle cx="8" cy="8" r="4" />
                      <path d="M2 19c0-3.3 2.7-6 6-6h4c3.3 0 6 2.7 6 6" />
                    </svg>
                  )}
                </div>
                <div className="conv-body">
                  <div className="conv-name">{thread.name}</div>
                  <div className="conv-preview">{thread.subtitle}</div>
                </div>
                {thread.lastTs && (
                  <div className="conv-ts">{timeShort(thread.lastTs)}</div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Right panel: thread detail ── */}
      {selectedThread ? (
        <div className="thread">
          {/* Thread header */}
          <div className="thread-head">
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: selectedThread.itemKind === 'flight' ? 'var(--night)' : 'var(--tropic-glow)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: selectedThread.itemKind === 'flight' ? 'var(--tropic)' : 'var(--tropic-d)',
                flexShrink: 0,
              }}
            >
              {selectedThread.itemKind === 'flight' ? (
                <svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 13l7-1 3-7h2l-1 7 5-1 1 1.5-5 3-1 4-2 .5-1-3.5-3 0-1 .5z" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                  <circle cx="8" cy="8" r="4" />
                  <path d="M2 19c0-3.3 2.7-6 6-6h4c3.3 0 6 2.7 6 6" />
                </svg>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <div className="t-name">{selectedThread.name}</div>
              <div className="t-meta">{selectedThread.subtitle}</div>
            </div>
            <span className="pill" style={{ fontSize: 9 }}>
              {selectedThread.kind === 'trip' ? 'Trip thread' : 'Direct'}
            </span>
          </div>

          {/* Messages */}
          <div className="messages">
            {/* Ops system message */}
            <div style={{
              alignSelf: 'center',
              background: 'var(--warm)',
              border: '1px solid var(--hair)',
              borderRadius: 10,
              padding: '10px 16px',
              maxWidth: '72%',
              textAlign: 'center',
            }}>
              <div className="mono" style={{ fontSize: 9.5, marginBottom: 4, color: 'var(--tropic-d)' }}>
                TRAVAIL OPS
              </div>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-mid)', lineHeight: 1.5 }}>
                Your booking is under review. Ops will post the flight manifest and coordinate here once confirmed.
              </p>
            </div>

            {!messagesEnabled && (
              <div style={{
                alignSelf: 'center',
                background: 'var(--warm)',
                border: '1px solid var(--hair)',
                borderRadius: 10,
                padding: '10px 16px',
                maxWidth: '72%',
                textAlign: 'center',
              }}>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-faint)', lineHeight: 1.5 }}>
                  Live messaging will be available once your booking is confirmed by Ops.
                </p>
              </div>
            )}

            {threadMessages.map(msg => {
              const isMe = msg.author_id === member?.id
              const author = allMembers[msg.author_id]
              return (
                <div key={msg.id} className={`msg${isMe ? ' me' : ''}`}>
                  {!isMe && (
                    <div style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      background: 'var(--warm)',
                      border: '1px solid var(--hair)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      fontWeight: 600,
                      color: 'var(--ink-mid)',
                      flexShrink: 0,
                    }}>
                      {author?.initials ?? '?'}
                    </div>
                  )}
                  <div>
                    <div className="bub">{msg.body}</div>
                    <div className="msg-ts">{timeShort(msg.created_at)}</div>
                  </div>
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Composer */}
          <div className="composer">
            <textarea
              placeholder={messagesEnabled ? 'Message…' : 'Messaging available after Ops confirmation…'}
              value={composing}
              onChange={e => setComposing(e.target.value)}
              disabled={!messagesEnabled}
              rows={1}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
            />
            <button
              className="btn-primary"
              style={{ height: 40, padding: '0 16px', fontSize: 13, flexShrink: 0 }}
              onClick={handleSend}
              disabled={sending || !composing.trim() || !messagesEnabled}
            >
              {sending ? (
                <span className="pending-indicator" style={{ width: 12, height: 12, borderWidth: 2 }} />
              ) : (
                <svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="thread">
          <div className="thread-empty">
            <svg width="48" height="48" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
              <path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6l-4 4V6a2 2 0 0 1 2-2z" />
            </svg>
            <p style={{ fontSize: 15, fontFamily: 'var(--display)', fontStyle: 'italic', color: 'var(--ink-mid)' }}>
              Pick a thread.
            </p>
            <p style={{ fontSize: 12.5, color: 'var(--ink-faint)', maxWidth: 240, textAlign: 'center', lineHeight: 1.55 }}>
              Trip threads open automatically when Ops files a manifest.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
