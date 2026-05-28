'use client'
import { useState } from 'react'

// Yellow strip at the top of the app for past_due members. App access
// continues per policy, but new bookings are paused — this banner is
// how members find out before they hit a paywall on /reserve.
//
// Sticky, dismissible per-session (sessionStorage only — comes back on
// next sign-in). Rendered from (member)/layout when subscription_status
// === 'past_due'.

export default function SubscriptionBanner({ status }: { status: string | null | undefined }) {
  const [dismissed, setDismissed] = useState(false)

  if (status !== 'past_due' && status !== 'unpaid') return null
  if (dismissed) return null

  async function openPortal() {
    try {
      const res = await fetch('/api/subscribe/portal', { method: 'POST' })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } catch { /* swallow — banner stays up */ }
  }

  return (
    <div style={{
      background: 'linear-gradient(90deg, #f4a72c 0%, #f0931d 100%)',
      color: '#1a0e02',
      padding: '10px 18px',
      fontSize: 13,
      fontWeight: 500,
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      borderBottom: '1px solid rgba(0,0,0,0.10)',
      position: 'sticky',
      top: 0,
      zIndex: 50,
    }}>
      <span style={{ flex: 1, lineHeight: 1.45 }}>
        <strong style={{ fontWeight: 700 }}>Card declined.</strong>{' '}
        Bookings are paused until your membership renews. Update your card to resume.
      </span>
      <button
        onClick={openPortal}
        style={{
          background: '#1a0e02',
          color: '#fff',
          padding: '6px 14px',
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 600,
          border: 'none',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        Update card →
      </button>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        style={{ background: 'transparent', border: 'none', color: 'rgba(26,14,2,0.65)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0, flexShrink: 0 }}
      >
        ×
      </button>
    </div>
  )
}
