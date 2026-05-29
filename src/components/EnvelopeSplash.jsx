'use client'
import { useEffect, useRef, useState } from 'react'

// EnvelopeSplash — minimalist invitation animation.
//
// Renders an envelope made entirely of inline SVG (so it scales
// crisply at any size — no raster assets) with a Cormorant Garamond
// label "You're Invited" sitting above the flap. The envelope rises
// in, the label fades in, the flap opens once, and the whole scene
// fades into whatever the parent renders next (typically the signup
// form). No wax seal, no letter card emerging — clean and quiet.
//
// Sequence (~2.6s default):
//   0.0–0.7s   envelope + label fade up
//   0.9–1.7s   flap rotates open (3D)
//   2.0s+      scene fades out; onComplete fires when the fade ends
//
// Props:
//   onComplete            called once the splash has faded out.
//   autoCompleteAfterMs   ms to hold the open state before fading.
//                         Defaults to 700. Pass Infinity to require
//                         an explicit click.
//   autoOpen              opens automatically (default true). False
//                         requires a tap.
//   inviteLabel           the script text. Defaults to "You're Invited".

export default function EnvelopeSplash({
  onComplete,
  autoCompleteAfterMs = 700,
  autoOpen = true,
  inviteLabel = "You're Invited",
}) {
  const [stage, setStage] = useState('intro') // 'intro' | 'opening' | 'open' | 'leaving' | 'done'
  const [reduced, setReduced] = useState(false)
  const completedRef = useRef(false)

  useEffect(() => {
    const m = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReduced(!!m?.matches)
  }, [])

  useEffect(() => {
    if (stage !== 'intro' || !autoOpen) return
    const t = setTimeout(() => setStage('opening'), reduced ? 150 : 900)
    return () => clearTimeout(t)
  }, [stage, autoOpen, reduced])

  useEffect(() => {
    if (stage !== 'opening') return
    const t = setTimeout(() => setStage('open'), reduced ? 100 : 900)
    return () => clearTimeout(t)
  }, [stage, reduced])

  useEffect(() => {
    if (stage !== 'open' || !isFinite(autoCompleteAfterMs)) return
    const t = setTimeout(() => setStage('leaving'), reduced ? 50 : autoCompleteAfterMs)
    return () => clearTimeout(t)
  }, [stage, autoCompleteAfterMs, reduced])

  useEffect(() => {
    if (stage !== 'leaving') return
    const t = setTimeout(finish, reduced ? 50 : 650)
    return () => clearTimeout(t)
  }, [stage, reduced]) // eslint-disable-line react-hooks/exhaustive-deps

  function finish() {
    if (completedRef.current) return
    completedRef.current = true
    setStage('done')
    onComplete?.()
  }

  function handleClick() {
    if (stage === 'intro') { setStage('opening'); return }
    if (stage === 'open') { setStage('leaving'); return }
  }

  return (
    <div
      className={`tv-envelope tv-stage--${stage}${reduced ? ' tv-reduced' : ''}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick() } }}
      aria-label="Invitation envelope"
    >
      <div className="tv-envelope__glow" aria-hidden />

      {/* Cormorant Garamond script label — sits ABOVE the envelope. */}
      <div className="tv-envelope__label" aria-hidden>
        {inviteLabel}
      </div>

      <svg
        className="tv-envelope__svg"
        viewBox="0 0 600 380"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <defs>
          <linearGradient id="paperFront" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fffaf0" />
            <stop offset="100%" stopColor="#f1e6cf" />
          </linearGradient>
          <linearGradient id="paperBack" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fbf3df" />
            <stop offset="100%" stopColor="#e7d6b3" />
          </linearGradient>
          <linearGradient id="paperFlap" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fdf5e0" />
            <stop offset="100%" stopColor="#ecdcb6" />
          </linearGradient>
          <linearGradient id="paperFlapBack" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e9d8b0" />
            <stop offset="100%" stopColor="#f7eed4" />
          </linearGradient>
          <filter id="envShadow" x="-10%" y="-10%" width="120%" height="135%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="6" />
            <feOffset dx="0" dy="8" />
            <feComponentTransfer><feFuncA type="linear" slope="0.28"/></feComponentTransfer>
            <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="innerShadow" x="-2%" y="-2%" width="104%" height="120%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
            <feOffset dx="0" dy="3" />
            <feComponentTransfer><feFuncA type="linear" slope="0.16"/></feComponentTransfer>
            <feComposite in2="SourceAlpha" operator="in" />
            <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        <g className="tv-envelope__body" filter="url(#envShadow)">
          {/* Back panel */}
          <rect x="60" y="60" width="480" height="260" rx="6" fill="url(#paperBack)" />
          <rect x="60" y="60" width="480" height="3" fill="#fff5da" opacity="0.5" />

          {/* Front V panels — the diagonals that read as an envelope. */}
          <path
            d="M 60,60 L 300,212 L 540,60 L 540,320 L 60,320 Z"
            fill="url(#paperFront)"
            filter="url(#innerShadow)"
          />
          <line x1="60"  y1="60"  x2="300" y2="212" stroke="#d8c594" strokeWidth="0.8" opacity="0.55" />
          <line x1="540" y1="60"  x2="300" y2="212" stroke="#d8c594" strokeWidth="0.8" opacity="0.55" />
          <line x1="60"  y1="320" x2="300" y2="212" stroke="#d8c594" strokeWidth="0.6" opacity="0.45" />
          <line x1="540" y1="320" x2="300" y2="212" stroke="#d8c594" strokeWidth="0.6" opacity="0.45" />

          {/* Flap — rotates open along the top edge. No seal. */}
          <g className="tv-envelope__flap" style={{ transformOrigin: '300px 60px' }}>
            <path
              d="M 60,60 L 300,212 L 540,60 Z"
              fill="url(#paperFlapBack)"
              className="tv-envelope__flap-back"
            />
            <path
              d="M 60,60 L 300,212 L 540,60 Z"
              fill="url(#paperFlap)"
              className="tv-envelope__flap-front"
            />
            <line x1="60"  y1="60" x2="300" y2="212" stroke="#fff6dd" strokeWidth="1" opacity="0.55" className="tv-envelope__flap-front" />
            <line x1="540" y1="60" x2="300" y2="212" stroke="#fff6dd" strokeWidth="1" opacity="0.55" className="tv-envelope__flap-front" />
          </g>
        </g>
      </svg>

      <style jsx>{`
        .tv-envelope {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          /* No vertical gap — we want the SVG to overlap the label
             area so the rotating flap layers IN FRONT of the
             "You're Invited" text as it sweeps up. */
          gap: 0;
          width: 100%;
          max-width: 560px;
          margin: 0 auto;
          cursor: pointer;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
          opacity: 1;
          transition: opacity 600ms ease-out;
        }
        /* Whole splash fades out at the leaving stage. Parent does
           its own fade-in on the form so the two crossfade together. */
        .tv-stage--leaving,
        .tv-stage--done {
          opacity: 0;
          pointer-events: none;
        }

        .tv-envelope__svg {
          width: 100%;
          height: auto;
          display: block;
          /* overflow: visible lets the rotating flap render above the
             SVG's top edge — without it, the flap gets clipped at the
             viewBox and the open envelope reads as a flat trapezoid
             that's been cut off from the lettering. */
          overflow: visible;
          perspective: 1400px;
          /* Pull the SVG up so its top edge sits underneath the script
             label. The flap then rotates straight into the label area
             instead of into empty space. */
          margin-top: -22px;
        }

        .tv-envelope__glow {
          position: absolute;
          inset: -8%;
          background:
            radial-gradient(60% 60% at 50% 60%, rgba(244, 167, 44, 0.18), transparent 70%),
            radial-gradient(40% 40% at 50% 50%, rgba(217, 78, 42, 0.08), transparent 70%);
          filter: blur(20px);
          pointer-events: none;
          opacity: 0;
          animation: tv-glow 1200ms 200ms forwards ease-out;
        }
        @keyframes tv-glow { to { opacity: 1; } }

        /* Cormorant Garamond italic script label. Falls back through
           a chain of common serif faces if Cormorant isn't loaded. */
        .tv-envelope__label {
          font-family: 'Cormorant Garamond', 'Cormorant', Garamond, Georgia, 'Times New Roman', serif;
          font-style: italic;
          font-weight: 500;
          font-size: clamp(34px, 6vw, 56px);
          color: #0d3340;
          letter-spacing: -0.005em;
          line-height: 1;
          opacity: 0;
          transform: translateY(10px);
          animation: tv-label-in 900ms 350ms forwards cubic-bezier(0.16, 1, 0.3, 1);
          text-align: center;
        }
        @keyframes tv-label-in {
          to { opacity: 1; transform: translateY(0); }
        }

        .tv-envelope__body {
          opacity: 0;
          transform: translateY(28px) scale(0.94);
          transform-origin: 50% 100%;
          animation: tv-enter 900ms 100ms forwards cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes tv-enter {
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .tv-envelope__flap-back { opacity: 0; }
        .tv-stage--opening .tv-envelope__flap,
        .tv-stage--open    .tv-envelope__flap,
        .tv-stage--leaving .tv-envelope__flap,
        .tv-stage--done    .tv-envelope__flap {
          animation: tv-flap 950ms forwards cubic-bezier(0.5, 0, 0.3, 1);
        }
        .tv-stage--opening .tv-envelope__flap-front,
        .tv-stage--open    .tv-envelope__flap-front,
        .tv-stage--leaving .tv-envelope__flap-front,
        .tv-stage--done    .tv-envelope__flap-front {
          animation: tv-flap-front-fade 900ms 350ms forwards ease-out;
        }
        .tv-stage--opening .tv-envelope__flap-back,
        .tv-stage--open    .tv-envelope__flap-back,
        .tv-stage--leaving .tv-envelope__flap-back,
        .tv-stage--done    .tv-envelope__flap-back {
          animation: tv-flap-back-fade 900ms 350ms forwards ease-in;
        }
        @keyframes tv-flap {
          0%   { transform: rotateX(0deg); }
          100% { transform: rotateX(-178deg); }
        }
        @keyframes tv-flap-front-fade { to { opacity: 0; } }
        @keyframes tv-flap-back-fade  { to { opacity: 1; } }

        /* prefers-reduced-motion — collapse to a quick fade. */
        .tv-reduced .tv-envelope__body,
        .tv-reduced .tv-envelope__label,
        .tv-reduced .tv-envelope__glow {
          animation: none !important;
          opacity: 1;
          transform: none;
        }
        .tv-reduced .tv-envelope__flap-front { opacity: 0 !important; animation: none !important; }
        .tv-reduced .tv-envelope__flap-back  { opacity: 1 !important; animation: none !important; }
        .tv-reduced .tv-envelope__flap       { transform: rotateX(-178deg); animation: none !important; }
      `}</style>
    </div>
  )
}
