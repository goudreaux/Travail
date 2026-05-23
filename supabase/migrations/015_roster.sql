-- Public flight/excursion rosters. The choice is made per reservation: members
-- are listed by default (public) and can switch a booking to private at reserve
-- time. Guests are never listed (the roster is members only). Other members see
-- who's going — driving the FOMO — and each entry links to the member's card.

alter table public.bookings add column if not exists show_on_roster boolean not null default true;

-- Privacy-safe roster lookup. SECURITY DEFINER so members (who can't read other
-- members' bookings under RLS) can see the roster, but it ONLY returns bookings
-- that opted in — private reservations are never exposed. Accepts a set of item
-- ids so the board can fetch many trips at once.
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
  group by b.item_id, m.id, m.name, m.initials, m.avatar_url
$$;

grant execute on function public.trip_roster(text, text[]) to authenticated;
