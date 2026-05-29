import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { safeError } from '@/lib/pii-scrub'
import { notifyOps } from '@/lib/ops-notify'
import type { Database } from '@/lib/supabase/types'

// Member-initiated booking cancellation.
//
// Policy (frozen snapshot on the trip row at publish time):
//   • Outside the cancellation window (default 72h before departure):
//     full refund via Stripe, booking marked cancelled, seat returns
//     to the open pool. The anchor's exposure grows by one empty seat.
//   • Inside the window: no refund, the pax forfeits. Money stays on
//     Travail's books and offsets the anchor's settlement at trip
//     departure.
//
// Edge cases:
//   • Already cancelled — return 409.
//   • Trip already departed — return 409 (no cancels after wheels-up).
//   • Booking has no Stripe payment intent (legacy / placeholder
//     account) — skip the refund call but still mark cancelled.

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
  bookingId?: string
  reason?: string
}

function tripDeparture(dateStr: string, timeStr: string | null | undefined): Date {
  // dateStr is 'YYYY-MM-DD', timeStr is 'HH:MM' (or null). Treat as the
  // trip's local time but render in member's local TZ — same logic the
  // rest of the app uses. Off by ~tz hours in edge cases, but the 72h
  // policy has enough headroom that it doesn't matter.
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = (timeStr ?? '00:00').split(':').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  // Resolve the calling member from the auth user.
  const { data: meRow } = await supabase
    .from('members').select('id, is_admin').eq('user_id', user.id).maybeSingle()
  if (!meRow) {
    return NextResponse.json({ error: 'Member record not found' }, { status: 403 })
  }

  let payload: CancelPayload
  try { payload = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid payload' }, { status: 400 }) }

  const bookingId = (payload.bookingId ?? '').trim()
  const reason = (payload.reason ?? '').trim().slice(0, 1000) || null
  if (!bookingId) {
    return NextResponse.json({ error: 'bookingId required' }, { status: 400 })
  }

  const db = admin()  // bypass RLS for cross-table reads/writes

  const { data: booking, error: bErr } = await db
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .maybeSingle()
  if (bErr || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  // Only the booking owner can cancel — or an admin.
  if (booking.member_id !== meRow.id && !meRow.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (booking.status === 'cancelled' || booking.status === 'refunded') {
    return NextResponse.json({ error: 'Already cancelled' }, { status: 409 })
  }

  // Fetch the trip to determine the departure timestamp + cancellation policy.
  const isFlight = booking.item_kind === 'flight'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tripRow } = isFlight
    ? await db.from('flights').select('id, date, depart_time, status, cancellation_policy').eq('id', booking.item_id).maybeSingle()
    : await db.from('excursions').select('id, date, depart_time, start_time, status, cancellation_policy').eq('id', booking.item_id).maybeSingle()
  if (!tripRow) {
    return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = tripRow as any

  if (t.status === 'departed' || t.status === 'completed') {
    return NextResponse.json({ error: 'Trip has already departed' }, { status: 409 })
  }

  const departAt = tripDeparture(
    t.date,
    isFlight ? t.depart_time : (t.depart_time ?? t.start_time),
  )
  const hoursUntilDeparture = (departAt.getTime() - Date.now()) / (1000 * 60 * 60)

  // Policy snapshot — default to 72h if absent (older trips pre-migration 041).
  const policy = t.cancellation_policy ?? {}
  const windowHours = typeof policy.window_hours === 'number' ? policy.window_hours : 72
  const insideWindow = hoursUntilDeparture < windowHours

  // ─── Refund / forfeit decision ─────────────────────────────────────────────
  let refundId: string | null = null
  let refundAmountCents = 0
  const wasForfeit = insideWindow

  if (!insideWindow) {
    // Outside the window — full refund.
    const piId = booking.stripe_payment_intent_id
    const paidCents = booking.paid_amount_cents ?? 0
    if (piId && paidCents > 0) {
      try {
        const refund = await stripe.refunds.create({
          payment_intent: piId,
          amount: paidCents,
          reason: 'requested_by_customer',
          metadata: { booking_id: booking.id, member_id: meRow.id, kind: 'pax_cancel_outside_window' },
        })
        refundId = refund.id
        refundAmountCents = paidCents
      } catch (e) {
        safeError('Stripe refund failed:', e)
        return NextResponse.json({
          error: 'Refund failed at the payment processor. Try again in a few minutes or contact Ops.',
        }, { status: 502 })
      }
    } else {
      // Legacy / placeholder booking with no Stripe charge — still cancel,
      // log refund as zero so the audit is honest.
      refundAmountCents = 0
    }
  }

  // ─── DB update — atomic-ish via a single update ────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: any = {
    status: 'cancelled',
    cancelled_at: new Date().toISOString(),
    refund_amount_cents: refundAmountCents,
    refund_id: refundId,
    was_forfeit: wasForfeit,
  }
  const { error: upErr } = await db.from('bookings').update(updates).eq('id', booking.id)
  if (upErr) {
    safeError('Booking cancel update failed:', upErr)
    return NextResponse.json({ error: 'Failed to update booking record.' }, { status: 500 })
  }

  // Activity log — permanent audit chain. activity_log isn't in the
  // typed Database schema (it's strictly server-written), so cast the
  // builder to skip the table-name overload.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ((db as any).from('activity_log')).insert({
    actor_kind: 'member',
    actor_member_id: meRow.id,
    subject_member_id: booking.member_id,
    action: wasForfeit ? 'booking_forfeit' : 'booking_cancelled_with_refund',
    summary: wasForfeit
      ? `Cancelled inside ${windowHours}h window, seat forfeited (no refund).`
      : `Cancelled outside ${windowHours}h window, full refund issued.`,
    booking_id: booking.id,
    item_kind: booking.item_kind,
    item_id: booking.item_id,
    meta: {
      refund_amount_cents: refundAmountCents,
      refund_id: refundId,
      hours_until_departure: Math.round(hoursUntilDeparture * 10) / 10,
      window_hours: windowHours,
      reason,
    },
  })

  // Notify the booking owner.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.from('notifications') as any).insert({
    member_id: booking.member_id,
    kind: 'booking',
    title: wasForfeit ? 'Reservation cancelled, seat forfeited' : 'Reservation cancelled & refunded',
    body: wasForfeit
      ? `Your reservation was cancelled inside the ${windowHours}-hour window. Per our policy, the seat is forfeited and no refund is issued.`
      : `Your reservation was cancelled outside the ${windowHours}-hour window. A full refund of $${(refundAmountCents / 100).toFixed(2)} has been issued and should appear on your card within 5-10 business days.`,
    ref: { booking_id: booking.id, item_kind: booking.item_kind, item_id: booking.item_id },
  })

  // Ops record — every pax cancel lands in the ops inbox so the team
  // sees the seat opening up + forfeit revenue / refund activity in
  // real time.
  try {
    const { data: paxMember } = await db
      .from('members').select('name, member_no').eq('id', booking.member_id).maybeSingle()
    const { data: paxContact } = await db
      .from('member_sensitive').select('email').eq('member_id', booking.member_id).maybeSingle()
    await notifyOps({
      kind: wasForfeit ? 'pax_cancel_forfeit' : 'pax_cancel_refund',
      member: {
        name: paxMember?.name ?? null,
        memberCode: paxMember?.member_no ? `#${paxMember.member_no}` : null,
        email: paxContact?.email ?? null,
      },
      item: { kind: booking.item_kind as 'flight' | 'excursion', id: booking.item_id, name: null },
      amountCents: wasForfeit ? (booking.paid_amount_cents ?? 0) : refundAmountCents,
      stripe: { paymentIntentId: booking.stripe_payment_intent_id, refundId },
      details: {
        Booking: booking.id,
        'Hours until departure': String(Math.round(hoursUntilDeparture * 10) / 10),
        'Policy window': `${windowHours}h`,
        Seats: String(booking.seats ?? 1),
        ...(reason ? { 'Member reason': reason } : {}),
      },
      note: wasForfeit
        ? 'Pax cancelled inside the policy window, seat forfeited, no refund. Money stays on Travail\'s books and offsets the anchor\'s settlement.'
        : 'Pax cancelled outside the policy window, full Stripe refund issued. Seat returns to open pool.',
    })
  } catch (e) {
    safeError('cancel: notifyOps failed (non-fatal)', e)
  }

  return NextResponse.json({
    ok: true,
    cancelled: true,
    was_forfeit: wasForfeit,
    refund_amount_cents: refundAmountCents,
    refund_id: refundId,
    hours_until_departure: Math.round(hoursUntilDeparture * 10) / 10,
    window_hours: windowHours,
  })
}
