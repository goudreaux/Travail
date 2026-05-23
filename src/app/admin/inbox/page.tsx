'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Member, Booking } from '@/lib/supabase/types'

interface Message {
  id: string
  booking_id: string
  sender_member_id: string | null
  is_ops: boolean
  body: string
  created_at: string
}

interface Thread {
  bookingId: string
  memberId: string
  memberName: string
  memberInitials: string
  name: string
  subtitle: string
  itemKind: string
  status: string
  lastTs: string
  lastMessage?: string
}

function timeShort(dateStr: string) {
  const d = new Date(dateStr)
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (diffDays === 0) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function AdminInboxPage() {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const searchParams = useSearchParams()

  const [member, setMember] = useState<Member | null>(null)
  const [threads, setThreads] = useState<Thread[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [memberMap, setMemberMap] = useState<Record<string, { name: string; initials: string }>>({})
  const [selected, setSelected] = useState<Thread | null>(null)
  const [composing, setComposing] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const endRef = useRef<HTMLDivElement>(null)

  const loadMessages = useCallback(async (bookingId: string) => {
    const { data } = await db.from('booking_messages').select('*').eq('booking_id', bookingId).order('created_at')
    setMessages((data ?? []) as Message[])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: m } = await supabase.from('members').select('*').eq('user_id', user.id).single()
      if (m) setMember(m as Member)

      const [{ data: bookings }, { data: members }, { data: msgs }] = await Promise.all([
        supabase.from('bookings').select('*').order('submitted_at', { ascending: false }),
        supabase.from('members').select('id, name, initials'),
        db.from('booking_messages').select('booking_id, body, created_at').order('created_at', { ascending: false }),
      ])

      const mMap: Record<string, { name: string; initials: string }> = {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const mm of (members ?? []) as any[]) mMap[mm.id] = { name: mm.name, initials: mm.initials }
      setMemberMap(mMap)

      const bks = (bookings ?? []) as Booking[]
      const flightIds = bks.filter(b => b.item_kind === 'flight').map(b => b.item_id)
      const excIds = bks.filter(b => b.item_kind === 'excursion').map(b => b.item_id)
      const { data: fl } = flightIds.length ? await db.from('flights').select('id, name, origin_code, dest_code, date').in('id', flightIds) : { data: [] }
      const { data: ex } = excIds.length ? await db.from('excursions').select('id, name, origin_code, date').in('id', excIds) : { data: [] }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const flMap: Record<string, any> = {}; for (const f of (fl ?? []) as any[]) flMap[f.id] = f
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const exMap: Record<string, any> = {}; for (const e of (ex ?? []) as any[]) exMap[e.id] = e

      // Last message per booking
      const lastMsg: Record<string, { body: string; created_at: string }> = {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const msg of (msgs ?? []) as any[]) { if (!lastMsg[msg.booking_id]) lastMsg[msg.booking_id] = { body: msg.body, created_at: msg.created_at } }

      const built: Thread[] = bks.map(b => {
        const who = mMap[b.member_id] ?? { name: 'Unknown', initials: '?' }
        let name = `${b.item_kind} booking`
        let route = ''
        if (b.item_kind === 'flight' && flMap[b.item_id]) {
          const f = flMap[b.item_id]; name = f.name || `${f.origin_code} → ${f.dest_code}`
          route = `${f.origin_code} → ${f.dest_code} · ${new Date(f.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
        } else if (b.item_kind === 'excursion' && exMap[b.item_id]) {
          const e = exMap[b.item_id]; name = e.name
          route = `${e.origin_code} · ${new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
        }
        const lm = lastMsg[b.id]
        return {
          bookingId: b.id, memberId: b.member_id, memberName: who.name, memberInitials: who.initials,
          name, subtitle: `${who.name} · ${route}`, itemKind: b.item_kind, status: b.status,
          lastTs: lm?.created_at ?? b.submitted_at, lastMessage: lm?.body,
        }
      }).sort((a, b) => new Date(b.lastTs).getTime() - new Date(a.lastTs).getTime())

      setThreads(built)
      setLoading(false)

      const deepLink = searchParams.get('b')
      if (deepLink) {
        const t = built.find(x => x.bookingId === deepLink)
        if (t) setSelected(t)
      }
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selected) { setMessages([]); return }
    loadMessages(selected.bookingId)
    const ch = supabase
      .channel(`admin-inbox-${selected.bookingId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'booking_messages', filter: `booking_id=eq.${selected.bookingId}` }, () => loadMessages(selected.bookingId))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [selected]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, selected])

  async function send() {
    if (!composing.trim() || !selected || !member) return
    setSending(true)
    const text = composing.trim()
    try {
      const { error } = await db.from('booking_messages').insert({
        booking_id: selected.bookingId,
        sender_member_id: member.id,
        is_ops: true,
        body: text,
      })
      if (error) throw error
      setComposing('')
      await loadMessages(selected.bookingId)
      // Notify the member (best-effort)
      try {
        await supabase.from('notifications').insert({
          member_id: selected.memberId,
          kind: 'message',
          title: 'New message from Ops',
          body: text.slice(0, 140),
          ref: { booking_id: selected.bookingId },
          read: false,
        } as never)
      } catch { /* supplementary */ }
    } catch {
      // keep text for retry
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="inbox" style={{ height: 'calc(100vh - 0px)' }}>
      <div className="inbox-list">
        <div className="inbox-tabs">
          <div className="inbox-tab active">
            Trip threads
            {threads.length > 0 && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--ink-faint)' }}>{threads.length}</span>}
          </div>
        </div>
        <div className="conv-list">
          {loading ? (
            <div style={{ padding: '24px 14px', color: 'var(--ink-faint)', fontSize: 12.5 }}>Loading…</div>
          ) : threads.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink-faint)', fontSize: 12.5 }}>No bookings yet.</div>
          ) : (
            threads.map(t => (
              <div key={t.bookingId} className={`conv${selected?.bookingId === t.bookingId ? ' active' : ''}`} onClick={() => setSelected(t)}>
                <div className="conv-av" style={{ background: 'var(--tropic-glow)', color: 'var(--tropic-d)', fontSize: 11, fontWeight: 700 }}>
                  {t.memberInitials}
                </div>
                <div className="conv-body">
                  <div className="conv-name">{t.name}</div>
                  <div className="conv-preview">{t.lastMessage ? t.lastMessage : t.subtitle}</div>
                </div>
                <div className="conv-ts">{timeShort(t.lastTs)}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {selected ? (
        <div className="thread">
          <div className="thread-head">
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--tropic-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tropic-d)', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
              {selected.memberInitials}
            </div>
            <div style={{ flex: 1 }}>
              <div className="t-name">{selected.name}</div>
              <div className="t-meta">{selected.subtitle}</div>
            </div>
            <span className={`pill ${selected.status === 'approved' ? 'moss' : 'sun'}`} style={{ fontSize: 9 }}>
              {selected.status === 'approved' ? 'Confirmed' : selected.status}
            </span>
          </div>

          <div className="messages">
            <div style={{ alignSelf: 'center', background: 'var(--warm)', border: '1px solid var(--hair)', borderRadius: 10, padding: '8px 14px', maxWidth: '72%', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-mid)' }}>
                Replies are sent to <strong>{selected.memberName}</strong> as <strong>Travail Ops</strong>.
              </p>
            </div>

            {messages.map(msg => {
              const isOps = msg.is_ops
              const author = msg.sender_member_id ? memberMap[msg.sender_member_id] : undefined
              return (
                <div key={msg.id} className={`msg${isOps ? ' me' : ''}`}>
                  {!isOps && (
                    <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--warm)', border: '1px solid var(--hair)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, color: 'var(--ink-mid)', flexShrink: 0 }}>
                      {author?.initials ?? '?'}
                    </div>
                  )}
                  <div>
                    <div className="bub">{msg.body}</div>
                    <div className="msg-ts">{isOps ? 'Ops · ' : `${author?.name ?? 'Member'} · `}{timeShort(msg.created_at)}</div>
                  </div>
                </div>
              )
            })}
            <div ref={endRef} />
          </div>

          <div className="composer">
            <textarea
              placeholder={`Reply to ${selected.memberName} as Travail Ops…`}
              value={composing}
              onChange={e => setComposing(e.target.value)}
              rows={1}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            />
            <button className="btn-primary" style={{ height: 40, padding: '0 16px', fontSize: 13, flexShrink: 0 }} onClick={send} disabled={sending || !composing.trim()}>
              {sending ? <span className="pending-indicator" style={{ width: 12, height: 12, borderWidth: 2 }} /> : 'Send'}
            </button>
          </div>
        </div>
      ) : (
        <div className="thread">
          <div className="thread-empty">
            <svg width="48" height="48" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
              <path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6l-4 4V6a2 2 0 0 1 2-2z" />
            </svg>
            <p style={{ fontSize: 15, fontFamily: 'var(--display)', fontStyle: 'italic', color: 'var(--ink-mid)' }}>Travail Ops inbox.</p>
            <p style={{ fontSize: 12.5, color: 'var(--ink-faint)', maxWidth: 260, textAlign: 'center', lineHeight: 1.55 }}>
              Pick a member booking to coordinate. Your replies go out as Travail Ops.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
