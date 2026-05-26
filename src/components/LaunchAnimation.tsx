'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

// Launch splash: fades into the Midjourney seaplane clip, then crossfades into
// the app a beat before the clip ends. Mobile-only, and only inside the member
// area — it does NOT show on the login / onboarding screens, so it plays once
// you're signed in (the app reloads to "/" after login). Plays once per session
// (sessionStorage) so in-app reloads — e.g. pull-to-refresh — don't replay it.
//
// iOS blocks autoplay in Low Power Mode (and can reject muted autoplay). If the
// video can't play we show the poster (with a slow zoom) instead. Reduced-motion
// skips the video too.
export default function LaunchAnimation() {
  const pathname = usePathname()
  const onAuthScreen =
    !!pathname && (pathname.startsWith('/login') || pathname.startsWith('/onboarding'))
  const [show, setShow] = useState(true)
  const [leaving, setLeaving] = useState(false)
  const [noVideo, setNoVideo] = useState(false)
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
      timers.push(setTimeout(() => setShow(false), 260))
    }
    // Autoplay blocked or video failed to load: show the poster, then fade out.
    const fail = () => {
      if (settled) return
      settled = true
      setNoVideo(true)
      timers.push(setTimeout(finish, 1100))
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
        // Start the crossfade in tandem with the clip's built-in fade-out so the
        // whole splash lands at ~1.5s total.
        const dur = isFinite(v.duration) && v.duration > 0 ? v.duration * 1000 : 1500
        timers.push(setTimeout(finish, Math.max(300, dur - 250)))
      }).catch(fail)
    } else {
      timers.push(setTimeout(finish, 1500))
    }
    return () => timers.forEach(clearTimeout)
  }, [onAuthScreen])

  if (!show || onAuthScreen) return null

  return (
    <div className={'splash' + (noVideo ? ' no-video' : '') + (leaving ? ' leaving' : '')} aria-hidden>
      <div className="splash-poster" />
      <video
        ref={vRef}
        className="splash-video"
        src="/launch.mp4"
        poster="/launch-poster.jpg"
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
