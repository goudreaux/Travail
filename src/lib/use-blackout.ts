'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchBlackoutDates } from '@/lib/blackout'

// Client hook: the set of blacked-out dates (YYYY-MM-DD) today or later. Used by
// the booking / anchor / proposal wizards to block those dates.
export function useBlackoutDates(): Set<string> {
  const [set, setSet] = useState<Set<string>>(new Set())
  useEffect(() => {
    fetchBlackoutDates(createClient()).then(d => setSet(new Set(d))).catch(() => { /* non-blocking */ })
  }, [])
  return set
}
