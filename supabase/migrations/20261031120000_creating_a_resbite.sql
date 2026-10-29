-- Creating a resbite: the database. Spec: docs/superpowers/specs/2026-10-28-creating-a-resbite-design.md
-- Plan: docs/superpowers/plans/2026-10-28-creating-a-resbite-1-database.md
-- Hosted-compatible: depends only on the migrations in supabase/tests/hosted-baseline/migrations.txt
-- Rollback: supabase/rollback/20261031120000_creating_a_resbite.rollback.sql

-- 0. The host helpers (CR-D8)
-- Section 2 explains them. They come first because section 1 bodies and policies (parsed when created) refer to them.
create table public.plan_admins(
 plan_id uuid not null references public.plans(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 appointed_by uuid not null references public.profiles(id) on delete cascade,
 appointed_at timestamptz not null default now(),
 primary key (plan_id,user_id)
);
create index plan_admins_user_idx on public.plan_admins(user_id);
alter table public.plan_admins enable row level security;
revoke all on public.plan_admins from public, anon, authenticated, service_role;
grant select on public.plan_admins to authenticated;
create policy plan_admins_read on public.plan_admins for select to authenticated using (private.can_read_plan(plan_id) and (user_id=(select auth.uid()) or private.can_see_guests(plan_id)));

-- The owner, or an admin the owner appointed.
create function private.is_host(p_plan uuid, p_user uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.plans where id=p_plan and owner_id=p_user)
  or exists(select 1 from public.plan_admins where plan_id=p_plan and user_id=p_user)
$$;
-- The owner, then the admins in the order they were appointed.
create function private.host_ids(p_plan uuid) returns setof uuid language sql stable security definer set search_path = '' as $$
 select h.id from (
  select owner_id as id, 0 as rank, null::timestamptz as at from public.plans where id=p_plan and owner_id is not null
  union all
  select user_id, 1, appointed_at from public.plan_admins where plan_id=p_plan) h
 order by h.rank, h.at, h.id
$$;
revoke all on function private.is_host(uuid,uuid), private.host_ids(uuid) from public, anon, authenticated, service_role;

-- 1. The end is the boundary
-- CR-D14: a resbite accepts changes until it ends, not until it starts. The end is ends_at, or starts_at when there is
-- none. Every function that refused from the start refuses from the end instead, with its error text unchanged; each
-- body below is the latest hosted one with that comparison changed (and, for change_plan_v3, the start check). Several
-- bodies also widen an owner check to every host or send a host notice to every host (CR-D8, CR-P17): section 2 lists
-- them; those changes are made here, in place, so each function keeps one definition.
-- Unchanged: set_guest_note keeps its own window (end, or start + 1 hour) and create_plan_v3 still wants a future start.
-- Each keeps the grants and the public wrapper it already has. The storage policies call plan_end, so authenticated
-- may execute it.
create function private.plan_end(p_starts timestamptz, p_ends timestamptz) returns timestamptz language sql immutable set search_path = '' as $$
 select coalesce(p_ends,p_starts)
$$;
revoke all on function private.plan_end(timestamptz,timestamptz) from public, anon, authenticated, service_role;
grant execute on function private.plan_end(timestamptz,timestamptz) to authenticated;

-- Open until the end. The start is checked against now() only when it changes, so a running plan can change its place.
create or replace function private.change_plan_v3(p_plan uuid,p_version integer,p_title text,p_description text,p_categories text[],p_start timestamptz,p_ends timestamptz,p_zone text,p_place text,p_note text,p_cancel boolean default false,p_keep_length boolean default false,p_area text default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_plan public.plans; v_next integer; v_cancel boolean := coalesce(p_cancel,false);
 v_time boolean; v_place boolean; v_ends timestamptz;
begin
 select * into v_plan from public.plans where id=p_plan for update;
 if not found or not private.is_host(p_plan,v_uid) then raise exception 'Owner required' using errcode='42501'; end if;
 if v_plan.status<>'active' or private.plan_end(v_plan.starts_at,v_plan.ends_at)<=now() then raise exception 'Plan unavailable' using errcode='22023'; end if;
 if p_version is distinct from v_plan.version then raise exception 'Plan changed; refresh' using errcode='40001'; end if;
 if not v_cancel and (p_start is null or (p_start<=now() and p_start is distinct from v_plan.starts_at) or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_zone)) then raise exception 'Invalid future schedule' using errcode='22023'; end if;
 v_ends := case when p_keep_length then p_start+(v_plan.ends_at-v_plan.starts_at) else p_ends end;
 if not v_cancel and v_ends is not null and v_ends<=p_start then raise exception 'The end must be after the start' using errcode='22023'; end if;
 -- A running plan keeps running: an old build saving it without an end, or with one that has passed, would close it at once.
 if not v_cancel and v_plan.starts_at<=now() and (v_ends is null or v_ends<=now()) then raise exception 'Plan unavailable' using errcode='22023'; end if;
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
   starts_at=p_start,ends_at=v_ends,time_zone=p_zone,place_label=btrim(p_place),place_tbd=false,latitude=null,longitude=null,version=v_next,
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

-- Answering.
create or replace function private.respond(p_plan uuid,p_response text,p_version integer) returns integer language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_plan public.plans; v_att public.attendees; v_next integer;
begin
 select * into v_plan from public.plans where id=p_plan for update;
 select * into v_att from public.attendees where plan_id=p_plan and user_id=v_uid for update;
 if v_att.user_id is null then raise exception 'Invitee required' using errcode='42501'; end if;
 if v_plan.status<>'active' or private.plan_end(v_plan.starts_at,v_plan.ends_at)<=now() then raise exception 'Plan unavailable' using errcode='22023'; end if;
 if p_response is null or p_response not in ('accepted','maybe','declined','withdrawn') then raise exception 'Invalid response' using errcode='22023'; end if;
 if p_version is distinct from v_att.version then
  if v_att.response=p_response and p_version=v_att.version-1 then return v_att.version; end if;
  raise exception 'Response changed; refresh' using errcode='40001';
 end if;
 if v_att.response=p_response then return v_att.version; end if;
 v_next:=v_att.version+1;
 update public.attendees set response=p_response,version=v_next,updated_at=now() where plan_id=p_plan and user_id=v_uid;
 -- CR-P15: Can't go ends the admin role. The notice goes to every host but the one answering (CR-P17).
 if p_response in ('declined','withdrawn') then delete from public.plan_admins where plan_id=p_plan and user_id=v_uid; end if;
 insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id,detail)
 select p_plan,h,'rsvp','rsvp:'||p_plan||':'||v_uid||':'||v_next||case when h=v_plan.owner_id then '' else ':'||h end,v_uid,p_response from private.host_ids(p_plan) h where h<>v_uid on conflict do nothing;
 return v_next;
end $$;

-- Claiming a per-person link.
create or replace function private.claim_invite(p_token text) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_inv private.invitations; v_plan public.plans; v_id uuid;
begin
 -- Lock plan before invitation consistently with cancellation/revocation.
 select plan_id into v_id from private.invitations where token_hash=extensions.digest(p_token,'sha256');
 select * into v_plan from public.plans where id=v_id for update;
 select * into v_inv from private.invitations where token_hash=extensions.digest(p_token,'sha256') for update;
 if v_inv.id is null or v_plan.status<>'active' or private.plan_end(v_plan.starts_at,v_plan.ends_at)<=now() or v_inv.revoked_at is not null or (v_inv.claimed_by is not null and v_inv.claimed_by<>v_uid) then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 if v_plan.owner_id=v_uid then raise exception 'Owner cannot claim own invitation' using errcode='22023'; end if;
 if v_inv.intended_email is not null and not exists(select 1 from auth.users where id=v_uid and lower(email)=v_inv.intended_email and email_confirmed_at is not null) then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 if v_inv.claimed_by=v_uid then return v_inv.plan_id; end if;
 update private.invitations set claimed_by=v_uid where id=v_inv.id;
 insert into public.attendees(plan_id,user_id) values(v_inv.plan_id,v_uid) on conflict do nothing;
 insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id)
  select v_inv.plan_id,h,'invitation','invite:'||v_inv.id||case when h=v_plan.owner_id then '' else ':'||h end,v_uid from private.host_ids(v_inv.plan_id) h where h<>v_uid on conflict do nothing;
 return v_inv.plan_id;
