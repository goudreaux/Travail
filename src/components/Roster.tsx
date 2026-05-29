'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useFriendIds } from '@/lib/use-friend-ids'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Friendship, ContactRequest } from '@/lib/supabase/types'

export type RosterEntry = {
  item_id: string
  member_id: string
  name: string
  initials: string
  avatar_url: string | null
  seats: number
}

// Fetch opted-in rosters for a set of trips in one call. Returns a map keyed by
// item_id. Never throws — an empty map just means no roster shown.
export async function fetchRosters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  itemKind: 'flight' | 'excursion',
  itemIds: string[],
): Promise<Record<string, RosterEntry[]>> {
  const out: Record<string, RosterEntry[]> = {}
  const ids = [...new Set(itemIds)].filter(Boolean)
  if (!ids.length) return out
  try {
    const { data, error } = await supabase.rpc('trip_roster', { p_item_kind: itemKind, p_item_ids: ids })
    if (error) return out
    for (const r of (data ?? []) as RosterEntry[]) (out[r.item_id] ??= []).push(r)
  } catch { /* roster is supplementary */ }
  return out
}

function AvatarDot({ entry, size, isFriend = false }: { entry: RosterEntry; size: number; isFriend?: boolean }) {
  // Wrap in a span so the friend ring + glow sit *outside* the avatar
  // without offsetting layout; the inner avatar (img or initials) stays
  // sized the same as before so stacks line up cleanly.
  const wrapClass = isFriend ? 'roster-dot is-friend' : 'roster-dot'
  if (entry.avatar_url) {
    return (
      <span className={wrapClass} title={isFriend ? `${entry.name} · Friend` : undefined}>
        <img
          src={entry.avatar_url}
          alt={entry.name}
          style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', display: 'block', border: '2px solid var(--paper)' }}
        />
      </span>
    )
  }
  return (
    <span className={wrapClass} title={isFriend ? `${entry.name} · Friend` : undefined}>
      <span style={{
        width: size, height: size, borderRadius: '50%',
        background: 'var(--night)', color: 'var(--tropic)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--mono)', fontSize: size * 0.34, fontWeight: 700,
        border: '2px solid var(--paper)',
      }}>
        {entry.initials}
      </span>
    </span>
  )
}

// Compact overlapping avatar stack for the board cards.
export function RosterStack({ entries, max = 4, occupied }: { entries: RosterEntry[]; max?: number; occupied?: number }) {
  const friendIds = useFriendIds()
  const shown = entries.slice(0, max)
  const extra = entries.length - shown.length
  const totalSeats = entries.reduce((s, e) => s + e.seats, 0)
  // Everyone aboard who isn't a named (public) member — their guests AND members
  // who kept their booking private — all teased together as "others".
  const others = occupied != null
    ? Math.max(0, occupied - entries.length)
    : Math.max(0, totalSeats - entries.length)

  if (!entries.length && others === 0) return null

  // Surface a friend that's hiding past the `max` cutoff: if a friend is
  // on the trip but not in the visible stack, swap them into the slot of
  // the last shown non-friend so the gold ring is always visible.
  const friendsInShown = shown.some(e => friendIds.has(e.member_id))
  const hiddenFriend = !friendsInShown
    ? entries.slice(max).find(e => friendIds.has(e.member_id))
    : null
  const display = hiddenFriend
    ? [...shown.slice(0, -1), hiddenFriend]
    : shown
  const anyFriend = display.some(e => friendIds.has(e.member_id))

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }} title={entries.length ? `${entries.map(e => e.name).join(', ')} on this trip` : 'Members going'}>
      <div style={{ display: 'flex' }}>
        {display.map((e, i) => (
          <div key={e.member_id} style={{ marginLeft: i === 0 ? 0 : -8, zIndex: display.length - i }}>
            <AvatarDot entry={e} size={24} isFriend={friendIds.has(e.member_id)} />
          </div>
        ))}
        {extra > 0 && (
          <div style={{
            marginLeft: -8, width: 24, height: 24, borderRadius: '50%',
            background: 'var(--warm)', color: 'var(--ink-mid)', border: '2px solid var(--paper)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700,
          }}>
            +{extra}
          </div>
        )}
        {/* All-private trip: a faceless avatar so "people are going" still reads. */}
        {entries.length === 0 && others > 0 && (
          <div style={{
            width: 24, height: 24, borderRadius: '50%',
            background: 'var(--warm)', border: '2px solid var(--paper)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-light)',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="8.5" r="3.4" />
              <path d="M5.5 19.5c0-3.4 3-5 6.5-5s6.5 1.6 6.5 5" />
            </svg>
          </div>
        )}
      </div>
      {others > 0 && (
        <span style={{ fontSize: 11, color: 'var(--ink-light)', fontFamily: 'var(--mono)', letterSpacing: '0.03em' }}>
          +{others} other{others !== 1 ? 's' : ''}
        </span>
      )}
      {anyFriend && (
        <span className="roster-friend-flag" title="A friend is on this trip">
          <svg width="9" height="9" viewBox="0 0 22 22" fill="currentColor" aria-hidden>
            <path d="M11 2.5l2.6 5.3 5.9.9-4.3 4.2 1 5.8L11 16l-5.3 2.7 1-5.8L2.5 8.7l5.9-.9z" />
          </svg>
          Friend going
        </span>
      )}
    </div>
  )
}

