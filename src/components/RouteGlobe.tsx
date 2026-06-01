'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

// Route globe on the Mapbox Standard (v3) style — soft 3D terrain + dusk
// lighting + atmosphere. Each route draws an origin dot, a great-circle arc
// with an animated "flight path" flowing along it, and a clickable
// destination pin.

export type RouteItem = {
  id: string
  kind: 'flight' | 'excursion' | 'proposal'
  label: string
  sub?: string
  origin: [number, number]
  dest: [number, number] | null
  href: string
  accent: string
}

export type RouteGlobeHandle = { flyTo: (id: string) => void }

// Curved "flight-path" arc: a quadratic bezier that bows out from the straight
// line so every route reads as a pronounced arc (great-circle is near-flat over
// short domestic hops). The bow scales with distance, capped so it always looks
// like an arc — not a flat line and not a wild loop.
function arcCurve(a: [number, number], b: [number, number], steps = 88): [number, number][] {
  const [ax, ay] = a, [bx, by] = b
  const dx = bx - ax, dy = by - ay
  const dist = Math.hypot(dx, dy) || 1
  // Perpendicular unit vector → push the control point off the midpoint.
  const px = -dy / dist, py = dx / dist
  const bow = Math.min(Math.max(dist * 0.28, 0.5), 16)
  const cx = (ax + bx) / 2 + px * bow
  const cy = (ay + by) / 2 + py * bow
  const pts: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t
    pts.push([u * u * ax + 2 * u * t * cx + t * t * bx, u * u * ay + 2 * u * t * cy + t * t * by])
  }
  return pts
}

// Dash-array sequence for the flowing "ant-march" flight path (Mapbox's
// canonical animate-a-line technique).
const DASH_SEQ: number[][] = [
  [0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5],
  [3, 4, 0], [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2],
  [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5],
]

type Props = { token: string; items: RouteItem[]; onOpen: (href: string) => void }

function RouteGlobeInner({ token, items, onOpen }: Props, ref: React.Ref<RouteGlobeHandle>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])
  const coordsRef = useRef<Record<string, [number, number]>>({})
  const rafRef = useRef<number | null>(null)
  const onOpenRef = useRef(onOpen); onOpenRef.current = onOpen
  const itemsRef = useRef(items); itemsRef.current = items
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useImperativeHandle(ref, () => ({
    flyTo(id: string) {
      const c = coordsRef.current[id]
      if (c && mapRef.current) mapRef.current.flyTo({ center: c, zoom: 6, pitch: 45, speed: 0.7, essential: true })
    },
  }))

  // Init once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current || !token) return
    mapboxgl.accessToken = token
    let map: mapboxgl.Map
    try {
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/standard',
        projection: 'globe',
        center: [-82, 25.5],
        zoom: 4.2,
        attributionControl: false,
      })
    } catch (e) {
      setError((e as Error).message || 'Could not start the map.')
      return
    }
    mapRef.current = map
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')

    map.on('style.load', () => {
      // Warm "dusk" lighting on the Standard basemap + a golden atmosphere.
      try { map.setConfigProperty('basemap', 'lightPreset', 'dusk') } catch { /* style may not support it */ }
      map.setFog({ color: 'rgb(255,224,181)', 'high-color': 'rgb(36,92,110)', 'horizon-blend': 0.04, 'space-color': 'rgb(11,24,30)', 'star-intensity': 0.12 })
    })
    map.on('load', () => { map.resize(); setReady(true); paint() })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.on('error', (e: any) => {
      const status = e?.error?.status ?? e?.status
      const msg = String(e?.error?.message ?? e?.error ?? '')
      if (status === 401 || status === 403) {
        setError('Mapbox rejected the token. Check NEXT_PUBLIC_MAPBOX_TOKEN in Vercel.')
      } else if (/failed to fetch|networkerror|load failed/i.test(msg)) {
        setError("Couldn't reach Mapbox — an ad blocker or network may be blocking api.mapbox.com.")
      }
    })

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      markersRef.current.forEach(m => m.remove()); markersRef.current = []
      map.remove(); mapRef.current = null
    }
  }, [token])

  // Repaint when data changes (once the style is ready).
  useEffect(() => { if (ready) paint() }, [items, ready]) // eslint-disable-line react-hooks/exhaustive-deps

  function startFlow(map: mapboxgl.Map) {
    if (rafRef.current != null) return
    let last = -1
    const tick = (ts: number) => {
      const step = Math.floor((ts / 95) % DASH_SEQ.length)
      if (step !== last && map.getLayer('routes-flow')) {
        map.setPaintProperty('routes-flow', 'line-dasharray', DASH_SEQ[step])
        last = step
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  function originEl(accent: string): HTMLElement {
    const o = document.createElement('div')
    o.className = 'route-origin'
    o.style.setProperty('--mk', accent)
    return o
  }

  function destEl(it: RouteItem): HTMLElement {
    const el = document.createElement('button')
    el.type = 'button'
    el.className = 'route-marker'
    el.setAttribute('aria-label', it.label)
    el.style.setProperty('--mk', it.accent)
    el.innerHTML = '<span class="route-marker__dot"></span><span class="route-marker__pulse"></span>'
    el.addEventListener('click', ev => { ev.stopPropagation(); onOpenRef.current(it.href) })
    return el
  }

  function paint() {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    const list = itemsRef.current

    markersRef.current.forEach(m => m.remove()); markersRef.current = []
    const coords: Record<string, [number, number]> = {}

    const features = list.filter(it => it.dest).map(it => ({
      type: 'Feature' as const,
      properties: { color: it.accent },
      geometry: { type: 'LineString' as const, coordinates: arcCurve(it.origin, it.dest as [number, number]) },
    }))
    const data = { type: 'FeatureCollection' as const, features }

    const src = map.getSource('routes') as mapboxgl.GeoJSONSource | undefined
    if (src) { src.setData(data) }
    else {
      map.addSource('routes', { type: 'geojson', data })
      // Three stacked lines for a glowing, high-contrast, 3D-feel arc:
      // a wide soft halo, a bright accent core, and a white spark flowing
      // along it.
      map.addLayer({ id: 'routes-glow', type: 'line', source: 'routes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 16, 'line-opacity': 0.45, 'line-blur': 16 } })
      map.addLayer({ id: 'routes-core', type: 'line', source: 'routes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 3.5, 'line-opacity': 1 } })
      map.addLayer({ id: 'routes-flow', type: 'line', source: 'routes', layout: { 'line-cap': 'butt', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 2, 'line-opacity': 0.95, 'line-dasharray': [0, 4, 3] } })
      startFlow(map)
    }

    for (const it of list) {
      const at = it.dest ?? it.origin
      coords[it.id] = at
      // Origin dot (only when there's a separate destination).
      if (it.dest) {
        const om = new mapboxgl.Marker({ element: originEl(it.accent) }).setLngLat(it.origin).addTo(map)
        markersRef.current.push(om)
      }
      // Clickable destination pin (or the single point for an excursion).
      const popup = new mapboxgl.Popup({ offset: 16, closeButton: false, className: 'route-popup' })
        .setHTML(`<strong>${it.label}</strong>${it.sub ? `<span>${it.sub}</span>` : ''}`)
      const el = destEl(it)
      const m = new mapboxgl.Marker({ element: el }).setLngLat(at).setPopup(popup).addTo(map)
      el.addEventListener('mouseenter', () => m.togglePopup())
      el.addEventListener('mouseleave', () => m.togglePopup())
      markersRef.current.push(m)
    }
    coordsRef.current = coords
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} className="route-globe" />
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
