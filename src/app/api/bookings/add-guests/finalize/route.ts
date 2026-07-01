import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { safeError } from '@/lib/pii-scrub'
import { notifyOps } from '@/lib/ops-notify'
import type { Database } from '@/lib/supabase/types'

// Finalize the "add a guest to your ticket" flow. Called AFTER the
// member's card is confirmed for the incremental charge. We:
//   1. Verify the PaymentIntent succeeded and belongs to this member +
//      booking (so a replayed/forged call can't extend a ticket for free).
//   2. Re-check live availability per leg (race safety between PI create
//      and confirm).
//   3. Bump seats + fees + total + paid_amount on the existing booking
//      row(s) — round-trips extend both legs.
//   4. Append the guests to the manifest (booking_passengers) on every leg.
//   5. Notify the member + the Concierge ledger.
//
// Idempotency: if the PI was already finalized (its id is stamped on a
// manifest note), we no-op rather than double-charging the manifest.

export const runtime = 'nodejs'

const SERVICE_FEE_RATE = 0.03

function admin() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured')
  return createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

interface GuestPax {
  guest_id?: string | null
  first_name?: string
  last_name?: string
  email?: string | null
  phone?: string | null
  date_of_birth?: string | null
}

interface Payload {
  paymentIntentId?: string
  bookingId?: string
  guests?: GuestPax[]
}

