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
    title: 'The member app',
    color: 'tropic',
    items: [
      'A polished welcome flow with a custom animated invite and a first-time walkthrough',
      'Membership billing — $200/month, with the founding rate locked in for life',
      'Open Seats board: browse flights, excursions, and member-pitched trips, and see which friends are going',
      'Simple booking with a saved card, automatic 3% service fee, and a branded email receipt',
      'Plan-a-trip tools: charter your own flight or excursion, or pitch a trip to the group',
      'Charter a trip with your card saved (not charged) until you approve the final quote',
      'Group trips: pitch a trip and let the network chip in — you choose how many seats you’ll cover',
      'Digital boarding pass with the passenger list and trip details',
      'A deliberately hard cancel screen (type to confirm) to discourage casual cancellations',
      'Account page: manage billing, see your membership status, and refer friends',
      'Notifications that take you straight to whatever needs your attention',
      'Member directory with friend connections and private “share my contact info” requests',
      'Privacy mode: hide from the directory and stay anonymous on trip rosters',
      '“Other Clubs” on your profile (country clubs, social clubs, etc.)',
      'Interactive map of every live trip — tap a pin to preview a trip and book it',
      'A route map on each trip page so members can see exactly where they’re going',
      'Built for phones (installable like a real app), tuned all the way down to small screens',
    ],
  },
  {
    title: 'The Concierge dashboard',
    color: 'sun',
    items: [
      'One review queue for trip requests, cancellations, the waitlist, and proposals',
      'Itemized quotes: price the flight and the experience separately, send it, member approves, then the card is charged',
      'Proposal review: approve with seats + price, decline with a reason, or lock the trip in one click',
      'Safe locking so a double-click can never double-charge anyone',
      'Trips & Excursions admin: create, edit, cancel with full refunds, or force-complete for testing',
      'Sponsored trips: Travail-funded experiences with seats reserved for partners',
      'People management: members, guests, and referrals, with a one-click “make them a member” flow',
      'Subscriptions list that surfaces past-due members first',
      'Phone cancellation: the team can cancel for a member with a typed confirmation and a logged reason',
      'Location Library: one place to manage every origin and destination (name, code, map coordinates)',
      'Route Map dashboard: every live trip drawn on a 3D map',
      'A record of every email the system has sent, plus a running history of every booking and member event',
      'Member engagement stats: last login, time in the app, and booking/cancellation history',
    ],
  },
  {
    title: 'Payments & money',
    color: 'moss',
    items: [
      'Recurring membership billing through Stripe, with the founding price protected',
      'Instant card charges for seat bookings, including the 3% service fee',
      'Cards saved (not charged) for chartered trips and group commitments until they’re confirmed',
      'Automatic charging the moment a trip is confirmed',
      'Past-due handling: a reminder banner and a branded “your card was declined” email',
      'Self-serve card updates through Stripe’s secure portal',
      'Full handling of every Stripe event: memberships, charges, refunds, disputes',
      'Fair settlement when a trip departs — the trip host is refunded for the seats that sold',
      'If Travail cancels a trip, members get a full refund including the service fee',
      'Reliable charging: one declined card never breaks the whole trip',
      'Branded email receipts for bookings, settlements, and cancellations',
    ],
  },
  {
    title: 'Growth & social',
    color: 'tropic',
    items: [
      'Refer-a-friend: a member submits, the team reviews and sends the invite',
      'Group trip proposals that build buzz and show real-time interest',
      'A live countdown on proposals (calm → urgent) to create momentum',
      'Friends highlighted on every trip card',
      'Progress bars showing how close a trip is to happening',
      'Member-pitched trips featured on the home feed',
      'A gentle nudge for members who cancel often',
      'Rotating, friendly empty-state messages that encourage planning',
      'A “founder” badge on early-member profiles',
    ],
  },
  {
    title: 'Tracking & reporting',
    color: 'sun',
    items: [
      'Every member email copied to the team for a paper trail',
      'A searchable record of all sent emails',
      'Login and time-in-app tracking for each member',
      'A logged history of every status change (bookings, trips, memberships)',
      'Automatic tracking of how often each member cancels',
      'An engagement dashboard with active-this-week / this-month and lifetime totals',
      'Team alerts for every money event — charge, refund, dispute, signup, failed payment',
      'Automatic daily jobs: settle completed trips and expire stale proposals',
    ],
  },
  {
    title: 'Under the hood',
    color: 'moss',
    items: [
      'A modern, fast web stack (Next.js on Vercel)',
      'A secure database where members can only ever see their own data',
      '60+ versioned database updates, each safe to re-run',
      'An up-to-date, current-generation Stripe integration',
      'Reliable email delivery with confirmation tracking',
      'Safeguards that keep counts and totals correct even under heavy use',
      'Member deletion is blocked while they still have live trips',
      'History is preserved even after a member leaves',
      'Protection against two staff members locking the same trip at once',
      'Founding-cohort pricing protected from any future price increases',
      'Scheduled background jobs secured with a private key',
      'Automated checks that catch bugs before they reach members',
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
            A plain-English snapshot of what the app does today. Every line below is live in production. If anything, there’s more under the hood than this list shows.
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
            A complete, production-ready product: real payments, full record-keeping, strong data security, and automatic background jobs throughout. Built for the founding cohort today, and ready to scale to thousands of members without rebuilding.
          </div>
        </div>
      )}
    </div>
  )
}
