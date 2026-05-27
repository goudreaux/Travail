import { createClient } from '@/lib/supabase/client'
import { safeError } from '@/lib/pii-scrub'

// Append-only audit chain. Logging is best-effort — it must never block or fail
// the action it records.
export type ActivityEntry = {
  action: string
  summary: string
  actor_kind?: 'admin' | 'member' | 'system'
  actor_member_id?: string | null
  subject_member_id?: string | null
  booking_id?: string | null
  item_kind?: string | null
  item_id?: string | null
  meta?: Record<string, unknown>
}

export async function logActivity(entry: ActivityEntry): Promise<void> {
  try {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('activity_log').insert({
      action: entry.action,
      summary: entry.summary,
      actor_kind: entry.actor_kind ?? 'system',
      actor_member_id: entry.actor_member_id ?? null,
      subject_member_id: entry.subject_member_id ?? null,
      booking_id: entry.booking_id ?? null,
      item_kind: entry.item_kind ?? null,
      item_id: entry.item_id ?? null,
      meta: entry.meta ?? {},
    })
  } catch (e) {
    safeError('activity log failed', e)
  }
}
