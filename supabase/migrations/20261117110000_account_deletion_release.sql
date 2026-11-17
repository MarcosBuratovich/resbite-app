-- Account deletion release (spec C2; decisions D-4, D-19, D-20, UGC-15, AS-R1, AS-R2 and AS-R3). Every account can
-- delete itself in the app with a fresh proof, suspended accounts too (D-19). Banned, web-only and under-18 accounts are
-- deleted by the owner with supabase/ops/delete-account.sql, which runs the same lifecycle (AS-R3). There is one request
-- path (D-4): request_account_deletion closes and erases the account in one transaction. A legal hold (UGC-15) runs only
-- the close step and parks the job as held until the hold is lifted. A deleted host's group chat stops (D-20). An
-- account's suspension moves to the suspension history (AS-R1), and the reports it filed lose only its name (AS-R2).
--
-- Hosted-compatible. Two functions exist on hosted and are redefined from their hosted bodies, with only the lines
-- named in their comments changed; grants are unchanged (create or replace keeps them):
-- private.require_tester() from 20260917190517_resbite_private_tester_foundation.sql, and
-- private.deletion_pending(uuid) from 20261022120000_gi2_guest_accounts.sql. Everything else is new on hosted.
--
-- It replaces the deletion half of the never-apply files 20260918001316_account_deletion_lifecycle.sql,
-- 20260923152943_deletion_receipt_retention.sql, 20260929125858_deletion_intent_reservations.sql and
-- 20261022120001_gi2_local_delivery_and_deletion.sql. The local replay still runs them first, so every statement here
-- also runs cleanly after them: if not exists, create or replace, and named constraints dropped and added again.
--
-- Rollback (hosted only): supabase/rollback/20261117110000_account_deletion_release.rollback.sql.

-- 1. The jobs, the legal hold, the suspension history, the September keys and the account's lock.

