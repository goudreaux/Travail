'use client'
export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import PageHero from '@/components/PageHero'
import { Icons, KIND_ICONS } from '@/lib/icons'
import { PROPOSAL_MIN_LEAD_DAYS } from '@/lib/proposals'

// Landing for "Propose a Trip" — the third option on /plan.
//
// Two paths: a flight proposal or an excursion proposal. Picks delegate
// to /propose/flight or /propose/excursion (focused wizards). The
// landing reuses the same visual language as /plan to keep the
// choose-your-flow moment consistent.

export default function ProposePage() {
  const router = useRouter()

  const choices = [
    {
      href: '/propose/flight',
      icon: KIND_ICONS.flight,
      eyebrow: 'Charter together',
      title: 'Propose a Flight',
      sub: 'Pitch a route, gather commits from the network. Nobody pays until enough seats are claimed.',
      accent: 'var(--tropic)',
      glow: 'rgba(0,179,199,0.16)',
    },
    {
      href: '/propose/excursion',
      icon: Icons.compass,
      eyebrow: 'Plan together',
      title: 'Propose an Excursion',
      sub: 'Pitch a day — fishing, golf, anything. If the network commits, it goes live and the deposits clear.',
      accent: 'var(--sun-d)',
      glow: 'rgba(244,167,44,0.16)',
    },
  ]

  return (
    <div className="page">
      <PageHero
        accent="sun"
        eyebrow="PROPOSE A TRIP · NO RISK"
        title="What if you don't want to anchor it yourself?"
        sub={`Propose a trip and rally the network. If the minimum commit is reached at least ${PROPOSAL_MIN_LEAD_DAYS} days before takeoff, it locks in and everyone pays. If not, no one pays — it just expires harmlessly.`}
      />
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

          <div style={{
            marginTop: 24, background: 'rgba(244,167,44,0.08)',
            border: '1px solid rgba(244,167,44,0.25)',
            borderRadius: 12, padding: '14px 16px',
            fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.6,
          }}>
            <strong style={{ color: 'var(--ink)' }}>How it works:</strong>{' '}
            you submit a proposal, ops sets a minimum seat count + per-seat price,
            and the network has 5 days before departure to commit. Members commit
            with a card on file — nothing leaves their account until the proposal
            locks. If commits fall short by the 5-day window, the proposal expires
            and nobody pays.
          </div>
        </div>
      </div>
    </div>
  )
}
