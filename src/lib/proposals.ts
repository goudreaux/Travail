// Trip Proposal types — Kickstarter for trips.
//
// A member proposes a flight or excursion; other members commit a card
// on file (no charge); if commits hit ops-set min_seats before T-5d,
// ops locks Tropic/vendors and the deposits capture. Otherwise it
// expires harmlessly.

export type ProposalStatus =
  | 'pending_ops_review'
  | 'open'
  | 'funded'
  | 'expired'
  | 'declined'
  | 'withdrawn'

export type ProposalKind = 'flight' | 'excursion'

export interface TripProposal {
  id: string
  proposer_id: string
  kind: ProposalKind
  name: string
  date: string
  origin_code: string
  // Flight payload: destCode, destName, tripType, returnDate, etc.
  // Excursion payload: stayType, depart/arrive/start/return times, etc.
  payload: Record<string, unknown>
  capacity_total: number | null
  min_seats: number | null
  price_per_seat_cents: number | null
  status: ProposalStatus
  expires_at: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  funded_at: string | null
  expired_at: string | null
  flight_id: string | null
  excursion_id: string | null
  decline_reason: string | null
  created_at: string
}

export type CommitStatus = 'committed' | 'released' | 'captured' | 'capture_failed'

export interface TripProposalCommit {
  id: string
  proposal_id: string
  member_id: string
  seats: number
  stripe_customer_id: string | null
  stripe_setup_intent_id: string | null
  payment_method_id: string | null
  status: CommitStatus
  payment_intent_id: string | null
  amount_cents: number | null
  committed_at: string
  released_at: string | null
  captured_at: string | null
}

// Proposal timing lives in the shared trip-timing module (single source
// of truth across anchors / proposals / bookings). Re-exported here so
// existing `@/lib/proposals` imports keep working unchanged.
export { PROPOSAL_RUNWAY_DAYS, PROPOSAL_MIN_LEAD_DAYS } from './trip-timing'

// Per-member cap on active proposals (pending_ops_review + open).
// Keeps the queue manageable and prevents one member from drowning
// the network in low-conviction pitches.
// TESTING: limit lifted (was 2) — restore to 2 before launch.
export const MAX_ACTIVE_PROPOSALS_PER_MEMBER = 9999

export const PROPOSAL_STATUS_LABEL: Record<ProposalStatus, string> = {
  pending_ops_review: 'Awaiting Concierge review',
  open:               'Open · gathering commits',
  funded:             'Funded · trip confirmed',
  expired:            'Expired · did not fund',
  declined:           'Declined',
  withdrawn:          'Withdrawn',
}

export const PROPOSAL_STATUS_PILL: Record<ProposalStatus, string> = {
  pending_ops_review: 'sun',
  open:               'tropic',
  funded:             'moss',
  expired:            'ink',
  declined:           'ink',
  withdrawn:          'ink',
}
