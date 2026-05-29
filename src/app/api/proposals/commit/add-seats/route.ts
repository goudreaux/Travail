import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { safeError } from '@/lib/pii-scrub'
import { assertTransactionsAllowed } from '@/lib/maintenance'
import type { Database } from '@/lib/supabase/types'

// Existing committer (proposer included) adds more seats to their
// commit during the commit window — typically because they've rounded
// up a friend or two and want to bring them along.
//
// Validation:
//   - Proposal must be 'open' AND not currently locking.
//   - New total seats <= capacity_total - other_committed_seats.
//   - For the proposer: new total <= proposer_max_seats. They can't
//     unilaterally raise their own ceiling — that needs ops.
//   - Card on file (payment_method_id set) is required. Otherwise the
//     additional seats would have no card to capture against.
//
// We update the existing commit row's `seats` count in place rather
// than creating a new row, so the per-(proposal, member) unique
// constraint stays intact and the lock route's spread math sees one
// number per member.

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
  proposalId?: string
  addSeats?: number
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { data: me } = await supabase
    .from('members').select('id').eq('user_id', user.id).maybeSingle()
  if (!me) return NextResponse.json({ error: 'Member not found' }, { status: 403 })

  let body: Payload
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid payload' }, { status: 400 }) }

  const proposalId = (body.proposalId ?? '').trim()
  const addSeats = Math.max(1, Math.min(6, Math.round(Number(body.addSeats ?? 1))))
  if (!proposalId) return NextResponse.json({ error: 'proposalId required' }, { status: 400 })

  const db = admin()

  // Maintenance kill switch — adding seats increases a billable commitment.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maint = await assertTransactionsAllowed(db as any)
  if (!maint.ok) return NextResponse.json({ error: maint.message }, { status: 503 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prop } = await (db as any)
    .from('trip_proposals')
    .select('id, proposer_id, status, capacity_total, proposer_min_seats, proposer_max_seats, lock_started_at')
    .eq('id', proposalId).maybeSingle()
  if (!prop) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
  if (prop.status !== 'open') {
    return NextResponse.json({ error: `Proposal is ${prop.status} and not accepting more seats.` }, { status: 400 })
  }
  if (prop.lock_started_at) {
    return NextResponse.json({ error: 'Ops is currently locking, too late to add seats.' }, { status: 409 })
  }

  // Pull all commits to check capacity headroom and find ours.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: commits } = await (db as any)
    .from('trip_proposal_commits')
    .select('id, member_id, seats, status, payment_method_id')
    .eq('proposal_id', proposalId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mine = (commits ?? []).find((c: any) => c.member_id === me.id && c.status === 'committed')
  if (!mine) {
    return NextResponse.json({ error: 'You don\'t have a commit on this proposal yet.' }, { status: 400 })
  }
  if (!mine.payment_method_id) {
    return NextResponse.json({ error: 'No card on file yet. Finish the initial commit before adding seats.' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const otherSeats = (commits ?? [])
    .filter((c: any) => c.id !== mine.id && (c.status === 'committed' || c.status === 'captured'))
    .reduce((s: number, c: any) => s + (c.seats ?? 1), 0)
  const newTotal = mine.seats + addSeats
  if (prop.capacity_total && otherSeats + newTotal > prop.capacity_total) {
    const headroom = Math.max(0, prop.capacity_total - otherSeats - mine.seats)
    return NextResponse.json({
      error: headroom === 0
        ? 'No seats left to add, proposal is at capacity.'
        : `Only ${headroom} seat${headroom === 1 ? '' : 's'} left to add.`,
    }, { status: 400 })
  }

  // Proposer-specific guardrail: they can't unilaterally exceed
  // their max_seats coverage — that ceiling was reviewed by ops.
  if (me.id === prop.proposer_id) {
    const proposerMax = prop.proposer_max_seats ?? mine.seats
    if (newTotal > proposerMax) {
      return NextResponse.json({
        error: `Your max coverage was set to ${proposerMax} seats during review. To raise it, ask ops to update the proposal.`,
      }, { status: 400 })
    }
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('trip_proposal_commits').update({ seats: newTotal }).eq('id', mine.id)
    return NextResponse.json({ ok: true, seats: newTotal })
  } catch (err) {
    safeError('proposals/commit/add-seats: failed', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to add seats' },
      { status: 500 },
    )
  }
}
