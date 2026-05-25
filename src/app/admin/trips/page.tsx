'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { returnLegIds } from '@/lib/data'
import { logActivity } from '@/lib/activity'
import type { Flight, Excursion, Aircraft, Member, Airport, ExcursionTemplate, Booking } from '@/lib/supabase/types'

type FlightRow = Flight
type ExcursionRow = Excursion

// Read an image File, scale it down to maxW, and return a JPEG data URL. Keeps
// stored images small enough to live inline on the trip row.
function downscaleToDataUrl(file: File, maxW: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the file'))
    reader.onload = () => {
      const img = new window.Image()
      img.onerror = () => reject(new Error('That file is not a valid image'))
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width)
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('Canvas not available')); return }
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

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
  visibility: 'members' | 'public'
  spots_total: number
  spots_anchor: number
  total_cost: number
  status: Excursion['status']
  anchor_member_id: string
  image_url: string
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
  stay_type: 'day_trip', pitch: '', icon: 'fish', visibility: 'members',
  spots_total: 8, spots_anchor: 0, total_cost: 0, status: 'draft',
  anchor_member_id: '', image_url: '',
}

const TEMPLATE_ICONS = ['fish', 'sail', 'wave', 'snorkel', 'golf', 'quail', 'hog', 'sun', 'compass', 'flight'] as const

type TemplateForm = {
  name: string
  destSel: string
  destCustomCode: string
  destCustomName: string
  destCustomRegion: string
  operator: string
  price_per_pax: number
  icon: string
  description: string
}
const defaultTemplateForm: TemplateForm = {
  name: '', destSel: '', destCustomCode: '', destCustomName: '', destCustomRegion: '',
  operator: '', price_per_pax: 0, icon: 'fish', description: '',
}

const sectionLabelStyle: React.CSSProperties = {
  gridColumn: '1 / -1', fontFamily: 'var(--mono)', fontSize: 10,
  letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-light)',
  marginTop: 6, marginBottom: -4,
}

