'use client'
import { useEffect, useRef, useState } from 'react'

// Celebratory overlay after a successful booking. Plays the Tropic
// Caravan splash clip full-screen (same /launch.mp4 used by the app
// boot animation) with a caption underneath, then fades + dismisses.
//
// Skips the video entirely under prefers-reduced-motion; the page
// transitions straight to the success card.

export function BookingSuccessSplash({
  caption = 'Reservation requested',
  sub = 'The Concierge Team will confirm shortly.',
  onDone,
}: {
  caption?: string
  sub?: string
  onDone: () => void
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    // Respect reduced-motion users — skip the clip, hand off immediately.
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      onDone()
      return
    }

    // Belt-and-braces ceiling — if the video stalls or fails, the
    // overlay still dismisses after 3.6s (clip is 3.0s + fade buffer).
    const ceiling = setTimeout(() => setFading(true), 3000)
    const dismiss = setTimeout(onDone, 3600)
    return () => { clearTimeout(ceiling); clearTimeout(dismiss) }
  }, [onDone])

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`${caption}. ${sub}`}
      className={`booking-splash${fading ? ' is-fading' : ''}`}
    >
      <div className="booking-splash__media">
        <video
          ref={videoRef}
          className="booking-splash__video"
          src="/launch.mp4"
          autoPlay
          muted
          playsInline
          preload="auto"
          // Fallback to the static splash if the video errors or is
          // blocked by an aggressive autoplay policy.
          onError={() => setFading(true)}
        />
        <div className="booking-splash__scrim" aria-hidden />
      </div>

      <div className="booking-splash__copy">
        <div className="booking-splash__eyebrow">Travail · Tropic Ocean Air</div>
        <div className="booking-splash__title">{caption}</div>
        <div className="booking-splash__sub">{sub}</div>
      </div>
    </div>
  )
}
