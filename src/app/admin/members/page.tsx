'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Member } from '@/lib/supabase/types'

type EditForm = {
  name: string
  initials: string
  tier: 'explorer' | 'anchor' | 'founder'
  home_base_code: string
  bio: string
  interests: string
  seat_credits: number
  kyc_verified: boolean
  is_admin: boolean
}

const defaultForm: EditForm = {
  name: '',
  initials: '',
  tier: 'explorer',
  home_base_code: '',
  bio: '',
  interests: '',
  seat_credits: 0,
  kyc_verified: false,
  is_admin: false,
}

function Toast({ msg, kind }: { msg: string; kind: 'success' | 'error' | 'info' }) {
  return <div className={`toast ${kind}`}>{msg}</div>
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      className={`toggle ${on ? 'active' : ''}`}
      onClick={() => onChange(!on)}
      role="checkbox"
      aria-checked={on}
      style={{ cursor: 'pointer' }}
    />
  )
}

export default function MembersPage() {
  const supabase = createClient()
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState<EditForm>(defaultForm)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; kind: 'success' | 'error' | 'info' } | null>(null)

  const showToast = (msg: string, kind: 'success' | 'error' | 'info' = 'success') => {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 3500)
  }

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('members')
      .select('*')
      .order('joined_at', { ascending: false })
    setMembers(data ?? [])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const filtered = members.filter(m =>
    !search ||
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    (m.home_base_code ?? '').toLowerCase().includes(search.toLowerCase()) ||
    m.tier.toLowerCase().includes(search.toLowerCase())
  )

  function openEdit(m: Member) {
    setEditId(m.id)
    setShowAdd(false)
    setForm({
      name: m.name,
      initials: m.initials,
      tier: m.tier,
      home_base_code: m.home_base_code ?? '',
      bio: m.bio ?? '',
      interests: (m.interests ?? []).join(', '),
      seat_credits: m.seat_credits,
      kyc_verified: m.kyc_verified,
      is_admin: m.is_admin,
    })
  }

  function openAdd() {
    setEditId(null)
    setShowAdd(true)
    setForm(defaultForm)
  }

  async function deleteMember(id: string, name: string) {
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return
    const { error } = await supabase.from('members').delete().eq('id', id)
    if (error) { showToast(error.message, 'error'); return }
    showToast('Member deleted')
    load()
  }

  async function save() {
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        initials: form.initials.trim().toUpperCase().slice(0, 3),
        tier: form.tier,
        home_base_code: form.home_base_code.trim() || null,
        bio: form.bio.trim() || null,
        interests: form.interests ? form.interests.split(',').map(s => s.trim()).filter(Boolean) : null,
        seat_credits: form.seat_credits,
        kyc_verified: form.kyc_verified,
        is_admin: form.is_admin,
      }

      if (editId) {
        const { error } = await supabase.from('members').update(payload).eq('id', editId)
        if (error) throw error
        showToast('Member updated')
      } else {
        // Insert new member profile (user_id required — use a placeholder note)
        const { error } = await supabase.from('members').insert({
          ...payload,
          user_id: '00000000-0000-0000-0000-000000000000',
        })
        if (error) throw error
        showToast('Member created — link a user_id in Supabase Auth')
      }

      setEditId(null)
      setShowAdd(false)
      load()
    } catch (e: unknown) {
      showToast((e as Error).message ?? 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  const tierColor: Record<string, string> = {
    explorer: 'ink',
    anchor: 'sun',
    founder: 'tropic',
  }

  const isEditing = editId !== null || showAdd

  return (
    <div style={{ padding: 32 }}>
      {toast && <Toast msg={toast.msg} kind={toast.kind} />}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 30, fontWeight: 500, color: 'var(--ink)', margin: 0 }}>Members</h1>
          <p style={{ fontSize: 13, color: 'var(--ink-light)', marginTop: 4, marginBottom: 0 }}>
            {members.length} members total.{' '}
            <span style={{ fontStyle: 'italic' }}>User accounts (email/password) must be created separately in Supabase Auth — the user_id links to this profile.</span>
          </p>
        </div>
        <button className="btn-primary" onClick={openAdd} style={{ flexShrink: 0 }}>
          + Add Member
        </button>
      </div>

      {/* Edit / Add form */}
      {isEditing && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 14, padding: 24, marginBottom: 28 }}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: 20, margin: '0 0 20px', color: 'var(--ink)' }}>
            {editId ? 'Edit Member' : 'Add Member'}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="field">
              <label className="field-lab">Full Name <span className="req">*</span></label>
              <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Alexandra Chen" />
            </div>
            <div className="field">
              <label className="field-lab">Initials</label>
              <input className="input" value={form.initials} onChange={e => setForm(f => ({ ...f, initials: e.target.value }))} placeholder="AC" maxLength={3} />
            </div>
            <div className="field">
              <label className="field-lab">Tier</label>
              <select className="select" value={form.tier} onChange={e => setForm(f => ({ ...f, tier: e.target.value as EditForm['tier'] }))}>
                <option value="explorer">Explorer</option>
                <option value="anchor">Anchor</option>
                <option value="founder">Founder</option>
              </select>
            </div>
            <div className="field">
              <label className="field-lab">Home Base (IATA)</label>
              <input className="input" value={form.home_base_code} onChange={e => setForm(f => ({ ...f, home_base_code: e.target.value.toUpperCase() }))} placeholder="MIA" maxLength={3} />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="field-lab">Bio</label>
              <textarea className="input" value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} placeholder="Short member bio…" />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="field-lab">Interests (comma-separated)</label>
              <input className="input" value={form.interests} onChange={e => setForm(f => ({ ...f, interests: e.target.value }))} placeholder="surfing, sailing, tech, gastronomy" />
            </div>
            <div className="field">
              <label className="field-lab">Seat Credits</label>
              <input className="input" type="number" min={0} value={form.seat_credits} onChange={e => setForm(f => ({ ...f, seat_credits: Number(e.target.value) }))} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 28, marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--hair)' }}>
            <div className="toggle-row" style={{ border: 'none', padding: 0 }}>
              <div>
                <div className="t-lab">KYC Verified</div>
                <div className="t-sub">Identity check complete</div>
              </div>
              <Toggle on={form.kyc_verified} onChange={v => setForm(f => ({ ...f, kyc_verified: v }))} />
            </div>
            <div className="toggle-row" style={{ border: 'none', padding: 0 }}>
              <div>
                <div className="t-lab">Admin Access</div>
                <div className="t-sub">Can access Ops Dashboard</div>
              </div>
              <Toggle on={form.is_admin} onChange={v => setForm(f => ({ ...f, is_admin: v }))} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <button className="btn-primary" onClick={save} disabled={saving || !form.name.trim()}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="btn-ghost" onClick={() => { setEditId(null); setShowAdd(false) }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input
          className="input"
          style={{ maxWidth: 320 }}
          placeholder="Search by name, base, tier…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--ink-light)', fontSize: 14 }}>Loading…</div>
      ) : (
        <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 12, overflow: 'hidden' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>ID</th>
                <th>Tier</th>
                <th>Home Base</th>
                <th>KYC</th>
                <th>Credits</th>
                <th>Admin</th>
                <th>Joined</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => (
                <tr key={m.id} style={{ cursor: 'pointer' }} onClick={() => openEdit(m)}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--tropic-glow)', color: 'var(--tropic-d)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                        {m.initials}
                      </div>
                      <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{m.name}</span>
                    </div>
                  </td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-light)' }}>{m.id.slice(0, 8)}…</td>
                  <td><span className={`pill ${tierColor[m.tier]}`}>{m.tier}</span></td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{m.home_base_code ?? '—'}</td>
                  <td>
                    <span className={`pill ${m.kyc_verified ? 'moss' : 'signal'}`}>{m.kyc_verified ? 'Verified' : 'Pending'}</span>
                  </td>
                  <td style={{ fontWeight: 600, color: 'var(--ink)' }}>{m.seat_credits}</td>
                  <td>
                    {m.is_admin && <span className="pill tropic">Admin</span>}
                  </td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-light)' }}>
                    {new Date(m.joined_at).toLocaleDateString()}
                  </td>
                  <td onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 6, padding: '8px 12px' }}>
                    <button
                      className="btn-ghost"
                      style={{ height: 28, padding: '0 10px', fontSize: 12 }}
                      onClick={() => openEdit(m)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn-ghost"
                      style={{ height: 28, padding: '0 10px', fontSize: 12, color: 'var(--signal)' }}
                      onClick={() => deleteMember(m.id, m.name)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--ink-light)', fontSize: 13 }}>
              No members match your search.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
