'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// Tracks the count of inbound pending friend requests for the signed-in
// member. Used to drive the badge dots on the Sidebar (desktop) and the
// More button (mobile). Sources, in order of freshness:
//
//   1) A custom `travail:pending-friend-count` event dispatched by the
//      Network page when the member accepts / declines inline — instant.
//   2) localStorage cache from a previous Network page load — appears
//      pre-hydrated even before the first query returns.
//   3) A COUNT query against the friendships table on mount — the source
//      of truth, but slow enough that we want (1) + (2) for snappiness.
export function usePendingFriendCount(): number {
  const [count, setCount] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    const cached = window.localStorage.getItem('travail.pending_friend_count')
    return cached ? parseInt(cached, 10) || 0 : 0
  })

  useEffect(() => {
    let cancelled = false

    async function fetchCount() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: me } = await supabase
        .from('members').select('id').eq('user_id', user.id).maybeSingle()
      if (!me) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count: c } = await (supabase.from('friendships') as any)
        .select('id', { count: 'exact', head: true })
        .eq('addressee_id', me.id)
        .eq('status', 'pending')
      if (cancelled) return
      const n = c ?? 0
      setCount(n)
      try { localStorage.setItem('travail.pending_friend_count', String(n)) } catch { /* ignore */ }
    }
    fetchCount()

    function onUpdate(e: Event) {
      const detail = (e as CustomEvent<number>).detail
      if (typeof detail === 'number') setCount(detail)
    }
    window.addEventListener('travail:pending-friend-count', onUpdate)

    return () => {
      cancelled = true
      window.removeEventListener('travail:pending-friend-count', onUpdate)
    }
  }, [])

  return count
}
