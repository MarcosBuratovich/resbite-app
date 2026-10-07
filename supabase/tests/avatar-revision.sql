-- Foundation-compatible photo CAS/privacy assertions; all fixtures roll back.
begin;
insert into auth.users(id,email,email_confirmed_at,is_anonymous,banned_until) values
 ('86000000-0000-4000-8000-000000000001','avatar-owner@resbite-test.invalid',now(),false,null),
 ('86000000-0000-4000-8000-000000000002','avatar-peer@resbite-test.invalid',now(),false,null),
 ('86000000-0000-4000-8000-000000000003','avatar-outsider@resbite-test.invalid',now(),false,null),
 ('86000000-0000-4000-8000-000000000004','avatar-pending@resbite-test.invalid',now(),false,null),
 ('86000000-0000-4000-8000-000000000005','avatar-unconfirmed@resbite-test.invalid',null,false,null),
 ('86000000-0000-4000-8000-000000000006','avatar-anonymous@resbite-test.invalid',now(),true,null),
 ('86000000-0000-4000-8000-000000000007','avatar-banned@resbite-test.invalid',now(),false,now()+interval '1 day'),
 ('86000000-0000-4000-8000-000000000008','avatar-deleting@resbite-test.invalid',now(),false,null),
 ('86000000-0000-4000-8000-000000000009','avatar-no-profile@resbite-test.invalid',now(),false,null);
insert into private.tester_roster(email) select email from auth.users where id::text like '86000000-%' and email<>'avatar-pending@resbite-test.invalid';
insert into public.profiles(id,display_name,avatar_path) values
 ('86000000-0000-4000-8000-000000000001','Owner','86000000-0000-4000-8000-000000000001/a.jpg'),
 ('86000000-0000-4000-8000-000000000002','Peer',null),
 ('86000000-0000-4000-8000-000000000003','Outsider',null);
insert into public.profiles(id,display_name,deletion_requested_at) values('86000000-0000-4000-8000-000000000008','Deleting',now());
insert into storage.objects(bucket_id,name,owner) values
 ('profile-photos','86000000-0000-4000-8000-000000000001/a.jpg','86000000-0000-4000-8000-000000000001'),
 ('profile-photos','86000000-0000-4000-8000-000000000001/b.jpg','86000000-0000-4000-8000-000000000001'),
 ('profile-photos','86000000-0000-4000-8000-000000000001/c.jpg','86000000-0000-4000-8000-000000000001'),
 ('profile-photos','86000000-0000-4000-8000-000000000002/own.jpg','86000000-0000-4000-8000-000000000002');
insert into public.activities(id,title,description,category,artwork_key,source_ids,categories) values('avatar-fixture','Fixture','Fixture','Creative','fixture',array['fixture'],array['creative']);
insert into public.plans(id,owner_id,activity_id,starts_at,time_zone,place_label)
 values('87000000-0000-4000-8000-000000000001','86000000-0000-4000-8000-000000000001','avatar-fixture',now()+interval '1 day','Europe/London','Fixture');
insert into public.attendees(plan_id,user_id,response)
 values('87000000-0000-4000-8000-000000000001','86000000-0000-4000-8000-000000000002','accepted');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"86000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare
 a text := '86000000-0000-4000-8000-000000000001/a.jpg';
 b text := '86000000-0000-4000-8000-000000000001/b.jpg';
 c text := '86000000-0000-4000-8000-000000000001/c.jpg';
 result jsonb;
begin
 result:=public.set_avatar_if_current(a,a,0);
 if result<>jsonb_build_object('avatar_path',a,'avatar_revision',0) then raise exception 'No-op changed revision'; end if;
 result:=public.set_avatar_if_current(b,a,0);
 if result<>jsonb_build_object('avatar_path',b,'avatar_revision',1) then raise exception 'CAS did not increment revision'; end if;
 if public.set_avatar_if_current(b,a,0)<>result then raise exception 'Lost successful reply could not be retried'; end if;
 begin perform public.set_avatar_if_current(c,a,0); raise exception 'Stale upload replaced newer photo'; exception when serialization_failure then null; end;
 perform public.set_avatar(a);
 perform public.set_avatar(a);
 perform public.save_profile('Still owner');
 if (select avatar_revision from public.profiles where id=auth.uid())<>2 then raise exception 'Legacy or no-op revision incorrect'; end if;
 begin perform public.set_avatar_if_current(c,a,0); raise exception 'ABA baseline was accepted'; exception when serialization_failure then null; end;
 perform public.set_avatar(b);
 begin perform public.set_avatar_if_current(b,a,0); raise exception 'ABA target was mistaken for a retry'; exception when serialization_failure then null; end;
 result:=public.set_avatar_if_current(null,b,3);
 if result<>jsonb_build_object('avatar_path',null,'avatar_revision',4) then raise exception 'Detach failed'; end if;
 if public.set_avatar_if_current(null,b,3)<>result or public.set_avatar_if_current(null,null,4)<>result then raise exception 'Detach retry/no-op failed'; end if;
 begin perform public.set_avatar_if_current(c,a,4); raise exception 'Wrong baseline path accepted'; exception when serialization_failure then null; end;
 begin perform public.set_avatar_if_current(c,null,null); raise exception 'Null revision accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.set_avatar_if_current(c,null,-1); raise exception 'Negative revision accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.set_avatar_if_current('86000000-0000-4000-8000-000000000002/own.jpg',null,4); raise exception 'Another owner photo attached'; exception when insufficient_privilege then null; end;
 begin perform public.set_avatar_if_current('86000000-0000-4000-8000-000000000001/missing.jpg',null,4); raise exception 'Missing object attached'; exception when insufficient_privilege then null; end;
 begin update public.profiles set avatar_revision=0 where id=auth.uid(); raise exception 'Direct client revision mutation allowed'; exception when insufficient_privilege then null; end;
 perform public.set_avatar_if_current(b,null,4);
 -- RLS DELETE must affect no objects, even the owner's currently selected photo.
 delete from storage.objects where bucket_id='profile-photos' and name=b;
 if not exists(select 1 from storage.objects where bucket_id='profile-photos' and name=b) then raise exception 'Owner deleted an attached object'; end if;
 if (select count(*) from storage.objects where bucket_id='profile-photos' and name like auth.uid()::text||'/%')<>3 then raise exception 'Owner lost interrupted-upload reads'; end if;
