-- GI2 guest accounts: deletion and notice delivery for grant holders
-- (docs/superpowers/specs/2026-10-21-gi2-guest-accounts-design.md). LOCAL-ONLY: replaces functions from
-- 20260918001316_account_deletion_lifecycle.sql, 20260929125858_deletion_intent_reservations.sql and
-- 20261015130000_ux3_note_delivery.sql, which the hosted project does not run, and user_eligible and
-- deletion_pending from 20261022120000_gi2_guest_accounts.sql. It redefines user_eligible(), eligible(),
-- notification_recipient_eligible(), deletion_pending(), request_account_deletion(uuid,uuid,uuid,text) and
-- prepare_deletion_intent(uuid,uuid,uuid,text,text), each keeping its grants, and revokes service_role's execute
-- on the public.request_account_deletion wrapper. It re-points eligible() at user_eligible() itself, so it is safe
-- to run after 20260918001316, whose eligible() is roster-only.
-- It goes live with the notification sender and the deletion milestone, after each has its own owner approval,
-- never with the GI2 release, and is applied after those files: they would otherwise put back roster-only bodies.

-- The 20261027120000_phone_accounts body, verbatim: a confirmed email or phone (a roster row needs the confirmed
-- email), and the leaving check delegated to
-- deletion_pending(), which this file widens below, so an account with a deletion request may not use the app
-- either. The hosted order runs that file before this one; locally it runs after, with the same body.
-- eligible() keeps delegating to it.
create or replace function private.user_eligible(p_user uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select p_user is not null and exists (
  select 1 from auth.users u
  where u.id = p_user and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)
    and not coalesce(u.is_anonymous,false)
    and ((u.email_confirmed_at is not null and exists (select 1 from private.tester_roster r where r.email = lower(u.email) and r.enabled)) or private.has_live_grant(u.id))
    and (u.banned_until is null or u.banned_until <= now())
 ) and not private.deletion_pending(p_user)
$$;

-- The signed-in account's eligibility, delegating as in 20261022120000_gi2_guest_accounts: 20260918001316 puts back
-- a roster-only body when it runs after GI2, as it will on the hosted project. Its execute grants are unchanged.
create or replace function private.eligible() returns boolean language sql stable security definer set search_path = '' as $$
 select private.user_eligible(auth.uid())
$$;

-- A notice goes to a roster tester or a live grant holder. Otherwise the 20261015130000_ux3_note_delivery body.
create or replace function private.notification_recipient_eligible(p_outbox bigint) returns boolean
language sql stable security definer set search_path='' as $$
 select exists (
 select 1 from private.notification_outbox o
 join public.profiles p on p.id=o.recipient_id
 join auth.users u on u.id=p.id
 join public.plans plan on plan.id=o.plan_id
 where o.id=p_outbox and p.deletion_requested_at is null
 and (exists(select 1 from private.tester_roster r where r.email=lower(u.email) and r.enabled) or private.has_live_grant(u.id))
 and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
 and (u.banned_until is null or u.banned_until<=now())
 and (plan.owner_id=p.id or exists(select 1 from public.attendees a where a.plan_id=plan.id and a.user_id=p.id
  and (o.kind not in ('plan_changed','guest_note') or a.response in ('accepted','maybe','pending'))))
 and o.created_at>now()-interval '24 hours'
 )
$$;

-- A pending deletion request counts as being deleted too. Otherwise the 20261022120000_gi2_guest_accounts body.
create or replace function private.deletion_pending(p_user uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles p where p.id=p_user and p.deletion_requested_at is not null)
 or exists(select 1 from private.account_deletion_jobs j where j.user_id=p_user)
$$;

-- A grant holder may ask to delete their account, as a roster tester can: the eligibility check accepts an
-- enabled roster row or a live grant. Otherwise the 20260918001316_account_deletion_lifecycle body. The roster
-- row is still deleted; the grant goes with the auth user (on delete cascade).
create or replace function private.request_account_deletion(p_user uuid,p_session uuid,p_request uuid,p_recovery text)
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
 or not exists(select 1 from auth.users u where u.id=p_user and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false) and (exists(select 1 from private.tester_roster r where r.email=lower(u.email) and r.enabled) or private.has_live_grant(u.id)) and (u.banned_until is null or u.banned_until<=now()))
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

-- The gateway's ledger path accepts a grant holder too. Otherwise the 20260929125858_deletion_intent_reservations body.
create or replace function private.prepare_deletion_intent(p_user uuid,p_session uuid,p_request uuid,p_recovery text,p_project text)
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
  or not exists(select 1 from auth.users u where u.id=p_user and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false) and (exists(select 1 from private.tester_roster r where r.email=lower(u.email) and r.enabled) or private.has_live_grant(u.id)) and (u.banned_until is null or u.banned_until<=now())) then
   raise exception 'Fresh eligible authentication required' using errcode='42501';
  end if;
  insert into private.deletion_intent_reservations(request_id,user_id,project_ref,requested_at_text,recovery_hash)
  values(p_request,p_user,p_project,to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),extensions.digest(p_recovery,'sha256')) returning * into v_intent;
 end if;
 return jsonb_build_object('schema',1,'project',v_intent.project_ref,'userId',v_intent.user_id,'requestId',v_intent.request_id,'requestedAt',v_intent.requested_at_text);
end $$;

-- The raw deletion RPC is retired: the gateway goes through prepare/activate_deletion_intent, so the public wrapper
-- is closed to service_role. private.request_account_deletion keeps its grant.
revoke execute on function public.request_account_deletion(uuid,uuid,uuid,text) from service_role;
