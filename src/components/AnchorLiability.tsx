'use client'

// Live anchor-liability readout on the trip page. Visible only to the
// trip's anchor.
//
// Math (matches /api/admin/settle-trip exactly):
//   paid_revenue   = pax payments confirmed so far (excludes anchor)
//   current_owed   = charter_total - paid_revenue
//   ifFull_owed    = anchor_seat_cost (charter_total / seats × seats_anchor)
//
// The anchor always pays for their own seats. The ticker shows how
// quickly the bill is shrinking toward that floor as the network books.

import React from 'react'

export function AnchorLiability({
  charterTotalCents,
  paidRevenueCents,
  seatsTotal,
  seatsAnchor,
  seatsTaken,                 // total seats booked across all members (anchor + pax)
}: {
  charterTotalCents: number
  paidRevenueCents: number
  seatsTotal: number
  seatsAnchor: number
  seatsTaken: number
}) {
  const perSeatCents = seatsTotal > 0 ? Math.round(charterTotalCents / seatsTotal) : 0
  const anchorFloorCents = perSeatCents * seatsAnchor
  const currentOwedCents = Math.max(anchorFloorCents, charterTotalCents - paidRevenueCents)
  const refundSoFarCents = Math.max(0, charterTotalCents - currentOwedCents)
  // Non-anchor seats: how many remain to sell.
  const paxSeatsTotal = Math.max(0, seatsTotal - seatsAnchor)
  const paxSeatsSold = Math.max(0, seatsTaken - seatsAnchor)
  const paxSeatsRemaining = Math.max(0, paxSeatsTotal - paxSeatsSold)
  const fillPct = paxSeatsTotal > 0 ? Math.round((paxSeatsSold / paxSeatsTotal) * 100) : 100

  const fmt = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

  return (
    <section className="anchor-liability" role="status" aria-label="Anchor liability">
      <div className="anchor-liability__top">
        <div>
          <div className="anchor-liability__eyebrow">Anchor liability</div>
          <div className="anchor-liability__current">
            <span className="anchor-liability__amount">{fmt(currentOwedCents)}</span>
            <span className="anchor-liability__caption">
              {paxSeatsRemaining === 0
                ? 'final — trip is full'
                : `if no more seats sell · ${paxSeatsRemaining} left`}
            </span>
          </div>
        </div>
        <div className="anchor-liability__floor">
          <div className="anchor-liability__floor-label">If we fill it</div>
          <div className="anchor-liability__floor-amount">{fmt(anchorFloorCents)}</div>
          <div className="anchor-liability__floor-caption">
            your {seatsAnchor} seat{seatsAnchor === 1 ? '' : 's'} only
          </div>
        </div>
      </div>

      <div className="anchor-liability__bar" aria-hidden>
        <div className="anchor-liability__bar-fill" style={{ width: `${fillPct}%` }} />
      </div>

      <div className="anchor-liability__legend">
        <span>
          <span className="anchor-liability__legend-dot" style={{ background: 'var(--moss)' }} />
          {paxSeatsSold}/{paxSeatsTotal} pax seats sold — {fmt(refundSoFarCents)} already coming back to you at settlement
        </span>
        <span className="anchor-liability__legend-perseat">
          {fmt(perSeatCents)} per seat
        </span>
      </div>
    </section>
  )
}
