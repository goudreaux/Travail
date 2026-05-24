-- Make member deletion behave deliberately. Several child tables referenced
-- members(id) with no ON DELETE rule (defaulting to NO ACTION), so deleting a
-- member was blocked outright — including by the welcome notification every new
-- member now receives.
--
-- Policy (chosen deliberately):
--   * notifications, anchor_submissions  -> CASCADE  (personal, no audit value)
--   * activity_log actor/subject         -> SET NULL (keep the audit trail,
--                                                      just unlink the person)
--   * bookings, posts                    -> left as NO ACTION ON PURPOSE, so a
--       member with trips or authored posts cannot be silently deleted. Those
--       must be handled first. (See the Ops members page for the guidance shown.)
--
-- Idempotent: looks up each existing FK by table + column, drops it, re-adds it
-- with the intended rule.

do $$
declare
  r record;
  fk text;
begin
  for r in
    select * from (values
      ('notifications',      'member_id',         'cascade'),
      ('anchor_submissions', 'member_id',         'cascade'),
      ('activity_log',       'actor_member_id',   'set null'),
      ('activity_log',       'subject_member_id', 'set null')
    ) as t(tbl, col, act)
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
      'alter table public.%I add constraint %I foreign key (%I) references public.members(id) on delete %s',
      r.tbl, r.tbl || '_' || r.col || '_fkey', r.col, r.act
    );
  end loop;
end $$;
