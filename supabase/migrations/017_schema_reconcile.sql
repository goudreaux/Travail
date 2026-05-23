-- Reconcile the original 001 schema with the vocabulary the app actually uses.
-- 001 predates the current flight/excursion statuses (open/full/draft/departed),
-- the day_trip stay type, and members-vs-public visibility. Bookings were already
-- reconciled in 004; this does the same for flights/excursions so a FRESH setup
-- matches production. Idempotent and safe on the live DB — the data UPDATEs match
-- nothing there (values are already current) and the constraints are re-asserted.

-- 1) Normalize any legacy values so the new constraints accept every row.
update public.flights    set status = 'open'      where status in ('published', 'pending_ops_review');
update public.excursions set status = 'open'      where status in ('published', 'pending_ops_review');
update public.excursions set stay_type = 'day_trip' where stay_type = 'day';
update public.flights    set visibility = 'members' where visibility = 'private';
update public.excursions set visibility = 'members' where visibility = 'private';
update public.members    set tier = 'founder'      where tier = 'founding';

-- 2) Flights
alter table public.flights drop constraint if exists flights_status_check;
alter table public.flights add constraint flights_status_check
  check (status in ('draft', 'open', 'full', 'departed', 'cancelled'));
alter table public.flights alter column status set default 'draft';
alter table public.flights drop constraint if exists flights_visibility_check;
alter table public.flights add constraint flights_visibility_check
  check (visibility in ('members', 'public'));

-- 3) Excursions
alter table public.excursions drop constraint if exists excursions_status_check;
alter table public.excursions add constraint excursions_status_check
  check (status in ('draft', 'open', 'full', 'completed', 'cancelled'));
alter table public.excursions alter column status set default 'draft';
alter table public.excursions drop constraint if exists excursions_stay_type_check;
alter table public.excursions add constraint excursions_stay_type_check
  check (stay_type in ('day_trip', 'overnight', 'multi_night'));
alter table public.excursions alter column stay_type set default 'day_trip';
alter table public.excursions drop constraint if exists excursions_visibility_check;
alter table public.excursions add constraint excursions_visibility_check
  check (visibility in ('members', 'public'));

-- 4) Bookings also support wire transfers.
alter table public.bookings drop constraint if exists bookings_payment_method_check;
alter table public.bookings add constraint bookings_payment_method_check
  check (payment_method in ('card', 'credits', 'wire'));
