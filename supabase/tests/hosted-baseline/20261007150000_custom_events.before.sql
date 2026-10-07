-- A plan in the pre-custom-events shape, so the migration's backfill can be checked.
insert into auth.users(id,email,email_confirmed_at) values('b1000000-0000-4000-8000-000000000001','legacy-owner@resbite-test.invalid',now());
insert into public.profiles(id,display_name) values('b1000000-0000-4000-8000-000000000001','Legacy owner');
insert into public.activities(id,title,description,category,artwork_key,source_ids,published) values('painting','Painting','Legacy fixture','Creative','painting',array['fixture'],true);
insert into public.plans(id,owner_id,activity_id,starts_at,time_zone,place_label) values('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','painting',now()+interval '1 day','UTC','Legacy place');
