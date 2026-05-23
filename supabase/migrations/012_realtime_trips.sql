-- Enable Realtime for trips so the seat board updates live. The booking trigger
-- writes seats_taken/spots_taken onto these rows; broadcasting their changes lets
-- members see availability move in real time. Only the integer counts and public
-- catalog data travel — never who booked (that lives in bookings, which members
-- can't read). Idempotent so it can be re-run safely.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'flights'
  ) then
    alter publication supabase_realtime add table public.flights;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'excursions'
  ) then
    alter publication supabase_realtime add table public.excursions;
  end if;
end $$;
