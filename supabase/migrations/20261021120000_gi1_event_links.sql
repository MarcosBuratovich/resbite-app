-- GI1 event links (docs/superpowers/specs/2026-10-21-gi1-event-links-design.md): one link per resbite that
-- anyone can open, a public read of the event's basics for the web page, joining by that link, the optional
-- area shown before people reply, and removing a guest.
-- Hosted-compatible: depends only on the migrations listed in supabase/tests/hosted-baseline/migrations.txt.
-- Rollback: supabase/rollback/20261021120000_gi1_event_links.rollback.sql.

-- Slice 1: the link. The database makes the code, so the host can copy it from any device; nobody reads the
-- table directly. At most one active link per event.
create table private.plan_links (
 id uuid primary key default gen_random_uuid(),
 plan_id uuid not null references public.plans(id) on delete cascade,
 code text not null unique check (code ~ '^[A-Za-z0-9_-]{22}$'),
 created_at timestamptz not null default now(),
 revoked_at timestamptz
);
create unique index plan_links_active_idx on private.plan_links(plan_id) where revoked_at is null;
alter table private.plan_links enable row level security;
revoke all on private.plan_links from public, anon, authenticated;

-- 16 random bytes as 22 URL-safe characters (base64url without padding).
create function private.new_link_code() returns text language sql volatile set search_path = '' as $$
 select rtrim(translate(encode(extensions.gen_random_bytes(16),'base64'),'+/','-_'),'=')
$$;
revoke all on function private.new_link_code() from public, anon, authenticated, service_role;

-- The organizer of an active event that hasn't started; locks the plan row. Otherwise 42501.
create function private.require_link_owner(p_plan uuid) returns uuid language plpgsql set search_path = '' as $$
declare v_uid uuid := private.require_tester();
begin
 perform 1 from public.plans where id=p_plan and owner_id=v_uid and status='active' and starts_at>now() for update;
 if not found then raise exception 'Active plan owner required' using errcode='42501'; end if;
 return v_uid;
end $$;
revoke all on function private.require_link_owner(uuid) from public, anon, authenticated, service_role;

-- The active code, made on first call.
create function private.plan_link(p_plan uuid) returns text language plpgsql security definer set search_path = '' as $$
declare v_code text;
begin
 perform private.require_link_owner(p_plan);
 select code into v_code from private.plan_links where plan_id=p_plan and revoked_at is null;
 if v_code is null then
  v_code := private.new_link_code();
  insert into private.plan_links(plan_id,code) values(p_plan,v_code);
 end if;
 return v_code;
end $$;
-- Turns the active link off and returns a new one. People with the old link see "no longer active". The
-- event's unclaimed per-person links (shared before GI1) stop too: the host has no other way to turn them
-- off now; claimed ones belong to guests, whom Remove handles.
create function private.rotate_plan_link(p_plan uuid) returns text language plpgsql security definer set search_path = '' as $$
declare v_code text := private.new_link_code();
begin
 perform private.require_link_owner(p_plan);
 update private.plan_links set revoked_at=now() where plan_id=p_plan and revoked_at is null;
 update private.invitations set revoked_at=now() where plan_id=p_plan and claimed_by is null and revoked_at is null;
 insert into private.plan_links(plan_id,code) values(p_plan,v_code);
 return v_code;
end $$;
-- Removes a guest from the event. Their per-person invitations (links shared before GI1) stop working too;
-- the event link stays open, so this is a removal, not a ban. Removing the organizer is refused (22023);
-- removing someone who isn't on the event does nothing.
create function private.remove_guest(p_plan uuid,p_user uuid) returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid;
begin
 v_uid := private.require_link_owner(p_plan);
 if p_user=v_uid then raise exception 'The organizer cannot be removed' using errcode='22023'; end if;
 update private.invitations set revoked_at=now() where plan_id=p_plan and claimed_by=p_user and revoked_at is null;
 delete from public.attendees where plan_id=p_plan and user_id=p_user;
end $$;
create function public.plan_link(p_plan uuid) returns text language sql security invoker set search_path = '' as $$
 select private.plan_link(p_plan)
$$;
create function public.rotate_plan_link(p_plan uuid) returns text language sql security invoker set search_path = '' as $$
 select private.rotate_plan_link(p_plan)
$$;
create function public.remove_guest(p_plan uuid,p_user uuid) returns void language sql security invoker set search_path = '' as $$
 select private.remove_guest(p_plan,p_user)
