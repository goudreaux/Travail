'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// Multi-step tutorial overlay that renders once per member on their
// first sign-in to the member app. Persistence is server-side via
// members.tutorial_completed_at (migration 054), so switching devices
// or reinstalling doesn't re-trigger it. Closing the modal stamps
// the timestamp.
//
// Each step is a card with a headline + body + small icon. We keep
// it conversational and short — Travail is a novel concept and we'd
// rather members read 5 short cards than skip a giant wall of text.

interface TutorialStep {
  eyebrow: string
  title: string
  body: string
  icon: React.ReactNode
}

const STEPS: TutorialStep[] = [
  {
    eyebrow: 'WHAT THIS IS',
    title: 'A members club for private aviation + curated experiences.',
    body: "Open seats on charter flights, member-anchored excursions, and network-proposed trips. $200/month, locked for life as long as your membership stays active. You're already in.",
    icon: <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor"><g transform="rotate(35 12 12)"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></g></svg>,
  },
  {
    eyebrow: 'OPEN SEATS',
    title: 'Take a seat on someone else’s plane.',
    body: 'When a member anchors a charter, the spare seats open up to the network at a flat per-seat price. Tap a card on /seats to reserve. No card games — you pay, you fly.',
    icon: <svg width="36" height="36" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M14.5 7.5L12.5 12.5L7.5 14.5L9.5 9.5z"/></svg>,
  },
  {
    eyebrow: 'GET AWAY',
    title: 'Anchor your own trip — flight or excursion.',
    body: 'Charter a seaplane or set up a day with an operator. You authorize the charter cost, network fills the seats, and you get refunded for every seat that sells. Tap "Get Away" up top.',
    icon: <svg width="36" height="36" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 13l7-1 3-7h2l-1 7 5-1 1 1.5-5 3-1 4-2 .5-1-3.5-3 0-1 .5z"/></svg>,
  },
  {
    eyebrow: 'PROPOSALS',
    title: 'Pitch a trip without paying for the whole boat.',
    body: 'Propose a date. The network commits cards on file. If enough members sign up by the 5-day window, ops locks Tropic and everyone’s deposit clears. If not, nobody pays. No risk — try it.',
    icon: <svg width="36" height="36" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><circle cx="11" cy="11" r="4.5"/><circle cx="11" cy="11" r="1.5" fill="currentColor"/></svg>,
  },
  {
    eyebrow: 'THE NETWORK',
    title: 'Refer the people you’d want next to you on the plane.',
    body: "Travail is a small, deliberate club. Refer friends from your Membership page; ops reviews each one. The network is only as good as who's in it — bring people you'd actually want a row over from.",
    icon: <svg width="36" height="36" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><ellipse cx="11" cy="11" rx="3.2" ry="8"/><line x1="3" y1="11" x2="19" y2="11"/></svg>,
  },
  {
    eyebrow: 'PIN IT TO YOUR PHONE',
    title: 'Add Travail to your home screen.',
    body: 'INSTALL_INSTRUCTIONS_PLACEHOLDER',  // replaced at render with the platform-specific block
    icon: <svg width="36" height="36" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="3" width="12" height="16" rx="2"/><line x1="11" y1="16" x2="11" y2="16"/></svg>,
  },
  {
    eyebrow: 'YOU’RE SET',
    title: 'That’s the whole product. Have fun out there.',
    body: 'Get Away to plan your first trip, Open Seats to ride along, Proposals to rally the network. Tap Done and we’ll close this and let you go.',
    icon: <svg width="36" height="36" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6"/></svg>,
  },
]

