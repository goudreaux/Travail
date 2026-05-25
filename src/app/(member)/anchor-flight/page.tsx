'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fmtDur } from '@/lib/data'
import PageHero from '@/components/PageHero'
import TimeInput from '@/components/TimeInput'
import type { AirportMeta } from '@/lib/data'

const ANCHOR_ORIGINS: AirportMeta[] = [
  { code: 'TPF', name: 'Peter O. Knight Airport', sub: 'Davis Island, Tampa', role: 'origin' },
  { code: 'TPA', name: 'Tampa International Airport', sub: 'Tampa, FL', role: 'origin' },
  { code: 'FLL', name: 'Fort Lauderdale-Hollywood Intl', sub: 'Fort Lauderdale, FL', role: 'origin' },
]

const ANCHOR_DESTS: AirportMeta[] = [
  { code: 'WHV', name: 'Country Club of Winter Haven', sub: 'Winter Haven, FL', role: 'destination' },
  { code: 'SRS', name: 'St. Regis Sarasota', sub: 'Sarasota, FL', role: 'destination' },
  { code: 'EYW', name: 'Key West', sub: 'Key West, FL', role: 'destination' },
  { code: 'ISM', name: 'Islamorada', sub: 'Florida Keys, FL', role: 'destination' },
  { code: 'HMI', name: 'Honeymoon Island', sub: 'Dunedin, FL', role: 'destination' },
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
        <span style={{ fontWeight: 600, marginRight: 6, color: 'var(--ink)' }}>{value.code}</span>
        <span style={{ fontSize: 12, color: 'var(--ink-light)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value.name}</span>
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
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', color: 'var(--tropic-d)', minWidth: 36 }}>{a.code}</span>
              <span style={{ flex: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', display: 'block', lineHeight: 1.3 }}>{a.name}</span>
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
  const [error, setError] = useState('')
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)

  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setIsAdmin(false); return }
      const { data } = await supabase.from('members').select('is_admin').eq('user_id', user.id).single()
      setIsAdmin(data?.is_admin ?? false)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (isAdmin === null) return null

  if (!isAdmin) return (
    <div className="page">
      <PageHero eyebrow="ANCHOR A FLIGHT" title="Coming soon." sub="This feature is under development. Check back soon." />
    </div>
  )

  const pax = 1 + guests.length
  const isRoundTrip = tripType === 'round-trip'
  const openSeats = visibility === 'private' ? 0 : Math.max(0, aircraft - pax)
  const anchorSeats = visibility === 'private' ? aircraft : pax
  const aircraftLabel = aircraft === 4 ? 'Cessna 206' : 'Cessna Grand Caravan'
  const blockTime = fmtDur(90)
  const suggestedName = `${origin.name} → ${dest.name}`
  const effectiveName = tripName.trim() || suggestedName
  const today = new Date().toISOString().split('T')[0]

  const updateGuest = (i: number, patch: Partial<GuestEntry>) =>
    setGuests(gs => gs.map((g, idx) => idx === i ? { ...g, ...patch } : g))
  const addGuest = () => { if (pax >= aircraft) return; setGuests(gs => [...gs, { first_name: '', last_name: '', date_of_birth: '' }]) }
  const removeGuest = (i: number) => setGuests(gs => gs.filter((_, idx) => idx !== i))

  function validateStep(s: number): string | null {
    if (s === 1 && origin.code === dest.code) return 'Origin and destination must be different.'
    if (s === 2) {
      if (!date) return 'Select a departure date.'
      if (isRoundTrip && !returnDate) return 'Select a return date.'
      if (isRoundTrip && returnDate < date) return 'Return date must be on or after departure.'
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
  function back() { setError(''); setStep(s => Math.max(1, s - 1)) }

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
            destCode: dest.code,
            destName: dest.name,
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
              We&apos;ve received your <strong>{origin.name} → {dest.name}</strong> anchor request.
            </p>
            <p style={{ fontSize: 13, color: 'var(--ink-faint)', lineHeight: 1.5, margin: '0 0 32px' }}>
              The Travail team will get a quote from Tropic and reach back out to confirm pricing before your anchor goes live to the network.
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
        eyebrow="ANCHOR A FLIGHT"
        title="Anchor a Flight"
        sub="Set your route, lock your seats, and invite the network to fill the rest."
      />

      <div className="page-view">
        <div className="wiz">
          <div className="wiz-progress">
            {STEPS.map((_, i) => <div key={i} className={`seg${i + 1 <= step ? ' done' : ''}`} />)}
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
              <p className="wiz-step-sub">Confirm the details and send to Ops. They&apos;ll quote pricing with Tropic before it goes live.</p>

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
                <textarea className="input" placeholder="Entice members to join — what makes this trip special?" value={pitch} onChange={e => setPitch(e.target.value)} rows={3} maxLength={400} />
              </div>

              <div className="wiz-summary" style={{ marginTop: 6 }}>
                {[
                  { label: 'Route', value: `${origin.code} ${isRoundTrip ? '⇄' : '→'} ${dest.code}` },
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
                  Seat pricing is confirmed by the Travail team. We&apos;ll check with Tropic for a quote and reach out before your anchor goes live.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div style={{ background: 'rgba(217,78,42,0.08)', border: '1px solid rgba(217,78,42,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--signal)', marginTop: 16 }}>
              {error}
            </div>
          )}

          <div className="wiz-nav">
            {step > 1 && <button className="btn-ghost" onClick={back}>← Back</button>}
            {step < 4 ? (
              <button className="btn-primary" onClick={next}>Next →</button>
            ) : (
              <button className="btn-primary" onClick={handleSubmit} disabled={submitting}>
                {submitting ? (
                  <><span className="pending-indicator" style={{ width: 14, height: 14, borderWidth: 2 }} /> Submitting…</>
                ) : 'Submit to Ops →'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
