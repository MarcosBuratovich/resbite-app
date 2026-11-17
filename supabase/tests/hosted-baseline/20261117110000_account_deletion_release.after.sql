-- Rehearsal for 20261117110000_account_deletion_release (hosted-baseline mode only), after the apply. Removes what
-- .before.sql made.
-- 1. Each redefined body is the hosted one with only its named lines changed, applied in order, and every grant is
-- unchanged. Each old string occurs exactly once in the snapshot.
create temporary table adr_edits(signature text, step integer, old text, new text);
insert into adr_edits values
 ('private.require_tester()',1,$x$ STABLE SECURITY DEFINER$x$,$x$ SECURITY DEFINER$x$),
 ('private.require_tester()',2,$x$AS $function$
begin
$x$,$x$AS $function$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,47));
$x$),
 ('private.deletion_pending(uuid)',1,$x$ select exists(select 1 from public.profiles p where p.id=p_user and p.deletion_requested_at is not null)
$x$,$x$ select exists(select 1 from public.profiles p where p.id=p_user and p.deletion_requested_at is not null)
 or exists(select 1 from private.account_deletion_jobs j where j.user_id=p_user)
$x$);
do $$ declare r record; e record; v_expected text; v_edits integer; begin
 for r in select f.signature, f.definition, f.grants from private.adr_rehearsal_functions f loop
  v_expected := r.definition;
  v_edits := 0;
  for e in select a.old, a.new from adr_edits a where a.signature=r.signature order by a.step loop
   if (length(r.definition)-length(replace(r.definition,e.old,'')))/length(e.old)<>1 then
    raise exception '% had % copies of a line to change', r.signature, (length(r.definition)-length(replace(r.definition,e.old,'')))/length(e.old);
   end if;
   v_expected := replace(v_expected,e.old,e.new);
   v_edits := v_edits+1;
  end loop;
  if v_edits=0 then raise exception '% had no named line to check', r.signature; end if;
  if pg_catalog.pg_get_functiondef(r.signature::regprocedure) is distinct from v_expected then
   raise exception '% changed more than its named lines: %', r.signature, pg_catalog.pg_get_functiondef(r.signature::regprocedure);
  end if;
  if (select p.proacl::text from pg_catalog.pg_proc p where p.oid=r.signature::regprocedure) is distinct from r.grants then
   raise exception '% lost or gained a grant', r.signature;
  end if;
 end loop;
end $$;

-- 2. New objects and privileges (account-deletion-release.sql S1.4 and S5.6). The migration makes exactly these
-- functions. service_role executes exactly the six public wrappers and their six private bodies; no app client
-- executes any of them. No API role touches the three tables or asks whether an account is held; RLS is on;
-- service_role may enter the private schema. The objects shared with plan 6, and the photo guard with its trigger,
-- carry this file's marker, so its rollback drops them.
create temporary table adr_new(signature text, service boolean);
insert into adr_new values
 ('public.request_account_deletion(uuid,uuid,uuid,text)',true),('private.request_account_deletion(uuid,uuid,uuid,text)',true),
 ('public.account_deletion_status(uuid,text)',true),('private.account_deletion_status(uuid,text)',true),
 ('public.claim_account_deletions(integer)',true),('private.claim_account_deletions(integer)',true),
 ('public.deletion_storage_objects(uuid,uuid)',true),('private.deletion_storage_objects(uuid,uuid)',true),
 ('public.finish_account_deletion(uuid,uuid,boolean)',true),('private.finish_account_deletion(uuid,uuid,boolean)',true),
 ('public.purge_completed_deletion_receipts(integer)',true),('private.purge_completed_deletion_receipts(integer)',true),
 ('private.queue_account_deletion(uuid,uuid,bytea)',false),('private.close_account(uuid,uuid)',false),
 ('private.erase_account(uuid)',false),('private.operator_account_deletion(uuid)',false),
 ('private.replay_account_deletion(uuid,uuid,bytea)',false),('private.account_held(uuid)',false),
 ('private.guard_photo_write()',false);
