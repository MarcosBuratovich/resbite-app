-- Internal tester foundation. No roster entries, activity copy or secrets are seeded.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
create extension if not exists pgcrypto with schema extensions;

create table private.tester_roster (
 email text primary key check (email = lower(btrim(email))),
 enabled boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check (length(btrim(display_name)) between 1 and 80),
 avatar_path text,
 deletion_requested_at timestamptz,
 created_at timestamptz not null default now()
);
create table public.activities (
 id text primary key,
 title text not null,
 description text not null,
 category text not null,
 artwork_key text not null,
 source_ids text[] not null,
 published boolean not null default false
);
create table public.plans (
 id uuid primary key,
 owner_id uuid not null references public.profiles(id),
 activity_id text not null references public.activities(id),
 starts_at timestamptz not null,
 time_zone text not null,
 place_label text not null check (length(btrim(place_label)) between 1 and 300),
 latitude double precision check (latitude between -90 and 90),
 longitude double precision check (longitude between -180 and 180),
 note text not null default '' check (length(note) <= 2000),
 status text not null default 'active' check (status in ('active','cancelled')),
 version integer not null default 1,
 created_at timestamptz not null default now(),
 check ((latitude is null) = (longitude is null))
);
create index plans_owner_idx on public.plans(owner_id);
create index plans_activity_idx on public.plans(activity_id);
create table public.attendees (
 plan_id uuid not null references public.plans(id) on delete cascade,
 user_id uuid not null references public.profiles(id),
 response text not null default 'pending' check (response in ('pending','accepted','declined','withdrawn')),
 version integer not null default 1,
 updated_at timestamptz not null default now(),
 primary key (plan_id,user_id)
);
create index attendees_user_idx on public.attendees(user_id,plan_id);
create table private.invitations (
 id uuid primary key,
 plan_id uuid not null references public.plans(id) on delete cascade,
 token_hash bytea not null unique,
 intended_email text,
 claimed_by uuid references public.profiles(id),
 revoked_at timestamptz,
 created_at timestamptz not null default now()
);
create index invitations_plan_idx on private.invitations(plan_id);
create index invitations_claimed_idx on private.invitations(claimed_by);
create table private.device_endpoints (
 token text primary key,
 user_id uuid not null references public.profiles(id) on delete cascade,
 platform text not null check (platform in ('ios','android')),
 updated_at timestamptz not null default now()
);
create index device_endpoints_user_idx on private.device_endpoints(user_id);
create table private.notification_outbox (
 id bigint generated always as identity primary key,
 plan_id uuid not null references public.plans(id) on delete cascade,
 recipient_id uuid not null references public.profiles(id) on delete cascade,
 kind text not null check (kind in ('invitation','rsvp','plan_changed','plan_cancelled')),
 dedupe_key text not null unique,
 created_at timestamptz not null default now(),
 delivered_at timestamptz,
 attempts integer not null default 0
);
create index notification_outbox_pending_idx on private.notification_outbox(created_at) where delivered_at is null;
create index notification_outbox_plan_idx on private.notification_outbox(plan_id);
create index notification_outbox_recipient_idx on private.notification_outbox(recipient_id);

create function private.eligible() returns boolean language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists (
  select 1 from auth.users u join private.tester_roster r on r.email = lower(u.email)
  where u.id = auth.uid() and u.email_confirmed_at is not null
    and not coalesce(u.is_anonymous,false) and r.enabled
    and (u.banned_until is null or u.banned_until <= now())
 ) and not exists (select 1 from public.profiles p where p.id=auth.uid() and p.deletion_requested_at is not null)
$$;
create function private.require_tester() returns uuid language plpgsql stable security definer set search_path = '' as $$
begin
 if not private.eligible() then raise exception 'Verified invited tester required' using errcode='42501'; end if;
 return auth.uid();
