-- Close the client-side booking-mint hole.
--
-- Booking rows were previously inserted straight from the browser under the
-- "Members can insert bookings" policy (with check: member_id = current OR
-- is_admin). Because RLS is row-level only, a member could POST a booking for
-- themselves with any status / paid_amount_cents / price / seats — fabricating
-- an "approved, paid" row (free seats) and, since settlement sums
-- paid_amount_cents to rebate anchors, a lever to pull real refund money.
--
-- Pax bookings are now created only by /api/bookings/finalize, which retrieves
-- the PaymentIntent from Stripe, verifies it cleared for the member/item/seats,
-- re-derives the money from the trip rows, and inserts with the service role
-- (bypassing RLS). Admin-created bookings (admin/queue, admin/bookings) run
-- under an is_admin() JWT and still need an INSERT policy. So: replace the
-- member policy with an admin-only one. Members can no longer insert bookings.
drop policy if exists "Members can insert bookings" on public.bookings;

create policy "Admins can insert bookings" on public.bookings
  for insert with check (public.is_admin());

notify pgrst, 'reload schema';
