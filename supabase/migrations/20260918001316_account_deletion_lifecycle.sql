-- Prepared locally. No hosted deployment or tester activation is implied.
create table private.account_deletion_jobs (
 request_id uuid primary key,
 user_id uuid not null unique,
 recovery_hash bytea not null,
 status text not null default 'queued' check(status in ('queued','processing','complete')),
 requested_at timestamptz not null default now(),
 completed_at timestamptz,
 next_attempt_at timestamptz not null default now(),
 attempts integer not null default 0,
 lease_id uuid,
 lease_until timestamptz
);
alter table private.account_deletion_jobs enable row level security;
revoke all on private.account_deletion_jobs from public,anon,authenticated;
create index account_deletion_pending_idx on private.account_deletion_jobs(next_attempt_at) where status<>'complete';

-- Shared plans survive with a neutral removed organizer. Attendee membership is removed.
alter table public.plans alter column owner_id drop not null;
alter table public.plans drop constraint plans_owner_id_fkey;
alter table public.plans add constraint plans_owner_id_fkey foreign key(owner_id) references public.profiles(id) on delete set null;
alter table public.attendees drop constraint attendees_user_id_fkey;
alter table public.attendees add constraint attendees_user_id_fkey foreign key(user_id) references public.profiles(id) on delete cascade;
alter table private.invitations drop constraint invitations_claimed_by_fkey;
alter table private.invitations add constraint invitations_claimed_by_fkey foreign key(claimed_by) references public.profiles(id) on delete set null;

create or replace function private.eligible() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
 select 1 from auth.users u join private.tester_roster r on r.email=lower(u.email)
 where u.id=auth.uid() and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
 and r.enabled and (u.banned_until is null or u.banned_until<=now()))
 and not exists(select 1 from public.profiles p where p.id=auth.uid() and p.deletion_requested_at is not null)
 and not exists(select 1 from private.account_deletion_jobs j where j.user_id=auth.uid())
$$;
-- Serialize existing mutation RPCs with deletion, preventing a checked-but-delayed
-- mutation from restoring personal data after the deletion request commits.
create or replace function private.require_tester() returns uuid language plpgsql volatile security definer set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,47));
 if not private.eligible() then raise exception 'Verified invited tester required' using errcode='42501'; end if;
 return auth.uid();
end $$;

create function private.request_account_deletion(p_user uuid,p_session uuid,p_request uuid,p_recovery text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_job private.account_deletion_jobs; v_plan public.plans;
begin
 if p_user is null or p_request is null or p_recovery is null or p_recovery !~ '^[a-f0-9]{64}$' then
 raise exception 'Invalid deletion request' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,47));
 select * into v_job from private.account_deletion_jobs where user_id=p_user;
 if found then
  if v_job.request_id<>p_request or v_job.recovery_hash<>extensions.digest(p_recovery,'sha256') then
   raise exception 'Deletion already requested' using errcode='22023'; end if;
  return jsonb_build_object('requestId',v_job.request_id,'status',v_job.status);
 end if;
 -- Edge validates Auth tokens and recent AMR; SQL also requires that the proof's
 -- session is real, belongs to this user and was freshly created, not refreshed.
 if not exists(select 1 from auth.sessions where id=p_session and user_id=p_user and created_at>=now()-interval '5 minutes' and created_at<=now()+interval '30 seconds')
 or not exists(select 1 from auth.users u join private.tester_roster r on r.email=lower(u.email) where u.id=p_user and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false) and r.enabled and (u.banned_until is null or u.banned_until<=now()))
 then raise exception 'Fresh eligible authentication required' using errcode='42501'; end if;
 insert into private.account_deletion_jobs(request_id,user_id,recovery_hash) values(p_request,p_user,extensions.digest(p_recovery,'sha256'));
 delete from private.tester_roster where email=(select lower(email) from auth.users where id=p_user);
 update public.profiles set deletion_requested_at=now(),display_name='Deleted member',avatar_path=null where id=p_user;
 -- Lock plans in a deterministic order, preserving others' access to cancellation.
 for v_plan in select * from public.plans where owner_id=p_user order by id for update loop
  if v_plan.status='active' and v_plan.starts_at>now() then
   update public.plans set status='cancelled',version=version+1 where id=v_plan.id;
   insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key)
    select v_plan.id,a.user_id,'plan_cancelled','deletion:'||p_request||':'||v_plan.id||':'||a.user_id from public.attendees a
    where a.plan_id=v_plan.id and a.user_id<>p_user on conflict do nothing;
  end if;
  update public.plans set place_label='Meeting place removed',note='',latitude=null,longitude=null where id=v_plan.id;
  update private.invitations set revoked_at=coalesce(revoked_at,now()),intended_email=null where plan_id=v_plan.id;
 end loop;
 update private.invitations set revoked_at=coalesce(revoked_at,now()),claimed_by=null,intended_email=null where claimed_by=p_user;
 delete from public.attendees where user_id=p_user;
 delete from private.device_endpoints where user_id=p_user;
 delete from private.notification_outbox where recipient_id=p_user;
 return jsonb_build_object('requestId',p_request,'status','queued');
