import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { safeError } from '@/lib/pii-scrub'
import type { Database } from '@/lib/supabase/types'
import crypto from 'crypto'

// Activity beacon — receives pings from the client every ~60s.
//
// The "session" model is simple: if the member has a session whose
// ended_at is within the last 5 minutes, we treat this ping as a
// continuation and just touch ended_at. Otherwise we start a new
// session row. This avoids one row per page navigation while still
// giving us realistic session-duration numbers.
//
// The first ping of a session also bumps last_active_at on the
// member row (cheap denormalization for the ops "who's around" view).
// Login count + last_login_at are bumped by a separate path (auth
// state change → /api/activity/login).
//
// Privacy: we hash the IP rather than storing it raw. User agent is
// stored verbatim so ops can tell mobile from desktop sessions; ditch
// that field if it ever becomes a privacy concern.

export const runtime = 'nodejs'

const SESSION_CONTINUATION_MINUTES = 5

function admin() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured')
  return createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

function hashIp(ip: string | null): string | null {
  if (!ip) return null
  const salt = process.env.ACTIVITY_IP_SALT ?? 'travail-default-salt'
  return crypto.createHash('sha256').update(salt + ip).digest('hex').slice(0, 32)
}

export async function POST(req: NextRequest) {
  // Beacon is fire-and-forget from the client — never bounce an error
  // back; just log and 204 so the browser doesn't retry-storm.
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return new NextResponse(null, { status: 204 })

    const db = admin()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: meRow } = await (db as any)
      .from('members').select('id').eq('user_id', user.id).maybeSingle()
    if (!meRow) return new NextResponse(null, { status: 204 })
    const memberId = meRow.id as string

    const userAgent = req.headers.get('user-agent') ?? null
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? req.headers.get('x-real-ip')
      ?? null
    const ipH = hashIp(ip)

    const cutoff = new Date(Date.now() - SESSION_CONTINUATION_MINUTES * 60_000).toISOString()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (db as any)
      .from('member_sessions')
      .select('id, page_views')
      .eq('member_id', memberId)
      .gte('ended_at', cutoff)
      .order('ended_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const now = new Date().toISOString()

    if (existing?.id) {
      // Continuing session — extend ended_at and bump the view counter.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any)
        .from('member_sessions')
        .update({ ended_at: now, page_views: (existing.page_views ?? 1) + 1 })
        .eq('id', existing.id)
    } else {
      // New session.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from('member_sessions').insert({
        member_id: memberId,
        started_at: now,
        ended_at: now,
        page_views: 1,
        user_agent: userAgent?.slice(0, 500) ?? null,
        ip_hash: ipH,
      })
    }

    // Atomic bump via the bump_member_activity RPC (migration 052).
    // Read-then-write would lose minutes when multiple tabs ping
    // concurrently; the RPC runs as a single `column = column + delta`
    // UPDATE so the count stays correct. Delta is the minutes since
    // last beacon, capped at the continuation window so a long-idle
    // tab doesn't inflate the count.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: m } = await (db as any)
      .from('members').select('last_active_at').eq('id', memberId).maybeSingle()
    let delta = 1
    if (m?.last_active_at) {
      const ms = Date.now() - new Date(m.last_active_at).getTime()
      delta = Math.min(SESSION_CONTINUATION_MINUTES, Math.max(0, Math.round(ms / 60_000)))
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).rpc('bump_member_activity', { p_member_id: memberId, p_delta_minutes: delta })

    return new NextResponse(null, { status: 204 })
  } catch (err) {
    safeError('activity/beacon: failed (non-fatal)', err)
    return new NextResponse(null, { status: 204 })
  }
}
