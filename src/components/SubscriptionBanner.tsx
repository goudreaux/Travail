'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Sticky strip at the top of the app that nudges members toward an active
// membership. Two flavors:
//   • past_due / unpaid → "Card declined", links to the billing portal.
//   • no active membership (browse-first, F6) → "Start your membership to
//     book", links to /onboarding/subscribe.
// Members with an active/trialing/incomplete sub (the can-book statuses)
// see nothing. Dismissible per session.

export default function SubscriptionBanner({ status }: { status: string | null | undefined }) {
  const [dismissed, setDismissed] = useState(false)
  const router = useRouter()

  const s = status ?? null
  const canBook = s === 'active' || s === 'trialing' || s === 'incomplete'
  if (canBook || dismissed) return null

  const pastDue = s === 'past_due' || s === 'unpaid'

  async function openPortal() {
    try {
      const res = await fetch('/api/subscribe/portal', { method: 'POST' })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } catch { /* swallow — banner stays up */ }
  }

  const palette = pastDue
    ? 'linear-gradient(90deg, #f4a72c 0%, #f0931d 100%)'
    : 'linear-gradient(90deg, #00b3c7 0%, #0d8aa0 100%)'

  return (
    <div style={{
      background: palette,
      color: pastDue ? '#1a0e02' : '#fff',
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
        {pastDue ? (
          <><strong style={{ fontWeight: 700 }}>Card declined.</strong>{' '}
          Bookings are paused until your membership renews. Update your card to resume.</>
        ) : (
          <><strong style={{ fontWeight: 700 }}>Look around all you like.</strong>{' '}
          Start your membership when you&rsquo;re ready to book a seat.</>
        )}
      </span>
      <button
        onClick={pastDue ? openPortal : () => router.push('/onboarding/subscribe')}
        style={{
          background: pastDue ? '#1a0e02' : '#0d3340',
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
        {pastDue ? 'Update card →' : 'Start membership →'}
      </button>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        style={{ background: 'transparent', border: 'none', color: pastDue ? 'rgba(26,14,2,0.65)' : 'rgba(255,255,255,0.8)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0, flexShrink: 0 }}
      >
        ×
      </button>
    </div>
  )
}
