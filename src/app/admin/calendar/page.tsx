'use client'
export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchBlackoutRows, type BlackoutRow } from '@/lib/blackout'

// Concierge blackout calendar — the Concierge Team marks dates Tropic has no
// aircraft available. Click a date to toggle it; these flow through to the
// member calendar and block every booking / anchor / proposal wizard.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DOWS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function iso(y: number, m: number, d: number) { return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` }
function daysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate() }
function firstDow(y: number, m: number) { return new Date(y, m, 1).getDay() }

export default function AdminCalendarPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<BlackoutRow[]>([])
  const [meId, setMeId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500) }

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: me } = await supabase.from('members').select('id').eq('user_id', user.id).maybeSingle()
      setMeId(me?.id ?? null)
    }
    setRows(await fetchBlackoutRows(supabase))
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  const blackoutSet = new Set(rows.map(r => r.date))
  const today = new Date()
  const todayIso = iso(today.getFullYear(), today.getMonth(), today.getDate())

  // Six months from the current month.
  const months: { y: number; m: number }[] = []
  for (let i = 0; i < 6; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1)
    months.push({ y: d.getFullYear(), m: d.getMonth() })
  }

  async function toggle(dateStr: string) {
    if (busy || dateStr < todayIso) return
    setBusy(dateStr)
    try {
      if (blackoutSet.has(dateStr)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from('blackout_dates').delete().eq('date', dateStr)
        if (error) throw error
        setRows(prev => prev.filter(r => r.date !== dateStr))
        flash('Blackout removed.')
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from('blackout_dates').insert({ date: dateStr, created_by: meId })
        if (error) throw error
        setRows(prev => [...prev, { date: dateStr, note: null }].sort((a, b) => a.date.localeCompare(b.date)))
        flash('Date blacked out.')
      }
    } catch (e) { flash(e instanceof Error ? e.message : 'Failed') }
    finally { setBusy(null) }
  }

  async function saveNote(dateStr: string, note: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('blackout_dates').update({ note: note.trim() || null }).eq('date', dateStr)
    setRows(prev => prev.map(r => r.date === dateStr ? { ...r, note: note.trim() || null } : r))
  }

  const upcoming = rows.filter(r => r.date >= todayIso)

  return (
    <div className="admin-page">
      {toast && (
        <div style={{ position: 'fixed', top: 16, right: 16, background: 'var(--moss)', color: '#fff', padding: '10px 16px', borderRadius: 10, zIndex: 100, fontSize: 13, fontWeight: 600 }}>{toast}</div>
      )}

      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontFamily: 'var(--display)', fontSize: 30, fontWeight: 500, color: 'var(--ink)', margin: 0 }}>Blackout Calendar</h1>
        <p style={{ fontSize: 13, color: 'var(--ink-light)', marginTop: 4, marginBottom: 0, maxWidth: 640 }}>
          Mark dates Tropic has <strong>no aircraft available</strong>. Click a date to toggle it. Blacked-out dates show as unavailable on the member calendar and can&rsquo;t be picked in any booking, anchor, or proposal.
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--ink-light)' }}>Loading…</div>
      ) : (
        <div className="admin-cal-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 280px', gap: 24, alignItems: 'start' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
            {months.map(({ y, m }) => {
              const days = daysInMonth(y, m)
              const cells: (number | null)[] = [...Array(firstDow(y, m)).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
              return (
                <div key={`${y}-${m}`} style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 12, padding: 14 }}>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 600, color: 'var(--ink)', marginBottom: 10 }}>
                    {MONTHS[m]} <span style={{ color: 'var(--ink-faint)', fontWeight: 400 }}>{y}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-faint)', marginBottom: 4 }}>
                    {DOWS.map((d, i) => <span key={i} style={{ textAlign: 'center' }}>{d}</span>)}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
                    {cells.map((day, idx) => {
                      if (day === null) return <div key={`e${idx}`} />
                      const dateStr = iso(y, m, day)
                      const isPast = dateStr < todayIso
                      const isToday = dateStr === todayIso
                      const isBlack = blackoutSet.has(dateStr)
                      return (
                        <button
                          key={dateStr}
                          type="button"
                          disabled={isPast || busy === dateStr}
                          onClick={() => toggle(dateStr)}
                          title={isBlack ? 'Blacked out — click to clear' : 'Click to black out'}
                          style={{
                            aspectRatio: '1', border: isToday ? '1px solid var(--tropic)' : '1px solid transparent',
                            borderRadius: 8, fontSize: 12, fontFamily: 'var(--ui)', cursor: isPast ? 'default' : 'pointer',
                            background: isBlack ? 'var(--signal)' : 'transparent',
                            color: isBlack ? '#fff' : isPast ? 'var(--ink-faint)' : 'var(--ink)',
                            fontWeight: isBlack ? 700 : isToday ? 700 : 400,
                            opacity: isPast ? 0.4 : 1,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          {day}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 12, padding: '14px 16px', position: 'sticky', top: 16 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--signal)', fontWeight: 700, marginBottom: 12 }}>
              Upcoming blackouts · {upcoming.length}
            </div>
            {upcoming.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--ink-light)', margin: 0 }}>No blackout dates set. Click a date to add one.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {upcoming.map(r => (
                  <div key={r.date} style={{ borderBottom: '1px solid var(--hair)', paddingBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                        {new Date(r.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                      <button type="button" className="btn-ghost" style={{ fontSize: 11, color: 'var(--signal)', padding: '2px 8px' }} disabled={busy === r.date} onClick={() => toggle(r.date)}>Clear</button>
                    </div>
                    <input
                      className="input"
                      defaultValue={r.note ?? ''}
                      placeholder="Reason (optional)"
                      style={{ marginTop: 6, fontSize: 12, height: 32 }}
                      onBlur={e => { if ((e.target.value.trim() || null) !== (r.note ?? null)) saveNote(r.date, e.target.value) }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
