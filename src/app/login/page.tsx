'use client'
export const dynamic = 'force-dynamic'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
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
      router.push('/')
      router.refresh()
    }
  }

  return (
    <div className="login-wrap">
      {/* Tropic glow — top center */}
      <div style={{
        position: 'absolute',
        top: '-80px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 700,
        height: 700,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0,179,199,0.07) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />
      {/* Sun glow — bottom right */}
      <div style={{
        position: 'absolute',
        bottom: '-60px',
        right: '-60px',
        width: 400,
        height: 400,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(244,167,44,0.06) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />

      <div className="login-card" style={{ animation: 'fade 0.45s ease' }}>

        {/* Brand lockup */}
        <div className="login-brand">
          {/* Eyebrow */}
          <div style={{
            fontFamily: 'var(--mono)',
            fontSize: 9.5,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--tropic)',
            marginBottom: 14,
          }}>
            Founding Season · Field &amp; Stream
          </div>

          {/* Wordmark */}
          <div style={{
            fontFamily: 'var(--display)',
            fontStyle: 'italic',
            fontWeight: 500,
            fontSize: 52,
            letterSpacing: '-0.01em',
            lineHeight: 1,
            color: 'var(--ink)',
            marginBottom: 8,
          }}>
            Travail
          </div>

          {/* Partner tag */}
          <div style={{
            fontFamily: 'var(--mono)',
            fontSize: 10.5,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--ink-light)',
          }}>
            × Tropic Air
          </div>
        </div>

        {/* Rule */}
        <div style={{
          height: 1,
          background: 'linear-gradient(90deg, transparent, var(--hair-2) 20%, var(--hair-2) 80%, transparent)',
          margin: '0 -4px 28px',
        }} />

        {/* Form */}
        <form className="login-form" onSubmit={handleLogin}>
          <div className="field">
            <label className="field-lab" htmlFor="email">
              Email address
            </label>
            <input
              id="email"
              type="email"
              className="input"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoFocus
            />
          </div>

          <div className="field">
            <label className="field-lab" htmlFor="password">
              Password
            </label>
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
            <div role="alert" style={{
              background: 'rgba(217,78,42,0.07)',
              border: '1px solid rgba(217,78,42,0.22)',
              borderRadius: 8,
              padding: '10px 14px',
              color: 'var(--signal)',
              fontSize: 13,
              lineHeight: 1.45,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
            }}>
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
            className="btn-primary"
            disabled={loading}
            style={{
              width: '100%',
              height: 42,
              justifyContent: 'center',
              fontSize: 14,
              letterSpacing: '0.02em',
              marginTop: 6,
              opacity: loading ? 0.75 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s, opacity 0.15s',
            }}
          >
            {loading ? (
              <>
                <span className="pending-indicator" style={{ width: 14, height: 14, borderWidth: 1.5 }} />
                Signing in…
              </>
            ) : (
              'Sign in to Travail'
            )}
          </button>
        </form>

        {/* Footer */}
        <div style={{
          marginTop: 28,
          paddingTop: 20,
          borderTop: '1px solid var(--hair)',
          textAlign: 'center',
          fontFamily: 'var(--mono)',
          fontSize: 9.5,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: 'var(--ink-faint)',
          lineHeight: 1.8,
        }}>
          Members only · Private invitation required
          <br />
          <span style={{ color: 'var(--ink-faint)', opacity: 0.6 }}>
            © {new Date().getFullYear()} Travail Aviation
          </span>
        </div>
      </div>
    </div>
  )
}
