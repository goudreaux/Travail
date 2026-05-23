-- 004_booking_status.sql — align bookings.status with the app vocabulary
-- The app uses pending/approved/declined/cancelled/refunded everywhere
-- (queue, dashboard, bookings). The original check constraint only allowed
-- pending_ops_review/confirmed/etc., which rejected new reservations.
-- Run in Supabase → SQL Editor.

alter table public.bookings drop constraint if exists bookings_status_check;

-- Allow both the app vocabulary and the legacy values so existing rows and
-- the confirm_booking() function keep working.
alter table public.bookings add constraint bookings_status_check
  check (status in (
    'pending', 'approved', 'declined', 'cancelled', 'refunded',
    'pending_ops_review', 'confirmed', 'completed'
  ));

alter table public.bookings alter column status set default 'pending';
