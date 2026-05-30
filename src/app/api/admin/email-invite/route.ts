import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { mintInviteCode } from '@/lib/invite-codes'
import { sendInviteLinkEmail } from '@/lib/invite-email'

// Admin-only: email a member their invitation directly. Mints a /join code and
// sends a branded email (via Resend, to the member's inbox) with a "Set up your
// account" link. The member taps it → /join → sets a password → into the app.
// No Supabase auth magic link anywhere — the link is one we control.
export async function POST(request: NextRequest) {
  let body: { memberId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const memberId = body.memberId?.trim()
  if (!memberId) return NextResponse.json({ error: 'memberId is required' }, { status: 400 })

  // Caller must be an authenticated admin.
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { data: me } = await supabase.from('members').select('id, is_admin').eq('user_id', user.id).single()
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

  // Need the member's name + email to address and send the invite.
  const [{ data: member }, { data: sens }] = await Promise.all([
    admin.from('members').select('name').eq('id', memberId).maybeSingle(),
    admin.from('member_sensitive').select('email').eq('member_id', memberId).maybeSingle(),
  ])
  const email = (sens as { email?: string } | null)?.email?.trim() || null
  if (!email) {
    return NextResponse.json({ error: 'Add an email for this member first — that’s where the invite goes.' }, { status: 400 })
  }
  const memberName = (member as { name?: string } | null)?.name ?? ''

  const minted = await mintInviteCode(admin, {
    memberId, email, createdBy: (me as { id: string }).id, origin: request.nextUrl.origin,
  })
  if ('error' in minted) return NextResponse.json({ error: `Could not create invite: ${minted.error}` }, { status: 500 })

  const sent = await sendInviteLinkEmail({ to: email, memberName, joinUrl: minted.joinUrl, code: minted.code, memberId })
  if (!sent.ok) return NextResponse.json({ error: `Invite created but email failed: ${sent.error}` }, { status: 502 })

  return NextResponse.json({ ok: true, email })
}
