'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Member } from '@/lib/supabase/types'

// Resolve the signed-in member ONCE per session and share it across the whole
// member area. Before this, every page repeated `auth.getUser()` (a network
// round-trip that revalidates the JWT) followed by a `members` lookup — so a
// single navigation paid two redundant round-trips before its own data query
// even started. The layout already validates the user (and middleware does too,
// server-side), so pages just need the resolved row, not their own fetch.

interface MemberContextValue {
  /** The signed-in member row, or null until resolved / if not linked. */
  member: Member | null
  /** True while the initial resolution is in flight. */
  loading: boolean
  /** True when the login has no linked member profile (even after self-heal). */
  notSetUp: boolean
  /** Re-fetch the member row (e.g. after subscribing or editing profile). */
  refresh: () => Promise<void>
  /** Optimistically patch the cached member (e.g. mark tutorial complete). */
  setMember: React.Dispatch<React.SetStateAction<Member | null>>
}

const MemberContext = createContext<MemberContextValue | null>(null)

export function MemberProvider({ children }: { children: React.ReactNode }) {
  const [member, setMember] = useState<Member | null>(null)
  const [loading, setLoading] = useState(true)
  const [notSetUp, setNotSetUp] = useState(false)
  const supabase = createClient()
  const router = useRouter()
  // Resolve exactly once — React 18 strict mode double-invokes effects.
  const started = useRef(false)

  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      // Middleware normally redirects before we ever render, but guard anyway.
      router.push('/login')
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    let { data: memberData } = await db
      .from('members')
      .select('*')
      .eq('user_id', user.id)
      .single() as { data: Member | null }

    // Self-heal: link a pre-created member that shares this login's email.
    if (!memberData) {
      try {
        const { data: linked } = await db.rpc('link_my_member')
        if (linked) {
          const retry = await db.from('members').select('*').eq('user_id', user.id).single()
          memberData = retry.data as Member | null
        }
      } catch { /* fall through to the not-set-up screen */ }
    }

    if (!memberData) {
      setNotSetUp(true)
      setLoading(false)
      return
    }

    setMember(memberData)
    setNotSetUp(false)
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (started.current) return
    started.current = true
    refresh()
  }, [refresh])

  return (
    <MemberContext.Provider value={{ member, loading, notSetUp, refresh, setMember }}>
      {children}
    </MemberContext.Provider>
  )
}

export function useMember(): MemberContextValue {
  const ctx = useContext(MemberContext)
  if (!ctx) throw new Error('useMember must be used within <MemberProvider>')
  return ctx
}