end $$;

reset role;
-- Trusted direct maintenance must also increment once and cannot forge counters.
update public.profiles set avatar_path='86000000-0000-4000-8000-000000000001/c.jpg',avatar_revision=900 where id='86000000-0000-4000-8000-000000000001';
update public.profiles set avatar_path='86000000-0000-4000-8000-000000000001/b.jpg',avatar_revision=0 where id='86000000-0000-4000-8000-000000000001';
update public.profiles set avatar_revision=900 where id='86000000-0000-4000-8000-000000000001';
do $$ begin
 if (select avatar_revision from public.profiles where id='86000000-0000-4000-8000-000000000001')<>7 then raise exception 'Trusted maintenance bypassed revision tracking'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"86000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if (select count(*) from storage.objects where bucket_id='profile-photos' and name like '86000000-0000-4000-8000-000000000001/%')<>1
   or not exists(select 1 from storage.objects where name='86000000-0000-4000-8000-000000000001/b.jpg') then
  raise exception 'Peer can read a replaced/orphan photo or cannot read current photo';
 end if;
 begin perform public.set_avatar_if_current('86000000-0000-4000-8000-000000000001/b.jpg',null,0); raise exception 'Peer attached another owner photo'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"86000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 if exists(select 1 from storage.objects where bucket_id='profile-photos') then raise exception 'Unrelated approved account read another photo'; end if;
end $$;
do $$ declare uid uuid; begin
 foreach uid in array array[
  '86000000-0000-4000-8000-000000000004'::uuid,'86000000-0000-4000-8000-000000000005'::uuid,
  '86000000-0000-4000-8000-000000000006'::uuid,'86000000-0000-4000-8000-000000000007'::uuid,
  '86000000-0000-4000-8000-000000000008'::uuid,'86000000-0000-4000-8000-000000000099'::uuid,null::uuid
 ] loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','tester',true,'email_verified',true)::text,true);
  begin perform public.set_avatar_if_current(null,null,0); raise exception 'Ineligible account set photo'; exception when insufficient_privilege then null; end;
 end loop;
end $$;
select set_config('request.jwt.claims','{"sub":"86000000-0000-4000-8000-000000000009","role":"authenticated"}',true);
do $$ begin
 begin perform public.set_avatar_if_current(null,null,0); raise exception 'Missing profile silently succeeded'; exception when invalid_parameter_value then null; end;
end $$;
set local role anon;
do $$ begin
 begin perform public.set_avatar_if_current(null,null,0); raise exception 'Anonymous CAS allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ declare endpoint regprocedure; begin
 foreach endpoint in array array['private.set_avatar_if_current(text,text,bigint)'::regprocedure,'public.set_avatar_if_current(text,text,bigint)'::regprocedure] loop
  if has_function_privilege('anon',endpoint,'EXECUTE') or has_function_privilege('service_role',endpoint,'EXECUTE') then raise exception 'Excessive CAS grants'; end if;
  if not has_function_privilege('authenticated',endpoint,'EXECUTE') then raise exception 'CAS inaccessible'; end if;
 end loop;
 if has_function_privilege('authenticated','private.track_avatar_revision()','EXECUTE') then raise exception 'Trigger function exposed'; end if;
 if (select prosecdef from pg_proc where oid='public.set_avatar_if_current(text,text,bigint)'::regprocedure) then raise exception 'Public CAS wrapper is definer'; end if;
 if not (select prosecdef and 'search_path=""'=any(proconfig) from pg_proc where oid='private.set_avatar_if_current(text,text,bigint)'::regprocedure) then raise exception 'Unsafe CAS search path'; end if;
end $$;
-- Disabled worker code can still use its existing service Storage privileges.
set local role service_role;
delete from storage.objects where bucket_id='profile-photos' and name='86000000-0000-4000-8000-000000000001/c.jpg';
reset role;
do $$ begin
 if exists(select 1 from storage.objects where name='86000000-0000-4000-8000-000000000001/c.jpg') then raise exception 'Service cleanup lost Storage deletion access'; end if;
end $$;
rollback;
select 'Avatar revision, CAS and Storage privacy assertions passed; fixtures rolled back' as result;