end $$;

-- Making and revoking per-person links.
create or replace function private.create_invite(p_id uuid,p_plan uuid,p_token text,p_email text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_plan public.plans; v_existing private.invitations; v_hash bytea;
begin
 select * into v_plan from public.plans where id=p_plan for update;
 if not found or v_plan.owner_id<>v_uid then raise exception 'Owner required' using errcode='42501'; end if;
 if v_plan.status<>'active' or private.plan_end(v_plan.starts_at,v_plan.ends_at)<=now() then raise exception 'Plan unavailable' using errcode='22023'; end if;
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception '256-bit random hex token required' using errcode='22023'; end if;
 v_hash := extensions.digest(p_token,'sha256');
 select * into v_existing from private.invitations where id=p_id;
 if found then
  if v_existing.plan_id<>p_plan or v_existing.token_hash<>v_hash or v_existing.intended_email is distinct from nullif(lower(btrim(p_email)),'') or v_existing.revoked_at is not null then raise exception 'Invitation identifier already used' using errcode='22023'; end if;
  return p_id;
 end if;
 insert into private.invitations(id,plan_id,token_hash,intended_email) values(p_id,p_plan,v_hash,nullif(lower(btrim(p_email)),''));
 return p_id;
end $$;

create or replace function private.revoke_invite(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_plan uuid; v_inv private.invitations;
begin
 select plan_id into v_plan from private.invitations where id=p_id;
 perform 1 from public.plans where id=v_plan and owner_id=v_uid and status='active' and private.plan_end(starts_at,ends_at)>now() for update;
 if not found then raise exception 'Active plan owner required' using errcode='42501'; end if;
 select * into v_inv from private.invitations where id=p_id for update;
 update private.invitations set revoked_at=now() where id=p_id;
 if v_inv.claimed_by is not null and not exists(select 1 from private.invitations where plan_id=v_plan and claimed_by=v_inv.claimed_by and revoked_at is null) then
  delete from public.attendees where plan_id=v_plan and user_id=v_inv.claimed_by;
 end if;
end $$;

-- The cover.
create or replace function private.set_plan_cover_if_current(p_plan uuid,p_path text,p_expected_path text,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid := private.require_tester(); v_plan public.plans;
begin
 if p_expected_revision is null or p_expected_revision<0 then raise exception 'Invalid cover revision' using errcode='22023'; end if;
 select * into v_plan from public.plans where id=p_plan for update;
 if not found or not private.is_host(p_plan,v_uid) then raise exception 'Owner required' using errcode='42501'; end if;
 if v_plan.status<>'active' or private.plan_end(v_plan.starts_at,v_plan.ends_at)<=now() then raise exception 'Plan unavailable' using errcode='22023'; end if;
 if p_path is not null and (v_plan.owner_id is null or p_path !~ ('^'||v_plan.owner_id::text||'/'||p_plan::text||'/[A-Za-z0-9-]+\.jpg$') or not exists(
   select 1 from storage.objects where bucket_id='plan-covers' and name=p_path)) then
  raise exception 'Own uploaded cover required' using errcode='42501';
 end if;
 if v_plan.cover_path is not distinct from p_expected_path and v_plan.cover_revision=p_expected_revision then
  if v_plan.cover_path is distinct from p_path then
   update public.plans set cover_path=p_path where id=p_plan returning * into v_plan;
  end if;
 elsif v_plan.cover_path is not distinct from p_path
   and v_plan.cover_revision>0 and v_plan.cover_revision-1=p_expected_revision then
  -- Only the exact next revision acknowledges a lost successful reply (no ABA replay).
  null;
 else
  raise exception 'The cover changed elsewhere; reload before saving' using errcode='40001';
 end if;
 return jsonb_build_object('cover_path',v_plan.cover_path,'cover_revision',v_plan.cover_revision);
end $$;

create or replace function private.set_plan_cover_description(p_plan uuid,p_description text,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid := private.require_tester(); v_plan public.plans; v_text text := btrim(coalesce(p_description,''));
begin
 if p_expected_revision is null or p_expected_revision<0 then raise exception 'Invalid cover revision' using errcode='22023'; end if;
 if char_length(v_text)>200 then raise exception 'Photo description too long' using errcode='22023'; end if;
 select * into v_plan from public.plans where id=p_plan for update;
 if not found or not private.is_host(p_plan,v_uid) then raise exception 'Owner required' using errcode='42501'; end if;
 if v_plan.status<>'active' or private.plan_end(v_plan.starts_at,v_plan.ends_at)<=now() then raise exception 'Plan unavailable' using errcode='22023'; end if;
 if v_plan.cover_revision=p_expected_revision then
  if v_plan.cover_path is null and v_text<>'' then raise exception 'Add a cover photo first' using errcode='22023'; end if;
  if v_plan.cover_description<>v_text then
   update public.plans set cover_description=v_text where id=p_plan returning * into v_plan;
  end if;
 elsif v_plan.cover_description=v_text and v_plan.cover_revision-1=p_expected_revision then
  -- Only the exact next revision acknowledges a lost successful reply (no ABA replay).
  null;
 else
  raise exception 'The cover changed elsewhere; reload before saving' using errcode='40001';
 end if;
 return jsonb_build_object('cover_path',v_plan.cover_path,'cover_description',v_plan.cover_description,'cover_revision',v_plan.cover_revision);
end $$;

-- A host (the organizer or an admin) of an active event that has not ended: the gate of the link, the invitations and the
-- waiting list. The error text stays 'Active plan owner required': the current build matches that text.
create or replace function private.require_link_owner(p_plan uuid) returns uuid language plpgsql set search_path = '' as $$
declare v_uid uuid := private.require_tester();
begin
 perform 1 from public.plans where id=p_plan and private.is_host(id,v_uid) and status='active' and private.plan_end(starts_at,ends_at)>now() for update;
 if not found then raise exception 'Active plan owner required' using errcode='42501'; end if;
 return v_uid;
end $$;

-- The public pages say 'happened' from the end. 6. Web payloads: the open payloads also carry place_tbd and repeat_weeks
-- (the pages say "Place to be decided" and "Every Thursday" from them); my_join_request reuses invitation_page.
create or replace function private.invitation_page(p_code text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_link private.plan_links; v_plan public.plans; v_host text; v_going integer; v_state text;
begin
 if p_code is null or p_code !~ '^[A-Za-z0-9_-]{22}$' then return jsonb_build_object('state','inactive'); end if;
 select * into v_link from private.plan_links where code=p_code and revoked_at is null;
 if not found then return jsonb_build_object('state','inactive'); end if;
 select * into v_plan from public.plans where id=v_link.plan_id;
 if not found or v_plan.owner_id is null then return jsonb_build_object('state','inactive'); end if;
 select display_name into v_host from public.profiles where id=v_plan.owner_id;
 v_state := case when v_plan.status<>'active' then 'cancelled' when private.plan_end(v_plan.starts_at,v_plan.ends_at)<=now() then 'happened' else 'open' end;
 if v_state<>'open' then return jsonb_build_object('state',v_state,'host',v_host,'title',v_plan.title); end if;
 select count(*) into v_going from public.attendees where plan_id=v_plan.id and response='accepted';
 return jsonb_build_object('state','open','host',v_host,'title',v_plan.title,'starts_at',v_plan.starts_at,'ends_at',v_plan.ends_at,
  'time_zone',v_plan.time_zone,'area',v_plan.area,'place_tbd',v_plan.place_tbd,'repeat_weeks',v_plan.repeat_weeks,'going',v_going,
  'image',case when v_plan.cover_path is not null then jsonb_build_object('kind','cover','ref',v_plan.cover_path)
   when v_plan.activity_id is not null then jsonb_build_object('kind','activity','ref',v_plan.activity_id)
   else jsonb_build_object('kind','mark','ref','') end);
end $$;

create or replace function private.personal_invitation_page(p_code text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_inv private.phone_invitations; v_plan public.plans; v_host text; v_going integer; v_state text;
begin
 if p_code is null or p_code !~ '^[A-Za-z0-9_-]{22}$' then return jsonb_build_object('state','inactive'); end if;
 select * into v_inv from private.phone_invitations where code_hash=extensions.digest(p_code,'sha256') and revoked_at is null;
 if not found then return jsonb_build_object('state','inactive'); end if;
 select * into v_plan from public.plans where id=v_inv.plan_id;
 if not found or v_plan.owner_id is null then return jsonb_build_object('state','inactive'); end if;
 select display_name into v_host from public.profiles where id=v_plan.owner_id;
 v_state := case when v_plan.status<>'active' then 'cancelled' when private.plan_end(v_plan.starts_at,v_plan.ends_at)<=now() then 'happened' else 'open' end;
 if v_state<>'open' then return jsonb_build_object('state',v_state,'host',v_host,'title',v_plan.title); end if;
 select count(*) into v_going from public.attendees where plan_id=v_plan.id and response='accepted';
 return jsonb_build_object('state','open','host',v_host,'title',v_plan.title,'starts_at',v_plan.starts_at,'ends_at',v_plan.ends_at,
  'time_zone',v_plan.time_zone,'area',v_plan.area,'place_tbd',v_plan.place_tbd,'repeat_weeks',v_plan.repeat_weeks,'going',v_going,
  'image',case when v_plan.cover_path is not null then jsonb_build_object('kind','cover','ref',v_plan.cover_path)
   when v_plan.activity_id is not null then jsonb_build_object('kind','activity','ref',v_plan.activity_id)
   else jsonb_build_object('kind','mark','ref','') end,
  'ending',right(v_inv.phone,2),'country',v_inv.country);
end $$;

-- Invitations by number: the 20261030130000_phone_key bodies (the match by key), with the end as the boundary.
create or replace function private.check_invited_number(p_code text, p_phone text) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_inv private.phone_invitations; v_count int;
begin
 if p_code is null or p_code !~ '^[A-Za-z0-9_-]{22}$' then return false; end if;
 select i.* into v_inv from private.phone_invitations i join public.plans p on p.id=i.plan_id
  where i.code_hash=extensions.digest(p_code,'sha256') and i.revoked_at is null
   and p.owner_id is not null and p.status='active' and private.plan_end(p.starts_at,p.ends_at)>now();
 if not found then return false; end if;
 update private.phone_invitations set
  check_count=case when check_window is null or check_window<=now()-interval '1 hour' then 1 else check_count+1 end,
  check_window=case when check_window is null or check_window<=now()-interval '1 hour' then now() else check_window end
  where id=v_inv.id and (check_window is null or check_window<=now()-interval '1 hour' or check_count<10)
  returning check_count into v_count;
 if v_count is null then raise exception 'Too many tries. Try again later.' using errcode='22023'; end if;
 return private.phone_key(p_phone)=v_inv.phone;
end $$;

create or replace function private.answer_phone_invitation(p_code text, p_name text, p_response text, p_terms_version text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_inv private.phone_invitations; v_plan public.plans; v_has_profile boolean; v_att public.attendees; v_next integer;
begin
 if v_uid is null then raise exception 'Sign-in required' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text,47));
 if p_code is null or p_code !~ '^[A-Za-z0-9_-]{22}$' then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 select * into v_inv from private.phone_invitations where code_hash=extensions.digest(p_code,'sha256') and revoked_at is null;
 if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 if not exists(select 1 from auth.users u where u.id=v_uid and u.phone_confirmed_at is not null
  and private.phone_key(u.phone)=v_inv.phone and not coalesce(u.is_anonymous,false)
  and (u.banned_until is null or u.banned_until<=now())) or private.deletion_pending(v_uid) then
  raise exception 'That isn''t the invited number.' using errcode='42501';
 end if;
 select * into v_plan from public.plans where id=v_inv.plan_id for update;
 if not found or v_plan.owner_id is null or v_plan.status<>'active' or private.plan_end(v_plan.starts_at,v_plan.ends_at)<=now() or v_plan.owner_id=v_uid
 or not private.user_eligible(v_plan.owner_id) then
  raise exception 'Invitation unavailable' using errcode='42501';
 end if;
 -- Read again under the plan lock: revoking an invitation takes the same lock through its owner checks.
 select * into v_inv from private.phone_invitations where id=v_inv.id and revoked_at is null;
 if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 if v_inv.user_id is not null and v_inv.user_id<>v_uid then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 if exists(select 1 from private.beta_access where user_id=v_uid and revoked_at is not null) then
  raise exception 'Invitation unavailable' using errcode='42501';
 end if;
 if exists(select 1 from auth.users u where u.id=v_uid
  and exists(select 1 from private.tester_roster r where r.email = lower(u.email) and not r.enabled)) then
  raise exception 'Invitation unavailable' using errcode='42501';
 end if;
 if p_response is null or p_response not in ('accepted','maybe','declined') then raise exception 'Invalid response' using errcode='22023'; end if;
 if not exists(select 1 from private.age_attestations where user_id=v_uid) then
  if p_terms_version is null or p_terms_version !~ '^[0-9]{4}-[0-9]{2}$' then
   raise exception 'Age confirmation required' using errcode='22023';
  end if;
  insert into private.age_attestations(user_id,terms_version) values(v_uid,p_terms_version);
 end if;
 v_has_profile := exists(select 1 from public.profiles where id=v_uid);
 if not v_has_profile then
  if coalesce(char_length(btrim(p_name)),0) not between 1 and 80 then raise exception 'Name required' using errcode='22023'; end if;
  insert into public.profiles(id,display_name) values(v_uid,btrim(p_name));
 end if;
 insert into private.beta_access(user_id,source) values(v_uid,'invitation') on conflict (user_id) do nothing;
 select * into v_att from public.attendees where plan_id=v_plan.id and user_id=v_uid for update;
 if v_att.user_id is null then
  insert into public.attendees(plan_id,user_id,response) values(v_plan.id,v_uid,p_response) returning * into v_att;
 else
  -- The same answer again changes nothing, as respond.
  if v_att.response<>p_response then
   update public.attendees set response=p_response,version=version+1,updated_at=now()
    where plan_id=v_plan.id and user_id=v_uid returning * into v_att;
  else
   update private.phone_invitations set user_id=v_uid, answered_at=coalesce(answered_at,now()) where id=v_inv.id;
   return jsonb_build_object('response',p_response,'plan_id',v_plan.id);
  end if;
 end if;
 update private.phone_invitations set user_id=v_uid, answered_at=now() where id=v_inv.id;
 if p_response='declined' then delete from public.plan_admins where plan_id=v_plan.id and user_id=v_uid; end if;
 insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id,detail)
  select v_plan.id,h,'rsvp','rsvp:'||v_plan.id||':'||v_uid||':'||v_att.version||case when h=v_plan.owner_id then '' else ':'||h end,v_uid,p_response from private.host_ids(v_plan.id) h where h<>v_uid on conflict do nothing;
 return jsonb_build_object('response',p_response,'plan_id',v_plan.id);
end $$;

-- The event link and requests to join.
create or replace function private.claim_plan_link(p_code text) returns uuid language plpgsql security definer set search_path = '' as $$
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
 if v_plan.status<>'active' or private.plan_end(v_plan.starts_at,v_plan.ends_at)<=now() then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 perform private.request_join(v_uid,v_link,v_plan,'pending');
 return v_plan.id;
end $$;

create or replace function private.join_by_link(p_code text,p_name text,p_terms_version text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_link private.plan_links; v_plan public.plans; v_has_profile boolean;
begin
 if v_uid is null then raise exception 'Sign-in required' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text,47));
 if not exists(select 1 from auth.users u where u.id=v_uid and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)
  and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<=now()))
 or private.deletion_pending(v_uid) then
  raise exception 'Sign-in required' using errcode='42501';
 end if;
 if exists(select 1 from private.beta_access where user_id=v_uid and revoked_at is not null) then
  raise exception 'Invitation unavailable' using errcode='42501';
 end if;
 if private.eligible() then return private.claim_plan_link(p_code); end if;
 if exists(select 1 from auth.users u where u.id=v_uid
  and exists(select 1 from private.tester_roster r where r.email = lower(u.email) and not r.enabled)) then
  raise exception 'Invitation unavailable' using errcode='42501';
 end if;
 if p_code is null or p_code !~ '^[A-Za-z0-9_-]{22}$' then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 select * into v_link from private.plan_links where code=p_code and revoked_at is null;
 if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 select * into v_plan from public.plans where id=v_link.plan_id for update;
 -- A link grants access only while its organizer may use the app themselves.
 if not found or v_plan.owner_id is null or v_plan.status<>'active' or private.plan_end(v_plan.starts_at,v_plan.ends_at)<=now()
 or not private.user_eligible(v_plan.owner_id) then
  raise exception 'Invitation unavailable' using errcode='42501';
 end if;
 -- Read again under the plan lock: rotate_plan_link holds the same lock while it turns the link off.
 perform 1 from private.plan_links where id=v_link.id and revoked_at is null;
 if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 -- Defensive: the organizer check above already refuses this unless the roster changed after eligible().
 if v_plan.owner_id=v_uid then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 v_has_profile := exists(select 1 from public.profiles where id=v_uid);
 if not v_has_profile and coalesce(char_length(btrim(p_name)),0) not between 1 and 80 then
  raise exception 'Name required' using errcode='22023';
 end if;
 if not exists(select 1 from private.age_attestations where user_id=v_uid) then
  if p_terms_version is null or p_terms_version !~ '^[0-9]{4}-[0-9]{2}$' then
   raise exception 'Age confirmation required' using errcode='22023';
  end if;
  insert into private.age_attestations(user_id,terms_version) values(v_uid,p_terms_version);
 end if;
 if not v_has_profile then insert into public.profiles(id,display_name) values(v_uid,btrim(p_name)); end if;
 perform private.request_join(v_uid,v_link,v_plan,'pending');
 return v_plan.id;
end $$;

create or replace function private.request_to_join(p_code text, p_name text, p_response text, p_terms_version text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_link private.plan_links; v_plan public.plans;
begin
 if v_uid is null then raise exception 'Sign-in required' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text,47));
 if not exists(select 1 from auth.users u where u.id=v_uid and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)
  and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<=now()))
 or private.deletion_pending(v_uid) then
  raise exception 'Sign-in required' using errcode='42501';
 end if;
 if exists(select 1 from private.beta_access where user_id=v_uid and revoked_at is not null) then
  raise exception 'Invitation unavailable' using errcode='42501';
 end if;
 if exists(select 1 from auth.users u where u.id=v_uid
  and exists(select 1 from private.tester_roster r where r.email = lower(u.email) and not r.enabled)) then
  raise exception 'Invitation unavailable' using errcode='42501';
 end if;
 if p_code is null or p_code !~ '^[A-Za-z0-9_-]{22}$' then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 select * into v_link from private.plan_links where code=p_code;
 if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 select * into v_plan from public.plans where id=v_link.plan_id for update;
 if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 if v_plan.owner_id=v_uid or exists(select 1 from public.attendees where plan_id=v_plan.id and user_id=v_uid) then
  return private.request_join(v_uid,v_link,v_plan,p_response);
 end if;
 -- Read again under the plan lock: rotate_plan_link holds the same lock while it turns the link off.
 perform 1 from private.plan_links where id=v_link.id and revoked_at is null;
 if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 if v_plan.owner_id is null or v_plan.status<>'active' or private.plan_end(v_plan.starts_at,v_plan.ends_at)<=now() or not private.user_eligible(v_plan.owner_id) then
  raise exception 'Invitation unavailable' using errcode='42501';
 end if;
 if p_response is null or p_response not in ('pending','accepted','maybe','declined') then raise exception 'Invalid response' using errcode='22023'; end if;
 if not private.eligible() and not exists(select 1 from private.age_attestations where user_id=v_uid) then
  if p_terms_version is null or p_terms_version !~ '^[0-9]{4}-[0-9]{2}$' then
   raise exception 'Age confirmation required' using errcode='22023';
  end if;
  insert into private.age_attestations(user_id,terms_version) values(v_uid,p_terms_version);
 end if;
 if not exists(select 1 from public.profiles where id=v_uid) then
  if coalesce(char_length(btrim(p_name)),0) not between 1 and 80 then raise exception 'Name required' using errcode='22023'; end if;
  insert into public.profiles(id,display_name) values(v_uid,btrim(p_name));
 end if;
 return private.request_join(v_uid,v_link,v_plan,p_response);
