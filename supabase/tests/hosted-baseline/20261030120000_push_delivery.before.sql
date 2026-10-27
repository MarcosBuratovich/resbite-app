-- Rehearsal for 20261030120000_push_delivery (hosted-baseline mode only); .after.sql removes everything here.
-- 1. Data in the pre-migration shape: a host and a guest who have used the app (maintainer grants); the host's event
-- with a live open link; the guest on it, with a phone bound to them and their answer's notice to the host waiting in
-- the outbox (on the hosted project nothing sends yet); two phone accounts with nothing yet, who will ask to join; and
-- an app account a web account folds into.
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values
 ('da000000-0000-4000-8000-000000000001',null,null,'447700900701',now()),
 ('da000000-0000-4000-8000-000000000002',null,null,'447700900702',now()),
 ('da000000-0000-4000-8000-000000000003',null,null,'447700900703',now()),
 ('da000000-0000-4000-8000-000000000004',null,null,'447700900704',now()),
 ('da000000-0000-4000-8000-000000000005',null,null,'447700900705',now());
insert into public.profiles(id,display_name) values
 ('da000000-0000-4000-8000-000000000001','Rehearsal Hana'),('da000000-0000-4000-8000-000000000002','Rehearsal Gil'),
 ('da000000-0000-4000-8000-000000000004','Rehearsal Ola');
insert into private.app_sessions(user_id) values ('da000000-0000-4000-8000-000000000001'),
 ('da000000-0000-4000-8000-000000000002'),('da000000-0000-4000-8000-000000000004');
insert into private.beta_access(user_id,source) values ('da000000-0000-4000-8000-000000000001','maintainer'),
 ('da000000-0000-4000-8000-000000000002','maintainer'),('da000000-0000-4000-8000-000000000004','maintainer');
insert into public.plans(id,owner_id,title,starts_at,time_zone,place_label,categories) values
 ('db000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000001','Rehearsal supper','2099-09-01 19:00+00','UTC','Kitchen',array['community']);
insert into private.plan_links(id,plan_id,code) values
 ('dc000000-0000-4000-8000-000000000001','db000000-0000-4000-8000-000000000001',repeat('P',22));
insert into public.attendees(plan_id,user_id,response) values
 ('db000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000002','accepted');
insert into private.device_endpoints(token,user_id,platform) values
 ('ExpoPushToken[push-rehearsal-gil]','da000000-0000-4000-8000-000000000002','ios');
insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id) values
 ('db000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000001','rsvp','push-rehearsal:gil-rsvp','da000000-0000-4000-8000-000000000002');

-- 2. A fingerprint of both schemas the app uses, private and public: every function's definition and grants; every
-- relation's kind, row security and grants; every column's type, nullability, default, identity, generation,
-- collation and grants; every index's and view's definition; every constraint, type, policy and trigger; every
-- comment; and both schemas' grants (the rehearsal's own helpers left out). .after.sql proves the apply changes only
-- what the migration says and the rollback restores every entry exactly.
create function private.push_rehearsal_snapshot() returns table(name text, definition text)
language sql stable set search_path='' as $$
 with s as (select oid from pg_catalog.pg_namespace where nspname in ('private','public')),
 f as (select p.oid, p.proacl from pg_catalog.pg_proc p
  where p.pronamespace in (select oid from s) and p.prokind in ('f','p') and p.proname not like 'push_rehearsal%'),
 r as (select c.oid, c.relkind, c.relrowsecurity, c.relforcerowsecurity, c.relacl from pg_catalog.pg_class c
  where c.relnamespace in (select oid from s) and c.relname not like 'push_rehearsal%')
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
revoke all on function private.push_rehearsal_snapshot() from public, anon, authenticated, service_role;
create table private.push_rehearsal_baseline as select * from private.push_rehearsal_snapshot();
alter table private.push_rehearsal_baseline enable row level security;
-- The rows of the two tables the migration alters, to prove the apply writes none.
create table private.push_rehearsal_rows as
 select 'device' as what, pg_catalog.to_jsonb(e) as row from private.device_endpoints e
 union all select 'notice', pg_catalog.to_jsonb(o) from private.notification_outbox o;
alter table private.push_rehearsal_rows enable row level security;
do $$ begin
 if exists(select 1 from private.push_rehearsal_baseline where name like '%notification_deliver%'
  or name like '%unregister_device%' or name like '%notification_recipient_eligible%' or name like '%expanded_at%'
  or name like 'comment %notification_outbox%') then
  raise exception 'Push delivery objects exist before the migration';
 end if;
 -- The hosted register_device is the foundation's, behind require_tester(); the fold is plan 3's, without notices.
 if (select count(*) from private.push_rehearsal_baseline where name in ('definition private.register_device(text,text)',
   'definition public.register_device(text,text)','grants private.register_device(text,text)',
   'grants public.register_device(text,text)','definition private.fold_web_account(uuid,uuid)',
   'grants private.fold_web_account(uuid,uuid)','column private.notification_outbox.delivered_at',
   'relation private.device_endpoints','relation private.notification_outbox','schema private') and definition is not null)<>10
 or not exists(select 1 from private.push_rehearsal_baseline where name='definition private.register_device(text,text)'
   and definition like '%private.require_tester()%' and definition like '%length(p_token) not between 10 and 300%')
 or not exists(select 1 from private.push_rehearsal_baseline where name='definition private.fold_web_account(uuid,uuid)'
   and definition like '%update private.join_requests set user_id=p_into%' and definition not like '%notification_outbox%') then
  raise exception 'Expected the foundation register_device with its grants, the plan 3 fold and the outbox';
 end if;
end $$;
