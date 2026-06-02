'use client'

import { useEffect, useRef, useState } from 'react'
import nextDynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { fetchLocations, coordsFromLocations, type LibraryLocation } from '@/lib/locations'
import { ROUTE_ACCENT } from '@/lib/route-items'

// Mapbox touches window — browser-only, and only mounted once the preview
// scrolls into view (so it never competes with the page's main content).
const RoutePreviewMap = nextDynamic(() => import('@/components/RoutePreviewMap'), { ssr: false })
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

// Drop-in route map for reservation / itinerary pages. Give it the origin and
// (optional) destination codes + the trip kind; it resolves coordinates from
// the Location Library and renders a lightweight static route preview.
export default function RoutePreview({
  originCode, destCode, kind, height = 200,
}: {
  originCode: string | null | undefined
  destCode?: string | null
  kind: 'flight' | 'excursion' | 'proposal'
  height?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [locs, setLocs] = useState<LibraryLocation[] | null>(null)

  // Mount the map only when scrolled near the viewport.
  useEffect(() => {
    if (!ref.current || visible) return
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); io.disconnect() }
    }, { rootMargin: '200px' })
    io.observe(ref.current)
    return () => io.disconnect()
  }, [visible])

  // Resolve coordinates from the Library once we're going to render.
  useEffect(() => {
    if (!visible || locs) return
    fetchLocations(createClient()).then(setLocs).catch(() => setLocs([]))
  }, [visible, locs])

  if (!MAPBOX_TOKEN || !originCode) return null
  const origin = locs ? coordsFromLocations(locs, originCode) : null
  const dest = locs && destCode ? coordsFromLocations(locs, destCode) : null

  return (
    <div ref={ref} style={{ width: '100%', height, borderRadius: 14, overflow: 'hidden', background: 'var(--warm, #f1ece0)' }}>
      {visible && locs && origin && (
        <RoutePreviewMap token={MAPBOX_TOKEN} origin={origin} dest={dest} color={ROUTE_ACCENT[kind]} height={height} />
      )}
    </div>
  )
}
