-- Let members see any non-draft trip they may be booked on, including past/
-- departed flights and completed excursions (needed for "My trips" history).
-- Admins still see everything.

drop policy if exists "Members can view published flights" on public.flights;
drop policy if exists "Members can view live flights" on public.flights;
create policy "Members can view live flights" on public.flights for select using (
  auth.uid() is not null and (status <> 'draft' or public.is_admin())
);

drop policy if exists "Members can view published excursions" on public.excursions;
drop policy if exists "Members can view live excursions" on public.excursions;
create policy "Members can view live excursions" on public.excursions for select using (
  auth.uid() is not null and (status <> 'draft' or public.is_admin())
);
