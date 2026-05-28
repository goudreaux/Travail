-- Loosen the bookings/posts/comments → members FK so ops can delete a
-- member without manually clearing every historical row first.
--
-- 028 set these to NO ACTION on purpose to prevent silent deletion, but
-- the protection was too aggressive: a cancelled booking from six months
-- ago shouldn't block ops from removing a test member, and the Ops UI
-- already requires an explicit click to delete. The activity_log
-- preserves the audit trail (it already does SET NULL).
--
-- Trade-off: deleted member's historical bookings now show 'member_id =
-- null' — caller code that joins members on booking lookups needs to
-- tolerate a missing member, which it already does (anchor_member_id
-- checks use COALESCE / maybeSingle throughout).
--
-- Safety net: a BEFORE DELETE trigger on members raises if the member
-- still has a non-terminal booking (status in 'pending_ops_review' or
-- 'confirmed'). That preserves the original intent — you can't
-- accidentally delete someone with an upcoming trip — without making
-- old completed/cancelled rows act as permanent blockers.

-- ─── 1. Make the FK columns nullable so SET NULL is valid ──────────────────
alter table public.bookings  alter column member_id drop not null;
alter table public.posts     alter column author_id drop not null;
alter table public.comments  alter column author_id drop not null;

-- ─── 2. Re-wire the FKs from NO ACTION to SET NULL ─────────────────────────
do $$
declare
  r record;
  fk text;
begin
  for r in
    select * from (values
      ('bookings', 'member_id'),
      ('posts',    'author_id'),
      ('comments', 'author_id')
    ) as t(tbl, col)
  loop
    select c.conname into fk
    from pg_constraint c
    where c.conrelid = ('public.' || r.tbl)::regclass
      and c.contype = 'f'
      and c.confrelid = 'public.members'::regclass
      and c.conkey = array[(
        select a.attnum from pg_attribute a
        where a.attrelid = ('public.' || r.tbl)::regclass
          and a.attname = r.col
          and not a.attisdropped
      )];
    if fk is not null then
      execute format('alter table public.%I drop constraint %I', r.tbl, fk);
    end if;
    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references public.members(id) on delete set null',
      r.tbl, r.tbl || '_' || r.col || '_fkey', r.col
    );
  end loop;
end$$;

-- ─── 3. Block delete only when the member has a LIVE booking ───────────────
-- 'live' = pending_ops_review (waiting on ops) or confirmed (paid + on
-- the manifest). Everything terminal (cancelled, declined, completed)
-- can SET NULL safely.
create or replace function public.guard_member_delete()
  returns trigger
  language plpgsql
as $$
declare
  live_count integer;
begin
  select count(*) into live_count
  from public.bookings
  where member_id = old.id
    and status in ('pending_ops_review', 'confirmed');
  if live_count > 0 then
    raise exception 'Member % has % live booking(s) — cancel them before deleting the member.', old.id, live_count
      using errcode = 'restrict_violation';
  end if;
  return old;
end$$;

drop trigger if exists guard_member_delete on public.members;
create trigger guard_member_delete
  before delete on public.members
  for each row execute function public.guard_member_delete();
