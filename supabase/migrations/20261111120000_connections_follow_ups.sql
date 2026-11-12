-- Connections follow-ups: the roll carries every guest; a request's notice, and its card, say how the two stand.
-- Specs: docs/superpowers/specs/2026-11-10-groups-and-chat-design.md (CH-P20) and
-- docs/superpowers/specs/2026-11-10-connections-and-circles-design.md (CO-P5, CO-P6).
-- Plan: docs/superpowers/plans/2026-11-11-connections-3-follow-ups.md
-- Hosted-compatible: depends only on the migrations in supabase/tests/hosted-baseline/migrations.txt
-- Rollback: supabase/rollback/20261111120000_connections_follow_ups.rollback.sql

-- 1. The roll carries every guest (CH-P20)
-- A guest who was Going and taps Can't go is stored as 'withdrawn', and the roll carried only the rows that were not:
-- that guest was dropped from the series at the next roll, though CR-P24 promised that Can't go this week may go next
-- week. Now every guest row of the occurrence is carried, whatever its reply (a removed guest has no row). Nothing else
-- about 'withdrawn' changes: an admin who says Can't go has already stopped being an admin (respond deletes the admin
-- row, CR-P15), so the roll carries them as a guest and invites them again; the counts still show them under Can't go.

-- For each plan with a rule and no next yet that has ended or was cancelled with its rule kept: the next occurrence is
-- the first one, counting on from this one, that has not ended (a plan left behind catches up instead of creating
-- occurrences in the past). It copies the plan, its meeting details, and as pending invitations every guest, whatever
-- their reply, who uses the app (private.used_app), may still use it and is not leaving; a guest who only ever answered
-- on the web is not asked again. The admins among them stay admins. It queues the invitation push for each guest it
-- copied but the admins (CR-P24; the owner is never an attendee). A plan whose organizer may no longer use the app (no
-- owner, leaving, removed or banned) is not rolled; it catches up if they come back. The rows are locked with skip
-- locked and repeats_from is unique, so two runs at once, or a retry, create one next occurrence; the loser's unique
-- violation is caught. The 20261031120000_creating_a_resbite body, verbatim but for the guests it copies; its grants are
-- kept: no API role may run it.
create or replace function private.roll_repeating_plans() returns integer language plpgsql security definer set search_path = '' as $$
declare p public.plans; v_id uuid; v_start timestamptz; v_end timestamptz; v_steps integer; v_count integer := 0; v_constraint text;
begin
 for p in
  select o.* from public.plans o
  where o.repeat_weeks is not null and (o.status='cancelled' or private.plan_end(o.starts_at,o.ends_at)<=now())
   and not exists(select 1 from public.plans n where n.repeats_from=o.id)
   and private.user_eligible(o.owner_id)
  order by o.id
  for update of o skip locked
 loop
  -- Each plan has its own block: a plan that cannot roll (a bad time zone, say) is skipped with a warning, the rest roll.
  begin
   v_steps := 1;
   loop
    v_start := private.next_occurrence(p.starts_at,p.time_zone,p.repeat_weeks*v_steps);
    v_end := private.next_occurrence(p.ends_at,p.time_zone,p.repeat_weeks*v_steps);
    -- A start in a spring-forward gap lands an hour later, so an end just after the gap would come before it: keep the length.
    if v_end<=v_start then v_end := v_start+(p.ends_at-p.starts_at); end if;
    exit when private.plan_end(v_start,v_end)>now() or v_steps>=600;
    v_steps := v_steps+1;
   end loop;
   -- More than 600 repeats behind: give up on this plan.
   continue when private.plan_end(v_start,v_end)<=now();
   v_id := gen_random_uuid();
   -- The cover trigger starts cover_revision at 0 again; title and categories are given, so the activity trigger keeps them.
   insert into public.plans(id,owner_id,activity_id,title,description,categories,starts_at,ends_at,time_zone,place_label,place_tbd,
    latitude,longitude,area,guest_note,guest_note_at,cover_path,cover_revision,cover_description,has_meeting_details,repeat_weeks,
    series_id,repeats_from,status,version)
   values(v_id,p.owner_id,p.activity_id,p.title,p.description,p.categories,v_start,v_end,p.time_zone,p.place_label,p.place_tbd,
    p.latitude,p.longitude,p.area,p.guest_note,p.guest_note_at,p.cover_path,p.cover_revision,p.cover_description,p.has_meeting_details,p.repeat_weeks,
    p.series_id,p.id,'active',1);
   insert into public.plan_meeting_details(plan_id,note) select v_id,note from public.plan_meeting_details where plan_id=p.id;
   insert into public.attendees(plan_id,user_id,response,version) select v_id,user_id,'pending',1 from public.attendees
    where plan_id=p.id and private.used_app(user_id) and private.user_eligible(user_id) and not private.deletion_pending(user_id);
   insert into public.plan_admins(plan_id,user_id,appointed_by,appointed_at) select v_id,pa.user_id,pa.appointed_by,now() from public.plan_admins pa
    where pa.plan_id=p.id and exists(select 1 from public.attendees a where a.plan_id=v_id and a.user_id=pa.user_id);
   insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id,detail)
   select v_id,a.user_id,'invited','invited:'||v_id||':'||a.user_id,p.owner_id,'again'
   from public.attendees a
   where a.plan_id=v_id and a.user_id<>p.owner_id
    and not exists(select 1 from public.plan_admins pa where pa.plan_id=v_id and pa.user_id=a.user_id)
   on conflict do nothing;
   v_count := v_count+1;
  exception when unique_violation then
   -- Another run created this plan's next occurrence first: skip it quietly. Any other unique violation skips the plan with a warning.
   get stacked diagnostics v_constraint = constraint_name;
   if v_constraint is distinct from 'plans_repeats_from_key' then
    raise warning 'roll_repeating_plans: plan % skipped: %', p.id, sqlerrm;
   end if;
  when others then
   raise warning 'roll_repeating_plans: plan % skipped: %', p.id, sqlerrm;
  end;
 end loop;
 return v_count;
