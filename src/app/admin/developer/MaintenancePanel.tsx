'use client'
import { useEffect, useState } from 'react'

// "Closed for maintenance" control for the developer dashboard.
//
// Flips the platform-wide kill switch via /api/admin/maintenance. When
// on, every money route (bookings, proposal commits, anchor captures,
// subscriptions) 503s — members keep read-only access to boarding
// passes + activity. A confirm step guards the enable direction since
// it freezes all commerce.

interface State { active: boolean; message: string }

export function MaintenancePanel() {
  const [state, setState] = useState<State | null>(null)
  const [draftMessage, setDraftMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/admin/maintenance')
        if (!res.ok) throw new Error(`Failed to load (${res.status})`)
        const data = (await res.json()) as State
        if (cancelled) return
        setState(data)
        setDraftMessage(data.message)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => { cancelled = true }
  }, [])

  async function setMode(enabled: boolean) {
    // Confirm only on the transition into maintenance (not when saving a
    // message while already closed, or when reopening).
    if (enabled && !active && !window.confirm(
      'Close the platform for maintenance?\n\nThis immediately freezes ALL transactions — bookings, proposal commits, anchor captures, and subscriptions will be blocked. Members keep read-only access to boarding passes and activity.',
    )) return

    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, message: draftMessage.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`)
      setState(data as State)
      setDraftMessage((data as State).message)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update')
    } finally {
      setBusy(false)
    }
  }

  const active = state?.active ?? false

  return (
    <div
      className="panel"
      style={{
        marginBottom: 24,
        padding: '22px 24px',
        border: active ? '1px solid rgba(217,78,42,0.4)' : '1px solid var(--hair)',
        background: active ? 'rgba(217,78,42,0.05)' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 320px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span
              aria-hidden
              style={{
                width: 9, height: 9, borderRadius: '50%',
                background: active ? '#d94e2a' : 'var(--moss, #4a8a5c)',
                boxShadow: active ? '0 0 0 4px rgba(217,78,42,0.18)' : 'none',
              }}
            />
            <h3 style={{ margin: 0 }}>Closed for maintenance</h3>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-mid)', lineHeight: 1.55, maxWidth: 560 }}>
            {active
              ? 'The platform is CLOSED. All transactions are frozen — bookings, proposal commits, anchor captures, and subscriptions are blocked. Members can still view boarding passes and activity.'
              : 'The platform is open and accepting transactions. Turn this on to freeze all bookings and payments while keeping read-only access live.'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span
            className="mono"
            style={{ fontSize: 10, letterSpacing: '0.14em', color: active ? '#b3331c' : 'var(--ink-light)', fontWeight: 700 }}
          >
            {loaded ? (active ? 'CLOSED' : 'OPEN') : '…'}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={active}
            aria-label="Toggle maintenance mode"
            disabled={busy || !loaded}
            onClick={() => setMode(!active)}
            style={{
              position: 'relative',
              width: 52, height: 30, borderRadius: 999,
              border: 'none', cursor: busy || !loaded ? 'wait' : 'pointer',
              background: active ? '#d94e2a' : 'var(--hair)',
              transition: 'background 0.18s', flexShrink: 0,
              opacity: busy || !loaded ? 0.6 : 1,
            }}
          >
            <span
              aria-hidden
              style={{
                position: 'absolute', top: 3, left: active ? 25 : 3,
                width: 24, height: 24, borderRadius: '50%', background: '#fff',
                transition: 'left 0.18s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
              }}
            />
          </button>
        </div>
      </div>

      {/* Member-facing message — editable, saved on the next toggle. */}
      <div style={{ marginTop: 18 }}>
        <label className="mono" style={{ fontSize: 9.5, letterSpacing: '0.14em', color: 'var(--ink-light)', display: 'block', marginBottom: 6 }}>
          MESSAGE SHOWN TO MEMBERS
        </label>
        <textarea
          value={draftMessage}
          onChange={e => setDraftMessage(e.target.value)}
          rows={2}
          maxLength={280}
          placeholder="Leave blank for the default maintenance message."
          style={{
            width: '100%', resize: 'vertical', borderRadius: 10,
            border: '1px solid var(--hair)', padding: '10px 12px',
            fontFamily: 'var(--ui)', fontSize: 13, color: 'var(--ink)', background: 'var(--card)',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy || !loaded}
            onClick={() => setMode(active)}
            style={{ fontSize: 12.5 }}
          >
            Save message
          </button>
          <span style={{ fontSize: 11.5, color: 'var(--ink-light)' }}>
            {draftMessage.trim().length}/280 · saved when you toggle or click save
          </span>
        </div>
      </div>

      {error && (
        <p role="alert" style={{ marginTop: 12, marginBottom: 0, fontSize: 12.5, color: '#b3331c' }}>
          {error}
        </p>
      )}
    </div>
  )
}
