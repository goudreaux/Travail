import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { safeError } from '@/lib/pii-scrub'
import type { Database } from '@/lib/supabase/types'

// Finalize a card-on-file SetupIntent that the browser just confirmed.
//
// Why this exists: when the client calls stripe.confirmSetup(), the
// PaymentMethod is created and attached to the customer, but it isn't
// automatically set as the customer's default. Our GET reads the
// default_payment_method first, which means the just-saved card looks
// "not yet on file" until something promotes it.
//
// This endpoint retrieves the SetupIntent server-side, pulls the
// payment_method off it, and sets it as the customer's default. After
// this returns, GET /api/anchor/setup-intent reliably reports hasCard.

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

interface FinalizePayload {
  setupIntentId?: string
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { data: meRow } = await supabase
    .from('members').select('id').eq('user_id', user.id).maybeSingle()
  if (!meRow) return NextResponse.json({ error: 'Member record not found' }, { status: 403 })

  let payload: FinalizePayload
  try { payload = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid payload' }, { status: 400 }) }

  const setupIntentId = (payload.setupIntentId ?? '').trim()
  if (!setupIntentId) {
    return NextResponse.json({ error: 'setupIntentId required' }, { status: 400 })
  }

  const db = admin()
  const { data: m } = await db
    .from('members').select('stripe_customer_id').eq('id', meRow.id).single()
  if (!m?.stripe_customer_id) {
    return NextResponse.json({ error: 'No Stripe customer on file' }, { status: 409 })
  }

  try {
    const si = await stripe.setupIntents.retrieve(setupIntentId)
    if (si.customer !== m.stripe_customer_id) {
      // Sanity — the SetupIntent must belong to the caller's customer.
      return NextResponse.json({ error: 'Mismatched customer on the setup intent' }, { status: 403 })
    }
    if (si.status !== 'succeeded') {
      return NextResponse.json({ error: `Setup intent status is ${si.status}, not succeeded` }, { status: 409 })
    }
    const pmId = typeof si.payment_method === 'string' ? si.payment_method : si.payment_method?.id ?? null
    if (!pmId) {
      return NextResponse.json({ error: 'Setup intent has no payment method attached' }, { status: 409 })
    }

    await stripe.customers.update(m.stripe_customer_id, {
      invoice_settings: { default_payment_method: pmId },
    })

    return NextResponse.json({ ok: true, payment_method_id: pmId })
  } catch (e) {
    safeError('SetupIntent finalize failed:', e)
    return NextResponse.json({ error: 'Could not finalize the card on file.' }, { status: 502 })
  }
}
