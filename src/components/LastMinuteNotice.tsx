'use client'

// Inline timing warning for the anchor wizards. Reads the shared
// trip-timing gate off the selected date/time and explains, in plain
// terms, what a last-minute charter means — or why a too-close date
// can't be anchored at all. Renders nothing for comfortably-out trips.

import {
  canAnchor,
  HARD_SOURCING_FLOOR_HOURS,
  PROPOSAL_MIN_LEAD_DAYS,
} from '@/lib/trip-timing'

export function LastMinuteNotice({ date, time }: { date: string; time?: string | null }) {
  if (!date) return null
  const gate = canAnchor(date, time)

  // Too close to source at all (or already past) — a hard stop. The
  // wizard's own validation also blocks Next; this explains why.
  if (!gate.ok) {
    return (
      <Box tone="block">
        <strong style={{ color: '#b3331c' }}>Too close to book.</strong>{' '}
        {gate.reason}
      </Box>
    )
  }

  // Sourceable but inside the {PROPOSAL_MIN_LEAD_DAYS}-day window — let
  // the member proceed, but set expectations clearly.
  if (gate.urgent) {
    return (
      <Box tone="warn">
        <strong style={{ color: '#b3331c' }}>Last-minute charter.</strong>{' '}
        This departs within {PROPOSAL_MIN_LEAD_DAYS} days, so it&apos;s a rush:
        <ul style={{ margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.5 }}>
          <li>The Concierge Team will flag it urgent, but Tropic can&apos;t always confirm aircraft and crew on short notice.</li>
          <li>Short-notice pricing may run higher than a planned trip.</li>
          <li>You&apos;ll need to review and accept the quote quickly to hold the date.</li>
          <li>Anything under {HARD_SOURCING_FLOOR_HOURS} hours out can&apos;t be booked at all.</li>
        </ul>
      </Box>
    )
  }

  return null
}

function Box({ tone, children }: { tone: 'warn' | 'block'; children: React.ReactNode }) {
  const block = tone === 'block'
  return (
    <div
      role="alert"
      style={{
        marginTop: 12,
        background: block ? 'rgba(217,78,42,0.10)' : 'rgba(217,78,42,0.06)',
        border: `1px solid ${block ? 'rgba(217,78,42,0.34)' : 'rgba(217,78,42,0.20)'}`,
        borderRadius: 10,
        padding: '11px 13px',
        fontSize: 12.5,
        color: 'var(--ink-soft)',
        lineHeight: 1.55,
      }}
    >
      {children}
    </div>
  )
}
