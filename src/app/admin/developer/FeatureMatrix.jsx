'use client'
import { useState } from 'react'

// Investor-ready feature matrix for /admin/developer.
//
// Single collapsible panel grouped by surface — member app, ops back-
// of-house, payments + financial plumbing, growth & social, ops
// instrumentation, infra. Default-collapsed; expand to share, paste,
// or screenshot. Numbers are deliberately conservative; if anything
// the surface is larger than the list suggests.

const SECTIONS = [
  {
    title: 'Member app',
    color: 'tropic',
    items: [
      'Branded onboarding flow with custom SVG envelope animation and first-login tutorial',
      'Founders subscription paywall: $200/month rate locked for life via Stripe Price metadata',
      'Open Seats board: flights, excursions, and live proposals with friend-highlighted rosters',
      'Reserve flow with Stripe Elements card collection + 3% service fee + branded receipt',
      'Plan a Trip / Get Away wizards: Anchor a Flight, Anchor an Excursion, Propose a Trip',
      'Anchor flow with card-on-file (SetupIntent), quote acceptance, and card-capture only on publish',
      'Trip Proposals: Kickstarter-style trips with proposer “spread guarantee” (firm + max coverage)',
      'Boarding pass screen with manifest, cancellation modal, and trip details',
      'High-friction cancel modal: typed FORFEIT + multiple checkboxes, frequency warning at ≥3/90d',
      'Membership page: billing portal redirect, subscription status, plus refer-a-friend submissions',
      'Notifications drawer with intelligent routing (announcements vs. actionable destinations)',
      'Network / friends system with contact requests + roster avatar highlighting',
      'My Trips collapsible feed + rotating cheeky empty-state copy',
      'PWA-ready, fully mobile responsive, with purpose-built layouts for ≤768px and ≤360px',
    ],
  },
  {
    title: 'Concierge back-of-house',
    color: 'sun',
    items: [
      'Review queue: anchor submissions, cancellation requests, waitlist, and proposals in one place',
      'Anchor quote workflow: set price, send quote, member accepts, the Concierge Team publishes, card captures',
      'Trip Proposals review: approve with capacity + min seats + price, decline with reason, lock with one click',
      'Atomic proposal lock with idempotency guard, so no double-charges from double-clicks',
      'Trips & Excursions admin: create, edit, force-settle (test mode), force-cancel with full refunds',
      'Sponsored Excursions: Travail-funded trips (no anchor) with reserved seats for partners',
      'People management: members, guests, referrals tabs with conversion-to-member workflow',
      'Subscriptions roster: past-due surfaces first, early-cohort badge, manage from member detail',
      'Phone-only cancellation: the Concierge Team cancels on member’s behalf with typed CANCEL + reason logging',
      'Email log audit table: every Resend send captured with refs, status, and Resend ID',
      'Activity log: append-only audit of every booking, anchor, member event',
      'Member engagement stats: last login, total time on app, cancellation frequency, bookings/anchors',
      'Force-publish controls + manual settlement override for testing the full pipeline',
    ],
  },
  {
    title: 'Payments & financial plumbing',
    color: 'moss',
    items: [
      'Stripe Subscriptions API with Founders price + lookup key + grandfathering metadata',
      'Stripe Payment Intents for pax bookings: immediate capture with 3% service fee',
      'Stripe Setup Intents for anchor card-on-file + proposal commits, no charge until lock',
      'Off-session capture flow for anchor publish + proposal funding',
      'Smart Retries / Dunning handling: past-due banner + branded card-declined email',
      'Customer Portal integration for card updates (cancel intentionally disabled, phone only)',
      'Full Stripe webhook handler: subscription lifecycle, payment intents, refunds, disputes',
      'Settlement math at trip departure: anchor refunded for sold seats, 3% fee retained',
      'Force-cancel refund path: the only path that refunds the 3% service fee (Travail eats it)',
      'Idempotent capture with per-commit failure isolation, so one decline doesn’t kill the trip',
      'Booking + settlement + cancellation receipts with branded HTML templates via Resend',
      'Hosted invoice URL surfacing for past-due members',
    ],
  },
  {
    title: 'Growth, social, retention',
    color: 'tropic',
    items: [
      'Refer-a-friend system: member submits → the Concierge Team reviews → invite-as-member workflow',
      'Trip Proposals as engagement engine: low-risk pitches that surface social proof in real time',
      'Live ticking countdown on proposal cards (calm → warning → urgent → critical visual tiers)',
      'Friend highlighting on every trip card via shared RosterStack component',
      'Per-member commit progress bars with min-threshold tick mark',
      'Network proposals strip on the main feed below Open Seats',
      'Habitual-cancellation warning surfaces at ≥3 cancels in 90 days',
      'Daily-rotating empty-state copy on My Trips to drive plan-a-trip clicks',
      'Founder badge on member profiles + admin lists',
    ],
  },
  {
    title: 'Concierge instrumentation',
    color: 'sun',
    items: [
      'BCC the Concierge Team on every member email for paper trail (override via OPS_PAPER_TRAIL_BCC)',
      'Structured email_log table: kind, refs, resend_id, send_status, member id',
      'Member activity tracking: login count, session minutes (atomic RPC), last active timestamp',
      'Member sessions table: per-tab session log with IP hash and user agent',
      'Activity log entries on every status transition (booking, anchor, proposal, subscription)',
      'Cancellation counts denormalized + auto-recomputed via trigger on the bookings table',
      'Member stats dashboard: sortable engagement table with aggregate strip (active 7d/30d, lifetime logins, cancel-flagged)',
      'Concierge notification emails for every billable event (charge, refund, dispute, signup, payment failure)',
      'Cron sweeps: daily trip settlement + hourly proposal expiry (5-day Tropic confirmation window)',
    ],
  },
  {
    title: 'Infrastructure & data integrity',
    color: 'moss',
    items: [
      'Next.js 16 App Router on Vercel: file-based routing, RSC where it helps',
      'Supabase Postgres with full row-level security on every table',
      '50+ versioned migrations (idempotent, re-runnable)',
      'Stripe SDK v22 with current Dahlia API version (confirmation_secret pattern)',
      'Resend transactional email with Resend ID capture for delivery confirmation',
      'Atomic counters / increments via SQL RPC (avoid read-modify-write races)',
      'Member delete with guard trigger: blocks on live bookings + active proposals',
      'SET NULL cascade for terminal bookings + proposals on member delete (preserves audit)',
      'Locking sentinel on trip proposals: atomic CAS prevents double-locks across Concierge tabs',
      'Subscription reuse logic: incomplete subs are continued, not stacked, on returning members',
      'Early-cohort price grandfathering via Stripe Price metadata, so public price hikes don’t touch the original cohort',
      'Vercel Cron + custom Bearer-token auth for safe scheduled jobs',
      'Type-safe DB layer (Supabase generated types) + ESLint + TypeScript strict mode',
    ],
  },
]

