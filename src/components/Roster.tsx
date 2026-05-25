'use client'
import Link from 'next/link'
import type { SupabaseClient } from '@supabase/supabase-js'

export type RosterEntry = {
  item_id: string
  member_id: string
  name: string
  initials: string
  avatar_url: string | null
  seats: number
}

// Fetch opted-in rosters for a set of trips in one call. Returns a map keyed by
// item_id. Never throws — an empty map just means no roster shown.
export async function fetchRosters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  itemKind: 'flight' | 'excursion',
  itemIds: string[],
): Promise<Record<string, RosterEntry[]>> {
  const out: Record<string, RosterEntry[]> = {}
  const ids = [...new Set(itemIds)].filter(Boolean)
  if (!ids.length) return out
  try {
    const { data, error } = await supabase.rpc('trip_roster', { p_item_kind: itemKind, p_item_ids: ids })
    if (error) return out
    for (const r of (data ?? []) as RosterEntry[]) (out[r.item_id] ??= []).push(r)
  } catch { /* roster is supplementary */ }
  return out
}

function AvatarDot({ entry, size }: { entry: RosterEntry; size: number }) {
  if (entry.avatar_url) {
    return (
      <img
        src={entry.avatar_url}
        alt={entry.name}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', display: 'block', border: '2px solid var(--paper)' }}
      />
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'var(--night)', color: 'var(--tropic)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--mono)', fontSize: size * 0.34, fontWeight: 700,
      border: '2px solid var(--paper)',
    }}>
      {entry.initials}
    </div>
  )
}

// Compact overlapping avatar stack for the board cards.
export function RosterStack({ entries, max = 4, occupied }: { entries: RosterEntry[]; max?: number; occupied?: number }) {
  const shown = entries.slice(0, max)
  const extra = entries.length - shown.length
  const totalSeats = entries.reduce((s, e) => s + e.seats, 0)
  // Members are the avatars; any seats beyond one-per-member are their guests.
  const totalGuests = Math.max(0, totalSeats - entries.length)
  // Seats held by members who kept their booking private — teased without names.
  const others = occupied != null ? Math.max(0, occupied - totalSeats) : 0

  if (!entries.length && others === 0) return null

  const parts: string[] = []
  if (totalGuests > 0) parts.push(`+${totalGuests} guest${totalGuests !== 1 ? 's' : ''}`)
  if (others > 0) parts.push(`+${others} other${others !== 1 ? 's' : ''}`)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }} title={entries.length ? `${entries.map(e => e.name).join(', ')} on this trip` : 'Members going'}>
      <div style={{ display: 'flex' }}>
        {shown.map((e, i) => (
          <div key={e.member_id} style={{ marginLeft: i === 0 ? 0 : -8, zIndex: shown.length - i }}>
            <AvatarDot entry={e} size={24} />
          </div>
        ))}
        {extra > 0 && (
          <div style={{
            marginLeft: -8, width: 24, height: 24, borderRadius: '50%',
            background: 'var(--warm)', color: 'var(--ink-mid)', border: '2px solid var(--paper)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700,
          }}>
            +{extra}
          </div>
        )}
        {/* All-private trip: a faceless avatar so "people are going" still reads. */}
        {entries.length === 0 && others > 0 && (
          <div style={{
            width: 24, height: 24, borderRadius: '50%',
            background: 'var(--warm)', border: '2px solid var(--paper)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-light)',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="8.5" r="3.4" />
              <path d="M5.5 19.5c0-3.4 3-5 6.5-5s6.5 1.6 6.5 5" />
            </svg>
          </div>
        )}
      </div>
      {parts.length > 0 && (
        <span style={{ fontSize: 11, color: 'var(--ink-light)', fontFamily: 'var(--mono)', letterSpacing: '0.03em' }}>
          {parts.join(' · ')}
        </span>
      )}
    </div>
  )
}

// Full roster with names + links to member cards (trip detail page).
export function RosterList({ entries }: { entries: RosterEntry[] }) {
  if (!entries.length) {
    return <div style={{ fontSize: 13, color: 'var(--ink-light)' }}>No one has shared their spot yet — be the first.</div>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {entries.map(e => (
        <Link
          key={e.member_id}
          href={`/network/${e.member_id}`}
          style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' }}
        >
          <AvatarDot entry={e} size={34} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>
              {e.name}{e.seats > 1 ? <span style={{ color: 'var(--ink-light)', fontWeight: 400 }}> +{e.seats - 1}</span> : null}
            </div>
          </div>
          <span style={{ fontSize: 11.5, color: 'var(--tropic-d)', fontWeight: 500 }}>View →</span>
        </Link>
      ))}
    </div>
  )
}
