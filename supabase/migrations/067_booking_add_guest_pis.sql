-- Self-serve "add a guest to your ticket": members can extend a booking
-- they already hold with an incremental Stripe charge. We stamp each
-- add-guest PaymentIntent id onto the booking row so a retried finalize
-- (network blip after the charge cleared) is idempotent — it won't bump
-- seats or duplicate the manifest twice for the same charge.

alter table public.bookings
  add column if not exists add_guests_pis text[] not null default '{}';

notify pgrst, 'reload schema';
