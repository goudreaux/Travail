'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Flight, Excursion, Aircraft, Member, Airport } from '@/lib/supabase/types'

type FlightRow = Flight
type ExcursionRow = Excursion

const CUSTOM = '__custom__'

function Toast({ msg, kind }: { msg: string; kind: 'success' | 'error' | 'info' }) {
  return <div className={`toast ${kind}`}>{msg}</div>
}

function addMins(t: string, mins: number): string {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return ''
  const total = ((h * 60 + m + mins) % 1440 + 1440) % 1440
  const hh = Math.floor(total / 60)
  const mm = total % 60
  const ampm = hh >= 12 ? 'PM' : 'AM'
  const h12 = hh % 12 || 12
  return `${h12}:${String(mm).padStart(2, '0')} ${ampm}`
}

const FLIGHT_STATUS = ['draft', 'open', 'full', 'departed', 'cancelled'] as const
const EXCURSION_STATUS = ['draft', 'open', 'full', 'completed', 'cancelled'] as const
const STAY_TYPES = ['day_trip', 'overnight', 'multi_night'] as const

type FlightForm = {
  name: string
  nameTouched: boolean
  tripType: 'one_way' | 'round_trip'
  originSel: string
  originCustomCode: string
  originCustomName: string
  originCustomRegion: string
  destSel: string
  destCustomCode: string
  destCustomName: string
  destCustomRegion: string
  date: string
  depart_time: string
  return_date: string
  return_time: string
  duration_mins: number
  aircraft_id: string
  pitch: string
  visibility: 'members' | 'public'
  seats_total: number
  seats_anchor: number
  price_per_seat: number
  status: Flight['status']
  anchor_member_id: string
}
type ExcForm = {
  name: string; origin_code: string; date: string
  aircraft_id: string; start_time: string; depart_time: string
  arrive_time: string; return_time: string
  stay_type: Excursion['stay_type']; pitch: string
  visibility: 'members' | 'public'; spots_total: number
  spots_anchor: number; price_per_pax: number; status: Excursion['status']
  anchor_member_id: string
}

const defaultFlightForm: FlightForm = {
  name: '', nameTouched: false, tripType: 'one_way',
  originSel: '', originCustomCode: '', originCustomName: '', originCustomRegion: '',
  destSel: '', destCustomCode: '', destCustomName: '', destCustomRegion: '',
  date: '', depart_time: '', return_date: '', return_time: '',
  duration_mins: 90, aircraft_id: '', pitch: '', visibility: 'members',
  seats_total: 8, seats_anchor: 1, price_per_seat: 0, status: 'draft',
  anchor_member_id: '',
}
const defaultExcForm: ExcForm = {
  name: '', origin_code: '', date: '', aircraft_id: '',
  start_time: '', depart_time: '', arrive_time: '', return_time: '',
  stay_type: 'day_trip', pitch: '', visibility: 'members',
  spots_total: 8, spots_anchor: 1, price_per_pax: 0, status: 'draft',
  anchor_member_id: '',
}

const sectionLabelStyle: React.CSSProperties = {
  gridColumn: '1 / -1', fontFamily: 'var(--mono)', fontSize: 10,
  letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-light)',
  marginTop: 6, marginBottom: -4,
}

