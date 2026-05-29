import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { notifyOps } from '@/lib/ops-notify'
import { safeError } from '@/lib/pii-scrub'
import type { Database } from '@/lib/supabase/types'

// Ops sends the member a quote on a pending anchor submission.
//
// The member must accept the quoted total before publish-anchor will
// capture their card. This protects against surprise charges and gives
// Ops room to source pricing from Tropic + vendors before committing.
//
// Request:
//   POST /api/admin/quote-anchor
//   { anchor_submission_id, total_cost }   // dollars (whole units)

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

interface QuotePayload {
  anchor_submission_id?: string
  total_cost?: number   // dollars
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const { data: meRow } = await supabase
    .from('members').select('id, name, is_admin').eq('user_id', user.id).maybeSingle()
  if (!meRow?.is_admin) return NextResponse.json({ error: 'Admins only' }, { status: 403 })

  let payload: QuotePayload
  try { payload = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid payload' }, { status: 400 }) }

  const submissionId = (payload.anchor_submission_id ?? '').trim()
  const totalCost = Number(payload.total_cost)
  if (!submissionId) return NextResponse.json({ error: 'anchor_submission_id required' }, { status: 400 })
  if (!Number.isFinite(totalCost) || totalCost <= 0) {
    return NextResponse.json({ error: 'total_cost must be a positive number (dollars)' }, { status: 400 })
  }
  // The Ops form supplies the bare Tropic charter cost. Travail's 3%
  // service fee gets added on top so the anchor authorizes (and is
  // captured for) charter + fee. The fee stays with Travail; it's
  // not refunded at settlement.
  const ANCHOR_FEE_RATE = 0.03
  const charterCents = Math.round(totalCost * 100)
  const feeCents = Math.round(charterCents * ANCHOR_FEE_RATE)
  const totalCents = charterCents + feeCents

  const db = admin()
  const { data: sub } = await db
    .from('anchor_submissions').select('*').eq('id', submissionId).maybeSingle()
  if (!sub) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  if (!['pending', 'pending_ops_review', 'quoted'].includes(sub.status as string)) {
    return NextResponse.json({ error: `Submission status is ${sub.status}; can't quote` }, { status: 409 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = (sub.payload ?? {}) as any
  const seatsTotal = Number(body.seatsTotal ?? body.spotsTotal ?? body.seats_total ?? body.spots_total ?? 0)
  if (!seatsTotal) {
    return NextResponse.json({ error: 'Submission has no seats/spots count — fix the submission first' }, { status: 400 })
  }

  // Lock the quoted total onto the submission. Per-pax math is derived.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updErr } = await (db.from('anchor_submissions') as any)
    .update({
      // Tropic's bare charter cost — stored separately so we can
      // recover the fee breakdown for receipts + display.
      charter_cost_cents: charterCents,
      // What we'll actually capture from the anchor's card.
      quoted_total_cents: totalCents,
      quoted_at: new Date().toISOString(),
      quoted_by: meRow.id,
      status: 'quoted',
    })
    .eq('id', submissionId)
  if (updErr) {
    safeError('quote-anchor: update failed', updErr)
    // Surface the underlying Postgres error so ops can tell apart "column
    // doesn't exist" (migration not applied) from "status check rejects
    // 'quoted'" (042 missing) from generic FK / type issues.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = updErr as any
    const detail = e?.message || e?.details || e?.code || JSON.stringify(e)
    return NextResponse.json(
      { error: `Could not save the quote — ${detail}` },
      { status: 500 },
    )
  }

  // Anchor in-app notification (notify-email Edge Function fans this
  // out to the anchor's email). Deep-links to the accept/decline page.
  const totalDollars = totalCents / 100
  const charterDollars = charterCents / 100
  const feeDollars = feeCents / 100
  const perPax = totalDollars / seatsTotal
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.from('notifications') as any).insert({
    member_id: sub.member_id,
    kind: 'approval',
    title: `Quote ready · ${body.name ?? sub.kind}`,
    body:
      `Ops sourced pricing for "${body.name ?? sub.kind}": ` +
      `$${charterDollars.toLocaleString()} charter + $${feeDollars.toFixed(2)} service fee (3%) = ` +
      `$${totalDollars.toLocaleString()} total. ` +
      `Review and accept to authorize the capture.`,
    ref: {
      kind: 'anchor_quote',
      anchor_submission_id: submissionId,
      url: `/anchor-quote/${submissionId}`,
    },
  })

  // Ops record — for the books.
  const { data: anchorRow } = await db
    .from('members').select('name, member_no').eq('id', sub.member_id).maybeSingle()
  const { data: contact } = await db
    .from('member_sensitive').select('email').eq('member_id', sub.member_id).maybeSingle()
  await notifyOps({
    kind: 'anchor_submission',
    member: {
      name: anchorRow?.name ?? null,
      memberCode: anchorRow?.member_no ? `#${anchorRow.member_no}` : null,
      email: contact?.email ?? null,
    },
    item: { kind: sub.kind as 'flight' | 'excursion', id: submissionId, name: body.name ?? null, date: body.date ?? null },
    amountCents: totalCents,
    details: {
      'Action': 'Quote sent to anchor',
      'Charter cost (Tropic)': `$${charterDollars.toLocaleString()}`,
      'Service fee (3%)': `$${feeDollars.toFixed(2)}`,
      'Total quoted': `$${totalDollars.toLocaleString()}`,
      'Per seat (derived)': `$${perPax.toFixed(2)}`,
      'Seats total': seatsTotal,
    },
    note: 'Awaiting anchor accept/decline. Card will only be captured after acceptance.',
  })

  return NextResponse.json({ ok: true, quoted_total_cents: totalCents })
}
