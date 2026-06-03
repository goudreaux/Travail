'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Member } from '@/lib/supabase/types'

// "Invite to split" — let a member invite others to grab seats on an open trip
// or proposal. Opens a picker of network members and notifies the ones chosen.
export default function InviteToSplit({ kind, itemId, itemName }: {
  kind: 'flight' | 'excursion' | 'proposal'
  itemId: string
  itemName: string
}) {
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [members, setMembers] = useState<Pick<Member, 'id' | 'name' | 'initials' | 'avatar_url'>[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')
  const [search, setSearch] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState<number | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || members.length) return
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: me } = user ? await supabase.from('members').select('id').eq('user_id', user.id).maybeSingle() : { data: null }
      const { data } = await supabase.from('members').select('id, name, initials, avatar_url, tier').order('name')
      const list = ((data ?? []) as (Member & { tier: string })[])
        .filter(m => m.tier !== 'administrator' && m.id !== me?.id)
        .map(m => ({ id: m.id, name: m.name, initials: m.initials, avatar_url: m.avatar_url }))
      setMembers(list)
    })()
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function send() {
    if (sending || selected.size === 0) return
    setSending(true); setError('')
    try {
      const res = await fetch('/api/invite-split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, itemId, itemName, memberIds: [...selected], note: note.trim() || undefined }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to send invites')
      setDone(json.invited ?? selected.size)
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed') }
    finally { setSending(false) }
  }

  const q = search.trim().toLowerCase()
  const visible = q ? members.filter(m => m.name.toLowerCase().includes(q)) : members

  return (
    <>
      <button type="button" className="btn-ghost" onClick={() => setOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
        <svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 14a4 4 0 1 0-4-4M3 19a5 5 0 0 1 10 0M18 8v4M20 10h-4" />
        </svg>
        Invite to split
      </button>

      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(13,51,64,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200, padding: 0 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', borderRadius: '18px 18px 0 0', width: '100%', maxWidth: 520, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 -8px 40px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '16px 20px 10px', borderBottom: '1px solid var(--hair)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: 19, fontWeight: 600, color: 'var(--ink)' }}>Invite to split</div>
                <button className="btn-ghost" onClick={() => setOpen(false)} style={{ fontSize: 18, padding: 4 }}>×</button>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-light)', marginTop: 2 }}>Pick members to invite onto <strong style={{ color: 'var(--ink-soft)' }}>{itemName}</strong>. They&rsquo;ll get a notification to grab a seat.</div>
            </div>

            {done !== null ? (
              <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>🎉</div>
                <div style={{ fontFamily: 'var(--display)', fontSize: 20, color: 'var(--ink)', marginBottom: 6 }}>Invited {done} {done === 1 ? 'member' : 'members'}</div>
                <p style={{ fontSize: 13, color: 'var(--ink-light)', margin: '0 0 18px' }}>They&rsquo;ll see your invite in their notifications.</p>
                <button className="btn-primary" onClick={() => setOpen(false)}>Done</button>
              </div>
            ) : (
              <>
                <div style={{ padding: '10px 20px' }}>
                  <input className="input" placeholder="Search members…" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px' }}>
                  {visible.map(m => {
                    const on = selected.has(m.id)
                    return (
                      <button key={m.id} type="button" onClick={() => toggle(m.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: '10px 8px', borderRadius: 10, border: 'none', background: on ? 'var(--tropic-glow)' : 'transparent', cursor: 'pointer' }}>
                        {m.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.avatar_url} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                        ) : (
                          <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--night)', color: 'var(--tropic)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{m.initials}</div>
                        )}
                        <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>{m.name}</span>
                        <span style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${on ? 'var(--tropic)' : 'var(--hair-2)'}`, background: on ? 'var(--tropic)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {on && <svg width="11" height="11" viewBox="0 0 22 22" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 11l4 4 8-8" /></svg>}
                        </span>
                      </button>
                    )
                  })}
                  {visible.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-light)', fontSize: 13 }}>No members found.</div>}
                </div>
                <div style={{ padding: '12px 20px calc(env(safe-area-inset-bottom) + 16px)', borderTop: '1px solid var(--hair)' }}>
                  <input className="input" placeholder="Add a note (optional)" value={note} onChange={e => setNote(e.target.value)} style={{ marginBottom: 10 }} />
                  {error && <div style={{ fontSize: 12.5, color: 'var(--signal)', marginBottom: 8 }}>{error}</div>}
                  <button className="btn-primary" disabled={sending || selected.size === 0} onClick={send} style={{ width: '100%' }}>
                    {sending ? 'Sending…' : selected.size === 0 ? 'Select members to invite' : `Invite ${selected.size} ${selected.size === 1 ? 'member' : 'members'}`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
