'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import PageHero from '@/components/PageHero'
import { AnchorCardSetup } from '@/components/AnchorCardSetup'
import { LastMinuteNotice } from '@/components/LastMinuteNotice'
import TimeInput from '@/components/TimeInput'
import { canAnchor } from '@/lib/trip-timing'
import type { AirportMeta } from '@/lib/data'
import type { ExcursionTemplate } from '@/lib/supabase/types'

// Seaplane departure bases for excursions.
const EXCURSION_ORIGINS: AirportMeta[] = [
  { code: 'KTPF', name: 'Davis Island', sub: 'Tampa, FL', role: 'origin' },
  { code: 'KFXE', name: 'Fort Lauderdale Exec', sub: 'Fort Lauderdale, FL', role: 'origin' },
]

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
        <span style={{ fontWeight: 600, marginRight: 6, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value.name}</span>
        <span style={{ fontSize: 12, color: 'var(--ink-light)', flexShrink: 0 }}>({value.code})</span>
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

export default function AnchorExcursionPage() {
  const [step, setStep] = useState(1)
  const [origin, setOrigin] = useState<AirportMeta>(EXCURSION_ORIGINS[0])
  const [templates, setTemplates] = useState<ExcursionTemplate[]>([])
  const [templateId, setTemplateId] = useState('')
  const [airportName, setAirportName] = useState<Record<string, string>>({})
  const [aircraft, setAircraft] = useState<4 | 8>(8)
  const [dayType, setDayType] = useState<'day' | 'overnight'>('day')
  const [date, setDate] = useState('')
  const [returnDate, setReturnDate] = useState('')
  const [departTime, setDepartTime] = useState('7:00 AM')
  const [startTime, setStartTime] = useState('9:00 AM')
  const [returnTime, setReturnTime] = useState('4:00 PM')
  const [guests, setGuests] = useState<GuestEntry[]>([])
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [tripName, setTripName] = useState('')
  const [pitch, setPitch] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Gate Submit on a saved card; Ops can't publish without one.
  const [hasCard, setHasCard] = useState(false)
  const [submitted, setSubmitted] = useState<{ id: string } | null>(null)
  const [error, setError] = useState('')
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)

  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setIsAdmin(false); return }
      const { data: m } = await supabase.from('members').select('is_admin').eq('user_id', user.id).single()
      setIsAdmin(m?.is_admin ?? false)
      // Anchoring is open to every member — always load the templates/airports.
      const [{ data: tpls }, { data: aps }] = await Promise.all([
        supabase.from('excursion_templates').select('*').order('name'),
        supabase.from('airports').select('code, name'),
      ])
      const am: Record<string, string> = {}
      for (const a of (aps ?? []) as { code: string; name: string }[]) am[a.code] = a.name
      setAirportName(am)
      const list = (tpls ?? []) as ExcursionTemplate[]
      setTemplates(list)
      if (list.length) setTemplateId(list[0].id)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const STEPS = ['Experience', 'Route', 'When', 'Party', 'Review']
  const tpl = templates.find(t => t.id === templateId) || null
  const destCode = tpl?.dest_code ?? ''
  const destName = airportName[destCode] || destCode
  const experienceName = tpl?.name ?? ''
  const operatorName = tpl?.operator ?? ''
  const isOvernight = dayType === 'overnight'

  const pax = 1 + guests.length
  const capacity = aircraft
  const openSeats = visibility === 'private' ? 0 : Math.max(0, capacity - pax)
  const anchorSeats = visibility === 'private' ? capacity : pax
  const aircraftLabel = aircraft === 4 ? 'Cessna 206' : 'Cessna Grand Caravan'
  const suggestedName = experienceName || (destName ? `${destName} excursion` : 'Excursion')
  const effectiveName = tripName.trim() || suggestedName
  const today = new Date().toISOString().split('T')[0]

  const updateGuest = (i: number, patch: Partial<GuestEntry>) =>
    setGuests(gs => gs.map((g, idx) => idx === i ? { ...g, ...patch } : g))
  const addGuest = () => { if (pax >= capacity) return; setGuests(gs => [...gs, { first_name: '', last_name: '', date_of_birth: '' }]) }
  const removeGuest = (i: number) => setGuests(gs => gs.filter((_, idx) => idx !== i))

  function validateStep(s: number): string | null {
    if (s === 1 && !templateId) return 'Pick an experience to anchor.'
    if (s === 2 && origin.code === destCode) return 'Origin and destination must be different.'
    if (s === 3) {
      if (!date) return 'Select a date.'
      if (isOvernight && !returnDate) return 'Select a return date.'
      if (isOvernight && returnDate < date) return 'Return date must be on or after the start date.'
      const gate = canAnchor(date, departTime ?? startTime)
      if (!gate.ok) return gate.reason
    }
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
    const err = validateStep(1) || validateStep(2) || validateStep(3) || validateStep(4)
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
            templateId,
            originCode: origin.code,
            destCode,
            date,
            returnDate: isOvernight ? returnDate : null,
            tripType: dayType,
            departTime,
            startTime,
            returnTime,
            aircraftId: aircraft === 4 ? 'c206' : 'caravan',
            experienceName: experienceName || null,
            experienceOperator: operatorName || null,
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
        // Ping ops by email so the submission lands in their inbox in
        // addition to the queue. Non-blocking — the booking is already
        // saved; this is just the ops record.
        try {
          await fetch('/api/anchor/notify-submitted', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ submissionId: (data as { id: string }).id }),
          })
        } catch { /* ops will still see the row in the queue */ }
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
              Ops will confirm the operator + pricing and send you a quote to review. Nothing is charged until you accept it.
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
      <PageHero eyebrow="PLAN A TRIP · EXCURSION" title="Anchor an Excursion" sub="Pick an experience, lock your spots, and invite the network to fill the rest." />
      <div className="page-view">
        <div className="wiz">
          <div className="wiz-top">
            <div className="wiz-progress" style={{ flex: 1, margin: 0 }}>
              {STEPS.map((_, i) => <div key={i} className={`seg${i + 1 <= step ? ' done' : ''}`} />)}
            </div>
            <button className="wiz-cancel" onClick={() => router.push('/')}>Cancel ✕</button>
          </div>

          {step === 1 && (
            <div>
              <div className="wiz-step-eyebrow">Step 1 of {STEPS.length} · Experience</div>
              <h2 className="wiz-step-title">What experience are you anchoring?</h2>
              <p className="wiz-step-sub">Choose from the club&apos;s curated excursions.</p>
              {templates.length === 0 ? (
                <div style={{ background: 'var(--warm)', border: '1px solid var(--hair)', borderRadius: 10, padding: '16px 18px', fontSize: 13.5, color: 'var(--ink-mid)', lineHeight: 1.5 }}>
                  No excursion templates yet. Ask Ops to add experiences in the dashboard, then come back to anchor one.
                </div>
              ) : (
                <>
                  <div className="field">
                    <label className="field-lab">Experience <span className="req">*</span></label>
                    <select className="select" value={templateId} onChange={e => setTemplateId(e.target.value)}>
                      {templates.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.name}, {airportName[t.dest_code] || t.dest_code}{t.operator ? ` · ${t.operator}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  {tpl && (
                    <div style={{ background: 'var(--warm)', border: '1px solid var(--hair)', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ fontFamily: 'var(--display)', fontSize: 18, color: 'var(--ink)' }}>{tpl.name}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--ink-mid)' }}>
                        {destName}{tpl.operator ? ` · ${tpl.operator}` : ''}
                      </div>
                      {tpl.description && <div style={{ fontSize: 12.5, color: 'var(--ink-light)', lineHeight: 1.5 }}>{tpl.description}</div>}
                    </div>
                  )}
                  <div className="field" style={{ marginTop: 16 }}>
                    <label className="field-lab">Length</label>
                    <div style={{ display: 'flex', background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 10, padding: 4, gap: 4 }}>
                      {(['day', 'overnight'] as const).map(t => (
                        <button key={t} onClick={() => setDayType(t)} style={{ flex: 1, height: 36, border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s', background: dayType === t ? 'var(--tropic)' : 'transparent', color: dayType === t ? '#fff' : 'var(--ink-light)' }}>
                          {t === 'day' ? 'Day trip' : 'Overnight'}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {step === 2 && (
            <div>
              <div className="wiz-step-eyebrow">Step 2 of {STEPS.length} · Route</div>
              <h2 className="wiz-step-title">Where are you leaving from?</h2>
              <p className="wiz-step-sub">Your departure airport. The destination comes from the experience.</p>
              <div className="field"><label className="field-lab">From</label><AirportDropdown value={origin} options={EXCURSION_ORIGINS} onChange={setOrigin} /></div>
              <div className="field">
                <label className="field-lab">To</label>
                <div className="input" style={{ display: 'flex', alignItems: 'center', height: 38, color: 'var(--ink)', background: 'var(--warm)' }}>
                  <span style={{ fontWeight: 600, marginRight: 6 }}>{destName || '—'}</span>
                  {destCode && <span style={{ fontSize: 12, color: 'var(--ink-light)' }}>({destCode})</span>}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <div className="wiz-step-eyebrow">Step 3 of {STEPS.length} · When</div>
              <h2 className="wiz-step-title">When are you going?</h2>
              <p className="wiz-step-sub">Pick the date{isOvernight ? 's' : ''} and timing for the trip.</p>
              <div className="row-2">
                <div className="field">
                  <label className="field-lab">{isOvernight ? 'Start date' : 'Date'} <span className="req">*</span></label>
                  <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} min={today} />
                </div>
                {isOvernight && (
                  <div className="field">
                    <label className="field-lab">Return date <span className="req">*</span></label>
                    <input type="date" className="input" value={returnDate} onChange={e => setReturnDate(e.target.value)} min={date || today} />
                  </div>
                )}
              </div>
              <div className="row-2">
                <TimeInput label="Depart (flight out)" value={departTime} onChange={setDepartTime} />
                <TimeInput label="Experience start" value={startTime} onChange={setStartTime} />
              </div>
              <TimeInput label="Return (flight back)" value={returnTime} onChange={setReturnTime} />
              <LastMinuteNotice date={date} time={departTime ?? startTime} />
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
                <textarea className="input" placeholder="Entice members to join: what makes this special?" value={pitch} onChange={e => setPitch(e.target.value)} rows={3} maxLength={400} />
              </div>
              <div className="wiz-summary" style={{ marginTop: 6 }}>
                {[
                  { label: 'Experience', value: experienceName || '—' },
                  { label: 'Operator', value: operatorName || '—' },
                  { label: 'Route', value: `${origin.name} → ${destName || '—'}` },
                  { label: 'Length', value: isOvernight ? 'Overnight' : 'Day trip' },
                  { label: isOvernight ? 'Start date' : 'Date', value: date || '—' },
                  ...(isOvernight ? [{ label: 'Return date', value: returnDate || '—' }] : []),
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
                  Ops will confirm the operator pricing, add Travail&apos;s 3% service fee, and send the quote for your review. <strong style={{ color: 'var(--ink)' }}>No card is captured until you accept the quote</strong>. You&apos;ll get a notification with the total.
                </p>
              </div>

              <LastMinuteNotice date={date} time={departTime ?? startTime} />

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
            {step < STEPS.length ? (
              <button className="btn-primary" onClick={next}>Next →</button>
            ) : (
              <button
                className="btn-primary"
                onClick={handleSubmit}
                disabled={submitting || !hasCard}
                title={!hasCard ? 'Add a card on file above to submit.' : undefined}
              >
                {submitting ? (<><span className="pending-indicator" style={{ width: 14, height: 14, borderWidth: 2 }} /> Submitting…</>)
                : !hasCard ? 'Add a card to submit'
                : 'Submit to Ops →'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
