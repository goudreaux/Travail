'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// Member privacy-mode switch for the membership page. When on, the member is
// hidden from the directory and never named on rosters (they fold into the
// "+N others" count). Writes members.private_mode; optimistic with revert.
export default function PrivacyToggle({ memberId, value, onChange }: {
  memberId: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)

  async function toggle() {
    if (saving) return
    const next = !value
    setSaving(true)
    onChange(next) // optimistic
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('members') as any).update({ private_mode: next }).eq('id', memberId)
      if (error) onChange(!next) // revert on failure
    } catch {
      onChange(!next)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="panel">
      <div className="panel-head"><h3>Privacy mode</h3></div>
      <div style={{ padding: '14px 20px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
            {value ? 'On' : 'Off'}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={value}
            aria-label="Privacy mode"
            disabled={saving}
            onClick={toggle}
            style={{
              position: 'relative', width: 46, height: 27, flexShrink: 0,
              borderRadius: 999, border: 'none', cursor: saving ? 'default' : 'pointer',
              background: value ? 'var(--tropic)' : 'var(--hair-2)',
              transition: 'background 0.18s ease', padding: 0,
            }}
          >
            <span style={{
              position: 'absolute', top: 3, left: value ? 22 : 3,
              width: 21, height: 21, borderRadius: '50%', background: '#fff',
              boxShadow: '0 1px 3px rgba(13,51,64,0.35)', transition: 'left 0.18s ease',
            }} />
          </button>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--ink-light)', lineHeight: 1.55, marginTop: 12, marginBottom: 0 }}>
          When privacy mode is on, you&rsquo;re <strong style={{ color: 'var(--ink-soft)' }}>hidden from the member
          directory</strong> and you&rsquo;re <strong style={{ color: 'var(--ink-soft)' }}>never listed by name on a
          trip&rsquo;s roster</strong> — to other members you simply count as one of the
          &ldquo;+ others&rdquo; aboard. Your own trips, bookings, and account work exactly the same; only how
          others see you changes.
        </p>
      </div>
    </div>
  )
}
