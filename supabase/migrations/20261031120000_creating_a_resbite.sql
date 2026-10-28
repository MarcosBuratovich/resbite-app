-- Creating a resbite: the database. Spec: docs/superpowers/specs/2026-10-28-creating-a-resbite-design.md
-- Plan: docs/superpowers/plans/2026-10-28-creating-a-resbite-1-database.md
-- Hosted-compatible: depends only on the migrations in supabase/tests/hosted-baseline/migrations.txt
-- Rollback: supabase/rollback/20261031120000_creating_a_resbite.rollback.sql

-- 1. The end is the boundary
-- CR-D14: a resbite accepts changes until it ends, not until it starts. The end is ends_at, or starts_at when there is
-- none. Every function that refused from the start refuses from the end instead, with its error text unchanged; each
-- body below is the latest hosted one with that one comparison changed (and, for change_plan_v3, the start check).
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
 if not found or v_plan.owner_id is distinct from v_uid then raise exception 'Owner required' using errcode='42501'; end if;
 if v_plan.status<>'active' or private.plan_end(v_plan.starts_at,v_plan.ends_at)<=now() then raise exception 'Plan unavailable' using errcode='22023'; end if;
 if p_version is distinct from v_plan.version then raise exception 'Plan changed; refresh' using errcode='40001'; end if;
 if not v_cancel and (p_start is null or (p_start<=now() and p_start is distinct from v_plan.starts_at) or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_zone)) then raise exception 'Invalid future schedule' using errcode='22023'; end if;
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
 insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id,detail)
 values(p_plan,v_plan.owner_id,'rsvp','rsvp:'||p_plan||':'||v_uid||':'||v_next,v_uid,p_response) on conflict do nothing;
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
 insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id) values(v_inv.plan_id,v_plan.owner_id,'invitation','invite:'||v_inv.id,v_uid) on conflict do nothing;
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
 if not found or v_plan.owner_id<>v_uid then raise exception 'Owner required' using errcode='42501'; end if;
 if v_plan.status<>'active' or private.plan_end(v_plan.starts_at,v_plan.ends_at)<=now() then raise exception 'Plan unavailable' using errcode='22023'; end if;
 if p_path is not null and (p_path !~ ('^'||v_uid::text||'/'||p_plan::text||'/[A-Za-z0-9-]+\.jpg$') or not exists(
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
 if not found or v_plan.owner_id<>v_uid then raise exception 'Owner required' using errcode='42501'; end if;
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

-- The organizer of an active event that has not ended: the gate of the link, the invitations and the waiting list.
create or replace function private.require_link_owner(p_plan uuid) returns uuid language plpgsql set search_path = '' as $$
declare v_uid uuid := private.require_tester();
begin
 perform 1 from public.plans where id=p_plan and owner_id=v_uid and status='active' and private.plan_end(starts_at,ends_at)>now() for update;
 if not found then raise exception 'Active plan owner required' using errcode='42501'; end if;
 return v_uid;
end $$;

-- The public pages say 'happened' from the end.
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
  'time_zone',v_plan.time_zone,'area',v_plan.area,'going',v_going,
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
  'time_zone',v_plan.time_zone,'area',v_plan.area,'going',v_going,
  'image',case when v_plan.cover_path is not null then jsonb_build_object('kind','cover','ref',v_plan.cover_path)
   when v_plan.activity_id is not null then jsonb_build_object('kind','activity','ref',v_plan.activity_id)
   else jsonb_build_object('kind','mark','ref','') end,
  'ending',right(v_inv.phone,2),'country',v_inv.country);
end $$;

-- Invitations by number.
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
 return private.phone_digits(p_phone)=v_inv.phone;
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
  and private.phone_digits(u.phone)=v_inv.phone and not coalesce(u.is_anonymous,false)
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
 insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id,detail)
  values(v_plan.id,v_plan.owner_id,'rsvp','rsvp:'||v_plan.id||':'||v_uid||':'||v_att.version,v_uid,p_response) on conflict do nothing;
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
 if not exists(select 1 from public.plans where id=p_plan and owner_id=v_uid) then raise exception 'Plan owner required' using errcode='42501'; end if;
 if not exists(select 1 from public.plans where id=p_plan and status='active' and private.plan_end(starts_at,ends_at)>now()) then return '[]'::jsonb; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('user_id',j.user_id,'name',(select display_name from public.profiles where id=j.user_id),
   'response',j.response,'ending',(select nullif(right(u.phone,2),'') from auth.users u where u.id=j.user_id),'created_at',j.created_at)
   order by j.created_at,j.user_id)
  from private.join_requests j where j.plan_id=p_plan and j.status='waiting'
   and not exists(select 1 from public.attendees a where a.plan_id=j.plan_id and a.user_id=j.user_id)
   and not private.deletion_pending(j.user_id)),'[]'::jsonb);
end $$;

-- A request's notice goes out only while the event has not ended.
create or replace function private.notification_recipient_eligible(p_outbox bigint) returns boolean
language sql stable security definer set search_path='' as $$
 select exists (
 select 1 from private.notification_outbox o
 join public.plans plan on plan.id=o.plan_id
 where o.id=p_outbox
 and private.user_eligible(o.recipient_id) and not private.deletion_pending(o.recipient_id)
 and (plan.owner_id=o.recipient_id or exists(select 1 from public.attendees a where a.plan_id=plan.id and a.user_id=o.recipient_id
  and (o.kind not in ('plan_changed','guest_note') or a.response in ('accepted','maybe','pending'))))
 and o.created_at>now()-interval '24 hours'
 and (o.kind<>'join_request' or (plan.status='active' and private.plan_end(plan.starts_at,plan.ends_at)>now()
  and exists(select 1 from private.join_requests j where j.plan_id=o.plan_id and j.user_id=o.actor_id
   and j.status='waiting' and j.created_at<=o.created_at)
  and not exists(select 1 from public.attendees a where a.plan_id=o.plan_id and a.user_id=o.actor_id)
  and not private.deletion_pending(o.actor_id)))
 )
$$;

-- The two upload policies of the plan-covers bucket, open until the end instead of the start. (resbite_cover_read is unchanged.)
drop policy resbite_cover_insert on storage.objects;
drop policy resbite_cover_update on storage.objects;
create policy resbite_cover_insert on storage.objects for insert to authenticated with check (
 bucket_id='plan-covers' and (select private.eligible())
 and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.plans p where p.id::text=(storage.foldername(name))[2]
  and p.owner_id=(select auth.uid()) and p.status='active' and private.plan_end(p.starts_at,p.ends_at)>now())
);
create policy resbite_cover_update on storage.objects for update to authenticated using (
 bucket_id='plan-covers' and (select private.eligible())
 and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.plans p where p.id::text=(storage.foldername(name))[2]
  and p.owner_id=(select auth.uid()) and p.status='active' and private.plan_end(p.starts_at,p.ends_at)>now())
) with check (
 bucket_id='plan-covers' and (select private.eligible())
 and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.plans p where p.id::text=(storage.foldername(name))[2]
  and p.owner_id=(select auth.uid()) and p.status='active' and private.plan_end(p.starts_at,p.ends_at)>now())
);
