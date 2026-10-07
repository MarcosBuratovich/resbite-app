-- Disposable SQL harness only; every synthetic account/roster change rolls back.
begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,is_anonymous,banned_until) values
 ('71000000-0000-4000-8000-000000000001','access-approved@resbite-test.invalid',now(),'{}',false,null),
 ('71000000-0000-4000-8000-000000000002','access-pending@resbite-test.invalid',now(),'{"tester":true,"email_verified":true}',false,null),
 ('71000000-0000-4000-8000-000000000003','access-unconfirmed@resbite-test.invalid',null,'{"email_verified":true}',false,null),
 ('71000000-0000-4000-8000-000000000004','access-anonymous@resbite-test.invalid',now(),'{}',true,null),
 ('71000000-0000-4000-8000-000000000005','access-banned@resbite-test.invalid',now(),'{}',false,now()+interval '1 day'),
 ('71000000-0000-4000-8000-000000000006','access-disabled@resbite-test.invalid',now(),'{}',false,null),
 ('71000000-0000-4000-8000-000000000007','access-deleting@resbite-test.invalid',now(),'{}',false,null),
 ('71000000-0000-4000-8000-000000000008','access-deletion-job@resbite-test.invalid',now(),'{}',false,null);
insert into private.tester_roster(email,enabled) values
 ('access-approved@resbite-test.invalid',true),
 ('access-unconfirmed@resbite-test.invalid',true),
 ('access-anonymous@resbite-test.invalid',true),
 ('access-banned@resbite-test.invalid',true),
 ('access-disabled@resbite-test.invalid',false),
 ('access-deleting@resbite-test.invalid',true),
 ('access-deletion-job@resbite-test.invalid',true);
insert into public.profiles(id,display_name,deletion_requested_at)
 values('71000000-0000-4000-8000-000000000007','Deletion fixture',now());
insert into private.account_deletion_jobs(request_id,user_id,recovery_hash)
 values('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000008',extensions.digest('synthetic','sha256'));

-- This fixture helper runs as its caller; it is not an application endpoint.
create function pg_temp.expect_access(p_uid uuid,p_status text) returns void
language plpgsql security invoker as $$
declare response jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_uid,'role','authenticated',
   'email','access-approved@resbite-test.invalid','tester',true,'email_verified',true)::text,true);
 response := public.account_access_status();
 if response is distinct from jsonb_build_object('account_id',p_uid,'status',p_status) then
  raise exception 'Unexpected own-account access response: %',response;
 end if;
end $$;

set local role authenticated;
-- Approval is independent of a profile row or published catalogue contents.
select pg_temp.expect_access('71000000-0000-4000-8000-000000000001','approved');
select pg_temp.expect_access('71000000-0000-4000-8000-000000000002','access_pending');
do $$ begin
 if (select count(*) from public.activities)<>0 then raise exception 'Pending account read catalogue'; end if;
 begin perform public.save_profile('Not approved'); raise exception 'Pending account mutated profile'; exception when insufficient_privilege then null; end;
 begin perform 1 from private.tester_roster; raise exception 'Roster exposed'; exception when insufficient_privilege then null; end;
end $$;
select pg_temp.expect_access('71000000-0000-4000-8000-000000000003','unconfirmed');
select pg_temp.expect_access('71000000-0000-4000-8000-000000000004','access_pending');
select pg_temp.expect_access('71000000-0000-4000-8000-000000000005','access_pending');
select pg_temp.expect_access('71000000-0000-4000-8000-000000000006','access_pending');
select pg_temp.expect_access('71000000-0000-4000-8000-000000000007','access_pending');
select pg_temp.expect_access('71000000-0000-4000-8000-000000000008','access_pending');

select set_config('request.jwt.claims','{}',true);
do $$ begin
 begin perform public.account_access_status(); raise exception 'Missing UID accepted'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000099","role":"authenticated"}',true);
do $$ begin
 begin perform public.account_access_status(); raise exception 'Deleted or nonexistent Auth user accepted'; exception when insufficient_privilege then null; end;
end $$;

-- Current server state wins over stale JWT claims and prior results.
reset role;
update private.tester_roster set enabled=false where email='access-approved@resbite-test.invalid';
update auth.users set email_confirmed_at=now() where id='71000000-0000-4000-8000-000000000003';
set local role authenticated;
select pg_temp.expect_access('71000000-0000-4000-8000-000000000001','access_pending');
select pg_temp.expect_access('71000000-0000-4000-8000-000000000003','approved');

set local role anon;
do $$ begin
 begin perform public.account_access_status(); raise exception 'Anonymous RPC allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ declare endpoint regprocedure; begin
 foreach endpoint in array array['private.account_access_status()'::regprocedure,'public.account_access_status()'::regprocedure] loop
  if has_function_privilege('anon',endpoint,'EXECUTE') or has_function_privilege('service_role',endpoint,'EXECUTE') then
   raise exception 'Own-account endpoint has excessive grants';
  end if;
  if not has_function_privilege('authenticated',endpoint,'EXECUTE') then raise exception 'Endpoint inaccessible'; end if;
 end loop;
 if (select prosecdef from pg_proc where oid='public.account_access_status()'::regprocedure) then
  raise exception 'Public wrapper must be invoker';
 end if;
 if not (select prosecdef and 'search_path=""'=any(proconfig) from pg_proc where oid='private.account_access_status()'::regprocedure) then
  raise exception 'Private helper must have a safe search path';
 end if;
 if (select count(*) from public.profiles where id::text like '71000000-%')<>1 then
  raise exception 'Status reads changed profiles';
 end if;
end $$;
rollback;
select 'Own-account access assertions passed; fixtures rolled back' as result;