$$;
revoke all on function private.plan_link(uuid), public.plan_link(uuid), private.rotate_plan_link(uuid), public.rotate_plan_link(uuid),
 private.remove_guest(uuid,uuid), public.remove_guest(uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function private.plan_link(uuid), public.plan_link(uuid), private.rotate_plan_link(uuid), public.rotate_plan_link(uuid),
 private.remove_guest(uuid,uuid), public.remove_guest(uuid,uuid) to authenticated;

-- Slice 2: the area shown before people reply (GI-D5). The exact place stays in place_label.
alter table public.plans add column area text not null default '' check (area=btrim(area) and char_length(area)<=80);

-- The save functions take the area as a new last argument. Null means "leave it as it is": builds up to 8
-- never send it, so their edits keep the stored area. The bodies are otherwise the 20261015120000 ones.
drop function public.create_plan_v3(uuid,text,text,text[],text,timestamptz,timestamptz,text,text,text,double precision,double precision);
drop function private.create_plan_v3(uuid,text,text,text[],text,timestamptz,timestamptz,text,text,text,double precision,double precision);
drop function public.change_plan_v3(uuid,integer,text,text,text[],timestamptz,timestamptz,text,text,text,boolean);
drop function private.change_plan_v3(uuid,integer,text,text,text[],timestamptz,timestamptz,text,text,text,boolean,boolean);

create function private.create_plan_v3(p_id uuid,p_title text,p_description text,p_categories text[],p_activity text,p_start timestamptz,p_ends timestamptz,p_zone text,p_place text,p_note text default '',p_lat double precision default null,p_lon double precision default null,p_area text default null)
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
  or v_existing.area is distinct from coalesce(btrim(p_area),'')
  or v_existing.latitude is distinct from p_lat or v_existing.longitude is distinct from p_lon then
   raise exception 'Creation identifier already used' using errcode='22023';
  end if;
  return p_id;
 end if;
 if p_title is null or p_categories is null then raise exception 'Title and categories required' using errcode='23502'; end if;
 if p_start is null or p_start<=now() or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_zone) then raise exception 'Invalid future schedule' using errcode='22023'; end if;
 if p_ends is not null and p_ends<=p_start then raise exception 'The end must be after the start' using errcode='22023'; end if;
 if p_activity is not null and not exists(select 1 from public.activities where id=p_activity and published) then raise exception 'Activity unavailable' using errcode='22023'; end if;
 insert into public.plans(id,owner_id,activity_id,title,description,categories,starts_at,ends_at,time_zone,place_label,latitude,longitude,area)
 values(p_id,v_uid,p_activity,btrim(p_title),coalesce(p_description,''),p_categories,p_start,p_ends,p_zone,btrim(p_place),p_lat,p_lon,coalesce(btrim(p_area),''));
 perform private.write_meeting_details(p_id,coalesce(p_note,''));
 return p_id;
end $$;

create function private.change_plan_v3(p_plan uuid,p_version integer,p_title text,p_description text,p_categories text[],p_start timestamptz,p_ends timestamptz,p_zone text,p_place text,p_note text,p_cancel boolean default false,p_keep_length boolean default false,p_area text default null)
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
   starts_at=p_start,ends_at=v_ends,time_zone=p_zone,place_label=btrim(p_place),latitude=null,longitude=null,version=v_next,
   area=case when p_area is null then v_plan.area else btrim(p_area) end
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

create function public.create_plan_v3(p_id uuid,p_title text,p_description text,p_categories text[],p_activity text,p_start timestamptz,p_ends timestamptz,p_zone text,p_place text,p_note text default '',p_lat double precision default null,p_lon double precision default null,p_area text default null)
returns uuid language sql security invoker set search_path='' as $$
 select private.create_plan_v3(p_id,p_title,p_description,p_categories,p_activity,p_start,p_ends,p_zone,p_place,p_note,p_lat,p_lon,p_area)
$$;
create function public.change_plan_v3(p_plan uuid,p_version integer,p_title text,p_description text,p_categories text[],p_start timestamptz,p_ends timestamptz,p_zone text,p_place text,p_note text,p_cancel boolean default false,p_area text default null)
returns integer language sql security invoker set search_path='' as $$
 select private.change_plan_v3(p_plan,p_version,p_title,p_description,p_categories,p_start,p_ends,p_zone,p_place,p_note,p_cancel,false,p_area)
$$;
revoke all on function
 private.create_plan_v3(uuid,text,text,text[],text,timestamptz,timestamptz,text,text,text,double precision,double precision,text),
 public.create_plan_v3(uuid,text,text,text[],text,timestamptz,timestamptz,text,text,text,double precision,double precision,text),
 private.change_plan_v3(uuid,integer,text,text,text[],timestamptz,timestamptz,text,text,text,boolean,boolean,text),
 public.change_plan_v3(uuid,integer,text,text,text[],timestamptz,timestamptz,text,text,text,boolean,text)
 from public, anon, authenticated, service_role;
