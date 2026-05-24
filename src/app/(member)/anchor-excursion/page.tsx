'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ORIGINS, DESTINATIONS } from '@/lib/data'
import PageHero from '@/components/PageHero'
import TimeInput from '@/components/TimeInput'
import type { AirportMeta } from '@/lib/data'

const EXCURSION_DESTS: AirportMeta[] = DESTINATIONS

function AirportDropdown<T extends AirportMeta>({
  value,
  options,
  onChange,
}: {
  value: T
  options: T[]
  onChange: (a: T) => void
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
        <span style={{ fontSize: 12, color: 'var(--ink-light)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value.sub}</span>
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

export default function AnchorExcursionPage() {
  const [origin, setOrigin] = useState<AirportMeta>(ORIGINS[0])
  const [dest, setDest] = useState<AirportMeta>(EXCURSION_DESTS[0])
  const [aircraft, setAircraft] = useState<4 | 8>(8)
  const [tripType, setTripType] = useState<'day' | 'overnight'>('day')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('9:00 AM')
  const [departTime, setDepartTime] = useState('7:00 AM')
  const [returnTime, setReturnTime] = useState('4:00 PM')
  const [tripName, setTripName] = useState('')
  const [pitch, setPitch] = useState('')
  const [experienceName, setExperienceName] = useState('')
  const [operatorName, setOperatorName] = useState('')
  const [priceInput, setPriceInput] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [pax, setPax] = useState(2)
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

  useEffect(() => {
    if (pax > aircraft) setPax(aircraft)
  }, [aircraft]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setReturnTime(tripType === 'day' ? '4:00 PM' : '9:00 AM')
  }, [tripType])

  if (isAdmin === null) return null

  if (!isAdmin) return (
    <div className="page">
      <PageHero eyebrow="ANCHOR AN EXCURSION" title="Coming soon." sub="This feature is under development. Check back soon." />
    </div>
  )

  const capacity = aircraft
  const openSeats = visibility === 'private' ? 0 : Math.max(0, capacity - pax)
  const anchorSeats = visibility === 'private' ? capacity : pax
  const pricePerPax = parseFloat(priceInput) || 0
  const total = pricePerPax * anchorSeats
  const aircraftLabel = aircraft === 4 ? 'Cessna 206' : 'Cessna Grand Caravan'

  async function handleSubmit() {
    if (!date) { setError('Please set a departure date.'); return }
    if (!tripName.trim()) { setError('Please enter a trip name.'); return }
    setError('')
    setSubmitting(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: member } = await supabase
        .from('members')
        .select('id')
        .eq('user_id', user.id)
        .single()
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
            tripType,
            departTime,
            startTime,
            returnTime,
            aircraftId: aircraft === 4 ? 'c206' : 'caravan',
            experienceName: experienceName.trim() || null,
            experienceOperator: operatorName.trim() || null,
            name: tripName,
            pitch,
            visibility,
            spotsTotal: capacity,
            spotsAnchor: anchorSeats,
            pricePerPax,
          },
          status: 'pending',
        })
        .select()
        .single()

      if (insertError) throw insertError

      if (data) {
        try {
          await supabase.from('notifications').insert({
            id: crypto.randomUUID(),
            member_id: member.id,
            kind: 'system',
            title: 'Excursion anchor submitted',
            body: 'Ops will confirm availability and open spots to the network.',
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
            background: 'var(--card)',
            border: '1px solid var(--hair)',
            borderRadius: 18,
            padding: '48px 52px',
            maxWidth: 480,
            width: '100%',
            textAlign: 'center',
            boxShadow: '0 8px 40px rgba(13,51,64,0.08)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 24 }}>
              <div className="pending-indicator" />
              <span className="mono" style={{ color: 'var(--tropic-d)' }}>In review</span>
            </div>
            <h2 className="display-i" style={{ fontSize: 32, color: 'var(--ink)', margin: '0 0 12px' }}>
              Anchor in review.
            </h2>
            <p style={{ fontSize: 14, color: 'var(--ink-light)', lineHeight: 1.6, margin: '0 0 8px' }}>
              Ops is confirming availability for your <strong>{dest.sub}</strong> excursion.
            </p>
            <p style={{ fontSize: 13, color: 'var(--ink-faint)', lineHeight: 1.5, margin: '0 0 32px' }}>
              You'll receive a notification once your anchor is approved and spots open to the network.
            </p>
            <div style={{
              background: 'var(--warm)',
              borderRadius: 10,
              padding: '14px 18px',
              marginBottom: 28,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span className="mono">Submission ID</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', color: 'var(--ink)' }}>{submitted.id}</span>
            </div>
            <button className="btn-ghost" onClick={() => router.push('/flights')} style={{ width: '100%' }}>
              Back to flights
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <PageHero
        eyebrow="ANCHOR AN EXCURSION"
        title="Anchor an Excursion"
        sub="Set up a destination experience and invite the network to join."
      />

      <div className="page-view">
        <div className="builder">
          {/* ── Left: Form ── */}
          <div className="builder-form">

            {/* Route */}
            <div className="field">
              <label className="field-lab">Route <span className="req">*</span></label>
              <div className="select-row" style={{ alignItems: 'stretch' }}>
                <AirportDropdown value={origin} options={ORIGINS} onChange={setOrigin} />
                <div style={{ display: 'flex', alignItems: 'center', padding: '0 8px', color: 'var(--ink-faint)', fontSize: 18, flexShrink: 0 }}>→</div>
                <AirportDropdown value={dest} options={EXCURSION_DESTS} onChange={setDest} />
              </div>
            </div>

            {/* Aircraft */}
            <div className="field">
              <label className="field-lab">Aircraft</label>
              <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 10, overflow: 'hidden' }}>
                {([4, 8] as const).map((cap, i) => (
                  <div
                    key={cap}
                    className="toggle-row"
                    style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: i === 0 ? '1px solid var(--hair)' : 'none' }}
                    onClick={() => setAircraft(cap)}
                  >
                    <div>
                      <div className="t-lab">{cap === 4 ? 'Cessna 206' : 'Cessna Grand Caravan'}</div>
                      <div className="t-sub">{cap === 4 ? '4 seats · amphibious single' : '8 seats · turboprop'}</div>
                    </div>
                    <div className={`toggle${aircraft === cap ? ' active' : ''}`} style={{ pointerEvents: 'none' }} />
                  </div>
                ))}
              </div>
            </div>

            {/* Experience details */}
            <div className="field">
              <label className="field-lab">Experience name</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. Flats Fishing, Snorkel Charter, Golf Day"
                value={experienceName}
                onChange={e => setExperienceName(e.target.value)}
                maxLength={80}
              />
            </div>

            <div className="field">
              <label className="field-lab">Operator / Vendor</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. Keys Seaplanes, Island Water Sports"
                value={operatorName}
                onChange={e => setOperatorName(e.target.value)}
                maxLength={80}
              />
            </div>

            {/* Pricing note */}
            <div style={{
              background: 'var(--tropic-glow)',
              border: '1px solid rgba(0,179,199,0.25)',
              borderRadius: 10,
              padding: '12px 16px',
              fontSize: 13,
              color: 'var(--tropic-d)',
              lineHeight: 1.55,
            }}>
              <strong>Pricing</strong> — Enter the price per person if confirmed. Otherwise leave blank and the Travail team will follow up with the operator to confirm before this anchor goes live.
            </div>

            <div className="field">
              <label className="field-lab">Price per person (USD)</label>
              <input
                type="number"
                className="input"
                placeholder="e.g. 450"
                value={priceInput}
                onChange={e => setPriceInput(e.target.value)}
                min={0}
              />
            </div>

            {/* Trip type */}
            <div className="field">
              <label className="field-lab">Trip type</label>
              <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 10, overflow: 'hidden' }}>
                {(['day', 'overnight'] as const).map((t, i) => (
                  <div
                    key={t}
                    className="toggle-row"
                    style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: i === 0 ? '1px solid var(--hair)' : 'none' }}
                    onClick={() => setTripType(t)}
                  >
                    <div>
                      <div className="t-lab">{t === 'day' ? 'Day trip' : 'Overnight stay'}</div>
                      <div className="t-sub">{t === 'day' ? 'Depart and return same day' : 'Stay one or more nights'}</div>
                    </div>
                    <div className={`toggle${tripType === t ? ' active' : ''}`} style={{ pointerEvents: 'none' }} />
                  </div>
                ))}
              </div>
            </div>

            {/* Date */}
            <div className="field">
              <label className="field-lab">Date <span className="req">*</span></label>
              <input
                type="date"
                className="input"
                value={date}
                onChange={e => setDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>

            {/* Times */}
            <div className="row-2">
              <TimeInput label={`Departure from ${origin.code}`} value={departTime} onChange={setDepartTime} />
              <TimeInput label={`Start at ${dest.code}`} value={startTime} onChange={setStartTime} />
            </div>
            <TimeInput label={`Return wheels-up from ${dest.code}`} value={returnTime} onChange={setReturnTime} />

            {/* Trip name */}
            <div className="field">
              <label className="field-lab">Trip name <span className="req">*</span></label>
              <input
                type="text"
                className="input"
                placeholder={`e.g. ${dest.sub} ${tripType === 'day' ? 'day trip' : 'getaway'}`}
                value={tripName}
                onChange={e => setTripName(e.target.value)}
                maxLength={80}
              />
            </div>

            {/* Pitch */}
            <div className="field">
              <label className="field-lab">Pitch</label>
              <textarea
                className="input"
                placeholder="Entice members to join — what makes this excursion special?"
                value={pitch}
                onChange={e => setPitch(e.target.value)}
                rows={3}
                maxLength={400}
              />
            </div>

            {/* Visibility */}
            <div className="field">
              <label className="field-lab">Visibility</label>
              <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 10, overflow: 'hidden' }}>
                {(['public', 'private'] as const).map((v, i) => (
                  <div
                    key={v}
                    className="toggle-row"
                    style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: i === 0 ? '1px solid var(--hair)' : 'none' }}
                    onClick={() => setVisibility(v)}
                  >
                    <div>
                      <div className="t-lab">{v === 'public' ? 'Open to network' : 'Private group'}</div>
                      <div className="t-sub">{v === 'public' ? 'Empty spots listed to members' : 'Closed to your party only'}</div>
                    </div>
                    <div className={`toggle${visibility === v ? ' active' : ''}`} style={{ pointerEvents: 'none' }} />
                  </div>
                ))}
              </div>
            </div>

            {/* Party size */}
            <div className="field">
              <label className="field-lab">Your party</label>
              <div className="chips">
                {Array.from({ length: capacity }, (_, i) => i + 1).map(n => (
                  <button
                    key={n}
                    className={`chip${pax === n ? ' active' : ''}`}
                    onClick={() => setPax(n)}
                  >
                    {n} {n === 1 ? 'person' : 'people'}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div style={{ background: 'rgba(217,78,42,0.08)', border: '1px solid rgba(217,78,42,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--signal)' }}>
                {error}
              </div>
            )}
          </div>

          {/* ── Right: Live Preview ── */}
          <div className="preview">
            <div className="preview-head">Live preview</div>
            <div className="preview-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Trip name */}
              <div>
                <div className="mono" style={{ marginBottom: 4 }}>Trip name</div>
                <div className="display-i" style={{ fontSize: 22, color: 'var(--ink)', lineHeight: 1.2 }}>
                  {tripName || <span style={{ color: 'var(--ink-faint)', fontStyle: 'italic' }}>Your excursion name…</span>}
                </div>
              </div>

              {/* Pitch */}
              {pitch && (
                <div style={{
                  background: 'var(--warm)',
                  borderLeft: '3px solid var(--tropic)',
                  borderRadius: '0 6px 6px 0',
                  padding: '10px 14px',
                  fontStyle: 'italic',
                  fontFamily: 'var(--display)',
                  fontSize: 14,
                  color: 'var(--ink-mid)',
                  lineHeight: 1.55,
                }}>
                  "{pitch}"
                </div>
              )}

              {/* Experience preview */}
              {(experienceName || operatorName) && (
                <div style={{
                  background: 'var(--warm)',
                  borderRadius: 10,
                  padding: '12px 16px',
                }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--tropic-d)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
                    {dest.sub}
                  </div>
                  {experienceName && (
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3, marginBottom: 2 }}>
                      {experienceName}
                    </div>
                  )}
                  {operatorName && (
                    <div style={{ fontSize: 12, color: 'var(--ink-light)' }}>
                      {operatorName}
                    </div>
                  )}
                </div>
              )}

              {/* Route */}
              <div style={{
                background: 'var(--night)',
                borderRadius: 10,
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 32, fontWeight: 500, color: '#fff', lineHeight: 1 }}>{origin.code}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', marginTop: 4 }}>{origin.sub}</div>
                </div>
                <div style={{ color: 'var(--tropic)', fontSize: 20, flex: 1, textAlign: 'center' }}>
                  {tripType === 'overnight' ? '⇄' : '→'}
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 32, fontWeight: 500, color: '#fff', lineHeight: 1 }}>{dest.code}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', marginTop: 4 }}>{dest.sub}</div>
                </div>
              </div>

              {/* Summary grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--hair)', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--hair)' }}>
                {[
                  { label: 'Date', value: date || '—' },
                  { label: 'Trip type', value: tripType === 'day' ? 'Day trip' : 'Overnight' },
                  { label: 'Departs', value: departTime },
                  { label: 'Start time', value: startTime },
                  { label: 'Return', value: returnTime },
                  { label: 'Aircraft', value: aircraftLabel },
                  { label: 'Party', value: `${pax} ${pax === 1 ? 'person' : 'people'}` },
                  { label: 'Open spots', value: visibility === 'private' ? 'Private' : `${openSeats}` },
                  { label: 'Per person', value: pricePerPax > 0 ? `$${pricePerPax.toLocaleString()}` : 'TBD' },
                  { label: 'Operator', value: operatorName || '—' },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: 'var(--card)', padding: '10px 14px' }}>
                    <div className="mono" style={{ marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3 }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Total */}
              <div style={{
                background: 'var(--warm)',
                borderRadius: 10,
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div>
                  <div className="mono">Your total</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-light)', marginTop: 2 }}>
                    {anchorSeats} {anchorSeats === 1 ? 'person' : 'people'} × {pricePerPax > 0 ? `$${pricePerPax.toLocaleString()}` : 'TBD'}
                  </div>
                </div>
                <div style={{ fontFamily: 'var(--display)', fontSize: 28, fontWeight: 500, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
                  {total > 0 ? `$${total.toLocaleString()}` : 'TBD'}
                </div>
              </div>

              {/* Submit */}
              <button
                className="btn-primary"
                style={{ width: '100%', height: 44, fontSize: 14, justifyContent: 'center' }}
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <span className="pending-indicator" style={{ width: 14, height: 14, borderWidth: 2 }} />
                    Submitting…
                  </>
                ) : (
                  'Submit anchor to Ops →'
                )}
              </button>

            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
