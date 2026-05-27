'use client'
import { loadStripe, type Stripe } from '@stripe/stripe-js'

// Singleton — loadStripe must be called at module scope outside the
// component so React renders don't re-fetch the script every time.
// The same pattern Stripe documents for their React integration.

let promise: Promise<Stripe | null> | null = null

export function getStripe(): Promise<Stripe | null> {
  if (!promise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    if (!key) {
      console.warn('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY not set — Stripe.js will not load')
      promise = Promise.resolve(null)
    } else {
      promise = loadStripe(key)
    }
  }
  return promise
}
