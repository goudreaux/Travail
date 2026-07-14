import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { safeError } from '@/lib/pii-scrub'
import { canBookSeat } from '@/lib/trip-timing'
import type { Database } from '@/lib/supabase/types'

// Server-side, PaymentIntent-verified creation of a pax booking.
//
// Booking rows used to be inserted straight from the browser with the anon
// key. RLS only checked member_id, so a member could POST an "approved,
// paid" row with any paid_amount_cents / seats / price they liked — free
// seats, and (because settlement sums paid_amount_cents to rebate the
// anchor) a lever to extract real refund money. This route closes that: the
// member INSERT policy on bookings is now admin-only (migration 069), and the
// only way a member's booking gets created is here, after we retrieve the PI
// from Stripe and confirm it actually cleared for THIS member, item and seat
// count. The money is re-derived from the trip rows — the client is never
// trusted with it.
//
// The PI metadata (kind/member_id/item_id/seats/return_item_id) was stamped
// server-side at PI creation and cannot be altered by the client, so matching
// it is what binds the charge to the trip the member claims to be booking.

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
  itemId?: string
  kind?: 'flight' | 'excursion'
  seats?: number
  isRoundTrip?: boolean
  returnItemId?: string | null
  showOnRoster?: boolean
  guests?: GuestPax[]
}

interface Leg {
  itemId: string
  itemKind: 'flight' | 'excursion'
  priceDollars: number
  subtotalCents: number
  feeCents: number
  totalCents: number
  feeDollars: number
  subDollars: number
  name: string
  avail: number
  closed: boolean
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
  const itemId = (payload.itemId ?? '').trim()
  const kind = payload.kind
  const seats = Math.round(Number(payload.seats ?? 0))
  const isRoundTrip = !!payload.isRoundTrip
  const returnItemId = (payload.returnItemId ?? '').trim() || null
  const showOnRoster = payload.showOnRoster !== false
  const guests = Array.isArray(payload.guests) ? payload.guests : []

  if (!paymentIntentId || !itemId) return NextResponse.json({ error: 'paymentIntentId and itemId required' }, { status: 400 })
  if (kind !== 'flight' && kind !== 'excursion') return NextResponse.json({ error: 'kind must be flight or excursion' }, { status: 400 })
  if (!seats || seats < 1 || seats > 20) return NextResponse.json({ error: 'seats must be 1-20' }, { status: 400 })
  // Guest completeness is enforced client-side BEFORE payment (the Reserve
  // button gates on it). We deliberately do NOT hard-fail here on a
  // guest-count mismatch: the card has already cleared by the time finalize
  // runs, so rejecting would charge the member without creating a booking.
  // The manifest is best-effort; the seat count is what was paid for. Cap the
  // extra passengers at seats-1 so a tampered payload can't over-stuff it.
  const guestList = guests.slice(0, Math.max(0, seats - 1))

  // 1. Verify the charge with Stripe.
  let pi: Awaited<ReturnType<typeof stripe.paymentIntents.retrieve>>
  try {
    pi = await stripe.paymentIntents.retrieve(paymentIntentId)
  } catch (e) {
    safeError('bookings.finalize: PI retrieve failed:', e)
    return NextResponse.json({ error: 'Could not verify payment' }, { status: 502 })
  }
  if (pi.status !== 'succeeded') {
    return NextResponse.json({ error: `Payment not completed (status: ${pi.status}).` }, { status: 409 })
  }
  const m = pi.metadata ?? {}
  if (m.kind !== 'pax_reservation'
    || m.member_id !== meRow.id
    || m.item_id !== itemId
    || m.seats !== String(seats)
    || (m.return_item_id || '') !== (returnItemId || '')) {
    return NextResponse.json({ error: 'Payment does not match this reservation.' }, { status: 403 })
  }

  const db = admin()

