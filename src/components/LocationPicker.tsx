'use client'

import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

// Small click-to-drop coordinate picker. Click the map (or drag the pin) to set
// a location; the chosen lat/lng is reported back via onPick. Used by the
// Concierge Library and the custom-destination flow so coordinates never have to
// be typed by hand. Mapbox touches window, so callers load this with ssr:false.
export default function LocationPicker({
  token, lat, lng, onPick, height = 300,
}: {
  token: string
  lat: number | null
  lng: number | null
  onPick: (lat: number, lng: number) => void
  height?: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markerRef = useRef<mapboxgl.Marker | null>(null)
  const onPickRef = useRef(onPick); onPickRef.current = onPick

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !token) return
    mapboxgl.accessToken = token
    const hasStart = lat != null && lng != null
    const start: [number, number] = hasStart ? [lng as number, lat as number] : [-82.2, 27.6]
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: start,
      zoom: hasStart ? 9 : 5.6,
      attributionControl: false,
    })
    mapRef.current = map
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')

    const marker = new mapboxgl.Marker({ color: '#f0b63c', draggable: true }).setLngLat(start).addTo(map)
    markerRef.current = marker
    if (!hasStart) marker.getElement().style.display = 'none'
    marker.on('dragend', () => { const p = marker.getLngLat(); onPickRef.current(p.lat, p.lng) })
    map.on('click', e => {
      marker.setLngLat(e.lngLat)
      marker.getElement().style.display = ''
      onPickRef.current(e.lngLat.lat, e.lngLat.lng)
    })

    return () => { map.remove(); mapRef.current = null }
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the pin in sync when lat/lng change from the inputs.
  useEffect(() => {
    const m = markerRef.current
    if (m && lat != null && lng != null) {
      m.setLngLat([lng, lat])
      m.getElement().style.display = ''
    }
  }, [lat, lng])

  if (!token) {
    return (
      <div style={{ height, borderRadius: 12, border: '1px dashed var(--hair-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, textAlign: 'center', fontSize: 12.5, color: 'var(--ink-light)' }}>
        Set NEXT_PUBLIC_MAPBOX_TOKEN to pick coordinates on a map.
      </div>
    )
  }
  return (
    <div style={{ position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--hair)' }} />
      <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(255,255,255,0.92)', borderRadius: 8, padding: '4px 9px', fontSize: 11, color: 'var(--ink-soft)', fontFamily: 'var(--mono)', pointerEvents: 'none' }}>
        Click the map or drag the pin
      </div>
    </div>
  )
}
