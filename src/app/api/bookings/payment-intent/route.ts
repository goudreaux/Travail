import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { safeError } from '@/lib/pii-scrub'
import { assertCanBook } from '@/lib/can-book'
import { assertTransactionsAllowed } from '@/lib/maintenance'
import { canBookSeat } from '@/lib/trip-timing'
import type { Database } from '@/lib/supabase/types'

// Create a PaymentIntent for a pax seat reservation.
//
// Pax pay flat per-seat at reserve time (immediate capture, on-session).
// The booking row is inserted client-side AFTER stripe.confirmPayment
// resolves, with the PaymentIntent id + paid amount stamped onto it.
//
// Why a server route (not just inserting + charging on the client):
// the client cannot be trusted with the price. We re-derive the total
// from the trip row server-side so a tampered client can't underpay.
//
// Returns: { clientSecret, paymentIntentId, totalCents, breakdown }
//   • totalCents — what the card will be charged (matches the
//     confirmation sheet's "Total").
//   • breakdown.legs — for round-trips, the per-leg subtotal so the
//     client can stamp paid_amount_cents on each booking row
//     proportionally.

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

// Same DB-then-Stripe-metadata pattern the anchor routes use. The pax
// flow doesn't need a saved card (on-session confirm picks the card up
// from the PaymentElement), but we still attach the PI to a Customer
// so we have a clean ledger per member and so future off-session
// charges (e.g. add-ons) work without re-entering card details.
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
    safeError('bookings.payment-intent.resolveStripeCustomer: list failed:', e)
    return null
  }
}

async function ensureStripeCustomer(memberId: string, name: string, email: string | null): Promise<string> {
  const existing = await resolveStripeCustomer(memberId, email)
  if (existing) {
    const db = admin()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.from('members') as any)
      .update({ stripe_customer_id: existing })
      .eq('id', memberId)
      .is('stripe_customer_id', null)
    return existing
  }

  const created = await stripe.customers.create({
    name,
    email: email ?? undefined,
    metadata: { member_id: memberId },
  })

  const db = admin()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.from('members') as any)
    .update({ stripe_customer_id: created.id })
    .eq('id', memberId)
  return created.id
}

interface PIPayload {
  itemId?: string
  kind?: 'flight' | 'excursion'
  seats?: number
  isRoundTrip?: boolean
  returnItemId?: string | null
}

interface LegBreakdown {
  itemId: string
  itemKind: 'flight' | 'excursion'
  pricePerSeatCents: number
  subtotalCents: number
  feeCents: number
  totalCents: number
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { data: meRow } = await supabase
    .from('members').select('id, name').eq('user_id', user.id).maybeSingle()
  if (!meRow) return NextResponse.json({ error: 'Member record not found' }, { status: 403 })

  // Membership gate — past_due / cancelled members keep app access but
  // can't create new billable obligations until ops resolves the card.
  // 402 → client renders <PaywallCard /> with portal link.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const guard = await assertCanBook(admin() as any, meRow.id)
  if (!guard.ok) {
    return NextResponse.json(
      { error: 'Membership required', reason: guard.reason, status: guard.status },
      { status: 402 },
    )
  }

  // Maintenance kill switch — freeze all new charges.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maint = await assertTransactionsAllowed(admin() as any)
  if (!maint.ok) return NextResponse.json({ error: maint.message }, { status: 503 })

