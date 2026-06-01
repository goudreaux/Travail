'use client'
import { useEffect, useState } from 'react'
import { THEMES, getStoredTheme, setStoredTheme, type Theme } from '@/lib/theme'

// Display-theme selector for the membership/settings page. Applies the choice
// live (and persists it per-device). The actual palette swap is handled by the
// data-theme attribute + scoped tokens in globals.css.
export default function ThemePicker() {
  const [theme, setTheme] = useState<Theme>('current')

  // Read the stored choice on mount (avoids a hydration mismatch — SSR always
  // renders 'current', then we sync to whatever's saved).
  useEffect(() => { setTheme(getStoredTheme()) }, [])

  function choose(t: Theme) {
    setTheme(t)
    setStoredTheme(t)
  }

  // Tiny palette swatch per option so the choice is visual, not just text.
  const swatch = (t: Theme) => {
    const c = t === 'dark'
      ? { bg: '#0e2229', card: '#15343f', ink: '#eaf1f3' }
      : t === 'light'
      ? { bg: '#eef1f5', card: '#ffffff', ink: '#0d3340' }
      : { bg: '#f5ede0', card: '#fffbf0', ink: '#0d3340' }
    return (
      <span style={{ display: 'flex', width: 38, height: 26, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--hair-2)', flexShrink: 0, background: c.bg }}>
        <span style={{ margin: 'auto', width: 22, height: 12, borderRadius: 3, background: c.card, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ width: 10, height: 2, borderRadius: 2, background: c.ink }} />
        </span>
      </span>
    )
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Display</h3>
      </div>
      <div style={{ padding: '8px 0' }}>
        {THEMES.map(opt => {
          const active = theme === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => choose(opt.value)}
              aria-pressed={active}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                padding: '11px 20px', background: 'transparent', border: 'none',
                borderBottom: '1px solid var(--hair)', cursor: 'pointer', textAlign: 'left',
              }}
            >
              {swatch(opt.value)}
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: active ? 600 : 500, color: 'var(--ink)' }}>{opt.label}</span>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-light)', marginTop: 1 }}>{opt.hint}</span>
              </span>
              <span
                aria-hidden
                style={{
                  flexShrink: 0, width: 18, height: 18, borderRadius: '50%',
                  border: `2px solid ${active ? 'var(--tropic)' : 'var(--hair-2)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {active && <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--tropic)' }} />}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