end $$;

-- The waiting screens follow the end too.
create or replace function private.my_join_requests() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
 if v_uid is null then raise exception 'Sign-in required' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('plan_id',p.id,'title',p.title,'starts_at',p.starts_at,'ends_at',p.ends_at,
   'time_zone',p.time_zone,'host',(select display_name from public.profiles where id=p.owner_id),'area',p.area,
   'image',case when p.cover_path is not null then jsonb_build_object('kind','cover','ref',p.cover_path)
    when p.activity_id is not null then jsonb_build_object('kind','activity','ref',p.activity_id)
    else jsonb_build_object('kind','mark','ref','') end,
   'response',j.response,'status',j.status) order by p.starts_at,p.id)
  from private.join_requests j join public.plans p on p.id=j.plan_id
  where j.user_id=v_uid and j.status in ('waiting','declined') and p.owner_id is not null and p.status='active' and private.plan_end(p.starts_at,p.ends_at)>now()
   and not exists(select 1 from public.attendees a where a.plan_id=p.id and a.user_id=v_uid)),'[]'::jsonb);
end $$;

create or replace function private.change_join_answer(p_plan uuid, p_response text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
 if v_uid is null then raise exception 'Sign-in required' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text,47));
 if p_response is null or p_response not in ('pending','accepted','maybe','declined') then raise exception 'Invalid response' using errcode='22023'; end if;
 if not exists(select 1 from private.join_requests where plan_id=p_plan and user_id=v_uid and status='waiting')
 or exists(select 1 from public.attendees where plan_id=p_plan and user_id=v_uid) then
  raise exception 'Request already decided' using errcode='22023';
 end if;
 if not exists(select 1 from public.plans where id=p_plan and status='active' and private.plan_end(starts_at,ends_at)>now()) then
  raise exception 'Invitation unavailable' using errcode='42501';
 end if;
 update private.join_requests set response=p_response where plan_id=p_plan and user_id=v_uid and status='waiting';
 if not found then raise exception 'Request already decided' using errcode='22023'; end if;
 return jsonb_build_object('status','waiting','response',p_response);
