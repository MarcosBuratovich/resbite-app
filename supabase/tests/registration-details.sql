-- Own-account optional metadata, validation and stale-save rejection. Rolls back.
begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,is_anonymous,banned_until) values
 ('81000000-0000-4000-8000-000000000001','details-pending@resbite-test.invalid',now(),'{"display_name":"Keep me","provider_value":"keep","registration_details":{"birth_date":"1990-01-01","phone":"+447700900123","city":"London","interests":["Outdoors"],"future_field":"keep"}}',false,null),
 ('81000000-0000-4000-8000-000000000002','details-other@resbite-test.invalid',now(),'{"unrelated":true}',false,null),
 ('81000000-0000-4000-8000-000000000003','details-unconfirmed@resbite-test.invalid',null,'{"email_verified":true}',false,null),
 ('81000000-0000-4000-8000-000000000004','details-anonymous@resbite-test.invalid',now(),'{}',true,null),
 ('81000000-0000-4000-8000-000000000005','details-banned@resbite-test.invalid',now(),'{}',false,now()+interval '1 day'),
 ('81000000-0000-4000-8000-000000000006','details-deleting@resbite-test.invalid',now(),'{}',false,null),
 ('81000000-0000-4000-8000-000000000007','details-job@resbite-test.invalid',now(),'{}',false,null);
insert into public.profiles(id,display_name,deletion_requested_at)
 values('81000000-0000-4000-8000-000000000006','Deletion fixture',now());
insert into private.account_deletion_jobs(request_id,user_id,recovery_hash)
 values('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000007',extensions.digest('synthetic','sha256'));

create function pg_temp.expect_invalid_details(p_value jsonb) returns void
language plpgsql security invoker as $$
begin
 begin
  perform public.save_registration_details(null,p_value);
  raise exception 'Invalid details accepted: %',p_value;
 exception when invalid_parameter_value then null;
 end;
end $$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare
 original jsonb := '{"birth_date":"1990-01-01","phone":"+447700900123","city":"London","interests":["Outdoors"],"future_field":"keep"}';
 cleared jsonb := '{"birth_date":null,"phone":null,"city":null,"interests":[]}';
 response jsonb;
begin
 if private.eligible() then raise exception 'Fixture unexpectedly approved'; end if;
 response := public.save_registration_details(original,cleared);
 if response is distinct from jsonb_build_object('account_id',auth.uid(),'registration_details',cleared || '{"future_field":"keep"}'::jsonb) then
  raise exception 'Removal did not preserve unrelated nested data';
 end if;
 -- The second serialized writer cannot resurrect details from its stale baseline.
 begin
  perform public.save_registration_details(original,(original-'future_field') || '{"city":"Paris"}'::jsonb);
  raise exception 'Stale edit restored removed details';
 exception when serialization_failure then null;
 end;
 if public.save_registration_details(original,cleared) is distinct from response then
  raise exception 'Lost-reply retry was not idempotent';
 end if;
 begin perform 1 from auth.users; raise exception 'Auth table exposed'; exception when insufficient_privilege then null; end;
 begin perform 1 from private.tester_roster; raise exception 'Roster exposed'; exception when insufficient_privilege then null; end;
end $$;

do $$ declare
 base jsonb := '{"birth_date":null,"phone":null,"city":null,"interests":[]}';
 item jsonb;
begin
 foreach item in array array[null::jsonb,'null'::jsonb,'[]'::jsonb,'1'::jsonb,'"bad"'::jsonb,
  base-'phone',base || '{"account_id":"81000000-0000-4000-8000-000000000002"}'::jsonb,
  base || '{"display_name":"Not editable here"}'::jsonb,
  base || '{"birth_date":true}'::jsonb,base || '{"birth_date":"2026-02-30"}'::jsonb,
  base || '{"birth_date":"1899-12-31"}'::jsonb,base || '{"birth_date":"9999-12-31"}'::jsonb,
  base || '{"birth_date":"1990-1-1"}'::jsonb,base || '{"birth_date":""}'::jsonb,
  base || '{"phone":false}'::jsonb,base || '{"phone":"07700900123"}'::jsonb,
  base || '{"phone":"+01234567"}'::jsonb,base || '{"phone":"+123"}'::jsonb,
  base || '{"phone":"+1234567890123456"}'::jsonb,base || '{"phone":""}'::jsonb,
  base || '{"city":[]}'::jsonb,base || '{"city":""}'::jsonb,base || '{"city":" London "}'::jsonb,
  base || jsonb_build_object('city',repeat('x',101)),
  base || '{"interests":null}'::jsonb,base || '{"interests":"Outdoors"}'::jsonb,
  base || '{"interests":[false]}'::jsonb,base || '{"interests":["Not a choice"]}'::jsonb,
  base || '{"interests":["Outdoors","Outdoors"]}'::jsonb,
  base || '{"interests":["Outdoors","Food & drink","Arts & creativity","Relaxation","Learning","Time with friends","Outdoors"]}'::jsonb
 ] loop perform pg_temp.expect_invalid_details(item); end loop;