end $$;

-- 2. A request's notice says how the two stand (CO-P5)
-- The request's push said "You're both going to ..." for any resbite that had not started, to someone who said Can't go
-- too. The 'connection_request' row now carries as its detail how the two stand on the resbite it was asked from when
-- it is queued. Both are going when each is its owner or a guest whose own reply is Going or Maybe: an admin counts by
-- their reply alone, so an admin carried to a next occurrence who has not answered yet does not. Then:
--   'going'        the resbite is on (not cancelled, not ended) and both are going;
--   'met'          it has ended, was not cancelled, and both were going;
--   'were_invited' it has ended, and not 'met' (one of them said Can't go or never answered, or it was cancelled);
--   'invited'      it has not ended, and not 'going' (the same, or it was cancelled before its end).
-- private.pair_standing says it, for the push here and for the Connections card (section 3). The sender words the push
-- from it; a notice queued before this migration has none. The detail check is replaced by exact name, keeping every
-- existing value.
alter table private.notification_outbox drop constraint notification_outbox_detail_check;
alter table private.notification_outbox add constraint notification_outbox_detail_check check (
 detail is null
 or (kind='plan_changed' and detail in ('time','place','time_place'))
 or (kind='rsvp' and detail in ('accepted','maybe','declined','withdrawn'))
 or (kind='invited' and detail='again')
 or (kind='connection_request' and detail in ('going','invited','met','were_invited')));

-- How two people stand on a resbite: by the rule above when each has a place on it (its owner, or an attendee row
-- whatever the reply). Null when either has none, and when there is no such resbite: it then has nothing true to say.
-- The card reads a series' latest occurrence, which the requester may not be on (not carried to it, or removed): there
-- the card names the resbite only (section 3). On a request's own resbite both have a place (request_connection says
-- why). The database's own: no API role may call it (its two callers, request_connection and my_connections, are
-- definers).
create function private.pair_standing(p_plan uuid, p_a uuid, p_b uuid) returns text language sql stable security definer set search_path = '' as $$
 select case when (select count(*) from (values (p_a),(p_b)) u(id)
    where u.id=p.owner_id or exists(select 1 from public.attendees a where a.plan_id=p.id and a.user_id=u.id))<2 then null
  when p.status='active' and (select count(*) from (values (p_a),(p_b)) u(id)
    where u.id=p.owner_id or exists(select 1 from public.attendees a where a.plan_id=p.id and a.user_id=u.id
     and a.response in ('accepted','maybe')))=2
   then case when private.plan_end(p.starts_at,p.ends_at)>now() then 'going' else 'met' end
  when private.plan_end(p.starts_at,p.ends_at)>now() then 'invited' else 'were_invited' end
 from public.plans p where p.id=p_plan
