'use client'

// Urgency tag for open-seat cards departing soon. Members move faster
// when they see a seat is about to leave — this stamps a pulsing
// "DEPARTS IN Xh" / "TOMORROW" / "TODAY" pill on any trip within the
// urgency window (default 72h).

const URGENCY_WINDOW_HOURS = 72

// Hours from now until the trip's departure. Uses the date + optional
// depart time ("09:00" or "9:00 AM"); falls back to 8am local when no
// time is given so an all-day-out trip doesn't read as midnight.
export function hoursUntilDeparture(date: string, time?: string | null): number {
  if (!date) return Infinity
  let hh = 8, mm = 0
  if (time) {
    const m = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i)
    if (m) {
      hh = parseInt(m[1], 10)
      mm = parseInt(m[2], 10)
      const ap = m[3]?.toUpperCase()
      if (ap === 'PM' && hh < 12) hh += 12
      if (ap === 'AM' && hh === 12) hh = 0
    }
  }
  const target = new Date(`${date}T00:00:00`)
  target.setHours(hh, mm, 0, 0)
  return (target.getTime() - Date.now()) / 3_600_000
}

export function isWithinUrgencyWindow(date: string, time?: string | null): boolean {
  const h = hoursUntilDeparture(date, time)
  return h > 0 && h <= URGENCY_WINDOW_HOURS
}

export function UrgencyTag({ date, time }: { date: string; time?: string | null }) {
  const h = hoursUntilDeparture(date, time)
  if (!(h > 0 && h <= URGENCY_WINDOW_HOURS)) return null

  const label =
    h <= 24 ? (h <= 6 ? `DEPARTS IN ${Math.max(1, Math.round(h))}H` : 'DEPARTS TODAY')
    : h <= 48 ? 'DEPARTS TOMORROW'
    : `${Math.round(h / 24)} DAYS OUT`

  return (
    <span
      className="urgency-tag"
      aria-label={`Departing soon — ${label.toLowerCase()}`}
    >
      ⚡ {label}
      <style jsx>{`
        .urgency-tag {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-family: var(--mono);
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #fff;
          background: linear-gradient(135deg, #e8512f 0%, #d94e2a 100%);
          padding: 3px 8px;
          border-radius: 5px;
          box-shadow: 0 1px 4px rgba(217, 78, 42, 0.4);
          animation: urgency-pulse 1.6s ease-in-out infinite;
          white-space: nowrap;
        }
        @keyframes urgency-pulse {
          0%, 100% { box-shadow: 0 1px 4px rgba(217, 78, 42, 0.35); }
          50%      { box-shadow: 0 2px 10px rgba(217, 78, 42, 0.6); }
        }
        @media (prefers-reduced-motion: reduce) {
          .urgency-tag { animation: none; }
        }
      `}</style>
    </span>
  )
}
