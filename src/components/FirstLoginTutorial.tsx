'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BAKED_DEFAULTS, TUTORIAL_ICONS, loadTutorialSteps, type TutorialStep as DbTutorialStep } from '@/lib/tutorial-steps'

// Multi-step tutorial overlay that renders once per member on their
// first sign-in to the member app. Persistence is server-side via
// members.tutorial_completed_at (migration 054), so switching devices
// or reinstalling doesn't re-trigger it. Closing the modal stamps
// the timestamp.
//
// Each step is a card with a headline + body + small icon. We keep
// it conversational and short — Travail is a novel concept and we'd
// rather members read 5 short cards than skip a giant wall of text.

// Steps are loaded from public.tutorial_steps at mount with a fallback
// to BAKED_DEFAULTS (lib/tutorial-steps.ts). Icons are referenced by
// string key and resolved from TUTORIAL_ICONS — keeps the SVG out of
// the editable surface in /admin/developer.

export function FirstLoginTutorial({
  memberId,
  onDone,
  previewMode = false,
  stepsOverride,
}: {
  memberId: string
  onDone: () => void
  // Skip the DB stamp on close so an admin previewing the tutorial
  // from /admin/developer doesn't accidentally mark their own account
  // tutorial-complete and miss seeing it on their actual first
  // sign-in. The button visuals + flow are identical otherwise.
  previewMode?: boolean
  // The editor panel passes in-progress copy here to preview pending
  // edits without saving. When omitted, the component loads its own
  // copy from public.tutorial_steps (or BAKED_DEFAULTS).
  stepsOverride?: DbTutorialStep[]
}) {
  const supabase = createClient()
  const [step, setStep] = useState(0)
  const [closing, setClosing] = useState(false)
  const [steps, setSteps] = useState<DbTutorialStep[]>(stepsOverride ?? BAKED_DEFAULTS)
  // The home-screen install step is no longer part of the tutorial — it's a
  // separate nudge after the tutorial closes (AddToHomeScreenModal). Filter it
  // out here so it's gone even when the live DB still has the seeded row.
  const visible = steps.filter(s => s.step_key !== 'install' && s.body !== 'INSTALL_INSTRUCTIONS_PLACEHOLDER')
  const total = visible.length

  // Pull live copy from public.tutorial_steps unless the parent gave
  // us an override (preview-while-editing).
  useEffect(() => {
    if (stepsOverride) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSteps(stepsOverride)
      return
    }
    let cancelled = false
    loadTutorialSteps(supabase).then(rows => {
      if (!cancelled) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSteps(rows)
      }
    })
    return () => { cancelled = true }
  }, [stepsOverride]) // eslint-disable-line react-hooks/exhaustive-deps

  // Lock body scroll while the modal is open.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  async function finish() {
    if (closing) return
    setClosing(true)
    if (!previewMode) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('members') as any)
          .update({ tutorial_completed_at: new Date().toISOString() })
          .eq('id', memberId)
      } catch { /* swallow — not worth blocking the close on a DB hiccup */ }
    }
    onDone()
  }

  // Clamp to a valid index if the override or DB swap shrank the list
  // mid-render. Also resolve the icon via TUTORIAL_ICONS so we never
  // crash on an unknown icon_key — falls back to the welcome plane.
  const safeIdx = Math.min(step, total - 1)
  const s = visible[safeIdx] ?? visible[0]
  const icon = TUTORIAL_ICONS[s.icon_key] ?? TUTORIAL_ICONS.plane
  const isLast = safeIdx === total - 1

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
          {visible.map((_, i) => (
            <span
              key={i}
              style={{
                width: i === safeIdx ? 22 : 6, height: 6, borderRadius: 4,
                background: i <= safeIdx ? 'var(--tropic)' : 'var(--hair-2)',
                transition: 'width 0.2s, background 0.2s',
              }}
            />
          ))}
        </div>

        <div style={{ padding: '20px 26px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ color: 'var(--tropic)' }}>{icon}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--tropic-d)', fontWeight: 700 }}>
              {s.eyebrow}
            </span>
          </div>
          <div style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontWeight: 500, fontSize: 22, color: 'var(--ink)', lineHeight: 1.15, letterSpacing: '-0.015em', marginBottom: 12 }}>
            {s.title}
          </div>
          <div style={{ fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
            {s.body}
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
            {safeIdx + 1} of {total}
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
