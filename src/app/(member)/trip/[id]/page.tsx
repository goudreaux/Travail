'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { fmtDate } from '@/lib/data'
import type { Member, Booking } from '@/lib/supabase/types'

type Msg = {
  id: string
  booking_id: string
  sender_member_id: string | null
  is_ops: boolean
  body: string
  created_at: string
}

function timeLabel(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function TripThreadPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const bookingId = params.id as string

  const [member, setMember] = useState<Member | null>(null)
  const [booking, setBooking] = useState<Booking | null>(null)
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [messages, setMessages] = useState<Msg[]>([])
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [sending, setSending] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  const loadMessages = useCallback(async (bid: string) => {
    const { data } = await db.from('booking_messages').select('*').eq('booking_id', bid).order('created_at')
    setMessages((data ?? []) as Msg[])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: m } = await supabase.from('members').select('*').eq('user_id', user.id).single()
      if (!m) { router.push('/login'); return }
      setMember(m as Member)

      const { data: b } = await supabase.from('bookings').select('*').eq('id', bookingId).single()
      if (!b) { setNotFound(true); setLoading(false); return }
      const bk = b as Booking
      setBooking(bk)

      if (bk.item_kind === 'flight') {
        const { data: f } = await supabase.from('flights').select('name, origin_code, dest_code, date').eq('id', bk.item_id).single()
        if (f) {
          const fl = f as { name: string; origin_code: string; dest_code: string; date: string }
          setTitle(fl.name || `${fl.origin_code} → ${fl.dest_code}`)
          setSubtitle(`${fl.origin_code} → ${fl.dest_code} · ${fmtDate(fl.date).full}`)
        }
      } else {
        const { data: e } = await supabase.from('excursions').select('name, date, origin_code').eq('id', bk.item_id).single()
        if (e) {
          const ex = e as { name: string; date: string; origin_code: string }
          setTitle(ex.name)
          setSubtitle(`${ex.origin_code} · ${fmtDate(ex.date).full}`)
        }
      }

      await loadMessages(bookingId)
      setLoading(false)
    }
    load()

    const ch = supabase
      .channel(`thread-${bookingId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'booking_messages', filter: `booking_id=eq.${bookingId}` }, () => loadMessages(bookingId))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [bookingId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function send() {
    if (!member || !booking || !body.trim() || sending) return
    setSending(true)
    const text = body.trim()
    try {
      const { error } = await db.from('booking_messages').insert({
        booking_id: booking.id,
        sender_member_id: member.id,
        is_ops: member.is_admin,
        body: text,
      })
      if (error) throw error
      setBody('')
      await loadMessages(booking.id)

      // Notify the booking owner when ops replies (best-effort).
      if (member.is_admin && booking.member_id !== member.id) {
        try {
          await supabase.from('notifications').insert({
            member_id: booking.member_id,
            kind: 'message',
            title: 'New message from Ops',
            body: text.slice(0, 140),
            ref: { booking_id: booking.id },
            read: false,
          } as never)
        } catch { /* notification is supplementary */ }
      }
    } catch {
      // surface minimal — keep the typed text so they can retry
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="page">
        <div className="page-view" style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
          <div className="empty"><div className="pending-indicator" /><p>Loading thread…</p></div>
        </div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="page">
        <div className="page-view">
          <div className="empty">
            <h3>Trip not found.</h3>
            <p>This booking no longer exists.</p>
            <Link href="/bookings" className="btn-ghost" style={{ marginTop: 8 }}>Back to bookings</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-view" style={{ maxWidth: 720, margin: '0 auto' }}>
        <Link href="/bookings" className="mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--ink-mid)', marginBottom: 16 }}>
          ← BOOKINGS
        </Link>

        <div style={{ marginBottom: 8 }}>
          <p className="mono" style={{ marginBottom: 6 }}>TRIP THREAD</p>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 28, fontWeight: 500, color: 'var(--ink)', margin: 0 }}>{title || 'Your trip'}</h1>
          <p className="sub" style={{ marginTop: 4 }}>{subtitle}</p>
        </div>

        {/* Thread */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 14, padding: 18, marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 280, maxHeight: 460, overflowY: 'auto' }}>
          {messages.length === 0 ? (
            <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--ink-light)', fontSize: 13 }}>
              No messages yet. Send a note to {member?.is_admin ? 'the member' : 'Ops'} about this trip.
            </div>
          ) : (
            messages.map(msg => {
              const mine = msg.sender_member_id === member?.id
              return (
                <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    {msg.is_ops && <span className="pill tropic" style={{ fontSize: 8.5 }}>OPS</span>}
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--ink-faint)', letterSpacing: '0.06em' }}>{timeLabel(msg.created_at)}</span>
                  </div>
                  <div style={{
                    maxWidth: '78%', padding: '9px 13px', borderRadius: 12, fontSize: 13.5, lineHeight: 1.5,
                    background: mine ? 'var(--tropic)' : 'var(--warm)',
                    color: mine ? '#fff' : 'var(--ink)',
                    borderTopRightRadius: mine ? 3 : 12,
                    borderTopLeftRadius: mine ? 12 : 3,
                  }}>
                    {msg.body}
                  </div>
                </div>
              )
            })
          )}
          <div ref={endRef} />
        </div>

        {/* Composer */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'flex-end' }}>
          <textarea
            className="input"
            style={{ flex: 1, minHeight: 46, resize: 'vertical' }}
            placeholder={member?.is_admin ? 'Reply to the member…' : 'Message Ops about this trip…'}
            value={body}
            onChange={e => setBody(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send() }}
          />
          <button className="btn-primary" style={{ height: 46, padding: '0 20px' }} onClick={send} disabled={sending || !body.trim()}>
            {sending ? '…' : 'Send'}
          </button>
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-faint)', letterSpacing: '0.1em', marginTop: 6 }}>
          ⌘/CTRL + ENTER TO SEND · ALL MESSAGES STAY IN-APP
        </div>
      </div>
    </div>
  )
}
