'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ORIGINS, DESTINATIONS } from '@/lib/data'
import PageHero from '@/components/PageHero'
import TimeInput from '@/components/TimeInput'
import type { AirportMeta } from '@/lib/data'

const EXCURSION_DESTS: AirportMeta[] = DESTINATIONS

type GuestEntry = { first_name: string; last_name: string; date_of_birth: string }

function AirportDropdown({
  value,
  options,
  onChange,
}: {
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
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--card)', border: '1px solid var(--hair-2)', borderRadius: 10, boxShadow: '0 8px 32px rgba(13,51,64,0.14)', zIndex: 50, maxHeight: 260, overflowY: 'auto' }}>
          {options.map(a => (
            <div
              key={a.code}
              onClick={() => { onChange(a); setOpen(false) }}
              style={{ padding: '9px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, background: a.code === value.code ? 'var(--tropic-glow)' : 'transparent', transition: 'background 0.1s' }}
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

export default function AnchorExcursionPage() {
  const [step, setStep] = useState(1)
  const [origin, setOrigin] = useState<AirportMeta>(ORIGINS[0])
  const [dest, setDest] = useState<AirportMeta>(EXCURSION_DESTS[0])
  const [aircraft, setAircraft] = useState<4 | 8>(8)
  const [dayType, setDayType] = useState<'day' | 'overnight'>('day')
  const [experienceName, setExperienceName] = useState('')
  const [operatorName, setOperatorName] = useState('')
  const [date, setDate] = useState('')
  const [departTime, setDepartTime] = useState('7:00 AM')
  const [startTime, setStartTime] = useState('9:00 AM')
  const [returnTime, setReturnTime] = useState('4:00 PM')
  const [guests, setGuests] = useState<GuestEntry[]>([])
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
      <PageHero eyebrow="PLAN A TRIP" title="Coming soon." sub="This feature is under development. Check back soon." />
    </div>
  )

  const STEPS = ['Route', 'Experience', 'When', 'Party', 'Review']
  const pax = 1 + guests.length
  const capacity = aircraft
  const openSeats = visibility === 'private' ? 0 : Math.max(0, capacity - pax)
  const anchorSeats = visibility === 'private' ? capacity : pax
  const aircraftLabel = aircraft === 4 ? 'Cessna 206' : 'Cessna Grand Caravan'
  const suggestedName = experienceName.trim() || `${dest.name} excursion`
  const effectiveName = tripName.trim() || suggestedName
  const today = new Date().toISOString().split('T')[0]

  const updateGuest = (i: number, patch: Partial<GuestEntry>) =>
    setGuests(gs => gs.map((g, idx) => idx === i ? { ...g, ...patch } : g))
  const addGuest = () => { if (pax >= capacity) return; setGuests(gs => [...gs, { first_name: '', last_name: '', date_of_birth: '' }]) }
  const removeGuest = (i: number) => setGuests(gs => gs.filter((_, idx) => idx !== i))

  function validateStep(s: number): string | null {
    if (s === 1 && origin.code === dest.code) return 'Origin and destination must be different.'
    if (s === 2 && !experienceName.trim()) return 'Name the experience (e.g. “Lobster Mini Season”).'
    if (s === 3 && !date) return 'Select a date.'
    if (s === 4) {
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
    setStep(s => Math.min(STEPS.length, s + 1))
  }
  function back() {
    setError('')
    if (step === 1) { router.push('/plan'); return }
    setStep(s => Math.max(1, s - 1))
  }

  async function handleSubmit() {
    const err = validateStep(2) || validateStep(3) || validateStep(4)
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
          kind: 'excursion',
          member_id: member.id,
          payload: {
            originCode: origin.code,
            destCode: dest.code,
            date,
            tripType: dayType,
            departTime,
            startTime,
            returnTime,
            aircraftId: aircraft === 4 ? 'c206' : 'caravan',
            experienceName: experienceName.trim() || null,
            experienceOperator: operatorName.trim() || null,
            name: effectiveName,
            pitch,
            visibility,
            spotsTotal: capacity,
            spotsAnchor: anchorSeats,
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
            body: 'The Travail team will confirm the operator and pricing with you.',
            ref: { kind: 'anchor', id: (data as { id: string }).id },
            read: false,
          } as never)
        } catch { /* supplementary */ }
        setSubmitted(data)
      }
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="page">
        <div className="page-view" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 480 }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 18, padding: '48px 52px', maxWidth: 480, width: '100%', textAlign: 'center', boxShadow: '0 8px 40px rgba(13,51,64,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 24 }}>
              <div className="pending-indicator" />
              <span className="mono" style={{ color: 'var(--tropic-d)' }}>In review</span>
            </div>
            <h2 className="display-i" style={{ fontSize: 32, color: 'var(--ink)', margin: '0 0 12px' }}>Anchor in review.</h2>
            <p style={{ fontSize: 14, color: 'var(--ink-light)', lineHeight: 1.6, margin: '0 0 8px' }}>
              We&apos;ve received your <strong>{effectiveName}</strong> excursion request.
            </p>
            <p style={{ fontSize: 13, color: 'var(--ink-faint)', lineHeight: 1.5, margin: '0 0 32px' }}>
              The Travail team will confirm the operator and pricing, then make it live to the network.
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

  return (
    <div className="page">
      <PageHero eyebrow="PLAN A TRIP · EXCURSION" title="Anchor an Excursion" sub="Set the experience, lock your spots, and invite the network to fill the rest." />
      <div className="page-view">
        <div className="wiz">
          <div className="wiz-progress">
            {STEPS.map((_, i) => <div key={i} className={`seg${i + 1 <= step ? ' done' : ''}`} />)}
          </div>

          {step === 1 && (
            <div>
              <div className="wiz-step-eyebrow">Step 1 of {STEPS.length} · Route</div>
              <h2 className="wiz-step-title">Where&apos;s the excursion?</h2>
              <p className="wiz-step-sub">Your departure airport and the destination. Origin defaults to your home base.</p>
              <div className="field"><label className="field-lab">From</label><AirportDropdown value={origin} options={ORIGINS} onChange={setOrigin} /></div>
              <div className="field"><label className="field-lab">To</label><AirportDropdown value={dest} options={EXCURSION_DESTS} onChange={setDest} /></div>
            </div>
          )}

          {step === 2 && (
            <div>
              <div className="wiz-step-eyebrow">Step 2 of {STEPS.length} · Experience</div>
              <h2 className="wiz-step-title">What&apos;s the experience?</h2>
              <p className="wiz-step-sub">Tell members what they&apos;re signing up for.</p>
              <div className="field">
                <label className="field-lab">Experience name <span className="req">*</span></label>
                <input className="input" placeholder="e.g. Lobster Mini Season" value={experienceName} onChange={e => setExperienceName(e.target.value)} maxLength={80} />
              </div>
              <div className="field">
                <label className="field-lab">Operator <span style={{ color: 'var(--ink-faint)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
                <input className="input" placeholder="e.g. Tropic Air, Bud N' Mary's" value={operatorName} onChange={e => setOperatorName(e.target.value)} maxLength={80} />
              </div>
              <div className="field">
                <label className="field-lab">Length</label>
                <div style={{ display: 'flex', background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 10, padding: 4, gap: 4 }}>
                  {(['day', 'overnight'] as const).map(t => (
                    <button key={t} onClick={() => setDayType(t)} style={{ flex: 1, height: 36, border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s', background: dayType === t ? 'var(--tropic)' : 'transparent', color: dayType === t ? '#fff' : 'var(--ink-light)' }}>
                      {t === 'day' ? 'Day trip' : 'Overnight'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <div className="wiz-step-eyebrow">Step 3 of {STEPS.length} · When</div>
              <h2 className="wiz-step-title">When are you going?</h2>
              <p className="wiz-step-sub">Pick the date and the timing for the day.</p>
              <div className="field">
                <label className="field-lab">Date <span className="req">*</span></label>
                <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} min={today} />
              </div>
              <div className="row-2">
                <TimeInput label="Depart (flight out)" value={departTime} onChange={setDepartTime} />
                <TimeInput label="Experience start" value={startTime} onChange={setStartTime} />
              </div>
              <TimeInput label="Return (flight back)" value={returnTime} onChange={setReturnTime} />
            </div>
          )}

          {step === 4 && (
            <div>
              <div className="wiz-step-eyebrow">Step 4 of {STEPS.length} · Your party</div>
              <h2 className="wiz-step-title">Who&apos;s coming with you?</h2>
              <p className="wiz-step-sub">Pick the aircraft and add your guests. You hold spot&nbsp;1; each guest takes another.</p>
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
                <label className="field-lab">Your party · {pax} of {capacity} spots</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', border: '1px solid var(--hair)', borderRadius: 10, background: 'var(--warm)', marginBottom: 10 }}>
                  <span className="pill tropic" style={{ fontSize: 10 }}>SPOT 1</span>
                  <span style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 500 }}>You</span>
                </div>
                {guests.map((g, i) => (
                  <div key={i} className="wiz-guest">
                    <div className="wiz-guest-head">
                      <span className="mono" style={{ fontSize: 10, color: 'var(--ink-light)' }}>GUEST · SPOT {i + 2}</span>
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
                <button className="btn-ghost" style={{ width: '100%', height: 40 }} onClick={addGuest} disabled={pax >= capacity}>
                  {pax >= capacity ? 'Aircraft is full' : '+ Add guest'}
                </button>
              </div>
            </div>
          )}

          {step === 5 && (
            <div>
              <div className="wiz-step-eyebrow">Step 5 of {STEPS.length} · Review</div>
              <h2 className="wiz-step-title">Review &amp; send</h2>
              <p className="wiz-step-sub">Confirm the details and send to Ops. They&apos;ll confirm the operator and pricing before it goes live.</p>
              <div className="field">
                <label className="field-lab">Sharing</label>
                <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 10, overflow: 'hidden' }}>
                  {(['public', 'private'] as const).map((v, i) => (
                    <div key={v} className="toggle-row" style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: i === 0 ? '1px solid var(--hair)' : 'none' }} onClick={() => setVisibility(v)}>
                      <div>
                        <div className="t-lab">{v === 'public' ? 'Open to network' : 'Private charter'}</div>
                        <div className="t-sub">{v === 'public' ? 'Spare spots listed to members' : 'Full aircraft for your party only'}</div>
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
                <textarea className="input" placeholder="Entice members to join — what makes this special?" value={pitch} onChange={e => setPitch(e.target.value)} rows={3} maxLength={400} />
              </div>
              <div className="wiz-summary" style={{ marginTop: 6 }}>
                {[
                  { label: 'Experience', value: experienceName.trim() || '—' },
                  { label: 'Operator', value: operatorName.trim() || '—' },
                  { label: 'Route', value: `${origin.code} → ${dest.code}` },
                  { label: 'Length', value: dayType === 'day' ? 'Day trip' : 'Overnight' },
                  { label: 'Date', value: date || '—' },
                  { label: 'Depart', value: departTime },
                  { label: 'Experience start', value: startTime },
                  { label: 'Return', value: returnTime },
                  { label: 'Aircraft', value: aircraftLabel },
                  { label: 'Your party', value: `${pax} spot${pax > 1 ? 's' : ''}` },
                  { label: 'Open to fill', value: visibility === 'private' ? 'No' : `${openSeats} spot${openSeats !== 1 ? 's' : ''}` },
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
                  Pricing is confirmed by the Travail team with the operator before your anchor goes live.
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
            <button className="btn-ghost" onClick={back}>{step === 1 ? '← Trip type' : '← Back'}</button>
            {step < STEPS.length ? (
              <button className="btn-primary" onClick={next}>Next →</button>
            ) : (
              <button className="btn-primary" onClick={handleSubmit} disabled={submitting}>
                {submitting ? (<><span className="pending-indicator" style={{ width: 14, height: 14, borderWidth: 2 }} /> Submitting…</>) : 'Submit to Ops →'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
