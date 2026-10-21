-- Rollback for 20261021120000_gi1_event_links.sql. Run as one transaction, only with the owner's approval:
--   begin; \i supabase/rollback/20261021120000_gi1_event_links.rollback.sql; commit;
-- It removes the event links (every shared /r/ link stops working), the area, the public page read and joining
-- by link, and restores the 20261015120000 save functions and redaction trigger verbatim. Guests who joined by
-- a link stay on their events; per-person invitations are untouched.

drop function public.claim_plan_link(text);
drop function private.claim_plan_link(text);
drop function public.invitation_page(text);
drop function private.invitation_page(text);
drop function public.remove_guest(uuid,uuid);
drop function private.remove_guest(uuid,uuid);
drop function public.rotate_plan_link(uuid);
drop function private.rotate_plan_link(uuid);
drop function public.plan_link(uuid);
drop function private.plan_link(uuid);
drop function private.require_link_owner(uuid);
drop function private.new_link_code();
drop table private.plan_links;

drop function public.create_plan_v3(uuid,text,text,text[],text,timestamptz,timestamptz,text,text,text,double precision,double precision,text);
drop function private.create_plan_v3(uuid,text,text,text[],text,timestamptz,timestamptz,text,text,text,double precision,double precision,text);
drop function public.change_plan_v3(uuid,integer,text,text,text[],timestamptz,timestamptz,text,text,text,boolean,text);
drop function private.change_plan_v3(uuid,integer,text,text,text[],timestamptz,timestamptz,text,text,text,boolean,boolean,text);
alter table public.plans drop column area;

-- The 20261015120000_ux3_event_details bodies, verbatim.
create or replace function private.redact_deleting_owner_plan() returns trigger
language plpgsql set search_path = '' as $$
begin
 if new.owner_id is not null and exists(
  select 1 from public.profiles as p where p.id = new.owner_id and p.deletion_requested_at is not null) then
  new.title := 'Resbite';
  new.description := '';
  new.cover_path := null;
  new.cover_description := '';
  new.guest_note := '';
  new.guest_note_at := null;
  new.has_meeting_details := false;
  perform private.forget_meeting_details(new.id);
 end if;
 return new;
end $$;

create function private.create_plan_v3(p_id uuid,p_title text,p_description text,p_categories text[],p_activity text,p_start timestamptz,p_ends timestamptz,p_zone text,p_place text,p_note text default '',p_lat double precision default null,p_lon double precision default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_existing public.plans;
begin
 -- Serialize repeated creation IDs; a retry must match the original payload exactly.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text,0));
 select * into v_existing from public.plans where id=p_id;
 if found then
  if v_existing.owner_id is distinct from v_uid or v_existing.title is distinct from btrim(p_title)
  or v_existing.description is distinct from coalesce(p_description,'') or v_existing.categories is distinct from p_categories
  or v_existing.activity_id is distinct from p_activity or v_existing.starts_at is distinct from p_start
  or v_existing.ends_at is distinct from p_ends
  or v_existing.time_zone is distinct from p_zone or v_existing.place_label is distinct from btrim(p_place)
  or coalesce((select note from public.plan_meeting_details where plan_id=p_id),'') is distinct from coalesce(p_note,'')
  or v_existing.latitude is distinct from p_lat or v_existing.longitude is distinct from p_lon then
   raise exception 'Creation identifier already used' using errcode='22023';
  end if;
  return p_id;
 end if;
 if p_title is null or p_categories is null then raise exception 'Title and categories required' using errcode='23502'; end if;
 if p_start is null or p_start<=now() or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_zone) then raise exception 'Invalid future schedule' using errcode='22023'; end if;
 if p_ends is not null and p_ends<=p_start then raise exception 'The end must be after the start' using errcode='22023'; end if;
 if p_activity is not null and not exists(select 1 from public.activities where id=p_activity and published) then raise exception 'Activity unavailable' using errcode='22023'; end if;
 insert into public.plans(id,owner_id,activity_id,title,description,categories,starts_at,ends_at,time_zone,place_label,latitude,longitude)
 values(p_id,v_uid,p_activity,btrim(p_title),coalesce(p_description,''),p_categories,p_start,p_ends,p_zone,btrim(p_place),p_lat,p_lon);
 perform private.write_meeting_details(p_id,coalesce(p_note,''));
 return p_id;
end $$;

