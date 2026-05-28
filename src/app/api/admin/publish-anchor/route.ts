import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { safeError } from '@/lib/pii-scrub'
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
  const pricePerSeat = Number(payload.price_per_seat)
  if (!submissionId) return NextResponse.json({ error: 'anchor_submission_id required' }, { status: 400 })
  if (!Number.isFinite(pricePerSeat) || pricePerSeat <= 0) {
    return NextResponse.json({ error: 'price_per_seat must be a positive number (dollars)' }, { status: 400 })
  }

  const db = admin()

  // Load the submission.
  const { data: sub, error: sErr } = await db
    .from('anchor_submissions').select('*').eq('id', submissionId).maybeSingle()
  if (sErr || !sub) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  if (sub.status !== 'pending') {
    return NextResponse.json({ error: `Submission is ${sub.status}, not pending` }, { status: 409 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = (sub.payload ?? {}) as any

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
  const charterTotalCents = Math.round(pricePerSeat * seatsTotal * 100)

  // ─── Anchor's Stripe customer + default payment method ─────────────────────
  const { data: anchorMember } = await db
    .from('members').select('id, name, stripe_customer_id').eq('id', sub.member_id).single()
  if (!anchorMember?.stripe_customer_id) {
    return NextResponse.json({
      error: 'Anchor has no Stripe customer on file. Ask them to add a card via the anchor wizard and resubmit.',
    }, { status: 412 })
  }

  let paymentMethodId: string | null = null
  try {
    const customer = await stripe.customers.retrieve(anchorMember.stripe_customer_id)
    if (!customer.deleted) {
      paymentMethodId = (customer.invoice_settings?.default_payment_method as string | null) ?? null
      if (!paymentMethodId) {
        const pms = await stripe.paymentMethods.list({ customer: anchorMember.stripe_customer_id, type: 'card', limit: 1 })
        paymentMethodId = pms.data[0]?.id ?? null
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
      customer: anchorMember.stripe_customer_id,
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
      error: err?.raw?.message ?? err?.message ?? 'Card declined — try a different card or contact the anchor.',
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
      return NextResponse.json({ error: 'Trip creation failed; capture rolled back.' }, { status: 500 })
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
      return NextResponse.json({ error: 'Excursion creation failed; capture rolled back.' }, { status: 500 })
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
      `Ops published "${body.name ?? sub.kind}" and held $${(charterTotalCents / 100).toFixed(2)} on your card — the full charter cost. ` +
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

  return NextResponse.json({
    ok: true,
    published_item_id: publishedItemId,
    charter_total_cents: charterTotalCents,
    payment_intent_id: pi.id,
  })
}
