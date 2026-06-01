import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { safeError } from '@/lib/pii-scrub'
import { sendProposalFundedEmail } from '@/lib/member-email'
import { assertTransactionsAllowed } from '@/lib/maintenance'
import type { Database } from '@/lib/supabase/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveEmail(db: any, memberId: string): Promise<string | null> {
  const { data: c } = await db.from('member_sensitive').select('email').eq('member_id', memberId).maybeSingle()
  if (c?.email && c.email.trim().length > 0) return c.email
  const { data: m } = await db.from('members').select('user_id').eq('id', memberId).maybeSingle()
  if (!m?.user_id) return null
  try {
    const { data: u } = await db.auth.admin.getUserById(m.user_id)
    return u?.user?.email ?? null
  } catch { return null }
}

// Ops locks a Trip Proposal: captures every commit's PaymentIntent,
// creates the real flight/excursion row, links commits → bookings,
// and marks the proposal 'funded'. Members see their boarding pass
// the moment this returns.
//
// Card failures are isolated per-commit: if member A's card fails
// we mark that commit 'capture_failed' but keep going with the
// others. Ops can re-run the lock to retry failed ones, or open the
// seat back to the network.
//
// Body: { proposalId }

export const runtime = 'nodejs'

function admin() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured')
  return createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