grant execute on function
 private.create_plan_v3(uuid,text,text,text[],text,timestamptz,timestamptz,text,text,text,double precision,double precision,text),
 public.create_plan_v3(uuid,text,text,text[],text,timestamptz,timestamptz,text,text,text,double precision,double precision,text),
 private.change_plan_v3(uuid,integer,text,text,text[],timestamptz,timestamptz,text,text,text,boolean,boolean,text),
 public.change_plan_v3(uuid,integer,text,text,text[],timestamptz,timestamptz,text,text,text,boolean,text)
 to authenticated;

-- Account deletion's redaction also blanks the area. Otherwise the 20261015120000 body.
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
  new.area := '';
  perform private.forget_meeting_details(new.id);
 end if;
 return new;
end $$;

-- Slice 3: the public read for the web page (GI-D2) and joining by the link.
-- Anyone with the code, signed in or not, gets exactly the basics: state, host, title, time, area, how many
-- are going, and which image to show. Never the exact place, Meeting details, the note, the description or
-- guests' names. Unknown and revoked codes are indistinguishable; cancelled and past events keep only the
-- host and title so the page can say what happened.
create function private.invitation_page(p_code text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_link private.plan_links; v_plan public.plans; v_host text; v_going integer; v_state text;
begin
 if p_code is null or p_code !~ '^[A-Za-z0-9_-]{22}$' then return jsonb_build_object('state','inactive'); end if;
 select * into v_link from private.plan_links where code=p_code and revoked_at is null;
 if not found then return jsonb_build_object('state','inactive'); end if;
 select * into v_plan from public.plans where id=v_link.plan_id;
 if not found or v_plan.owner_id is null then return jsonb_build_object('state','inactive'); end if;
 select display_name into v_host from public.profiles where id=v_plan.owner_id;
 v_state := case when v_plan.status<>'active' then 'cancelled' when v_plan.starts_at<=now() then 'happened' else 'open' end;
 if v_state<>'open' then return jsonb_build_object('state',v_state,'host',v_host,'title',v_plan.title); end if;
 select count(*) into v_going from public.attendees where plan_id=v_plan.id and response='accepted';
 return jsonb_build_object('state','open','host',v_host,'title',v_plan.title,'starts_at',v_plan.starts_at,'ends_at',v_plan.ends_at,
  'time_zone',v_plan.time_zone,'area',v_plan.area,'going',v_going,
  'image',case when v_plan.cover_path is not null then jsonb_build_object('kind','cover','ref',v_plan.cover_path)
   when v_plan.activity_id is not null then jsonb_build_object('kind','activity','ref',v_plan.activity_id)
   else jsonb_build_object('kind','mark','ref','') end);
end $$;
-- The public wrapper is a definer too: anon has no usage on the private schema, and this is the one function
-- the page server calls without a session. It only ever returns what the private body returns.
create function public.invitation_page(p_code text) returns jsonb language sql stable security definer set search_path = '' as $$
 select private.invitation_page(p_code)
$$;
revoke all on function private.invitation_page(text), public.invitation_page(text) from public, anon, authenticated, service_role;
grant execute on function private.invitation_page(text), public.invitation_page(text) to anon, authenticated;

-- Joining by the event link, with one notice to the organizer per guest. In this order: an unknown or
-- malformed code is refused; then the organizer and anyone already on the event get the plan id from any of
-- its links, old or turned off, before or after the start (they will tap it again in the chat it was posted
-- in); then everyone else is refused when the link is turned off, or the event is cancelled or has started
-- (42501 throughout, as claim_invite's refusals). Only then does a new guest join, not answered yet.
create function private.claim_plan_link(p_code text) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_link private.plan_links; v_plan public.plans;
begin
 if p_code is null or p_code !~ '^[A-Za-z0-9_-]{22}$' then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 select * into v_link from private.plan_links where code=p_code;
 if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 select * into v_plan from public.plans where id=v_link.plan_id for update;
 if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 if v_plan.owner_id=v_uid or exists(select 1 from public.attendees where plan_id=v_plan.id and user_id=v_uid) then return v_plan.id; end if;
 -- Read again under the plan lock: rotate_plan_link holds the same lock while it turns the link off.
 perform 1 from private.plan_links where id=v_link.id and revoked_at is null;
 if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 if v_plan.status<>'active' or v_plan.starts_at<=now() then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 insert into public.attendees(plan_id,user_id) values(v_plan.id,v_uid);
 insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id)
  values(v_plan.id,v_plan.owner_id,'invitation','link:'||v_link.id||':'||v_uid,v_uid) on conflict do nothing;
 return v_plan.id;
end $$;
create function public.claim_plan_link(p_code text) returns uuid language sql security invoker set search_path = '' as $$
 select private.claim_plan_link(p_code)
$$;
revoke all on function private.claim_plan_link(text), public.claim_plan_link(text) from public, anon, authenticated, service_role;
grant execute on function private.claim_plan_link(text), public.claim_plan_link(text) to authenticated;