end $$;

-- Missing nested metadata can be saved with a SQL/JSON null expected value.
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare details jsonb := '{"birth_date":"2000-02-29","phone":"+447700900123","city":"Buenos Aires","interests":["Outdoors","Food & drink","Arts & creativity","Relaxation","Learning","Time with friends"]}'; response jsonb; begin
 response := public.save_registration_details(null,details);
 if response->>'account_id'<>auth.uid()::text or response->'registration_details' is distinct from details then
  raise exception 'Own metadata save failed';
 end if;
 if public.save_registration_details('null',details) is distinct from response then raise exception 'JSON null retry failed'; end if;
end $$;

do $$ declare uid uuid; begin
 foreach uid in array array[
  '81000000-0000-4000-8000-000000000003'::uuid,'81000000-0000-4000-8000-000000000004'::uuid,
  '81000000-0000-4000-8000-000000000005'::uuid,'81000000-0000-4000-8000-000000000006'::uuid,
  '81000000-0000-4000-8000-000000000007'::uuid,'81000000-0000-4000-8000-000000000099'::uuid,null::uuid
 ] loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','email_verified',true,'tester',true)::text,true);
  begin
   perform public.save_registration_details(null,'{"birth_date":null,"phone":null,"city":null,"interests":[]}');
   raise exception 'Unavailable account updated its metadata';
  exception when insufficient_privilege then null;
  end;
 end loop;
end $$;

set local role anon;
do $$ begin
 begin perform public.save_registration_details(null,'{"birth_date":null,"phone":null,"city":null,"interests":[]}');
  raise exception 'Anonymous save allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ declare metadata jsonb; endpoint regprocedure; begin
 select raw_user_meta_data into metadata from auth.users where id='81000000-0000-4000-8000-000000000001';
 if metadata is distinct from '{"display_name":"Keep me","provider_value":"keep","registration_details_version":1,"registration_details":{"birth_date":null,"phone":null,"city":null,"interests":[],"future_field":"keep"}}'::jsonb then
  raise exception 'Known-field removal changed unrelated metadata or was overwritten';
 end if;
 if (select email from auth.users where id='81000000-0000-4000-8000-000000000001')<>'details-pending@resbite-test.invalid'
  or (select raw_user_meta_data->'unrelated' from auth.users where id='81000000-0000-4000-8000-000000000002')<>'true'::jsonb then
  raise exception 'Save changed another account or unrelated field';
 end if;
 if exists(select 1 from private.tester_roster where email like 'details-%@resbite-test.invalid') then raise exception 'Saving details granted beta approval'; end if;
 foreach endpoint in array array['private.save_registration_details(jsonb,jsonb)'::regprocedure,'public.save_registration_details(jsonb,jsonb)'::regprocedure] loop
  if has_function_privilege('anon',endpoint,'EXECUTE') or has_function_privilege('service_role',endpoint,'EXECUTE') then
   raise exception 'Own-details endpoint has excessive grants';
  end if;
  if not has_function_privilege('authenticated',endpoint,'EXECUTE') then raise exception 'Details endpoint inaccessible'; end if;
 end loop;
 if (select prosecdef from pg_proc where oid='public.save_registration_details(jsonb,jsonb)'::regprocedure) then raise exception 'Public details wrapper must be invoker'; end if;
 if not (select prosecdef and 'search_path=""'=any(proconfig) from pg_proc where oid='private.save_registration_details(jsonb,jsonb)'::regprocedure) then raise exception 'Unsafe private details helper'; end if;
end $$;
rollback;
select 'Own registration details assertions passed; fixtures rolled back' as result;
