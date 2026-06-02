// Shared Route Map data loader. Both the Concierge dashboard map and the
// member-facing map call this, so the two never drift — the member view is fed
// by exactly the same logic as the Concierge view.
//
// Returns the open-network "routes" (open/full flights, open/full excursions,
// open proposals) as RouteItems the globe can draw, resolving names +
// coordinates from the Location Library.

import { fetchLocations, coordsFromLocations, type LibraryLocation } from '@/lib/locations'
import { destName as friendlyDestName } from '@/lib/destinations'
import type { RouteItem } from '@/components/RouteGlobe'

export const ROUTE_ACCENT: Record<RouteItem['kind'], string> = {
  flight: '#00b3c7',
  excursion: '#5bbfa3',
  proposal: '#f4a72c',
}

export const ROUTE_KIND_LABEL: Record<RouteItem['kind'], string> = {
  flight: 'Open seats',
  excursion: 'Excursion',
  proposal: 'Proposal',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (t: string) => any }

export async function loadRouteItems(supabase: Db): Promise<RouteItem[]> {
  const [flightsRes, excursionsRes, proposalsRes, locs, templatesRes] = await Promise.all([
    supabase.from('flights').select('id, name, origin_code, dest_code, date, status').in('status', ['open', 'full']),
    supabase.from('excursions').select('id, name, origin_code, dest_code, date, status, template_id').in('status', ['open', 'full']),
    // Proposals may be denied by RLS in some contexts — tolerate failure.
    supabase.from('trip_proposals').select('id, name, kind, origin_code, payload, date, status').eq('status', 'open').then(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (r: any) => r, () => ({ data: [] }),
    ),
    fetchLocations(supabase),
    supabase.from('excursion_templates').select('id, dest_code'),
  ])

  // template_id → dest_code, so an excursion draws airport → activity.
  const destByTemplate: Record<string, string> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const t of (templatesRes.data ?? []) as any[]) destByTemplate[t.id] = t.dest_code

  // The Library is the source of truth for names + coordinates.
  const locations = (locs ?? []) as LibraryLocation[]
  const place: Record<string, string> = {}
  for (const a of locations) place[a.code] = a.name
  const name = (code: string | null | undefined) => (code ? place[code] ?? code : '')
  const coordFor = (code: string | null | undefined) => coordsFromLocations(locations, code)
  const fmtDate = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  const next: RouteItem[] = []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const f of (flightsRes.data ?? []) as any[]) {
    const origin = coordFor(f.origin_code)
    if (!origin) continue
    next.push({
      id: f.id,
      kind: 'flight',
      label: `${name(f.origin_code)} → ${name(f.dest_code)}`,
      sub: `${fmtDate(f.date)}${f.status === 'full' ? ' · Full' : ' · Open seats'}`,
      origin,
      dest: coordFor(f.dest_code),
      originName: name(f.origin_code),
      destName: name(f.dest_code),
      href: `/reserve/${f.id}?kind=flight`,
      accent: ROUTE_ACCENT.flight,
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of (excursionsRes.data ?? []) as any[]) {
    const origin = coordFor(e.origin_code)
    if (!origin) continue
    let destCode: string | null = e.dest_code ?? destByTemplate[e.template_id] ?? null
    if (!destCode && /boca grande/i.test(e.name || '')) destCode = 'BOCA'
    const dName = destCode
      ? (friendlyDestName(destCode) !== destCode ? friendlyDestName(destCode) : (name(destCode) || (e.name || '')))
      : (e.name || '')
    next.push({
      id: e.id,
      kind: 'excursion',
      label: e.name || `Excursion · ${name(e.origin_code)}`,
      sub: `${fmtDate(e.date)} · from ${name(e.origin_code)}`,
      origin,
      dest: coordFor(destCode),
      originName: name(e.origin_code),
      destName: dName,
      href: `/reserve/${e.id}?kind=excursion`,
      accent: ROUTE_ACCENT.excursion,
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of (proposalsRes.data ?? []) as any[]) {
    const origin = coordFor(p.origin_code)
    if (!origin) continue
    const rawDestCode: string | null = p.payload?.destCode ?? p.payload?.dest_code ?? null
    const destCode = rawDestCode && rawDestCode !== 'CUSTOM' ? rawDestCode : null
    const dName = (p.payload?.destName as string | null)
      || (destCode ? (friendlyDestName(destCode) !== destCode ? friendlyDestName(destCode) : name(destCode)) : null)
    next.push({
      id: p.id,
      kind: 'proposal',
      label: p.name || (dName ? `${name(p.origin_code)} → ${dName}` : name(p.origin_code)),
      sub: `${fmtDate(p.date)} · Proposal`,
      origin,
      dest: coordFor(destCode),
      originName: name(p.origin_code),
      destName: dName ?? undefined,
      href: `/reserve/${p.id}?kind=proposal`,
      accent: ROUTE_ACCENT.proposal,
    })
  }

  return next
}
