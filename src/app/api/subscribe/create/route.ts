import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { ensureStripeCustomer, createFounderSubscription } from '@/lib/stripe-subscription'
import { STRIPE_PRICE_FOUNDING } from '@/lib/stripe'
import { safeError } from '@/lib/pii-scrub'
import { assertTransactionsAllowed } from '@/lib/maintenance'
import type { Database } from '@/lib/supabase/types'

// Create (or reuse) a founder-rate subscription for the signed-in member.
//
// Idempotent: if the member already has a stripe_subscription_id pointing
// at a live sub we return its client secret so the same /onboarding/subscribe
// page can be reopened (e.g. card decline → retry) without piling up
// duplicate subscriptions on the customer.

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

export async function POST() {
  if (!STRIPE_PRICE_FOUNDING) {
    return NextResponse.json({ error: 'Subscriptions not configured' }, { status: 500 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const db = admin()

  // Maintenance kill switch — freeze new subscriptions (recurring charge).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maint = await assertTransactionsAllowed(db as any)
  if (!maint.ok) return NextResponse.json({ error: maint.message }, { status: 503 })

  const { data: member } = await db
    .from('members')
    .select('id, name, stripe_customer_id, stripe_subscription_id, subscription_status')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!member) return NextResponse.json({ error: 'Member record not found' }, { status: 404 })

  // Email resolution for the Stripe Customer (member_sensitive first,
  // auth.users fallback — same pattern as the cancel-trip/settle routes).
  let email: string | null = null
  const { data: contact } = await db
    .from('member_sensitive').select('email').eq('member_id', member.id).maybeSingle()
  if (contact?.email && contact.email.trim().length > 0) email = contact.email
  if (!email) email = user.email ?? null
  if (!email) return NextResponse.json({ error: 'No email on file' }, { status: 400 })

  try {
    const customerId = await ensureStripeCustomer(
      { id: member.id, name: member.name ?? null, stripe_customer_id: member.stripe_customer_id ?? null },
      email,
      db,
    )

    const { subscription, clientSecret } = await createFounderSubscription(customerId, member.id)
    if (!clientSecret) {
      // Either the Stripe API version returns the client secret in a shape we
      // don't probe (new field?) or the subscription was created without a
      // first invoice that needs paying. Logged for diagnosis.
      safeError('subscribe/create: no client_secret extracted from latest_invoice', {
        subscription_id: subscription.id,
        latest_invoice_shape: Object.keys((subscription.latest_invoice ?? {}) as object),
      })
    }

    // Optimistic write — Stripe will reconfirm via webhook but we want
    // the member to see "$200/mo · Founding Member" the moment the page
    // returns, not 4 seconds later when the webhook lands.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.from('members') as any)
      .update({
        stripe_subscription_id: subscription.id,
        subscription_status: subscription.status,
        subscription_price_id: STRIPE_PRICE_FOUNDING,
        is_founding_member: true,
      })
      .eq('id', member.id)

    return NextResponse.json({
      subscription_id: subscription.id,
      client_secret: clientSecret,
      status: subscription.status,
    })
  } catch (err) {
    safeError('subscribe/create: failed', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create subscription' },
      { status: 500 },
    )
  }
}