type BookingRow = {
  id: string
  member_id: string
  item_kind: 'flight' | 'excursion'
  item_id: string
  seats: number
  price_per_seat: number | null
  fees: number | null
  total: number | null
  paid_amount_cents: number | null
  status: string
  add_guests_pis: string[] | null
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { data: meRow } = await supabase
    .from('members').select('id, name').eq('user_id', user.id).maybeSingle()
  if (!meRow) return NextResponse.json({ error: 'Member record not found' }, { status: 403 })

  let payload: Payload
  try { payload = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid payload' }, { status: 400 }) }

  const paymentIntentId = (payload.paymentIntentId ?? '').trim()
  const bookingId = (payload.bookingId ?? '').trim()
  const guests = Array.isArray(payload.guests) ? payload.guests : []
  if (!paymentIntentId || !bookingId) {
    return NextResponse.json({ error: 'paymentIntentId and bookingId required' }, { status: 400 })
  }
  if (guests.length === 0) {
    return NextResponse.json({ error: 'No guests to add' }, { status: 400 })
  }

  // 1. Verify the charge with Stripe — never trust the client that it paid.
  let pi: Awaited<ReturnType<typeof stripe.paymentIntents.retrieve>>
  try {
    pi = await stripe.paymentIntents.retrieve(paymentIntentId)
  } catch (e) {
    safeError('add-guests.finalize: PI retrieve failed:', e)
    return NextResponse.json({ error: 'Could not verify payment' }, { status: 502 })
  }
  if (pi.status !== 'succeeded') {
    return NextResponse.json({ error: `Payment not completed (status: ${pi.status}).` }, { status: 409 })
  }
  if (pi.metadata?.kind !== 'pax_add_guests'
    || pi.metadata?.member_id !== meRow.id
    || pi.metadata?.booking_id !== bookingId) {
    return NextResponse.json({ error: 'Payment does not match this request.' }, { status: 403 })
  }
  const addSeats = Math.round(Number(pi.metadata?.add_seats ?? 0))
  if (!addSeats || addSeats !== guests.length) {
    return NextResponse.json({ error: 'Guest count does not match the payment.' }, { status: 409 })
  }

  const db = admin()

  // Load the leg(s). Round-trip return is `${bookingId}R`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: legRows } = await (db as any)
    .from('bookings')
    .select('id, member_id, item_kind, item_id, seats, price_per_seat, fees, total, paid_amount_cents, status, add_guests_pis')
    .in('id', [bookingId, `${bookingId}R`])
    .eq('member_id', meRow.id)
  const legs = ((legRows ?? []) as BookingRow[])
    .filter(b => b.status === 'pending' || b.status === 'approved')
  const primary = legs.find(b => b.id === bookingId)
  if (!primary) return NextResponse.json({ error: 'Booking not found, or not yours.' }, { status: 404 })

  // Idempotency — if this PI already extended the ticket, return success
  // without re-applying (covers a retried finalize after a network blip).
  if ((primary.add_guests_pis ?? []).includes(paymentIntentId)) {
    return NextResponse.json({ ok: true, alreadyApplied: true, seats: primary.seats })
  }

  // The charge already cleared. If we can't deliver the seats (capacity
  // lost to a race, trip pulled, DB rejection), we must not keep the money:
  // auto-refund the PI and flag ops, rather than silently returning ok.
  // Capture the non-null locals the guards above already established, so the
  // helper doesn't depend on TS re-narrowing them across the closure.
  const opsMember = { name: meRow.name, email: user.email ?? null }
  const opsItem = { kind: primary.item_kind, id: primary.item_id }
  const piAmountCents = typeof pi.amount === 'number' ? pi.amount : null
  const piCustomerId = pi.customer as string | null
  async function refundAndReport(reason: string, appliedAny: boolean): Promise<void> {
    if (!appliedAny) {
      try { await stripe.refunds.create({ payment_intent: paymentIntentId }) }
      catch (rerr) { safeError('add-guests.finalize: auto-refund failed:', rerr) }
    }
    try {
      await notifyOps({
        kind: appliedAny ? 'pax_booking' : 'pax_cancel_refund',
        member: opsMember,
        item: opsItem,
        amountCents: piAmountCents,
        stripe: { paymentIntentId, customerId: piCustomerId },
        note: appliedAny
          ? `PARTIAL add-guests on booking ${bookingId}: ${reason}. One leg extended, the other did not — needs manual reconciliation (no auto-refund issued).`
          : `Add-guests on booking ${bookingId} could not be applied (${reason}) — auto-refunded, booking unchanged.`,
      })
    } catch (e) { safeError('add-guests.finalize: refund/report notifyOps failed:', e) }
  }

  // 2. Re-check availability per leg. Capture the live per-seat price too, so
  //    the recorded amount uses the SAME fallback the PI route charged with
  //    (a booking row with null price_per_seat was charged at the trip price,
  //    and must record that — not $0).
  const tripNames: string[] = []
  const priceByLeg: Record<string, number> = {}
  for (const leg of legs) {
    if (leg.item_kind === 'flight') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: f } = await (db as any)
        .from('flights').select('name, seats_total, seats_anchor, seats_taken, price_per_seat, status').eq('id', leg.item_id).maybeSingle()
      if (!f || f.status === 'cancelled' || f.status === 'departed') {
        await refundAndReport('flight no longer available', false)
        return NextResponse.json({ error: 'That flight is no longer available — your card has been refunded.' }, { status: 409 })
      }
      const avail = Math.max(0, f.seats_total - f.seats_anchor - (f.seats_taken ?? 0))
      if (addSeats > avail) {
        await refundAndReport('seats sold out during checkout', false)
        return NextResponse.json({ error: 'Those seats were just taken — your card has been refunded.' }, { status: 409 })
      }
      priceByLeg[leg.id] = leg.price_per_seat ?? f.price_per_seat ?? 0
      if (f.name) tripNames.push(f.name)
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: e } = await (db as any)
        .from('excursions').select('name, spots_total, spots_anchor, spots_taken, price_per_pax, status').eq('id', leg.item_id).maybeSingle()
      if (!e || e.status === 'cancelled' || e.status === 'completed') {
        await refundAndReport('excursion no longer available', false)
        return NextResponse.json({ error: 'That excursion is no longer available — your card has been refunded.' }, { status: 409 })
      }
      const avail = Math.max(0, e.spots_total - e.spots_anchor - (e.spots_taken ?? 0))
      if (addSeats > avail) {
        await refundAndReport('spots sold out during checkout', false)
        return NextResponse.json({ error: 'Those spots were just taken — your card has been refunded.' }, { status: 409 })
      }
      priceByLeg[leg.id] = leg.price_per_seat ?? e.price_per_pax ?? 0
      if (e.name) tripNames.push(e.name)
    }
  }

  // Build the guest manifest rows (one set per leg).
  const paxFor = (bid: string) => guests.map(g => ({
    booking_id: bid,
    guest_id: g.guest_id ?? null,
    is_host: false,
    first_name: (g.first_name ?? '').trim() || 'Guest',
    last_name: (g.last_name ?? '').trim() || '',
    email: g.email ?? null,
    phone: g.phone ?? null,
    date_of_birth: g.date_of_birth ?? null,
  }))

  // 3. Extend each leg: seats, fees, total (dollars) + paid_amount (cents).
  //    The UPDATE is conditional on the PI not already being recorded, so a
  //    concurrent double-submit can't double-count the seats or re-charge the
  //    manifest — only the row that actually flips (rows-affected > 0) inserts
  //    passengers.
  let appliedAny = false
  for (const leg of legs) {
    const pricePerSeat = priceByLeg[leg.id] ?? 0
    const subDollars = pricePerSeat * addSeats
    const feeDollars = Math.round(subDollars * SERVICE_FEE_RATE)
    // Mirror the PI route's cents formula exactly so paid_amount_cents
    // matches what Stripe charged for this leg, with no sub-cent drift.
    const subtotalCents = Math.round(pricePerSeat * 100) * addSeats
    const legChargeCents = subtotalCents + Math.round(subtotalCents * SERVICE_FEE_RATE)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updated, error: updErr } = await (db as any).from('bookings').update({
      seats: leg.seats + addSeats,
      fees: (leg.fees ?? 0) + feeDollars,
      total: (leg.total ?? 0) + subDollars + feeDollars,
      paid_amount_cents: (leg.paid_amount_cents ?? 0) + legChargeCents,
      add_guests_pis: [...(leg.add_guests_pis ?? []), paymentIntentId],
    }).eq('id', leg.id).not('add_guests_pis', 'cs', `{${paymentIntentId}}`).select('id')

    if (updErr) {
      // Capacity trigger rejected, or the write failed. Refund if nothing has
      // been applied yet; otherwise flag ops for manual reconciliation.
      safeError('add-guests.finalize: seat extension failed:', updErr)
      await refundAndReport('seat extension rejected by the database', appliedAny)
      return NextResponse.json({
        error: appliedAny
          ? 'We could only extend part of your round-trip. The Concierge has been notified and will sort it out.'
          : 'We couldn’t add your guest — your card has been refunded.',
      }, { status: 409 })
    }
    // Zero rows flipped → a concurrent finalize already applied this PI to
    // this leg. Skip the manifest insert so we don't duplicate passengers.
    if (!updated || updated.length === 0) continue
    appliedAny = true

    // 4. Append the guests to this leg's manifest. Best-effort — the seat
    //    extension is the source of truth; a manifest hiccup shouldn't 500.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: paxErr } = await (db as any).from('booking_passengers').insert(paxFor(leg.id))
      if (paxErr) throw paxErr
    } catch (paxErr) {
      safeError('add-guests.finalize: manifest insert failed (non-fatal):', paxErr)
    }
  }

  const tripLabel = [...new Set(tripNames)].join(' ↔ ') || 'your trip'
  const chargedCents = typeof pi.amount === 'number' ? pi.amount : 0

  // 5a. In-app receipt for the member. skip_email so we don't double up if
  //     the notify-email Edge Function is wired for booking kinds.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('notifications').insert({
      member_id: meRow.id,
      kind: 'booking',
      title: 'Guest added to your ticket',
      body: `${addSeats} guest${addSeats === 1 ? '' : 's'} added to your booking for "${tripLabel}". Your card was charged $${(chargedCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
      ref: { kind: primary.item_kind, id: primary.item_id, booking_id: bookingId, skip_email: true },
      read: false,
    })
  } catch (e) {
    safeError('add-guests.finalize: member notification failed (non-fatal):', e)
  }

  // 5b. Concierge ledger.
  try {
    await notifyOps({
      kind: 'pax_booking',
      member: { name: meRow.name, email: user.email ?? null },
      item: { kind: primary.item_kind, id: primary.item_id, name: tripLabel },
      amountCents: chargedCents,
      stripe: { paymentIntentId, customerId: pi.customer as string | null },
      note: `Self-serve: member added ${addSeats} guest${addSeats === 1 ? '' : 's'} to existing booking ${bookingId}${legs.length > 1 ? ' (round-trip — both legs extended)' : ''}.`,
      details: {
        'Guests added': addSeats,
        'New seat count': primary.seats + addSeats,
        Legs: legs.length,
      },
    })
  } catch (e) {
    safeError('add-guests.finalize: notifyOps failed (non-fatal):', e)
  }

  return NextResponse.json({ ok: true, seats: primary.seats + addSeats, chargedCents })
}
