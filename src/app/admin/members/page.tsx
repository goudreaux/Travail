'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fmtHomeBase, memberCode, tierLabel, tierPill } from '@/lib/data'
import { logActivity } from '@/lib/activity'
import { safeError } from '@/lib/pii-scrub'
import GuestsPanel from '@/components/GuestsPanel'
import type { Member } from '@/lib/supabase/types'
import type { Guest } from '@/lib/guests'

const HOME_BASES = ['Tampa Bay', 'SFL']

function autoInitials(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 3).map(w => w[0]).join('').toUpperCase()
}

function joinedDate(m: Member): string {
  const raw = m.joined_at || m.created_at
  if (!raw) return '—'
  const d = new Date(raw)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString()
}

type EditForm = {
  name: string
  member_no: string
  initials: string
  tier: 'founder' | 'founding_member' | 'administrator'
  home_base_code: string
  bio: string
  interests: string
  email: string
  phone: string
  date_of_birth: string
  joined_at: string
  card_last4: string
  user_id: string
  kyc_verified: boolean
  is_admin: boolean
}

const PLACEHOLDER_USER_ID = '00000000-0000-0000-0000-000000000000'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function formatPhone(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 10)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
}

const defaultForm: EditForm = {
  name: '',
  member_no: '',
  initials: '',
  tier: 'founding_member',
  home_base_code: 'Tampa Bay',
  bio: '',
  interests: '',
  email: '',
  phone: '',
  date_of_birth: '',
  joined_at: '',
  card_last4: '',
  user_id: '',
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
  // Presence flags only — the full sensitive row is fetched per-member
  // via admin_get_member_sensitive() (which writes an audit log entry).
  const [contactPresence, setContactPresence] = useState<Record<string, { has_email: boolean; has_phone: boolean }>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState<EditForm>(defaultForm)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; kind: 'success' | 'error' | 'info' } | null>(null)
  const [convertGuestId, setConvertGuestId] = useState<string | null>(null)
  const [peopleTab, setPeopleTab] = useState<'members' | 'guests'>('members')
  const formRef = useRef<HTMLDivElement>(null)
  const searchParams = useSearchParams()

  const showToast = (msg: string, kind: 'success' | 'error' | 'info' = 'success') => {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 3500)
  }

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: memberData }, { data: presenceRows }] = await Promise.all([
      supabase.from('members').select('*').order('joined_at', { ascending: false }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from('members_has_contact' as any).select('member_id, has_email, has_phone')),
    ])
    setMembers(memberData ?? [])
    const map: Record<string, { has_email: boolean; has_phone: boolean }> = {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of ((presenceRows ?? []) as any[])) {
      map[row.member_id] = { has_email: !!row.has_email, has_phone: !!row.has_phone }
    }
    setContactPresence(map)
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (editId !== null || showAdd) {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [editId, showAdd])

  // Prefill the add form when arriving from "Convert to member" on the Guests page.
  useEffect(() => {
    const name = searchParams.get('name')
    const guestId = searchParams.get('addGuest')
    if (name) {
      setShowAdd(true)
      setEditId(null)
      setForm({ ...defaultForm, name, initials: autoInitials(name) })
      if (guestId) setConvertGuestId(guestId)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = members.filter(m =>
    !search ||
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    (m.home_base_code ?? '').toLowerCase().includes(search.toLowerCase()) ||
    m.tier.toLowerCase().includes(search.toLowerCase())
  )

  async function openEdit(m: Member) {
    setEditId(m.id)
    setShowAdd(false)
    // Pull the sensitive row through the audited RPC — this writes an
    // activity_log entry whenever an admin opens another member's editor.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sens } = await (supabase as any).rpc('admin_get_member_sensitive', { target_id: m.id })
    const s = Array.isArray(sens) && sens[0] ? sens[0] : null
    setForm({
      name: m.name,
      member_no: m.member_no != null ? String(m.member_no) : '',
      initials: m.initials,
      tier: m.tier,
      home_base_code: m.home_base_code ?? 'Tampa Bay',
      bio: m.bio ?? '',
      interests: Array.isArray(m.interests) ? m.interests.join(', ') : (m.interests ?? ''),
      email: s?.email ?? '',
      phone: s?.phone ? formatPhone(s.phone as string) : '',
      date_of_birth: s?.date_of_birth ?? '',
      joined_at: (m.joined_at || m.created_at || '').slice(0, 10),
      card_last4: m.card_last4 ?? '',
      user_id: m.user_id && m.user_id !== PLACEHOLDER_USER_ID ? m.user_id : '',
      kyc_verified: m.kyc_verified,
      is_admin: m.is_admin,
    })
  }

  function openAdd() {
    setEditId(null)
    setShowAdd(true)
    setForm(defaultForm)
  }

  // Convert a guest → prefill the Add Member form from their info.
  function startConvert(g: Guest) {
    const full = `${g.first_name} ${g.last_name}`.trim()
    setPeopleTab('members')
    setEditId(null)
    setShowAdd(true)
    setForm({ ...defaultForm, name: full, initials: autoInitials(full), email: g.email ?? '', phone: g.phone ? formatPhone(g.phone) : '' })
    setConvertGuestId(g.id)
  }

  async function deleteMember(id: string, name: string) {
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return
    const { error, data } = await supabase.from('members').delete().eq('id', id).select()
    if (error) {
      const msg = error.code === '23503'
        ? 'Can’t delete — this member has bookings or posts. Cancel/remove those first.'
        : error.message
      showToast(msg, 'error')
      return
    }
    if (!data || data.length === 0) { showToast('Delete blocked — add RLS delete policy in Supabase', 'error'); return }
    showToast('Member deleted')
    load()
  }

  // POST to the server route that emails the Supabase invite + links the account.
  async function sendInvite(memberId: string, email: string): Promise<string | null> {
    try {
      const res = await fetch('/api/admin/invite-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId, email }),
      })
      const json = await res.json().catch(() => ({}))
      return res.ok ? null : (json.error ?? 'Invite failed')
    } catch (e) {
      return (e as Error).message ?? 'Invite failed'
    }
  }

  async function inviteRow(m: Member) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sens } = await (supabase as any).rpc('admin_get_member_sensitive', { target_id: m.id })
    const email = Array.isArray(sens) && sens[0] ? sens[0].email : null
    if (!email) { showToast('Add an email for this member first', 'error'); return }
    const err = await sendInvite(m.id, email)
    showToast(err ? `Invite failed: ${err}` : `Invite emailed to ${email}`, err ? 'error' : 'success')
    if (!err) load()
  }

  async function save() {
    const uid = form.user_id.trim()
    if (uid && !UUID_RE.test(uid)) {
      showToast('User ID must be a valid Supabase Auth UID (UUID) — leave blank to link later', 'error')
      return
    }
    const email = form.email.trim()
    if (email && !EMAIL_RE.test(email)) {
      showToast('Enter a valid email address', 'error')
      return
    }
    if (!editId && !email) {
      showToast('Email is required — it’s where notifications are sent and where the login invite goes', 'error')
      return
    }
    const phoneDigits = form.phone.replace(/\D/g, '')
    if (phoneDigits && phoneDigits.length !== 10) {
      showToast('Enter a 10-digit phone number (xxx-xxx-xxxx)', 'error')
      return
    }
    const memberNoStr = form.member_no.trim()
    if (memberNoStr && !/^\d+$/.test(memberNoStr)) {
      showToast('Member number must be a whole number', 'error')
      return
    }
    const memberNoVal = memberNoStr ? parseInt(memberNoStr, 10) : null
    if (memberNoVal !== null && memberNoVal < 1) {
      showToast('Member number must be 1 or higher', 'error')
      return
    }
    const dobVal = form.date_of_birth || null
    const emailVal = email || null
    const phoneVal = phoneDigits || null
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        initials: form.initials.trim().toUpperCase().slice(0, 3),
        tier: form.tier,
        home_base_code: form.home_base_code || null,
        bio: form.bio.trim() || null,
        interests: form.interests ? form.interests.split(',').map(s => s.trim()).filter(Boolean) : null,
        joined_at: form.joined_at || new Date().toISOString().slice(0, 10),
        card_last4: form.card_last4.replace(/\D/g, '').slice(0, 4) || null,
        kyc_verified: form.kyc_verified,
        is_admin: form.is_admin,
      }

      if (editId) {
        const updatePayload: Record<string, unknown> = { ...payload }
        if (uid) updatePayload.user_id = uid
        if (memberNoVal !== null) updatePayload.member_no = memberNoVal
        const { data: updated, error } = await supabase.from('members').update(updatePayload as never).eq('id', editId).select()
        if (error) throw error
        if (!updated || updated.length === 0) throw new Error('Update blocked — verify the admin RLS update policy on members in Supabase')
        const { error: sErr } = await supabase.from('member_sensitive').upsert({
          member_id: editId,
          date_of_birth: dobVal,
          email: emailVal,
          phone: phoneVal,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'member_id' })
        if (sErr) throw sErr
        showToast(uid ? 'Member updated — login linked' : 'Member updated')
      } else {
        const insertPayload: Record<string, unknown> = {
          ...payload,
          id: crypto.randomUUID(),
          user_id: uid || null,
        }
        if (memberNoVal !== null) insertPayload.member_no = memberNoVal
        const { data: inserted, error } = await supabase.from('members').insert(insertPayload as never).select().single()
        if (error) throw error
        if ((dobVal || emailVal || phoneVal) && inserted) {
          await supabase.from('member_sensitive').insert({
            member_id: inserted.id,
            date_of_birth: dobVal,
            email: emailVal,
            phone: phoneVal,
          })
        }
        // Welcome the new member in-app; when they have an email on file this
        // also auto-sends the welcome via the notify-email webhook. Best-effort —
        // never block member creation on it.
        if (inserted) {
          try {
            await supabase.from('notifications').insert({
              member_id: inserted.id,
              kind: 'system',
              title: 'Welcome to Travail',
              body: 'Your membership is active. Watch for your invite to set up your login, then browse open seats or anchor your first trip.',
              read: false,
            } as never)
          } catch (welcomeErr) {
            safeError('Welcome notification not recorded:', welcomeErr)
          }
        }
        if (convertGuestId && inserted) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from('guests').update({ member_id: inserted.id }).eq('id', convertGuestId)
          setConvertGuestId(null)
        }
        if (inserted) {
          logActivity({
            action: 'member_created', actor_kind: 'admin',
            subject_member_id: inserted.id,
            summary: `Created member ${payload.name}${convertGuestId ? ' (converted from guest)' : ''}`,
            meta: { linked_login: !!uid },
          })
        }
        // Email a set-password invite when no login was linked manually.
        if (inserted && emailVal && !uid) {
          const inviteErr = await sendInvite(inserted.id, emailVal)
          showToast(inviteErr ? `Member created — invite failed: ${inviteErr}` : `Member created — invite emailed to ${emailVal}`, inviteErr ? 'error' : 'success')
        } else {
          showToast(uid ? 'Member created — login linked' : 'Member created — add an email to send an invite, or a User ID to link manually')
        }
      }

      setEditId(null)
      setShowAdd(false)
      load()
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string }
      if (err.code === '23505' && (err.message ?? '').includes('member_no')) {
        showToast(`Member #${memberNoVal} is already taken — choose another number`, 'error')
      } else {
        showToast(err.message ?? 'Save failed', 'error')
      }
    } finally {
      setSaving(false)
    }
  }


  const isEditing = editId !== null || showAdd

  return (
    <div className="admin-page">
      {toast && <Toast msg={toast.msg} kind={toast.kind} />}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 30, fontWeight: 500, color: 'var(--ink)', margin: 0 }}>People</h1>
          <p style={{ fontSize: 13, color: 'var(--ink-light)', marginTop: 4, marginBottom: 0 }}>
            Members and the guests they bring. User logins are created in Supabase Auth and linked via the User ID field.
          </p>
        </div>
        {peopleTab === 'members' && (
          <button className="btn-primary" onClick={openAdd} style={{ flexShrink: 0 }}>
            + Add Member
          </button>
        )}
      </div>

      {/* People tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--hair)', marginBottom: 24 }}>
        {(['members', 'guests'] as const).map(t => (
          <button
            key={t}
            onClick={() => setPeopleTab(t)}
            style={{
              padding: '10px 20px', background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: 'var(--ui)', fontSize: 13.5, fontWeight: peopleTab === t ? 600 : 400,
              color: peopleTab === t ? 'var(--tropic-d)' : 'var(--ink-light)',
              borderBottom: peopleTab === t ? '2px solid var(--tropic)' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t === 'members' ? `Members${members.length ? ` · ${members.length}` : ''}` : 'Guests'}
          </button>
        ))}
      </div>

      {peopleTab === 'guests' ? (
        <GuestsPanel onConvert={startConvert} />
      ) : (
      <>

      {/* Edit / Add form */}
      {isEditing && (
        <div ref={formRef} style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 14, padding: 24, marginBottom: 28 }}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: 20, margin: '0 0 20px', color: 'var(--ink)' }}>
            {editId ? 'Edit Member' : 'Add Member'}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="field">
              <label className="field-lab">Full Name <span className="req">*</span></label>
              <input
                className="input"
                value={form.name}
                onChange={e => {
                  const name = e.target.value
                  setForm(f => ({ ...f, name, initials: autoInitials(name) }))
                }}
                placeholder="Alexandra Chen"
              />
            </div>
            <div className="field">
              <label className="field-lab">Initials</label>
              <input className="input" value={form.initials} onChange={e => setForm(f => ({ ...f, initials: e.target.value.toUpperCase().slice(0, 3) }))} placeholder="AC" maxLength={3} />
            </div>
            <div className="field">
              <label className="field-lab">Email</label>
              <input
                className="input"
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="alexandra@example.com"
              />
              <div style={{ fontSize: 11, color: 'var(--ink-light)', marginTop: 4 }}>Contact email. Should match the member&apos;s Supabase Auth login email.</div>
            </div>
            <div className="field">
              <label className="field-lab">Phone</label>
              <input
                className="input"
                inputMode="tel"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: formatPhone(e.target.value) }))}
                placeholder="813-555-0142"
              />
            </div>
            <div className="field">
              <label className="field-lab">Home Base</label>
              <select className="select" value={form.home_base_code} onChange={e => setForm(f => ({ ...f, home_base_code: e.target.value }))}>
                {HOME_BASES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-lab">Membership Tier</label>
              <select className="select" value={form.tier} onChange={e => setForm(f => ({ ...f, tier: e.target.value as EditForm['tier'] }))}>
                <option value="founding_member">Founding Member</option>
                <option value="founder">Founder</option>
                <option value="administrator">Administrator</option>
              </select>
              <div style={{ fontSize: 11, color: 'var(--ink-light)', marginTop: 4 }}>
                Administrators are hidden from the member network. Grant Founders admin access with the toggle below.
              </div>
            </div>
            <div className="field">
              <label className="field-lab">Date of Birth</label>
              <input
                className="input"
                type="date"
                value={form.date_of_birth}
                onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))}
              />
            </div>
            <div className="field">
              <label className="field-lab">Date Joined</label>
              <input
                className="input"
                type="date"
                value={form.joined_at}
                onChange={e => setForm(f => ({ ...f, joined_at: e.target.value }))}
              />
            </div>
            <div className="field">
              <label className="field-lab">Card on file (last 4)</label>
              <input
                className="input"
                inputMode="numeric"
                maxLength={4}
                value={form.card_last4}
                onChange={e => setForm(f => ({ ...f, card_last4: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                placeholder="e.g. 4242"
              />
              <div style={{ fontSize: 11, color: 'var(--ink-light)', marginTop: 4 }}>Marks a card on file. Full card details are stored with the payment processor, not here.</div>
            </div>
            {form.tier !== 'administrator' && (
              <div className="field">
                <label className="field-lab">Member No.</label>
                <input
                  className="input"
                  inputMode="numeric"
                  value={form.member_no}
                  onChange={e => setForm(f => ({ ...f, member_no: e.target.value.replace(/\D/g, '') }))}
                  placeholder={editId ? '' : 'Auto (next in line)'}
                />
                <div style={{ fontSize: 11, color: 'var(--ink-light)', marginTop: 4 }}>
                  Shown as “#{form.member_no || 'N'}”. Leave blank to {editId ? 'keep the current number' : 'auto-assign the next number'}. Must be unique.
                </div>
              </div>
            )}
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="field-lab">User ID (Supabase Auth UID)</label>
              <input
                className="input"
                style={{ fontFamily: 'var(--mono)', fontSize: 13 }}
                value={form.user_id}
                onChange={e => setForm(f => ({ ...f, user_id: e.target.value.trim() }))}
                placeholder="e.g. fe9f539d-4289-4d14-aa0a-17f68134d622"
              />
              <div style={{ fontSize: 11, color: 'var(--ink-light)', marginTop: 4 }}>
                Paste the UID from Supabase → Authentication → Users to let this member log in. Leave blank to link later.
              </div>
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="field-lab">Bio</label>
              <textarea className="input" value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} placeholder="Short member bio…" />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="field-lab">Interests (comma-separated)</label>
              <input className="input" value={form.interests} onChange={e => setForm(f => ({ ...f, interests: e.target.value }))} placeholder="surfing, sailing, tech, gastronomy" />
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
                      {!contactPresence[m.id]?.has_email && (
                        <span
                          className="pill signal"
                          title="No email on file — this member won't receive notification emails or an invite"
                          style={{ fontSize: 10 }}
                        >
                          No email
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink-light)' }}>{m.tier === 'administrator' ? '—' : memberCode(m)}</td>
                  <td><span className={`pill ${tierPill(m.tier)}`}>{tierLabel(m.tier)}</span></td>
                  <td style={{ fontSize: 13 }}>{fmtHomeBase(m.home_base_code) ?? '—'}</td>
                  <td>
                    <span className={`pill ${m.kyc_verified ? 'moss' : 'signal'}`}>{m.kyc_verified ? 'Verified' : 'Pending'}</span>
                  </td>
                  <td>
                    {m.is_admin && <span className="pill tropic">Admin</span>}
                  </td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-light)' }}>
                    {joinedDate(m)}
                  </td>
                  <td onClick={e => e.stopPropagation()} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      {(!m.user_id || m.user_id === PLACEHOLDER_USER_ID) && contactPresence[m.id]?.has_email && (
                        <button
                          className="btn-ghost"
                          style={{ height: 28, padding: '0 10px', fontSize: 12, color: 'var(--tropic-d)', borderColor: 'rgba(0,179,199,0.3)' }}
                          onClick={() => inviteRow(m)}
                        >
                          Invite
                        </button>
                      )}
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
                    </div>
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
      </>
      )}
    </div>
  )
}
