-- Rehearsal for 20261117130000_retention_and_team_tools (hosted-baseline mode only), after the apply. Removes what
-- .before.sql made.
-- 1. Each redefined body is the hosted one with only its named lines changed, and every grant is unchanged. Each old
-- string occurs exactly once in the snapshot. invite_contacts has Task 4's one edit: a listed number that would have
-- taken the link path answers 'unavailable'. Plan 2's interim write guard gets the retired-path lines after its own.
-- A photo function with no named line (none on hosted) must be unchanged.
create temporary table r6_edits(signature text, step integer, old text, new text);
insert into r6_edits values
 ('private.invite_contacts(uuid,jsonb)',1,$x$    else
     v_kind := 'link';
$x$,$x$    elsif private.number_objected(v_phone) then
     v_kind := 'unavailable';
    else
     v_kind := 'link';
$x$),
 ('private.guard_photo_write()',1,$x$   end if;
   return new;
$x$,$x$   end if;
   if new.bucket_id='profile-photos' then
    if exists(select 1 from private.profile_photo_retired_paths where path_hash=extensions.digest(new.name,'sha256')) then
     raise exception 'Photo path retired; choose a new photo' using errcode='42501';
    end if;
    delete from private.profile_photo_cleanup_jobs where path_hash=extensions.digest(new.name,'sha256') and status='observed';
   end if;
   return new;
$x$);
do $$ declare r record; e record; v_expected text; begin
 if exists(select 1 from r6_edits x where not exists(select 1 from private.r6_rehearsal_functions f where f.signature=x.signature)) then
  raise exception 'A named line belongs to a function the snapshot lacks';
 end if;
 for r in select f.signature, f.definition, f.grants from private.r6_rehearsal_functions f loop
  v_expected := r.definition;
  for e in select a.old, a.new from r6_edits a where a.signature=r.signature order by a.step loop
   if (length(r.definition)-length(replace(r.definition,e.old,'')))/length(e.old)<>1 then
    raise exception '% had % copies of a line to change', r.signature, (length(r.definition)-length(replace(r.definition,e.old,'')))/length(e.old);
   end if;
   v_expected := replace(v_expected,e.old,e.new);
  end loop;
  if pg_catalog.pg_get_functiondef(r.signature::regprocedure) is distinct from v_expected then
   raise exception '% changed more than its named lines: %', r.signature, pg_catalog.pg_get_functiondef(r.signature::regprocedure);
  end if;
  if (select p.proacl::text from pg_catalog.pg_proc p where p.oid=r.signature::regprocedure) is distinct from r.grants then
   raise exception '% lost or gained a grant', r.signature;
  end if;
 end loop;
end $$;

-- 2. New objects and privileges. The migration makes exactly these 46 functions and these five tables, each with this
-- file's marker. service_role executes exactly the eight public worker wrappers and the eight private bodies they call
-- (security invoker, as 20260923152816_orphan_profile_photo_cleanup.sql:189-194 has them); no app client executes any
-- of them, and no API role executes any other new function. Every new table has row security on, no policy and no
-- grant to any API role. The objects shared with plan 2 keep plan 2's marker; series_held is this file's.
create temporary table r6_new(signature text, service boolean);
insert into r6_new values
 ('private.series_held(uuid)',false),('private.series_under_hold(uuid)',false),('private.account_in_held_series(uuid)',false),
 ('private.series_end(uuid)',false),
 ('private.purge_phone_invitations(integer)',false),('private.purge_plan_removals(integer)',false),
 ('private.purge_connection_refusals(integer)',false),('private.purge_connection_requests(integer)',false),
 ('private.purge_notifications(integer)',false),('private.purge_link_opens(integer)',false),
 ('private.purge_closed_reports(integer)',false),('private.purge_suspension_history(integer)',false),
 ('private.run_retention()',false),
 ('private.purge_chats(integer)',false),('private.purge_plans(integer)',false),('private.dormant_web_accounts(integer)',false),
 ('private.purge_web_accounts(integer)',false),('private.purge_unconfirmed_accounts(integer)',false),
 ('private.purge_pending_phone_changes(integer)',false),
 ('private.objection_key_hash(text)',false),('private.ensure_objection_key()',false),('private.number_objected(text)',false),
 ('private.record_objection(text)',false),('private.withdraw_objection(text)',false),
 ('private.guard_profile_photo_reference()',false),
 ('public.claim_orphan_profile_photos(integer)',true),('private.claim_orphan_profile_photos(integer)',true),
 ('public.prepare_orphan_profile_photo(uuid,uuid)',true),('private.prepare_orphan_profile_photo(uuid,uuid)',true),
 ('public.finish_orphan_profile_photo(uuid,uuid,boolean)',true),('private.finish_orphan_profile_photo(uuid,uuid,boolean)',true),
 ('public.prune_profile_photo_cleanup()',true),('private.prune_profile_photo_cleanup()',true),
 ('private.retire_profile_photo_now(uuid,text)',false),('private.remove_profile_photo(uuid)',false),
 ('private.guard_plan_cover_reference()',false),
 ('public.claim_orphan_plan_covers(integer)',true),('private.claim_orphan_plan_covers(integer)',true),
 ('public.prepare_orphan_plan_cover(uuid,uuid)',true),('private.prepare_orphan_plan_cover(uuid,uuid)',true),
 ('public.finish_orphan_plan_cover(uuid,uuid,boolean)',true),('private.finish_orphan_plan_cover(uuid,uuid,boolean)',true),
 ('public.prune_plan_cover_cleanup()',true),('private.prune_plan_cover_cleanup()',true),
 ('private.retire_plan_cover_now(text)',false),
 ('private.remove_resbite_content(uuid,boolean,boolean,boolean,boolean)',false);
