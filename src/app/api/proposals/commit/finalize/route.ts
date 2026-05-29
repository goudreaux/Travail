import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { safeError } from '@/lib/pii-scrub'
import type { Database } from '@/lib/supabase/types'

// After Stripe Elements confirms a SetupIntent client-side, the
// browser calls this route with { setupIntentId } so we can persist
// the payment_method id on the commit row. Without this step the
// commit has a customer + intent but no PM to charge against later.

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

  const { data: me } = await supabase
    .from('members').select('id').eq('user_id', user.id).maybeSingle()
  if (!me) return NextResponse.json({ error: 'Member not found' }, { status: 403 })

  let body: { setupIntentId?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid payload' }, { status: 400 }) }

  const setupIntentId = (body.setupIntentId ?? '').trim()
  if (!setupIntentId) return NextResponse.json({ error: 'setupIntentId required' }, { status: 400 })

  try {
    const si = await stripe.setupIntents.retrieve(setupIntentId)
    if (si.status !== 'succeeded') {
      return NextResponse.json({ error: `SetupIntent status is ${si.status}` }, { status: 400 })
    }
    const pmId = typeof si.payment_method === 'string'
      ? si.payment_method
      : si.payment_method?.id ?? null
    if (!pmId) return NextResponse.json({ error: 'No payment method on SetupIntent' }, { status: 400 })

    // Attach + set as default so the eventual capture grabs the right one.
    const customerId = typeof si.customer === 'string' ? si.customer : si.customer?.id ?? null
    if (customerId) {
      try {
        await stripe.paymentMethods.attach(pmId, { customer: customerId })
      } catch { /* already attached */ }
      try {
        await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: pmId } })
      } catch (e) { safeError('proposals/commit/finalize: set default PM failed', e) }
    }

    // The SetupIntent must belong to this member.
    if (si.metadata?.member_id && si.metadata.member_id !== me.id) {
      return NextResponse.json({ error: 'This setup does not belong to you.' }, { status: 403 })
    }

    const db = admin()

    // Idempotency / legacy support: if a row already exists for this
    // SetupIntent (a retry, or a row from the old provisional-insert path),
    // just stamp the payment method on it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (db as any)
      .from('trip_proposal_commits')
      .select('id')
      .eq('stripe_setup_intent_id', setupIntentId)
      .maybeSingle()

    if (existing) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (db as any).from('trip_proposal_commits')
        .update({ payment_method_id: pmId }).eq('id', existing.id)
      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    // Otherwise create the commit row NOW — only once the card is saved.
    const proposalId = (si.metadata?.proposal_id ?? '').trim()
    if (!proposalId) {
      return NextResponse.json({ error: 'SetupIntent missing proposal reference' }, { status: 400 })
    }
    const seats = Math.max(1, Math.min(6, Math.round(Number(si.metadata?.seats ?? 1))))

    // Don't double-commit the same member on one proposal (a prior finalize
    // may already have created the row).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: mineRows } = await (db as any)
      .from('trip_proposal_commits')
      .select('id, status')
      .eq('proposal_id', proposalId)
      .eq('member_id', me.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const alreadyActive = (mineRows ?? []).some((c: any) => c.status === 'committed' || c.status === 'captured')
    if (alreadyActive) return NextResponse.json({ ok: true })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insErr } = await (db as any).from('trip_proposal_commits').insert({
      proposal_id: proposalId,
      member_id: me.id,
      seats,
      stripe_customer_id: customerId,
      stripe_setup_intent_id: setupIntentId,
      payment_method_id: pmId,
      status: 'committed',
    })
    if (insErr) throw insErr
    return NextResponse.json({ ok: true })
  } catch (err) {
    safeError('proposals/commit/finalize: failed', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to finalize commit' },
      { status: 500 },
    )
  }
}
