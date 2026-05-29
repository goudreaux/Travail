'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import PageHero from '@/components/PageHero'
import { PROPOSAL_MIN_LEAD_DAYS } from '@/lib/proposals'
import { ProposerCardForm } from '@/components/ProposerCardForm'

// Excursion proposal wizard — same spread-guarantee mechanics as the
// flight proposal. Free-form name + origin airport + date + party
// size + max coverage. Ops fills in capacity / min seats / price /
// itinerary during review.

function todayPlus(days: number): string {
  const d = new Date(); d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

interface Airport { code: string; name: string; sub: string | null; role: string }

export default function ProposeExcursionPage() {
  const router = useRouter()
  const supabase = createClient()
  const [airports, setAirports] = useState<Airport[]>([])
  const [name, setName] = useState('')
  const [origin, setOrigin] = useState('KTPF')
  const [date, setDate] = useState('')
  const [stayType, setStayType] = useState<'day_trip' | 'overnight' | 'multi_night'>('day_trip')
  const [departTime, setDepartTime] = useState('08:30')
  const [returnTime, setReturnTime] = useState('17:00')
  const [pitch, setPitch] = useState('')
  const [opsNotes, setOpsNotes] = useState('')
  const [suggestedCapacity, setSuggestedCapacity] = useState(8)
  const [suggestedMinSeats, setSuggestedMinSeats] = useState(4)
  const [proposerMinSeats, setProposerMinSeats] = useState(2)
  const [proposerMaxSeats, setProposerMaxSeats] = useState(4)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submittedId, setSubmittedId] = useState<string | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [cardSaved, setCardSaved] = useState(false)
  const minDate = todayPlus(PROPOSAL_MIN_LEAD_DAYS)

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(supabase.from('airports') as any).select('code, name, sub, role').then(({ data }: { data: Airport[] | null }) => {
      setAirports((data ?? []).filter(a => a.role === 'origin' || a.role === 'both'))
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    setError(null)
    if (!name.trim()) { setError('Pick a name.'); return }
    if (!date) { setError('Pick a date.'); return }
    if (date < minDate) { setError(`Proposals need at least ${PROPOSAL_MIN_LEAD_DAYS} days of lead time.`); return }
    if (proposerMaxSeats < proposerMinSeats) { setError('Your maximum coverage must be at least your party size.'); return }
    if (proposerMaxSeats > suggestedCapacity) { setError('Your max coverage can\'t exceed capacity.'); return }

    setSubmitting(true)
    try {
      const res = await fetch('/api/proposals/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'excursion',
          name: name.trim(),
          date,
          originCode: origin,
          suggestedCapacity,
          suggestedMinSeats,
          proposerMinSeats,
          proposerMaxSeats,
          details: {
            stayType,
            departTime,
            returnTime,
            pitch: pitch.trim() || null,
            notes: opsNotes.trim() || null,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Submit failed (${res.status})`)
      setSubmittedId(data.proposalId ?? data.id)
      if (data.clientSecret) setClientSecret(data.clientSecret)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed')
    } finally {
      setSubmitting(false)
    }
  }

  // Card-on-file step after /api/proposals/create returns.
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
      <PageHero accent="sun" eyebrow="PROPOSE AN EXCURSION · NO RISK" title="Pitch the day" sub="Ops finalizes the day plan, capacity, and price. You only pay if it locks." />
      <div className="page-view">
        <div className="wiz" style={{ maxWidth: 560 }}>
          <div className="field">
            <label className="field-lab">Excursion name</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Tarpon at Boca Grande" />
          </div>
          <div className="row-2">
            <div className="field">
              <label className="field-lab">Origin airport</label>
              <select className="input" value={origin} onChange={e => setOrigin(e.target.value)}>
                {airports.map(a => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-lab">Date</label>
              <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} min={minDate} />
            </div>
          </div>

          <div className="row-2">
            <div className="field">
              <label className="field-lab">Stay type</label>
              <select className="input" value={stayType} onChange={e => setStayType(e.target.value as 'day_trip' | 'overnight' | 'multi_night')}>
                <option value="day_trip">Day trip</option>
                <option value="overnight">Overnight</option>
                <option value="multi_night">Multi-night</option>
              </select>
            </div>
            <div className="field">
              <label className="field-lab">Depart from origin</label>
              <input className="input" type="time" value={departTime} onChange={e => setDepartTime(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label className="field-lab">Return wheels-up</label>
            <input className="input" type="time" value={returnTime} onChange={e => setReturnTime(e.target.value)} />
          </div>

          <div className="row-2">
            <div className="field">
              <label className="field-lab">Suggested capacity</label>
              <input className="input" type="number" min={2} max={20} value={suggestedCapacity} onChange={e => setSuggestedCapacity(Math.max(2, Math.min(20, Number(e.target.value) || 0)))} />
            </div>
            <div className="field">
              <label className="field-lab">Suggested minimum</label>
              <input className="input" type="number" min={1} max={suggestedCapacity} value={suggestedMinSeats} onChange={e => setSuggestedMinSeats(Math.max(1, Math.min(suggestedCapacity, Number(e.target.value) || 0)))} />
            </div>
          </div>

          <div style={{
            background: 'rgba(244,167,44,0.06)',
            border: '1px solid rgba(244,167,44,0.25)',
            borderRadius: 12, padding: '14px 16px', marginBottom: 16,
          }}>
            <div style={{
              fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase',
              color: 'var(--sun-d)', fontWeight: 700, marginBottom: 10,
            }}>
              Your spread guarantee
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.5, marginBottom: 12 }}>
              How many seats firm? How many would you cover if the network underfills? You only pay your firm party, unless commits fall short, in which case you pay up to your guarantee to make the trip go.
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
              Worst case you pay for {proposerMaxSeats} seat{proposerMaxSeats === 1 ? '' : 's'}; best case {proposerMinSeats}.
            </div>
          </div>

          <div className="field">
            <label className="field-lab">Pitch <span style={{ color: 'var(--ink-faint)', fontWeight: 400 }}>(optional)</span></label>
            <textarea className="input" rows={3} value={pitch} onChange={e => setPitch(e.target.value)} placeholder="Why this trip? What makes it worth committing to?" />
          </div>

          <div className="field">
            <label className="field-lab">Notes for ops <span style={{ color: 'var(--ink-faint)', fontWeight: 400 }}>(optional, private)</span></label>
            <textarea className="input" rows={3} value={opsNotes} onChange={e => setOpsNotes(e.target.value)} placeholder="Anything that helps us source it: operator or lodge you have in mind, a contact you've spoken to, gear or permits, special requests. Members never see this." />
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
