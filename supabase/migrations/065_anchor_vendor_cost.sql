-- Itemized anchor quotes: split the quoted cost into the Tropic charter (flight)
-- and the vendor/experience cost, so the member sees a line-itemed quote
-- (flight + experience + service fee = total). The 3% service fee is charged on
-- the combined charter + vendor base.
--
--   charter_cost_cents  — Tropic flight charter (already exists, migration 042)
--   vendor_cost_cents   — experience / vendor cost (NEW)
--   quoted_total_cents  — charter + vendor + 3% fee (what the card authorizes)
alter table public.anchor_submissions
  add column if not exists vendor_cost_cents integer;