-- Otherwise the 20261014120000_ux2_rules change_plan_v2 body: only a new start time or place notifies (an
-- end-time change doesn't), and only people who may still come; cancelling tells everyone.
create function private.change_plan_v3(p_plan uuid,p_version integer,p_title text,p_description text,p_categories text[],p_start timestamptz,p_ends timestamptz,p_zone text,p_place text,p_note text,p_cancel boolean default false,p_keep_length boolean default false)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_plan public.plans; v_next integer; v_cancel boolean := coalesce(p_cancel,false);
 v_time boolean; v_place boolean; v_ends timestamptz;
begin
 select * into v_plan from public.plans where id=p_plan for update;
 if not found or v_plan.owner_id is distinct from v_uid then raise exception 'Owner required' using errcode='42501'; end if;
 if v_plan.status<>'active' or v_plan.starts_at<=now() then raise exception 'Plan unavailable' using errcode='22023'; end if;
 if p_version is distinct from v_plan.version then raise exception 'Plan changed; refresh' using errcode='40001'; end if;
 if not v_cancel and (p_start is null or p_start<=now() or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_zone)) then raise exception 'Invalid future schedule' using errcode='22023'; end if;
 v_ends := case when p_keep_length then p_start+(v_plan.ends_at-v_plan.starts_at) else p_ends end;
 if not v_cancel and v_ends is not null and v_ends<=p_start then raise exception 'The end must be after the start' using errcode='22023'; end if;
 v_next := v_plan.version+1;
 if v_cancel then
  -- Terminal; the other arguments are ignored.
  update public.plans set status='cancelled',version=v_next where id=p_plan;
  update private.invitations set revoked_at=now() where plan_id=p_plan and revoked_at is null;
  insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id)
  select p_plan,a.user_id,'plan_cancelled','plan:'||p_plan||':'||v_next||':'||a.user_id,v_uid
  from public.attendees a where a.plan_id=p_plan and a.user_id<>v_uid on conflict do nothing;
 else
  -- A zone change at the same instant moves the shown time, so it counts as a time change.
  v_time := p_start is distinct from v_plan.starts_at or p_zone is distinct from v_plan.time_zone;
  v_place := btrim(p_place) is distinct from v_plan.place_label;
  update public.plans set title=btrim(p_title),description=coalesce(p_description,''),categories=p_categories,
   starts_at=p_start,ends_at=v_ends,time_zone=p_zone,place_label=btrim(p_place),latitude=null,longitude=null,version=v_next
  where id=p_plan;
  perform private.write_meeting_details(p_plan,coalesce(p_note,''));
  if v_time or v_place then
   insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id,detail)
   select p_plan,a.user_id,'plan_changed','plan:'||p_plan||':'||v_next||':'||a.user_id,v_uid,
    case when v_time and v_place then 'time_place' when v_time then 'time' else 'place' end
   from public.attendees a
   where a.plan_id=p_plan and a.user_id<>v_uid and a.response in ('accepted','maybe','pending')
   on conflict do nothing;
  end if;
 end if;
 return v_next;
end $$;

create function public.create_plan_v3(p_id uuid,p_title text,p_description text,p_categories text[],p_activity text,p_start timestamptz,p_ends timestamptz,p_zone text,p_place text,p_note text default '',p_lat double precision default null,p_lon double precision default null)
returns uuid language sql security invoker set search_path='' as $$
 select private.create_plan_v3(p_id,p_title,p_description,p_categories,p_activity,p_start,p_ends,p_zone,p_place,p_note,p_lat,p_lon)
$$;
create function public.change_plan_v3(p_plan uuid,p_version integer,p_title text,p_description text,p_categories text[],p_start timestamptz,p_ends timestamptz,p_zone text,p_place text,p_note text,p_cancel boolean default false)
returns integer language sql security invoker set search_path='' as $$
 select private.change_plan_v3(p_plan,p_version,p_title,p_description,p_categories,p_start,p_ends,p_zone,p_place,p_note,p_cancel,false)
$$;
revoke all on function
 private.create_plan_v3(uuid,text,text,text[],text,timestamptz,timestamptz,text,text,text,double precision,double precision),
 public.create_plan_v3(uuid,text,text,text[],text,timestamptz,timestamptz,text,text,text,double precision,double precision),
 private.change_plan_v3(uuid,integer,text,text,text[],timestamptz,timestamptz,text,text,text,boolean,boolean),
 public.change_plan_v3(uuid,integer,text,text,text[],timestamptz,timestamptz,text,text,text,boolean)
 from public, anon, authenticated, service_role;
grant execute on function
 private.create_plan_v3(uuid,text,text,text[],text,timestamptz,timestamptz,text,text,text,double precision,double precision),
 public.create_plan_v3(uuid,text,text,text[],text,timestamptz,timestamptz,text,text,text,double precision,double precision),
 private.change_plan_v3(uuid,integer,text,text,text[],timestamptz,timestamptz,text,text,text,boolean,boolean),
 public.change_plan_v3(uuid,integer,text,text,text[],timestamptz,timestamptz,text,text,text,boolean)
 to authenticated;
