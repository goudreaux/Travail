'use client'
import { useState } from 'react'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { getStripe } from '@/lib/stripe-browser'

// Stripe Elements wrapper for the proposer's card-on-file step,
// shared by both /propose/flight and /propose/excursion. The wizard
// has already POSTed to /api/proposals/create and has a clientSecret;
// this component renders the PaymentElement, calls confirmSetup,
// then POSTs to /api/proposals/commit/finalize to attach the
// payment method id to the proposer's commit row.
//
// No charge happens here — this is off_session card-on-file. The
// eventual capture runs at lock time via PaymentIntent.

export function ProposerCardForm({
  clientSecret,
  onSuccess,
  perSeatHint,
  proposerMinSeats,
  proposerMaxSeats,
}: {
  clientSecret: string
  onSuccess: () => void
  perSeatHint?: number  // optional — ops sets the real price during review
  proposerMinSeats: number
  proposerMaxSeats: number
}) {
  return (
    <Elements
      stripe={getStripe()}
      options={{
        clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#e09418',
            colorBackground: '#fffbf0',
            colorText: '#0d3340',
            colorDanger: '#d94e2a',
            fontFamily: '-apple-system,BlinkMacSystemFont,"Inter Tight","Inter",sans-serif',
            borderRadius: '10px',
            spacingUnit: '4px',
          },
        },
      }}
    >
      <InnerForm onSuccess={onSuccess} perSeatHint={perSeatHint} proposerMinSeats={proposerMinSeats} proposerMaxSeats={proposerMaxSeats} />
    </Elements>
  )
}

function InnerForm({
  onSuccess,
  perSeatHint,
  proposerMinSeats,
  proposerMaxSeats,
}: {
  onSuccess: () => void
  perSeatHint?: number
  proposerMinSeats: number
  proposerMaxSeats: number
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setSubmitting(true)
    setError(null)
    try {
      const { error: confirmErr, setupIntent } = await stripe.confirmSetup({
        elements,
        confirmParams: { return_url: window.location.href },
        redirect: 'if_required',
      })
      if (confirmErr) {
        setError(confirmErr.message ?? 'Card declined.')
        setSubmitting(false)
        return
      }
      if (!setupIntent || setupIntent.status !== 'succeeded') {
        setError(`Setup status: ${setupIntent?.status ?? 'unknown'}. Please try a different card.`)
        setSubmitting(false)
        return
      }
      // Persist the payment_method id on the proposer's commit row.
      const finalRes = await fetch('/api/proposals/commit/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setupIntentId: setupIntent.id }),
      })
      if (!finalRes.ok) {
        const j = await finalRes.json().catch(() => ({}))
        throw new Error(j.error ?? 'Failed to finalize card')
      }
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save card')
      setSubmitting(false)
    }
  }

  // Worst / best case math the proposer sees right above the card.
  const minHint = perSeatHint != null
    ? `$${((proposerMinSeats * perSeatHint) / 100).toFixed(0)}`
    : `${proposerMinSeats} seat${proposerMinSeats === 1 ? '' : 's'}`
  const maxHint = perSeatHint != null
    ? `$${((proposerMaxSeats * perSeatHint) / 100).toFixed(0)}`
    : `${proposerMaxSeats} seat${proposerMaxSeats === 1 ? '' : 's'}`

  return (
    <form onSubmit={submit}>
      <div style={{
        background: 'rgba(0,179,199,0.06)', border: '1px solid rgba(0,179,199,0.20)',
        borderRadius: 10, padding: '12px 14px', fontSize: 12.5, color: 'var(--ink-soft)',
        lineHeight: 1.55, marginBottom: 16,
      }}>
        <strong style={{ color: 'var(--ink)' }}>No charge yet.</strong>{' '}
        We save your card on file. If the network commits enough seats, the
        Concierge Team locks the trip and you&apos;re charged for your spread (best case
        {' '}<strong>{minHint}</strong>, worst case <strong>{maxHint}</strong>).
        If the proposal expires without funding, nothing happens.
      </div>
      <PaymentElement options={{ layout: 'tabs' }} />
      {error && (
        <div style={{ background: 'rgba(217,78,42,0.08)', border: '1px solid rgba(217,78,42,0.25)', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: 'var(--signal)', marginTop: 12 }}>
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="btn-primary"
        style={{ width: '100%', marginTop: 16 }}
      >
        {submitting ? 'Saving card…' : 'Save card & submit proposal'}
      </button>
    </form>
  )
}
