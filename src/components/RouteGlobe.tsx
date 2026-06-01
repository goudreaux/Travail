'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

// Tropical 3D route map. A pitched globe on a warm turquoise/sand basemap
// (labels + roads stripped), with terrain relief and flight paths that physically
// arc up into the air — coral at the origin warming to gold at the destination —
// using Mapbox's native elevated lines (line-z-offset). Bare origin/destination
// dots; the side list carries the names.

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

// Rough great-circle distance in km (equirectangular approximation — fine at
// these regional scales) so each arc's peak height scales with its length.
function distKm(a: [number, number], b: [number, number]): number {
  const R = 6371, toR = Math.PI / 180
  const dLat = (b[1] - a[1]) * toR
  const dLon = (b[0] - a[0]) * toR
  const lat = ((a[1] + b[1]) / 2) * toR
  const x = dLon * Math.cos(lat), y = dLat
  return Math.sqrt(x * x + y * y) * R
}

// Peak height (metres) of the airborne arc — taller for longer hops, clamped so
// short and long routes both read well at the map's pitch.
function arcPeak(a: [number, number], b: [number, number]): number {
  return Math.min(Math.max(distKm(a, b) * 95, 32000), 190000)
}

// Mostly-straight ground track with a faint horizontal bow; the dramatic curve
// comes from the vertical arc (line-z-offset), not the geometry.
function arcCurve(a: [number, number], b: [number, number], steps = 96): [number, number][] {
  const [ax, ay] = a, [bx, by] = b
  const dx = bx - ax, dy = by - ay
  const dist = Math.hypot(dx, dy) || 1
  const px = -dy / dist, py = dx / dist
  const bow = Math.min(Math.max(dist * 0.05, 0.06), 1.2)
  const cx = (ax + bx) / 2 + px * bow
  const cy = (ay + by) / 2 + py * bow
  const pts: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t
    pts.push([u * u * ax + 2 * u * t * cx + t * t * bx, u * u * ay + 2 * u * t * cy + t * t * by])
  }
  return pts
}

// Parabolic vertical profile: 0 at both ends (flush with the ground dots),
// peaking at the route's midpoint. Scaled per-feature by its `peak` property.
const ARC_Z = ['*', ['get', 'peak'], ['-', 1, ['^', ['-', ['*', 2, ['line-progress']], 1], 2]]]

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
      if (c && mapRef.current) mapRef.current.flyTo({ center: c, zoom: 7.4, pitch: 62, speed: 0.7, essential: true })
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
        pitch: 62,        // tilt the camera so the airborne arcs read as 3D
        bearing: -17,
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
      const SAND  = '#efdfb6' // sun-warmed sand
      const WATER = '#5cc6c8' // tropical turquoise
      const GREEN = '#a9d49a' // soft palm green
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
      map.setFog({ color: 'rgb(252,244,222)', 'high-color': 'rgb(255,214,140)', 'horizon-blend': 0.06, 'space-color': 'rgb(208,236,233)', 'star-intensity': 0 })
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

  function ptEl(kind: 'origin' | 'dest', onClick?: () => void): HTMLElement {
    const el = document.createElement(onClick ? 'button' : 'div')
    if (onClick) (el as HTMLButtonElement).type = 'button'
    el.className = `route-pt route-pt--${kind}`
    el.innerHTML = `<span class="route-pt__dot">${kind === 'dest' ? '<span class="route-pt__pulse"></span>' : ''}</span>`
    if (onClick) el.addEventListener('click', ev => { ev.stopPropagation(); onClick() })
    return el
  }

  function paint() {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    const list = itemsRef.current

    markersRef.current.forEach(m => m.remove()); markersRef.current = []
    const coords: Record<string, [number, number]> = {}

    const features = list.filter(it => it.dest).map(it => {
      const o = it.origin, d = it.dest as [number, number]
      return {
        type: 'Feature' as const,
        properties: { peak: arcPeak(o, d) },
        geometry: { type: 'LineString' as const, coordinates: arcCurve(o, d) },
      }
    })
    const data = { type: 'FeatureCollection' as const, features }

    const src = map.getSource('routes') as mapboxgl.GeoJSONSource | undefined
    if (src) { src.setData(data) }
    else {
      map.addSource('routes', { type: 'geojson', data, lineMetrics: true })
      // Elevated lines: each arc bows up off the surface (line-z-offset) and
      // lands flush on the dots. Soft white casing underneath, then a tropical
      // sunset core — coral at the origin warming to gold at the destination.
      // line-z-offset / line-elevation-reference aren't in the typings yet.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.addLayer({
        id: 'routes-casing', type: 'line', source: 'routes',
        layout: { 'line-cap': 'round', 'line-join': 'round', 'line-elevation-reference': 'ground', 'line-z-offset': ARC_Z },
        paint: { 'line-color': '#ffffff', 'line-width': 6, 'line-opacity': 0.8, 'line-emissive-strength': 1 },
      } as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.addLayer({
        id: 'routes-core', type: 'line', source: 'routes',
        layout: { 'line-cap': 'round', 'line-join': 'round', 'line-elevation-reference': 'ground', 'line-z-offset': ARC_Z },
        paint: { 'line-width': 3.2, 'line-emissive-strength': 1, 'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, '#ff7a4d', 0.5, '#ff9b3d', 1, '#f6c233'] },
      } as any)
    }

    // Markers are bare dots — no text labels (the side list carries the names).
    for (const it of list) {
      if (it.dest) {
        // Full route: a blue origin dot + a shiny gold, clickable destination.
        coords[it.id] = it.dest
        const om = new mapboxgl.Marker({ element: ptEl('origin') }).setLngLat(it.origin).addTo(map)
        const dm = new mapboxgl.Marker({ element: ptEl('dest', () => onOpenRef.current(it.href)) })
          .setLngLat(it.dest).addTo(map)
        markersRef.current.push(om, dm)
      } else {
        // No destination coordinates yet (e.g. a custom proposal) — show a
        // single clickable origin dot.
        coords[it.id] = it.origin
        const om = new mapboxgl.Marker({ element: ptEl('origin', () => onOpenRef.current(it.href)) })
          .setLngLat(it.origin).addTo(map)
        markersRef.current.push(om)
      }
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
