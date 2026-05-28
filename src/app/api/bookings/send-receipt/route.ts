import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { sendBookingReceiptEmail } from '@/lib/member-email'
import { safeError } from '@/lib/pii-scrub'
import type { Database } from '@/lib/supabase/types'

// Fire-and-forget Travail-branded booking receipt.
//
// The reserve flow charges the card client-side via Stripe Elements,
// then inserts the booking row. Once the row exists, the client calls
// this route to send a branded receipt. Stripe also sends its default
// receipt automatically; this one carries Travail context (trip
// details, confirmation code, boarding-pass deep link, cancel policy).
//
// Always returns 200 (non-blocking). Server-side everything — the
// client should never see a receipt error stall the booking flow.

export const runtime = 'nodejs'

function admin() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured')
  return createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

interface ReceiptPayload {
  bookingId?: string
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: true, skipped: 'no_user' })

  let payload: ReceiptPayload
  try { payload = await req.json() }
  catch { return NextResponse.json({ ok: true, skipped: 'invalid_payload' }) }

  const bookingId = (payload.bookingId ?? '').trim()
  if (!bookingId) return NextResponse.json({ ok: true, skipped: 'missing_booking_id' })

  const { data: meRow } = await supabase
    .from('members').select('id, name').eq('user_id', user.id).maybeSingle()
  if (!meRow) return NextResponse.json({ ok: true, skipped: 'no_member' })

  const db = admin()
  const { data: booking } = await db
    .from('bookings').select('*').eq('id', bookingId).maybeSingle()
  if (!booking) return NextResponse.json({ ok: true, skipped: 'booking_not_found' })

  // Sanity: only the booking owner triggers receipts.
  if (booking.member_id !== meRow.id) {
    return NextResponse.json({ ok: true, skipped: 'not_owner' })
  }

  // Trip lookup for the receipt body.
  let tripName: string | null = null
  let tripDate: string | null = null
  let tripLocation: string | null = null
  try {
    if (booking.item_kind === 'flight') {
      const { data: f } = await db
        .from('flights')
        .select('name, date, origin_code, dest_code')
        .eq('id', booking.item_id).maybeSingle()
      if (f) {
        tripName = f.name ?? `${f.origin_code} → ${f.dest_code}`
        tripDate = f.date ?? null
        tripLocation = `${f.origin_code} → ${f.dest_code}`
      }
    } else {
      const { data: e } = await db
        .from('excursions')
        .select('name, date, origin_code')
        .eq('id', booking.item_id).maybeSingle()
      if (e) {
        tripName = e.name ?? 'Excursion'
        tripDate = e.date ?? null
        tripLocation = e.origin_code ?? null
      }
    }
  } catch (e) {
    safeError('send-receipt: trip lookup failed (non-fatal)', e)
  }
  if (!tripName) tripName = booking.item_kind === 'flight' ? 'Flight' : 'Excursion'

  // Email resolution — member_sensitive first, then auth.users.
  let memberEmail: string | null = null
  const { data: contact } = await db
    .from('member_sensitive').select('email').eq('member_id', meRow.id).maybeSingle()
  if (contact?.email && contact.email.trim().length > 0) {
    memberEmail = contact.email
  } else {
    memberEmail = user.email ?? null
  }
  if (!memberEmail) return NextResponse.json({ ok: true, skipped: 'no_email' })

  const total = Number(booking.total ?? 0)
  const fees = Number(booking.fees ?? 0)
  const subtotal = total - fees
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paid = Number((booking as any).paid_amount_cents ?? Math.round(total * 100))

  const origin = req.nextUrl.origin
  const boardingPassUrl = `${origin}/boarding-pass/${booking.id}`

  await sendBookingReceiptEmail({
    to: memberEmail,
    memberName: meRow.name ?? 'Member',
    memberId: meRow.id,
    bookingId: booking.id,
    tripId: booking.item_id ?? null,
    tripName,
    tripDate,
    tripLocation,
    seats: Number(booking.seats ?? 1),
    subtotalCents: Math.round(subtotal * 100),
    feeCents: Math.round(fees * 100),
    totalCents: paid > 0 ? paid : Math.round(total * 100),
    confirmationCode: booking.confirmation_code ?? null,
    boardingPassUrl,
  })

  return NextResponse.json({ ok: true })
}
