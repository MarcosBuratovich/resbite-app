begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('79000000-0000-4000-8000-000000000005','retained@resbite-test.invalid',now()),
 ('79000000-0000-4000-8000-000000000006','residual@resbite-test.invalid',now());
-- Disposable fixture models a remaining Storage object after Auth is gone.
insert into storage.objects(bucket_id,name) values
 ('profile-photos','79000000-0000-4000-8000-000000000006/remaining.jpg');
delete from auth.users where id='79000000-0000-4000-8000-000000000006';
insert into private.account_deletion_jobs(request_id,user_id,recovery_hash,status,completed_at)
select ('78000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('79000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 extensions.digest(repeat('a',64),'sha256'),
 case when n=4 then 'queued' else 'complete' end,
 case n when 1 then now()-interval '70 days' when 2 then now()-interval '31 days'
 when 3 then now()-interval '29 days' when 4 then null when 5 then now()-interval '60 days'
 when 6 then now()-interval '90 days' else null end
from generate_series(1,9) n;
update private.account_deletion_jobs set completed_at=now()-interval '60 days'
 where user_id in ('79000000-0000-4000-8000-000000000008','79000000-0000-4000-8000-000000000009');
insert into private.profile_photo_retired_paths(path_hash,user_id) values
 (extensions.digest('retired-fixture','sha256'),'79000000-0000-4000-8000-000000000008');
-- A never-claimed observation is a separate dependency: no retired fence exists.
-- Auth and bytes were already removed by account cleanup, but its proof must
-- survive until the photo worker removes this remaining observation record.
insert into private.profile_photo_cleanup_jobs(path_hash,user_id,path,object_id,status) values
 (extensions.digest('79000000-0000-4000-8000-000000000009/observed.jpg','sha256'),
 '79000000-0000-4000-8000-000000000009','79000000-0000-4000-8000-000000000009/observed.jpg',
 '77000000-0000-4000-8000-000000000009','observed');
set local role anon;
do $$ begin
 begin perform public.purge_completed_deletion_receipts(); raise exception 'Anonymous purge allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"79000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 begin perform public.purge_completed_deletion_receipts(); raise exception 'Client purge allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
do $$ begin
 begin perform public.purge_completed_deletion_receipts(0); raise exception 'Invalid batch size accepted';
 exception when invalid_parameter_value then null; end;
 if public.purge_completed_deletion_receipts(1)<>1 then raise exception 'Bounded eligible purge failed'; end if;
 if public.purge_completed_deletion_receipts(100)<>1 then raise exception 'Second eligible receipt not removed'; end if;
 if public.purge_completed_deletion_receipts(100)<>0 then raise exception 'Purge is not repeat safe'; end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from private.account_deletion_jobs)<>7 then raise exception 'Unsafe receipt purge'; end if;
 if exists(select 1 from private.account_deletion_jobs where request_id in ('78000000-0000-4000-8000-000000000001','78000000-0000-4000-8000-000000000002')) then raise exception 'Eligible receipts retained'; end if;
 if not exists(select 1 from auth.users where id='79000000-0000-4000-8000-000000000005') then raise exception 'Purge touched Auth'; end if;
 if not exists(select 1 from storage.objects where name='79000000-0000-4000-8000-000000000006/remaining.jpg') then raise exception 'Purge touched Storage'; end if;
 if private.eligible() then raise exception 'Purged receipt reenabled stale Auth token'; end if;
 if public.account_deletion_status('78000000-0000-4000-8000-000000000001',repeat('a',64)) is not null then raise exception 'Expired receipt still resolves'; end if;
 if not exists(select 1 from private.account_deletion_jobs where user_id='79000000-0000-4000-8000-000000000009')
  or not exists(select 1 from private.profile_photo_cleanup_jobs where user_id='79000000-0000-4000-8000-000000000009' and status='observed')
  or exists(select 1 from private.profile_photo_retired_paths where user_id='79000000-0000-4000-8000-000000000009') then
  raise exception 'Observed-only photo dependency did not preserve proof';
 end if;
end $$;
-- Exercise the real cross-worker ordering, without directly deleting dependencies.
set local role service_role;
select public.prune_profile_photo_cleanup();
reset role;
do $$ begin
 if exists(select 1 from private.profile_photo_retired_paths where user_id='79000000-0000-4000-8000-000000000008')
  or exists(select 1 from private.profile_photo_cleanup_jobs where user_id='79000000-0000-4000-8000-000000000009') then
  raise exception 'Photo purge did not clear both proven-deleted namespaces';
 end if;
 if (select count(*) from private.account_deletion_jobs where user_id in ('79000000-0000-4000-8000-000000000008','79000000-0000-4000-8000-000000000009'))<>2 then
  raise exception 'Photo purge removed account-deletion proof';
 end if;
end $$;
set local role service_role;
do $$ begin
 if public.purge_completed_deletion_receipts()<>2 then raise exception 'Receipts stayed after photo dependencies cleared'; end if;
 if public.purge_completed_deletion_receipts()<>0 then raise exception 'Cross-worker purge is not repeat safe'; end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from private.account_deletion_jobs)<>5 then raise exception 'Cross-worker purge touched ineligible receipts'; end if;
 if exists(select 1 from private.account_deletion_jobs where user_id in ('79000000-0000-4000-8000-000000000008','79000000-0000-4000-8000-000000000009')) then
  raise exception 'Cleared photo proof still retained';
 end if;
end $$;
rollback;