end $$;

-- The waiting list is empty from the end.
create or replace function private.plan_join_requests(p_plan uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester();
begin
 if not private.is_host(p_plan,v_uid) then raise exception 'Plan owner required' using errcode='42501'; end if;
 if not exists(select 1 from public.plans where id=p_plan and status='active' and private.plan_end(starts_at,ends_at)>now()) then return '[]'::jsonb; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('user_id',j.user_id,'name',(select display_name from public.profiles where id=j.user_id),
   'response',j.response,'ending',(select nullif(right(u.phone,2),'') from auth.users u where u.id=j.user_id),'created_at',j.created_at)
   order by j.created_at,j.user_id)
  from private.join_requests j where j.plan_id=p_plan and j.status='waiting'
   and not exists(select 1 from public.attendees a where a.plan_id=j.plan_id and a.user_id=j.user_id)
   and not private.deletion_pending(j.user_id)),'[]'::jsonb);
end $$;

-- notification_recipient_eligible is redefined at the end of section 4: it reads plans.series_id and plan_mutes.

-- The two upload policies of the plan-covers bucket, open until the end instead of the start, to any host: the object
-- stays in the owner's folder (the first path segment is the plan's owner), the uploader is the owner or an admin.
-- (resbite_cover_read is widened in section 5, for the next occurrence of a repeating resbite.)
drop policy resbite_cover_insert on storage.objects;
drop policy resbite_cover_update on storage.objects;
create policy resbite_cover_insert on storage.objects for insert to authenticated with check (
 bucket_id='plan-covers' and (select private.eligible())
 and exists(select 1 from public.plans p where p.id::text=(storage.foldername(name))[2]
  and p.owner_id::text=(storage.foldername(name))[1]
  and (p.owner_id=(select auth.uid()) or exists(select 1 from public.plan_admins pa where pa.plan_id=p.id and pa.user_id=(select auth.uid())))
  and p.status='active' and private.plan_end(p.starts_at,p.ends_at)>now())
);
create policy resbite_cover_update on storage.objects for update to authenticated using (
 bucket_id='plan-covers' and (select private.eligible())
 and exists(select 1 from public.plans p where p.id::text=(storage.foldername(name))[2]
  and p.owner_id::text=(storage.foldername(name))[1]
  and (p.owner_id=(select auth.uid()) or exists(select 1 from public.plan_admins pa where pa.plan_id=p.id and pa.user_id=(select auth.uid())))
  and p.status='active' and private.plan_end(p.starts_at,p.ends_at)>now())
) with check (
 bucket_id='plan-covers' and (select private.eligible())
 and exists(select 1 from public.plans p where p.id::text=(storage.foldername(name))[2]
  and p.owner_id::text=(storage.foldername(name))[1]
  and (p.owner_id=(select auth.uid()) or exists(select 1 from public.plan_admins pa where pa.plan_id=p.id and pa.user_id=(select auth.uid())))
  and p.status='active' and private.plan_end(p.starts_at,p.ends_at)>now())
);