const ACCENT = {
  tropic: { hue: 'var(--tropic-d)', glow: 'var(--tropic-glow)', bar: 'var(--tropic)' },
  sun:    { hue: 'var(--sun-d)',    glow: 'var(--sun-glow)',    bar: 'var(--sun)' },
  moss:   { hue: 'var(--moss)',     glow: 'rgba(62,140,109,0.10)', bar: 'var(--moss)' },
}

export function FeatureMatrix() {
  const [open, setOpen] = useState(false)
  const totalItems = SECTIONS.reduce((s, sec) => s + sec.items.length, 0)

  return (
    <div className="panel" style={{ marginBottom: 24 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="panel-head"
        style={{
          width: '100%', background: 'transparent', border: 'none', cursor: 'pointer',
          textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}
      >
        <h3 style={{ margin: 0 }}>What we&apos;ve built</h3>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-light)', letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700 }}>
            {SECTIONS.length} surfaces · {totalItems} capabilities
          </span>
          <span
            aria-hidden
            style={{
              fontSize: 16, color: 'var(--ink-light)',
              transition: 'transform 0.18s',
              transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
              display: 'inline-block',
            }}
          >▾</span>
        </span>
      </button>

      {open && (
        <div style={{ padding: '16px 20px 24px' }}>
          <p style={{ fontSize: 13, color: 'var(--ink-light)', lineHeight: 1.6, marginTop: 0, marginBottom: 20 }}>
            Investor-ready snapshot of the product surface. Every line is shipped to production today. Numbers are deliberately conservative.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            {SECTIONS.map((sec) => {
              const accent = ACCENT[sec.color]
              return (
                <div
                  key={sec.title}
                  style={{
                    background: 'var(--paper)',
                    border: '1px solid var(--hair)',
                    borderRadius: 12,
                    padding: '16px 18px',
                    borderLeft: `4px solid ${accent.bar}`,
                  }}
                >
                  <div style={{
                    fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.22em',
                    textTransform: 'uppercase', fontWeight: 700,
                    color: accent.hue, marginBottom: 12,
                  }}>
                    {sec.title}
                  </div>
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {sec.items.map((item, i) => (
                      <li
                        key={i}
                        style={{
                          fontSize: 13, color: 'var(--ink)', lineHeight: 1.5,
                          paddingLeft: 18, position: 'relative',
                        }}
                      >
                        <span
                          aria-hidden
                          style={{
                            position: 'absolute', left: 0, top: 9,
                            width: 6, height: 6, borderRadius: '50%',
                            background: accent.bar,
                          }}
                        />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>

          <div style={{
            marginTop: 22, padding: '14px 16px',
            background: 'var(--paper)',
            border: '1px dashed var(--hair-2)', borderRadius: 12,
            fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.6,
          }}>
            <strong style={{ color: 'var(--ink)', fontWeight: 700 }}>Bottom line.</strong>{' '}
            Single-developer build. Production-grade payments, audit trail, RLS, idempotent cron jobs, and atomic state changes throughout. Sized for the early cohort today; the same architecture scales to thousands of members without re-platforming.
          </div>
        </div>
      )}
    </div>
  )
}
