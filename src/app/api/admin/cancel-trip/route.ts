import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { safeError } from '@/lib/pii-scrub'
import { notifyOps } from '@/lib/ops-notify'
import { sendTripCancelledEmail } from '@/lib/member-email'
import type { Database } from '@/lib/supabase/types'

// Ops-side trip cancellation — the "Travail force cancel" path.
//
// When Travail cancels a trip outright (Ops decision, weather, operator
// pulled out, etc.) the policy is:
//   • Every pax booking gets a FULL refund — paid_amount_cents back,
//     including their 3% service fee. Travail eats the fee margin as
//     a customer-service gesture; the cancel wasn't the member's fault.
//   • The anchor gets a FULL refund of anchor_captured_cents, which
//     includes the 3% anchor service fee. This is the one scenario
//     where the anchor service fee IS refunded (per policy: "service
//     fee is never refundable except in the scenario of a Travail
//     forced cancellation").
//   • The trip row, anchor submission, and every booking move to
//     status='cancelled'.
//   • Branded emails go to the anchor + every affected pax + ops
//     inbox so the paper trail is complete.
//
// Idempotency: refuses to act if the trip is already cancelled. Round-
// trip flight pairs (outbound B-X + return B-XR) are handled by the
// caller — pass each leg's id individually if you need both cancelled.
//
// Request:
//   POST /api/admin/cancel-trip
//   { item_kind: 'flight' | 'excursion', item_id: 'F-...' | 'E-...',
//     reason?: string }

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

interface CancelPayload {
  item_kind?: 'flight' | 'excursion'
  item_id?: string
  reason?: string
}

