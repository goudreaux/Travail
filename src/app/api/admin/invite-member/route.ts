import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

// Admin-only: email a true Supabase INVITE to a member and link the new auth
// user to their member record. An invite (type=invite) lands the recipient on
// /onboarding to set a password and complete their profile — that is the one
// and only flow this route produces.
//
// The tricky case is an email that already exists in auth.users — e.g. from a
// prior invite/test, or a member whose login we want to reset and send back
// through onboarding. Supabase refuses to invite an address that already
// exists, so rather than fall back to a password-RESET email (which drops the
// recipient on the reset-password screen, not onboarding), we delete the stale
// auth user and send a fresh invite. members.user_id is `on delete set null`
// (migration 001), so deleting the auth user only UNLINKS it — the member row,
// profile, and bookings all survive — and we relink to the new auth user below.
//
// Requires SUPABASE_SERVICE_ROLE_KEY on the server and Supabase email/SMTP
// configured (with /onboarding in the redirect allowlist).
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

  // Sends a true invite and links the resulting auth user to the member row.
  async function inviteAndLink(): Promise<NextResponse> {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email!, { redirectTo })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    if (data.user) {
      const { error: linkErr } = await admin.from('members').update({ user_id: data.user.id }).eq('id', memberId!)
      if (linkErr) return NextResponse.json({ error: `Invite sent but linking failed: ${linkErr.message}` }, { status: 500 })
    }
    return NextResponse.json({ ok: true, mode: 'invite' })
  }

  // Happy path: brand-new email — invite succeeds outright.
  const first = await admin.auth.admin.inviteUserByEmail(email, { redirectTo })
  if (!first.error) {
    if (first.data.user) {
      const { error: linkErr } = await admin.from('members').update({ user_id: first.data.user.id }).eq('id', memberId)
      if (linkErr) return NextResponse.json({ error: `Invite sent but linking failed: ${linkErr.message}` }, { status: 500 })
    }
    return NextResponse.json({ ok: true, mode: 'invite' })
  }

  // Any error other than "already registered" is a real failure.
  const msg = (first.error.message ?? '').toLowerCase()
  const alreadyExists = msg.includes('already') && (msg.includes('registered') || msg.includes('exist'))
  if (!alreadyExists) {
    return NextResponse.json({ error: first.error.message }, { status: 400 })
  }

  // The email already has an auth user. Find it so we can clear it and send a
  // clean invite. listUsers paginates; the member cohort is small, so the first
  // few pages cover it. (If it ever grows past this, switch to a server-side
  // filtered lookup.)
  let existingId: string | null = null
  try {
    for (let page = 1; page <= 5 && !existingId; page++) {
      const { data: list } = await admin.auth.admin.listUsers({ page, perPage: 200 })
      const match = list?.users?.find(u => (u.email ?? '').toLowerCase() === email.toLowerCase())
      if (match) existingId = match.id
      if (!list || list.users.length < 200) break
    }
  } catch (e) {
    return NextResponse.json({ error: `User exists in auth but lookup failed: ${(e as Error).message}` }, { status: 500 })
  }
  if (!existingId) {
    // Supabase says it exists but we couldn't find it (e.g. cohort beyond the
    // pages scanned). Surface a clear, actionable message rather than guessing.
    return NextResponse.json({
      error: 'That email already has a login but it could not be located to reset. Remove it in Supabase → Authentication → Users, then re-invite.',
    }, { status: 409 })
  }

  // Guard: refuse to hijack an email that belongs to a DIFFERENT member.
  const { data: linkedMember } = await admin
    .from('members').select('id, name').eq('user_id', existingId).maybeSingle()
  if (linkedMember && (linkedMember as { id: string }).id !== memberId) {
    return NextResponse.json({
      error: `That email already belongs to another member (${(linkedMember as { name: string }).name}). Use a different email.`,
    }, { status: 409 })
  }

  // Clear the stale login (FK `on delete set null` just unlinks it) and invite fresh.
  const { error: delErr } = await admin.auth.admin.deleteUser(existingId)
  if (delErr) {
    return NextResponse.json({ error: `Could not reset the existing login: ${delErr.message}` }, { status: 400 })
  }
  return inviteAndLink()
}
