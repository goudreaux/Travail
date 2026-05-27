-- Protections around the contact request flow:
--   1) Members can flip off inbound contact requests (high-profile mode).
--   2) Once declined, a requester has to wait before asking again — stops
--      a determined member from poking the same target repeatedly.

-- ─── 1. Quiet mode flag on members ──────────────────────────────────────────
alter table public.members
  add column if not exists accepts_contact_requests boolean not null default true;

-- ─── 2. Decline cooldown enforced at insert time ────────────────────────────
-- If a previous request from the same pair was declined within the cooldown
-- window, reject. The requester deletes the old row to "clear" only after the
-- window passes. Also reject outright when the target is in quiet mode.
create or replace function public.contact_request_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_accepts boolean;
  v_recent_decline timestamptz;
  v_cooldown interval := interval '30 days';
begin
  -- Quiet mode — target opts out of all unsolicited contact asks.
  select accepts_contact_requests into v_accepts from public.members where id = new.addressee_id;
  if v_accepts = false then
    raise exception 'This member is not accepting contact requests right now.'
      using errcode = 'check_violation';
  end if;

  -- Cooldown — if the same requester→addressee pair was declined within the
  -- window, block. (Granted/revoked don't block — those are explicit state
  -- transitions handled by the unique direction index.)
  select decided_at into v_recent_decline
    from public.contact_requests
    where requester_id = new.requester_id
      and addressee_id = new.addressee_id
      and status = 'declined'
      and decided_at is not null
    order by decided_at desc
    limit 1;

  if v_recent_decline is not null and v_recent_decline > now() - v_cooldown then
    raise exception 'You can ask again on % (cooldown after a declined request).',
      to_char(v_recent_decline + v_cooldown, 'Mon DD, YYYY')
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists contact_requests_guard on public.contact_requests;
create trigger contact_requests_guard
  before insert on public.contact_requests
  for each row execute function public.contact_request_guard();
