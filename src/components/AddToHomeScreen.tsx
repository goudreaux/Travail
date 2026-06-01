'use client'
import { useEffect, useState } from 'react'

// Lightweight "Add to Home Screen" nudge (F3/F7). Travail is a PWA, not a
// native app — testers expected to "download the app", so this lets them
// install it to the home screen where it opens full-screen like one.
//   • Android / Chrome fire `beforeinstallprompt` → we show an Install button.
//   • iOS Safari has no such API → we show the manual Share → Add to Home
//     Screen hint.
// One-shot; dismissal is remembered in localStorage. Hidden when already
// running as an installed app.

const DISMISS_KEY = 'tvl-a2hs-dismissed'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BeforeInstallPromptEvent = any

export default function AddToHomeScreen({ suppressed = false }: { suppressed?: boolean } = {}) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [isIos, setIsIos] = useState(false)
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try { if (localStorage.getItem(DISMISS_KEY)) return } catch { /* ignore */ }

    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (navigator as any).standalone === true
    if (standalone) return

    const ua = navigator.userAgent || ''
    const ios = /iphone|ipad|ipod/i.test(ua)
    const iosSafari = ios && /safari/i.test(ua) && !/crios|fxios/i.test(ua)
    if (iosSafari) {
      setIsIos(true)
      setShow(true)
      return
    }

    const onPrompt = (e: Event) => {
      e.preventDefault() // stash it; we trigger from our own button
      setDeferred(e)
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  // Suppressed while the first-login tutorial / post-tutorial install popup
  // owns the install nudge — avoids double-nagging on first sign-in.
  if (suppressed || !show) return null

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ }
    setShow(false)
  }

  async function install() {
    if (!deferred) return
    deferred.prompt()
    try { await deferred.userChoice } catch { /* ignore */ }
    dismiss()
  }

  return (
    <div style={{
      position: 'fixed', left: 12, right: 12, bottom: 'calc(76px + env(safe-area-inset-bottom))',
      zIndex: 60, maxWidth: 520, margin: '0 auto',
      background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 14,
      boxShadow: '0 12px 32px rgba(13,51,64,0.22)', padding: '14px 16px',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Add Travail to your home screen</div>
        <div style={{ fontSize: 12.5, color: 'var(--ink-light)', lineHeight: 1.45, marginTop: 2 }}>
          {isIos
            ? <>Tap the Share icon, then <strong>Add to Home Screen</strong> — it opens full-screen, just like an app.</>
            : <>Install Travail for one-tap, full-screen access.</>}
        </div>
      </div>
      {!isIos && (
        <button className="btn-primary" style={{ height: 38, padding: '0 14px', fontSize: 13, flexShrink: 0 }} onClick={install}>
          Install
        </button>
      )}
      <button
        aria-label="Dismiss"
        onClick={dismiss}
        style={{ background: 'transparent', border: 'none', color: 'var(--ink-light)', fontSize: 20, lineHeight: 1, cursor: 'pointer', flexShrink: 0, padding: '0 2px' }}
      >
        ×
      </button>
    </div>
  )
}
