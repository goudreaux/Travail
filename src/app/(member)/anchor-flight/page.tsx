'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fmtDur } from '@/lib/data'
import PageHero from '@/components/PageHero'
import TimeInput from '@/components/TimeInput'
import { AnchorCardSetup } from '@/components/AnchorCardSetup'
import { LastMinuteNotice } from '@/components/LastMinuteNotice'
import { canAnchor } from '@/lib/trip-timing'
import { useBlackoutDates } from '@/lib/use-blackout'
import type { AirportMeta } from '@/lib/data'

// Tropic Ocean Airways' scheduled-flight routes — the bases they fly
// from on a regular basis. Ad-hoc destinations are still possible via
// the CUSTOM sentinel; ops confirms the routing with Tropic on those.
const ANCHOR_ORIGINS: AirportMeta[] = [
  { code: 'KTPA', name: 'TPA',                 sub: 'Tampa, FL',         role: 'origin' },
  { code: 'KTPF', name: 'Davis Islands',       sub: 'Tampa, FL',         role: 'origin' },
]

// Sentinel destination meaning "the member wants somewhere not on the
// scheduled list" — handed to ops with a free-form name they typed.
const CUSTOM_DEST_CODE = 'CUSTOM'

const ANCHOR_DESTS: AirportMeta[] = [
  { code: 'STR',  name: 'St. Regis Hotel · Sarasota', sub: 'Sarasota, FL',     role: 'destination' },
  { code: 'LCC',  name: 'Lochloosa Country Club',     sub: 'North Central FL', role: 'destination' },
  { code: 'KEYW', name: 'Key West Airport',           sub: 'FL Keys',          role: 'destination' },
  { code: 'LPI',  name: 'Little Palm Island',         sub: 'FL Keys',          role: 'destination' },
  { code: CUSTOM_DEST_CODE, name: 'Custom destination', sub: 'Request, the Concierge Team will confirm with Tropic', role: 'destination' },
]

type GuestEntry = { first_name: string; last_name: string; date_of_birth: string }

