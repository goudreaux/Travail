import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { safeError } from '@/lib/pii-scrub'
import { notifyOps } from '@/lib/ops-notify'
import { sendSettlementEmail, sendPaxTripCompleteEmail } from '@/lib/member-email'
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

  // Pax revenue at settlement = the CHARTER PORTION only of every
  // qualifying pax booking. Service fees stay with Travail as margin
  // and do NOT count toward the anchor's offset. price_per_seat × seats
  // gives the charter portion directly from the booking row.
  let paidRevenueCents = 0
  let paxSeatsSold = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const b of (bookings ?? []) as any[]) {
    const counts =
      (b.status === 'approved' && (b.paid_amount_cents ?? 0) > 0)
      || (b.status === 'cancelled' && b.was_forfeit === true)
    if (!counts) continue
    const seats = Number(b.seats ?? 0)
    const perSeatDollars = Number(b.price_per_seat ?? 0)
    // Charter portion only — strip out fees. This is the amount that
    // covers actual charter cost; the rest of what pax paid is fee.
    const charterPortionCents = Math.round(perSeatDollars * seats * 100)
    paidRevenueCents += charterPortionCents
    paxSeatsSold += seats
  }

  const charterTotalCents: number = trip.anchor_captured_cents
  // Refund = what the pax pool covered (their charter portion). The
  // anchor's net cost = capture − refund = the cost of every seat
  // the anchor "owns" at settlement (their own seats + any unfilled).
  // Cap at charter_total in case math drift somehow pushes pax revenue
  // above the captured amount.
  const anchorRefundCents = Math.min(charterTotalCents, paidRevenueCents)
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

  // Mark trip as terminal so it drops off active boards (open / full
   // → completed for excursions, departed for flights). 'completed'
   // and 'departed' are the existing terminal statuses for each kind.
  const terminalStatus = itemKind === 'flight' ? 'departed' : 'completed'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.from(table) as any)
    .update({
      anchor_refunded_cents: anchorRefundCents,
      anchor_settled_at: new Date().toISOString(),
      status: terminalStatus,
    })
    .eq('id', itemId)

  // Mark all this trip's bookings as 'completed' so the booking lands
  // in members' history rather than active bookings.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.from('bookings') as any)
    .update({ status: 'completed' })
    .eq('item_kind', itemKind)
    .eq('item_id', itemId)
    .in('status', ['approved'])

  // ─── Notify the anchor + activity log ──────────────────────────────────────
  if (trip.anchor_member_id) {
    const dollars = (n: number) => `$${(n / 100).toFixed(2)}`
    // Honest, structural copy: the anchor always pays for their own
    // seats; the rebate only covers what the network filled.
    const body = anchorRefundCents === 0
      ? `${trip.name ?? 'Your trip'} settled. No other members booked, so you paid the full charter (${dollars(anchorNetPaidCents)}). The hold on your card has been released.`
      : `${trip.name ?? 'Your trip'} settled. You paid ${dollars(anchorNetPaidCents)} (your seats plus any that didn't fill). ${dollars(anchorRefundCents)} is being refunded to your card.`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.from('notifications') as any).insert({
      member_id: trip.anchor_member_id,
      kind: 'approval',
      title: `Settlement · ${trip.name ?? 'your trip'}`,
      body,
      ref: { item_kind: itemKind, item_id: itemId, settlement_id: settlementRow.id },
    })
  }

  // ─── Branded settlement email to the anchor + ops record ───────────────────
  // The in-app notification covers the "saw it in the app" case; the
  // branded email gives the anchor a permanent receipt they can file.
  // Both are best-effort — refund + settlement row already persisted.
  let perSeatCents = 0
  let anchorSeats = 0
  let tripDate: string | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const seatField: any = itemKind === 'flight' ? 'seats_total' : 'spots_total'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anchorField: any = itemKind === 'flight' ? 'seats_anchor' : 'spots_anchor'
    const { data: detail } = await db
      .from(table)
      .select(`id, name, date, ${seatField}, ${anchorField}, anchor_member_id`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .eq('id', itemId).maybeSingle() as any
    if (detail) {
      const seatsTotal: number = Number(detail[seatField] ?? 0)
      anchorSeats = Number(detail[anchorField] ?? 0)
      perSeatCents = seatsTotal > 0 ? Math.round(charterTotalCents / seatsTotal) : 0
      tripDate = detail.date ?? null
    }
  } catch (e) {
    safeError('settle-trip: per-seat math lookup failed (non-fatal)', e)
  }

  // Resolve a usable email for any member: member_sensitive first, then
  // fall back to auth.users (the login identity). Without this, anyone
  // whose member_sensitive row was never populated silently never gets
  // settlement / receipt emails.
  async function resolveMemberEmail(memberId: string): Promise<string | null> {
    const { data: contact } = await db
      .from('member_sensitive').select('email').eq('member_id', memberId).maybeSingle()
    if (contact?.email && contact.email.trim().length > 0) return contact.email
    const { data: m } = await db
      .from('members').select('user_id').eq('id', memberId).maybeSingle()
    if (!m?.user_id) return null
    try {
      const { data: u } = await db.auth.admin.getUserById(m.user_id)
      return u?.user?.email ?? null
    } catch (e) {
      safeError('settle-trip: auth.users email lookup failed', e)
      return null
    }
  }

  // Pull the original quote so the settlement email can show the
  // charter / service-fee breakdown (rather than only the captured
  // total). Best-effort — the submission row may have been pruned;
  // legacy rows pre-fee have null charter_cost_cents.
  let charterCostCents: number | null = null
  let serviceFeeCents: number | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sub } = await (db.from('anchor_submissions') as any)
      .select('charter_cost_cents, quoted_total_cents')
      .eq('published_item_id', itemId)
      .maybeSingle()
    if (sub?.charter_cost_cents) {
      charterCostCents = Number(sub.charter_cost_cents)
      serviceFeeCents = Math.max(0, charterTotalCents - charterCostCents)
    }
  } catch (e) {
    safeError('settle-trip: charter breakdown lookup failed (non-fatal)', e)
  }

  // Anchor email
  if (trip.anchor_member_id) {
    const { data: anchorMember } = await db
      .from('members').select('name, member_no').eq('id', trip.anchor_member_id).maybeSingle()
    const anchorEmail = await resolveMemberEmail(trip.anchor_member_id)
    if (anchorEmail) {
      await sendSettlementEmail({
        to: anchorEmail,
        memberName: anchorMember?.name ?? 'Member',
        tripName: trip.name ?? (itemKind === 'flight' ? 'Anchored flight' : 'Anchored excursion'),
        tripDate,
        charterTotalCents,
        charterCostCents,
        serviceFeeCents,
        paidRevenueCents,
        anchorRefundCents,
        anchorNetPaidCents,
        refundId,
        paxSeatsSold,
        perSeatCents,
        anchorSeats,
      })
    } else {
      safeError('settle-trip: no email for anchor; settlement email skipped', { memberId: trip.anchor_member_id })
    }

    // Pax member emails — every non-anchor member who had a paid seat
    // on this trip gets a short "trip wrapped" branded email so they
    // know it closed and can pull their booking summary.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const paxBookings: any[] = (bookings ?? []) as any[]
    const sentToMembers = new Set<string>()
    for (const b of paxBookings) {
      if (!b.member_id || sentToMembers.has(b.member_id)) continue
      if (b.status !== 'approved' || !(b.paid_amount_cents > 0)) continue
      sentToMembers.add(b.member_id)
      const { data: paxMember } = await db
        .from('members').select('name').eq('id', b.member_id).maybeSingle()
      const paxEmail = await resolveMemberEmail(b.member_id)
      if (!paxEmail) {
        safeError('settle-trip: no email for pax; trip-complete email skipped', { memberId: b.member_id })
        continue
      }
      await sendPaxTripCompleteEmail({
        to: paxEmail,
        memberName: paxMember?.name ?? 'Member',
        tripName: trip.name ?? (itemKind === 'flight' ? 'Flight' : 'Excursion'),
        tripDate,
        seats: Number(b.seats ?? 1),
        amountPaidCents: Number(b.paid_amount_cents ?? 0),
        confirmationCode: b.confirmation_code ?? null,
      })
    }

    // Ops record-keeping
    await notifyOps({
      kind: 'anchor_settlement',
      member: {
        name: anchorMember?.name ?? null,
        memberCode: anchorMember?.member_no ? `#${anchorMember.member_no}` : null,
        email: anchorEmail,
      },
      item: { kind: itemKind, id: itemId, name: trip.name ?? null },
      amountCents: anchorRefundCents,
      stripe: {
        paymentIntentId: trip.anchor_payment_intent_id,
        refundId,
      },
      details: {
        'Charter captured': `$${(charterTotalCents / 100).toFixed(2)}`,
        'Pax revenue': `$${(paidRevenueCents / 100).toFixed(2)} (${paxSeatsSold} seat${paxSeatsSold === 1 ? '' : 's'})`,
        'Refund issued': `$${(anchorRefundCents / 100).toFixed(2)}`,
        'Anchor final cost': `$${(anchorNetPaidCents / 100).toFixed(2)}`,
        'Settlement id': settlementRow.id,
      },
      note: payload.notes ?? null,
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
