-- CE2 cover photos. Synthetic identities only; every change rolls back.
begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('c1000000-0000-4000-8000-000000000001','cover-owner@resbite-test.invalid',now(),'{}'),
 ('c1000000-0000-4000-8000-000000000002','cover-invitee@resbite-test.invalid',now(),'{}'),
 ('c1000000-0000-4000-8000-000000000003','cover-outsider@resbite-test.invalid',now(),'{}');
insert into private.tester_roster(email) values
 ('cover-owner@resbite-test.invalid'),('cover-invitee@resbite-test.invalid'),('cover-outsider@resbite-test.invalid');

-- Bucket settings pinned: private, 2MB, JPEG only.
do $$ begin
 if not exists(select 1 from storage.buckets where id='plan-covers' and public=false and file_size_limit=2097152 and allowed_mime_types=array['image/jpeg']) then
  raise exception 'Bucket settings not pinned';
 end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.save_profile('Cover owner');
select public.create_plan_v2('c2000000-0000-4000-8000-000000000001','Garden picnic','',array['natural'],null,now()+interval '1 day','UTC','Park','');
select public.create_plan_v2('c2000000-0000-4000-8000-000000000002','Cancelled picnic','',array['natural'],null,now()+interval '2 days','UTC','Park','');
select public.change_plan_v2('c2000000-0000-4000-8000-000000000002',1,null,null,null,null,null,null,null,true);
select public.create_invite('c3000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001',repeat('d',64));
-- The owner uploads only into their own active plan's folder.
insert into storage.objects(bucket_id,name,owner) values
 ('plan-covers','c1000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000001/a.jpg','c1000000-0000-4000-8000-000000000001'),
 ('plan-covers','c1000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000001/b.jpg','c1000000-0000-4000-8000-000000000001');
do $$ declare rc bigint; begin
 begin insert into storage.objects(bucket_id,name) values('plan-covers','c1000000-0000-4000-8000-000000000002/c2000000-0000-4000-8000-000000000001/x.jpg'); raise exception 'Upload into another user folder allowed'; exception when insufficient_privilege then null; end;
 begin insert into storage.objects(bucket_id,name) values('plan-covers','c1000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000002/x.jpg'); raise exception 'Upload into a cancelled plan allowed'; exception when insufficient_privilege then null; end;
 begin insert into storage.objects(bucket_id,name) values('plan-covers','c1000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000009/x.jpg'); raise exception 'Upload for a missing plan allowed'; exception when insufficient_privilege then null; end;
 -- UPDATE policy: move files between folders must raise insufficient_privilege.
 begin update storage.objects set name='c1000000-0000-4000-8000-000000000002/c2000000-0000-4000-8000-000000000001/moved.jpg' where bucket_id='plan-covers' and name='c1000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000001/a.jpg'; raise exception 'Move to another user folder allowed'; exception when insufficient_privilege then null; end;
 begin update storage.objects set name='c1000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000002/moved.jpg' where bucket_id='plan-covers' and name='c1000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000001/a.jpg'; raise exception 'Move to cancelled plan allowed'; exception when insufficient_privilege then null; end;
 -- In-folder no-op update must affect exactly 1 row.
 update storage.objects set owner=owner where bucket_id='plan-covers' and name='c1000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000001/a.jpg';
 get diagnostics rc = row_count;
 if rc<>1 then raise exception 'In-folder no-op update affected %', rc; end if;
end $$;
-- Compare-and-swap attach, exact retry, stale rejection, replace, remove and retry, validation.
do $$ declare
 p uuid := 'c2000000-0000-4000-8000-000000000001';
 a text := 'c1000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000001/a.jpg';
 b text := 'c1000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000001/b.jpg';
 r jsonb;
begin
 r := public.set_plan_cover_if_current(p,a,null,0);
 if r<>jsonb_build_object('cover_path',a,'cover_revision',1) then raise exception 'Attach failed: %',r; end if;
 if public.set_plan_cover_if_current(p,a,null,0)<>r then raise exception 'Lost reply retry failed'; end if;
 begin perform public.set_plan_cover_if_current(p,b,null,0); raise exception 'Stale attach accepted'; exception when serialization_failure then null; end;
 r := public.set_plan_cover_if_current(p,b,a,1);
 if r<>jsonb_build_object('cover_path',b,'cover_revision',2) then raise exception 'Replace failed: %',r; end if;
 begin perform public.set_plan_cover_if_current(p,'c1000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000001/missing.jpg',b,2); raise exception 'Missing object attached'; exception when insufficient_privilege then null; end;
 begin perform public.set_plan_cover_if_current(p,'c1000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000002/a.jpg',b,2); raise exception 'Another plan folder attached'; exception when insufficient_privilege then null; end;
 begin perform public.set_plan_cover_if_current(p,b,b,-1); raise exception 'Negative revision accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.set_plan_cover_if_current('c2000000-0000-4000-8000-000000000002',null,null,0); raise exception 'Cancelled plan cover changed'; exception when invalid_parameter_value then null; end;
 -- Owner remove and its lost-reply retry.
 r := public.set_plan_cover_if_current(p,null,b,2);
 if r<>jsonb_build_object('cover_path',null,'cover_revision',3) then raise exception 'Remove failed: %',r; end if;
 if public.set_plan_cover_if_current(p,null,b,2)<>r then raise exception 'Remove retry failed'; end if;
 r := public.set_plan_cover_if_current(p,b,null,3);
 if r<>jsonb_build_object('cover_path',b,'cover_revision',4) then raise exception 'Re-attach failed: %',r; end if;
 -- No client deletion, not even the owner's own files; the owner still reads both uploads.
 delete from storage.objects where bucket_id='plan-covers' and name=a;
 if not exists(select 1 from storage.objects where name=a) then raise exception 'Owner deleted a cover file'; end if;
 if (select count(*) from storage.objects where bucket_id='plan-covers')<>2 then raise exception 'Owner cannot read own uploads'; end if;
 begin update public.plans set cover_revision=0 where id=p; raise exception 'Direct revision write allowed'; exception when insufficient_privilege then null; end;
