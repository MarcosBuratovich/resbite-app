-- Rehearsal for 20261117110000_account_deletion_release (hosted-baseline mode only); .after.sql removes everything here.
-- Synthetic identities only (prefix ad): users ad000000-0000-4000-8000-0000000000NN, the plan ad1…01, sessions ad2…NN.
-- 1. The two hosted functions the migration redefines, with their grants, as they stand, so .after.sql can prove the
-- apply changes only the lines it names and keeps the grants, and that the rollback restores them exactly.
create table private.adr_rehearsal_functions as
 select f as signature, pg_catalog.pg_get_functiondef(f::regprocedure) as definition,
  (select p.proacl::text from pg_catalog.pg_proc p where p.oid=f::regprocedure) as grants
 from unnest(array['private.require_tester()','private.deletion_pending(uuid)']) f;
alter table private.adr_rehearsal_functions enable row level security;

-- The catalogue the migration and its rollback touch: every function in public and private with its grants, every
-- relation there with its kind, row security, grants and comment, every constraint there, the columns of the three
-- tables whose keys change, the triggers on storage.objects and service_role's use of the private schema. .after.sql
-- compares it after the apply (exactly the new functions are new) and after the rollback (all of it is as it was).
create function private.adr_rehearsal_catalogue() returns table(kind text, name text, definition text)
language sql stable set search_path='' as $$
 select 'function', p.oid::regprocedure::text, pg_catalog.pg_get_functiondef(p.oid)||' grants '||coalesce(p.proacl::text,'default')
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.prokind in ('f','p') and p.proname not like 'adr\_rehearsal%'
 union all
 select 'relation', c.oid::regclass::text, c.relkind::text||' rls '||c.relrowsecurity::text||' grants '||coalesce(c.relacl::text,'default')
   ||' comment '||coalesce(pg_catalog.obj_description(c.oid,'pg_class'),'none')
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','private') and c.relname not like 'adr\_rehearsal%'
 union all
 select 'constraint', c.conrelid::regclass::text||' '||c.conname, pg_catalog.pg_get_constraintdef(c.oid)
  from pg_catalog.pg_constraint c join pg_catalog.pg_namespace n on n.oid=c.connamespace
  where n.nspname in ('public','private') and c.conrelid<>0
 union all
 select 'column', a.attrelid::regclass::text||'.'||a.attname, pg_catalog.format_type(a.atttypid,a.atttypmod)||' not null '||a.attnotnull::text
  from pg_catalog.pg_attribute a
  where a.attrelid in ('public.plans'::regclass,'public.attendees'::regclass,'private.invitations'::regclass) and a.attnum>0 and not a.attisdropped
 union all
 select 'trigger', t.tgname, pg_catalog.pg_get_triggerdef(t.oid)||' comment '||coalesce(pg_catalog.obj_description(t.oid,'pg_trigger'),'none')
  from pg_catalog.pg_trigger t where t.tgrelid='storage.objects'::regclass and not t.tgisinternal
 union all
 select 'schema', 'private', 'service_role usage '||pg_catalog.has_schema_privilege('service_role','private','USAGE')::text
$$;
revoke all on function private.adr_rehearsal_catalogue() from public, anon, authenticated, service_role;
create table private.adr_rehearsal_before as select * from private.adr_rehearsal_catalogue();
alter table private.adr_rehearsal_before enable row level security;

-- 2. Fixtures, kept until .after.sql removes them, seeded under the roll's flag so seeding writes no chat line:
-- 01 phone-only, with a profile, a fresh session and a one-off tomorrow with 02 as its guest; 02 phone-only, a guest;
-- 03 phone-only and suspended (a revoked grant), with a profile and a fresh session.
select set_config('resbite.system','roll',false);
insert into auth.users(id,phone,phone_confirmed_at) values
 ('ad000000-0000-4000-8000-000000000001','447700900361',now()),
 ('ad000000-0000-4000-8000-000000000002','447700900362',now()),
 ('ad000000-0000-4000-8000-000000000003','447700900363',now());
insert into auth.sessions(id,user_id,created_at) values
 ('ad200000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000001',now()),
 ('ad200000-0000-4000-8000-000000000003','ad000000-0000-4000-8000-000000000003',now());
insert into public.profiles(id,display_name) values
 ('ad000000-0000-4000-8000-000000000001','Rehearsal host'),('ad000000-0000-4000-8000-000000000002','Rehearsal guest'),
 ('ad000000-0000-4000-8000-000000000003','Rehearsal suspended');
insert into public.plans(id,owner_id,title,starts_at,ends_at,time_zone,place_label,categories) values
 ('ad100000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000001','Rehearsal picnic',
  now()+interval '1 day',now()+interval '1 day 2 hours','UTC','Park',array['community']);
insert into public.attendees(plan_id,user_id,response) values
 ('ad100000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000002','accepted');
insert into private.beta_access(user_id,source,revoked_at) values ('ad000000-0000-4000-8000-000000000003','maintainer',now());
select set_config('resbite.system','',false);

-- 3. The pre-state: no deletion objects, the September keys still refuse, and today a host with guests can't be removed
-- at all.
do $$ declare v_rule text; begin
 if (select count(*) from private.adr_rehearsal_functions where definition is not null and grants is not null)<>2 then
  raise exception 'A function to redefine is missing, or has no grants';
 end if;
 if pg_catalog.to_regclass('private.account_deletion_jobs') is not null or pg_catalog.to_regclass('private.legal_holds') is not null
   or pg_catalog.to_regprocedure('private.request_account_deletion(uuid,uuid,uuid,text)') is not null then
  raise exception 'The deletion lifecycle already exists';
 end if;
 if pg_catalog.to_regclass('private.suspension_history') is not null
   or pg_catalog.to_regprocedure('private.account_held(uuid)') is not null
   or pg_catalog.to_regprocedure('private.guard_photo_write()') is not null
   or exists(select 1 from pg_catalog.pg_trigger where tgrelid='storage.objects'::regclass and tgname='resbite_photo_write_guard') then
  raise exception 'An object shared with plan 6 already exists';
 end if;
 foreach v_rule in array array['plans_owner_id_fkey','attendees_user_id_fkey','invitations_claimed_by_fkey'] loop
  if (select c.confdeltype::text from pg_catalog.pg_constraint c where c.conname=v_rule and c.confrelid='public.profiles'::regclass)
    is distinct from 'a' then
   raise exception '% does not delete with no action', v_rule;
  end if;
 end loop;
 if not (select a.attnotnull from pg_catalog.pg_attribute a where a.attrelid='public.plans'::regclass and a.attname='owner_id') then
  raise exception 'public.plans.owner_id may already be null';
 end if;
 if pg_catalog.has_schema_privilege('service_role','private','USAGE') then
  raise exception 'service_role already uses the private schema';
 end if;
 begin
  delete from auth.users where id='ad000000-0000-4000-8000-000000000001';
  raise exception 'A host with a guest was removed';
 exception when foreign_key_violation then null;
 end;
end $$;
