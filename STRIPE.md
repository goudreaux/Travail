# Stripe Setup (payments + membership)

The app integrates Stripe for monthly membership subscriptions and per-trip
payments. This doc covers what to configure on Stripe's side and which env
variables to set on Vercel. The code scaffolding (schema, webhook handler,
client) is already in place — once these are filled in, billing flows light up.

## 1) Create the Stripe account

1. Sign up at **stripe.com**. Skip the "activate live mode" prompts for now —
   we'll work in **Test mode** first.
2. In the dashboard, top-left toggle, make sure **Test mode** is on (the orange
   banner says "TEST MODE").

## 2) Create the Founding Membership product

1. Stripe dashboard → **Product catalog** → **Add product**.
2. Name: `Travail Founding Membership`.
3. **Recurring** price: USD `$200.00` / month.
4. Save. Open the new product → copy the **Price ID** (`price_...`). You'll
   paste this into env as `STRIPE_PRICE_FOUNDING`.
5. The 30-day free trial is applied per-subscription in the Checkout call, not
   on the price — no setting needed here.

## 3) Get the API keys

Stripe dashboard → **Developers → API keys**:

- **Publishable key** (`pk_test_...`) → `STRIPE_PUBLISHABLE_KEY`
- **Secret key** (`sk_test_...`) → `STRIPE_SECRET_KEY`

## 4) Add the webhook

Stripe dashboard → **Developers → Webhooks → Add endpoint**:

- **Endpoint URL:** `https://travailclub.com/api/stripe/webhook`
- **Events to send** (select these):
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `payment_intent.succeeded`
  - `payment_intent.payment_failed`
- Save. Click the new endpoint → reveal **Signing secret** (`whsec_...`) →
  `STRIPE_WEBHOOK_SECRET`.

## 5) Run the schema migration

In Supabase → SQL Editor, paste the contents of
`supabase/migrations/031_stripe_columns.sql` and run it. This adds the Stripe
columns to `members` and `bookings`.

## 6) Set env vars on Vercel

Vercel project → **Settings → Environment Variables**:

| Name | Value |
| --- | --- |
| `STRIPE_SECRET_KEY` | `sk_test_...` (or `sk_live_...` once live) |
| `STRIPE_PUBLISHABLE_KEY` | `pk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` |
| `STRIPE_PRICE_FOUNDING` | `price_...` (Founding membership price ID) |

Redeploy after saving so the server picks them up.

## 7) Going live

When you're ready: flip Stripe to **Live mode**, repeat steps 2–4 in live mode
(new product + price + webhook + keys), and swap the Vercel env values to the
live ones. Always test a real $200 charge end-to-end in live mode before
inviting members.
