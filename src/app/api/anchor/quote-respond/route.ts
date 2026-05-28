import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { notifyOps } from '@/lib/ops-notify'
import { safeError } from '@/lib/pii-scrub'
import type { Database } from '@/lib/supabase/types'

// Member accepts or declines an anchor quote.
//
// Only the submission's anchor can respond. Status must be 'quoted'
// (Ops has sent a price). On accept, the publish-anchor endpoint
// becomes eligible to fire and capture the locked quoted_total_cents.
// On decline, the submission goes to status='declined' with the
// member's reason recorded for ops follow-up.

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

interface RespondPayload {
  submissionId?: string
  action?: 'accept' | 'decline'
  reason?: string
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { data: meRow } = await supabase
    .from('members').select('id, name, member_no').eq('user_id', user.id).maybeSingle()
  if (!meRow) return NextResponse.json({ error: 'Member record not found' }, { status: 403 })

  let payload: RespondPayload
  try { payload = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid payload' }, { status: 400 }) }

  const submissionId = (payload.submissionId ?? '').trim()
  const action = payload.action
  const reason = (payload.reason ?? '').trim().slice(0, 1000)
  if (!submissionId) return NextResponse.json({ error: 'submissionId required' }, { status: 400 })
  if (action !== 'accept' && action !== 'decline') {
    return NextResponse.json({ error: 'action must be accept or decline' }, { status: 400 })
  }
  if (action === 'decline' && reason.length === 0) {
    return NextResponse.json({ error: 'Reason required when declining' }, { status: 400 })
  }

  const db = admin()
  const { data: sub } = await db
    .from('anchor_submissions').select('*').eq('id', submissionId).maybeSingle()
  if (!sub) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  if (sub.member_id !== meRow.id) {
    return NextResponse.json({ error: 'This quote is not yours' }, { status: 403 })
  }
  if ((sub.status as string) !== 'quoted') {
    return NextResponse.json({ error: `Submission status is ${sub.status}; nothing to respond to` }, { status: 409 })
  }

  const now = new Date().toISOString()
  // Cast: migration 042's status values aren't in the generated types yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: any = action === 'accept'
    ? { status: 'quote_accepted', quote_accepted_at: now }
    : { status: 'declined', quote_declined_at: now, quote_declined_reason: reason, decline_reason: reason }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updErr } = await (db.from('anchor_submissions') as any)
    .update(update)
    .eq('id', submissionId)
  if (updErr) {
    safeError('quote-respond: update failed', updErr)
    return NextResponse.json({ error: 'Could not save your response' }, { status: 500 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = (sub.payload ?? {}) as any
  const tripName = body.name ?? sub.kind
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalCents = ((sub as any).quoted_total_cents ?? 0) as number

  // Email ops + add a server-side notification for ops queue surface
  // visibility. The anchor sees their own confirmation in-app via the
  // existing notifications feed.
  const { data: contact } = await db
    .from('member_sensitive').select('email').eq('member_id', meRow.id).maybeSingle()
  await notifyOps({
    kind: 'anchor_submission',
    member: {
      name: meRow.name ?? null,
      memberCode: meRow.member_no ? `#${meRow.member_no}` : null,
      email: contact?.email ?? user.email ?? null,
    },
    item: { kind: sub.kind as 'flight' | 'excursion', id: submissionId, name: tripName, date: body.date ?? null },
    amountCents: totalCents,
    details: {
      Action: action === 'accept' ? 'Quote ACCEPTED — ready to publish' : 'Quote DECLINED',
      ...(action === 'decline' ? { 'Decline reason': reason } : {}),
    },
    note: action === 'accept'
      ? 'Anchor accepted the quote. Hit Publish to capture the card.'
      : 'Anchor declined the quote. Reach out to discuss revisions or close it out.',
  })

  return NextResponse.json({ ok: true, status: update.status })
}
