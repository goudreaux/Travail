import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { safeError } from '@/lib/pii-scrub'
import { PROPOSAL_MIN_LEAD_DAYS, MAX_ACTIVE_PROPOSALS_PER_MEMBER } from '@/lib/proposals'
import { notifyOps } from '@/lib/ops-notify'
import type { Database } from '@/lib/supabase/types'

// Member submits a Trip Proposal. Saves the row in pending_ops_review,
// pings ops, and returns the new id. No card collection here — the
// proposer commits a seat afterwards via /api/proposals/commit using
// the SetupIntent flow, same as any other member.
//
// Validation:
//   - date >= today + PROPOSAL_MIN_LEAD_DAYS (7-day floor)
//   - origin_code references an existing airport
//   - kind in ('flight','excursion')
//
// The flight payload carries destCode/destName; the excursion payload
// carries stay_type + times. Ops fills in capacity, min_seats, and
// price during review.

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
  kind?: 'flight' | 'excursion'
  name?: string
  date?: string
  originCode?: string
  // Free-form context that ops uses to draft the trip. The whole
  // object goes into trip_proposals.payload jsonb verbatim.
  details?: Record<string, unknown>
  // Member's suggested capacity / min_seats so ops has a starting
  // point. Ops can override during review.
  suggestedCapacity?: number
  suggestedMinSeats?: number
  // Spread guarantee — proposer's firm party + max coverage if the
  // network underfills. See proposer_min_seats / proposer_max_seats
  // in the schema for the math.
  proposerMinSeats?: number
  proposerMaxSeats?: number
}

function dayDiff(date: string): number {
  const target = new Date(date + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { data: me } = await supabase
    .from('members').select('id, name, member_no').eq('user_id', user.id).maybeSingle()
  if (!me) return NextResponse.json({ error: 'Member record not found' }, { status: 403 })

  let body: Payload
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid payload' }, { status: 400 }) }

  const kind = body.kind
  const name = (body.name ?? '').trim()
  const date = (body.date ?? '').trim()
  const originCode = (body.originCode ?? '').trim()

  if (kind !== 'flight' && kind !== 'excursion') {
    return NextResponse.json({ error: 'kind must be flight or excursion' }, { status: 400 })
  }
  if (!name) return NextResponse.json({ error: 'Trip name required' }, { status: 400 })
  if (!date) return NextResponse.json({ error: 'Date required' }, { status: 400 })
  if (!originCode) return NextResponse.json({ error: 'Origin airport required' }, { status: 400 })
  const lead = dayDiff(date)
  if (lead < PROPOSAL_MIN_LEAD_DAYS) {
    return NextResponse.json({
      error: `Proposals need at least ${PROPOSAL_MIN_LEAD_DAYS} days of lead time so the network has a chance to commit before the ${PROPOSAL_MIN_LEAD_DAYS}-day Tropic confirmation window.`,
    }, { status: 400 })
  }

  const db = admin()

  // Cap at MAX_ACTIVE_PROPOSALS_PER_MEMBER active proposals (pending +
  // open) per member so the queue stays manageable.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: activeProps } = await (db as any)
    .from('trip_proposals')
    .select('id')
    .eq('proposer_id', me.id)
    .in('status', ['pending_ops_review', 'open'])
  if ((activeProps?.length ?? 0) >= MAX_ACTIVE_PROPOSALS_PER_MEMBER) {
    return NextResponse.json({
      error: `You can have up to ${MAX_ACTIVE_PROPOSALS_PER_MEMBER} active proposals at a time. Withdraw one of your existing proposals first.`,
    }, { status: 400 })
  }

  // Validate origin airport exists.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ap } = await (db as any).from('airports').select('code').eq('code', originCode).maybeSingle()
  if (!ap) return NextResponse.json({ error: 'Origin airport not recognized' }, { status: 400 })

  // Sanity-cap the suggested numbers in case of UI mischief.
  const suggestedCapacity = Math.min(20, Math.max(1, Number(body.suggestedCapacity ?? 8) || 8))
  const suggestedMinSeats = Math.min(suggestedCapacity, Math.max(1, Number(body.suggestedMinSeats ?? 4) || 4))
  // Spread guarantee — proposer's party (firm) and ceiling (max).
  const proposerMin = Math.min(suggestedCapacity, Math.max(1, Number(body.proposerMinSeats ?? 1) || 1))
  const proposerMax = Math.min(suggestedCapacity, Math.max(proposerMin, Number(body.proposerMaxSeats ?? proposerMin) || proposerMin))

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: inserted, error: insErr } = await (db as any)
      .from('trip_proposals')
      .insert({
        proposer_id: me.id,
        kind,
        name,
        date,
        origin_code: originCode,
        proposer_min_seats: proposerMin,
        proposer_max_seats: proposerMax,
        payload: {
          ...(body.details ?? {}),
          suggested_capacity: suggestedCapacity,
          suggested_min_seats: suggestedMinSeats,
        },
      })
      .select()
      .single()

    if (insErr) throw insErr

    // Ping ops — they review and set the actual capacity/min/price.
    await notifyOps({
      kind: 'anchor_submission',   // closest existing kind; future migration can add 'proposal_submission'
      member: {
        name: me.name ?? null,
        memberCode: me.member_no ? `#${me.member_no}` : null,
      },
      item: { kind, id: inserted.id, name, date },
      note: `New TRIP PROPOSAL — needs review. Proposer suggested capacity ${suggestedCapacity}, min ${suggestedMinSeats}.`,
      details: {
        Action: 'PROPOSAL submitted',
        Origin: originCode,
        'Lead time': `${lead} days`,
        'Proposer spread': `${proposerMin} firm / up to ${proposerMax} guaranteed`,
      },
    })

    return NextResponse.json({ id: inserted.id })
  } catch (err) {
    safeError('proposals/create: insert failed', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to submit proposal' },
      { status: 500 },
    )
  }
}
