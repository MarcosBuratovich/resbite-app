-- Rehearsal for 20261022120000_gi2_guest_accounts (hosted-baseline mode only); .after.sql removes everything here.
-- 1. Data in the pre-GI2 shape: a roster organizer with an event, and a confirmed account with no roster row.
-- Nobody can join through a link before the migration, so the link and the join happen in .after.sql.
insert into auth.users(id,email,email_confirmed_at) values
 ('b9000000-0000-4000-8000-000000000001','gi2-rehearsal-owner@resbite-test.invalid',now()),
 ('b9000000-0000-4000-8000-000000000002','gi2-rehearsal-guest@resbite-test.invalid',now());
insert into private.tester_roster(email) values ('gi2-rehearsal-owner@resbite-test.invalid');
insert into public.profiles(id,display_name) values ('b9000000-0000-4000-8000-000000000001','Rehearsal owner');
insert into public.plans(id,owner_id,title,description,categories,starts_at,time_zone,place_label) values
 ('b9100000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-000000000001','Rehearsal night','',array['community'],now()+interval '1 day','UTC','Park');

-- 2. The exact eligible() GI2 replaces, its grants, and the absence of every object GI2 adds, so .after.sql can
-- prove the rollback restores them.
create function private.gi2_rehearsal_snapshot() returns table(name text, definition text)
language sql stable set search_path='' as $$
 select p.oid::regprocedure::text, pg_catalog.pg_get_functiondef(p.oid) from pg_catalog.pg_proc p
 where p.oid='private.eligible()'::regprocedure
 union all
 select 'grants '||p.oid::regprocedure::text, p.proacl::text from pg_catalog.pg_proc p
 where p.oid='private.eligible()'::regprocedure
 union all
 select 'table '||t, pg_catalog.to_regclass(t)::text
 from unnest(array['private.beta_access','private.age_attestations','private.link_opens']) t
 union all
 select 'function '||f, pg_catalog.to_regprocedure(f)::text
 from unnest(array['private.has_live_grant(uuid)','private.user_eligible(uuid)','private.deletion_pending(uuid)',
  'private.join_by_link(text,text,text)','public.join_by_link(text,text,text)','public.note_link_open(text)']) f
$$;
revoke all on function private.gi2_rehearsal_snapshot() from public, anon, authenticated, service_role;
create table private.gi2_rehearsal_baseline as select * from private.gi2_rehearsal_snapshot();
alter table private.gi2_rehearsal_baseline enable row level security;
do $$ begin
 if exists(select 1 from private.gi2_rehearsal_baseline where (name like 'table %' or name like 'function %') and definition is not null) then
  raise exception 'GI2 objects exist before the migration';
 end if;
end $$;
