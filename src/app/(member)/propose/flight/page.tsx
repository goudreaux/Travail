'use client'
export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import PageHero from '@/components/PageHero'
import { PROPOSAL_MIN_LEAD_DAYS } from '@/lib/proposals'
import { ProposerCardForm } from '@/components/ProposerCardForm'

// Lightweight flight-proposal form. Mirrors the route-picking
// vocabulary of the anchor-flight wizard but compresses everything
// into a single page since proposals don't capture a card or run
// through the round-trip planning. Ops fills in capacity / price /
// min seats during review.

const ORIGINS = [
  { code: 'KTPA', name: 'TPA',                 sub: 'Tampa, FL' },
  { code: 'KTPF', name: 'Davis Islands',       sub: 'Tampa, FL' },
]

const DESTS = [
  { code: 'STR',    name: 'St. Regis Hotel · Sarasota', sub: 'Sarasota, FL' },
  { code: 'LCC',    name: 'Lochloosa Country Club',     sub: 'North Central FL' },
  { code: 'KEYW',   name: 'Key West Airport',           sub: 'FL Keys' },
  { code: 'LPI',    name: 'Little Palm Island',         sub: 'FL Keys' },
  { code: 'CUSTOM', name: 'Custom destination',         sub: 'Request, ops will confirm' },
]

