'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { createClient } from '@/lib/supabase/client'
import { getStripe } from '@/lib/stripe-browser'

// Last step of new-member onboarding: collect the card and start the
// $200/month founding subscription.
//
// Flow:
//   1. POST /api/subscribe/create → returns a PaymentIntent client_secret
//      for the first invoice. Subscription is already on the member at
//      this point in 'incomplete' status.
//   2. Stripe Elements PaymentElement collects the card; we confirm
//      against the PaymentIntent.
//   3. On success → /. The member has 'incomplete' or 'active' status
//      depending on how fast the webhook beat us. Either lets them book
//      (member_can_book treats incomplete as ok during the brief window).
//   4. On decline → show the error inline, member can retry without
//      regenerating the subscription.
//
// Admins (is_admin = true) see a "Skip — admin testing" link so test
// flows don't burn real cards.

export default function OnboardingSubscribePage() {
  const router = useRouter()
  const supabase = createClient()

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [memberName, setMemberName] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: m } = await supabase
        .from('members').select('id, name, is_admin, subscription_status')
        .eq('user_id', user.id).maybeSingle()
      if (!m) { setError('Member record not found.'); setStatus('error'); return }
      setIsAdmin(!!m.is_admin)
      setMemberName(m.name ?? null)

      // Already past the wall? Skip ahead.
      if (m.subscription_status === 'active' || m.subscription_status === 'trialing') {
        router.push('/'); return
      }

      try {
        const res = await fetch('/api/subscribe/create', { method: 'POST' })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? `Subscription create failed (${res.status})`)
        if (!data.client_secret) {
          // Stripe didn't return a client secret. Surface this instead of
          // silently dropping the member into the app — likely an API
          // shape change or a config issue, and ops needs visibility.
          throw new Error(
            'Could not load card form. Your subscription was created but the payment step did not initialize. Please reach out to the Concierge Team.',
          )
        }
        setClientSecret(data.client_secret)
        setStatus('ready')
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Something went wrong')
        setStatus('error')
      }
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="invite-wrap">
      <div className="invite-glow invite-glow--top" />
      <div className="invite-card" style={{ maxWidth: 520 }}>
        <div className="mono" style={{ fontSize: 10, letterSpacing: '0.22em', color: 'var(--sun)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 14 }}>
          Founding membership
        </div>
        <h1 style={{ fontFamily: 'var(--display)', fontSize: 32, fontWeight: 400, color: 'var(--ink)', margin: '0 0 10px', letterSpacing: '-0.015em' }}>
          Activate your membership{memberName ? `, ${memberName.split(' ')[0]}` : ''}.
        </h1>
        <p style={{ fontSize: 14.5, color: 'var(--ink-soft)', lineHeight: 1.65, margin: '0 0 22px' }}>
          Travail membership is $200 per month. As a founding member, your rate remains at this level for as long as your membership is active.
        </p>

        {status === 'loading' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '24px 0', color: 'var(--ink-light)', fontSize: 14 }}>
            <div className="pending-indicator" />
            Setting up your subscription…
          </div>
        )}

        {status === 'error' && (
          <div style={{ background: 'rgba(217,78,42,0.08)', border: '1px solid rgba(217,78,42,0.25)', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: 'var(--signal)', marginBottom: 16 }}>
            {error ?? 'Something went wrong.'}
            <div style={{ marginTop: 10 }}>
              <button className="btn-ghost" onClick={() => window.location.reload()}>Try again</button>
            </div>
          </div>
        )}

        {status === 'ready' && clientSecret && (
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
            <PayForm onPaid={() => router.push('/')} />
          </Elements>
        )}

        <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--hair)', fontSize: 11.5, color: 'var(--ink-faint)', lineHeight: 1.6, fontFamily: 'var(--mono)', letterSpacing: '0.04em' }}>
          Charged monthly until you cancel. Cancel anytime by phone, see Membership for details.
        </div>

        {isAdmin && (
          <div style={{ marginTop: 14, textAlign: 'center' }}>
            <button
              className="btn-ghost"
              style={{ fontSize: 11, color: 'var(--ink-faint)' }}
              onClick={() => router.push('/')}
            >
              Skip (admin testing)
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function PayForm({ onPaid }: { onPaid: () => void }) {
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
        confirmParams: { return_url: window.location.origin + '/' },
        redirect: 'if_required',
      })
      if (confirmErr) {
        setError(confirmErr.message ?? 'Card declined.')
        setSubmitting(false)
        return
      }
      // 'processing' = ACH-style pending; treat as success and let them in.
      // The webhook flips status to 'active' when the payment settles.
      if (paymentIntent && (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing')) {
        onPaid()
        return
      }
      setError(`Payment status: ${paymentIntent?.status ?? 'unknown'}.`)
      setSubmitting(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed.')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit}>
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
        {submitting ? 'Processing…' : 'Start membership · $200/mo'}
      </button>
    </form>
  )
}
