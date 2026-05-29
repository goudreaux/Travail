import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { safeError } from '@/lib/pii-scrub'
import { PROPOSAL_RUNWAY_DAYS } from '@/lib/proposals'
import { sendProposalApprovedEmail, sendProposalDeclinedEmail } from '@/lib/member-email'
import type { Database } from '@/lib/supabase/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveEmail(db: any, memberId: string): Promise<string | null> {
  const { data: c } = await db.from('member_sensitive').select('email').eq('member_id', memberId).maybeSingle()
  if (c?.email && c.email.trim().length > 0) return c.email
  const { data: m } = await db.from('members').select('user_id, name').eq('id', memberId).maybeSingle()
  if (!m?.user_id) return null
  try {
    const { data: u } = await db.auth.admin.getUserById(m.user_id)
    return u?.user?.email ?? null
  } catch { return null }
}

// Ops reviews a proposal — sets capacity / min_seats / per-seat price,
// flips status to 'open' (or 'declined'). Computes expires_at as
// trip date - PROPOSAL_RUNWAY_DAYS so the sweep cron knows when to
// pull the plug if commits stall.

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
  decision?: 'approve' | 'decline'
  capacityTotal?: number
  minSeats?: number
  pricePerSeatCents?: number
  declineReason?: string
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const { data: actor } = await supabase
    .from('members').select('id, is_admin').eq('user_id', user.id).maybeSingle()
  if (!actor?.is_admin) return NextResponse.json({ error: 'Admins only' }, { status: 403 })

  let body: Payload
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid payload' }, { status: 400 }) }

  const proposalId = (body.proposalId ?? '').trim()
  if (!proposalId) return NextResponse.json({ error: 'proposalId required' }, { status: 400 })
  if (body.decision !== 'approve' && body.decision !== 'decline') {
    return NextResponse.json({ error: "decision must be 'approve' or 'decline'" }, { status: 400 })
  }

  const db = admin()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prop } = await (db as any)
    .from('trip_proposals').select('*').eq('id', proposalId).maybeSingle()
  if (!prop) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
  if (prop.status !== 'pending_ops_review') {
    return NextResponse.json({ error: `Proposal is ${prop.status} — already reviewed.` }, { status: 400 })
  }

  if (body.decision === 'decline') {
    const reason = (body.declineReason ?? '').trim() || null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('trip_proposals').update({
      status: 'declined',
      decline_reason: reason,
      reviewed_at: new Date().toISOString(),
      reviewed_by: actor.id,
    }).eq('id', proposalId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: proposer } = await (db as any)
      .from('members').select('id, name').eq('id', prop.proposer_id).maybeSingle()
    if (proposer) {
      const proposerEmail = await resolveEmail(db, proposer.id)
      if (proposerEmail) {
        await sendProposalDeclinedEmail({
          to: proposerEmail,
          memberName: proposer.name ?? 'Member',
          memberId: proposer.id,
          proposalId,
          proposalName: prop.name,
          tripDate: prop.date,
          reason,
        })
      }
    }
    return NextResponse.json({ ok: true, status: 'declined' })
  }

  // Approve: requires capacity + min + price.
  const capacity = Math.max(1, Math.min(20, Math.round(Number(body.capacityTotal ?? 0))))
  const minSeats = Math.max(1, Math.min(capacity, Math.round(Number(body.minSeats ?? 0))))
  const price = Math.max(0, Math.round(Number(body.pricePerSeatCents ?? 0)))
  if (!capacity || !minSeats || !price) {
    return NextResponse.json({ error: 'capacityTotal, minSeats, and pricePerSeatCents required to approve' }, { status: 400 })
  }

  // expires_at = trip date - runway days.
  const tripDate = new Date(prop.date + 'T00:00:00Z')
  const expiresAt = new Date(tripDate.getTime() - PROPOSAL_RUNWAY_DAYS * 86400000).toISOString()

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('trip_proposals').update({
      status: 'open',
      capacity_total: capacity,
      min_seats: minSeats,
      price_per_seat_cents: price,
      expires_at: expiresAt,
      reviewed_at: new Date().toISOString(),
      reviewed_by: actor.id,
    }).eq('id', proposalId)

    // In-app notification to the proposer so they know it's live.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('notifications').insert({
      member_id: prop.proposer_id,
      kind: 'approval',
      title: 'Proposal approved — go live',
      body: `Your "${prop.name}" proposal is live on the board. Needs ${minSeats} commits by ${new Date(expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} to fund. Be the first to commit a seat.`,
      ref: { proposal_id: proposalId },
    })

    // Branded "approved · go live" email to the proposer.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: proposer } = await (db as any)
      .from('members').select('id, name').eq('id', prop.proposer_id).maybeSingle()
    if (proposer) {
      const proposerEmail = await resolveEmail(db, proposer.id)
      if (proposerEmail) {
        await sendProposalApprovedEmail({
          to: proposerEmail,
          memberName: proposer.name ?? 'Member',
          memberId: proposer.id,
          proposalId,
          proposalName: prop.name,
          tripDate: prop.date,
          minSeats,
          pricePerSeatCents: price,
          expiresAt,
        })
      }
    }

    return NextResponse.json({ ok: true, status: 'open', expires_at: expiresAt })
  } catch (err) {
    safeError('admin/proposals/review: failed', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to review' },
      { status: 500 },
    )
  }
}
