import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

// Admin-only: email a Supabase invite to a pre-created member and link the new
// auth user to their member record. Requires SUPABASE_SERVICE_ROLE_KEY on the
// server and Supabase email/SMTP configured (with /onboarding in the redirect
// allowlist).
export async function POST(request: NextRequest) {
  let body: { memberId?: string; email?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const memberId = body.memberId?.trim()
  const email = body.email?.trim()
  if (!memberId || !email) {
    return NextResponse.json({ error: 'memberId and email are required' }, { status: 400 })
  }

  // The caller must be an authenticated admin.
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { data: me } = await supabase.from('members').select('is_admin').eq('user_id', user.id).single()
  if (!me?.is_admin) return NextResponse.json({ error: 'Admins only' }, { status: 403 })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not configured on the server.' }, { status: 500 })
  }

  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const redirectTo = `${request.nextUrl.origin}/onboarding`
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // Link the new auth user to the pre-created member record.
  if (data.user) {
    const { error: linkErr } = await admin.from('members').update({ user_id: data.user.id }).eq('id', memberId)
    if (linkErr) return NextResponse.json({ error: `Invite sent but linking failed: ${linkErr.message}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
