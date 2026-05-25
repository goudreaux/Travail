'use client'
import { useEffect, useRef, useState } from 'react'

// Launch splash: fades into the Midjourney seaplane clip, fades "Travail" in over
// the settling water, then fades away to reveal the page beneath (login when
// signed out). Doubles as a cold-start loading cover. Plays once per session
// (sessionStorage) so in-app reloads — e.g. pull-to-refresh — don't replay it.
//
// iOS blocks autoplay in Low Power Mode (and can reject muted autoplay), which
// otherwise leaves a frozen <video> with a play button. So we start playback
// programmatically and, if it's refused, drop the video and show the poster
// frame under the wordmark instead. Reduced-motion skips the video too.
export default function LaunchAnimation() {
  const [show, setShow] = useState(true)
  const [phase, setPhase] = useState<'video' | 'word' | 'leaving'>('video')
  const [noVideo, setNoVideo] = useState(false)
  const goWord = useRef<() => void>(() => {})
  const vRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (sessionStorage.getItem('tv_splashed')) {
      setShow(false)
      return
    }
    sessionStorage.setItem('tv_splashed', '1')

    const timers: ReturnType<typeof setTimeout>[] = []
    let advanced = false
    const advance = () => {
      if (advanced) return
      advanced = true
      setPhase('word')
      timers.push(setTimeout(() => setPhase('leaving'), 1400))
      timers.push(setTimeout(() => setShow(false), 2000))
    }
    goWord.current = advance

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const v = vRef.current
    if (reduce || !v) {
      setNoVideo(true)
      timers.push(setTimeout(advance, 900))
      return () => timers.forEach(clearTimeout)
    }

    v.muted = true
    const p = v.play()
    if (p && typeof p.then === 'function') {
      p.then(() => {
        // Played: advance on 'ended'; this is a safety net if that never fires.
        timers.push(setTimeout(advance, 9000))
      }).catch(() => {
        // Autoplay refused (e.g. Low Power Mode): show the poster + wordmark.
        setNoVideo(true)
        timers.push(setTimeout(advance, 900))
      })
    } else {
      timers.push(setTimeout(advance, 9000))
    }
    return () => timers.forEach(clearTimeout)
  }, [])

  if (!show) return null

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
      <video
        ref={vRef}
        className="splash-video"
        src="/launch.mp4"
        poster="/launch-poster.jpg"
        autoPlay
        muted
        playsInline
        preload="auto"
        onEnded={() => goWord.current()}
      />
      <div className="splash-word">Travail</div>
    </div>
  )
}
