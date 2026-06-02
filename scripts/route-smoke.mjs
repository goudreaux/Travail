#!/usr/bin/env node
// Route smoke test — hits every static route and flags broken pages, server
// errors, and blank renders. No browser and no login required, so it runs
// anywhere (locally or in CI) pointed at a deployed URL.
//
// Auth-gated routes are expected to redirect to /login when unauthenticated —
// that counts as healthy (the route exists and didn't crash). What this catches
// is the bad stuff: 404s on routes that should exist, 500s, Next.js error
// pages, and empty/blank documents.
//
// Run:
//   SMOKE_BASE_URL=https://your-preview.vercel.app node scripts/route-smoke.mjs
//   node scripts/route-smoke.mjs https://your-preview.vercel.app
//
// Pairs with scripts/smoke.mjs (the data-layer / RLS smoke test).

const BASE = (process.argv[2] || process.env.SMOKE_BASE_URL || '').replace(/\/$/, '')
if (!BASE) {
  console.error('✖ Provide a base URL: SMOKE_BASE_URL=https://… node scripts/route-smoke.mjs')
  process.exit(1)
}

// Static routes only (dynamic [id] routes need real data — covered separately).
const ROUTES = [
  // Public / auth
  '/login', '/join', '/onboarding/subscribe',
  // Member app (auth-gated — should render or redirect to /login)
  '/', '/seats', '/proposals', '/propose', '/propose/flight', '/propose/excursion',
  '/plan', '/anchor-flight', '/anchor-excursion', '/bookings', '/calendar',
  '/network', '/notifications', '/membership', '/contact', '/inbox',
  // Concierge dashboard
  '/admin', '/admin/queue', '/admin/proposals', '/admin/trips', '/admin/map',
  '/admin/library', '/admin/bookings', '/admin/members', '/admin/subscriptions',
  '/admin/activity', '/admin/email-log', '/admin/posts', '/admin/developer',
  '/admin/anchors', '/admin/guests', '/admin/history', '/admin/inbox',
]

// Markers that mean the page actually broke (not just a normal redirect).
const ERROR_MARKERS = [
  'Application error: a client-side exception',
  'Internal Server Error',
  'This page could not be found', // a 404 body on a route we expect to exist
  'Unhandled Runtime Error',
]

const results = []

for (const route of ROUTES) {
  const url = BASE + route
  let status = 0, finalUrl = url, body = '', err = null
  try {
    const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'travail-smoke/1.0' } })
    status = res.status
    finalUrl = res.url
    body = await res.text()
  } catch (e) {
    err = e.message
  }

  const redirectedToLogin = /\/login(\?|$)/.test(finalUrl)
  const tooSmall = body.length < 400
  const hasErrorMarker = ERROR_MARKERS.some(m => body.includes(m))
  // A 404 is only a failure if we didn't get harmlessly bounced to /login.
  const badStatus = status >= 400 && !(status === 404 && redirectedToLogin)
  const failed = !!err || badStatus || hasErrorMarker || (tooSmall && !redirectedToLogin)

  results.push({ route, status, finalUrl, failed, err, redirectedToLogin, hasErrorMarker, tooSmall })
}

console.log(`\nTravail route smoke · ${BASE}\n${'─'.repeat(48)}`)
let failures = 0
for (const r of results) {
  if (r.failed) {
    failures++
    const why = r.err ? `error: ${r.err}`
      : r.hasErrorMarker ? 'error page rendered'
      : r.status >= 400 ? `HTTP ${r.status}`
      : r.tooSmall ? 'blank/near-empty page'
      : 'failed'
    console.log(`  ✖ ${r.route.padEnd(26)} ${why}`)
  } else {
    const note = r.redirectedToLogin && r.route !== '/login' ? '→ login (protected)' : `HTTP ${r.status}`
    console.log(`  ✓ ${r.route.padEnd(26)} ${note}`)
  }
}
console.log(`${'─'.repeat(48)}\n${results.length - failures}/${results.length} healthy${failures ? ` · ${failures} need attention` : ''}\n`)
process.exit(failures ? 1 : 0)
