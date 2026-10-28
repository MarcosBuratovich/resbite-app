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

-- 2. A fingerprint of both schemas the app uses, private and public (every function's definition and grants, every
-- relation, column, index, view, constraint, type, policy, trigger and comment, and both schemas' grants; the
-- rehearsal's own helpers left out), and the plan-covers bucket's storage policies, which the fingerprint does not
-- cover. .after.sql proves the apply changes only what the migration says and the rollback restores every entry.
create function private.cr_rehearsal_snapshot() returns table(name text, definition text)
language sql stable set search_path='' as $$
 with s as (select oid from pg_catalog.pg_namespace where nspname in ('private','public')),
 f as (select p.oid, p.proacl from pg_catalog.pg_proc p
  where p.pronamespace in (select oid from s) and p.prokind in ('f','p') and p.proname not like 'cr_rehearsal%'),
 r as (select c.oid, c.relkind, c.relrowsecurity, c.relforcerowsecurity, c.relacl from pg_catalog.pg_class c
  where c.relnamespace in (select oid from s) and c.relname not like 'cr_rehearsal%')
 select 'definition '||f.oid::regprocedure::text, pg_catalog.pg_get_functiondef(f.oid) from f
 union all
 select 'grants '||f.oid::regprocedure::text, f.proacl::text from f
 union all
 select 'relation '||r.oid::regclass::text,
  pg_catalog.format('%s rls=%s forced=%s grants=%s',r.relkind,r.relrowsecurity,r.relforcerowsecurity,r.relacl) from r
 union all
 select 'column '||r.oid::regclass::text||'.'||a.attname,
  pg_catalog.format('%s notnull=%s default=%s identity=%s generated=%s collation=%s grants=%s',
   pg_catalog.format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_catalog.pg_get_expr(d.adbin,d.adrelid),
   a.attidentity,a.attgenerated,a.attcollation,a.attacl)
 from r join pg_catalog.pg_attribute a on a.attrelid=r.oid and a.attnum>0 and not a.attisdropped
 left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
 where r.relkind in ('r','p','v','m','f','c')
 union all
 select 'index '||r.oid::regclass::text, pg_catalog.pg_get_indexdef(r.oid) from r where r.relkind in ('i','I')
 union all
 select 'view '||r.oid::regclass::text, pg_catalog.pg_get_viewdef(r.oid) from r where r.relkind in ('v','m')
 union all
 select 'constraint '||c.conrelid::regclass::text||' '||c.conname, pg_catalog.pg_get_constraintdef(c.oid)
 from pg_catalog.pg_constraint c where c.conrelid in (select oid from r)
 union all
 select 'constraint '||c.contypid::regtype::text||' '||c.conname, pg_catalog.pg_get_constraintdef(c.oid)
 from pg_catalog.pg_constraint c where c.contypid<>0 and c.connamespace in (select oid from s)
 union all
 select 'type '||t.oid::regtype::text, pg_catalog.format('%s base=%s notnull=%s default=%s labels=%s',t.typtype,
  pg_catalog.format_type(t.typbasetype,t.typtypmod),t.typnotnull,t.typdefault,
  (select pg_catalog.array_agg(e.enumlabel order by e.enumsortorder) from pg_catalog.pg_enum e where e.enumtypid=t.oid))
 from pg_catalog.pg_type t where t.typnamespace in (select oid from s) and t.typtype in ('c','d','e','m','r')
  and (t.typtype<>'c' or exists(select 1 from pg_catalog.pg_class c where c.oid=t.typrelid and c.relkind='c'))
 union all
 select 'policy '||p.schemaname||'.'||p.tablename||' '||p.policyname,
  pg_catalog.format('%s %s %s using %s check %s',p.permissive,p.roles,p.cmd,p.qual,p.with_check)
 from pg_catalog.pg_policies p where p.schemaname in ('private','public')
 union all
 select 'trigger '||t.tgrelid::regclass::text||' '||t.tgname, pg_catalog.pg_get_triggerdef(t.oid)||' enabled='||t.tgenabled::text
 from pg_catalog.pg_trigger t where t.tgrelid in (select oid from r) and not t.tgisinternal
 union all
 select 'comment '||pg_catalog.pg_describe_object(d.classoid,d.objoid,d.objsubid), d.description
 from pg_catalog.pg_description d
 where (d.classoid='pg_catalog.pg_class'::pg_catalog.regclass and d.objoid in (select oid from r))
  or (d.classoid='pg_catalog.pg_proc'::pg_catalog.regclass and d.objoid in (select oid from f))
  or (d.classoid='pg_catalog.pg_constraint'::pg_catalog.regclass
   and d.objoid in (select c.oid from pg_catalog.pg_constraint c where c.connamespace in (select oid from s)))
  or (d.classoid='pg_catalog.pg_type'::pg_catalog.regclass
   and d.objoid in (select t.oid from pg_catalog.pg_type t where t.typnamespace in (select oid from s)))
  or (d.classoid='pg_catalog.pg_namespace'::pg_catalog.regclass and d.objoid in (select oid from s))
 union all
 select 'schema '||n.nspname, n.nspacl::text from pg_catalog.pg_namespace n where n.oid in (select oid from s)
$$;
revoke all on function private.cr_rehearsal_snapshot() from public, anon, authenticated, service_role;
create table private.cr_rehearsal_baseline as select * from private.cr_rehearsal_snapshot();
create table private.cr_rehearsal_policies as
 select policyname, cmd, roles::text as roles, qual, with_check from pg_catalog.pg_policies
 where schemaname='storage' and tablename='objects';
alter table private.cr_rehearsal_baseline enable row level security;
alter table private.cr_rehearsal_policies enable row level security;

-- 3. The pre-state: none of the migration's tables, columns, functions or outbox values exist, and the public page
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
