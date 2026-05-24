-- Anchor submissions never worked: 001 only allowed status
-- pending_ops_review/published/declined/cancelled, but the app submits
-- status = 'pending', and anchor_submissions.id had no default. Reconcile both,
-- and give notifications.id a default so best-effort notification inserts succeed.
-- Idempotent and safe on the live DB.

alter table public.anchor_submissions drop constraint if exists anchor_submissions_status_check;
alter table public.anchor_submissions add constraint anchor_submissions_status_check
  check (status in ('pending', 'approved', 'declined', 'published', 'pending_ops_review', 'cancelled'));
alter table public.anchor_submissions alter column status set default 'pending';
alter table public.anchor_submissions alter column id set default gen_random_uuid()::text;

alter table public.notifications alter column id set default gen_random_uuid()::text;