$$;
revoke all on function private.pair_standing(uuid,uuid,uuid) from public, anon, authenticated, service_role;

-- Asking, from a resbite: a new request's notice carries how the two stand on it (private.pair_standing). Otherwise the
-- 20261110120000_connections body, verbatim (its comments name that file's sections): the pair's lock, the refusals,
-- and the notice's key (the pair, the series and who asked: a request sent again queues nothing, and its first notice,
-- with its first detail, stands for it) and stamp. Its grants and its public wrapper are kept.
-- Both have a place on p_plan when the notice is queued, so pair_standing gives one of its four values there. The
-- person asked is its owner or has a guest row (the 'Not on this resbite' refusal). The caller passed can_see_guests:
-- its owner, a guest who has answered, or an admin, and an admin has a guest row (only a Going guest is appointed, the
-- roll copies an admin only with their row, and removing a guest ends the role). Were it ever null, the notice would
-- be queued with no detail, which the check above admits, and the sender would word it by the start time, as it does
-- a notice from before this migration; nothing would fail.
create or replace function private.request_connection(p_user uuid, p_plan uuid) returns text language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_a uuid; v_b uuid; v_series uuid; v_row public.connections; v_at timestamptz;
begin
 select p.user_a,p.user_b into v_a,v_b from private.pair(v_uid,p_user) p;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_a::text||':'||v_b::text,53));
 if p_user=v_uid then raise exception 'That is you' using errcode='22023'; end if;
 if not private.can_see_guests(p_plan) then raise exception 'Names required' using errcode='42501'; end if;
 -- CH-P21 (groups and chat): on a group any guest may be asked, whatever their reply; public.chats does not exist yet.
 -- Someone whose account is being deleted is not on it either, as its owner too (the owner's row outlives the request).
 if private.deletion_pending(p_user) or not (private.is_host(p_plan,p_user)
  or exists(select 1 from public.attendees a where a.plan_id=p_plan and a.user_id=p_user and a.response<>'pending')) then
  raise exception 'Not on this resbite' using errcode='42501';
 end if;
 select series_id into v_series from public.plans where id=p_plan;
 select * into v_row from public.connections where user_a=v_a and user_b=v_b for update;
 if found then
  if v_row.state='connected' then return 'connected'; end if;
  if v_row.requested_by=v_uid then return 'requested'; end if;
  -- The other person had asked: asking back is accepting, even on the series where they once refused the caller.
  perform private.accept_connection(p_user);
  return 'connected';
 end if;
 -- The other person's request, refused by the caller, still looks sent to them: it stands, and asking accepts it. This
 -- comes first: when each refused the other (the caller's refusal hidden by their cancel, so the other's request was a
 -- real one), whoever asks next connects the two, even from the series where their own request was refused.
 if exists(select 1 from private.connection_refusals where from_user=p_user and to_user=v_uid and not hidden) then
  insert into public.connections(user_a,user_b,state,requested_by,series_id,created_at)
   values(v_a,v_b,'requested',p_user,v_series,pg_catalog.clock_timestamp());
  perform private.accept_connection(p_user);
  return 'connected';
 end if;
 -- Refused on this series: it looks sent, and nothing is stored or sent.
 if exists(select 1 from private.connection_refusals where series_id=v_series and from_user=v_uid and to_user=p_user) then
  update private.connection_refusals set hidden=false where from_user=v_uid and to_user=p_user;
  return 'requested';
 end if;
 -- Refused only on other series: a real request. Those refusals stay, so asking from their series again stays quiet.
 -- clock_timestamp, not now(): requests made in one transaction keep the order they were made in (Requests lists the
 -- newest first). The notice is the pair's, the series' and the requester's, once (section 3's header): sent again,
 -- the request queues nothing, and the first notice, stamped with the first request's time, stands for it.
 insert into public.connections(user_a,user_b,state,requested_by,series_id,created_at)
  values(v_a,v_b,'requested',v_uid,v_series,pg_catalog.clock_timestamp()) returning created_at into v_at;
 -- The notice carries how the two stand on the resbite asked from, for its line (CO-P5).
 insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id,created_at,detail)
  values(p_plan,p_user,'connection_request','connect:'||v_a||':'||v_b||':'||v_series||':'||v_uid,v_uid,v_at,private.pair_standing(p_plan,v_uid,p_user))
  on conflict do nothing;
 return 'requested';
