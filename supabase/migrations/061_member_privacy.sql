-- Member "privacy mode".
--
-- When on, the member is hidden from the member directory and is never listed
-- by name on a trip roster — they still occupy their seat(s) (the card's total
-- count includes them), so to everyone else they simply read as an anonymous
-- "+N others". Their own trips, bookings, and account are unaffected.

alter table public.members
  add column if not exists private_mode boolean not null default false;

-- Roster lookup excludes private members. SECURITY DEFINER, so it still only
-- exposes opted-in (show_on_roster) bookings, and now also skips anyone in
-- privacy mode.
create or replace function public.trip_roster(p_item_kind text, p_item_ids text[])
returns table (item_id text, member_id text, name text, initials text, avatar_url text, seats int)
language sql
security definer
set search_path = public
as $$
  select b.item_id, m.id, m.name, m.initials, m.avatar_url, sum(b.seats)::int
  from public.bookings b
  join public.members m on m.id = b.member_id
  where b.item_kind = p_item_kind
    and b.item_id = any(p_item_ids)
    and b.status in ('pending', 'approved')
    and b.show_on_roster = true
    and m.private_mode = false
  group by b.item_id, m.id, m.name, m.initials, m.avatar_url
$$;

grant execute on function public.trip_roster(text, text[]) to authenticated;