do $$ declare r record; v_made text; v_listed text; t text; begin
 if exists(select 1 from adr_new where pg_catalog.to_regprocedure(signature) is null) then
  raise exception 'The migration did not make %', (select string_agg(signature,', ') from adr_new where pg_catalog.to_regprocedure(signature) is null);
 end if;
 select string_agg(a.name,', ' order by a.name) into v_made from private.adr_rehearsal_catalogue() a
  where a.kind='function' and not exists(select 1 from private.adr_rehearsal_before b where b.kind='function' and b.name=a.name);
 select string_agg(signature,', ' order by signature) into v_listed from adr_new;
 if v_made is distinct from v_listed then raise exception 'The migration made %, not %', v_made, v_listed; end if;
 for r in select signature, service from adr_new loop
  if pg_catalog.has_function_privilege('anon',r.signature,'EXECUTE') or pg_catalog.has_function_privilege('authenticated',r.signature,'EXECUTE') then
   raise exception 'An app client may execute %', r.signature;
  end if;
  if pg_catalog.has_function_privilege('service_role',r.signature,'EXECUTE') is distinct from r.service then
   raise exception 'service_role %execute %', case when r.service then 'may not ' else 'may ' end, r.signature;
  end if;
 end loop;
 foreach t in array array['private.legal_holds','private.suspension_history','private.account_deletion_jobs'] loop
  if pg_catalog.has_table_privilege('anon',t,'SELECT,INSERT,UPDATE,DELETE') or pg_catalog.has_table_privilege('authenticated',t,'SELECT,INSERT,UPDATE,DELETE')
   or pg_catalog.has_table_privilege('service_role',t,'SELECT,INSERT,UPDATE,DELETE') then
   raise exception 'An API role may use %', t;
  end if;
  if not (select c.relrowsecurity from pg_catalog.pg_class c where c.oid=t::regclass) then raise exception '% lacks RLS', t; end if;
 end loop;
 if not pg_catalog.has_schema_privilege('service_role','private','USAGE') then raise exception 'service_role lacks the private schema'; end if;
 if pg_catalog.obj_description('private.legal_holds'::regclass,'pg_class') is distinct from 'resbite 20261117110000'
 or pg_catalog.obj_description('private.suspension_history'::regclass,'pg_class') is distinct from 'resbite 20261117110000'
 or pg_catalog.obj_description('private.account_held(uuid)'::regprocedure,'pg_proc') is distinct from 'resbite 20261117110000'
 or pg_catalog.obj_description('private.guard_photo_write()'::regprocedure,'pg_proc') is distinct from 'resbite 20261117110000'
 or (select pg_catalog.obj_description(t.oid,'pg_trigger') from pg_catalog.pg_trigger t
   where t.tgrelid='storage.objects'::regclass and t.tgname='resbite_photo_write_guard') is distinct from 'resbite 20261117110000' then
  raise exception 'An object made here lacks this file''s marker';
 end if;
end $$;

-- 3. Behaviour on hosted-shaped data. 01's request, as the Edge function makes it, is accepted, and the one-off is
-- cancelled with one plan_cancelled notice, for 02. The suspended 03 may delete itself (D-19). Then 01's Auth user can
-- be removed: the resbite stays for its guest, with no organiser.
set role service_role;
do $$ declare v jsonb; begin
 v := public.request_account_deletion('ad000000-0000-4000-8000-000000000001','ad200000-0000-4000-8000-000000000001',
  'ad300000-0000-4000-8000-000000000001',repeat('a',64));
 if v is distinct from '{"requestId":"ad300000-0000-4000-8000-000000000001","status":"queued"}'::jsonb then
  raise exception '01''s request answered %', v;
 end if;
end $$;
do $$ declare v jsonb; begin
 v := public.request_account_deletion('ad000000-0000-4000-8000-000000000003','ad200000-0000-4000-8000-000000000003',
  'ad300000-0000-4000-8000-000000000003',repeat('c',64));
 if v is distinct from '{"requestId":"ad300000-0000-4000-8000-000000000003","status":"queued"}'::jsonb then
  raise exception 'The suspended 03''s request answered %', v;
 end if;
