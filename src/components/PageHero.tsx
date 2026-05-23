import React from 'react'

export default function PageHero({
  eyebrow,
  title,
  sub,
  actions,
  children,
}: {
  eyebrow?: string
  title: React.ReactNode
  sub?: React.ReactNode
  actions?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="page-hero">
      <div className="page-hero__glow page-hero__glow--teal" />
      <div className="page-hero__glow page-hero__glow--sun" />
      <div className="page-hero__inner">
        <div style={{ flex: 1, minWidth: 0 }}>
          {eyebrow && <div className="mono page-hero__eyebrow">{eyebrow}</div>}
          <h1 className="page-hero__title">{title}</h1>
          {sub && <div className="page-hero__sub">{sub}</div>}
          {children}
        </div>
        {actions && <div className="page-hero__actions">{actions}</div>}
      </div>
    </div>
  )
}
