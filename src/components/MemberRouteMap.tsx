'use client'

import { useEffect, useState } from 'react'
import nextDynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { loadRouteItems, ROUTE_ACCENT } from '@/lib/route-items'
import type { RouteItem } from '@/components/RouteGlobe'

// Mapbox touches window — browser-only.
const RouteGlobe = nextDynamic(() => import('@/components/RouteGlobe'), { ssr: false })
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

const LEGEND_LABEL: Record<RouteItem['kind'], string> = {
  flight: 'Open seats',
  excursion: 'Excursions',
  proposal: 'Proposals',
}

// Member-facing Route Map: a floating "Map" button (Airbnb-style, above the
// bottom nav) that opens a full-screen, mobile-friendly map of the live network
// — fed by exactly the same data as the Concierge dashboard map. Tap a pin to
// jump to that trip; back button closes.
export default function MemberRouteMap() {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<RouteItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)

  // Lazy-load the network only when the map is first opened.
  useEffect(() => {
    if (!open || loaded) return
    loadRouteItems(supabase)
      .then(next => { setItems(next); setLoaded(true); setLoading(false) })
      .catch(() => { setLoaded(true); setLoading(false) })
  }, [open, loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  // Lock body scroll while the full-screen map is open.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (!MAPBOX_TOKEN) return null

  function go(href: string) { setOpen(false); router.push(href) }

  const kinds: RouteItem['kind'][] = ['flight', 'excursion', 'proposal']
  const present = kinds.filter(k => items.some(i => i.kind === k))

  return (
    <>
      {/* Floating pill — sits above the bottom nav like Airbnb's Map toggle. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open route map"
        style={{
          position: 'fixed', left: '50%', transform: 'translateX(-50%)',
          bottom: 'calc(64px + env(safe-area-inset-bottom) + 18px)',
          zIndex: 60, display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--ink)', color: '#fff', border: 'none',
          borderRadius: 999, padding: '12px 20px', cursor: 'pointer',
          fontFamily: 'var(--ui)', fontSize: 14, fontWeight: 600,
          boxShadow: '0 6px 20px rgba(13,51,64,0.30)',
        }}
      >
        Map
        <svg width="17" height="17" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 3 3 5v14l5-2 6 2 5-2V3l-5 2-6-2Z" />
          <path d="M8 3v14M14 7v12" />
        </svg>
      </button>

      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--paper, #f5efe2)', display: 'flex', flexDirection: 'column' }}>
          {/* Header with back button */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: 'calc(env(safe-area-inset-top) + 12px) 16px 12px',
            borderBottom: '1px solid var(--hair)', background: 'var(--card, #fff)', flexShrink: 0,
          }}>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Back"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                border: '1px solid var(--hair-2)', background: 'var(--card, #fff)', cursor: 'pointer', color: 'var(--ink)',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 5l-6 6 6 6" />
              </svg>
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.1 }}>Route map</div>
              <div style={{ fontSize: 12, color: 'var(--ink-light)' }}>
                {loading ? 'Loading the network…' : `${items.length} live route${items.length === 1 ? '' : 's'} — tap a pin to open`}
              </div>
            </div>
          </div>

          {/* Map */}
          <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
            {loading ? (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-light)', fontSize: 13 }}>
                <span className="pending-indicator" style={{ marginRight: 10 }} /> Loading the network…
              </div>
            ) : items.length === 0 ? (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24, color: 'var(--ink-light)', fontSize: 13.5 }}>
                No live routes on the map right now. Check back soon.
              </div>
            ) : (
              <RouteGlobe token={MAPBOX_TOKEN} items={items} onOpen={go} />
            )}

            {/* Legend */}
            {!loading && present.length > 0 && (
              <div style={{
                position: 'absolute', left: 12, bottom: 'calc(env(safe-area-inset-bottom) + 12px)',
                background: 'rgba(255,255,255,0.92)', borderRadius: 12, padding: '8px 12px',
                display: 'flex', flexDirection: 'column', gap: 5, boxShadow: '0 4px 14px rgba(13,51,64,0.14)',
              }}>
                {present.map(k => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: 'var(--ink-soft)', fontWeight: 600 }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: ROUTE_ACCENT[k] }} />
                    {LEGEND_LABEL[k]}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