-- The deletion jobs: the September table (20260918001316_account_deletion_lifecycle.sql:2-13), made here on hosted.
-- A job may also be held (UGC-15): a legal hold parks it after the close step. The status the person sees still reads
-- queued.
create table if not exists private.account_deletion_jobs (
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
alter table private.account_deletion_jobs drop constraint account_deletion_jobs_status_check;
alter table private.account_deletion_jobs add constraint account_deletion_jobs_status_check
 check (status in ('held','queued','processing','complete'));
alter table private.account_deletion_jobs enable row level security;
revoke all on private.account_deletion_jobs from public, anon, authenticated, service_role;
create index if not exists account_deletion_pending_idx on private.account_deletion_jobs(next_attempt_at) where status<>'complete';
create index if not exists account_deletion_completed_idx on private.account_deletion_jobs(completed_at) where status='complete';

-- The objects shared with plan 6 (docs/superpowers/plans/2026-11-17-asr-6-retention-and-team-scripts.md, "Shared with
-- plan 2"), in its DDL word for word. This file runs first, on hosted and in the local replay, so it makes them; plan 6's
-- guarded DDL then finds them in place. Each is made only where absent and carries this file's marker when it is made
-- here, so each plan's rollback drops only its own.
-- A legal hold names an account or a series. For deletion it is account-scoped (UGC-15): a hold not lifted keeps the
-- account's files and Auth user until it is lifted. A series hold is for plan 6's retention jobs.
-- The suspension history keeps a suspension after it ends: lifted, or the account deleted (AS-R1). Plan 6 purges it 12
-- months after ended_at.
do $migration$ begin
 if pg_catalog.to_regclass('private.legal_holds') is null then
  create table if not exists private.legal_holds (
   id bigint generated always as identity primary key,
   user_id uuid null,          -- no foreign key: a hold outlives the account
   series_id uuid null,
   reason text not null check (reason in ('csea','intimate_image','threat','police','nca','ofcom','coroner','court','claim')),
   case_ref text not null check (case_ref ~ '^[A-Za-z0-9-]{1,40}$'),
   review_on date not null,
   set_at timestamptz not null default now(),
   lifted_at timestamptz null,
   check ((user_id is null) <> (series_id is null))
  );
  comment on table private.legal_holds is 'resbite 20261117110000';
 end if;
 -- private.account_held(p_user uuid) returns boolean: a hold not lifted names the account (false for null).
 if pg_catalog.to_regprocedure('private.account_held(uuid)') is null then
  create function private.account_held(p_user uuid) returns boolean language sql stable security definer set search_path = '' as $fn$
   select exists(select 1 from private.legal_holds h where h.user_id = p_user and h.lifted_at is null)
  $fn$;
  comment on function private.account_held(uuid) is 'resbite 20261117110000';
 end if;
 if pg_catalog.to_regclass('private.suspension_history') is null then
  create table if not exists private.suspension_history (
   id bigint generated always as identity primary key,
   user_id uuid null,          -- null once the account is deleted (AS-R1)
   report_id bigint null,
   suspended_at timestamptz not null,
   ended_at timestamptz not null,
   how text not null check (how in ('lifted','account_deleted'))
  );
  comment on table private.suspension_history is 'resbite 20261117110000';
 end if;
end $migration$;
create index if not exists legal_holds_user_idx on private.legal_holds(user_id) where lifted_at is null;
create index if not exists legal_holds_series_idx on private.legal_holds(series_id) where lifted_at is null;
alter table private.legal_holds enable row level security;
alter table private.suspension_history enable row level security;
revoke all on private.legal_holds, private.suspension_history from public, anon, authenticated, service_role;
revoke all on function private.account_held(uuid) from public, anon, authenticated, service_role;

-- The September keys (20260918001316_account_deletion_lifecycle.sql:18-25), the same statements, so the local replay
-- re-runs them identically. A deleted host's resbites stay for their guests with no organiser, a deleted guest's places
-- go, and a claimed invitation forgets who claimed it.
alter table public.plans alter column owner_id drop not null;
alter table public.plans drop constraint plans_owner_id_fkey;
alter table public.plans add constraint plans_owner_id_fkey foreign key(owner_id) references public.profiles(id) on delete set null;
alter table public.attendees drop constraint attendees_user_id_fkey;
alter table public.attendees add constraint attendees_user_id_fkey foreign key(user_id) references public.profiles(id) on delete cascade;
alter table private.invitations drop constraint invitations_claimed_by_fkey;
alter table private.invitations add constraint invitations_claimed_by_fkey foreign key(claimed_by) references public.profiles(id) on delete set null;

-- The worker RPCs' public wrappers run as service_role and call their private bodies. Hosted lacks this grant; the local
-- lifecycle file (20260918001316) makes it.
grant usage on schema private to service_role;

-- From 20260917190517_resbite_private_tester_foundation.sql:94-98. Two lines change: stable becomes volatile, and
-- "perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,47));" becomes the first line
-- after begin. Every mutation that checks the account then queues behind a deletion of that account, and sees it once
-- the deletion commits. This is 20260918001316_account_deletion_lifecycle.sql:37-42's body.
create or replace function private.require_tester() returns uuid language plpgsql volatile security definer set search_path = '' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,47));
 if not private.eligible() then raise exception 'Verified invited tester required' using errcode='42501'; end if;
 return auth.uid();
end $$;

-- From 20261022120000_gi2_guest_accounts.sql:60-62. One line is added, the second: a deletion job counts as being
-- deleted too. This is 20261022120001_gi2_local_delivery_and_deletion.sql:55-58's body.
create or replace function private.deletion_pending(p_user uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles p where p.id=p_user and p.deletion_requested_at is not null)
 or exists(select 1 from private.account_deletion_jobs j where j.user_id=p_user)
$$;

-- 2. The request lifecycle: one path for every account (D-4), the close and erase steps, the hold (UGC-15), the team's
-- deletions (AS-R3) and the replay after a restore. Each function is the database's own but the request and the status,
-- which the delete-account Edge function calls as service_role. The bodies are the open beta's
-- (20261116120000_open_beta.sql:208-273), split in two, with only the changes named in each comment.

