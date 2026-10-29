-- Rehearsal for 20261030130000_phone_key (hosted-baseline mode only); .after.sql removes everything here.
-- 1. Data in the pre-migration shape: accounts with older Argentine numbers (one to rewrite, one already right, a
-- colliding pair that both stay, one with a pending number change to rewrite too) and a UK account that is untouched.
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values
 ('e2000000-0000-4000-8000-000000000001',null,null,'541112340001',now()),
 ('e2000000-0000-4000-8000-000000000002',null,null,'5491112340002',now()),
 ('e2000000-0000-4000-8000-000000000003',null,null,'541112340003',now()),
 ('e2000000-0000-4000-8000-000000000004',null,null,'5491112340003',now()),
 ('e2000000-0000-4000-8000-000000000005',null,null,'447700900805',now()),
 ('e2000000-0000-4000-8000-000000000006',null,null,'541112340006',now());
update auth.users set phone_change='541112340066' where id='e2000000-0000-4000-8000-000000000006';
insert into public.profiles(id,display_name) values ('e2000000-0000-4000-8000-000000000005','Rehearsal owner');

-- 2. One plan with a duplicate pair (the same number in two spellings: the earlier unanswered one and the later
-- answered one) and a lone invitation, plus a test code.
insert into public.plans(id,owner_id,title,starts_at,time_zone,place_label,categories) values
 ('e2100000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000005','Rehearsal key picnic','2099-07-01 12:00+00','UTC','Park',array['community']);
insert into private.phone_invitations(plan_id,phone,country,invited_by,user_id,answered_at,created_at) values
 ('e2100000-0000-4000-8000-000000000001','541112347777','54','e2000000-0000-4000-8000-000000000005',null,null,now()-interval '2 days'),
 ('e2100000-0000-4000-8000-000000000001','5491112347777','54','e2000000-0000-4000-8000-000000000005','e2000000-0000-4000-8000-000000000002',now()-interval '1 day',now()-interval '1 day'),
 ('e2100000-0000-4000-8000-000000000001','5491112348888','54','e2000000-0000-4000-8000-000000000005',null,null,now());
insert into private.test_codes(phone,otp,sent_at) values ('5491112340001','111111',now());

-- 3. A fingerprint of both schemas the app uses, private and public: every function's definition and grants; every
-- relation's kind, row security and grants; every column's type, nullability, default, identity, generation,
-- collation and grants; every index's and view's definition; every constraint, type, policy and trigger; every
-- comment; and both schemas' grants (the rehearsal's own helpers left out). .after.sql proves the apply changes only
-- what the migration says and the rollback restores every entry exactly.
create function private.phone_key_rehearsal_snapshot() returns table(name text, definition text)
language sql stable set search_path='' as $$
 with s as (select oid from pg_catalog.pg_namespace where nspname in ('private','public')),
 f as (select p.oid, p.proacl from pg_catalog.pg_proc p
  where p.pronamespace in (select oid from s) and p.prokind in ('f','p') and p.proname not like 'phone_key_rehearsal%'),
 r as (select c.oid, c.relkind, c.relrowsecurity, c.relforcerowsecurity, c.relacl from pg_catalog.pg_class c
  where c.relnamespace in (select oid from s) and c.relname not like 'phone_key_rehearsal%')
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
revoke all on function private.phone_key_rehearsal_snapshot() from public, anon, authenticated, service_role;
create table private.phone_key_rehearsal_baseline as select * from private.phone_key_rehearsal_snapshot();
alter table private.phone_key_rehearsal_baseline enable row level security;
do $$ begin
 if exists(select 1 from private.phone_key_rehearsal_baseline where name like '%phone_key%' or name like '%phone_variants%'
  or name like '%phone_rewrites%') then
  raise exception 'Phone key objects exist before the migration';
 end if;
 -- The seven functions the migration redefines exist, with their definitions in the baseline.
 if (select count(*) from private.phone_key_rehearsal_baseline where name in (
   'definition public.send_sms_hook(jsonb)','definition public.exchange_test_code(text,text)',
   'definition private.contacts_on_resbite(text[])','definition private.invite_contacts(uuid,jsonb)',
   'definition private.revoke_phone_invitation(uuid,text)','definition private.check_invited_number(text,text)',
   'definition private.answer_phone_invitation(text,text,text,text)') and definition is not null)<>7 then
  raise exception 'Expected the seven functions the migration redefines';
 end if;
end $$;
