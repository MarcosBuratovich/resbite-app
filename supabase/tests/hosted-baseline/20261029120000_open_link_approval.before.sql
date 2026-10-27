-- Rehearsal for 20261029120000_open_link_approval (hosted-baseline mode only); .after.sql removes everything here.
-- 1. Data in the pre-migration shape: a host and a tester who have used the app (maintainer grants); an event with a
-- live open link; a guest who joined by that link (a link grant) with the host's notice already in the outbox; four
-- phone accounts with nothing yet, who will ask to join; and an email account to fold into.
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values
 ('cc000000-0000-4000-8000-000000000001',null,null,'447700900601',now()),
 ('cc000000-0000-4000-8000-000000000002',null,null,'447700900602',now()),
 ('cc000000-0000-4000-8000-000000000003',null,null,'447700900603',now()),
 ('cc000000-0000-4000-8000-000000000004',null,null,'447700900604',now()),
 ('cc000000-0000-4000-8000-000000000005',null,null,'447700900605',now()),
 ('cc000000-0000-4000-8000-000000000006',null,null,'447700900606',now()),
 ('cc000000-0000-4000-8000-000000000007','approval-rehearsal-link@resbite-test.invalid',now(),null,null),
 ('cc000000-0000-4000-8000-000000000008','approval-rehearsal-email@resbite-test.invalid',now(),null,null);
insert into public.profiles(id,display_name) values
 ('cc000000-0000-4000-8000-000000000001','Rehearsal host'),('cc000000-0000-4000-8000-000000000005','Rehearsal tester'),
 ('cc000000-0000-4000-8000-000000000007','Rehearsal link guest');
insert into private.app_sessions(user_id) values ('cc000000-0000-4000-8000-000000000001'),('cc000000-0000-4000-8000-000000000005');
insert into public.plans(id,owner_id,title,starts_at,time_zone,place_label,categories) values
 ('cd000000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000001','Rehearsal picnic','2099-08-01 12:00+00','UTC','Park',array['community']);
insert into private.plan_links(id,plan_id,code) values
 ('ce000000-0000-4000-8000-000000000001','cd000000-0000-4000-8000-000000000001',repeat('R',22));
insert into private.beta_access(user_id,source,plan_link_id) values
 ('cc000000-0000-4000-8000-000000000001','maintainer',null),('cc000000-0000-4000-8000-000000000005','maintainer',null),
 ('cc000000-0000-4000-8000-000000000007','link','ce000000-0000-4000-8000-000000000001');
insert into private.age_attestations(user_id,terms_version) values ('cc000000-0000-4000-8000-000000000007','2026-09');
insert into public.attendees(plan_id,user_id,response) values
 ('cd000000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000007','accepted');
insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id) values
 ('cd000000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000001','invitation','approval-rehearsal:link-guest','cc000000-0000-4000-8000-000000000007');

-- 2. A fingerprint of both schemas the app uses, private and public: every function's definition and grants, every
-- table's, index's and sequence's kind, row security and grants, every constraint, policy and trigger, and both
-- schemas' grants (the rehearsal's own helpers left out). .after.sql proves the apply changes only what the
-- migration says and the rollback restores every entry exactly.
create function private.approval_rehearsal_snapshot() returns table(name text, definition text)
language sql stable set search_path='' as $$
 with s as (select oid from pg_catalog.pg_namespace where nspname in ('private','public')),
 f as (select p.oid, p.proacl from pg_catalog.pg_proc p
  where p.pronamespace in (select oid from s) and p.prokind in ('f','p') and p.proname not like 'approval_rehearsal%')
 select 'definition '||f.oid::regprocedure::text, pg_catalog.pg_get_functiondef(f.oid) from f
 union all
 select 'grants '||f.oid::regprocedure::text, f.proacl::text from f
 union all
 select 'relation '||c.oid::regclass::text, pg_catalog.format('%s rls=%s grants=%s',c.relkind,c.relrowsecurity,c.relacl)
 from pg_catalog.pg_class c where c.relnamespace in (select oid from s) and c.relname not like 'approval_rehearsal%'
 union all
 select 'constraint '||c.conrelid::regclass::text||' '||c.conname, pg_catalog.pg_get_constraintdef(c.oid)
 from pg_catalog.pg_constraint c join pg_catalog.pg_class r on r.oid=c.conrelid
 where r.relnamespace in (select oid from s) and r.relname not like 'approval_rehearsal%'
 union all
 select 'policy '||p.schemaname||'.'||p.tablename||' '||p.policyname,
  pg_catalog.format('%s %s %s using %s check %s',p.permissive,p.roles,p.cmd,p.qual,p.with_check)
 from pg_catalog.pg_policies p where p.schemaname in ('private','public')
 union all
 select 'trigger '||t.tgrelid::regclass::text||' '||t.tgname, pg_catalog.pg_get_triggerdef(t.oid)
 from pg_catalog.pg_trigger t join pg_catalog.pg_class r on r.oid=t.tgrelid
 where r.relnamespace in (select oid from s) and not t.tgisinternal
 union all
 select 'schema '||n.nspname, n.nspacl::text from pg_catalog.pg_namespace n where n.nspname in ('private','public')
$$;
revoke all on function private.approval_rehearsal_snapshot() from public, anon, authenticated, service_role;
create table private.approval_rehearsal_baseline as select * from private.approval_rehearsal_snapshot();
alter table private.approval_rehearsal_baseline enable row level security;
do $$ begin
 if exists(select 1 from private.approval_rehearsal_baseline where name like '%join_request%' or name like '%request_join%'
  or name like '%request_to_join%' or name like '%change_join_answer%') then
  raise exception 'Open-link approval objects exist before the migration';
 end if;
 if (select count(*) from private.approval_rehearsal_baseline where name in ('definition private.claim_plan_link(text)',
   'definition private.join_by_link(text,text,text)','definition private.fold_web_account(uuid,uuid)',
   'grants public.claim_plan_link(text)','grants public.join_by_link(text,text,text)','grants public.fold_web_account(uuid,uuid)',
   'constraint private.notification_outbox notification_outbox_kind_check','constraint private.beta_access beta_access_source_check',
   'schema private') and definition is not null)<>9 then
  raise exception 'Expected the three bodies, their facades'' grants, both checks and the private schema''s grants';
 end if;
end $$;
