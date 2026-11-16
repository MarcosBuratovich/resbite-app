-- Rehearsal for 20261116120000_open_beta (hosted-baseline mode only); .after.sql removes everything here.
-- 1. The functions the migration redefines, with their grants, as they stand, so .after.sql can prove the apply
-- changes only the lines it names and keeps the grants, and that the rollback restores them exactly. Four always
-- exist; request_account_deletion exists only where the deletion lifecycle does (not on the hosted project yet).
create table private.ob_rehearsal_functions as
 select f as signature, pg_catalog.pg_get_functiondef(f::regprocedure) as definition,
  (select p.proacl::text from pg_catalog.pg_proc p where p.oid=f::regprocedure) as grants
 from unnest(array['private.user_eligible(uuid)','private.join_by_link(text,text,text)',
  'private.request_to_join(text,text,text,text)','private.decide_join_request(uuid,uuid,boolean)',
  'private.request_account_deletion(uuid,uuid,uuid,text)']) f
 where pg_catalog.to_regprocedure(f) is not null;
alter table private.ob_rehearsal_functions enable row level security;

-- 2. Fixtures, kept until .after.sql removes them: 01 a confirmed phone account with nothing else, 02 the same with a
-- revoked grant (suspended), 03 a roster tester.
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values
 ('eb0b0000-0000-4000-8000-000000000001',null,null,'447700900951',now()),
 ('eb0b0000-0000-4000-8000-000000000002',null,null,'447700900952',now()),
 ('eb0b0000-0000-4000-8000-000000000003','ob-rehearsal@resbite-test.invalid',now(),null,null);
insert into private.beta_access(user_id,source,revoked_at) values ('eb0b0000-0000-4000-8000-000000000002','maintainer',now());
insert into private.tester_roster(email,enabled) values ('ob-rehearsal@resbite-test.invalid',true);

-- 3. The pre-state: the roster or a grant decides, so 01 waits; the helpers don't exist yet.
do $$ begin
 if (select count(*) from private.ob_rehearsal_functions where definition is not null and signature<>'private.request_account_deletion(uuid,uuid,uuid,text)')<>4 then
  raise exception 'A function to redefine is missing';
 end if;
 if (select definition from private.ob_rehearsal_functions where signature='private.user_eligible(uuid)')
   not like '%private.tester_roster%private.has_live_grant(u.id)%' then
  raise exception 'user_eligible no longer asks for a roster row or a grant';
 end if;
 if pg_catalog.to_regprocedure('private.granted_access(uuid)') is not null
   or pg_catalog.to_regprocedure('private.access_suspended(uuid)') is not null then
  raise exception 'The open beta helpers already exist';
 end if;
 if exists(select 1 from information_schema.columns where table_schema='private' and table_name='suspensions' and column_name='grant_made') then raise exception 'suspensions already has grant_made'; end if;
 if private.user_eligible('eb0b0000-0000-4000-8000-000000000001') then raise exception '01 is already eligible'; end if;
 if private.user_eligible('eb0b0000-0000-4000-8000-000000000002') then raise exception '02 is eligible'; end if;
 if not private.user_eligible('eb0b0000-0000-4000-8000-000000000003') then raise exception 'The roster tester is not eligible'; end if;
end $$;
