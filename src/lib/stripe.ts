import Stripe from 'stripe'

// Server-only Stripe client. Keys live in env so this module must never be
// imported from a client component.

const key = process.env.STRIPE_SECRET_KEY

// The SDK will throw on its first API call if the key is missing; we
// instantiate with a placeholder so module load doesn't crash builds without
// keys yet.
export const stripe = new Stripe(key ?? 'sk_test_placeholder', {
  appInfo: { name: 'Travail', url: 'https://travailclub.com' },
})

export const STRIPE_PRICE_FOUNDING = process.env.STRIPE_PRICE_FOUNDING ?? ''
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? ''
