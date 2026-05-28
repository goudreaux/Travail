'use client'
import { useEffect } from 'react'

// Drives the sticky-compress hero pattern. As the user scrolls, this
// writes a 0→1 value into a CSS variable on <html>; CSS interpolates
// hero typography, padding, and decorative state against it. RAF-
// throttled so high-frequency scroll events don't thrash layout.
//
// Also stamps data-scrolled="1" onto each [data-scroll-hero] element
// once the user is past ~20px, so CSS can swap in the compressed-state
// bottom border without an extra interpolated property.
export function useScrollProgress({
  maxPx = 200,
  varName = '--scroll-progress',
}: { maxPx?: number; varName?: string } = {}) {
  useEffect(() => {
    let raf = 0
    const root = document.documentElement
    const tick = () => {
      const y = Math.min(Math.max(window.scrollY, 0), maxPx)
      root.style.setProperty(varName, String(y / maxPx))
      const scrolled = window.scrollY > 20 ? '1' : '0'
      document.querySelectorAll<HTMLElement>('[data-scroll-hero]').forEach(el => {
        el.dataset.scrolled = scrolled
      })
    }
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(tick)
    }
    tick() // initialize on mount
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
      root.style.removeProperty(varName)
    }
  }, [maxPx, varName])
}
