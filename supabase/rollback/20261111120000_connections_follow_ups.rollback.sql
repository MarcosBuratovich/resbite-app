-- Rollback for 20261111120000_connections_follow_ups.sql (connections follow-ups). Run as one transaction, only with
-- the owner's approval:
--   begin; \i supabase/rollback/20261111120000_connections_follow_ups.rollback.sql; commit;
-- It is for the hosted project, where that migration redefined the two functions below and replaced the outbox detail
-- check. It deletes no row: every 'connection_request' outbox row with a detail ('going', 'invited', 'met' or
-- 'were_invited': every request notice queued since the migration) keeps its row, delivered or not, with its detail set
-- to null, so the earlier detail check can come back. A notice not yet sent then goes with the wording for a request
-- with no detail; the rows' keys still stop the restored request_connection from queuing a second notice for a request
-- already told. It first locks the outbox against writes (share row exclusive), so no notice with a detail is queued
-- while it runs: a request made meanwhile waits, and one that had already worked out its notice's detail fails once
-- this commits (asking again works).
-- private.roll_repeating_plans comes back from 20261031120000_creating_a_resbite.sql: a guest who said Can't go after
-- Going is no longer carried to the next occurrence. private.request_connection comes back from
-- 20261110120000_connections.sql: a request's notice has no detail. Both keep their grants (create or replace), and
-- request_connection its public wrapper. The detail check comes back from 20261031120000_creating_a_resbite.sql.
-- Kept: everything else, the occurrences the roll already created among it, with every guest it carried.
-- Builds: no app build calls anything this migration made; the sender words a request notice with no detail as it did
-- before the migration.
-- Order: run it first of the rollbacks, before the connections one
-- (supabase/rollback/20261110120000_connections.rollback.sql), which drops request_connection, and the creating-a-resbite
-- one (supabase/rollback/20261031120000_creating_a_resbite.rollback.sql), which drops the roll: this file would bring
-- either back. The guard below stops this file when either has already run; it changes nothing.

do $$ begin
 if to_regprocedure('private.request_connection(uuid,uuid)') is null or to_regprocedure('private.roll_repeating_plans()') is null then
  raise exception 'Run the connections follow-ups rollback before the connections and creating-a-resbite rollbacks';
 end if;
end $$;

-- Nothing writes the outbox until this commits.
lock table private.notification_outbox in share row exclusive mode;

-- The roll as it was (20261031120000_creating_a_resbite.sql): a guest who said Can't go after Going is not carried.
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
    where plan_id=p.id and response<>'withdrawn' and private.used_app(user_id) and private.user_eligible(user_id) and not private.deletion_pending(user_id);
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
-- Asking as it was (20261110120000_connections.sql): the request's notice has no detail.
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
 insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id,created_at)
  values(p_plan,p_user,'connection_request','connect:'||v_a||':'||v_b||':'||v_series||':'||v_uid,v_uid,v_at)
  on conflict do nothing;
 return 'requested';
end $$;

-- The request notices keep their rows, without a detail, and the check comes back as it was
-- (20261031120000_creating_a_resbite.sql).
update private.notification_outbox set detail=null where kind='connection_request' and detail is not null;
alter table private.notification_outbox drop constraint notification_outbox_detail_check;
alter table private.notification_outbox add constraint notification_outbox_detail_check check (
 detail is null
 or (kind='plan_changed' and detail in ('time','place','time_place'))
 or (kind='rsvp' and detail in ('accepted','maybe','declined','withdrawn'))
 or (kind='invited' and detail='again'));
