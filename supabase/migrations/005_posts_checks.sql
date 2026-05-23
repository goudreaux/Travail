-- 005_posts_checks.sql — align posts check constraints with the app vocabulary
-- The app posts author_kind='system' and kind='announcement'/'text'/etc., but the
-- original constraints only allowed the legacy values. Run in Supabase → SQL Editor.

alter table public.posts drop constraint if exists posts_author_kind_check;
alter table public.posts add constraint posts_author_kind_check
  check (author_kind in ('member', 'ops', 'system'));

alter table public.posts drop constraint if exists posts_kind_check;
alter table public.posts add constraint posts_kind_check
  check (kind in ('ops', 'anchor', 'trip', 'text', 'trip_report', 'announcement', 'photo'));
