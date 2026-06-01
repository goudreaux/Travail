'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { ArcLayer } from '@deck.gl/layers'

// Route map on the Mapbox Standard (v3) DAY basemap (light tones) with true
// 3D arcs rendered by deck.gl's ArcLayer — lifted parabolic flight paths that
// rise off the map, fading from the route's color at the origin to GOLD at the
// destination. Origin = colored dot, destination = golden pin.

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

const GOLD: [number, number, number] = [240, 182, 60]
const GOLD_HEX = '#f0b63c'

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const f = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  const n = parseInt(f, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

type Props = { token: string; items: RouteItem[]; onOpen: (href: string) => void }

function RouteGlobeInner({ token, items, onOpen }: Props, ref: React.Ref<RouteGlobeHandle>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const overlayRef = useRef<any>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])
  const coordsRef = useRef<Record<string, [number, number]>>({})
  const onOpenRef = useRef(onOpen); onOpenRef.current = onOpen
  const itemsRef = useRef(items); itemsRef.current = items
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useImperativeHandle(ref, () => ({
    flyTo(id: string) {
      const c = coordsRef.current[id]
      if (c && mapRef.current) mapRef.current.flyTo({ center: c, zoom: 6.6, pitch: 58, speed: 0.7, essential: true })
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
        center: [-82.2, 27.6],
        zoom: 5.5,
        pitch: 50,
        bearing: -8,
        attributionControl: false,
      })
    } catch (e) {
      setError((e as Error).message || 'Could not start the map.')
      return
    }
    mapRef.current = map
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')

    map.on('style.load', () => {
      // Bright daytime basemap so the dark/colored arcs pop, with a soft light
      // atmosphere instead of the dusk one.
      try { map.setConfigProperty('basemap', 'lightPreset', 'day') } catch { /* style may not support it */ }
      map.setFog({ color: 'rgb(255,255,255)', 'high-color': 'rgb(176,208,232)', 'horizon-blend': 0.05, 'space-color': 'rgb(206,224,238)', 'star-intensity': 0 })
    })

    // deck.gl overlay for the true-3D arcs.
    try {
      const overlay = new MapboxOverlay({ interleaved: false, layers: [] })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.addControl(overlay as any)
      overlayRef.current = overlay
    } catch { /* arcs are a progressive enhancement; markers still render */ }

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
      try { if (overlayRef.current) map.removeControl(overlayRef.current) } catch { /* ignore */ }
      overlayRef.current = null
      map.remove(); mapRef.current = null
    }
  }, [token])

  // Repaint when data changes (once the style is ready).
  useEffect(() => { if (ready) paint() }, [items, ready]) // eslint-disable-line react-hooks/exhaustive-deps

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
    el.style.setProperty('--mk', GOLD_HEX) // destinations are golden
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

    // ── 3D arcs (deck.gl) ──────────────────────────────────────────────
    const arcData = list.filter(it => it.dest).map(it => ({
      source: it.origin,
      target: it.dest as [number, number],
      from: hexToRgb(it.accent),
    }))
    if (overlayRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const common: any = {
        data: arcData,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getSourcePosition: (d: any) => d.source,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getTargetPosition: (d: any) => d.target,
        getHeight: 0.55,
        greatCircle: false,
        pickable: false,
      }
      const glow = new ArcLayer({
        ...common, id: 'arc-glow',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getSourceColor: (d: any) => [...d.from, 60] as [number, number, number, number],
        getTargetColor: [...GOLD, 60] as [number, number, number, number],
        getWidth: 14, widthUnits: 'pixels',
      })
      const core = new ArcLayer({
        ...common, id: 'arc-core',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getSourceColor: (d: any) => [...d.from, 235] as [number, number, number, number],
        getTargetColor: [...GOLD, 255] as [number, number, number, number],
        getWidth: 3.5, widthUnits: 'pixels',
      })
      overlayRef.current.setProps({ layers: [glow, core] })
    }

    // ── Endpoint markers ───────────────────────────────────────────────
    for (const it of list) {
      const at = it.dest ?? it.origin
      coords[it.id] = at
      if (it.dest) {
        const om = new mapboxgl.Marker({ element: originEl(it.accent) }).setLngLat(it.origin).addTo(map)
        markersRef.current.push(om)
      }
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
