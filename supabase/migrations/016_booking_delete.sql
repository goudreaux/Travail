-- Allow ops to permanently delete a booking record (used for purging closed
-- bookings from the dashboard). Child rows (passengers, messages, cancellation
-- requests) already cascade on delete.

create policy "Admins can delete bookings" on public.bookings for delete using (public.is_admin());
