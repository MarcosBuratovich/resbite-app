begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('41000000-0000-4000-8000-000000000001','delete@resbite-test.invalid',now()),
 ('41000000-0000-4000-8000-000000000002','remain@resbite-test.invalid',now());
insert into auth.sessions(id,user_id,created_at) values('42000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001',now());
insert into private.tester_roster(email) values('delete@resbite-test.invalid'),('remain@resbite-test.invalid');
insert into public.profiles(id,display_name,avatar_path) values('41000000-0000-4000-8000-000000000001','Name to erase','41000000-0000-4000-8000-000000000001/a.jpg'),('41000000-0000-4000-8000-000000000002','Keep',null);
insert into public.activities values('delete-test','Test','Test','Creative','test',array['test'],true);
insert into public.plans(id,owner_id,activity_id,starts_at,time_zone,place_label,note) values('43000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','delete-test',now()+interval '1 day','UTC','Private place','Private note');
insert into public.attendees(plan_id,user_id) values('43000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000002');
insert into storage.objects(bucket_id,name) values('profile-photos','41000000-0000-4000-8000-000000000001/a.jpg');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"41000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 begin perform public.request_account_deletion('41000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000001',repeat('a',64)); raise exception 'Client deletion RPC bypassed edge'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
do $$ begin
 begin perform public.request_account_deletion('41000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000009','44000000-0000-4000-8000-000000000001',repeat('a',64)); raise exception 'Nonexistent proof session accepted'; exception when insufficient_privilege then null; end;
end $$;
select public.request_account_deletion('41000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000001',repeat('a',64));
select public.request_account_deletion('41000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000001',repeat('a',64));
do $$ begin
 if public.account_deletion_status('44000000-0000-4000-8000-000000000001',repeat('b',64)) is not null then raise exception 'Recovery secret bypassed'; end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from private.notification_outbox where kind='plan_cancelled')<>1 then raise exception 'Cancellation duplicated'; end if;
 if (select place_label from public.plans where id='43000000-0000-4000-8000-000000000001')<>'Meeting place removed' then raise exception 'Place not redacted'; end if;
 if (select display_name from public.profiles where id='41000000-0000-4000-8000-000000000001')<>'Deleted member' then raise exception 'Name not redacted'; end if;
end $$;
set local role authenticated;
do $$ begin
 if (select count(*) from public.plans)<>0 then raise exception 'Old JWT retains access'; end if;
 begin perform public.save_profile('Resurrect'); raise exception 'Deleted profile writable'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"41000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if (select status from public.plans where id='43000000-0000-4000-8000-000000000001')<>'cancelled' then raise exception 'Remaining attendee lost cancellation'; end if;
end $$;
reset role;
-- Simulate Storage HTTP removal and Auth admin deletion only in this SQL fixture.
do $$ declare jobs jsonb; lease uuid; begin
 jobs:=public.claim_account_deletions(5); lease:=(jobs->0->>'leaseId')::uuid;
 if jsonb_array_length(jobs)<>1 then raise exception 'Deletion not claimed'; end if;
 if public.claim_account_deletions(5)<>'[]'::jsonb then raise exception 'Live lease claimed twice'; end if;
 if jsonb_array_length(public.deletion_photo_paths('44000000-0000-4000-8000-000000000001',lease))<>1 then raise exception 'Photo enumeration failed'; end if;
 begin perform public.finish_account_deletion('44000000-0000-4000-8000-000000000001',lease,true); raise exception 'Premature completion'; exception when invalid_parameter_value then null; end;
 delete from storage.objects where name='41000000-0000-4000-8000-000000000001/a.jpg';
 delete from auth.users where id='41000000-0000-4000-8000-000000000001';
 if not public.finish_account_deletion('44000000-0000-4000-8000-000000000001',lease,true) then raise exception 'Completion failed'; end if;
 if (public.account_deletion_status('44000000-0000-4000-8000-000000000001',repeat('a',64))->>'status')<>'complete' then raise exception 'Recovery after Auth deletion failed'; end if;
 if exists(select 1 from public.plans where owner_id='41000000-0000-4000-8000-000000000001') then raise exception 'Owner identity retained'; end if;
end $$;
rollback;