end $$;
reset role;
do $$ begin
 if (select status from public.plans where id='ad100000-0000-4000-8000-000000000001') is distinct from 'cancelled' then
  raise exception 'The one-off is not cancelled';
 end if;
 if (select count(*) from private.notification_outbox where plan_id='ad100000-0000-4000-8000-000000000001' and kind='plan_cancelled')<>1
 or not exists(select 1 from private.notification_outbox where plan_id='ad100000-0000-4000-8000-000000000001' and kind='plan_cancelled'
   and recipient_id='ad000000-0000-4000-8000-000000000002') then
  raise exception 'The one-off''s cancellation notices are not one, for 02';
 end if;
 if (select count(*) from private.account_deletion_jobs where user_id in ('ad000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000003'))<>2 then
  raise exception 'The two requests did not make two jobs';
 end if;
 begin
  delete from auth.users where id='ad000000-0000-4000-8000-000000000001';
 exception when foreign_key_violation then
  raise exception '01 still can''t be removed: %', sqlerrm;
 end;
 if exists(select 1 from auth.users where id='ad000000-0000-4000-8000-000000000001') then raise exception '01 is still there'; end if;
 if not exists(select 1 from public.plans where id='ad100000-0000-4000-8000-000000000001' and owner_id is null) then
  raise exception 'The one-off is gone, or still has its owner';
 end if;
end $$;

