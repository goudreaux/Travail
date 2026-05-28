'use client'
import { useRouter } from 'next/navigation'
import { Icons, KIND_ICONS } from '@/lib/icons'
import PageHero from '@/components/PageHero'

// Open to every member. Booking guard on /api/anchor/setup-intent still
// enforces an active subscription — past_due / cancelled members will
// hit the paywall when they try to submit, not when they browse.

export default function PlanPage() {
  const router = useRouter()

  const choices = [
    {
      href: '/anchor-flight',
      icon: KIND_ICONS.flight,
      eyebrow: 'Private aviation',
      title: 'Anchor a Flight',
      sub: 'Charter a seaplane to a destination and open the spare seats to the network.',
      accent: 'var(--tropic)',
      glow: 'rgba(0,179,199,0.16)',
    },
    {
      href: '/anchor-excursion',
      icon: Icons.compass,
      eyebrow: 'Curated experiences',
      title: 'Anchor an Excursion',
      sub: 'Set up a fishing, golf, or adventure day with an operator and bring the club along.',
      accent: 'var(--sun-d)',
      glow: 'rgba(244,167,44,0.16)',
    },
  ]

  return (
    <div className="page">
      <PageHero accent="sun" eyebrow="PLAN A TRIP" title="What are you planning?" sub="Choose a trip type to get started — we'll walk you through the rest." />
      <div className="page-view">
        <div className="wiz">
          <div className="plan-choices">
            {choices.map(c => (
              <button key={c.href} className="plan-choice" onClick={() => router.push(c.href)}>
                <span className="plan-choice__icon" style={{ color: c.accent, background: c.glow }}>{c.icon}</span>
                <span className="plan-choice__eyebrow" style={{ color: c.accent }}>{c.eyebrow}</span>
                <span className="plan-choice__title">{c.title}</span>
                <span className="plan-choice__sub">{c.sub}</span>
                <span className="plan-choice__cta" style={{ color: c.accent }}>Start →</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
