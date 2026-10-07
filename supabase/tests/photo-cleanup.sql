-- Synthetic rollback fixture; direct Storage metadata writes simulate HTTP only.
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('81000000-0000-4000-8000-000000000001','photo-owner@resbite-test.invalid',now()),
 ('81000000-0000-4000-8000-000000000002','photo-peer@resbite-test.invalid',now());
insert into auth.sessions(id,user_id) values('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001');
insert into private.tester_roster(email) values('photo-owner@resbite-test.invalid'),('photo-peer@resbite-test.invalid');
insert into public.profiles(id,display_name,avatar_path) values
 ('81000000-0000-4000-8000-000000000001','Photo owner','81000000-0000-4000-8000-000000000001/attached.jpg'),
 ('81000000-0000-4000-8000-000000000002','Photo peer',null);
insert into storage.objects(bucket_id,name) select 'profile-photos','81000000-0000-4000-8000-000000000001/'||name from unnest(array['attached.jpg','orphan.jpg','fresh.jpg','changed.jpg','late.jpg']) name;
insert into public.activities(id,title,description,category,artwork_key,source_ids,published,categories) values('photo-test','Test','Test','Creative','test',array['test'],true,array['creative']);
insert into public.plans(id,owner_id,activity_id,starts_at,time_zone,place_label,note) values('83000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','photo-test',now()+interval '1 day','UTC','Test','');
insert into public.attendees(plan_id,user_id,response) values('83000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002','accepted');

do $$ declare item record; begin
 for item in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname in ('claim_orphan_profile_photos','prepare_orphan_profile_photo','finish_orphan_profile_photo','prune_profile_photo_cleanup') loop
  if has_function_privilege('anon',item.oid,'EXECUTE') or has_function_privilege('authenticated',item.oid,'EXECUTE') or not has_function_privilege('service_role',item.oid,'EXECUTE') then raise exception 'Photo RPC privilege incorrect: %',item.proname; end if;
 end loop;
 if public.claim_orphan_profile_photos(5)<>'[]'::jsonb then raise exception 'Fresh observations claimed'; end if;
 if (select count(*) from private.profile_photo_cleanup_jobs)<>4 then raise exception 'Attached photo observed or orphan missing'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if (select count(*) from storage.objects where bucket_id='profile-photos')<>1 then raise exception 'Peer can read abandoned photo or lost current avatar'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 if (select count(*) from storage.objects where bucket_id='profile-photos')<>5 then raise exception 'Owner cannot recover own upload'; end if;
end $$;
reset role;
select set_config('request.jwt.claims','{}',true);
update private.profile_photo_cleanup_jobs set observed_at=now()-interval '8 days' where path not like '%fresh.jpg';
-- Upload/replacement activity resets the observation, even if the path/id stays.
update storage.objects set owner='81000000-0000-4000-8000-000000000001' where name like '%changed.jpg';
-- Attachment after discovery invalidates the candidate, as does later detachment.
update public.profiles set avatar_path='81000000-0000-4000-8000-000000000001/late.jpg' where id='81000000-0000-4000-8000-000000000001';
update public.profiles set avatar_path='81000000-0000-4000-8000-000000000001/attached.jpg' where id='81000000-0000-4000-8000-000000000001';
do $$ declare jobs jsonb; job uuid; lease uuid; newer uuid; begin
 jobs:=public.claim_orphan_profile_photos(5);
 if jsonb_array_length(jobs)<>1 then raise exception 'Fresh, changed or newly detached photo was claimed'; end if;
 job:=(jobs->0->>'jobId')::uuid; lease:=(jobs->0->>'leaseId')::uuid;
 if (public.prepare_orphan_profile_photo(job,lease)->>'path')<>'81000000-0000-4000-8000-000000000001/orphan.jpg' then raise exception 'Wrong orphan selected'; end if;
 if public.claim_orphan_profile_photos(5)<>'[]'::jsonb then raise exception 'Live lease duplicated'; end if;
 begin perform public.finish_orphan_profile_photo(job,lease,true); raise exception 'Premature completion'; exception when invalid_parameter_value then null; end;
 -- Retiring, not the short lease, is what closes attachment and reuse races.
 begin update public.profiles set avatar_path='81000000-0000-4000-8000-000000000001/orphan.jpg' where id='81000000-0000-4000-8000-000000000001'; raise exception 'Retired path attached'; exception when insufficient_privilege then null; end;
 begin update storage.objects set owner='81000000-0000-4000-8000-000000000001' where name like '%orphan.jpg'; raise exception 'Retired object overwritten'; exception when insufficient_privilege then null; end;
 update private.profile_photo_cleanup_jobs set lease_until=now()-interval '1 second' where job_id=job;
 begin perform public.prepare_orphan_profile_photo(job,lease); raise exception 'Expired lease authorized'; exception when insufficient_privilege then null; end;
 jobs:=public.claim_orphan_profile_photos(5); newer:=(jobs->0->>'leaseId')::uuid;
 if newer=lease or newer is null then raise exception 'Lease not replaced'; end if;
 if public.finish_orphan_profile_photo(job,lease,false) then raise exception 'Stale worker altered new claim'; end if;
 -- Storage removed the object, but its reply was lost. A retry observes absence.
 delete from storage.objects where name='81000000-0000-4000-8000-000000000001/orphan.jpg';
 if (public.prepare_orphan_profile_photo(job,newer)->>'action')<>'absent' then raise exception 'Lost deletion reply not reconciled'; end if;
 if not public.finish_orphan_profile_photo(job,newer,true) then raise exception 'Confirmed deletion not completed'; end if;
 update private.profile_photo_cleanup_jobs set completed_at=now()-interval '31 days' where job_id=job;
 if public.prune_profile_photo_cleanup()<>1 then raise exception 'Detailed receipt not pruned'; end if;
 if not exists(select 1 from private.profile_photo_retired_paths where path_hash=extensions.digest('81000000-0000-4000-8000-000000000001/orphan.jpg','sha256')) then raise exception 'Reuse fence pruned for active account'; end if;
 begin insert into storage.objects(bucket_id,name) values('profile-photos','81000000-0000-4000-8000-000000000001/orphan.jpg'); raise exception 'Retired path reused after receipt purge'; exception when insufficient_privilege then null; end;
