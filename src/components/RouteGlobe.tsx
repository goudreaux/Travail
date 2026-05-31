'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

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

export type RouteGlobeHandle = {
  flyTo: (id: string) => void
}

// Spherical-interpolated great-circle path between two lng/lat points. On the
// globe projection this curve reads as a route arcing over the earth.
function greatCircle(a: [number, number], b: [number, number], steps = 72): [number, number][] {
  const rad = (d: number) => (d * Math.PI) / 180
  const deg = (r: number) => (r * 180) / Math.PI
  const lon1 = rad(a[0]), lat1 = rad(a[1])
  const lon2 = rad(b[0]), lat2 = rad(b[1])
  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
      ),
    )
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

function markerEl(item: RouteItem, onClick: () => void): HTMLElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = 'route-marker'
  el.setAttribute('aria-label', item.label)
  el.style.setProperty('--mk', item.accent)
  el.innerHTML = '<span class="route-marker__dot"></span><span class="route-marker__pulse"></span>'
  el.addEventListener('click', e => {
    e.stopPropagation()
    onClick()
  })
  return el
}

type Props = {
  token: string
  items: RouteItem[]
  onOpen: (href: string) => void
}

function RouteGlobeInner({ token, items, onOpen }: Props, ref: React.Ref<RouteGlobeHandle>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])
  const coordsRef = useRef<Record<string, [number, number]>>({})
  const onOpenRef = useRef(onOpen)
  onOpenRef.current = onOpen

  useImperativeHandle(ref, () => ({
    flyTo(id: string) {
      const c = coordsRef.current[id]
      const map = mapRef.current
      if (c && map) map.flyTo({ center: c, zoom: 5.4, speed: 0.7, curve: 1.4, essential: true })
    },
  }))

  // Init the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current || !token) return
    mapboxgl.accessToken = token
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/standard',
      projection: 'globe',
      center: [-82, 25.6],
      zoom: 4.4,
      attributionControl: false,
      cooperativeGestures: false,
    })
    mapRef.current = map
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')

    map.on('style.load', () => {
      // Warm "dusk" lighting + a tropical golden atmosphere on the globe.
      try {
        map.setConfigProperty('basemap', 'lightPreset', 'dusk')
      } catch {}
      map.setFog({
        color: 'rgb(255, 224, 181)',
        'high-color': 'rgb(36, 92, 110)',
        'horizon-blend': 0.04,
        'space-color': 'rgb(11, 24, 30)',
        'star-intensity': 0.15,
      })
    })

    map.on('load', () => paintRoutes())

    let spin = true
    map.on('mousedown', () => { spin = false })
    map.on('touchstart', () => { spin = false })
    // Gentle idle spin until the user grabs it.
    const tick = () => {
      if (spin && map.getZoom() < 5) {
        const c = map.getCenter()
        c.lng -= 0.12
        map.easeTo({ center: c, duration: 1000, easing: n => n })
      }
    }
    map.on('moveend', tick)

    return () => {
      markersRef.current.forEach(m => m.remove())
      markersRef.current = []
      map.remove()
      mapRef.current = null
    }
  }, [token])

  // (Re)draw routes whenever the data changes.
  useEffect(() => {
    if (mapRef.current?.isStyleLoaded()) paintRoutes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  function paintRoutes() {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return

    // Clear old markers.
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []
    const coords: Record<string, [number, number]> = {}

    const arcs = items
      .filter(it => it.dest)
      .map(it => ({
        type: 'Feature' as const,
        properties: { color: it.accent },
        geometry: { type: 'LineString' as const, coordinates: greatCircle(it.origin, it.dest as [number, number]) },
      }))
    const fc = { type: 'FeatureCollection' as const, features: arcs }

    const src = map.getSource('routes') as mapboxgl.GeoJSONSource | undefined
    if (src) {
      src.setData(fc)
    } else {
      map.addSource('routes', { type: 'geojson', data: fc })
      // Soft glow under the crisp line.
      map.addLayer({
        id: 'routes-glow',
        type: 'line',
        source: 'routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': 7, 'line-opacity': 0.22, 'line-blur': 8 },
      })
      map.addLayer({
        id: 'routes-line',
        type: 'line',
        source: 'routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': 2.4, 'line-opacity': 0.95 },
      })
    }

    // Markers: the clickable trip pin sits at the destination (or origin for a
    // single-point excursion). Open the itinerary on click.
    for (const it of items) {
      const at = it.dest ?? it.origin
      coords[it.id] = at
      const popup = new mapboxgl.Popup({ offset: 16, closeButton: false, className: 'route-popup' })
        .setHTML(`<strong>${it.label}</strong>${it.sub ? `<span>${it.sub}</span>` : ''}`)
      const m = new mapboxgl.Marker({ element: markerEl(it, () => onOpenRef.current(it.href)) })
        .setLngLat(at)
        .setPopup(popup)
        .addTo(map)
      const el = m.getElement()
      el.addEventListener('mouseenter', () => m.togglePopup())
      el.addEventListener('mouseleave', () => m.togglePopup())
      markersRef.current.push(m)
    }
    coordsRef.current = coords
  }

  return <div ref={containerRef} className="route-globe" />
}

const RouteGlobe = forwardRef(RouteGlobeInner)
export default RouteGlobe
