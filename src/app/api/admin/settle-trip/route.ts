import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { safeError } from '@/lib/pii-scrub'
import type { Database } from '@/lib/supabase/types'

// Settlement runner — the last leg of the charter pass-through.
//
// Called after a trip has departed. Sums every pax payment (including
// inside-window forfeits where the seat was paid but cancelled), then
// refunds the anchor for the difference between the full charter cost
// they were captured for and what the pax pool actually covered.
//
// Math:
//   paid_revenue   = Σ pax payments + Σ forfeits
//   anchor_refund  = charter_total - paid_revenue
//   anchor_net     = charter_total - anchor_refund    (what the anchor really paid)
//
// If trip fills: paid_revenue = charter_total, anchor_refund = full,
//   anchor_net = $0 (the anchor only paid their seat-equivalent which
//   they recoup as part of the fill).
//
// If trip is partial: anchor_refund < charter_total, anchor_net > 0
//   (the anchor pays for the unsold seats).
//
// Idempotent — if the trip was already settled, returns the existing
// settlement row instead of refunding twice.

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

interface SettlePayload {
  item_kind?: 'flight' | 'excursion'
  item_id?: string
  notes?: string
}

export async function POST(req: NextRequest) {
  // Admin gate.
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const { data: meRow } = await supabase
    .from('members').select('id, is_admin').eq('user_id', user.id).maybeSingle()
  if (!meRow?.is_admin) return NextResponse.json({ error: 'Admins only' }, { status: 403 })

  let payload: SettlePayload
  try { payload = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid payload' }, { status: 400 }) }

  const itemKind = payload.item_kind
  const itemId = (payload.item_id ?? '').trim()
  if (itemKind !== 'flight' && itemKind !== 'excursion') {
    return NextResponse.json({ error: "item_kind must be 'flight' or 'excursion'" }, { status: 400 })
  }
  if (!itemId) return NextResponse.json({ error: 'item_id required' }, { status: 400 })

  const db = admin()
  const table = itemKind === 'flight' ? 'flights' : 'excursions'

  // ─── Load trip ─────────────────────────────────────────────────────────────
  const { data: tripRow, error: tErr } = await db
    .from(table)
    .select('id, anchor_member_id, anchor_payment_intent_id, anchor_captured_cents, anchor_refunded_cents, anchor_settled_at, status, name')
    .eq('id', itemId)
    .maybeSingle()
  if (tErr || !tripRow) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trip = tripRow as any

  // Idempotency — if already settled, return the existing settlement
  // row rather than re-running the refund. trip_settlements isn't in
  // the typed Database schema (writes are service-role only) so cast.
  if (trip.anchor_settled_at) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await ((db as any).from('trip_settlements'))
      .select('*')
      .eq('item_kind', itemKind)
      .eq('item_id', itemId)
      .order('settled_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return NextResponse.json({ ok: true, already_settled: true, settlement: existing })
  }

  if (!trip.anchor_payment_intent_id || !trip.anchor_captured_cents) {
    return NextResponse.json({
      error: 'Trip was not captured via the anchor flow — nothing to settle.',
    }, { status: 409 })
  }

  // ─── Compute pax revenue ───────────────────────────────────────────────────
  // Pax money that counts toward the anchor's offset:
  //   • approved bookings with paid_amount_cents
  //   • forfeited cancellations (was_forfeit = true) — the pax paid and
  //     forfeited, money stays in the trip pool
  const { data: bookings, error: bErr } = await db
    .from('bookings')
    .select('id, status, was_forfeit, paid_amount_cents, total, seats')
    .eq('item_kind', itemKind)
    .eq('item_id', itemId)
    .neq('member_id', trip.anchor_member_id ?? '__nope__')   // exclude the anchor's own booking — that's part of the charter, not external revenue
  if (bErr) {
    safeError('Settlement: bookings read failed:', bErr)
    return NextResponse.json({ error: 'Could not read bookings' }, { status: 500 })
  }

  let paidRevenueCents = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const b of (bookings ?? []) as any[]) {
    const counts =
      (b.status === 'approved' && (b.paid_amount_cents ?? 0) > 0)
      || (b.status === 'cancelled' && b.was_forfeit === true)
    if (!counts) continue
    // Prefer paid_amount_cents when present (true Stripe-captured amount);
    // fall back to total * 100 for older rows that pre-date the column.
    const cents = (b.paid_amount_cents && b.paid_amount_cents > 0)
      ? b.paid_amount_cents
      : Math.round(Number(b.total ?? 0) * 100)
    paidRevenueCents += cents
  }

  const charterTotalCents: number = trip.anchor_captured_cents
  const anchorRefundCents = Math.max(0, charterTotalCents - paidRevenueCents)
  const anchorNetPaidCents = charterTotalCents - anchorRefundCents

  // ─── Refund the anchor's PI by the refund amount ───────────────────────────
  let refundId: string | null = null
  if (anchorRefundCents > 0) {
    try {
      const refund = await stripe.refunds.create({
        payment_intent: trip.anchor_payment_intent_id,
        amount: anchorRefundCents,
        reason: 'requested_by_customer',
        metadata: {
          kind: 'anchor_settlement_refund',
          item_kind: itemKind,
          item_id: itemId,
          charter_total_cents: String(charterTotalCents),
          paid_revenue_cents: String(paidRevenueCents),
        },
      })
      refundId = refund.id
    } catch (e) {
      safeError('Anchor settlement refund failed:', e)
      return NextResponse.json({
        error: 'Refund failed at the payment processor. Try again in a few minutes; nothing has been recorded.',
      }, { status: 502 })
    }
  }

  // ─── Persist the settlement audit row + trip state ─────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: settlementRow, error: insErr } = await ((db as any).from('trip_settlements'))
    .insert({
      item_kind: itemKind,
      item_id: itemId,
      charter_total_cents: charterTotalCents,
      paid_revenue_cents: paidRevenueCents,
      anchor_refund_cents: anchorRefundCents,
      anchor_net_paid_cents: anchorNetPaidCents,
      settled_by: meRow.id,
      notes: payload.notes ?? null,
    })
    .select()
    .single()
  if (insErr || !settlementRow) {
    safeError('Settlement row insert failed:', insErr)
    // Refund already happened — log so ops can reconcile manually.
    return NextResponse.json({
      error: 'Refund issued but the settlement record could not be saved. Refund ID: ' + (refundId ?? 'n/a'),
    }, { status: 500 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.from(table) as any)
    .update({
      anchor_refunded_cents: anchorRefundCents,
      anchor_settled_at: new Date().toISOString(),
    })
    .eq('id', itemId)

  // ─── Notify the anchor + activity log ──────────────────────────────────────
  if (trip.anchor_member_id) {
    const dollars = (n: number) => `$${(n / 100).toFixed(2)}`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.from('notifications') as any).insert({
      member_id: trip.anchor_member_id,
      kind: 'approval',
      title: `Settlement · ${trip.name ?? 'your trip'}`,
      body: anchorNetPaidCents === 0
        ? `${trip.name ?? 'Your trip'} filled — you've been fully rebated ${dollars(anchorRefundCents)} to your card on file.`
        : `${trip.name ?? 'Your trip'} settled. Final charter cost to you: ${dollars(anchorNetPaidCents)}. Rebate of ${dollars(anchorRefundCents)} returning to your card.`,
      ref: { item_kind: itemKind, item_id: itemId, settlement_id: settlementRow.id },
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ((db as any).from('activity_log')).insert({
    actor_kind: 'admin',
    actor_member_id: meRow.id,
    subject_member_id: trip.anchor_member_id,
    action: 'trip_settled',
    summary: `Settled ${itemKind} "${trip.name ?? itemId}" — anchor net $${(anchorNetPaidCents / 100).toFixed(2)}, refund $${(anchorRefundCents / 100).toFixed(2)}.`,
    item_kind: itemKind,
    item_id: itemId,
    meta: {
      settlement_id: settlementRow.id,
      charter_total_cents: charterTotalCents,
      paid_revenue_cents: paidRevenueCents,
      anchor_refund_cents: anchorRefundCents,
      anchor_net_paid_cents: anchorNetPaidCents,
      refund_id: refundId,
    },
  })

  return NextResponse.json({
    ok: true,
    settlement: settlementRow,
    refund_id: refundId,
  })
}
