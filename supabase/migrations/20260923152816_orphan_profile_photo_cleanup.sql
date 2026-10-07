-- Prepared only. Worker has a source-code release gate; nothing is scheduled.
-- Depends on account_deletion_lifecycle's per-account advisory lock (seed 47).
-- No production function writes/deletes storage.objects: file removal is HTTP-only.
create table private.profile_photo_retired_paths (
 path_hash bytea primary key,
 user_id uuid not null
);
create index profile_photo_retired_user_idx on private.profile_photo_retired_paths(user_id);
create table private.profile_photo_cleanup_jobs (
 job_id uuid primary key default gen_random_uuid(),
 path_hash bytea not null unique,
 user_id uuid not null,
 path text not null,
 object_id uuid not null,
 observed_at timestamptz not null default now(),
 status text not null default 'observed' check(status in ('observed','queued','processing','complete')),
 attempts integer not null default 0,
 next_attempt_at timestamptz not null default now(),
 lease_id uuid,
 lease_until timestamptz,
 completed_at timestamptz
);
create index profile_photo_cleanup_due_idx on private.profile_photo_cleanup_jobs(next_attempt_at,observed_at) where status<>'complete';
create index profile_photo_cleanup_user_idx on private.profile_photo_cleanup_jobs(user_id);
alter table private.profile_photo_retired_paths enable row level security;
alter table private.profile_photo_cleanup_jobs enable row level security;
revoke all on private.profile_photo_retired_paths,private.profile_photo_cleanup_jobs from public,anon,authenticated;

-- Freeze path identity across the database/HTTP boundary, including after a lost
-- DELETE reply or expired lease. Storage metadata updates also reset observation
-- age. Do not permit moving an old object out of the fence into another bucket.
create or replace function private.guard_photo_write() returns trigger language plpgsql security definer set search_path='' as $$
declare v_user uuid;
begin
 if tg_op='UPDATE' and (old.bucket_id='profile-photos' or new.bucket_id='profile-photos')
 and (new.bucket_id is distinct from old.bucket_id or new.name is distinct from old.name) then
  raise exception 'Profile photo paths are immutable' using errcode='42501';
 end if;
 if new.bucket_id='profile-photos' then
  if auth.uid() is not null then perform private.require_tester(); end if;
  begin v_user:=split_part(new.name,'/',1)::uuid;
  exception when invalid_text_representation then raise exception 'Invalid photo path' using errcode='42501'; end;
  if v_user is null or new.name not like v_user::text||'/%' then raise exception 'Invalid photo path' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text,47));
  if not exists(select 1 from auth.users where id=v_user) or exists(select 1 from private.account_deletion_jobs where user_id=v_user) then
   raise exception 'Photo account unavailable' using errcode='42501';
  end if;
  if exists(select 1 from private.profile_photo_retired_paths where path_hash=extensions.digest(new.name,'sha256')) then
   raise exception 'Photo path retired; choose a new photo' using errcode='42501';
  end if;
  delete from private.profile_photo_cleanup_jobs where path_hash=extensions.digest(new.name,'sha256') and status='observed';
 end if;
 return new;
end $$;

-- Covers set_avatar as well as future trusted profile maintenance. The current
-- set_avatar already takes the same account lock through require_tester().
create function private.guard_profile_photo_reference() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.id::text,47));
 if new.avatar_path is not null and exists(select 1 from private.profile_photo_retired_paths where path_hash=extensions.digest(new.avatar_path,'sha256')) then
  raise exception 'Photo path retired; choose a new photo' using errcode='42501';
 end if;
 -- Attaching and detaching both restart the full seven-day observation window.
 delete from private.profile_photo_cleanup_jobs where status='observed' and (
  path_hash=extensions.digest(new.avatar_path,'sha256') or
  (tg_op='UPDATE' and path_hash=extensions.digest(old.avatar_path,'sha256')));
 return new;
end $$;
revoke all on function private.guard_profile_photo_reference() from public,anon,authenticated;
create trigger resbite_profile_photo_reference_guard before insert or update of avatar_path on public.profiles for each row execute function private.guard_profile_photo_reference();

-- A participant's known old path must not expose an abandoned/replaced image.
-- The owner retains own upload reads for interrupted-upload reconciliation.
alter policy resbite_avatar_read on storage.objects using (
 bucket_id='profile-photos' and (select private.eligible()) and exists(
 select 1 from public.profiles p where p.id::text=(storage.foldername(name))[1]
 and private.can_read_profile(p.id) and (p.id=(select auth.uid()) or p.avatar_path=name))
);

