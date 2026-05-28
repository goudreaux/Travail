import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { safeError } from '@/lib/pii-scrub'
import { assertCanBook } from '@/lib/can-book'
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

// Single source of truth for "which Stripe customer owns this member?".
// Tries the DB cache first; falls back to a Stripe customers.list()
// by email + metadata.member_id match. This is the function every
// endpoint here uses, so even if the DB cache write fails (we've seen
// it happen silently), the next request still resolves to the same
// Stripe customer instead of looping.
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
    safeError('resolveStripeCustomer: list failed:', e)
    return null
  }
}

async function ensureStripeCustomer(memberId: string, name: string, email: string | null): Promise<string> {
  const existing = await resolveStripeCustomer(memberId, email)
  if (existing) {
    // Cache it in the DB if it isn't already. Best-effort — if this
    // fails we still proceed; the next request self-heals via
    // resolveStripeCustomer.
    const db = admin()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: cacheErr } = await (db.from('members') as any)
      .update({ stripe_customer_id: existing })
      .eq('id', memberId)
    if (cacheErr) safeError('Could not cache stripe_customer_id (non-fatal):', cacheErr)
    return existing
  }

  const created = await stripe.customers.create({
    name,
    email: email ?? undefined,
    metadata: { member_id: memberId },
  })

  // Persist + verify.
  const db = admin()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated, error: upErr } = await (db.from('members') as any)
    .update({ stripe_customer_id: created.id })
    .eq('id', memberId)
    .select('id, stripe_customer_id')
  if (upErr) {
    safeError('Could not persist members.stripe_customer_id (error):', upErr)
  } else if (!Array.isArray(updated) || updated.length === 0) {
    safeError('Could not persist members.stripe_customer_id (no rows updated):', { memberId, created: created.id })
  } else if (updated[0]?.stripe_customer_id !== created.id) {
    safeError('Persist appeared to succeed but value did not stick:', updated[0])
  }

  return created.id
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

  const customerId = await resolveStripeCustomer(r.member.id, r.email)
  if (!customerId) {
    return NextResponse.json({ hasCard: false })
  }

  try {
    // Prefer the customer's default PM (set by /finalize after confirm).
    // Fall back to listing — try card first, then link (Stripe Link
    // wraps a card and lands as type=link). The fallback also covers
    // a race where the default isn't promoted yet.
    const customer = await stripe.customers.retrieve(customerId)
    if (customer.deleted) return NextResponse.json({ hasCard: false })

    let pmId = (customer.invoice_settings?.default_payment_method as string | null) ?? null
    if (!pmId) {
      for (const t of ['card', 'link'] as const) {
        const pms = await stripe.paymentMethods.list({ customer: customerId, type: t, limit: 1 })
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

  // Membership gate — same as pax booking. Anchoring is a billable
  // obligation, so past_due / cancelled members can't start it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const guard = await assertCanBook(admin() as any, r.member.id)
  if (!guard.ok) {
    return NextResponse.json(
      { error: 'Membership required', reason: guard.reason, status: guard.status },
      { status: 402 },
    )
  }

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