end $$;

-- Defend against stale observer records even if invalidation was missed.
update private.profile_photo_cleanup_jobs set observed_at=now()-interval '8 days',object_id=gen_random_uuid() where path like '%changed.jpg';
insert into private.profile_photo_cleanup_jobs(path_hash,user_id,path,object_id,observed_at)
 select extensions.digest(name,'sha256'),'81000000-0000-4000-8000-000000000001',name,id,now()-interval '8 days' from storage.objects where name like '%attached.jpg';
do $$ begin
 if public.claim_orphan_profile_photos(5)<>'[]'::jsonb then raise exception 'Stale candidate or attachment claimed'; end if;
 if exists(select 1 from private.profile_photo_cleanup_jobs where path like '%attached.jpg' or path like '%changed.jpg') then raise exception 'Invalid observation not removed'; end if;
end $$;
-- Move/rename cannot evade an existing retirement identity or change its owner.
do $$ begin
 begin update storage.objects set name='81000000-0000-4000-8000-000000000001/moved.jpg' where name like '%fresh.jpg'; raise exception 'Mutable photo namespace'; exception when insufficient_privilege then null; end;
end $$;

-- Deletion after retirement hands remaining work to account cleanup. Proof of
-- completed account deletion plus absent Auth/profile/ALL objects permits purge.
update private.profile_photo_cleanup_jobs set observed_at=now()-interval '8 days' where path like '%fresh.jpg';
do $$ declare jobs jsonb; job uuid; lease uuid; deletion jsonb; deletion_lease uuid; begin
 jobs:=public.claim_orphan_profile_photos(5); job:=(jobs->0->>'jobId')::uuid; lease:=(jobs->0->>'leaseId')::uuid;
 if job is null then raise exception 'Missing deletion-race candidate'; end if;
 perform public.request_account_deletion('81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001',repeat('f',64));
 if (public.prepare_orphan_profile_photo(job,lease)->>'action')<>'account-deletion' then raise exception 'Account cleanup ownership ignored'; end if;
 perform public.finish_orphan_profile_photo(job,lease,false);
 perform public.prune_profile_photo_cleanup();
 if not exists(select 1 from private.profile_photo_retired_paths where user_id='81000000-0000-4000-8000-000000000001') then raise exception 'Fence pruned before actual account cleanup'; end if;
 begin insert into storage.objects(bucket_id,name) values('profile-photos','81000000-0000-4000-8000-000000000001/late-admin.jpg'); raise exception 'Deleting namespace repopulated'; exception when insufficient_privilege then null; end;
 deletion:=public.claim_account_deletions(1); deletion_lease:=(deletion->0->>'leaseId')::uuid;
 delete from storage.objects where name like '81000000-0000-4000-8000-000000000001/%';
 delete from auth.users where id='81000000-0000-4000-8000-000000000001';
 if not public.finish_account_deletion('84000000-0000-4000-8000-000000000001',deletion_lease,true) then raise exception 'Deletion completion failed'; end if;
 perform public.prune_profile_photo_cleanup();
 if exists(select 1 from private.profile_photo_retired_paths where user_id='81000000-0000-4000-8000-000000000001') or exists(select 1 from private.profile_photo_cleanup_jobs where user_id='81000000-0000-4000-8000-000000000001') then raise exception 'Photo identifiers outlived verified account deletion'; end if;
 begin insert into storage.objects(bucket_id,name) values('profile-photos','81000000-0000-4000-8000-000000000001/orphan.jpg'); raise exception 'Removed namespace recreated'; exception when insufficient_privilege then null; end;
end $$;
rollback;
