-- Rehearsal for 20261021120000_gi1_event_links (hosted-baseline mode only); .after.sql removes everything here.
-- 1. Data in the pre-GI1 shape: an event and a guest, as the live database holds them.
insert into auth.users(id,email,email_confirmed_at) values
 ('a9000000-0000-4000-8000-000000000001','gi1-rehearsal-owner@resbite-test.invalid',now()),
 ('a9000000-0000-4000-8000-000000000002','gi1-rehearsal-guest@resbite-test.invalid',now());
insert into public.profiles(id,display_name) values ('a9000000-0000-4000-8000-000000000001','Rehearsal owner'),('a9000000-0000-4000-8000-000000000002','Rehearsal guest');
insert into public.plans(id,owner_id,title,description,categories,starts_at,time_zone,place_label) values
 ('a9100000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000001','Rehearsal night','',array['community'],now()+interval '1 day','UTC','Park');
insert into public.attendees(plan_id,user_id,response) values ('a9100000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000002','accepted');

-- 2. The exact definitions GI1 replaces, so .after.sql can prove the rollback restores them.
create function private.gi1_rehearsal_snapshot() returns table(name text, definition text)
language sql stable set search_path='' as $$
 select p.oid::regprocedure::text, pg_catalog.pg_get_functiondef(p.oid) from pg_catalog.pg_proc p
 where p.oid in ('private.create_plan_v3(uuid,text,text,text[],text,timestamptz,timestamptz,text,text,text,double precision,double precision)'::regprocedure,
  'public.create_plan_v3(uuid,text,text,text[],text,timestamptz,timestamptz,text,text,text,double precision,double precision)'::regprocedure,
  'private.change_plan_v3(uuid,integer,text,text,text[],timestamptz,timestamptz,text,text,text,boolean,boolean)'::regprocedure,
  'public.change_plan_v3(uuid,integer,text,text,text[],timestamptz,timestamptz,text,text,text,boolean)'::regprocedure,
  'private.redact_deleting_owner_plan()'::regprocedure)
 union all
 select 'constraint '||conname, pg_catalog.pg_get_constraintdef(oid) from pg_catalog.pg_constraint
 where conrelid in ('public.plans'::regclass,'public.attendees'::regclass)
 union all
 select 'columns '||c.relname, string_agg(a.attname||':'||pg_catalog.format_type(a.atttypid,a.atttypmod), ',' order by a.attnum)
 from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid=a.attrelid
 where c.oid='public.plans'::regclass and a.attnum>0 and not a.attisdropped group by c.relname
 union all
 select 'grants', string_agg(f||':'||r||':'||pg_catalog.has_function_privilege(r,f,'execute')::text, ',' order by f, r)
 from unnest(array['public.create_plan_v3(uuid,text,text,text[],text,timestamptz,timestamptz,text,text,text,double precision,double precision)',
  'private.create_plan_v3(uuid,text,text,text[],text,timestamptz,timestamptz,text,text,text,double precision,double precision)',
  'public.change_plan_v3(uuid,integer,text,text,text[],timestamptz,timestamptz,text,text,text,boolean)',
  'private.change_plan_v3(uuid,integer,text,text,text[],timestamptz,timestamptz,text,text,text,boolean,boolean)']) f,
  unnest(array['anon','authenticated','service_role']) r
$$;
revoke all on function private.gi1_rehearsal_snapshot() from public, anon, authenticated, service_role;
create table private.gi1_rehearsal_baseline as select * from private.gi1_rehearsal_snapshot();
alter table private.gi1_rehearsal_baseline enable row level security;
