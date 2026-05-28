'use client'
import { useState } from 'react'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { getStripe } from '@/lib/stripe-browser'
import { fmtMoney } from '@/lib/data'

// Stripe Payment form for pax seat reservations. Lives inside the
// Reserve confirmation sheet. On success, calls onPaid with the
// PaymentIntent id; the parent is responsible for inserting the
// booking row with the PI id stamped on it.
//
// The Stripe Elements provider is mounted here (not in the parent)
// because Elements needs a clientSecret at construction time — the
// parent fetches it after the sheet opens, so we render this form
// only once we have one.

export interface PaidResult {
  paymentIntentId: string
}

export function ReservePaymentForm({
  clientSecret,
  totalCents,
  submitLabel,
  onPaid,
}: {
  clientSecret: string
  totalCents: number
  submitLabel?: string
  onPaid: (r: PaidResult) => Promise<void> | void
}) {
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
      <InnerForm totalCents={totalCents} submitLabel={submitLabel} onPaid={onPaid} />
    </Elements>
  )
}

function InnerForm({
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
      setError((err as Error)?.message ?? 'Network error — please try again.')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PaymentElement options={{ layout: 'tabs' }} />
      {error && (
        <div style={{
          fontSize: 12,
          color: 'var(--danger)',
          background: 'rgba(217,78,42,0.08)',
          border: '1px solid rgba(217,78,42,0.25)',
          padding: '8px 10px',
          borderRadius: 8,
        }}>
          {error}
        </div>
      )}
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
