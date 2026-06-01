import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

export const runtime = 'nodejs'

// Admin-only: permanently remove a proposal. trip_proposal_commits cascade
// on delete (migration 051), and open proposals carry only cards-on-file (no
// charge happens until lock), so there's nothing to refund. Used to clear out
// bad/duplicate proposals from the board.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const { data: actor } = await supabase
    .from('members').select('id, is_admin').eq('user_id', user.id).maybeSingle()
  if (!actor?.is_admin) return NextResponse.json({ error: 'Admins only' }, { status: 403 })

  let body: { proposalId?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid payload' }, { status: 400 }) }
  const proposalId = (body.proposalId ?? '').trim()
  if (!proposalId) return NextResponse.json({ error: 'proposalId required' }, { status: 400 })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
  const db = createAdminClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Guard against removing a funded proposal — that one's already turned into a
  // real flight/excursion booking and shouldn't be silently deleted.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prop } = await (db as any).from('trip_proposals').select('status').eq('id', proposalId).maybeSingle()
  if (!prop) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
  if (prop.status === 'funded') {
    return NextResponse.json({ error: 'This proposal already funded into a booking — cancel the trip instead.' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any).from('trip_proposals').delete().eq('id', proposalId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
