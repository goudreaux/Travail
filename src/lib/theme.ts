// Member-app display theme. Three distinct palettes:
//   • 'current' — the default warm cream look (the :root tokens, no attribute).
//   • 'light'   — a cooler, brighter white palette.
//   • 'dark'    — dark palette.
//
// The choice is stored per-device in localStorage and applied by setting
// data-theme on <html>. The token overrides in globals.css are scoped to
// `html[data-theme="…"] .app`, so only the member app re-themes — the admin
// dashboard and login stay on the default look.

export type Theme = 'current' | 'light' | 'dark'

export const THEME_KEY = 'tvl-theme'

export const THEMES: { value: Theme; label: string; hint: string }[] = [
  { value: 'current', label: 'Current', hint: 'The warm, signature Travail look.' },
  { value: 'light', label: 'Light', hint: 'Cooler and brighter — crisp white.' },
  { value: 'dark', label: 'Dark', hint: 'Easy on the eyes in low light.' },
]

export function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'current'
  try {
    const t = window.localStorage.getItem(THEME_KEY)
    return t === 'light' || t === 'dark' ? t : 'current'
  } catch {
    return 'current'
  }
}

export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return
  if (theme === 'current') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', theme)
}

export function setStoredTheme(theme: Theme): void {
  try { window.localStorage.setItem(THEME_KEY, theme) } catch { /* ignore */ }
  applyTheme(theme)
}
