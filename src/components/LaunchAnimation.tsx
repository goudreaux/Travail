'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

// Launch splash: fades into the Midjourney seaplane clip, plays it through, then
// fades away to reveal the app. Mobile-only, and only inside the member area —
// it does NOT show on the login / onboarding screens, so it plays once you're
// signed in (the app reloads to "/" after login). Plays once per session
// (sessionStorage) so in-app reloads — e.g. pull-to-refresh — don't replay it.
//
// iOS blocks autoplay in Low Power Mode (and can reject muted autoplay), which
// otherwise leaves a frozen <video> with a play button. So we start playback
// programmatically and, if it's refused, drop the video and just reveal the page
// (showing the poster briefly). Reduced-motion skips the video too.
export default function LaunchAnimation() {
  const pathname = usePathname()
  const onAuthScreen =
    !!pathname && (pathname.startsWith('/login') || pathname.startsWith('/onboarding'))
  const [show, setShow] = useState(true)
  const [leaving, setLeaving] = useState(false)
  const [noVideo, setNoVideo] = useState(false)
  const finishRef = useRef<() => void>(() => {})
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
    const finish = () => {
      if (done) return
      done = true
      setLeaving(true)
      timers.push(setTimeout(() => setShow(false), 700))
    }
    finishRef.current = finish

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const mobile = window.matchMedia?.('(max-width: 768px)').matches
    if (!mobile) {
      // Desktop: no launch splash.
      setShow(false)
      return
    }

    const v = vRef.current
    if (reduce || !v) {
      setNoVideo(true)
      timers.push(setTimeout(finish, 1100))
      return () => timers.forEach(clearTimeout)
    }

    v.muted = true
    const p = v.play()
    if (p && typeof p.then === 'function') {
      p.then(() => {
        // Safety net in case 'ended' never fires; sized to the clip's length.
        const ms = isFinite(v.duration) && v.duration > 0 ? v.duration * 1000 + 1500 : 9000
        timers.push(setTimeout(finish, ms))
      }).catch(() => {
        // Autoplay refused (e.g. Low Power Mode): skip the video, reveal the page.
        setNoVideo(true)
        timers.push(setTimeout(finish, 1100))
      })
    } else {
      timers.push(setTimeout(finish, 9000))
    }
    return () => timers.forEach(clearTimeout)
  }, [onAuthScreen])

  if (!show || onAuthScreen) return null

  return (
    <div className={'splash' + (noVideo ? ' no-video' : '') + (leaving ? ' leaving' : '')} aria-hidden>
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
      />
    </div>
  )
}
