-- Reusable trip photo library.
--
-- Ops uploads photos once, tags them to a location (airport code) +
-- free-form keywords, and then picks from the library when building
-- any trip form (sponsored excursion, anchored flight/excursion, etc.)
-- instead of re-uploading or pasting a URL every time.
--
-- The actual image bytes live in the existing public 'member-assets'
-- storage bucket under trip-photos/. This table is just the index:
-- url + metadata for browsing/filtering.

create table if not exists public.trip_photos (
  id           uuid primary key default gen_random_uuid(),
  label        text not null,
  image_url    text not null,
  -- Optional location tag. Lets the picker default to "photos for
  -- KTPF" when ops is building a trip from Davis Islands, etc.
  location_code text references public.airports(code) on delete set null,
  -- Free-form keywords for search ("tarpon", "golf", "sunset").
  tags         text[] not null default '{}',
  uploaded_by  text references public.members(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists trip_photos_location_idx
  on public.trip_photos(location_code);
create index if not exists trip_photos_created_idx
  on public.trip_photos(created_at desc);
create index if not exists trip_photos_tags_idx
  on public.trip_photos using gin (tags);

alter table public.trip_photos enable row level security;

-- Any signed-in user can read the library (members never hit this, but
-- it's harmless and keeps future surfaces simple). Admins manage.
drop policy if exists "Authenticated read trip photos" on public.trip_photos;
create policy "Authenticated read trip photos" on public.trip_photos
  for select using (auth.uid() is not null);

drop policy if exists "Admins manage trip photos" on public.trip_photos;
create policy "Admins manage trip photos" on public.trip_photos
  for all using (public.is_admin()) with check (public.is_admin());
