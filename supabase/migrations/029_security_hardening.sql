-- Security + integrity hardening (audit fixes).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Block privilege escalation on members.
--    The "Members can update their own profile" RLS policy (001) lets a member
--    update their own row but has no WITH CHECK, so a member could set
--    is_admin = true from the browser. This trigger forces privileged columns
--    back to their stored values for ordinary authenticated callers. Admins, the
--    service role, and SECURITY DEFINER helpers (e.g. link_my_member) are
--    unaffected. NOTE: deliberately SECURITY INVOKER so current_user reflects the
--    real caller's role ('authenticated' for client sessions).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.members_block_privilege_escalation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Service role, superuser, and SECURITY DEFINER functions run as other roles.
  if current_user <> 'authenticated' then
    return new;
  end if;
  -- Admins may change anything.
  if public.is_admin() then
    return new;
  end if;
  -- Ordinary members: privileged fields are immutable.
  new.is_admin     := old.is_admin;
  new.tier         := old.tier;
  new.kyc_verified := old.kyc_verified;
  new.member_no    := old.member_no;
  new.user_id      := old.user_id;
  return new;
end;
$$;

drop trigger if exists members_block_privilege_escalation on public.members;
create trigger members_block_privilege_escalation
  before update on public.members
  for each row execute function public.members_block_privilege_escalation();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Enforce trip capacity atomically.
--    seats_taken/spots_taken are only recalculated AFTER a booking is written
--    (011), which can't stop two members grabbing the last seat. This BEFORE
--    trigger locks the trip row and rejects a booking that would exceed the
--    available pool (active pending+approved seats by non-anchor members vs.
--    total minus the anchor block). SECURITY DEFINER so it can read all bookings
--    past RLS for the count.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.enforce_trip_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int;
  v_anchor_seats int;
  v_anchor_member text;
  v_taken int;
begin
  if new.status not in ('pending', 'approved') then
    return new;
  end if;

  if new.item_kind = 'flight' then
    select seats_total, seats_anchor, anchor_member_id
      into v_total, v_anchor_seats, v_anchor_member
      from public.flights where id = new.item_id for update;
  elsif new.item_kind = 'excursion' then
    select spots_total, spots_anchor, anchor_member_id
      into v_total, v_anchor_seats, v_anchor_member
      from public.excursions where id = new.item_id for update;
  else
    return new;
  end if;

  -- Unknown trip: let other constraints handle it.
  if v_total is null then
    return new;
  end if;

  -- The anchor's own seats are covered by the reserved block, not the pool.
  if new.member_id is not distinct from v_anchor_member then
    return new;
  end if;

  select coalesce(sum(seats), 0) into v_taken
    from public.bookings
    where item_kind = new.item_kind
      and item_id = new.item_id
      and status in ('pending', 'approved')
      and member_id is distinct from v_anchor_member
      and id <> new.id;

  if v_taken + new.seats > v_total - coalesce(v_anchor_seats, 0) then
    raise exception 'Not enough seats available on this trip.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_capacity on public.bookings;
create trigger bookings_capacity
  before insert or update on public.bookings
  for each row execute function public.enforce_trip_capacity();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Stop activity-log spoofing.
--    The append policy only checked auth.uid() is not null, letting any member
--    forge entries attributed to admins/other members. Require the entry be the
--    caller's own (or system/null), unless the caller is an admin.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "Authed can append activity" on public.activity_log;
create policy "Authed can append activity" on public.activity_log
  for insert with check (
    auth.uid() is not null
    and (
      public.is_admin()
      or actor_member_id = public.current_member_id()
      or actor_member_id is null
    )
  );
