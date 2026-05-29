import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { safeError } from '@/lib/pii-scrub'
import { notifyOps } from '@/lib/ops-notify'
import type { Database } from '@/lib/supabase/types'

// Member withdraws their commit on a Trip Proposal while it's still
// in 'open' status. Flip their commit row to 'released' — no Stripe
// action needed since nothing was ever captured.
//
// If the withdrawing member is the proposer AND no other commits
// exist, the whole proposal goes 'withdrawn'. Otherwise the proposal
// keeps going and ops decides whether to lock or let it expire.

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

  let body: { proposalId?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid payload' }, { status: 400 }) }

  const proposalId = (body.proposalId ?? '').trim()
  if (!proposalId) return NextResponse.json({ error: 'proposalId required' }, { status: 400 })

  const db = admin()

  // Refuse if ops is mid-lock — the capture loop may already be
  // running and pulling this member's card. Same lock_started_at
  // sentinel the lock route flips atomically.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: propGuard } = await (db as any)
    .from('trip_proposals')
    .select('id, status, lock_started_at')
    .eq('id', proposalId)
    .maybeSingle()
  if (!propGuard) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
  if (propGuard.lock_started_at) {
    return NextResponse.json({
      error: 'Ops is currently locking this proposal, too late to withdraw. Contact Ops if you need to roll back.',
    }, { status: 409 })
  }

  try {
    // Release every 'committed' row this member holds on the proposal in a
    // single status-scoped update. Previously we read one row with
    // .maybeSingle() and released it by id — but .maybeSingle() THROWS when
    // more than one row exists, so a member with a stray duplicate (the old
    // provisional-insert path could leave them) would tap Withdraw and have
    // it appear to do nothing. A bulk update is idempotent and robust.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: released, error: relErr } = await (db as any)
      .from('trip_proposal_commits')
      .update({ status: 'released', released_at: new Date().toISOString() })
      .eq('proposal_id', proposalId)
      .eq('member_id', me.id)
      .eq('status', 'committed')
      .select('id')
    if (relErr) throw relErr
    if (!released || released.length === 0) {
      return NextResponse.json({ error: 'No active commit to withdraw.' }, { status: 404 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: prop } = await (db as any)
      .from('trip_proposals')
      .select('id, status, proposer_id')
      .eq('id', proposalId).maybeSingle()

    // If the proposer themselves is withdrawing and they're the last
    // remaining commit, the whole proposal goes 'withdrawn'.
    let collapsed = false
    if (prop?.status === 'open' && prop.proposer_id === me.id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: still } = await (db as any)
        .from('trip_proposal_commits')
        .select('id')
        .eq('proposal_id', proposalId)
        .eq('status', 'committed')
      if (!still || still.length === 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any).from('trip_proposals').update({
          status: 'withdrawn',
        }).eq('id', proposalId)
        collapsed = true
      }
    }

    // Notify ops — a proposer withdrawing can collapse the whole proposed
    // trip, so ops needs to know. Best-effort; never blocks the withdraw.
    const isProposer = propGuard.proposer_id === me.id
    try {
      await notifyOps({
        kind: 'proposal_withdrawn',
        member: { name: null, memberCode: null, email: user.email ?? null },
        item: { kind: propGuard.kind ?? null, id: proposalId, name: propGuard.name ?? null },
        note: collapsed
          ? `Proposer withdrew — proposal "${propGuard.name ?? proposalId}" collapsed (now withdrawn); no other commits remained.`
          : isProposer
            ? `Proposer withdrew their commit on "${propGuard.name ?? proposalId}" — other commits remain, proposal still open.`
            : `A member withdrew their commit on "${propGuard.name ?? proposalId}".`,
      })
    } catch (e) {
      safeError('proposals/withdraw: notifyOps failed (non-fatal)', e)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    safeError('proposals/withdraw: failed', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to withdraw' },
      { status: 500 },
    )
  }
}
