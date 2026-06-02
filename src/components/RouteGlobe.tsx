'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { KIND_ICONS } from '@/lib/icons'

// Tropical route map. A gently pitched globe on a soft turquoise/sand basemap
// (labels + roads stripped), with terrain relief and curved flight-path lines —
// coral at the origin warming to gold at the destination — that stay bold and
// visible at every zoom. Bare origin/destination dots; the list carries names.

export type RouteItem = {
  id: string
  kind: 'flight' | 'excursion' | 'proposal'
  label: string
  sub?: string
  origin: [number, number]
  dest: [number, number] | null
  originName?: string
  destName?: string
  href: string
  accent: string
  // For the tap-to-preview card:
  imageUrl?: string | null
  price?: string | null   // formatted, e.g. "$500/seat"
  icon?: string           // KIND_ICONS key (flight / fish / golf / …)
}

export type RouteGlobeHandle = { flyTo: (id: string) => void }

function lineDist(a: [number, number], b: [number, number]): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
}

// Default horizontal bow for a single route.
function baseBow(a: [number, number], b: [number, number]): number {
  return Math.min(Math.max(lineDist(a, b) * 0.14, 0.25), 6)
}

// Gently arched ground track with an explicit perpendicular bow (so multiple
// routes between the same two points can be fanned apart by varying the bow).
// Flat lines render reliably at every zoom and camera angle.
function arcCurve(a: [number, number], b: [number, number], bow: number, steps = 96): [number, number][] {
  const [ax, ay] = a, [bx, by] = b
  const dx = bx - ax, dy = by - ay
  const dist = Math.hypot(dx, dy) || 1
  const px = -dy / dist, py = dx / dist
  const cx = (ax + bx) / 2 + px * bow
  const cy = (ay + by) / 2 + py * bow
  const pts: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t
    pts.push([u * u * ax + 2 * u * t * cx + t * t * bx, u * u * ay + 2 * u * t * cy + t * t * by])
  }
  return pts
}

