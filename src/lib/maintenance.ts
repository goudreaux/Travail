// "Closed for maintenance" mode — a single ops-controlled kill switch
// that freezes every money/transaction path while leaving read-only
// access (boarding passes, activity, browsing) working.
//
// The flag lives in app_settings (singleton row, id=1). Server routes
// that move money call assertTransactionsAllowed() right after their
// auth check and 503 if maintenance is on; the developer dashboard
// flips it via /api/admin/maintenance.

import type { SupabaseClient } from '@supabase/supabase-js'

export const MAINTENANCE_DEFAULT_MESSAGE =
  'Travail is closed for maintenance. You can still view your boarding passes and activity, but bookings and payments are paused right now. Please check back shortly.'

export interface MaintenanceState {
  active: boolean
  message: string
}

// Read the current maintenance state. Fails OPEN — if the row can't be
// read for any reason we report "not in maintenance" so a transient DB
// hiccup never accidentally locks the whole platform's commerce.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getMaintenance(db: SupabaseClient<any>): Promise<MaintenanceState> {
  try {
    const { data } = await db
      .from('app_settings')
      .select('maintenance_mode, maintenance_message')
      .eq('id', 1)
      .maybeSingle()
    const active = Boolean(data?.maintenance_mode)
    const message =
      (data?.maintenance_message && String(data.maintenance_message).trim()) ||
      MAINTENANCE_DEFAULT_MESSAGE
    return { active, message }
  } catch {
    return { active: false, message: MAINTENANCE_DEFAULT_MESSAGE }
  }
}

export type TransactionGate = { ok: true } | { ok: false; message: string }

// Guard for any route that creates a charge, sets up a card, commits a
// member to a transaction, captures, or refunds. Call it after the
// route's auth check; on { ok: false } return 503 with the message.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function assertTransactionsAllowed(db: SupabaseClient<any>): Promise<TransactionGate> {
  const { active, message } = await getMaintenance(db)
  return active ? { ok: false, message } : { ok: true }
}
