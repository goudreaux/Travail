// Sponsor badges — used to mark excursions that are planned or
// co-presented by a brand partner (Field & Stream first; the same
// pattern handles future partners by adding a case here).
//
// Three size variants share one visual language:
//   • 'ribbon' — corner stamp on a trip-card image
//   • 'pill'   — inline mark below a title (default)
//   • 'mark'   — large standalone wordmark for the reserve page hero
//
// The sponsor field on excursions is free-form text (so collab lines
// like "Travail × Tropic × Field & Stream" render cleanly) — we
// detect known brands inside that string and render their badge.

import React from 'react'

type Size = 'ribbon' | 'pill' | 'mark'

function containsFieldStream(s: string): boolean {
  // Tolerant match: handles "Field & Stream", "Field and Stream",
  // "Field&Stream", case-insensitive, plus the legacy slug.
  const normalized = s.toLowerCase().replace(/\s+/g, '')
  return (
    normalized === 'field_stream'
    || normalized.includes('field&stream')
    || normalized.includes('fieldandstream')
  )
}

export function SponsorBadge({ sponsor, size = 'pill' }: { sponsor: string | null | undefined; size?: Size }) {
  if (!sponsor) return null
  if (containsFieldStream(sponsor)) return <FieldStreamBadge size={size} />
  return null
}

export function FieldStreamBadge({ size = 'pill' }: { size?: Size }) {
  // Reuse one node + drive the visual weight by class so the wordmark
  // looks identical (just bigger / smaller) across surfaces.
  return (
    <span className={`fs-badge fs-badge--${size}`} aria-label="Field & Stream sponsored excursion">
      {size === 'ribbon' && (
        <span className="fs-badge__eyebrow" aria-hidden>Planned by</span>
      )}
      <span className="fs-badge__mark" aria-hidden>
        <i>Field</i>
        <span className="fs-badge__amp">&amp;</span>
        <i>Stream</i>
      </span>
      {size === 'mark' && (
        <span className="fs-badge__tag" aria-hidden>Sponsored excursion</span>
      )}
    </span>
  )
}

export const SPONSORS = [
  { key: 'field_stream', label: 'Field & Stream' },
] as const

export type SponsorKey = typeof SPONSORS[number]['key']

// Preset sponsor lines for the ops trip-form dropdown. These are the
// full collab strings stored on the excursion's `sponsor` field — the
// card detects "Field & Stream" in any of them and renders the badge.
// Picking from a list keeps the badge trigger typo-proof; "Custom…"
// reveals a free-text input for one-off collabs.
export const SPONSOR_LINE_PRESETS: string[] = [
  'Travail × Tropic × Field & Stream',
  'Travail × Field & Stream',
  'Travail × Tropic',
  'Field & Stream',
]