const KIND_TITLE: Record<RouteItem['kind'], string> = {
  flight: 'Open seats', excursion: 'Excursion', proposal: 'Proposal',
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

type Props = { token: string; items: RouteItem[]; onOpen: (href: string) => void }

function RouteGlobeInner({ token, items, onOpen }: Props, ref: React.Ref<RouteGlobeHandle>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])
  const coordsRef = useRef<Record<string, [number, number]>>({})
  const onOpenRef = useRef(onOpen); onOpenRef.current = onOpen
  const itemsRef = useRef(items); itemsRef.current = items
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  // The trips at the tapped pin — one or more routes sharing that endpoint.
  // Shows a preview card (a list when there's more than one) before navigating.
  const [selected, setSelected] = useState<RouteItem[] | null>(null)

  useImperativeHandle(ref, () => ({
    flyTo(id: string) {
      const c = coordsRef.current[id]
      if (c && mapRef.current) mapRef.current.flyTo({ center: c, zoom: 7.4, pitch: 45, speed: 0.7, essential: true })
    },
  }))

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !token) return
    mapboxgl.accessToken = token
    let map: mapboxgl.Map
    try {
      map = new mapboxgl.Map({
        container: containerRef.current,
        // Classic light vector style — unlike the Standard basemap, its layers
        // are individually addressable, so we can strip road geometry and all
        // base labels (only our origin/destination markers carry text).
        style: 'mapbox://styles/mapbox/light-v11',
        projection: 'globe',
        center: [-82.0, 26.7],
        zoom: 5.3,
        pitch: 45,        // tilt enough to read the airborne arcs in 3D, but
        bearing: -10,     // open fairly upright / overhead, not a low raking angle
        attributionControl: false,
      })
    } catch (e) {
      setError((e as Error).message || 'Could not start the map.')
      return
    }
    mapRef.current = map
    // Compass lets you spin the 3D scene and reset north.
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'bottom-right')

    map.on('style.load', () => {
      // Recolor the basemap into a warm, tropical palette — turquoise seas,
      // sun-warmed sand, hints of palm green — and strip every road line and
      // base label so only our routes and markers show. Each layer is touched
      // in its own try so one unsupported op never aborts the rest.
      const SAND  = '#f2ecd9' // soft, pale sand
      const WATER = '#b3dcd9' // muted, hazy turquoise
      const GREEN = '#cfdfc2' // faint palm green
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const set = (id: string, prop: string, val: unknown) => { try { (map.setPaintProperty as any)(id, prop, val) } catch { /* layer may not support */ } }
      const hide = (id: string) => { try { map.setLayoutProperty(id, 'visibility', 'none') } catch { /* ignore */ } }
      for (const layer of map.getStyle().layers ?? []) {
        const id = layer.id
        const type = layer.type
        // No labels, no road/admin lines, no 3D — a clean canvas.
        if (type === 'symbol' || type === 'line' || type === 'fill-extrusion') { hide(id); continue }
        if (type === 'background') { set(id, 'background-color', SAND); continue }
        if (type === 'fill') {
          if (/water|ocean|sea|bay|lake|river|pond|marine/i.test(id)) set(id, 'fill-color', WATER)
          else if (/wood|forest|park|grass|vegetation|scrub|golf|pitch|landcover/i.test(id)) set(id, 'fill-color', GREEN)
          else set(id, 'fill-color', SAND)
        }
      }
      // Terrain relief for genuine 3D land (gentle exaggeration — the footprint
      // is mostly low coastal Florida, but it gives the globe real depth).
      try {
        if (!map.getSource('mapbox-dem')) {
          map.addSource('mapbox-dem', { type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512, maxzoom: 14 })
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(map as any).setTerrain({ source: 'mapbox-dem', exaggeration: 1.15 })
      } catch { /* terrain unsupported — arcs + pitch still read 3D */ }
      // Warm tropical atmosphere around the globe — golden haze into a soft
      // aqua-cream sky.
      map.setFog({ color: 'rgb(250,246,234)', 'high-color': 'rgb(238,226,200)', 'horizon-blend': 0.05, 'space-color': 'rgb(224,238,234)', 'star-intensity': 0 })
    })
    map.on('load', () => { map.resize(); setReady(true); paint() })
    // Tapping empty map dismisses the preview card (marker taps stopPropagation).
    map.on('click', () => setSelected(null))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.on('error', (e: any) => {
      const status = e?.error?.status ?? e?.status
      const msg = String(e?.error?.message ?? e?.error ?? '')
      if (status === 401 || status === 403) setError('Mapbox rejected the token. Check NEXT_PUBLIC_MAPBOX_TOKEN in Vercel.')
      else if (/failed to fetch|networkerror|load failed/i.test(msg)) setError("Couldn't reach Mapbox — an ad blocker or network may be blocking api.mapbox.com.")
    })

    return () => {
      markersRef.current.forEach(m => m.remove()); markersRef.current = []
      map.remove(); mapRef.current = null
    }
  }, [token])

  useEffect(() => { if (ready) paint() }, [items, ready]) // eslint-disable-line react-hooks/exhaustive-deps

  function ptEl(kind: 'origin' | 'dest', label?: string, onClick?: () => void, count = 1): HTMLElement {
    const el = document.createElement(onClick ? 'button' : 'div')
    if (onClick) (el as HTMLButtonElement).type = 'button'
    el.className = `route-pt route-pt--${kind}`
    const labelHtml = label ? `<span class="route-pt__label">${escapeHtml(label)}</span>` : ''
    // Count badge when several routes share this destination.
    const countHtml = count > 1 ? `<span class="route-pt__count">${count}</span>` : ''
    el.innerHTML = `<span class="route-pt__dot">${kind === 'dest' ? '<span class="route-pt__pulse"></span>' : ''}</span>${countHtml}${labelHtml}`
    if (onClick) el.addEventListener('click', ev => { ev.stopPropagation(); onClick() })
    return el
  }

  function paint() {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    const list = itemsRef.current

    markersRef.current.forEach(m => m.remove()); markersRef.current = []
    const coords: Record<string, [number, number]> = {}
    const key = (c: [number, number]) => `${c[0].toFixed(4)},${c[1].toFixed(4)}`

    // Lines: one per route, colored by trip type. Routes that share the same
    // origin+destination are fanned apart (varying bow) so each colored line
    // stays visible — a bundle of arcs converging on the single destination dot.
    const withDest = list.filter(it => it.dest)
    const lineGroups = new Map<string, RouteItem[]>()
    for (const it of withDest) {
      const k = `${key(it.origin)}|${key(it.dest as [number, number])}`
      const g = lineGroups.get(k); if (g) g.push(it); else lineGroups.set(k, [it])
    }
    const features: GeoJSON.Feature[] = []
    for (const arr of lineGroups.values()) {
      const n = arr.length
      arr.forEach((it, i) => {
        const o = it.origin, d = it.dest as [number, number]
        const fan = (i - (n - 1) / 2) * Math.max(0.32, lineDist(o, d) * 0.12)
        features.push({
          type: 'Feature',
          properties: { color: it.accent },
          geometry: { type: 'LineString', coordinates: arcCurve(o, d, baseBow(o, d) + fan) },
        })
      })
    }
    const data = { type: 'FeatureCollection' as const, features }

    const src = map.getSource('routes') as mapboxgl.GeoJSONSource | undefined
    if (src) { src.setData(data) }
    else {
      map.addSource('routes', { type: 'geojson', data })
      // Soft white casing under a core colored by trip type (open seats /
      // excursion / proposal). Width is zoom-responsive so the lines stay bold
      // and visible when you zoom out, never hairline-thin.
      const casingWidth = ['interpolate', ['linear'], ['zoom'], 3, 10, 6, 7.5, 10, 6] as unknown
      const coreWidth = ['interpolate', ['linear'], ['zoom'], 3, 5.5, 6, 4, 10, 3.4] as unknown
      map.addLayer({
        id: 'routes-casing', type: 'line', source: 'routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        paint: { 'line-color': '#ffffff', 'line-width': casingWidth as any, 'line-opacity': 0.85 },
      })
      map.addLayer({
        id: 'routes-core', type: 'line', source: 'routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        paint: { 'line-color': ['get', 'color'] as any, 'line-width': coreWidth as any },
      })
    }

    // One blue origin dot per unique origin (no label, not clickable).
    const originSeen = new Set<string>()
    for (const it of withDest) {
      const k = key(it.origin)
      if (originSeen.has(k)) continue
      originSeen.add(k)
      const om = new mapboxgl.Marker({ element: ptEl('origin') }).setLngLat(it.origin).addTo(map)
      markersRef.current.push(om)
    }

    // One gold destination dot per destination — tapping opens a card listing
    // every trip going there (a count badge hints when there's more than one).
    const destGroups = new Map<string, RouteItem[]>()
    for (const it of withDest) {
      const k = key(it.dest as [number, number])
      const g = destGroups.get(k); if (g) g.push(it); else destGroups.set(k, [it])
      coords[it.id] = it.dest as [number, number]
    }
    for (const arr of destGroups.values()) {
      const head = arr[0]
      const dm = new mapboxgl.Marker({ element: ptEl('dest', head.destName ?? head.label, () => setSelected(arr), arr.length) })
        .setLngLat(head.dest as [number, number]).addTo(map)
      markersRef.current.push(dm)
    }

    // Origin-only items (e.g. custom proposals with no destination yet) — one
    // blue dot per location, grouped, tap to preview.
    const originOnly = new Map<string, RouteItem[]>()
    for (const it of list) {
      if (it.dest) continue
      const k = key(it.origin)
      const g = originOnly.get(k); if (g) g.push(it); else originOnly.set(k, [it])
      coords[it.id] = it.origin
    }
    for (const arr of originOnly.values()) {
      const head = arr[0]
      const om = new mapboxgl.Marker({ element: ptEl('origin', undefined, () => setSelected(arr), arr.length) })
        .setLngLat(head.origin).addTo(map)
      markersRef.current.push(om)
    }
    coordsRef.current = coords
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} className="route-globe" />

      {/* Preview card — tap a pin to see the trip(s) before opening a page. */}
      {selected && selected.length > 0 && (
        <div style={{
          position: 'absolute', left: 12, right: 12, bottom: 'calc(env(safe-area-inset-bottom) + 14px)',
          maxWidth: 420, margin: '0 auto', zIndex: 5,
          background: 'var(--card, #fff)', borderRadius: 16, padding: '14px 16px',
          boxShadow: '0 12px 36px rgba(13,51,64,0.26)', border: '1px solid var(--hair, rgba(13,51,64,0.08))',
        }}>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setSelected(null)}
            style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'var(--warm, #f1ece0)', color: 'var(--ink-light)', cursor: 'pointer', fontSize: 16, lineHeight: 1, zIndex: 1 }}
          >
            ×
          </button>

          {selected.length === 1 ? (
            // ── Single trip: rich card ──
            (() => {
              const it = selected[0]
              return (
                <>
                  <div style={{ display: 'flex', gap: 12, paddingRight: 22 }}>
                    <div style={{ position: 'relative', width: 72, height: 72, borderRadius: 12, overflow: 'hidden', flexShrink: 0, background: 'var(--warm, #f1ece0)' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={it.imageUrl || '/trip-default.jpeg'} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <span style={{ position: 'absolute', bottom: 4, left: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', background: 'rgba(255,255,255,0.92)', color: it.accent, boxShadow: '0 1px 3px rgba(13,51,64,0.3)' }}>
                        {KIND_ICONS[it.icon ?? (it.kind === 'flight' ? 'flight' : 'sun')] ?? KIND_ICONS.flight}
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: it.accent, flexShrink: 0 }} />
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-light)', fontWeight: 700 }}>{KIND_TITLE[it.kind]}</span>
                      </div>
                      <div style={{ fontFamily: 'var(--display)', fontSize: 16.5, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {it.destName || it.label}
                      </div>
                      {it.price ? (
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', marginTop: 2 }}>
                          {it.price}<span style={{ fontWeight: 400, fontSize: 11, color: 'var(--ink-light)' }}> · +3% fee</span>
                        </div>
                      ) : it.sub ? (
                        <div style={{ fontSize: 12, color: 'var(--ink-light)', marginTop: 2 }}>{it.sub}</div>
                      ) : null}
                    </div>
                  </div>
                  <button type="button" className="btn-primary" onClick={() => { const href = it.href; setSelected(null); onOpenRef.current(href) }} style={{ marginTop: 12, width: '100%' }}>
                    View details →
                  </button>
                </>
              )
            })()
          ) : (
            // ── Several trips to the same place: a tappable list ──
            <>
              <div style={{ paddingRight: 22, marginBottom: 8 }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: 16.5, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.2 }}>
                  {selected[0].destName || selected[0].label}
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-light)', marginTop: 1 }}>{selected.length} trips going here</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 230, overflowY: 'auto' }}>
                {selected.map(it => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => { const href = it.href; setSelected(null); onOpenRef.current(href) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', width: '100%', padding: 8, borderRadius: 12, border: '1px solid var(--hair, rgba(13,51,64,0.08))', background: 'var(--paper, #faf6ec)', cursor: 'pointer' }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: '50%', background: '#fff', color: it.accent, flexShrink: 0, boxShadow: '0 1px 3px rgba(13,51,64,0.2)' }}>
                      {KIND_ICONS[it.icon ?? (it.kind === 'flight' ? 'flight' : 'sun')] ?? KIND_ICONS.flight}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-light)', fontWeight: 700 }}>{KIND_TITLE[it.kind]}</span>
                      <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
                      <span style={{ display: 'block', fontSize: 11.5, color: 'var(--ink-light)' }}>{it.price ? `${it.price} · +3% fee` : it.sub}</span>
                    </span>
                    <span style={{ color: 'var(--ink-faint, #9bb0b5)', flexShrink: 0 }}>›</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {error && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(6,34,43,0.88)', borderRadius: 18, textAlign: 'center' }}>
          <div style={{ maxWidth: 440 }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 21, color: 'var(--paper)', marginBottom: 8 }}>Map couldn&rsquo;t load</div>
            <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.72)', lineHeight: 1.55, margin: 0 }}>{error}</p>
          </div>
        </div>
      )}
    </div>
  )
}

const RouteGlobe = forwardRef(RouteGlobeInner)
export default RouteGlobe