end $$;
create function private.can_read_plan(p_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select private.eligible() and exists(select 1 from public.plans p where p.id=p_id and
 (p.owner_id=auth.uid() or exists(select 1 from public.attendees a where a.plan_id=p.id and a.user_id=auth.uid())))
$$;
create function private.can_read_profile(p_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select private.eligible() and (p_id=auth.uid() or exists (
 select 1 from public.plans p where private.can_read_plan(p.id) and
 (p.owner_id=p_id or exists(select 1 from public.attendees a where a.plan_id=p.id and a.user_id=p_id))))
$$;

alter table public.profiles enable row level security;
alter table public.activities enable row level security;
alter table public.plans enable row level security;
alter table public.attendees enable row level security;
alter table private.tester_roster enable row level security;
alter table private.invitations enable row level security;
alter table private.device_endpoints enable row level security;
alter table private.notification_outbox enable row level security;
revoke all on public.profiles, public.activities, public.plans, public.attendees from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
grant select on public.profiles, public.activities, public.plans, public.attendees to authenticated;
create policy profile_read on public.profiles for select to authenticated using (private.can_read_profile(id));
create policy activity_read on public.activities for select to authenticated using ((select private.eligible()) and published);
create policy plan_read on public.plans for select to authenticated using (private.can_read_plan(id));
create policy attendee_read on public.attendees for select to authenticated using (private.can_read_plan(plan_id));

create function private.save_profile(p_name text) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester();
begin
 insert into public.profiles(id,display_name) values(v_uid,btrim(p_name))
 on conflict(id) do update set display_name=excluded.display_name;
 return v_uid;
end $$;
create function private.create_plan(p_id uuid,p_activity text,p_start timestamptz,p_zone text,p_place text,p_note text default '',p_lat double precision default null,p_lon double precision default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_existing public.plans;
begin
 -- Serialize repeated creation IDs; a retry must match the original payload.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text,0));
 select * into v_existing from public.plans where id=p_id;
 if found then
  if v_existing.owner_id<>v_uid or v_existing.activity_id is distinct from p_activity or v_existing.starts_at is distinct from p_start or v_existing.time_zone is distinct from p_zone or v_existing.place_label is distinct from btrim(p_place) or v_existing.note is distinct from p_note or v_existing.latitude is distinct from p_lat or v_existing.longitude is distinct from p_lon then
   raise exception 'Creation identifier already used' using errcode='22023';
  end if;
  return p_id;
 end if;
 if p_start <= now() or p_start is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_zone) then raise exception 'Invalid future schedule' using errcode='22023'; end if;
 if not exists(select 1 from public.activities where id=p_activity and published) then raise exception 'Activity unavailable' using errcode='22023'; end if;
 insert into public.plans(id,owner_id,activity_id,starts_at,time_zone,place_label,note,latitude,longitude)
 values(p_id,v_uid,p_activity,p_start,p_zone,btrim(p_place),p_note,p_lat,p_lon);
 return p_id;
end $$;

create function private.create_invite(p_id uuid,p_plan uuid,p_token text,p_email text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_plan public.plans; v_existing private.invitations; v_hash bytea;
begin
 select * into v_plan from public.plans where id=p_plan for update;
 if not found or v_plan.owner_id<>v_uid then raise exception 'Owner required' using errcode='42501'; end if;
 if v_plan.status<>'active' or v_plan.starts_at<=now() then raise exception 'Plan unavailable' using errcode='22023'; end if;
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

create function private.claim_invite(p_token text) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_inv private.invitations; v_plan public.plans; v_id uuid;
begin
 -- Lock plan before invitation consistently with cancellation/revocation.
 select plan_id into v_id from private.invitations where token_hash=extensions.digest(p_token,'sha256');
 select * into v_plan from public.plans where id=v_id for update;
 select * into v_inv from private.invitations where token_hash=extensions.digest(p_token,'sha256') for update;
 if v_inv.id is null or v_plan.status<>'active' or v_plan.starts_at<=now() or v_inv.revoked_at is not null or (v_inv.claimed_by is not null and v_inv.claimed_by<>v_uid) then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 if v_plan.owner_id=v_uid then raise exception 'Owner cannot claim own invitation' using errcode='22023'; end if;
 if v_inv.intended_email is not null and not exists(select 1 from auth.users where id=v_uid and lower(email)=v_inv.intended_email and email_confirmed_at is not null) then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 if v_inv.claimed_by=v_uid then return v_inv.plan_id; end if;
 update private.invitations set claimed_by=v_uid where id=v_inv.id;
 insert into public.attendees(plan_id,user_id) values(v_inv.plan_id,v_uid) on conflict do nothing;
 insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key) values(v_inv.plan_id,v_uid,'invitation','invite:'||v_inv.id) on conflict do nothing;
 return v_inv.plan_id;
