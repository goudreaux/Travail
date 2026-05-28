-- Anchor service fee: 3% on top of Tropic's charter quote.
--
-- The total presented to (and captured from) the anchor is now
-- charter_cost + 3% service fee. The fee is Travail's margin and is
-- not refunded at settlement — it sits on top of the charter cost
-- the entire time.
--
-- charter_cost_cents stores the bare Tropic quote so we can recover
-- the breakdown for receipts / display. quoted_total_cents (from
-- migration 042) continues to be the authoritative capture amount =
-- charter_cost_cents + round(charter_cost_cents * 0.03).
--
-- Backward compat: rows quoted before this migration have null
-- charter_cost_cents — display treats those as if the entire
-- quoted_total was the charter (no fee added).

alter table public.anchor_submissions
  add column if not exists charter_cost_cents integer;
