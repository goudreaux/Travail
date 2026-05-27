'use client'
export const dynamic = 'force-dynamic'
import { useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      window.location.href = '/'
    }
  }

  return (
    <div className="login-wrap">
      {/* Left / top: dark editorial brand block — same vocabulary as the
          feed-hero (glow blobs, italic display headline, mono eyebrow). */}
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
            <span className="login-brand-pane__welcome-pre">Welcome back to</span>
            <span className="login-brand-pane__welcome-mark">
              <Image
                src="/travail-wordmark.png"
                alt="Travail"
                width={320}
                height={120}
                priority
              />
            </span>
          </h1>

          <p className="login-brand-pane__tagline">
            Private aviation + curated experiences.<br />
            For a small set of founders.
          </p>
        </div>

        <div className="login-brand-pane__bottom">
          <span className="login-brand-pane__powered">Powered by</span>
          <span className="login-brand-pane__tropic">
            <Image
              src="/tropic-logo.png"
              alt="Tropic Ocean Air"
              width={32}
              height={32}
            />
            <span>Tropic Ocean Air</span>
          </span>
        </div>
      </section>

      {/* Right / bottom: cream paper form pane. */}
      <section className="login-form-pane">
        <div className="login-form-pane__inner">
          <div className="login-form-pane__eyebrow">Members entrance</div>
          <h2 className="login-form-pane__title">
            Sign <em>in</em>.
          </h2>
          <p className="login-form-pane__sub">
            Use the email tied to your invitation.
          </p>

          <form className="login-form" onSubmit={handleLogin}>
            <div className="field">
              <label className="field-lab" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                className="input"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="field">
              <label className="field-lab" htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                className="input"
                placeholder="••••••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div role="alert" className="login-error">
                <svg width="14" height="14" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
                  <circle cx="11" cy="11" r="8" />
                  <line x1="11" y1="7" x2="11" y2="12" />
                  <circle cx="11" cy="15.5" r="0.7" fill="currentColor" />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              className="login-submit"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="pending-indicator" style={{ width: 14, height: 14, borderWidth: 1.5 }} />
                  Signing in…
                </>
              ) : (
                'Sign in →'
              )}
            </button>
          </form>

          <div className="login-form-pane__footer">
            <span>Members only · Private invitation</span>
            <span className="login-form-pane__copyright">© {new Date().getFullYear()} Travail</span>
          </div>
        </div>
      </section>
    </div>
  )
}
