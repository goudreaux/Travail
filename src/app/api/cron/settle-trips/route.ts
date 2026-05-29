import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { safeError } from '@/lib/pii-scrub'
import type { Database } from '@/lib/supabase/types'

// Daily cron — finds trips that have departed but haven't settled yet
// and runs settlement on each. Vercel Cron calls this with an
// Authorization: Bearer ${CRON_SECRET} header.
//
// The actual settlement math is identical to /api/admin/settle-trip —
// we don't reuse that endpoint over HTTP because cron jobs shouldn't
// re-auth as a member. The function is duplicated minimally here and
// runs with the service role.

export const runtime = 'nodejs'
// Max 60s per Vercel cron invocation; we cap to settle 25 trips/run
// which is well within budget for our scale.
export const maxDuration = 60

function admin() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured')
  return createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function settleOne(db: any, itemKind: 'flight' | 'excursion', trip: any) {
  const table = itemKind === 'flight' ? 'flights' : 'excursions'
  if (!trip.anchor_payment_intent_id || !trip.anchor_captured_cents) {
    return { item_id: trip.id, skipped: 'no anchor capture' }
  }
  if (trip.anchor_settled_at) {
    return { item_id: trip.id, skipped: 'already settled' }
  }

  const { data: bookings } = await db
    .from('bookings')
    .select('status, was_forfeit, paid_amount_cents, total, member_id')
    .eq('item_kind', itemKind)
    .eq('item_id', trip.id)
    .neq('member_id', trip.anchor_member_id ?? '__nope__')

  let paidRevenueCents = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const b of (bookings ?? []) as any[]) {
    const counts =
      (b.status === 'approved' && (b.paid_amount_cents ?? 0) > 0)
      || (b.status === 'cancelled' && b.was_forfeit === true)
    if (!counts) continue
    const cents = (b.paid_amount_cents && b.paid_amount_cents > 0)
      ? b.paid_amount_cents
      : Math.round(Number(b.total ?? 0) * 100)
    paidRevenueCents += cents
  }

  const charterTotalCents: number = trip.anchor_captured_cents
  const anchorRefundCents = Math.max(0, charterTotalCents - paidRevenueCents)
  const anchorNetPaidCents = charterTotalCents - anchorRefundCents

  let refundId: string | null = null
  if (anchorRefundCents > 0) {
    try {
      const refund = await stripe.refunds.create({
        payment_intent: trip.anchor_payment_intent_id,
        amount: anchorRefundCents,
        reason: 'requested_by_customer',
        metadata: {
          kind: 'anchor_settlement_refund_cron',
          item_kind: itemKind,
          item_id: trip.id,
          charter_total_cents: String(charterTotalCents),
          paid_revenue_cents: String(paidRevenueCents),
        },
      })
      refundId = refund.id
    } catch (e) {
      safeError(`Cron settle refund failed for ${itemKind} ${trip.id}:`, e)
      return { item_id: trip.id, error: 'stripe_refund_failed' }
    }
  }

  await db.from('trip_settlements').insert({
    item_kind: itemKind,
    item_id: trip.id,
    charter_total_cents: charterTotalCents,
    paid_revenue_cents: paidRevenueCents,
    anchor_refund_cents: anchorRefundCents,
    anchor_net_paid_cents: anchorNetPaidCents,
    settled_by: 'system',
    notes: 'auto-settled via daily cron',
  })

  await db.from(table)
    .update({
      anchor_refunded_cents: anchorRefundCents,
      anchor_settled_at: new Date().toISOString(),
    })
    .eq('id', trip.id)

  if (trip.anchor_member_id) {
    const dollars = (n: number) => `$${(n / 100).toFixed(2)}`
    const body = anchorRefundCents === 0
      ? `${trip.name ?? 'Your trip'} settled. No other members booked, so you paid the full charter (${dollars(anchorNetPaidCents)}). The hold on your card has been released.`
      : `${trip.name ?? 'Your trip'} settled. You paid ${dollars(anchorNetPaidCents)} (your seats plus any that didn't fill). ${dollars(anchorRefundCents)} is being refunded to your card.`
    await db.from('notifications').insert({
      member_id: trip.anchor_member_id,
      kind: 'approval',
      title: `Settlement · ${trip.name ?? 'your trip'}`,
      body,
      ref: { item_kind: itemKind, item_id: trip.id, source: 'cron' },
    })
  }

  await db.from('activity_log').insert({
    actor_kind: 'system',
    actor_member_id: null,
    subject_member_id: trip.anchor_member_id,
    action: 'trip_settled',
    summary: `Auto-settled ${itemKind} "${trip.name ?? trip.id}": anchor net $${(anchorNetPaidCents / 100).toFixed(2)}, refund $${(anchorRefundCents / 100).toFixed(2)}.`,
    item_kind: itemKind,
    item_id: trip.id,
    meta: { charter_total_cents: charterTotalCents, paid_revenue_cents: paidRevenueCents, anchor_refund_cents: anchorRefundCents, anchor_net_paid_cents: anchorNetPaidCents, refund_id: refundId, source: 'cron' },
  })

  return { item_id: trip.id, settled: true, anchor_net_paid_cents: anchorNetPaidCents, anchor_refund_cents: anchorRefundCents }
}

export async function GET(req: NextRequest) {
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Reject any
  // public traffic — this endpoint moves money.
  const auth = req.headers.get('authorization') ?? ''
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const db = admin()
  const results: unknown[] = []

  // Departed flights with anchor capture still open.
  const { data: flights } = await db
    .from('flights')
    .select('id, name, anchor_member_id, anchor_payment_intent_id, anchor_captured_cents, anchor_settled_at, status')
    .eq('status', 'departed')
    .is('anchor_settled_at', null)
    .not('anchor_payment_intent_id', 'is', null)
    .limit(25)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const f of (flights ?? []) as any[]) {
    results.push({ kind: 'flight', ...await settleOne(db, 'flight', f) })
  }

  // Completed excursions, same idea.
  const { data: excursions } = await db
    .from('excursions')
    .select('id, name, anchor_member_id, anchor_payment_intent_id, anchor_captured_cents, anchor_settled_at, status')
    .eq('status', 'completed')
    .is('anchor_settled_at', null)
    .not('anchor_payment_intent_id', 'is', null)
    .limit(25)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of (excursions ?? []) as any[]) {
    results.push({ kind: 'excursion', ...await settleOne(db, 'excursion', e) })
  }

  return NextResponse.json({ ok: true, processed: results.length, results })
}
