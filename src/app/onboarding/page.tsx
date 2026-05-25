'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Member } from '@/lib/supabase/types'

const HOME_BASES = ['Tampa Bay', 'SFL']

type Phase = 'intro' | 'opening' | 'form'

export default function OnboardingPage() {
  const supabase = createClient()
  const router = useRouter()

  const [status, setStatus] = useState<'loading' | 'ready' | 'invalid'>('loading')
  const [phase, setPhase] = useState<Phase>('intro')
  const [member, setMember] = useState<Member | null>(null)
  const [name, setName] = useState('')
  const [homeBase, setHomeBase] = useState(HOME_BASES[0])
  const [bio, setBio] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Verify the invite and load the member behind the scenes while the envelope plays.
  useEffect(() => {
    async function init() {
      // The invite link lands here with credentials. Support PKCE (?code=),
      // OTP (?token_hash=&type=), and implicit (#access_token=) link formats.
      try {
        const url = new URL(window.location.href)
        const code = url.searchParams.get('code')
        const tokenHash = url.searchParams.get('token_hash')
        const type = url.searchParams.get('type')
        if (code || (tokenHash && type)) {
          // Clear any existing session first (e.g. an admin already signed in on
          // this browser) so the invite establishes the INVITED user's session,
          // never silently drops into the account that was already open.
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
          if (code) {
            await supabase.auth.exchangeCodeForSession(code)
          } else if (tokenHash && type) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as any })
          }
        }
        // (implicit hash tokens are picked up automatically by detectSessionInUrl)
      } catch { /* fall through to the session check */ }

      const { data: { user } } = await supabase.auth.getUser()
      // A dead invite shouldn't make anyone sit through the envelope ceremony.
      if (!user) { setStatus('invalid'); setPhase('form'); return }

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

  // Respect reduced-motion: skip the envelope ceremony entirely. Done in an
  // effect (not initial state) to avoid an SSR/client hydration mismatch.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase('form')
    }
  }, [])

  // Auto-open the envelope shortly after it appears.
  useEffect(() => {
    if (phase !== 'intro') return
    const t = setTimeout(() => setPhase(p => (p === 'intro' ? 'opening' : p)), 4000)
    return () => clearTimeout(t)
  }, [phase])

  // After the opening animation, reveal the letter (form).
  useEffect(() => {
    if (phase !== 'opening') return
    const t = setTimeout(() => setPhase('form'), 1050)
    return () => clearTimeout(t)
  }, [phase])

  function openEnvelope() {
    setPhase(p => (p === 'intro' ? 'opening' : p))
  }

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

  return (
    <div className="invite-wrap">
      <div className="invite-glow invite-glow--top" />
      <div className="invite-glow invite-glow--sun" />

      <div className="invite-stage">
        {phase !== 'form' ? (
          <div className="envelope-scene">
            <div className="envelope-eyebrow">By private invitation</div>
            <div className="envelope-headline">You&rsquo;re invited.</div>

            <div
              className={`envelope${phase === 'opening' ? ' is-open' : ''}`}
              role="button"
              tabIndex={0}
              aria-label="Open your invitation"
              onClick={openEnvelope}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEnvelope() } }}
            >
              <div className="env-body" />
              <div className="env-pocket" />
              <div className="env-flap" />
              <div className="env-seal">T</div>
            </div>

            <div className="envelope-hint">{phase === 'opening' ? 'Opening…' : 'Tap to open'}</div>
          </div>
        ) : (
          <div className="invite-card is-rising">
            {status === 'loading' ? (
              <div style={{ textAlign: 'center', padding: '34px 0', color: 'var(--ink-light)', fontSize: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                <span className="pending-indicator" />
                Verifying your invitation…
              </div>
            ) : status === 'invalid' ? (
              <>
                <div className="envelope-eyebrow">By private invitation</div>
                <h2 className="invite-title">Invite expired.</h2>
                <p className="invite-sub">This invitation link is no longer valid. Ask Ops to resend your invite and we&rsquo;ll have you in shortly.</p>
                <button className="btn-ghost" style={{ width: '100%' }} onClick={() => router.push('/login')}>Go to login</button>
              </>
            ) : (
              <>
                <div className="envelope-eyebrow">Your membership begins</div>
                <h2 className="invite-title">Welcome to Travail.</h2>
                <p className="invite-sub">Choose a password and finish your member profile. This is yours — make it feel like home.</p>

                <div className="field">
                  <label className="field-lab">Full name <span className="req">*</span></label>
                  <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" autoFocus />
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
                  <div role="alert" style={{ background: 'rgba(217,78,42,0.07)', border: '1px solid rgba(217,78,42,0.22)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--signal)', lineHeight: 1.45, marginBottom: 14 }}>
                    {error}
                  </div>
                )}

                <button className="btn-primary" style={{ width: '100%', height: 44, justifyContent: 'center', marginTop: 4 }} onClick={complete} disabled={saving}>
                  {saving ? 'Setting up…' : 'Enter Travail →'}
                </button>

                <div className="invite-footer">
                  Members only · Private invitation
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
