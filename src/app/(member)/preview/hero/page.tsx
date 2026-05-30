'use client'
// PREVIEW ONLY — full-bleed feed hero (mobile).
//
// Hidden route at /preview/hero to mock the hero as a full-width dark-navy wash
// that fades into the cream page background, instead of a floating rounded card.
// Same content + format (live chip, italic greeting, hairline, rotating brief).
// Self-contained: styles scoped under .hero-preview; the live feed is untouched.
import { useState, useEffect } from 'react'

const BRIEF_LINES = [
  '1 active departure with open seats across the network',
  'Founders fly first. Pick a date.',
  'Tomorrow’s brief lands at 6:00 a.m.',
]

export default function HeroPreview() {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const i = setInterval(() => setIdx(x => (x + 1) % BRIEF_LINES.length), 4000)
    return () => clearInterval(i)
  }, [])

  const now = new Date()
  const dateLabel = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()
  const timeLabel = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase()

  return (
    <div className="hero-preview">
      <div className="hp-note">
        Preview · full-bleed hero (mobile). The navy spans the screen and melts into the cream.
        <span style={{ opacity: 0.6 }}> Scratch route — live feed untouched.</span>
      </div>

      {/* Full-bleed hero */}
      <section className="hp-hero">
        <div className="hp-hero__glow" aria-hidden />
        <div className="hp-hero__inner">
          <div className="hp-topline">
            <div className="hp-live">
              <span className="hp-live__dot" aria-hidden />
              <span className="hp-live__text">Live · {timeLabel} · Tampa Bay</span>
            </div>
            <div className="hp-date">{dateLabel}</div>
          </div>

          <h1 className="hp-welcome">
            <span>Good morning,</span> <span>Griffin.</span>
          </h1>

          <div className="hp-rule" aria-hidden />

          <div className="hp-brief" aria-live="polite">
            <span className="hp-brief__label">The brief</span>
            <span key={idx} className="hp-brief__text">{BRIEF_LINES[idx]}</span>
          </div>
        </div>
        {/* Fade strip — navy dissolves into the cream page below. */}
        <div className="hp-hero__fade" aria-hidden />
      </section>

      {/* A couple of dummy cards so you can see the hero melt into the feed. */}
      <div className="hp-body">
        <div className="hp-card">
          <div className="hp-card__eyebrow">On the board</div>
          <div className="hp-card__title">My <em>trips</em></div>
        </div>
        <div className="hp-card">
          <div className="hp-card__eyebrow" style={{ color: 'var(--sun-d)' }}>Live departures</div>
          <div className="hp-card__title">Open <em>seats</em></div>
        </div>
      </div>

      <style>{`
        .hero-preview { min-height: 100vh; background: var(--bg); }
        .hp-note {
          font-family: var(--mono); font-size: 11px; line-height: 1.5; color: var(--ink-light);
          background: rgba(0,179,199,0.06); border: 1px solid rgba(0,179,199,0.18);
          border-radius: 10px; padding: 10px 12px; margin: 12px 14px;
        }

        /* ── Full-bleed hero ───────────────────────────────────────────────
           No card: navy runs edge-to-edge and fades into the cream backdrop. */
        .hp-hero {
          position: relative;
          /* Break out to full viewport width regardless of any padded parent. */
          width: 100vw;
          margin-left: calc(50% - 50vw);
          /* Extra bottom padding gives the fade somewhere to happen. */
          padding-bottom: 64px;
          background:
            radial-gradient(680px 320px at 100% 0%, rgba(244,167,44,0.18), transparent 55%),
            linear-gradient(135deg, #042128 0%, #0a3340 52%, #073744 100%);
        }
        /* The melt: a cream gradient pinned to the bottom that the navy dissolves
           into, so there's no hard seam between hero and page. */
        .hp-hero__fade {
          position: absolute; left: 0; right: 0; bottom: 0; height: 96px;
          background: linear-gradient(to bottom, transparent, var(--bg) 92%);
          pointer-events: none;
        }
        .hp-hero__glow {
          position: absolute; top: -40px; right: -30px; width: 240px; height: 240px;
          border-radius: 50%; pointer-events: none; filter: blur(8px);
          background: radial-gradient(circle, rgba(244,167,44,0.22), transparent 68%);
        }
        .hp-hero__inner {
          position: relative; z-index: 1;
          /* Safe-area aware: top padding clears the status bar / notch. */
          padding: max(54px, env(safe-area-inset-top)) 22px 8px;
        }

        .hp-topline { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
        .hp-live { display: inline-flex; align-items: center; gap: 8px; }
        .hp-live__dot {
          width: 6px; height: 6px; border-radius: 50%; background: var(--tropic);
          box-shadow: 0 0 0 0 rgba(0,179,199,0.55); animation: hp-pulse 2s ease-out infinite;
        }
        @keyframes hp-pulse {
          0% { box-shadow: 0 0 0 0 rgba(0,179,199,0.55); }
          70% { box-shadow: 0 0 0 8px rgba(0,179,199,0); }
          100% { box-shadow: 0 0 0 0 rgba(0,179,199,0); }
        }
        .hp-live__text { font-family: var(--mono); font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255,255,255,0.62); }
        .hp-date { font-family: var(--mono); font-size: 10px; letter-spacing: 0.22em; color: rgba(255,255,255,0.4); }

        .hp-welcome {
          font-family: var(--display); font-style: italic; font-weight: 500; color: #fff;
          margin: 0; line-height: 1.05; letter-spacing: -0.018em; font-size: 32px;
        }
        .hp-rule {
          height: 1px; margin: 16px 0 14px;
          background: linear-gradient(90deg, rgba(0,179,199,0.55), rgba(255,255,255,0.08) 60%, transparent);
        }
        .hp-brief { display: flex; align-items: baseline; gap: 14px; min-height: 22px; }
        .hp-brief__label { font-family: var(--mono); font-size: 9.5px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--tropic); flex-shrink: 0; font-weight: 600; }
        .hp-brief__text { font-size: 14px; color: rgba(255,255,255,0.85); letter-spacing: -0.005em; animation: hp-swap 0.55s ease both; }
        @keyframes hp-swap { 0% { opacity: 0; transform: translateY(6px); } 100% { opacity: 1; transform: translateY(0); } }

        /* Feed body — pulled up under the fade so the melt overlaps the cards. */
        .hp-body { margin-top: -40px; padding: 0 14px 120px; display: flex; flex-direction: column; gap: 10px; position: relative; z-index: 1; }
        .hp-card {
          background: var(--card); border: 1px solid var(--hair); border-radius: 18px;
          padding: 16px 18px; box-shadow: 0 1px 2px rgba(13,51,64,0.04), 0 10px 26px -18px rgba(13,51,64,0.45);
        }
        .hp-card__eyebrow { font-family: var(--mono); font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; font-weight: 600; color: var(--tropic-d); margin-bottom: 5px; }
        .hp-card__title { font-family: var(--display); font-size: 24px; font-weight: 500; color: var(--ink); line-height: 1.05; }
        .hp-card__title em { font-style: italic; }
      `}</style>
    </div>
  )
}
