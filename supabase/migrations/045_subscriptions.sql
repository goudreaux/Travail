-- Subscription columns to complete the founding-members billing model.
--
-- The bulk of the Stripe state (stripe_customer_id, stripe_subscription_id,
-- subscription_status, trial_ends_at, current_period_end) already exists
-- from migration 031, and the existing /api/stripe/webhook keeps those in
-- sync on every customer.subscription.* event. This migration adds the two
-- pieces that make the founder grandfathering policy work:
--
--   subscription_price_id  — the Stripe Price id locked at signup. We store
--       it on the member so a future price hike (e.g. $200 → $300 public)
--       leaves founders billing the old price id. Also lets ops see at a
--       glance which cohort a member belongs to.
--
--   is_founding_member     — denormalized boolean for fast filtering. Set
--       true on first successful subscription create during the founder
--       phase, immutable thereafter. Even if they cancel and re-subscribe
--       later at the new public rate this stays true (badge stays).
--
-- Also adds a helper member_can_book() so the booking guard has a single
-- source of truth that's cheap to call from RLS or server code.

alter table public.members
  add column if not exists subscription_price_id text,
  add column if not exists is_founding_member boolean not null default false;

create index if not exists members_subscription_status_idx
  on public.members(subscription_status)
  where subscription_status is not null and subscription_status != 'none';

create index if not exists members_is_founding_member_idx
  on public.members(is_founding_member)
  where is_founding_member = true;

-- "Can this member create new billable obligations right now?"
-- 'active'      — paying member, full access
-- 'trialing'    — Stripe trial (we don't use this today but cheap to allow)
-- 'incomplete'  — first invoice still processing; we grant instant access
--                 per product policy so they can book during the brief
--                 window before the payment confirms.
-- Anything else (past_due, cancelled, unpaid, incomplete_expired, null) →
-- blocked. The past_due path is the one ops resolves with a phone call.
create or replace function public.member_can_book(m_id text)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select coalesce(subscription_status in ('active','trialing','incomplete'), false)
  from public.members
  where id = m_id
$$;

grant execute on function public.member_can_book(text) to authenticated;
