'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

// Sign-in is email + 6-digit code (OTP) by default — the most reliable path:
// no magic links, no redirects, no URL-hash tokens. verifyOtp returns the
// session directly and our cookie client persists it. Members with a password
// can still use one via the secondary "password" mode.
type Mode = 'email' | 'code' | 'password'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export default function LoginPage() {
  const supabase = createClient()
  const [mode, setMode] = useState<Mode>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [processing, setProcessing] = useState(false)

  // Land the member in the app. link_my_member() attaches a freshly-created
  // auth user to their pre-created member row (no-op if already linked).
  async function enterApp() {
    // link_my_member() isn't in the generated RPC types — cast as the codebase
    // does elsewhere for untyped RPCs.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).rpc('link_my_member').catch(() => {})
    window.location.href = '/'
  }

  // If a member clicks an emailed sign-in LINK (vs typing the code), the session
  // arrives in the URL hash (#access_token=…&refresh_token=…). Establish it
  // directly here and go — works no matter which one they use, and no longer
  // dead-ends on the form with a valid token sitting unused in the URL.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const hash = window.location.hash
    if (!hash || !hash.includes('access_token')) return
    const hp = new URLSearchParams(hash.replace(/^#/, ''))
    const access_token = hp.get('access_token')
    const refresh_token = hp.get('refresh_token')
    if (!access_token || !refresh_token) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProcessing(true)
    ;(async () => {
      const { error: sErr } = await supabase.auth.setSession({ access_token, refresh_token })
      if (sErr) {
        setProcessing(false)
        setError('That sign-in link didn’t work — enter your email below for a fresh code.')
        history.replaceState(null, '', window.location.pathname)
        return
      }
      await enterApp()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function requestCode(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const addr = email.trim().toLowerCase()
    if (!EMAIL_RE.test(addr)) { setError('Enter a valid email address.'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: addr }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'Could not send a code. Please try again.')
      setEmail(addr)
      setCode('')
      setNotice(`We sent a 6-digit code to ${addr}. It’s good for a few minutes.`)
      setMode('code')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const token = code.replace(/\D/g, '')
    if (token.length !== 6) { setError('Enter the 6-digit code from your email.'); return }
    setLoading(true)
    const { error: vErr } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
    if (vErr) {
      setError('That code didn’t work. Double-check it, or send a new one.')
      setLoading(false)
      return
    }
    await enterApp()
  }

  async function signInPassword(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: sErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (sErr) {
      setError(sErr.message)
      setLoading(false)
      return
    }
    await enterApp()
  }

  function gotoEmail() { setError(''); setNotice(''); setPassword(''); setMode('email') }
  function gotoPassword() { setError(''); setNotice(''); setMode('password') }

  return (
    <div className="login-wrap">
      <section className="login-brand-pane">
        <div className="login-brand-pane__glow login-brand-pane__glow--teal" aria-hidden />
        <div className="login-brand-pane__glow login-brand-pane__glow--sun" aria-hidden />

        <div className="login-brand-pane__top">
          <div className="login-brand-pane__live">
            <span className="login-brand-pane__livedot" aria-hidden />
            Live · Tampa Bay
          </div>
        </div>

        <div className="login-brand-pane__main">
          <h1 className="login-brand-pane__welcome">
            <span className="login-brand-pane__welcome-pre">Welcome to</span>
            <span className="login-brand-pane__welcome-mark">
              <Image src="/travail-wordmark.png" alt="Travail" width={320} height={120} priority />
            </span>
          </h1>
          <p className="login-brand-pane__tagline">Private aviation + curated experiences.</p>
        </div>

        <div className="login-brand-pane__bottom">
          <span className="login-brand-pane__powered">Powered by</span>
          <span className="login-brand-pane__tropic">
            <Image src="/tropic-logo.png" alt="Tropic Ocean Air" width={32} height={32} />
            <span>Tropic Ocean Air</span>
          </span>
        </div>
      </section>

      <section className="login-form-pane">
        <div className="login-form-pane__inner">
          <div className="login-form-pane__eyebrow">Members entrance</div>
          <h2 className="login-form-pane__title">
            {mode === 'code' ? <>Check your <em>email</em>.</> : <>Sign <em>in</em>.</>}
          </h2>
          <p className="login-form-pane__sub">
            {processing
              ? 'Signing you in…'
              : mode === 'code'
              ? 'Enter the 6-digit code we just sent you.'
              : mode === 'password'
              ? 'Use the email and password tied to your membership.'
              : 'Enter your email and we’ll send you a sign-in code.'}
          </p>

          {/* Clicked an email sign-in link — establishing the session. */}
          {processing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--ink-light)', fontSize: 14, padding: '8px 0 24px' }}>
              <span className="pending-indicator" style={{ width: 18, height: 18, borderWidth: 2 }} />
              One moment — getting you into Travail.
            </div>
          )}

          {/* EMAIL → request a code */}
          {!processing && mode === 'email' && (
            <form className="login-form" onSubmit={requestCode}>
              <div className="field">
                <label className="field-lab" htmlFor="email">Email</label>
                <input
                  id="email" type="email" className="input" placeholder="you@example.com"
                  value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" autoFocus
                />
              </div>
              {error && <LoginError msg={error} />}
              <button type="submit" className="login-submit" disabled={loading}>
                {loading ? <><span className="pending-indicator" style={{ width: 14, height: 14, borderWidth: 1.5 }} />Sending…</> : 'Email me a code →'}
              </button>
              <button type="button" className="login-link" onClick={gotoPassword} style={{ marginTop: 10 }}>
                Prefer a password? Sign in with one
              </button>
            </form>
          )}

          {/* CODE → verify */}
          {mode === 'code' && (
            <form className="login-form" onSubmit={verifyCode}>
              {notice && (
                <div className="login-reset-hint" style={{ marginBottom: 14 }}>{notice}</div>
              )}
              <div className="field">
                <label className="field-lab" htmlFor="code">6-digit code</label>
                <input
                  id="code" inputMode="numeric" autoComplete="one-time-code" className="input"
                  placeholder="123456" maxLength={6}
                  value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required autoFocus
                  style={{ letterSpacing: '0.4em', fontSize: 20, fontFamily: 'var(--mono)', textAlign: 'center' }}
                />
              </div>
              {error && <LoginError msg={error} />}
              <button type="submit" className="login-submit" disabled={loading}>
                {loading ? <><span className="pending-indicator" style={{ width: 14, height: 14, borderWidth: 1.5 }} />Verifying…</> : 'Enter Travail →'}
              </button>
              <div style={{ display: 'flex', gap: 16, marginTop: 10, justifyContent: 'center' }}>
                <button type="button" className="login-link" onClick={requestCode} disabled={loading}>Resend code</button>
                <button type="button" className="login-link" onClick={gotoEmail}>Use a different email</button>
              </div>
            </form>
          )}

          {/* PASSWORD → classic sign-in */}
          {mode === 'password' && (
            <form className="login-form" onSubmit={signInPassword}>
              <div className="field">
                <label className="field-lab" htmlFor="email-pw">Email</label>
                <input
                  id="email-pw" type="email" className="input" placeholder="you@example.com"
                  value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email"
                />
              </div>
              <div className="field">
                <label className="field-lab" htmlFor="password">Password</label>
                <input
                  id="password" type="password" className="input" placeholder="••••••••••••"
                  value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password"
                />
              </div>
              {error && <LoginError msg={error} />}
              <button type="submit" className="login-submit" disabled={loading}>
                {loading ? <><span className="pending-indicator" style={{ width: 14, height: 14, borderWidth: 1.5 }} />Signing in…</> : 'Sign in →'}
              </button>
              <button type="button" className="login-link" onClick={gotoEmail} style={{ marginTop: 10 }}>
                ← Email me a code instead
              </button>
            </form>
          )}

          <div className="login-form-pane__footer">
            <span>Members only · Private invitation</span>
            <span className="login-form-pane__copyright">© {new Date().getFullYear()} Travail</span>
          </div>
        </div>
      </section>
    </div>
  )
}

function LoginError({ msg }: { msg: string }) {
  return (
    <div role="alert" className="login-error">
      <svg width="14" height="14" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
        <circle cx="11" cy="11" r="8" />
        <line x1="11" y1="7" x2="11" y2="12" />
        <circle cx="11" cy="15.5" r="0.7" fill="currentColor" />
      </svg>
      {msg}
    </div>
  )
}
