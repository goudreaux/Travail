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
  const [phase, setPhase] = useState<Phase>('intro')
  const [member, setMember] = useState<Member | null>(null)
  const [name, setName] = useState('')
  const [homeBase, setHomeBase] = useState(HOME_BASES[0])
  const [interests, setInterests] = useState<string[]>([])
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  const toggleInterest = (t: string) =>
    setInterests(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
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
      // After password + profile are set, collect the founder-rate
      // subscription before dropping them into the app. The subscribe
      // page is gated to admins-only for the skip path.
      router.push('/onboarding/subscribe')
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
                <h2 className="invite-title">Invite expired.</h2>
                <p className="invite-sub">This invitation link is no longer valid. Ask Ops to resend your invite and we&rsquo;ll have you in shortly.</p>
                <button className="btn-ghost" style={{ width: '100%' }} onClick={() => router.push('/login')}>Go to login</button>
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
