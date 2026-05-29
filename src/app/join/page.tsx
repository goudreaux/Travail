'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Invite-code signup — the path of least resistance. The member's row already
// exists (ops created it), so all we ask for here is a code (pre-filled from
// the link) and a password. Redeem → sign in → land in the app → tutorial.
function JoinInner() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()

  // Seed the code from the link up front so it survives a failed validation
  // (no setState-in-effect needed — the effect only kicks off validation).
  const [code, setCode] = useState(() => searchParams.get('code') ?? '')
  const [status, setStatus] = useState<'loading' | 'ready' | 'invalid' | 'need-code'>('loading')
  const [invalidMsg, setInvalidMsg] = useState('')
  const [memberName, setMemberName] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Validate the code (from the link, or whatever was typed) and load who it's for.
  async function validate(raw: string) {
    const c = raw.trim()
    if (!c) { setStatus('need-code'); return }
    setStatus('loading')
    try {
      const res = await fetch(`/api/join?code=${encodeURIComponent(c)}`)
      const json = await res.json().catch(() => ({}))
      if (res.ok && json.ok) {
        setMemberName(json.name ?? null)
        setName(json.name ?? '')
        setCode(c)
        setStatus('ready')
      } else {
        setInvalidMsg(json.error ?? "That code isn't valid.")
        setStatus('invalid')
      }
    } catch {
      setInvalidMsg('Something went wrong checking that code. Please try again.')
      setStatus('invalid')
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    validate(code)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function complete() {
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, password, name: name.trim() || undefined }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Could not complete signup.')
      // Sign in with the credentials we just set, then into the app — the
      // first-login tutorial fires automatically once they land.
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email: json.email, password })
      if (signInErr) throw signInErr
      router.push('/')
    } catch (e) {
      setError((e as Error).message ?? 'Something went wrong. Please try again.')
      setSaving(false)
    }
  }

  return (
    <div className="invite-wrap">
      <div className="invite-glow invite-glow--top" />
      <div className="invite-glow invite-glow--sun" />

      <div className="invite-stage">
        <div className="invite-card is-rising">
          {status === 'loading' ? (
            <div style={{ textAlign: 'center', padding: '34px 0', color: 'var(--ink-light)', fontSize: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              <span className="pending-indicator" />
              Checking your invite code…
            </div>
          ) : status === 'invalid' ? (
            <>
              <div className="envelope-eyebrow">By private invitation</div>
              <h2 className="invite-title">Let&rsquo;s sort this out.</h2>
              <p className="invite-sub">{invalidMsg}</p>
              <div className="field">
                <label className="field-lab">Invite code</label>
                <input
                  className="input"
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  placeholder="XXXX-XXXX"
                  autoFocus
                  style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}
                />
              </div>
              <button className="btn-primary" style={{ width: '100%', height: 44, justifyContent: 'center', marginTop: 4 }} onClick={() => validate(code)}>
                Try this code →
              </button>
              <button type="button" className="btn-ghost" style={{ width: '100%', marginTop: 10 }} onClick={() => router.push('/login')}>Go to login</button>
            </>
          ) : status === 'need-code' ? (
            <>
              <div className="envelope-eyebrow">By private invitation</div>
              <h2 className="invite-title">Enter your invite code.</h2>
              <p className="invite-sub">Your host gave you a code to join. Pop it in below to set up your account.</p>
              <div className="field">
                <label className="field-lab">Invite code <span className="req">*</span></label>
                <input
                  className="input"
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  placeholder="XXXX-XXXX"
                  autoFocus
                  style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}
                />
              </div>
              <button className="btn-primary" style={{ width: '100%', height: 44, justifyContent: 'center', marginTop: 4 }} onClick={() => validate(code)}>
                Continue →
              </button>
            </>
          ) : (
            <>
              <div className="envelope-eyebrow">Your membership begins</div>
              <h2 className="invite-title">
                {memberName ? `Welcome, ${memberName.split(' ')[0]}.` : 'Welcome to Travail.'}
              </h2>
              <p className="invite-sub">You&rsquo;re in. Set a password and you&rsquo;re through — everything else you can fill in later.</p>

              <div className="field">
                <label className="field-lab">Your name</label>
                <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
              </div>
              <div className="field">
                <label className="field-lab">Password <span className="req">*</span></label>
                <input className="input" type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" autoFocus />
              </div>
              <div className="field">
                <label className="field-lab">Confirm password <span className="req">*</span></label>
                <input className="input" type={showPw ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Re-enter password" autoComplete="new-password" />
                <button
                  type="button"
                  onClick={() => setShowPw(s => !s)}
                  style={{ background: 'none', border: 'none', padding: '6px 2px 0', color: 'var(--tropic-d)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  {showPw ? 'Hide password' : 'Show password'}
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

              <div className="invite-footer">Members only · Private invitation</div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function JoinPage() {
  return (
    <Suspense fallback={null}>
      <JoinInner />
    </Suspense>
  )
}
