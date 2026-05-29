'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { generateDefaultItinerary, type ItineraryStep } from '@/lib/itinerary'
import { ItineraryEditor } from './page'
import { TripPhotoPicker } from '@/components/TripPhotoPicker'
import { SPONSOR_LINE_PRESETS } from '@/components/SponsorBadge'

// Focused create/edit modal for Travail-sponsored excursions.
//
// Different from the general Add Excursion form because the sponsored
// case has no anchor (Travail funds the charter outright) and the
// reserved-seats fields read differently — these are blocked off for
// employees / brand partners rather than the trip's host. We skip the
// quote/anchor flow entirely; ops creates the excursion in 'open' state
// the moment they fill in the form.
//
// Reuses the existing ItineraryEditor (exported from the admin trips
// page) so step icons + line item editing stay consistent with anchored
// excursions.

interface Airport { code: string; name: string; sub: string | null; role: string }

export interface SponsoredExcursion {
  id?: string
  name: string
  sponsor: string                 // Free-form collab line: "Travail × Tropic × Field & Stream"
  date: string                    // YYYY-MM-DD
  origin_code: string
  stay_type: 'day_trip' | 'overnight' | 'multi_night'
  start_time: string
  depart_time: string
  arrive_time: string
  return_time: string
  spots_total: number
  spots_anchor: number            // "Reserved seats" — employees + brand partners
  price_per_pax: number           // cents — usually 0 for sponsored
  pitch: string
  image_url: string
  itinerary: ItineraryStep[]
}

const EMPTY: SponsoredExcursion = {
  name: '', sponsor: '', date: '', origin_code: '',
  stay_type: 'day_trip',
  start_time: '', depart_time: '', arrive_time: '', return_time: '',
  spots_total: 8, spots_anchor: 0, price_per_pax: 0,
  pitch: '', image_url: '', itinerary: [],
}

