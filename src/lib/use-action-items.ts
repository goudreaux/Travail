'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// Counts the things on a member's plate that need their attention,
// split by the nav slot the badge should hang on. Used by the
// (member) layout to badge the sidebar + bottom bar.
//
// Triggers (all four enabled per product):
//   tripsCount (badges "My Trips"):
//     • a quote is ready to accept   → anchor_submissions.status = 'quoted'
//     • a pending booking got decided → booking flipped to
//       approved/declined since the member last cleared it. We treat
//       any approved-but-unseen or declined booking as actionable; the
//       simplest honest signal is "has a booking in a terminal state
//       the member hasn't opened." Without a per-booking seen flag we
//       approximate with declined bookings (a clear call-to-action) +
//       quoted anchors.
//   proposalsCount (badges "Proposals"):
//     • a proposal the member is on hit its minimum (awaiting lock)
//     • a proposal funded or expired (terminal, worth a look)
//
// All counts are best-effort: any query failure yields 0 for that
// bucket rather than throwing. RLS already scopes every table to the
// member, so these selects only ever see the caller's own rows.

export interface ActionItemCounts {
  tripsCount: number
  proposalsCount: number
  total: number
}

const EMPTY: ActionItemCounts = { tripsCount: 0, proposalsCount: 0, total: 0 }

export function useActionItems(memberId: string | null): ActionItemCounts {
  const supabase = createClient()
  const [counts, setCounts] = useState<ActionItemCounts>(EMPTY)

  useEffect(() => {
    if (!memberId) { setCounts(EMPTY); return }
    let cancelled = false

    async function load() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any
      let tripsCount = 0
      let proposalsCount = 0

      // ── Anchor quotes awaiting accept + decided bookings ──────────
      try {
        const { data: quoted } = await db
          .from('anchor_submissions')
          .select('id')
          .eq('member_id', memberId)
          .eq('status', 'quoted')
        tripsCount += (quoted?.length ?? 0)
      } catch { /* best effort */ }

      try {
        // Declined bookings are a clear "ops acted, look here" signal.
        const { data: declined } = await db
          .from('bookings')
          .select('id')
          .eq('member_id', memberId)
          .eq('status', 'declined')
        tripsCount += (declined?.length ?? 0)
      } catch { /* best effort */ }

      // ── Proposal updates ──────────────────────────────────────────
      // Proposals the member proposed OR committed to, that are now
      // funded / expired, or open-but-at-minimum (awaiting ops lock).
      try {
        // Proposals I proposed.
        const { data: mine } = await db
          .from('trip_proposals')
          .select('id, status, min_seats, proposer_id')
          .eq('proposer_id', memberId)
          .in('status', ['open', 'funded', 'expired'])

        // Proposals I committed to (via my commit rows).
        const { data: myCommits } = await db
          .from('trip_proposal_commits')
          .select('proposal_id, status')
          .eq('member_id', memberId)
          .in('status', ['committed', 'captured'])

        const committedIds: string[] = [...new Set((myCommits ?? [])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((c: any) => c.proposal_id as string))] as string[]
        let committedProps: { id: string; status: string; min_seats: number | null }[] = []
        if (committedIds.length) {
          const { data: cp } = await db
            .from('trip_proposals')
            .select('id, status, min_seats')
            .in('id', committedIds)
            .in('status', ['open', 'funded', 'expired'])
          committedProps = cp ?? []
        }

        // Union of proposal ids that are worth flagging.
        const flagged = new Set<string>()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const consider = async (rows: any[]) => {
          for (const p of rows) {
            if (p.status === 'funded' || p.status === 'expired') {
              flagged.add(p.id)
              continue
            }
            // open → only flag if it hit minimum (awaiting lock).
            if (p.status === 'open' && p.min_seats) {
              const { data: cms } = await db
                .from('trip_proposal_commits')
                .select('seats, status')
                .eq('proposal_id', p.id)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const seats = (cms ?? [])
                .filter((c: any) => c.status === 'committed' || c.status === 'captured')
                .reduce((s: number, c: any) => s + (c.seats ?? 1), 0)
              if (seats >= p.min_seats) flagged.add(p.id)
            }
          }
        }
        await consider(mine ?? [])
        await consider(committedProps)
        proposalsCount = flagged.size
      } catch { /* best effort */ }

      if (!cancelled) {
        setCounts({
          tripsCount,
          proposalsCount,
          total: tripsCount + proposalsCount,
        })
      }
    }

    load()
    return () => { cancelled = true }
  }, [memberId]) // eslint-disable-line react-hooks/exhaustive-deps

  return counts
}
