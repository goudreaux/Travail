'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ORIGINS, DESTINATIONS, EXCURSION_TEMPLATES_BY_DEST, fmtDur } from '@/lib/data'
import type { AirportMeta, TemplateCatalogEntry } from '@/lib/data'

// Excursion destinations: only those with templates
const EXCURSION_DEST_CODES = Object.keys(EXCURSION_TEMPLATES_BY_DEST)
const EXCURSION_DESTS: AirportMeta[] = DESTINATIONS.filter(d => EXCURSION_DEST_CODES.includes(d.code))

const DEPART_TIMES = ['6:00 AM', '7:00 AM', '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM']
const RETURN_TIMES_DAY = ['2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM']
const RETURN_TIMES_OVERNIGHT = ['8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM']

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

function ExperienceCard({
  tpl,
  selected,
  onClick,
}: {
  tpl: TemplateCatalogEntry
  selected: boolean
  onClick: () => void
}) {
  const iconMap: Record<string, string> = {
    fish: '🎣',
    sail: '⛵',
    snorkel: '🤿',
    golf: '⛳',
    wave: '🌊',
    quail: '🦅',
    hog: '🍽️',
  }
  const emoji = iconMap[tpl.icon] ?? '✦'

  return (
    <div
      onClick={onClick}
      style={{
        border: `1px solid ${selected ? 'var(--tropic)' : 'var(--hair-2)'}`,
        borderRadius: 10,
        padding: '12px 14px',
        cursor: 'pointer',
        background: selected ? 'var(--tropic-glow)' : 'var(--bg)',
        transition: 'border-color 0.15s, background 0.15s',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
      }}
    >
      <span style={{ fontSize: 24, lineHeight: 1, flexShrink: 0 }}>{emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: selected ? 'var(--tropic-d)' : 'var(--ink)', lineHeight: 1.3, marginBottom: 2 }}>{tpl.name}</div>
        {tpl.operator && (
          <div style={{ fontSize: 11.5, color: 'var(--ink-light)', marginBottom: 4 }}>{tpl.operator}</div>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {tpl.tags.map(tag => (
            <span key={tag} className="pill" style={{ fontSize: 9.5 }}>{tag}</span>
          ))}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-light)' }}>per person</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.01em' }}>
          ${tpl.pricePerPax.toLocaleString()}
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-faint)', marginTop: 2 }}>
          cap {tpl.capacity}
        </div>
      </div>
    </div>
  )
}

