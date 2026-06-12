import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { safeError } from '@/lib/pii-scrub'
import { assertCanBook } from '@/lib/can-book'
import { assertTransactionsAllowed } from '@/lib/maintenance'
import { canBookSeat } from '@/lib/trip-timing'
import type { Database } from '@/lib/supabase/types'

// Create a PaymentIntent to add guest seat(s) to a booking the member
// ALREADY holds — the self-serve "bring a guest on your own ticket" flow.
//
// Unlike the first-booking route, we don't mint a new booking: the
// finalize step bumps seats + paid_amount on the existing row(s) and
// appends the guests to the manifest. For round-trips, the member holds
// two booking rows (outbound `B-xxxx` + return `B-xxxxR`); we charge for
// — and later extend — both legs.
//
// Price: we charge the member's own locked per-seat price (booking row),
// so every seat on the ticket costs the same, plus the 3% service fee.
// Re-derived server-side so a tampered client can't underpay.

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
    safeError('add-guests.pi.resolveStripeCustomer: list failed:', e)
    return null
  }
}

async function ensureStripeCustomer(memberId: string, name: string, email: string | null): Promise<string> {
  const existing = await resolveStripeCustomer(memberId, email)
  if (existing) return existing
  const created = await stripe.customers.create({
    name, email: email ?? undefined, metadata: { member_id: memberId },
  })
  const db = admin()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.from('members') as any).update({ stripe_customer_id: created.id }).eq('id', memberId)
  return created.id
}

interface Payload {
  bookingId?: string
  addSeats?: number
}

interface LegCharge {
  bookingId: string
  itemId: string
  itemKind: 'flight' | 'excursion'
  pricePerSeatCents: number
  subtotalCents: number
  feeCents: number
  totalCents: number
}

