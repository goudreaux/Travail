import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { notifyOps } from '@/lib/ops-notify'
import { safeError } from '@/lib/pii-scrub'
import type { Database } from '@/lib/supabase/types'

// Fire-and-forget ops notification for a freshly submitted anchor.
//
// The anchor wizards insert the anchor_submissions row client-side
// (member's own Supabase session). Ops needs to know so they can
// review/publish, so the wizard calls this route immediately after
// the insert. The route looks up the submission server-side so we
// never trust client-supplied details for the email content.
//
// Safe to call from any signed-in member; the route only emails ops
// if the submission actually belongs to the caller.

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

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  let payload: { submissionId?: string }
  try { payload = await req.json() } catch { return NextResponse.json({ error: 'Invalid payload' }, { status: 400 }) }
  const submissionId = (payload.submissionId ?? '').trim()
  if (!submissionId) return NextResponse.json({ error: 'submissionId required' }, { status: 400 })

  const { data: meRow } = await supabase
    .from('members').select('id, name, member_no').eq('user_id', user.id).maybeSingle()
  if (!meRow) return NextResponse.json({ error: 'Member record not found' }, { status: 403 })

  const db = admin()
  const { data: sub } = await db
    .from('anchor_submissions')
    .select('id, kind, member_id, payload, submitted_at')
    .eq('id', submissionId)
    .maybeSingle()
  if (!sub || sub.member_id !== meRow.id) {
    // Not theirs (or not found) — return 200 anyway so the wizard
    // doesn't show a misleading error; the row just won't get notified.
    return NextResponse.json({ ok: true, skipped: true })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = (sub.payload ?? {}) as any

  try {
    await notifyOps({
      kind: 'anchor_submission',
      member: {
        name: meRow.name ?? null,
        memberCode: meRow.member_no ? `#${meRow.member_no}` : null,
        email: user.email ?? null,
      },
      item: {
        kind: sub.kind as 'flight' | 'excursion',
        id: sub.id,
        name: body.name ?? null,
        date: body.date ?? null,
      },
      details: {
        Kind: sub.kind,
        Origin: body.originCode ?? undefined,
        Destination: body.destCode ?? undefined,
        Seats: body.seatsTotal ?? body.spotsTotal ?? undefined,
        'Anchor seats': body.seatsAnchor ?? body.spotsAnchor ?? undefined,
        Visibility: body.visibility ?? undefined,
        'Submitted at': sub.submitted_at,
      },
      note: body.pitch ? `Anchor's pitch:\n${body.pitch}` : 'New anchor submission awaiting Ops review in the queue.',
    })
  } catch (e) {
    safeError('notify-submitted: notifyOps failed (non-fatal)', e)
  }

  return NextResponse.json({ ok: true })
}
