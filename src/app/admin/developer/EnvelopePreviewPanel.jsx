'use client'
import { useState } from 'react'
import EnvelopeSplash from '@/components/EnvelopeSplash'

// Sandbox for the EnvelopeSplash component on /admin/developer.
//
// Admins can replay the animation from start, tweak the wax-seal
// monogram, toggle auto-open, and adjust how long the open card
// holds before onComplete fires. The component is re-mounted on
// every "Play again" so all internal timers restart cleanly.

export function EnvelopePreviewPanel() {
  const [runId, setRunId] = useState(0)            // bumped to remount
  const [inviteLabel, setInviteLabel] = useState("You're Invited")
  const [autoOpen, setAutoOpen] = useState(true)
  const [holdMs, setHoldMs] = useState(700)
  const [bg, setBg] = useState('cream')            // 'cream' | 'dark'
  const [completed, setCompleted] = useState(false)

  function play() {
    setCompleted(false)
    setRunId(r => r + 1)
  }

  const bgStyles =
    bg === 'dark'
      ? { background: 'linear-gradient(180deg,#072028,#0d3340)' }
      : { background: 'linear-gradient(180deg,#fbf6ec,#f3ead4)' }

  return (
    <div className="panel" style={{ marginBottom: 24 }}>
      <div className="panel-head">
        <h3>Envelope splash · preview</h3>
        <span className="pill sun">DEV TOOL</span>
      </div>
      <div style={{ padding: '16px 20px 20px' }}>
        <p style={{ fontSize: 13, color: 'var(--ink-light)', marginTop: 0, marginBottom: 14 }}>
          Renders the EnvelopeSplash component in a sandbox so you can iterate without sending real invites.
          Hit <strong>Play again</strong> to restart the animation from the intro stage.
        </p>

        {/* Knobs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginBottom: 14 }}>
          <div className="field" style={{ margin: 0 }}>
            <label className="field-lab">Invitation label</label>
            <input
              className="input"
              value={inviteLabel}
              onChange={(e) => setInviteLabel(e.target.value)}
              style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontStyle: 'italic' }}
            />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label className="field-lab">Auto-open?</label>
            <select className="input" value={autoOpen ? '1' : '0'} onChange={(e) => setAutoOpen(e.target.value === '1')}>
              <option value="1">Yes, opens on its own</option>
              <option value="0">No, tap to open</option>
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label className="field-lab">Hold before onComplete (ms)</label>
            <input
              className="input"
              type="number"
              min={0}
              step={50}
              value={holdMs}
              onChange={(e) => setHoldMs(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label className="field-lab">Backdrop</label>
            <select className="input" value={bg} onChange={(e) => setBg(e.target.value)}>
              <option value="cream">Cream (default onboarding)</option>
              <option value="dark">Dark (against splash)</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn-primary" onClick={play}>
            ▶ Play again
          </button>
          <span style={{ fontSize: 11, color: 'var(--ink-faint)', fontFamily: 'var(--mono)', letterSpacing: '0.06em' }}>
            Run #{runId}{completed ? ' · onComplete fired' : ''}
          </span>
        </div>

        {/* Stage */}
        <div
          style={{
            ...bgStyles,
            borderRadius: 16,
            padding: '40px 24px',
            border: '1px solid var(--hair)',
            position: 'relative',
            overflow: 'hidden',
            minHeight: 380,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* The key prop forces a remount on every Play, restarting timers. */}
          <EnvelopeSplash
            key={runId}
            inviteLabel={inviteLabel || "You're Invited"}
            autoOpen={autoOpen}
            autoCompleteAfterMs={holdMs}
            onComplete={() => setCompleted(true)}
          />
        </div>

        <div style={{ marginTop: 12, fontSize: 11.5, color: 'var(--ink-faint)', lineHeight: 1.55 }}>
          Tip: with auto-open disabled, the envelope waits for a click/tap before the seal breaks.
          With it on, the entire choreography runs to completion automatically; onComplete is what the
          onboarding page hooks to transition into the profile form.
        </div>
      </div>
    </div>
  )
}
