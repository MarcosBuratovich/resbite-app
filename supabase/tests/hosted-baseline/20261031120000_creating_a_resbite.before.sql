-- Rehearsal for 20261031120000_creating_a_resbite (hosted-baseline mode only); .after.sql removes everything here.
-- 1. Data in the pre-migration shape: a host who has used the app (a maintainer grant), and a running event of theirs
-- (started an hour ago, ends in an hour) with a live open link. Before the migration the public page says it
-- happened, because the old pages count from the start.
insert into auth.users(id,email,email_confirmed_at) values
 ('de000000-0000-4000-8000-000000000001','creating-rehearsal-host@resbite-test.invalid',now());
insert into public.profiles(id,display_name) values ('de000000-0000-4000-8000-000000000001','Rehearsal host');
insert into private.app_sessions(user_id) values ('de000000-0000-4000-8000-000000000001');
insert into private.beta_access(user_id,source) values ('de000000-0000-4000-8000-000000000001','maintainer');
insert into public.plans(id,owner_id,title,starts_at,ends_at,time_zone,place_label,categories) values
 ('df000000-0000-4000-8000-000000000001','de000000-0000-4000-8000-000000000001','Rehearsal running supper',
  now()-interval '1 hour',now()+interval '1 hour','UTC','Kitchen',array['community']);
insert into private.plan_links(id,plan_id,code) values
 ('e0000000-0000-4000-8000-000000000001','df000000-0000-4000-8000-000000000001',repeat('C',22));

-- 2. The pre-state: none of the migration's tables, columns, functions or outbox values exist, and the public page
-- counts from the start.
do $$ begin
 if pg_catalog.to_regclass('public.plan_admins') is not null or pg_catalog.to_regclass('public.plan_mutes') is not null then
  raise exception 'Admins or mutes exist before the migration';
 end if;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='plans'
   and column_name in ('place_tbd','repeat_weeks','series_id','repeats_from')) then
  raise exception 'The repeat or place columns exist before the migration';
 end if;
 if pg_catalog.to_regprocedure('private.plan_end(timestamptz,timestamptz)') is not null
 or pg_catalog.to_regprocedure('private.is_host(uuid,uuid)') is not null
 or pg_catalog.to_regprocedure('private.roll_repeating_plans()') is not null
 or pg_catalog.to_regprocedure('public.set_plan_mute(uuid,boolean)') is not null
 or pg_catalog.to_regprocedure('public.appoint_admin(uuid,uuid)') is not null then
  raise exception 'A creating-a-resbite function exists before the migration';
 end if;
 if (select pg_catalog.pg_get_constraintdef(oid) from pg_catalog.pg_constraint where conname='notification_outbox_kind_check') like '%admin_added%'
 or (select pg_catalog.pg_get_constraintdef(oid) from pg_catalog.pg_constraint where conname='notification_outbox_detail_check') like '%again%' then
  raise exception 'The outbox checks already allow the new values';
 end if;
 if public.invitation_page(repeat('C',22))->>'state' is distinct from 'happened' then
  raise exception 'The public page does not say happened at the start: %', public.invitation_page(repeat('C',22));
 end if;
end $$;
