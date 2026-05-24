'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Member } from '@/lib/supabase/types'

const HOME_BASES = ['Tampa Bay', 'SFL']

export default function OnboardingPage() {
  const supabase = createClient()
  const router = useRouter()

  const [status, setStatus] = useState<'loading' | 'ready' | 'invalid'>('loading')
  const [member, setMember] = useState<Member | null>(null)
  const [name, setName] = useState('')
  const [homeBase, setHomeBase] = useState(HOME_BASES[0])
  const [bio, setBio] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function init() {
      // The invite link lands here with credentials. Support PKCE (?code=),
      // OTP (?token_hash=&type=), and implicit (#access_token=) link formats.
      try {
        const url = new URL(window.location.href)
        const code = url.searchParams.get('code')
        const tokenHash = url.searchParams.get('token_hash')
        const type = url.searchParams.get('type')
        if (code) {
          await supabase.auth.exchangeCodeForSession(code)
        } else if (tokenHash && type) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as any })
        }
        // (implicit hash tokens are picked up automatically by detectSessionInUrl)
      } catch { /* fall through to the session check */ }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setStatus('invalid'); return }

      const { data: m } = await supabase.from('members').select('*').eq('user_id', user.id).single()
      if (m) {
        setMember(m as Member)
        setName((m as Member).name ?? '')
        if ((m as Member).home_base_code) setHomeBase((m as Member).home_base_code as string)
        if ((m as Member).bio) setBio((m as Member).bio as string)
      }
      setStatus('ready')
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function complete() {
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    if (!name.trim()) { setError('Please enter your name.'); return }
    setSaving(true)
    try {
      const { error: pwErr } = await supabase.auth.updateUser({ password })
      if (pwErr) throw pwErr

      if (member) {
        const initials = name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 3)
        const { error: upErr } = await supabase.from('members')
          .update({ name: name.trim(), initials, home_base_code: homeBase, bio: bio.trim() || null })
          .eq('id', member.id)
        if (upErr) throw upErr
      }
      router.push('/')
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const card: React.CSSProperties = {
    background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 18,
    padding: '40px 44px', maxWidth: 460, width: '100%',
    boxShadow: '0 8px 40px rgba(13,51,64,0.08)',
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--bg)' }}>
      {status === 'loading' ? (
        <div style={card}>
          <div style={{ textAlign: 'center', color: 'var(--ink-light)', fontSize: 14 }}>Verifying your invite…</div>
        </div>
      ) : status === 'invalid' ? (
        <div style={card}>
          <h2 className="display-i" style={{ fontSize: 26, color: 'var(--ink)', margin: '0 0 10px' }}>Invite expired.</h2>
          <p style={{ fontSize: 14, color: 'var(--ink-light)', lineHeight: 1.6, margin: '0 0 20px' }}>
            This invite link is no longer valid. Ask Ops to resend your invitation.
          </p>
          <button className="btn-ghost" style={{ width: '100%' }} onClick={() => router.push('/login')}>Go to login</button>
        </div>
      ) : (
        <div style={card}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--tropic-d)', marginBottom: 8 }}>
            Welcome to Travail
          </div>
          <h2 className="display-i" style={{ fontSize: 28, color: 'var(--ink)', margin: '0 0 6px' }}>Set up your account.</h2>
          <p style={{ fontSize: 13.5, color: 'var(--ink-light)', lineHeight: 1.6, margin: '0 0 24px' }}>
            Choose a password and finish your member profile.
          </p>

          <div className="field">
            <label className="field-lab">Full name <span className="req">*</span></label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
          </div>
          <div className="field">
            <label className="field-lab">Home base</label>
            <select className="select" value={homeBase} onChange={e => setHomeBase(e.target.value)}>
              {HOME_BASES.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="field-lab">Bio</label>
            <textarea className="input" value={bio} onChange={e => setBio(e.target.value)} placeholder="A short intro for the network…" rows={3} maxLength={400} />
          </div>
          <div className="field">
            <label className="field-lab">Password <span className="req">*</span></label>
            <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" />
          </div>
          <div className="field">
            <label className="field-lab">Confirm password <span className="req">*</span></label>
            <input className="input" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Re-enter password" />
          </div>

          {error && (
            <div style={{ background: 'rgba(217,78,42,0.08)', border: '1px solid rgba(217,78,42,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--signal)', marginBottom: 14 }}>
              {error}
            </div>
          )}

          <button className="btn-primary" style={{ width: '100%', height: 44, justifyContent: 'center' }} onClick={complete} disabled={saving}>
            {saving ? 'Setting up…' : 'Enter Travail →'}
          </button>
        </div>
      )}
    </div>
  )
}