export function SponsoredExcursionModal({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean
  initial?: SponsoredExcursion | null
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const [form, setForm] = useState<SponsoredExcursion>(initial ?? EMPTY)
  const [airports, setAirports] = useState<Airport[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(initial ?? EMPTY)
    setError(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(supabase.from('airports') as any).select('code, name, sub, role').then(({ data }: { data: Airport[] | null }) => {
      setAirports(data ?? [])
    })
  }, [open, initial]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null

  function patch<K extends keyof SponsoredExcursion>(k: K, v: SponsoredExcursion[K]) {
    setForm(f => ({ ...f, [k]: v }))
  }

  function genItinerary() {
    const originAirport = airports.find(a => a.code === form.origin_code)
    patch('itinerary', generateDefaultItinerary({
      originCode: form.origin_code || originAirport?.code,
      destName: form.name,
      departTime: form.depart_time,
      arriveTime: form.arrive_time,
      startTime: form.start_time,
      returnTime: form.return_time,
      operator: 'Tropic Ocean Air',
      guide: form.sponsor,
    }))
  }

  async function save() {
    setError(null)
    if (!form.name.trim()) { setError('Name is required.'); return }
    if (!form.sponsor.trim()) { setError('Sponsor line is required — that is what makes it a sponsored excursion.'); return }
    if (!form.date) { setError('Date is required.'); return }
    if (!form.origin_code) { setError('Origin airport is required.'); return }
    if (form.spots_anchor > form.spots_total) { setError('Reserved seats cannot exceed total capacity.'); return }

    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        sponsor: form.sponsor.trim(),
        date: form.date,
        origin_code: form.origin_code,
        stay_type: form.stay_type,
        start_time: form.start_time || null,
        depart_time: form.depart_time || null,
        arrive_time: form.arrive_time || null,
        return_time: form.return_time || null,
        spots_total: form.spots_total,
        spots_anchor: form.spots_anchor,
        price_per_pax: form.price_per_pax,
        pitch: form.pitch.trim() || null,
        image_url: form.image_url.trim() || null,
        // Sponsored = no anchor, always immediately published, visible
        // even when fully reserved.
        anchor_member_id: null,
        status: 'open' as const,
        is_private: false,
        visibility: 'members' as const,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        itinerary: (form.itinerary.length > 0 ? form.itinerary : null) as any,
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any
      if (form.id) {
        const { error: upErr } = await db.from('excursions').update(payload).eq('id', form.id)
        if (upErr) throw upErr
      } else {
        const id = 'E-' + Date.now().toString(36).toUpperCase()
        const { error: insErr } = await db.from('excursions').insert({ ...payload, id })
        if (insErr) throw insErr
      }
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(13,51,64,0.45)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '40px 16px', overflow: 'auto', zIndex: 100,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--card)', borderRadius: 16, padding: 28,
          maxWidth: 720, width: '100%', boxShadow: '0 24px 56px rgba(0,0,0,0.18)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div className="mono" style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--sun)', fontWeight: 700 }}>
            Travail-sponsored excursion
          </div>
          <button className="btn-ghost" onClick={onClose} style={{ fontSize: 18, padding: 4 }}>×</button>
        </div>
        <h3 style={{ fontFamily: 'var(--display)', fontSize: 22, margin: '0 0 18px', color: 'var(--ink)' }}>
          {form.id ? 'Edit sponsored excursion' : 'New sponsored excursion'}
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div className="field" style={{ margin: 0, gridColumn: '1 / -1' }}>
            <label className="field-lab">Excursion name</label>
            <input className="input" value={form.name} onChange={e => patch('name', e.target.value)} placeholder="e.g. Lobster Mini Season · Key West" />
          </div>
          <div className="field" style={{ margin: 0, gridColumn: '1 / -1' }}>
            <label className="field-lab">Sponsor line <span style={{ color: 'var(--ink-light)', fontWeight: 400 }}>(rendered on member cards)</span></label>
            <select
              className="input"
              value={form.sponsor === '' || SPONSOR_LINE_PRESETS.includes(form.sponsor) ? form.sponsor : '__custom__'}
              onChange={e => patch('sponsor', e.target.value === '__custom__' ? ' ' : e.target.value)}
            >
              <option value="">Choose a sponsor…</option>
              {SPONSOR_LINE_PRESETS.map(p => <option key={p} value={p}>{p}</option>)}
              <option value="__custom__">Custom…</option>
            </select>
            {form.sponsor !== '' && !SPONSOR_LINE_PRESETS.includes(form.sponsor) && (
              <input
                className="input"
                style={{ marginTop: 8 }}
                value={form.sponsor.trim() === '' ? '' : form.sponsor}
                onChange={e => patch('sponsor', e.target.value)}
                placeholder="e.g. Travail × Orvis"
              />
            )}
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label className="field-lab">Date</label>
            <input className="input" type="date" value={form.date} onChange={e => patch('date', e.target.value)} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label className="field-lab">Origin airport</label>
            <select className="input" value={form.origin_code} onChange={e => patch('origin_code', e.target.value)}>
              <option value="">—</option>
              {airports.filter(a => a.role === 'origin' || a.role === 'both').map(a => (
                <option key={a.code} value={a.code}>{a.code} · {a.name}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label className="field-lab">Stay type</label>
            <select className="input" value={form.stay_type} onChange={e => patch('stay_type', e.target.value as SponsoredExcursion['stay_type'])}>
              <option value="day_trip">Day trip</option>
              <option value="overnight">Overnight</option>
              <option value="multi_night">Multi-night</option>
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label className="field-lab">Price per pax (cents)</label>
            <input className="input" type="number" min={0} value={form.price_per_pax} onChange={e => patch('price_per_pax', Number(e.target.value) || 0)} />
            <div style={{ fontSize: 10.5, color: 'var(--ink-faint)', marginTop: 4, fontFamily: 'var(--mono)' }}>
              Usually 0 — sponsored seats are free to members.
            </div>
          </div>

          <div className="field" style={{ margin: 0 }}>
            <label className="field-lab">Depart from origin</label>
            <input className="input" type="time" value={form.depart_time} onChange={e => patch('depart_time', e.target.value)} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label className="field-lab">Arrive on-site</label>
            <input className="input" type="time" value={form.arrive_time} onChange={e => patch('arrive_time', e.target.value)} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label className="field-lab">Activity start</label>
            <input className="input" type="time" value={form.start_time} onChange={e => patch('start_time', e.target.value)} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label className="field-lab">Return wheels-up</label>
            <input className="input" type="time" value={form.return_time} onChange={e => patch('return_time', e.target.value)} />
          </div>

          <div className="field" style={{ margin: 0 }}>
            <label className="field-lab">Total capacity</label>
            <input className="input" type="number" min={1} value={form.spots_total} onChange={e => patch('spots_total', Number(e.target.value) || 1)} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label className="field-lab">Reserved for employees / partners</label>
            <input className="input" type="number" min={0} max={form.spots_total} value={form.spots_anchor} onChange={e => patch('spots_anchor', Number(e.target.value) || 0)} />
            <div style={{ fontSize: 10.5, color: 'var(--ink-faint)', marginTop: 4, fontFamily: 'var(--mono)' }}>
              Counts against capacity. {Math.max(0, form.spots_total - form.spots_anchor)} seat{form.spots_total - form.spots_anchor === 1 ? '' : 's'} left for members.
            </div>
          </div>

          <div className="field" style={{ margin: 0, gridColumn: '1 / -1' }}>
            <label className="field-lab">Pitch / description</label>
            <textarea className="input" rows={3} value={form.pitch} onChange={e => patch('pitch', e.target.value)} placeholder="What's the day look like? Why is this special?" />
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <TripPhotoPicker
              value={form.image_url}
              onChange={(url) => patch('image_url', url)}
              locationCode={form.origin_code || null}
            />
          </div>
        </div>

        <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--hair)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-light)', fontWeight: 600, marginBottom: 10 }}>
            Day plan
          </div>
          <ItineraryEditor
            steps={form.itinerary}
            onChange={steps => patch('itinerary', steps)}
            onGenerateDefaults={genItinerary}
          />
        </div>

        {error && (
          <div style={{ background: 'rgba(217,78,42,0.08)', border: '1px solid rgba(217,78,42,0.25)', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: 'var(--signal)', marginTop: 16 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : form.id ? 'Save changes' : 'Publish excursion'}
          </button>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
