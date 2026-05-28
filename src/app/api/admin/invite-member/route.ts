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
    // The most common failure mode: the auth user already exists from a
    // prior invite/signup that was later deleted from public.members but
    // not from auth.users. Supabase refuses the invite — the email is
    // already registered — so we transparently fall back to a recovery
    // (password-reset) email, which works for existing auth users and
    // also drops them on /onboarding to walk through profile setup.
    const msg = (error.message ?? '').toLowerCase()
    const alreadyExists = msg.includes('already') && (msg.includes('registered') || msg.includes('exist'))

    if (!alreadyExists) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // Look up the existing auth user so we can link them to the new
    // member row, then trigger the recovery email.
    let authUserId: string | null = null
    try {
      // listUsers paginates; the founder cohort is small so the first
      // page is enough. If the cohort grows past a thousand we'll need
      // to filter server-side.
      const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 })
      const match = list?.users?.find(u => (u.email ?? '').toLowerCase() === email.toLowerCase())
      authUserId = match?.id ?? null
    } catch (e) {
      return NextResponse.json({
        error: `User exists in auth but lookup failed: ${(e as Error).message}`,
      }, { status: 500 })
    }

    if (authUserId) {
      const { error: linkErr } = await admin.from('members').update({ user_id: authUserId }).eq('id', memberId)
      if (linkErr) {
        return NextResponse.json({ error: `Linking existing auth user failed: ${linkErr.message}` }, { status: 500 })
      }
    }

    // Send a recovery link. Supabase ships it via the configured SMTP /
    // email provider using the "Reset Password" template.
    const { error: recoveryErr } = await admin.auth.resetPasswordForEmail(email, { redirectTo })
    if (recoveryErr) {
      return NextResponse.json({ error: `Recovery email failed: ${recoveryErr.message}` }, { status: 400 })
    }
    return NextResponse.json({ ok: true, mode: 'recovery' })
  }

  // Fresh invite path — link the new auth user to the member row.
  if (data.user) {
    const { error: linkErr } = await admin.from('members').update({ user_id: data.user.id }).eq('id', memberId)
    if (linkErr) return NextResponse.json({ error: `Invite sent but linking failed: ${linkErr.message}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true, mode: 'invite' })
}
