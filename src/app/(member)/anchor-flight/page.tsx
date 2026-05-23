'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fmtDur } from '@/lib/data'
import PageHero from '@/components/PageHero'
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

const HOURS = ['1','2','3','4','5','6','7','8','9','10','11','12']
const MINUTES = ['00','15','30','45']

function TimeInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  // Parse "9:00 AM" → { h: '9', m: '00', meridiem: 'AM' }
  const parse = (v: string) => {
    const match = v.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/)
    return match ? { h: match[1], m: match[2], meridiem: match[3] as 'AM' | 'PM' } : { h: '9', m: '00', meridiem: 'AM' as const }
  }
  const parsed = parse(value)
  const [h, setH] = useState(parsed.h)
  const [m, setM] = useState(parsed.m)
  const [meridiem, setMeridiem] = useState<'AM' | 'PM'>(parsed.meridiem)

  function emit(nh: string, nm: string, nmer: 'AM' | 'PM') {
    onChange(`${nh}:${nm} ${nmer}`)
  }

  const sel: React.CSSProperties = {
    height: 38,
    border: '1px solid var(--hair-2)',
    borderRadius: 8,
    background: 'var(--card)',
    color: 'var(--ink)',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    outline: 'none',
    appearance: 'none',
    WebkitAppearance: 'none',
    textAlign: 'center',
    padding: '0 8px',
  }

  return (
    <div className="field">
      <label className="field-lab">{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Hour */}
        <select
          style={{ ...sel, width: 58 }}
          value={h}
          onChange={e => { setH(e.target.value); emit(e.target.value, m, meridiem) }}
        >
          {HOURS.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <span style={{ color: 'var(--ink-faint)', fontWeight: 700, fontSize: 16, lineHeight: 1 }}>:</span>
        {/* Minute */}
        <select
          style={{ ...sel, width: 62 }}
          value={m}
          onChange={e => { setM(e.target.value); emit(h, e.target.value, meridiem) }}
        >
          {MINUTES.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        {/* AM / PM toggle */}
        <div style={{ display: 'flex', background: 'var(--card)', border: '1px solid var(--hair-2)', borderRadius: 8, overflow: 'hidden', height: 38 }}>
          {(['AM', 'PM'] as const).map(p => (
            <button
              key={p}
              type="button"
              onClick={() => { setMeridiem(p); emit(h, m, p) }}
              style={{
                width: 42,
                height: '100%',
                border: 'none',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.12s',
                background: meridiem === p ? 'var(--tropic)' : 'transparent',
                color: meridiem === p ? '#fff' : 'var(--ink-light)',
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function AirportDropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string
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

export default function AnchorFlightPage() {
  const [origin, setOrigin] = useState<AirportMeta>(ANCHOR_ORIGINS[0])
  const [dest, setDest] = useState<AirportMeta>(ANCHOR_DESTS[0])
  const [tripType, setTripType] = useState<'one-way' | 'round-trip'>('one-way')
  const [aircraft, setAircraft] = useState<4 | 8>(8)
  const [pax, setPax] = useState(2)
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

  useEffect(() => {
    if (pax > aircraft) setPax(aircraft)
  }, [aircraft]) // eslint-disable-line react-hooks/exhaustive-deps

  if (isAdmin === null) return null

  if (!isAdmin) return (
    <div className="page">
      <PageHero eyebrow="ANCHOR A FLIGHT" title="Coming soon." sub="This feature is under development. Check back soon." />
    </div>
  )

  const openSeats = visibility === 'private' ? 0 : Math.max(0, aircraft - pax)
  const anchorSeats = visibility === 'private' ? aircraft : pax
  const aircraftLabel = aircraft === 4 ? 'Cessna 206' : 'Cessna Grand Caravan'
  const blockTime = fmtDur(90)
  const isRoundTrip = tripType === 'round-trip'

  async function handleSubmit() {
    if (!date) { setError('Please select a departure date.'); return }
    if (!tripName.trim()) { setError('Please enter a trip name.'); return }
    if (isRoundTrip && !returnDate) { setError('Please select a return date.'); return }
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
            name: tripName,
            pitch,
            visibility,
            seatsTotal: aircraft,
            seatsAnchor: anchorSeats,
          },
          status: 'pending',
        })
        .select()
        .single()

      if (insertError) throw insertError

      if (data) {
        await supabase.from('notifications').insert({
          member_id: member.id,
          kind: 'system',
          title: 'Anchor submitted for review',
          body: 'The Travail team will get a Tropic quote and confirm pricing with you.',
          ref: { kind: 'anchor', id: data.id },
          read: false,
        })
        setSubmitted(data)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
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
              We've received your <strong>{origin.name} → {dest.name}</strong> anchor request.
            </p>
            <p style={{ fontSize: 13, color: 'var(--ink-faint)', lineHeight: 1.5, margin: '0 0 32px' }}>
              The Travail team will get a quote from Tropic and reach back out to confirm pricing before your anchor goes live to the network.
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
        eyebrow="ANCHOR A FLIGHT"
        title="Anchor a Flight"
        sub="Set your route, lock your seats, and invite the network to fill the rest."
      />

      <div className="page-view">
        <div className="builder">
          {/* ── Left: Form ── */}
          <div className="builder-form">

            {/* One-way / Round-trip toggle */}
            <div className="field">
              <div style={{ display: 'flex', background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 10, padding: 4, gap: 4 }}>
                {(['one-way', 'round-trip'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setTripType(t)}
                    style={{
                      flex: 1,
                      height: 34,
                      border: 'none',
                      borderRadius: 7,
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      background: tripType === t ? 'var(--tropic)' : 'transparent',
                      color: tripType === t ? '#fff' : 'var(--ink-light)',
                    }}
                  >
                    {t === 'one-way' ? 'One Way' : 'Round Trip'}
                  </button>
                ))}
              </div>
            </div>

            {/* Route */}
            <div className="field">
              <label className="field-lab">Route <span className="req">*</span></label>
              <div className="select-row" style={{ alignItems: 'stretch' }}>
                <AirportDropdown label="From" value={origin} options={ANCHOR_ORIGINS} onChange={setOrigin} />
                <div style={{ display: 'flex', alignItems: 'center', padding: '0 8px', color: 'var(--ink-faint)', fontSize: 18, flexShrink: 0 }}>→</div>
                <AirportDropdown label="To" value={dest} options={ANCHOR_DESTS} onChange={setDest} />
              </div>
            </div>

            {/* Outbound */}
            <div className="row-2">
              <div className="field">
                <label className="field-lab">Departure date <span className="req">*</span></label>
                <input
                  type="date"
                  className="input"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <TimeInput label="Departure time" value={departTime} onChange={setDepartTime} />
            </div>

            {/* Return leg (round-trip only) */}
            {isRoundTrip && (
              <>
                <div style={{ height: 1, background: 'var(--hair)', margin: '4px 0' }} />
                <div className="row-2">
                  <div className="field">
                    <label className="field-lab">Return date <span className="req">*</span></label>
                    <input
                      type="date"
                      className="input"
                      value={returnDate}
                      onChange={e => setReturnDate(e.target.value)}
                      min={date || new Date().toISOString().split('T')[0]}
                    />
                  </div>
                  <TimeInput label="Return departure time" value={returnDepartTime} onChange={setReturnDepartTime} />
                </div>
              </>
            )}

            {/* Trip name */}
            <div className="field">
              <label className="field-lab">Trip name <span className="req">*</span></label>
              <input
                type="text"
                className="input"
                placeholder="e.g. Islamorada weekend"
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
                placeholder="Entice members to join — what makes this trip special?"
                value={pitch}
                onChange={e => setPitch(e.target.value)}
                rows={3}
                maxLength={400}
              />
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
                      <div className="t-lab">{v === 'public' ? 'Open to network' : 'Private charter'}</div>
                      <div className="t-sub">{v === 'public' ? 'Empty seats listed to members' : 'Full aircraft for your party only'}</div>
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
                {Array.from({ length: aircraft }, (_, i) => i + 1).map(n => (
                  <button
                    key={n}
                    className={`chip${pax === n ? ' active' : ''}`}
                    onClick={() => setPax(n)}
                  >
                    {n} {n === 1 ? 'seat' : 'seats'}
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
                  {tripName || <span style={{ color: 'var(--ink-faint)', fontStyle: 'italic' }}>Your trip name…</span>}
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
                  {isRoundTrip ? '⇄' : '→'}
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 32, fontWeight: 500, color: '#fff', lineHeight: 1 }}>{dest.code}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', marginTop: 4 }}>{dest.sub}</div>
                </div>
              </div>

              {/* Summary grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--hair)', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--hair)' }}>
                {[
                  { label: 'Trip type', value: isRoundTrip ? 'Round trip' : 'One way' },
                  { label: 'Aircraft', value: aircraftLabel },
                  { label: 'Departs', value: date || '—' },
                  { label: 'Departure time', value: departTime },
                  ...(isRoundTrip ? [
                    { label: 'Returns', value: returnDate || '—' },
                    { label: 'Return time', value: returnDepartTime },
                  ] : []),
                  { label: 'Block time', value: blockTime },
                  { label: 'Party', value: `${pax} seat${pax > 1 ? 's' : ''}` },
                  { label: 'Open to fill', value: visibility === 'private' ? 'No' : `${openSeats} seat${openSeats !== 1 ? 's' : ''}` },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: 'var(--card)', padding: '10px 14px' }}>
                    <div className="mono" style={{ marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Pricing note */}
              <div style={{
                background: 'var(--tropic-glow)',
                border: '1px solid rgba(0,179,199,0.2)',
                borderRadius: 10,
                padding: '14px 16px',
              }}>
                <div className="mono" style={{ color: 'var(--tropic-d)', marginBottom: 6 }}>Pricing</div>
                <p style={{ fontSize: 12.5, color: 'var(--ink-mid)', lineHeight: 1.55, margin: 0 }}>
                  Seat pricing will be confirmed by the Travail team. We'll check with Tropic for a quote and reach out to confirm before your anchor goes live.
                </p>
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
