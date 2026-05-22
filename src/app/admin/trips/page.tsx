'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Flight, Excursion, Aircraft, ExcursionTemplate, Member } from '@/lib/supabase/types'

type FlightRow = Flight & { anchor_member: Pick<Member, 'name' | 'initials'> | null }
type ExcursionRow = Excursion & { anchor_member: Pick<Member, 'name' | 'initials'> | null; template: Pick<ExcursionTemplate, 'name'> | null }

function Toast({ msg, kind }: { msg: string; kind: 'success' | 'error' | 'info' }) {
  return <div className={`toast ${kind}`}>{msg}</div>
}

const FLIGHT_STATUS = ['draft', 'open', 'full', 'departed', 'cancelled'] as const
const EXCURSION_STATUS = ['draft', 'open', 'full', 'completed', 'cancelled'] as const
const STAY_TYPES = ['day_trip', 'overnight', 'multi_night'] as const

type FlightForm = {
  name: string; origin_code: string; dest_code: string; date: string
  depart_time: string; duration_mins: number; aircraft_id: string
  pitch: string; visibility: 'members' | 'public'; seats_total: number
  seats_anchor: number; price_per_seat: number; status: Flight['status']
  anchor_member_id: string
}
type ExcForm = {
  name: string; origin_code: string; date: string; template_id: string
  aircraft_id: string; start_time: string; depart_time: string
  arrive_time: string; return_time: string
  stay_type: Excursion['stay_type']; pitch: string
  visibility: 'members' | 'public'; spots_total: number
  spots_anchor: number; status: Excursion['status']
  anchor_member_id: string
}

const defaultFlightForm: FlightForm = {
  name: '', origin_code: '', dest_code: '', date: '', depart_time: '',
  duration_mins: 0, aircraft_id: '', pitch: '', visibility: 'members',
  seats_total: 8, seats_anchor: 1, price_per_seat: 0, status: 'draft',
  anchor_member_id: '',
}
const defaultExcForm: ExcForm = {
  name: '', origin_code: '', date: '', template_id: '', aircraft_id: '',
  start_time: '', depart_time: '', arrive_time: '', return_time: '',
  stay_type: 'day_trip', pitch: '', visibility: 'members',
  spots_total: 8, spots_anchor: 1, status: 'draft',
  anchor_member_id: '',
}

