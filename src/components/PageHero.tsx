'use client'
import React from 'react'
import { useScrollProgress } from '@/lib/useScrollProgress'

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
  children,
}: {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  sub?: React.ReactNode
  actions?: React.ReactNode
  metric?: HeroMetric
  accent?: HeroAccent
  children?: React.ReactNode
}) {
  // Same sticky-compress pattern as the home feed hero.
  useScrollProgress({ maxPx: 200 })
  return (
    <div className={`page-hero page-hero--${accent}`} data-scroll-hero>
      <div className="page-hero__glow page-hero__glow--primary" />
      <div className="page-hero__glow page-hero__glow--secondary" />
      <div className="page-hero__inner">
        <div style={{ flex: 1, minWidth: 0 }}>
          {eyebrow && <div className="mono page-hero__eyebrow">{eyebrow}</div>}
          <h1 className="page-hero__title">{title}</h1>
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
