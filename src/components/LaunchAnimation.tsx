'use client'
import { useEffect, useRef, useState } from 'react'

// Launch splash: fades into the Midjourney seaplane clip, fades "Travail" in over
// the settling water, then fades away to reveal the page beneath (login when
// signed out). Doubles as a cold-start loading cover. Plays once per session
// (sessionStorage) so in-app reloads — e.g. pull-to-refresh — don't replay it.
// Respects prefers-reduced-motion (skips the video).
export default function LaunchAnimation() {
  const [show, setShow] = useState(true)
  const [phase, setPhase] = useState<'video' | 'word' | 'leaving'>('video')
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
    if (reduce) {
      vRef.current?.pause()
      advance()
    } else {
      // Safety: advance even if the video's 'ended' never fires (e.g. autoplay blocked).
      timers.push(setTimeout(advance, 7000))
    }
    return () => timers.forEach(clearTimeout)
  }, [])

  if (!show) return null

  return (
    <div
      className={'splash' + (phase !== 'video' ? ' show-word' : '') + (phase === 'leaving' ? ' leaving' : '')}
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