export default function TripsPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<'flights' | 'excursions'>('flights')
  const [flights, setFlights] = useState<FlightRow[]>([])
  const [excursions, setExcursions] = useState<ExcursionRow[]>([])
  const [aircraft, setAircraft] = useState<Aircraft[]>([])
  const [templates, setTemplates] = useState<ExcursionTemplate[]>([])
  const [members, setMembers] = useState<Pick<Member, 'id' | 'name' | 'initials'>[]>([])
  const [loading, setLoading] = useState(true)
  const [showFlightForm, setShowFlightForm] = useState(false)
  const [showExcForm, setShowExcForm] = useState(false)
  const [editFlightId, setEditFlightId] = useState<string | null>(null)
  const [editExcId, setEditExcId] = useState<string | null>(null)
  const [flightForm, setFlightForm] = useState<FlightForm>(defaultFlightForm)
  const [excForm, setExcForm] = useState<ExcForm>(defaultExcForm)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; kind: 'success' | 'error' | 'info' } | null>(null)

  const showToast = (msg: string, kind: 'success' | 'error' | 'info' = 'success') => {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 3500)
  }

  const load = useCallback(async () => {
    setLoading(true)
    const [
      { data: flightData },
      { data: excData },
      { data: aircraftData },
      { data: templateData },
      { data: memberData },
    ] = await Promise.all([
      supabase.from('flights').select('*, anchor_member:members!anchor_member_id(name, initials)').order('date', { ascending: false }),
      supabase.from('excursions').select('*, anchor_member:members!anchor_member_id(name, initials), template:excursion_templates!template_id(name)').order('date', { ascending: false }),
      supabase.from('aircraft').select('*'),
      supabase.from('excursion_templates').select('*'),
      supabase.from('members').select('id, name, initials').order('name'),
    ])
    setFlights((flightData ?? []) as unknown as FlightRow[])
    setExcursions((excData ?? []) as unknown as ExcursionRow[])
    setAircraft(aircraftData ?? [])
    setTemplates(templateData ?? [])
    setMembers(memberData ?? [])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  function openEditFlight(f: FlightRow) {
    setEditFlightId(f.id)
    setShowFlightForm(true)
    setFlightForm({
      name: f.name, origin_code: f.origin_code, dest_code: f.dest_code,
      date: f.date, depart_time: f.depart_time, duration_mins: f.duration_mins,
      aircraft_id: f.aircraft_id, pitch: f.pitch ?? '', visibility: f.visibility,
      seats_total: f.seats_total, seats_anchor: f.seats_anchor,
      price_per_seat: f.price_per_seat, status: f.status,
      anchor_member_id: f.anchor_member_id,
    })
  }

  function openEditExc(e: ExcursionRow) {
    setEditExcId(e.id)
    setShowExcForm(true)
    setExcForm({
      name: e.name, origin_code: e.origin_code, date: e.date,
      template_id: e.template_id ?? '', aircraft_id: e.aircraft_id ?? '',
      start_time: e.start_time ?? '', depart_time: e.depart_time ?? '',
      arrive_time: e.arrive_time ?? '', return_time: e.return_time ?? '',
      stay_type: e.stay_type, pitch: e.pitch ?? '', visibility: e.visibility,
      spots_total: e.spots_total, spots_anchor: e.spots_anchor,
      status: e.status, anchor_member_id: e.anchor_member_id,
    })
  }

  async function saveFlight() {
    setSaving(true)
    try {
      const payload = {
        name: flightForm.name, origin_code: flightForm.origin_code.toUpperCase(),
        dest_code: flightForm.dest_code.toUpperCase(), date: flightForm.date,
        depart_time: flightForm.depart_time, duration_mins: flightForm.duration_mins,
        aircraft_id: flightForm.aircraft_id, pitch: flightForm.pitch || null,
        visibility: flightForm.visibility, seats_total: flightForm.seats_total,
        seats_anchor: flightForm.seats_anchor, price_per_seat: flightForm.price_per_seat,
        status: flightForm.status, anchor_member_id: flightForm.anchor_member_id,
      }
      if (editFlightId) {
        const { error } = await supabase.from('flights').update(payload).eq('id', editFlightId)
        if (error) throw error
        showToast('Flight updated')
      } else {
        const { error } = await supabase.from('flights').insert(payload)
        if (error) throw error
        showToast('Flight created')
      }
      setShowFlightForm(false); setEditFlightId(null); setFlightForm(defaultFlightForm)
      load()
    } catch (e: unknown) {
      showToast((e as Error).message ?? 'Save failed', 'error')
    } finally { setSaving(false) }
  }

  async function saveExc() {
    setSaving(true)
    try {
      const payload = {
        name: excForm.name, origin_code: excForm.origin_code.toUpperCase(),
        date: excForm.date, template_id: excForm.template_id || null,
        aircraft_id: excForm.aircraft_id || null,
        start_time: excForm.start_time || null, depart_time: excForm.depart_time || null,
        arrive_time: excForm.arrive_time || null, return_time: excForm.return_time || null,
        stay_type: excForm.stay_type, pitch: excForm.pitch || null,
        visibility: excForm.visibility, spots_total: excForm.spots_total,
        spots_anchor: excForm.spots_anchor, status: excForm.status,
        anchor_member_id: excForm.anchor_member_id,
      }
      if (editExcId) {
        const { error } = await supabase.from('excursions').update(payload).eq('id', editExcId)
        if (error) throw error
        showToast('Excursion updated')
      } else {
        const { error } = await supabase.from('excursions').insert(payload)
        if (error) throw error
        showToast('Excursion created')
      }
      setShowExcForm(false); setEditExcId(null); setExcForm(defaultExcForm)
      load()
    } catch (e: unknown) {
      showToast((e as Error).message ?? 'Save failed', 'error')
    } finally { setSaving(false) }
  }

  const statusColor: Record<string, string> = {
    draft: 'ink', open: 'moss', full: 'sun', departed: 'tropic',
    completed: 'tropic', cancelled: 'signal',
  }

  const FF = flightForm
  const EF = excForm

  return (
    <div style={{ padding: 32 }}>
      {toast && <Toast msg={toast.msg} kind={toast.kind} />}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 30, fontWeight: 500, color: 'var(--ink)', margin: 0 }}>Trips & Excursions</h1>
          <p style={{ fontSize: 13, color: 'var(--ink-light)', marginTop: 4, marginBottom: 0 }}>Manage published flights and excursions.</p>
        </div>
        <button
          className="btn-primary"
          onClick={() => {
            if (tab === 'flights') { setShowFlightForm(true); setEditFlightId(null); setFlightForm(defaultFlightForm) }
            else { setShowExcForm(true); setEditExcId(null); setExcForm(defaultExcForm) }
          }}
        >
          + Add {tab === 'flights' ? 'Flight' : 'Excursion'}
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--hair)', marginBottom: 24, gap: 0 }}>
        {(['flights', 'excursions'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '10px 20px', background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: 'var(--ui)', fontSize: 13.5, fontWeight: tab === t ? 600 : 400,
              color: tab === t ? 'var(--tropic-d)' : 'var(--ink-light)',
              borderBottom: tab === t ? '2px solid var(--tropic)' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t === 'flights' ? 'Flights' : 'Excursions'}
          </button>
        ))}
      </div>

      {/* Flight form */}
      {tab === 'flights' && showFlightForm && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 14, padding: 24, marginBottom: 24 }}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: 20, margin: '0 0 20px', color: 'var(--ink)' }}>
            {editFlightId ? 'Edit Flight' : 'Add Flight'}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="field-lab">Flight Name <span className="req">*</span></label>
              <input className="input" value={FF.name} onChange={e => setFlightForm(f => ({ ...f, name: e.target.value }))} placeholder="Miami to St. Barths" />
            </div>
            <div className="field">
              <label className="field-lab">Origin (IATA)</label>
              <input className="input" value={FF.origin_code} onChange={e => setFlightForm(f => ({ ...f, origin_code: e.target.value.toUpperCase() }))} placeholder="MIA" maxLength={3} />
            </div>
            <div className="field">
              <label className="field-lab">Destination (IATA)</label>
              <input className="input" value={FF.dest_code} onChange={e => setFlightForm(f => ({ ...f, dest_code: e.target.value.toUpperCase() }))} placeholder="SBH" maxLength={3} />
            </div>
            <div className="field">
              <label className="field-lab">Status</label>
              <select className="select" value={FF.status} onChange={e => setFlightForm(f => ({ ...f, status: e.target.value as Flight['status'] }))}>
                {FLIGHT_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-lab">Date</label>
              <input className="input" type="date" value={FF.date} onChange={e => setFlightForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="field">
              <label className="field-lab">Depart Time</label>
              <input className="input" type="time" value={FF.depart_time} onChange={e => setFlightForm(f => ({ ...f, depart_time: e.target.value }))} />
            </div>
            <div className="field">
              <label className="field-lab">Duration (mins)</label>
              <input className="input" type="number" min={0} value={FF.duration_mins} onChange={e => setFlightForm(f => ({ ...f, duration_mins: Number(e.target.value) }))} />
            </div>
            <div className="field">
              <label className="field-lab">Aircraft</label>
              <select className="select" value={FF.aircraft_id} onChange={e => setFlightForm(f => ({ ...f, aircraft_id: e.target.value }))}>
                <option value="">Select aircraft…</option>
                {aircraft.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-lab">Anchor Member</label>
              <select className="select" value={FF.anchor_member_id} onChange={e => setFlightForm(f => ({ ...f, anchor_member_id: e.target.value }))}>
                <option value="">Select member…</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-lab">Seats Total</label>
              <input className="input" type="number" min={1} value={FF.seats_total} onChange={e => setFlightForm(f => ({ ...f, seats_total: Number(e.target.value) }))} />
            </div>
            <div className="field">
              <label className="field-lab">Anchor Seats</label>
              <input className="input" type="number" min={0} value={FF.seats_anchor} onChange={e => setFlightForm(f => ({ ...f, seats_anchor: Number(e.target.value) }))} />
            </div>
            <div className="field">
              <label className="field-lab">Price Per Seat ($)</label>
              <input className="input" type="number" min={0} value={FF.price_per_seat} onChange={e => setFlightForm(f => ({ ...f, price_per_seat: Number(e.target.value) }))} />
            </div>
            <div className="field">
              <label className="field-lab">Visibility</label>
              <select className="select" value={FF.visibility} onChange={e => setFlightForm(f => ({ ...f, visibility: e.target.value as 'members' | 'public' }))}>
                <option value="members">Members Only</option>
                <option value="public">Public</option>
              </select>
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="field-lab">Pitch (tagline)</label>
              <input className="input" value={FF.pitch} onChange={e => setFlightForm(f => ({ ...f, pitch: e.target.value }))} placeholder="A quick escape to the Caribbean…" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <button className="btn-primary" onClick={saveFlight} disabled={saving || !FF.name || !FF.date}>
              {saving ? 'Saving…' : 'Save Flight'}
            </button>
            <button className="btn-ghost" onClick={() => { setShowFlightForm(false); setEditFlightId(null) }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Excursion form */}
      {tab === 'excursions' && showExcForm && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 14, padding: 24, marginBottom: 24 }}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: 20, margin: '0 0 20px', color: 'var(--ink)' }}>
            {editExcId ? 'Edit Excursion' : 'Add Excursion'}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="field-lab">Name <span className="req">*</span></label>
              <input className="input" value={EF.name} onChange={e => setExcForm(f => ({ ...f, name: e.target.value }))} placeholder="Bora Bora Overwater Experience" />
            </div>
            <div className="field">
              <label className="field-lab">Template</label>
              <select className="select" value={EF.template_id} onChange={e => setExcForm(f => ({ ...f, template_id: e.target.value }))}>
                <option value="">No template</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-lab">Origin (IATA)</label>
              <input className="input" value={EF.origin_code} onChange={e => setExcForm(f => ({ ...f, origin_code: e.target.value.toUpperCase() }))} placeholder="LAX" maxLength={3} />
            </div>
            <div className="field">
              <label className="field-lab">Date</label>
              <input className="input" type="date" value={EF.date} onChange={e => setExcForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="field">
              <label className="field-lab">Stay Type</label>
              <select className="select" value={EF.stay_type} onChange={e => setExcForm(f => ({ ...f, stay_type: e.target.value as Excursion['stay_type'] }))}>
                {STAY_TYPES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-lab">Status</label>
              <select className="select" value={EF.status} onChange={e => setExcForm(f => ({ ...f, status: e.target.value as Excursion['status'] }))}>
                {EXCURSION_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-lab">Anchor Member</label>
              <select className="select" value={EF.anchor_member_id} onChange={e => setExcForm(f => ({ ...f, anchor_member_id: e.target.value }))}>
                <option value="">Select member…</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-lab">Aircraft (optional)</label>
              <select className="select" value={EF.aircraft_id} onChange={e => setExcForm(f => ({ ...f, aircraft_id: e.target.value }))}>
                <option value="">None</option>
                {aircraft.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-lab">Start Time</label>
              <input className="input" type="time" value={EF.start_time} onChange={e => setExcForm(f => ({ ...f, start_time: e.target.value }))} />
            </div>
            <div className="field">
              <label className="field-lab">Depart Time</label>
              <input className="input" type="time" value={EF.depart_time} onChange={e => setExcForm(f => ({ ...f, depart_time: e.target.value }))} />
            </div>
            <div className="field">
              <label className="field-lab">Arrive Time</label>
              <input className="input" type="time" value={EF.arrive_time} onChange={e => setExcForm(f => ({ ...f, arrive_time: e.target.value }))} />
            </div>
            <div className="field">
              <label className="field-lab">Return Time</label>
              <input className="input" type="time" value={EF.return_time} onChange={e => setExcForm(f => ({ ...f, return_time: e.target.value }))} />
            </div>
            <div className="field">
              <label className="field-lab">Spots Total</label>
              <input className="input" type="number" min={1} value={EF.spots_total} onChange={e => setExcForm(f => ({ ...f, spots_total: Number(e.target.value) }))} />
            </div>
            <div className="field">
              <label className="field-lab">Anchor Spots</label>
              <input className="input" type="number" min={0} value={EF.spots_anchor} onChange={e => setExcForm(f => ({ ...f, spots_anchor: Number(e.target.value) }))} />
            </div>
            <div className="field">
              <label className="field-lab">Visibility</label>
              <select className="select" value={EF.visibility} onChange={e => setExcForm(f => ({ ...f, visibility: e.target.value as 'members' | 'public' }))}>
                <option value="members">Members Only</option>
                <option value="public">Public</option>
              </select>
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="field-lab">Pitch</label>
              <input className="input" value={EF.pitch} onChange={e => setExcForm(f => ({ ...f, pitch: e.target.value }))} placeholder="An unforgettable overwater escape…" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <button className="btn-primary" onClick={saveExc} disabled={saving || !EF.name || !EF.date}>
              {saving ? 'Saving…' : 'Save Excursion'}
            </button>
            <button className="btn-ghost" onClick={() => { setShowExcForm(false); setEditExcId(null) }}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--ink-light)', fontSize: 14 }}>Loading…</div>
      ) : tab === 'flights' ? (
        <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 12, overflow: 'hidden' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Route</th>
                <th>Date</th>
                <th>Aircraft</th>
                <th>Seats</th>
                <th>Price</th>
                <th>Status</th>
                <th>Anchor</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {flights.map(f => (
                <tr key={f.id} style={{ cursor: 'pointer' }} onClick={() => openEditFlight(f)}>
                  <td style={{ fontWeight: 500, color: 'var(--ink)' }}>{f.name}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{f.origin_code} → {f.dest_code}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{f.date}</td>
                  <td style={{ fontSize: 12, color: 'var(--ink-light)' }}>{f.aircraft_id.slice(0, 8)}…</td>
                  <td style={{ fontWeight: 600 }}>{f.seats_anchor}/{f.seats_total}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>${f.price_per_seat.toLocaleString()}</td>
                  <td><span className={`pill ${statusColor[f.status]}`}>{f.status}</span></td>
                  <td style={{ fontSize: 12 }}>{f.anchor_member?.name ?? '—'}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <button className="btn-ghost" style={{ height: 28, padding: '0 10px', fontSize: 12 }} onClick={() => openEditFlight(f)}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {flights.length === 0 && (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--ink-light)', fontSize: 13 }}>No flights yet.</div>
          )}
        </div>
      ) : (
        <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 12, overflow: 'hidden' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Destination</th>
                <th>Date</th>
                <th>Stay Type</th>
                <th>Spots</th>
                <th>Status</th>
                <th>Template</th>
                <th>Anchor</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {excursions.map(e => (
                <tr key={e.id} style={{ cursor: 'pointer' }} onClick={() => openEditExc(e)}>
                  <td style={{ fontWeight: 500, color: 'var(--ink)' }}>{e.name}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{e.origin_code}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{e.date}</td>
                  <td><span className="pill ink">{e.stay_type.replace('_', ' ')}</span></td>
                  <td style={{ fontWeight: 600 }}>{e.spots_anchor}/{e.spots_total}</td>
                  <td><span className={`pill ${statusColor[e.status]}`}>{e.status}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--ink-light)' }}>{e.template?.name ?? '—'}</td>
                  <td style={{ fontSize: 12 }}>{e.anchor_member?.name ?? '—'}</td>
                  <td onClick={ev => ev.stopPropagation()}>
                    <button className="btn-ghost" style={{ height: 28, padding: '0 10px', fontSize: 12 }} onClick={() => openEditExc(e)}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {excursions.length === 0 && (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--ink-light)', fontSize: 13 }}>No excursions yet.</div>
          )}
        </div>
      )}
    </div>
  )
}
