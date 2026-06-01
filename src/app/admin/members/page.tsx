'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fmtHomeBase, memberCode, tierLabel, tierPill } from '@/lib/data'
import { logActivity } from '@/lib/activity'
import { safeError } from '@/lib/pii-scrub'
import GuestsPanel from '@/components/GuestsPanel'
import ReferralsPanel from '@/components/ReferralsPanel'
import type { Referral } from '@/lib/referrals'
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
  const [peopleTab, setPeopleTab] = useState<'members' | 'guests' | 'referrals'>('members')
  const [convertReferralId, setConvertReferralId] = useState<string | null>(null)
  // Generated invite-code dialog: { name, code, url }.
  const [codeModal, setCodeModal] = useState<{ memberId: string; name: string; code: string; url: string } | null>(null)
  const [codeBusy, setCodeBusy] = useState<string | null>(null)
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)
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

  // Count active membership only — exclude rows whose subscription has
  // ended (cancelled / incomplete_expired). 'past_due' counts because
  // ops is actively working to recover the card. Members with no
  // subscription yet count too — they may be brand new invites.
  const activeMemberCount = members.filter(m => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (m as any).subscription_status as string | null | undefined
    return s !== 'cancelled' && s !== 'canceled' && s !== 'incomplete_expired'
  }).length

  const filtered = members.filter(m =>
    !search ||
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    (m.home_base_code ?? '').toLowerCase().includes(search.toLowerCase()) ||
    m.tier.toLowerCase().includes(search.toLowerCase())
  )

  async function openEdit(m: Member) {
    setEditId(m.id)
    setShowAdd(false)
    // Pull the sensitive row. The audited RPC is the preferred path
    // (writes an activity_log entry), but it lives in migration 035 —
    // not always present in older Supabase environments. Fall back to a
    // direct SELECT against member_sensitive when the RPC is missing
    // OR returns nothing; the row-level RLS policy 'Admins can manage
    // sensitive data' on member_sensitive (migration 027) lets the
    // admin read it directly.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let s: any = null
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: sens } = await (supabase as any).rpc('admin_get_member_sensitive', { target_id: m.id })
      if (Array.isArray(sens) && sens[0]) s = sens[0]
    } catch (rpcErr) {
      // RPC missing (404 / function not found) — log + fall through.
      safeError('admin_get_member_sensitive RPC missing or failed (falling back to direct SELECT):', rpcErr)
    }
    if (!s) {
      const { data: direct } = await supabase
        .from('member_sensitive')
        .select('email, phone, date_of_birth')
        .eq('member_id', m.id)
        .maybeSingle()
      if (direct) s = direct
    }
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
    setForm({ ...defaultForm, joined_at: new Date().toISOString().slice(0, 10) })
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

  // Convert a referral → same idea, prefill Add Member from the
  // prospect's info and remember the referral id so save() can mark
  // it 'invited' and link the new member back to the referral row.
  function startConvertReferral(r: Referral) {
    const full = `${r.first_name} ${r.last_name}`.trim()
    setPeopleTab('members')
    setEditId(null)
    setShowAdd(true)
    setForm({ ...defaultForm, name: full, initials: autoInitials(full), email: r.email, phone: r.phone ? formatPhone(r.phone) : '' })
    setConvertReferralId(r.id)
  }

  async function deleteMember(id: string, name: string) {
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return
    const { error, data } = await supabase.from('members').delete().eq('id', id).select()
    if (error) {
      const msg = error.code === '23503'
        ? 'Can’t delete, this member has bookings or posts. Cancel/remove those first.'
        : error.message
      showToast(msg, 'error')
      return
    }
    if (!data || data.length === 0) { showToast('Delete blocked, add RLS delete policy in Supabase', 'error'); return }
    showToast('Member deleted')
    load()
  }

  // Mint a per-member invite code and show it for copying. This is one way in;
  // the primary path is self-serve email-code sign-in at /login.
  // Mint a fresh single-use invite code for a member and pop the share modal
  // (code + copyable /join link). Returns whether it succeeded.
  async function mintAndShow(memberId: string, name: string): Promise<boolean> {
    try {
      const res = await fetch('/api/admin/invite-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) { showToast(json.error ?? 'Could not create code', 'error'); return false }
      setCopied(null)
      setCodeModal({ memberId, name, code: json.code, url: json.joinUrl })
      return true
    } catch (e) {
      showToast((e as Error).message ?? 'Could not create code', 'error')
      return false
    }
  }

  async function genCode(m: Member) {
    setCodeBusy(m.id)
    try { await mintAndShow(m.id, m.name) }
    finally { setCodeBusy(null) }
  }

  // Email a member their invitation link (branded, via Resend). Returns the
  // result so callers can decide how to surface it. They tap "Set up your
  // account" → /join → set a password → in.
  async function sendEmailInvite(memberId: string, purpose: 'invite' | 'reset' = 'invite'): Promise<{ ok: boolean; email?: string; error?: string }> {
    try {
      const res = await fetch('/api/admin/email-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId, purpose }),
      })
      const json = await res.json().catch(() => ({}))
      return res.ok && json.ok ? { ok: true, email: json.email } : { ok: false, error: json.error ?? 'Could not email invite' }
    } catch (e) {
      return { ok: false, error: (e as Error).message ?? 'Could not email invite' }
    }
  }

  // Row action: email the invite, with a toast.
  async function emailInvite(m: Member) {
    setCodeBusy(m.id)
    const r = await sendEmailInvite(m.id)
    setCodeBusy(null)
    showToast(r.ok ? `Invite emailed to ${r.email}` : (r.error ?? 'Could not email invite'), r.ok ? 'success' : 'error')
  }

  // Row action for an already-signed-up member who's locked out: email them a
  // fresh set-password link (redeeming it at /join resets their password).
  async function resetLogin(m: Member) {
    setCodeBusy(m.id)
    const r = await sendEmailInvite(m.id, 'reset')
    setCodeBusy(null)
    showToast(r.ok ? `Password reset link emailed to ${r.email}` : (r.error ?? 'Could not send reset link'), r.ok ? 'success' : 'error')
  }

  async function copyText(text: string, which: 'code' | 'link') {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
      setTimeout(() => setCopied(null), 1800)
    } catch {
      showToast('Copy failed — select and copy manually', 'error')
    }
  }

  async function save() {
    const uid = form.user_id.trim()
    if (uid && !UUID_RE.test(uid)) {
      showToast('User ID must be a valid Supabase Auth UID (UUID), leave blank to link later', 'error')
      return
    }
    const email = form.email.trim()
    if (email && !EMAIL_RE.test(email)) {
      showToast('Enter a valid email address', 'error')
      return
    }
    if (!editId && !email) {
      showToast('Email is required, it’s where notifications are sent and where the login invite goes', 'error')
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
        if (!updated || updated.length === 0) throw new Error('Update blocked, verify the admin RLS update policy on members in Supabase')
        // Always upsert the sensitive row when ANY of email/phone/dob
        // is set (or being cleared). Verify the write returned a row
        // — RLS can sometimes silently swallow upserts when the policy
        // returns no rows on insert/update, which produced the original
        // "NO EMAIL" bug where the toast said "saved" but the row
        // wasn't actually persisted.
        const { data: sensRow, error: sErr } = await supabase
          .from('member_sensitive')
          .upsert({
            member_id: editId,
            date_of_birth: dobVal,
            email: emailVal,
            phone: phoneVal,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'member_id' })
          .select()
        if (sErr) {
          showToast(
            `Member saved but contact info failed: ${sErr.message}. Likely an RLS policy, verify "Admins can manage sensitive data" exists on member_sensitive.`,
            'error',
          )
          setSaving(false)
          return
        }
        if (!sensRow || sensRow.length === 0) {
          showToast(
            'Member saved but contact info wrote 0 rows. RLS is allowing the upsert query to run but blocking the write. Check that the admin user has is_admin=true in the members table.',
            'error',
          )
          setSaving(false)
          return
        }
        showToast(uid ? 'Member updated, login linked' : 'Member updated')
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
          // Surface RLS / constraint failures here loudly. Silent
          // swallow used to produce the "NO EMAIL" pill on members
          // who Ops thought they'd given an email to.
          const { error: sErr } = await supabase.from('member_sensitive').insert({
            member_id: inserted.id,
            date_of_birth: dobVal,
            email: emailVal,
            phone: phoneVal,
          })
          if (sErr) {
            showToast(
              `Member created but contact info failed to save: ${sErr.message}. Open the member to retry, then check the "Admins can manage sensitive data" RLS policy.`,
              'error',
            )
            // Don't abort the rest of the create — the member row exists
            // and Ops can re-enter contact details from the edit form.
          }
        }
        // Welcome the new member in-app. The notify-email Edge Function emails
        // EVERY notification, so we skip this when we're about to auto-send the
        // invite below (emailVal && !uid) — otherwise the member gets two emails,
        // and the welcome's "Open Travail" CTA would bounce them to login before
        // they've even set up. Best-effort — never block member creation on it.
        const willAutoInvite = !!emailVal && !uid
        if (inserted && !willAutoInvite) {
          try {
            await supabase.from('notifications').insert({
              member_id: inserted.id,
              kind: 'system',
              title: 'Welcome to Travail',
              body: 'Your membership is active. Sign in any time with your email — we’ll send a one-time code — then browse open seats or anchor your first trip.',
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
        if (convertReferralId && inserted) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from('referrals').update({
            status: 'invited',
            invited_member_id: inserted.id,
            decided_at: new Date().toISOString(),
          }).eq('id', convertReferralId)
          setConvertReferralId(null)
        }
        if (inserted) {
          logActivity({
            action: 'member_created', actor_kind: 'admin',
            subject_member_id: inserted.id,
            summary: `Created member ${payload.name}${convertGuestId ? ' (converted from guest)' : convertReferralId ? ' (from referral)' : ''}`,
            meta: { linked_login: !!uid },
          })
        }
        // Adding a member with an email mints their invite and pops the share
        // modal so ops can copy the /join link and text it — the member never
        // has to chase an email. "Email instead" stays available in the modal.
        // Linked-login or no-email cases have nothing to share.
        if (uid) {
          showToast('Member created, login linked')
        } else if (emailVal && inserted) {
          showToast('Member created — invite ready to share', 'success')
          await mintAndShow(inserted.id, payload.name)
        } else {
          showToast('Member created, add an email so they can sign in')
        }
      }

      setEditId(null)
      setShowAdd(false)
      load()
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string }
      if (err.code === '23505' && (err.message ?? '').includes('member_no')) {
        showToast(`Member #${memberNoVal} is already taken, choose another number`, 'error')
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

      {codeModal && (
        <div
          onClick={() => setCodeModal(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,34,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 16, padding: 28, maxWidth: 440, width: '100%', boxShadow: '0 24px 60px rgba(0,0,0,0.25)' }}
          >
            <div className="envelope-eyebrow" style={{ marginBottom: 6 }}>Invite code</div>
            <h3 style={{ fontFamily: 'var(--display)', fontSize: 22, margin: '0 0 6px', color: 'var(--ink)' }}>
              {codeModal.name} is ready to join
            </h3>
            <p style={{ fontSize: 13, color: 'var(--ink-light)', margin: '0 0 18px', lineHeight: 1.5 }}>
              Share this with them. They open the link, set a password, and they&rsquo;re in — no email link to chase. Single-use, expires in 30 days.
            </p>

            <label className="field-lab">Code</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <div style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--tropic-d)', background: 'var(--tropic-glow)', borderRadius: 10, padding: '12px 16px', textAlign: 'center' }}>
                {codeModal.code}
              </div>
              <button className="btn-ghost" style={{ flexShrink: 0 }} onClick={() => copyText(codeModal.code, 'code')}>
                {copied === 'code' ? 'Copied ✓' : 'Copy'}
              </button>
            </div>

            <label className="field-lab">Shareable link</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <input className="input" readOnly value={codeModal.url} style={{ flex: 1, fontSize: 12.5, fontFamily: 'var(--mono)' }} onFocus={e => e.target.select()} />
              <button className="btn-primary" style={{ flexShrink: 0 }} onClick={() => copyText(codeModal.url, 'link')}>
                {copied === 'link' ? 'Copied ✓' : 'Copy link'}
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn-ghost"
                style={{ flex: 1 }}
                disabled={codeBusy === codeModal.memberId}
                onClick={async () => {
                  setCodeBusy(codeModal.memberId)
                  const r = await sendEmailInvite(codeModal.memberId)
                  setCodeBusy(null)
                  showToast(r.ok ? `Invite emailed to ${r.email}` : (r.error ?? 'Could not email invite'), r.ok ? 'success' : 'error')
                }}
              >
                {codeBusy === codeModal.memberId ? 'Emailing…' : 'Email instead'}
              </button>
              <button className="btn-ghost" style={{ flex: 1 }} onClick={() => setCodeModal(null)}>Done</button>
            </div>
          </div>
        </div>
      )}

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
        {(['members', 'guests', 'referrals'] as const).map(t => (
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
            {t === 'members'
              ? `Members${activeMemberCount ? ` · ${activeMemberCount}` : ''}`
              : t === 'guests'
              ? 'Guests'
              : 'Referrals'}
          </button>
        ))}
      </div>

      {peopleTab === 'guests' ? (
        <GuestsPanel onConvert={startConvert} />
      ) : peopleTab === 'referrals' ? (
        <ReferralsPanel onConvert={startConvertReferral} />
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

          {editId && (() => {
            const target = members.find(m => m.id === editId)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const t = target as any
            if (!t?.stripe_subscription_id) return null
            return <SubscriptionCancelSection memberId={editId} memberName={target?.name ?? ''} status={t.subscription_status ?? null} onDone={() => { setEditId(null); load() }} />
          })()}

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
                          title="No email on file, this member won't receive notification emails or an invite"
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
                      {contactPresence[m.id]?.has_email && (!m.user_id || m.user_id === PLACEHOLDER_USER_ID) && (
                        <>
                          <button
                            className="btn-ghost"
                            style={{ height: 28, padding: '0 10px', fontSize: 12, color: 'var(--tropic-d)', borderColor: 'rgba(0,179,199,0.3)' }}
                            title="Email this member their invite link — they tap it, set a password, and they're in"
                            disabled={codeBusy === m.id}
                            onClick={() => emailInvite(m)}
                          >
                            {codeBusy === m.id ? 'Sending…' : 'Email invite'}
                          </button>
                          <button
                            className="btn-ghost"
                            style={{ height: 28, padding: '0 10px', fontSize: 12 }}
                            title="Get a copyable invite link/code instead of emailing it"
                            disabled={codeBusy === m.id}
                            onClick={() => genCode(m)}
                          >
                            Code
                          </button>
                        </>
                      )}
                      {contactPresence[m.id]?.has_email && m.user_id && m.user_id !== PLACEHOLDER_USER_ID && (
                        <button
                          className="btn-ghost"
                          style={{ height: 28, padding: '0 10px', fontSize: 12 }}
                          title="Email this member a link to set a new password (resets their login)"
                          disabled={codeBusy === m.id}
                          onClick={() => resetLogin(m)}
                        >
                          {codeBusy === m.id ? 'Sending…' : 'Reset login'}
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

// Ops-only "Cancel subscription on member's behalf" block inside the
// edit modal. High-friction by design: require typed confirmation +
// reason + explicit choice of period_end vs immediate. Members can't
// reach this — it's a phone-call flow.
function SubscriptionCancelSection({
  memberId, memberName, status, onDone,
}: {
  memberId: string
  memberName: string
  status: string | null
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [reason, setReason] = useState('')
  const [mode, setMode] = useState<'period_end' | 'immediate'>('period_end')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (status === 'canceled' || status === 'cancelled' || status === 'incomplete_expired') {
    return (
      <div style={{ marginTop: 18, padding: '12px 14px', background: 'var(--paper)', border: '1px dashed var(--hair)', borderRadius: 10, fontSize: 12, color: 'var(--ink-light)' }}>
        Subscription already ended ({status}). No action available.
      </div>
    )
  }

  async function submit() {
    if (confirm.trim() !== 'CANCEL') { setErr('Type CANCEL to confirm.'); return }
    setErr(null); setBusy(true)
    try {
      const res = await fetch('/api/admin/subscriptions/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: memberId, mode, reason: reason.trim() || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Cancel failed (${res.status})`)
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Cancel failed')
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px dashed var(--hair)' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-light)', fontWeight: 600, marginBottom: 6 }}>
          Danger zone
        </div>
        <button
          onClick={() => setOpen(true)}
          style={{ padding: '8px 14px', background: 'transparent', color: 'var(--signal)', border: '1px solid rgba(217,78,42,0.30)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--ui)' }}
        >
          Cancel subscription on behalf of member
        </button>
        <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 6, lineHeight: 1.5 }}>
          Use after a phone call with the member. Default ends at period close; immediate is only on direct request.
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 22, padding: '16px 18px', background: 'rgba(217,78,42,0.05)', border: '1px solid rgba(217,78,42,0.25)', borderRadius: 12 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--signal)', fontWeight: 700, marginBottom: 10 }}>
        Cancel {memberName}&apos;s membership
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button onClick={() => setMode('period_end')} style={{ padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: mode === 'period_end' ? 600 : 400, border: `1px solid ${mode === 'period_end' ? 'var(--tropic)' : 'var(--hair-2)'}`, background: mode === 'period_end' ? 'var(--tropic-glow)' : 'transparent', color: mode === 'period_end' ? 'var(--tropic-d)' : 'var(--ink-light)', cursor: 'pointer' }}>
          End of period (recommended)
        </button>
        <button onClick={() => setMode('immediate')} style={{ padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: mode === 'immediate' ? 600 : 400, border: `1px solid ${mode === 'immediate' ? 'var(--signal)' : 'var(--hair-2)'}`, background: mode === 'immediate' ? 'rgba(217,78,42,0.10)' : 'transparent', color: mode === 'immediate' ? 'var(--signal)' : 'var(--ink-light)', cursor: 'pointer' }}>
          Immediate (kills access now)
        </button>
      </div>

      <div className="field" style={{ marginBottom: 10 }}>
        <label className="field-lab">Reason (logged to activity)</label>
        <textarea className="input" rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="What did the member say on the call?" />
      </div>
      <div className="field" style={{ marginBottom: 10 }}>
        <label className="field-lab">Type CANCEL to confirm</label>
        <input className="input" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="CANCEL" />
      </div>

      {err && (
        <div style={{ background: 'rgba(217,78,42,0.08)', border: '1px solid rgba(217,78,42,0.25)', borderRadius: 8, padding: '8px 10px', fontSize: 12.5, color: 'var(--signal)', marginBottom: 10 }}>{err}</div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={submit}
          disabled={busy || confirm.trim() !== 'CANCEL'}
          style={{ padding: '9px 16px', background: 'var(--signal)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer', opacity: confirm.trim() === 'CANCEL' ? 1 : 0.5, fontFamily: 'var(--ui)' }}
        >
          {busy ? 'Cancelling…' : 'Cancel subscription'}
        </button>
        <button onClick={() => { setOpen(false); setConfirm(''); setReason(''); setErr(null) }} className="btn-ghost">Back</button>
      </div>
    </div>
  )
}

