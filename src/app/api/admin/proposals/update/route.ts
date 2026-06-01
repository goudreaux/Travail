import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

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

  let body: { proposalId?: string; pricePerSeatCents?: number; minSeats?: number; imageUrl?: string | null }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid payload' }, { status: 400 }) }
  const proposalId = (body.proposalId ?? '').trim()
  if (!proposalId) return NextResponse.json({ error: 'proposalId required' }, { status: 400 })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
  const db = createAdminClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prop } = await (db as any).from('trip_proposals').select('capacity_total, payload').eq('id', proposalId).maybeSingle()
  if (!prop) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })

  const update: Record<string, unknown> = {}
  if (body.pricePerSeatCents != null) update.price_per_seat_cents = Math.max(0, Math.round(Number(body.pricePerSeatCents)))
  if (body.minSeats != null) {
    const cap = Number(prop.capacity_total) || 99
    update.min_seats = Math.max(1, Math.min(cap, Math.round(Number(body.minSeats))))
  }
  if (body.imageUrl !== undefined) {
    update.payload = { ...(prop.payload ?? {}), imageUrl: (body.imageUrl || '').trim() || null }
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any).from('trip_proposals').update(update).eq('id', proposalId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
