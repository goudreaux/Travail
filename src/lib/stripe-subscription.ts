// Helpers for the founding-members subscription flow.
//
// One source of truth for "create or look up this member's Stripe Customer"
// and "kick off a Subscription with default_incomplete so we can collect
// the card client-side". Used by /api/subscribe/create and the admin
// cancel action.
//
// Server-only — this file imports the stripe SDK and the admin Supabase
// client, never bring it into a 'use client' component.

import { stripe, STRIPE_PRICE_FOUNDING } from '@/lib/stripe'
import type Stripe from 'stripe'

export interface MemberForBilling {
  id: string
  name: string | null
  stripe_customer_id: string | null
}

// Find-or-create a Stripe Customer for the given member. Writes back the
// new customer id so we never make a second one for the same member.
export async function ensureStripeCustomer(
  member: MemberForBilling,
  email: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
): Promise<string> {
  if (member.stripe_customer_id) return member.stripe_customer_id

  const customer = await stripe.customers.create({
    email,
    name: member.name ?? undefined,
    metadata: { member_id: member.id },
  })

  await db
    .from('members')
    .update({ stripe_customer_id: customer.id })
    .eq('id', member.id)

  return customer.id
}

// Create the founder subscription. Returns the client secret the browser
// uses to confirm the first invoice's PaymentIntent via Stripe Elements.
// `payment_behavior: 'default_incomplete'` means Stripe creates the sub
// in 'incomplete' status and waits for the PaymentIntent to confirm —
// gives us a clean handoff to the client-side card collector.
export async function createFounderSubscription(
  customerId: string,
  memberId: string,
): Promise<{ subscription: Stripe.Subscription; clientSecret: string | null }> {
  if (!STRIPE_PRICE_FOUNDING) {
    throw new Error('STRIPE_PRICE_FOUNDING env var not set')
  }

  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: STRIPE_PRICE_FOUNDING }],
    payment_behavior: 'default_incomplete',
    payment_settings: {
      save_default_payment_method: 'on_subscription',
      payment_method_types: ['card'],
    },
    // Expand both shapes: the legacy `latest_invoice.payment_intent` (pre-
    // 2025-09-30 API versions) and the new `latest_invoice.confirmation_secret`
    // (Dahlia / 2026-04-22, which is what SDK v22 ships with).
    expand: ['latest_invoice.payment_intent', 'latest_invoice.confirmation_secret'],
    metadata: {
      member_id: memberId,
      cohort: 'founders_2026',
    },
  })

  // Extract the client secret. The SDK types erase the expanded shapes so
  // we cast and probe both fields — whichever the active API version
  // returns is the one we use.
  const invoice = subscription.latest_invoice as unknown as {
    confirmation_secret?: { client_secret?: string | null } | null
    payment_intent?: { client_secret?: string | null } | null
  } | null

  const clientSecret =
    invoice?.confirmation_secret?.client_secret
    ?? invoice?.payment_intent?.client_secret
    ?? null

  return { subscription, clientSecret }
}
