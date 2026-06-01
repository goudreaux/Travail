'use client'
import { useEffect, useState } from 'react'

// Post-tutorial "Add to home screen" popup. Shown once, right after the
// first-login tutorial closes (the install step used to be tutorial step 6,
// but it was confusing people mid-tour). Platform-aware instructions + a
// Skip. Dismissal writes the SAME localStorage key the bottom banner reads,
// so the member isn't nagged twice.

const DISMISS_KEY = 'tvl-a2hs-dismissed'

type Platform = 'unknown' | 'installed' | 'ios' | 'android' | 'desktop'

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return 'unknown'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const standaloneIOS = (navigator as any).standalone === true
  const standaloneDisplay = window.matchMedia?.('(display-mode: standalone)').matches
  if (standaloneIOS || standaloneDisplay) return 'installed'
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'desktop'
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
      <span style={{
        flexShrink: 0, width: 22, height: 22, borderRadius: '50%',
        background: 'var(--tropic-glow)', color: 'var(--tropic-d)',
        fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{n}</span>
      <span style={{ flex: 1, fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.55, paddingTop: 1 }}>{children}</span>
    </div>
  )
}

function Instructions({ platform }: { platform: Platform }) {
  if (platform === 'ios') {
    return (
      <div>
        <div style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.55, marginBottom: 12 }}>
          Make Travail behave like a real app on iPhone. Three taps in Safari:
        </div>
        <Step n={1}>Tap the <strong>Share</strong> button at the bottom of Safari (the square with an up-arrow).</Step>
        <Step n={2}>Scroll down and pick <strong>Add to Home Screen</strong>.</Step>
        <Step n={3}>Tap <strong>Add</strong>. Travail lives on your home screen now, opening full-screen with no Safari chrome.</Step>
        <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 8, lineHeight: 1.5 }}>
          Note: this only works in Safari, not Chrome or another browser on iOS.
        </div>
      </div>
    )
  }
  if (platform === 'android') {
    return (
      <div>
        <div style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.55, marginBottom: 12 }}>
          Make Travail behave like a real app on Android. Two taps in Chrome:
        </div>
        <Step n={1}>Tap the <strong>three-dot menu</strong> in the top-right corner of Chrome.</Step>
        <Step n={2}>Pick <strong>Install app</strong> (or <strong>Add to Home screen</strong> on older Chrome).</Step>
        <Step n={3}>Confirm <strong>Install</strong>. Travail appears on your home screen and launches full-screen.</Step>
      </div>
    )
  }
  // Desktop fallback
  return (
    <div style={{ fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
      You&apos;re on desktop right now. Open Travail on your phone (Safari for iPhone, Chrome for Android) and follow the prompt there — it only takes a few seconds and makes the app feel native.
    </div>
  )
}

export default function AddToHomeScreenModal({ onClose }: { onClose: () => void }) {
  const [platform, setPlatform] = useState<Platform>('unknown')

  // Detect on the client. If already installed, there's nothing to nudge —
  // close immediately without ever flashing the modal.
  useEffect(() => {
    const p = detectPlatform()
    if (p === 'installed') { onClose(); return }
    setPlatform(p)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ }
    onClose()
  }

  if (platform === 'unknown' || platform === 'installed') return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add Travail to your home screen"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(4, 33, 40, 0.78)',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div style={{
        background: 'var(--card)', borderRadius: 18, maxWidth: 460, width: '100%',
        boxShadow: '0 30px 80px rgba(0,0,0,0.30)', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '24px 26px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ color: 'var(--tropic)' }}>
              <svg width="30" height="30" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="3" width="12" height="16" rx="2" />
                <line x1="11" y1="16" x2="11" y2="16" />
              </svg>
            </span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--tropic-d)', fontWeight: 700 }}>
              One last thing
            </span>
          </div>
          <div style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontWeight: 500, fontSize: 22, color: 'var(--ink)', lineHeight: 1.15, letterSpacing: '-0.015em', marginBottom: 14 }}>
            Add Travail to your home screen.
          </div>
          <Instructions platform={platform} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, padding: '14px 18px', borderTop: '1px solid var(--hair)', background: 'var(--paper)' }}>
          <button className="btn-ghost" style={{ fontSize: 13 }} onClick={dismiss}>Maybe later</button>
          <button className="btn-primary" style={{ fontSize: 13 }} onClick={dismiss}>Got it</button>
        </div>
      </div>
    </div>
  )
}
