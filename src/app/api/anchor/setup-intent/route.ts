import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { safeError } from '@/lib/pii-scrub'
import type { Database } from '@/lib/supabase/types'

// Anchor card-on-file flow.
//
// GET  → returns the member's current saved payment method (if any).
//        { hasCard: boolean, brand?: 'visa', last4?: '4242', exp?: '12/29' }
//
// POST → creates a Stripe SetupIntent for the member so they can add
//        / replace a card. Returns { clientSecret }. The client uses
//        Stripe Elements to confirm — once confirmed, the resulting
//        PaymentMethod is attached to the customer and saved as the
//        default for future off-session charges (anchor publish).
//
// We use members.stripe_customer_id as the single source of truth for
// "which Stripe customer is this member?". Created lazily on first
// SetupIntent request.

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

async function ensureStripeCustomer(memberId: string, name: string, email: string | null): Promise<string> {
  const db = admin()
  const { data: member } = await db
    .from('members').select('stripe_customer_id').eq('id', memberId).single()

  if (member?.stripe_customer_id) return member.stripe_customer_id

  // Self-heal: if a previous attempt created a Stripe customer for this
  // member but the DB write failed, we'd otherwise create a new one on
  // every click — exactly what we caught happening in test mode (eight
  // duplicate customers across consecutive Save-card taps). Search
  // Stripe for an existing customer keyed to this member_id before
  // creating a new one.
  let customerId: string | null = null
  try {
    const found = await stripe.customers.search({
      query: `metadata['member_id']:'${memberId}'`,
      limit: 1,
    })
    if (found.data[0]) customerId = found.data[0].id
  } catch (e) {
    // search() is on a newer API; if it isn't available we silently
    // fall through and create a new one. The verified write below
    // will keep things from running away.
    safeError('Stripe customer search failed (non-fatal):', e)
  }

  if (!customerId) {
    const created = await stripe.customers.create({
      name,
      email: email ?? undefined,
      metadata: { member_id: memberId },
    })
    customerId = created.id
  }

  // Persist the link + surface any failure so we can debug instead of
  // looping. Even if the write fails we still return customerId so
  // the SetupIntent can be created; the next request will self-heal
  // via the search above.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: upErr } = await (db.from('members') as any)
    .update({ stripe_customer_id: customerId })
    .eq('id', memberId)
  if (upErr) {
    safeError('Could not persist members.stripe_customer_id:', upErr)
  }

  return customerId
}

async function getMemberForRequest() {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { error: 'Not signed in' as const, status: 401 as const }

  const { data: meRow } = await supabase
    .from('members').select('id, name').eq('user_id', user.id).maybeSingle()
  if (!meRow) return { error: 'Member record not found' as const, status: 403 as const }

  // Email lives on auth.users (login email) for our purposes here.
  return { member: meRow, email: user.email ?? null }
}

// ─── GET — does the member already have a card on file? ─────────────────────

export async function GET() {
  const r = await getMemberForRequest()
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status })

  const db = admin()
  const { data: m } = await db
    .from('members').select('stripe_customer_id').eq('id', r.member.id).single()

  if (!m?.stripe_customer_id) {
    return NextResponse.json({ hasCard: false })
  }

  try {
    // Prefer the customer's default PM (set by /finalize after confirm).
    // Fall back to listing — try card first, then link (Stripe Link
    // wraps a card and lands as type=link). The fallback also covers
    // a race where the default isn't promoted yet.
    const customer = await stripe.customers.retrieve(m.stripe_customer_id)
    if (customer.deleted) return NextResponse.json({ hasCard: false })

    let pmId = (customer.invoice_settings?.default_payment_method as string | null) ?? null
    if (!pmId) {
      for (const t of ['card', 'link'] as const) {
        const pms = await stripe.paymentMethods.list({ customer: m.stripe_customer_id, type: t, limit: 1 })
        if (pms.data[0]) { pmId = pms.data[0].id; break }
      }
    }
    if (!pmId) return NextResponse.json({ hasCard: false })

    const pm = await stripe.paymentMethods.retrieve(pmId)
    // Surface card details whether the PM is a raw card or a Link
    // wrapper (Link exposes the underlying card via .card on retrieve).
    const card = pm.card ?? (pm.type === 'link' ? pm.card : null)
    if (!card) {
      // Last-resort summary — we know a PM exists, just don't have
      // card detail. Better to show "card on file" than to revert.
      return NextResponse.json({ hasCard: true })
    }

    return NextResponse.json({
      hasCard: true,
      brand: card.brand,
      last4: card.last4,
      exp: `${String(card.exp_month).padStart(2, '0')}/${String(card.exp_year).slice(-2)}`,
    })
  } catch (e) {
    safeError('Failed to read payment method:', e)
    return NextResponse.json({ hasCard: false })
  }
}

// ─── POST — create a SetupIntent so the client can add a card ───────────────

export async function POST() {
  const r = await getMemberForRequest()
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status })

  try {
    const customerId = await ensureStripeCustomer(r.member.id, r.member.name, r.email)

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      // 'off_session' because the eventual charge (when Ops publishes
      // the anchored trip) happens without the member present.
      usage: 'off_session',
      metadata: { member_id: r.member.id, purpose: 'anchor_card_on_file' },
    })

    return NextResponse.json({
      clientSecret: setupIntent.client_secret,
      customerId,
    })
  } catch (e) {
    safeError('SetupIntent creation failed:', e)
    return NextResponse.json({
      error: 'Could not start card setup. Try again in a moment.',
    }, { status: 502 })
  }
}
