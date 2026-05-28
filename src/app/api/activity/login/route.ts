import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { safeError } from '@/lib/pii-scrub'
import type { Database } from '@/lib/supabase/types'

// Stamps last_login_at + increments login_count on the signed-in
// member. Fired by the client on the auth state change → 'SIGNED_IN'
// event. Idempotent within a short window — the client only calls
// once per sign-in, so we don't bother debouncing here.

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

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return new NextResponse(null, { status: 204 })

    const db = admin()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: m } = await (db as any)
      .from('members').select('id, login_count').eq('user_id', user.id).maybeSingle()
    if (!m) return new NextResponse(null, { status: 204 })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('members').update({
      last_login_at: new Date().toISOString(),
      login_count: (m.login_count ?? 0) + 1,
    }).eq('id', m.id)

    return new NextResponse(null, { status: 204 })
  } catch (err) {
    safeError('activity/login: failed (non-fatal)', err)
    return new NextResponse(null, { status: 204 })
  }
}