-- The close step (UGC-15), which a held request runs too: the account's future resbites are cancelled and their guests
-- told. 20261116120000_open_beta.sql:232-239 only (the plan loop's comment, lock and cancellations): the owned plans
-- locked by id, each active future one cancelled, one version on, with a plan_cancelled notice to each guest. The caller
-- holds the account's lock and the deletions' lock, and has set the deletion's flag, so no chat line is written.
create or replace function private.close_account(p_user uuid, p_request uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_plan public.plans;
begin
 -- Lock plans in a deterministic order, preserving others' access to cancellation.
 for v_plan in select * from public.plans where owner_id=p_user order by id for update loop
  if v_plan.status='active' and v_plan.starts_at>now() then
   update public.plans set status='cancelled',version=version+1 where id=v_plan.id;
   insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key)
    select v_plan.id,a.user_id,'plan_cancelled','deletion:'||p_request||':'||v_plan.id||':'||a.user_id from public.attendees a
    where a.plan_id=v_plan.id and a.user_id<>p_user on conflict do nothing;
  end if;
 end loop;
end $$;

-- The erase step: everything else, at once when there is no hold, or by the worker once a hold is lifted. The open beta
-- lines, in this order and with these changes:
-- - :230-231 (the roster row, the profile), then the owned-plans loop again, now with :240-241 only (the place, the
--   invitations), then :243-249 and :253-254 (the blocks);
-- - AS-R2: the reports the account filed lose its id instead of going (:255). reports.reporter_id keeps its on delete
--   cascade: the id is cleared first;
-- - AS-R1: after :256-257, the account's suspension moves to the history, without the account: the same report, its
--   start and the end now, how 'account_deleted';
-- - D-20, ASR2-6: the ordered chat pass (:263-264) also takes the chat row of every group of a series the account owns,
--   and those still running stop now, so a deleted host's group closes 48 hours later (private.chat_closes_at). They
--   are taken in the same pass, in series order, as the rows of the chats it wrote in.
-- Then :265-271.
create or replace function private.erase_account(p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_plan public.plans;
begin
 delete from private.tester_roster where email=(select lower(email) from auth.users where id=p_user);
 update public.profiles set deletion_requested_at=now(),display_name='Deleted member',avatar_path=null where id=p_user;
 for v_plan in select * from public.plans where owner_id=p_user order by id for update loop
  update public.plans set place_label='Meeting place removed',note='',latitude=null,longitude=null where id=v_plan.id;
  update private.invitations set revoked_at=coalesce(revoked_at,now()),intended_email=null where plan_id=v_plan.id;
 end loop;
 update private.invitations set revoked_at=coalesce(revoked_at,now()),claimed_by=null,intended_email=null where claimed_by=p_user;
 delete from public.connections where p_user in (user_a,user_b);
 delete from private.connection_refusals where from_user=p_user or to_user=p_user;
 -- Circles of trust: nobody was brought by a deleted account, and its removal records go.
 update public.attendees set brought_by=null where brought_by=p_user;
 update private.phone_invitations set brought_by=null where brought_by=p_user;
 delete from private.plan_removals where user_id=p_user;
 -- Chat safety (CH-P18, G-S11, Decision 7): the account's blocks both ways (locked in one order first), its name on the
 -- reports it filed (AS-R2), its chat-rules acceptances and its moderator row. Reports about it stay, with their frozen
 -- words. After the guest rows, and blocks before reports, as the fold takes them, so the two queue instead of
 -- deadlocking (SR3, SR5).
 perform 1 from private.blocks where blocker_id=p_user or blocked_id=p_user order by blocker_id, blocked_id for update;
 delete from private.blocks where blocker_id=p_user or blocked_id=p_user;
 update private.reports set reporter_id=null where reporter_id=p_user;
 delete from private.chat_rules_acceptances where user_id=p_user;
 delete from private.moderators where user_id=p_user;
 -- AS-R1: the suspension is kept as history, with its report and dates and without the account.
 insert into private.suspension_history(user_id,report_id,suspended_at,ended_at,how)
  select null,s.report_id,s.at,now(),'account_deleted' from private.suspensions s where s.user_id=p_user;
 delete from private.suspensions where user_id=p_user;
 -- Chat (K-B2, K-N5, Decision 14, H27): the account's messages and announcements lose their words and their author;
 -- those still sent read deleted, and one a host removed stays removed. Each chat's row is locked first, in one order,
 -- before the message rows, as delete_message, remove_message and the stats trigger take them, so they never deadlock
 -- with each other (H28). The pass also takes the chat row of every group of a series the account owns, and those
 -- still running stop now (D-20, ASR2-6). A deleted announcement unpins (K-S12). A system line is left as it is,
 -- payload and all (K-S3): the names map shows the person as nobody. Its reads and mutes go.
 perform 1 from public.chats c where c.series_id in (select m.series_id from public.messages m
  where m.author_id=p_user and m.kind in ('message','announcement'))
  or (c.is_group and c.series_id in (select p.series_id from public.plans p where p.owner_id=p_user)) order by c.series_id for update;
 update public.chats set stopped_at=now()
  where is_group and stopped_at is null and series_id in (select p.series_id from public.plans p where p.owner_id=p_user);
 update public.messages set state=case when state='sent' then 'deleted' else state end,body=null,author_id=null
  where author_id=p_user and kind in ('message','announcement');
 delete from public.chat_reads where user_id=p_user;
 delete from public.chat_mutes where user_id=p_user;
 delete from public.attendees where user_id=p_user;
 delete from private.device_endpoints where user_id=p_user;
 delete from private.notification_outbox where recipient_id=p_user;
end $$;

-- Queue a deletion: the job, the close step, then the erase step, or, under a hold (UGC-15), only the account's
-- devices and queued notices beside the close step, the job parked as held until the hold is lifted. The caller holds
-- the account's lock (hashtextextended(p_user::text,47)). Idempotent per request: the same request and hash return
-- the job, another raises 22023. It answers the true status, held included.
-- ASR2-5 (GR2): two deletions queue one after the other on one lock, taken after the account's and before any row, so
-- two hosts who each wrote in the other's Edit-stopped group never deadlock (the cancellation writes the group's stop
-- time in plan order, before the ordered chat pass).
create or replace function private.queue_account_deletion(p_user uuid, p_request uuid, p_recovery_hash bytea) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_job private.account_deletion_jobs; v_held boolean;
begin
 if p_user is null or p_request is null or p_recovery_hash is null then
  raise exception 'Invalid deletion request' using errcode='22023'; end if;
 select * into v_job from private.account_deletion_jobs where user_id=p_user;
 if found then
  if v_job.request_id<>p_request or v_job.recovery_hash<>p_recovery_hash then
   raise exception 'Deletion already requested' using errcode='22023'; end if;
  return jsonb_build_object('requestId',v_job.request_id,'status',v_job.status);
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('account_deletion',0));
 -- Chat (K-S2): from here to the commit, the chat-line triggers write nothing, so the cancellations and the scrub below
 -- write no line.
 perform set_config('resbite.system','deletion',true);
 v_held := private.account_held(p_user);
 insert into private.account_deletion_jobs(request_id,user_id,recovery_hash,status)
  values(p_request,p_user,p_recovery_hash,case when v_held then 'held' else 'queued' end);
 perform private.close_account(p_user,p_request);
 if v_held then
  delete from private.device_endpoints where user_id=p_user;
  delete from private.notification_outbox where recipient_id=p_user;
 else
  perform private.erase_account(p_user);
 end if;
 return jsonb_build_object('requestId',p_request,'status',case when v_held then 'held' else 'queued' end);
