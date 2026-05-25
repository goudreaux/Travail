'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

// Launch splash: fades into the Midjourney seaplane clip, plays it through, then
// fades the "Travail" wordmark in and fades out to reveal the app. Mobile-only,
// and only inside the member area — it does NOT show on the login / onboarding
// screens, so it plays once you're signed in (the app reloads to "/" after
// login). Plays once per session (sessionStorage) so in-app reloads — e.g.
// pull-to-refresh — don't replay it.
//
// iOS blocks autoplay in Low Power Mode (and can reject muted autoplay). If the
// video can't play we show the poster (with a slow zoom) under the wordmark
// instead. Reduced-motion skips the video too.
export default function LaunchAnimation() {
  const pathname = usePathname()
  const onAuthScreen =
    !!pathname && (pathname.startsWith('/login') || pathname.startsWith('/onboarding'))
  const [show, setShow] = useState(true)
  const [phase, setPhase] = useState<'video' | 'word' | 'leaving'>('video')
  const [noVideo, setNoVideo] = useState(false)
  const toWordRef = useRef<() => void>(() => {})
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
    let advanced = false
    let settled = false
    // Video done (or skipped): fade the wordmark in, hold, then fade out.
    const toWord = () => {
      if (advanced) return
      advanced = true
      setPhase('word')
      timers.push(setTimeout(() => setPhase('leaving'), 1600))
      timers.push(setTimeout(() => setShow(false), 2300))
    }
    // Autoplay blocked or video failed to load: show the poster, then continue.
    const fail = () => {
      if (settled) return
      settled = true
      setNoVideo(true)
      timers.push(setTimeout(toWord, 1400))
    }
    toWordRef.current = toWord
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
        // Safety net in case 'ended' never fires; sized to the clip's length.
        const ms = isFinite(v.duration) && v.duration > 0 ? v.duration * 1000 + 1500 : 9000
        timers.push(setTimeout(toWord, ms))
      }).catch(fail)
    } else {
      timers.push(setTimeout(toWord, 9000))
    }
    return () => timers.forEach(clearTimeout)
  }, [onAuthScreen])

  if (!show || onAuthScreen) return null

  return (
    <div
      className={
        'splash' +
        (noVideo ? ' no-video' : '') +
        (phase !== 'video' ? ' show-word' : '') +
        (phase === 'leaving' ? ' leaving' : '')
      }
      aria-hidden
    >
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
        onEnded={() => toWordRef.current()}
        onError={() => failRef.current()}
      />
      <div className="splash-word">Travail</div>
    </div>
  )
}
