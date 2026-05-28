// Member-to-ops referral types. Schema in migration 048.

export type ReferralStatus =
  | 'pending'      // submitted, awaiting ops review
  | 'contacted'    // ops has reached out to the prospect
  | 'invited'      // ops invited them; they're either pending or a member
  | 'declined'     // ops decided no
  | 'withdrawn'    // member retracted before ops acted

export interface Referral {
  id: string
  referrer_id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  why: string | null
  status: ReferralStatus
  ops_notes: string | null
  decided_at: string | null
  decided_by: string | null
  invited_member_id: string | null
  created_at: string
}

export const REFERRAL_STATUS_LABEL: Record<ReferralStatus, string> = {
  pending:   'Pending review',
  contacted: 'In conversation',
  invited:   'Invited',
  declined:  'Declined',
  withdrawn: 'Withdrawn',
}

export const REFERRAL_STATUS_PILL: Record<ReferralStatus, string> = {
  pending:   'sun',
  contacted: 'tropic',
  invited:   'moss',
  declined:  'ink',
  withdrawn: 'ink',
}
