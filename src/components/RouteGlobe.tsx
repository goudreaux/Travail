'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

// Minimal, robust route globe. Draws great-circle arcs + clickable pins for
// each route over a satellite globe. Kept deliberately simple: no idle-spin,
// no Standard-style config — just init, paint, fly, and a clear error state.

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

// Great-circle interpolation so the arc curves over the globe.
function greatCircle(a: [number, number], b: [number, number], steps = 64): [number, number][] {
  const rad = (d: number) => (d * Math.PI) / 180
  const deg = (r: number) => (r * 180) / Math.PI
  const lon1 = rad(a[0]), lat1 = rad(a[1]), lon2 = rad(b[0]), lat2 = rad(b[1])
  const d = 2 * Math.asin(Math.sqrt(Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2))
  if (!d) return [a, b]
  const pts: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const f = i / steps
    const A = Math.sin((1 - f) * d) / Math.sin(d)
    const B = Math.sin(f * d) / Math.sin(d)
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2)
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2)
    const z = A * Math.sin(lat1) + B * Math.sin(lat2)
    pts.push([deg(Math.atan2(y, x)), deg(Math.atan2(z, Math.sqrt(x * x + y * y)))])
  }
  return pts
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

  useImperativeHandle(ref, () => ({
    flyTo(id: string) {
      const c = coordsRef.current[id]
      if (c && mapRef.current) mapRef.current.flyTo({ center: c, zoom: 5.2, speed: 0.7, essential: true })
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
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
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
      map.setFog({ color: 'rgb(255,224,181)', 'high-color': 'rgb(36,92,110)', 'horizon-blend': 0.04, 'space-color': 'rgb(11,24,30)', 'star-intensity': 0.12 })
    })
    map.on('load', () => { map.resize(); setReady(true); paint() })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.on('error', (e: any) => {
      const status = e?.error?.status ?? e?.status
      const msg = String(e?.error?.message ?? e?.error ?? '')
      if (status === 401 || status === 403 || /401|403|unauthorized|not authorized|allowlist|forbidden|token/i.test(msg)) {
        // Show the RAW Mapbox error + a fingerprint of the token actually baked
        // into this build, so it's fully diagnosable from a screenshot.
        const tok = token ? `${token.slice(0, 16)}…${token.slice(-6)}` : 'EMPTY'
        const origin = typeof window !== 'undefined' ? window.location.origin : ''
        setError(`Mapbox ${status ?? ''}: ${msg || 'rejected'}  ·  origin: ${origin}  ·  token: ${tok}`)
      }
    })

    return () => {
      markersRef.current.forEach(m => m.remove()); markersRef.current = []
      map.remove(); mapRef.current = null
    }
  }, [token])

  // Repaint when data changes (once the style is ready).
  useEffect(() => { if (ready) paint() }, [items, ready]) // eslint-disable-line react-hooks/exhaustive-deps

  function paint() {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    const list = itemsRef.current

    markersRef.current.forEach(m => m.remove()); markersRef.current = []
    const coords: Record<string, [number, number]> = {}

    const features = list.filter(it => it.dest).map(it => ({
      type: 'Feature' as const,
      properties: { color: it.accent },
      geometry: { type: 'LineString' as const, coordinates: greatCircle(it.origin, it.dest as [number, number]) },
    }))
    const data = { type: 'FeatureCollection' as const, features }

    const src = map.getSource('routes') as mapboxgl.GeoJSONSource | undefined
    if (src) { src.setData(data) }
    else {
      map.addSource('routes', { type: 'geojson', data })
      map.addLayer({ id: 'routes-glow', type: 'line', source: 'routes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 7, 'line-opacity': 0.25, 'line-blur': 8 } })
      map.addLayer({ id: 'routes-line', type: 'line', source: 'routes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 2.4 } })
    }

    for (const it of list) {
      const at = it.dest ?? it.origin
      coords[it.id] = at
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'route-marker'
      el.setAttribute('aria-label', it.label)
      el.style.setProperty('--mk', it.accent)
      el.innerHTML = '<span class="route-marker__dot"></span><span class="route-marker__pulse"></span>'
      el.addEventListener('click', ev => { ev.stopPropagation(); onOpenRef.current(it.href) })
      const popup = new mapboxgl.Popup({ offset: 16, closeButton: false, className: 'route-popup' })
        .setHTML(`<strong>${it.label}</strong>${it.sub ? `<span>${it.sub}</span>` : ''}`)
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
