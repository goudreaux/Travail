-- Security hardening (maintenance pass). Two RLS tightenings, both verified
-- safe against current code paths.

-- 1. Drop the stale member self-UPDATE policy on bookings.
--    It gated on `status in ('pending_ops_review','confirmed')` — values the
--    app no longer uses (bookings are 'pending'/'approved'/'cancelled'/
--    'declined'), so it matched no live rows — AND it had no WITH CHECK, so if
--    a booking ever re-entered one of those statuses a member could tamper
--    with financial columns (paid_amount_cents, total, refund_amount_cents)
--    on their own row and drive an over-refund at cancellation. Every booking
--    mutation already runs through service-role server routes (booking/cancel,
--    bookings/add-guests/finalize, admin/*), so members need no direct UPDATE.
drop policy if exists "Members can cancel own booking" on public.bookings;

-- 2. Restrict flight/excursion INSERT to admins.
--    Previously any authenticated member could insert rows (with check
--    auth.uid() is not null), allowing board pollution — e.g. a member could
--    insert a fake flight with status='published' that shows on the boards.
--    Real trips are created only by admins (admin UI runs under an is_admin
--    JWT, satisfied by the existing "Admins can manage …" FOR ALL policies)
--    or by service-role server routes (publish-anchor, proposals/lock, which
--    bypass RLS entirely). Dropping the member INSERT policies changes no
--    legitimate path.
drop policy if exists "Members can insert flights (via anchor)" on public.flights;
drop policy if exists "Members can insert excursions" on public.excursions;

notify pgrst, 'reload schema';