end $$;

-- The request (D-4, D-19): the open beta body (:208-225) down to its eligibility check, then the queue above for the
-- rest, with two changes. The check asks only for a fresh session of this user, a confirmed email or phone, and an
-- account that isn't anonymous: a suspended account may delete itself, and a banned one (it can't sign in) is deleted
-- with supabase/ops/delete-account.sql. And held reads queued in every answer, so it never tips anyone off (UGC-15).
-- An existing request answers first, whatever the session, so a retry after the proof has gone stale returns it
-- (Review Focus 1).
create or replace function private.request_account_deletion(p_user uuid,p_session uuid,p_request uuid,p_recovery text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_job private.account_deletion_jobs; v_result jsonb;
begin
 if p_user is null or p_request is null or p_recovery is null or p_recovery !~ '^[a-f0-9]{64}$' then
 raise exception 'Invalid deletion request' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,47));
 select * into v_job from private.account_deletion_jobs where user_id=p_user;
 if found then
  if v_job.request_id<>p_request or v_job.recovery_hash<>extensions.digest(p_recovery,'sha256') then
   raise exception 'Deletion already requested' using errcode='22023'; end if;
  return jsonb_build_object('requestId',v_job.request_id,'status',case when v_job.status='held' then 'queued' else v_job.status end);
 end if;
 -- Edge validates Auth tokens and recent AMR; SQL also requires that the proof's
 -- session is real, belongs to this user and was freshly created, not refreshed.
 if not exists(select 1 from auth.sessions where id=p_session and user_id=p_user and created_at>=now()-interval '5 minutes' and created_at<=now()+interval '30 seconds')
 or not exists(select 1 from auth.users u where u.id=p_user and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null) and not coalesce(u.is_anonymous,false))
 then raise exception 'Fresh eligible authentication required' using errcode='42501'; end if;
 v_result := private.queue_account_deletion(p_user,p_request,extensions.digest(p_recovery,'sha256'));
 return jsonb_build_object('requestId',v_result->'requestId','status',case when v_result->>'status'='held' then 'queued' else v_result->>'status' end);
