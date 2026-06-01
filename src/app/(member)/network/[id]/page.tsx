'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { fmtHomeBase, tierLabel, tierPill, canonicalInterests } from '@/lib/data'
import { TRIP_TYPE_ICONS } from '@/lib/icons'
import type { Member, Booking, Post, Friendship, ContactRequest } from '@/lib/supabase/types'

function Avatar({ member, size = 80 }: { member: Member; size?: number }) {
  if (member.avatar_url) {
    return (
      <img
        src={member.avatar_url}
        alt={member.name}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          display: 'block',
          flexShrink: 0,
          border: '3px solid var(--card)',
          boxShadow: '0 2px 16px rgba(13,51,64,0.18)',
        }}
      />
    )
  }
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: 'var(--night)',
      color: 'var(--tropic)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--mono)',
      fontSize: size * 0.28,
      fontWeight: 600,
      letterSpacing: '0.06em',
      flexShrink: 0,
      border: '3px solid var(--card)',
      boxShadow: '0 2px 16px rgba(13,51,64,0.18)',
    }}>
      {member.initials}
    </div>
  )
}

function TierBadge({ tier }: { tier: string }) {
  return <span className={`pill ${tierPill(tier)}`}>{tierLabel(tier)}</span>
}

function FriendAction({
  friendship, meId, busy, onSend, onAccept, onDecline, onRemove,
}: {
  friendship: Friendship | null
  meId: string
  busy: boolean
  onSend: () => void
  onAccept: () => void
  onDecline: () => void
  onRemove: () => void
}) {
  if (!friendship) {
    return (
      <button type="button" className="cta-outline" onClick={onSend} disabled={busy}>
        {busy ? 'Sending…' : '+ Add friend'}
      </button>
    )
  }
  if (friendship.status === 'accepted') {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span className="pill tropic" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <svg width="11" height="11" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 11 9 16 18 6" />
          </svg>
          Friends
        </span>
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          className="btn-ghost"
          style={{ fontSize: 11, padding: '4px 10px', height: 28 }}
        >
          Remove
        </button>
      </div>
    )
  }
  if (friendship.status === 'pending') {
    const iAmRequester = friendship.requester_id === meId
    if (iAmRequester) {
      return (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="pill" style={{ background: 'var(--warm)', color: 'var(--ink-mid)' }}>
            Request sent
          </span>
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className="btn-ghost"
            style={{ fontSize: 11, padding: '4px 10px', height: 28 }}
          >
            Withdraw
          </button>
        </div>
      )
    }
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button type="button" className="cta-outline" onClick={onAccept} disabled={busy}>
          Accept
        </button>
        <button
          type="button"
          onClick={onDecline}
          disabled={busy}
          className="btn-ghost"
          style={{ fontSize: 12, padding: '6px 12px' }}
        >
          Decline
        </button>
      </div>
    )
  }
  // Declined — let the requester try again (delete + reinsert).
  return (
    <button type="button" className="cta-outline" onClick={onRemove} disabled={busy}>
      Reset request
    </button>
  )
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function timeAgo(dateStr: string) {
  const ms = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(ms / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

interface BookingWithItem extends Booking {
  itemName?: string
  itemOrigin?: string
  itemDest?: string
}

export default function MemberProfilePage() {
  const params = useParams()
  const memberId = params.id as string

  const [member, setMember] = useState<Member | null>(null)
  const [bookings, setBookings] = useState<BookingWithItem[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [meId, setMeId] = useState<string | null>(null)
  const [friendship, setFriendship] = useState<Friendship | null>(null)
  const [friendBusy, setFriendBusy] = useState(false)
  const [friends, setFriends] = useState<Member[]>([])
  const [friendCount, setFriendCount] = useState(0)
  // Contact-info request: outgoing (me → them) and incoming (them → me).
  const [outgoingContact, setOutgoingContact] = useState<ContactRequest | null>(null)
  const [incomingContact, setIncomingContact] = useState<ContactRequest | null>(null)
  const [contact, setContact] = useState<{ email: string | null; phone: string | null } | null>(null)
  const [contactBusy, setContactBusy] = useState(false)
  const [askingContact, setAskingContact] = useState(false)
  const [contactNote, setContactNote] = useState('')

  const reloadFriendship = useCallback(async () => {
    if (!memberId) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: meRow } = await supabase
      .from('members')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!meRow) return
    setMeId(meRow.id)

    if (meRow.id !== memberId) {
      const { data: fs } = await supabase
        .from('friendships')
        .select('*')
        .or(`and(requester_id.eq.${meRow.id},addressee_id.eq.${memberId}),and(requester_id.eq.${memberId},addressee_id.eq.${meRow.id})`)
        .maybeSingle()
      setFriendship((fs as Friendship | null) ?? null)

      // Contact requests: outgoing (me asking them) and incoming (them
      // asking me). Stored separately so each side can see its own row.
      const [{ data: out }, { data: inc }] = await Promise.all([
        supabase
          .from('contact_requests')
          .select('*')
          .eq('requester_id', meRow.id)
          .eq('addressee_id', memberId)
          .maybeSingle(),
        supabase
          .from('contact_requests')
          .select('*')
          .eq('requester_id', memberId)
          .eq('addressee_id', meRow.id)
          .maybeSingle(),
      ])
      setOutgoingContact((out as ContactRequest | null) ?? null)
      setIncomingContact((inc as ContactRequest | null) ?? null)

      // If they've already shared with me, fetch the details via the
      // SECURITY DEFINER reveal function.
      if ((out as ContactRequest | null)?.status === 'granted') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: rev } = await (supabase as any).rpc('get_member_contact', { target_id: memberId })
        const row = Array.isArray(rev) && rev[0] ? rev[0] : null
        setContact(row ? { email: row.email ?? null, phone: row.phone ?? null } : null)
      } else {
        setContact(null)
      }
    }
  }, [memberId])

  useEffect(() => {
    if (!memberId) return
    async function load() {
      const supabase = createClient()

      const [{ data: memberData }, { data: bookingData }, { data: postData }] = await Promise.all([
        supabase.from('members').select('*').eq('id', memberId).single(),
        supabase
          .from('bookings')
          .select('*')
          .eq('member_id', memberId)
          .in('status', ['approved', 'pending'])
          .order('submitted_at', { ascending: false }),
        supabase
          .from('posts')
          .select('*')
          .eq('author_id', memberId)
          .order('created_at', { ascending: false })
          .limit(5),
      ])

      if (!memberData) { setLoading(false); return }
      setMember(memberData)
      setPosts(postData || [])

      // This member's accepted friends — fetched separately because RLS only
      // exposes friendships involving the current user *or* this profile.
      // Either side, we ask Supabase for accepted rows that touch them.
      const { data: friendRows } = await supabase
        .from('friendships')
        .select('*')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${memberId},addressee_id.eq.${memberId}`)
      const friendIds = (friendRows ?? [])
        .map((f: Friendship) => f.requester_id === memberId ? f.addressee_id : f.requester_id)
      setFriendCount(friendIds.length)
      if (friendIds.length > 0) {
        const { data: friendMembers } = await supabase
          .from('members')
          .select('*')
          .in('id', friendIds)
          .limit(12)
        setFriends(friendMembers ?? [])
      } else {
        setFriends([])
      }

      // My own member id + friendship with this profile (if any).
      await reloadFriendship()

      if (!bookingData || bookingData.length === 0) {
        setBookings([])
        setLoading(false)
        return
      }

      // Enrich bookings with item names
      const flightIds = bookingData.filter(b => b.item_kind === 'flight').map(b => b.item_id)
      const excursionIds = bookingData.filter(b => b.item_kind === 'excursion').map(b => b.item_id)

      const [{ data: flights }, { data: excursions }] = await Promise.all([
        flightIds.length > 0
          ? supabase.from('flights').select('id,name,origin_code,dest_code').in('id', flightIds)
          : { data: [] },
        excursionIds.length > 0
          ? supabase.from('excursions').select('id,name,origin_code').in('id', excursionIds)
          : { data: [] },
      ])

      const flightMap: Record<string, { name: string; origin_code: string; dest_code: string }> = {}
      for (const f of (flights || [])) flightMap[f.id] = f

      const excursionMap: Record<string, { name: string; origin_code: string }> = {}
      for (const e of (excursions || [])) excursionMap[e.id] = e

      const enriched: BookingWithItem[] = bookingData.map(b => {
        if (b.item_kind === 'flight' && flightMap[b.item_id]) {
          const f = flightMap[b.item_id]
          return { ...b, itemName: f.name, itemOrigin: f.origin_code, itemDest: f.dest_code }
        }
        if (b.item_kind === 'excursion' && excursionMap[b.item_id]) {
          const e = excursionMap[b.item_id]
          return { ...b, itemName: e.name, itemOrigin: e.origin_code }
        }
        return b
      })

      setBookings(enriched)
      setLoading(false)
    }
    load()
  }, [memberId, reloadFriendship])

  async function sendRequest() {
    if (!meId || !member || friendBusy) return
    setFriendBusy(true)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from('friendships') as any)
      .insert({ requester_id: meId, addressee_id: member.id, status: 'pending' })
      .select()
      .single()
    if (!error && data) setFriendship(data as Friendship)
    setFriendBusy(false)
  }

  async function acceptRequest() {
    if (!friendship || friendBusy) return
    setFriendBusy(true)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from('friendships') as any)
      .update({ status: 'accepted' })
      .eq('id', friendship.id)
      .select()
      .single()
    if (!error && data) setFriendship(data as Friendship)
    setFriendBusy(false)
  }

  async function declineRequest() {
    if (!friendship || friendBusy) return
    setFriendBusy(true)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from('friendships') as any)
      .update({ status: 'declined' })
      .eq('id', friendship.id)
    if (!error) setFriendship(prev => prev ? { ...prev, status: 'declined' } : prev)
    setFriendBusy(false)
  }

  async function removeFriendship() {
    if (!friendship || friendBusy) return
    if (!confirm('Remove this connection?')) return
    setFriendBusy(true)
    const supabase = createClient()
    const { error } = await supabase.from('friendships').delete().eq('id', friendship.id)
    if (!error) setFriendship(null)
    setFriendBusy(false)
  }

  async function sendContactRequest() {
    if (!meId || !member || contactBusy) return
    setContactBusy(true)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from('contact_requests') as any)
      .insert({
        requester_id: meId,
        addressee_id: member.id,
        status: 'pending',
        note: contactNote.trim() || null,
      })
      .select()
      .single()
    if (!error && data) {
      setOutgoingContact(data as ContactRequest)
      setAskingContact(false)
      setContactNote('')
    }
    setContactBusy(false)
  }

  async function withdrawContactRequest() {
    if (!outgoingContact || contactBusy) return
    setContactBusy(true)
    const supabase = createClient()
    const { error } = await supabase.from('contact_requests').delete().eq('id', outgoingContact.id)
    if (!error) { setOutgoingContact(null); setContact(null) }
    setContactBusy(false)
  }

  async function grantContact() {
    if (!incomingContact || contactBusy) return
    setContactBusy(true)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from('contact_requests') as any)
      .update({ status: 'granted' })
      .eq('id', incomingContact.id)
      .select()
      .single()
    if (!error && data) setIncomingContact(data as ContactRequest)
    setContactBusy(false)
  }

  async function declineContact() {
    if (!incomingContact || contactBusy) return
    setContactBusy(true)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from('contact_requests') as any)
      .update({ status: 'declined' })
      .eq('id', incomingContact.id)
      .select()
      .single()
    if (!error && data) setIncomingContact(data as ContactRequest)
    setContactBusy(false)
  }

  async function revokeContact() {
    if (!incomingContact || contactBusy) return
    if (!confirm('Revoke their access to your contact info?')) return
    setContactBusy(true)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from('contact_requests') as any)
      .update({ status: 'revoked' })
      .eq('id', incomingContact.id)
      .select()
      .single()
    if (!error && data) setIncomingContact(data as ContactRequest)
    setContactBusy(false)
  }

  if (loading) {
    return (
      <div className="page">
        <div className="page-view" style={{ paddingTop: 40, display: 'flex', justifyContent: 'center' }}>
          <div style={{ color: 'var(--ink-faint)', fontSize: 13 }}>Loading profile...</div>
        </div>
      </div>
    )
  }

  if (!member) {
    return (
      <div className="page">
        <div className="page-view">
          <div className="empty">
            <h3>Member not found.</h3>
            <p>This member doesn't exist or has been removed.</p>
            <Link href="/network" className="btn-ghost" style={{ marginTop: 8 }}>Back to Network</Link>
          </div>
        </div>
      </div>
    )
  }

  const approvedTrips = bookings.filter(b => b.status === 'approved')

  return (
    <div className="page">
      <div className="page-view" style={{ maxWidth: 860 }}>
        {/* Back link */}
        <Link
          href="/network"
          className="mono"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 24,
            fontSize: 10.5,
            color: 'var(--ink-mid)',
            transition: 'color 0.12s',
          }}
        >
          ← Network
        </Link>

        {/* Profile hero */}
        <div className="panel" style={{ marginBottom: 20, overflow: 'visible' }}>
          {/* Dark hero banner */}
          <div style={{
            background: 'var(--night)',
            borderRadius: '11px 11px 0 0',
            height: 100,
            position: 'relative',
          }} />
          {/* Avatar + name */}
          <div style={{
            padding: '0 28px 24px',
            marginTop: -40,
            position: 'relative',
          }}>
            <Avatar member={member} size={80} />
            <div style={{ marginTop: 14, marginBottom: 16 }}>
              <div className="display-i" style={{
                fontSize: 32,
                color: 'var(--ink)',
                lineHeight: 1.1,
                marginBottom: 6,
              }}>
                {member.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <TierBadge tier={member.tier} />
                {member.home_base_code && (
                  <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-mid)' }}>
                    · {fmtHomeBase(member.home_base_code)}
                  </span>
                )}
              </div>
            </div>

            {/* Meta row */}
            <div style={{
              display: 'flex',
              gap: 24,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}>
              <div>
                <div className="mono" style={{ marginBottom: 2, fontSize: 9.5 }}>Joined</div>
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 500 }}>
                  {formatDate(member.joined_at)}
                </div>
              </div>
              <div>
                <div className="mono" style={{ marginBottom: 2, fontSize: 9.5 }}>Trips</div>
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 500 }}>
                  {approvedTrips.length}
                </div>
              </div>
              <div>
                <div className="mono" style={{ marginBottom: 2, fontSize: 9.5 }}>Friends</div>
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 500 }}>
                  {friendCount}
                </div>
              </div>
              {fmtHomeBase(member.home_base_code) && (
                <div>
                  <div className="mono" style={{ marginBottom: 2, fontSize: 9.5 }}>Home base</div>
                  <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 500 }}>
                    {fmtHomeBase(member.home_base_code)}
                  </div>
                </div>
              )}
              {/* Friend action — only on someone else's profile */}
              {meId && meId !== member.id && (
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <FriendAction
                    friendship={friendship}
                    meId={meId}
                    busy={friendBusy}
                    onSend={sendRequest}
                    onAccept={acceptRequest}
                    onDecline={declineRequest}
                    onRemove={removeFriendship}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="two-col">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Bio */}
            {member.bio && (
              <div className="panel">
                <div className="panel-head">
                  <h3>About</h3>
                </div>
                <div style={{ padding: '16px 20px' }}>
                  <p style={{
                    fontSize: 14,
                    lineHeight: 1.65,
                    color: 'var(--ink-soft)',
                    margin: 0,
                  }}>
                    {member.bio}
                  </p>
                </div>
              </div>
            )}

            {/* Contact panel — visible only on other members' profiles. */}
            {meId && meId !== member.id && (
              <div className="panel">
                <div className="panel-head">
                  <h3>Contact</h3>
                  {outgoingContact?.status === 'granted' && (
                    <span className="pill tropic">Shared</span>
                  )}
                  {outgoingContact?.status === 'pending' && (
                    <span className="pill" style={{ background: 'var(--warm)', color: 'var(--ink-mid)' }}>
                      Pending
                    </span>
                  )}
                </div>
                <div style={{ padding: '16px 20px' }}>
                  {/* Incoming: they asked me — surface accept/decline up top */}
                  {incomingContact?.status === 'pending' && (
                    <div style={{
                      background: 'var(--warm)',
                      borderLeft: '3px solid var(--sun-d)',
                      borderRadius: '0 6px 6px 0',
                      padding: '10px 14px',
                      marginBottom: 14,
                    }}>
                      <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 8 }}>
                        <strong>{member.name.split(' ')[0]}</strong> is asking to see your contact info.
                        {incomingContact.note && (
                          <div style={{ fontStyle: 'italic', marginTop: 6, color: 'var(--ink-mid)' }}>
                            “{incomingContact.note}”
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" className="cta-outline" onClick={grantContact} disabled={contactBusy}>
                          Share
                        </button>
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={declineContact}
                          disabled={contactBusy}
                          style={{ fontSize: 12, padding: '6px 12px' }}
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  )}
                  {incomingContact?.status === 'granted' && (
                    <div style={{
                      fontSize: 11.5,
                      color: 'var(--ink-light)',
                      marginBottom: 12,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                    }}>
                      <span>You shared your contact details with {member.name.split(' ')[0]}.</span>
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={revokeContact}
                        disabled={contactBusy}
                        style={{ fontSize: 11, padding: '4px 10px', height: 26 }}
                      >
                        Revoke
                      </button>
                    </div>
                  )}

                  {/* Outgoing: my view of their contact */}
                  {outgoingContact?.status === 'granted' && contact ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {contact.email && (
                        <a href={`mailto:${contact.email}`} className="contact-row">
                          <span className="contact-row__icon">
                            <svg width="14" height="14" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="5" width="16" height="13" rx="2" />
                              <path d="M3 6l8 6 8-6" />
                            </svg>
                          </span>
                          <span>{contact.email}</span>
                        </a>
                      )}
                      {contact.phone && (
                        <a href={`tel:${contact.phone}`} className="contact-row">
                          <span className="contact-row__icon">
                            <svg width="14" height="14" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M5 4.5h3l1.5 4-2 1.5a10 10 0 0 0 4.5 4.5l1.5-2 4 1.5v3a2 2 0 0 1-2 2A14 14 0 0 1 3 6.5a2 2 0 0 1 2-2z" />
                            </svg>
                          </span>
                          <span>{contact.phone}</span>
                        </a>
                      )}
                      {!contact.email && !contact.phone && (
                        <p style={{ fontSize: 12.5, color: 'var(--ink-faint)', margin: 0 }}>
                          {member.name.split(' ')[0]} hasn't filled in their contact details yet.
                        </p>
                      )}
                    </div>
                  ) : outgoingContact?.status === 'pending' ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <p style={{ fontSize: 12.5, color: 'var(--ink-mid)', margin: 0 }}>
                        Waiting on {member.name.split(' ')[0]} to share their contact info.
                      </p>
                      <button
                        type="button"
                        onClick={withdrawContactRequest}
                        disabled={contactBusy}
                        className="btn-ghost"
                        style={{ fontSize: 11, padding: '4px 10px', height: 26 }}
                      >
                        Withdraw
                      </button>
                    </div>
                  ) : outgoingContact?.status === 'declined' ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <p style={{ fontSize: 12.5, color: 'var(--ink-faint)', margin: 0 }}>
                        {member.name.split(' ')[0]} declined to share their contact.
                      </p>
                      <button
                        type="button"
                        onClick={withdrawContactRequest}
                        disabled={contactBusy}
                        className="btn-ghost"
                        style={{ fontSize: 11, padding: '4px 10px', height: 26 }}
                      >
                        Clear
                      </button>
                    </div>
                  ) : outgoingContact?.status === 'revoked' ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <p style={{ fontSize: 12.5, color: 'var(--ink-faint)', margin: 0 }}>
                        Access revoked. Send a new request to ask again.
                      </p>
                      <button
                        type="button"
                        onClick={withdrawContactRequest}
                        disabled={contactBusy}
                        className="btn-ghost"
                        style={{ fontSize: 11, padding: '4px 10px', height: 26 }}
                      >
                        Clear
                      </button>
                    </div>
                  ) : askingContact ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <label className="mono" style={{ fontSize: 9.5 }}>
                        Optional note ({contactNote.length}/200)
                      </label>
                      <textarea
                        value={contactNote}
                        onChange={e => setContactNote(e.target.value.slice(0, 200))}
                        placeholder={`Hey ${member.name.split(' ')[0]}, would love to coordinate on the Marsh Harbour trip…`}
                        rows={3}
                        style={{
                          width: '100%',
                          padding: 10,
                          fontSize: 13,
                          fontFamily: 'var(--ui)',
                          border: '1px solid var(--hair)',
                          borderRadius: 8,
                          background: 'var(--paper)',
                          color: 'var(--ink)',
                          resize: 'vertical',
                          minHeight: 60,
                        }}
                      />
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => { setAskingContact(false); setContactNote('') }}
                          disabled={contactBusy}
                          style={{ fontSize: 12, padding: '6px 12px' }}
                        >
                          Cancel
                        </button>
                        <button type="button" className="cta-outline" onClick={sendContactRequest} disabled={contactBusy}>
                          {contactBusy ? 'Sending…' : 'Send request'}
                        </button>
                      </div>
                    </div>
                  ) : (member as Member & { accepts_contact_requests?: boolean }).accepts_contact_requests === false ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', background: 'var(--warm)', color: 'var(--ink-light)' }}>
                        <svg width="13" height="13" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="5" y="10" width="12" height="9" rx="1.5" />
                          <path d="M7.5 10V7a3.5 3.5 0 0 1 7 0v3" />
                        </svg>
                      </span>
                      <p style={{ fontSize: 12.5, color: 'var(--ink-mid)', margin: 0, lineHeight: 1.5, flex: 1 }}>
                        {member.name.split(' ')[0]} keeps contact private. Coordinate through{' '}
                        <Link href="/contact" style={{ color: 'var(--tropic-d)', textDecoration: 'underline' }}>your concierge</Link>.
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <p style={{ fontSize: 12.5, color: 'var(--ink-mid)', margin: 0, lineHeight: 1.5 }}>
                        Contact details are private. Request to see {member.name.split(' ')[0]}'s email and phone.
                      </p>
                      <button type="button" className="cta-outline" onClick={() => setAskingContact(true)}>
                        Request contact info
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Interests */}
            {canonicalInterests(member.interests).length > 0 && (
              <div className="panel">
                <div className="panel-head">
                  <h3>Interests</h3>
                </div>
                <div style={{ padding: '16px 20px' }}>
                  <div className="chips">
                    {canonicalInterests(member.interests).map(interest => (
                      <span key={interest} className="chip active" style={{ cursor: 'default', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ display: 'flex', width: 14, height: 14 }}>{TRIP_TYPE_ICONS[interest]}</span>
                        {interest}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Trip history */}
            <div className="panel">
              <div className="panel-head">
                <h3>Trip history</h3>
                <span className="mono" style={{ fontSize: 9.5 }}>
                  {approvedTrips.length} trip{approvedTrips.length !== 1 ? 's' : ''} taken
                </span>
              </div>
              {approvedTrips.length === 0 ? (
                <div style={{ padding: '28px 20px', textAlign: 'center' }}>
                  <p style={{ fontSize: 13, color: 'var(--ink-faint)', margin: 0 }}>
                    No confirmed trips yet.
                  </p>
                </div>
              ) : (
                <div>
                  {approvedTrips.map((b, i) => (
                    <div
                      key={b.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 16,
                        padding: '12px 20px',
                        borderBottom: i < approvedTrips.length - 1 ? '1px solid var(--hair)' : 'none',
                      }}
                    >
                      <div style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        background: 'var(--night)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        <svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="var(--tropic)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 13l7-1 3-7h2l-1 7 5-1 1 1.5-5 3-1 4-2 .5-1-3.5-3 0-1 .5z" />
                        </svg>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13.5,
                          fontWeight: 500,
                          color: 'var(--ink)',
                          marginBottom: 2,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}>
                          {b.itemName || `${b.item_kind} booking`}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--ink-light)' }}>
                          {b.itemOrigin && b.itemDest
                            ? `${b.itemOrigin} → ${b.itemDest}`
                            : b.itemOrigin || ''}
                        </div>
                      </div>
                      <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-faint)', flexShrink: 0 }}>
                        {formatDate(b.submitted_at)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right rail — friends + recent posts */}
          <div className="rail">
            {friends.length > 0 && (
              <div className="panel" style={{ marginBottom: 20 }}>
                <div className="panel-head">
                  <h3>Friends</h3>
                  <span className="mono" style={{ fontSize: 9.5 }}>{friendCount}</span>
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))',
                  gap: 12,
                  padding: '14px 18px',
                }}>
                  {friends.map(f => (
                    <Link
                      key={f.id}
                      href={`/network/${f.id}`}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 4,
                        textDecoration: 'none',
                        color: 'inherit',
                      }}
                    >
                      <Avatar member={f} size={42} />
                      <span style={{
                        fontSize: 10.5,
                        color: 'var(--ink-mid)',
                        textAlign: 'center',
                        lineHeight: 1.2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 1,
                        WebkitBoxOrient: 'vertical' as const,
                        maxWidth: '100%',
                      }}>
                        {f.name.split(' ')[0]}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="panel">
              <div className="panel-head">
                <h3>Recent posts</h3>
              </div>
              {posts.length === 0 ? (
                <div style={{ padding: '24px 20px', textAlign: 'center' }}>
                  <p style={{ fontSize: 12.5, color: 'var(--ink-faint)', margin: 0 }}>
                    No posts yet.
                  </p>
                </div>
              ) : (
                <div>
                  {posts.map((post, i) => (
                    <div
                      key={post.id}
                      style={{
                        padding: '14px 18px',
                        borderBottom: i < posts.length - 1 ? '1px solid var(--hair)' : 'none',
                      }}
                    >
                      {post.quote && (
                        <div style={{
                          background: 'var(--warm)',
                          borderLeft: '3px solid var(--tropic)',
                          borderRadius: '0 6px 6px 0',
                          padding: '8px 12px',
                          marginBottom: 8,
                          fontSize: 12.5,
                          color: 'var(--ink-mid)',
                          fontStyle: 'italic',
                          fontFamily: 'var(--display)',
                        }}>
                          {post.quote}
                        </div>
                      )}
                      <p style={{
                        fontSize: 13,
                        color: 'var(--ink-soft)',
                        lineHeight: 1.55,
                        margin: '0 0 8px',
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical' as const,
                        overflow: 'hidden',
                      }}>
                        {post.body}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span className="pill" style={{ textTransform: 'capitalize' }}>
                          {post.kind.replace('_', ' ')}
                        </span>
                        <span className="mono" style={{ fontSize: 9.5 }}>
                          {timeAgo(post.created_at)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
