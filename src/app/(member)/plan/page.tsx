'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Icons, KIND_ICONS } from '@/lib/icons'
import PageHero from '@/components/PageHero'

export default function PlanPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setIsAdmin(false); return }
      const { data } = await supabase.from('members').select('is_admin').eq('user_id', user.id).single()
      setIsAdmin(data?.is_admin ?? false)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (isAdmin === null) return null
  if (!isAdmin) return (
    <div className="page">
      <PageHero accent="sun" eyebrow="PLAN A TRIP" title="Coming soon." sub="This feature is under development. Check back soon." />
    </div>
  )

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
