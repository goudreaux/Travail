'use client'
import { useEffect, useRef, useState } from 'react'

// EnvelopeSplash — self-contained invitation-opening animation.
//
// Replaces the old envelope ceremony on /onboarding. Renders entirely
// from inline SVG + CSS keyframes; no external image assets, no
// dependencies beyond React. Scales crisply at any size (the viewBox
// is the only sizing authority — outer wrapper just sets max width).
//
// Sequence (~3.6s):
//   0.0–0.8s   envelope rises in + settles
//   0.8–1.6s   wax seal cracks — two halves split + drop slightly
//   1.6–2.4s   flap rotates up & back (3D), revealing the envelope mouth
//   2.4–3.4s   invitation card slides up + grows from inside
//   3.4s+      card holds; auto-completes after `autoCompleteAfterMs`
//              (default 600ms) or on click — whichever comes first.
//
// Props:
//   onComplete         called once the card has finished animating in
//                      and the user (or autoCompleteAfterMs) advances.
//   autoCompleteAfterMs  ms to wait after the card is fully in view
//                        before auto-firing onComplete. Defaults to
//                        650 — feels like a deliberate beat. Pass
//                        Infinity to require an explicit click.
//   autoOpen           seal opens automatically (default true). Set
//                      false to require the user to tap the envelope.
//   monogram           single letter inside the wax seal. Defaults
//                      to 'T' (Travail). The seal scales with size.
//
// Reduced motion: respects prefers-reduced-motion. With reduce on,
// the whole splash collapses to a 200ms cross-fade straight to the
// open state so the user isn't held up.

