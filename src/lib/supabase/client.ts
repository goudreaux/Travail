import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './types'

// We write Supabase auth as PERSISTENT cookies with a 30-day Max-Age so a
// member who closes the tab/browser isn't silently signed out (F32 — the old
// behaviour used session cookies that cleared on close, which testers found
// hostile). Sign-out still clears them (removals keep Max-Age=0). Encoding
// mirrors the `cookie` package the library uses by default
// (encode/decodeURIComponent), so existing cookies are read back correctly.
const SESSION_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> }

function getAll() {
  if (typeof document === 'undefined' || !document.cookie) return []
  return document.cookie.split('; ').map(pair => {
    const eq = pair.indexOf('=')
    const name = eq === -1 ? pair : pair.slice(0, eq)
    const value = eq === -1 ? '' : decodeURIComponent(pair.slice(eq + 1))
    return { name, value }
  })
}

function setAll(cookies: CookieToSet[]) {
  if (typeof document === 'undefined') return
  for (const { name, value, options } of cookies) {
    const o = options ?? {}
    const removing = value === '' || o.maxAge === 0
    let str = `${name}=${encodeURIComponent(value)}`
    str += `; Path=${(o.path as string) ?? '/'}`
    str += `; SameSite=${(o.sameSite as string) ?? 'Lax'}`
    if (o.domain) str += `; Domain=${o.domain}`
    if (o.secure) str += '; Secure'
    if (removing) str += '; Max-Age=0'
    else str += `; Max-Age=${SESSION_MAX_AGE}` // persist across browser restarts (F32)
    document.cookie = str
  }
}

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll, setAll } }
  )
}
