'use client'
import { useEffect } from 'react'

// Fires /api/activity/beacon on mount and every 60s while the tab is
// visible. The server side merges close-together pings into a single
// session and updates last_active_at + total_session_minutes on the
// member row. No-ops when the tab is hidden (don't waste pings on
// background tabs).

const BEACON_INTERVAL_MS = 60_000

export function useActivityBeacon() {
  useEffect(() => {
    let cancelled = false

    function ping() {
      if (cancelled || document.hidden) return
      fetch('/api/activity/beacon', {
        method: 'POST',
        keepalive: true,
      }).catch(() => {/* swallow */})
    }

    ping()
    const id = setInterval(ping, BEACON_INTERVAL_MS)

    // Resume immediately when the tab becomes visible again so the
    // continuation window logic feels accurate.
    function onVisibility() {
      if (!document.hidden) ping()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])
}

// Fires /api/activity/login on every auth state change → 'SIGNED_IN'.
// Stamps last_login_at + increments login_count.
import type { SupabaseClient } from '@supabase/supabase-js'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useLoginStamp(supabase: SupabaseClient<any>) {
  useEffect(() => {
    // Stamp once on mount in case the user's already signed in (mount
    // happens after the auth bootstrap on the member layout, so we
    // miss the SIGNED_IN event for refreshes).
    fetch('/api/activity/login', { method: 'POST' }).catch(() => {/* swallow */})

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        fetch('/api/activity/login', { method: 'POST' }).catch(() => {/* swallow */})
      }
    })
    return () => { data.subscription.unsubscribe() }
  }, [supabase])
}