end $$;

create function private.respond(p_plan uuid,p_response text,p_version integer) returns integer language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_plan public.plans; v_att public.attendees; v_next integer;
begin
 select * into v_plan from public.plans where id=p_plan for update;
 select * into v_att from public.attendees where plan_id=p_plan and user_id=v_uid for update;
 if v_att.user_id is null then raise exception 'Invitee required' using errcode='42501'; end if;
 if v_plan.status<>'active' or v_plan.starts_at<=now() then raise exception 'Plan unavailable' using errcode='22023'; end if;
 if p_response is null or p_response not in ('accepted','declined','withdrawn') then raise exception 'Invalid response' using errcode='22023'; end if;
 if p_version is distinct from v_att.version then
  if v_att.response=p_response and p_version=v_att.version-1 then return v_att.version; end if;
  raise exception 'Response changed; refresh' using errcode='40001';
 end if;
 if v_att.response=p_response then return v_att.version; end if;
 v_next:=v_att.version+1;
 update public.attendees set response=p_response,version=v_next,updated_at=now() where plan_id=p_plan and user_id=v_uid;
 insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key) values(p_plan,v_plan.owner_id,'rsvp','rsvp:'||p_plan||':'||v_uid||':'||v_next) on conflict do nothing;
 return v_next;
end $$;

create function private.change_plan(p_plan uuid,p_version integer,p_start timestamptz,p_zone text,p_place text,p_note text,p_cancel boolean default false)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_plan public.plans; v_next integer;
begin
 select * into v_plan from public.plans where id=p_plan for update;
 if not found or v_plan.owner_id<>v_uid then raise exception 'Owner required' using errcode='42501'; end if;
 if v_plan.status<>'active' or v_plan.starts_at<=now() then raise exception 'Plan unavailable' using errcode='22023'; end if;
 if p_version is distinct from v_plan.version then raise exception 'Plan changed; refresh' using errcode='40001'; end if;
 if not coalesce(p_cancel,false) and (p_start is null or p_start<=now() or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_zone)) then raise exception 'Invalid future schedule' using errcode='22023'; end if;
 v_next:=v_plan.version+1;
 if p_cancel then
  update public.plans set status='cancelled',version=v_next where id=p_plan;
  update private.invitations set revoked_at=now() where plan_id=p_plan and revoked_at is null;
 else
  update public.plans set starts_at=p_start,time_zone=p_zone,place_label=btrim(p_place),note=p_note,latitude=null,longitude=null,version=v_next where id=p_plan;
 end if;
 insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key)
 select p_plan,a.user_id,case when p_cancel then 'plan_cancelled' else 'plan_changed' end,'plan:'||p_plan||':'||v_next||':'||a.user_id
 from public.attendees a where a.plan_id=p_plan and a.user_id<>v_uid on conflict do nothing;
 return v_next;
end $$;

