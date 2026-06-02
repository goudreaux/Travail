'use client'

import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

// Lightweight, non-interactive single-route preview — same tropical look as the
// main map (sand/turquoise basemap, type-colored line, blue origin + gold
// destination dots) but framed on one route, with no terrain, compass, or
// interaction so it's cheap to render on reservation/itinerary pages.

function arc(a: [number, number], b: [number, number], steps = 80): [number, number][] {
  const [ax, ay] = a, [bx, by] = b
  const dx = bx - ax, dy = by - ay
  const dist = Math.hypot(dx, dy) || 1
  const px = -dy / dist, py = dx / dist
  const bow = Math.min(Math.max(dist * 0.14, 0.2), 6)
  const cx = (ax + bx) / 2 + px * bow, cy = (ay + by) / 2 + py * bow
  const pts: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t
    pts.push([u * u * ax + 2 * u * t * cx + t * t * bx, u * u * ay + 2 * u * t * cy + t * t * by])
  }
  return pts
}

function dotEl(kind: 'origin' | 'dest'): HTMLElement {
  const el = document.createElement('div')
  el.className = `route-pt route-pt--${kind}`
  el.innerHTML = `<span class="route-pt__dot">${kind === 'dest' ? '<span class="route-pt__pulse"></span>' : ''}</span>`
  return el
}

export default function RoutePreviewMap({
  token, origin, dest, color, height = 200,
}: {
  token: string
  origin: [number, number]
  dest: [number, number] | null
  color: string
  height?: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !token) return
    mapboxgl.accessToken = token
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      interactive: false, // static preview — never hijacks page scroll
      attributionControl: false,
      center: dest ? [(origin[0] + dest[0]) / 2, (origin[1] + dest[1]) / 2] : origin,
      zoom: 6,
    })
    mapRef.current = map

    map.on('style.load', () => {
      const SAND = '#f2ecd9', WATER = '#b3dcd9', GREEN = '#cfdfc2'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const set = (id: string, p: string, v: unknown) => { try { (map.setPaintProperty as any)(id, p, v) } catch { /* noop */ } }
      const hide = (id: string) => { try { map.setLayoutProperty(id, 'visibility', 'none') } catch { /* noop */ } }
      for (const layer of map.getStyle().layers ?? []) {
        const id = layer.id, type = layer.type
        if (type === 'symbol' || type === 'line' || type === 'fill-extrusion') { hide(id); continue }
        if (type === 'background') { set(id, 'background-color', SAND); continue }
        if (type === 'fill') {
          if (/water|ocean|sea|bay|lake|river|pond|marine/i.test(id)) set(id, 'fill-color', WATER)
          else if (/wood|forest|park|grass|vegetation|scrub|golf|pitch|landcover/i.test(id)) set(id, 'fill-color', GREEN)
          else set(id, 'fill-color', SAND)
        }
      }

      if (dest) {
        map.addSource('r', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: arc(origin, dest) } } })
        map.addLayer({ id: 'r-casing', type: 'line', source: 'r', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fff', 'line-width': 6, 'line-opacity': 0.85 } })
        map.addLayer({ id: 'r-core', type: 'line', source: 'r', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': color, 'line-width': 3.2 } })
      }

      new mapboxgl.Marker({ element: dotEl('origin') }).setLngLat(origin).addTo(map)
      if (dest) new mapboxgl.Marker({ element: dotEl('dest') }).setLngLat(dest).addTo(map)

      // Frame the route.
      if (dest) {
        const b = new mapboxgl.LngLatBounds(origin, origin)
        b.extend(dest)
        map.fitBounds(b, { padding: 56, maxZoom: 9, duration: 0 })
      } else {
        map.setCenter(origin); map.setZoom(8)
      }
      map.resize()
    })

    return () => { map.remove(); mapRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  return <div ref={containerRef} style={{ width: '100%', height, borderRadius: 14, overflow: 'hidden' }} />
}
