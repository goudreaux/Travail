'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

// Clean 2D route map on the light Standard basemap with its labels turned off
// (only our origins/destinations are labeled). Each route is a gently arched
// line that runs blue (origin) → gold (destination), with a blue origin dot
// and a shiny gold, clickable destination dot.

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
}

export type RouteGlobeHandle = { flyTo: (id: string) => void }

// Gently arched line (slight bow off the straight line) so routes read as arcs
// without the heavy curve.
function arcCurve(a: [number, number], b: [number, number], steps = 72): [number, number][] {
  const [ax, ay] = a, [bx, by] = b
  const dx = bx - ax, dy = by - ay
  const dist = Math.hypot(dx, dy) || 1
  const px = -dy / dist, py = dx / dist
  const bow = Math.min(Math.max(dist * 0.12, 0.22), 6)
  const cx = (ax + bx) / 2 + px * bow
  const cy = (ay + by) / 2 + py * bow
  const pts: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t
    pts.push([u * u * ax + 2 * u * t * cx + t * t * bx, u * u * ay + 2 * u * t * cy + t * t * by])
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
      if (c && mapRef.current) mapRef.current.flyTo({ center: c, zoom: 7, speed: 0.7, essential: true })
    },
  }))

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !token) return
    mapboxgl.accessToken = token
    let map: mapboxgl.Map
    try {
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/standard',
        projection: 'globe',
        center: [-82.2, 27.6],
        zoom: 5.8,
        pitch: 0,
        attributionControl: false,
      })
    } catch (e) {
      setError((e as Error).message || 'Could not start the map.')
      return
    }
    mapRef.current = map
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')

    map.on('style.load', () => {
      // Light basemap, and strip its labels so only our origin/destination
      // markers carry text.
      try {
        map.setConfigProperty('basemap', 'lightPreset', 'day')
        map.setConfigProperty('basemap', 'showPlaceLabels', false)
        map.setConfigProperty('basemap', 'showRoadLabels', false)
        map.setConfigProperty('basemap', 'showPointOfInterestLabels', false)
        map.setConfigProperty('basemap', 'showTransitLabels', false)
      } catch { /* style may not support these */ }
      map.setFog({ color: 'rgb(255,255,255)', 'high-color': 'rgb(176,208,232)', 'horizon-blend': 0.05, 'space-color': 'rgb(206,224,238)', 'star-intensity': 0 })
    })
    map.on('load', () => { map.resize(); setReady(true); paint() })
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

  function ptEl(kind: 'origin' | 'dest', label: string | undefined, onClick?: () => void): HTMLElement {
    const el = document.createElement(onClick ? 'button' : 'div')
    if (onClick) (el as HTMLButtonElement).type = 'button'
    el.className = `route-pt route-pt--${kind}`
    el.innerHTML = `<span class="route-pt__dot">${kind === 'dest' ? '<span class="route-pt__pulse"></span>' : ''}</span>${label ? `<span class="route-pt__label">${label}</span>` : ''}`
    if (onClick) el.addEventListener('click', ev => { ev.stopPropagation(); onClick() })
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
      properties: {},
      geometry: { type: 'LineString' as const, coordinates: arcCurve(it.origin, it.dest as [number, number]) },
    }))
    const data = { type: 'FeatureCollection' as const, features }

    const src = map.getSource('routes') as mapboxgl.GeoJSONSource | undefined
    if (src) { src.setData(data) }
    else {
      map.addSource('routes', { type: 'geojson', data, lineMetrics: true })
      // White casing to lift the line off the light map, then a blue→gold core.
      map.addLayer({ id: 'routes-casing', type: 'line', source: 'routes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 6, 'line-opacity': 0.8 } })
      map.addLayer({
        id: 'routes-core', type: 'line', source: 'routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-width': 3, 'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, '#2f80ed', 1, '#f0b63c'] },
      })
    }

    for (const it of list) {
      const at = it.dest ?? it.origin
      coords[it.id] = at
      if (it.dest) {
        const om = new mapboxgl.Marker({ element: ptEl('origin', it.originName) }).setLngLat(it.origin).addTo(map)
        markersRef.current.push(om)
      }
      const dm = new mapboxgl.Marker({ element: ptEl('dest', it.destName ?? it.label, () => onOpenRef.current(it.href)) })
        .setLngLat(at).addTo(map)
      markersRef.current.push(dm)
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
