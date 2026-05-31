import React from 'react'

export type HeroAccent = 'teal' | 'sun' | 'moss' | 'signal'

export interface HeroMetric {
  /** Big italic number / label rendered on the right side of the hero. */
  value: React.ReactNode
  /** Small mono caption underneath (e.g. "LIVE", "ACTIVE · ANCHORED"). */
  label?: React.ReactNode
  /** Subtle line below the label (e.g. "AVG REPLY"). */
  sub?: React.ReactNode
}

export default function PageHero({
  eyebrow,
  title,
  sub,
  actions,
  metric,
  accent = 'teal',
  sansTitle = false,
  onBack,
  children,
}: {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  sub?: React.ReactNode
  actions?: React.ReactNode
  metric?: HeroMetric
  accent?: HeroAccent
  /** Render the title in Inter (sans) instead of the display serif. */
  sansTitle?: boolean
  /** When set, shows a circular back arrow at the top-left of the hero. */
  onBack?: () => void
  children?: React.ReactNode
}) {
  return (
    <div className={`page-hero page-hero--${accent}`}>
      <div className="page-hero__glow page-hero__glow--primary" />
      <div className="page-hero__glow page-hero__glow--secondary" />
      {onBack && (
        <button type="button" className="page-hero__back" aria-label="Back" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
      )}
      <div className="page-hero__inner">
        <div style={{ flex: 1, minWidth: 0 }}>
          {eyebrow && <div className="mono page-hero__eyebrow">{eyebrow}</div>}
          <h1 className={`page-hero__title${sansTitle ? ' page-hero__title--sans' : ''}`}>{title}</h1>
          {sub && <div className="page-hero__sub">{sub}</div>}
          {children}
        </div>
        {metric && (
          <div className="page-hero__metric" aria-hidden>
            <div className="page-hero__metric-value">{metric.value}</div>
            {metric.label && <div className="page-hero__metric-label">{metric.label}</div>}
            {metric.sub && <div className="page-hero__metric-sub">{metric.sub}</div>}
          </div>
        )}
        {actions && <div className="page-hero__actions">{actions}</div>}
      </div>
    </div>
  )
}
