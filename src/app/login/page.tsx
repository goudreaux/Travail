'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

// Sign-in is email + password. Members set their password when they redeem
// their invite at /join. (The email-code / OTP path was removed — password is
// the one and only way in.)
export default function LoginPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState(false)

  // Land the member in the app. link_my_member() attaches a freshly-created
  // auth user to their pre-created member row (no-op if already linked) — but
  // we must NEVER let it block the redirect, or a slow/hanging RPC leaves the
  // member stuck on "Signing in…". Fire it best-effort with a short timeout and
  // redirect regardless; the feed page also self-heals the link on load.
  async function enterApp() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const link = (supabase as any).rpc('link_my_member').catch(() => {})
      await Promise.race([link, new Promise(r => setTimeout(r, 1500))])
    } catch { /* ignore — redirect anyway */ }
    window.location.href = '/'
  }

  // Safety net: if a member ever lands here from an emailed auth link, the
  // session arrives in the URL hash (#access_token=…&refresh_token=…). Establish
  // it directly and go, rather than dead-ending on the form.
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
        setError('That sign-in link didn’t work — enter your email and password below.')
        history.replaceState(null, '', window.location.pathname)
        return
      }
      await enterApp()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
            Sign <em>in</em>.
          </h2>
          <p className="login-form-pane__sub">
            {processing ? 'Signing you in…' : 'Use the email and password tied to your membership.'}
          </p>

          {processing ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--ink-light)', fontSize: 14, padding: '8px 0 24px' }}>
              <span className="pending-indicator" style={{ width: 18, height: 18, borderWidth: 2 }} />
              One moment — getting you into Travail.
            </div>
          ) : (
            <form className="login-form" onSubmit={signInPassword}>
              <div className="field">
                <label className="field-lab" htmlFor="email">Email</label>
                <input
                  id="email" type="email" className="input" placeholder="you@example.com"
                  value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" autoFocus
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