end $$;
create function public.request_account_deletion(p_user uuid,p_session uuid,p_request uuid,p_recovery text)
returns jsonb language sql security invoker set search_path='' as $$ select private.request_account_deletion(p_user,p_session,p_request,p_recovery) $$;

create function private.account_deletion_status(p_request uuid,p_recovery text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('requestId',request_id,'status',status) from private.account_deletion_jobs
 where request_id=p_request and p_recovery ~ '^[a-f0-9]{64}$' and recovery_hash=extensions.digest(p_recovery,'sha256')
$$;
create function public.account_deletion_status(p_request uuid,p_recovery text) returns jsonb language sql security invoker set search_path='' as $$ select private.account_deletion_status(p_request,p_recovery) $$;

create function private.claim_account_deletions(p_limit integer default 5) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
 with chosen as (select request_id from private.account_deletion_jobs where status<>'complete' and next_attempt_at<=now() and (lease_until is null or lease_until<now()) order by requested_at for update skip locked limit greatest(1,least(p_limit,10))),
 claimed as (update private.account_deletion_jobs j set status='processing',lease_id=gen_random_uuid(),lease_until=now()+interval '5 minutes',attempts=attempts+1 from chosen c where j.request_id=c.request_id returning j.*)
 select coalesce(jsonb_agg(jsonb_build_object('requestId',request_id,'userId',user_id,'leaseId',lease_id,'attempts',attempts)),'[]'::jsonb) into v_result from claimed;
 return v_result;
end $$;
create function public.claim_account_deletions(p_limit integer default 5) returns jsonb language sql security invoker set search_path='' as $$ select private.claim_account_deletions(p_limit) $$;

create function private.deletion_photo_paths(p_request uuid,p_lease uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid; v_paths jsonb;
begin
 select user_id into v_user from private.account_deletion_jobs where request_id=p_request and lease_id=p_lease and lease_until>now() and status='processing';
 if v_user is null then raise exception 'Deletion lease expired' using errcode='42501'; end if;
 select coalesce(jsonb_agg(name),'[]'::jsonb) into v_paths from (select name from storage.objects where bucket_id='profile-photos' and name like v_user::text||'/%' order by name limit 100) objects;
 return v_paths;
end $$;
create function public.deletion_photo_paths(p_request uuid,p_lease uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.deletion_photo_paths(p_request,p_lease) $$;

create function private.finish_account_deletion(p_request uuid,p_lease uuid,p_complete boolean) returns boolean language plpgsql security definer set search_path='' as $$
declare v_job private.account_deletion_jobs;
begin
 select * into v_job from private.account_deletion_jobs where request_id=p_request for update;
 if not found or v_job.lease_id is distinct from p_lease or v_job.status<>'processing' or v_job.lease_until<=now() then return false; end if;
 if p_complete then
  if exists(select 1 from auth.users where id=v_job.user_id) or exists(select 1 from public.profiles where id=v_job.user_id) or exists(select 1 from storage.objects where bucket_id='profile-photos' and name like v_job.user_id::text||'/%') then
   raise exception 'Cleanup still pending' using errcode='22023'; end if;
  update private.account_deletion_jobs set status='complete',completed_at=now(),lease_id=null,lease_until=null where request_id=p_request;
 else
  update private.account_deletion_jobs set status='queued',next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,least(attempts,7))::integer)),lease_id=null,lease_until=null where request_id=p_request;
 end if;
 return true;
end $$;
create function public.finish_account_deletion(p_request uuid,p_lease uuid,p_complete boolean) returns boolean language sql security invoker set search_path='' as $$ select private.finish_account_deletion(p_request,p_lease,p_complete) $$;

-- No client can invoke privileged lifecycle operations or read recovery hashes.
revoke all on function private.request_account_deletion(uuid,uuid,uuid,text),public.request_account_deletion(uuid,uuid,uuid,text),private.account_deletion_status(uuid,text),public.account_deletion_status(uuid,text),private.claim_account_deletions(integer),public.claim_account_deletions(integer),private.deletion_photo_paths(uuid,uuid),public.deletion_photo_paths(uuid,uuid),private.finish_account_deletion(uuid,uuid,boolean),public.finish_account_deletion(uuid,uuid,boolean) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.request_account_deletion(uuid,uuid,uuid,text),public.request_account_deletion(uuid,uuid,uuid,text),private.account_deletion_status(uuid,text),public.account_deletion_status(uuid,text),private.claim_account_deletions(integer),public.claim_account_deletions(integer),private.deletion_photo_paths(uuid,uuid),public.deletion_photo_paths(uuid,uuid),private.finish_account_deletion(uuid,uuid,boolean),public.finish_account_deletion(uuid,uuid,boolean) to service_role;

-- Storage writes use direct SQL, not the app's mutation RPCs. Fence their
-- metadata transaction with the same user lock, then recheck eligibility.
create function private.guard_photo_write() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.bucket_id='profile-photos' and auth.uid() is not null then
  perform private.require_tester();
 end if;
 return new;
end $$;
revoke all on function private.guard_photo_write() from public,anon,authenticated;
create trigger resbite_photo_write_guard before insert or update on storage.objects for each row execute function private.guard_photo_write();
