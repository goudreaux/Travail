'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  type Referral,
  type ReferralStatus,
  REFERRAL_STATUS_LABEL,
} from '@/lib/referrals'
import type { Member } from '@/lib/supabase/types'

// Ops-side referrals table — sits beside the Guests tab on People.
//
// Pending submissions surface first (they're the queue ops works each
// morning). Status can be changed inline; "Invite as member" hands the
// referral off to the existing Add Member form (prefilled), mirroring
// the guest-to-member conversion path.
export default function ReferralsPanel({ onConvert }: { onConvert: (r: Referral) => void }) {
  const supabase = createClient()
  const [referrals, setReferrals] = useState<Referral[]>([])
  const [members, setMembers] = useState<Pick<Member, 'id' | 'name'>[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusTab, setStatusTab] = useState<'pending' | 'open' | 'all'>('pending')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftNotes, setDraftNotes] = useState('')
  const [toast, setToast] = useState<{ msg: string; kind: 'success' | 'error' } | null>(null)

  const showToast = (msg: string, kind: 'success' | 'error' = 'success') => {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 3500)
  }

  const load = useCallback(async () => {
    setLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const [{ data: rData }, { data: mData }] = await Promise.all([
      db.from('referrals').select('*').order('created_at', { ascending: false }),
      supabase.from('members').select('id, name').order('name'),
    ])
    setReferrals((rData ?? []) as Referral[])
    setMembers((mData ?? []) as Pick<Member, 'id' | 'name'>[])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  const memberName = (id: string | null) => (id ? members.find(m => m.id === id)?.name ?? id : null)

  async function setStatus(r: Referral, status: ReferralStatus) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('referrals')
      .update({
        status,
        decided_at: new Date().toISOString(),
      })
      .eq('id', r.id)
    if (error) { showToast(error.message, 'error'); return }
    showToast(`Marked ${REFERRAL_STATUS_LABEL[status].toLowerCase()}`)
    load()
  }

  async function saveNotes(r: Referral) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('referrals')
      .update({ ops_notes: draftNotes.trim() || null })
      .eq('id', r.id)
    if (error) { showToast(error.message, 'error'); return }
    setEditingId(null)
    showToast('Notes saved')
    load()
  }

  async function deleteReferral(r: Referral) {
    if (!confirm(`Delete referral for ${r.first_name} ${r.last_name}? Activity log will retain the audit trail.`)) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error, data } = await (supabase as any).from('referrals').delete().eq('id', r.id).select()
    if (error) { showToast(error.message, 'error'); return }
    if (!data || data.length === 0) { showToast('Delete blocked, check the admin RLS policy on referrals', 'error'); return }
    showToast('Referral deleted')
    load()
  }

  const filtered = referrals.filter(r => {
    if (statusTab === 'pending' && r.status !== 'pending') return false
    if (statusTab === 'open' && (r.status === 'invited' || r.status === 'declined' || r.status === 'withdrawn')) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      const ref = memberName(r.referrer_id) ?? ''
      return (
        `${r.first_name} ${r.last_name}`.toLowerCase().includes(q)
        || (r.email ?? '').toLowerCase().includes(q)
        || ref.toLowerCase().includes(q)
      )
    }
    return true
  })

  const pendingCount = referrals.filter(r => r.status === 'pending').length

  const tabs: { key: typeof statusTab; label: string; urgent?: boolean }[] = [
    { key: 'pending', label: 'Pending', urgent: pendingCount > 0 },
    { key: 'open',    label: 'Open' },
    { key: 'all',     label: 'All' },
  ]

  return (
    <div>
      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
      <p style={{ fontSize: 13, color: 'var(--ink-light)', marginTop: 0, marginBottom: 14 }}>
        {referrals.length} referral{referrals.length !== 1 ? 's' : ''} submitted by members · {pendingCount} awaiting review.
      </p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setStatusTab(t.key)}
            style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 12.5,
              fontFamily: 'var(--ui)', fontWeight: statusTab === t.key ? 600 : 400,
              border: `1px solid ${statusTab === t.key ? 'var(--tropic)' : 'var(--hair-2)'}`,
              background: statusTab === t.key ? 'var(--tropic-glow)' : 'transparent',
              color: statusTab === t.key
                ? 'var(--tropic-d)'
                : (t.urgent ? 'var(--signal)' : 'var(--ink-light)'),
              cursor: 'pointer',
            }}
          >
            {t.label}{t.urgent && t.key === 'pending' && pendingCount > 0 ? ` · ${pendingCount}` : ''}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 14 }}>
        <input
          className="input"
          style={{ maxWidth: 320 }}
          placeholder="Search by name, email, or referrer…"
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
                <th>Prospect</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Referred by</th>
                <th>Status</th>
                <th>Submitted</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const expanded = editingId === r.id
                return (
                  <>
                    <tr key={r.id}>
                      <td style={{ fontWeight: 500, color: 'var(--ink)' }}>{r.first_name} {r.last_name}</td>
                      <td style={{ fontSize: 13 }}>{r.email}</td>
                      <td style={{ fontSize: 13 }}>{r.phone || '—'}</td>
                      <td style={{ fontSize: 13 }}>{memberName(r.referrer_id) ?? '—'}</td>
                      <td>
                        <select
                          className="input"
                          value={r.status}
                          onChange={e => setStatus(r, e.target.value as ReferralStatus)}
                          style={{ fontSize: 12, height: 28, padding: '0 6px' }}
                        >
                          {(Object.keys(REFERRAL_STATUS_LABEL) as ReferralStatus[]).map(s => (
                            <option key={s} value={s}>{REFERRAL_STATUS_LABEL[s]}</option>
                          ))}
                        </select>
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-light)' }}>
                        {new Date(r.created_at).toLocaleDateString()}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {r.status !== 'invited' && r.status !== 'declined' && r.status !== 'withdrawn' && (
                          <button className="btn-ghost" style={{ height: 28, padding: '0 10px', fontSize: 12 }} onClick={() => onConvert(r)}>
                            Invite →
                          </button>
                        )}
                        <button
                          className="btn-ghost"
                          style={{ height: 28, padding: '0 10px', fontSize: 12, marginLeft: 6 }}
                          onClick={() => {
                            if (expanded) { setEditingId(null) }
                            else { setEditingId(r.id); setDraftNotes(r.ops_notes ?? '') }
                          }}
                        >
                          {expanded ? 'Close' : 'Details'}
                        </button>
                        <button className="btn-ghost" style={{ height: 28, padding: '0 10px', fontSize: 12, marginLeft: 6, color: 'var(--signal)' }} onClick={() => deleteReferral(r)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr key={r.id + '-detail'}>
                        <td colSpan={7} style={{ background: 'var(--paper)', padding: '14px 18px' }}>
                          {r.why && (
                            <div style={{ marginBottom: 10 }}>
                              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-light)', fontWeight: 600, marginBottom: 4 }}>
                                Why they&apos;d be a fit (from the member)
                              </div>
                              <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{r.why}</div>
                            </div>
                          )}
                          <div className="field" style={{ marginBottom: 8 }}>
                            <label className="field-lab">Ops notes</label>
                            <textarea
                              className="input"
                              rows={3}
                              value={draftNotes}
                              onChange={e => setDraftNotes(e.target.value)}
                              placeholder="Conversation context, follow-ups, decision rationale…"
                            />
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn-primary" onClick={() => saveNotes(r)} style={{ height: 32, fontSize: 12 }}>Save notes</button>
                            <button className="btn-ghost" onClick={() => setEditingId(null)} style={{ height: 32, fontSize: 12 }}>Cancel</button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--ink-light)', fontSize: 13 }}>
              {referrals.length === 0 ? 'No referrals yet.' : 'No referrals match this filter.'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
