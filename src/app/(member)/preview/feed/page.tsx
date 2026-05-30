'use client'
// PREVIEW ONLY — Wallet-style stacked, collapsible feed sections (mobile).
//
// Hidden route at /preview/feed so we can feel the interaction before porting
// it into the real feed (src/app/(member)/page.tsx). Self-contained: all styles
// are scoped under .wallet-preview so nothing here can leak into the live feed.
//
// Behaviour:
//  - Mobile-first. On open the whole dashboard is visible (every section's
//    header), with MY TRIPS expanded and the rest collapsed + tightly stacked.
//  - Accordion: tapping a header expands that one and settles the others.
//  - Subtle, native-feeling motion (spring cubic-bezier; height + lift + chev).
//  - Empty sections stay compact — they never take over the screen.
import { useState } from 'react'

type SectionKey = 'trips' | 'seats' | 'proposals' | 'feed'

interface SectionDef {
  key: SectionKey
  eyebrow: string
  eyebrowClass: string
  title: React.ReactNode
  tint: string
  pill?: React.ReactNode
  body: React.ReactNode
}

function Pill({ children, tone = 'moss' }: { children: React.ReactNode; tone?: 'moss' | 'sun' | 'tropic' | 'muted' }) {
  return <span className={`wp-pill wp-pill--${tone}`}>{children}</span>
}

// Compact empty state — one tight line, never a full-screen block.
function EmptyLine({ children }: { children: React.ReactNode }) {
  return <div className="wp-empty">{children}</div>
}

function SampleSeatRow() {
  return (
    <div className="wp-row">
      <div className="wp-row__media" style={{ background: 'linear-gradient(135deg,#0a3340,#0e5566)' }} />
      <div className="wp-row__body">
        <div className="wp-row__eyebrow">FISHING · FROM TAMPA INTL</div>
        <div className="wp-row__title">Tarpon Fishing on Boca Grande</div>
        <div className="wp-row__meta">JUL 18 · 7/8 spots · $500/seat</div>
      </div>
      <span className="wp-row__cta">Reserve →</span>
    </div>
  )
}
function SampleProposalRow() {
  return (
    <div className="wp-row">
      <div className="wp-row__media" style={{ background: 'linear-gradient(135deg,#7aa7c7,#acd0e6)' }} />
      <div className="wp-row__body">
        <div className="wp-row__eyebrow">EXCURSION · PROPOSAL</div>
        <div className="wp-row__title">Day Trip to Little Palm Island</div>
        <div className="wp-row__meta">JUN 27 · 0 of 4 commits · <span className="wp-row__faint">22d left</span></div>
      </div>
      <span className="wp-row__cta">Commit →</span>
    </div>
  )
}

