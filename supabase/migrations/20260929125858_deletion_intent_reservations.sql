-- Local preparation only. Source release gates remain false. The service caller
-- must verify independent ledger persistence before activate_deletion_intent.
create table private.deletion_intent_reservations (
 request_id uuid primary key,
 user_id uuid not null unique,
 project_ref text not null check(project_ref ~ '^[a-z0-9-]{1,64}$'),
 requested_at_text text not null,
 recovery_hash bytea not null
);
alter table private.deletion_intent_reservations enable row level security;
revoke all on private.deletion_intent_reservations from public,anon,authenticated,service_role;

create function private.prepare_deletion_intent(p_user uuid,p_session uuid,p_request uuid,p_recovery text,p_project text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_intent private.deletion_intent_reservations;
begin
 if p_user is null or p_request is null or p_recovery is null or p_recovery !~ '^[a-f0-9]{64}$'
 or p_project is null or p_project !~ '^[a-z0-9-]{1,64}$' then
  raise exception 'Invalid deletion preparation' using errcode='22023';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,47));
 select * into v_intent from private.deletion_intent_reservations where user_id=p_user for update;
 if found then
  if v_intent.request_id<>p_request or v_intent.recovery_hash<>extensions.digest(p_recovery,'sha256') or v_intent.project_ref<>p_project then
   raise exception 'Deletion preparation conflict' using errcode='22023';
  end if;
 else
  if exists(select 1 from private.account_deletion_jobs where user_id=p_user) then
   raise exception 'Legacy deletion requires reconciliation' using errcode='22023';
  end if;
  if not exists(select 1 from auth.sessions where id=p_session and user_id=p_user and created_at>=now()-interval '5 minutes' and created_at<=now()+interval '30 seconds')
  or not exists(select 1 from auth.users u join private.tester_roster r on r.email=lower(u.email) where u.id=p_user and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false) and r.enabled and (u.banned_until is null or u.banned_until<=now())) then
   raise exception 'Fresh eligible authentication required' using errcode='42501';
  end if;
  insert into private.deletion_intent_reservations(request_id,user_id,project_ref,requested_at_text,recovery_hash)
  values(p_request,p_user,p_project,to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),extensions.digest(p_recovery,'sha256')) returning * into v_intent;
 end if;
 return jsonb_build_object('schema',1,'project',v_intent.project_ref,'userId',v_intent.user_id,'requestId',v_intent.request_id,'requestedAt',v_intent.requested_at_text);
end $$;
create function public.prepare_deletion_intent(p_user uuid,p_session uuid,p_request uuid,p_recovery text,p_project text)
returns jsonb language sql security invoker set search_path='' as $$ select private.prepare_deletion_intent(p_user,p_session,p_request,p_recovery,p_project) $$;

create function private.activate_deletion_intent(p_user uuid,p_request uuid,p_recovery text,p_project text,p_requested_at text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_job private.account_deletion_jobs; v_plan public.plans; v_intent private.deletion_intent_reservations;
begin
 if p_user is null or p_request is null or p_recovery is null or p_recovery !~ '^[a-f0-9]{64}$' then
 raise exception 'Invalid deletion request' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,47));
 select * into v_intent from private.deletion_intent_reservations where user_id=p_user for update;
 if not found or v_intent.request_id<>p_request or v_intent.recovery_hash<>extensions.digest(p_recovery,'sha256')
 or p_project is distinct from v_intent.project_ref or p_requested_at is distinct from v_intent.requested_at_text then
  raise exception 'Verified reserved intent required' using errcode='42501';
 end if;
 select * into v_job from private.account_deletion_jobs where user_id=p_user;
 if found then
  if v_job.request_id<>p_request or v_job.recovery_hash<>extensions.digest(p_recovery,'sha256') then
   raise exception 'Deletion already requested' using errcode='22023'; end if;
  return jsonb_build_object('requestId',v_job.request_id,'status',v_job.status);
 end if;
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

create function public.activate_deletion_intent(p_user uuid,p_request uuid,p_recovery text,p_project text,p_requested_at text)
returns jsonb language sql security invoker set search_path='' as $$ select private.activate_deletion_intent(p_user,p_request,p_recovery,p_project,p_requested_at) $$;
revoke all on function private.prepare_deletion_intent(uuid,uuid,uuid,text,text),public.prepare_deletion_intent(uuid,uuid,uuid,text,text),private.activate_deletion_intent(uuid,uuid,text,text,text),public.activate_deletion_intent(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function private.prepare_deletion_intent(uuid,uuid,uuid,text,text),public.prepare_deletion_intent(uuid,uuid,uuid,text,text),private.activate_deletion_intent(uuid,uuid,text,text,text),public.activate_deletion_intent(uuid,uuid,text,text,text) to service_role;
-- No automatic reservation purge: its recovery window/inventory is not approved.