end $$;
create or replace function public.request_account_deletion(p_user uuid,p_session uuid,p_request uuid,p_recovery text)
returns jsonb language sql security invoker set search_path='' as $$ select private.request_account_deletion(p_user,p_session,p_request,p_recovery) $$;

-- A receipt's status, with the recovery token the app keeps: 20260918001316_account_deletion_lifecycle.sql:85-89, with
-- held read as queued (UGC-15).
create or replace function private.account_deletion_status(p_request uuid,p_recovery text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('requestId',request_id,'status',case when status='held' then 'queued' else status end) from private.account_deletion_jobs
 where request_id=p_request and p_recovery ~ '^[a-f0-9]{64}$' and recovery_hash=extensions.digest(p_recovery,'sha256')
$$;
create or replace function public.account_deletion_status(p_request uuid,p_recovery text) returns jsonb language sql security invoker set search_path='' as $$ select private.account_deletion_status(p_request,p_recovery) $$;

-- The team's deletion (AS-R3): banned, web-only and under-18 accounts, from supabase/ops/delete-account.sql. The same
-- lifecycle, with a request id and a recovery secret nobody holds (the team checks the job itself). An account that
-- already has a job answers it, so running the script twice is safe. It answers the true status.
create or replace function private.operator_account_deletion(p_user uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_job private.account_deletion_jobs;
begin
 if p_user is null then raise exception 'No such account' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,47));
 if not exists(select 1 from auth.users u where u.id=p_user) then raise exception 'No such account' using errcode='22023'; end if;
 select * into v_job from private.account_deletion_jobs where user_id=p_user;
 if found then return jsonb_build_object('requestId',v_job.request_id,'status',v_job.status); end if;
 return private.queue_account_deletion(p_user,gen_random_uuid(),extensions.digest(encode(extensions.gen_random_bytes(32),'hex'),'sha256'));
end $$;

-- The replay after a backup restore (ASR2-10, qa/deletion-restore-procedure.md): a receipt exported from the live
-- database before the restore, queued again with its original request id and hash, so the person's saved receipt still
-- resolves. gone: no Auth user (nothing to delete); present: the account has a job already; replayed.
create or replace function private.replay_account_deletion(p_user uuid, p_request uuid, p_recovery_hash bytea) returns text
language plpgsql security definer set search_path='' as $$
begin
 if p_user is null or p_request is null or p_recovery_hash is null then
  raise exception 'Invalid deletion request' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,47));
 if not exists(select 1 from auth.users u where u.id=p_user) then return 'gone'; end if;
 if exists(select 1 from private.account_deletion_jobs j where j.user_id=p_user) then return 'present'; end if;
 perform private.queue_account_deletion(p_user,p_request,p_recovery_hash);
 return 'replayed';
