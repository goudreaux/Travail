import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { safeError } from '@/lib/pii-scrub'
import { MAX_ACTIVE_PROPOSALS_PER_MEMBER } from '@/lib/proposals'
import { canPropose } from '@/lib/trip-timing'
import { notifyOps } from '@/lib/ops-notify'
import { assertCanBook } from '@/lib/can-book'
import { sendProposalSubmittedEmail } from '@/lib/member-email'
import type { Database } from '@/lib/supabase/types'

// Member submits a Trip Proposal AND puts their card on file in one shot.
//
// Why combined: the proposer's commit needs to exist before ops can
// approve the proposal (otherwise the proposer is a phantom committer
// who never pays). Doing it in two round-trips opens a window where
// the proposal is reviewable but unfunded.
//
// Returns { proposalId, clientSecret } — the wizard confirms the
// SetupIntent client-side, then POSTs to
// /api/proposals/commit/finalize to attach the payment_method id to
// the commit row. If the card never confirms, the proposal sits in
// pending_ops_review with a card-less proposer commit; ops can
// decline or follow up.
//
// Validation:
//   - date >= today + PROPOSAL_MIN_LEAD_DAYS (7-day floor)
//   - origin_code references an existing airport
//   - kind in ('flight','excursion')
//
// The flight payload carries destCode/destName; the excursion payload
// carries stay_type + times. Ops fills in capacity, min_seats, and
// price during review.

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

interface Payload {
  kind?: 'flight' | 'excursion'
  name?: string
  date?: string
  originCode?: string
  // Free-form context that ops uses to draft the trip. The whole
  // object goes into trip_proposals.payload jsonb verbatim.
  details?: Record<string, unknown>
  // Member's suggested capacity / min_seats so ops has a starting
  // point. Ops can override during review.
  suggestedCapacity?: number
  suggestedMinSeats?: number
  // Spread guarantee — proposer's firm party + max coverage if the
  // network underfills. See proposer_min_seats / proposer_max_seats
  // in the schema for the math.
  proposerMinSeats?: number
  proposerMaxSeats?: number
}

