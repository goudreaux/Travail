import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

// Admin-only: mint a per-member invite code. The recipient redeems it at
// /join?code=... — they set a password and drop straight into the app, with no
// magic-link email involved. Codes are single-use and bound to the member's
// email at creation time (see migration 059).

// Unambiguous alphabet — no 0/O/1/I/L so codes are easy to read aloud / retype.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

function generateCode(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  const chars = Array.from(bytes, b => ALPHABET[b % ALPHABET.length])
  // Grouped for legibility, e.g. "X7K2-9QPM".
  return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}`
}

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

  // The code creates a login, so the member needs an email on file.
  const { data: sens } = await admin
    .from('member_sensitive').select('email').eq('member_id', memberId).maybeSingle()
  const email = (sens as { email?: string } | null)?.email?.trim() || null
  if (!email) {
    return NextResponse.json({ error: 'Add an email for this member first — the code uses it to create their login.' }, { status: 400 })
  }

  // One live code per member: revoke any earlier unused, unrevoked codes so
  // there's never confusion about which code is current.
  // invite_codes isn't in the generated Database types yet — cast like the
  // rest of the codebase does for freshly-added tables.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const codes = () => (admin as any).from('invite_codes')

  await codes()
    .update({ revoked_at: new Date().toISOString() })
    .eq('member_id', memberId)
    .is('used_at', null)
    .is('revoked_at', null)

  // Mint a fresh code. `code` is unique; retry a couple of times on the
  // astronomically unlikely collision.
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString() // 30 days
  let code = ''
  let lastErr: string | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    code = generateCode()
    const { error } = await codes().insert({
      code,
      member_id: memberId,
      email,
      created_by: (me as { id: string }).id,
      expires_at: expiresAt,
    })
    if (!error) { lastErr = null; break }
    lastErr = error.message
    // 23505 = unique violation → regenerate; anything else → bail.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((error as any).code !== '23505') break
  }
  if (lastErr) return NextResponse.json({ error: `Could not create code: ${lastErr}` }, { status: 500 })

  const joinUrl = `${request.nextUrl.origin}/join?code=${encodeURIComponent(code)}`
  return NextResponse.json({ ok: true, code, joinUrl, email })
}