create function private.claim_orphan_profile_photos(p_limit integer default 5) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_object record; v_candidate record; v_job private.profile_photo_cleanup_jobs; v_result jsonb:='[]'::jsonb;
begin
 -- Bounded discovery. Existing objects get a full observation period after first
 -- discovery; creation timestamps alone do not establish when a photo detached.
 for v_object in
  select o.id,o.name,u.id user_id from storage.objects o
  join auth.users u on split_part(o.name,'/',1)=u.id::text
  where o.bucket_id='profile-photos' and length(o.name)<=1024 and position('..' in o.name)=0
   and not exists(select 1 from public.profiles p where p.avatar_path=o.name)
   and not exists(select 1 from private.account_deletion_jobs d where d.user_id=u.id)
   and not exists(select 1 from private.profile_photo_retired_paths r where r.path_hash=extensions.digest(o.name,'sha256'))
   and not exists(select 1 from private.profile_photo_cleanup_jobs j where j.path_hash=extensions.digest(o.name,'sha256'))
  order by u.id,o.name limit 100
 loop
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(v_object.user_id::text,47)) then continue; end if;
  -- Re-read after acquiring the shared account lock: attachment/upload may have
  -- committed while discovery was scanning its older snapshot.
  if not exists(select 1 from storage.objects where bucket_id='profile-photos' and name=v_object.name and id=v_object.id)
   or exists(select 1 from public.profiles where avatar_path=v_object.name)
   or exists(select 1 from private.account_deletion_jobs where user_id=v_object.user_id) then continue; end if;
  insert into private.profile_photo_cleanup_jobs(path_hash,user_id,path,object_id)
   values(extensions.digest(v_object.name,'sha256'),v_object.user_id,v_object.name,v_object.id) on conflict do nothing;
 end loop;
 for v_candidate in
  select job_id,user_id from private.profile_photo_cleanup_jobs
  where status<>'complete' and next_attempt_at<=now() and (lease_until is null or lease_until<=now())
   and (status<>'observed' or observed_at<=now()-interval '7 days')
  order by user_id,path limit 100
 loop
  exit when jsonb_array_length(v_result)>=greatest(1,least(coalesce(p_limit,5),20));
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(v_candidate.user_id::text,47)) then continue; end if;
  select * into v_job from private.profile_photo_cleanup_jobs where job_id=v_candidate.job_id for update skip locked;
  if not found or v_job.status='complete' or v_job.next_attempt_at>now() or v_job.lease_until>now() then continue; end if;
  if v_job.status='observed' then
   if v_job.observed_at>now()-interval '7 days' then continue; end if;
   if not exists(select 1 from auth.users where id=v_job.user_id)
    or exists(select 1 from private.account_deletion_jobs where user_id=v_job.user_id)
    or exists(select 1 from public.profiles where avatar_path=v_job.path)
    or not exists(select 1 from storage.objects where bucket_id='profile-photos' and name=v_job.path and id=v_job.object_id) then
    delete from private.profile_photo_cleanup_jobs where job_id=v_job.job_id; continue;
   end if;
   -- This barrier is irreversible while the Auth namespace exists, independent
   -- of leases. A paused old HTTP request can only remove this retired path.
   insert into private.profile_photo_retired_paths(path_hash,user_id) values(v_job.path_hash,v_job.user_id) on conflict do nothing;
  end if;
  update private.profile_photo_cleanup_jobs set status='processing',lease_id=gen_random_uuid(),lease_until=now()+interval '5 minutes',attempts=attempts+1 where job_id=v_job.job_id returning * into v_job;
  v_result:=v_result||jsonb_build_array(jsonb_build_object('jobId',v_job.job_id,'userId',v_job.user_id,'leaseId',v_job.lease_id,'attempts',v_job.attempts));
 end loop;
 return v_result;
end $$;

create function private.prepare_orphan_profile_photo(p_job uuid,p_lease uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_job private.profile_photo_cleanup_jobs;
begin
 select * into v_job from private.profile_photo_cleanup_jobs where job_id=p_job;
 if not found then raise exception 'Photo lease expired' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_job.user_id::text,47));
 select * into v_job from private.profile_photo_cleanup_jobs where job_id=p_job for update;
 if not found or v_job.status<>'processing' or v_job.lease_id is distinct from p_lease or v_job.lease_until<=now() then raise exception 'Photo lease expired' using errcode='42501'; end if;
 if not exists(select 1 from private.profile_photo_retired_paths where path_hash=v_job.path_hash)
  or exists(select 1 from public.profiles where avatar_path=v_job.path) then raise exception 'Photo is not retired' using errcode='42501'; end if;
 if not exists(select 1 from storage.objects where bucket_id='profile-photos' and name=v_job.path) then return jsonb_build_object('action','absent'); end if;
 if exists(select 1 from private.account_deletion_jobs where user_id=v_job.user_id) then return jsonb_build_object('action','account-deletion'); end if;
 return jsonb_build_object('action','delete','path',v_job.path);
