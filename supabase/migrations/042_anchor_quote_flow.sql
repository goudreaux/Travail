-- Anchor submission quote / approval workflow.
--
-- Ops can't determine the actual charter cost at submission time —
-- they have to source quotes from Tropic + vendors first. Once they
-- have the number, they send it as a quote to the member, who must
-- accept before any card capture happens. Protects members from
-- surprise charges and gives ops room to negotiate before locking.
--
-- Flow:
--   1. Member submits → status='pending' (existing default)
--   2. Ops sources quotes, fills in total cost, hits "Send quote"
--      → status='quoted', quoted_total_cents stamped, member notified
--   3. Member accepts → status='quote_accepted'
--   4. Ops clicks Publish → captures the locked quoted_total_cents
--      → status='published'
--   - At any point: member can decline (status='declined') or Ops can
--     cancel/decline (existing paths).

alter table public.anchor_submissions
  add column if not exists quoted_at             timestamptz,
  add column if not exists quoted_total_cents    integer,
  add column if not exists quoted_by             text references public.members(id) on delete set null,
  add column if not exists quote_accepted_at     timestamptz,
  add column if not exists quote_declined_at     timestamptz,
  add column if not exists quote_declined_reason text;

-- Extend the status check to include 'quoted' + 'quote_accepted'.
alter table public.anchor_submissions drop constraint if exists anchor_submissions_status_check;
alter table public.anchor_submissions add constraint anchor_submissions_status_check
  check (status in (
    'pending',
    'pending_ops_review',
    'quoted',
    'quote_accepted',
    'published',
    'declined',
    'cancelled'
  ));
