-- Stripe Billing columns for members + bookings.
--
-- Members are linked 1:1 to a Stripe Customer + their recurring membership
-- Subscription. Trip bookings get an off-session PaymentIntent (run by ops once
-- the booking is approved) tracked here.

alter table public.members
  add column if not exists stripe_customer_id     text,
  add column if not exists stripe_subscription_id text,
  -- Stripe subscription status: trialing | active | past_due | canceled |
  -- incomplete | incomplete_expired | unpaid. Null until the member subscribes.
  add column if not exists subscription_status    text,
  add column if not exists trial_ends_at          timestamptz,
  add column if not exists current_period_end     timestamptz;

create unique index if not exists members_stripe_customer_id_key
  on public.members(stripe_customer_id) where stripe_customer_id is not null;
create unique index if not exists members_stripe_subscription_id_key
  on public.members(stripe_subscription_id) where stripe_subscription_id is not null;

alter table public.bookings
  add column if not exists stripe_payment_intent_id text,
  add column if not exists paid_amount_cents        integer,
  add column if not exists paid_at                  timestamptz,
  -- pending (created) | succeeded | failed | refunded. Null until ops runs payment.
  add column if not exists payment_status           text;

create unique index if not exists bookings_stripe_payment_intent_id_key
  on public.bookings(stripe_payment_intent_id) where stripe_payment_intent_id is not null;