type BookingRow = {
  id: string
  member_id: string
  item_kind: 'flight' | 'excursion'
  item_id: string
  seats: number
  price_per_seat: number | null
  status: string
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { data: meRow } = await supabase
    .from('members').select('id, name').eq('user_id', user.id).maybeSingle()
  if (!meRow) return NextResponse.json({ error: 'Member record not found' }, { status: 403 })

  const db = admin()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const guard = await assertCanBook(db as any, meRow.id)
  if (!guard.ok) {
    return NextResponse.json(
      { error: 'Membership required', reason: guard.reason, status: guard.status },
      { status: 402 },
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maint = await assertTransactionsAllowed(db as any)
  if (!maint.ok) return NextResponse.json({ error: maint.message }, { status: 503 })

  let payload: Payload
  try { payload = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid payload' }, { status: 400 }) }

  const bookingId = (payload.bookingId ?? '').trim()
  const addSeats = Math.round(Number(payload.addSeats ?? 0))
  if (!bookingId) return NextResponse.json({ error: 'bookingId required' }, { status: 400 })
  if (!addSeats || addSeats < 1 || addSeats > 10) {
    return NextResponse.json({ error: 'addSeats must be 1-10' }, { status: 400 })
  }

  // Load the member's leg(s) for this ticket. Round-trips store the return
  // as `${outbound}R`; pull both so we extend the whole journey at once.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: legRows } = await (db as any)
    .from('bookings')
    .select('id, member_id, item_kind, item_id, seats, price_per_seat, status')
    .in('id', [bookingId, `${bookingId}R`])
    .eq('member_id', meRow.id)
  const legs = ((legRows ?? []) as BookingRow[])
    .filter(b => b.status === 'pending' || b.status === 'approved')
  const primary = legs.find(b => b.id === bookingId)
  if (!primary) {
    return NextResponse.json({ error: 'Booking not found, or not yours.' }, { status: 404 })
  }

  // For each leg, re-derive live availability + the booking cutoff from the
  // trip row, and confirm the locked per-seat price is sane.
  const charges: LegCharge[] = []
  for (const leg of legs) {
    if (leg.item_kind === 'flight') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: f } = await (db as any)
        .from('flights')
        .select('id, name, seats_total, seats_anchor, seats_taken, price_per_seat, status, date, depart_time')
        .eq('id', leg.item_id).maybeSingle()
      if (!f || f.status === 'cancelled' || f.status === 'departed') {
        return NextResponse.json({ error: 'This flight is no longer available.' }, { status: 409 })
      }
      if (!canBookSeat(f.date, f.depart_time).ok) {
        return NextResponse.json({ error: `"${f.name ?? 'This flight'}" departs too soon to add seats.` }, { status: 409 })
      }
      const avail = Math.max(0, f.seats_total - f.seats_anchor - (f.seats_taken ?? 0))
      if (addSeats > avail) {
        return NextResponse.json({
          error: avail === 0 ? 'No seats left on this flight.' : `Only ${avail} seat${avail === 1 ? '' : 's'} left on this flight.`,
        }, { status: 409 })
      }
      const priceCents = Math.round((leg.price_per_seat ?? f.price_per_seat ?? 0) * 100)
      const subtotalCents = priceCents * addSeats
      const feeCents = Math.round(subtotalCents * SERVICE_FEE_RATE)
      charges.push({ bookingId: leg.id, itemId: leg.item_id, itemKind: 'flight', pricePerSeatCents: priceCents, subtotalCents, feeCents, totalCents: subtotalCents + feeCents })
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: e } = await (db as any)
        .from('excursions')
        .select('id, name, spots_total, spots_anchor, spots_taken, price_per_pax, status, date, depart_time, start_time')
        .eq('id', leg.item_id).maybeSingle()
      if (!e || e.status === 'cancelled' || e.status === 'completed') {
        return NextResponse.json({ error: 'This excursion is no longer available.' }, { status: 409 })
      }
      if (!canBookSeat(e.date, e.depart_time ?? e.start_time).ok) {
        return NextResponse.json({ error: `"${e.name ?? 'This excursion'}" departs too soon to add spots.` }, { status: 409 })
      }
      const avail = Math.max(0, e.spots_total - e.spots_anchor - (e.spots_taken ?? 0))
      if (addSeats > avail) {
        return NextResponse.json({
          error: avail === 0 ? 'No spots left on this excursion.' : `Only ${avail} spot${avail === 1 ? '' : 's'} left on this excursion.`,
        }, { status: 409 })
      }
      const priceCents = Math.round((leg.price_per_seat ?? e.price_per_pax ?? 0) * 100)
      const subtotalCents = priceCents * addSeats
      const feeCents = Math.round(subtotalCents * SERVICE_FEE_RATE)
      charges.push({ bookingId: leg.id, itemId: leg.item_id, itemKind: 'excursion', pricePerSeatCents: priceCents, subtotalCents, feeCents, totalCents: subtotalCents + feeCents })
    }
  }

  const totalCents = charges.reduce((s, c) => s + c.totalCents, 0)
  if (totalCents <= 0) {
    return NextResponse.json({ error: 'This ticket has no per-seat price set; ask the Concierge to add your guest.' }, { status: 409 })
  }

  let customerId: string
  try {
    customerId = await ensureStripeCustomer(meRow.id, meRow.name, user.email ?? null)
  } catch (e) {
    safeError('add-guests.pi: ensureStripeCustomer failed:', e)
    return NextResponse.json({ error: 'Could not initialize payment' }, { status: 502 })
  }

  // Preset the saved card so the member can pay one-tap (no re-enter).
  let savedCard: { id: string; brand: string | null; last4: string | null } | null = null
  try {
    const cust = await stripe.customers.retrieve(customerId)
    const defaultPm = !('deleted' in cust && cust.deleted)
      ? (cust.invoice_settings?.default_payment_method as string | { id: string } | null | undefined)
      : null
    let pmId = typeof defaultPm === 'string' ? defaultPm : defaultPm?.id ?? null
    if (!pmId) {
      const cards = await stripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 1 })
      pmId = cards.data[0]?.id ?? null
    }
    if (pmId) {
      const pm = await stripe.paymentMethods.retrieve(pmId)
      savedCard = { id: pm.id, brand: pm.card?.brand ?? null, last4: pm.card?.last4 ?? null }
    }
  } catch (e) {
    safeError('add-guests.pi: saved-card lookup failed (non-fatal):', e)
  }

  try {
    const isRoundTrip = charges.length > 1
    const pi = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: 'usd',
      customer: customerId,
      automatic_payment_methods: { enabled: true },
      setup_future_usage: 'on_session',
      ...(savedCard ? { payment_method: savedCard.id } : {}),
      description: `Travail · +${addSeats} guest${addSeats === 1 ? '' : 's'} on booking ${bookingId}${isRoundTrip ? ' (round-trip)' : ''}`,
      metadata: {
        kind: 'pax_add_guests',
        member_id: meRow.id,
        booking_id: bookingId,
        add_seats: String(addSeats),
        is_round_trip: isRoundTrip ? '1' : '0',
      },
    })

    return NextResponse.json({
      clientSecret: pi.client_secret,
      paymentIntentId: pi.id,
      customerId,
      totalCents,
      charges,
      savedCard,
    })
  } catch (e) {
    safeError('add-guests.pi: PI create failed:', e)
    return NextResponse.json({ error: 'Could not start payment' }, { status: 502 })
  }
}