end $$;

-- The steps are the database's own. The request and the status are service_role's (the Edge function), which reverses
-- the GI2 companion's revoke on the public wrapper (20261022120001_gi2_local_delivery_and_deletion.sql:133, D-4).
revoke all on function private.queue_account_deletion(uuid,uuid,bytea), private.close_account(uuid,uuid), private.erase_account(uuid),
 private.operator_account_deletion(uuid), private.replay_account_deletion(uuid,uuid,bytea) from public, anon, authenticated, service_role;
revoke all on function private.request_account_deletion(uuid,uuid,uuid,text), public.request_account_deletion(uuid,uuid,uuid,text),
 private.account_deletion_status(uuid,text), public.account_deletion_status(uuid,text) from public, anon, authenticated;
grant execute on function private.request_account_deletion(uuid,uuid,uuid,text), public.request_account_deletion(uuid,uuid,uuid,text),
 private.account_deletion_status(uuid,text), public.account_deletion_status(uuid,text) to service_role;

-- 3. The worker (ASR2-9), the photo guard and the receipts (ASR2-10). The cleanup-account Edge function claims jobs,
-- removes the account's files in both buckets through the Storage API, removes the Auth user, then finishes the job.
-- purge-deletion-receipts removes a complete receipt 30 days after completion. Both run as service_role, from
-- supabase/ops/schedule-account-deletion.sql. A hold (UGC-15) stops both: a held account's files, Auth user and
-- receipt stay until the hold is lifted.

-- The claim: 20260918001316_account_deletion_lifecycle.sql:91-98, with two changes.
-- - First it resumes up to 5 held jobs whose account is no longer held, oldest first: each takes the account's lock,
--   then the deletions' lock (ASR2-5), without waiting, and is skipped while either is busy. Under them, with the
--   deletion's flag set as the request sets it, it runs the erase step the hold parked, and the job is queued now.
-- - It claims only queued or processing jobs whose account isn't held, so a hold set after acceptance, even in the
--   middle of a claimed job, keeps the account's files and Auth user once the lease has passed (Review Focus 2).
create or replace function private.claim_account_deletions(p_limit integer default 5) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb; v_job private.account_deletion_jobs;
begin
 for v_job in select * from private.account_deletion_jobs j where j.status='held' and not private.account_held(j.user_id)
  order by j.requested_at limit 5 loop
  continue when not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(v_job.user_id::text,47));
  continue when not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('account_deletion',0));
  perform 1 from private.account_deletion_jobs where request_id=v_job.request_id and status='held' for update skip locked;
  continue when not found or private.account_held(v_job.user_id);
  perform set_config('resbite.system','deletion',true);
  perform private.erase_account(v_job.user_id);
  update private.account_deletion_jobs set status='queued',next_attempt_at=now() where request_id=v_job.request_id;
 end loop;
 with chosen as (select request_id from private.account_deletion_jobs j where status in ('queued','processing') and next_attempt_at<=now() and (lease_until is null or lease_until<now()) and not private.account_held(j.user_id) order by requested_at for update skip locked limit greatest(1,least(p_limit,10))),
 claimed as (update private.account_deletion_jobs j set status='processing',lease_id=gen_random_uuid(),lease_until=now()+interval '5 minutes',attempts=attempts+1 from chosen c where j.request_id=c.request_id returning j.*)
 select coalesce(jsonb_agg(jsonb_build_object('requestId',request_id,'userId',user_id,'leaseId',lease_id,'attempts',attempts)),'[]'::jsonb) into v_result from claimed;
 return v_result;
end $$;
create or replace function public.claim_account_deletions(p_limit integer default 5) returns jsonb language sql security invoker set search_path='' as $$ select private.claim_account_deletions(p_limit) $$;