-- 2. Admins
-- CR-D8, CR-D15, CR-P15, CR-P17: the owner appoints Going guests who use the app as admins. An admin does everything a
-- host does except appoint or remove admins, or remove the owner. The table and the helpers private.is_host /
-- private.host_ids are at the top of this file (section 1 refers to them); the owner checks they widen are edited in
-- place in section 1 (change_plan_v3, require_link_owner, respond, claim_invite, answer_phone_invitation, the cover
-- setters, plan_join_requests and the two storage policies), at the end of section 4 (notification_recipient_eligible)
-- and below (can_see_guests, can_read_meeting_details, plan_phone_invitations, remove_guest, invite_contacts,
-- set_guest_note, request_join). Host notices go to every host but the actor, one row each. The recipient id ends the
-- dedupe key of an admin's row; the owner's row keeps the key it always had, so existing keys and their tests are
-- unchanged.

-- The outbox: 'admin_added' (to the new admin, the owner as actor), with a null detail like the other plain kinds; and
-- (section 5) 'invited' with the detail 'again', the invitation to a repeating resbite's next occurrence.
-- The checks are replaced by exact name, keeping every existing value.
alter table private.notification_outbox drop constraint notification_outbox_kind_check;
alter table private.notification_outbox add constraint notification_outbox_kind_check
 check (kind in ('invitation','rsvp','plan_changed','plan_cancelled','guest_note','invited','join_request','join_approved','admin_added'));
alter table private.notification_outbox drop constraint notification_outbox_detail_check;
alter table private.notification_outbox add constraint notification_outbox_detail_check check (
 detail is null
 or (kind='plan_changed' and detail in ('time','place','time_place'))
 or (kind='rsvp' and detail in ('accepted','maybe','declined','withdrawn'))
 or (kind='invited' and detail='again'));

-- The owner appoints a guest who is going and uses the app (an admin hosts from the app); asking again changes nothing
-- and tells nobody twice.
create function private.appoint_admin(p_plan uuid, p_user uuid) returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_plan public.plans; v_added integer;
begin
 select * into v_plan from public.plans where id=p_plan for update;
 if not found or v_plan.owner_id<>v_uid or v_plan.status<>'active' or private.plan_end(v_plan.starts_at,v_plan.ends_at)<=now() then
  raise exception 'Owner required' using errcode='42501';
 end if;
 if p_user is null or not exists(select 1 from public.attendees where plan_id=p_plan and user_id=p_user and response='accepted') then
  raise exception 'Only a guest who is going can be an admin' using errcode='22023';
 end if;
 if not private.used_app(p_user) then raise exception 'Only a guest who uses the app can be an admin' using errcode='22023'; end if;
 insert into public.plan_admins(plan_id,user_id,appointed_by) values(p_plan,p_user,v_uid) on conflict do nothing;
 get diagnostics v_added = row_count;
 if v_added=1 then
  insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id,detail)
  values(p_plan,p_user,'admin_added','admin:'||p_plan||':'||p_user||':'||extract(epoch from now())::bigint,v_uid,null) on conflict do nothing;
 end if;
end $$;
-- The owner takes the role back; the guest stays on the event and is told nothing.
create function private.remove_admin(p_plan uuid, p_user uuid) returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester();
begin
 perform 1 from public.plans where id=p_plan and owner_id=v_uid for update;
 if not found then raise exception 'Owner required' using errcode='42501'; end if;
 delete from public.plan_admins where plan_id=p_plan and user_id=p_user;
end $$;
create function public.appoint_admin(p_plan uuid, p_user uuid) returns void language sql security invoker set search_path = '' as $$
 select private.appoint_admin(p_plan,p_user)
$$;
create function public.remove_admin(p_plan uuid, p_user uuid) returns void language sql security invoker set search_path = '' as $$
 select private.remove_admin(p_plan,p_user)
$$;
revoke all on function private.appoint_admin(uuid,uuid), public.appoint_admin(uuid,uuid), private.remove_admin(uuid,uuid), public.remove_admin(uuid,uuid)
 from public, anon, authenticated, service_role;
grant execute on function private.appoint_admin(uuid,uuid), public.appoint_admin(uuid,uuid), private.remove_admin(uuid,uuid), public.remove_admin(uuid,uuid) to authenticated;

-- What a host sees. An admin's own reply may be pending (on a rolled occurrence every guest starts pending, its admins
-- included), yet a host sees the guests and the meeting details, which the editor reads and saves back. The
-- 20261014120000_ux2_rules and 20261015120000_ux3_event_details bodies, with a plan_admins row admitted beside the
-- owner. attendee_read, plan_admins_read, can_read_profile and meeting_details_read call them; their grants are kept.
create or replace function private.can_see_guests(p_plan uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select private.eligible() and exists(select 1 from public.plans p where p.id=p_plan and (p.owner_id=auth.uid()
  or exists(select 1 from public.plan_admins pa where pa.plan_id=p.id and pa.user_id=auth.uid())
  or exists(select 1 from public.attendees a where a.plan_id=p.id and a.user_id=auth.uid() and a.response<>'pending')))
$$;
create or replace function private.can_read_meeting_details(p_plan uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select private.eligible() and exists(select 1 from public.plans p where p.id=p_plan and (p.owner_id=auth.uid()
  or exists(select 1 from public.plan_admins pa where pa.plan_id=p.id and pa.user_id=auth.uid())
  or exists(select 1 from public.attendees a where a.plan_id=p.id and a.user_id=auth.uid() and a.response in ('accepted','maybe'))))
$$;

-- The host's list of invitations: the 20261028120000_contact_invitations body, for any host.
create or replace function private.plan_phone_invitations(p_plan uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester();
begin
 if not private.is_host(p_plan,v_uid) then raise exception 'Plan owner required' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('phone',i.phone,'country',i.country,'answered',i.answered_at is not null,
   'response',(select a.response from public.attendees a where a.plan_id=i.plan_id and a.user_id=i.user_id)) order by i.created_at,i.phone)
  from private.phone_invitations i where i.plan_id=p_plan and i.revoked_at is null),'[]'::jsonb);
end $$;

-- Removing a guest who is an admin ends the admin role too. The 20261028120000_contact_invitations body, plus that.
-- Nobody removes the organizer: the organizer asking is invalid (22023, as before), an admin asking is refused (42501).
-- Only the owner removes another admin; an admin may remove themself.
create or replace function private.remove_guest(p_plan uuid,p_user uuid) returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid; v_owner uuid;
begin
 v_uid := private.require_link_owner(p_plan);
 select owner_id into v_owner from public.plans where id=p_plan;
 if p_user=v_owner then
  if v_uid=v_owner then raise exception 'The organizer cannot be removed' using errcode='22023'; end if;
  raise exception 'The organizer cannot be removed' using errcode='42501';
 end if;
 if p_user<>v_uid and v_uid is distinct from v_owner and exists(select 1 from public.plan_admins where plan_id=p_plan and user_id=p_user) then
  raise exception 'Owner required' using errcode='42501';
 end if;
 update private.invitations set revoked_at=now() where plan_id=p_plan and claimed_by=p_user and revoked_at is null;
 update private.phone_invitations set revoked_at=now(), code_hash=null where plan_id=p_plan and user_id=p_user;
 delete from public.plan_admins where plan_id=p_plan and user_id=p_user;
 delete from public.attendees where plan_id=p_plan and user_id=p_user;
end $$;

