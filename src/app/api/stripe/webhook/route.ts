import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Stripe as StripeNS } from 'stripe'
import type { Database } from '@/lib/supabase/types'
import { stripe, STRIPE_WEBHOOK_SECRET } from '@/lib/stripe'
import { notifyOps } from '@/lib/ops-notify'
import { safeError } from '@/lib/pii-scrub'

// Stripe webhook endpoint — the safety net.
//
// Reflects Stripe events into Supabase AND emails the ops inbox for
// record-keeping so nothing falls through the cracks. Even if an app
// code path forgets to call notifyOps inline, the matching Stripe
// event will land here and ops will see it.
//
// Handlers:
//   customer.subscription.{created,updated,deleted}
//     - update members.subscription_status / trial / period end
//   payment_intent.succeeded
//     - update bookings (legacy invoice flow with booking_id in metadata)
//     - notify ops by kind:
//         metadata.kind === 'anchor_capture'     → anchor charter captured
//         metadata.kind === 'pax_reservation'    → pax seat charged
//   payment_intent.payment_failed
//     - update bookings if applicable
//     - notify ops: payment failed
//   charge.refunded
//     - notify ops: refund issued (pax cancellation, settlement, etc.)
//   charge.dispute.created
//     - notify ops: chargeback opened (urgent)
//
// Stripe needs the raw request body to verify signatures; the App Router
// gives us that via request.text().

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

