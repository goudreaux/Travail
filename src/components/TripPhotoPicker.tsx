'use client'
import { useEffect, useRef, useState } from 'react'
import { uploadTripPhoto, saveToLibrary, loadLibrary, type TripPhoto } from '@/lib/trip-photos'

// Reusable hero-image picker for ops trip forms.
//
// Three ways to set the image:
//   1. Upload a file → stored in the member-assets bucket, returned as
//      a public URL. Optionally saved to the reusable library.
//   2. Pick from the library → existing photos, filtered to the
//      current location when one is provided.
//   3. Paste a URL → kept for power users / external images.
//
// The component is controlled: it reports the chosen URL up via
// onChange. It does not own the field value.
export function TripPhotoPicker({
  value,
  onChange,
  locationCode,
  uploadedBy,
  label = 'Hero image',
}: {
  value: string
  onChange: (url: string) => void
  // When set, the library tab defaults to photos tagged to this
  // location (with an "all locations" toggle).
  locationCode?: string | null
  uploadedBy?: string | null
  label?: string
}) {
  const [mode, setMode] = useState<'upload' | 'library' | 'url'>('upload')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Library state
  const [library, setLibrary] = useState<TripPhoto[]>([])
  const [libLoading, setLibLoading] = useState(false)
  const [libScopeAll, setLibScopeAll] = useState(false)

  // "Save to library" affordance after an upload
  const [justUploaded, setJustUploaded] = useState<string | null>(null)
  const [saveLabel, setSaveLabel] = useState('')
  const [saveTags, setSaveTags] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (mode !== 'library') return
    let cancelled = false
    setLibLoading(true)
    loadLibrary(libScopeAll ? null : (locationCode ?? null)).then(rows => {
      if (!cancelled) { setLibrary(rows); setLibLoading(false) }
    })
    return () => { cancelled = true }
  }, [mode, libScopeAll, locationCode])

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setError(null); setSaved(false)
    try {
      const url = await uploadTripPhoto(file)
      onChange(url)
      setJustUploaded(url)
      setSaveLabel(file.name.replace(/\.[^.]+$/, '').slice(0, 60))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function persist() {
    if (!justUploaded || !saveLabel.trim()) return
    try {
      await saveToLibrary({
        label: saveLabel.trim(),
        image_url: justUploaded,
        location_code: locationCode ?? null,
        tags: saveTags.split(',').map(t => t.trim()).filter(Boolean),
        uploaded_by: uploadedBy ?? null,
      })
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save to library')
    }
  }

  const tabBtn = (m: typeof mode, txt: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      style={{
        padding: '5px 12px', borderRadius: 8, fontSize: 12,
        fontFamily: 'var(--ui)', fontWeight: mode === m ? 600 : 400,
        border: `1px solid ${mode === m ? 'var(--tropic)' : 'var(--hair-2)'}`,
        background: mode === m ? 'var(--tropic-glow)' : 'transparent',
        color: mode === m ? 'var(--tropic-d)' : 'var(--ink-light)',
        cursor: 'pointer',
      }}
    >{txt}</button>
  )

  return (
    <div className="field" style={{ margin: 0 }}>
      <label className="field-lab">{label}</label>

      {/* Current selection preview */}
      {value && (
        <div style={{ position: 'relative', marginBottom: 10, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--hair)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" style={{ width: '100%', height: 130, objectFit: 'cover', display: 'block' }} />
          <button
            type="button"
            onClick={() => { onChange(''); setJustUploaded(null); setSaved(false) }}
            style={{
              position: 'absolute', top: 8, right: 8,
              background: 'rgba(13,51,64,0.78)', color: '#fff', border: 'none',
              borderRadius: 8, padding: '4px 10px', fontSize: 11, cursor: 'pointer',
            }}
          >Remove</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {tabBtn('upload', 'Upload')}
        {tabBtn('library', 'Library')}
        {tabBtn('url', 'Paste URL')}
      </div>

      {mode === 'upload' && (
        <div>
          <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
          <button
            type="button"
            className="btn-ghost"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{ fontSize: 13 }}
          >
            {uploading ? 'Uploading…' : 'Choose a photo from this device'}
          </button>

          {/* Save-to-library affordance, only after a fresh upload */}
          {justUploaded && !saved && (
            <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 10 }}>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 8 }}>
                Save this to the photo library so you can reuse it?{locationCode ? ` Tagged to ${locationCode}.` : ''}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <input className="input" placeholder="Label *" value={saveLabel} onChange={e => setSaveLabel(e.target.value)} style={{ flex: 2, minWidth: 120, height: 32, fontSize: 12 }} />
                <input className="input" placeholder="tags, comma, separated" value={saveTags} onChange={e => setSaveTags(e.target.value)} style={{ flex: 2, minWidth: 120, height: 32, fontSize: 12 }} />
                <button type="button" className="btn-primary" onClick={persist} disabled={!saveLabel.trim()} style={{ height: 32, fontSize: 12 }}>Save</button>
              </div>
            </div>
          )}
          {saved && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--moss)', fontWeight: 600 }}>✓ Saved to library</div>}
        </div>
      )}

      {mode === 'library' && (
        <div>
          {locationCode && (
            <button
              type="button"
              onClick={() => setLibScopeAll(s => !s)}
              style={{ fontSize: 11, color: 'var(--tropic-d)', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 8, fontFamily: 'var(--mono)', letterSpacing: '0.04em' }}
            >
              {libScopeAll ? `← Show only ${locationCode}` : 'Show all locations →'}
            </button>
          )}
          {libLoading ? (
            <div style={{ fontSize: 12, color: 'var(--ink-light)', padding: 12 }}>Loading…</div>
          ) : library.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--ink-light)', padding: 12 }}>
              No photos in the library{locationCode && !libScopeAll ? ` for ${locationCode}` : ''} yet. Upload one to start the collection.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8, maxHeight: 230, overflowY: 'auto' }}>
              {library.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onChange(p.image_url)}
                  title={p.label}
                  style={{
                    position: 'relative', padding: 0, border: `2px solid ${value === p.image_url ? 'var(--tropic)' : 'transparent'}`,
                    borderRadius: 8, overflow: 'hidden', cursor: 'pointer', background: 'none', aspectRatio: '4 / 3',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.image_url} alt={p.label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  <span style={{
                    position: 'absolute', left: 0, right: 0, bottom: 0,
                    background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.62))',
                    color: '#fff', fontSize: 9, padding: '8px 5px 4px', textAlign: 'left',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{p.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {mode === 'url' && (
        <input
          className="input"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="https://…"
        />
      )}

      {error && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--signal)' }}>{error}</div>
      )}
    </div>
  )
}
