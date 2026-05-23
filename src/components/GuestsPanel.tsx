'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Guest } from '@/lib/guests'
import type { Member } from '@/lib/supabase/types'

// Guests management, rendered as the "Guests" tab of the People page.
export default function GuestsPanel({ onConvert }: { onConvert: (g: Guest) => void }) {
  const supabase = createClient()
  const [guests, setGuests] = useState<Guest[]>([])
  const [members, setMembers] = useState<Pick<Member, 'id' | 'name'>[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<{ msg: string; kind: 'success' | 'error' } | null>(null)

  const showToast = (msg: string, kind: 'success' | 'error' = 'success') => {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 3500)
  }

  const load = useCallback(async () => {
    setLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const [{ data: guestData }, { data: memberData }] = await Promise.all([
      db.from('guests').select('*').order('created_at', { ascending: false }),
      supabase.from('members').select('id, name').order('name'),
    ])
    setGuests((guestData ?? []) as Guest[])
    setMembers((memberData ?? []) as Pick<Member, 'id' | 'name'>[])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const memberName = (id: string | null) => (id ? members.find(m => m.id === id)?.name ?? id : null)

  const filtered = guests.filter(g => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      `${g.first_name} ${g.last_name}`.toLowerCase().includes(q) ||
      (g.email ?? '').toLowerCase().includes(q) ||
      (memberName(g.host_member_id) ?? '').toLowerCase().includes(q)
    )
  })

  async function deleteGuest(g: Guest) {
    if (!confirm(`Delete ${g.first_name} ${g.last_name} from the guest list? Past bookings keep their passenger record.`)) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error, data } = await (supabase as any).from('guests').delete().eq('id', g.id).select()
    if (error) { showToast(error.message, 'error'); return }
    if (!data || data.length === 0) { showToast('Delete blocked — check the admin RLS policy on guests', 'error'); return }
    showToast('Guest deleted')
    load()
  }

  const linkedCount = guests.filter(g => g.member_id).length

  return (
    <div>
      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
      <p style={{ fontSize: 13, color: 'var(--ink-light)', marginTop: 0, marginBottom: 16 }}>
        {guests.length} guest{guests.length !== 1 ? 's' : ''} registered by members · {linkedCount} linked to a member.{' '}
        <span style={{ fontStyle: 'italic' }}>Convert a guest to seed a member profile from their info.</span>
      </p>

      <div style={{ marginBottom: 16 }}>
        <input
          className="input"
          style={{ maxWidth: 320 }}
          placeholder="Search by name, email, or host…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--ink-light)', fontSize: 14 }}>Loading…</div>
      ) : (
        <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 12, overflow: 'hidden' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Registered by</th>
                <th>Status</th>
                <th>Added</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(g => (
                <tr key={g.id}>
                  <td style={{ fontWeight: 500, color: 'var(--ink)' }}>{g.first_name} {g.last_name}</td>
                  <td style={{ fontSize: 13 }}>{g.email || '—'}</td>
                  <td style={{ fontSize: 13 }}>{g.phone || '—'}</td>
                  <td style={{ fontSize: 13 }}>{memberName(g.host_member_id) ?? '—'}</td>
                  <td>{g.member_id ? <span className="pill tropic">Member</span> : <span className="pill ink">Guest</span>}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-light)' }}>
                    {new Date(g.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {!g.member_id && (
                      <button className="btn-ghost" style={{ height: 28, padding: '0 10px', fontSize: 12 }} onClick={() => onConvert(g)}>
                        Convert to member
                      </button>
                    )}
                    <button className="btn-ghost" style={{ height: 28, padding: '0 10px', fontSize: 12, marginLeft: 6, color: 'var(--signal)' }} onClick={() => deleteGuest(g)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--ink-light)', fontSize: 13 }}>
              {guests.length === 0 ? 'No guests registered yet.' : 'No guests match your search.'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
