import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { PROPOSAL_ORIGINS } from '@/lib/destinations'

export const runtime = 'nodejs'

// Admin-only: edit a live (or pending) proposal's economics + card image.
// Per-seat price and min_seats are columns; the card image lives in
// payload.imageUrl (what the proposal card/reserve page read).
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const { data: actor } = await supabase
    .from('members').select('id, is_admin').eq('user_id', user.id).maybeSingle()
  if (!actor?.is_admin) return NextResponse.json({ error: 'Admins only' }, { status: 403 })

  let body: {
    proposalId?: string
    pricePerSeatCents?: number
    minSeats?: number
    imageUrl?: string | null
    originCode?: string
    destCode?: string
    destName?: string
  }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid payload' }, { status: 400 }) }
  const proposalId = (body.proposalId ?? '').trim()
  if (!proposalId) return NextResponse.json({ error: 'proposalId required' }, { status: 400 })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
  const db = createAdminClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prop } = await (db as any).from('trip_proposals').select('capacity_total, payload, name, origin_code').eq('id', proposalId).maybeSingle()
  if (!prop) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })

  const update: Record<string, unknown> = {}
  if (body.pricePerSeatCents != null) update.price_per_seat_cents = Math.max(0, Math.round(Number(body.pricePerSeatCents)))
  if (body.minSeats != null) {
    const cap = Number(prop.capacity_total) || 99
    update.min_seats = Math.max(1, Math.min(cap, Math.round(Number(body.minSeats))))
  }

  // Route edits — origin airport and/or destination. The destination lives in
  // the payload (destCode + destName), which is what the Route Map reads to
  // draw origin → destination. We keep these together with imageUrl so a single
  // payload write carries every payload change.
  const payloadPatch: Record<string, unknown> = {}
  if (body.imageUrl !== undefined) payloadPatch.imageUrl = (body.imageUrl || '').trim() || null
  if (body.destCode !== undefined) payloadPatch.destCode = (body.destCode || '').trim() || null
  if (body.destName !== undefined) payloadPatch.destName = (body.destName || '').trim() || null

  if (body.originCode !== undefined && body.originCode.trim()) {
    const origin = body.originCode.trim()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: ap } = await (db as any).from('airports').select('code').eq('code', origin).maybeSingle()
    if (!ap) return NextResponse.json({ error: 'Origin airport not recognized' }, { status: 400 })
    update.origin_code = origin
  }

  if (Object.keys(payloadPatch).length > 0) {
    update.payload = { ...(prop.payload ?? {}), ...payloadPatch }
  }

  // Keep the proposal name in sync with the route when both ends are known, so
  // the card / map label reflects the edit.
  const newOrigin = (update.origin_code as string | undefined) ?? prop.origin_code
  const newDestName = payloadPatch.destName as string | null | undefined
  if (newDestName && newOrigin) {
    const originLabel = PROPOSAL_ORIGINS.find(o => o.code === newOrigin)?.name ?? newOrigin
    update.name = `${originLabel} → ${newDestName}`
  }

  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any).from('trip_proposals').update(update).eq('id', proposalId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
