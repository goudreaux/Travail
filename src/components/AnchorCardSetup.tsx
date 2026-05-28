'use client'
import { useEffect, useState } from 'react'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { getStripe } from '@/lib/stripe-browser'

// Anchor card-on-file UI.
//
// Two states:
//   1. Member already has a card → show a compact summary
//      ("Visa ending in 4242, expires 12/29") with a "Replace" button.
//   2. No card → show the Stripe Elements PaymentElement form so the
//      member can add one. On confirm, the new card becomes the
//      customer's default and is used by Ops at publish time.
//
// Props:
//   onCardReady?(): called whenever a card exists (initial + after add)
//   showReplaceButton?: boolean
//
// Wire this in next to the anchor wizard's submit button — the submit
// stays disabled until onCardReady has fired at least once.

interface CardSummary {
  hasCard: boolean
  brand?: string
  last4?: string
  exp?: string
}

export function AnchorCardSetup({ onCardReady }: { onCardReady?: () => void }) {
  const [card, setCard] = useState<CardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [replacing, setReplacing] = useState(false)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function fetchCard() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/anchor/setup-intent')
      const json = (await res.json()) as CardSummary
      setCard(json)
      if (json.hasCard) onCardReady?.()
    } catch {
      setError('Could not load your saved card.')
    } finally {
      setLoading(false)
    }
  }

  async function startSetup() {
    setError(null)
    setReplacing(true)
    try {
      const res = await fetch('/api/anchor/setup-intent', { method: 'POST' })
      const json = await res.json()
      if (!res.ok || !json.clientSecret) {
        setError(json.error ?? 'Could not start card setup.')
        setReplacing(false)
        return
      }
      setClientSecret(json.clientSecret)
    } catch {
      setError('Could not start card setup.')
      setReplacing(false)
    }
  }

  useEffect(() => { fetchCard() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── States ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="anchor-card anchor-card--loading">
        <span className="pending-indicator" />
        <span>Checking your saved card…</span>
      </div>
    )
  }

  // Replacement form mode (Elements rendered)
  if (clientSecret) {
    return (
      <Elements
        stripe={getStripe()}
        options={{
          clientSecret,
          appearance: {
            theme: 'stripe',
            variables: {
              colorPrimary: '#00b3c7',
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
        <CardForm
          onCancel={() => { setClientSecret(null); setReplacing(false) }}
          onComplete={async () => {
            setClientSecret(null)
            setReplacing(false)
            await fetchCard()
          }}
        />
      </Elements>
    )
  }

  // Card on file
  if (card?.hasCard) {
    return (
      <div className="anchor-card">
        <div className="anchor-card__head">
          <span className="anchor-card__eyebrow">Card on file</span>
          <button type="button" className="anchor-card__replace" onClick={startSetup} disabled={replacing}>
            {replacing ? 'Loading…' : 'Replace card'}
          </button>
        </div>
        <div className="anchor-card__body">
          <CardBrandMark brand={card.brand ?? ''} />
          <div>
            <div className="anchor-card__num">{(card.brand ?? 'Card').toUpperCase()} ending {card.last4}</div>
            <div className="anchor-card__exp">Expires {card.exp}</div>
          </div>
        </div>
        {error && <div className="anchor-card__error">{error}</div>}
      </div>
    )
  }

  // No card on file — show CTA to start
  return (
    <div className="anchor-card anchor-card--empty">
      <div className="anchor-card__head">
        <span className="anchor-card__eyebrow">Card required</span>
      </div>
      <p className="anchor-card__copy">
        Anchoring a trip commits you to the full charter cost; we hold
        your card and capture it when Ops publishes. Add a card to continue.
      </p>
      <button type="button" className="cta-outline" onClick={startSetup} disabled={replacing}>
        {replacing ? 'Loading…' : 'Add a card'}
      </button>
      {error && <div className="anchor-card__error">{error}</div>}
    </div>
  )
}

// ─── Inner form component (must live inside <Elements>) ─────────────────────

function CardForm({ onComplete, onCancel }: { onComplete: () => Promise<void>; onCancel: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setSubmitting(true)
    setError(null)
    const { error: confirmErr, setupIntent } = await stripe.confirmSetup({
      elements,
      // We stay on-page — Stripe returns control here. No redirect needed
      // because we're attaching a card for future use, not completing a sale.
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    })
    if (confirmErr) {
      setError(confirmErr.message ?? 'Could not save card.')
      setSubmitting(false)
      return
    }

    // Belt-and-braces: tell the server to set the just-attached PM as
    // the customer's default so the GET reader reliably reports
    // hasCard on the next poll (otherwise the form silently reverts).
    if (setupIntent?.id) {
      try {
        await fetch('/api/anchor/setup-intent/finalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ setupIntentId: setupIntent.id }),
        })
      } catch { /* fetchCard's fallback will still find the PM */ }
    }

    await onComplete()
    // Don't drop submitting=false here; we've unmounted on success.
  }

  return (
    <form onSubmit={submit} className="anchor-card">
      <div className="anchor-card__head">
        <span className="anchor-card__eyebrow">Add your card</span>
        <button type="button" className="anchor-card__replace" onClick={onCancel}>Cancel</button>
      </div>
      <div className="anchor-card__elements">
        <PaymentElement options={{ layout: 'tabs' }} />
      </div>
      {error && <div className="anchor-card__error">{error}</div>}
      <button type="submit" className="btn-primary" disabled={!stripe || submitting} style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
        {submitting ? 'Saving…' : 'Save card'}
      </button>
    </form>
  )
}

// Minimal card-brand marks — kept SVG-light so we don't ship a brand kit.
function CardBrandMark({ brand }: { brand: string }) {
  const initials = {
    visa: 'V',
    mastercard: 'MC',
    amex: 'AX',
    discover: 'D',
    diners: 'DC',
    jcb: 'JCB',
    unionpay: 'UP',
  }[brand.toLowerCase()] ?? brand.slice(0, 2).toUpperCase()
  return (
    <span className="anchor-card__brand" aria-hidden>{initials}</span>
  )
}
