import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

// "Invite to join" — a member invites others to grab a seat on an open trip or
// proposal. Each invitee gets a notification that deep-links to the reserve page
// where they book/commit as normal. (Route path kept as invite-split.)
//
// POST { kind: 'flight'|'excursion'|'proposal', itemId, itemName, memberIds[], note? }

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const { data: me } = await supabase.from('members').select('id, name').eq('user_id', user.id).maybeSingle()
  if (!me) return NextResponse.json({ error: 'Member record not found' }, { status: 403 })

  let body: { kind?: string; itemId?: string; itemName?: string; memberIds?: string[]; note?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid payload' }, { status: 400 }) }

  const kind = body.kind
  const itemId = (body.itemId ?? '').trim()
  const itemName = (body.itemName ?? 'a trip').trim()
  const note = (body.note ?? '').trim()
  if (!['flight', 'excursion', 'proposal'].includes(kind ?? '')) {
    return NextResponse.json({ error: 'kind must be flight, excursion, or proposal' }, { status: 400 })
  }
  if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 })
  // Dedupe, drop self, cap to keep it from being a blast tool.
  const memberIds = [...new Set(body.memberIds ?? [])].filter(id => id && id !== me.id).slice(0, 25)
  if (memberIds.length === 0) return NextResponse.json({ error: 'Pick at least one member to invite' }, { status: 400 })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
  const db = createAdminClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const firstName = (me.name ?? 'A member').split(' ')[0]
  const noteSuffix = note ? ` “${note}”` : ''
  const rows = memberIds.map(id => ({
    member_id: id,
    kind: 'system',
    title: 'You’re invited to join a trip',
    body: `${firstName} invited you to join "${itemName}" — grab a seat before it fills.${noteSuffix}`,
    // item_kind + item_id routes the notification to /reserve/<id>?kind=<kind>.
    ref: { item_kind: kind, item_id: itemId, invited_by: me.id },
    read: false,
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db.from('notifications') as any).insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, invited: memberIds.length })
}
