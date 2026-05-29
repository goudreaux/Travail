import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { safeError } from '@/lib/pii-scrub'
import { sendProposalExpiredEmail } from '@/lib/member-email'
import type { Database } from '@/lib/supabase/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveEmail(db: any, memberId: string): Promise<string | null> {
  const { data: c } = await db.from('member_sensitive').select('email').eq('member_id', memberId).maybeSingle()
  if (c?.email && c.email.trim().length > 0) return c.email
  const { data: m } = await db.from('members').select('user_id').eq('id', memberId).maybeSingle()
  if (!m?.user_id) return null
  try {
    const { data: u } = await db.auth.admin.getUserById(m.user_id)
    return u?.user?.email ?? null
  } catch { return null }
}

// Auto-cancel Trip Proposals that haven't hit their commit minimum
// by the 5-day Tropic confirmation window. Designed for Vercel Cron
// (hourly) — auth via Bearer ${CRON_SECRET}.
//
// Behavior:
//   For each proposal with status='open':
//     • If expires_at has passed AND committed_seats < min_seats →
//       mark 'expired', release all committed rows, notify everyone.
//     • If date < today (no matter the status) → also expire.
//   For each proposal with status='pending_ops_review':
//     • If date < today → ops didn't get to it, mark 'expired'.

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
  const auth = req.headers.get('authorization') ?? ''
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const db = admin()
  const now = new Date().toISOString()
  const today = new Date().toISOString().slice(0, 10)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: openProps } = await (db as any)
    .from('trip_proposals')
    .select('id, name, date, min_seats, expires_at, proposer_id, status')
    .in('status', ['open', 'pending_ops_review'])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const props = (openProps ?? []) as any[]
  const expiredIds: string[] = []

  for (const p of props) {
    let shouldExpire = false
    let reason = ''
    if (p.date < today) {
      shouldExpire = true
      reason = p.status === 'pending_ops_review'
        ? 'Proposal date passed before ops review.'
        : 'Trip date passed without funding.'
    } else if (p.status === 'open' && p.expires_at && p.expires_at <= now) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: committed } = await (db as any)
        .from('trip_proposal_commits')
        .select('seats, status')
        .eq('proposal_id', p.id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const seats = ((committed ?? []) as any[])
        .filter((c: any) => c.status === 'committed')
        .reduce((s: number, c: any) => s + (c.seats ?? 1), 0)
      if (seats < (p.min_seats ?? Infinity)) {
        shouldExpire = true
        reason = `Reached the 5-day Tropic window with ${seats}/${p.min_seats} commits.`
      }
    }

    if (!shouldExpire) continue

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from('trip_proposals').update({
        status: 'expired',
        expired_at: now,
      }).eq('id', p.id)

      // Release every still-committed row (no charges).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: commits } = await (db as any)
        .from('trip_proposal_commits')
        .select('id, member_id, status')
        .eq('proposal_id', p.id)
        .eq('status', 'committed')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const c of ((commits ?? []) as any[])) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any).from('trip_proposal_commits').update({
          status: 'released',
          released_at: now,
        }).eq('id', c.id)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any).from('notifications').insert({
          member_id: c.member_id,
          kind: 'system',
          title: 'Trip proposal expired',
          body: `"${p.name}" didn't reach its commit minimum. Your card was never charged. ${reason}`,
          ref: { proposal_id: p.id },
        })

        // Branded "no charge" email per committer.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: mr } = await (db as any).from('members').select('name').eq('id', c.member_id).maybeSingle()
        const memberEmail = await resolveEmail(db, c.member_id)
        if (memberEmail) {
          await sendProposalExpiredEmail({
            to: memberEmail,
            memberName: mr?.name ?? 'Member',
            memberId: c.member_id,
            proposalId: p.id,
            proposalName: p.name,
            tripDate: p.date,
            isProposer: c.member_id === p.proposer_id,
            reason,
          })
        }
      }

      // Proposer gets their own notification + email (if they had no
      // commit row — unlikely but possible if create's SetupIntent
      // step failed before the commit insert).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from('notifications').insert({
        member_id: p.proposer_id,
        kind: 'system',
        title: 'Your trip proposal expired',
        body: `"${p.name}" didn't reach its commit minimum. ${reason} No one was charged. Try a different date or rally the network earlier next time.`,
        ref: { proposal_id: p.id },
      })
      const proposerInCommits = ((commits ?? []) as { member_id: string }[]).some(c => c.member_id === p.proposer_id)
      if (!proposerInCommits && p.proposer_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: pr } = await (db as any).from('members').select('name').eq('id', p.proposer_id).maybeSingle()
        const proposerEmail = await resolveEmail(db, p.proposer_id)
        if (proposerEmail) {
          await sendProposalExpiredEmail({
            to: proposerEmail,
            memberName: pr?.name ?? 'Member',
            memberId: p.proposer_id,
            proposalId: p.id,
            proposalName: p.name,
            tripDate: p.date,
            isProposer: true,
            reason,
          })
        }
      }

      expiredIds.push(p.id)
    } catch (err) {
      safeError(`proposals-sweep: failed to expire ${p.id}`, err)
    }
  }

  return NextResponse.json({ ok: true, expired: expiredIds.length, ids: expiredIds })
}
