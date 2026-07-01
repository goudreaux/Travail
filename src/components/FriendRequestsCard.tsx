'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useMember } from '@/lib/member-context'
import { fmtHomeBase } from '@/lib/data'
import type { Member, Friendship } from '@/lib/supabase/types'

// Inbound friend requests, surfaced on the Feed so they're impossible to
// miss. The Network page has the same panel, but on mobile it sits two taps
// deep behind "More" → Network — which is why incoming requests felt
// invisible. Accept / Decline act inline here; the shared
// `travail:pending-friend-count` event keeps the nav badges in sync.

interface PendingRequest {
  friendshipId: string
  requester: Member
}

export default function FriendRequestsCard() {
  const { member, loading: memberLoading } = useMember()
  const [pending, setPending] = useState<PendingRequest[]>([])
  const [deciding, setDeciding] = useState<string | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (memberLoading || !member?.id) return
    let cancelled = false
    const myId = member.id

    async function load() {
      const supabase = createClient()
      // Pending requests addressed to me, newest first.
      const { data: rows } = await supabase
        .from('friendships')
        .select('id,requester_id,addressee_id,status,created_at')
        .eq('addressee_id', myId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      const fs = (rows ?? []) as Friendship[]
      if (fs.length === 0) { if (!cancelled) setPending([]); return }

      // Resolve requester profiles directly by id — not via the directory
      // list, so a private-mode (or otherwise unlisted) requester still
      // shows up here instead of silently vanishing.
      const ids = [...new Set(fs.map(f => f.requester_id))]
      const { data: people } = await supabase
        .from('members').select('*').in('id', ids)
      const byId: Record<string, Member> = {}
      for (const m of (people ?? []) as Member[]) byId[m.id] = m

      if (cancelled) return
      setPending(
        fs.map(f => ({ friendshipId: f.id, requester: byId[f.requester_id] }))
          .filter((p): p is PendingRequest => !!p.requester),
      )
    }
    load()
    return () => { cancelled = true }
  }, [member?.id, memberLoading])

  async function respond(friendshipId: string, action: 'accepted' | 'declined') {
    if (deciding) return
    setDeciding(friendshipId)
    setErr('')
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from('friendships') as any).update({ status: action }).eq('id', friendshipId)
    if (error) {
      // The write failed (offline / RLS) — keep the row rather than
      // optimistically dropping it and desyncing the nav badge.
      setErr('That didn’t go through — check your connection and try again.')
      setDeciding(null)
      return
    }
    // Compute the next list outside setState (updaters must be pure), then
    // broadcast the new count so the sidebar / mobile-nav badges stay in sync.
    const next = pending.filter(p => p.friendshipId !== friendshipId)
    setPending(next)
    try {
      localStorage.setItem('travail.pending_friend_count', String(next.length))
      window.dispatchEvent(new CustomEvent('travail:pending-friend-count', { detail: next.length }))
    } catch { /* ignore */ }
    setDeciding(null)
  }

  if (pending.length === 0) return null

  return (
    <div className="pending-friends panel" aria-label="Pending friend requests" style={{ marginBottom: 16 }}>
      <div className="pending-friends__head">
        <div>
          <div className="pending-friends__title">Friend request{pending.length > 1 ? 's' : ''}</div>
          <div className="pending-friends__sub">
            {pending.length === 1
              ? `${pending[0].requester.name.split(' ')[0]} wants to connect`
              : `${pending.length} members want to connect`}
          </div>
        </div>
        <span className="pill signal" style={{ flexShrink: 0 }}>{pending.length}</span>
      </div>
      {err && <div style={{ fontSize: 12, color: 'var(--danger)', padding: '0 2px 6px' }}>{err}</div>}
      <div className="pending-friends__list">
        {pending.map(p => (
          <div key={p.friendshipId} className="pending-friends__row">
            <Link href={`/network/${p.requester.id}`} className="pending-friends__who">
              {p.requester.avatar_url ? (
                <img
                  src={p.requester.avatar_url}
                  alt={p.requester.name}
                  style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                />
              ) : (
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'var(--night)', color: 'var(--tropic)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700,
                  flexShrink: 0,
                }}>
                  {p.requester.initials}
                </div>
              )}
              <div style={{ minWidth: 0 }}>
                <div className="pending-friends__name">{p.requester.name}</div>
                {fmtHomeBase(p.requester.home_base_code) && (
                  <div className="pending-friends__meta">{fmtHomeBase(p.requester.home_base_code)}</div>
                )}
              </div>
            </Link>
            <div className="pending-friends__actions">
              <button
                type="button"
                className="cta-outline"
                onClick={() => respond(p.friendshipId, 'accepted')}
                disabled={deciding === p.friendshipId}
              >
                Accept
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => respond(p.friendshipId, 'declined')}
                disabled={deciding === p.friendshipId}
                style={{ fontSize: 12, padding: '6px 12px' }}
              >
                Decline
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
