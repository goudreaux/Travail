// Single source of truth for "is this member allowed to create a new
// billable obligation right now?"
//
// Used by every server route that takes money from a member: pax
// reserve, anchor publish/setup-intent, etc. Returns a structured
// object so the caller can surface a useful 402 instead of a generic
// "forbidden" — frontend rendering depends on the reason.

import type { SupabaseClient } from '@supabase/supabase-js'

export type BookingBlockReason =
  | 'no_subscription'
  | 'past_due'
  | 'cancelled'
  | 'unknown'

export type CanBookResult =
  | { ok: true }
  | { ok: false; reason: BookingBlockReason; status: string | null }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function assertCanBook(db: SupabaseClient<any>, memberId: string): Promise<CanBookResult> {
  const { data } = await db
    .from('members')
    .select('subscription_status')
    .eq('id', memberId)
    .maybeSingle()

  const status = (data?.subscription_status ?? null) as string | null

  // 'incomplete' = first invoice not yet confirmed. We grant booking
  // access during this window per the instant-access policy decided
  // for the founders phase. The webhook will flip status to 'active'
  // or 'incomplete_expired' shortly.
  if (status === 'active' || status === 'trialing' || status === 'incomplete') {
    return { ok: true }
  }

  if (status === 'past_due' || status === 'unpaid') {
    return { ok: false, reason: 'past_due', status }
  }
  if (status === 'canceled' || status === 'cancelled' || status === 'incomplete_expired') {
    return { ok: false, reason: 'cancelled', status }
  }
  if (!status || status === 'none') {
    return { ok: false, reason: 'no_subscription', status }
  }
  return { ok: false, reason: 'unknown', status }
}