end $$;

-- 3. The Connections card says the same (Ruling 6, CO-P6)
-- A request's context on the card was 'going' or 'met', a host counting as going whatever their reply: "You're both
-- going" for an admin who had not answered, "Met at" for a resbite one of them skipped. It is now how the two stand on
-- the occurrence the card already reads, by the push's rule. Where that rule has nothing to say, the context is
-- 'from', and the card names the resbite only ("From <title>"), which stays true whatever happened since: when either
-- of the two is not on that occurrence, and for someone who may not see its guests (private.can_see_guests: they have
-- not answered it, and are not a host), whom any other line would tell whether the person asking is on its list,
-- withheld until they answer (UX-P5).

-- The caller's Connections (CO-P6): the requests to them, newest first, and their connections, by name, with the other
-- person's name and photo and the resbite they met at. Requests the caller sent are not listed: a refused one would
-- vanish from such a list (CO-P3). title is that series' latest occurrence the caller may read (can_read_plan: its owner
-- or on its guest list; CO-R9), null when the series is gone or the caller may read none of it, so a guest removed or
-- not carried to a later occurrence never reads its title (the app shows "Met on Resbite"). context is worked out for
-- a request only (a connection's row carries none): how the two stand on that occurrence (private.pair_standing:
-- 'going', 'invited', 'met' or 'were_invited'). It is 'from' when pair_standing has nothing to say (either is not on
-- it), when there is no such occurrence, and when the caller may not see its guests (private.can_see_guests, which
-- reads the caller from the request as this function does: a guest who has not answered it), so the card never says
-- whether the person asking is on a list the caller may not read. Otherwise the 20261110120000_connections body,
-- verbatim; its grants and its public wrapper are kept.
create or replace function private.my_connections() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester();
begin
 return (with people as (
   select o.other, c.state, c.requested_by, c.series_id, c.created_at, pr.display_name as name, pr.avatar_path, pr.avatar_revision,
    lp.title,
    case when c.state='requested' then coalesce(case when lp.id is not null and private.can_see_guests(lp.id)
     then private.pair_standing(lp.id,v_uid,o.other) end,'from') end as context
   from public.connections c
   cross join lateral (select case when c.user_a=v_uid then c.user_b else c.user_a end as other) o
   join public.profiles pr on pr.id=o.other
   left join lateral (select p.id, p.title, p.status, p.starts_at, p.ends_at from public.plans p where p.series_id=c.series_id
    and private.can_read_plan(p.id) order by p.starts_at desc, p.id limit 1) lp on true
   where c.user_a=v_uid or c.user_b=v_uid)
  select jsonb_build_object(
   'requests',coalesce((select jsonb_agg(jsonb_build_object('user_id',p.other,'name',p.name,'avatar_path',p.avatar_path,
     'avatar_revision',p.avatar_revision,'series_id',p.series_id,'title',p.title,'context',p.context) order by p.created_at desc,p.other)
    from people p where p.state='requested' and p.requested_by=p.other),'[]'::jsonb),
   'connected',coalesce((select jsonb_agg(jsonb_build_object('user_id',p.other,'name',p.name,'avatar_path',p.avatar_path,
     'avatar_revision',p.avatar_revision,'series_id',p.series_id,'title',p.title) order by p.name,p.other)
    from people p where p.state='connected'),'[]'::jsonb)));
end $$;