export async function POST(req: NextRequest) {
  // Admin gate.
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const { data: meRow } = await supabase
    .from('members').select('id, is_admin').eq('user_id', user.id).maybeSingle()
  if (!meRow?.is_admin) return NextResponse.json({ error: 'Admins only' }, { status: 403 })

  let payload: CancelPayload
  try { payload = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid payload' }, { status: 400 }) }

  const itemKind = payload.item_kind
  const itemId = (payload.item_id ?? '').trim()
  const reason = (payload.reason ?? '').trim().slice(0, 1000) || null
  if (itemKind !== 'flight' && itemKind !== 'excursion') {
    return NextResponse.json({ error: "item_kind must be 'flight' or 'excursion'" }, { status: 400 })
  }
  if (!itemId) return NextResponse.json({ error: 'item_id required' }, { status: 400 })

  const db = admin()
  const table = itemKind === 'flight' ? 'flights' : 'excursions'

  // ─── Load trip ─────────────────────────────────────────────────────────────
  const { data: tripRow } = await db
    .from(table)
    .select('id, name, date, status, anchor_member_id, anchor_payment_intent_id, anchor_captured_cents')
    .eq('id', itemId)
    .maybeSingle()
  if (!tripRow) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trip = tripRow as any
  if (trip.status === 'cancelled') {
    return NextResponse.json({ ok: true, already_cancelled: true })
  }

  // ─── Refund all paid pax bookings ──────────────────────────────────────────
  const { data: bookings } = await db
    .from('bookings')
    .select('id, member_id, confirmation_code, seats, paid_amount_cents, stripe_payment_intent_id, status')
    .eq('item_kind', itemKind)
    .eq('item_id', itemId)
    .neq('member_id', trip.anchor_member_id ?? '__nope__')   // anchor's own auto-booking has no Stripe charge — settled via the capture refund instead
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paxBookings: any[] = (bookings ?? []) as any[]

  // Refunds collected for the ops + member emails.
  interface PaxRefund {
    bookingId: string
    memberId: string
    seats: number
    confirmationCode: string | null
    paidCents: number
    refundCents: number
    refundId: string | null
    error: string | null
  }
  const paxRefunds: PaxRefund[] = []

  for (const b of paxBookings) {
    if (b.status === 'cancelled' || b.status === 'refunded') continue
    const paid: number = Number(b.paid_amount_cents ?? 0)
    let refundId: string | null = null
    let refundCents = 0
    let err: string | null = null
    if (b.stripe_payment_intent_id && paid > 0) {
      try {
        const refund = await stripe.refunds.create({
          payment_intent: b.stripe_payment_intent_id,
          // Refund the FULL paid amount — including service fee. Travail
          // eats the fee on a force-cancel.
          amount: paid,
          reason: 'requested_by_customer',
          metadata: {
            kind: 'trip_cancel_pax_refund',
            item_kind: itemKind,
            item_id: itemId,
            booking_id: b.id,
            member_id: b.member_id,
          },
        })
        refundId = refund.id
        refundCents = paid
      } catch (e) {
        safeError('cancel-trip: pax refund failed', e)
        err = (e as Error).message ?? 'refund failed'
      }
    }
    paxRefunds.push({
      bookingId: b.id,
      memberId: b.member_id,
      seats: Number(b.seats ?? 1),
      confirmationCode: b.confirmation_code ?? null,
      paidCents: paid,
      refundCents,
      refundId,
      error: err,
    })
  }

  // ─── Refund the anchor's FULL capture (incl. 3% service fee) ───────────────
  let anchorRefundId: string | null = null
  let anchorRefundCents = 0
  let anchorRefundError: string | null = null
  if (trip.anchor_payment_intent_id && trip.anchor_captured_cents > 0) {
    try {
      const refund = await stripe.refunds.create({
        payment_intent: trip.anchor_payment_intent_id,
        // Full capture amount — refunds the charter portion AND the 3%
        // service fee. Only path in the system that refunds the fee.
        amount: trip.anchor_captured_cents,
        reason: 'requested_by_customer',
        metadata: {
          kind: 'trip_cancel_anchor_refund',
          item_kind: itemKind,
          item_id: itemId,
        },
      })
      anchorRefundId = refund.id
      anchorRefundCents = trip.anchor_captured_cents
    } catch (e) {
      safeError('cancel-trip: anchor refund failed', e)
      anchorRefundError = (e as Error).message ?? 'refund failed'
    }
  }

  // ─── DB updates ────────────────────────────────────────────────────────────
  // Mark trip cancelled.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.from(table) as any)
    .update({
      status: 'cancelled',
      anchor_refunded_cents: anchorRefundCents,
      anchor_settled_at: trip.anchor_payment_intent_id ? new Date().toISOString() : null,
    })
    .eq('id', itemId)

  // Mark every affected booking cancelled with refund stamped on it.
  for (const r of paxRefunds) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.from('bookings') as any).update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      refund_amount_cents: r.refundCents,
      refund_id: r.refundId,
      was_forfeit: false,
      payment_status: r.refundCents > 0 ? 'refunded' : 'cancelled',
    }).eq('id', r.bookingId)
  }
  // Anchor's own auto-booking → cancelled (no Stripe refund needed; that came via the capture refund).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.from('bookings') as any)
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('item_kind', itemKind)
    .eq('item_id', itemId)
    .eq('member_id', trip.anchor_member_id ?? '__nope__')

  // Retire the originating anchor submission too.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.from('anchor_submissions') as any)
    .update({ status: 'cancelled' })
    .eq('published_item_id', itemId)
    .neq('status', 'cancelled')

  // ─── Email lookup helper (member_sensitive → auth.users fallback) ──────────
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
      safeError('cancel-trip: auth.users email lookup failed', e)
      return null
    }
  }

  // ─── Pax notifications + branded email ─────────────────────────────────────
  for (const r of paxRefunds) {
    const { data: paxMember } = await db
      .from('members').select('name').eq('id', r.memberId).maybeSingle()
    // In-app notification (also fires notify-email Edge Function).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.from('notifications') as any).insert({
      member_id: r.memberId,
      kind: 'booking',
      title: 'Trip cancelled — full refund',
      body: r.refundCents > 0
        ? `"${trip.name}" was cancelled by Ops. A full refund of $${(r.refundCents / 100).toFixed(2)} has been issued to your card.`
        : `"${trip.name}" was cancelled by Ops. No refund was needed.`,
      ref: { item_kind: itemKind, item_id: itemId, booking_id: r.bookingId },
    })

    // Branded email
    const paxEmail = await resolveMemberEmail(r.memberId)
    if (paxEmail) {
      await sendTripCancelledEmail({
        to: paxEmail,
        memberName: paxMember?.name ?? 'Member',
        memberId: r.memberId,
        tripId: itemId,
        bookingId: r.bookingId,
        role: 'pax',
        tripName: trip.name ?? (itemKind === 'flight' ? 'Flight' : 'Excursion'),
        tripDate: trip.date ?? null,
        refundCents: r.refundCents,
        refundId: r.refundId,
        confirmationCode: r.confirmationCode,
        reason,
      })
    }
  }

  // ─── Anchor notification + branded email ───────────────────────────────────
  if (trip.anchor_member_id) {
    const { data: anchorMember } = await db
      .from('members').select('name, member_no').eq('id', trip.anchor_member_id).maybeSingle()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.from('notifications') as any).insert({
      member_id: trip.anchor_member_id,
      kind: 'approval',
      title: `Trip cancelled — full refund`,
      body: anchorRefundCents > 0
        ? `"${trip.name}" was cancelled by Travail Ops. Your full capture of $${(anchorRefundCents / 100).toFixed(2)} — charter and the 3% service fee — has been refunded to your card.`
        : `"${trip.name}" was cancelled by Travail Ops. No anchor capture was on file to refund.`,
      ref: { item_kind: itemKind, item_id: itemId },
    })

    const anchorEmail = await resolveMemberEmail(trip.anchor_member_id)
    if (anchorEmail) {
      await sendTripCancelledEmail({
        to: anchorEmail,
        memberName: anchorMember?.name ?? 'Member',
        memberId: trip.anchor_member_id,
        tripId: itemId,
        role: 'anchor',
        tripName: trip.name ?? (itemKind === 'flight' ? 'Anchored flight' : 'Anchored excursion'),
        tripDate: trip.date ?? null,
        refundCents: anchorRefundCents,
        refundId: anchorRefundId,
        confirmationCode: null,
        reason,
      })
    }

    // Ops record
    await notifyOps({
      kind: 'anchor_settlement',   // closest existing kind for refund flows
      member: {
        name: anchorMember?.name ?? null,
        memberCode: anchorMember?.member_no ? `#${anchorMember.member_no}` : null,
        email: await resolveMemberEmail(trip.anchor_member_id),
      },
      item: { kind: itemKind, id: itemId, name: trip.name ?? null, date: trip.date ?? null },
      amountCents: anchorRefundCents,
      stripe: {
        paymentIntentId: trip.anchor_payment_intent_id,
        refundId: anchorRefundId,
      },
      details: {
        Action: 'TRIP CANCELLED by Ops',
        'Anchor refund (incl. fee)': `$${(anchorRefundCents / 100).toFixed(2)}`,
        'Pax refunds issued': `${paxRefunds.filter(r => r.refundCents > 0).length} of ${paxRefunds.length}`,
        'Total pax refunded': `$${(paxRefunds.reduce((s, r) => s + r.refundCents, 0) / 100).toFixed(2)}`,
        ...(anchorRefundError ? { 'Anchor refund error': anchorRefundError } : {}),
      },
      note: reason ? `Cancellation reason: ${reason}` : 'Travail-forced cancellation. Both the anchor (charter + 3% fee) and every pax (full incl. fees) have been refunded.',
    })
  }

  // ─── Activity log ──────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ((db as any).from('activity_log')).insert({
    actor_kind: 'admin',
    actor_member_id: meRow.id,
    subject_member_id: trip.anchor_member_id,
    action: 'trip_cancelled_by_ops',
    summary: `Cancelled ${itemKind} "${trip.name ?? itemId}" — anchor refund $${(anchorRefundCents / 100).toFixed(2)}, ${paxRefunds.length} pax affected.`,
    item_kind: itemKind,
    item_id: itemId,
    meta: {
      anchor_refund_cents: anchorRefundCents,
      anchor_refund_id: anchorRefundId,
      anchor_refund_error: anchorRefundError,
      pax_count: paxRefunds.length,
      pax_refunds_total_cents: paxRefunds.reduce((s, r) => s + r.refundCents, 0),
      reason,
    },
  })

  return NextResponse.json({
    ok: true,
    cancelled: true,
    anchor: {
      refunded_cents: anchorRefundCents,
      refund_id: anchorRefundId,
      error: anchorRefundError,
    },
    pax: paxRefunds.map(r => ({
      booking_id: r.bookingId,
      refunded_cents: r.refundCents,
      refund_id: r.refundId,
      error: r.error,
    })),
  })
}
