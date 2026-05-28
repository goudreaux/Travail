-- Structured email audit log.
--
-- The ops@travailclub.com BCC pattern gives us a human-readable paper
-- trail in Gmail, but it's not queryable. This table is the structured
-- twin — every transactional send (member receipt, settlement, cancel,
-- notify-email, ops alert) inserts a row so we can answer:
--   • "Show me every email related to anchor M-021"
--   • "What did we send out for trip T-1147?"
--   • "Which member emails have bounced this week?" (once we wire bounces)
--
-- We insert AFTER the Resend call returns so the resend_id is captured
-- and we know whether it succeeded. Insert failures are non-fatal — the
-- underlying transaction (settlement, booking, etc.) should never roll
-- back because the audit row didn't write.

create table if not exists public.email_log (
  id           uuid primary key default gen_random_uuid(),
  sent_at      timestamptz not null default now(),

  -- 'booking_receipt' | 'settlement' | 'pax_trip_complete'
  -- | 'trip_cancelled' | 'notify_email' | 'ops_notify'
  -- | other future kinds. Free-form text; checked at the app layer.
  kind         text not null,

  -- Recipient member if we know them. Many ops_notify rows won't have one
  -- (e.g. anchor-submitted alert before the member exists in our context).
  member_id    text references public.members(id) on delete set null,

  to_email     text not null,
  subject      text not null,

  -- Resend's returned message id. Null if the send failed before Resend
  -- responded, or if we couldn't parse the response.
  resend_id    text,

  -- Free-form context — booking_id, trip_id, anchor_submission_id, etc.
  -- jsonb so we can index/query specific keys later.
  refs         jsonb not null default '{}'::jsonb,

  -- 'sent' on success, 'failed' if Resend threw. Differentiates a row
  -- we wrote for our own audit from one we wrote because the send died.
  send_status  text not null default 'sent'
               check (send_status in ('sent', 'failed')),
  send_error   text,

  -- Did we BCC ops on this one? Always true today but we log it so we
  -- can prove the paper trail later. Internal ops_notify rows are false.
  bcc_ops      boolean not null default true,

  created_at   timestamptz not null default now()
);

-- Hot paths: "show me sends for this member, newest first"; "all sends of
-- this kind"; "look up by resend id when a webhook comes in".
create index if not exists email_log_member_idx
  on public.email_log (member_id, sent_at desc)
  where member_id is not null;

create index if not exists email_log_kind_idx
  on public.email_log (kind, sent_at desc);

create index if not exists email_log_resend_idx
  on public.email_log (resend_id)
  where resend_id is not null;

create index if not exists email_log_sent_at_idx
  on public.email_log (sent_at desc);

-- Search by refs JSON (booking_id, trip_id, etc).
create index if not exists email_log_refs_idx
  on public.email_log using gin (refs);

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- Admins read everything. Members read their own rows. No one writes from
-- the client — inserts happen via the service-role server clients only.

alter table public.email_log enable row level security;

drop policy if exists "Admins read all email_log" on public.email_log;
create policy "Admins read all email_log" on public.email_log
  for select using (public.is_admin());

drop policy if exists "Members read own email_log" on public.email_log;
create policy "Members read own email_log" on public.email_log
  for select using (member_id = public.current_member_id());

-- No insert/update/delete policy → only service_role can write.