-- Inviting by number, for any host (require_link_owner admits the admins). The 20261030130000_phone_key body (numbers matched by key);
-- 'self' still means the caller's own number, so when an admin invites the organizer's number it is 'already' (the
-- organizer is on the event as its host): no attendee row, no notice.
create or replace function private.invite_contacts(p_plan uuid, p_invites jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_link_owner(p_plan); v_item jsonb; v_phone text; v_country text; v_code text; v_holder uuid;
 v_kind text; v_out jsonb := '[]'::jsonb;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text,47));
 if jsonb_typeof(p_invites) is distinct from 'array' or jsonb_array_length(p_invites)>50 then
  raise exception 'Invalid invitations' using errcode='22023';
 end if;
 -- The kind of each item tells the host who is On Resbite, so invitations spend the same daily budget as lookups.
 perform private.charge_lookup(v_uid,jsonb_array_length(p_invites));
 for v_item in select value from jsonb_array_elements(p_invites) loop
  if jsonb_typeof(v_item) is distinct from 'object' or jsonb_typeof(v_item->'phone') is distinct from 'string'
   or jsonb_typeof(v_item->'country') is distinct from 'string' or jsonb_typeof(v_item->'code') is distinct from 'string' then
   raise exception 'Invalid invitation' using errcode='22023';
  end if;
  v_phone := private.phone_key(v_item->>'phone');
  v_country := v_item->>'country';
  v_code := v_item->>'code';
  if v_phone !~ '^[1-9][0-9]{6,14}$' or v_country !~ '^[1-9][0-9]{0,2}$' or v_code !~ '^[A-Za-z0-9_-]{22}$' then
   raise exception 'Invalid invitation' using errcode='22023';
  end if;
  select id into v_holder from auth.users where phone = any(private.phone_variants(v_phone)) and phone_confirmed_at is not null
   order by id = v_uid desc, phone <> v_phone desc limit 1;
  if v_holder=v_uid or (v_holder is null and v_phone=(select private.phone_key(phone) from auth.users where id=v_uid)) then
   v_kind := 'self';
  elsif v_holder is not null and (v_holder=(select owner_id from public.plans where id=p_plan)
   or exists(select 1 from public.attendees where plan_id=p_plan and user_id=v_holder)) then
   v_kind := 'already';
  elsif v_holder is not null and private.user_eligible(v_holder) and private.used_app(v_holder)
   and exists(select 1 from public.profiles where id=v_holder) then
   v_kind := 'app';
   insert into public.attendees(plan_id,user_id) values(p_plan,v_holder) on conflict do nothing;
   insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id)
    values(p_plan,v_holder,'invited','invited:'||p_plan||':'||v_holder,v_uid) on conflict do nothing;
   update private.phone_invitations set revoked_at=now(), code_hash=null
    where plan_id=p_plan and phone=v_phone and revoked_at is null;
  else
   v_kind := 'link';
   insert into private.phone_invitations(plan_id,phone,country,code_hash,invited_by)
    values(p_plan,v_phone,v_country,extensions.digest(v_code,'sha256'),v_uid)
    on conflict (plan_id,phone) do update set country=excluded.country, code_hash=excluded.code_hash, revoked_at=null,
     user_id=case when private.phone_invitations.revoked_at is null then private.phone_invitations.user_id end,
     answered_at=case when private.phone_invitations.revoked_at is null then private.phone_invitations.answered_at end;
  end if;
  v_out := v_out || jsonb_build_array(jsonb_build_object('phone',private.phone_digits(v_item->>'phone'),'kind',v_kind));
 end loop;
 return v_out;
end $$;

-- The note to guests: any host posts it. The 20261015120000_ux3_event_details body; the notice goes to each guest who may
-- come and to each host, but not to the one posting.
create or replace function private.set_guest_note(p_plan uuid,p_note text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_plan public.plans; v_text text := btrim(coalesce(p_note,'')); v_at timestamptz;
begin
 if char_length(v_text)>280 then raise exception 'Note too long' using errcode='22023'; end if;
 select * into v_plan from public.plans where id=p_plan for update;
 if not found or not private.is_host(p_plan,v_uid) then raise exception 'Owner required' using errcode='42501'; end if;
 if v_plan.status<>'active' or now()>=coalesce(v_plan.ends_at,v_plan.starts_at+interval '1 hour') then
  raise exception 'Plan unavailable' using errcode='22023';
 end if;
 if v_text=v_plan.guest_note then
  return jsonb_build_object('guest_note',v_plan.guest_note,'guest_note_at',v_plan.guest_note_at);
 end if;
 v_at := case when v_text='' then null else pg_catalog.clock_timestamp() end;
 update public.plans set guest_note=v_text,guest_note_at=v_at where id=p_plan;
 if v_text<>'' then
  insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id)
  select p_plan,r.id,'guest_note','note:'||p_plan||':'||pg_catalog.to_char(v_at,'YYYYMMDDHH24MISSUS')||':'||r.id,v_uid
  from (select a.user_id as id from public.attendees a where a.plan_id=p_plan and a.response in ('accepted','maybe','pending')
   union select h from private.host_ids(p_plan) h) r
  where r.id<>v_uid
  on conflict do nothing;
 end if;
 return jsonb_build_object('guest_note',v_text,'guest_note_at',v_at);
end $$;

-- A request to join tells every host. The 20261029120000_open_link_approval body, only the notice changed.
create or replace function private.request_join(p_uid uuid, p_link private.plan_links, p_plan public.plans, p_response text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_resp text; v_req private.join_requests; v_created timestamptz;
begin
 if p_plan.owner_id=p_uid then return jsonb_build_object('state','owner','plan_id',p_plan.id,'response',null); end if;
 select response into v_resp from public.attendees where plan_id=p_plan.id and user_id=p_uid;
 if found then return jsonb_build_object('state','already','plan_id',p_plan.id,'response',v_resp); end if;
 select * into v_req from private.join_requests where plan_id=p_plan.id and user_id=p_uid for update;
 if found and v_req.status='declined' and v_req.plan_link_id is not distinct from p_link.id then
  return jsonb_build_object('state','declined','plan_id',p_plan.id,'response',v_req.response);
 end if;
 if found and v_req.status='waiting' then
  update private.join_requests set response=case when p_response='pending' then response else p_response end, plan_link_id=p_link.id
   where plan_id=p_plan.id and user_id=p_uid returning response into v_resp;
  return jsonb_build_object('state','waiting','plan_id',p_plan.id,'response',v_resp);
 end if;
 if found then
  update private.join_requests set response=case when p_response='pending' then response else p_response end,
   plan_link_id=p_link.id, status='waiting', created_at=now(), decided_at=null
   where plan_id=p_plan.id and user_id=p_uid returning created_at, response into v_created, v_resp;
 else
  insert into private.join_requests(plan_id,user_id,plan_link_id,response) values(p_plan.id,p_uid,p_link.id,p_response)
   returning created_at, response into v_created, v_resp;
 end if;
 insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id)
  select p_plan.id,h,'join_request',
   'join:'||p_plan.id||':'||p_uid||':'||coalesce(p_link.id::text,'')||':'||extract(epoch from v_created)||case when h=p_plan.owner_id then '' else ':'||h end,p_uid
  from private.host_ids(p_plan.id) h where h<>p_uid on conflict do nothing;
 return jsonb_build_object('state','waiting','plan_id',p_plan.id,'response',v_resp);
end $$;

-- 3. Plans v4
-- CR-D6 (the end is required), CR-P9 (To be decided is a stored flag), CR-D16 / CR-P23 / P25 / P26 (the repeat rule),
-- CR-D15 (hosts cancel), CR-P17 (a change by an admin is also told to the owner and the other admins, never to whoever
-- made it), CR-P18 (the people told of a new time or place are the guests who are Going, Maybe or have not answered).
-- v3 stays as section 1 left it so the current build keeps working.
alter table public.plans add column place_tbd boolean not null default false;
alter table public.plans add column repeat_weeks smallint check (repeat_weeks in (1, 2));
alter table public.plans add column series_id uuid;
update public.plans set series_id = id;
alter table public.plans alter column series_id set not null;
create index plans_series_idx on public.plans(series_id);
-- A plan made by v3 (or any insert that names no series) starts its own series.
create function private.plans_default_series() returns trigger language plpgsql set search_path = '' as $$
begin
 new.series_id := coalesce(new.series_id,new.id);
 return new;