-- The account's files: 20260918001316_account_deletion_lifecycle.sql:101-108 (deletion_photo_paths), renamed, with
-- three changes. It refuses while a hold names the account (Review Focus 2). It lists both buckets under the account's
-- folder, profile-photos/<uid>/ and plan-covers/<uid>/ (ASR2-9). And each entry names its bucket, ordered by bucket
-- then name, at most 100.
drop function if exists public.deletion_photo_paths(uuid,uuid);
drop function if exists private.deletion_photo_paths(uuid,uuid);
create or replace function private.deletion_storage_objects(p_request uuid,p_lease uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid; v_objects jsonb;
begin
 select user_id into v_user from private.account_deletion_jobs where request_id=p_request and lease_id=p_lease and lease_until>now() and status='processing';
 if v_user is null then raise exception 'Deletion lease expired' using errcode='42501'; end if;
 if private.account_held(v_user) then raise exception 'Deletion on hold' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('bucket',bucket_id,'name',name) order by bucket_id,name),'[]'::jsonb) into v_objects
  from (select bucket_id,name from storage.objects where bucket_id in ('profile-photos','plan-covers') and name like v_user::text||'/%'
   order by bucket_id,name limit 100) objects;
 return v_objects;
end $$;
create or replace function public.deletion_storage_objects(p_request uuid,p_lease uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.deletion_storage_objects(p_request,p_lease) $$;

-- The finish: 20260918001316_account_deletion_lifecycle.sql:111-124, with the completion check also covering
-- plan-covers, so a cover left after the Auth user has gone keeps the job open (Review Focus 5).
create or replace function private.finish_account_deletion(p_request uuid,p_lease uuid,p_complete boolean) returns boolean language plpgsql security definer set search_path='' as $$
declare v_job private.account_deletion_jobs;
begin
 select * into v_job from private.account_deletion_jobs where request_id=p_request for update;
 if not found or v_job.lease_id is distinct from p_lease or v_job.status<>'processing' or v_job.lease_until<=now() then return false; end if;
 if p_complete then
  if exists(select 1 from auth.users where id=v_job.user_id) or exists(select 1 from public.profiles where id=v_job.user_id) or exists(select 1 from storage.objects where bucket_id in ('profile-photos','plan-covers') and name like v_job.user_id::text||'/%') then
   raise exception 'Cleanup still pending' using errcode='22023'; end if;
  update private.account_deletion_jobs set status='complete',completed_at=now(),lease_id=null,lease_until=null where request_id=p_request;
 else
  update private.account_deletion_jobs set status='queued',next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,least(attempts,7))::integer)),lease_id=null,lease_until=null where request_id=p_request;
 end if;
 return true;
end $$;
create or replace function public.finish_account_deletion(p_request uuid,p_lease uuid,p_complete boolean) returns boolean language sql security invoker set search_path='' as $$ select private.finish_account_deletion(p_request,p_lease,p_complete) $$;

