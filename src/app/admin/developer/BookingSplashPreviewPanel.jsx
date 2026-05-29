'use client'
import { useState } from 'react'
import { BookingSuccessSplash } from '@/components/BookingSuccessSplash'

// Sandbox for BookingSuccessSplash on /admin/developer.
//
// The splash is a full-screen overlay in production — it covers the
// whole viewport when it fires. We replicate that here: clicking Play
// mounts it overlaid on the page; it auto-dismisses when the video
// ends (or 3.5s into reduced-motion users). Hitting onDone clears the
// overlay so admins can replay without reloading.

export function BookingSplashPreviewPanel() {
  const [playing, setPlaying] = useState(false)
  const [runId, setRunId] = useState(0)
  const [caption, setCaption] = useState('Reservation requested')
  const [sub, setSub] = useState('Ops will confirm shortly.')

  function play() {
    setRunId(r => r + 1)
    setPlaying(true)
  }

  return (
    <div className="panel" style={{ marginBottom: 24 }}>
      <div className="panel-head">
        <h3>Booking success splash · preview</h3>
        <span className="pill sun">DEV TOOL</span>
      </div>
      <div style={{ padding: '16px 20px 20px' }}>
        <p style={{ fontSize: 13, color: 'var(--ink-light)', marginTop: 0, marginBottom: 14 }}>
          The Tropic caravan clip that fires after a successful booking. In production it covers the
          whole viewport; here it overlays the entire window so you see exactly what members see.
          Auto-dismisses when the video ends.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10, marginBottom: 14 }}>
          <div className="field" style={{ margin: 0 }}>
            <label className="field-lab">Caption</label>
            <input className="input" value={caption} onChange={(e) => setCaption(e.target.value)} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label className="field-lab">Sub-caption</label>
            <input className="input" value={sub} onChange={(e) => setSub(e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn-primary" onClick={play} disabled={playing}>
            ▶ Play full-screen
          </button>
          <span style={{ fontSize: 11, color: 'var(--ink-faint)', fontFamily: 'var(--mono)', letterSpacing: '0.06em' }}>
            Run #{runId}{playing ? ' · playing…' : ''}
          </span>
        </div>

        <div style={{ marginTop: 12, fontSize: 11.5, color: 'var(--ink-faint)', lineHeight: 1.55 }}>
          Tip: this splash uses <code style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>/launch.mp4</code>.
          If the clip stalls or your browser blocks autoplay, the splash bails out automatically after
          a few seconds so the underlying app doesn&apos;t hang.
        </div>

        {playing && (
          <BookingSuccessSplash
            key={runId}
            caption={caption}
            sub={sub}
            onDone={() => setPlaying(false)}
          />
        )}
      </div>
    </div>
  )
}