create function private.revoke_invite(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_plan uuid; v_inv private.invitations;
begin
 select plan_id into v_plan from private.invitations where id=p_id;
 perform 1 from public.plans where id=v_plan and owner_id=v_uid and status='active' and starts_at>now() for update;
 if not found then raise exception 'Active plan owner required' using errcode='42501'; end if;
 select * into v_inv from private.invitations where id=p_id for update;
 update private.invitations set revoked_at=now() where id=p_id;
 if v_inv.claimed_by is not null and not exists(select 1 from private.invitations where plan_id=v_plan and claimed_by=v_inv.claimed_by and revoked_at is null) then
  delete from public.attendees where plan_id=v_plan and user_id=v_inv.claimed_by;
 end if;
end $$;
create function private.register_device(p_token text,p_platform text) returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester();
begin
 if p_token is null or length(p_token) not between 10 and 300 then raise exception 'Invalid endpoint' using errcode='22023'; end if;
 insert into private.device_endpoints(token,user_id,platform) values(p_token,v_uid,p_platform)
 on conflict(token) do update set user_id=v_uid,platform=excluded.platform,updated_at=now();
end $$;

-- Public invoker façades. Privileged implementations live only in private.
create function public.save_profile(p_name text) returns uuid language sql security invoker set search_path='' as $$ select private.save_profile(p_name) $$;
create function public.create_plan(p_id uuid,p_activity text,p_start timestamptz,p_zone text,p_place text,p_note text default '',p_lat double precision default null,p_lon double precision default null) returns uuid language sql security invoker set search_path='' as $$ select private.create_plan(p_id,p_activity,p_start,p_zone,p_place,p_note,p_lat,p_lon) $$;
create function public.create_invite(p_id uuid,p_plan uuid,p_token text,p_email text default null) returns uuid language sql security invoker set search_path='' as $$ select private.create_invite(p_id,p_plan,p_token,p_email) $$;
create function public.claim_invite(p_token text) returns uuid language sql security invoker set search_path='' as $$ select private.claim_invite(p_token) $$;
create function public.respond(p_plan uuid,p_response text,p_version integer) returns integer language sql security invoker set search_path='' as $$ select private.respond(p_plan,p_response,p_version) $$;
create function public.change_plan(p_plan uuid,p_version integer,p_start timestamptz,p_zone text,p_place text,p_note text,p_cancel boolean default false) returns integer language sql security invoker set search_path='' as $$ select private.change_plan(p_plan,p_version,p_start,p_zone,p_place,p_note,p_cancel) $$;
create function public.revoke_invite(p_id uuid) returns void language sql security invoker set search_path='' as $$ select private.revoke_invite(p_id) $$;
create function public.register_device(p_token text,p_platform text) returns void language sql security invoker set search_path='' as $$ select private.register_device(p_token,p_platform) $$;

revoke all on all functions in schema private from public,anon,authenticated;
grant execute on all functions in schema private to authenticated;
-- Explicitly list public endpoints: do not change grants on unrelated Supabase functions.
revoke all on function public.save_profile(text),public.create_plan(uuid,text,timestamptz,text,text,text,double precision,double precision),public.create_invite(uuid,uuid,text,text),public.claim_invite(text),public.respond(uuid,text,integer),public.change_plan(uuid,integer,timestamptz,text,text,text,boolean),public.revoke_invite(uuid),public.register_device(text,text) from public,anon,authenticated;
grant execute on function public.save_profile(text),public.create_plan(uuid,text,timestamptz,text,text,text,double precision,double precision),public.create_invite(uuid,uuid,text,text),public.claim_invite(text),public.respond(uuid,text,integer),public.change_plan(uuid,integer,timestamptz,text,text,text,boolean),public.revoke_invite(uuid),public.register_device(text,text) to authenticated;

-- Private avatars; client normalizes image/strips metadata before upload.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('profile-photos','profile-photos',false,2097152,array['image/jpeg','image/png','image/webp']);
create policy resbite_avatar_read on storage.objects for select to authenticated using (
 bucket_id='profile-photos' and (select private.eligible()) and exists(
 select 1 from public.profiles p where p.id::text=(storage.foldername(name))[1] and private.can_read_profile(p.id))
);
create policy resbite_avatar_insert on storage.objects for insert to authenticated with check (
 bucket_id='profile-photos' and (select private.eligible()) and (storage.foldername(name))[1]=(select auth.uid())::text
);
create policy resbite_avatar_update on storage.objects for update to authenticated using (
 bucket_id='profile-photos' and (select private.eligible()) and (storage.foldername(name))[1]=(select auth.uid())::text
) with check (
 bucket_id='profile-photos' and (select private.eligible()) and (storage.foldername(name))[1]=(select auth.uid())::text
);
create policy resbite_avatar_delete on storage.objects for delete to authenticated using (
 bucket_id='profile-photos' and (select private.eligible()) and (storage.foldername(name))[1]=(select auth.uid())::text
);
create function private.set_avatar(p_path text) returns void language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=private.require_tester();
begin
 if p_path is not null and (split_part(p_path,'/',1)<>v_uid::text or not exists(select 1 from storage.objects where bucket_id='profile-photos' and name=p_path)) then raise exception 'Own uploaded photo required' using errcode='42501'; end if;
 update public.profiles set avatar_path=p_path where id=v_uid;
end $$;
create function public.set_avatar(p_path text) returns void language sql security invoker set search_path='' as $$ select private.set_avatar(p_path) $$;
revoke all on function private.set_avatar(text),public.set_avatar(text) from public,anon,authenticated;
grant execute on function private.set_avatar(text),public.set_avatar(text) to authenticated;