end $$;

create function private.finish_orphan_profile_photo(p_job uuid,p_lease uuid,p_complete boolean) returns boolean language plpgsql security definer set search_path='' as $$
declare v_job private.profile_photo_cleanup_jobs;
begin
 select * into v_job from private.profile_photo_cleanup_jobs where job_id=p_job for update;
 if not found or v_job.status<>'processing' or v_job.lease_id is distinct from p_lease or v_job.lease_until<=now() then return false; end if;
 if p_complete then
  if exists(select 1 from storage.objects where bucket_id='profile-photos' and name=v_job.path) then raise exception 'Photo cleanup still pending' using errcode='22023'; end if;
  update private.profile_photo_cleanup_jobs set status='complete',completed_at=now(),lease_id=null,lease_until=null where job_id=p_job;
 else
  update private.profile_photo_cleanup_jobs set status='queued',next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,least(attempts,7))::integer)),lease_id=null,lease_until=null where job_id=p_job;
 end if;
 return true;
end $$;

-- Proposed policy: detailed successful receipts last 30 days. The path hash
-- remains while its Auth namespace exists. It can be purged only after verified
-- account deletion, absent Auth/profile AND absent entire Storage prefix.
create function private.prune_profile_photo_cleanup() returns integer language plpgsql security definer set search_path='' as $$
declare v_user uuid; v_count integer;
begin
 delete from private.profile_photo_cleanup_jobs where job_id in (
  select job_id from private.profile_photo_cleanup_jobs where status='complete' and completed_at<now()-interval '30 days' order by completed_at limit 100);
 get diagnostics v_count=row_count;
 for v_user in select distinct r.user_id from (
  select user_id from private.profile_photo_retired_paths union select user_id from private.profile_photo_cleanup_jobs
 ) r
  join private.account_deletion_jobs d on d.user_id=r.user_id and d.status='complete'
  where not exists(select 1 from auth.users u where u.id=r.user_id)
  and not exists(select 1 from public.profiles p where p.id=r.user_id)
  and not exists(select 1 from storage.objects o where o.bucket_id='profile-photos' and o.name like r.user_id::text||'/%')
  order by r.user_id limit 100
 loop
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text,47)) then continue; end if;
  if exists(select 1 from auth.users where id=v_user) or exists(select 1 from public.profiles where id=v_user)
   or exists(select 1 from storage.objects where bucket_id='profile-photos' and name like v_user::text||'/%') then continue; end if;
  delete from private.profile_photo_cleanup_jobs where user_id=v_user;
  delete from private.profile_photo_retired_paths where user_id=v_user;
 end loop;
 return v_count;
end $$;

create function public.claim_orphan_profile_photos(p_limit integer default 5) returns jsonb language sql security invoker set search_path='' as $$ select private.claim_orphan_profile_photos(p_limit) $$;
create function public.prepare_orphan_profile_photo(p_job uuid,p_lease uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.prepare_orphan_profile_photo(p_job,p_lease) $$;
create function public.finish_orphan_profile_photo(p_job uuid,p_lease uuid,p_complete boolean) returns boolean language sql security invoker set search_path='' as $$ select private.finish_orphan_profile_photo(p_job,p_lease,p_complete) $$;
create function public.prune_profile_photo_cleanup() returns integer language sql security invoker set search_path='' as $$ select private.prune_profile_photo_cleanup() $$;
revoke all on function private.claim_orphan_profile_photos(integer),public.claim_orphan_profile_photos(integer),private.prepare_orphan_profile_photo(uuid,uuid),public.prepare_orphan_profile_photo(uuid,uuid),private.finish_orphan_profile_photo(uuid,uuid,boolean),public.finish_orphan_profile_photo(uuid,uuid,boolean),private.prune_profile_photo_cleanup(),public.prune_profile_photo_cleanup() from public,anon,authenticated;
grant execute on function private.claim_orphan_profile_photos(integer),public.claim_orphan_profile_photos(integer),private.prepare_orphan_profile_photo(uuid,uuid),public.prepare_orphan_profile_photo(uuid,uuid),private.finish_orphan_profile_photo(uuid,uuid,boolean),public.finish_orphan_profile_photo(uuid,uuid,boolean),private.prune_profile_photo_cleanup(),public.prune_profile_photo_cleanup() to service_role;
