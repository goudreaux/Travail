-- Append-only activity log — an immutable audit chain of every meaningful action
-- (bookings submitted/confirmed/declined/cancelled, waitlist, anchors, members).
-- No update/delete policies exist, so once written a row can't be altered by app
-- users — the history is permanent and filterable by date.

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_kind text not null default 'system',          -- 'admin' | 'member' | 'system'
  actor_member_id text references public.members(id),  -- who performed it
  subject_member_id text references public.members(id),-- member the action concerns
  action text not null,                                -- machine code, e.g. 'booking_confirmed'
  summary text not null,                               -- human-readable line
  booking_id text,
  item_kind text,
  item_id text,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists activity_log_created_idx on public.activity_log(created_at desc);
create index if not exists activity_log_subject_idx on public.activity_log(subject_member_id);

alter table public.activity_log enable row level security;

-- Admins see the whole chain; members see activity that concerns them.
create policy "Admins read all activity" on public.activity_log for select using (public.is_admin());
create policy "Members read own activity" on public.activity_log for select using (
  subject_member_id = public.current_member_id() or actor_member_id = public.current_member_id()
);
-- Any authenticated user can append; nobody can update or delete (immutable).
create policy "Authed can append activity" on public.activity_log for insert with check (auth.uid() is not null);

-- Live updates for the ops Activity feed.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'activity_log'
  ) then
    alter publication supabase_realtime add table public.activity_log;
  end if;
end $$;
