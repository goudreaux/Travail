'use client'
import { useEffect, useState } from 'react'

// Seaplane "flyover" splash shown on a fresh app launch. The face-on floatplane
// spins its propeller, grows as it flies toward the viewer, then rushes up and
// over their head, revealing the app. Doubles as a loading screen that masks the
// member shell's first data fetch. Plays once per session (sessionStorage) so
// in-app reloads — e.g. pull-to-refresh — don't replay it.
export default function LaunchAnimation() {
  const [show, setShow] = useState(true)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (sessionStorage.getItem('tv_splashed')) {
      setShow(false)
      return
    }
    sessionStorage.setItem('tv_splashed', '1')

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const leaveAt = reduce ? 280 : 1550
    const total = reduce ? 680 : 1950

    const t1 = setTimeout(() => setLeaving(true), leaveAt)
    const t2 = setTimeout(() => setShow(false), total)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  if (!show) return null

  return (
    <div className={'splash' + (leaving ? ' leaving' : '')} aria-hidden>
      <div className="splash-plane">
        <svg viewBox="0 0 256 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Travail">
          <defs>
            <linearGradient id="tvg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#f8dd97" />
              <stop offset="0.5" stopColor="#e3a12a" />
              <stop offset="1" stopColor="#b4720c" />
            </linearGradient>
            <linearGradient id="tvg2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fbe6ab" />
              <stop offset="1" stopColor="#cc8810" />
            </linearGradient>
            <radialGradient id="tvgr" cx="0.4" cy="0.35" r="0.7">
              <stop offset="0" stopColor="#fce7b0" />
              <stop offset="1" stopColor="#c07c0d" />
            </radialGradient>
            <filter id="tvsh" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#6b4a16" floodOpacity="0.26" />
            </filter>
          </defs>
          <g filter="url(#tvsh)">
            <g stroke="#8a4f06" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
              {/* tail fin */}
              <path d="M124 78 L126 54 C127 50 129 50 130 54 L132 78 Z" fill="url(#tvg)" />
              {/* wing */}
              <path d="M30 82 C70 75 186 75 226 82 C232 83 232 90 226 91 C186 95 70 95 30 90 C24 88 24 84 30 82 Z" fill="url(#tvg2)" />
              {/* floats */}
              <path d="M84 164 C82 160 90 159 98 159 L112 159 C118 159 120 161 119 165 C118 170 110 173 100 173 L92 173 C86 173 85 168 84 164 Z" fill="url(#tvg)" />
              <path d="M172 164 C174 160 166 159 158 159 L144 159 C138 159 136 161 137 165 C138 170 146 173 156 173 L164 173 C170 173 171 168 172 164 Z" fill="url(#tvg)" />
              {/* struts */}
              <path d="M98 159 L116 114 L120 115 L102 159 Z" fill="url(#tvg2)" />
              <path d="M158 159 L140 114 L136 115 L154 159 Z" fill="url(#tvg2)" />
              {/* fuselage */}
              <path d="M114 84 C112 102 113 120 118 132 C122 138 134 138 138 132 C143 120 144 102 142 84 C140 76 116 76 114 84 Z" fill="url(#tvg)" />
              {/* cockpit window */}
              <path d="M118 102 C124 98 132 98 138 102 L136 110 C132 107 124 107 120 110 Z" fill="#0d3340" opacity="0.5" stroke="none" />
              {/* engine cowl */}
              <circle cx="128" cy="90" r="19" fill="url(#tvgr)" />
            </g>
            {/* propeller arc hint */}
            <circle cx="128" cy="90" r="40" fill="#caa23a" opacity="0.10" stroke="none" />
            {/* propeller (spins around the hub) */}
            <g className="splash-prop">
              <path d="M125 88 C123 64 126 50 128 50 C130 50 133 64 131 88 C130 92 126 92 125 88 Z" fill="url(#tvg2)" stroke="#8a4f06" strokeWidth="1.2" transform="rotate(0 128 90)" />
              <path d="M125 88 C123 64 126 50 128 50 C130 50 133 64 131 88 C130 92 126 92 125 88 Z" fill="url(#tvg2)" stroke="#8a4f06" strokeWidth="1.2" transform="rotate(120 128 90)" />
              <path d="M125 88 C123 64 126 50 128 50 C130 50 133 64 131 88 C130 92 126 92 125 88 Z" fill="url(#tvg2)" stroke="#8a4f06" strokeWidth="1.2" transform="rotate(240 128 90)" />
              <circle cx="128" cy="90" r="6" fill="#8a4f06" />
            </g>
          </g>
        </svg>
      </div>
    </div>
  )
}