-- 4. The rollback, rehearsed and undone. Run as text first (the harness passes the repository's path as resbite_repo):
-- the open beta's rollback refuses while this file's request is in place, and this one refuses, changing nothing,
-- while any trace of a deletion is left (a job, a resbite with no owner, a legal hold, a suspension history row), each
-- on its own. Then, with none left, it runs: the two hosted bodies come back with their grants, every object it made is
-- gone, the keys and the not null are back, and the whole catalogue is as .before.sql recorded it. The open beta's
-- rollback then runs after it, skipping the request it no longer finds.
begin;
\set adr_rollback `cat :'resbite_repo'/supabase/rollback/20261117110000_account_deletion_release.rollback.sql`
\set adr_open_beta `cat :'resbite_repo'/supabase/rollback/20261116120000_open_beta.rollback.sql`
create temporary table adr_scripts on commit drop as select :'adr_rollback'::text as rollback, :'adr_open_beta'::text as open_beta;
do $$
declare v_step text;
begin
 if coalesce(length(btrim((select rollback from adr_scripts))),0)=0 or coalesce(length(btrim((select open_beta from adr_scripts))),0)=0 then
  raise exception 'A rollback text is empty';
 end if;
 begin
  execute (select open_beta from adr_scripts);
  raise exception 'The open beta rollback ran before this file''s';
 exception when insufficient_privilege then
  if sqlerrm is distinct from 'private.request_account_deletion(uuid,uuid,uuid,text) is not the open beta body: run the rollbacks of every later migration first' then raise; end if;
 end;
 foreach v_step in array array['jobs','plan','hold','history'] loop
  if v_step='jobs' then delete from public.plans where owner_id is null; end if;
  if v_step='plan' then
   delete from private.account_deletion_jobs;
   insert into public.plans(id,owner_id,title,starts_at,ends_at,time_zone,place_label,categories) values
    ('ad100000-0000-4000-8000-000000000009',null,'Rehearsal orphan',now()-interval '2 days',now()-interval '2 days'+interval '2 hours',
     'UTC','Hall',array['community']);
  end if;
  if v_step='hold' then
   delete from public.plans where owner_id is null;
   insert into private.legal_holds(user_id,reason,case_ref,review_on) values ('ad000000-0000-4000-8000-000000000009','police','AD-1',current_date+90);
  end if;
  if v_step='history' then
   delete from private.legal_holds;
   insert into private.suspension_history(user_id,report_id,suspended_at,ended_at,how) values (null,null,now()-interval '1 day',now(),'account_deleted');
  end if;
  begin
   execute (select rollback from adr_scripts);
   raise exception 'The rollback ran with a trace of a deletion left (%)', v_step;
  exception when insufficient_privilege then
   if sqlerrm is distinct from 'A deletion has run on this project: roll back by hand' then raise; end if;
  end;
  if pg_catalog.to_regprocedure('private.request_account_deletion(uuid,uuid,uuid,text)') is null
   or pg_catalog.to_regclass('private.account_deletion_jobs') is null
   or (select c.confdeltype from pg_catalog.pg_constraint c where c.conname='plans_owner_id_fkey' and c.confrelid='public.profiles'::regclass)<>'n' then
   raise exception 'The refused rollback changed something (%)', v_step;
  end if;
 end loop;
 delete from private.suspension_history;
end $$;
\ir ../../rollback/20261117110000_account_deletion_release.rollback.sql
do $$ declare v_rule text; r record; begin
 if exists(select 1 from private.adr_rehearsal_functions f
   where pg_catalog.pg_get_functiondef(f.signature::regprocedure) is distinct from f.definition
   or (select p.proacl::text from pg_catalog.pg_proc p where p.oid=f.signature::regprocedure) is distinct from f.grants) then
  raise exception 'Rollback did not restore require_tester and deletion_pending with their grants';
 end if;
 if pg_catalog.to_regprocedure('private.request_account_deletion(uuid,uuid,uuid,text)') is not null
   or pg_catalog.to_regprocedure('public.request_account_deletion(uuid,uuid,uuid,text)') is not null
   or pg_catalog.to_regclass('private.legal_holds') is not null or pg_catalog.to_regclass('private.account_deletion_jobs') is not null then
  raise exception 'Rollback left the request, the legal holds or the jobs';
 end if;
 if exists(select 1 from adr_new where pg_catalog.to_regprocedure(signature) is not null) then
  raise exception 'Rollback left %', (select string_agg(signature,', ') from adr_new where pg_catalog.to_regprocedure(signature) is not null);
 end if;
 foreach v_rule in array array['plans_owner_id_fkey','attendees_user_id_fkey','invitations_claimed_by_fkey'] loop
  if (select c.confdeltype::text from pg_catalog.pg_constraint c where c.conname=v_rule and c.confrelid='public.profiles'::regclass)
    is distinct from 'a' then
   raise exception 'Rollback did not put back % with no action', v_rule;
  end if;
 end loop;
 if not (select a.attnotnull from pg_catalog.pg_attribute a where a.attrelid='public.plans'::regclass and a.attname='owner_id') then
  raise exception 'Rollback did not put back public.plans.owner_id not null';
 end if;
 if pg_catalog.to_regclass('private.suspension_history') is not null or pg_catalog.to_regprocedure('private.account_held(uuid)') is not null
   or pg_catalog.to_regprocedure('private.guard_photo_write()') is not null
   or exists(select 1 from pg_catalog.pg_trigger where tgrelid='storage.objects'::regclass and tgname='resbite_photo_write_guard') then
  raise exception 'Rollback left the suspension history, account_held or the photo guard';
 end if;
 if pg_catalog.has_schema_privilege('service_role','private','USAGE') then raise exception 'Rollback left service_role the private schema'; end if;
 for r in
  select coalesce(b.kind,n.kind) as kind, coalesce(b.name,n.name) as name, b.definition as before, n.definition as after
  from private.adr_rehearsal_before b full join private.adr_rehearsal_catalogue() n on n.kind=b.kind and n.name=b.name
 loop
  if r.before is distinct from r.after then raise exception 'Rollback did not restore % %: % / %', r.kind, r.name, r.before, r.after; end if;
 end loop;
end $$;
\ir ../../rollback/20261116120000_open_beta.rollback.sql
do $$ begin
 if pg_catalog.to_regprocedure('private.access_suspended(uuid)') is not null or pg_catalog.to_regprocedure('private.granted_access(uuid)') is not null then
  raise exception 'The open beta rollback did not run after this file''s';
 end if;
end $$;
rollback;

-- 5. Remove the rehearsal fixtures and helpers so later tests start clean: the two jobs, the one-off with its chat row,
-- the accounts left (01's went in step 3) and the snapshots.
delete from private.account_deletion_jobs where user_id in ('ad000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000003');
delete from public.plans where id='ad100000-0000-4000-8000-000000000001';
delete from public.chats where series_id='ad100000-0000-4000-8000-000000000001';
delete from auth.users where id in ('ad000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000002',
 'ad000000-0000-4000-8000-000000000003');
drop table private.adr_rehearsal_functions;
drop table private.adr_rehearsal_before;
drop function private.adr_rehearsal_catalogue();
drop table adr_edits;
drop table adr_new;
