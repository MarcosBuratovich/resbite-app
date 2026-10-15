-- Rehearsal for 20261015120000_ux3_event_details (hosted-baseline mode only); .after.sql removes everything here.
-- 1. Data in the pre-UX3 shape: an event with a note, one without, and a queued notice.
insert into auth.users(id,email,email_confirmed_at) values
 ('f9000000-0000-4000-8000-000000000001','ux3-rehearsal-owner@resbite-test.invalid',now());
insert into public.profiles(id,display_name) values ('f9000000-0000-4000-8000-000000000001','Rehearsal owner');
insert into public.plans(id,owner_id,title,description,categories,starts_at,time_zone,place_label,note) values
 ('f9100000-0000-4000-8000-000000000001','f9000000-0000-4000-8000-000000000001','With note','',array['community'],now()+interval '1 day','UTC','Park','Gate 4512'),
 ('f9100000-0000-4000-8000-000000000002','f9000000-0000-4000-8000-000000000001','Without note','',array['community'],now()+interval '2 days','UTC','Park','');
insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key)
 values('f9100000-0000-4000-8000-000000000001','f9000000-0000-4000-8000-000000000001','rsvp','ux3-rehearsal-1');

-- 2. The exact definitions UX3 replaces, so .after.sql can prove the rollback restores them.
create function private.ux3_rehearsal_snapshot() returns table(name text, definition text)
language sql stable set search_path='' as $$
 select p.oid::regprocedure::text, pg_catalog.pg_get_functiondef(p.oid) from pg_catalog.pg_proc p
 where p.oid in ('private.create_plan_v2(uuid,text,text,text[],text,timestamptz,text,text,text,double precision,double precision)'::regprocedure,
  'private.change_plan_v2(uuid,integer,text,text,text[],timestamptz,text,text,text,boolean)'::regprocedure,
  'private.redact_deleting_owner_plan()'::regprocedure)
 union all
 select 'constraint '||conname, pg_catalog.pg_get_constraintdef(oid) from pg_catalog.pg_constraint
 where conrelid in ('public.plans'::regclass,'private.notification_outbox'::regclass)
 union all
 select 'columns '||c.relname, string_agg(a.attname||':'||pg_catalog.format_type(a.atttypid,a.atttypmod), ',' order by a.attnum)
 from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid=a.attrelid
 where c.oid='public.plans'::regclass and a.attnum>0 and not a.attisdropped group by c.relname
 union all
 select 'grants', string_agg(f||':'||r||':'||pg_catalog.has_function_privilege(r,f,'execute')::text, ',' order by f, r)
 from unnest(array['public.create_plan_v2(uuid,text,text,text[],text,timestamptz,text,text,text,double precision,double precision)',
  'private.create_plan_v2(uuid,text,text,text[],text,timestamptz,text,text,text,double precision,double precision)',
  'public.change_plan_v2(uuid,integer,text,text,text[],timestamptz,text,text,text,boolean)',
  'private.change_plan_v2(uuid,integer,text,text,text[],timestamptz,text,text,text,boolean)']) f,
  unnest(array['anon','authenticated','service_role']) r
$$;
revoke all on function private.ux3_rehearsal_snapshot() from public, anon, authenticated, service_role;
create table private.ux3_rehearsal_baseline as select * from private.ux3_rehearsal_snapshot();
alter table private.ux3_rehearsal_baseline enable row level security;
