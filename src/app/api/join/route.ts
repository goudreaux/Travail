import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

// Public invite-code redemption — the path-of-least-resistance signup.
//
//   GET  /api/join?code=...   → validate a code, return who it's for
//   POST /api/join            → redeem: create/affirm the login + link the
//                               member, then the client signs in.
//
// Runs entirely with the service role: no member is authenticated yet, and the
// email the login is created with comes from the CODE (bound at creation), not
// from user input — so a leaked code can't register a different address.

function adminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return null
  return createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

type CodeRow = {
  id: string
  member_id: string
  email: string | null
  expires_at: string | null
  revoked_at: string | null
  used_at: string | null
}

// Returns the live code row, or a human-readable reason it can't be used.
async function loadUsableCode(
  admin: NonNullable<ReturnType<typeof adminClient>>,
  rawCode: string,
): Promise<{ row: CodeRow } | { error: string; status: number }> {
  const code = rawCode.trim().toUpperCase()
  if (!code) return { error: 'Enter your invite code.', status: 400 }
  // invite_codes isn't in the generated Database types yet — cast like the
  // rest of the codebase does for freshly-added tables.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin as any)
    .from('invite_codes')
    .select('id, member_id, email, expires_at, revoked_at, used_at')
    .eq('code', code)
    .maybeSingle()
  const row = data as CodeRow | null
  if (!row) return { error: "That code isn't valid. Double-check it, or ask your host for a new one.", status: 404 }
  if (row.revoked_at) return { error: 'That code has been turned off. Ask your host for a new one.', status: 410 }
  if (row.used_at) return { error: 'That code has already been used. If that wasn’t you, ask your host for a new one.', status: 410 }
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    return { error: 'That code has expired. Ask your host for a fresh one.', status: 410 }
  }
  if (!row.email) return { error: 'This code has no email on file. Ask your host to regenerate it.', status: 409 }
  return { row }
}

export async function GET(request: NextRequest) {
  const admin = adminClient()
  if (!admin) return NextResponse.json({ error: 'Server not configured.' }, { status: 500 })

  const code = request.nextUrl.searchParams.get('code') ?? ''
  const result = await loadUsableCode(admin, code)
  if ('error' in result) return NextResponse.json({ ok: false, error: result.error }, { status: result.status })

  const { data: member } = await admin
    .from('members').select('name').eq('id', result.row.member_id).maybeSingle()

  return NextResponse.json({
    ok: true,
    name: (member as { name?: string } | null)?.name ?? null,
    email: result.row.email,
  })
}

export async function POST(request: NextRequest) {
  const admin = adminClient()
  if (!admin) return NextResponse.json({ error: 'Server not configured.' }, { status: 500 })

  let body: { code?: string; password?: string; name?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const password = body.password ?? ''
  if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })

  const result = await loadUsableCode(admin, body.code ?? '')
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  const { row } = result
  const email = row.email as string

  // Create the login with the code's bound email. email_confirm:true means no
  // verification email is needed — the code already proved they belong here.
  let userId: string | null = null
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (created?.user) {
    userId = created.user.id
  } else if (createErr) {
    // Email already has a login (e.g. a prior test or a re-onboard). Find it
    // and set the new password so the code still works rather than dead-ending.
    const msg = (createErr.message ?? '').toLowerCase()
    const alreadyExists = msg.includes('already') && (msg.includes('registered') || msg.includes('exist'))
    if (!alreadyExists) return NextResponse.json({ error: createErr.message }, { status: 400 })
    try {
      for (let page = 1; page <= 5 && !userId; page++) {
        const { data: list } = await admin.auth.admin.listUsers({ page, perPage: 200 })
        const match = list?.users?.find(u => (u.email ?? '').toLowerCase() === email.toLowerCase())
        if (match) userId = match.id
        if (!list || list.users.length < 200) break
      }
    } catch (e) {
      return NextResponse.json({ error: `Lookup failed: ${(e as Error).message}` }, { status: 500 })
    }
    if (!userId) return NextResponse.json({ error: 'That email already has a login that could not be located. Ask your host.' }, { status: 409 })
    const { error: pwErr } = await admin.auth.admin.updateUserById(userId, { password })
    if (pwErr) return NextResponse.json({ error: `Could not set your password: ${pwErr.message}` }, { status: 400 })
  }

  // Link the login to the member row and apply the (optional) name edit.
  const memberUpdate: Record<string, unknown> = { user_id: userId }
  const name = body.name?.trim()
  if (name) {
    memberUpdate.name = name
    memberUpdate.initials = name.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 3)
  }
  const { error: linkErr } = await admin.from('members').update(memberUpdate as never).eq('id', row.member_id)
  if (linkErr) return NextResponse.json({ error: `Account created but linking failed: ${linkErr.message}` }, { status: 500 })

  // Make sure the contact email is on file (drives notifications).
  await admin.from('member_sensitive')
    .upsert({ member_id: row.member_id, email } as never, { onConflict: 'member_id' })

  // Burn the code (single-use).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any).from('invite_codes')
    .update({ used_at: new Date().toISOString(), used_by: userId })
    .eq('id', row.id)

  // Client signs in with these (it already holds the password).
  return NextResponse.json({ ok: true, email })
}