function AirportDropdown({
  value,
  options,
  onChange,
}: {
  label?: string
  value: AirportMeta
  options: AirportMeta[]
  onChange: (a: AirportMeta) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1 }}>
      <div
        className={`select${open ? ' focus' : ''}`}
        style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', height: 38, padding: '0 32px 0 12px' }}
        onClick={() => setOpen(o => !o)}
      >
        <span style={{ fontWeight: 600, marginRight: 6, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value.name}</span>
        <span style={{ fontSize: 12, color: 'var(--ink-light)', flexShrink: 0 }}>({value.code})</span>
      </div>
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          right: 0,
          background: 'var(--card)',
          border: '1px solid var(--hair-2)',
          borderRadius: 10,
          boxShadow: '0 8px 32px rgba(13,51,64,0.14)',
          zIndex: 50,
          maxHeight: 260,
          overflowY: 'auto',
        }}>
          {options.map(a => (
            <div
              key={a.code}
              onClick={() => { onChange(a); setOpen(false) }}
              style={{
                padding: '9px 14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: a.code === value.code ? 'var(--tropic-glow)' : 'transparent',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => { if (a.code !== value.code) (e.currentTarget as HTMLElement).style.background = 'var(--warm)' }}
              onMouseLeave={e => { if (a.code !== value.code) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <span style={{ flex: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', display: 'block', lineHeight: 1.3 }}>{a.name} <span style={{ color: 'var(--ink-light)', fontWeight: 400 }}>({a.code})</span></span>
                <span style={{ fontSize: 11, color: 'var(--ink-light)' }}>{a.sub}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const STEPS = ['Route', 'When', 'Party', 'Review']

export default function AnchorFlightPage() {
  const [step, setStep] = useState(1)
  const [origin, setOrigin] = useState<AirportMeta>(ANCHOR_ORIGINS[0])
  const [dest, setDest] = useState<AirportMeta>(ANCHOR_DESTS[0])
  // When the member picks "Custom destination", they fill in a free-form
  // name + optional context for ops. Ops confirms the route with Tropic
  // and writes back the real airport code on the quote.
  const [customDestName, setCustomDestName] = useState('')
  const [customDestNotes, setCustomDestNotes] = useState('')
  const isCustomDest = dest.code === CUSTOM_DEST_CODE
  const [tripType, setTripType] = useState<'one-way' | 'round-trip'>('one-way')
  const [aircraft, setAircraft] = useState<4 | 8>(8)
  const [guests, setGuests] = useState<GuestEntry[]>([])
  const [date, setDate] = useState('')
  const [departTime, setDepartTime] = useState('9:00 AM')
  const [returnDate, setReturnDate] = useState('')
  const [returnDepartTime, setReturnDepartTime] = useState('3:00 PM')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [tripName, setTripName] = useState('')
  const [pitch, setPitch] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState<{ id: string } | null>(null)
  // Gate the Submit button on a saved card — Ops can't publish without
  // one (they need it on file to capture the charter cost on approval).
  const [hasCard, setHasCard] = useState(false)
  const [error, setError] = useState('')

  const supabase = createClient()
  const router = useRouter()
  const blackout = useBlackoutDates()

  // Anchoring is open to every member. (The membership/timing guards live on
  // the submit path — /api/anchor/setup-intent + canAnchor — not here.)
  const pax = 1 + guests.length
  const isRoundTrip = tripType === 'round-trip'
  const openSeats = visibility === 'private' ? 0 : Math.max(0, aircraft - pax)
  const anchorSeats = visibility === 'private' ? aircraft : pax
  const aircraftLabel = aircraft === 4 ? 'Cessna 206' : 'Cessna Grand Caravan'
  const blockTime = fmtDur(90)
  const suggestedName = `${origin.name} → ${isCustomDest ? (customDestName.trim() || 'Custom destination') : dest.name}`
  const effectiveName = tripName.trim() || suggestedName
  const today = new Date().toISOString().split('T')[0]

  const updateGuest = (i: number, patch: Partial<GuestEntry>) =>
    setGuests(gs => gs.map((g, idx) => idx === i ? { ...g, ...patch } : g))
  const addGuest = () => { if (pax >= aircraft) return; setGuests(gs => [...gs, { first_name: '', last_name: '', date_of_birth: '' }]) }
  const removeGuest = (i: number) => setGuests(gs => gs.filter((_, idx) => idx !== i))

  function validateStep(s: number): string | null {
    if (s === 1 && !isCustomDest && origin.code === dest.code) return 'Origin and destination must be different.'
    if (s === 1 && isCustomDest && !customDestName.trim()) return 'Tell us where you want to go, we’ll confirm with Tropic.'
    if (s === 2) {
      if (!date) return 'Select a departure date.'
      if (blackout.has(date)) return 'Tropic has no aircraft available on that date. Pick another date.'
      if (isRoundTrip && returnDate && blackout.has(returnDate)) return 'Tropic has no aircraft available on the return date. Pick another.'
      if (isRoundTrip && !returnDate) return 'Select a return date.'
      if (isRoundTrip && returnDate < date) return 'Return date must be on or after departure.'
      const gate = canAnchor(date, departTime)
      if (!gate.ok) return gate.reason
    }
    if (s === 3) {
      for (const g of guests) {
        if (!g.first_name.trim() || !g.last_name.trim() || !g.date_of_birth) {
          return 'Enter a first name, last name, and date of birth for each guest.'
        }
      }
    }
    return null
  }

  function next() {
    const err = validateStep(step)
    if (err) { setError(err); return }
    setError('')
    setStep(s => Math.min(4, s + 1))
  }
  function back() {
    setError('')
    if (step === 1) { router.push('/plan'); return }
    setStep(s => Math.max(1, s - 1))
  }

  async function handleSubmit() {
    const err = validateStep(2) || validateStep(3)
    if (err) { setError(err); return }
    setError('')
    setSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: member } = await supabase.from('members').select('id').eq('user_id', user.id).single()
      if (!member) { router.push('/login'); return }

      const { data, error: insertError } = await supabase
        .from('anchor_submissions')
        .insert({
          id: crypto.randomUUID(),
          kind: 'flight',
          member_id: member.id,
          payload: {
            originCode: origin.code,
            originName: origin.name,
            // For custom destinations we hand ops the free-form name the
            // member typed and a CUSTOM sentinel as the code — ops swaps
            // in the real airport code when they confirm the routing
            // with Tropic.
            destCode: isCustomDest ? CUSTOM_DEST_CODE : dest.code,
            destName: isCustomDest ? customDestName.trim() : dest.name,
            customDest: isCustomDest,
            customDestNotes: isCustomDest ? (customDestNotes.trim() || null) : null,
            tripType,
            date,
            departTime,
            returnDate: isRoundTrip ? returnDate : null,
            returnDepartTime: isRoundTrip ? returnDepartTime : null,
            aircraftId: aircraft === 4 ? 'c206' : 'caravan',
            name: effectiveName,
            pitch,
            visibility,
            seatsTotal: aircraft,
            seatsAnchor: anchorSeats,
            guests,
          },
          status: 'pending',
        } as never)
        .select()
        .single()

      if (insertError) throw insertError

      if (data) {
        try {
          await supabase.from('notifications').insert({
            id: crypto.randomUUID(),
            member_id: member.id,
            kind: 'system',
            title: 'Anchor submitted for review',
            body: 'The Travail team will get a Tropic quote and confirm pricing with you.',
            ref: { kind: 'anchor', id: (data as { id: string }).id },
            read: false,
          } as never)
        } catch { /* notification is supplementary */ }
        // Ping ops by email so the submission lands in their inbox in
        // addition to the queue. Non-blocking.
        try {
          await fetch('/api/anchor/notify-submitted', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ submissionId: (data as { id: string }).id }),
          })
        } catch { /* ops still sees the row in the queue */ }
        setSubmitted(data)
      }
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e?.message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="page">
        <div className="page-view" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 480 }}>
          <div style={{
            background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 18,
            padding: '48px 52px', maxWidth: 480, width: '100%', textAlign: 'center',
            boxShadow: '0 8px 40px rgba(13,51,64,0.08)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 24 }}>
              <div className="pending-indicator" />
              <span className="mono" style={{ color: 'var(--tropic-d)' }}>In review</span>
            </div>
            <h2 className="display-i" style={{ fontSize: 32, color: 'var(--ink)', margin: '0 0 12px' }}>Anchor in review.</h2>
            <p style={{ fontSize: 14, color: 'var(--ink-light)', lineHeight: 1.6, margin: '0 0 8px' }}>
              We&apos;ve received your <strong>{origin.name} → {isCustomDest ? (customDestName.trim() || 'Custom destination') : dest.name}</strong> anchor request.
            </p>
            <p style={{ fontSize: 13, color: 'var(--ink-faint)', lineHeight: 1.5, margin: '0 0 32px' }}>
              The Concierge Team will quote pricing with Tropic + the 3% service fee. You&apos;ll get a notification to review and accept it, nothing is charged until you do.
            </p>
            <div style={{ background: 'var(--warm)', borderRadius: 10, padding: '14px 18px', marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="mono">Submission ID</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', color: 'var(--ink)' }}>{submitted.id}</span>
            </div>
            <button className="btn-ghost" onClick={() => router.push('/')} style={{ width: '100%' }}>Back to the app</button>
          </div>
        </div>
      </div>
    )
  }

  const tripToggle = (
    <div style={{ display: 'flex', background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 10, padding: 4, gap: 4 }}>
      {(['one-way', 'round-trip'] as const).map(t => (
        <button key={t} onClick={() => setTripType(t)} style={{
          flex: 1, height: 36, border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer',
          transition: 'all 0.15s', background: tripType === t ? 'var(--tropic)' : 'transparent', color: tripType === t ? '#fff' : 'var(--ink-light)',
        }}>
          {t === 'one-way' ? 'One Way' : 'Round Trip'}
        </button>
      ))}
    </div>
  )

  return (
    <div className="page">
      <PageHero
        eyebrow="PLAN A TRIP · FLIGHT"
        title="Anchor a Flight"
        sub="Set your route, lock your seats, and invite the network to fill the rest."
      />

      <div className="page-view">
        <div className="wiz">
          <div className="wiz-top">
            <div className="wiz-progress" style={{ flex: 1, margin: 0 }}>
              {STEPS.map((_, i) => <div key={i} className={`seg${i + 1 <= step ? ' done' : ''}`} />)}
            </div>
            <button className="wiz-cancel" onClick={() => router.push('/')}>Cancel ✕</button>
          </div>

          {/* ── Step 1 · Route ── */}
          {step === 1 && (
            <div>
              <div className="wiz-step-eyebrow">Step 1 of 4 · Route</div>
              <h2 className="wiz-step-title">Where are you headed?</h2>
              <p className="wiz-step-sub">Pick your departure airport and destination. Origin defaults to your home base.</p>
              <div className="field">
                <label className="field-lab">From</label>
                <AirportDropdown value={origin} options={ANCHOR_ORIGINS} onChange={setOrigin} />
              </div>
              <div className="field">
                <label className="field-lab">To</label>
                <AirportDropdown value={dest} options={ANCHOR_DESTS} onChange={setDest} />
              </div>

              {/* Custom destination fields — ops confirms routing with
                  Tropic on these. Required: a name. Optional: any
                  context (proximity to a known field, who's meeting
                  them, etc.) that helps ops scope the quote. */}
              {isCustomDest && (
                <>
                  <div className="field">
                    <label className="field-lab">Destination name <span className="req">*</span></label>
                    <input
                      className="input"
                      placeholder="Hotel name, town, marina, golf course…"
                      value={customDestName}
                      onChange={e => setCustomDestName(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label className="field-lab">Notes for the Concierge Team <span style={{ color: 'var(--ink-light)', fontWeight: 400 }}>(optional)</span></label>
                    <textarea
                      className="input"
                      rows={3}
                      placeholder="Nearest known airport, who you're meeting, anything that helps the Concierge Team scope the route…"
                      value={customDestNotes}
                      onChange={e => setCustomDestNotes(e.target.value)}
                    />
                  </div>
                  <div style={{ background: 'rgba(244,167,44,0.08)', border: '1px solid rgba(244,167,44,0.25)', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.55 }}>
                    The Concierge Team will confirm the routing with Tropic and lock the airport before quoting. Allow an extra 24 hours for custom destinations.
                  </div>
                </>
              )}

              {/* Route preview card — mirrors the Step 1 preview on the
                  excursion wizard so the member sees the route locked
                  in before they advance. */}
              {((isCustomDest && customDestName.trim()) || (!isCustomDest && origin.code !== dest.code)) && (
                <div style={{ background: 'var(--warm)', border: '1px solid var(--hair)', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 18, color: 'var(--ink)' }}>
                    {origin.name} → {isCustomDest ? customDestName.trim() : dest.name}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink-mid)' }}>
                    {isCustomDest
                      ? `${origin.code} (${origin.sub}) → custom · awaiting Concierge confirmation`
                      : `${origin.code} (${origin.sub}) → ${dest.code} (${dest.sub})`}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step 2 · When ── */}
          {step === 2 && (
            <div>
              <div className="wiz-step-eyebrow">Step 2 of 4 · When</div>
              <h2 className="wiz-step-title">When are you flying?</h2>
              <p className="wiz-step-sub">Choose one-way or round trip, then your dates and times.</p>
              <div className="field">{tripToggle}</div>
              <div className="row-2">
                <div className="field">
                  <label className="field-lab">Departure date <span className="req">*</span></label>
                  <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} min={today} />
                  {date && blackout.has(date) && (
                    <div style={{ fontSize: 11.5, color: 'var(--signal)', marginTop: 4, fontWeight: 600 }}>✕ No Tropic aircraft available on this date.</div>
                  )}
                </div>
                <TimeInput label="Departure time" value={departTime} onChange={setDepartTime} />
              </div>
              {isRoundTrip && (
                <>
                  <div style={{ height: 1, background: 'var(--hair)', margin: '14px 0' }} />
                  <div className="row-2">
                    <div className="field">
                      <label className="field-lab">Return date <span className="req">*</span></label>
                      <input type="date" className="input" value={returnDate} onChange={e => setReturnDate(e.target.value)} min={date || today} />
                    </div>
                    <TimeInput label="Return departure time" value={returnDepartTime} onChange={setReturnDepartTime} />
                  </div>
                </>
              )}
              <LastMinuteNotice date={date} time={departTime} />
            </div>
          )}

          {/* ── Step 3 · Party ── */}
          {step === 3 && (
            <div>
              <div className="wiz-step-eyebrow">Step 3 of 4 · Your party</div>
              <h2 className="wiz-step-title">Who&apos;s flying with you?</h2>
              <p className="wiz-step-sub">Pick the aircraft and add your guests. You hold seat&nbsp;1; each guest takes another seat.</p>

              <div className="field">
                <label className="field-lab">Aircraft</label>
                <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 10, overflow: 'hidden' }}>
                  {([4, 8] as const).map((cap, i) => (
                    <div key={cap} className="toggle-row" style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: i === 0 ? '1px solid var(--hair)' : 'none' }} onClick={() => setAircraft(cap)}>
                      <div>
                        <div className="t-lab">{cap === 4 ? 'Cessna 206' : 'Cessna Grand Caravan'}</div>
                        <div className="t-sub">{cap === 4 ? '4 seats · amphibious single' : '8 seats · turboprop'}</div>
                      </div>
                      <div className={`toggle${aircraft === cap ? ' active' : ''}`} style={{ pointerEvents: 'none' }} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="field">
                <label className="field-lab">Your party · {pax} of {aircraft} seats</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', border: '1px solid var(--hair)', borderRadius: 10, background: 'var(--warm)', marginBottom: 10 }}>
                  <span className="pill tropic" style={{ fontSize: 10 }}>SEAT 1</span>
                  <span style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 500 }}>You</span>
                </div>

                {guests.map((g, i) => (
                  <div key={i} className="wiz-guest">
                    <div className="wiz-guest-head">
                      <span className="mono" style={{ fontSize: 10, color: 'var(--ink-light)' }}>GUEST · SEAT {i + 2}</span>
                      <button onClick={() => removeGuest(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--signal)', fontSize: 12.5, fontWeight: 500 }}>Remove</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <input className="input" placeholder="First name *" value={g.first_name} onChange={e => updateGuest(i, { first_name: e.target.value })} />
                      <input className="input" placeholder="Last name *" value={g.last_name} onChange={e => updateGuest(i, { last_name: e.target.value })} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
                      <label style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-light)' }}>Date of birth *</label>
                      <input className="input" type="date" value={g.date_of_birth} onChange={e => updateGuest(i, { date_of_birth: e.target.value })} max={today} />
                    </div>
                  </div>
                ))}

                <button className="btn-ghost" style={{ width: '100%', height: 40 }} onClick={addGuest} disabled={pax >= aircraft}>
                  {pax >= aircraft ? 'Aircraft is full' : '+ Add guest'}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 4 · Review ── */}
          {step === 4 && (
            <div>
              <div className="wiz-step-eyebrow">Step 4 of 4 · Review</div>
              <h2 className="wiz-step-title">Review &amp; send</h2>
              <p className="wiz-step-sub">Confirm the details and send to the Concierge Team. They&apos;ll quote pricing with Tropic before it goes live.</p>

              <div className="field">
                <label className="field-lab">Sharing</label>
                <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 10, overflow: 'hidden' }}>
                  {(['public', 'private'] as const).map((v, i) => (
                    <div key={v} className="toggle-row" style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: i === 0 ? '1px solid var(--hair)' : 'none' }} onClick={() => setVisibility(v)}>
                      <div>
                        <div className="t-lab">{v === 'public' ? 'Open to network' : 'Private charter'}</div>
                        <div className="t-sub">{v === 'public' ? 'Spare seats listed to members' : 'Full aircraft for your party only'}</div>
                      </div>
                      <div className={`toggle${visibility === v ? ' active' : ''}`} style={{ pointerEvents: 'none' }} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="field">
                <label className="field-lab">Trip name</label>
                <input type="text" className="input" placeholder={suggestedName} value={tripName} onChange={e => setTripName(e.target.value)} maxLength={80} />
              </div>

              <div className="field">
                <label className="field-lab">Pitch <span style={{ color: 'var(--ink-faint)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
                <textarea className="input" placeholder="Entice members to join: what makes this trip special?" value={pitch} onChange={e => setPitch(e.target.value)} rows={3} maxLength={400} />
              </div>

              <div className="wiz-summary" style={{ marginTop: 6 }}>
                {[
                  { label: 'Route', value: `${origin.name} ${isRoundTrip ? '⇄' : '→'} ${isCustomDest ? (customDestName.trim() || 'Custom destination') : dest.name}${isCustomDest ? ' (custom, the Concierge Team will confirm)' : ''}` },
                  { label: 'Trip type', value: isRoundTrip ? 'Round trip' : 'One way' },
                  { label: 'Departs', value: date || '—' },
                  { label: 'Departure time', value: departTime },
                  ...(isRoundTrip ? [
                    { label: 'Returns', value: returnDate || '—' },
                    { label: 'Return time', value: returnDepartTime },
                  ] : []),
                  { label: 'Aircraft', value: aircraftLabel },
                  { label: 'Block time', value: blockTime },
                  { label: 'Your party', value: `${pax} seat${pax > 1 ? 's' : ''}` },
                  { label: 'Open to fill', value: visibility === 'private' ? 'No' : `${openSeats} seat${openSeats !== 1 ? 's' : ''}` },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div className="mono" style={{ marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{value}</div>
                  </div>
                ))}
              </div>

              <div style={{ background: 'var(--tropic-glow)', border: '1px solid rgba(0,179,199,0.2)', borderRadius: 10, padding: '14px 16px', marginTop: 14 }}>
                <div className="mono" style={{ color: 'var(--tropic-d)', marginBottom: 6 }}>Pricing</div>
                <p style={{ fontSize: 12.5, color: 'var(--ink-mid)', lineHeight: 1.55, margin: 0 }}>
                  The Concierge Team will source a Tropic quote, add Travail&apos;s 3% service fee, and send it to you for review. <strong style={{ color: 'var(--ink)' }}>No card is captured until you accept the quote</strong>. You&apos;ll get a notification with the total to review.
                </p>
              </div>

              <LastMinuteNotice date={date} time={departTime} />

              <div style={{ marginTop: 14 }}>
                <AnchorCardSetup onCardReady={() => setHasCard(true)} />
              </div>
            </div>
          )}

          {error && (
            <div style={{ background: 'rgba(217,78,42,0.08)', border: '1px solid rgba(217,78,42,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--signal)', marginTop: 16 }}>
              {error}
            </div>
          )}

          <div className="wiz-nav">
            <button className="btn-ghost" onClick={back}>{step === 1 ? '← Trip type' : '← Back'}</button>
            {step < 4 ? (
              <button className="btn-primary" onClick={next}>Next →</button>
            ) : (
              <button
                className="btn-primary"
                onClick={handleSubmit}
                disabled={submitting || !hasCard}
                title={!hasCard ? 'Add a card on file above to submit.' : undefined}
              >
                {submitting ? (
                  <><span className="pending-indicator" style={{ width: 14, height: 14, borderWidth: 2 }} /> Submitting…</>
                ) : !hasCard ? 'Add a card to submit'
                : 'Submit to the Concierge Team →'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