end $$;
revoke all on function private.plans_default_series() from public, anon, authenticated, service_role;
create trigger plans_default_series before insert on public.plans for each row execute function private.plans_default_series();
alter table public.plans add column repeats_from uuid references public.plans(id);
create unique index plans_repeats_from_key on public.plans(repeats_from);
-- To be decided is the whole place: no other label, no coordinates. The old build (change_plan_v3) clears the flag when it saves a place.
alter table public.plans add constraint plans_place_tbd_valid check (not place_tbd or (place_label = 'To be decided' and latitude is null and longitude is null));

create function private.create_plan_v4(p_id uuid,p_title text,p_description text,p_categories text[],p_activity text,p_start timestamptz,p_ends timestamptz,p_zone text,p_place text,p_place_tbd boolean,p_repeat_weeks smallint,p_note text default '',p_lat double precision default null,p_lon double precision default null,p_area text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_existing public.plans; v_tbd boolean := coalesce(p_place_tbd,false);
 v_label text := case when coalesce(p_place_tbd,false) then 'To be decided' else btrim(p_place) end;
begin
 -- Serialize repeated creation IDs; a retry must match the original payload exactly.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text,0));
 select * into v_existing from public.plans where id=p_id;
 if found then
  if v_existing.owner_id is distinct from v_uid or v_existing.title is distinct from btrim(p_title)
  or v_existing.description is distinct from coalesce(p_description,'') or v_existing.categories is distinct from p_categories
  or v_existing.activity_id is distinct from p_activity or v_existing.starts_at is distinct from p_start
  or v_existing.ends_at is distinct from p_ends
  or v_existing.time_zone is distinct from p_zone or v_existing.place_label is distinct from v_label
  or v_existing.place_tbd is distinct from v_tbd or v_existing.repeat_weeks is distinct from p_repeat_weeks
  or coalesce((select note from public.plan_meeting_details where plan_id=p_id),'') is distinct from coalesce(p_note,'')
  or v_existing.area is distinct from coalesce(btrim(p_area),'')
  or v_existing.latitude is distinct from (case when v_tbd then null else p_lat end)
  or v_existing.longitude is distinct from (case when v_tbd then null else p_lon end) then
   raise exception 'Creation identifier already used' using errcode='22023';
  end if;
  return p_id;
 end if;
 if p_title is null or p_categories is null then raise exception 'Title and categories required' using errcode='23502'; end if;
 if p_start is null or p_start<=now() or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_zone) then raise exception 'Invalid future schedule' using errcode='22023'; end if;
 if p_ends is null then raise exception 'End time required' using errcode='22023'; end if;
 if p_ends<=p_start or p_ends>p_start+interval '48 hours' then raise exception 'Invalid end time' using errcode='22023'; end if;
 if p_repeat_weeks is not null and p_repeat_weeks not in (1,2) then raise exception 'Invalid repeat' using errcode='22023'; end if;
 if p_activity is not null and not exists(select 1 from public.activities where id=p_activity and published) then raise exception 'Activity unavailable' using errcode='22023'; end if;
 insert into public.plans(id,owner_id,activity_id,title,description,categories,starts_at,ends_at,time_zone,place_label,place_tbd,latitude,longitude,area,repeat_weeks,series_id)
 values(p_id,v_uid,p_activity,btrim(p_title),coalesce(p_description,''),p_categories,p_start,p_ends,p_zone,v_label,v_tbd,
  case when v_tbd then null else p_lat end,case when v_tbd then null else p_lon end,coalesce(btrim(p_area),''),p_repeat_weeks,p_id);
 perform private.write_meeting_details(p_id,coalesce(p_note,''));
 return p_id;
end $$;

create function private.change_plan_v4(p_plan uuid,p_version integer,p_title text,p_description text,p_categories text[],p_start timestamptz,p_ends timestamptz,p_zone text,p_place text,p_place_tbd boolean,p_repeat_weeks smallint,p_note text,p_area text,p_cancel boolean default false,p_stop_repeating boolean default false)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_plan public.plans; v_next integer; v_cancel boolean := coalesce(p_cancel,false);
 v_time boolean; v_place boolean; v_tbd boolean := coalesce(p_place_tbd,false);
begin
 select * into v_plan from public.plans where id=p_plan for update;
 if not found or not private.is_host(p_plan,v_uid) then raise exception 'Host required' using errcode='42501'; end if;
 if v_plan.status<>'active' or private.plan_end(v_plan.starts_at,v_plan.ends_at)<=now() then raise exception 'Plan unavailable' using errcode='22023'; end if;
 if p_version is distinct from v_plan.version then raise exception 'Plan changed; refresh' using errcode='40001'; end if;
 v_next := v_plan.version+1;
 if v_cancel then
  -- Terminal; the other arguments are ignored. The repeat ends with it when asked to.
  update public.plans set status='cancelled',version=v_next,repeat_weeks=case when coalesce(p_stop_repeating,false) then null else repeat_weeks end where id=p_plan;
  update private.invitations set revoked_at=now() where plan_id=p_plan and revoked_at is null;
  insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id)
  select p_plan,r.id,'plan_cancelled','plan:'||p_plan||':'||v_next||':'||r.id,v_uid
  from (select a.user_id as id from public.attendees a where a.plan_id=p_plan union select h from private.host_ids(p_plan) h) r
  where r.id<>v_uid on conflict do nothing;
 else
  if p_start is null or (p_start<=now() and p_start is distinct from v_plan.starts_at) or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_zone) then raise exception 'Invalid future schedule' using errcode='22023'; end if;
  if p_ends is null then raise exception 'End time required' using errcode='22023'; end if;
  if p_ends<=now() then raise exception 'Plan unavailable' using errcode='22023'; end if;
  if p_ends<=p_start or p_ends>p_start+interval '48 hours' then raise exception 'Invalid end time' using errcode='22023'; end if;
  if p_repeat_weeks is not null and p_repeat_weeks not in (1,2) then raise exception 'Invalid repeat' using errcode='22023'; end if;
  -- A zone change at the same instant moves the shown time, and a new end changes when it finishes, so both count as a time change; choosing or dropping To be decided for the place.
  v_time := p_start is distinct from v_plan.starts_at or p_zone is distinct from v_plan.time_zone or p_ends is distinct from v_plan.ends_at;
  v_place := v_tbd is distinct from v_plan.place_tbd or (not v_tbd and btrim(p_place) is distinct from v_plan.place_label);
  update public.plans set title=btrim(p_title),description=coalesce(p_description,''),categories=p_categories,
   starts_at=p_start,ends_at=p_ends,time_zone=p_zone,place_label=case when v_tbd then 'To be decided' else btrim(p_place) end,place_tbd=v_tbd,
   latitude=null,longitude=null,repeat_weeks=p_repeat_weeks,version=v_next,
   area=case when p_area is null then v_plan.area else btrim(p_area) end
  where id=p_plan;
  -- A null note leaves the meeting details as they are (as change_plan_v2 keeps them for an old build); an empty one
  -- removes them.
  if p_note is not null then perform private.write_meeting_details(p_plan,p_note); end if;
  if v_time or v_place then
   insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id,detail)
   select p_plan,r.id,'plan_changed','plan:'||p_plan||':'||v_next||':'||r.id,v_uid,
    case when v_time and v_place then 'time_place' when v_time then 'time' else 'place' end
   from (select a.user_id as id from public.attendees a where a.plan_id=p_plan and a.response in ('accepted','maybe','pending')
    union select h from private.host_ids(p_plan) h) r
   where r.id<>v_uid on conflict do nothing;
  end if;
 end if;
 return v_next;
end $$;

create function public.create_plan_v4(p_id uuid,p_title text,p_description text,p_categories text[],p_activity text,p_start timestamptz,p_ends timestamptz,p_zone text,p_place text,p_place_tbd boolean,p_repeat_weeks smallint,p_note text default '',p_lat double precision default null,p_lon double precision default null,p_area text default null)
returns uuid language sql security invoker set search_path='' as $$
 select private.create_plan_v4(p_id,p_title,p_description,p_categories,p_activity,p_start,p_ends,p_zone,p_place,p_place_tbd,p_repeat_weeks,p_note,p_lat,p_lon,p_area)
