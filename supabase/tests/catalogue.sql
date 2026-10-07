-- Synthetic catalogue-only fixtures; no hosted publication. Every change rolls back.
begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('83000000-0000-4000-8000-000000000001','catalogue-owner@resbite-test.invalid',now(),'{}'),
 ('83000000-0000-4000-8000-000000000002','catalogue-outside@resbite-test.invalid',now(),'{}');
insert into private.tester_roster(email) values ('catalogue-owner@resbite-test.invalid');
insert into public.activities(id,title,description,category,artwork_key,source_ids,published,tips,duration_minutes,categories) values
 ('catalogue-live','Live fixture','Server wording','Creative','painting',array['fixture'],true,array['Reviewed suggestion'],30,array['creative']),
 ('catalogue-draft','Draft fixture','Unapproved wording','Creative','painting',array['fixture'],false,array['Draft suggestion'],null,null);
do $$ begin
 begin update public.activities set duration_minutes=0 where id='catalogue-live'; raise exception 'Invalid duration accepted'; exception when check_violation then null; end;
 begin update public.activities set tips=array[null]::text[] where id='catalogue-live'; raise exception 'Null tip accepted'; exception when check_violation then null; end;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"83000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.save_profile('Catalogue fixture');
do $$ begin
 if (select count(*) from public.activities where id like 'catalogue-%')<>1 then raise exception 'Publication filter failed'; end if;
 if (select duration_minutes from public.activities where id='catalogue-live')<>30 then raise exception 'Duration unavailable'; end if;
 if (select tips from public.activities where id='catalogue-live')<>array['Reviewed suggestion'] then raise exception 'Reviewed tips unavailable'; end if;
 begin perform public.create_plan('83000000-0000-4000-8000-000000000003','catalogue-draft',now()+interval '1 day','UTC','Fixture'); raise exception 'Draft activity planned'; exception when invalid_parameter_value then null; end;
 begin update public.activities set published=true where id='catalogue-draft'; raise exception 'Tester published draft'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"83000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if exists(select 1 from public.activities) then raise exception 'Non-roster catalogue exposed'; end if;
end $$;
reset role;
update public.activities set published=false where id='catalogue-live';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"83000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 if exists(select 1 from public.activities where id='catalogue-live') then raise exception 'Unpublished row remained available'; end if;
end $$;
rollback;