export default function AnchorExcursionPage() {
  const [origin, setOrigin] = useState<AirportMeta>(ORIGINS[0])
  const [dest, setDest] = useState<AirportMeta>(EXCURSION_DESTS[0])
  const [aircraft, setAircraft] = useState<4 | 8>(8)
  const [tripType, setTripType] = useState<'day' | 'overnight'>('day')
  const [selectedTplIdx, setSelectedTplIdx] = useState(0)
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('9:00 AM')
  const [departTime, setDepartTime] = useState('7:00 AM')
  const [returnTime, setReturnTime] = useState('4:00 PM')
  const [tripName, setTripName] = useState('')
  const [pitch, setPitch] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [pax, setPax] = useState(2)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState<{ id: string } | null>(null)
  const [error, setError] = useState('')

  const supabase = createClient()
  const router = useRouter()

  // Templates for selected destination
  const templates = EXCURSION_TEMPLATES_BY_DEST[dest.code] ?? []
  const selectedTpl = templates[selectedTplIdx] ?? templates[0]

  // When destination changes, reset template selection
  useEffect(() => {
    setSelectedTplIdx(0)
  }, [dest.code])

  // When aircraft changes, clamp pax
  useEffect(() => {
    if (pax > aircraft) setPax(aircraft)
  }, [aircraft]) // eslint-disable-line react-hooks/exhaustive-deps

  // When trip type changes, reset return time to a sensible default
  useEffect(() => {
    setReturnTime(tripType === 'day' ? '4:00 PM' : '9:00 AM')
  }, [tripType])

  const capacity = aircraft
  const openSeats = visibility === 'private' ? 0 : Math.max(0, capacity - pax)
  const anchorSeats = visibility === 'private' ? capacity : pax
  const pricePerPax = selectedTpl?.pricePerPax ?? 0
  const total = pricePerPax * anchorSeats
  const aircraftLabel = aircraft === 4 ? 'Cessna 206' : 'Cessna Grand Caravan'

  async function handleSubmit() {
    if (!date) { setError('Please set a departure date.'); return }
    if (!tripName.trim()) { setError('Please enter a trip name.'); return }
    if (!selectedTpl) { setError('Please select an experience.'); return }
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
            experienceName: selectedTpl.name,
            experienceOperator: selectedTpl.operator ?? null,
            experienceIcon: selectedTpl.icon,
            name: tripName,
            pitch,
            visibility,
            spotsTotal: capacity,
            spotsAnchor: anchorSeats,
            pricePerPax,
            tags: selectedTpl.tags,
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
          title: 'Excursion anchor submitted',
          body: 'Ops will confirm availability and open spots to the network.',
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
      <div className="page-head">
        <div>
          <h1>Anchor an Excursion</h1>
          <p className="sub">Choose a destination experience, lock your spots, and invite the network to join.</p>
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
                <AirportDropdown value={origin} options={ORIGINS} onChange={setOrigin} />
                <div style={{ display: 'flex', alignItems: 'center', padding: '0 8px', color: 'var(--ink-faint)', fontSize: 13, flexShrink: 0, fontFamily: 'var(--mono)', letterSpacing: '0.06em' }}>IN</div>
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

            {/* Experience selection */}
            <div className="field">
              <label className="field-lab">Experience <span className="req">*</span></label>
              {templates.length === 0 ? (
                <div style={{ padding: '16px', background: 'var(--warm)', borderRadius: 10, fontSize: 13, color: 'var(--ink-light)', textAlign: 'center' }}>
                  No curated experiences for this destination yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {templates.map((tpl, idx) => (
                    <ExperienceCard
                      key={tpl.name}
                      tpl={tpl}
                      selected={selectedTplIdx === idx}
                      onClick={() => setSelectedTplIdx(idx)}
                    />
                  ))}
                </div>
              )}
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
            <div className="field">
              <label className="field-lab">Departure from {origin.code}</label>
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

            <div className="field">
              <label className="field-lab">Experience start time at {dest.code}</label>
              <div className="chips">
                {['8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM'].map(t => (
                  <button
                    key={t}
                    className={`chip${startTime === t ? ' active' : ''}`}
                    onClick={() => setStartTime(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label className="field-lab">Return wheels-up from {dest.code}</label>
              <div className="chips">
                {(tripType === 'day' ? RETURN_TIMES_DAY : RETURN_TIMES_OVERNIGHT).map(t => (
                  <button
                    key={t}
                    className={`chip${returnTime === t ? ' active' : ''}`}
                    onClick={() => setReturnTime(t)}
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

              {/* Experience */}
              {selectedTpl && (
                <div style={{
                  background: 'var(--night)',
                  borderRadius: 10,
                  padding: '14px 16px',
                }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--tropic)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
                    {dest.sub}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', lineHeight: 1.3, marginBottom: 4 }}>
                    {selectedTpl.name}
                  </div>
                  {selectedTpl.operator && (
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 8 }}>
                      {selectedTpl.operator}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {selectedTpl.tags.map(tag => (
                      <span key={tag} style={{
                        fontFamily: 'var(--mono)',
                        fontSize: 9,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: 'var(--tropic)',
                        background: 'rgba(0,179,199,0.12)',
                        borderRadius: 4,
                        padding: '2px 6px',
                      }}>{tag}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Route vis */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 14px',
                background: 'var(--warm)',
                borderRadius: 10,
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 24, fontWeight: 500, color: 'var(--ink)', lineHeight: 1 }}>{origin.code}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-light)', letterSpacing: '0.08em', marginTop: 2, textTransform: 'uppercase' }}>{origin.sub}</div>
                </div>
                <div style={{ flex: 1, textAlign: 'center', color: 'var(--tropic)', fontSize: 18 }}>→</div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 24, fontWeight: 500, color: 'var(--ink)', lineHeight: 1 }}>{dest.code}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-light)', letterSpacing: '0.08em', marginTop: 2, textTransform: 'uppercase' }}>{dest.sub}</div>
                </div>
                {tripType === 'overnight' && (
                  <>
                    <div style={{ flex: 1, textAlign: 'center', color: 'var(--ink-faint)', fontSize: 18 }}>↩</div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-light)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>overnight</div>
                    </div>
                  </>
                )}
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
                  { label: 'Per person', value: selectedTpl ? `$${selectedTpl.pricePerPax.toLocaleString()}` : '—' },
                  { label: 'Operator', value: selectedTpl?.operator ?? '—' },
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
                    {anchorSeats} {anchorSeats === 1 ? 'person' : 'people'} × ${(selectedTpl?.pricePerPax ?? 0).toLocaleString()}
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
