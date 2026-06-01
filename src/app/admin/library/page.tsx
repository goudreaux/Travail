'use client'
export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useState } from 'react'
import nextDynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { fetchLocations, type LibraryLocation } from '@/lib/locations'

// Mapbox touches window — load the coordinate picker browser-only.
const LocationPicker = nextDynamic(() => import('@/components/LocationPicker'), { ssr: false })
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

// Location Library — the single source of truth for origins and destinations.
// Every From/To picker in the app and the Route Map read from this table
// (airports). Concierge can add a location, set its coordinates, and choose
// whether it's an origin, a destination, or both. RLS lets admins manage rows.

type Role = 'origin' | 'destination' | 'both'

interface Draft {
  code: string
  name: string
  sub: string
  role: Role
  lat: string
  lng: string
  active: boolean
}

const EMPTY_DRAFT: Draft = { code: '', name: '', sub: '', role: 'destination', lat: '', lng: '', active: true }

const ROLE_LABEL: Record<Role, string> = { origin: 'Origin', destination: 'Destination', both: 'Origin + Destination' }
const ROLE_PILL: Record<Role, string> = { origin: 'tropic', destination: 'sun', both: 'moss' }

export default function AdminLibraryPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<LibraryLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [search, setSearch] = useState('')
  // Inline edit + add state.
  const [editCode, setEditCode] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [adding, setAdding] = useState(false)
  const [newDraft, setNewDraft] = useState<Draft>(EMPTY_DRAFT)

  function flash(msg: string, ok = true) {
    setToast({ msg, ok }); setTimeout(() => setToast(null), 3200)
  }

  const load = useCallback(async () => {
    setLoading(true)
    const locs = await fetchLocations(supabase, { includeInactive: true })
    setRows(locs)
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  function startEdit(r: LibraryLocation) {
    setEditCode(r.code)
    setDraft({
      code: r.code, name: r.name, sub: r.sub ?? '', role: r.role,
      lat: r.lat != null ? String(r.lat) : '', lng: r.lng != null ? String(r.lng) : '',
      active: r.active !== false,
    })
  }

  function parseCoord(v: string): number | null {
    const n = Number(v.trim())
    return v.trim() === '' || Number.isNaN(n) ? null : n
  }

  function validate(d: Draft, isNew: boolean): string | null {
    if (!d.code.trim()) return 'Code is required.'
    if (!d.name.trim()) return 'Name is required.'
    if (isNew && rows.some(r => r.code.toUpperCase() === d.code.trim().toUpperCase())) return 'That code already exists.'
    const lat = parseCoord(d.lat), lng = parseCoord(d.lng)
    if ((lat == null) !== (lng == null)) return 'Set both latitude and longitude (or leave both blank).'
    if (lat != null && (lat < -90 || lat > 90)) return 'Latitude must be between -90 and 90.'
    if (lng != null && (lng < -180 || lng > 180)) return 'Longitude must be between -180 and 180.'
    return null
  }

  async function saveEdit() {
    const err = validate(draft, false)
    if (err) { flash(err, false); return }
    setBusy(draft.code)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('airports') as any).update({
        name: draft.name.trim(),
        sub: draft.sub.trim() || null,
        role: draft.role,
        lat: parseCoord(draft.lat),
        lng: parseCoord(draft.lng),
        active: draft.active,
      }).eq('code', draft.code)
      if (error) throw error
      flash('Saved.'); setEditCode(null); load()
    } catch (e) { flash(e instanceof Error ? e.message : 'Save failed', false) }
    finally { setBusy(null) }
  }

  async function saveNew() {
    const err = validate(newDraft, true)
    if (err) { flash(err, false); return }
    setBusy('__new__')
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('airports') as any).insert({
        code: newDraft.code.trim().toUpperCase(),
        name: newDraft.name.trim(),
        sub: newDraft.sub.trim() || null,
        role: newDraft.role,
        lat: parseCoord(newDraft.lat),
        lng: parseCoord(newDraft.lng),
        active: newDraft.active,
      })
      if (error) throw error
      flash('Location added.'); setAdding(false); setNewDraft(EMPTY_DRAFT); load()
    } catch (e) { flash(e instanceof Error ? e.message : 'Add failed', false) }
    finally { setBusy(null) }
  }

  async function remove(r: LibraryLocation) {
    if (!confirm(`Delete "${r.name}" (${r.code})? If any trip references it this will be blocked — deactivate it instead to hide it from new pickers.`)) return
    setBusy(r.code)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('airports') as any).delete().eq('code', r.code)
      if (error) throw new Error(/foreign key|violates/i.test(error.message) ? 'In use by a trip — deactivate it instead of deleting.' : error.message)
      flash('Deleted.'); load()
    } catch (e) { flash(e instanceof Error ? e.message : 'Delete failed', false) }
    finally { setBusy(null) }
  }

  const q = search.trim().toLowerCase()
  const visible = rows.filter(r => !q || r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) || (r.sub ?? '').toLowerCase().includes(q))

  return (
    <div className="admin-page">
      {toast && (
        <div style={{ position: 'fixed', top: 16, right: 16, background: toast.ok ? 'var(--moss)' : 'var(--signal)', color: '#fff', padding: '10px 16px', borderRadius: 10, zIndex: 100, fontSize: 13, fontWeight: 600 }}>
          {toast.msg}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 30, fontWeight: 500, color: 'var(--ink)', margin: 0 }}>Library</h1>
          <p style={{ fontSize: 13, color: 'var(--ink-light)', marginTop: 4, marginBottom: 0, maxWidth: 620 }}>
            Every origin and destination lives here — name, code, type, and coordinates. Trip forms pick from this list and the Route Map plots routes from these coordinates. A location needs coordinates to appear on the map.
          </p>
        </div>
        {!adding && (
          <button className="btn-primary" onClick={() => { setAdding(true); setNewDraft(EMPTY_DRAFT) }} style={{ flexShrink: 0 }}>
            + Add location
          </button>
        )}
      </div>

      {adding && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--tropic)', borderRadius: 12, padding: '16px 18px', marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--tropic-d)', fontWeight: 700, marginBottom: 12 }}>New location</div>
          <LocationFields draft={newDraft} setDraft={setNewDraft} isNew />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn-primary" disabled={busy === '__new__'} onClick={saveNew}>{busy === '__new__' ? 'Adding…' : 'Add location'}</button>
            <button className="btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <input className="input" placeholder="Search by name or code…" value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 320 }} />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--ink-light)' }}>Loading…</div>
      ) : visible.length === 0 ? (
        <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 12, padding: 32, textAlign: 'center', color: 'var(--ink-light)', fontSize: 13 }}>
          No locations{q ? ' match your search' : ' yet'}.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visible.map(r => editCode === r.code ? (
            <div key={r.code} style={{ background: 'var(--card)', border: '1px solid var(--tropic)', borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--tropic-d)', fontWeight: 700, marginBottom: 12 }}>Editing {r.code}</div>
              <LocationFields draft={draft} setDraft={setDraft} isNew={false} />
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn-primary" disabled={busy === r.code} onClick={saveEdit}>{busy === r.code ? 'Saving…' : 'Save'}</button>
                <button className="btn-ghost" onClick={() => setEditCode(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div key={r.code} style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, opacity: r.active === false ? 0.55 : 1 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>{r.name}</span>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--ink-light)', fontWeight: 600 }}>{r.code}</span>
                  <span className={`pill ${ROLE_PILL[r.role]}`} style={{ fontSize: 9.5 }}>{ROLE_LABEL[r.role]}</span>
                  {r.active === false && <span className="pill" style={{ fontSize: 9.5, background: 'var(--hair-2)', color: 'var(--ink-light)' }}>Inactive</span>}
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-light)' }}>
                  {r.sub ? `${r.sub} · ` : ''}
                  {r.lat != null && r.lng != null
                    ? `${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}`
                    : <span style={{ color: 'var(--signal)' }}>no coordinates — won&rsquo;t map</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => startEdit(r)}>Edit</button>
                <button className="btn-ghost" style={{ fontSize: 12, color: 'var(--signal)' }} disabled={busy === r.code} onClick={() => remove(r)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LocationFields({ draft, setDraft, isNew }: { draft: Draft; setDraft: (d: Draft) => void; isNew: boolean }) {
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft({ ...draft, [k]: v })
  const [showMap, setShowMap] = useState(false)
  const latNum = draft.lat.trim() === '' || Number.isNaN(Number(draft.lat)) ? null : Number(draft.lat)
  const lngNum = draft.lng.trim() === '' || Number.isNaN(Number(draft.lng)) ? null : Number(draft.lng)
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div className="field" style={{ margin: 0 }}>
          <label className="field-lab">Code</label>
          <input className="input" value={draft.code} disabled={!isNew} onChange={e => set('code', e.target.value.toUpperCase())} placeholder="LPI" />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label className="field-lab">Name</label>
          <input className="input" value={draft.name} onChange={e => set('name', e.target.value)} placeholder="Little Palm Island" />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label className="field-lab">Sub-label</label>
          <input className="input" value={draft.sub} onChange={e => set('sub', e.target.value)} placeholder="FL Keys" />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
        <div className="field" style={{ margin: 0 }}>
          <label className="field-lab">Type</label>
          <select className="input" value={draft.role} onChange={e => set('role', e.target.value as Role)}>
            <option value="origin">Origin</option>
            <option value="destination">Destination</option>
            <option value="both">Origin + Destination</option>
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label className="field-lab">Latitude</label>
          <input className="input" value={draft.lat} onChange={e => set('lat', e.target.value)} placeholder="24.6166" />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label className="field-lab">Longitude</label>
          <input className="input" value={draft.lng} onChange={e => set('lng', e.target.value)} placeholder="-81.4015" />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink-soft)', paddingBottom: 9, whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={draft.active} onChange={e => set('active', e.target.checked)} /> Active
        </label>
      </div>
      {MAPBOX_TOKEN && (
        <div style={{ marginTop: 10 }}>
          <button type="button" className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setShowMap(s => !s)}>
            {showMap ? 'Hide map' : (latNum != null ? 'Adjust on map' : 'Pick on map')}
          </button>
          {showMap && (
            <div style={{ marginTop: 8 }}>
              <LocationPicker
                token={MAPBOX_TOKEN}
                lat={latNum}
                lng={lngNum}
                onPick={(la, ln) => setDraft({ ...draft, lat: la.toFixed(5), lng: ln.toFixed(5) })}
              />
            </div>
          )}
        </div>
      )}
    </>
  )
}
