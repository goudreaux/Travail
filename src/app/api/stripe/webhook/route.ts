import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Stripe as StripeNS } from 'stripe'
import type { Database } from '@/lib/supabase/types'
import { stripe, STRIPE_WEBHOOK_SECRET } from '@/lib/stripe'
import { notifyOps } from '@/lib/ops-notify'
import { safeError } from '@/lib/pii-scrub'
import {
  sendSubscriptionWelcomeEmail,
  sendSubscriptionPastDueEmail,
  sendSubscriptionCancelledEmail,
} from '@/lib/member-email'

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

// Email resolution for subscription emails — member_sensitive first,
// then auth.users via the admin client. Same pattern as cancel-trip and
// settle-trip, kept inline here so the webhook stays self-contained.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveEmailForMember(db: any, memberId: string): Promise<string | null> {
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
    safeError('webhook: auth.users email lookup failed', e)
    return null
  }
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
        const priceId = item?.price?.id ?? null
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db.from('members') as any)
          .update({
            stripe_subscription_id: sub.id,
            subscription_status: sub.status,
            subscription_price_id: priceId,
            trial_ends_at: tsFromUnix(sub.trial_end),
            current_period_end: tsFromUnix(periodEnd),
          })
          .eq('stripe_customer_id', customerId)

        // On termination, send the member a branded close-out and ping ops.
        if (event.type === 'customer.subscription.deleted') {
          const { data: m } = await db
            .from('members').select('id, name')
            .eq('stripe_customer_id', customerId).maybeSingle()
          if (m) {
            // Branded member email fires off this notification (notify-email
            // Edge Function); the app email below is ops paper-trail only.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (db as any).from('notifications').insert({
              member_id: m.id,
              kind: 'system',
              title: 'Membership ended',
              body: `Your Travail membership has been cancelled. You'll keep access through the end of your current billing period. We'd love to have you back — your concierge is one message away.`,
              ref: { subscription_id: sub.id },
              read: false,
            })
            const memberEmail = await resolveEmailForMember(db, m.id)
            if (memberEmail) {
              await sendSubscriptionCancelledEmail({
                to: memberEmail,
                memberName: m.name ?? 'Member',
                memberId: m.id,
                subscriptionId: sub.id,
              })
            }
            await notifyOps({
              kind: 'subscription_cancelled',
              member: await lookupMember(m.id) ?? undefined,
              stripe: { customerId, paymentIntentId: null },
              note: 'Subscription cancelled. Member loses booking access at period end if cancel_at_period_end, immediately if direct cancel.',
            })
          }
        }
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as StripeNS.Invoice
        const customerId = typeof invoice.customer === 'string'
          ? invoice.customer
          : invoice.customer?.id ?? null
        if (!customerId) break

        // First successful invoice on a subscription_create is the welcome
        // moment — branded email + ops alert. Subsequent renewals are
        // silent (Stripe's automatic receipt covers them).
        const isFirst = invoice.billing_reason === 'subscription_create'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: mRaw } = await (db.from('members') as any)
          .select('id, name, is_founding_member')
          .eq('stripe_customer_id', customerId).maybeSingle()
        const m = mRaw as { id: string; name: string | null; is_founding_member: boolean } | null
        if (!m) break

        if (isFirst) {
          // Intentionally NO member notification/email on activation — members
          // shouldn't get an "account activated / membership is active" message
          // (browse-first: there's no jarring activation moment). Ops still
          // gets the audit copy + notifyOps below.
          const memberEmail = await resolveEmailForMember(db, m.id)
          // Stripe SDK exposes the subscription on Invoice but the union
          // type erases through expansions; cast to read it.
          const subField = (invoice as unknown as { subscription?: string | { id: string } | null }).subscription
          const subId = typeof subField === 'string' ? subField : (subField?.id ?? null)
          if (memberEmail) {
            await sendSubscriptionWelcomeEmail({
              to: memberEmail,
              memberName: m.name ?? 'Member',
              memberId: m.id,
              subscriptionId: subId,
              amountCents: invoice.amount_paid ?? 0,
              isFounding: !!m.is_founding_member,
            })
          }
          await notifyOps({
            kind: 'subscription_started',
            member: await lookupMember(m.id) ?? undefined,
            amountCents: invoice.amount_paid ?? 0,
            stripe: { customerId, paymentIntentId: null },
            details: {
              'Founding member': m.is_founding_member ? 'yes' : 'no',
              Invoice: invoice.id,
            },
          })
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as StripeNS.Invoice
        const customerId = typeof invoice.customer === 'string'
          ? invoice.customer
          : invoice.customer?.id ?? null
        if (!customerId) break

        const { data: m } = await db
          .from('members').select('id, name')
          .eq('stripe_customer_id', customerId).maybeSingle()
        if (!m) break

        // Branded "card needs attention" email fires off this notification
        // (notify-email Edge Function); the app email below is ops paper-trail
        // only. The in-app SubscriptionBanner also nudges past_due members.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any).from('notifications').insert({
          member_id: m.id,
          kind: 'system',
          title: 'Your card needs attention',
          body: `We couldn't process your latest membership payment. Update your card in the app to keep your booking access — your concierge can help if anything's stuck.`,
          ref: {},
          read: false,
        })
        const memberEmail = await resolveEmailForMember(db, m.id)
        if (memberEmail) {
          await sendSubscriptionPastDueEmail({
            to: memberEmail,
            memberName: m.name ?? 'Member',
            memberId: m.id,
            amountCents: invoice.amount_due ?? 0,
            nextAttemptAt: tsFromUnix(invoice.next_payment_attempt),
            hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
          })
        }

        // Ops must move fast — they're the ones who'll call the member.
        await notifyOps({
          kind: 'subscription_payment_failed',
          member: await lookupMember(m.id) ?? undefined,
          amountCents: invoice.amount_due ?? 0,
          stripe: { customerId, paymentIntentId: null },
          details: {
            'Attempt count': invoice.attempt_count ?? undefined,
            'Next retry': tsFromUnix(invoice.next_payment_attempt) ?? 'no further retries',
            'Hosted invoice': invoice.hosted_invoice_url ?? undefined,
          },
          note: 'Membership payment failed. Member retains app access but bookings are paused. Reach out to resolve.',
        })
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
          // Persist the card brand/last4 on the member so the "card on file"
          // display is accurate and the next booking is recognized as a saved
          // card. Best-effort — never block the receipt.
          if (meta.member_id) {
            try {
              const pmId = typeof pi.payment_method === 'string' ? pi.payment_method : pi.payment_method?.id ?? null
              if (pmId) {
                const pm = await stripe.paymentMethods.retrieve(pmId)
                if (pm.card?.last4) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  await (db.from('members') as any)
                    .update({ card_last4: pm.card.last4 })
                    .eq('id', meta.member_id)
                }
                // Make it the customer's default so future bookings reuse it.
                const custId = typeof pi.customer === 'string' ? pi.customer : pi.customer?.id ?? null
                if (custId) {
                  await stripe.customers.update(custId, { invoice_settings: { default_payment_method: pmId } })
                }
              }
            } catch (e) {
              safeError('webhook: persist pax card_last4 failed (non-fatal)', e)
            }
          }
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
