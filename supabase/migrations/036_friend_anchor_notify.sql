-- When a member's anchored trip is approved (anchor_submissions.status
-- transitions to 'published'), notify all of that member's accepted
-- friends so they hear about open seats before the broader network.
--
-- Notification kind matches the trip kind ('flight' or 'excursion') so
-- the existing in-app deep-link logic routes the recipient straight
-- to /reserve/[published_item_id].

create or replace function public.anchor_published_notify_friends()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anchor_name text;
begin
  -- Only fire on the transition *into* 'published'.
  if old.status is not distinct from new.status then return null; end if;
  if new.status <> 'published' then return null; end if;
  if new.published_item_id is null then return null; end if;

  select name into v_anchor_name from public.members where id = new.member_id;

  insert into public.notifications (member_id, kind, title, body, ref)
  select
    case when f.requester_id = new.member_id then f.addressee_id else f.requester_id end,
    new.kind,                                                       -- 'flight' or 'excursion'
    coalesce(v_anchor_name, 'A friend') || ' is on the board',
    coalesce(v_anchor_name, 'A friend') || ' just anchored a ' || new.kind ||
      '. Open seats might be available — first dibs to friends.',
    jsonb_build_object(
      'item_kind', new.kind,
      'item_id', new.published_item_id,
      'anchor_submission_id', new.id,
      'anchor_member_id', new.member_id,
      'source', 'friend_anchor_published'
    )
  from public.friendships f
  where (f.requester_id = new.member_id or f.addressee_id = new.member_id)
    and f.status = 'accepted';

  return null;
end;
$$;

drop trigger if exists anchor_published_notify_friends on public.anchor_submissions;
create trigger anchor_published_notify_friends
  after update of status on public.anchor_submissions
  for each row execute function public.anchor_published_notify_friends();
