import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Stripe as StripeNS } from 'stripe'
import type { Database } from '@/lib/supabase/types'
import { stripe, STRIPE_WEBHOOK_SECRET } from '@/lib/stripe'

// Stripe webhook endpoint.
//
// Receives signed events from Stripe and reflects them into Supabase:
//   - customer.subscription.{created,updated,deleted} → updates the linked
//     member's subscription_status / trial / current period end.
//   - payment_intent.{succeeded,payment_failed} → updates the linked booking's
//     payment_status and writes a notification to the booking owner.
//
// Stripe needs the raw request body to verify signatures; the App Router gives
// us that via request.text().

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

function tsFromUnix(s: number | null | undefined) {
  return s ? new Date(s * 1000).toISOString() : null
}

export async function POST(req: NextRequest) {
  if (!STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'STRIPE_WEBHOOK_SECRET not configured' }, { status: 500 })
  }
  const sig = req.headers.get('stripe-signature')
  if (!sig) return NextResponse.json({ error: 'missing signature' }, { status: 400 })

  const raw = await req.text()
  let event: StripeNS.Event
  try {
    event = stripe.webhooks.constructEvent(raw, sig, STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    return NextResponse.json({ error: `signature verification failed: ${(err as Error).message}` }, { status: 400 })
  }

  const db = admin()

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as StripeNS.Subscription
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
        // Pull period end from the first item (Stripe v22 moved it off Subscription itself).
        const item = sub.items?.data?.[0]
        const periodEnd = (item as unknown as { current_period_end?: number } | undefined)?.current_period_end
        await db
          .from('members')
          .update({
            stripe_subscription_id: sub.id,
            subscription_status: sub.status,
            trial_ends_at: tsFromUnix(sub.trial_end),
            current_period_end: tsFromUnix(periodEnd),
          })
          .eq('stripe_customer_id', customerId)
        break
      }

      case 'payment_intent.succeeded':
      case 'payment_intent.payment_failed': {
        const pi = event.data.object as StripeNS.PaymentIntent
        const succeeded = event.type === 'payment_intent.succeeded'
        const bookingId = pi.metadata?.booking_id
        if (!bookingId) break // Subscription invoices etc. have no booking_id.

        await db
          .from('bookings')
          .update({
            payment_status: succeeded ? 'succeeded' : 'failed',
            paid_amount_cents: succeeded ? pi.amount_received : null,
            paid_at: succeeded ? new Date().toISOString() : null,
            stripe_payment_intent_id: pi.id,
          })
          .eq('id', bookingId)

        // Notify the member.
        const { data: booking } = await db
          .from('bookings')
          .select('member_id, item_kind')
          .eq('id', bookingId)
          .single()
        if (booking?.member_id) {
          await db.from('notifications').insert({
            member_id: booking.member_id,
            kind: 'system',
            title: succeeded ? 'Payment received' : 'Payment failed',
            body: succeeded
              ? `Your ${booking.item_kind} payment of $${((pi.amount_received ?? 0) / 100).toFixed(2)} was processed.`
              : `We couldn't process your ${booking.item_kind} payment. Please update your card.`,
            read: false,
          })
        }
        break
      }

      default:
        // Other event types are accepted but ignored.
        break
    }
  } catch (err) {
    return NextResponse.json({ error: `handler error: ${(err as Error).message}` }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