export default function WalletFeedPreview() {
  // Accordion. My Trips is expanded on first open; the rest sit collapsed.
  const [openKey, setOpenKey] = useState<SectionKey | null>('trips')

  const sections: SectionDef[] = [
    {
      key: 'trips',
      eyebrow: 'On the board', eyebrowClass: 'wp-eyebrow--tropic',
      title: <>My <em>trips</em></>, tint: 'var(--tropic)',
      pill: <Pill tone="moss">● 0 upcoming</Pill>,
      body: <EmptyLine>Nothing on the board yet — reserve a seat or anchor a trip and it lands here.</EmptyLine>,
    },
    {
      key: 'seats',
      eyebrow: 'Live departures', eyebrowClass: 'wp-eyebrow--sun',
      title: <>Open <em>seats</em></>, tint: 'var(--sun)',
      pill: <Pill tone="sun">1 live</Pill>,
      body: <div className="wp-rows"><SampleSeatRow /></div>,
    },
    {
      key: 'proposals',
      eyebrow: 'Network proposals', eyebrowClass: 'wp-eyebrow--sun',
      title: <>Open <em>proposals</em></>, tint: 'var(--sun-d)',
      pill: <Pill tone="sun">1 open</Pill>,
      body: <div className="wp-rows"><SampleProposalRow /></div>,
    },
    {
      key: 'feed',
      eyebrow: 'The wire', eyebrowClass: 'wp-eyebrow--moss',
      title: <>The <em>feed</em></>, tint: 'var(--moss)',
      pill: <Pill tone="muted">Coming soon</Pill>,
      body: <EmptyLine>Member posts and trip recaps land here soon.</EmptyLine>,
    },
  ]

  return (
    <div className="page wallet-preview">
      <div className="wp-note">
        Preview · Wallet-style feed (mobile). Tap a header to expand. <span style={{ opacity: 0.6 }}>Scratch route — the live feed is untouched.</span>
      </div>

      <div className="wp-stack">
        {sections.map((s) => {
          const isOpen = openKey === s.key
          return (
            <section
              key={s.key}
              className={`wp-card${isOpen ? ' is-open' : ''}`}
              style={{ ['--tint' as string]: s.tint }}
            >
              <button
                type="button"
                className="wp-head"
                onClick={() => setOpenKey(k => (k === s.key ? null : s.key))}
                aria-expanded={isOpen}
              >
                <span className="wp-edge" aria-hidden />
                <div className="wp-head__main">
                  <div className={`wp-eyebrow ${s.eyebrowClass}`}>{s.eyebrow}</div>
                  <div className="wp-title">{s.title}</div>
                </div>
                <div className="wp-head__actions">
                  {s.pill}
                  <span className="wp-chev" aria-hidden>›</span>
                </div>
              </button>

              {/* grid-rows 0fr→1fr gives a smooth height reveal. */}
              <div className="wp-body" aria-hidden={!isOpen}>
                <div className="wp-body__inner">{s.body}</div>
              </div>
            </section>
          )
        })}
      </div>

      <style>{`
        .wallet-preview { max-width: 480px; margin: 0 auto; padding: 16px 14px 120px; }
        .wp-note {
          font-family: var(--mono); font-size: 11px; line-height: 1.5; color: var(--ink-light);
          background: rgba(0,179,199,0.06); border: 1px solid rgba(0,179,199,0.18);
          border-radius: 10px; padding: 10px 12px; margin-bottom: 16px;
        }

        /* Tight collapsed stack — cards sit close together (Wallet deck). */
        .wp-stack { display: flex; flex-direction: column; gap: 6px; }

        .wp-card {
          position: relative;
          background: var(--card);
          border: 1px solid var(--hair);
          border-radius: 16px;
          box-shadow: 0 1px 2px rgba(13,51,64,0.04), 0 6px 16px -12px rgba(13,51,64,0.4);
          transition:
            margin 0.40s cubic-bezier(0.22, 1, 0.36, 1),
            box-shadow 0.40s ease,
            border-color 0.30s ease;
          will-change: margin;
        }

        /* The open card lifts free of the deck with a little breathing room. */
        .wp-card.is-open {
          margin: 8px 0;
          box-shadow: 0 2px 6px rgba(13,51,64,0.06), 0 20px 44px -22px rgba(13,51,64,0.5);
          border-color: var(--hair-2);
          z-index: 5;
        }
        .wp-card.is-open:first-child { margin-top: 0; }

        .wp-edge {
          position: absolute; left: 0; top: 13px; bottom: 13px;
          width: 3px; border-radius: 3px; background: var(--tint); opacity: 0.85;
        }

        .wp-head {
          display: flex; align-items: center; justify-content: space-between; gap: 14px;
          width: 100%; text-align: left; background: none; border: none; cursor: pointer;
          padding: 15px 16px 15px 20px; font-family: inherit; -webkit-tap-highlight-color: transparent;
        }
        .wp-head:active { transform: scale(0.995); }

        .wp-eyebrow {
          font-family: var(--mono); font-size: 10px; letter-spacing: 0.16em;
          text-transform: uppercase; font-weight: 600; margin-bottom: 4px;
        }
        .wp-eyebrow--tropic { color: var(--tropic-d); }
        .wp-eyebrow--sun    { color: var(--sun-d); }
        .wp-eyebrow--moss   { color: var(--moss); }

        .wp-title { font-family: var(--display); font-size: 24px; font-weight: 500; color: var(--ink); line-height: 1.05; }
        .wp-title em { font-style: italic; }

        .wp-head__actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }

        .wp-chev {
          display: inline-flex; align-items: center; justify-content: center;
          width: 26px; height: 26px; border-radius: 50%;
          background: var(--paper); color: var(--ink-light); font-size: 20px;
          transition: transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .wp-card.is-open .wp-chev { transform: rotate(90deg); }

        .wp-pill {
          font-family: var(--mono); font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
          text-transform: uppercase; padding: 5px 10px; border-radius: 999px; white-space: nowrap;
        }
        .wp-pill--moss   { color: var(--moss);     background: rgba(62,140,109,0.12); }
        .wp-pill--sun    { color: var(--sun-d);    background: rgba(244,167,44,0.14); }
        .wp-pill--tropic { color: var(--tropic-d); background: rgba(0,179,199,0.12); }
        .wp-pill--muted  { color: var(--ink-light);background: rgba(13,51,64,0.06); }

        .wp-body {
          display: grid; grid-template-rows: 0fr; opacity: 0;
          transition: grid-template-rows 0.40s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.28s ease;
        }
        .wp-card.is-open .wp-body { grid-template-rows: 1fr; opacity: 1; }
        .wp-body__inner { overflow: hidden; min-height: 0; }
        .wp-body__inner > * {
          transform: translateY(6px);
          transition: transform 0.40s cubic-bezier(0.22, 1, 0.36, 1);
          padding: 0 16px 16px;
        }
        .wp-card.is-open .wp-body__inner > * { transform: translateY(0); }

        .wp-rows { display: flex; flex-direction: column; gap: 10px; }
        .wp-row {
          display: flex; align-items: center; gap: 12px;
          border: 1px solid var(--hair); border-radius: 14px; padding: 10px; background: var(--card);
        }
        .wp-row__media { width: 54px; height: 54px; border-radius: 10px; flex-shrink: 0; }
        .wp-row__body { flex: 1; min-width: 0; }
        .wp-row__eyebrow { font-family: var(--mono); font-size: 9px; letter-spacing: 0.12em; color: var(--sun-d); font-weight: 600; margin-bottom: 3px; }
        .wp-row__title { font-family: var(--display); font-size: 16px; color: var(--ink); line-height: 1.15; }
        .wp-row__meta { font-size: 11.5px; color: var(--ink-light); margin-top: 3px; }
        .wp-row__faint { color: var(--ink-faint); }
        .wp-row__cta { font-family: var(--ui); font-size: 12px; font-weight: 600; color: var(--tropic-d); white-space: nowrap; }

        /* Compact empty state — single tight line, never full-screen. */
        .wp-empty { font-size: 12.5px; color: var(--ink-light); line-height: 1.5; padding-top: 2px; }

        @media (prefers-reduced-motion: reduce) {
          .wp-card, .wp-chev, .wp-body, .wp-body__inner > * { transition: none; }
        }
      `}</style>
    </div>
  )
}
