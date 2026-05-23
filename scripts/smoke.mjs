#!/usr/bin/env node
// Signs in as the test account and exercises the app's real data flows under
// RLS — so a session can verify behavior without a browser.
//
// Setup: put these in .env.local (gitignored)
//   NEXT_PUBLIC_SUPABASE_URL=...
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
//   TEST_EMAIL=...        (a dedicated test account)
//   TEST_PASSWORD=...
//
// Run:  node scripts/smoke.mjs            (read-only checks)
//       node scripts/smoke.mjs --book     (also creates a real pending booking)

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// ── Load .env.local ───────────────────────────────────────────────────────────
const env = {}
try {
  for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch { /* fall back to process.env */ }
const get = k => process.env[k] ?? env[k]

const URL_ = get('NEXT_PUBLIC_SUPABASE_URL')
const ANON = get('NEXT_PUBLIC_SUPABASE_ANON_KEY')
const EMAIL = get('TEST_EMAIL')
const PASSWORD = get('TEST_PASSWORD')

if (!URL_ || !ANON) { console.error('✖ Missing Supabase URL/anon key in .env.local'); process.exit(1) }
if (!EMAIL || !PASSWORD) { console.error('✖ Missing TEST_EMAIL / TEST_PASSWORD in .env.local'); process.exit(1) }

const ok = s => console.log(`  ✓ ${s}`)
const info = s => console.log(`  · ${s}`)
const fail = s => console.log(`  ✖ ${s}`)

const supabase = createClient(URL_, ANON, { auth: { persistSession: false } })

async function main() {
  console.log('\nTravail smoke test\n──────────────────')

  // 1. Auth
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (authErr || !auth?.user) { fail(`sign-in failed: ${authErr?.message}`); process.exit(1) }
  ok(`signed in as ${EMAIL}`)

  // 2. Member record
  const { data: member, error: mErr } = await supabase.from('members').select('*').eq('user_id', auth.user.id).single()
  if (mErr || !member) { fail(`no member linked to this auth user: ${mErr?.message}`); process.exit(1) }
  ok(`member ${member.name} (${member.id}) · admin=${member.is_admin}`)

  // 3. Catalog visibility
  const { data: flights } = await supabase.from('flights').select('id,name,status,seats_total,seats_anchor').in('status', ['open'])
  const { data: excursions } = await supabase.from('excursions').select('id,name,status').in('status', ['open'])
  info(`open flights: ${flights?.length ?? 0} · open excursions: ${excursions?.length ?? 0}`)

  // 4. My bookings + manifests
  const { data: bookings } = await supabase.from('bookings').select('*').eq('member_id', member.id).order('submitted_at', { ascending: false })
  info(`my bookings: ${bookings?.length ?? 0} (${[...new Set((bookings ?? []).map(b => b.status))].join(', ') || 'none'})`)
  if (bookings?.length) {
    const { data: pax } = await supabase.from('booking_passengers').select('booking_id').in('booking_id', bookings.map(b => b.id))
    info(`passenger rows visible: ${pax?.length ?? 0}`)
    const { data: msgs } = await supabase.from('booking_messages').select('id').in('booking_id', bookings.map(b => b.id))
    info(`thread messages visible: ${msgs?.length ?? 0}`)
  }

  // 5. My guests
  const { data: guests } = await supabase.from('guests').select('id,first_name,last_name').eq('host_member_id', member.id)
  info(`saved guests: ${guests?.length ?? 0}`)

  // 6. Admin reach (if admin)
  if (member.is_admin) {
    const { data: allPending } = await supabase.from('bookings').select('id').eq('status', 'pending')
    info(`[admin] pending bookings across all members: ${allPending?.length ?? 0}`)
  }

  // 7. Optional: create a real pending booking on the first open flight/excursion
  if (process.argv.includes('--book')) {
    const target = flights?.[0]
      ? { kind: 'flight', id: flights[0].id }
      : excursions?.[0] ? { kind: 'excursion', id: excursions[0].id } : null
    if (!target) { fail('no open trip to book'); }
    else {
      const id = 'B-SMOKE-' + Date.now().toString(36).toUpperCase()
      const { error: bErr } = await supabase.from('bookings').insert({
        id, member_id: member.id, item_kind: target.kind, item_id: target.id,
        seats: 1, price_per_seat: 0, fees: 0, total: 0, payment_method: 'card', status: 'pending',
      })
      if (bErr) fail(`booking insert: ${bErr.message}`)
      else ok(`created test booking ${id} (status pending) — visible in the ops queue`)
    }
  }

  console.log('\nDone.\n')
  await supabase.auth.signOut()
}

main().catch(e => { console.error(e); process.exit(1) })
