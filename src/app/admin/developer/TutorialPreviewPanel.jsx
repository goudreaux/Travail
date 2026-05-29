'use client'
import { useState } from 'react'
import { FirstLoginTutorial } from '@/components/FirstLoginTutorial'

// Sandbox for FirstLoginTutorial on /admin/developer.
//
// Mounts the actual modal full-screen so the admin can step through
// each slide exactly the way a new member would. Uses previewMode so
// finishing the tutorial does NOT stamp tutorial_completed_at on the
// admin's own member row — otherwise the admin would never see the
// real thing on their first sign-in. "Play again" remounts via a
// runId key so the step counter resets cleanly.

export function TutorialPreviewPanel() {
  const [playing, setPlaying] = useState(false)
  const [runId, setRunId] = useState(0)
  const [lastCompleted, setLastCompleted] = useState(false)

  function play() {
    setLastCompleted(false)
    setRunId(r => r + 1)
    setPlaying(true)
  }

  return (
    <div className="panel" style={{ marginBottom: 24 }}>
      <div className="panel-head">
        <h3>First-login tutorial · preview</h3>
        <span className="pill sun">DEV TOOL</span>
      </div>
      <div style={{ padding: '16px 20px 20px' }}>
        <p style={{ fontSize: 13, color: 'var(--ink-light)', marginTop: 0, marginBottom: 14 }}>
          The 7-step welcome that lands on every member&apos;s first sign-in (and never again).
          Plays full-screen here so you can review the copy + the platform-aware home-screen
          install instructions. <strong style={{ color: 'var(--ink)' }}>Preview mode is on</strong> —
          finishing the tutorial does not stamp your account, so you can replay as many times
          as you want without losing your own first-login moment.
        </p>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn-primary" onClick={play} disabled={playing}>
            ▶ Play tutorial
          </button>
          <span style={{ fontSize: 11, color: 'var(--ink-faint)', fontFamily: 'var(--mono)', letterSpacing: '0.06em' }}>
            Run #{runId}
            {playing ? ' · open' : lastCompleted ? ' · finished' : ''}
          </span>
        </div>

        <div style={{ marginTop: 12, fontSize: 11.5, color: 'var(--ink-faint)', lineHeight: 1.55 }}>
          Tip: open this page on iPhone Safari or Android Chrome to see the platform-specific
          install steps. On desktop the install slide shows the generic note.
        </div>

        {playing && (
          <FirstLoginTutorial
            key={runId}
            memberId="preview"
            previewMode
            onDone={() => { setPlaying(false); setLastCompleted(true) }}
          />
        )}
      </div>
    </div>
  )
}
