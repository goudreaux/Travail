import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './types'

// We write Supabase auth as SESSION cookies (no Max-Age / Expires) so that
// closing the browser clears them and the member has to log in again. The
// @supabase/ssr default writes persistent cookies (400-day Max-Age), so we
// supply our own cookie adapter that omits the expiry on writes (and keeps an
// expiry on removals so sign-out still clears them). Encoding mirrors the
// `cookie` package the library uses by default (encode/decodeURIComponent),
// so existing persistent cookies are read back correctly.

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
    // else: no Max-Age / Expires → session cookie, cleared when the browser closes
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
