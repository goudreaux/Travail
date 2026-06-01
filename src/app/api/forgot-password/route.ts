import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { mintInviteCode } from '@/lib/invite-codes'
import { sendInviteLinkEmail } from '@/lib/invite-email'
import { safeError } from '@/lib/pii-scrub'

// Public, self-serve password reset. A member enters their email on /login →
// we mint a single-use /join code bound to that email and send the branded
// "reset your password" link (Resend). Redeeming at /join sets a new password
// even for an existing login (see /api/join). Consistent with the rest of the
// app: a link we control, no Supabase auth magic-link.
//
// Always responds with a generic success regardless of whether the email
// matched a member — so this can't be used to enumerate who's a member.
const GENERIC = { ok: true as const, message: 'If that email is on a Travail membership, a reset link is on its way.' }

export async function POST(request: NextRequest) {
  let body: { email?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const email = body.email?.trim()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    // Don't leak config state to the client; log and return generic.
    safeError('forgot-password: server not configured', null)
    return NextResponse.json(GENERIC)
  }
  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  try {
    // Find the member this email belongs to (email lives in member_sensitive).
    const { data: sens } = await admin
      .from('member_sensitive')
      .select('member_id')
      .ilike('email', email)
      .maybeSingle()
    const memberId = (sens as { member_id?: string } | null)?.member_id
    if (memberId) {
      const { data: member } = await admin.from('members').select('name').eq('id', memberId).maybeSingle()
      const memberName = (member as { name?: string } | null)?.name ?? ''
      const minted = await mintInviteCode(admin, { memberId, email, origin: request.nextUrl.origin })
      if (!('error' in minted)) {
        await sendInviteLinkEmail({ to: email, memberName, joinUrl: minted.joinUrl, code: minted.code, memberId, purpose: 'reset' })
      } else {
        safeError('forgot-password: mint failed', minted.error)
      }
    }
  } catch (e) {
    // Never surface internal errors to the caller (would leak existence).
    safeError('forgot-password: unexpected', e)
  }

  return NextResponse.json(GENERIC)
}
