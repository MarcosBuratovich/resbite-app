-- Rehearsal for 20261117100000_phone_test_mode_retired (hosted-baseline mode only), after the apply. Removes what
-- .before.sql made.
-- 1. The five objects are gone; private.phone_digits stays, closed to clients.
do $$ begin
 if pg_catalog.to_regprocedure('public.exchange_test_code(text,text)') is not null then raise exception 'exchange_test_code was not dropped'; end if;
 if pg_catalog.to_regprocedure('public.send_sms_hook(jsonb)') is not null then raise exception 'send_sms_hook was not dropped'; end if;
 if pg_catalog.to_regclass('private.test_codes') is not null then raise exception 'private.test_codes was not dropped'; end if;
 if pg_catalog.to_regclass('private.test_mode_log') is not null then raise exception 'private.test_mode_log was not dropped'; end if;
 if pg_catalog.to_regclass('private.phone_mode') is not null then raise exception 'private.phone_mode was not dropped'; end if;
 if pg_catalog.to_regprocedure('private.phone_digits(text)') is null then raise exception 'private.phone_digits was dropped'; end if;
end $$;

-- 2. The rollback restores the five as the hosted project had them: each function's definition and grants, each
-- table's column fingerprint, row-level security, grants and constraints. Test mode stays off and nothing is stored.
-- Run a second time, or with any one of the five back, it refuses with its own words and changes nothing.
begin;
\ir ../../rollback/20261117100000_phone_test_mode_retired.rollback.sql
do $$ begin
 if exists(select 1 from private.pc_rehearsal_functions f
   where pg_catalog.pg_get_functiondef(f.signature::regprocedure) is distinct from f.definition
   or (select p.proacl::text from pg_catalog.pg_proc p where p.oid=f.signature::regprocedure) is distinct from f.grants) then
  raise exception 'The rollback did not restore a test-mode function with its grants';
 end if;
 if exists(select 1 from private.pc_rehearsal_tables t
   where (select md5(string_agg(a.attname||' '||pg_catalog.format_type(a.atttypid,a.atttypmod)||' '||a.attnotnull||' '||coalesce(pg_catalog.pg_get_expr(d.adbin,d.adrelid),''), ',' order by a.attnum))
     from pg_catalog.pg_attribute a left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
     where a.attrelid=t.name::regclass and a.attnum>0 and not a.attisdropped) is distinct from t.columns
   or (select c.relrowsecurity from pg_catalog.pg_class c where c.oid=t.name::regclass) is distinct from t.rls
   or (select c.relacl::text from pg_catalog.pg_class c where c.oid=t.name::regclass) is distinct from t.grants
   or (select string_agg(k.conname||' '||pg_catalog.pg_get_constraintdef(k.oid), ',' order by k.conname)
     from pg_catalog.pg_constraint k where k.conrelid=t.name::regclass) is distinct from t.constraints) then
  raise exception 'The rollback did not restore a test-mode table as it was';
 end if;
 if (select count(*) from private.phone_mode)<>1 then raise exception 'The restored mode table should hold one row'; end if;
 if (select test_mode from private.phone_mode) is distinct from false then raise exception 'The rollback reopened test mode'; end if;
 if exists(select 1 from private.test_codes) then raise exception 'The restored test_codes is not empty'; end if;
 if exists(select 1 from private.test_mode_log) then raise exception 'The restored test_mode_log is not empty'; end if;
end $$;
set local role anon;
do $$ begin
 if public.exchange_test_code('+44 7700 900941','000000') is not null then raise exception '000000 swapped after the rollback'; end if;
end $$;
reset role;
\set pc_rehearsal_rollback `cat :'resbite_repo'/supabase/rollback/20261117100000_phone_test_mode_retired.rollback.sql`
create temporary table pc_rehearsal_scripts on commit drop as select :'pc_rehearsal_rollback'::text as rollback;
do $$ begin
 if coalesce(length(btrim((select rollback from pc_rehearsal_scripts))),0)=0 then raise exception 'The rollback text is empty'; end if;
 begin
  execute (select rollback from pc_rehearsal_scripts);
  raise exception 'The rollback ran a second time';
 exception when raise_exception then
  if sqlerrm is distinct from 'Test mode objects exist: nothing to roll back' then raise; end if;
 end;
 begin
  drop function public.exchange_test_code(text, text);
  drop function public.send_sms_hook(jsonb);
  drop table private.test_codes;
  drop table private.test_mode_log;
  execute (select rollback from pc_rehearsal_scripts);
  raise exception 'The rollback ran with private.phone_mode left';
 exception when raise_exception then
  if sqlerrm is distinct from 'Test mode objects exist: nothing to roll back' then raise; end if;
 end;
 if pg_catalog.to_regprocedure('public.exchange_test_code(text,text)') is null or pg_catalog.to_regprocedure('public.send_sms_hook(jsonb)') is null
   or pg_catalog.to_regclass('private.test_codes') is null or pg_catalog.to_regclass('private.test_mode_log') is null
   or (select count(*) from private.phone_mode)<>1 then
  raise exception 'A refusal changed something';
 end if;
end $$;
rollback;

-- 3. Remove the rehearsal fixtures and snapshots so later tests start clean (the identity goes with its account; the
-- switch-off removed the session and the refresh token, and the migration the code and the log rows).
delete from auth.users where id='ac1d0000-0000-4000-8000-000000000001';
drop table private.pc_rehearsal_functions;
drop table private.pc_rehearsal_tables;
