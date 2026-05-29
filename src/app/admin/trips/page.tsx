'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { returnLegIds } from '@/lib/data'
import { logActivity } from '@/lib/activity'
import { ALL_ICONS, KIND_ICONS, suggestIconForActivity } from '@/lib/icons'
import { asItinerary, generateDefaultItinerary, type ItineraryStep } from '@/lib/itinerary'
import type { Flight, Excursion, Aircraft, Member, Airport, ExcursionTemplate, Booking } from '@/lib/supabase/types'
import { SponsoredExcursionModal, type SponsoredExcursion } from './SponsoredExcursionModal'
import { TripPhotoPicker } from '@/components/TripPhotoPicker'
import { PhotoLibraryPanel } from './PhotoLibraryPanel'
import { SPONSOR_LINE_PRESETS } from '@/components/SponsorBadge'

type FlightRow = Flight
type ExcursionRow = Excursion

const CUSTOM = '__custom__'

function Toast({ msg, kind }: { msg: string; kind: 'success' | 'error' | 'info' }) {
  return <div className={`toast ${kind}`}>{msg}</div>
}

// Sponsor-line picker: a dropdown of preset collab lines plus a
// "Custom…" option that reveals a free-text input. Keeps the
// badge-trigger string ("Field & Stream") typo-proof while still
// allowing one-off collabs.
function SponsorLinePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const isPreset = value === '' || SPONSOR_LINE_PRESETS.includes(value)
  // 'custom' sentinel when the current value isn't a known preset and
  // isn't empty — keeps the free-text box open while editing.
  const selectValue = value === '' ? '' : (isPreset ? value : '__custom__')
  return (
    <div>
      <select
        className="select"
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value
          if (v === '__custom__') onChange(' ')        // open custom box (non-empty so it stays in custom mode)
          else onChange(v)                              // '' = not sponsored, or a preset line
        }}
      >
        <option value="">Not sponsored</option>
        {SPONSOR_LINE_PRESETS.map(p => <option key={p} value={p}>{p}</option>)}
        <option value="__custom__">Custom…</option>
      </select>
      {selectValue === '__custom__' && (
        <input
          className="input"
          style={{ marginTop: 8 }}
          autoFocus
          value={value.trim() === '' ? '' : value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. Travail × Orvis"
        />
      )}
    </div>
  )
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
  leg_cost: number
  return_leg_cost: number
  status: Flight['status']
  anchor_member_id: string
  image_url: string
}
type ExcForm = {
  template_id: string
  name: string
  nameTouched: boolean
  originSel: string
  originCustomCode: string
  originCustomName: string
  originCustomRegion: string
  date: string
  aircraft_id: string
  start_time: string
  depart_time: string
  arrive_time: string
  return_time: string
  stay_type: Excursion['stay_type']
  pitch: string
  icon: string
  iconTouched: boolean
  sponsor: string  // '' | 'field_stream'
  visibility: 'members' | 'public'
  spots_total: number
  spots_anchor: number
  total_cost: number
  status: Excursion['status']
  anchor_member_id: string
  image_url: string
  // Day-plan itinerary — Ops writes this in the editor (icons + times +
  // labels). Reserve page falls back to a generated default when null.
  itinerary: ItineraryStep[]
}

const defaultFlightForm: FlightForm = {
  name: '', nameTouched: false, tripType: 'one_way',
  originSel: '', originCustomCode: '', originCustomName: '', originCustomRegion: '',
  destSel: '', destCustomCode: '', destCustomName: '', destCustomRegion: '',
  date: '', depart_time: '', return_date: '', return_time: '',
  duration_mins: 90, aircraft_id: '', pitch: '', visibility: 'members',
  seats_total: 8, seats_anchor: 0, leg_cost: 0, return_leg_cost: 0, status: 'draft',
  anchor_member_id: '', image_url: '',
}
const defaultExcForm: ExcForm = {
  template_id: '', name: '', nameTouched: false,
  originSel: '', originCustomCode: '', originCustomName: '', originCustomRegion: '',
  date: '', aircraft_id: '',
  start_time: '', depart_time: '', arrive_time: '', return_time: '',
  stay_type: 'day_trip', pitch: '', icon: 'fish', iconTouched: false, sponsor: '', visibility: 'members',
  spots_total: 8, spots_anchor: 0, total_cost: 0, status: 'draft',
  anchor_member_id: '', image_url: '',
  itinerary: [],
}

// All marks in the library — the icon picker stays in sync with KIND_ICONS.
const TEMPLATE_ICONS = ALL_ICONS

type TemplateForm = {
  name: string
  destSel: string
  destCustomCode: string
  destCustomName: string
  destCustomRegion: string
  operator: string
  price_per_pax: number
  icon: string
  iconTouched: boolean
  description: string
}
const defaultTemplateForm: TemplateForm = {
  name: '', destSel: '', destCustomCode: '', destCustomName: '', destCustomRegion: '',
  operator: '', price_per_pax: 0, icon: 'fish', iconTouched: false, description: '',
}

const sectionLabelStyle: React.CSSProperties = {
  gridColumn: '1 / -1', fontFamily: 'var(--mono)', fontSize: 10,
  letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-light)',
  marginTop: 6, marginBottom: -4,
}

