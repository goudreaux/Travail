-- Fix member visibility of trips. The original policy let non-admins see only
-- flights/excursions with status = 'published', but the app marks live trips as
-- 'open' (and 'full'). Result: regular members saw an empty seats board while
-- admins (who bypass via is_admin()) saw everything. Also allow 'completed' and
-- 'cancelled' so members can still see trips they've booked in their history.

drop policy if exists "Members can view published flights" on public.flights;
create policy "Members can view live flights" on public.flights for select using (
  auth.uid() is not null and (
    status in ('open', 'full', 'completed', 'cancelled') or public.is_admin()
  )
);

drop policy if exists "Members can view published excursions" on public.excursions;
create policy "Members can view live excursions" on public.excursions for select using (
  auth.uid() is not null and (
    status in ('open', 'full', 'completed', 'cancelled') or public.is_admin()
  )
);
