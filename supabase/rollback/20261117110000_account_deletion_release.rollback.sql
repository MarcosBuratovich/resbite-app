-- Rollback for 20261117110000_account_deletion_release.sql (App Store readiness plan 2, spec C2). For the hosted
-- project only: the local replay never runs it. Run as one transaction, only with the owner's approval, this file
-- first, then, only to undo the open beta too, the open beta's (it then finds request_account_deletion gone and skips
-- it; run before this file, it refuses):
--   begin; \i supabase/rollback/20261117110000_account_deletion_release.rollback.sql; commit;
--   begin; \i supabase/rollback/20261117110000_account_deletion_release.rollback.sql;
--          \i supabase/rollback/20261116120000_open_beta.rollback.sql; commit;
-- Before it:
--   - roll back every later migration that uses what this file made, latest first (plan 6's 20261117130000 calls
--     operator_account_deletion, reads the jobs, shares the legal holds and builds its photo guard on this one);
--   - unschedule the two workers (supabase/ops/schedule-account-deletion.sql, "To undo"), and turn deletion off in the
--     delete-account, cleanup-account and purge-deletion-receipts functions (ACCOUNT_DELETION_ENABLED false): from here
--     on the RPCs they call are gone.
-- It refuses, changing nothing, with 42501 'A deletion has run on this project: roll back by hand', once anything has
-- used it: a deletion job (a receipt, pending or complete), a legal hold, a suspension history row, or a resbite whose
-- owner was deleted (owner_id null, so the not null can't come back). Rolling back would lose those records: undo by
-- hand, keeping them elsewhere first.
-- Past the guard nothing is lost but the objects: the jobs, the holds and the history are empty. What people notice:
-- Delete account in the app fails (its request is gone), and a suspended account can't delete itself; banned,
-- web-only and under-18 accounts can't be deleted with supabase/ops/delete-account.sql. Removing an Auth user who owns
-- a resbite or is a guest fails again, as it did before this file.
-- In this order:
--   1. drops the six public wrappers and the eleven private functions it made (the request, the status, the close and
--      erase steps, the queue, the team's deletion, the replay, and the worker's claim, storage listing, finish and
--      receipt purge);
--   2. restores, byte for byte and keeping their grants (create or replace):
--        private.require_tester()        from 20260917190517_resbite_private_tester_foundation.sql:94-98
--        private.deletion_pending(uuid)  from 20261022120000_gi2_guest_accounts.sql:60-62
--      deletion_pending no longer reads the jobs, so they can go;
--   3. drops private.account_deletion_jobs (its indexes with it);
--   4. puts back the three September keys with no on delete rule (plans.owner_id, attendees.user_id,
--      invitations.claimed_by, each to public.profiles) and public.plans.owner_id not null;
--   5. drops the trigger resbite_photo_write_guard on storage.objects and private.guard_photo_write(), then
--      private.account_held(uuid), private.legal_holds and private.suspension_history (the objects shared with plan 6),
--      each only when its comment reads 'resbite 20261117110000': made here, not by another migration;
--   6. revokes service_role's use of the private schema, which hosted didn't grant before this file.
-- On hosted, dropping the trigger on storage.objects needs the rights on that table its creation (and its comment)
-- needed, which 20261031120000_creating_a_resbite.sql's storage policies already used.
-- Rehearsed in supabase/tests/hosted-baseline/20261117110000_account_deletion_release.after.sql.

do $$ declare t text; v_used boolean; begin
 foreach t in array array['private.account_deletion_jobs','private.legal_holds','private.suspension_history'] loop
  if pg_catalog.to_regclass(t) is not null then
   execute format('select exists(select 1 from %s)', t) into v_used;
   if v_used then raise exception 'A deletion has run on this project: roll back by hand' using errcode='42501'; end if;
  end if;
 end loop;
 if exists(select 1 from public.plans where owner_id is null) then
  raise exception 'A deletion has run on this project: roll back by hand' using errcode='42501';
 end if;
end $$;

-- 1. The six public wrappers, then the eleven private functions.
drop function if exists public.request_account_deletion(uuid,uuid,uuid,text), public.account_deletion_status(uuid,text),
 public.claim_account_deletions(integer), public.deletion_storage_objects(uuid,uuid),
 public.finish_account_deletion(uuid,uuid,boolean), public.purge_completed_deletion_receipts(integer);
drop function if exists private.request_account_deletion(uuid,uuid,uuid,text), private.account_deletion_status(uuid,text),
 private.close_account(uuid,uuid), private.erase_account(uuid), private.queue_account_deletion(uuid,uuid,bytea),
 private.operator_account_deletion(uuid), private.replay_account_deletion(uuid,uuid,bytea),
 private.claim_account_deletions(integer), private.deletion_storage_objects(uuid,uuid),
 private.finish_account_deletion(uuid,uuid,boolean), private.purge_completed_deletion_receipts(integer);

-- 2. The two hosted bodies, verbatim.
-- 20260917190517_resbite_private_tester_foundation.sql:94-98.
create or replace function private.require_tester() returns uuid language plpgsql stable security definer set search_path = '' as $$
begin
 if not private.eligible() then raise exception 'Verified invited tester required' using errcode='42501'; end if;
 return auth.uid();
end $$;

-- 20261022120000_gi2_guest_accounts.sql:60-62.
create or replace function private.deletion_pending(p_user uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles p where p.id=p_user and p.deletion_requested_at is not null)
$$;

-- 3. The jobs.
drop table if exists private.account_deletion_jobs;

-- 4. The September keys as the foundation made them (20260917190517_resbite_private_tester_foundation.sql:30, 47
-- and 59), and owner_id not null again.
alter table public.plans drop constraint plans_owner_id_fkey;
alter table public.plans add constraint plans_owner_id_fkey foreign key(owner_id) references public.profiles(id);
alter table public.plans alter column owner_id set not null;
alter table public.attendees drop constraint attendees_user_id_fkey;
alter table public.attendees add constraint attendees_user_id_fkey foreign key(user_id) references public.profiles(id);
alter table private.invitations drop constraint invitations_claimed_by_fkey;
alter table private.invitations add constraint invitations_claimed_by_fkey foreign key(claimed_by) references public.profiles(id);

-- 5. The photo guard and the objects shared with plan 6, each only where this file made it.
do $$ begin
 if exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid='storage.objects'::regclass and t.tgname='resbite_photo_write_guard'
   and pg_catalog.obj_description(t.oid,'pg_trigger')='resbite 20261117110000') then
  drop trigger resbite_photo_write_guard on storage.objects;
 end if;
 if pg_catalog.obj_description(pg_catalog.to_regprocedure('private.guard_photo_write()'),'pg_proc')='resbite 20261117110000' then
  drop function private.guard_photo_write();
 end if;
 if pg_catalog.obj_description(pg_catalog.to_regprocedure('private.account_held(uuid)'),'pg_proc')='resbite 20261117110000' then
  drop function private.account_held(uuid);
 end if;
 if pg_catalog.obj_description(pg_catalog.to_regclass('private.legal_holds'),'pg_class')='resbite 20261117110000' then
  drop table private.legal_holds;
 end if;
 if pg_catalog.obj_description(pg_catalog.to_regclass('private.suspension_history'),'pg_class')='resbite 20261117110000' then
  drop table private.suspension_history;
 end if;
end $$;

-- 6. service_role's use of the private schema.
revoke usage on schema private from service_role;
