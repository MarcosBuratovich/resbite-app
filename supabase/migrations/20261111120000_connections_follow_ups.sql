-- Connections follow-ups: the roll carries every guest; a request's notice says how the two stand.
-- Specs: docs/superpowers/specs/2026-11-10-groups-and-chat-design.md (CH-P20) and
-- docs/superpowers/specs/2026-11-10-connections-and-circles-design.md (CO-P5).
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
-- it is queued: 'going' while that resbite is on (not cancelled, not ended) and both are on it (each a host, or a guest
-- who is Going or Maybe: the rule of my_connections' context), 'met' once it has ended, else 'invited' (one of them
-- said Can't go, or it was cancelled before its end). The sender words the push from it; a notice queued before this
-- migration has none. The detail check is replaced by exact name, keeping every existing value.
alter table private.notification_outbox drop constraint notification_outbox_detail_check;
alter table private.notification_outbox add constraint notification_outbox_detail_check check (
 detail is null
 or (kind='plan_changed' and detail in ('time','place','time_place'))
 or (kind='rsvp' and detail in ('accepted','maybe','declined','withdrawn'))
 or (kind='invited' and detail='again')
 or (kind='connection_request' and detail in ('going','invited','met')));

-- Asking, from a resbite: a new request's notice carries the detail above. Otherwise the 20261110120000_connections
-- body, verbatim (its comments name that file's sections): the pair's lock, the refusals, and the notice's key (the
-- pair, the series and who asked: a request sent again queues nothing, and its first notice, with its first detail,
-- stands for it) and stamp. Its grants and its public wrapper are kept.
create or replace function private.request_connection(p_user uuid, p_plan uuid) returns text language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_a uuid; v_b uuid; v_series uuid; v_row public.connections; v_at timestamptz; v_detail text;
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
 -- How the two stand on the resbite asked from, for the notice's line (CO-P5): 'going', 'met' or 'invited'.
 select case when p.status='active' and private.plan_end(p.starts_at,p.ends_at)>now()
   and (select bool_and(private.is_host(p.id,u.id) or exists(select 1 from public.attendees a
     where a.plan_id=p.id and a.user_id=u.id and a.response in ('accepted','maybe'))) from (values (v_uid),(p_user)) u(id))
  then 'going' when private.plan_end(p.starts_at,p.ends_at)<=now() then 'met' else 'invited' end
 into v_detail from public.plans p where p.id=p_plan;
 insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id,created_at,detail)
  values(p_plan,p_user,'connection_request','connect:'||v_a||':'||v_b||':'||v_series||':'||v_uid,v_uid,v_at,v_detail)
  on conflict do nothing;
 return 'requested';
end $$;