end $$;

-- An invitee reads only the current cover and cannot change or upload covers.
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.save_profile('Cover invitee');
select public.claim_invite(repeat('d',64));
do $$ declare rc bigint; begin
 if (select count(*) from storage.objects where bucket_id='plan-covers')<>1
  or not exists(select 1 from storage.objects where name like '%/b.jpg') then raise exception 'Invitee sees a replaced cover or not the current one'; end if;
 if coalesce((select cover_path from public.plans where id='c2000000-0000-4000-8000-000000000001'),'') not like '%/b.jpg' then raise exception 'Invitee cannot read the cover path'; end if;
 begin perform public.set_plan_cover_if_current('c2000000-0000-4000-8000-000000000001',null,'c1000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000001/b.jpg',4); raise exception 'Invitee changed the cover'; exception when insufficient_privilege then null; end;
 begin insert into storage.objects(bucket_id,name) values('plan-covers','c1000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000001/invitee.jpg'); raise exception 'Invitee uploaded a cover'; exception when insufficient_privilege then null; end;
 -- Invitee cannot upload to their own uid folder (but for a different plan).
 begin insert into storage.objects(bucket_id,name) values('plan-covers','c1000000-0000-4000-8000-000000000002/c2000000-0000-4000-8000-000000000001/x.jpg'); raise exception 'Invitee uploaded to plan folder'; exception when insufficient_privilege then null; end;
 -- UPDATE policy: invitee update must affect 0 rows.
 update storage.objects set name=name where bucket_id='plan-covers';
 get diagnostics rc = row_count;
 if rc<>0 then raise exception 'Invitee update affected %', rc; end if;
end $$;
-- An outsider sees no covers at all.
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select public.save_profile('Cover outsider');
do $$ begin
 if exists(select 1 from storage.objects where bucket_id='plan-covers') then raise exception 'Outsider sees covers'; end if;
end $$;
reset role;
-- The attach path must refuse real objects outside <owner>/<plan>/<name>.jpg.
insert into storage.objects(bucket_id,name) values
 ('plan-covers','c1000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000002/real.jpg'),
 ('plan-covers','c1000000-0000-4000-8000-000000000002/c2000000-0000-4000-8000-000000000001/real.jpg'),
 ('plan-covers','c1000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000001/sub/real.jpg');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 begin perform public.set_plan_cover_if_current('c2000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000002/real.jpg','c1000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000001/b.jpg',4); raise exception 'Cancelled plan folder attached'; exception when insufficient_privilege then null; end;
 begin perform public.set_plan_cover_if_current('c2000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000002/c2000000-0000-4000-8000-000000000001/real.jpg','c1000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000001/b.jpg',4); raise exception 'Another user folder attached'; exception when insufficient_privilege then null; end;
 begin perform public.set_plan_cover_if_current('c2000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000001/sub/real.jpg','c1000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000001/b.jpg',4); raise exception 'Subfolder attached'; exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Trusted maintenance cannot forge the counter; deletion detaches the cover and bumps it once.
update public.plans set cover_revision=900 where id='c2000000-0000-4000-8000-000000000001';
do $$ begin
 if (select cover_revision from public.plans where id='c2000000-0000-4000-8000-000000000001')<>4 then raise exception 'Revision forged'; end if;
end $$;
update public.profiles set deletion_requested_at=now() where id='c1000000-0000-4000-8000-000000000001';
update public.plans set place_label='Meeting place removed' where owner_id='c1000000-0000-4000-8000-000000000001';
do $$ begin
 if exists(select 1 from public.plans where owner_id='c1000000-0000-4000-8000-000000000001' and (cover_path is not null or title<>'Resbite')) then raise exception 'Deleting owner cover retained'; end if;
 if (select cover_revision from public.plans where id='c2000000-0000-4000-8000-000000000001')<>5 then raise exception 'Detach on deletion did not bump the revision'; end if;
end $$;
-- Grants: only signed-in users may call the attach function.
do $$ begin
 if has_function_privilege('anon','public.set_plan_cover_if_current(uuid,text,text,bigint)','EXECUTE')
  or has_function_privilege('service_role','public.set_plan_cover_if_current(uuid,text,text,bigint)','EXECUTE')
  or not has_function_privilege('authenticated','public.set_plan_cover_if_current(uuid,text,text,bigint)','EXECUTE') then
  raise exception 'set_plan_cover_if_current grants are wrong';
 end if;
end $$;
rollback;
