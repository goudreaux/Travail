import type { Notification } from '@/lib/supabase/types'

// Resolve where a notification should land the member when tapped.
// Returns null for "announcement-only" notifications (cancelled trips,
// welcomes, submission acks) — UI should render those as non-clickable.
// Cleaner than routing a 'Trip cancelled' notification to a trip page
// that no longer exists.
//
// Used by both the notifications drawer in the topbar and the
// dedicated /notifications page.

export function resolveNotificationRoute(n: Notification): string | null {
  const ref = (n.ref ?? {}) as Record<string, unknown>
  const titleLower = (n.title ?? '').toLowerCase()

  // Terminal announcements — there's nothing for the user to do here.
  if (
    titleLower.includes('cancelled')
    || titleLower.includes('forfeit')
    || titleLower.includes('declined')
    || titleLower.includes('refunded')
    || titleLower.startsWith('welcome')
    || titleLower.includes('submitted for review')
  ) {
    return null
  }

  // Quote ready → in-app review screen with Accept / Decline.
  if (ref.kind === 'anchor_quote' && ref.anchor_submission_id) {
    return `/anchor-quote/${ref.anchor_submission_id}`
  }

  // Friend / contact requests → requester's profile (Accept lives there).
  const requesterId = ref.requester_id as string | undefined
  if ((n.kind === 'friend' || n.kind === 'contact') && requesterId) {
    return `/network/${requesterId}`
  }

  // Booking ref → boarding pass. Covers 'Booking confirmed',
  // 'Payment received', settlement receipts.
  const bookingId = ref.booking_id as string | undefined
  if (bookingId) {
    return `/boarding-pass/${bookingId}`
  }

  // Trip context → reserve page (also acts as the trip detail page).
  const itemKind = ref.item_kind as string | undefined
  const itemId = ref.item_id as string | undefined
  if (itemKind && itemId) {
    return `/reserve/${itemId}?kind=${itemKind}`
  }

  // Anchor submission context only → the quote review page.
  const anchorSubId = ref.anchor_submission_id as string | undefined
  if (anchorSubId) {
    return `/anchor-quote/${anchorSubId}`
  }

  return null
}
