// Tropic blackout dates — dates with no aircraft available. Single source of
// truth is the blackout_dates table, managed by the Concierge Team. These pure
// helpers are usable from both client and server (no React imports here; the
// client hook lives in use-blackout.ts).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (t: string) => any }

export interface BlackoutRow {
  date: string // YYYY-MM-DD
  note: string | null
}

// All blackout dates today or later (what the wizards + member calendar need).
export async function fetchBlackoutDates(supabase: Db): Promise<string[]> {
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await supabase
    .from('blackout_dates')
    .select('date')
    .gte('date', today)
    .order('date')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map(r => r.date as string)
}

// Full rows (incl. notes) for the Concierge management view.
export async function fetchBlackoutRows(supabase: Db): Promise<BlackoutRow[]> {
  const { data } = await supabase
    .from('blackout_dates')
    .select('date, note')
    .order('date')
  return (data ?? []) as BlackoutRow[]
}

// Server-side check (e.g. in API routes) — is this date blacked out?
export async function isBlackout(supabase: Db, date: string): Promise<boolean> {
  if (!date) return false
  const { data } = await supabase.from('blackout_dates').select('date').eq('date', date).maybeSingle()
  return !!data
}
