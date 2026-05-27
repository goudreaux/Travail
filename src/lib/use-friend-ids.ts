'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// Returns the set of accepted-friend member IDs for the signed-in member.
// Hydrates from localStorage instantly, then refreshes via a Supabase
// query on mount. Listens for the same broadcast that the Network page
// dispatches when an accept/decline happens, so a freshly added friend
// lights up across the app without a hard refresh.
export function useFriendIds(): Set<string> {
  const [ids, setIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try {
      const cached = window.localStorage.getItem('travail.friend_ids')
      if (!cached) return new Set()
      const arr = JSON.parse(cached) as string[]
      return new Set(arr)
    } catch { return new Set() }
  })

  useEffect(() => {
    let cancelled = false

    async function fetchIds() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: me } = await supabase
        .from('members').select('id').eq('user_id', user.id).maybeSingle()
      if (!me) return
      const { data: rows } = await supabase
        .from('friendships')
        .select('requester_id,addressee_id,status')
        .or(`requester_id.eq.${me.id},addressee_id.eq.${me.id}`)
        .eq('status', 'accepted')
      if (cancelled) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const next = new Set<string>(((rows ?? []) as any[]).map(r =>
        r.requester_id === me.id ? r.addressee_id : r.requester_id
      ))
      setIds(next)
      try {
        localStorage.setItem('travail.friend_ids', JSON.stringify([...next]))
      } catch { /* private browsing — best effort */ }
    }
    fetchIds()

    function onUpdate() { fetchIds() }
    // Network page broadcasts pending-friend-count after an accept/decline;
    // we use the same event to refresh the accepted-friend set.
    window.addEventListener('travail:pending-friend-count', onUpdate)
    return () => {
      cancelled = true
      window.removeEventListener('travail:pending-friend-count', onUpdate)
    }
  }, [])

  return ids
}