function dayDiff(date: string): number {
  const target = new Date(date + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { data: me } = await supabase
    .from('members').select('id, name, member_no').eq('user_id', user.id).maybeSingle()
  if (!me) return NextResponse.json({ error: 'Member record not found' }, { status: 403 })

  // Subscription gate — same as the regular booking flow.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const guard = await assertCanBook(admin() as any, me.id)
  if (!guard.ok) {
    return NextResponse.json(
      { error: 'Active membership required to propose a trip', reason: guard.reason, status: guard.status },
      { status: 402 },
    )
  }

  let body: Payload
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid payload' }, { status: 400 }) }

  const kind = body.kind
  const name = (body.name ?? '').trim()
  const date = (body.date ?? '').trim()
  const originCode = (body.originCode ?? '').trim()

  if (kind !== 'flight' && kind !== 'excursion') {
    return NextResponse.json({ error: 'kind must be flight or excursion' }, { status: 400 })
  }
  if (!name) return NextResponse.json({ error: 'Trip name required' }, { status: 400 })
  if (!date) return NextResponse.json({ error: 'Date required' }, { status: 400 })
  if (!originCode) return NextResponse.json({ error: 'Origin airport required' }, { status: 400 })
  const lead = dayDiff(date)
  // Shared timing gate — inside the proposal lead window a trip can't
  // gather a group in time, so it's anchor-only. `suggestAnchor` lets
  // the wizard deep-link the member straight to the anchor flow.
  const propGate = canPropose(date)
  if (!propGate.ok) {
    return NextResponse.json(
      { error: propGate.reason, suggestAnchor: !!propGate.suggestAnchor },
      { status: 400 },
    )
  }

  const db = admin()

  // Cap at MAX_ACTIVE_PROPOSALS_PER_MEMBER active proposals (pending +
  // open) per member so the queue stays manageable.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: activeProps } = await (db as any)
    .from('trip_proposals')
    .select('id')
    .eq('proposer_id', me.id)
    .in('status', ['pending_ops_review', 'open'])
  if ((activeProps?.length ?? 0) >= MAX_ACTIVE_PROPOSALS_PER_MEMBER) {
    return NextResponse.json({
      error: `You can have up to ${MAX_ACTIVE_PROPOSALS_PER_MEMBER} active proposals at a time. Withdraw one of your existing proposals first.`,
    }, { status: 400 })
  }

  // Validate origin airport exists.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ap } = await (db as any).from('airports').select('code').eq('code', originCode).maybeSingle()
  if (!ap) return NextResponse.json({ error: 'Origin airport not recognized' }, { status: 400 })

  // Sanity-cap the suggested numbers in case of UI mischief.
  const suggestedCapacity = Math.min(20, Math.max(1, Number(body.suggestedCapacity ?? 8) || 8))
  const suggestedMinSeats = Math.min(suggestedCapacity, Math.max(1, Number(body.suggestedMinSeats ?? 4) || 4))
  // Spread guarantee — proposer's party (firm) and ceiling (max).
  const proposerMin = Math.min(suggestedCapacity, Math.max(1, Number(body.proposerMinSeats ?? 1) || 1))
  const proposerMax = Math.min(suggestedCapacity, Math.max(proposerMin, Number(body.proposerMaxSeats ?? proposerMin) || proposerMin))

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: inserted, error: insErr } = await (db as any)
      .from('trip_proposals')
      .insert({
        proposer_id: me.id,
        kind,
        name,
        date,
        origin_code: originCode,
        proposer_min_seats: proposerMin,
        proposer_max_seats: proposerMax,
        payload: {
          ...(body.details ?? {}),
          suggested_capacity: suggestedCapacity,
          suggested_min_seats: suggestedMinSeats,
        },
      })
      .select()
      .single()

    if (insErr) throw insErr
    const proposalId: string = inserted.id

    // ─── Mint the proposer's commit + SetupIntent ───────────────────────
    // Find or create the Stripe Customer for this member, then a
    // SetupIntent to collect a card off-session for the eventual
    // lock-time capture. Identical card-on-file flow as
    // /api/proposals/commit (the route members use to commit), just
    // bundled into create so the proposer can never end up phantom.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: mRow } = await (db as any)
      .from('members').select('stripe_customer_id').eq('id', me.id).maybeSingle()
    let customerId: string | null = mRow?.stripe_customer_id ?? null

    if (!customerId) {
      const email = user.email ?? null
      if (email) {
        try {
          const list = await stripe.customers.list({ email, limit: 100 })
          const match = list.data.find(c => !c.deleted && (c as { metadata?: { member_id?: string } }).metadata?.member_id === me.id)
          if (match) customerId = match.id
        } catch (e) { safeError('proposals/create: customer.list failed', e) }
      }
      if (!customerId) {
        const c = await stripe.customers.create({
          email: email ?? undefined,
          name: me.name ?? undefined,
          metadata: { member_id: me.id },
        })
        customerId = c.id
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from('members').update({ stripe_customer_id: customerId }).eq('id', me.id)
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId!,
      payment_method_types: ['card'],
      usage: 'off_session',
      metadata: {
        member_id: me.id,
        proposal_id: proposalId,
        purpose: 'proposer_commit',
        seats: String(proposerMin),
      },
    })

    // Proposer's commit row — seats = their firm party; the lock
    // route bumps this up to whatever the spread math requires.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('trip_proposal_commits').insert({
      proposal_id: proposalId,
      member_id: me.id,
      seats: proposerMin,
      stripe_customer_id: customerId,
      stripe_setup_intent_id: setupIntent.id,
      status: 'committed',
    })

    // Ping ops — they review and set the actual capacity/min/price.
    await notifyOps({
      kind: 'proposal_submission',
      member: {
        name: me.name ?? null,
        memberCode: me.member_no ? `#${me.member_no}` : null,
      },
      item: { kind, id: proposalId, name, date },
      note: `New TRIP PROPOSAL, needs review. Proposer suggested capacity ${suggestedCapacity}, min ${suggestedMinSeats}.`,
      details: {
        Action: 'PROPOSAL submitted',
        Origin: originCode,
        'Lead time': `${lead} days`,
        'Proposer spread': `${proposerMin} firm / up to ${proposerMax} guaranteed`,
      },
    })

    // Branded "thanks, in the queue" email to the proposer.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: contact } = await (db as any)
      .from('member_sensitive').select('email').eq('member_id', me.id).maybeSingle()
    const proposerEmail = (contact?.email && contact.email.trim()) || user.email || null
    if (proposerEmail) {
      await sendProposalSubmittedEmail({
        to: proposerEmail,
        memberName: me.name ?? 'Member',
        memberId: me.id,
        proposalId,
        proposalName: name,
        tripDate: date,
      })
    }

    return NextResponse.json({
      proposalId,
      clientSecret: setupIntent.client_secret,
      setupIntentId: setupIntent.id,
    })
  } catch (err) {
    safeError('proposals/create: insert failed', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to submit proposal' },
      { status: 500 },
    )
  }
}