async function lookupMember(memberId: string | null | undefined) {
  if (!memberId) return null
  const db = admin()
  const { data: m } = await db
    .from('members').select('name, member_no').eq('id', memberId).maybeSingle()
  if (!m) return null
  // member_sensitive holds the email — best-effort.
  const { data: contact } = await db
    .from('member_sensitive').select('email').eq('member_id', memberId).maybeSingle()
  return {
    name: m.name ?? null,
    memberCode: m.member_no ? `#${m.member_no}` : null,
    email: contact?.email ?? null,
  }
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

      case 'payment_intent.succeeded': {
        const pi = event.data.object as StripeNS.PaymentIntent
        const meta = pi.metadata ?? {}
        const bookingId = meta.booking_id

        // Legacy invoice flow: update the linked booking row if the PI
        // metadata still includes booking_id.
        if (bookingId) {
          await db
            .from('bookings')
            .update({
              payment_status: 'succeeded',
              paid_amount_cents: pi.amount_received ?? pi.amount,
              paid_at: new Date().toISOString(),
              stripe_payment_intent_id: pi.id,
            })
            .eq('id', bookingId)

          const { data: booking } = await db
            .from('bookings').select('member_id, item_kind').eq('id', bookingId).single()
          if (booking?.member_id) {
            await db.from('notifications').insert({
              member_id: booking.member_id,
              kind: 'system',
              title: 'Payment received',
              body: `Your ${booking.item_kind} payment of $${((pi.amount_received ?? pi.amount) / 100).toFixed(2)} was processed.`,
              read: false,
            })
          }
        }

        // Ops notification — dispatch by metadata.kind. Even if no booking
        // row is linked, ops still wants the receipt.
        const kind = meta.kind
        if (kind === 'anchor_capture') {
          const member = await lookupMember(meta.anchor_member_id)
          await notifyOps({
            kind: 'anchor_capture',
            member: member ?? undefined,
            amountCents: pi.amount_received ?? pi.amount,
            item: { kind: undefined, id: meta.anchor_submission_id ?? null },
            stripe: { paymentIntentId: pi.id, customerId: typeof pi.customer === 'string' ? pi.customer : pi.customer?.id ?? null },
            details: {
              'Price/seat': meta.price_per_seat_cents ? `$${(Number(meta.price_per_seat_cents) / 100).toFixed(2)}` : undefined,
              'Seats total': meta.seats_total,
            },
            note: 'Anchor charged for the full charter cost at publish. Anchor will be rebated at trip departure for any pax seats sold.',
          })
        } else if (kind === 'pax_reservation') {
          const member = await lookupMember(meta.member_id)
          await notifyOps({
            kind: 'pax_booking',
            member: member ?? undefined,
            amountCents: pi.amount_received ?? pi.amount,
            item: { kind: meta.item_kind as 'flight' | 'excursion' | undefined, id: meta.item_id ?? null },
            stripe: { paymentIntentId: pi.id, customerId: typeof pi.customer === 'string' ? pi.customer : pi.customer?.id ?? null },
            details: {
              Seats: meta.seats,
              'Round trip': meta.is_round_trip === '1' ? 'yes' : 'no',
              'Return item': meta.return_item_id || undefined,
            },
          })
        }
        break
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object as StripeNS.PaymentIntent
        const meta = pi.metadata ?? {}
        const bookingId = meta.booking_id

        if (bookingId) {
          await db
            .from('bookings')
            .update({ payment_status: 'failed', stripe_payment_intent_id: pi.id })
            .eq('id', bookingId)

          const { data: booking } = await db
            .from('bookings').select('member_id, item_kind').eq('id', bookingId).single()
          if (booking?.member_id) {
            await db.from('notifications').insert({
              member_id: booking.member_id,
              kind: 'system',
              title: 'Payment failed',
              body: `We couldn't process your ${booking.item_kind} payment. Please update your card.`,
              read: false,
            })
          }
        }

        // Ops always wants to know about a failed charge — could be a
        // declined anchor capture (the trip stays pending) or a failed
        // pax reservation.
        const memberId = meta.anchor_member_id || meta.member_id
        const member = await lookupMember(memberId)
        const err = pi.last_payment_error
        await notifyOps({
          kind: 'payment_failed',
          member: member ?? undefined,
          amountCents: pi.amount,
          item: { kind: meta.item_kind as 'flight' | 'excursion' | undefined, id: meta.item_id ?? meta.anchor_submission_id ?? null },
          stripe: { paymentIntentId: pi.id, customerId: typeof pi.customer === 'string' ? pi.customer : pi.customer?.id ?? null },
          details: {
            'Decline code': err?.decline_code ?? undefined,
            'Failure code': err?.code ?? undefined,
            Type: meta.kind,
          },
          note: err?.message ?? 'Stripe declined the charge. Investigate the customer\'s payment method or contact them.',
        })
        break
      }

      case 'charge.refunded': {
        const charge = event.data.object as StripeNS.Charge
        // Charge.refunded fires on every refund (full or partial). The
        // delta = amount_refunded - previous refunds; we report the
        // newest refund object, which is the last entry in the list.
        const refunds = charge.refunds?.data ?? []
        const newest = refunds[refunds.length - 1]
        const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id ?? null
        // Find associated metadata from the PI for context.
        let piMeta: Record<string, string> = {}
        if (piId) {
          try {
            const pi = await stripe.paymentIntents.retrieve(piId)
            piMeta = (pi.metadata ?? {}) as Record<string, string>
          } catch (e) {
            safeError('webhook: PI retrieve for refund failed', e)
          }
        }
        const memberId = piMeta.anchor_member_id || piMeta.member_id
        const member = await lookupMember(memberId)
        const refundedCents = newest?.amount ?? charge.amount_refunded ?? 0
        await notifyOps({
          kind: piMeta.kind === 'anchor_capture' ? 'anchor_settlement' : 'pax_cancel_refund',
          member: member ?? undefined,
          amountCents: refundedCents,
          item: { kind: piMeta.item_kind as 'flight' | 'excursion' | undefined, id: piMeta.item_id ?? piMeta.anchor_submission_id ?? null },
          stripe: {
            paymentIntentId: piId,
            refundId: newest?.id ?? null,
            chargeId: charge.id,
            customerId: typeof charge.customer === 'string' ? charge.customer : charge.customer?.id ?? null,
          },
          details: {
            Reason: newest?.reason ?? undefined,
            'Original charge': `$${(charge.amount / 100).toFixed(2)}`,
            'Source flow': piMeta.kind,
          },
        })
        break
      }

      case 'charge.dispute.created': {
        const dispute = event.data.object as StripeNS.Dispute
        const piId = typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id ?? null
        let piMeta: Record<string, string> = {}
        if (piId) {
          try {
            const pi = await stripe.paymentIntents.retrieve(piId)
            piMeta = (pi.metadata ?? {}) as Record<string, string>
          } catch (e) {
            safeError('webhook: PI retrieve for dispute failed', e)
          }
        }
        const memberId = piMeta.anchor_member_id || piMeta.member_id
        const member = await lookupMember(memberId)
        await notifyOps({
          kind: 'payment_dispute',
          member: member ?? undefined,
          amountCents: dispute.amount,
          item: { kind: piMeta.item_kind as 'flight' | 'excursion' | undefined, id: piMeta.item_id ?? piMeta.anchor_submission_id ?? null },
          stripe: {
            paymentIntentId: piId,
            chargeId: typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id ?? null,
          },
          details: {
            Reason: dispute.reason,
            Status: dispute.status,
            'Evidence due': dispute.evidence_details?.due_by ? tsFromUnix(dispute.evidence_details.due_by) : undefined,
          },
          note: 'A chargeback has been opened. Review immediately and submit evidence before the deadline or the funds will be withdrawn.',
        })
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