// Co-passenger list with quick-connect actions — friend status pill +
// contact request affordance per row. Lighter than the full profile UI;
// the row links through to the profile for the full experience.
export function CoPassengerList({ entries, meId }: { entries: RosterEntry[]; meId: string | null }) {
  const others = entries.filter(e => e.member_id !== meId)
  const [friendships, setFriendships] = useState<Friendship[]>([])
  const [contacts, setContacts] = useState<ContactRequest[]>([])
  const [acceptsContact, setAcceptsContact] = useState<Record<string, boolean>>({})
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!meId || others.length === 0) return
    const supabase = createClient()
    const ids = others.map(o => o.member_id)

    const orFs = ids.map(id => `and(requester_id.eq.${meId},addressee_id.eq.${id}),and(requester_id.eq.${id},addressee_id.eq.${meId})`).join(',')
    const [{ data: fs }, { data: cr }, { data: members }] = await Promise.all([
      supabase.from('friendships').select('*').or(orFs),
      supabase
        .from('contact_requests')
        .select('*')
        .or(`and(requester_id.eq.${meId},addressee_id.in.(${ids.join(',')})),and(addressee_id.eq.${meId},requester_id.in.(${ids.join(',')}))`),
      supabase.from('members').select('id,accepts_contact_requests').in('id', ids),
    ])
    setFriendships((fs as Friendship[]) ?? [])
    setContacts((cr as ContactRequest[]) ?? [])
    const acc: Record<string, boolean> = {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const m of ((members ?? []) as any[])) acc[m.id] = m.accepts_contact_requests !== false
    setAcceptsContact(acc)
  }, [meId, others])

  useEffect(() => { load() }, [load])

  if (others.length === 0) {
    return <div style={{ fontSize: 13, color: 'var(--ink-light)' }}>No one else has shared their spot yet.</div>
  }

  async function addFriend(otherId: string) {
    if (!meId || busyId) return
    setBusyId(otherId)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from('friendships') as any)
      .insert({ requester_id: meId, addressee_id: otherId, status: 'pending' })
      .select()
      .single()
    if (data) setFriendships(prev => [...prev, data as Friendship])
    setBusyId(null)
  }

  async function requestContact(otherId: string) {
    if (!meId || busyId) return
    setBusyId(otherId)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from('contact_requests') as any)
      .insert({ requester_id: meId, addressee_id: otherId, status: 'pending' })
      .select()
      .single()
    if (data) setContacts(prev => [...prev, data as ContactRequest])
    setBusyId(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {others.map(e => {
        const fs = friendships.find(f =>
          (f.requester_id === meId && f.addressee_id === e.member_id) ||
          (f.requester_id === e.member_id && f.addressee_id === meId)
        )
        const cr = contacts.find(c =>
          c.requester_id === meId && c.addressee_id === e.member_id
        )
        const isPrivate = acceptsContact[e.member_id] === false
        const isFriend = fs?.status === 'accepted'
        const friendPending = fs?.status === 'pending' && fs.requester_id === meId
        const friendIncoming = fs?.status === 'pending' && fs.addressee_id === meId
        const contactGranted = cr?.status === 'granted'
        const contactPending = cr?.status === 'pending'

        return (
          <div
            key={e.member_id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '8px 0',
              borderBottom: '1px solid var(--hair)',
            }}
          >
            <Link
              href={`/network/${e.member_id}`}
              style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flex: 1, minWidth: 0 }}
            >
              <AvatarDot entry={e} size={36} isFriend={isFriend} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {e.name}{e.seats > 1 ? <span style={{ color: 'var(--ink-light)', fontWeight: 400 }}> +{e.seats - 1}</span> : null}
                </div>
              </div>
            </Link>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
              {/* Friend chip */}
              {isFriend ? (
                <span className="copax-chip copax-chip--friend" title="Friends">
                  <svg width="11" height="11" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="4 11 9 16 18 6" />
                  </svg>
                </span>
              ) : friendPending ? (
                <span className="copax-chip copax-chip--muted" title="Friend request pending">…</span>
              ) : friendIncoming ? (
                <Link href={`/network/${e.member_id}`} className="copax-chip copax-chip--action" title="Respond to friend request">
                  Respond
                </Link>
              ) : (
                <button
                  type="button"
                  className="copax-chip copax-chip--action"
                  onClick={() => addFriend(e.member_id)}
                  disabled={busyId === e.member_id}
                  title="Add friend"
                  aria-label={`Add ${e.name} as friend`}
                >
                  +
                </button>
              )}
              {/* Contact chip */}
              {contactGranted ? (
                <Link href={`/network/${e.member_id}`} className="copax-chip copax-chip--friend" title="Contact shared">
                  <svg width="11" height="11" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="5" width="16" height="13" rx="2" />
                    <path d="M3 6l8 6 8-6" />
                  </svg>
                </Link>
              ) : contactPending ? (
                <span className="copax-chip copax-chip--muted" title="Contact request pending">…</span>
              ) : isPrivate ? (
                <span className="copax-chip copax-chip--quiet" title="Private, connect through Ops">
                  <svg width="11" height="11" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="5" y="10" width="12" height="9" rx="1.5" />
                    <path d="M7.5 10V7a3.5 3.5 0 0 1 7 0v3" />
                  </svg>
                </span>
              ) : (
                <button
                  type="button"
                  className="copax-chip copax-chip--action"
                  onClick={() => requestContact(e.member_id)}
                  disabled={busyId === e.member_id}
                  title="Request contact info"
                  aria-label={`Request contact info from ${e.name}`}
                >
                  <svg width="11" height="11" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="5" width="16" height="13" rx="2" />
                    <path d="M3 6l8 6 8-6" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Full roster with names + links to member cards (trip detail page).
export function RosterList({ entries }: { entries: RosterEntry[] }) {
  const friendIds = useFriendIds()
  if (!entries.length) {
    return <div style={{ fontSize: 13, color: 'var(--ink-light)' }}>No one has shared their spot yet. Be the first.</div>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {entries.map(e => (
        <Link
          key={e.member_id}
          href={`/network/${e.member_id}`}
          style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' }}
        >
          <AvatarDot entry={e} size={34} isFriend={friendIds.has(e.member_id)} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>
              {e.name}{e.seats > 1 ? <span style={{ color: 'var(--ink-light)', fontWeight: 400 }}> +{e.seats - 1}</span> : null}
            </div>
          </div>
          <span style={{ fontSize: 11.5, color: 'var(--tropic-d)', fontWeight: 500 }}>View →</span>
        </Link>
      ))}
    </div>
  )
}
