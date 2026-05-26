'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

// Launch splash: fades into the seaplane clip, then crossfades into the app a
// beat before the clip ends. Mobile-only, member-area only, plays once per
// session (sessionStorage gate so pull-to-refresh doesn't replay it).
//
// iOS Low Power Mode (and reduced-motion) blocks muted autoplay. When that
// happens we don't show any fallback — the splash exits immediately and the
// member lands straight in the feed. The previous poster + Ken Burns fallback
// caused iOS to flash a native play-button overlay before bailing, which read
// as broken.
export default function LaunchAnimation() {
  const pathname = usePathname()
  const onAuthScreen =
    !!pathname && (pathname.startsWith('/login') || pathname.startsWith('/onboarding'))
  const [show, setShow] = useState(true)
  const [leaving, setLeaving] = useState(false)
  const finishRef = useRef<() => void>(() => {})
  const failRef = useRef<() => void>(() => {})
  const vRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (onAuthScreen) return
    if (sessionStorage.getItem('tv_splashed')) {
      setShow(false)
      return
    }
    sessionStorage.setItem('tv_splashed', '1')

    const timers: ReturnType<typeof setTimeout>[] = []
    let done = false
    let settled = false
    const finish = () => {
      if (done) return
      done = true
      setLeaving(true)
      timers.push(setTimeout(() => setShow(false), 720))
    }
    // Autoplay blocked (Low Power Mode) or video errored — just unmount the
    // splash immediately. No poster fallback, no fade.
    const fail = () => {
      if (settled) return
      settled = true
      setShow(false)
    }
    finishRef.current = finish
    failRef.current = fail

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const mobile = window.matchMedia?.('(max-width: 768px)').matches
    if (!mobile) {
      // Desktop: no launch splash.
      setShow(false)
      return
    }

    const v = vRef.current
    if (reduce || !v) {
      fail()
      return () => timers.forEach(clearTimeout)
    }

    v.muted = true
    const p = v.play()
    if (p && typeof p.then === 'function') {
      p.then(() => {
        settled = true
        // Begin the CSS crossfade ~700ms before the clip ends so it overlaps
        // the clip's own gradual fade-out — gives a single long, gradual fade
        // into the feed instead of an abrupt cut.
        const dur = isFinite(v.duration) && v.duration > 0 ? v.duration * 1000 : 2500
        timers.push(setTimeout(finish, Math.max(300, dur - 700)))
      }).catch(fail)
    } else {
      timers.push(setTimeout(finish, 1500))
    }
    return () => timers.forEach(clearTimeout)
  }, [onAuthScreen])

  if (!show || onAuthScreen) return null

  return (
    <div className={'splash' + (leaving ? ' leaving' : '')} aria-hidden>
      {/* No `poster` attribute on the <video> — iOS overlays a play button on
          the poster image until play() resolves, which flashes for LPM users
          right before we tear the splash down. */}
      <video
        ref={vRef}
        className="splash-video"
        src="/launch.mp4"
        autoPlay
        muted
        playsInline
        preload="auto"
        onEnded={() => finishRef.current()}
        onError={() => failRef.current()}
      />
    </div>
  )
}
