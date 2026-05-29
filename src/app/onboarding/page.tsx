'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { TRIP_TYPES, canonicalInterests } from '@/lib/data'
import { TRIP_TYPE_ICONS } from '@/lib/icons'
import EnvelopeSplash from '@/components/EnvelopeSplash'
import type { Member } from '@/lib/supabase/types'

const HOME_BASES = ['Tampa Bay', 'SFL']

type Phase = 'intro' | 'opening' | 'form'

export default function OnboardingPage() {
  const supabase = createClient()
  const router = useRouter()

  const [status, setStatus] = useState<'loading' | 'ready' | 'invalid'>('loading')
  // Envelope splash disabled for now — start straight on the form (no animation).
  const [phase, setPhase] = useState<Phase>('form')
  const [member, setMember] = useState<Member | null>(null)
  const [name, setName] = useState('')
  const [homeBase, setHomeBase] = useState(HOME_BASES[0])
  const [interests, setInterests] = useState<string[]>([])
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  // Older members can't reliably type a password they can't see, especially
  // with a re-confirm. Let them reveal both fields. (F5)
  const [showPw, setShowPw] = useState(false)

  const toggleInterest = (t: string) =>
    setInterests(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Self-service re-invite, shown when a link is already spent (see `invalid`).
  const [resendEmail, setResendEmail] = useState('')
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [resendError, setResendError] = useState('')

  // Verify the invite and load the member behind the scenes while the envelope plays.
  useEffect(() => {
    async function init() {
      // The invite link lands here with credentials. Support PKCE (?code=),
      // OTP (?token_hash=&type=), and implicit (#access_token=) link formats.
      //
      // Invite/recovery tokens are SINGLE-USE — once exchanged they can't be
      // exchanged again. But onboarding is multi-step and our auth cookies are
      // session-scoped (see lib/supabase/client.ts), so a member who gets
      // interrupted often returns and clicks the same email link a second time.
      // We make that retry resilient: a returning invitee's live session is
      // preserved (we no longer sign them out before a re-exchange that's bound
      // to fail), and an already-spent token simply falls through to the
      // existing session instead of dead-ending on "expired".
      try {
        const url = new URL(window.location.href)
        const code = url.searchParams.get('code')
        const tokenHash = url.searchParams.get('token_hash')
        const type = url.searchParams.get('type')

        // Who, if anyone, is already signed in on this browser? We only need to
        // clear the session when it belongs to an ADMIN — that's the case the
        // original sign-out guarded against (an admin opening/forwarding a link
        // and having the invite silently resolve to their own account). A
        // returning invitee's own session is kept so they can resume.
        const { data: { user: existingUser } } = await supabase.auth.getUser()
        let existingIsAdmin = false
        if (existingUser) {
          const { data: em } = await supabase
            .from('members').select('is_admin').eq('user_id', existingUser.id).maybeSingle()
          existingIsAdmin = !!(em as { is_admin?: boolean } | null)?.is_admin
        }

        if (code || (tokenHash && type)) {
          if (existingIsAdmin) {
            await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
          }
          try {
            if (code) {
              const { error } = await supabase.auth.exchangeCodeForSession(code)
              if (error) throw error
            } else if (tokenHash && type) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as any })
              if (error) throw error
            }
          } catch {
            // Token already used — e.g. a second click after an interrupted
            // first attempt. Fine as long as that first click's session is
            // still alive; we fall through to the session check below.
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
        setInterests(canonicalInterests((m as Member).interests))
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

  // Envelope choreography (auto-open, seal break, flap, card rise) is
  // driven by EnvelopeSplash itself; it calls onComplete when finished
  // and we transition straight to 'form' in the JSX below.

  // When a link is spent and the session is gone (e.g. the browser was closed
  // mid-setup, clearing our session cookies), the member can mail themselves a
  // fresh link. resetPasswordForEmail drops them right back on /onboarding and,
  // by design, never reveals whether an address is on file — safe pre-auth.
  async function resendLink(e: React.FormEvent) {
    e.preventDefault()
    setResendError('')
    const addr = resendEmail.trim()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) {
      setResendError('Enter a valid email address.')
      return
    }
    setResendState('sending')
    try {
      const { error: resErr } = await supabase.auth.resetPasswordForEmail(addr, {
        redirectTo: `${window.location.origin}/onboarding`,
      })
      if (resErr) throw resErr
    } catch {
      // Show success regardless: don't leak which emails exist, and most
      // failures here are transient. Ops can always re-invite manually.
    }
    setResendState('sent')
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: upErr } = await (supabase.from('members') as any)
          .update({
            name: name.trim(),
            initials,
            home_base_code: homeBase,
            interests: interests.length > 0 ? interests : null,
          })
          .eq('id', member.id)
        if (upErr) throw upErr
      }
      // Browse-first (F6): drop them straight into the app once password +
      // profile are set — no forced subscribe step. They can explore, and
      // the membership banner / booking flow prompts them to subscribe when
      // they're ready to actually book.
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
          <EnvelopeSplash
            autoOpen
            autoCompleteAfterMs={700}
            onComplete={() => setPhase('form')}
          />
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
                {resendState === 'sent' ? (
                  <>
                    <h2 className="invite-title">Check your inbox.</h2>
                    <p className="invite-sub">If that address is on our list, a fresh link is on its way. It brings you right back here to finish setting up — no rush, you&rsquo;ll pick up where you left off.</p>
                    <button className="btn-ghost" style={{ width: '100%' }} onClick={() => router.push('/login')}>Go to login</button>
                  </>
                ) : (
                  <>
                    <h2 className="invite-title">Let&rsquo;s get you a fresh link.</h2>
                    <p className="invite-sub">Invite links open only once, so if you stepped away mid-setup this one may already be used. Enter your email and we&rsquo;ll send a new one that brings you back to finish.</p>
                    <form onSubmit={resendLink}>
                      <div className="field">
                        <label className="field-lab">Email <span className="req">*</span></label>
                        <input
                          className="input"
                          type="email"
                          value={resendEmail}
                          onChange={e => setResendEmail(e.target.value)}
                          placeholder="you@example.com"
                          autoComplete="email"
                          autoFocus
                        />
                      </div>
                      {resendError && (
                        <div role="alert" style={{ background: 'rgba(217,78,42,0.07)', border: '1px solid rgba(217,78,42,0.22)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--signal)', lineHeight: 1.45, marginBottom: 14 }}>
                          {resendError}
                        </div>
                      )}
                      <button type="submit" className="btn-primary" style={{ width: '100%', height: 44, justifyContent: 'center', marginTop: 4 }} disabled={resendState === 'sending'}>
                        {resendState === 'sending' ? 'Sending…' : 'Email me a new link →'}
                      </button>
                    </form>
                    <button type="button" className="btn-ghost" style={{ width: '100%', marginTop: 10 }} onClick={() => router.push('/login')}>Go to login</button>
                  </>
                )}
              </>
            ) : (
              <>
                {/* Co-brand lockup — Travail wordmark × Tropic frigate.
                    Sets the tone before any form fields appear. */}
                <div className="onboarding-brand" aria-label="Travail × Tropic Ocean Air">
                  <Image
                    src="/travail-wordmark.png"
                    alt="Travail"
                    width={180}
                    height={56}
                    priority
                    className="onboarding-brand__travail"
                  />
                  <span className="onboarding-brand__x" aria-hidden>×</span>
                  <Image
                    src="/tropic-logo.png"
                    alt="Tropic Ocean Air"
                    width={36}
                    height={36}
                    className="onboarding-brand__tropic"
                  />
                </div>

                <div className="envelope-eyebrow">Your membership begins</div>
                <h2 className="invite-title">Welcome to Travail.</h2>
                <p className="invite-sub">Choose a password and finish your profile. This is yours, so make it feel like home.</p>

                <div className="field">
                  <label className="field-lab">Full name <span className="req">*</span></label>
                  <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" autoFocus />
                </div>
                <div className="field">
                  <label className="field-lab">Home base</label>
                  <div className="onboarding-base-row">
                    {HOME_BASES.map(b => (
                      <button
                        key={b}
                        type="button"
                        className={`chip${homeBase === b ? ' active' : ''}`}
                        onClick={() => setHomeBase(b)}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <label className="field-lab">
                    What you&rsquo;re into
                    <span style={{ fontWeight: 400, color: 'var(--ink-light)', marginLeft: 6, textTransform: 'none', letterSpacing: 0 }}>(pick any)</span>
                  </label>
                  <div className="onboarding-interests" role="group" aria-label="Activity interests">
                    {TRIP_TYPES.map(t => {
                      const active = interests.includes(t)
                      return (
                        <button
                          key={t}
                          type="button"
                          className={`onboarding-interest${active ? ' active' : ''}`}
                          onClick={() => toggleInterest(t)}
                          aria-pressed={active}
                        >
                          <span className="onboarding-interest__icon">{TRIP_TYPE_ICONS[t]}</span>
                          <span className="onboarding-interest__label">{t}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="field">
                  <label className="field-lab">Password <span className="req">*</span></label>
                  <input className="input" type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" />
                </div>
                <div className="field">
                  <label className="field-lab">Confirm password <span className="req">*</span></label>
                  <input className="input" type={showPw ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Re-enter password" autoComplete="new-password" />
                  <button
                    type="button"
                    onClick={() => setShowPw(s => !s)}
                    style={{ background: 'none', border: 'none', padding: '6px 2px 0', color: 'var(--tropic-d)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                  >
                    {showPw ? 'Hide passwords' : 'Show passwords'}
                  </button>
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
