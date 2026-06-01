import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { safeError } from '@/lib/pii-scrub'
import { notifyOps } from '@/lib/ops-notify'
import { canAnchor } from '@/lib/trip-timing'
import { assertTransactionsAllowed } from '@/lib/maintenance'
import type { Database } from '@/lib/supabase/types'

// Ops-publish endpoint for an anchored trip.
//
// Flow:
//   1. Admin-only auth check.
//   2. Load the anchor_submissions row (must be 'pending').
//   3. Compute charter_total_cents = price_per_seat × seats_total × 100.
//   4. Read the anchor's Stripe customer + default payment method.
//      Refuse if missing — anchor should have set this up via the
//      wizard's <AnchorCardSetup /> before submitting.
//   5. Capture (PaymentIntent off_session, confirm=true) for the full
//      charter total. If the card declines, abort and return a useful
//      message Ops can act on (call the anchor / try a different card).
//   6. On capture success, create the flights/excursions row with all
//      anchor-state columns populated (anchor_payment_intent_id,
//      anchor_captured_cents, anchor_captured_at, cancellation_policy).
//   7. Mark the submission published, stamp published_item_id.
//   8. Notify the anchor + log to activity_log.
//
// Request:
//   POST /api/admin/publish-anchor
//   { anchor_submission_id, price_per_seat, image_url? }
//
// On card decline we return 402 with a clear message but DON'T create
// the trip row — the submission stays 'pending' so Ops can retry.

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

// Resolve "which Stripe customer owns this member?". Same pattern as
// /api/anchor/setup-intent: DB cache first, then Stripe list({email})
// matched on metadata.member_id. Necessary here because publish-anchor
// runs after the anchor has already added their card — if the DB cache
// write failed silently, we'd 412 even though the customer exists in
// Stripe and is fully chargeable.
async function resolveStripeCustomer(memberId: string, email: string | null): Promise<string | null> {
  const db = admin()
  const { data: m } = await db
    .from('members').select('stripe_customer_id').eq('id', memberId).maybeSingle()
  if (m?.stripe_customer_id) return m.stripe_customer_id

  if (!email) return null
  try {
    const list = await stripe.customers.list({ email, limit: 100 })
    const match = list.data.find(c => !c.deleted && c.metadata?.member_id === memberId)
    return match?.id ?? null
  } catch (e) {
    safeError('publish-anchor.resolveStripeCustomer: list failed:', e)
    return null
  }
}

// Anchor's email lives on auth.users (the login identity); we mirror it
// into member_sensitive via the sync trigger (migration 037). Read from
// member_sensitive first (cheap, RLS-friendly via the service role),
// then fall back to auth.users by user_id.
async function resolveAnchorEmail(memberId: string): Promise<string | null> {
  const db = admin()
  const { data: contact } = await db
    .from('member_sensitive').select('email').eq('member_id', memberId).maybeSingle()
  if (contact?.email && contact.email.trim().length > 0) return contact.email.trim()

  const { data: m } = await db
    .from('members').select('user_id').eq('id', memberId).maybeSingle()
  if (!m?.user_id) return null
  try {
    const { data: u } = await db.auth.admin.getUserById(m.user_id)
    return u?.user?.email ?? null
  } catch (e) {
    safeError('publish-anchor.resolveAnchorEmail: auth lookup failed:', e)
    return null
  }
}

interface PublishPayload {
  anchor_submission_id?: string
  price_per_seat?: number     // dollars (whole units)
  image_url?: string | null
}