export default function EnvelopeSplash({
  onComplete,
  autoCompleteAfterMs = 650,
  autoOpen = true,
  monogram = 'T',
}) {
  const [stage, setStage] = useState('intro')   // 'intro' | 'opening' | 'open' | 'done'
  const [reduced, setReduced] = useState(false)
  const completedRef = useRef(false)

  useEffect(() => {
    const m = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReduced(!!m?.matches)
  }, [])

  // Stage progression. Each delay matches the corresponding CSS
  // keyframe start time so the script and motion stay in sync.
  useEffect(() => {
    if (stage !== 'intro' || !autoOpen) return
    const t = setTimeout(() => setStage('opening'), reduced ? 200 : 1600)
    return () => clearTimeout(t)
  }, [stage, autoOpen, reduced])

  useEffect(() => {
    if (stage !== 'opening') return
    const t = setTimeout(() => setStage('open'), reduced ? 100 : 1800)
    return () => clearTimeout(t)
  }, [stage, reduced])

  useEffect(() => {
    if (stage !== 'open' || !isFinite(autoCompleteAfterMs)) return
    const t = setTimeout(finish, reduced ? 100 : autoCompleteAfterMs)
    return () => clearTimeout(t)
  }, [stage, autoCompleteAfterMs, reduced]) // eslint-disable-line react-hooks/exhaustive-deps

  function finish() {
    if (completedRef.current) return
    completedRef.current = true
    setStage('done')
    onComplete?.()
  }

  // User can tap to skip ahead or to open early when autoOpen=false.
  function handleClick() {
    if (stage === 'intro') { setStage('opening'); return }
    if (stage === 'open') { finish(); return }
  }

  return (
    <div
      className={`tv-envelope tv-stage--${stage}${reduced ? ' tv-reduced' : ''}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick() } }}
      aria-label="Invitation envelope — click to open"
    >
      {/* Ambient warmth behind the envelope */}
      <div className="tv-envelope__glow" aria-hidden />

      <svg
        className="tv-envelope__svg"
        viewBox="0 0 600 440"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        {/* ── Reusable defs ─────────────────────────────────────────── */}
        <defs>
          {/* Paper grain — soft diagonal gradient that reads as warm
              cream regardless of background luminance. */}
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
          <linearGradient id="cardFace" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#fff9e8" />
          </linearGradient>

          {/* Wax — deep burgundy with a hot highlight catching from
              the top-left. */}
          <radialGradient id="wax" cx="38%" cy="32%" r="78%">
            <stop offset="0%" stopColor="#d54155" />
            <stop offset="35%" stopColor="#a91b2e" />
            <stop offset="100%" stopColor="#56091a" />
          </radialGradient>

          {/* Subtle paper shadow under the envelope. */}
          <filter id="envShadow" x="-10%" y="-10%" width="120%" height="135%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="6" />
            <feOffset dx="0" dy="8" result="off" />
            <feComponentTransfer><feFuncA type="linear" slope="0.30"/></feComponentTransfer>
            <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          {/* Inset paper shadow on the front panel where the flap rests. */}
          <filter id="innerShadow" x="-2%" y="-2%" width="104%" height="120%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
            <feOffset dx="0" dy="3" result="off" />
            <feComponentTransfer><feFuncA type="linear" slope="0.18"/></feComponentTransfer>
            <feComposite in2="SourceAlpha" operator="in" />
            <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          {/* Soft drop shadow for the wax seal. */}
          <filter id="waxShadow" x="-25%" y="-25%" width="150%" height="160%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
            <feOffset dx="0" dy="4" />
            <feComponentTransfer><feFuncA type="linear" slope="0.55"/></feComponentTransfer>
            <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* ── Group A: the envelope body. The whole group rises on
              intro and exits when the card takes the stage. ───────── */}
        <g className="tv-envelope__body" filter="url(#envShadow)">
          {/* Back panel — the rectangle behind everything. */}
          <rect x="60" y="90" width="480" height="260" rx="6" fill="url(#paperBack)" />

          {/* Subtle paper edge highlight on the back panel top. */}
          <rect x="60" y="90" width="480" height="3" fill="#fff5da" opacity="0.5" />

          {/* The invitation card — initially hidden inside, animates
              up + grows during the 'open' stage. Sits BEHIND the front
              V flaps so it appears to emerge from inside. */}
          <g className="tv-envelope__card">
            <rect x="110" y="120" width="380" height="220" rx="6" fill="url(#cardFace)" stroke="#e3d4ad" strokeWidth="1" />
            {/* Top eyebrow rule */}
            <line x1="150" y1="158" x2="220" y2="158" stroke="#c4a050" strokeWidth="1.2" />
            {/* Eyebrow */}
            <text x="150" y="148" fill="#7a5a1f" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize="9.5" letterSpacing="2.8">
              BY PRIVATE INVITATION
            </text>
            {/* Wordmark */}
            <text x="150" y="206" fill="#0d3340" fontFamily="Georgia, 'Cormorant Garamond', 'Times New Roman', serif" fontSize="48" fontStyle="italic" letterSpacing="-0.5">
              Travail
            </text>
            {/* Sub */}
            <text x="150" y="244" fill="#5a6f73" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize="9.5" letterSpacing="2.4">
              MEMBERS CLUB · EST. 2026
            </text>
            {/* Bottom rule */}
            <line x1="150" y1="290" x2="450" y2="290" stroke="#e3d4ad" strokeWidth="1" />
            <text x="150" y="312" fill="#7a5a1f" fontFamily="Georgia, serif" fontStyle="italic" fontSize="11.5">
              You&#39;re invited.
            </text>
          </g>

          {/* Front V-panels — the two diagonals that come up from the
              bottom corners and meet at the seal point. These are the
              "envelope front" geometry visible in the reference. */}
          <path
            className="tv-envelope__panel"
            d="M 60,90 L 300,242 L 540,90 L 540,350 L 60,350 Z"
            fill="url(#paperFront)"
            filter="url(#innerShadow)"
          />
          {/* Subtle crease lines down the diagonals. */}
          <line x1="60" y1="90" x2="300" y2="242" stroke="#d8c594" strokeWidth="0.8" opacity="0.55" />
          <line x1="540" y1="90" x2="300" y2="242" stroke="#d8c594" strokeWidth="0.8" opacity="0.55" />
          <line x1="60" y1="350" x2="300" y2="242" stroke="#d8c594" strokeWidth="0.6" opacity="0.45" />
          <line x1="540" y1="350" x2="300" y2="242" stroke="#d8c594" strokeWidth="0.6" opacity="0.45" />

          {/* ── The flap — folds down over the V seam from the top.
                Has TWO faces (paperFlap front, paperFlapBack inside) so
                when it rotates 180° you see the underside. The rotation
                pivot is the TOP edge of the envelope. ──────────────── */}
          <g className="tv-envelope__flap" style={{ transformOrigin: '300px 90px' }}>
            {/* Underside (visible after rotate). */}
            <path
              d="M 60,90 L 300,242 L 540,90 Z"
              fill="url(#paperFlapBack)"
              className="tv-envelope__flap-back"
            />
            {/* Front face — sealed side, what the viewer sees on entry. */}
            <path
              d="M 60,90 L 300,242 L 540,90 Z"
              fill="url(#paperFlap)"
              className="tv-envelope__flap-front"
            />
            {/* Edge highlight along the diagonals of the flap. */}
            <line x1="60" y1="90" x2="300" y2="242" stroke="#fff6dd" strokeWidth="1" opacity="0.55" className="tv-envelope__flap-front" />
            <line x1="540" y1="90" x2="300" y2="242" stroke="#fff6dd" strokeWidth="1" opacity="0.55" className="tv-envelope__flap-front" />

            {/* ── Wax seal — sits on the tip of the flap. Two halves
                  so it can crack open with a satisfying split. ────── */}
            <g className="tv-envelope__seal" style={{ transformOrigin: '300px 242px' }}>
              {/* Left half */}
              <g className="tv-envelope__seal-left" filter="url(#waxShadow)">
                <path
                  d="M 300,202
                     C 280,202 264,210 254,224
                     C 244,238 244,256 254,270
                     C 264,284 280,290 300,290
                     L 300,202 Z"
                  fill="url(#wax)"
                />
              </g>
              {/* Right half */}
              <g className="tv-envelope__seal-right" filter="url(#waxShadow)">
                <path
                  d="M 300,202
                     C 320,202 336,210 346,224
                     C 356,238 356,256 346,270
                     C 336,284 320,290 300,290
                     L 300,202 Z"
                  fill="url(#wax)"
                />
              </g>
              {/* Embossed inner ring */}
              <circle
                cx="300" cy="246" r="28"
                fill="none"
                stroke="rgba(255,255,255,0.20)"
                strokeWidth="1.2"
                className="tv-envelope__seal-ring"
              />
              {/* Monogram T */}
              <text
                x="300" y="258"
                textAnchor="middle"
                fontFamily="Georgia, 'Cormorant Garamond', 'Times New Roman', serif"
                fontStyle="italic"
                fontSize="32"
                fontWeight="700"
                fill="#3a0710"
                opacity="0.85"
                className="tv-envelope__seal-mono"
              >
                {monogram}
              </text>
              {/* Highlight gloss on the upper-left quadrant. */}
              <ellipse
                cx="288" cy="232" rx="10" ry="7"
                fill="rgba(255,255,255,0.32)"
                className="tv-envelope__seal-gloss"
              />
            </g>
          </g>
        </g>
      </svg>

      {/* Tap hint — only renders during the intro stage when
          autoOpen=false; otherwise the splash drives itself. */}
      {!autoOpen && stage === 'intro' && (
        <div className="tv-envelope__hint">Tap to open</div>
      )}

      {/* ── Styles. Scoped via .tv-envelope* class prefix so they
            can't bleed into the rest of the app. ──────────────────── */}
      <style jsx>{`
        .tv-envelope {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          max-width: 560px;
          margin: 0 auto;
          aspect-ratio: 600 / 440;
          cursor: pointer;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
        }

        .tv-envelope__svg {
          width: 100%;
          height: auto;
          display: block;
          perspective: 1400px;
        }

        .tv-envelope__glow {
          position: absolute;
          inset: -8%;
          background:
            radial-gradient(60% 60% at 50% 55%, rgba(244, 167, 44, 0.22), transparent 70%),
            radial-gradient(40% 40% at 50% 50%, rgba(217, 78, 42, 0.10), transparent 70%);
          filter: blur(20px);
          pointer-events: none;
          opacity: 0;
          animation: tv-glow 1200ms 200ms forwards ease-out;
        }
        @keyframes tv-glow {
          to { opacity: 1; }
        }

        /* Whole envelope rises on intro. */
        .tv-envelope__body {
          opacity: 0;
          transform: translateY(28px) scale(0.94);
          transform-origin: 50% 100%;
          animation: tv-enter 900ms 100ms forwards cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes tv-enter {
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        /* ── Wax seal — both halves split, drop, and fade as the seal
              "breaks." Pivots are mirrored so they fall outward. ──── */
        .tv-envelope__seal {
          transform-box: fill-box;
        }
        .tv-stage--opening .tv-envelope__seal-left,
        .tv-stage--open    .tv-envelope__seal-left,
        .tv-stage--done    .tv-envelope__seal-left {
          animation: tv-seal-left 850ms forwards cubic-bezier(0.38, 0, 0.36, 1);
        }
        .tv-stage--opening .tv-envelope__seal-right,
        .tv-stage--open    .tv-envelope__seal-right,
        .tv-stage--done    .tv-envelope__seal-right {
          animation: tv-seal-right 850ms forwards cubic-bezier(0.38, 0, 0.36, 1);
        }
        .tv-stage--opening .tv-envelope__seal-ring,
        .tv-stage--open    .tv-envelope__seal-ring,
        .tv-stage--done    .tv-envelope__seal-ring,
        .tv-stage--opening .tv-envelope__seal-mono,
        .tv-stage--open    .tv-envelope__seal-mono,
        .tv-stage--done    .tv-envelope__seal-mono,
        .tv-stage--opening .tv-envelope__seal-gloss,
        .tv-stage--open    .tv-envelope__seal-gloss,
        .tv-stage--done    .tv-envelope__seal-gloss {
          animation: tv-seal-fade 500ms 200ms forwards ease-out;
        }
        @keyframes tv-seal-left {
          0%   { transform: translate(0, 0) rotate(0deg); opacity: 1; }
          60%  { transform: translate(-14px, 16px) rotate(-22deg); opacity: 0.95; }
          100% { transform: translate(-32px, 60px) rotate(-46deg); opacity: 0; }
        }
        @keyframes tv-seal-right {
          0%   { transform: translate(0, 0) rotate(0deg); opacity: 1; }
          60%  { transform: translate(14px, 16px) rotate(22deg); opacity: 0.95; }
          100% { transform: translate(32px, 60px) rotate(46deg); opacity: 0; }
        }
        @keyframes tv-seal-fade {
          to { opacity: 0; }
        }

        /* ── Flap rotation. The flap-front (sealed face) is the only
              child visible at start; flap-back fades in past 90° so we
              don't get a black backside flash. Uses CSS 3D — viewport
              perspective lives on .tv-envelope__svg above. ────────── */
        .tv-envelope__flap-back { opacity: 0; }
        .tv-stage--opening .tv-envelope__flap,
        .tv-stage--open    .tv-envelope__flap,
        .tv-stage--done    .tv-envelope__flap {
          animation: tv-flap 950ms 250ms forwards cubic-bezier(0.5, 0, 0.3, 1);
        }
        .tv-stage--opening .tv-envelope__flap-front,
        .tv-stage--open    .tv-envelope__flap-front,
        .tv-stage--done    .tv-envelope__flap-front {
          animation: tv-flap-front-fade 900ms 600ms forwards ease-out;
        }
        .tv-stage--opening .tv-envelope__flap-back,
        .tv-stage--open    .tv-envelope__flap-back,
        .tv-stage--done    .tv-envelope__flap-back {
          animation: tv-flap-back-fade 900ms 600ms forwards ease-in;
        }
        @keyframes tv-flap {
          0%   { transform: rotateX(0deg); }
          100% { transform: rotateX(-178deg); }
        }
        @keyframes tv-flap-front-fade { to { opacity: 0; } }
        @keyframes tv-flap-back-fade  { to { opacity: 1; } }

        /* ── Invitation card — slides up out of the envelope mouth
              and scales in. ───────────────────────────────────────── */
        .tv-envelope__card {
          opacity: 0;
          transform: translate(0, 80px) scale(0.86);
          transform-origin: 300px 230px;
          transform-box: fill-box;
        }
        .tv-stage--open .tv-envelope__card,
        .tv-stage--done .tv-envelope__card {
          animation: tv-card-rise 1100ms forwards cubic-bezier(0.18, 0.7, 0.2, 1);
        }
        @keyframes tv-card-rise {
          0%   { opacity: 0; transform: translate(0, 80px) scale(0.86); }
          18%  { opacity: 1; }
          100% { opacity: 1; transform: translate(0, -56px) scale(1.10); }
        }

        /* Reduced motion — skip the choreography, show the open
            state in a quick crossfade so users aren't held up. */
        .tv-reduced .tv-envelope__body,
        .tv-reduced .tv-envelope__glow {
          animation: none !important;
          opacity: 1;
          transform: none;
        }
        .tv-reduced .tv-envelope__seal-left,
        .tv-reduced .tv-envelope__seal-right,
        .tv-reduced .tv-envelope__seal-ring,
        .tv-reduced .tv-envelope__seal-mono,
        .tv-reduced .tv-envelope__seal-gloss,
        .tv-reduced .tv-envelope__flap-front {
          opacity: 0 !important;
          animation: none !important;
        }
        .tv-reduced .tv-envelope__flap {
          transform: rotateX(-178deg);
          animation: none !important;
        }
        .tv-reduced .tv-envelope__flap-back {
          opacity: 1 !important;
          animation: none !important;
        }
        .tv-reduced .tv-envelope__card {
          opacity: 1;
          transform: translate(0, -56px) scale(1.10);
          animation: none !important;
        }

        .tv-envelope__hint {
          position: absolute;
          bottom: -14px;
          left: 0;
          right: 0;
          text-align: center;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 10px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: rgba(13, 51, 64, 0.55);
          opacity: 0;
          animation: tv-hint 1400ms 1100ms forwards ease-out;
          pointer-events: none;
        }
        @keyframes tv-hint {
          0%   { opacity: 0; transform: translateY(4px); }
          50%  { opacity: 0.85; transform: translateY(0); }
          100% { opacity: 0.55; }
        }
      `}</style>
    </div>
  )
}
