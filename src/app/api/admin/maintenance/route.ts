import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { safeError } from '@/lib/pii-scrub'
import { getMaintenance } from '@/lib/maintenance'
import type { Database } from '@/lib/supabase/types'

// Read + toggle the "Closed for maintenance" kill switch. Admin-only.
//
//   GET  → { active, message }            current state, for the dev UI
//   POST → { enabled, message? }          flip it; returns the new state
//
// When active, every money route 503s via assertTransactionsAllowed().

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

// Shared admin gate — returns the member row on success, or a NextResponse to bail with.
async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  const { data: meRow } = await supabase
    .from('members').select('id, is_admin').eq('user_id', user.id).maybeSingle()
  if (!meRow?.is_admin) return { error: NextResponse.json({ error: 'Admins only' }, { status: 403 }) }
  return { meRow }
}

export async function GET() {
  const gate = await requireAdmin()
  if ('error' in gate) return gate.error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const state = await getMaintenance(admin() as any)
  return NextResponse.json(state)
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if ('error' in gate) return gate.error
  const { meRow } = gate

  let body: { enabled?: boolean; message?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid payload' }, { status: 400 }) }

  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled (boolean) required' }, { status: 400 })
  }
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 280) : undefined

  const db = admin()
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('app_settings').update({
      maintenance_mode: body.enabled,
      // Only overwrite the message when one was provided, so toggling
      // off/on doesn't wipe a previously-set custom message.
      ...(message !== undefined ? { maintenance_message: message || null } : {}),
      updated_at: new Date().toISOString(),
      updated_by: meRow!.id,
    }).eq('id', 1)

    // Append-only audit so we can see who flipped it and when.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('activity_log').insert({
      action: body.enabled ? 'maintenance_enabled' : 'maintenance_disabled',
      summary: body.enabled
        ? 'Closed the platform for maintenance — transactions frozen.'
        : 'Reopened the platform — transactions resumed.',
      actor_kind: 'admin',
      actor_member_id: meRow!.id,
      meta: message ? { message } : {},
    }).then(() => {}, () => {})

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const state = await getMaintenance(db as any)
    return NextResponse.json(state)
  } catch (err) {
    safeError('admin/maintenance: update failed', err)
    return NextResponse.json({ error: 'Failed to update maintenance mode' }, { status: 500 })
  }
}
