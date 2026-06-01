import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { asItinerary } from '@/lib/itinerary'
import type { Database } from '@/lib/supabase/types'

export const runtime = 'nodejs'

// Admin-only: author/replace the day-plan itinerary on a proposal. Stored in
// the proposal's flexible `payload` jsonb (payload.itinerary), so no schema
// change. Members see it on the proposal reserve page (falling back to an
// auto-generated default when empty). Works in any non-terminal status so ops
// can write it during review or after it's gone live.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const { data: actor } = await supabase
    .from('members').select('id, is_admin').eq('user_id', user.id).maybeSingle()
  if (!actor?.is_admin) return NextResponse.json({ error: 'Admins only' }, { status: 403 })

  let body: { proposalId?: string; itinerary?: unknown }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid payload' }, { status: 400 }) }
  const proposalId = (body.proposalId ?? '').trim()
  if (!proposalId) return NextResponse.json({ error: 'proposalId required' }, { status: 400 })

  // Sanitize through the same coercion the reader uses.
  const steps = asItinerary(body.itinerary)

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
  const db = createAdminClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prop } = await (db as any).from('trip_proposals').select('payload').eq('id', proposalId).maybeSingle()
  if (!prop) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })

  const payload = { ...(prop.payload ?? {}), itinerary: steps }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any).from('trip_proposals').update({ payload }).eq('id', proposalId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, steps: steps.length })
}