export async function POST(req: NextRequest) {
  // Admin gate.
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const { data: meRow } = await supabase
    .from('members').select('id, is_admin').eq('user_id', user.id).maybeSingle()
  if (!meRow?.is_admin) return NextResponse.json({ error: 'Admins only' }, { status: 403 })

  let payload: PublishPayload
  try { payload = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid payload' }, { status: 400 }) }

  const submissionId = (payload.anchor_submission_id ?? '').trim()
  // flights.price_per_seat + excursions.price_per_pax are integer
  // columns (whole dollars). Old callers sometimes hand us a fractional
  // value derived from `quoted_total_cents / seats`; round here so a
  // forgotten round at the call site can't blow up the trip insert
  // mid-transaction and roll back a real Stripe capture.
  const pricePerSeat = Math.round(Number(payload.price_per_seat))
  if (!submissionId) return NextResponse.json({ error: 'anchor_submission_id required' }, { status: 400 })
  if (!Number.isFinite(pricePerSeat) || pricePerSeat <= 0) {
    return NextResponse.json({ error: 'price_per_seat must be a positive number (dollars)' }, { status: 400 })
  }

  const db = admin()

  // Maintenance kill switch — publishing captures the anchor's card, so
  // it's a charge. Freeze it even for admins while closed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maint = await assertTransactionsAllowed(db as any)
  if (!maint.ok) return NextResponse.json({ error: maint.message }, { status: 503 })

  // Load the submission.
  const { data: sub, error: sErr } = await db
    .from('anchor_submissions').select('*').eq('id', submissionId).maybeSingle()
  if (sErr || !sub) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  // Publish now requires the anchor to have accepted Ops's quote. The
  // 'pending' branch stays accepted only for legacy submissions
  // grandfathered in before the quote flow shipped.
  const subStatus = sub.status as string
  if (subStatus !== 'quote_accepted' && subStatus !== 'pending') {
    return NextResponse.json({
      error: subStatus === 'quoted'
        ? 'Anchor hasn\'t accepted the quote yet. Wait for them to accept before publishing.'
        : `Submission is ${subStatus}, not ready to publish`,
    }, { status: 409 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = (sub.payload ?? {}) as any

  // ─── Sourcing-floor guard ──────────────────────────────────────────────────
  // The capture is the point of no return — refuse to publish (and
  // charge the anchor) for a departure that's now inside the window
  // where Tropic can no longer confirm the charter. Catches a stale
  // queue item ops gets to too late.
  const anchorGate = canAnchor(body.date, body.departTime ?? body.startTime)
  if (!anchorGate.ok) {
    return NextResponse.json({ error: anchorGate.reason }, { status: 409 })
  }

  // ─── Compute charter total ─────────────────────────────────────────────────
  // Flight wizards write seatsTotal / seatsAnchor; excursion wizards
  // write spotsTotal / spotsAnchor. Accept either so this endpoint stays
  // kind-agnostic.
  const seatsTotal: number = Number(
    body.seatsTotal ?? body.spotsTotal ?? body.seats_total ?? body.spots_total ?? 0,
  )
  if (!seatsTotal || seatsTotal <= 0) {
    return NextResponse.json({ error: 'Submission missing seats/spots total' }, { status: 400 })
  }
  // Lock to the quoted total when present — that's the exact number
  // the anchor accepted. Falls back to per-seat × seats for legacy
  // submissions that pre-date the quote flow.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const quotedTotalCents = (sub as any).quoted_total_cents as number | null | undefined
  const charterTotalCents = quotedTotalCents && quotedTotalCents > 0
    ? quotedTotalCents
    : Math.round(pricePerSeat * seatsTotal * 100)

  // ─── Anchor's Stripe customer + default payment method ─────────────────────
  // Resolve via DB-then-Stripe-metadata fallback so a silent cache-write
  // failure (members.stripe_customer_id still null) doesn't block a publish
  // when the customer + card actually exist in Stripe.
  const anchorEmail = await resolveAnchorEmail(sub.member_id)
  const anchorCustomerId = await resolveStripeCustomer(sub.member_id, anchorEmail)
  if (!anchorCustomerId) {
    return NextResponse.json({
      error: 'Anchor has no Stripe customer on file. Ask them to add a card via the anchor wizard and resubmit.',
    }, { status: 412 })
  }

  // Best-effort heal: if we resolved via Stripe and the DB cache was empty,
  // backfill it so the next read short-circuits.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.from('members') as any)
      .update({ stripe_customer_id: anchorCustomerId })
      .eq('id', sub.member_id)
      .is('stripe_customer_id', null)
  } catch (e) {
    safeError('publish-anchor: cache-fill of stripe_customer_id failed (non-fatal):', e)
  }

  // Find a chargeable payment method. Prefer the customer's default;
  // fall back to listing — card first, then link.
  let paymentMethodId: string | null = null
  try {
    const customer = await stripe.customers.retrieve(anchorCustomerId)
    if (!customer.deleted) {
      paymentMethodId = (customer.invoice_settings?.default_payment_method as string | null) ?? null
      if (!paymentMethodId) {
        for (const t of ['card', 'link'] as const) {
          const pms = await stripe.paymentMethods.list({ customer: anchorCustomerId, type: t, limit: 1 })
          if (pms.data[0]) { paymentMethodId = pms.data[0].id; break }
        }
      }
    }
  } catch (e) {
    safeError('Stripe customer read failed:', e)
  }
  if (!paymentMethodId) {
    return NextResponse.json({
      error: 'Anchor has no card on file. They need to add one in the wizard.',
    }, { status: 412 })
  }

  // ─── Capture the charter cost ──────────────────────────────────────────────
  let pi
  try {
    pi = await stripe.paymentIntents.create({
      amount: charterTotalCents,
      currency: 'usd',
      customer: anchorCustomerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      description: `Anchor charter · ${body.name ?? 'Trip'}`,
      metadata: {
        kind: 'anchor_capture',
        anchor_submission_id: submissionId,
        anchor_member_id: sub.member_id,
        price_per_seat_cents: String(pricePerSeat * 100),
        seats_total: String(seatsTotal),
      },
    })
  } catch (e) {
    // Stripe declines come back as a card_error with .decline_code.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = e as any
    safeError('Anchor charter capture failed:', e)
    return NextResponse.json({
      error: err?.raw?.message ?? err?.message ?? 'Card declined, try a different card or contact the anchor.',
      decline_code: err?.raw?.decline_code ?? null,
    }, { status: 402 })
  }

  if (pi.status !== 'succeeded') {
    return NextResponse.json({
      error: `Capture not successful (status: ${pi.status}). Contact the anchor.`,
    }, { status: 402 })
  }

  // ─── Create the trip row ───────────────────────────────────────────────────
  const isPrivate = body.visibility === 'private' || body.is_private === true
  const seatsAnchor: number = Number(
    body.seatsAnchor ?? body.spotsAnchor ?? body.seats_anchor ?? body.spots_anchor ?? 0,
  )
  const tripId = sub.kind === 'flight' ? `F-${Date.now().toString(36).toUpperCase()}` : `E-${Date.now().toString(36).toUpperCase()}`

  let publishedItemId: string | null = null
  if (sub.kind === 'flight') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const insert: any = {
      id: tripId,
      anchor_member_id: sub.member_id,
      origin_code: body.originCode,
      dest_code: body.destCode,
      date: body.date,
      depart_time: body.departTime,
      duration_mins: Number(body.durationMins ?? 0),
      aircraft_id: body.aircraftId ?? 'caravan',
      name: body.name ?? `${body.originCode} → ${body.destCode}`,
      pitch: body.pitch ?? null,
      visibility: 'members',
      seats_total: seatsTotal,
      seats_anchor: seatsAnchor,
      seats_taken: 0,
      price_per_seat: pricePerSeat,
      status: 'open',
      image_url: payload.image_url ?? null,
      is_private: isPrivate,
      anchor_payment_intent_id: pi.id,
      anchor_captured_cents: charterTotalCents,
      anchor_captured_at: new Date().toISOString(),
    }
    const { data: ins, error } = await db.from('flights').insert(insert).select('id').single()
    if (error || !ins) {
      // Roll back the capture if we failed to create the trip.
      try { await stripe.refunds.create({ payment_intent: pi.id, reason: 'duplicate' }) } catch { /* best effort */ }
      safeError('Flight insert failed:', error)
      return NextResponse.json({
        error: `Trip creation failed; capture rolled back. (${error?.message ?? 'unknown'})`,
        db_detail: { code: error?.code, message: error?.message, details: error?.details, hint: error?.hint },
      }, { status: 500 })
    }
    publishedItemId = ins.id
  } else {
    // excursion
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const insert: any = {
      id: tripId,
      anchor_member_id: sub.member_id,
      template_id: body.templateId ?? null,
      origin_code: body.originCode,
      // aircraft_id is NOT NULL in the excursions table (the original
      // schema's FK to aircraft.id was never relaxed) — without this
      // the insert violates the constraint and the capture has to
      // roll back. Default to 'caravan' if the submission didn't pass
      // one through.
      aircraft_id: body.aircraftId ?? 'caravan',
      date: body.date,
      start_time: body.startTime ?? null,
      depart_time: body.departTime ?? null,
      arrive_time: body.arriveTime ?? null,
      return_time: body.returnTime ?? null,
      stay_type: body.stayType ?? 'day_trip',
      name: body.name ?? 'Excursion',
      pitch: body.pitch ?? null,
      icon: body.icon ?? null,
      visibility: 'members',
      spots_total: seatsTotal,
      spots_anchor: seatsAnchor,
      spots_taken: 0,
      price_per_pax: pricePerSeat,
      status: 'open',
      image_url: payload.image_url ?? null,
      is_private: isPrivate,
      anchor_payment_intent_id: pi.id,
      anchor_captured_cents: charterTotalCents,
      anchor_captured_at: new Date().toISOString(),
    }
    const { data: ins, error } = await db.from('excursions').insert(insert).select('id').single()
    if (error || !ins) {
      try { await stripe.refunds.create({ payment_intent: pi.id, reason: 'duplicate' }) } catch { /* best effort */ }
      safeError('Excursion insert failed:', error)
      return NextResponse.json({
        error: `Excursion creation failed; capture rolled back. (${error?.message ?? 'unknown'})`,
        db_detail: { code: error?.code, message: error?.message, details: error?.details, hint: error?.hint },
      }, { status: 500 })
    }
    publishedItemId = ins.id
  }

  // ─── Auto-create the anchor's own booking ──────────────────────────────────
  // So the anchor sees the trip in My Trips with a boarding pass.
  // Payment method 'credits' because the seats are already paid for
  // via the full charter capture above — no separate Stripe charge.
  const confirmationCode = Math.random().toString(36).slice(2, 9).toUpperCase()
  if (seatsAnchor > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.from('bookings') as any).insert({
      id: `B-${Date.now().toString(36).toUpperCase()}`,
      member_id: sub.member_id,
      item_kind: sub.kind,
      item_id: publishedItemId,
      seats: seatsAnchor,
      price_per_seat: pricePerSeat,
      fees: 0,
      total: pricePerSeat * seatsAnchor,
      payment_method: 'credits',
      status: 'approved',
      confirmation_code: confirmationCode,
      decided_at: new Date().toISOString(),
    })
  }

  // ─── Mark the submission published ─────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.from('anchor_submissions') as any)
    .update({ status: 'published', decided_at: new Date().toISOString(), published_item_id: publishedItemId })
    .eq('id', submissionId)

  // Notify the anchor — uses the friend_anchor_published trigger to also
  // fan out to friends; here we send a direct confirmation to the anchor.
  const seatCostDollars = pricePerSeat.toFixed(2)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.from('notifications') as any).insert({
    member_id: sub.member_id,
    kind: 'approval',
    title: `Your ${sub.kind} is live`,
    body:
      `The Concierge Team published "${body.name ?? sub.kind}" and held $${(charterTotalCents / 100).toFixed(2)} on your card, the full charter cost. ` +
      `At trip departure you'll be rebated for every seat the network books at $${seatCostDollars} each. ` +
      `You'll always pay for your own ${seatsAnchor} seat${seatsAnchor === 1 ? '' : 's'} ` +
      `plus any seats that don't sell.`,
    ref: { item_kind: sub.kind, item_id: publishedItemId, anchor_submission_id: submissionId },
  })

  // Activity log.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ((db as any).from('activity_log')).insert({
    actor_kind: 'admin',
    actor_member_id: meRow.id,
    subject_member_id: sub.member_id,
    action: 'anchor_published_and_captured',
    summary: `Published anchored ${sub.kind} and captured $${(charterTotalCents / 100).toFixed(2)} from anchor.`,
    item_kind: sub.kind,
    item_id: publishedItemId,
    meta: { anchor_payment_intent_id: pi.id, charter_total_cents: charterTotalCents, price_per_seat: pricePerSeat, seats_total: seatsTotal },
  })

  // Ops record: anchor captured. Stripe's webhook will also fire
  // payment_intent.succeeded for the same PI; the duplicate is fine
  // (idempotency at the inbox level is cheap), and inline gives ops the
  // receipt within seconds of the Publish click instead of waiting on
  // Stripe's webhook queue.
  const { data: anchorRow } = await db
    .from('members').select('name, member_no').eq('id', sub.member_id).maybeSingle()
  await notifyOps({
    kind: 'anchor_capture',
    member: {
      name: anchorRow?.name ?? null,
      memberCode: anchorRow?.member_no ? `#${anchorRow.member_no}` : null,
      email: anchorEmail,
    },
    amountCents: charterTotalCents,
    item: { kind: sub.kind, id: publishedItemId, name: body.name ?? null, date: body.date ?? null },
    stripe: { paymentIntentId: pi.id, customerId: anchorCustomerId },
    details: {
      'Submission id': submissionId,
      'Price/seat': `$${pricePerSeat.toFixed(2)}`,
      'Seats total': seatsTotal,
      'Anchor seats': seatsAnchor,
    },
    note: `Anchor charged the full charter at publish. At trip departure, anchor will be rebated for every pax seat sold at $${pricePerSeat.toFixed(2)} each, minus the ${seatsAnchor} seat${seatsAnchor === 1 ? '' : 's'} they're keeping.`,
  })

  return NextResponse.json({
    ok: true,
    published_item_id: publishedItemId,
    charter_total_cents: charterTotalCents,
    payment_intent_id: pi.id,
  })
}