$$;
create function public.change_plan_v4(p_plan uuid,p_version integer,p_title text,p_description text,p_categories text[],p_start timestamptz,p_ends timestamptz,p_zone text,p_place text,p_place_tbd boolean,p_repeat_weeks smallint,p_note text,p_area text,p_cancel boolean default false,p_stop_repeating boolean default false)
returns integer language sql security invoker set search_path='' as $$
 select private.change_plan_v4(p_plan,p_version,p_title,p_description,p_categories,p_start,p_ends,p_zone,p_place,p_place_tbd,p_repeat_weeks,p_note,p_area,p_cancel,p_stop_repeating)
$$;
revoke all on function
 private.create_plan_v4(uuid,text,text,text[],text,timestamptz,timestamptz,text,text,boolean,smallint,text,double precision,double precision,text),
 public.create_plan_v4(uuid,text,text,text[],text,timestamptz,timestamptz,text,text,boolean,smallint,text,double precision,double precision,text),
 private.change_plan_v4(uuid,integer,text,text,text[],timestamptz,timestamptz,text,text,boolean,smallint,text,text,boolean,boolean),
 public.change_plan_v4(uuid,integer,text,text,text[],timestamptz,timestamptz,text,text,boolean,smallint,text,text,boolean,boolean)
 from public, anon, authenticated, service_role;
grant execute on function
 private.create_plan_v4(uuid,text,text,text[],text,timestamptz,timestamptz,text,text,boolean,smallint,text,double precision,double precision,text),
 public.create_plan_v4(uuid,text,text,text[],text,timestamptz,timestamptz,text,text,boolean,smallint,text,double precision,double precision,text),
 private.change_plan_v4(uuid,integer,text,text,text[],timestamptz,timestamptz,text,text,boolean,smallint,text,text,boolean,boolean),
 public.change_plan_v4(uuid,integer,text,text,text[],timestamptz,timestamptz,text,text,boolean,smallint,text,text,boolean,boolean)
 to authenticated;

-- 4. Mutes (CR-D9, CR-P7, CR-P24)
-- "Mute this resbite": one row per person and series, so the mute carries to the next occurrence of a repeating resbite.
-- notification_recipient_eligible (at the end of this section) skips the muted. Clients read their own rows and write
-- through set_plan_mute.
create table public.plan_mutes (
 series_id uuid not null,
 user_id uuid not null references public.profiles(id) on delete cascade,
 muted_at timestamptz not null default now(),
 primary key (series_id, user_id)
);
alter table public.plan_mutes enable row level security;
create policy plan_mutes_own on public.plan_mutes for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.plan_mutes from public, anon, authenticated, service_role;
grant select on public.plan_mutes to authenticated;

create function private.set_plan_mute(p_plan uuid, p_muted boolean) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_series uuid;
begin
 select series_id into v_series from public.plans where id=p_plan;
 if v_series is null or not (private.is_host(p_plan,v_uid)
  or exists(select 1 from public.attendees a where a.plan_id=p_plan and a.user_id=v_uid)) then
  raise exception 'Host or attendee required' using errcode='42501';
 end if;
 if p_muted then
  insert into public.plan_mutes(series_id,user_id) values(v_series,v_uid) on conflict do nothing;
 else
  delete from public.plan_mutes where series_id=v_series and user_id=v_uid;
 end if;
 return p_muted;
end $$;
create function public.set_plan_mute(p_plan uuid, p_muted boolean) returns boolean language sql security invoker set search_path = '' as $$
 select private.set_plan_mute(p_plan,p_muted)
$$;
revoke all on function private.set_plan_mute(uuid,boolean), public.set_plan_mute(uuid,boolean) from public, anon, authenticated, service_role;
grant execute on function private.set_plan_mute(uuid,boolean), public.set_plan_mute(uuid,boolean) to authenticated;

-- The one definition of notification_recipient_eligible. It carries the end boundary for a request's notice (section 1),
-- is_host (section 0/2) and the mute clause. It sits here because it reads plans.series_id (section 3) and plan_mutes
-- (this section). It stays a SQL function, as its previous definition was. The host notices (rsvp, invitation,
-- join_request) go only to someone who is still a host: an admin removed, or who answered Can't go, after the row was
-- queued is not told.
create or replace function private.notification_recipient_eligible(p_outbox bigint) returns boolean
language sql stable security definer set search_path='' as $$
 select exists (
 select 1 from private.notification_outbox o
 join public.plans plan on plan.id=o.plan_id
 where o.id=p_outbox
 and private.user_eligible(o.recipient_id) and not private.deletion_pending(o.recipient_id)
 and (private.is_host(plan.id,o.recipient_id) or exists(select 1 from public.attendees a where a.plan_id=plan.id and a.user_id=o.recipient_id
  and (o.kind not in ('plan_changed','guest_note') or a.response in ('accepted','maybe','pending'))))
 and (o.kind not in ('rsvp','invitation','join_request') or private.is_host(plan.id,o.recipient_id))
 and o.created_at>now()-interval '24 hours'
 and not exists(select 1 from public.plan_mutes m where m.series_id=plan.series_id and m.user_id=o.recipient_id)
 and (o.kind<>'join_request' or (plan.status='active' and private.plan_end(plan.starts_at,plan.ends_at)>now()
  and exists(select 1 from private.join_requests j where j.plan_id=o.plan_id and j.user_id=o.actor_id
   and j.status='waiting' and j.created_at<=o.created_at)
  and not exists(select 1 from public.attendees a where a.plan_id=o.plan_id and a.user_id=o.actor_id)
  and not private.deletion_pending(o.actor_id)))
 )
$$;

-- 5. Repeats (CR-D16, CR-P22 to CR-P26)
-- A repeating resbite is an ordinary resbite with a repeat rule (section 3). When it ends, or is cancelled on its own,
-- the roll creates the next occurrence, one or two weeks on at the same local time in the plan's time_zone, so the
-- clocks changing don't move it. Nothing is created beyond the next one. pg_cron runs the roll every five minutes as
-- postgres (supabase/ops/schedule-roll-repeating-plans.sql, owner-run); no API role may execute it. The outbox detail
-- 'again' for 'invited' is allowed in section 2's check.

-- The same local time p_weeks weeks on.
create function private.next_occurrence(p_at timestamptz, p_zone text, p_weeks integer) returns timestamptz
language sql stable security definer set search_path = '' as $$
 select ((p_at at time zone p_zone) + make_interval(weeks => p_weeks)) at time zone p_zone
$$;
revoke all on function private.next_occurrence(timestamptz,text,integer) from public, anon, authenticated, service_role;

-- For each plan with a rule and no next yet that has ended or was cancelled with its rule kept: the next occurrence is
-- the first one, counting on from this one, that has not ended (a plan left behind catches up instead of creating
-- occurrences in the past). It copies the plan, its meeting details, and as pending invitations every guest who didn't
-- withdraw and uses the app (private.used_app), may still use it and is not leaving; a guest who only ever answered on
-- the web is not asked again. The admins among them stay admins. It queues the invitation push for each guest it
-- copied but the admins (CR-P24; the owner is never an attendee). A plan whose organizer may no longer use the app (no
-- owner, leaving, removed or banned) is not rolled; it catches up if they come back. The rows are locked with skip
-- locked and repeats_from is unique, so two runs at once, or a retry, create one next occurrence; the loser's unique
-- violation is caught.
create function private.roll_repeating_plans() returns integer language plpgsql security definer set search_path = '' as $$
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
revoke all on function private.roll_repeating_plans() from public, anon, authenticated, service_role;

-- The next occurrence shares the photo: its cover_path names the object in the first occurrence's folder. The
-- 20261007200000_plan_covers read policy grants a reader only through the plan whose id is that folder, so a guest
-- invited to a later occurrence alone could not read it. Now any plan the reader can read (plans row-level security
-- applies) whose cover_path names the object, kept in that plan owner's folder, grants the read; the owner still reads
-- their own uploads through the folder's plan.
drop policy resbite_cover_read on storage.objects;
create policy resbite_cover_read on storage.objects for select to authenticated using (
 bucket_id='plan-covers' and (select private.eligible()) and exists(
  select 1 from public.plans p where p.owner_id::text=(storage.foldername(name))[1]
   and ((p.id::text=(storage.foldername(name))[2] and p.owner_id=(select auth.uid())) or p.cover_path=name))
);
