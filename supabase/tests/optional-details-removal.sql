-- Optional details removal (20261117122000_optional_details_removal.sql; App Store readiness plan 4,
-- docs/superpowers/plans/2026-11-17-asr-4-terms-safety-details.md, Task 3 and Decision 11; spec C9, decision D-9):
-- the optional date of birth, second phone, city and interests are erased from Auth metadata (the
-- registration_details and registration_details_version keys, every other key kept), and save_registration_details
-- is gone from both schemas. The suite has already applied the migration; it runs again here over the fixtures, twice
-- (a second run is harmless). Synthetic identities only (prefix ae); one rolled-back block.
-- Users ae…: 01 both keys beside a name; 02 the version key alone; 03 an empty array; 04 null; 05 a name alone;
-- 06 an array holding the two key names as strings (not an object, so left alone).
begin;
create function pg_temp.ae(p text) returns uuid language sql immutable as $$ select ('ae000000-0000-4000-8000-0000000000'||p)::uuid $$;
create function pg_temp.ae_meta(p text) returns jsonb language sql stable as $$
 select u.raw_user_meta_data from auth.users u where u.id=pg_temp.ae(p)
$$;
-- After each run: each fixture's metadata is exactly as expected, and no account's metadata object holds either key.
create function pg_temp.ae_erased(p_run text) returns void language plpgsql as $$
begin
 if pg_temp.ae_meta('01') is distinct from '{"display_name":"Keep","full_name":"Keep Me"}'::jsonb then
  raise exception '%: 01 kept %', p_run, pg_temp.ae_meta('01');
 end if;
 if pg_temp.ae_meta('02') is distinct from '{}'::jsonb then raise exception '%: 02 kept %', p_run, pg_temp.ae_meta('02'); end if;
 if pg_temp.ae_meta('03') is distinct from '[]'::jsonb then raise exception '%: 03 became %', p_run, pg_temp.ae_meta('03'); end if;
 if (select u.raw_user_meta_data is not null from auth.users u where u.id=pg_temp.ae('04')) is distinct from false then
  raise exception '%: 04 is no longer null', p_run;
 end if;
 if pg_temp.ae_meta('05') is distinct from '{"display_name":"Other"}'::jsonb then
  raise exception '%: 05 became %', p_run, pg_temp.ae_meta('05');
 end if;
 if pg_temp.ae_meta('06') is distinct from '["registration_details","registration_details_version"]'::jsonb then
  raise exception '%: 06 became %', p_run, pg_temp.ae_meta('06');
 end if;
 if exists(select 1 from auth.users u where jsonb_typeof(u.raw_user_meta_data)='object'
   and u.raw_user_meta_data ?| array['registration_details','registration_details_version']) then
  raise exception '%: an account still holds the optional details', p_run;
 end if;
end $$;

insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 (pg_temp.ae('01'),'ae01@resbite-test.invalid',now(),'{"display_name":"Keep","full_name":"Keep Me","registration_details":{"birth_date":'
  '"2010-01-01","phone":"+447700900123","city":"London","interests":["Outdoors"]},"registration_details_version":1}'),
 (pg_temp.ae('02'),'ae02@resbite-test.invalid',now(),'{"registration_details_version":1}'),
 (pg_temp.ae('03'),'ae03@resbite-test.invalid',now(),'[]'::jsonb),
 (pg_temp.ae('04'),'ae04@resbite-test.invalid',now(),null),
 (pg_temp.ae('05'),'ae05@resbite-test.invalid',now(),'{"display_name":"Other"}'),
 (pg_temp.ae('06'),'ae06@resbite-test.invalid',now(),'["registration_details","registration_details_version"]');
do $$ begin
 if pg_temp.ae_meta('01')->'registration_details'->>'city' is distinct from 'London'
   or pg_temp.ae_meta('02')->'registration_details_version' is distinct from '1'::jsonb then
  raise exception 'The fixtures do not hold the details';
 end if;
end $$;

-- The functions are already gone, so each run's drops only say "does not exist, skipping": keep that out of the log.
set local client_min_messages = warning;
\ir ../migrations/20261117122000_optional_details_removal.sql
select pg_temp.ae_erased('First run');
\ir ../migrations/20261117122000_optional_details_removal.sql
select pg_temp.ae_erased('Second run');

-- The write path is gone from both schemas, and the app's call is refused as an unknown function.
do $$ begin
 if pg_catalog.to_regprocedure('public.save_registration_details(jsonb,jsonb)') is not null
   or pg_catalog.to_regprocedure('private.save_registration_details(jsonb,jsonb)') is not null then
  raise exception 'save_registration_details still exists';
 end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.ae('01'),'role','authenticated')::text,true);
do $$ declare v_state text; begin
 begin
  execute $q$select public.save_registration_details(null::jsonb,'{"birth_date":null,"phone":null,"city":"Leeds","interests":[]}'::jsonb)$q$;
 exception when others then
  get stacked diagnostics v_state = returned_sqlstate;
 end;
 if v_state is distinct from '42883' then
  raise exception 'Calling public.save_registration_details: expected 42883, got %', coalesce(v_state,'success');
 end if;
end $$;
reset role;
select pg_temp.ae_erased('After the refused call');
rollback;
