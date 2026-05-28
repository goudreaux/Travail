'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fmtMoney } from '@/lib/data'
import PageHero from '@/components/PageHero'

// Anchor quote: Ops sent a price; member accepts or declines here.
//
// On accept → status='quote_accepted', ops can then publish (which
// captures the card for the quoted total). On decline → status flips
// to 'declined' with the member's reason — no charge ever occurs.

interface QuoteSubmission {
  id: string
  kind: 'flight' | 'excursion'
  member_id: string
  status: string
  charter_cost_cents: number | null
  quoted_total_cents: number | null
  quoted_at: string | null
  quote_declined_at: string | null
  quote_accepted_at: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any
}

export default function AnchorQuotePage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const submissionId = params.id as string

  const [sub, setSub] = useState<QuoteSubmission | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState<'accept' | 'decline' | null>(null)
  const [declineMode, setDeclineMode] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<'accepted' | 'declined' | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: subErr } = await (supabase as any)
        .from('anchor_submissions')
        .select('id, kind, member_id, status, charter_cost_cents, quoted_total_cents, quoted_at, quote_accepted_at, quote_declined_at, payload')
        .eq('id', submissionId)
        .maybeSingle()
      if (cancelled) return
      if (subErr || !data) { setError(subErr?.message ?? 'Quote not found'); setLoading(false); return }
      setSub(data as QuoteSubmission)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [submissionId, router, supabase])

  async function respond(action: 'accept' | 'decline') {
    if (!sub) return
    if (action === 'decline' && !declineReason.trim()) {
      setError('Please add a brief reason so ops can follow up.')
      return
    }
    setSubmitting(action)
    setError(null)
    try {
      const res = await fetch('/api/anchor/quote-respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId, action, reason: action === 'decline' ? declineReason.trim() : undefined }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Could not save your response'); setSubmitting(null); return }
      setDone(action === 'accept' ? 'accepted' : 'declined')
    } catch (e) {
      setError((e as Error)?.message ?? 'Network error')
      setSubmitting(null)
    }
  }

  if (loading) {
    return (
      <div className="page">
        <PageHero accent="teal" eyebrow="QUOTE" title="Loading your quote" />
      </div>
    )
  }

  if (error && !sub) {
    return (
      <div className="page">
        <PageHero accent="signal" eyebrow="QUOTE" title="Quote not found" sub={error} />
      </div>
    )
  }

  if (!sub) return null

  const body = sub.payload ?? {}
  const tripName = body.name ?? (sub.kind === 'flight' ? 'Anchored flight' : 'Anchored excursion')
  const seatsTotal = Number(body.seatsTotal ?? body.spotsTotal ?? body.seats_total ?? body.spots_total ?? 0)
  const totalCents = sub.quoted_total_cents ?? 0
  const totalDollars = totalCents / 100
  // Recover the charter + fee breakdown. Legacy quotes (pre-3% fee
  // migration) have null charter_cost_cents; treat the whole quoted
  // total as charter with $0 fee so display still makes sense.
  const charterCents = sub.charter_cost_cents ?? totalCents
  const charterDollars = charterCents / 100
  const feeDollars = (totalCents - charterCents) / 100
  const perPax = seatsTotal > 0 ? totalDollars / seatsTotal : 0
  const anchorSeats = Number(body.seatsAnchor ?? body.spotsAnchor ?? body.seats_anchor ?? body.spots_anchor ?? 0)
  const anchorFloor = perPax * anchorSeats

  // Already-responded states.
  if (done === 'accepted' || sub.status === 'quote_accepted' || sub.status === 'published') {
    return (
      <div className="page">
        <PageHero
          accent="moss"
          eyebrow="QUOTE ACCEPTED"
          title="You're locked in"
          sub={sub.status === 'published' ? 'Your trip is published.' : 'Ops will publish your trip and capture the charter on your card shortly.'}
        />
        <div className="page-view" style={{ maxWidth: 640 }}>
          <div style={{ background: 'var(--card)', borderRadius: 14, padding: 24, border: '1px solid var(--hair)' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--moss)', marginBottom: 8, fontWeight: 600 }}>Accepted</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>{tripName}</div>
            <div style={{ fontSize: 13, color: 'var(--ink-mid)' }}>Total: {fmtMoney(totalDollars)} · {seatsTotal} seats</div>
          </div>
        </div>
      </div>
    )
  }

  if (done === 'declined' || sub.status === 'declined') {
    return (
      <div className="page">
        <PageHero
          accent="signal"
          eyebrow="QUOTE DECLINED"
          title="Got it"
          sub="Ops has been notified. They'll reach out if they can find different pricing."
        />
      </div>
    )
  }

  if (sub.status !== 'quoted') {
    return (
      <div className="page">
        <PageHero
          accent="sun"
          eyebrow="QUOTE"
          title="Not ready yet"
          sub={`This submission is currently ${sub.status}. Ops will send a quote when they have it.`}
        />
      </div>
    )
  }

  return (
    <div className="page">
      <PageHero
        accent="teal"
        eyebrow="QUOTE READY"
        title={tripName}
        sub="Ops sourced pricing for your charter. Review and confirm to authorize the capture."
      />

      <div className="page-view" style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Quote details card */}
        <div style={{ background: 'var(--card)', borderRadius: 14, padding: 24, border: '1px solid var(--hair)', boxShadow: '0 2px 4px rgba(13,51,64,0.05),0 12px 30px rgba(13,51,64,0.10)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--tropic-d)', fontWeight: 700, marginBottom: 12 }}>
            The number
          </div>
          <div style={{ fontSize: 42, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em', lineHeight: 1, fontFamily: 'var(--ui)' }}>
            {fmtMoney(totalDollars)}
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-mid)', marginTop: 6, fontFamily: 'var(--mono)', letterSpacing: '0.04em' }}>
            {fmtMoney(perPax)} / seat × {seatsTotal} seats
          </div>

          {/* Breakdown — what makes up the total */}
          {feeDollars > 0 && (
            <div style={{ background: 'var(--paper)', borderRadius: 10, padding: '14px 16px', marginTop: 18, border: '1px solid var(--hair)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--ink-soft)', marginBottom: 8 }}>
                <span>Charter cost (Tropic + operators)</span>
                <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{fmtMoney(charterDollars)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--ink-soft)' }}>
                <span>Travail service fee <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-light)' }}>3%</span></span>
                <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{fmtMoney(feeDollars)}</span>
              </div>
              <div style={{ height: 1, background: 'var(--hair)', margin: '10px 0 8px' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, alignItems: 'center' }}>
                <span style={{ fontWeight: 700, color: 'var(--ink)' }}>Authorized capture</span>
                <span style={{ fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--ui)', fontSize: 16, letterSpacing: '-0.012em' }}>{fmtMoney(totalDollars)}</span>
              </div>
            </div>
          )}

          <div style={{ height: 1, background: 'var(--hair)', margin: '18px 0' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--ink-soft)', marginBottom: 6 }}>
            <span>Your floor (your {anchorSeats} seat{anchorSeats === 1 ? '' : 's'} only)</span>
            <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{fmtMoney(anchorFloor)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--ink-soft)' }}>
            <span>If no one else books</span>
            <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{fmtMoney(totalDollars)}</span>
          </div>

          <div style={{ background: 'rgba(0,179,199,0.06)', borderLeft: '3px solid var(--tropic)', borderRadius: '0 8px 8px 0', padding: '12px 14px', fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.55, marginTop: 18 }}>
            On accept, we capture the full amount above on your card. As pax book seats, the charter portion you covered is rebated at trip departure — your final charter cost never goes above your floor. {feeDollars > 0 ? 'The 3% service fee stays with Travail; only refunded if Ops cancels the trip itself.' : ''}
          </div>
        </div>

        {/* Trip summary */}
        <div style={{ background: 'var(--card)', borderRadius: 14, padding: 18, border: '1px solid var(--hair)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-light)', fontWeight: 700, marginBottom: 12 }}>Trip</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13.5, color: 'var(--ink-soft)' }}>
            <div><strong style={{ color: 'var(--ink)' }}>{tripName}</strong></div>
            {body.date && <div>{body.date}</div>}
            {body.originCode && <div>From {body.originCode}{body.destCode ? ` → ${body.destCode}` : ''}</div>}
            {body.pitch && (
              <div style={{ background: 'var(--paper)', padding: '10px 12px', borderRadius: 8, marginTop: 6, fontStyle: 'italic', color: 'var(--ink-mid)' }}>
                &ldquo;{body.pitch}&rdquo;
              </div>
            )}
          </div>
        </div>

        {error && (
          <div style={{ background: 'rgba(217,78,42,0.08)', border: '1px solid rgba(217,78,42,0.25)', color: 'var(--signal)', padding: '10px 14px', borderRadius: 10, fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Decision */}
        {!declineMode ? (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              className="btn-primary"
              style={{ flex: '1 1 auto', minWidth: 200, height: 54, fontSize: 15, justifyContent: 'center' }}
              onClick={() => respond('accept')}
              disabled={submitting !== null}
            >
              {submitting === 'accept'
                ? <><span className="pending-indicator" style={{ width: 14, height: 14, borderWidth: 2 }} />Confirming…</>
                : `Accept · authorize ${fmtMoney(totalDollars)} capture →`}
            </button>
            <button
              type="button"
              className="btn-ghost"
              style={{ height: 54, padding: '0 22px', fontSize: 14 }}
              onClick={() => setDeclineMode(true)}
              disabled={submitting !== null}
            >
              Decline
            </button>
          </div>
        ) : (
          <div style={{ background: 'var(--card)', borderRadius: 14, padding: 18, border: '1px solid var(--hair)' }}>
            <div style={{ fontSize: 13, color: 'var(--ink-mid)', marginBottom: 10 }}>
              Tell ops what isn't working — pricing, dates, scope — so they can come back with revisions.
            </div>
            <textarea
              value={declineReason}
              onChange={e => setDeclineReason(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="Quote too high, dates shifted, scope changed…"
              style={{ width: '100%', boxSizing: 'border-box', padding: 12, borderRadius: 10, border: '1px solid var(--hair)', fontFamily: 'inherit', fontSize: 14, resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button
                className="btn-primary"
                style={{ flex: 1, height: 48, fontSize: 14, justifyContent: 'center', background: 'var(--signal)' }}
                onClick={() => respond('decline')}
                disabled={submitting !== null}
              >
                {submitting === 'decline' ? 'Sending…' : 'Send decline'}
              </button>
              <button
                type="button"
                className="btn-ghost"
                style={{ height: 48, padding: '0 18px', fontSize: 14 }}
                onClick={() => { setDeclineMode(false); setError(null) }}
              >
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
