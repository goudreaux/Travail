'use client'
import { useEffect, useRef, useState } from 'react'

// Custom pull-to-refresh for the installed PWA (iOS standalone has no native one).
// Activates only when the page is scrolled to the very top and the user drags down.
const THRESHOLD = 68
const MAX = 120

export default function PullToRefresh() {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [dragging, setDragging] = useState(false)
  const startY = useRef<number | null>(null)
  const pulling = useRef(false)
  const dist = useRef(0)
  const busy = useRef(false)

  useEffect(() => {
    const atTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 0

    const onStart = (e: TouchEvent) => {
      if (busy.current || e.touches.length !== 1 || !atTop()) { pulling.current = false; return }
      startY.current = e.touches[0].clientY
      pulling.current = true
      setDragging(true)
    }
    const onMove = (e: TouchEvent) => {
      if (!pulling.current || startY.current == null || busy.current) return
      const dy = e.touches[0].clientY - startY.current
      if (dy > 0 && atTop()) {
        const d = Math.min(MAX, dy * 0.5)
        dist.current = d
        setPull(d)
        if (d > 5) e.preventDefault() // we own the gesture; stop the rubber-band
      } else {
        dist.current = 0
        setPull(0)
        pulling.current = false
        setDragging(false)
      }
    }
    const onEnd = () => {
      if (!pulling.current) return
      pulling.current = false
      setDragging(false)
      startY.current = null
      if (dist.current >= THRESHOLD) {
        busy.current = true
        setRefreshing(true)
        setPull(52)
        setTimeout(() => window.location.reload(), 400)
      } else {
        dist.current = 0
        setPull(0)
      }
    }

    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd, { passive: true })
    document.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  const visible = pull > 0 || refreshing
  const reached = pull >= THRESHOLD || refreshing
  const rot = Math.min(360, (pull / THRESHOLD) * 320)

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: visible ? Math.max(pull, 0) : 0,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        paddingBottom: 8,
        pointerEvents: 'none',
        zIndex: 200,
        overflow: 'hidden',
        transition: dragging ? 'none' : 'height 0.22s ease, opacity 0.22s ease',
        opacity: visible ? 1 : 0,
      }}
    >
      <div style={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        background: 'var(--card)',
        boxShadow: '0 3px 12px rgba(13,51,64,0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {refreshing ? (
          <span className="pending-indicator" style={{ width: 16, height: 16, borderWidth: 2 }} />
        ) : (
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke={reached ? 'var(--tropic-d)' : 'var(--ink-light)'} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: `rotate(${rot}deg)`, transition: 'stroke 0.12s' }}
          >
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
        )}
      </div>
    </div>
  )
}
