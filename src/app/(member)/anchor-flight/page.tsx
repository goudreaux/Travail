'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ORIGINS, DESTINATIONS, fmtDur } from '@/lib/data'
import type { AirportMeta } from '@/lib/data'

const DEPART_TIMES = ['7:00 AM', '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM']

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

export default function AnchorFlightPage() {
  const [origin, setOrigin] = useState<AirportMeta>(ORIGINS[0])
  const [dest, setDest] = useState<AirportMeta>(DESTINATIONS[0])
  const [aircraft, setAircraft] = useState<4 | 8>(8)
  const [pax, setPax] = useState(2)
  const [date, setDate] = useState('')
  const [returnDate, setReturnDate] = useState('')
  const [departTime, setDepartTime] = useState('9:00 AM')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [tripName, setTripName] = useState('')
  const [pitch, setPitch] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState<{ id: string } | null>(null)
  const [error, setError] = useState('')

  const supabase = createClient()
  const router = useRouter()

  const seatPrice = aircraft === 4 ? 720 : 640
  const openSeats = visibility === 'private' ? 0 : Math.max(0, aircraft - pax)
  const anchorSeats = visibility === 'private' ? aircraft : pax
  const total = seatPrice * anchorSeats
  const aircraftLabel = aircraft === 4 ? 'Cessna 206' : 'Cessna Grand Caravan'
  const aircraftDesc = aircraft === 4 ? '4 seats · amphibious single' : '8 seats · turboprop'
  const blockTime = fmtDur(90)

  // Clamp pax to aircraft capacity
  useEffect(() => {
    if (pax > aircraft) setPax(aircraft)
  }, [aircraft])

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
          kind: 'flight',
          member_id: member.id,
          payload: {
            originCode: origin.code,
            destCode: dest.code,
            date,
            returnDate: returnDate || null,
            departTime,
            durationMins: 90,
            aircraftId: aircraft === 4 ? 'c206' : 'caravan',
            name: tripName,
            pitch,
            visibility,
            seatsTotal: aircraft,
            seatsAnchor: anchorSeats,
            pricePerSeat: seatPrice,
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
          body: 'Ops will confirm aircraft availability before opening seats.',
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
              Ops is confirming aircraft availability for your <strong>{origin.code} → {dest.code}</strong> flight.
            </p>
            <p style={{ fontSize: 13, color: 'var(--ink-faint)', lineHeight: 1.5, margin: '0 0 32px' }}>
              You'll receive a notification once your anchor is approved and seats open to the network.
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
      <div className="page-head">
        <div>
          <h1>Anchor a Flight</h1>
          <p className="sub">Set your route, lock your seats, and invite the network to fill the rest.</p>
        </div>
      </div>

      <div className="page-view">
        <div className="builder">
          {/* ── Left: Form ── */}
          <div className="builder-form">

            {/* Route */}
            <div className="field">
              <label className="field-lab">Route <span className="req">*</span></label>
              <div className="select-row" style={{ alignItems: 'stretch' }}>
                <AirportDropdown label="From" value={origin} options={ORIGINS} onChange={setOrigin} />
                <div style={{ display: 'flex', alignItems: 'center', padding: '0 8px', color: 'var(--ink-faint)', fontSize: 18, flexShrink: 0 }}>→</div>
                <AirportDropdown label="To" value={dest} options={DESTINATIONS} onChange={setDest} />
              </div>
            </div>

            {/* Dates */}
            <div className="row-2">
              <div className="field">
                <label className="field-lab">Date out <span className="req">*</span></label>
                <input
                  type="date"
                  className="input"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div className="field">
                <label className="field-lab">Return date</label>
                <input
                  type="date"
                  className="input"
                  value={returnDate}
                  onChange={e => setReturnDate(e.target.value)}
                  min={date || new Date().toISOString().split('T')[0]}
                />
              </div>
            </div>

            {/* Departure time */}
            <div className="field">
              <label className="field-lab">Departure time</label>
              <div className="chips">
                {DEPART_TIMES.map(t => (
                  <button
                    key={t}
                    className={`chip${departTime === t ? ' active' : ''}`}
                    onClick={() => setDepartTime(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Trip name */}
            <div className="field">
              <label className="field-lab">Trip name <span className="req">*</span></label>
              <input
                type="text"
                className="input"
                placeholder="e.g. Nassau weekend escape"
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-light)' }}>
                        ${cap === 4 ? '720' : '640'}/seat
                      </span>
                      <div
                        className={`toggle${aircraft === cap ? ' active' : ''}`}
                        style={{ pointerEvents: 'none' }}
                      />
                    </div>
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
                  <div style={{ fontFamily: 'var(--display)', fontSize: 36, fontWeight: 500, color: '#fff', lineHeight: 1 }}>{origin.code}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', marginTop: 4, textTransform: 'uppercase' }}>{origin.sub}</div>
                </div>
                <div style={{ color: 'var(--tropic)', fontSize: 22, flex: 1, textAlign: 'center' }}>→</div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 36, fontWeight: 500, color: '#fff', lineHeight: 1 }}>{dest.code}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', marginTop: 4, textTransform: 'uppercase' }}>{dest.sub}</div>
                </div>
              </div>

              {/* Summary grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--hair)', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--hair)' }}>
                {[
                  { label: 'Date', value: date || '—' },
                  { label: 'Return', value: returnDate || '—' },
                  { label: 'Departs', value: departTime },
                  { label: 'Aircraft', value: aircraftLabel },
                  { label: 'Block time', value: blockTime },
                  { label: 'Party', value: `${pax} seat${pax > 1 ? 's' : ''}` },
                  { label: 'Open to fill', value: visibility === 'private' ? 'No' : `${openSeats} seat${openSeats !== 1 ? 's' : ''}` },
                  { label: 'Per seat', value: `$${seatPrice.toLocaleString()}` },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: 'var(--card)', padding: '10px 14px' }}>
                    <div className="mono" style={{ marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{value}</div>
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
                    {anchorSeats} seat{anchorSeats > 1 ? 's' : ''} × ${seatPrice.toLocaleString()}
                  </div>
                </div>
                <div style={{ fontFamily: 'var(--display)', fontSize: 28, fontWeight: 500, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
                  ${total.toLocaleString()}
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
