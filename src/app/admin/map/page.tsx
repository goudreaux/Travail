'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import nextDynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { coordFor } from '@/lib/airport-coords'
import type { RouteItem, RouteGlobeHandle } from '@/components/RouteGlobe'

// Mapbox touches `window`, so the globe is browser-only.
const RouteGlobe = nextDynamic(() => import('@/components/RouteGlobe'), { ssr: false })

const ACCENT: Record<RouteItem['kind'], string> = {
  flight: '#00b3c7',
  excursion: '#5bbfa3',
  proposal: '#f4a72c',
}

const KIND_LABEL: Record<RouteItem['kind'], string> = {
  flight: 'Open seats',
  excursion: 'Excursion',
  proposal: 'Proposal',
}

export default function AdminMapPage() {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''
  const supabase = createClient()
  const router = useRouter()
  const globeRef = useRef<RouteGlobeHandle>(null)
  const [items, setItems] = useState<RouteItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const [flightsRes, excursionsRes, proposalsRes, airportsRes, templatesRes] = await Promise.all([
        supabase.from('flights').select('id, name, origin_code, dest_code, date, status').in('status', ['open', 'full']),
        supabase.from('excursions').select('id, name, origin_code, date, status, template_id').in('status', ['open', 'full']),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from('trip_proposals').select('id, name, kind, origin_code, payload, date, status').eq('status', 'open'),
        supabase.from('airports').select('code, name, sub'),
        supabase.from('excursion_templates').select('id, dest_code'),
      ])

      // template_id → dest_code, so an excursion draws airport → activity.
      const destByTemplate: Record<string, string> = {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const t of (templatesRes.data ?? []) as any[]) destByTemplate[t.id] = t.dest_code

      const place: Record<string, string> = {}
      for (const a of (airportsRes.data ?? []) as { code: string; name: string; sub: string | null }[]) {
        place[a.code] = a.name
      }
      const name = (code: string | null | undefined) => (code ? place[code] ?? code : '')
      const fmtDate = (d: string) =>
        new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

      const next: RouteItem[] = []

      for (const f of (flightsRes.data ?? []) as any[]) {
        const origin = coordFor(f.origin_code)
        if (!origin) continue
        const dest = coordFor(f.dest_code)
        next.push({
          id: f.id,
          kind: 'flight',
          label: `${name(f.origin_code)} → ${name(f.dest_code)}`,
          sub: `${fmtDate(f.date)}${f.status === 'full' ? ' · Full' : ' · Open seats'}`,
          origin,
          dest,
          href: `/reserve/${f.id}?kind=flight`,
          accent: ACCENT.flight,
        })
      }

      for (const e of (excursionsRes.data ?? []) as any[]) {
        const origin = coordFor(e.origin_code)
        if (!origin) continue
        // Activity destination: from the template's dest_code, with a name
        // override for one-off named spots (e.g. Boca Grande tarpon).
        let destCode: string | null = destByTemplate[e.template_id] ?? null
        if (/boca grande/i.test(e.name || '')) destCode = 'BOCA'
        const dest = coordFor(destCode)
        next.push({
          id: e.id,
          kind: 'excursion',
          label: e.name || `Excursion · ${name(e.origin_code)}`,
          sub: `${fmtDate(e.date)} · from ${name(e.origin_code)}`,
          origin,
          dest,
          href: `/reserve/${e.id}?kind=excursion`,
          accent: ACCENT.excursion,
        })
      }

      for (const p of (proposalsRes.data ?? []) as any[]) {
        const origin = coordFor(p.origin_code)
        if (!origin) continue
        const destCode = p.kind === 'flight' ? (p.payload?.dest_code ?? null) : null
        const dest = coordFor(destCode)
        next.push({
          id: p.id,
          kind: 'proposal',
          label: p.name || (destCode ? `${name(p.origin_code)} → ${name(destCode)}` : name(p.origin_code)),
          sub: `${fmtDate(p.date)} · Proposal`,
          origin,
          dest,
          href: `/reserve/${p.id}?kind=proposal`,
          accent: ACCENT.proposal,
        })
      }

      setItems(next)
      setLoading(false)
    }
    load().catch(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const grouped = useMemo(() => {
    return {
      flight: items.filter(i => i.kind === 'flight'),
      excursion: items.filter(i => i.kind === 'excursion'),
      proposal: items.filter(i => i.kind === 'proposal'),
    }
  }, [items])

  function focus(it: RouteItem) {
    setActiveId(it.id)
    globeRef.current?.flyTo(it.id)
  }

  return (
    <div className="admin-page admin-map-page">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 16 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 30, fontWeight: 500, color: 'var(--ink)', margin: 0 }}>Route Map</h1>
          <p style={{ fontSize: 13, color: 'var(--ink-light)', marginTop: 4, marginBottom: 0 }}>
            Every live open-seat departure and open proposal, drawn over the globe. Click a pin to jump to its itinerary.
          </p>
        </div>
        <span style={{ flexShrink: 0, fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--tropic-d)', background: 'var(--tropic-glow, rgba(0,179,199,0.12))', borderRadius: 999, padding: '5px 12px' }}>
          Concierge preview
        </span>
      </div>

      {!token ? (
        <div className="route-globe route-globe--empty">
          <div style={{ textAlign: 'center', maxWidth: 420, padding: 24 }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 22, color: 'var(--ink)', marginBottom: 8 }}>Map needs a Mapbox token</div>
            <p style={{ fontSize: 13.5, color: 'var(--ink-light)', lineHeight: 1.5, margin: 0 }}>
              Set <code style={{ fontFamily: 'var(--mono)' }}>NEXT_PUBLIC_MAPBOX_TOKEN</code> (a public <code>pk.</code> token) in your environment, then redeploy. The globe will render here.
            </p>
          </div>
        </div>
      ) : (
        <div className="admin-map-grid">
          <RouteGlobe ref={globeRef} token={token} items={items} onOpen={href => router.push(href)} />

          <aside className="admin-map-list">
            {loading ? (
              <div style={{ padding: 20, color: 'var(--ink-light)', fontSize: 13 }}>Loading routes…</div>
            ) : items.length === 0 ? (
              <div style={{ padding: 20, color: 'var(--ink-light)', fontSize: 13 }}>No live departures or proposals right now.</div>
            ) : (
              (['flight', 'excursion', 'proposal'] as const).map(kind =>
                grouped[kind].length === 0 ? null : (
                  <div key={kind} className="admin-map-list__group">
                    <div className="admin-map-list__head" style={{ color: ACCENT[kind] }}>
                      <span className="admin-map-list__swatch" style={{ background: ACCENT[kind] }} />
                      {KIND_LABEL[kind]}s · {grouped[kind].length}
                    </div>
                    {grouped[kind].map(it => (
                      <button
                        key={it.id}
                        type="button"
                        className={`admin-map-list__row${activeId === it.id ? ' is-active' : ''}`}
                        onClick={() => focus(it)}
                      >
                        <div className="admin-map-list__label">{it.label}</div>
                        <div className="admin-map-list__sub">{it.sub}</div>
                        <span
                          className="admin-map-list__open"
                          role="link"
                          tabIndex={0}
                          onClick={e => { e.stopPropagation(); router.push(it.href) }}
                          onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); router.push(it.href) } }}
                        >
                          Open itinerary →
                        </span>
                      </button>
                    ))}
                  </div>
                ),
              )
            )}
          </aside>
        </div>
      )}
    </div>
  )
}