export default function TripsPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<'active' | 'templates'>('active')
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
  const [saving, setSaving] = useState(false)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [uploadingImg, setUploadingImg] = useState<'flight' | 'excursion' | null>(null)
  const [toast, setToast] = useState<{ msg: string; kind: 'success' | 'error' | 'info' } | null>(null)

  const showToast = (msg: string, kind: 'success' | 'error' | 'info' = 'success') => {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 3500)
  }

  // Read a desktop image, downscale it, and store it inline on the form as a
  // data URL — no storage bucket / RLS involved, so it just works from desktop.
  async function uploadTripImage(kind: 'flight' | 'excursion', file: File) {
    setUploadingImg(kind)
    try {
      const dataUrl = await downscaleToDataUrl(file, 1000, 0.78)
      if (kind === 'flight') setFlightForm(f => ({ ...f, image_url: dataUrl }))
      else setExcForm(f => ({ ...f, image_url: dataUrl }))
      showToast('Image added')
    } catch (e: unknown) {
      showToast((e as Error).message ?? 'Could not read image', 'error')
    } finally { setUploadingImg(null) }
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
  // round trips collapsed to the outbound leg. Cancelled/draft/past are excluded.
  type ActiveItem = { key: string; kind: 'flight' | 'excursion'; name: string; label: string; date: string; avail: number; total: number; status: string; onEdit: () => void }
  const activeFlightList = flights.filter(f => f.status === 'open' || f.status === 'full')
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
        onEdit: () => openEditFlight(f),
      }
    })
  const excItems: ActiveItem[] = excursions
    .filter(e => e.status === 'open' || e.status === 'full')
    .map(e => ({
      key: e.id, kind: 'excursion', name: e.name, date: e.date, label: e.origin_code,
      avail: Math.max(0, e.spots_total - e.spots_anchor - (e.spots_taken ?? 0)),
      total: e.spots_total - e.spots_anchor, status: e.status,
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
      spots_total: e.spots_total, spots_anchor: e.spots_anchor,
      total_cost: e.price_per_pax * e.spots_total, status: e.status,
      anchor_member_id: e.anchor_member_id ?? '',
      image_url: e.image_url ?? '',
    })
    setShowFlightForm(false)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function excError(): string | null {
    if (!EF.template_id) return 'Choose an excursion from the catalog'
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
        visibility: EF.visibility, spots_total: EF.spots_total,
        spots_anchor: EF.spots_anchor, price_per_pax: perPax,
        status: EF.status, anchor_member_id: EF.anchor_member_id || null,
        image_url: EF.image_url || null,
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
    if (!confirm(`Cancel "${name}"? It will be removed from Open Seats, all reservations on it cancelled, and those members notified.`)) return
    setCancelling(id)
    try {
      const ids = kind === 'flight' && flights.some(f => f.id === `${id}R`) ? [id, `${id}R`] : [id]
      const table = kind === 'flight' ? 'flights' : 'excursions'
      const { error } = await supabase.from(table).update({ status: 'cancelled' }).in('id', ids)
      if (error) throw error

      const { data: bks } = await supabase
        .from('bookings').select('*')
        .eq('item_kind', kind).in('item_id', ids).in('status', ['pending', 'approved'])
      const affected = (bks ?? []) as unknown as Booking[]
      if (affected.length) {
        await supabase.from('bookings')
          .update({ status: 'cancelled', decided_at: new Date().toISOString() })
          .in('id', affected.map(b => b.id))
        for (const mid of [...new Set(affected.map(b => b.member_id))]) {
          try {
            await supabase.from('notifications').insert({
              member_id: mid, kind: 'booking', title: 'Trip Cancelled',
              body: `"${name}" has been cancelled by Ops. Any charges will be handled by the team.`,
              ref: { item_kind: kind, item_id: id },
            } as never)
          } catch { /* notification is supplementary */ }
        }
      }

      // Retire the originating anchor submission so it leaves the host's
      // "active anchors" list, and let them know.
      const { data: subs } = await supabase
        .from('anchor_submissions').select('id, member_id')
        .in('published_item_id', ids).neq('status', 'cancelled')
      const anchors = (subs ?? []) as { id: string; member_id: string }[]
      if (anchors.length) {
        await supabase.from('anchor_submissions')
          .update({ status: 'cancelled' }).in('id', anchors.map(a => a.id))
        for (const mid of [...new Set(anchors.map(a => a.member_id))]) {
          try {
            await supabase.from('notifications').insert({
              member_id: mid, kind: 'anchor', title: 'Anchor cancelled',
              body: `Your anchored trip "${name}" has been cancelled by Ops.`,
              ref: { item_kind: kind, item_id: id },
            } as never)
          } catch { /* notification is supplementary */ }
        }
      }

      logActivity({
        action: 'trip_cancelled', actor_kind: 'admin', item_kind: kind, item_id: id,
        summary: `Cancelled ${kind} "${name}"${affected.length ? ` and ${affected.length} reservation(s)` : ''}`,
        meta: { reservations_cancelled: affected.length },
      })
      showToast(affected.length ? `Trip cancelled — ${affected.length} reservation(s) voided` : 'Trip cancelled')
      load()
    } catch (e: unknown) {
      showToast((e as Error).message ?? 'Cancel failed', 'error')
    } finally { setCancelling(null) }
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
            {tab === 'active' ? 'Live trips on the members’ Open Seats board. Cancelled trips drop off automatically.' : 'Manage all flights and excursions, including drafts and past trips.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {tab === 'active' ? (
            <>
              <button className="btn-ghost" onClick={() => { setShowExcForm(true); setEditExcId(null); setExcForm(defaultExcForm); setShowFlightForm(false) }}>
                + Excursion
              </button>
              <button className="btn-primary" onClick={() => { setShowFlightForm(true); setEditFlightId(null); setFlightForm(defaultFlightForm); setShowExcForm(false) }}>
                + Flight
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
        {(['active', 'templates'] as const).map(t => (
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
            {t === 'active' ? `Active Trips${activeItems.length ? ` · ${activeItems.length}` : ''}` : 'Excursion Templates'}
          </button>
        ))}
      </div>

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
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="field-lab">Trip image <span style={{ fontWeight: 400, color: 'var(--ink-light)' }}>— shown on the member card (defaults to the house image)</span></label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <img src={FF.image_url || '/trip-default.jpeg'} alt="" style={{ width: 120, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--hair)' }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <label className="btn-ghost" style={{ height: 32, padding: '0 14px', fontSize: 12.5, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                    {uploadingImg === 'flight' ? 'Uploading…' : 'Upload image'}
                    <input type="file" accept="image/*" style={{ display: 'none' }} disabled={uploadingImg === 'flight'} onChange={e => { const f = e.target.files?.[0]; if (f) uploadTripImage('flight', f) }} />
                  </label>
                  {FF.image_url && (
                    <button className="btn-ghost" style={{ height: 32, padding: '0 14px', fontSize: 12.5, color: 'var(--signal)' }} onClick={() => setFlightForm(f => ({ ...f, image_url: '' }))}>Use default</button>
                  )}
                </div>
              </div>
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
              <label className="field-lab">Excursion <span className="req">*</span></label>
              <select className="select" value={EF.template_id} onChange={e => selectTemplate(e.target.value)}>
                <option value="">Select a template…</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name} · {airportName(t.dest_code)}</option>)}
              </select>
              {templates.length === 0 && (
                <div style={{ fontSize: 11, color: 'var(--signal)', marginTop: 6 }}>
                  No templates yet — create one in the <strong>Excursion Templates</strong> tab first.
                </div>
              )}
              {selectedTemplate && (
                <div style={{ fontSize: 11, color: 'var(--ink-light)', marginTop: 6 }}>
                  Destination: <strong>{excDestLabel}</strong>
                  {selectedTemplate.operator ? ` · ${selectedTemplate.operator}` : ''}
                  {' · '}catalog ${selectedTemplate.price_per_pax.toLocaleString()}/pax
                </div>
              )}
            </div>

            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="field-lab">Excursion Name <span className="req">*</span></label>
              <input
                className="input"
                value={EF.name}
                onChange={e => setExcForm(f => ({ ...f, name: e.target.value, nameTouched: true }))}
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
              <label className="field-lab">Type (icon)</label>
              <select className="select" value={EF.icon} onChange={e => setExcForm(f => ({ ...f, icon: e.target.value }))}>
                {TEMPLATE_ICONS.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
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
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="field-lab">Trip image <span style={{ fontWeight: 400, color: 'var(--ink-light)' }}>— shown on the member card (defaults to the house image)</span></label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <img src={EF.image_url || '/trip-default.jpeg'} alt="" style={{ width: 120, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--hair)' }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <label className="btn-ghost" style={{ height: 32, padding: '0 14px', fontSize: 12.5, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                    {uploadingImg === 'excursion' ? 'Uploading…' : 'Upload image'}
                    <input type="file" accept="image/*" style={{ display: 'none' }} disabled={uploadingImg === 'excursion'} onChange={e => { const f = e.target.files?.[0]; if (f) uploadTripImage('excursion', f) }} />
                  </label>
                  {EF.image_url && (
                    <button className="btn-ghost" style={{ height: 32, padding: '0 14px', fontSize: 12.5, color: 'var(--signal)' }} onClick={() => setExcForm(f => ({ ...f, image_url: '' }))}>Use default</button>
                  )}
                </div>
              </div>
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
              <input className="input" value={TF.name} onChange={e => setTemplateForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Lobster Mini Season" />
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
              <label className="field-lab">Icon</label>
              <select className="select" value={TF.icon} onChange={e => setTemplateForm(f => ({ ...f, icon: e.target.value }))}>
                {TEMPLATE_ICONS.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>

            {TF.destSel === CUSTOM && (
              <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, padding: 14, background: 'var(--warm)', borderRadius: 10 }}>
                <div style={{ gridColumn: '1 / -1', fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-light)' }}>Custom destination</div>
                <div className="field"><label className="field-lab">Code <span className="req">*</span></label><input className="input" value={TF.destCustomCode} onChange={e => setTemplateForm(f => ({ ...f, destCustomCode: e.target.value.toUpperCase() }))} placeholder="e.g. MYGF" maxLength={6} /></div>
                <div className="field"><label className="field-lab">Airport name <span className="req">*</span></label><input className="input" value={TF.destCustomName} onChange={e => setTemplateForm(f => ({ ...f, destCustomName: e.target.value }))} placeholder="e.g. Grand Cay" /></div>
                <div className="field"><label className="field-lab">Region</label><input className="input" value={TF.destCustomRegion} onChange={e => setTemplateForm(f => ({ ...f, destCustomRegion: e.target.value }))} placeholder="e.g. Bahamas" /></div>
              </div>
            )}

            <div className="field">
              <label className="field-lab">Base Price Per Pax ($)</label>
              <input className="input" type="number" min={0} value={TF.price_per_pax} onChange={e => setTemplateForm(f => ({ ...f, price_per_pax: Number(e.target.value) }))} />
              <div style={{ fontSize: 11, color: 'var(--ink-light)', marginTop: 4 }}>Default cost when scheduling — adjustable per trip.</div>
            </div>
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

      {loading ? (
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
                <th>Base Price</th>
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
                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>${t.price_per_pax.toLocaleString()}</td>
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