create temporary table r6_new_tables(name text);
insert into r6_new_tables values ('private.invite_objections'),('private.profile_photo_retired_paths'),
 ('private.profile_photo_cleanup_jobs'),('private.plan_cover_retired_paths'),('private.plan_cover_cleanup_jobs');
do $$ declare r record; v_made text; v_listed text; v_role text; begin
 if exists(select 1 from r6_new where pg_catalog.to_regprocedure(signature) is null) then
  raise exception 'The migration did not make %', (select string_agg(signature,', ') from r6_new where pg_catalog.to_regprocedure(signature) is null);
 end if;
 select string_agg(a.name,', ' order by a.name) into v_made from private.r6_rehearsal_catalogue() a
  where a.kind='function' and not exists(select 1 from private.r6_rehearsal_before b where b.kind='function' and b.name=a.name);
 select string_agg(signature,', ' order by signature) into v_listed from r6_new;
 if v_made is distinct from v_listed then raise exception 'The migration made functions %, not %', v_made, v_listed; end if;
 select string_agg(a.name,', ' order by a.name) into v_made from private.r6_rehearsal_catalogue() a
  where a.kind='relation' and a.definition like 'r %'
   and not exists(select 1 from private.r6_rehearsal_before b where b.kind='relation' and b.name=a.name);
 select string_agg(name,', ' order by name) into v_listed from r6_new_tables;
 if v_made is distinct from v_listed then raise exception 'The migration made tables %, not %', v_made, v_listed; end if;
 for r in select signature, service from r6_new loop
  foreach v_role in array array['public','anon','authenticated'] loop
   if pg_catalog.has_function_privilege(v_role,r.signature,'EXECUTE') then raise exception '% may execute %', v_role, r.signature; end if;
  end loop;
  if pg_catalog.has_function_privilege('service_role',r.signature,'EXECUTE') is distinct from r.service then
   raise exception 'service_role %execute %', case when r.service then 'may not ' else 'may ' end, r.signature;
  end if;
  if pg_catalog.obj_description(r.signature::regprocedure,'pg_proc') is distinct from 'resbite 20261117130000' then
   raise exception '% lacks this file''s marker', r.signature;
  end if;
 end loop;
 for r in select name from r6_new_tables loop
  foreach v_role in array array['public','anon','authenticated','service_role'] loop
   if pg_catalog.has_table_privilege(v_role,r.name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
    raise exception '% may use %', v_role, r.name;
   end if;
  end loop;
  if not (select c.relrowsecurity from pg_catalog.pg_class c where c.oid=r.name::regclass) then raise exception '% lacks RLS', r.name; end if;
  if exists(select 1 from pg_catalog.pg_policy p where p.polrelid=r.name::regclass) then raise exception '% has a policy', r.name; end if;
  if pg_catalog.obj_description(r.name::regclass,'pg_class') is distinct from 'resbite 20261117130000' then
   raise exception '% lacks this file''s marker', r.name;
  end if;
 end loop;
 if pg_catalog.obj_description('private.legal_holds'::regclass,'pg_class') is distinct from 'resbite 20261117110000'
 or pg_catalog.obj_description('private.suspension_history'::regclass,'pg_class') is distinct from 'resbite 20261117110000'
 or pg_catalog.obj_description('private.account_held(uuid)'::regprocedure,'pg_proc') is distinct from 'resbite 20261117110000'
 or pg_catalog.obj_description('private.guard_photo_write()'::regprocedure,'pg_proc') is distinct from 'resbite 20261117110000' then
  raise exception 'An object plan 2 made lost plan 2''s marker';
 end if;
 -- Plan 2's trigger on storage.objects is still the one on plan 2's guard, with no comment (neither file may comment
 -- it on hosted), and this file made no other there.
 if (select count(*) from pg_catalog.pg_trigger t where t.tgrelid='storage.objects'::regclass and t.tgname='resbite_photo_write_guard'
   and t.tgfoid='private.guard_photo_write()'::regprocedure and pg_catalog.obj_description(t.oid,'pg_trigger') is null)<>1 then
  raise exception 'Plan 2''s photo guard trigger is not on its guard, or has a comment';
 end if;
 if (select pg_catalog.obj_description(t.oid,'pg_trigger') from pg_catalog.pg_trigger t
   where t.tgrelid='public.plans'::regclass and t.tgname='plans_retired_cover_guard') is distinct from 'resbite 20261117130000'
 or (select pg_catalog.obj_description(t.oid,'pg_trigger') from pg_catalog.pg_trigger t
   where t.tgrelid='public.profiles'::regclass and t.tgname='resbite_profile_photo_reference_guard') is distinct from 'resbite 20261117130000' then
  raise exception 'A trigger made here is missing or lacks this file''s marker';
 end if;
end $$;

-- 3. The data steps (section 3's one-off leftovers). The roster and the legacy invitations are empty. 01's disabled
-- roster row became a revoked grant, so 01 is still kept out, and its suspension reads as if it had revoked that grant:
-- roster false, grant_at the grant's revoked_at, grant_made true, so suspend-account.sql's undo would delete it. 02, whose
-- roster row was enabled, is eligible and got no grant. The invitation by number is untouched.
do $$ begin
 if exists(select 1 from private.tester_roster) then raise exception 'The roster is not empty'; end if;
 if exists(select 1 from private.invitations) then raise exception 'The legacy invitations are not empty'; end if;
 if not exists(select 1 from private.beta_access where user_id='ea600000-0000-4000-8000-000000000001' and revoked_at is not null) then
  raise exception '01 has no revoked grant';
 end if;
 if private.user_eligible('ea600000-0000-4000-8000-000000000001') then raise exception '01 got back in'; end if;
 if not exists(select 1 from private.suspensions s join private.beta_access b on b.user_id=s.user_id
   where s.user_id='ea600000-0000-4000-8000-000000000001' and not s.roster and s.grant_at=b.revoked_at and s.grant_made) then
  raise exception '01''s suspension is not roster false, grant_at its grant''s revoked_at and grant_made true';
 end if;
 if not private.user_eligible('ea600000-0000-4000-8000-000000000002') then raise exception '02 lost access'; end if;
 if exists(select 1 from private.beta_access where user_id='ea600000-0000-4000-8000-000000000002') then raise exception '02 got a grant'; end if;
 if not exists(select 1 from private.phone_invitations where plan_id='ea610000-0000-4000-8000-000000000001'
   and phone='447700900561' and revoked_at is null) then
  raise exception 'The invitation by number went';
 end if;
end $$;

-- 4. Both suites on the hosted baseline (each one rolled-back block).
\ir ../retention.sql
\ir ../team-scripts.sql

-- 5. The rollback, rehearsed and undone. Run as text first (the harness passes the repository's path as resbite_repo),
-- under a stand-in for pg_cron's job table: it refuses, changing nothing, while retention-purge or cleanup-images is
-- scheduled, each on its own, and while the do-not-invite list holds an entry. Another job does not stop it. Then it
-- runs: the snapshot bodies come back with their grants, every function and table this file made is gone, the objects
-- plan 2 made stay, and the whole catalogue is as .before.sql recorded it. It restores no deleted row: the roster and
-- the legacy invitations stay empty, and 01 stays kept out by its grant.
begin;
\set r6_rollback `cat :'resbite_repo'/supabase/rollback/20261117130000_retention_and_team_tools.rollback.sql`
create temporary table r6_scripts on commit drop as select :'r6_rollback'::text as rollback;
create schema cron;
create table cron.job(jobid bigint generated always as identity primary key, jobname text not null);
do $$
declare v_step text; v_expected text;
begin
 if coalesce(length(btrim((select rollback from r6_scripts))),0)=0 then raise exception 'The rollback text is empty'; end if;
 foreach v_step in array array['retention-purge','cleanup-images','objection'] loop
  delete from cron.job;
  if v_step='objection' then
   insert into cron.job(jobname) values ('roll-repeating-plans');
   insert into private.invite_objections(key_hash) values (extensions.digest('r6-rehearsal-objection','sha256'));
   v_expected := 'The do-not-invite list holds an objection: nothing was undone';
  else
   insert into cron.job(jobname) values ('roll-repeating-plans'),(v_step);
   v_expected := 'Unschedule the retention jobs first';
  end if;
  begin
   execute (select rollback from r6_scripts);
   raise exception 'The rollback ran (%)', v_step;
  exception when object_not_in_prerequisite_state then
   if sqlerrm is distinct from v_expected then raise; end if;
  end;
  if pg_catalog.to_regprocedure('private.run_retention()') is null or pg_catalog.to_regclass('private.invite_objections') is null
   or pg_catalog.to_regprocedure('private.series_held(uuid)') is null
   or pg_catalog.to_regclass('private.plan_cover_cleanup_jobs') is null then
   raise exception 'The refused rollback changed something (%)', v_step;
  end if;
 end loop;
 delete from private.invite_objections;
end $$;
\ir ../../rollback/20261117130000_retention_and_team_tools.rollback.sql
do $$ declare r record; begin
 if exists(select 1 from private.r6_rehearsal_functions f
   where pg_catalog.pg_get_functiondef(f.signature::regprocedure) is distinct from f.definition
   or (select p.proacl::text from pg_catalog.pg_proc p where p.oid=f.signature::regprocedure) is distinct from f.grants) then
  raise exception 'Rollback did not restore the redefined functions with their grants';
 end if;
 if exists(select 1 from r6_new where pg_catalog.to_regprocedure(signature) is not null) then
  raise exception 'Rollback left %', (select string_agg(signature,', ') from r6_new where pg_catalog.to_regprocedure(signature) is not null);
 end if;
 if exists(select 1 from r6_new_tables where pg_catalog.to_regclass(name) is not null) then
  raise exception 'Rollback left %', (select string_agg(name,', ') from r6_new_tables where pg_catalog.to_regclass(name) is not null);
 end if;
 if pg_catalog.to_regclass('private.legal_holds') is null or pg_catalog.to_regclass('private.suspension_history') is null
   or pg_catalog.to_regprocedure('private.account_held(uuid)') is null or pg_catalog.to_regprocedure('private.guard_photo_write()') is null
   or not exists(select 1 from pg_catalog.pg_trigger where tgrelid='storage.objects'::regclass and tgname='resbite_photo_write_guard') then
  raise exception 'Rollback dropped an object plan 2 made';
 end if;
 for r in
  select coalesce(b.kind,n.kind) as kind, coalesce(b.name,n.name) as name, b.definition as before, n.definition as after
  from private.r6_rehearsal_before b full join private.r6_rehearsal_catalogue() n on n.kind=b.kind and n.name=b.name
 loop
  if r.before is distinct from r.after then raise exception 'Rollback did not restore % %: % / %', r.kind, r.name, r.before, r.after; end if;
 end loop;
 if exists(select 1 from private.tester_roster) or exists(select 1 from private.invitations) then
  raise exception 'Rollback put back a roster row or a legacy invitation';
 end if;
 if private.user_eligible('ea600000-0000-4000-8000-000000000001') then raise exception '01 got back in after the rollback'; end if;
end $$;
rollback;

-- 6. Remove the rehearsal fixtures and helpers so later tests start clean: the one-off (its invitation by number goes
-- with it) and its chat row, the two accounts (their grant and suspension go with them) and the snapshots.
delete from public.plans where id='ea610000-0000-4000-8000-000000000001';
delete from public.chats where series_id='ea610000-0000-4000-8000-000000000001';
delete from auth.users where id in ('ea600000-0000-4000-8000-000000000001','ea600000-0000-4000-8000-000000000002');
drop table private.r6_rehearsal_functions;
drop table private.r6_rehearsal_before;
drop function private.r6_rehearsal_catalogue();
drop table r6_edits;
drop table r6_new;
drop table r6_new_tables;
