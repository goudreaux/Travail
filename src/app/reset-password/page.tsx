'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

// Landing page for the password-reset email link. Supabase sends the
// link with either ?code= (PKCE) or ?token_hash=&type=recovery. We
// exchange whatever we get into a session, then let the user set a
// new password via supabase.auth.updateUser.
//
// Once the password is set, we sign out and redirect to /login so they
// re-enter with the new credentials cleanly.
type Status = 'verifying' | 'ready' | 'invalid' | 'saving' | 'done'

export default function ResetPasswordPage() {
  const supabase = createClient()
  const router = useRouter()

  const [status, setStatus] = useState<Status>('verifying')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false) // let members reveal what they type (F5)
  const [error, setError] = useState('')

  useEffect(() => {
    async function verify() {
      try {
        const url = new URL(window.location.href)
        const code = url.searchParams.get('code')
        const tokenHash = url.searchParams.get('token_hash')
        const type = url.searchParams.get('type')
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) { setStatus('invalid'); return }
        } else if (tokenHash && type) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as any })
          if (error) { setStatus('invalid'); return }
        }
        // Implicit hash tokens are picked up automatically; either way,
        // confirm we end with a session before letting them set a password.
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setStatus('invalid'); return }
        setStatus('ready')
      } catch {
        setStatus('invalid')
      }
    }
    verify()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setStatus('saving')
    const { error: upErr } = await supabase.auth.updateUser({ password })
    if (upErr) {
      setError(upErr.message)
      setStatus('ready')
      return
    }
    // Sign out so the user re-enters with the new password cleanly —
    // and so a hijacked recovery link can't leave behind an open session.
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
    setStatus('done')
    setTimeout(() => router.push('/login'), 1600)
  }

  return (
    <div className="invite-wrap">
      <div className="invite-glow invite-glow--top" />
      <div className="invite-glow invite-glow--sun" />

      <div className="invite-stage">
        <div className="invite-card is-rising">
          {/* Co-brand lockup, same as the onboarding form. */}
          <div className="onboarding-brand" aria-label="Travail × Tropic Ocean Air">
            <Image src="/travail-wordmark.png" alt="Travail" width={180} height={56} priority className="onboarding-brand__travail" />
            <span className="onboarding-brand__x" aria-hidden>×</span>
            <Image src="/tropic-logo.png" alt="Tropic Ocean Air" width={36} height={36} className="onboarding-brand__tropic" />
          </div>

          {status === 'verifying' && (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--ink-light)', fontSize: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              <span className="pending-indicator" />
              Verifying your reset link…
            </div>
          )}

          {status === 'invalid' && (
            <>
              <div className="envelope-eyebrow">Link expired</div>
              <h2 className="invite-title">This link didn&rsquo;t work.</h2>
              <p className="invite-sub">Reset links are good for one hour and can only be used once. Request a new one from the sign-in screen.</p>
              <button type="button" className="btn-ghost" style={{ width: '100%' }} onClick={() => router.push('/login')}>← Back to sign in</button>
            </>
          )}

          {status === 'done' && (
            <>
              <div className="login-reset-done__seal" aria-hidden style={{ margin: '8px auto 14px' }}>
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="4 11 9 16 18 6" />
                </svg>
              </div>
              <h2 className="invite-title" style={{ textAlign: 'center' }}>Password updated.</h2>
              <p className="invite-sub" style={{ textAlign: 'center' }}>Taking you to the sign-in screen…</p>
            </>
          )}

          {(status === 'ready' || status === 'saving') && (
            <form onSubmit={submit}>
              <div className="envelope-eyebrow">Choose a new password</div>
              <h2 className="invite-title">Set it &amp; you&rsquo;re in.</h2>
              <p className="invite-sub">Pick something at least 8 characters. Your old password will stop working immediately.</p>

              <div className="field">
                <label className="field-lab">New password <span className="req">*</span></label>
                <input
                  className="input"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  autoFocus
                />
              </div>
              <div className="field">
                <label className="field-lab">Confirm new password <span className="req">*</span></label>
                <input
                  className="input"
                  type={showPw ? 'text' : 'password'}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Re-enter password"
                  autoComplete="new-password"
                />
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

              <button type="submit" className="btn-primary" style={{ width: '100%', height: 44, justifyContent: 'center', marginTop: 4 }} disabled={status === 'saving'}>
                {status === 'saving' ? 'Saving…' : 'Update password →'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