export default function TripsPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<'flights' | 'excursions'>('flights')
  const [flights, setFlights] = useState<FlightRow[]>([])
  const [excursions, setExcursions] = useState<ExcursionRow[]>([])
  const [aircraft, setAircraft] = useState<Aircraft[]>([])
  const [airports, setAirports] = useState<Airport[]>([])
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
      { data: airportData },
      { data: memberData },
    ] = await Promise.all([
      supabase.from('flights').select('*').order('date', { ascending: false }),
      supabase.from('excursions').select('*').order('date', { ascending: false }),
      supabase.from('aircraft').select('*'),
      supabase.from('airports').select('*').order('name'),
      supabase.from('members').select('id, name, initials').order('name'),
    ])
    setFlights((flightData ?? []) as FlightRow[])
    setExcursions((excData ?? []) as ExcursionRow[])
    setAircraft(aircraftData ?? [])
    setAirports(airportData ?? [])
    setMembers(memberData ?? [])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const FF = flightForm
  const EF = excForm

  // ─── Derived flight values ──────────────────────────────────────────────
  const originAirports = airports.filter(a => a.role === 'origin' || a.role === 'both')
  const destAirports = airports.filter(a => a.role === 'destination' || a.role === 'both')
  const airportName = (code: string) => airports.find(a => a.code === code)?.name ?? code

  const effOrigin = FF.originSel === CUSTOM ? FF.originCustomCode.trim().toUpperCase() : FF.originSel
  const effDest = FF.destSel === CUSTOM ? FF.destCustomCode.trim().toUpperCase() : FF.destSel
  const originLabel = FF.originSel === CUSTOM ? (FF.originCustomName.trim() || effOrigin) : airportName(FF.originSel)
  const destLabel = FF.destSel === CUSTOM ? (FF.destCustomName.trim() || effDest) : airportName(FF.destSel)

  const selectedAircraft = aircraft.find(a => a.id === FF.aircraft_id)
  const capacity = selectedAircraft?.capacity ?? null

  // Auto-fill the flight name from the route until an admin edits it by hand.
  useEffect(() => {
    if (FF.nameTouched) return
    if (effOrigin && effDest) {
      setFlightForm(f => ({ ...f, name: `${originLabel} → ${destLabel}` }))
    }
  }, [effOrigin, effDest, originLabel, destLabel, FF.nameTouched])

  function flightError(): string | null {
    if (!effOrigin) return 'Select or enter an origin'
    if (FF.originSel === CUSTOM && !FF.originCustomName.trim()) return 'Name the custom origin airport'
    if (!effDest) return 'Select or enter a destination'
    if (FF.destSel === CUSTOM && !FF.destCustomName.trim()) return 'Name the custom destination airport'
    if (effOrigin === effDest) return 'Origin and destination must differ'
    if (!FF.name.trim()) return 'Flight name is required'
    if (!FF.date) return 'Pick a departure date'
    if (!FF.depart_time) return 'Pick a departure time'
    if (!FF.aircraft_id) return 'Select an aircraft'
    if (FF.seats_total < 1) return 'Seats total must be at least 1'
    if (capacity != null && FF.seats_total > capacity) return `Seats total exceeds ${selectedAircraft?.name} capacity (${capacity})`
    if (FF.seats_anchor < 0 || FF.seats_anchor > FF.seats_total) return 'Anchor seats must be between 0 and seats total'
    if (FF.price_per_seat < 0) return 'Price cannot be negative'
    if (!editFlightId && FF.tripType === 'round_trip') {
      if (!FF.return_date) return 'Pick a return date'
      if (!FF.return_time) return 'Pick a return time'
      if (FF.return_date < FF.date) return 'Return date cannot be before the outbound date'
    }
    return null
  }

  function openEditFlight(f: FlightRow) {
    setEditFlightId(f.id)
    setShowFlightForm(true)
    setFlightForm({
      ...defaultFlightForm,
      name: f.name, nameTouched: true, tripType: 'one_way',
      originSel: f.origin_code, destSel: f.dest_code,
      date: f.date, depart_time: f.depart_time, duration_mins: f.duration_mins,
      aircraft_id: f.aircraft_id, pitch: f.pitch ?? '', visibility: f.visibility,
      seats_total: f.seats_total, seats_anchor: f.seats_anchor,
      price_per_seat: f.price_per_seat, status: f.status,
      anchor_member_id: f.anchor_member_id ?? '',
    })
  }

  function openEditExc(e: ExcursionRow) {
    setEditExcId(e.id)
    setShowExcForm(true)
    setExcForm({
      name: e.name, origin_code: e.origin_code, date: e.date,
      aircraft_id: e.aircraft_id ?? '',
      start_time: e.start_time ?? '', depart_time: e.depart_time ?? '',
      arrive_time: e.arrive_time ?? '', return_time: e.return_time ?? '',
      stay_type: e.stay_type, pitch: e.pitch ?? '', visibility: e.visibility,
      spots_total: e.spots_total, spots_anchor: e.spots_anchor,
      price_per_pax: e.price_per_pax, status: e.status, anchor_member_id: e.anchor_member_id ?? '',
    })
  }

  async function saveFlight() {
    const err = flightError()
    if (err) { showToast(err, 'error'); return }
    setSaving(true)
    try {
      // Persist any custom landing areas so the flight FK resolves and they're reusable.
      if (FF.originSel === CUSTOM) {
        const { error } = await supabase.from('airports').upsert(
          { code: effOrigin, name: FF.originCustomName.trim(), sub: FF.originCustomRegion.trim() || null, role: 'both' },
          { onConflict: 'code' },
        )
        if (error) throw error
      }
      if (FF.destSel === CUSTOM) {
        const { error } = await supabase.from('airports').upsert(
          { code: effDest, name: FF.destCustomName.trim(), sub: FF.destCustomRegion.trim() || null, role: 'both' },
          { onConflict: 'code' },
        )
        if (error) throw error
      }

      const base = {
        duration_mins: FF.duration_mins, aircraft_id: FF.aircraft_id,
        pitch: FF.pitch || null, visibility: FF.visibility,
        seats_total: FF.seats_total, seats_anchor: FF.seats_anchor,
        price_per_seat: FF.price_per_seat, status: FF.status,
        anchor_member_id: FF.anchor_member_id || null,
      }

      if (editFlightId) {
        const payload = {
          ...base, name: FF.name.trim(),
          origin_code: effOrigin, dest_code: effDest,
          date: FF.date, depart_time: FF.depart_time,
        }
        const { data, error } = await supabase.from('flights').update(payload).eq('id', editFlightId).select()
        if (error) throw error
        if (!data || data.length === 0) throw new Error('Update blocked — verify the admin RLS update policy on flights')
        showToast('Flight updated')
      } else {
        const stamp = Date.now().toString(36).toUpperCase()
        const outbound = {
          ...base, id: `F-${stamp}`, name: FF.name.trim(),
          origin_code: effOrigin, dest_code: effDest,
          date: FF.date, depart_time: FF.depart_time,
        }
        const rows = [outbound]
        if (FF.tripType === 'round_trip') {
          rows.push({
            ...base, id: `F-${stamp}R`, name: `${destLabel} → ${originLabel}`,
            origin_code: effDest, dest_code: effOrigin,
            date: FF.return_date, depart_time: FF.return_time,
          })
        }
        const { error } = await supabase.from('flights').insert(rows)
        if (error) throw error
        showToast(FF.tripType === 'round_trip' ? 'Round-trip created — 2 flights added' : 'Flight created')
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
        date: excForm.date, template_id: null,
        aircraft_id: excForm.aircraft_id || null,
        start_time: excForm.start_time || null, depart_time: excForm.depart_time || null,
        arrive_time: excForm.arrive_time || null, return_time: excForm.return_time || null,
        stay_type: excForm.stay_type, pitch: excForm.pitch || null,
        visibility: excForm.visibility, spots_total: excForm.spots_total,
        spots_anchor: excForm.spots_anchor, price_per_pax: excForm.price_per_pax,
        status: excForm.status, anchor_member_id: excForm.anchor_member_id || null,
      }
      if (editExcId) {
        const { error } = await supabase.from('excursions').update(payload).eq('id', editExcId)
        if (error) throw error
        showToast('Excursion updated')
      } else {
        const id = 'E-' + Date.now().toString(36).toUpperCase()
        const { error } = await supabase.from('excursions').insert({ ...payload, id })
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

  // Build origin/destination option lists, always including the current selection.
  const originOptions = [...originAirports]
  if (FF.originSel && FF.originSel !== CUSTOM && !originOptions.some(a => a.code === FF.originSel)) {
    originOptions.unshift({ code: FF.originSel, name: FF.originSel, sub: null, role: 'origin' })
  }
  const destOptions = [...destAirports]
  if (FF.destSel && FF.destSel !== CUSTOM && !destOptions.some(a => a.code === FF.destSel)) {
    destOptions.unshift({ code: FF.destSel, name: FF.destSel, sub: null, role: 'destination' })
  }

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

            {/* Trip type — creation only (each leg is its own record) */}
            {!editFlightId && (
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label className="field-lab">Trip Type</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['one_way', 'round_trip'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setFlightForm(f => ({ ...f, tripType: t }))}
                      style={{
                        padding: '8px 18px', borderRadius: 8, cursor: 'pointer',
                        border: `1px solid ${FF.tripType === t ? 'var(--tropic)' : 'var(--hair)'}`,
                        background: FF.tripType === t ? 'var(--tropic)' : 'var(--card)',
                        color: FF.tripType === t ? '#fff' : 'var(--ink-soft)',
                        fontFamily: 'var(--ui)', fontSize: 13, fontWeight: 600,
                      }}
                    >
                      {t === 'one_way' ? 'One-way' : 'Round-trip'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ─── Route ─── */}
            <div style={sectionLabelStyle}>Route</div>
            <div className="field">
              <label className="field-lab">Origin <span className="req">*</span></label>
              <select className="select" value={FF.originSel} onChange={e => setFlightForm(f => ({ ...f, originSel: e.target.value }))}>
                <option value="">Select origin…</option>
                {originOptions.map(a => <option key={a.code} value={a.code}>{a.name} ({a.code})</option>)}
                <option value={CUSTOM}>+ Custom landing area…</option>
              </select>
            </div>
            <div className="field">
              <label className="field-lab">Destination <span className="req">*</span></label>
              <select className="select" value={FF.destSel} onChange={e => setFlightForm(f => ({ ...f, destSel: e.target.value }))}>
                <option value="">Select destination…</option>
                {destOptions.map(a => <option key={a.code} value={a.code}>{a.name} ({a.code})</option>)}
                <option value={CUSTOM}>+ Custom landing area…</option>
              </select>
            </div>
            <div className="field" />

            {FF.originSel === CUSTOM && (
              <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, padding: 14, background: 'var(--warm)', borderRadius: 10 }}>
                <div style={{ gridColumn: '1 / -1', fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-light)' }}>Custom origin</div>
                <div className="field"><label className="field-lab">Code <span className="req">*</span></label><input className="input" value={FF.originCustomCode} onChange={e => setFlightForm(f => ({ ...f, originCustomCode: e.target.value.toUpperCase() }))} placeholder="e.g. MYGF" maxLength={6} /></div>
                <div className="field"><label className="field-lab">Airport name <span className="req">*</span></label><input className="input" value={FF.originCustomName} onChange={e => setFlightForm(f => ({ ...f, originCustomName: e.target.value }))} placeholder="e.g. Grand Cay" /></div>
                <div className="field"><label className="field-lab">Region</label><input className="input" value={FF.originCustomRegion} onChange={e => setFlightForm(f => ({ ...f, originCustomRegion: e.target.value }))} placeholder="e.g. Bahamas" /></div>
              </div>
            )}
            {FF.destSel === CUSTOM && (
              <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, padding: 14, background: 'var(--warm)', borderRadius: 10 }}>
                <div style={{ gridColumn: '1 / -1', fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-light)' }}>Custom destination</div>
                <div className="field"><label className="field-lab">Code <span className="req">*</span></label><input className="input" value={FF.destCustomCode} onChange={e => setFlightForm(f => ({ ...f, destCustomCode: e.target.value.toUpperCase() }))} placeholder="e.g. MYGF" maxLength={6} /></div>
                <div className="field"><label className="field-lab">Airport name <span className="req">*</span></label><input className="input" value={FF.destCustomName} onChange={e => setFlightForm(f => ({ ...f, destCustomName: e.target.value }))} placeholder="e.g. Grand Cay" /></div>
                <div className="field"><label className="field-lab">Region</label><input className="input" value={FF.destCustomRegion} onChange={e => setFlightForm(f => ({ ...f, destCustomRegion: e.target.value }))} placeholder="e.g. Bahamas" /></div>
              </div>
            )}

            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="field-lab">Flight Name <span className="req">*</span></label>
              <input
                className="input"
                value={FF.name}
                onChange={e => setFlightForm(f => ({ ...f, name: e.target.value, nameTouched: true }))}
                placeholder="Auto-fills from the route"
              />
              <div style={{ fontSize: 11, color: 'var(--ink-light)', marginTop: 4 }}>
                {FF.nameTouched ? 'Custom name — ' : 'Auto-filled from route — '}
                <button type="button" onClick={() => setFlightForm(f => ({ ...f, nameTouched: false }))} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--tropic-d)', cursor: 'pointer', fontSize: 11, textDecoration: 'underline' }}>
                  {FF.nameTouched ? 'reset to auto' : 'edit to override'}
                </button>
              </div>
            </div>

            {/* ─── Schedule ─── */}
            <div style={sectionLabelStyle}>Schedule {!editFlightId && FF.tripType === 'round_trip' ? '· outbound' : ''}</div>
            <div className="field">
              <label className="field-lab">Departure Date <span className="req">*</span></label>
              <input className="input" type="date" value={FF.date} onChange={e => setFlightForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="field">
              <label className="field-lab">Departure Time <span className="req">*</span></label>
              <input className="input" type="time" value={FF.depart_time} onChange={e => setFlightForm(f => ({ ...f, depart_time: e.target.value }))} />
            </div>
            <div className="field">
              <label className="field-lab">Flight Duration (mins)</label>
              <input className="input" type="number" min={0} value={FF.duration_mins} onChange={e => setFlightForm(f => ({ ...f, duration_mins: Number(e.target.value) }))} />
              {FF.depart_time && FF.duration_mins > 0 && (
                <div style={{ fontSize: 11, color: 'var(--ink-light)', marginTop: 4 }}>Arrives ~ {addMins(FF.depart_time, FF.duration_mins)}</div>
              )}
            </div>

            {!editFlightId && FF.tripType === 'round_trip' && (
              <>
                <div style={sectionLabelStyle}>Schedule · return ({destLabel || 'destination'} → {originLabel || 'origin'})</div>
                <div className="field">
                  <label className="field-lab">Return Date <span className="req">*</span></label>
                  <input className="input" type="date" value={FF.return_date} min={FF.date || undefined} onChange={e => setFlightForm(f => ({ ...f, return_date: e.target.value }))} />
                </div>
                <div className="field">
                  <label className="field-lab">Return Pickup Time <span className="req">*</span></label>
                  <input className="input" type="time" value={FF.return_time} onChange={e => setFlightForm(f => ({ ...f, return_time: e.target.value }))} />
                </div>
                <div className="field">
                  <label className="field-lab">&nbsp;</label>
                  <div style={{ fontSize: 11, color: 'var(--ink-light)', paddingTop: 10 }}>
                    Same aircraft &amp; seat layout as outbound.{FF.return_time && FF.duration_mins > 0 ? ` Arrives ~ ${addMins(FF.return_time, FF.duration_mins)}` : ''}
                  </div>
                </div>
              </>
            )}

            {/* ─── Aircraft & seats ─── */}
            <div style={sectionLabelStyle}>Aircraft &amp; Seats</div>
            <div className="field">
              <label className="field-lab">Aircraft <span className="req">*</span></label>
              <select
                className="select"
                value={FF.aircraft_id}
                onChange={e => {
                  const id = e.target.value
                  const cap = aircraft.find(a => a.id === id)?.capacity
                  setFlightForm(f => ({ ...f, aircraft_id: id, seats_total: cap != null && f.seats_total > cap ? cap : f.seats_total }))
                }}
              >
                <option value="">Select aircraft…</option>
                {aircraft.map(a => <option key={a.id} value={a.id}>{a.name} ({a.capacity} seats)</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-lab">Seats Total <span className="req">*</span></label>
              <input className="input" type="number" min={1} max={capacity ?? undefined} value={FF.seats_total} onChange={e => setFlightForm(f => ({ ...f, seats_total: Number(e.target.value) }))} />
              {capacity != null && <div style={{ fontSize: 11, color: FF.seats_total > capacity ? 'var(--signal)' : 'var(--ink-light)', marginTop: 4 }}>Max {capacity} for {selectedAircraft?.name}</div>}
            </div>
            <div className="field">
              <label className="field-lab">Anchor Seats</label>
              <input className="input" type="number" min={0} max={FF.seats_total} value={FF.seats_anchor} onChange={e => setFlightForm(f => ({ ...f, seats_anchor: Number(e.target.value) }))} />
              <div style={{ fontSize: 11, color: 'var(--ink-light)', marginTop: 4 }}>{Math.max(0, FF.seats_total - FF.seats_anchor)} seats open to members</div>
            </div>

            {/* ─── Pricing & visibility ─── */}
            <div style={sectionLabelStyle}>Pricing &amp; Listing</div>
            <div className="field">
              <label className="field-lab">Price Per Seat ($)</label>
              <input className="input" type="number" min={0} value={FF.price_per_seat} onChange={e => setFlightForm(f => ({ ...f, price_per_seat: Number(e.target.value) }))} />
            </div>
            <div className="field">
              <label className="field-lab">Status</label>
              <select className="select" value={FF.status} onChange={e => setFlightForm(f => ({ ...f, status: e.target.value as Flight['status'] }))}>
                {FLIGHT_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-lab">Visibility</label>
              <select className="select" value={FF.visibility} onChange={e => setFlightForm(f => ({ ...f, visibility: e.target.value as 'members' | 'public' }))}>
                <option value="members">Members Only</option>
                <option value="public">Public</option>
              </select>
            </div>
            <div className="field">
              <label className="field-lab">Anchor Member</label>
              <select className="select" value={FF.anchor_member_id} onChange={e => setFlightForm(f => ({ ...f, anchor_member_id: e.target.value }))}>
                <option value="">None</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="field-lab">Pitch (tagline)</label>
              <input className="input" value={FF.pitch} onChange={e => setFlightForm(f => ({ ...f, pitch: e.target.value }))} placeholder="A quick escape to the Caribbean…" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <button className="btn-primary" onClick={saveFlight} disabled={saving}>
              {saving ? 'Saving…' : (!editFlightId && FF.tripType === 'round_trip' ? 'Save Round-trip' : 'Save Flight')}
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
              <label className="field-lab">Price Per Pax ($)</label>
              <input className="input" type="number" min={0} value={EF.price_per_pax} onChange={e => setExcForm(f => ({ ...f, price_per_pax: Number(e.target.value) }))} />
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
                  <td style={{ fontSize: 12, color: 'var(--ink-light)' }}>{aircraft.find(a => a.id === f.aircraft_id)?.name ?? f.aircraft_id}</td>
                  <td style={{ fontWeight: 600 }}>{f.seats_anchor}/{f.seats_total}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>${f.price_per_seat.toLocaleString()}</td>
                  <td><span className={`pill ${statusColor[f.status]}`}>{f.status}</span></td>
                  <td style={{ fontSize: 12 }}>{members.find(m => m.id === f.anchor_member_id)?.name ?? '—'}</td>
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
                <th>Price/Pax</th>
                <th>Status</th>
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
                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>${e.price_per_pax.toLocaleString()}</td>
                  <td><span className={`pill ${statusColor[e.status]}`}>{e.status}</span></td>
                  <td style={{ fontSize: 12 }}>{members.find(m => m.id === e.anchor_member_id)?.name ?? '—'}</td>
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
