import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { safeError } from '@/lib/pii-scrub'
import type { Database } from '@/lib/supabase/types'

// Returns a Stripe Customer Portal session URL. The portal handles update-
// card, view-invoices, billing address.
//
// Cancellation is intentionally DISABLED in the portal configuration
// (Stripe dashboard → Settings → Billing → Customer portal). Members
// who want to cancel call ops at TRAVAIL_OPS_PHONE — that's policy, not
// an accident. See /membership for the in-app cancel copy.

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

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const db = admin()
  const { data: member } = await db
    .from('members').select('id, stripe_customer_id').eq('user_id', user.id).maybeSingle()
  if (!member?.stripe_customer_id) {
    return NextResponse.json({ error: 'No Stripe customer on file' }, { status: 400 })
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: member.stripe_customer_id,
      return_url: `${req.nextUrl.origin}/membership`,
    })
    return NextResponse.json({ url: session.url })
  } catch (err) {
    safeError('subscribe/portal: failed', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to open portal' },
      { status: 500 },
    )
  }
}
