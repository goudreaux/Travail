'use client'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useMember } from '@/lib/member-context'
import { fmtMoney } from '@/lib/data'
import { ReservePaymentForm } from '@/components/ReservePaymentForm'
import { type Guest, type GuestSlot, NEW_GUEST, emptyGuestSlot, validateDob } from '@/lib/guests'

// Self-serve "bring a guest on your own ticket" — opens from the
// "you're booked" view. The member picks how many guests to add,
// registers each one, pays the incremental per-seat charge on their
// saved card, and the guests are appended to their existing booking
// (and the manifest on both legs of a round-trip). No second boarding
// pass; no Concierge round-trip.

const SERVICE_FEE_RATE = 0.03

function formatPhone(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 10)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
}

interface ResolvedPax {
  guest_id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  date_of_birth: string | null
}

export default function AddGuestToTicket({
  bookingId,
  kind,
  pricePerSeatDollars,
  legs = 1,
  maxAddable,
  onAdded,
}: {
  bookingId: string
  kind: 'flight' | 'excursion'
  // The member's locked per-seat price (one leg), for display only —
  // the server re-derives the authoritative charge.
  pricePerSeatDollars: number | null
  // 2 for a round-trip ticket (charge applies to both legs).
  legs?: number
  // Live availability so the stepper can't ask for seats that don't exist.
  maxAddable: number
  onAdded?: (newSeatCount: number) => void
}) {
  const { member } = useMember()
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(1)
  const [savedGuests, setSavedGuests] = useState<Guest[]>([])
  const [slots, setSlots] = useState<GuestSlot[]>([emptyGuestSlot()])
  const [savingGuest, setSavingGuest] = useState<number | null>(null)
  const [error, setError] = useState('')

  // Payment phase.
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [totalCents, setTotalCents] = useState<number | null>(null)
  const [savedCard, setSavedCard] = useState<{ id: string; brand: string | null; last4: string | null } | null>(null)
  const [paying, setPaying] = useState(false)
  const [piLoading, setPiLoading] = useState(false)
  const [done, setDone] = useState(false)

  const unit = kind === 'flight' ? 'seat' : 'spot'
  const cap = Math.max(0, Math.min(10, maxAddable))

  // Load the member's saved-guest roster once the sheet opens.
  useEffect(() => {
    if (!open || !member?.id) return
    let cancelled = false
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(supabase as any).from('guests').select('*').eq('host_member_id', member.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }: { data: Guest[] | null; error: unknown }) => {
        // Ignore a failed fetch rather than blanking the dropdown (which would
        // make a saved guest look missing); keep whatever we had.
        if (!cancelled && !error) setSavedGuests(data ?? [])
      })
    return () => { cancelled = true }
  }, [open, member?.id])

  // Keep one slot per guest being added.
  useEffect(() => {
    setSlots(prev => {
      const next = prev.slice(0, count)
      while (next.length < count) next.push(emptyGuestSlot())
      return next
    })
  }, [count])

  function updateSlot(i: number, patch: Partial<GuestSlot>) {
    setSlots(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s))
  }

  // Preview subtotal/fee computed in CENTS, per-leg, mirroring the server's
  // rounding (payment-intent route) so this breakdown matches what the Pay
  // button actually charges — no dollar-vs-cent drift between the two steps.
  const perSeat = pricePerSeatDollars ?? 0
  const perLegSubtotalCents = Math.round(perSeat * 100) * count
  const perLegFeeCents = Math.round(perLegSubtotalCents * SERVICE_FEE_RATE)
  const subtotal = (perLegSubtotalCents * legs) / 100
  const fee = (perLegFeeCents * legs) / 100
  const displayTotal = subtotal + fee

  function reset() {
    setOpen(false)
    setCount(1)
    setSlots([emptyGuestSlot()])
    setError('')
    setClientSecret(null)
    setTotalCents(null)
    setSavedCard(null)
    setPaying(false)
    setDone(false)
  }

  // Save any "add new" slots to the roster so we have stable guest ids to
  // attach to the manifest, then resolve every slot to a ResolvedPax.
  async function resolveGuests(): Promise<ResolvedPax[] | null> {
    const supabase = createClient()
    const out: ResolvedPax[] = []
    const seen = new Set<string>()
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i]
      if (!s.savedGuestId) { setError(`Select or add a guest for ${unit} ${i + 1}.`); return null }
      let g: Guest | undefined
      if (s.savedGuestId === NEW_GUEST) {
        if (!s.first_name.trim() || !s.last_name.trim()) { setError('Enter a first and last name for each new guest.'); return null }
        if (!s.date_of_birth) { setError('Enter each guest’s date of birth.'); return null }
        const dobErr = validateDob(s.date_of_birth)
        if (dobErr) { setError(dobErr); return null }
        const email = s.email.trim()
        if (!email) { setError('Enter an email for each new guest — we use it to follow up about membership.'); return null }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Enter a valid email for each new guest.'); return null }
        const digits = s.phone.replace(/\D/g, '')
        if (digits.length !== 10) { setError('Enter a 10-digit phone for each new guest.'); return null }
        setSavingGuest(i)
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data, error: gErr } = await (supabase as any).from('guests').insert({
            host_member_id: member!.id,
            first_name: s.first_name.trim(),
            last_name: s.last_name.trim(),
            email: email || null,
            phone: s.phone.trim(),
            date_of_birth: s.date_of_birth,
          }).select().single()
          if (gErr) throw gErr
          g = data as Guest
          setSavedGuests(prev => [g!, ...prev])
          updateSlot(i, { savedGuestId: g!.id })
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Could not save guest.')
          return null
        } finally {
          setSavingGuest(null)
        }
      } else {
        g = savedGuests.find(x => x.id === s.savedGuestId)
        if (!g) { setError('That guest could not be found — pick again.'); return null }
      }
      // No duplicate passengers on one ticket.
      const key = (g.email?.toLowerCase() || g.id)
      if (seen.has(key)) { setError('Each added seat needs a different person.'); return null }
      seen.add(key)
      out.push({
        guest_id: g.id, first_name: g.first_name, last_name: g.last_name,
        email: g.email, phone: g.phone, date_of_birth: g.date_of_birth,
      })
    }
    return out
  }

  const [resolved, setResolved] = useState<ResolvedPax[] | null>(null)
  // Synchronous re-entry guard: a fast double-tap on "Continue to payment"
  // must not save guests twice or mint two PaymentIntents (state updates are
  // async, so a boolean state flag alone can race).
  const submittingRef = useRef(false)

  // Step 1 → 2: validate + save guests, then ask the server for a PI.
  async function startPayment() {
    if (submittingRef.current) return
    submittingRef.current = true
    setError('')
    try {
      if (count < 1 || count > cap) { setError(`You can add up to ${cap} ${unit}${cap === 1 ? '' : 's'}.`); return }
      const pax = await resolveGuests()
      if (!pax) return
      setResolved(pax)
      setPiLoading(true)
      const res = await fetch('/api/bookings/add-guests/payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, addSeats: count }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Could not start payment.'); return }
      setClientSecret(data.clientSecret)
      setTotalCents(data.totalCents)
      setSavedCard(data.savedCard ?? null)
    } catch {
      setError('Network error starting payment. Please try again.')
    } finally {
      setPiLoading(false)
      submittingRef.current = false
    }
  }

  // Step 2 → done: card cleared → extend the booking + manifest.
  async function finalize(paymentIntentId: string) {
    if (!resolved) return
    setPaying(true)
    setError('')
    try {
      const res = await fetch('/api/bookings/add-guests/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentIntentId, bookingId, guests: resolved }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Payment cleared but we couldn’t add your guest. The Concierge has been notified.'); setPaying(false); return }
      setDone(true)
      onAdded?.(data.seats ?? 0)
    } catch {
      setError('Payment cleared but we couldn’t reach the server. The Concierge has been notified.')
      setPaying(false)
    }
  }

  if (!open) {
    if (cap <= 0) return null
    return (
      <button type="button" className="cta-outline" style={{ width: '100%' }} onClick={() => setOpen(true)}>
        + Add a guest to your ticket
      </button>
    )
  }

  const inPayment = !!clientSecret && totalCents != null && !done

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(13,51,64,0.42)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      role="dialog"
      aria-modal="true"
      onClick={e => { if (e.target === e.currentTarget && !paying) reset() }}
    >
      <div style={{ background: 'var(--card)', borderRadius: '18px 18px 0 0', padding: '24px 22px calc(24px + env(safe-area-inset-bottom))', width: '100%', maxWidth: 480, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 -8px 40px rgba(13,51,64,0.18)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--tropic-d)', fontWeight: 600, marginBottom: 5 }}>
              Add to your ticket
            </div>
            <h2 className="display-i" style={{ fontSize: 24, color: 'var(--ink)', margin: 0 }}>
              {done ? 'Guest added ✓' : 'Bring a guest'}
            </h2>
          </div>
          {!paying && (
            <button type="button" aria-label="Close" onClick={reset} style={{ background: 'none', border: 'none', fontSize: 26, lineHeight: 1, color: 'var(--ink-faint)', cursor: 'pointer' }}>×</button>
          )}
        </div>

        {done ? (
          <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
            <p style={{ fontSize: 14, color: 'var(--ink-light)', lineHeight: 1.6, margin: '0 0 20px' }}>
              {count} guest{count === 1 ? '' : 's'} added to your ticket and charged to your card. They’re on the manifest{legs > 1 ? ' for both legs' : ''}.
            </p>
            <button type="button" className="btn-primary" style={{ width: '100%' }} onClick={reset}>Done</button>
          </div>
        ) : inPayment ? (
          <>
            <p style={{ fontSize: 13, color: 'var(--ink-light)', lineHeight: 1.55, margin: '0 0 14px' }}>
              Adding {count} {unit}{count === 1 ? '' : 's'}{legs > 1 ? ' across both legs' : ''}. Your card will be charged on confirmation.
            </p>
            <ReservePaymentForm
              clientSecret={clientSecret!}
              totalCents={totalCents!}
              savedCard={savedCard}
              submitLabel={`Pay ${fmtMoney(totalCents! / 100)} & add ${count === 1 ? 'guest' : 'guests'} →`}
              onPaid={async ({ paymentIntentId }) => { await finalize(paymentIntentId) }}
            />
            {error && <div className="anchor-card__error" style={{ marginTop: 10 }}>{error}</div>}
          </>
        ) : (
          <>
            {/* How many */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ fontSize: 14, color: 'var(--ink-soft)', fontWeight: 500 }}>How many guests?</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <button type="button" className="btn-ghost" style={{ width: 34, height: 34, padding: 0, fontSize: 20 }} disabled={count <= 1} onClick={() => setCount(c => Math.max(1, c - 1))}>−</button>
                <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', minWidth: 18, textAlign: 'center' }}>{count}</span>
                <button type="button" className="btn-ghost" style={{ width: 34, height: 34, padding: 0, fontSize: 20 }} disabled={count >= cap} onClick={() => setCount(c => Math.min(cap, c + 1))}>+</button>
              </div>
            </div>

            {/* Guest registration */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              {slots.map((slot, i) => (
                <div key={i} style={{ border: '1px solid var(--hair)', borderRadius: 12, padding: 12 }}>
                  <select
                    className="input"
                    value={slot.savedGuestId}
                    onChange={e => updateSlot(i, { savedGuestId: e.target.value })}
                  >
                    <option value="">Select a guest…</option>
                    {savedGuests.map(g => <option key={g.id} value={g.id}>{g.first_name} {g.last_name}</option>)}
                    <option value={NEW_GUEST}>+ Add new guest</option>
                  </select>
                  {slot.savedGuestId === NEW_GUEST && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                      <input className="input" placeholder="First name *" value={slot.first_name} onChange={e => updateSlot(i, { first_name: e.target.value })} />
                      <input className="input" placeholder="Last name *" value={slot.last_name} onChange={e => updateSlot(i, { last_name: e.target.value })} />
                      <input className="input" type="email" placeholder="Email *" value={slot.email} onChange={e => updateSlot(i, { email: e.target.value })} />
                      <input className="input" inputMode="numeric" maxLength={12} placeholder="Phone * (xxx-xxx-xxxx)" value={slot.phone} onChange={e => updateSlot(i, { phone: formatPhone(e.target.value) })} />
                      <label className="mono" style={{ fontSize: 9.5, color: 'var(--ink-faint)' }}>Date of birth *</label>
                      <input className="input" type="date" max={new Date().toISOString().slice(0, 10)} value={slot.date_of_birth} onChange={e => updateSlot(i, { date_of_birth: e.target.value })} />
                    </div>
                  )}
                  {savingGuest === i && <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 6 }}>Saving guest…</div>}
                </div>
              ))}
            </div>

            {/* Price */}
            {perSeat > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14, paddingTop: 12, borderTop: '1px solid var(--hair)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--ink-soft)' }}>
                  <span>{count} {unit}{count === 1 ? '' : 's'}{legs > 1 ? ' × 2 legs' : ''} × {fmtMoney(perSeat)}</span>
                  <span>{fmtMoney(subtotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--ink-light)' }}>
                  <span>Service fee (3%)</span>
                  <span>{fmtMoney(fee)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Total</span>
                  <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>{fmtMoney(displayTotal)}</span>
                </div>
              </div>
            )}

            {error && <div className="anchor-card__error" style={{ marginBottom: 10 }}>{error}</div>}

            <button
              type="button"
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'center' }}
              disabled={piLoading || savingGuest !== null}
              onClick={startPayment}
            >
              {piLoading ? 'Preparing payment…' : 'Continue to payment →'}
            </button>
            <div style={{ textAlign: 'center', marginTop: 10 }}>
              <span className="mono" style={{ fontSize: 9, color: 'var(--ink-faint)', letterSpacing: '0.1em' }}>
                ADDED TO YOUR EXISTING TICKET · NO SECOND BOARDING PASS
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