  // 2. Idempotency — if this PI already produced a booking (a retried
  //    finalize after a network blip), return it instead of double-booking.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (db as any)
    .from('bookings').select('id, confirmation_code').eq('stripe_payment_intent_id', paymentIntentId)
  if (existing && existing.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const primary = existing.find((b: any) => !b.id.endsWith('R')) ?? existing[0]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ ok: true, alreadyBooked: true, bookingIds: existing.map((b: any) => b.id), primaryId: primary.id, confirmationCode: primary.confirmation_code ?? null })
  }

  // 3. Re-derive money + capacity from the trip rows (never trust the client).
  const legItemIds = isRoundTrip && returnItemId ? [itemId, returnItemId] : [itemId]
  const legs: Leg[] = []
  for (const id of legItemIds) {
    if (kind === 'flight') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: f } = await (db as any)
        .from('flights').select('id, name, price_per_seat, status, date, depart_time, seats_total, seats_anchor, seats_taken').eq('id', id).maybeSingle()
      if (!f || f.status === 'cancelled' || f.status === 'departed') {
        return NextResponse.json({ error: 'This flight is no longer available.' }, { status: 409 })
      }
      const priceDollars = f.price_per_seat ?? 0
      const subDollars = priceDollars * seats
      const feeDollars = Math.round(subDollars * SERVICE_FEE_RATE)
      const subtotalCents = Math.round(priceDollars * 100) * seats
      const feeCents = Math.round(subtotalCents * SERVICE_FEE_RATE)
      legs.push({
        itemId: id, itemKind: 'flight', priceDollars, subDollars, feeDollars,
        subtotalCents, feeCents, totalCents: subtotalCents + feeCents,
        name: f.name ?? 'Flight',
        avail: Math.max(0, f.seats_total - f.seats_anchor - (f.seats_taken ?? 0)),
        closed: !canBookSeat(f.date, f.depart_time).ok,
      })
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: e } = await (db as any)
        .from('excursions').select('id, name, price_per_pax, status, date, depart_time, start_time, spots_total, spots_anchor, spots_taken').eq('id', id).maybeSingle()
      if (!e || e.status === 'cancelled' || e.status === 'completed') {
        return NextResponse.json({ error: 'This excursion is no longer available.' }, { status: 409 })
      }
      const priceDollars = e.price_per_pax ?? 0
      const subDollars = priceDollars * seats
      const feeDollars = Math.round(subDollars * SERVICE_FEE_RATE)
      const subtotalCents = Math.round(priceDollars * 100) * seats
      const feeCents = Math.round(subtotalCents * SERVICE_FEE_RATE)
      legs.push({
        itemId: id, itemKind: 'excursion', priceDollars, subDollars, feeDollars,
        subtotalCents, feeCents, totalCents: subtotalCents + feeCents,
        name: e.name ?? 'Excursion',
        avail: Math.max(0, e.spots_total - e.spots_anchor - (e.spots_taken ?? 0)),
        closed: !canBookSeat(e.date, e.depart_time ?? e.start_time).ok,
      })
    }
  }

  // The charge cleared. If a leg has sold out or closed in the meantime we
  // must not keep the money without delivering the seat — refund and stop.
  const lostLeg = legs.find(l => l.closed || seats > l.avail)
  if (lostLeg) {
    try { await stripe.refunds.create({ payment_intent: paymentIntentId }) }
    catch (rerr) { safeError('bookings.finalize: auto-refund failed:', rerr) }
    return NextResponse.json({
      error: lostLeg.closed
        ? `Booking for "${lostLeg.name}" just closed — your card has been refunded.`
        : `Those ${kind === 'flight' ? 'seats' : 'spots'} were just taken — your card has been refunded.`,
    }, { status: 409 })
  }

  // 4. Insert booking row(s). Deterministic id derived from the PI so a
  //    racing retry collides on the primary key rather than double-booking.
  const base = `B-${paymentIntentId.replace(/^pi_/, '').slice(0, 14).toUpperCase()}`
  const paidAtIso = new Date().toISOString()
  const rows = legs.map((leg, idx) => ({
    id: idx === 0 ? base : `${base}R`,
    member_id: meRow.id,
    item_kind: leg.itemKind,
    item_id: leg.itemId,
    seats,
    price_per_seat: leg.priceDollars,
    fees: leg.feeDollars,
    total: leg.subDollars + leg.feeDollars,
    payment_method: 'card',
    status: 'approved',
    show_on_roster: showOnRoster,
    // PI on the outbound only (unique index on the column); the return leg
    // still records paid_amount_cents so settlement reads correctly.
    stripe_payment_intent_id: idx === 0 ? paymentIntentId : null,
    paid_amount_cents: leg.totalCents,
    paid_at: paidAtIso,
    payment_status: 'succeeded',
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error: insErr } = await (db as any)
    .from('bookings').insert(rows).select('id, confirmation_code')
  if (insErr) {
    // A duplicate-key error means a concurrent finalize already created it —
    // treat as success (idempotent). Anything else: refund + surface.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((insErr as any).code === '23505') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: dupe } = await (db as any).from('bookings').select('id, confirmation_code').eq('stripe_payment_intent_id', paymentIntentId)
      if (dupe && dupe.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const primary = dupe.find((b: any) => !b.id.endsWith('R')) ?? dupe[0]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return NextResponse.json({ ok: true, alreadyBooked: true, bookingIds: dupe.map((b: any) => b.id), primaryId: primary.id, confirmationCode: primary.confirmation_code ?? null })
      }
    }
    safeError('bookings.finalize: booking insert failed:', insErr)
    try { await stripe.refunds.create({ payment_intent: paymentIntentId }) }
    catch (rerr) { safeError('bookings.finalize: auto-refund after insert failure:', rerr) }
    return NextResponse.json({ error: 'We couldn’t confirm your booking — your card has been refunded. Please try again.' }, { status: 500 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bookingIds: string[] = (inserted as any[]).map(r => r.id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const primaryRow = (inserted as any[]).find(r => !r.id.endsWith('R')) ?? inserted[0]

  // 5. Passenger manifest — the member is seat 1 on every leg.
  const [hostFirst, ...hostRest] = meRow.name.trim().split(/\s+/)
  const paxRows = bookingIds.flatMap(bid => [
    { booking_id: bid, guest_id: null, is_host: true, first_name: hostFirst ?? meRow.name, last_name: hostRest.join(' '), email: null, phone: null, date_of_birth: null },
    ...guestList.map(g => ({
      booking_id: bid,
      guest_id: g.guest_id ?? null,
      is_host: false,
      first_name: (g.first_name ?? '').trim() || 'Guest',
      last_name: (g.last_name ?? '').trim() || '',
      email: g.email ?? null,
      phone: g.phone ?? null,
      date_of_birth: g.date_of_birth ?? null,
    })),
  ])
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: paxErr } = await (db as any).from('booking_passengers').insert(paxRows)
    if (paxErr) throw paxErr
  } catch (paxErr) {
    safeError('bookings.finalize: manifest insert failed (non-fatal):', paxErr)
  }

  // 6. In-app confirmation for the member. (Ops receipt + card_last4 persist
  //    are handled by the pax_reservation webhook; the branded email is sent
  //    by the client via /api/bookings/send-receipt.)
  const chargedCents = typeof pi.amount === 'number' ? pi.amount : legs.reduce((s, l) => s + l.totalCents, 0)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('notifications').insert({
      member_id: meRow.id,
      kind: 'booking',
      title: isRoundTrip ? 'Round-trip booking confirmed' : 'Booking confirmed',
      body: `Your reservation for "${legs[0].name}"${seats > 1 ? ` (${seats} seats)` : ''} is confirmed and your card has been charged $${(chargedCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
      ref: { kind, id: itemId, booking_id: primaryRow.id, skip_email: true },
      read: false,
    })
  } catch (e) {
    safeError('bookings.finalize: member notification failed (non-fatal):', e)
  }

  return NextResponse.json({
    ok: true,
    bookingIds,
    primaryId: primaryRow.id,
    confirmationCode: primaryRow.confirmation_code ?? null,
  })
}
