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

// Member-facing cancel funnel — the in-app copy points to this number so
// every cancel goes through a human conversation with ops. Override with
// env when ops gets a dedicated business line.
export const TRAVAIL_OPS_PHONE = process.env.TRAVAIL_OPS_PHONE ?? '+1-408-507-3523'
export const TRAVAIL_OPS_PHONE_DISPLAY = process.env.TRAVAIL_OPS_PHONE_DISPLAY ?? '(408) 507-3523'