  let payload: PIPayload
  try { payload = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid payload' }, { status: 400 }) }

  const itemId = (payload.itemId ?? '').trim()
  const kind = payload.kind
  const seats = Number(payload.seats ?? 0)
  const isRoundTrip = !!payload.isRoundTrip
  const returnItemId = (payload.returnItemId ?? '').trim() || null

  if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 })
  if (kind !== 'flight' && kind !== 'excursion') {
    return NextResponse.json({ error: 'kind must be flight or excursion' }, { status: 400 })
  }
  if (!seats || seats <= 0 || seats > 20) {
    return NextResponse.json({ error: 'seats must be 1-20' }, { status: 400 })
  }
  if (isRoundTrip && (!returnItemId || kind !== 'flight')) {
    return NextResponse.json({ error: 'round-trip requires returnItemId and flight kind' }, { status: 400 })
  }

  const db = admin()

  // Load trip(s) server-side so the client can't underpay. Excursions
  // use price_per_pax; flights use price_per_seat. We also pull
  // date + departure time so the booking cutoff is enforced here — the
  // money path is the authoritative gate, not just the board's UI.
  type Leg = { priceCents: number; name: string; closed: boolean }
  async function loadLeg(id: string): Promise<Leg | null> {
    if (kind === 'flight') {
      const { data } = await db
        .from('flights').select('id, price_per_seat, name, status, date, depart_time').eq('id', id).maybeSingle()
      if (!data || data.status === 'cancelled' || data.status === 'departed') return null
      return {
        priceCents: Math.round((data.price_per_seat ?? 0) * 100),
        name: data.name ?? 'Flight',
        closed: !canBookSeat(data.date, data.depart_time).ok,
      }
    }
    const { data } = await db
      .from('excursions').select('id, price_per_pax, name, status, date, depart_time, start_time').eq('id', id).maybeSingle()
    if (!data || data.status === 'cancelled' || data.status === 'completed') return null
    return {
      priceCents: Math.round((data.price_per_pax ?? 0) * 100),
      name: data.name ?? 'Excursion',
      closed: !canBookSeat(data.date, data.depart_time ?? data.start_time).ok,
    }
  }

  const outbound = await loadLeg(itemId)
  if (!outbound) return NextResponse.json({ error: 'Trip not available' }, { status: 404 })
  const ret = isRoundTrip && returnItemId ? await loadLeg(returnItemId) : null
  if (isRoundTrip && !ret) return NextResponse.json({ error: 'Return leg not available' }, { status: 404 })

  // Booking cutoff — once a leg is inside the window before takeoff it's
  // locked. 409 so the client can surface "this departure just closed."
  const closedLeg = outbound.closed ? outbound : (ret?.closed ? ret : null)
  if (closedLeg) {
    return NextResponse.json({
      error: `Booking for "${closedLeg.name}" has closed — it departs too soon to add seats.`,
    }, { status: 409 })
  }

  const breakdown: LegBreakdown[] = []
  const addLeg = (id: string, legPriceCents: number) => {
    const subtotalCents = legPriceCents * seats
    const feeCents = Math.round(subtotalCents * SERVICE_FEE_RATE)
    breakdown.push({
      itemId: id,
      itemKind: kind as 'flight' | 'excursion',
      pricePerSeatCents: legPriceCents,
      subtotalCents,
      feeCents,
      totalCents: subtotalCents + feeCents,
    })
  }
  addLeg(itemId, outbound.priceCents)
  if (ret && returnItemId) addLeg(returnItemId, ret.priceCents)

  const totalCents = breakdown.reduce((s, b) => s + b.totalCents, 0)
  if (totalCents <= 0) {
    return NextResponse.json({ error: 'Trip has no price set; cannot create payment' }, { status: 409 })
  }

  // Resolve / create Stripe customer for this member.
  let customerId: string
  try {
    customerId = await ensureStripeCustomer(meRow.id, meRow.name, user.email ?? null)
  } catch (e) {
    safeError('bookings.payment-intent: ensureStripeCustomer failed:', e)
    return NextResponse.json({ error: 'Could not initialize payment' }, { status: 502 })
  }

  // Create the PaymentIntent. automatic_payment_methods so the
  // PaymentElement can offer card + Link (and Apple/Google Pay if
  // configured). On-session confirm — the member is at the form.
  try {
    const description = isRoundTrip
      ? `Travail · ${outbound.name} ↔ ${ret?.name ?? 'return'} · ${seats} seat${seats === 1 ? '' : 's'}`
      : `Travail · ${outbound.name} · ${seats} seat${seats === 1 ? '' : 's'}`

    const pi = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: 'usd',
      customer: customerId,
      automatic_payment_methods: { enabled: true },
      description,
      metadata: {
        kind: 'pax_reservation',
        member_id: meRow.id,
        item_kind: kind as string,
        item_id: itemId,
        return_item_id: returnItemId ?? '',
        seats: String(seats),
        is_round_trip: isRoundTrip ? '1' : '0',
      },
    })

    return NextResponse.json({
      clientSecret: pi.client_secret,
      paymentIntentId: pi.id,
      customerId,
      totalCents,
      breakdown,
    })
  } catch (e) {
    safeError('bookings.payment-intent: PI create failed:', e)
    return NextResponse.json({ error: 'Could not start payment' }, { status: 502 })
  }
}
