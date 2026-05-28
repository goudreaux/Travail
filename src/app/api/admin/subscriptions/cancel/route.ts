import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { safeError } from '@/lib/pii-scrub'
import type { Database } from '@/lib/supabase/types'

// Ops cancels a member's subscription on the phone.
//
// Members can't self-cancel — that's policy. They call the ops line
// (TRAVAIL_OPS_PHONE), the rep verifies them, then hits this endpoint
// from /admin/members. Default mode is cancel-at-period-end so the
// member rides out their paid month; ops can override to immediate if
// the member specifically requests it.
//
// Refund policy: no automatic refunds here. The member's already
// covered through the current period; that's the value they're getting
// for the unused days. Direct refunds (rare) go through Stripe manually.

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

interface Payload {
  member_id?: string
  reason?: string
  // 'period_end' (default) keeps access through current period. 'immediate'
  // ends it now — only ops decides this on the call.
  mode?: 'period_end' | 'immediate'
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { data: actor } = await supabase
    .from('members').select('id, is_admin').eq('user_id', user.id).maybeSingle()
  if (!actor?.is_admin) return NextResponse.json({ error: 'Admins only' }, { status: 403 })

  let payload: Payload
  try { payload = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid payload' }, { status: 400 }) }

  const memberId = (payload.member_id ?? '').trim()
  const mode = payload.mode === 'immediate' ? 'immediate' : 'period_end'
  const reason = (payload.reason ?? '').trim().slice(0, 1000) || null

  if (!memberId) return NextResponse.json({ error: 'member_id required' }, { status: 400 })

  const db = admin()
  const { data: target } = await db
    .from('members')
    .select('id, name, stripe_subscription_id, subscription_status')
    .eq('id', memberId).maybeSingle()
  if (!target) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  if (!target.stripe_subscription_id) {
    return NextResponse.json({ error: 'Member has no active subscription' }, { status: 400 })
  }

  try {
    if (mode === 'immediate') {
      await stripe.subscriptions.cancel(target.stripe_subscription_id)
    } else {
      await stripe.subscriptions.update(target.stripe_subscription_id, {
        cancel_at_period_end: true,
      })
    }
  } catch (err) {
    safeError('admin/subscriptions/cancel: Stripe call failed', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Stripe cancel failed' },
      { status: 502 },
    )
  }

  // The webhook will update subscription_status to 'canceled' on
  // customer.subscription.deleted; for period_end the status stays
  // 'active' but cancel_at_period_end flips true. We log here so the
  // activity feed reflects the operator action even before the webhook
  // settles.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ((db as any).from('activity_log')).insert({
    actor_kind: 'admin',
    actor_member_id: actor.id,
    subject_member_id: target.id,
    action: 'subscription_cancelled_by_ops',
    summary: `Cancelled ${target.name ?? target.id}'s subscription (${mode === 'immediate' ? 'immediate' : 'end of period'}).`,
    meta: { mode, reason, subscription_id: target.stripe_subscription_id },
  })

  return NextResponse.json({ ok: true, mode })
}
