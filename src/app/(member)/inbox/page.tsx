'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Member, Booking, Flight, Excursion } from '@/lib/supabase/types'

interface Message {
  id: string
  booking_id: string
  sender_member_id: string | null
  is_ops: boolean
  body: string
  created_at: string
}

interface Thread {
  id: string
  bookingId: string
  status: string
  kind: 'trip' | 'dm'
  name: string
  subtitle: string
  lastTs?: string
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
  const [loading, setLoading] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const loadMessages = useCallback(async (bookingId: string) => {
    const { data } = await db.from('booking_messages').select('*').eq('booking_id', bookingId).order('created_at')
    setMessages((data ?? []) as Message[])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: memberData } = await supabase.from('members').select('*').eq('user_id', user.id).single()
      if (!memberData) { setLoading(false); return }
      const currentMember = memberData as Member
      setMember(currentMember)

      const { data: bookingData } = await supabase
        .from('bookings')
        .select('*')
        .eq('member_id', currentMember.id)
        .in('status', ['pending', 'approved'])
        .order('submitted_at', { ascending: false })

      const { data: membersData } = await supabase.from('members').select('*')
      const membersMap: Record<string, Member> = {}
      for (const m of (membersData ?? [])) { const mm = m as Member; membersMap[mm.id] = mm }
      setAllMembers(membersMap)

      const bookings = (bookingData ?? []) as Booking[]
      if (bookings.length === 0) { setLoading(false); return }

      const flightIds = bookings.filter(b => b.item_kind === 'flight').map(b => b.item_id)
      const excursionIds = bookings.filter(b => b.item_kind === 'excursion').map(b => b.item_id)

      const fRes = flightIds.length > 0 ? await supabase.from('flights').select('id,name,origin_code,dest_code,date').in('id', flightIds) : { data: [] }
      const eRes = excursionIds.length > 0 ? await supabase.from('excursions').select('id,name,origin_code,date').in('id', excursionIds) : { data: [] }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const flightMap: Record<string, any> = {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const f of (fRes.data ?? []) as any[]) flightMap[f.id] = f
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const excursionMap: Record<string, any> = {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const e of (eRes.data ?? []) as any[]) excursionMap[e.id] = e

      const builtThreads: Thread[] = bookings.map(b => {
        const base = { id: `booking-${b.id}`, bookingId: b.id, status: b.status, kind: 'trip' as const, lastTs: b.submitted_at, itemKind: b.item_kind }
        if (b.item_kind === 'flight' && flightMap[b.item_id]) {
          const f = flightMap[b.item_id]
          const date = new Date(f.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          return { ...base, name: f.name, subtitle: `${f.origin_code} → ${f.dest_code} · ${date}` }
        }
        if (b.item_kind === 'excursion' && excursionMap[b.item_id]) {
          const e = excursionMap[b.item_id]
          const date = new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          return { ...base, name: e.name, subtitle: `${e.origin_code} · ${date}` }
        }
        return { ...base, name: `${b.item_kind} booking`, subtitle: timeShort(b.submitted_at) }
      })

      setThreads(builtThreads)
      setLoading(false)
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load + live-subscribe the selected thread's messages
  useEffect(() => {
    if (!selectedThread) { setMessages([]); return }
    loadMessages(selectedThread.bookingId)
    const ch = supabase
      .channel(`inbox-${selectedThread.bookingId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'booking_messages', filter: `booking_id=eq.${selectedThread.bookingId}` }, () => loadMessages(selectedThread.bookingId))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [selectedThread]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, selectedThread])

  async function handleSend() {
    if (!composing.trim() || !selectedThread || !member) return
    setSending(true)
    const text = composing.trim()
    try {
      const { error } = await db.from('booking_messages').insert({
        booking_id: selectedThread.bookingId,
        sender_member_id: member.id,
        is_ops: member.is_admin,
        body: text,
      })
      if (error) throw error
      setComposing('')
      await loadMessages(selectedThread.bookingId)
    } catch {
      // keep the text so they can retry
    } finally {
      setSending(false)
    }
  }

  const tripThreads = threads.filter(t => t.kind === 'trip')
  const dmThreads = threads.filter(t => t.kind === 'dm')
  const activeThreads = activeTab === 'trips' ? tripThreads : dmThreads

  const confirmed = selectedThread?.status === 'approved'

  return (
    <div className="inbox">
      {/* ── Left panel: thread list ── */}
      <div className="inbox-list">
        <div className="inbox-tabs">
          <div className={`inbox-tab${activeTab === 'trips' ? ' active' : ''}`} onClick={() => setActiveTab('trips')}>
            Trip threads
            {tripThreads.length > 0 && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--ink-faint)' }}>{tripThreads.length}</span>}
          </div>
          <div className={`inbox-tab${activeTab === 'dms' ? ' active' : ''}`} onClick={() => setActiveTab('dms')}>
            Direct
            {dmThreads.length > 0 && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--ink-faint)' }}>{dmThreads.length}</span>}
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
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink-faint)', fontSize: 12.5, lineHeight: 1.55 }}>
              {activeTab === 'trips' ? 'No trip threads yet. Reserve a seat to start one.' : 'No direct messages yet.'}
            </div>
          ) : (
            activeThreads.map(thread => (
              <div
                key={thread.id}
                className={`conv${selectedThread?.id === thread.id ? ' active' : ''}`}
                onClick={() => setSelectedThread(thread)}
              >
                <div className="conv-av" style={{ background: thread.itemKind === 'flight' ? 'var(--night)' : 'var(--warm)', color: thread.itemKind === 'flight' ? 'var(--tropic)' : 'var(--ink-mid)', fontSize: 11 }}>
                  {thread.itemKind === 'flight' ? (
                    <svg width="14" height="14" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 13l7-1 3-7h2l-1 7 5-1 1 1.5-5 3-1 4-2 .5-1-3.5-3 0-1 .5z" />
                    </svg>
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
                {thread.lastTs && <div className="conv-ts">{timeShort(thread.lastTs)}</div>}
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Right panel: thread detail ── */}
      {selectedThread ? (
        <div className="thread">
          <div className="thread-head">
            <div style={{ width: 36, height: 36, borderRadius: 10, background: selectedThread.itemKind === 'flight' ? 'var(--night)' : 'var(--tropic-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: selectedThread.itemKind === 'flight' ? 'var(--tropic)' : 'var(--tropic-d)', flexShrink: 0 }}>
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
            <span className={`pill ${confirmed ? 'moss' : 'sun'}`} style={{ fontSize: 9 }}>
              {confirmed ? 'Confirmed' : 'In review'}
            </span>
          </div>

          {/* Messages */}
          <div className="messages">
            <div style={{ alignSelf: 'center', background: 'var(--warm)', border: '1px solid var(--hair)', borderRadius: 10, padding: '10px 16px', maxWidth: '72%', textAlign: 'center' }}>
              <div className="mono" style={{ fontSize: 9.5, marginBottom: 4, color: 'var(--tropic-d)' }}>TRAVAIL OPS</div>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-mid)', lineHeight: 1.5 }}>
                {confirmed
                  ? 'Your booking is confirmed. Coordinate with Ops here anytime.'
                  : 'Your booking is under review. You can message Ops here in the meantime.'}
              </p>
            </div>

            {messages.map(msg => {
              const isMe = msg.sender_member_id === member?.id
              const author = msg.sender_member_id ? allMembers[msg.sender_member_id] : undefined
              return (
                <div key={msg.id} className={`msg${isMe ? ' me' : ''}`}>
                  {!isMe && (
                    <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--warm)', border: '1px solid var(--hair)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, color: 'var(--ink-mid)', flexShrink: 0 }}>
                      {msg.is_ops ? 'OPS' : (author?.initials ?? '?')}
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
              placeholder="Message Ops…"
              value={composing}
              onChange={e => setComposing(e.target.value)}
              rows={1}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            />
            <button
              className="btn-primary"
              style={{ height: 40, padding: '0 16px', fontSize: 13, flexShrink: 0 }}
              onClick={handleSend}
              disabled={sending || !composing.trim()}
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
            <p style={{ fontSize: 15, fontFamily: 'var(--display)', fontStyle: 'italic', color: 'var(--ink-mid)' }}>Pick a thread.</p>
            <p style={{ fontSize: 12.5, color: 'var(--ink-faint)', maxWidth: 240, textAlign: 'center', lineHeight: 1.55 }}>
              Each booking has a thread for coordinating with Ops.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
