-- Rehearsal for 20261117122000_optional_details_removal (hosted-baseline mode only); .after.sql removes everything here.
-- 1. The two functions the migration drops, with their grants, as they stand, so .after.sql can prove the rollback
-- recreates them exactly. A missing one fails here (the cast to regprocedure).
create table private.bc_rehearsal_functions as
 select f as signature, pg_catalog.pg_get_functiondef(f::regprocedure) as definition,
  (select p.proacl::text from pg_catalog.pg_proc p where p.oid=f::regprocedure) as grants
 from unnest(array['private.save_registration_details(jsonb,jsonb)','public.save_registration_details(jsonb,jsonb)']) f;
alter table private.bc_rehearsal_functions enable row level security;

-- 2. Two accounts: bc…01, phone-confirmed, holds both keys beside its name; bc…02's metadata is an empty array.
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at,raw_user_meta_data) values
 ('bc000000-0000-4000-8000-000000000001',null,null,'447700900971',now(),
  '{"display_name":"Rehearsal","registration_details":{"birth_date":null,"phone":null,"city":"Leeds","interests":[]},'
  '"registration_details_version":1}'),
 ('bc000000-0000-4000-8000-000000000002',null,null,null,null,'[]');

-- 3. The pre-state: both functions are there, executable by authenticated alone among the API roles.
do $$ declare f text; begin
 if (select count(*) from private.bc_rehearsal_functions where definition is not null and grants is not null)<>2 then
  raise exception 'A function to drop is missing or has no grants';
 end if;
 foreach f in array array['private.save_registration_details(jsonb,jsonb)','public.save_registration_details(jsonb,jsonb)'] loop
  if not has_function_privilege('authenticated',f,'EXECUTE') or has_function_privilege('anon',f,'EXECUTE')
    or has_function_privilege('service_role',f,'EXECUTE') then
   raise exception '% is not executable by authenticated alone', f;
  end if;
 end loop;
 if (select raw_user_meta_data->'registration_details'->>'city' from auth.users
   where id='bc000000-0000-4000-8000-000000000001') is distinct from 'Leeds' then
  raise exception 'The rehearsal account does not hold the details';
 end if;
end $$;
