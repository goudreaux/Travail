'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { logActivity } from '@/lib/activity'
import { genConfirmationCode, to24h } from '@/lib/data'
import type { Booking, AnchorSubmission, Member, Flight, Excursion, Aircraft } from '@/lib/supabase/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type Passenger = {
  id: string
  booking_id: string
  guest_id: string | null
  is_host: boolean
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
}

type BookingRow = Booking & {
  member: Pick<Member, 'name' | 'initials'> | null
  flight: Pick<Flight, 'name' | 'origin_code' | 'dest_code' | 'date'> | null
  excursion: Pick<Excursion, 'name' | 'date'> | null
  passengers?: Passenger[]
}

type AnchorRow = AnchorSubmission & {
  member: Pick<Member, 'name' | 'initials'> | null
}

// A round trip is two flight bookings — outbound "B-X" and return "B-XR" — that
// must be handled as ONE item: one card, one confirm, one shared code.
type QueueItem = {
  primary: BookingRow
  legs: BookingRow[]
  isRound: boolean
  seats: number
  total: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

function waitColor(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (m > 60) return 'var(--signal)'
  if (m > 20) return 'var(--sun-d)'
  return 'var(--tropic-d)'
}

function Toast({ msg, kind }: { msg: string; kind: 'success' | 'error' | 'info' }) {
  return <div className={`toast ${kind}`}>{msg}</div>
}

function SectionHead({ label, count, sub }: { label: string; count: number; sub?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
      <h2 style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 500, color: 'var(--ink)', margin: 0 }}>
        {label}
      </h2>
      {count > 0 && (
        <span style={{
          background: 'var(--signal)', color: '#fff', borderRadius: 10,
          padding: '2px 9px', fontSize: 11, fontWeight: 700, fontFamily: 'var(--mono)',
        }}>
          {count}
        </span>
      )}
      <div style={{ flex: 1, height: 1, background: 'var(--hair-2)' }} />
      {sub && (
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--ink-faint)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          {sub}
        </span>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function QueuePage() {
  const supabase = createClient()
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [anchors, setAnchors] = useState<AnchorRow[]>([])
  const [aircraft, setAircraft] = useState<Aircraft[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [cancellations, setCancellations] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [waitlistRows, setWaitlistRows] = useState<any[]>([])
  const [working, setWorking] = useState<string | null>(null)
  const [meId, setMeId] = useState<string | null>(null)
  const [declineTarget, setDeclineTarget] = useState<{ id: string; kind: 'booking' | 'anchor' } | null>(null)
  const [declineReason, setDeclineReason] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [toast, setToast] = useState<{ msg: string; kind: 'success' | 'error' | 'info' } | null>(null)
  const [loading, setLoading] = useState(true)

  const showToast = useCallback((msg: string, kind: 'success' | 'error' | 'info' = 'success') => {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 4000)
  }, [])

  // Collapse round-trip leg pairs (B-X + B-XR) into a single queue item.
  const queueItems = useMemo<QueueItem[]>(() => {
    const ids = new Set(bookings.map(b => b.id))
    const items: QueueItem[] = []
    for (const b of bookings) {
      // Skip a return leg whose outbound is present — it's folded into that item.
      if (b.item_kind === 'flight' && b.id.endsWith('R') && ids.has(b.id.slice(0, -1))) continue
      const ret = b.item_kind === 'flight' ? bookings.find(x => x.id === `${b.id}R`) : undefined
      const legs = ret ? [b, ret] : [b]
      items.push({
        primary: b,
        legs,
        isRound: legs.length > 1,
        seats: b.seats,
        total: legs.reduce((s, l) => s + l.total, 0),
      })
    }
    return items
  }, [bookings])

  const loadBookings = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { data: bk } = await supabase
      .from('bookings')
      .select('*')
      .eq('status', 'pending')
      .order('submitted_at', { ascending: true })
    const all = (bk ?? []) as unknown as BookingRow[]

    // No FK embeds in this DB — resolve members and polymorphic trips separately.
    const memberIds = [...new Set(all.map(b => b.member_id))]
    const flightIds = all.filter(b => b.item_kind === 'flight').map(b => b.item_id)
    const excIds = all.filter(b => b.item_kind === 'excursion').map(b => b.item_id)
    const { data: mem } = memberIds.length ? await db.from('members').select('id, name, initials').in('id', memberIds) : { data: [] }
    const { data: fl } = flightIds.length ? await db.from('flights').select('id, name, origin_code, dest_code, date').in('id', flightIds) : { data: [] }
    const { data: ex } = excIds.length ? await db.from('excursions').select('id, name, date').in('id', excIds) : { data: [] }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const memMap = new Map((mem ?? []).map((m: any) => [m.id, m]))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const flMap = new Map((fl ?? []).map((f: any) => [f.id, f]))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exMap = new Map((ex ?? []).map((e: any) => [e.id, e]))
    for (const b of all) {
      b.member = (memMap.get(b.member_id) ?? null) as BookingRow['member']
      if (b.item_kind === 'flight') b.flight = (flMap.get(b.item_id) ?? null) as BookingRow['flight']
      else b.excursion = (exMap.get(b.item_id) ?? null) as BookingRow['excursion']
    }

    // Attach the passenger manifest (member + registered guests) for each booking.
    const ids = all.map(b => b.id)
    if (ids.length) {
      const { data: pax } = await db.from('booking_passengers').select('*').in('booking_id', ids)
      const byBooking: Record<string, Passenger[]> = {}
      for (const p of (pax ?? []) as Passenger[]) (byBooking[p.booking_id] ??= []).push(p)
      for (const b of all) b.passengers = byBooking[b.id] ?? []
    }
    setBookings(all)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadAnchors = useCallback(async () => {
    const { data } = await supabase
      .from('anchor_submissions')
      .select('*, member:members!member_id(name, initials)')
      .eq('status', 'pending')
      .order('submitted_at', { ascending: true })
    setAnchors((data ?? []) as unknown as AnchorRow[])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadExtras = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const [{ data: creqs }, { data: wl }, { data: mem }, { data: fl }, { data: ex }] = await Promise.all([
      db.from('cancellation_requests').select('*').eq('status', 'open').order('created_at'),
      db.from('waitlist').select('*').order('created_at'),
      db.from('members').select('id, name, initials'),
      db.from('flights').select('id, name, origin_code, dest_code'),
      db.from('excursions').select('id, name'),
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const memMap = new Map((mem ?? []).map((m: any) => [m.id, m.name]))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const flMap = new Map((fl ?? []).map((f: any) => [f.id, f]))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exMap = new Map((ex ?? []).map((e: any) => [e.id, e]))
    const tripLabel = (kind: string, id: string) => {
      if (kind === 'flight') { const f = flMap.get(id) as { origin_code: string; dest_code: string } | undefined; return f ? `${f.origin_code} → ${f.dest_code}` : id }
      const e = exMap.get(id) as { name: string } | undefined; return e ? e.name : id
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bIds = (creqs ?? []).map((c: any) => c.booking_id)
    const { data: bks } = bIds.length ? await db.from('bookings').select('*').in('id', bIds) : { data: [] }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bMap = new Map((bks ?? []).map((b: any) => [b.id, b]))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setCancellations((creqs ?? []).map((c: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b = bMap.get(c.booking_id) as any
      return { ...c, booking: b, memberName: memMap.get(c.member_id) ?? 'Unknown', trip: b ? tripLabel(b.item_kind, b.item_id) : '—' }
    }).filter((c: { booking?: { status?: string } }) => c.booking && c.booking.status !== 'cancelled' && c.booking.status !== 'declined'))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setWaitlistRows((wl ?? []).map((w: any) => ({ ...w, memberName: memMap.get(w.member_id) ?? 'Unknown', trip: tripLabel(w.item_kind, w.item_id) })))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function promoteWaitlist(itemKind: string, itemId: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const table = itemKind === 'flight' ? 'flights' : 'excursions'
    const { data: item } = await db.from(table).select('*').eq('id', itemId).single()
    if (!item) return
    const capacity = itemKind === 'flight' ? item.seats_total - item.seats_anchor : item.spots_total - item.spots_anchor
    const { data: approvedRows } = await db.from('bookings').select('seats').eq('item_kind', itemKind).eq('item_id', itemId).eq('status', 'approved')
    const taken = (approvedRows ?? []).reduce((s: number, r: { seats: number }) => s + r.seats, 0)
    if (taken >= capacity) return
    const { data: wl } = await db.from('waitlist').select('*').eq('item_kind', itemKind).eq('item_id', itemId).order('created_at').limit(1)
    const first = (wl ?? [])[0]
    if (!first) return
    const price = itemKind === 'flight' ? item.price_per_seat : item.price_per_pax
    const fee = Math.round(price * 0.03)
    const id = 'B-' + Date.now().toString(36).toUpperCase()
    await db.from('bookings').insert({ id, member_id: first.member_id, item_kind: itemKind, item_id: itemId, seats: 1, price_per_seat: price, fees: fee, total: price + fee, payment_method: 'card', status: 'pending' })
    await db.from('waitlist').delete().eq('id', first.id)
    try {
      await supabase.from('notifications').insert({ member_id: first.member_id, kind: 'booking', title: 'A seat opened up', body: 'A seat opened on a trip you waitlisted — Ops is confirming it now.', ref: { item_kind: itemKind, item_id: itemId } } as never)
    } catch { /* supplementary */ }
    logActivity({
      action: 'waitlist_promoted', actor_kind: 'system', subject_member_id: first.member_id,
      booking_id: id, item_kind: itemKind, item_id: itemId,
      summary: `Waitlist promotion — a seat opened and was offered to the next member (pending ops confirm)`,
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function cancelFromRequest(c: any) {
    const b = c.booking
    if (!b) return
    setWorking(c.id)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any
      const table = b.item_kind === 'flight' ? 'flights' : 'excursions'
      const { data: item } = await db.from(table).select('anchor_member_id').eq('id', b.item_id).single()
      if (item?.anchor_member_id && item.anchor_member_id === b.member_id) {
        const { data: others } = await db.from('bookings').select('id').eq('item_kind', b.item_kind).eq('item_id', b.item_id).neq('member_id', b.member_id).in('status', ['pending', 'approved'])
        if ((others ?? []).length > 0) throw new Error('Anchor cannot cancel — other members are booked.')
      }
      const wasApproved = b.status === 'approved'
      const { error } = await db.from('bookings').update({ status: 'cancelled', decided_at: new Date().toISOString() }).eq('id', b.id)
      if (error) throw error
      await db.from('cancellation_requests').update({ status: 'resolved' }).eq('id', c.id)
      try {
        await supabase.from('notifications').insert({ member_id: b.member_id, kind: 'booking', title: 'Booking Cancelled', body: 'Your reservation has been cancelled by Ops.', ref: { booking_id: b.id } } as never)
      } catch { /* supplementary */ }
      if (wasApproved) await promoteWaitlist(b.item_kind, b.item_id)
      logActivity({
        action: 'booking_cancelled', actor_kind: 'admin', actor_member_id: meId,
        subject_member_id: b.member_id, booking_id: b.id,
        item_kind: b.item_kind, item_id: b.item_id,
        summary: `Cancelled ${b.item_kind} for ${c.memberName ?? 'member'} (ops-confirmed cancellation request)`,
      })
      showToast('Booking cancelled')
      loadBookings(); loadExtras()
    } catch (e: unknown) {
      showToast((e as Error).message ?? 'Cancel failed', 'error')
    } finally { setWorking(null) }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function dismissRequest(c: any) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('cancellation_requests').update({ status: 'resolved' }).eq('id', c.id)
    showToast('Request dismissed')
    loadExtras()
  }

  useEffect(() => {
    // Capture the acting admin's member id so their actions are attributed.
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id
      if (!uid) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(supabase as any).from('members').select('id').eq('user_id', uid).single()
        .then(({ data: m }: { data: { id: string } | null }) => setMeId(m?.id ?? null))
    })

    Promise.all([
      loadBookings(),
      loadAnchors(),
      loadExtras(),
      supabase.from('aircraft').select('*').then(({ data }) => setAircraft(data ?? [])),
    ]).then(() => setLoading(false))

    const ch = supabase
      .channel('queue-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bookings' }, () => {
        showToast('New booking request received', 'info')
        loadBookings()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bookings' }, () => loadBookings())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'anchor_submissions' }, () => {
        showToast('New anchor submission received', 'info')
        loadAnchors()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'anchor_submissions' }, () => loadAnchors())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cancellation_requests' }, () => loadExtras())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'waitlist' }, () => loadExtras())
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [loadBookings, loadAnchors, loadExtras, showToast]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Booking actions ───────────────────────────────────────────────────────

  // Confirm a whole item — both legs of a round trip share ONE confirmation code.
  async function approveItem(qi: QueueItem) {
    setWorking(qi.primary.id)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any
      const code = genConfirmationCode()

      const legIds = new Set(qi.legs.map(l => l.id))
      for (const leg of qi.legs) {
        // Seat-availability check (item_id is text, so the uuid RPC can't be used).
        const itemTable = leg.item_kind === 'flight' ? 'flights' : 'excursions'
        const { data: item } = await db.from(itemTable).select('*').eq('id', leg.item_id).single()
        if (!item) throw new Error('Trip not found')
        const capacity = leg.item_kind === 'flight'
          ? item.seats_total - item.seats_anchor
          : item.spots_total - item.spots_anchor
        // Count other members' approved seats only — the anchor's seats are already
        // reserved via seats_anchor, and exclude the booking we're confirming.
        const { data: approvedRows } = await db.from('bookings')
          .select('id, seats, member_id').eq('item_kind', leg.item_kind).eq('item_id', leg.item_id).eq('status', 'approved')
        const taken = (approvedRows ?? [])
          .filter((r: { id: string; member_id: string }) => r.member_id !== item.anchor_member_id && !legIds.has(r.id))
          .reduce((s: number, r: { seats: number }) => s + r.seats, 0)
        if (taken + leg.seats > capacity) {
          const where = leg.flight ? `${leg.flight.origin_code} → ${leg.flight.dest_code}` : 'this leg'
          throw new Error(`Only ${Math.max(0, capacity - taken)} seat(s) left on ${where}`)
        }
      }

      // All legs have room — confirm them together under the shared code.
      for (const leg of qi.legs) {
        const { data: upd, error } = await db.from('bookings').update({
          status: 'approved', confirmation_code: code, decided_at: new Date().toISOString(),
        }).eq('id', leg.id).select()
        if (error) throw error
        if (!upd || upd.length === 0) throw new Error('Update blocked — verify the admin RLS update policy on bookings in Supabase')
      }

      try {
        await supabase.from('notifications').insert({
          member_id: qi.primary.member_id,
          kind: 'booking',
          title: 'Booking Confirmed',
          body: `Your ${qi.isRound ? 'round-trip ' : ''}${qi.primary.item_kind} reservation is confirmed. Confirmation code: ${code}`,
          ref: { booking_id: qi.primary.id, confirmation_code: code },
          read: false,
        } as never)
      } catch { /* notification is supplementary */ }

      logActivity({
        action: 'booking_confirmed', actor_kind: 'admin', actor_member_id: meId,
        subject_member_id: qi.primary.member_id, booking_id: qi.primary.id,
        item_kind: qi.primary.item_kind, item_id: qi.primary.item_id,
        summary: `Confirmed ${qi.isRound ? 'round-trip ' : ''}${qi.primary.item_kind} for ${qi.primary.member?.name ?? 'member'} — ${code}`,
        meta: { code, seats: qi.seats, total: qi.total, round_trip: qi.isRound },
      })

      showToast(`Confirmed — ${code}`)
      loadBookings()
      loadExtras()
    } catch (e: unknown) {
      showToast((e as Error).message ?? 'Approval failed', 'error')
    } finally { setWorking(null) }
  }

  async function declineBooking(id: string, reason: string) {
    const b = bookings.find(x => x.id === id)
    if (!b) return
    setWorking(id)
    try {
      // Decline both legs of a round trip together.
      const legIds = [id]
      const ret = bookings.find(x => x.id === `${id}R`)
      if (ret) legIds.push(ret.id)
      const { error } = await supabase.from('bookings').update({
        status: 'declined',
        decline_reason: reason,
        decided_at: new Date().toISOString(),
      }).in('id', legIds)
      if (error) throw error

      try {
        await supabase.from('notifications').insert({
          member_id: b.member_id,
          kind: 'booking',
          title: 'Booking Declined',
          body: reason || 'Your booking request was not approved at this time.',
          ref: { booking_id: id },
          read: false,
        } as never)
      } catch { /* notification is supplementary */ }

      logActivity({
        action: 'booking_declined', actor_kind: 'admin', actor_member_id: meId,
        subject_member_id: b.member_id, booking_id: id,
        item_kind: b.item_kind, item_id: b.item_id,
        summary: `Declined ${b.item_kind} for ${b.member?.name ?? 'member'}${reason ? ` — ${reason}` : ''}`,
        meta: { reason: reason || null },
      })

      showToast('Booking declined')
      loadBookings()
      loadExtras()
    } catch (e: unknown) {
      showToast((e as Error).message ?? 'Decline failed', 'error')
    } finally { setWorking(null) }
  }

  // ── Anchor actions ────────────────────────────────────────────────────────

  function resolveAircraftId(shorthand: string | null | undefined): string | null {
    if (!shorthand) return null
    // If it's already a UUID, return as-is
    if (shorthand.includes('-')) return shorthand
    // Match c206 → capacity 4, caravan → capacity 8
    const capacity = shorthand === 'c206' ? 4 : 8
    return aircraft.find(a => a.capacity === capacity)?.id ?? null
  }

  // Expand an anchor for review and seed the editable draft from its submission.
  function openAnchor(anchor: AnchorRow) {
    if (expanded === anchor.id) { setExpanded(null); return }
    const p = anchor.payload as Record<string, unknown>
    const s = (v: unknown) => (v === null || v === undefined ? '' : String(v))
    setDraft({
      name: s(p.name),
      date: s(p.date),
      departTime: s(p.departTime ?? p.depart_time),
      destCode: s(p.destCode ?? p.dest_code),
      startTime: s(p.startTime ?? p.start_time),
      returnTime: s(p.returnTime ?? p.return_time),
      seatsTotal: s(p.seatsTotal ?? p.seats_total ?? 8),
      seatsAnchor: s(p.seatsAnchor ?? p.seats_anchor ?? 1),
      spotsTotal: s(p.spotsTotal ?? p.spots_total ?? 8),
      spotsAnchor: s(p.spotsAnchor ?? p.spots_anchor ?? 1),
      price: s(p.pricePerSeat ?? p.price_per_seat ?? p.pricePerPax ?? p.price_per_pax ?? ''),
      pitch: s(p.pitch),
    })
    setExpanded(anchor.id)
  }

  async function publishAnchor(anchor: AnchorRow) {
    const p = anchor.payload as Record<string, unknown>
    // Edited values from the expanded review form; fall back to the submission.
    const d = expanded === anchor.id ? draft : {}
    const val = (key: string, fb: unknown) => (d[key] !== undefined && d[key] !== '' ? d[key] : (fb ?? '')) as string
    const num = (key: string, fb: unknown) => { const n = Number(val(key, fb)); return Number.isFinite(n) ? n : 0 }

    const price = num('price', p.pricePerSeat ?? p.price_per_seat ?? p.pricePerPax ?? p.price_per_pax ?? 0)
    if (price <= 0) {
      showToast('Set a price per seat/person before publishing', 'error')
      setExpanded(anchor.id)
      if (expanded !== anchor.id) openAnchor(anchor)
      return
    }

    setWorking(anchor.id)
    try {
      const code = genConfirmationCode()
      const stamp = Date.now().toString(36).toUpperCase()
      let publishedItemId: string | null = null

      const originCode = String(p.originCode ?? p.origin_code ?? '')
      const destCode = val('destCode', p.destCode ?? p.dest_code)
      const date = val('date', p.date)
      const departTime = to24h(val('departTime', p.departTime ?? p.depart_time)) || null
      const aircraftId = resolveAircraftId((p.aircraftId ?? p.aircraft_id ?? null) as string | null)
      const name = val('name', p.name)
      const pitch = val('pitch', p.pitch) || null

      if (anchor.kind === 'flight') {
        const seatsTotal = num('seatsTotal', p.seatsTotal ?? p.seats_total ?? 8)
        const seatsAnchor = num('seatsAnchor', p.seatsAnchor ?? p.seats_anchor ?? 1)

        const { data: flight, error } = await supabase.from('flights').insert({
          id: `F-${stamp}`,
          anchor_member_id: anchor.member_id,
          origin_code: originCode,
          dest_code: destCode,
          date,
          depart_time: departTime,
          duration_mins: (p.duration_mins as number) ?? 0,
          aircraft_id: aircraftId,
          name,
          pitch,
          visibility: 'members',
          seats_total: seatsTotal,
          seats_anchor: seatsAnchor,
          price_per_seat: price,
          status: 'open',
        } as never).select().single()
        if (error) throw error
        publishedItemId = flight.id

        // Auto-approve anchor member's own seats
        await supabase.from('bookings').insert({
          id: `B-${stamp}`,
          member_id: anchor.member_id,
          item_kind: 'flight',
          item_id: flight.id,
          seats: seatsAnchor,
          price_per_seat: price,
          fees: 0,
          total: price * seatsAnchor,
          payment_method: 'credits',
          status: 'approved',
          confirmation_code: code,
          decided_at: new Date().toISOString(),
        } as never)
      } else {
        // Excursion
        const spotsTotal = num('spotsTotal', p.spotsTotal ?? p.spots_total ?? 8)
        const spotsAnchor = num('spotsAnchor', p.spotsAnchor ?? p.spots_anchor ?? 1)
        const tripType = p.tripType as string | undefined
        const stayType = tripType === 'overnight' ? 'overnight' : 'day_trip'

        const { data: exc, error } = await supabase.from('excursions').insert({
          id: `E-${stamp}`,
          anchor_member_id: anchor.member_id,
          template_id: null,
          origin_code: originCode,
          aircraft_id: aircraftId,
          date,
          start_time: to24h(val('startTime', p.startTime ?? p.start_time)) || null,
          depart_time: departTime,
          arrive_time: to24h((p.arriveTime ?? p.arrive_time ?? '') as string) || null,
          return_time: to24h(val('returnTime', p.returnTime ?? p.return_time)) || null,
          stay_type: stayType as 'day_trip' | 'overnight' | 'multi_night',
          name,
          pitch,
          visibility: 'members',
          spots_total: spotsTotal,
          spots_anchor: spotsAnchor,
          price_per_pax: price,
          status: 'open',
        } as never).select().single()
        if (error) throw error
        publishedItemId = exc.id

        await supabase.from('bookings').insert({
          id: `B-${stamp}`,
          member_id: anchor.member_id,
          item_kind: 'excursion',
          item_id: exc.id,
          seats: spotsAnchor,
          price_per_seat: price,
          fees: 0,
          total: price * spotsAnchor,
          payment_method: 'credits',
          status: 'approved',
          confirmation_code: code,
          decided_at: new Date().toISOString(),
        } as never)
      }

      await supabase.from('anchor_submissions').update({
        status: 'published',
        decided_at: new Date().toISOString(),
        published_item_id: publishedItemId,
      }).eq('id', anchor.id)

      await supabase.from('notifications').insert({
        member_id: anchor.member_id,
        kind: 'approval',
        title: anchor.kind === 'flight' ? 'Flight Published' : 'Excursion Published',
        body: `Your ${anchor.kind} "${name}" is now live and open for bookings.`,
        ref: { anchor_id: anchor.id, item_id: publishedItemId, kind: anchor.kind },
        read: false,
      } as never)

      logActivity({
        action: 'anchor_published', actor_kind: 'admin', actor_member_id: meId,
        subject_member_id: anchor.member_id, item_kind: anchor.kind, item_id: publishedItemId,
        summary: `Published ${anchor.kind} "${name}" by ${anchor.member?.name ?? 'member'}`,
        meta: { anchor_id: anchor.id, code },
      })

      showToast(`Published — ${anchor.kind === 'flight' ? 'Flight' : 'Excursion'} is now live`)
    } catch (e: unknown) {
      showToast((e as Error).message ?? 'Publish failed', 'error')
    } finally { setWorking(null) }
  }

  async function declineAnchor(id: string, reason: string) {
    const anchor = anchors.find(a => a.id === id)
    if (!anchor) return
    setWorking(id)
    try {
      const { error } = await supabase.from('anchor_submissions').update({
        status: 'declined',
        decline_reason: reason,
        decided_at: new Date().toISOString(),
      }).eq('id', id)
      if (error) throw error

      try {
        await supabase.from('notifications').insert({
          member_id: anchor.member_id,
          kind: 'approval',
          title: 'Anchor Submission Declined',
          body: reason || 'Your anchor submission could not be approved at this time.',
          ref: { anchor_id: id },
          read: false,
        } as never)
      } catch { /* notification is supplementary */ }

      logActivity({
        action: 'anchor_declined', actor_kind: 'admin', actor_member_id: meId,
        subject_member_id: anchor.member_id, item_kind: anchor.kind,
        summary: `Declined ${anchor.kind} submission by ${anchor.member?.name ?? 'member'}${reason ? ` — ${reason}` : ''}`,
        meta: { anchor_id: id, reason: reason || null },
      })

      showToast('Submission declined')
      loadAnchors()
    } catch (e: unknown) {
      showToast((e as Error).message ?? 'Decline failed', 'error')
    } finally { setWorking(null) }
  }

  async function handleDecline() {
    if (!declineTarget) return
    if (declineTarget.kind === 'booking') {
      await declineBooking(declineTarget.id, declineReason)
    } else {
      await declineAnchor(declineTarget.id, declineReason)
    }
    setDeclineTarget(null)
    setDeclineReason('')
  }

  if (loading) {
    return (
      <div style={{ padding: 32, paddingTop: 80, textAlign: 'center', color: 'var(--ink-light)', fontSize: 14 }}>
        Loading queue…
      </div>
    )
  }

  const totalPending = queueItems.length + anchors.length + cancellations.length

  return (
    <div className="admin-page" style={{ maxWidth: 980 }}>
      {toast && <Toast msg={toast.msg} kind={toast.kind} />}

      {/* ── Decline modal ── */}
      {declineTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(6,56,71,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--card)', borderRadius: 14, padding: 28, width: 420, boxShadow: '0 16px 64px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontFamily: 'var(--display)', fontSize: 20, color: 'var(--ink)', margin: '0 0 16px' }}>
              Decline {declineTarget.kind === 'booking' ? 'Booking Request' : 'Anchor Submission'}
            </h3>
            <textarea
              className="input"
              style={{ minHeight: 80, width: '100%', marginBottom: 16 }}
              placeholder="Optional reason — sent to the member as a notification…"
              value={declineReason}
              onChange={e => setDeclineReason(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => { setDeclineTarget(null); setDeclineReason('') }}>
                Cancel
              </button>
              <button
                className="btn-primary"
                style={{ background: 'var(--signal)' }}
                disabled={!!working}
                onClick={handleDecline}
              >
                {working ? '…' : 'Confirm Decline'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 32, fontWeight: 500, color: 'var(--ink)', margin: 0 }}>
            Ops Queue
          </h1>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--tropic-glow)', border: '1px solid rgba(0,179,199,0.25)',
            borderRadius: 20, padding: '3px 12px 3px 9px',
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%', background: 'var(--tropic)',
              boxShadow: '0 0 0 3px rgba(0,179,199,0.2)',
            }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.14em', color: 'var(--tropic-d)', textTransform: 'uppercase' }}>
              Live
            </span>
          </div>
          {totalPending > 0 && (
            <span style={{
              background: 'var(--signal)', color: '#fff', borderRadius: 12,
              padding: '2px 10px', fontSize: 12, fontWeight: 700, fontFamily: 'var(--mono)',
            }}>
              {totalPending} pending
            </span>
          )}
        </div>
        <p style={{ fontSize: 13.5, color: 'var(--ink-light)', margin: 0 }}>
          Real-time action queue. Booking approvals are atomic — double-booking is prevented at the database level.
        </p>
      </div>

      {/* ── Booking Requests ── */}
      <section style={{ marginBottom: 52 }}>
        <SectionHead label="Booking Requests" count={queueItems.length} sub="First come, first served" />

        {queueItems.length === 0 ? (
          <div style={{
            background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 12,
            padding: 32, textAlign: 'center', color: 'var(--ink-light)', fontSize: 13,
          }}>
            Queue is clear — no pending booking requests.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {queueItems.map((qi, idx) => {
              const b = qi.primary
              const out = qi.legs[0]?.flight
              const ret = qi.legs[1]?.flight
              const tripLabel = b.item_kind === 'flight' && out
                ? (qi.isRound ? `${out.origin_code} ⇄ ${out.dest_code}` : `${out.origin_code} → ${out.dest_code}`)
                : b.excursion?.name ?? 'Excursion'
              const tripDate = b.item_kind === 'flight' ? out?.date : b.excursion?.date
              const wColor = waitColor(b.submitted_at)
              const isFirst = idx === 0

              return (
                <div key={b.id} style={{
                  background: 'var(--card)',
                  border: `1px solid ${isFirst || expanded === b.id ? 'var(--tropic)' : 'var(--hair)'}`,
                  borderRadius: 12,
                  overflow: 'hidden',
                  transition: 'border-color 0.15s',
                }}>
                  <div
                    style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}
                    onClick={() => setExpanded(expanded === b.id ? null : b.id)}
                  >
                  {/* Expand caret */}
                  <div style={{ color: 'var(--ink-faint)', fontSize: 10, width: 10, flexShrink: 0 }}>
                    {expanded === b.id ? '▲' : '▶'}
                  </div>

                  {/* Queue position */}
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                    background: isFirst ? 'var(--tropic-glow)' : 'var(--warm)',
                    border: `1.5px solid ${isFirst ? 'var(--tropic)' : 'var(--hair-2)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700,
                    color: isFirst ? 'var(--tropic-d)' : 'var(--ink-light)',
                  }}>
                    {idx + 1}
                  </div>

                  {/* Wait time */}
                  <div style={{ flexShrink: 0, textAlign: 'center', minWidth: 38 }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5, fontWeight: 700, color: wColor }}>
                      {timeAgo(b.submitted_at)}
                    </div>
                    <div style={{ width: 20, height: 2, borderRadius: 1, background: wColor, opacity: 0.35, margin: '4px auto 0' }} />
                  </div>

                  {/* Member avatar */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0, minWidth: 130 }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                      background: 'var(--tropic-glow)', color: 'var(--tropic-d)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700,
                    }}>
                      {b.member?.initials ?? '?'}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {b.member?.name ?? 'Unknown'}
                    </span>
                  </div>

                  {/* Trip */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 }}>
                      <span className={`pill ${b.item_kind === 'flight' ? 'tropic' : 'sun'}`} style={{ fontSize: 9 }}>
                        {qi.isRound ? 'round trip' : b.item_kind}
                      </span>
                      <span style={{
                        fontSize: 13.5, fontWeight: 600, color: 'var(--ink)',
                        fontFamily: b.item_kind === 'flight' ? 'var(--mono)' : undefined,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {tripLabel}
                      </span>
                    </div>
                    {qi.isRound ? (
                      <div style={{ fontSize: 11, color: 'var(--ink-light)', fontFamily: 'var(--mono)', letterSpacing: '0.04em' }}>
                        Out {out?.date}{ret?.date ? `  ·  Return ${ret.date}` : ''}
                      </div>
                    ) : tripDate && (
                      <div style={{ fontSize: 11, color: 'var(--ink-light)', fontFamily: 'var(--mono)', letterSpacing: '0.04em' }}>
                        {tripDate}
                      </div>
                    )}
                  </div>

                  {/* Seats */}
                  <div style={{ flexShrink: 0, textAlign: 'center', minWidth: 48 }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--display)', lineHeight: 1 }}>
                      {b.seats}
                    </div>
                    <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--ink-faint)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 2 }}>
                      seat{b.seats !== 1 ? 's' : ''}
                    </div>
                  </div>

                  {/* Amount */}
                  <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 72 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--ink)' }}>
                      ${qi.total.toLocaleString()}
                    </div>
                    <div style={{ fontSize: 9.5, fontFamily: 'var(--mono)', color: 'var(--ink-faint)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      {b.payment_method}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    <button
                      className="btn-primary"
                      style={{ height: 32, padding: '0 16px', fontSize: 12.5 }}
                      disabled={working === b.id}
                      onClick={() => approveItem(qi)}
                    >
                      {working === b.id ? '…' : 'Confirm'}
                    </button>
                    <button
                      className="btn-ghost"
                      style={{ height: 32, padding: '0 11px', fontSize: 12, color: 'var(--signal)', borderColor: 'rgba(217,78,42,0.25)' }}
                      disabled={working === b.id}
                      onClick={() => setDeclineTarget({ id: b.id, kind: 'booking' })}
                    >
                      Decline
                    </button>
                  </div>
                  </div>

                  {/* Passenger manifest */}
                  {expanded === b.id && (
                    <div style={{ borderTop: '1px solid var(--hair)', padding: '14px 18px', background: 'rgba(0,179,199,0.02)' }}>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.14em', color: 'var(--tropic-d)', textTransform: 'uppercase', marginBottom: 10 }}>
                        Passengers · {b.passengers?.length ?? 0}
                      </div>
                      {(b.passengers ?? []).length === 0 ? (
                        <div style={{ fontSize: 12, color: 'var(--ink-light)' }}>No passenger manifest recorded for this booking.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {b.passengers!.map(p => (
                            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, flexWrap: 'wrap' }}>
                              <span className={`pill ${p.is_host ? 'tropic' : 'ink'}`} style={{ fontSize: 9 }}>{p.is_host ? 'Member' : 'Guest'}</span>
                              <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{p.first_name} {p.last_name}</span>
                              {(p.phone || p.email) && (
                                <span style={{ color: 'var(--ink-light)', fontFamily: 'var(--mono)', fontSize: 11 }}>
                                  {[p.phone, p.email].filter(Boolean).join('  ·  ')}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Cancellation Requests ── */}
      <section style={{ marginBottom: 52 }}>
        <SectionHead label="Cancellation Requests" count={cancellations.length} sub="Member-initiated" />
        {cancellations.length === 0 ? (
          <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 12, padding: 32, textAlign: 'center', color: 'var(--ink-light)', fontSize: 13 }}>
            No cancellation requests.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {cancellations.map(c => (
              <div key={c.id} style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ flexShrink: 0, fontFamily: 'var(--mono)', fontSize: 11.5, fontWeight: 700, color: waitColor(c.created_at), minWidth: 38 }}>{timeAgo(c.created_at)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{c.memberName}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-light)', fontFamily: 'var(--mono)' }}>
                    <span className={`pill ${c.booking?.item_kind === 'flight' ? 'tropic' : 'sun'}`} style={{ fontSize: 9, marginRight: 6 }}>{c.booking?.item_kind}</span>
                    {c.trip} · {c.booking?.seats} seat{c.booking?.seats !== 1 ? 's' : ''} · {c.booking?.status}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button className="btn-primary" style={{ height: 32, padding: '0 14px', fontSize: 12.5, background: 'var(--signal)' }} disabled={working === c.id} onClick={() => cancelFromRequest(c)}>
                    {working === c.id ? '…' : 'Cancel booking'}
                  </button>
                  <button className="btn-ghost" style={{ height: 32, padding: '0 11px', fontSize: 12 }} disabled={working === c.id} onClick={() => dismissRequest(c)}>
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Waitlist ── */}
      <section style={{ marginBottom: 52 }}>
        <SectionHead label="Waitlist" count={waitlistRows.length} sub="Auto-promotes on cancel" />
        {waitlistRows.length === 0 ? (
          <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 12, padding: 32, textAlign: 'center', color: 'var(--ink-light)', fontSize: 13 }}>
            No one on a waitlist.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {waitlistRows.map(w => (
              <div key={w.id} style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 12, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ flexShrink: 0, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-light)', minWidth: 38 }}>{timeAgo(w.created_at)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{w.memberName}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-light)', fontFamily: 'var(--mono)' }}>
                    <span className={`pill ${w.item_kind === 'flight' ? 'tropic' : 'sun'}`} style={{ fontSize: 9, marginRight: 6 }}>{w.item_kind}</span>
                    {w.trip}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Anchor Submissions ── */}
      <section>
        <SectionHead label="Anchor Submissions" count={anchors.length} sub="Review & publish" />

        {anchors.length === 0 ? (
          <div style={{
            background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 12,
            padding: 32, textAlign: 'center', color: 'var(--ink-light)', fontSize: 13,
          }}>
            No pending anchor submissions.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {anchors.map(a => {
              const p = a.payload as Record<string, unknown>
              const isOpen = expanded === a.id
              const originCode = String(p.originCode ?? p.origin_code ?? '')
              const destCode = String(p.destCode ?? p.dest_code ?? '')
              const date = String(p.date ?? '')
              const name = String(p.name ?? '—')
              const routeStr = a.kind === 'flight'
                ? `${originCode} → ${destCode}`
                : originCode

              return (
                <div key={a.id} style={{
                  background: 'var(--card)',
                  border: `1px solid ${isOpen ? 'var(--tropic)' : 'var(--hair)'}`,
                  borderRadius: 12,
                  overflow: 'hidden',
                  transition: 'border-color 0.15s',
                }}>
                  {/* Row */}
                  <div
                    style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}
                    onClick={() => openAnchor(a)}
                  >
                    <div style={{ color: 'var(--ink-faint)', fontSize: 10, flexShrink: 0, width: 12 }}>
                      {isOpen ? '▲' : '▶'}
                    </div>

                    {/* Wait time */}
                    <div style={{ flexShrink: 0, fontFamily: 'var(--mono)', fontSize: 11.5, fontWeight: 700, color: waitColor(a.submitted_at), minWidth: 38 }}>
                      {timeAgo(a.submitted_at)}
                    </div>

                    {/* Member */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0, minWidth: 130 }}>
                      <div style={{
                        width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                        background: 'var(--sun-glow)', color: 'var(--sun-d)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700,
                      }}>
                        {a.member?.initials ?? '?'}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {a.member?.name ?? 'Unknown'}
                      </span>
                    </div>

                    {/* Kind + name */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 }}>
                        <span className={`pill ${a.kind === 'flight' ? 'tropic' : 'sun'}`} style={{ fontSize: 9 }}>
                          {a.kind}
                        </span>
                        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {name}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-light)', letterSpacing: '0.04em' }}>
                        {routeStr}{date ? ` · ${date}` : ''}
                      </div>
                    </div>

                    {/* Seats */}
                    <div style={{ flexShrink: 0, textAlign: 'center', minWidth: 64 }}>
                      {a.kind === 'flight' ? (
                        <>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>
                            {((p.seatsAnchor ?? p.seats_anchor) as number) ?? '?'} / {((p.seatsTotal ?? p.seats_total) as number) ?? '?'}
                          </div>
                          <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>seats</div>
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>
                            {((p.spotsAnchor ?? p.spots_anchor) as number) ?? '?'} / {((p.spotsTotal ?? p.spots_total) as number) ?? '?'}
                          </div>
                          <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>spots</div>
                        </>
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                      <button
                        className="btn-sun"
                        style={{ height: 32, padding: '0 16px', fontSize: 12.5 }}
                        disabled={working === a.id}
                        onClick={() => publishAnchor(a)}
                      >
                        {working === a.id ? '…' : 'Publish'}
                      </button>
                      <button
                        className="btn-ghost"
                        style={{ height: 32, padding: '0 11px', fontSize: 12, color: 'var(--signal)', borderColor: 'rgba(217,78,42,0.25)' }}
                        disabled={working === a.id}
                        onClick={() => setDeclineTarget({ id: a.id, kind: 'anchor' })}
                      >
                        Decline
                      </button>
                    </div>
                  </div>

                  {/* Expanded — review & edit before publishing */}
                  {isOpen && (() => {
                    const set = (k: string, v: string) => setDraft(prev => ({ ...prev, [k]: v }))
                    const F = ({ label, k, type = 'text', placeholder }: { label: string; k: string; type?: string; placeholder?: string }) => (
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label className="field-lab">{label}</label>
                        <input className="input" type={type} value={draft[k] ?? ''} placeholder={placeholder}
                          onChange={e => set(k, e.target.value)} />
                      </div>
                    )
                    return (
                      <div style={{ borderTop: '1px solid var(--hair)', padding: '16px 20px 20px', background: 'rgba(0,179,199,0.02)' }}>
                        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', letterSpacing: '0.14em', color: 'var(--tropic-d)', marginBottom: 14, textTransform: 'uppercase' }}>
                          Review &amp; edit before publishing
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
                          {F({ label: 'Trip name', k: 'name' })}
                          {F({ label: 'Date', k: 'date', type: 'date' })}
                          {F({ label: 'Departure time', k: 'departTime', placeholder: '9:00 AM' })}
                          {a.kind === 'flight' ? (
                            <>
                              {F({ label: 'Destination code', k: 'destCode' })}
                              {F({ label: 'Seats total', k: 'seatsTotal', type: 'number' })}
                              {F({ label: 'Anchor seats', k: 'seatsAnchor', type: 'number' })}
                              {F({ label: 'Price / seat (USD)', k: 'price', type: 'number', placeholder: 'e.g. 850' })}
                            </>
                          ) : (
                            <>
                              {F({ label: 'Start time', k: 'startTime', placeholder: '9:00 AM' })}
                              {F({ label: 'Return time', k: 'returnTime', placeholder: '4:00 PM' })}
                              {F({ label: 'Spots total', k: 'spotsTotal', type: 'number' })}
                              {F({ label: 'Anchor spots', k: 'spotsAnchor', type: 'number' })}
                              {F({ label: 'Price / person (USD)', k: 'price', type: 'number', placeholder: 'e.g. 450' })}
                            </>
                          )}
                        </div>
                        <div className="field" style={{ marginTop: 14, marginBottom: 0 }}>
                          <label className="field-lab">Pitch</label>
                          <textarea className="input" rows={2} value={draft.pitch ?? ''} onChange={e => set('pitch', e.target.value)} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
                          <button className="btn-sun" style={{ height: 36, padding: '0 18px', fontSize: 13 }} disabled={working === a.id} onClick={() => publishAnchor(a)}>
                            {working === a.id ? 'Publishing…' : 'Publish to network →'}
                          </button>
                          <span style={{ fontSize: 11.5, color: 'var(--ink-light)' }}>
                            {a.member?.name ? `Submitted by ${a.member.name}` : ''}{a.submitted_at ? ` · ${new Date(a.submitted_at).toLocaleDateString()}` : ''}
                          </span>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
