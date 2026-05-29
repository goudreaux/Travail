'use client'
import { createClient } from '@/lib/supabase/client'

// Trip photo storage + library helpers.
//
// Bytes go to the existing public 'member-assets' bucket under
// trip-photos/. The trip_photos table (migration 057) indexes them so
// ops can browse + reuse photos across forms instead of re-uploading.

export interface TripPhoto {
  id: string
  label: string
  image_url: string
  location_code: string | null
  tags: string[]
  uploaded_by: string | null
  created_at: string
}

// Client-side downscale to keep stored files small + uploads fast.
// Mirrors the helper that's been living in the admin trips page.
export function downscaleToDataUrl(file: File, maxW = 1400, quality = 0.8): Promise<Blob> {
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
        canvas.toBlob(
          (blob) => blob ? resolve(blob) : reject(new Error('Could not encode image')),
          'image/jpeg',
          quality,
        )
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

// Upload a file to storage and return its public URL. Downscales
// first. Path is namespaced + timestamped so re-uploads never collide.
export async function uploadTripPhoto(file: File): Promise<string> {
  const supabase = createClient()
  const blob = await downscaleToDataUrl(file)
  const path = `trip-photos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
  const { error } = await supabase.storage
    .from('member-assets')
    .upload(path, blob, { upsert: false, contentType: 'image/jpeg' })
  if (error) throw error
  const { data } = supabase.storage.from('member-assets').getPublicUrl(path)
  return data.publicUrl
}

// Persist an uploaded photo into the reusable library.
export async function saveToLibrary(opts: {
  label: string
  image_url: string
  location_code?: string | null
  tags?: string[]
  uploaded_by?: string | null
}): Promise<void> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('trip_photos').insert({
    label: opts.label,
    image_url: opts.image_url,
    location_code: opts.location_code ?? null,
    tags: opts.tags ?? [],
    uploaded_by: opts.uploaded_by ?? null,
  })
  if (error) throw error
}

// Load the library, optionally filtered to a location. Returns [] on
// any failure (e.g. migration not applied yet) so callers degrade to
// upload-only.
export async function loadLibrary(locationCode?: string | null): Promise<TripPhoto[]> {
  const supabase = createClient()
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (supabase as any).from('trip_photos').select('*').order('created_at', { ascending: false })
    if (locationCode) q = q.eq('location_code', locationCode)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as TripPhoto[]
  } catch {
    return []
  }
}

export async function deleteFromLibrary(id: string): Promise<void> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('trip_photos').delete().eq('id', id)
  if (error) throw error
}
