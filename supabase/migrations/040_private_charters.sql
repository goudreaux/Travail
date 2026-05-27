-- Private charter flag — when true, the trip is hidden from the
-- public Open Seats feed. The anchor still sees it in My Trips and
-- on their boarding pass; the public board treats it as if it didn't
-- exist. Useful for member-anchored trips where the anchor doesn't
-- want network seat-takers.

alter table public.flights
  add column if not exists is_private boolean not null default false;

alter table public.excursions
  add column if not exists is_private boolean not null default false;

-- Auto-flag: a flight or excursion where the anchor reserved every
-- seat is a private charter by definition (no seats remain for the
-- network). Backfill so existing fully-anchored trips stop showing
-- on Open Seats immediately.
update public.flights
  set is_private = true
  where seats_anchor >= seats_total
    and anchor_member_id is not null
    and is_private = false;

update public.excursions
  set is_private = true
  where spots_anchor >= spots_total
    and anchor_member_id is not null
    and is_private = false;