// Platform-aware install instructions for the "Pin it to your phone"
// tutorial step. Detects iOS Safari, Android Chrome, and standalone
// (already-installed) so the right snippet renders. Falls back to a
// short generic blurb on desktop.
function InstallInstructions() {
  // Detect once at mount and freeze — we don't want the instructions
  // to flicker mid-tutorial if the user agent string is touched.
  const platform = (() => {
    if (typeof navigator === 'undefined' || typeof window === 'undefined') return 'unknown'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const standaloneIOS = (navigator as any).standalone === true
    const standaloneDisplay = window.matchMedia?.('(display-mode: standalone)').matches
    if (standaloneIOS || standaloneDisplay) return 'installed'
    const ua = navigator.userAgent
    if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
    if (/Android/i.test(ua)) return 'android'
    return 'desktop'
  })()

  // Shared 3-step list rendering for clean copy.
  const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
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

  if (platform === 'installed') {
    return (
      <div style={{ fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
        Looks like you&apos;ve already got Travail installed on your home screen. <strong style={{ color: 'var(--moss)' }}>Nicely done</strong> — tap Next to wrap up.
      </div>
    )
  }

  if (platform === 'ios') {
    return (
      <div>
        <div style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.55, marginBottom: 12 }}>
          Make Travail behave like a real app on iPhone. Three taps in Safari:
        </div>
        <Step n={1}>
          Tap the <strong>Share</strong> button at the bottom of Safari (the square with an up-arrow).
        </Step>
        <Step n={2}>
          Scroll down and pick <strong>Add to Home Screen</strong>.
        </Step>
        <Step n={3}>
          Tap <strong>Add</strong>. Travail lives on your home screen now — opens full-screen, no Safari chrome.
        </Step>
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
        <Step n={1}>
          Tap the <strong>three-dot menu</strong> in the top-right corner of Chrome.
        </Step>
        <Step n={2}>
          Pick <strong>Install app</strong> (or <strong>Add to Home screen</strong> on older Chrome).
        </Step>
        <Step n={3}>
          Confirm <strong>Install</strong>. Travail appears on your home screen and launches full-screen.
        </Step>
      </div>
    )
  }

  // Desktop fallback
  return (
    <div style={{ fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
      You&apos;re on desktop right now. Open Travail on your phone (Safari for iPhone, Chrome for Android) and we&apos;ll show you the home-screen install steps there. It only takes a few seconds and makes the app feel native.
    </div>
  )
}

export function FirstLoginTutorial({ memberId, onDone }: { memberId: string; onDone: () => void }) {
  const supabase = createClient()
  const [step, setStep] = useState(0)
  const [closing, setClosing] = useState(false)
  const total = STEPS.length

  // Lock body scroll while the modal is open.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  async function finish() {
    if (closing) return
    setClosing(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('members') as any)
        .update({ tutorial_completed_at: new Date().toISOString() })
        .eq('id', memberId)
    } catch { /* swallow — not worth blocking the close on a DB hiccup */ }
    onDone()
  }

  const s = STEPS[step]
  const isLast = step === total - 1

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome tutorial"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(4, 33, 40, 0.78)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          background: 'var(--card)', borderRadius: 18,
          maxWidth: 460, width: '100%',
          boxShadow: '0 30px 80px rgba(0,0,0,0.30)',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 6, padding: '14px 18px 0', justifyContent: 'center' }}>
          {STEPS.map((_, i) => (
            <span
              key={i}
              style={{
                width: i === step ? 22 : 6, height: 6, borderRadius: 4,
                background: i <= step ? 'var(--tropic)' : 'var(--hair-2)',
                transition: 'width 0.2s, background 0.2s',
              }}
            />
          ))}
        </div>

        <div style={{ padding: '20px 26px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ color: 'var(--tropic)' }}>{s.icon}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--tropic-d)', fontWeight: 700 }}>
              {s.eyebrow}
            </span>
          </div>
          <div style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontWeight: 500, fontSize: 22, color: 'var(--ink)', lineHeight: 1.15, letterSpacing: '-0.015em', marginBottom: 12 }}>
            {s.title}
          </div>
          <div style={{ fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
            {s.body === 'INSTALL_INSTRUCTIONS_PLACEHOLDER' ? <InstallInstructions /> : s.body}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderTop: '1px solid var(--hair)', background: 'var(--paper)' }}>
          <button
            className="btn-ghost"
            style={{ fontSize: 12 }}
            onClick={finish}
            disabled={closing}
          >
            Skip
          </button>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-light)', letterSpacing: '0.06em' }}>
            {step + 1} of {total}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            {step > 0 && (
              <button
                className="btn-ghost"
                style={{ fontSize: 13 }}
                onClick={() => setStep(s => Math.max(0, s - 1))}
                disabled={closing}
              >
                Back
              </button>
            )}
            <button
              className="btn-primary"
              style={{ fontSize: 13 }}
              onClick={() => isLast ? finish() : setStep(s => Math.min(total - 1, s + 1))}
              disabled={closing}
            >
              {isLast ? (closing ? 'Closing…' : 'Done') : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