export default function TripsPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<'active' | 'templates' | 'photos'>('active')
  const [flights, setFlights] = useState<FlightRow[]>([])
  const [excursions, setExcursions] = useState<ExcursionRow[]>([])
  const [aircraft, setAircraft] = useState<Aircraft[]>([])
  const [airports, setAirports] = useState<Airport[]>([])
  const [templates, setTemplates] = useState<ExcursionTemplate[]>([])
  const [members, setMembers] = useState<Pick<Member, 'id' | 'name' | 'initials'>[]>([])
  const [loading, setLoading] = useState(true)
  const [showFlightForm, setShowFlightForm] = useState(false)
  const [showExcForm, setShowExcForm] = useState(false)
  const [editFlightId, setEditFlightId] = useState<string | null>(null)
  const [editExcId, setEditExcId] = useState<string | null>(null)
  const [flightForm, setFlightForm] = useState<FlightForm>(defaultFlightForm)
  const [excForm, setExcForm] = useState<ExcForm>(defaultExcForm)
  const [showTemplateForm, setShowTemplateForm] = useState(false)
  const [editTemplateId, setEditTemplateId] = useState<string | null>(null)
  const [templateForm, setTemplateForm] = useState<TemplateForm>(defaultTemplateForm)
  const [showSponsoredForm, setShowSponsoredForm] = useState(false)
  const [editSponsored, setEditSponsored] = useState<SponsoredExcursion | null>(null)
  const [saving, setSaving] = useState(false)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [settling, setSettling] = useState<string | null>(null)
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
      { data: templateData },
      { data: memberData },
    ] = await Promise.all([
      supabase.from('flights').select('*').order('date', { ascending: false }),
      supabase.from('excursions').select('*').order('date', { ascending: false }),
      supabase.from('aircraft').select('*'),
      supabase.from('airports').select('*').order('name'),
      supabase.from('excursion_templates').select('*').order('name'),
      supabase.from('members').select('id, name, initials').order('name'),
    ])
    setFlights((flightData ?? []) as FlightRow[])
    setExcursions((excData ?? []) as ExcursionRow[])
    setAircraft(aircraftData ?? [])
    setAirports(airportData ?? [])
    setTemplates(templateData ?? [])
    setMembers(memberData ?? [])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const FF = flightForm
  const EF = excForm
  const TF = templateForm

  // ─── Derived flight values ──────────────────────────────────────────────
  const originAirports = airports.filter(a => a.role === 'origin' || a.role === 'both')
  const destAirports = airports.filter(a => a.role === 'destination' || a.role === 'both')

  // "Active" = exactly what members see on Open Seats: open/full trips, with
  // round trips collapsed to the outbound leg. Cancelled/draft excluded;
  // departed/completed kept in the list so Ops can still see + settle
  // them. anchorPi + settledAt drive whether the Settle button shows.
  type ActiveItem = {
    key: string; kind: 'flight' | 'excursion'
    name: string; label: string; date: string
    avail: number; total: number; status: string
    anchorPi: string | null
    settledAt: string | null
    onEdit: () => void
  }
  const activeFlightList = flights.filter(f => f.status === 'open' || f.status === 'full' || f.status === 'departed')
  const activeRetIds = returnLegIds(activeFlightList)
  const flightItems: ActiveItem[] = activeFlightList
    .filter(f => !activeRetIds.has(f.id))
    .map(f => {
      const ret = activeFlightList.find(x => x.id === `${f.id}R`)
      const isRound = !!ret && activeRetIds.has(ret.id)
      return {
        key: f.id, kind: 'flight', name: f.name, date: f.date,
        label: isRound ? `${f.origin_code} ⇄ ${f.dest_code} · round trip` : `${f.origin_code} → ${f.dest_code}`,
        avail: Math.max(0, f.seats_total - f.seats_anchor - (f.seats_taken ?? 0)),
        total: f.seats_total - f.seats_anchor, status: f.status,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        anchorPi: ((f as any).anchor_payment_intent_id as string | null) ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        settledAt: ((f as any).anchor_settled_at as string | null) ?? null,
        onEdit: () => openEditFlight(f),
      }
    })
  const excItems: ActiveItem[] = excursions
    .filter(e => e.status === 'open' || e.status === 'full' || e.status === 'completed')
    .map(e => ({
      key: e.id, kind: 'excursion', name: e.name, date: e.date, label: e.origin_code,
      avail: Math.max(0, e.spots_total - e.spots_anchor - (e.spots_taken ?? 0)),
      total: e.spots_total - e.spots_anchor, status: e.status,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      anchorPi: ((e as any).anchor_payment_intent_id as string | null) ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      settledAt: ((e as any).anchor_settled_at as string | null) ?? null,
      onEdit: () => openEditExc(e),
    }))
  const activeItems: ActiveItem[] = [...flightItems, ...excItems].sort((a, b) => a.date.localeCompare(b.date))
  const airportName = (code: string) => airports.find(a => a.code === code)?.name ?? code

  const effOrigin = FF.originSel === CUSTOM ? FF.originCustomCode.trim().toUpperCase() : FF.originSel
  const effDest = FF.destSel === CUSTOM ? FF.destCustomCode.trim().toUpperCase() : FF.destSel
  const originLabel = FF.originSel === CUSTOM ? (FF.originCustomName.trim() || effOrigin) : airportName(FF.originSel)
  const destLabel = FF.destSel === CUSTOM ? (FF.destCustomName.trim() || effDest) : airportName(FF.destSel)

  const selectedAircraft = aircraft.find(a => a.id === FF.aircraft_id)
  const capacity = selectedAircraft?.capacity ?? null

  const perSeatOut = FF.seats_total > 0 ? Math.round(FF.leg_cost / FF.seats_total) : 0
  const perSeatRet = FF.seats_total > 0 ? Math.round(FF.return_leg_cost / FF.seats_total) : 0

  // Auto-fill the flight name from the route until an admin edits it by hand.
  useEffect(() => {
    if (FF.nameTouched) return
    if (effOrigin && effDest) {
      setFlightForm(f => ({ ...f, name: `${originLabel} → ${destLabel}` }))
    }
  }, [effOrigin, effDest, originLabel, destLabel, FF.nameTouched])

  // ─── Derived excursion values ───────────────────────────────────────────
  const selectedTemplate = templates.find(t => t.id === EF.template_id)
  const excDestLabel = selectedTemplate ? airportName(selectedTemplate.dest_code) : ''
  const effExcOrigin = EF.originSel === CUSTOM ? EF.originCustomCode.trim().toUpperCase() : EF.originSel
  const perPax = EF.spots_total > 0 ? Math.round(EF.total_cost / EF.spots_total) : 0

  const effTplDest = TF.destSel === CUSTOM ? TF.destCustomCode.trim().toUpperCase() : TF.destSel

  // Auto-fill the excursion name from the chosen catalog experience.
  useEffect(() => {
    if (EF.nameTouched) return
    if (selectedTemplate) {
      setExcForm(f => ({ ...f, name: `${selectedTemplate.name} · ${airportName(selectedTemplate.dest_code)}` }))
    }
  }, [EF.template_id, EF.nameTouched]) // eslint-disable-line react-hooks/exhaustive-deps

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
    if (FF.leg_cost < 0) return 'Leg cost cannot be negative'
    if (!editFlightId && FF.tripType === 'round_trip') {
      if (!FF.return_date) return 'Pick a return date'
      if (!FF.return_time) return 'Pick a return time'
      if (FF.return_date < FF.date) return 'Return date cannot be before the outbound date'
      if (FF.return_leg_cost < 0) return 'Return leg cost cannot be negative'
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
      leg_cost: f.price_per_seat * f.seats_total, return_leg_cost: 0, status: f.status,
      anchor_member_id: f.anchor_member_id ?? '',
      image_url: f.image_url ?? '',
    })
    setShowExcForm(false)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function openEditExc(e: ExcursionRow) {
    setEditExcId(e.id)
    setShowExcForm(true)
    setExcForm({
      ...defaultExcForm,
      template_id: e.template_id ?? '', name: e.name, nameTouched: true,
      originSel: e.origin_code, date: e.date,
      aircraft_id: e.aircraft_id ?? '',
      start_time: e.start_time ?? '', depart_time: e.depart_time ?? '',
      arrive_time: e.arrive_time ?? '', return_time: e.return_time ?? '',
      stay_type: e.stay_type, pitch: e.pitch ?? '', visibility: e.visibility,
      icon: e.icon ?? templates.find(t => t.id === e.template_id)?.icon ?? 'fish',
      iconTouched: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sponsor: ((e as any).sponsor as string | null) ?? '',
      spots_total: e.spots_total, spots_anchor: e.spots_anchor,
      total_cost: e.price_per_pax * e.spots_total, status: e.status,
      anchor_member_id: e.anchor_member_id ?? '',
      image_url: e.image_url ?? '',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      itinerary: asItinerary((e as any).itinerary),
    })
    setShowFlightForm(false)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function excError(): string | null {
    // Template is optional — custom Travail excursions don't come from
    // the catalog. The name is what's actually required.
    if (!effExcOrigin) return 'Select or enter an origin'
    if (EF.originSel === CUSTOM && !EF.originCustomName.trim()) return 'Name the custom origin airport'
    if (!EF.name.trim()) return 'Excursion name is required'
    if (!EF.date) return 'Pick a date'
    if (EF.spots_total < 1) return 'Spots total must be at least 1'
    if (EF.spots_anchor < 0 || EF.spots_anchor > EF.spots_total) return 'Anchor spots must be between 0 and spots total'
    if (EF.total_cost < 0) return 'Cost cannot be negative'
    return null
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
        status: FF.status, anchor_member_id: FF.anchor_member_id || null,
        image_url: FF.image_url || null,
      }

      if (editFlightId) {
        const payload = {
          ...base, name: FF.name.trim(), price_per_seat: perSeatOut,
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
          ...base, id: `F-${stamp}`, name: FF.name.trim(), price_per_seat: perSeatOut,
          origin_code: effOrigin, dest_code: effDest,
          date: FF.date, depart_time: FF.depart_time,
        }
        const rows = [outbound]
        if (FF.tripType === 'round_trip') {
          rows.push({
            ...base, id: `F-${stamp}R`, name: `${destLabel} → ${originLabel}`, price_per_seat: perSeatRet,
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
    const err = excError()
    if (err) { showToast(err, 'error'); return }
    setSaving(true)
    try {
      if (EF.originSel === CUSTOM) {
        const { error } = await supabase.from('airports').upsert(
          { code: effExcOrigin, name: EF.originCustomName.trim(), sub: EF.originCustomRegion.trim() || null, role: 'both' },
          { onConflict: 'code' },
        )
        if (error) throw error
      }

      const payload = {
        name: EF.name.trim(), origin_code: effExcOrigin,
        date: EF.date, template_id: EF.template_id || null,
        aircraft_id: EF.aircraft_id || null,
        start_time: EF.start_time || null, depart_time: EF.depart_time || null,
        arrive_time: EF.arrive_time || null, return_time: EF.return_time || null,
        stay_type: EF.stay_type, pitch: EF.pitch || null, icon: EF.icon || null,
        sponsor: EF.sponsor || null,
        visibility: EF.visibility, spots_total: EF.spots_total,
        spots_anchor: EF.spots_anchor, price_per_pax: perPax,
        status: EF.status, anchor_member_id: EF.anchor_member_id || null,
        image_url: EF.image_url || null,
        // Persist null when empty so the reserve page falls back to the
        // generated default rather than rendering an empty day plan.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        itinerary: (EF.itinerary.length > 0 ? EF.itinerary : null) as any,
      }
      if (editExcId) {
        const { data, error } = await supabase.from('excursions').update(payload).eq('id', editExcId).select()
        if (error) throw error
        if (!data || data.length === 0) throw new Error('Update blocked — verify the admin RLS update policy on excursions')
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

  function selectTemplate(id: string) {
    const t = templates.find(x => x.id === id)
    setExcForm(f => ({
      ...f,
      template_id: id,
      nameTouched: false,
      pitch: f.pitch || (t?.description ?? ''),
      icon: t?.icon ?? f.icon,
      total_cost: t ? t.price_per_pax * f.spots_total : f.total_cost,
    }))
  }

  function openEditTemplate(t: ExcursionTemplate) {
    setEditTemplateId(t.id)
    setShowTemplateForm(true)
    setTemplateForm({
      ...defaultTemplateForm,
      name: t.name, destSel: t.dest_code,
      operator: t.operator ?? '',
      price_per_pax: t.price_per_pax, icon: t.icon ?? 'fish',
      iconTouched: true,
      description: t.description ?? '',
    })
  }

  function templateError(): string | null {
    if (!TF.name.trim()) return 'Template name is required'
    if (!effTplDest) return 'Select or enter a destination'
    if (TF.destSel === CUSTOM && !TF.destCustomName.trim()) return 'Name the custom destination airport'
    if (TF.price_per_pax < 0) return 'Price cannot be negative'
    return null
  }

  async function saveTemplate() {
    const err = templateError()
    if (err) { showToast(err, 'error'); return }
    setSaving(true)
    try {
      if (TF.destSel === CUSTOM) {
        const { error } = await supabase.from('airports').upsert(
          { code: effTplDest, name: TF.destCustomName.trim(), sub: TF.destCustomRegion.trim() || null, role: 'both' },
          { onConflict: 'code' },
        )
        if (error) throw error
      }
      const payload = {
        name: TF.name.trim(), dest_code: effTplDest,
        operator: TF.operator.trim() || '',
        price_per_pax: TF.price_per_pax, icon: TF.icon,
        description: TF.description.trim() || null,
      }
      if (editTemplateId) {
        const { data, error } = await supabase.from('excursion_templates').update(payload).eq('id', editTemplateId).select()
        if (error) throw error
        if (!data || data.length === 0) throw new Error('Update blocked — verify the admin RLS policy on excursion_templates')
        showToast('Template updated')
      } else {
        const id = 'tpl-' + Date.now().toString(36).toUpperCase()
        const { error } = await supabase.from('excursion_templates').insert({ ...payload, id })
        if (error) throw error
        showToast('Template created')
      }
      setShowTemplateForm(false); setEditTemplateId(null); setTemplateForm(defaultTemplateForm)
      load()
    } catch (e: unknown) {
      showToast((e as Error).message ?? 'Save failed', 'error')
    } finally { setSaving(false) }
  }

  // One-click cancel: cancels the trip (both legs of a round trip), voids active
  // bookings on it, and notifies affected members.
  async function cancelTrip(kind: 'flight' | 'excursion', id: string, name: string) {
    // Real money moves here. Hands off to the server endpoint which
    // refunds every pax booking in full (including service fees) AND
    // refunds the anchor's full capture (charter + 3% service fee) —
    // the one path in the system that refunds the anchor fee. Server-
    // side because Stripe operations belong on the server, and so the
    // whole flow is auditable as a single request.
    const reason = window.prompt(
      `Force-cancel "${name}"?\n\nThis is a Travail-initiated cancel. It will:\n  • Refund every pax their full payment (including service fees)\n  • Refund the anchor their FULL capture (charter + 3% fee)\n  • Mark the trip + all bookings + the anchor submission cancelled\n  • Send branded emails to the anchor + every pax + ops inbox\n\nOptionally, add a short reason for the email (weather, operator, scheduling…). Leave blank to skip.`,
      '',
    )
    // Cancelling the prompt returns null. Empty string = keep going with no reason.
    if (reason === null) return

    setCancelling(id)
    try {
      const ids = kind === 'flight' && flights.some(f => f.id === `${id}R`) ? [id, `${id}R`] : [id]
      let lastErr: string | null = null
      let totalPaxRefunded = 0
      let totalAnchorRefunded = 0
      let paxCount = 0
      for (const legId of ids) {
        const res = await fetch('/api/admin/cancel-trip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item_kind: kind, item_id: legId, reason: reason.trim() || undefined }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) { lastErr = json.error ?? `Cancel failed for ${legId}`; break }
        if (json.already_cancelled) continue
        totalAnchorRefunded += Number(json.anchor?.refunded_cents ?? 0)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const r of (json.pax ?? []) as any[]) {
          totalPaxRefunded += Number(r.refunded_cents ?? 0)
          paxCount += 1
        }
      }
      if (lastErr) { showToast(`Cancel failed: ${lastErr}`, 'error'); return }
      const totalDollars = (totalAnchorRefunded + totalPaxRefunded) / 100
      showToast(
        paxCount > 0
          ? `Trip cancelled — refunded $${totalDollars.toFixed(2)} across anchor + ${paxCount} pax`
          : `Trip cancelled — anchor refunded $${(totalAnchorRefunded / 100).toFixed(2)}`,
      )
      load()
    } catch (e: unknown) {
      showToast((e as Error).message ?? 'Cancel failed', 'error')
    } finally { setCancelling(null) }
  }

  // Run the trip-departure settlement. Refunds the anchor for whatever
  // pax revenue covered, writes a trip_settlements row, marks the trip
  // anchor_settled_at. Idempotent — safe to click twice (the endpoint
  // returns the existing settlement on the second call).
  async function settleTrip(kind: 'flight' | 'excursion', id: string, name: string) {
    if (settling) return
    // Detect whether this is an early-override (date still in the future)
    // so we can warn more explicitly. The endpoint accepts either case.
    const trip = kind === 'flight'
      ? flights.find(f => f.id === id)
      : excursions.find(e => e.id === id)
    const todayIso = new Date().toISOString().slice(0, 10)
    const isOverride = trip ? (trip.date > todayIso && trip.status !== 'departed' && trip.status !== 'completed') : false
    const prompt = isOverride
      ? `FORCE SETTLE "${name}"?\n\nThis trip's departure date is in the future. Settling now will:\n  • Refund the anchor based on what pax have paid so far\n  • Send the settlement email to the anchor immediately\n  • Block the cron from settling it later (idempotent)\n\nUse for testing or to wrap a trip early. Cannot be undone.`
      : `Settle "${name}"? This refunds the anchor for whatever the pax pool covered and finalizes the trip's books. Cannot be undone.`
    if (!confirm(prompt)) return
    setSettling(id)
    try {
      const res = await fetch('/api/admin/settle-trip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_kind: kind, item_id: id }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        showToast(`Settlement failed: ${json.error ?? 'Unknown error'}`, 'error')
        return
      }
      if (json.already_settled) {
        showToast('Already settled — no changes.', 'info')
        return
      }
      const s = json.settlement
      const dollars = (c: number) => `$${(c / 100).toFixed(2)}`
      showToast(
        `Settled — anchor refunded ${dollars(s.anchor_refund_cents)}, net ${dollars(s.anchor_net_paid_cents)}.`,
        'success',
      )
    } catch (e: unknown) {
      showToast((e as Error).message ?? 'Settlement failed', 'error')
    } finally { setSettling(null) }
  }

  async function deleteTemplate(id: string, name: string) {
    if (!confirm(`Delete template "${name}"? This cannot be undone.`)) return
    const { error, data } = await supabase.from('excursion_templates').delete().eq('id', id).select()
    if (error) { showToast(error.message.includes('foreign key') ? 'In use by an excursion — delete or repoint those first' : error.message, 'error'); return }
    if (!data || data.length === 0) { showToast('Delete blocked — check the admin RLS policy on excursion_templates', 'error'); return }
    showToast('Template deleted')
    load()
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
  const excOriginOptions = [...originAirports]
  if (EF.originSel && EF.originSel !== CUSTOM && !excOriginOptions.some(a => a.code === EF.originSel)) {
    excOriginOptions.unshift({ code: EF.originSel, name: EF.originSel, sub: null, role: 'origin' })
  }
  const tplDestOptions = [...destAirports]
  if (TF.destSel && TF.destSel !== CUSTOM && !tplDestOptions.some(a => a.code === TF.destSel)) {
    tplDestOptions.unshift({ code: TF.destSel, name: TF.destSel, sub: null, role: 'destination' })
  }

  return (
    <div className="admin-page">
      {toast && <Toast msg={toast.msg} kind={toast.kind} />}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 30, fontWeight: 500, color: 'var(--ink)', margin: 0 }}>Trips & Excursions</h1>
          <p style={{ fontSize: 13, color: 'var(--ink-light)', marginTop: 4, marginBottom: 0 }}>
            {tab === 'active' ? 'Live trips on the members’ Open Seats board. Cancelled trips drop off automatically.' : tab === 'photos' ? 'Reusable photo library — upload once, pick from any trip form.' : 'Manage all flights and excursions, including drafts and past trips.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {tab === 'photos' ? null : tab === 'active' ? (
            <>
              <button
                onClick={() => { setEditSponsored(null); setShowSponsoredForm(true) }}
                style={{
                  height: 38, padding: '0 16px', borderRadius: 10, border: 'none',
                  background: 'linear-gradient(135deg, #f4a72c 0%, #e09418 100%)',
                  color: '#1a0e02', fontWeight: 600, fontSize: 13, fontFamily: 'var(--ui)',
                  cursor: 'pointer', boxShadow: '0 1px 2px rgba(244,167,44,0.30)',
                  transition: 'transform 0.08s, box-shadow 0.12s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(244,167,44,0.42)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 2px rgba(244,167,44,0.30)' }}
              >
                + Sponsored
              </button>
              <button
                onClick={() => { setShowExcForm(true); setEditExcId(null); setExcForm(defaultExcForm); setShowFlightForm(false) }}
                style={{
                  height: 38, padding: '0 16px', borderRadius: 10, border: 'none',
                  background: 'linear-gradient(135deg, #4ba883 0%, #357d5e 100%)',
                  color: '#ffffff', fontWeight: 600, fontSize: 13, fontFamily: 'var(--ui)',
                  cursor: 'pointer', boxShadow: '0 1px 2px rgba(62,140,109,0.30)',
                  transition: 'transform 0.08s, box-shadow 0.12s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(62,140,109,0.42)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 2px rgba(62,140,109,0.30)' }}
              >
                + Excursion for Member
              </button>
              <button
                onClick={() => { setShowFlightForm(true); setEditFlightId(null); setFlightForm(defaultFlightForm); setShowExcForm(false) }}
                style={{
                  height: 38, padding: '0 16px', borderRadius: 10, border: 'none',
                  background: 'linear-gradient(135deg, #00b3c7 0%, #008796 100%)',
                  color: '#ffffff', fontWeight: 600, fontSize: 13, fontFamily: 'var(--ui)',
                  cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,179,199,0.30)',
                  transition: 'transform 0.08s, box-shadow 0.12s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,179,199,0.42)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 2px rgba(0,179,199,0.30)' }}
              >
                + Flight for Member
              </button>
            </>
          ) : (
            <button className="btn-primary" onClick={() => { setShowTemplateForm(true); setEditTemplateId(null); setTemplateForm(defaultTemplateForm) }}>
              + Add Template
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--hair)', marginBottom: 24, gap: 0 }}>
        {(['active', 'templates', 'photos'] as const).map(t => (
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
            {t === 'active' ? `Active Trips${activeItems.length ? ` · ${activeItems.length}` : ''}` : t === 'templates' ? 'Excursion Templates' : 'Photo Library'}
          </button>
        ))}
      </div>

      {tab === 'photos' && <PhotoLibraryPanel airports={airports} />}

      <SponsoredExcursionModal
        open={showSponsoredForm}
        initial={editSponsored}
        onClose={() => setShowSponsoredForm(false)}
        onSaved={() => { load(); showToast(editSponsored ? 'Sponsored excursion updated' : 'Sponsored excursion published') }}
      />

      {/* Flight form (add / edit) */}
      {showFlightForm && (
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
              <label className="field-lab">Total Leg Cost ($){!editFlightId && FF.tripType === 'round_trip' ? ' · outbound' : ''}</label>
              <input className="input" type="number" min={0} value={FF.leg_cost} onChange={e => setFlightForm(f => ({ ...f, leg_cost: Number(e.target.value) }))} placeholder="Confirmed total with Tropic" />
              <div style={{ fontSize: 11, color: 'var(--ink-light)', marginTop: 4 }}>
                = ${perSeatOut.toLocaleString()} / seat{FF.seats_total > 0 ? ` (÷ ${FF.seats_total} seats)` : ''}
              </div>
            </div>
            {!editFlightId && FF.tripType === 'round_trip' && (
              <div className="field">
                <label className="field-lab">Total Leg Cost ($) · return</label>
                <input className="input" type="number" min={0} value={FF.return_leg_cost} onChange={e => setFlightForm(f => ({ ...f, return_leg_cost: Number(e.target.value) }))} placeholder="Confirmed total with Tropic" />
                <div style={{ fontSize: 11, color: 'var(--ink-light)', marginTop: 4 }}>
                  = ${perSeatRet.toLocaleString()} / seat{FF.seats_total > 0 ? ` (÷ ${FF.seats_total} seats)` : ''}
                </div>
              </div>
            )}
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
            <div style={{ gridColumn: '1 / -1' }}>
              <TripPhotoPicker
                value={FF.image_url}
                onChange={(url) => setFlightForm(f => ({ ...f, image_url: url }))}
                locationCode={effDest || effOrigin || null}
                label="Trip image — shown on the member card"
              />
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

      {/* Excursion form (add / edit) */}
      {showExcForm && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 14, padding: 24, marginBottom: 24 }}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: 20, margin: '0 0 20px', color: 'var(--ink)' }}>
            {editExcId ? 'Edit Excursion' : 'Add Excursion'}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>

            {/* ─── Experience (from catalog) ─── */}
            <div style={sectionLabelStyle}>Experience</div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="field-lab">Excursion template <span style={{ fontWeight: 400, color: 'var(--ink-light)' }}>(optional — leave blank for a custom Travail excursion)</span></label>
              <select className="select" value={EF.template_id} onChange={e => selectTemplate(e.target.value)}>
                <option value="">No template — custom excursion</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name} · {airportName(t.dest_code)}</option>)}
              </select>
              {templates.length === 0 && (
                <div style={{ fontSize: 11, color: 'var(--ink-light)', marginTop: 6 }}>
                  No templates yet — that&apos;s fine. Build a custom excursion here, or add reusable templates in the <strong>Excursion Templates</strong> tab.
                </div>
              )}
              {selectedTemplate && (
                <div style={{ fontSize: 11, color: 'var(--ink-light)', marginTop: 6 }}>
                  Destination: <strong>{excDestLabel}</strong>
                  {selectedTemplate.operator ? ` · ${selectedTemplate.operator}` : ''}
                </div>
              )}
            </div>

            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="field-lab">Excursion Name <span className="req">*</span></label>
              <input
                className="input"
                value={EF.name}
                onChange={e => setExcForm(f => {
                  const newName = e.target.value
                  // Auto-suggest the icon from the name unless the admin has
                  // explicitly picked one — gives instant "Lobster Mini
                  // Season" → lobster, "Tarpon Run" → fish, etc.
                  const suggested = f.iconTouched ? f.icon : (suggestIconForActivity(newName) ?? f.icon)
                  return { ...f, name: newName, nameTouched: true, icon: suggested }
                })}
                placeholder="Auto-fills from the catalog experience"
              />
              <div style={{ fontSize: 11, color: 'var(--ink-light)', marginTop: 4 }}>
                {EF.nameTouched ? 'Custom name — ' : 'Auto-filled — '}
                <button type="button" onClick={() => setExcForm(f => ({ ...f, nameTouched: false }))} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--tropic-d)', cursor: 'pointer', fontSize: 11, textDecoration: 'underline' }}>
                  {EF.nameTouched ? 'reset to auto' : 'edit to override'}
                </button>
              </div>
            </div>

            {/* ─── Logistics ─── */}
            <div style={sectionLabelStyle}>Logistics</div>
            <div className="field">
              <label className="field-lab">Departure Origin <span className="req">*</span></label>
              <select className="select" value={EF.originSel} onChange={e => setExcForm(f => ({ ...f, originSel: e.target.value }))}>
                <option value="">Select origin…</option>
                {excOriginOptions.map(a => <option key={a.code} value={a.code}>{a.name} ({a.code})</option>)}
                <option value={CUSTOM}>+ Custom landing area…</option>
              </select>
            </div>
            <div className="field">
              <label className="field-lab">Date <span className="req">*</span></label>
              <input className="input" type="date" value={EF.date} onChange={e => setExcForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="field">
              <label className="field-lab">Stay Type</label>
              <select className="select" value={EF.stay_type} onChange={e => setExcForm(f => ({ ...f, stay_type: e.target.value as Excursion['stay_type'] }))}>
                {STAY_TYPES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
            </div>

            {EF.originSel === CUSTOM && (
              <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, padding: 14, background: 'var(--warm)', borderRadius: 10 }}>
                <div style={{ gridColumn: '1 / -1', fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-light)' }}>Custom origin</div>
                <div className="field"><label className="field-lab">Code <span className="req">*</span></label><input className="input" value={EF.originCustomCode} onChange={e => setExcForm(f => ({ ...f, originCustomCode: e.target.value.toUpperCase() }))} placeholder="e.g. MYGF" maxLength={6} /></div>
                <div className="field"><label className="field-lab">Airport name <span className="req">*</span></label><input className="input" value={EF.originCustomName} onChange={e => setExcForm(f => ({ ...f, originCustomName: e.target.value }))} placeholder="e.g. Grand Cay" /></div>
                <div className="field"><label className="field-lab">Region</label><input className="input" value={EF.originCustomRegion} onChange={e => setExcForm(f => ({ ...f, originCustomRegion: e.target.value }))} placeholder="e.g. Bahamas" /></div>
              </div>
            )}

            <div className="field">
              <label className="field-lab">Aircraft (optional)</label>
              <select className="select" value={EF.aircraft_id} onChange={e => setExcForm(f => ({ ...f, aircraft_id: e.target.value }))}>
                <option value="">None</option>
                {aircraft.map(a => <option key={a.id} value={a.id}>{a.name} ({a.capacity} seats)</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-lab">
                Type (icon)
                {!EF.iconTouched && EF.name.trim() && suggestIconForActivity(EF.name) && (
                  <span style={{ fontSize: 10, color: 'var(--ink-light)', fontWeight: 400, marginLeft: 8 }}>
                    auto-derived · <button type="button" onClick={() => setExcForm(f => ({ ...f, iconTouched: true }))} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--tropic-d)', cursor: 'pointer', fontSize: 10, textDecoration: 'underline' }}>override</button>
                  </span>
                )}
              </label>
              <div className="icon-picker" role="radiogroup" aria-label="Activity icon">
                {TEMPLATE_ICONS.map(i => (
                  <button
                    key={i}
                    type="button"
                    role="radio"
                    aria-checked={EF.icon === i}
                    className={`icon-picker__tile${EF.icon === i ? ' active' : ''}`}
                    onClick={() => setExcForm(f => ({ ...f, icon: i, iconTouched: true }))}
                    title={i}
                  >
                    <span className="icon-picker__icon">{KIND_ICONS[i]}</span>
                    <span className="icon-picker__label">{i}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* ─── Day schedule ─── */}
            <div style={sectionLabelStyle}>Day Schedule</div>
            <div className="field">
              <label className="field-lab">Flight Departs (origin)</label>
              <input className="input" type="time" value={EF.depart_time} onChange={e => setExcForm(f => ({ ...f, depart_time: e.target.value }))} />
            </div>
            <div className="field">
              <label className="field-lab">Flight Arrives (dest)</label>
              <input className="input" type="time" value={EF.arrive_time} onChange={e => setExcForm(f => ({ ...f, arrive_time: e.target.value }))} />
            </div>
            <div className="field">
              <label className="field-lab">Activity Start</label>
              <input className="input" type="time" value={EF.start_time} onChange={e => setExcForm(f => ({ ...f, start_time: e.target.value }))} />
            </div>
            <div className="field">
              <label className="field-lab">Return Pickup</label>
              <input className="input" type="time" value={EF.return_time} onChange={e => setExcForm(f => ({ ...f, return_time: e.target.value }))} />
            </div>
            <div className="field" />
            <div className="field" />

            {/* ─── Capacity & pricing ─── */}
            <div style={sectionLabelStyle}>Capacity &amp; Pricing</div>
            <div className="field">
              <label className="field-lab">Spots Total <span className="req">*</span></label>
              <input className="input" type="number" min={1} value={EF.spots_total} onChange={e => setExcForm(f => ({ ...f, spots_total: Number(e.target.value) }))} />
            </div>
            <div className="field">
              <label className="field-lab">Anchor Spots</label>
              <input className="input" type="number" min={0} max={EF.spots_total} value={EF.spots_anchor} onChange={e => setExcForm(f => ({ ...f, spots_anchor: Number(e.target.value) }))} />
              <div style={{ fontSize: 11, color: 'var(--ink-light)', marginTop: 4 }}>{Math.max(0, EF.spots_total - EF.spots_anchor)} spots open to members</div>
            </div>
            <div className="field">
              <label className="field-lab">Total Cost ($)</label>
              <input className="input" type="number" min={0} value={EF.total_cost} onChange={e => setExcForm(f => ({ ...f, total_cost: Number(e.target.value) }))} placeholder="Confirmed total with operator" />
              <div style={{ fontSize: 11, color: 'var(--ink-light)', marginTop: 4 }}>
                = ${perPax.toLocaleString()} / pax{EF.spots_total > 0 ? ` (÷ ${EF.spots_total} spots)` : ''}
              </div>
            </div>

            {/* ─── Listing ─── */}
            <div style={sectionLabelStyle}>Listing</div>
            <div className="field">
              <label className="field-lab">Status</label>
              <select className="select" value={EF.status} onChange={e => setExcForm(f => ({ ...f, status: e.target.value as Excursion['status'] }))}>
                {EXCURSION_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-lab">Visibility</label>
              <select className="select" value={EF.visibility} onChange={e => setExcForm(f => ({ ...f, visibility: e.target.value as 'members' | 'public' }))}>
                <option value="members">Members Only</option>
                <option value="public">Public</option>
              </select>
            </div>
            <div className="field">
              <label className="field-lab">Anchor Member</label>
              <select className="select" value={EF.anchor_member_id} onChange={e => setExcForm(f => ({ ...f, anchor_member_id: e.target.value }))}>
                <option value="">None</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="field-lab">Pitch (tagline)</label>
              <input className="input" value={EF.pitch} onChange={e => setExcForm(f => ({ ...f, pitch: e.target.value }))} placeholder="An unforgettable escape…" />
            </div>

            {/* Sponsor line — fills this in to flag the trip as a
                Travail-sponsored special event. Gives the card a golden
                glow + ribbon on the member board, and renders the
                Field & Stream badge when the line includes them. */}
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="field-lab">
                Sponsor line <span style={{ fontWeight: 400, color: 'var(--ink-light)' }}>(optional — marks this a sponsored special event)</span>
              </label>
              <SponsorLinePicker value={EF.sponsor} onChange={(v) => setExcForm(f => ({ ...f, sponsor: v }))} />
              <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 4 }}>
                Pick a sponsor collab or choose Custom. Any line including &ldquo;Field &amp; Stream&rdquo; shows their badge on the card.
              </div>
            </div>

            {/* ─── Day plan editor ─────────────────────────────────────────── */}
            <ItineraryEditor
              steps={EF.itinerary}
              onChange={steps => setExcForm(f => ({ ...f, itinerary: steps }))}
              onGenerateDefaults={() => {
                const t = templates.find(x => x.id === EF.template_id)
                setExcForm(f => ({ ...f, itinerary: generateDefaultItinerary({
                  originCode: effExcOrigin,
                  destCode: t?.dest_code ?? null,
                  destName: t?.dest_code ? airportName(t.dest_code) : null,
                  departTime: EF.depart_time || null,
                  arriveTime: EF.arrive_time || null,
                  startTime: EF.start_time || null,
                  returnTime: EF.return_time || null,
                  operator: t?.operator ?? null,
                }) }))
              }}
            />

            <div style={{ gridColumn: '1 / -1' }}>
              <TripPhotoPicker
                value={EF.image_url}
                onChange={(url) => setExcForm(f => ({ ...f, image_url: url }))}
                locationCode={effExcOrigin || null}
                label="Trip image — shown on the member card"
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <button className="btn-primary" onClick={saveExc} disabled={saving}>
              {saving ? 'Saving…' : 'Save Excursion'}
            </button>
            <button className="btn-ghost" onClick={() => { setShowExcForm(false); setEditExcId(null) }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Template form */}
      {tab === 'templates' && showTemplateForm && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 14, padding: 24, marginBottom: 24 }}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: 20, margin: '0 0 20px', color: 'var(--ink)' }}>
            {editTemplateId ? 'Edit Template' : 'New Excursion Template'}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="field-lab">Template Name <span className="req">*</span></label>
              <input className="input" value={TF.name} onChange={e => setTemplateForm(f => {
                const newName = e.target.value
                const suggested = f.iconTouched ? f.icon : (suggestIconForActivity(newName) ?? f.icon)
                return { ...f, name: newName, icon: suggested }
              })} placeholder="e.g. Lobster Mini Season" />
            </div>
            <div className="field">
              <label className="field-lab">Destination <span className="req">*</span></label>
              <select className="select" value={TF.destSel} onChange={e => setTemplateForm(f => ({ ...f, destSel: e.target.value }))}>
                <option value="">Select destination…</option>
                {tplDestOptions.map(a => <option key={a.code} value={a.code}>{a.name} ({a.code})</option>)}
                <option value={CUSTOM}>+ Custom landing area…</option>
              </select>
            </div>
            <div className="field">
              <label className="field-lab">Operator</label>
              <input className="input" value={TF.operator} onChange={e => setTemplateForm(f => ({ ...f, operator: e.target.value }))} placeholder="e.g. Bud N' Mary's × Field & Stream" />
            </div>
            <div className="field">
              <label className="field-lab">
                Icon
                {!TF.iconTouched && TF.name.trim() && suggestIconForActivity(TF.name) && (
                  <span style={{ fontSize: 10, color: 'var(--ink-light)', fontWeight: 400, marginLeft: 8 }}>
                    auto-derived · <button type="button" onClick={() => setTemplateForm(f => ({ ...f, iconTouched: true }))} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--tropic-d)', cursor: 'pointer', fontSize: 10, textDecoration: 'underline' }}>override</button>
                  </span>
                )}
              </label>
              <div className="icon-picker" role="radiogroup" aria-label="Activity icon">
                {TEMPLATE_ICONS.map(i => (
                  <button
                    key={i}
                    type="button"
                    role="radio"
                    aria-checked={TF.icon === i}
                    className={`icon-picker__tile${TF.icon === i ? ' active' : ''}`}
                    onClick={() => setTemplateForm(f => ({ ...f, icon: i, iconTouched: true }))}
                    title={i}
                  >
                    <span className="icon-picker__icon">{KIND_ICONS[i]}</span>
                    <span className="icon-picker__label">{i}</span>
                  </button>
                ))}
              </div>
            </div>

            {TF.destSel === CUSTOM && (
              <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, padding: 14, background: 'var(--warm)', borderRadius: 10 }}>
                <div style={{ gridColumn: '1 / -1', fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-light)' }}>Custom destination</div>
                <div className="field"><label className="field-lab">Code <span className="req">*</span></label><input className="input" value={TF.destCustomCode} onChange={e => setTemplateForm(f => ({ ...f, destCustomCode: e.target.value.toUpperCase() }))} placeholder="e.g. MYGF" maxLength={6} /></div>
                <div className="field"><label className="field-lab">Airport name <span className="req">*</span></label><input className="input" value={TF.destCustomName} onChange={e => setTemplateForm(f => ({ ...f, destCustomName: e.target.value }))} placeholder="e.g. Grand Cay" /></div>
                <div className="field"><label className="field-lab">Region</label><input className="input" value={TF.destCustomRegion} onChange={e => setTemplateForm(f => ({ ...f, destCustomRegion: e.target.value }))} placeholder="e.g. Bahamas" /></div>
              </div>
            )}

            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="field-lab">Description <span style={{ fontWeight: 400, color: 'var(--ink-light)' }}>— the trip &amp; conservation story</span></label>
              <textarea className="input" rows={3} value={TF.description} onChange={e => setTemplateForm(f => ({ ...f, description: e.target.value }))} placeholder="What the fishing's like and the conservation angle…" />
              <div style={{ fontSize: 11, color: 'var(--ink-light)', marginTop: 4 }}>Prefills the trip pitch when scheduling this excursion.</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <button className="btn-primary" onClick={saveTemplate} disabled={saving}>
              {saving ? 'Saving…' : 'Save Template'}
            </button>
            <button className="btn-ghost" onClick={() => { setShowTemplateForm(false); setEditTemplateId(null) }}>Cancel</button>
          </div>
        </div>
      )}

      {tab === 'photos' ? null : loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--ink-light)', fontSize: 14 }}>Loading…</div>
      ) : tab === 'active' ? (
        <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 12, overflow: 'hidden' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Trip</th>
                <th>Date</th>
                <th>Open</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {activeItems.map(it => (
                <tr key={`${it.kind}-${it.key}`} style={{ cursor: 'pointer' }} onClick={it.onEdit}>
                  <td><span className={`pill ${it.kind === 'flight' ? 'tropic' : 'sun'}`}>{it.kind}</span></td>
                  <td>
                    <div style={{ fontWeight: 500, color: 'var(--ink)' }}>{it.name}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink-light)' }}>{it.label}</div>
                  </td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{it.date}</td>
                  <td style={{ fontWeight: 600 }}>{it.avail}/{it.total}</td>
                  <td><span className={`pill ${statusColor[it.status]}`}>{it.status}</span></td>
                  <td onClick={e => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn-ghost" style={{ height: 28, padding: '0 10px', fontSize: 12 }} onClick={it.onEdit}>Edit</button>
                    {(() => {
                      // Manual settle override. The cron auto-settles at
                      // trip departure; this button is Ops's escape hatch
                      // (or test path) to settle on demand, regardless of
                      // date or status. Gated only on "trip was captured"
                      // and "not already settled" — the human clicking
                      // the button has the context to make that call.
                      if (!it.anchorPi) return null
                      if (it.settledAt) {
                        return (
                          <span
                            title={`Settled ${new Date(it.settledAt).toLocaleString()}`}
                            style={{ marginLeft: 6, padding: '0 10px', height: 28, display: 'inline-flex', alignItems: 'center', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--moss)', background: 'rgba(62,140,109,0.10)', border: '1px solid rgba(62,140,109,0.30)', borderRadius: 9, fontWeight: 700 }}
                          >
                            Settled ✓
                          </span>
                        )
                      }
                      // Visual differentiation: trips already past use
                      // the prominent sun CTA; trips still upcoming use
                      // a quieter ghost so Ops sees at a glance which
                      // settlements are normal vs early-override.
                      const todayIso = new Date().toISOString().slice(0, 10)
                      const isPast = it.date <= todayIso || it.status === 'departed' || it.status === 'completed'
                      return (
                        <button
                          className={isPast ? 'btn-sun' : 'btn-ghost'}
                          style={{
                            height: 28, padding: '0 12px', fontSize: 12, marginLeft: 6,
                            ...(isPast ? {} : { color: 'var(--signal)', borderColor: 'rgba(217,78,42,0.35)' }),
                          }}
                          disabled={settling === it.key}
                          onClick={() => settleTrip(it.kind, it.key, it.name)}
                          title={isPast
                            ? 'Refund the anchor for whatever the pax pool covered + send the settlement email'
                            : 'Force-settle this trip BEFORE its departure date. Refunds + emails fire immediately.'}
                        >
                          {settling === it.key ? '…' : (isPast ? 'Settle now →' : 'Force settle')}
                        </button>
                      )
                    })()}
                    <button
                      className="btn-ghost"
                      style={{ height: 28, padding: '0 10px', fontSize: 12, marginLeft: 6, color: 'var(--signal)', borderColor: 'rgba(217,78,42,0.3)' }}
                      disabled={cancelling === it.key}
                      onClick={() => cancelTrip(it.kind, it.key, it.name)}
                    >
                      {cancelling === it.key ? '…' : 'Cancel'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {activeItems.length === 0 && (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--ink-light)', fontSize: 13 }}>
              No active trips — nothing is showing on the members’ Open Seats board right now.
            </div>
          )}
        </div>
      ) : (
        <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 12, overflow: 'hidden' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Destination</th>
                <th>Operator</th>
                <th>Icon</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {templates.map(t => (
                <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => openEditTemplate(t)}>
                  <td style={{ fontWeight: 500, color: 'var(--ink)' }}>{t.name}</td>
                  <td style={{ fontSize: 13 }}>{airportName(t.dest_code)}</td>
                  <td style={{ fontSize: 12, color: 'var(--ink-light)' }}>{t.operator || '—'}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink-light)' }}>{t.icon}</td>
                  <td onClick={e => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn-ghost" style={{ height: 28, padding: '0 10px', fontSize: 12 }} onClick={() => openEditTemplate(t)}>Edit</button>
                    <button className="btn-ghost" style={{ height: 28, padding: '0 10px', fontSize: 12, marginLeft: 6, color: 'var(--signal)' }} onClick={() => deleteTemplate(t.id, t.name)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {templates.length === 0 && (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--ink-light)', fontSize: 13 }}>No templates yet — create one to start building excursions.</div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Itinerary editor ───────────────────────────────────────────────────────
//
// Ops authors the day-plan that the member sees on the reserve page.
// Each step has time / label / sub / icon. The "Generate from times"
// button seeds a 5-step default plan from the form's existing time
// fields (departTime, arriveTime, startTime, returnTime). After
// generation Ops can edit any field, add a step, or reorder.

const ITINERARY_ICONS = ['flight', 'sun', 'fish', 'golf', 'sail', 'snorkel', 'wave', 'surfboard', 'rifle', 'quail', 'hog', 'antlers', 'croc', 'lobster', 'bow']

export function ItineraryEditor({
  steps,
  onChange,
  onGenerateDefaults,
}: {
  steps: ItineraryStep[]
  onChange: (next: ItineraryStep[]) => void
  onGenerateDefaults: () => void
}) {
  function updateStep(i: number, patch: Partial<ItineraryStep>) {
    onChange(steps.map((s, idx) => idx === i ? { ...s, ...patch } : s))
  }
  function removeStep(i: number) {
    onChange(steps.filter((_, idx) => idx !== i))
  }
  function moveStep(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= steps.length) return
    const next = steps.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  function addStep() {
    onChange([...steps, { time: null, label: '', sub: null, icon: 'flight' }])
  }

  return (
    <div className="field" style={{ gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <label className="field-lab" style={{ margin: 0 }}>
          Day plan <span style={{ fontWeight: 400, color: 'var(--ink-light)' }}>— what the member sees on the reserve page</span>
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn-ghost" style={{ height: 28, padding: '0 12px', fontSize: 11.5 }} onClick={onGenerateDefaults}>
            Generate from times
          </button>
          <button type="button" className="btn-ghost" style={{ height: 28, padding: '0 12px', fontSize: 11.5 }} onClick={addStep}>
            + Step
          </button>
        </div>
      </div>

      {steps.length === 0 ? (
        <div style={{ background: 'var(--paper)', border: '1px dashed var(--hair-2)', borderRadius: 10, padding: '16px 18px', fontSize: 12.5, color: 'var(--ink-light)' }}>
          No itinerary yet. Members will see the auto-generated default until you author one — click <strong>Generate from times</strong> to seed it from the day fields above, then customize.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {steps.map((s, i) => (
            <div key={i} style={{ background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 10, padding: '12px 14px', display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10, alignItems: 'start' }}>
              {/* Reorder + delete column */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button type="button" className="btn-ghost" style={{ height: 24, width: 24, padding: 0, fontSize: 12 }} onClick={() => moveStep(i, -1)} disabled={i === 0} title="Move up">↑</button>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-light)', textAlign: 'center', fontWeight: 700 }}>{i + 1}</span>
                <button type="button" className="btn-ghost" style={{ height: 24, width: 24, padding: 0, fontSize: 12 }} onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} title="Move down">↓</button>
              </div>

              {/* Fields */}
              <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 1fr', gap: 8 }}>
                <input
                  className="input"
                  value={s.time ?? ''}
                  onChange={e => updateStep(i, { time: e.target.value || null })}
                  placeholder="9:00 AM or TBD"
                  style={{ fontFamily: 'var(--mono)', fontSize: 12, height: 32 }}
                />
                <input
                  className="input"
                  value={s.label ?? ''}
                  onChange={e => updateStep(i, { label: e.target.value })}
                  placeholder="Take off at KTPF"
                  style={{ fontSize: 13, height: 32 }}
                />
                <input
                  className="input"
                  value={s.sub ?? ''}
                  onChange={e => updateStep(i, { sub: e.target.value || null })}
                  placeholder="Sub (optional) — operator, location…"
                  style={{ fontSize: 12, height: 32, color: 'var(--ink-mid)' }}
                />

                {/* Icon row — horizontal scrollable strip */}
                <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-light)', fontWeight: 600, marginRight: 4 }}>Icon</span>
                  {ITINERARY_ICONS.map(iconKey => (
                    <button
                      key={iconKey}
                      type="button"
                      onClick={() => updateStep(i, { icon: iconKey })}
                      className={s.icon === iconKey ? 'icon-pip active' : 'icon-pip'}
                      title={iconKey}
                      style={{
                        width: 28, height: 28, padding: 0,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: 6,
                        border: s.icon === iconKey ? '1.5px solid var(--tropic)' : '1px solid var(--hair)',
                        background: s.icon === iconKey ? 'var(--tropic-glow)' : '#fff',
                        color: s.icon === iconKey ? 'var(--tropic-d)' : 'var(--ink-mid)',
                        cursor: 'pointer',
                      }}
                    >
                      {KIND_ICONS[iconKey]}
                    </button>
                  ))}
                </div>
              </div>

              <button type="button" className="btn-ghost" onClick={() => removeStep(i)} style={{ height: 28, width: 28, padding: 0, color: 'var(--signal)', fontSize: 14 }} title="Remove step">×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