function todayPlus(days: number): string {
  const d = new Date(); d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export default function ProposeFlightPage() {
  const router = useRouter()
  const [origin, setOrigin] = useState(ORIGINS[0].code)
  const [destCode, setDestCode] = useState(DESTS[0].code)
  const [customDestName, setCustomDestName] = useState('')
  const [date, setDate] = useState('')
  const [stayType, setStayType] = useState<'day_trip' | 'overnight'>('day_trip')
  const [departTime, setDepartTime] = useState('09:00')
  const [suggestedCapacity, setSuggestedCapacity] = useState(8)
  const [suggestedMinSeats, setSuggestedMinSeats] = useState(4)
  const [proposerMinSeats, setProposerMinSeats] = useState(2)  // firm party
  const [proposerMaxSeats, setProposerMaxSeats] = useState(4)  // your ceiling
  const [pitch, setPitch] = useState('')
  const [opsNotes, setOpsNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submittedId, setSubmittedId] = useState<string | null>(null)
  // Stripe SetupIntent step — populated after /api/proposals/create
  // returns a clientSecret. The wizard renders the card form, then
  // the success screen, instead of going straight to "submitted."
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [cardSaved, setCardSaved] = useState(false)

  const isCustomDest = destCode === 'CUSTOM'
  const destMeta = DESTS.find(d => d.code === destCode)
  const destName = isCustomDest ? customDestName.trim() : (destMeta?.name ?? destCode)
  const minDate = todayPlus(PROPOSAL_MIN_LEAD_DAYS)

  async function submit() {
    setError(null)
    if (!date) { setError('Pick a date.'); return }
    if (date < minDate) { setError(`Proposals need at least ${PROPOSAL_MIN_LEAD_DAYS} days of lead time so the network has a chance to commit. For a trip sooner than that, anchor it instead — you commit the charter and open the extra seats.`); return }
    if (isCustomDest && !customDestName.trim()) { setError('Tell us where you want to go, ops will confirm with Tropic.'); return }
    if (!isCustomDest && origin === destCode) { setError('Origin and destination must be different.'); return }
    if (proposerMaxSeats < proposerMinSeats) { setError('Your maximum coverage must be at least your party size.'); return }
    if (proposerMaxSeats > suggestedCapacity) { setError('Your maximum coverage can\'t exceed the aircraft capacity.'); return }

    const name = `${ORIGINS.find(o => o.code === origin)?.name ?? origin} → ${destName || destCode}`

    setSubmitting(true)
    try {
      const res = await fetch('/api/proposals/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'flight',
          name,
          date,
          originCode: origin,
          suggestedCapacity,
          suggestedMinSeats,
          proposerMinSeats,
          proposerMaxSeats,
          details: {
            destCode: isCustomDest ? 'CUSTOM' : destCode,
            destName,
            customDest: isCustomDest,
            stayType,
            departTime,
            pitch: pitch.trim() || null,
            notes: opsNotes.trim() || null,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Submit failed (${res.status})`)
      // New /api/proposals/create returns clientSecret for the
      // proposer's SetupIntent. Move to the card-on-file step.
      setSubmittedId(data.proposalId ?? data.id)
      if (data.clientSecret) setClientSecret(data.clientSecret)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed')
    } finally {
      setSubmitting(false)
    }
  }

  // Card-on-file step — after /api/proposals/create returns a
  // clientSecret, render Stripe Elements before the success screen.
  if (submittedId && clientSecret && !cardSaved) {
    return (
      <div className="page">
        <PageHero
          accent="sun"
          eyebrow="PROPOSAL · SAVE A CARD"
          title="One last step: your card on file"
          sub="Your proposal isn't truly submitted until you have a card on file for your firm party. No charge yet."
        />
        <div className="page-view" style={{ maxWidth: 520 }}>
          <ProposerCardForm
            clientSecret={clientSecret}
            onSuccess={() => setCardSaved(true)}
            proposerMinSeats={proposerMinSeats}
            proposerMaxSeats={proposerMaxSeats}
          />
        </div>
      </div>
    )
  }

  if (submittedId && (cardSaved || !clientSecret)) {
    return (
      <div className="page">
        <PageHero
          accent="sun"
          eyebrow="PROPOSAL SUBMITTED"
          title="Sent to ops for review."
          sub={`Your proposal ${submittedId} is in the queue. Ops will set the minimum seat count + per-seat price, then it goes live for the network. You'll get a notification when it does, you can be the first to commit then.`}
        />
        <div className="page-view" style={{ display: 'flex', gap: 10, padding: '12px 0' }}>
          <button className="btn-primary" onClick={() => router.push('/seats')}>Browse open seats</button>
          <button className="btn-ghost" onClick={() => router.push('/membership')}>My profile</button>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <PageHero accent="sun" eyebrow="PROPOSE A FLIGHT · NO RISK" title="Pitch the route" sub="Ops sets the minimum and per-seat price during review. No charge to you until the proposal locks."
        actions={<button className="page-hero__btn" onClick={() => router.push('/propose')}>← Back</button>} />
      <div className="page-view">
        <div className="wiz" style={{ maxWidth: 560 }}>
          {/* Route */}
          <div className="pf-group">
            <div className="pf-group__eyebrow">The route</div>
            <div className="row-2">
              <div className="field">
                <label className="field-lab">From</label>
                <select className="input" value={origin} onChange={e => setOrigin(e.target.value)}>
                  {ORIGINS.map(o => <option key={o.code} value={o.code}>{o.name} ({o.code})</option>)}
                </select>
              </div>
              <div className="field">
                <label className="field-lab">To</label>
                <select className="input" value={destCode} onChange={e => setDestCode(e.target.value)}>
                  {DESTS.map(d => <option key={d.code} value={d.code}>{d.name}</option>)}
                </select>
              </div>
            </div>
            {isCustomDest && (
              <div className="field">
                <label className="field-lab">Custom destination name</label>
                <input className="input" value={customDestName} onChange={e => setCustomDestName(e.target.value)} placeholder="Hotel, town, or marina" />
              </div>
            )}
          </div>

          {/* When + stay type */}
          <div className="pf-group">
            <div className="pf-group__eyebrow">When</div>
            <div className="field">
              <label className="field-lab">Trip length</label>
              <div className="pf-seg" role="group" aria-label="Trip length">
                <button type="button" className={`pf-seg__btn${stayType === 'day_trip' ? ' active' : ''}`} onClick={() => setStayType('day_trip')}>
                  <span className="pf-seg__icon" aria-hidden>☀️</span> Day trip
                </button>
                <button type="button" className={`pf-seg__btn${stayType === 'overnight' ? ' active' : ''}`} onClick={() => setStayType('overnight')}>
                  <span className="pf-seg__icon" aria-hidden>🌙</span> Overnight
                </button>
              </div>
            </div>
            <div className="row-2">
              <div className="field">
                <label className="field-lab">{stayType === 'overnight' ? 'Departure date' : 'Date'}</label>
                <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} min={minDate} />
                <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 4, fontFamily: 'var(--mono)' }}>
                  Earliest: {minDate} ({PROPOSAL_MIN_LEAD_DAYS}-day floor)
                </div>
              </div>
              <div className="field">
                <label className="field-lab">Suggested depart time</label>
                <input className="input" type="time" value={departTime} onChange={e => setDepartTime(e.target.value)} />
              </div>
            </div>
            {stayType === 'overnight' && (
              <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', lineHeight: 1.5, marginTop: -2, marginBottom: 10 }}>
                Overnight trips: tell ops the return date and lodging in the notes below — they’ll confirm the round-trip charter with Tropic.
              </div>
            )}
          </div>

          {/* Capacity */}
          <div className="pf-group">
            <div className="pf-group__eyebrow">Suggested size</div>
            <div className="row-2">
              <div className="field">
                <label className="field-lab">Capacity</label>
                <input className="input" type="number" min={2} max={20} value={suggestedCapacity} onChange={e => setSuggestedCapacity(Math.max(2, Math.min(20, Number(e.target.value) || 0)))} />
              </div>
              <div className="field">
                <label className="field-lab">Minimum seats</label>
                <input className="input" type="number" min={1} max={suggestedCapacity} value={suggestedMinSeats} onChange={e => setSuggestedMinSeats(Math.max(1, Math.min(suggestedCapacity, Number(e.target.value) || 0)))} />
                <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 4, fontFamily: 'var(--mono)' }}>
                  Ops sets the actual floor.
                </div>
              </div>
            </div>
          </div>

          <div style={{
            background: 'rgba(0,179,199,0.06)',
            border: '1px solid rgba(0,179,199,0.20)',
            borderRadius: 16, padding: '16px 18px', marginBottom: 14,
          }}>
            <div style={{
              fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase',
              color: 'var(--tropic-d)', fontWeight: 700, marginBottom: 10,
            }}>
              Your spread guarantee
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.5, marginBottom: 12 }}>
              How many seats are you personally committing? And how many would you cover if the network underfills? You&apos;ll only pay your firm party, unless commits fall short, in which case you pay up to your guarantee to make the trip happen.
            </div>
            <div className="row-2">
              <div className="field" style={{ marginBottom: 0 }}>
                <label className="field-lab">Your party (firm)</label>
                <input className="input" type="number" min={1} max={suggestedCapacity} value={proposerMinSeats} onChange={e => {
                  const v = Math.max(1, Math.min(suggestedCapacity, Number(e.target.value) || 1))
                  setProposerMinSeats(v)
                  if (proposerMaxSeats < v) setProposerMaxSeats(v)
                }} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label className="field-lab">Your max coverage</label>
                <input className="input" type="number" min={proposerMinSeats} max={suggestedCapacity} value={proposerMaxSeats} onChange={e => setProposerMaxSeats(Math.max(proposerMinSeats, Math.min(suggestedCapacity, Number(e.target.value) || proposerMinSeats)))} />
              </div>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 10, lineHeight: 1.5 }}>
              You&apos;re asking the network to cover {Math.max(0, suggestedMinSeats - proposerMaxSeats)}–{Math.max(0, suggestedCapacity - proposerMinSeats)} seats. Worst case you pay for {proposerMaxSeats} seat{proposerMaxSeats === 1 ? '' : 's'}; best case you pay for {proposerMinSeats}.
            </div>
          </div>

          <div className="field">
            <label className="field-lab">Pitch <span style={{ color: 'var(--ink-faint)', fontWeight: 400 }}>(optional)</span></label>
            <textarea className="input" rows={3} value={pitch} onChange={e => setPitch(e.target.value)} placeholder="Why this trip? What makes it worth committing to?" />
          </div>

          <div className="field">
            <label className="field-lab">Notes for ops <span style={{ color: 'var(--ink-faint)', fontWeight: 400 }}>(optional, private)</span></label>
            <textarea className="input" rows={3} value={opsNotes} onChange={e => setOpsNotes(e.target.value)} placeholder="Anything that helps us source it: a contact at the destination, ground transport, dietary or schedule needs, special requests. Members never see this." />
          </div>

          {error && (
            <div style={{ background: 'rgba(217,78,42,0.08)', border: '1px solid rgba(217,78,42,0.25)', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: 'var(--signal)', marginBottom: 12 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={submit} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit proposal'}
            </button>
            <button className="btn-ghost" onClick={() => router.push('/propose')}>Back</button>
          </div>
        </div>
      </div>
    </div>
  )
}
