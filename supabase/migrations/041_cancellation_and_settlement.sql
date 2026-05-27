-- Cancellation + settlement plumbing for the charter pass-through model.
--
-- The economics (locked in by policy):
--   • Trip total = Tropic charter cost (no markup).
--   • Per-seat price = total / capacity. Every pax pays this rate flat.
--   • Anchor is captured for the full charter when Ops publishes the trip.
--   • As pax book, anchor is NOT immediately rebated — settlement is one
--     batched refund at trip-departure (cleaner than per-booking refunds
--     and avoids Stripe fee bleed).
--   • Pax cancel >72h before departure → full refund, seat re-opens.
--   • Pax cancel <72h before departure → seat forfeits; payment stays
--     on Travail's books and counts toward the anchor's settlement.
--   • Ops cancels whole trip → everyone refunded incl. anchor; Tropic
--     handles the charter side per contract.
--   • Anchor is LOCKED at publish; only out is an ops-mediated
--     substitute-anchor swap (v2).

-- ─── Anchor charter capture state on flights + excursions ──────────────────
alter table public.flights
  add column if not exists anchor_payment_intent_id text,
  add column if not exists anchor_captured_cents integer not null default 0,
  add column if not exists anchor_captured_at timestamptz,
  add column if not exists anchor_refunded_cents integer not null default 0,
  add column if not exists anchor_settled_at timestamptz,
  -- Frozen-at-publish-time snapshot. Future policy changes don't
  -- retroactively affect already-booked trips.
  add column if not exists cancellation_policy jsonb not null default
    '{"window_hours": 72, "anchor_locked": true}'::jsonb;

alter table public.excursions
  add column if not exists anchor_payment_intent_id text,
  add column if not exists anchor_captured_cents integer not null default 0,
  add column if not exists anchor_captured_at timestamptz,
  add column if not exists anchor_refunded_cents integer not null default 0,
  add column if not exists anchor_settled_at timestamptz,
  add column if not exists cancellation_policy jsonb not null default
    '{"window_hours": 72, "anchor_locked": true}'::jsonb;

-- ─── Per-booking cancellation state ────────────────────────────────────────
alter table public.bookings
  add column if not exists cancelled_at timestamptz,
  add column if not exists refund_amount_cents integer,
  add column if not exists refund_id text,             -- Stripe refund id
  add column if not exists was_forfeit boolean not null default false;
-- was_forfeit = true when the cancel landed inside the 72h window: pax
-- forfeited the seat, no refund, the money stays in the trip pool.

-- ─── Settlement audit trail ────────────────────────────────────────────────
-- One row per settled trip — the official record of who paid what at
-- the end. Read by the anchor (for their own trips) and by admins.
create table if not exists public.trip_settlements (
  id uuid primary key default gen_random_uuid(),
  item_kind text not null check (item_kind in ('flight','excursion')),
  item_id text not null,
  charter_total_cents integer not null,
  paid_revenue_cents integer not null,     -- sum of pax payments incl. forfeits
  anchor_refund_cents integer not null,    -- amount refunded back to anchor
  anchor_net_paid_cents integer not null,  -- final amount anchor was billed
  settled_at timestamptz not null default now(),
  settled_by text,                         -- 'system' | admin member id
  notes text
);

create index if not exists trip_settlements_item_idx
  on public.trip_settlements (item_kind, item_id);

alter table public.trip_settlements enable row level security;

-- Admins see all settlements (audit + reconciliation).
create policy "Admins read settlements" on public.trip_settlements
  for select using (public.is_admin());

-- A member can read settlements for trips THEY anchored — they should
-- be able to see why their final bill came out to what it did.
create policy "Anchors read their own trip settlements" on public.trip_settlements
  for select using (
    (item_kind = 'flight' and exists (
      select 1 from public.flights f
      where f.id = trip_settlements.item_id
        and f.anchor_member_id = public.current_member_id()
    ))
    or (item_kind = 'excursion' and exists (
      select 1 from public.excursions e
      where e.id = trip_settlements.item_id
        and e.anchor_member_id = public.current_member_id()
    ))
  );

-- Writes only via service role (the settlement job runs server-side);
-- no insert/update/delete policy = no client writes allowed.
