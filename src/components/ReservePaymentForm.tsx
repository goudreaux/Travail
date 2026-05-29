'use client'
import { useState } from 'react'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { getStripe } from '@/lib/stripe-browser'
import { fmtMoney } from '@/lib/data'

// Stripe Payment form for pax seat reservations. Lives inside the
// Reserve confirmation sheet. On success, calls onPaid with the
// PaymentIntent id; the parent is responsible for inserting the
// booking row.
//
// Two modes:
//   • Saved card (no friction): the server preset the member's card on the
//     PaymentIntent. We show a one-tap "Pay with Visa •••• 1234" — no card
//     form. A "Use a different card" link drops to the PaymentElement.
//   • New card: the PaymentElement is mounted to collect a card. The card
//     is saved for next time (setup_future_usage on the PI), so this only
//     happens on the first booking (or when the member chooses to switch).

export interface PaidResult {
  paymentIntentId: string
}

export interface SavedCard {
  id: string
  brand: string | null
  last4: string | null
}

export function ReservePaymentForm({
  clientSecret,
  totalCents,
  submitLabel,
  savedCard,
  onPaid,
}: {
  clientSecret: string
  totalCents: number
  submitLabel?: string
  savedCard?: SavedCard | null
  onPaid: (r: PaidResult) => Promise<void> | void
}) {
  // When the member opts to enter a different card, fall through to the
  // PaymentElement path even though a saved card exists.
  const [useNewCard, setUseNewCard] = useState(false)
  const showSaved = !!savedCard && !useNewCard

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
      {showSaved ? (
        <SavedCardForm
          clientSecret={clientSecret}
          totalCents={totalCents}
          submitLabel={submitLabel}
          savedCard={savedCard!}
          onPaid={onPaid}
          onUseNewCard={() => setUseNewCard(true)}
        />
      ) : (
        <NewCardForm totalCents={totalCents} submitLabel={submitLabel} onPaid={onPaid} />
      )}
    </Elements>
  )
}

function prettyBrand(brand: string | null): string {
  if (!brand) return 'Card'
  return brand.charAt(0).toUpperCase() + brand.slice(1)
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div style={{
      fontSize: 12,
      color: 'var(--danger)',
      background: 'rgba(217,78,42,0.08)',
      border: '1px solid rgba(217,78,42,0.25)',
      padding: '8px 10px',
      borderRadius: 8,
    }}>
      {msg}
    </div>
  )
}

// ── Saved-card one-tap ────────────────────────────────────────────────────
function SavedCardForm({
  clientSecret,
  totalCents,
  submitLabel,
  savedCard,
  onPaid,
  onUseNewCard,
}: {
  clientSecret: string
  totalCents: number
  submitLabel?: string
  savedCard: SavedCard
  onPaid: (r: PaidResult) => Promise<void> | void
  onUseNewCard: () => void
}) {
  const stripe = useStripe()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pay() {
    if (!stripe) return
    setSubmitting(true)
    setError(null)
    try {
      // The PI already has the saved card preset server-side, so confirm
      // without a payment_method — Stripe charges the preset card. Handles
      // 3DS automatically if the card requires it.
      const { error: confirmErr, paymentIntent } = await stripe.confirmCardPayment(clientSecret)
      if (confirmErr) {
        // Card declined / auth failed — let them try a different card.
        setError(`${confirmErr.message ?? 'That card was declined.'} Try a different card.`)
        setSubmitting(false)
        onUseNewCard()
        return
      }
      if (!paymentIntent || paymentIntent.status !== 'succeeded') {
        setError(`Payment status: ${paymentIntent?.status ?? 'unknown'}. Try again.`)
        setSubmitting(false)
        return
      }
      await onPaid({ paymentIntentId: paymentIntent.id })
    } catch (err) {
      setError((err as Error)?.message ?? 'Network error. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 10, padding: '13px 15px' }}>
        <div style={{ width: 40, height: 28, borderRadius: 6, background: 'linear-gradient(135deg,#0a3340 0%,#073744 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} aria-hidden>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#5fc7d6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
            {prettyBrand(savedCard.brand)} ending in {savedCard.last4 ?? '••••'}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-light)', marginTop: 1 }}>Your card on file</div>
        </div>
      </div>

      {error && <ErrorBox msg={error} />}

      <button
        type="button"
        className="btn-primary"
        style={{ width: '100%', height: 50, fontSize: 15, justifyContent: 'center' }}
        disabled={!stripe || submitting}
        onClick={pay}
      >
        {submitting
          ? <><span className="pending-indicator" style={{ width: 14, height: 14, borderWidth: 2 }} />Charging your card…</>
          : (submitLabel ?? `Pay ${fmtMoney(totalCents / 100)} & confirm →`)
        }
      </button>

      <button
        type="button"
        onClick={onUseNewCard}
        disabled={submitting}
        style={{ background: 'none', border: 'none', color: 'var(--tropic-d)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: '2px' }}
      >
        Use a different card
      </button>
    </div>
  )
}

// ── New-card (PaymentElement) ─────────────────────────────────────────────
function NewCardForm({
  totalCents,
  submitLabel,
  onPaid,
}: {
  totalCents: number
  submitLabel?: string
  onPaid: (r: PaidResult) => Promise<void> | void
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
      const { error: confirmErr, paymentIntent } = await stripe.confirmPayment({
        elements,
        // Stay on the page — pax is already in the confirm sheet; we
        // want to drop straight into "booking confirmed" without a
        // round-trip through return_url.
        confirmParams: { return_url: window.location.href },
        redirect: 'if_required',
      })
      if (confirmErr) {
        setError(confirmErr.message ?? 'Payment failed.')
        setSubmitting(false)
        return
      }
      if (!paymentIntent || paymentIntent.status !== 'succeeded') {
        setError(`Payment status: ${paymentIntent?.status ?? 'unknown'}. Try again.`)
        setSubmitting(false)
        return
      }
      // Hand the PI id to the parent so it can insert the booking
      // row. We intentionally don't reset submitting=false on success
      // because the parent unmounts the confirm sheet immediately.
      await onPaid({ paymentIntentId: paymentIntent.id })
    } catch (err) {
      // Network blip, browser security policy, etc. — Stripe.js
      // sometimes throws instead of surfacing via { error }. Without
      // this catch the button sticks on "Processing…" forever.
      setError((err as Error)?.message ?? 'Network error. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PaymentElement options={{ layout: 'tabs' }} />
      {error && <ErrorBox msg={error} />}
      <button
        type="submit"
        className="btn-primary"
        style={{ width: '100%', height: 50, fontSize: 15, justifyContent: 'center' }}
        disabled={!stripe || submitting}
      >
        {submitting
          ? <><span className="pending-indicator" style={{ width: 14, height: 14, borderWidth: 2 }} />Charging your card…</>
          : (submitLabel ?? `Pay ${fmtMoney(totalCents / 100)} & confirm →`)
        }
      </button>
    </form>
  )
}
