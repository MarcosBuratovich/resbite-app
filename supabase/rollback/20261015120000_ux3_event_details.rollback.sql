-- Rollback for 20261015120000_ux3_event_details.sql. Run as one transaction, only with the owner's approval:
--   begin; \i supabase/rollback/20261015120000_ux3_event_details.rollback.sql; commit;
-- It puts Meeting details back in plans.note, restores the replaced functions verbatim, and removes
-- the end time, the Note to guests and their notices.
-- Weigh this before rolling back: every Meeting details text goes back into plans.note, which builds older than
-- UX3 show to every invitee, including text written under "Only people who answer Going or Maybe see this".

alter table public.plans drop constraint plans_note_moved;
update public.plans as p set note=m.note from public.plan_meeting_details as m where m.plan_id=p.id;

-- The 20261007150000_custom_events body, verbatim.
create or replace function private.create_plan_v2(p_id uuid,p_title text,p_description text,p_categories text[],p_activity text,p_start timestamptz,p_zone text,p_place text,p_note text default '',p_lat double precision default null,p_lon double precision default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_existing public.plans;
begin
 -- Serialize repeated creation IDs; a retry must match the original payload exactly.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text,0));
 select * into v_existing from public.plans where id=p_id;
 if found then
  if v_existing.owner_id<>v_uid or v_existing.title is distinct from btrim(p_title)
  or v_existing.description is distinct from coalesce(p_description,'') or v_existing.categories is distinct from p_categories
  or v_existing.activity_id is distinct from p_activity or v_existing.starts_at is distinct from p_start
  or v_existing.time_zone is distinct from p_zone or v_existing.place_label is distinct from btrim(p_place)
  or v_existing.note is distinct from coalesce(p_note,'') or v_existing.latitude is distinct from p_lat
  or v_existing.longitude is distinct from p_lon then
   raise exception 'Creation identifier already used' using errcode='22023';
  end if;
  return p_id;
 end if;
 if p_title is null or p_categories is null then raise exception 'Title and categories required' using errcode='23502'; end if;
 if p_start is null or p_start<=now() or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_zone) then raise exception 'Invalid future schedule' using errcode='22023'; end if;
 if p_activity is not null and not exists(select 1 from public.activities where id=p_activity and published) then raise exception 'Activity unavailable' using errcode='22023'; end if;
 insert into public.plans(id,owner_id,activity_id,title,description,categories,starts_at,time_zone,place_label,note,latitude,longitude)
 values(p_id,v_uid,p_activity,btrim(p_title),coalesce(p_description,''),p_categories,p_start,p_zone,btrim(p_place),coalesce(p_note,''),p_lat,p_lon);
 return p_id;
end $$;

-- The 20261014120000_ux2_rules bodies, verbatim.
create or replace function private.change_plan_v2(p_plan uuid,p_version integer,p_title text,p_description text,p_categories text[],p_start timestamptz,p_zone text,p_place text,p_note text,p_cancel boolean default false)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_plan public.plans; v_next integer; v_cancel boolean := coalesce(p_cancel,false);
 v_time boolean; v_place boolean;
begin
 select * into v_plan from public.plans where id=p_plan for update;
 if not found or v_plan.owner_id<>v_uid then raise exception 'Owner required' using errcode='42501'; end if;
 if v_plan.status<>'active' or v_plan.starts_at<=now() then raise exception 'Plan unavailable' using errcode='22023'; end if;
 if p_version is distinct from v_plan.version then raise exception 'Plan changed; refresh' using errcode='40001'; end if;
 if not v_cancel and (p_start is null or p_start<=now() or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_zone)) then raise exception 'Invalid future schedule' using errcode='22023'; end if;
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
   starts_at=p_start,time_zone=p_zone,place_label=btrim(p_place),note=coalesce(p_note,''),latitude=null,longitude=null,version=v_next
  where id=p_plan;
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

create or replace function private.redact_deleting_owner_plan() returns trigger
language plpgsql set search_path = '' as $$
begin
 if new.owner_id is not null and exists(
  select 1 from public.profiles as p where p.id = new.owner_id and p.deletion_requested_at is not null) then
  new.title := 'Resbite';
  new.description := '';
  new.cover_path := null;
  new.cover_description := '';
 end if;
 return new;
end $$;

drop function public.create_plan_v3(uuid,text,text,text[],text,timestamptz,timestamptz,text,text,text,double precision,double precision);
drop function private.create_plan_v3(uuid,text,text,text[],text,timestamptz,timestamptz,text,text,text,double precision,double precision);
drop function public.change_plan_v3(uuid,integer,text,text,text[],timestamptz,timestamptz,text,text,text,boolean);
drop function private.change_plan_v3(uuid,integer,text,text,text[],timestamptz,timestamptz,text,text,text,boolean,boolean);
drop function public.set_guest_note(uuid,text);
drop function private.set_guest_note(uuid,text);
drop policy meeting_details_read on public.plan_meeting_details;
drop table public.plan_meeting_details;
drop function private.write_meeting_details(uuid,text);
drop function private.forget_meeting_details(uuid);
drop function private.can_read_meeting_details(uuid);

delete from private.notification_outbox where kind='guest_note';
alter table private.notification_outbox drop constraint notification_outbox_kind_check;
alter table private.notification_outbox add constraint notification_outbox_kind_check
 check (kind in ('invitation','rsvp','plan_changed','plan_cancelled'));

alter table public.plans drop constraint plans_guest_note_valid, drop column guest_note, drop column guest_note_at, drop column has_meeting_details;
alter table public.plans drop constraint plans_ends_after_start, drop column ends_at;
