'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { uploadTripPhoto, saveToLibrary, loadLibrary, deleteFromLibrary } from '@/lib/trip-photos'

// Photo Library manager — the "Photo Library" tab on /admin/trips.
//
// Ops uploads + tags photos here once; the TripPhotoPicker on every
// trip form then surfaces them (filtered to the relevant location) so
// building a trip is pick-don't-upload. Photos are keyed to an airport
// code + free-form tags for filtering.

export function PhotoLibraryPanel({ airports }) {
  const supabase = createClient()
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterLoc, setFilterLoc] = useState('')
  const [meId, setMeId] = useState(null)

  // Upload form state
  const [pendingUrl, setPendingUrl] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [label, setLabel] = useState('')
  const [loc, setLoc] = useState('')
  const [tags, setTags] = useState('')
  const [toast, setToast] = useState(null)

  const flash = (msg, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000) }

  const load = useCallback(async () => {
    setLoading(true)
    const rows = await loadLibrary(filterLoc || null)
    setPhotos(rows)
    setLoading(false)
  }, [filterLoc])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: m } = await (supabase).from('members').select('id').eq('user_id', user.id).maybeSingle()
      setMeId(m?.id ?? null)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadTripPhoto(file)
      setPendingUrl(url)
      setLabel(file.name.replace(/\.[^.]+$/, '').slice(0, 60))
    } catch (err) {
      flash(err?.message ?? 'Upload failed', false)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function commit() {
    if (!pendingUrl || !label.trim()) return
    try {
      await saveToLibrary({
        label: label.trim(),
        image_url: pendingUrl,
        location_code: loc || null,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        uploaded_by: meId,
      })
      setPendingUrl(null); setLabel(''); setLoc(''); setTags('')
      flash('Added to library')
      load()
    } catch (err) {
      flash(err?.message ?? 'Could not save', false)
    }
  }

  async function remove(id) {
    if (!confirm('Remove this photo from the library? Trips already using it keep their image.')) return
    try {
      await deleteFromLibrary(id)
      flash('Removed')
      load()
    } catch (err) {
      flash(err?.message ?? 'Delete failed', false)
    }
  }

  const originOptions = airports.filter(a => a.role === 'origin' || a.role === 'both')
  const destOptions = airports.filter(a => a.role === 'destination' || a.role === 'both')
  const allOptions = [...new Map([...originOptions, ...destOptions].map(a => [a.code, a])).values()]

  return (
    <div>
      {toast && (
        <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 200, background: toast.ok ? 'var(--moss)' : 'var(--signal)', color: '#fff', padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600 }}>{toast.msg}</div>
      )}

      <p style={{ fontSize: 13, color: 'var(--ink-light)', marginTop: 0, marginBottom: 16, lineHeight: 1.6 }}>
        Upload photos once and tag them to a location. When you build a trip, the image picker shows the
        matching photos automatically so you can pick instead of re-uploading.
      </p>

      {/* Upload row */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 12, padding: '16px 18px', marginBottom: 20 }}>
        {!pendingUrl ? (
          <label className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', fontSize: 13 }}>
            {uploading ? 'Uploading…' : '+ Upload a photo'}
            <input type="file" accept="image/*" style={{ display: 'none' }} disabled={uploading} onChange={onFile} />
          </label>
        ) : (
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pendingUrl} alt="" style={{ width: 140, height: 90, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--hair)' }} />
            <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input className="input" placeholder="Label * (e.g. Boca Grande tarpon)" value={label} onChange={e => setLabel(e.target.value)} style={{ height: 34, fontSize: 13 }} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <select className="input" value={loc} onChange={e => setLoc(e.target.value)} style={{ height: 34, fontSize: 13, flex: 1, minWidth: 150 }}>
                  <option value="">No location tag</option>
                  {allOptions.map(a => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
                </select>
                <input className="input" placeholder="tags, comma, separated" value={tags} onChange={e => setTags(e.target.value)} style={{ height: 34, fontSize: 13, flex: 1, minWidth: 150 }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary" onClick={commit} disabled={!label.trim()} style={{ fontSize: 13 }}>Add to library</button>
                <button className="btn-ghost" onClick={() => { setPendingUrl(null); setLabel(''); setLoc(''); setTags('') }} style={{ fontSize: 13 }}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-light)' }}>Filter</span>
        <select className="input" value={filterLoc} onChange={e => setFilterLoc(e.target.value)} style={{ height: 32, fontSize: 12, maxWidth: 240 }}>
          <option value="">All locations</option>
          {allOptions.map(a => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
        </select>
        <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>{photos.length} photo{photos.length === 1 ? '' : 's'}</span>
      </div>

      {/* Grid */}
      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-light)', fontSize: 13 }}>Loading…</div>
      ) : photos.length === 0 ? (
        <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 12, padding: 32, textAlign: 'center', color: 'var(--ink-light)', fontSize: 13 }}>
          No photos {filterLoc ? `tagged to ${filterLoc}` : 'yet'}. Upload one above.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
          {photos.map(p => (
            <div key={p.id} style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 12, overflow: 'hidden' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.image_url} alt={p.label} style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }} />
              <div style={{ padding: '10px 12px' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.label}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-light)', marginTop: 3 }}>
                  {p.location_code ?? 'no location'}{p.tags?.length ? ` · ${p.tags.join(', ')}` : ''}
                </div>
                <button onClick={() => remove(p.id)} style={{ marginTop: 8, background: 'none', border: 'none', color: 'var(--signal)', fontSize: 11.5, cursor: 'pointer', padding: 0, fontFamily: 'var(--ui)' }}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