-- The photo guard: 20260918001316_account_deletion_lifecycle.sql:134-142, which plan 6 consumes. Storage writes use
-- direct SQL, not the app's mutation RPCs, so a profile-photos write from a signed-in account takes the account's lock
-- and checks it through require_tester: a late upload can't land in a deleting account. Made only where absent: the
-- function with this file's marker (the local replay keeps 20260923152816_orphan_profile_photo_cleanup.sql's stronger
-- body), the trigger with no comment. On hosted, commenting or dropping a trigger on storage.objects needs that table's
-- owner (supabase_storage_admin), which the applying role is not, while creating one needs only the TRIGGER privilege
-- (the final review's account-deletion #1). The function's marker stands for both: the rollback drops the function with
-- cascade, which takes the trigger with it and needs only the function's owner.
do $migration$ begin
 if pg_catalog.to_regprocedure('private.guard_photo_write()') is null then
  create function private.guard_photo_write() returns trigger language plpgsql security definer set search_path='' as $fn$
  begin
   if new.bucket_id='profile-photos' and auth.uid() is not null then
    perform private.require_tester();
   end if;
   return new;
  end $fn$;
  revoke all on function private.guard_photo_write() from public,anon,authenticated;
  comment on function private.guard_photo_write() is 'resbite 20261117110000';
 end if;
 if not exists(select 1 from pg_catalog.pg_trigger where tgrelid='storage.objects'::regclass and tgname='resbite_photo_write_guard') then
  create trigger resbite_photo_write_guard before insert or update on storage.objects for each row execute function private.guard_photo_write();
 end if;
end $migration$;

-- The receipts: 20260923152943_deletion_receipt_retention.sql:8-32, with three changes. A receipt stays while a hold
-- names its account. The storage check covers both buckets. And the photo-cleanup fences (:19-20) apply only where
-- their tables exist (the local replay today, hosted once plan 6 brings them): the statement is written twice, with
-- them and without, so neither is planned against a table that isn't there.
create or replace function private.purge_completed_deletion_receipts(p_limit integer default 100)
returns integer language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
 if p_limit is null or p_limit not between 1 and 100 then
  raise exception 'Invalid purge batch size' using errcode='22023';
 end if;
 if pg_catalog.to_regclass('private.profile_photo_cleanup_jobs') is not null then
  with candidates as (
   select j.request_id from private.account_deletion_jobs j
   where j.status='complete' and j.completed_at<=now()-interval '30 days'
     and j.lease_id is null and j.lease_until is null
     and not private.account_held(j.user_id)
     and not exists(select 1 from private.profile_photo_retired_paths r where r.user_id=j.user_id)
     and not exists(select 1 from private.profile_photo_cleanup_jobs p where p.user_id=j.user_id)
     and not exists(select 1 from auth.users u where u.id=j.user_id)
     and not exists(select 1 from public.profiles p where p.id=j.user_id)
     and not exists(select 1 from storage.objects o
       where o.bucket_id in ('profile-photos','plan-covers') and o.name like j.user_id::text||'/%')
   order by j.completed_at,j.request_id
   limit p_limit for update of j skip locked
  ), removed as (
   delete from private.account_deletion_jobs j using candidates c
    where j.request_id=c.request_id returning j.request_id
  ) select count(*) into v_count from removed;
 else
  with candidates as (
   select j.request_id from private.account_deletion_jobs j
   where j.status='complete' and j.completed_at<=now()-interval '30 days'
     and j.lease_id is null and j.lease_until is null
     and not private.account_held(j.user_id)
     and not exists(select 1 from auth.users u where u.id=j.user_id)
     and not exists(select 1 from public.profiles p where p.id=j.user_id)
     and not exists(select 1 from storage.objects o
       where o.bucket_id in ('profile-photos','plan-covers') and o.name like j.user_id::text||'/%')
   order by j.completed_at,j.request_id
   limit p_limit for update of j skip locked
  ), removed as (
   delete from private.account_deletion_jobs j using candidates c
    where j.request_id=c.request_id returning j.request_id
  ) select count(*) into v_count from removed;
 end if;
 return v_count;
end $$;
create or replace function public.purge_completed_deletion_receipts(p_limit integer default 100)
returns integer language sql security invoker set search_path='' as $$
 select private.purge_completed_deletion_receipts(p_limit)
$$;

-- The worker RPCs are service_role's (the two Edge functions), never an app client's. On hosted the new public
-- wrappers come with Supabase's default grants, which these revokes remove.
revoke all on function private.claim_account_deletions(integer), public.claim_account_deletions(integer),
 private.deletion_storage_objects(uuid,uuid), public.deletion_storage_objects(uuid,uuid),
 private.finish_account_deletion(uuid,uuid,boolean), public.finish_account_deletion(uuid,uuid,boolean),
 private.purge_completed_deletion_receipts(integer), public.purge_completed_deletion_receipts(integer) from public, anon, authenticated;
grant execute on function private.claim_account_deletions(integer), public.claim_account_deletions(integer),
 private.deletion_storage_objects(uuid,uuid), public.deletion_storage_objects(uuid,uuid),
 private.finish_account_deletion(uuid,uuid,boolean), public.finish_account_deletion(uuid,uuid,boolean),
 private.purge_completed_deletion_receipts(integer), public.purge_completed_deletion_receipts(integer) to service_role;
