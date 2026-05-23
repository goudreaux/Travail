-- Trusted, cabin-wide seat/spot counts maintained by a trigger.
--
-- Why: members can only read their OWN bookings under RLS, so the client can't
-- compute true availability for a non-admin. We keep an authoritative count on
-- each trip row (which members CAN read) and update it whenever bookings change.
-- No PII is exposed — just an integer count.
--
-- Definition: seats_taken = active (pending+approved) booked seats, EXCLUDING the
-- anchor's own booking, so availability stays seats_total - seats_anchor - seats_taken.

alter table public.flights    add column if not exists seats_taken integer not null default 0;
alter table public.excursions add column if not exists spots_taken integer not null default 0;

create or replace function public.recalc_trip_taken(p_item_kind text, p_item_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_item_kind = 'flight' then
    update public.flights f
    set seats_taken = coalesce((
      select sum(b.seats) from public.bookings b
      where b.item_kind = 'flight' and b.item_id = f.id
        and b.status in ('pending', 'approved')
        and b.member_id is distinct from f.anchor_member_id
    ), 0)
    where f.id = p_item_id;
  elsif p_item_kind = 'excursion' then
    update public.excursions e
    set spots_taken = coalesce((
      select sum(b.seats) from public.bookings b
      where b.item_kind = 'excursion' and b.item_id = e.id
        and b.status in ('pending', 'approved')
        and b.member_id is distinct from e.anchor_member_id
    ), 0)
    where e.id = p_item_id;
  end if;
end;
$$;

create or replace function public.bookings_recalc_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalc_trip_taken(old.item_kind, old.item_id);
    return old;
  end if;
  perform public.recalc_trip_taken(new.item_kind, new.item_id);
  -- If a booking moved to a different trip, refresh the old one too.
  if tg_op = 'UPDATE' and (old.item_id <> new.item_id or old.item_kind <> new.item_kind) then
    perform public.recalc_trip_taken(old.item_kind, old.item_id);
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_recalc on public.bookings;
create trigger bookings_recalc
after insert or update or delete on public.bookings
for each row execute function public.bookings_recalc_trg();

-- Backfill existing trips.
update public.flights f
set seats_taken = coalesce((
  select sum(b.seats) from public.bookings b
  where b.item_kind = 'flight' and b.item_id = f.id
    and b.status in ('pending', 'approved')
    and b.member_id is distinct from f.anchor_member_id
), 0);

update public.excursions e
set spots_taken = coalesce((
  select sum(b.seats) from public.bookings b
  where b.item_kind = 'excursion' and b.item_id = e.id
    and b.status in ('pending', 'approved')
    and b.member_id is distinct from e.anchor_member_id
), 0);