function makeId(prefix: string): string {
  return prefix + '-' + Date.now().toString(36).toUpperCase()
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const { data: actor } = await supabase
    .from('members').select('id, is_admin').eq('user_id', user.id).maybeSingle()
  if (!actor?.is_admin) return NextResponse.json({ error: 'Admins only' }, { status: 403 })

  let body: { proposalId?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid payload' }, { status: 400 }) }
  const proposalId = (body.proposalId ?? '').trim()
  if (!proposalId) return NextResponse.json({ error: 'proposalId required' }, { status: 400 })

  const db = admin()

  // Maintenance kill switch — locking captures every committer's card.
  // Freeze it while closed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maint = await assertTransactionsAllowed(db as any)
  if (!maint.ok) return NextResponse.json({ error: maint.message }, { status: 503 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prop } = await (db as any)
    .from('trip_proposals').select('*').eq('id', proposalId).maybeSingle()
  if (!prop) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
  if (prop.status !== 'open') {
    return NextResponse.json({ error: `Proposal is ${prop.status}; only 'open' can be locked.` }, { status: 400 })
  }

  // ─── Atomic lock guard ──────────────────────────────────────────────────
  // Idempotency: this is the only place that can flip lock_started_at
  // from NULL → now() on an open proposal. If two ops clicks (or two
  // tabs) race in here, exactly one update returns a row — the loser
  // bails with 409 and the winner runs the capture loop.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lockedRows } = await (db as any)
    .from('trip_proposals')
    .update({ lock_started_at: new Date().toISOString() })
    .eq('id', proposalId)
    .eq('status', 'open')
    .is('lock_started_at', null)
    .select('id')
  if (!lockedRows || lockedRows.length === 0) {
    return NextResponse.json({
      error: 'This proposal is already being locked (or was just locked by another admin). Refresh to see the latest state.',
    }, { status: 409 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawCommits } = await (db as any)
    .from('trip_proposal_commits')
    .select('*')
    .eq('proposal_id', proposalId)
    .eq('status', 'committed')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const commits = (rawCommits ?? []) as any[]

  // ─── Apply the proposer spread guarantee ──────────────────────────────
  // Network commits = everyone except the proposer.
  // Proposer's charge = clamp(min_seats - network, proposer_min, proposer_max).
  // If proposer_max + network < min_seats, the trip can't make min — bail.
  const proposerMin = prop.proposer_min_seats ?? 1
  const proposerMax = prop.proposer_max_seats ?? proposerMin
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const networkSeats = commits
    .filter((c: any) => c.member_id !== prop.proposer_id)
    .reduce((s: number, c: any) => s + (c.seats ?? 1), 0)
  const minSeats = prop.min_seats ?? 0

  // What the proposer ends up owing seats-for:
  const proposerSeats = Math.max(
    proposerMin,
    Math.min(proposerMax, Math.max(0, minSeats - networkSeats)),
  )
  const totalCovered = networkSeats + proposerSeats
  if (totalCovered < minSeats) {
    return NextResponse.json({
      error: `Cannot make minimum: ${networkSeats} network + up to ${proposerMax} from proposer = ${networkSeats + proposerMax} < ${minSeats} required.`,
    }, { status: 400 })
  }

  // Stamp the proposer's actual seats onto their commit row (which was
  // created at proposer_min by /api/proposals/commit) so the rest of
  // the capture loop has the right number.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proposerCommit = commits.find((c: any) => c.member_id === prop.proposer_id)
  if (proposerCommit && proposerCommit.seats !== proposerSeats) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('trip_proposal_commits')
      .update({ seats: proposerSeats })
      .eq('id', proposerCommit.id)
    proposerCommit.seats = proposerSeats
  }

  const perSeat = prop.price_per_seat_cents ?? 0

  // ─── Create the real trip row ────────────────────────────────────────────
  const newTripId = makeId(prop.kind === 'flight' ? 'F' : 'E')
  const p = (prop.payload ?? {}) as Record<string, unknown>

  let createdTripErr: string | null = null
  try {
    if (prop.kind === 'flight') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (db as any).from('flights').insert({
        id: newTripId,
        name: prop.name,
        date: prop.date,
        origin_code: prop.origin_code,
        dest_code: p.destCode ?? p.dest_code ?? prop.origin_code,
        depart_time: p.departTime ?? null,
        duration_mins: p.durationMins ?? 90,
        aircraft_id: p.aircraftId ?? null,
        pitch: p.pitch ?? null,
        visibility: 'members',
        seats_total: prop.capacity_total,
        seats_anchor: 0,
        price_per_seat: Math.round(perSeat / 100),
        status: 'open',
        anchor_member_id: null,
        image_url: p.imageUrl ?? null,
        is_private: false,
      })
      if (error) throw error
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (db as any).from('excursions').insert({
        id: newTripId,
        name: prop.name,
        date: prop.date,
        origin_code: prop.origin_code,
        stay_type: p.stayType ?? 'day_trip',
        start_time: p.startTime ?? null,
        depart_time: p.departTime ?? null,
        arrive_time: p.arriveTime ?? null,
        return_time: p.returnTime ?? null,
        pitch: p.pitch ?? null,
        visibility: 'members',
        spots_total: prop.capacity_total,
        spots_anchor: 0,
        price_per_pax: Math.round(perSeat / 100),
        status: 'open',
        anchor_member_id: null,
        image_url: p.imageUrl ?? null,
        is_private: false,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        itinerary: (p.itinerary ?? null) as any,
      })
      if (error) throw error
    }
  } catch (e) {
    createdTripErr = e instanceof Error ? e.message : 'Failed to create the trip row'
    safeError('admin/proposals/lock: trip insert failed', e)
    return NextResponse.json({ error: createdTripErr }, { status: 500 })
  }

  // ─── Capture each commit ────────────────────────────────────────────────
  interface CommitResult {
    commitId: string
    memberId: string
    seats: number
    captured: boolean
    error: string | null
    paymentIntentId: string | null
    bookingId: string | null
  }
  const results: CommitResult[] = []

  for (const c of commits) {
    const seats = c.seats ?? 1
    const amount = perSeat * seats
    let captured = false
    let piId: string | null = null
    let err: string | null = null
    let bookingId: string | null = null

    try {
      if (!c.payment_method_id || !c.stripe_customer_id) {
        err = 'No payment method on file'
      } else {
        const pi = await stripe.paymentIntents.create({
          amount,
          currency: 'usd',
          customer: c.stripe_customer_id,
          payment_method: c.payment_method_id,
          off_session: true,
          confirm: true,
          description: `${prop.name} · proposal seat`,
          metadata: {
            kind: 'proposal_capture',
            proposal_id: prop.id,
            commit_id: c.id,
            member_id: c.member_id,
            new_trip_id: newTripId,
            seats: String(seats),
          },
        })
        if (pi.status === 'succeeded') {
          captured = true
          piId = pi.id
        } else {
          err = `PaymentIntent status: ${pi.status}`
        }
      }
    } catch (e) {
      err = e instanceof Error ? e.message : 'Stripe declined'
    }

    if (captured) {
      // Insert the regular booking row tied to the new flight/excursion.
      const bId = `B-${Date.now().toString(36).toUpperCase()}-${c.id.slice(0, 4)}`
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: bErr } = await (db as any).from('bookings').insert({
          id: bId,
          member_id: c.member_id,
          item_kind: prop.kind,
          item_id: newTripId,
          seats,
          price_per_seat: Math.round(perSeat / 100),
          fees: 0,
          total: Math.round(amount / 100),
          payment_method: 'card',
          status: 'confirmed',
          payment_status: 'succeeded',
          paid_amount_cents: amount,
          paid_at: new Date().toISOString(),
          stripe_payment_intent_id: piId,
          confirmation_code: bId,
        })
        if (bErr) throw bErr
        bookingId = bId
      } catch (e) {
        err = `Captured but booking row failed: ${e instanceof Error ? e.message : 'unknown'}`
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from('trip_proposal_commits').update({
        status: 'captured',
        payment_intent_id: piId,
        amount_cents: amount,
        captured_at: new Date().toISOString(),
      }).eq('id', c.id)
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from('trip_proposal_commits').update({
        status: 'capture_failed',
        amount_cents: amount,
      }).eq('id', c.id)
    }

    results.push({
      commitId: c.id,
      memberId: c.member_id,
      seats,
      captured,
      error: err,
      paymentIntentId: piId,
      bookingId,
    })

    // Per-member notification + branded email.
    if (captured) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from('notifications').insert({
        member_id: c.member_id,
        kind: 'booking',
        title: 'Proposal funded, you’re booked',
        body: `"${prop.name}" hit its commit minimum. Your card was charged and your seat is confirmed.`,
        ref: { item_kind: prop.kind, item_id: newTripId, booking_id: bookingId, proposal_id: prop.id },
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: mr } = await (db as any).from('members').select('name').eq('id', c.member_id).maybeSingle()
      const memberEmail = await resolveEmail(db, c.member_id)
      if (memberEmail) {
        await sendProposalFundedEmail({
          to: memberEmail,
          memberName: mr?.name ?? 'Member',
          memberId: c.member_id,
          proposalId: prop.id,
          proposalName: prop.name,
          tripDate: prop.date,
          seats,
          amountCents: amount,
          isProposer: c.member_id === prop.proposer_id,
          newTripId,
        })
      }
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from('notifications').insert({
        member_id: c.member_id,
        kind: 'approval',
        title: 'Card declined on your proposal commit',
        body: `Your card declined when we tried to lock "${prop.name}". Update your card on file and contact the Concierge Team to keep your seat.`,
        ref: { proposal_id: prop.id, error: err },
      })
    }
  }

  // ─── Flip the proposal row ──────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('trip_proposals').update({
    status: 'funded',
    funded_at: new Date().toISOString(),
    ...(prop.kind === 'flight' ? { flight_id: newTripId } : { excursion_id: newTripId }),
  }).eq('id', prop.id)

  return NextResponse.json({
    ok: true,
    new_trip_id: newTripId,
    captured: results.filter(r => r.captured).length,
    failed: results.filter(r => !r.captured).length,
    results,
  })
}
