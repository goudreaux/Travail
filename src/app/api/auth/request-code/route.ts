import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

// Email OTP request — sends the 6-digit sign-in code.
//
// We gate it to people ops has already added: a code is only ever sent to an
// email that's on file for a member. A stranger entering a random address gets
// the same generic response but no code and no account — so this neither leaks
// who's a member (no enumeration) nor lets anyone trigger unbounded account
// creation. Built for the founder cohort, where every member is pre-created.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export async function POST(request: NextRequest) {
  let body: { email?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const email = body.email?.trim().toLowerCase()
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  if (!serviceKey) return NextResponse.json({ error: 'Server not configured.' }, { status: 500 })

  // Is this email on file for a member? (member_sensitive is RLS-protected, so
  // this lookup needs the service role.)
  const admin = createClient<Database>(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: rows } = await admin
    .from('member_sensitive').select('member_id').ilike('email', email).limit(1)
  const isMember = !!(rows && rows.length > 0)

  if (isMember) {
    // Trigger the OTP email with a throwaway anon client — signInWithOtp needs
    // no session, just sends the code. shouldCreateUser:true so a founder who
    // doesn't have an auth account yet gets one on first sign-in; they're then
    // linked to their pre-created member row by link_my_member() after verify.
    const anon = createClient<Database>(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
    const { error } = await anon.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
    if (error) {
      // Surface real send failures (rate limit, SMTP) so the member isn't left
      // waiting for a code that never comes.
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
  }

  // Generic success regardless of membership — no enumeration.
  return NextResponse.json({ ok: true })
}
