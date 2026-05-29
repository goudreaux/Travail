'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MAINTENANCE_DEFAULT_MESSAGE } from '@/lib/maintenance'

// Member-facing banner shown whenever the platform is closed for
// maintenance. Read-only access (boarding passes, activity) keeps
// working; this just sets expectations that bookings + payments are
// paused. Reads the singleton app_settings row via RLS (authenticated
// members can SELECT it). Silent when maintenance is off.

export function MaintenanceBanner() {
  const [state, setState] = useState<{ active: boolean; message: string } | null>(null)
  const supabase = createClient()

  useEffect(() => {
    let cancelled = false
    async function load() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('app_settings')
        .select('maintenance_mode, maintenance_message')
        .eq('id', 1)
        .maybeSingle()
      if (cancelled) return
      const active = Boolean(data?.maintenance_mode)
      const message = (data?.maintenance_message && String(data.maintenance_message).trim()) || MAINTENANCE_DEFAULT_MESSAGE
      setState({ active, message })
    }
    load()
    // Re-check periodically so an open tab notices when ops flips it.
    const id = setInterval(load, 60_000)
    return () => { cancelled = true; clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!state?.active) return null

  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 16px',
        background: 'linear-gradient(135deg, #e8512f 0%, #d94e2a 100%)',
        color: '#fff',
        fontSize: 13,
        lineHeight: 1.45,
        fontWeight: 500,
      }}
    >
      <span aria-hidden style={{ fontSize: 15, flexShrink: 0 }}>🛠️</span>
      <span>{state.message}</span>
    </div>
  )
}
