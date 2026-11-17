-- Rehearsal for 20261117130000_retention_and_team_tools (hosted-baseline mode only); .after.sql removes everything here.
-- Synthetic identities only (prefix ea6): users ea600000-0000-4000-8000-0000000000NN, the plan ea610000-…-01, the
-- legacy invitation ea620000-…-01; emails r6-…@resbite-test.invalid; the number 447700900561.
-- 0. It needs plan 2's migration (20261117110000_account_deletion_release.sql) first, as hosted will: that file makes
-- the legal holds, account_held and the suspension history this one finds in place, and the jobs it reads.
do $$ begin
 if pg_catalog.to_regclass('private.account_deletion_jobs') is null then
  raise exception 'Pass plan 2''s migration as an earlier candidate';
 end if;
end $$;

-- 1. The functions the migration redefines, with their grants, as they stand, so .after.sql can prove the apply
-- changes only the lines it names and keeps the grants, and that the rollback restores them exactly. invite_contacts
-- always exists. Of the photo functions, only plan 2's interim write guard exists on hosted: the others come from the
-- local-only 20260923152816_orphan_profile_photo_cleanup.sql, which hosted never ran, and are kept here only where
-- they exist.
create table private.r6_rehearsal_functions as
 select f as signature, pg_catalog.pg_get_functiondef(f::regprocedure) as definition,
  (select p.proacl::text from pg_catalog.pg_proc p where p.oid=f::regprocedure) as grants
 from unnest(array['private.invite_contacts(uuid,jsonb)','private.guard_photo_write()',
  'private.guard_profile_photo_reference()','private.claim_orphan_profile_photos(integer)',
  'private.prepare_orphan_profile_photo(uuid,uuid)','private.finish_orphan_profile_photo(uuid,uuid,boolean)',
  'private.prune_profile_photo_cleanup()']) f
 where pg_catalog.to_regprocedure(f) is not null;
alter table private.r6_rehearsal_functions enable row level security;

-- The catalogue the migration and its rollback touch: every function in public and private with its grants and
-- comment; every relation there with its kind, row security, grants and comment (an index with its definition); every
-- constraint and column there; every trigger and policy on a table in public, private or storage; service_role's use of
-- the private schema. .after.sql compares it after the apply (exactly the new functions and tables are new) and after
-- the rollback (all of it is as it was).
create function private.r6_rehearsal_catalogue() returns table(kind text, name text, definition text)
language sql stable set search_path='' as $$
 select 'function', p.oid::regprocedure::text, pg_catalog.pg_get_functiondef(p.oid)||' grants '||coalesce(p.proacl::text,'default')
   ||' comment '||coalesce(pg_catalog.obj_description(p.oid,'pg_proc'),'none')
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.prokind in ('f','p') and p.proname not like 'r6\_rehearsal%'
 union all
 select 'relation', c.oid::regclass::text, c.relkind::text||' rls '||c.relrowsecurity::text||' grants '||coalesce(c.relacl::text,'default')
   ||' comment '||coalesce(pg_catalog.obj_description(c.oid,'pg_class'),'none')
   ||case when c.relkind='i' then ' '||pg_catalog.pg_get_indexdef(c.oid) else '' end
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','private') and c.relname not like 'r6\_rehearsal%'
 union all
 select 'constraint', c.conrelid::regclass::text||' '||c.conname, pg_catalog.pg_get_constraintdef(c.oid)
  from pg_catalog.pg_constraint c join pg_catalog.pg_namespace n on n.oid=c.connamespace
  where n.nspname in ('public','private') and c.conrelid<>0
 union all
 select 'column', a.attrelid::regclass::text||'.'||a.attname, pg_catalog.format_type(a.atttypid,a.atttypmod)||' not null '||a.attnotnull::text
   ||' default '||coalesce(pg_catalog.pg_get_expr(d.adbin,d.adrelid),'none')
  from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid=a.attrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
  where n.nspname in ('public','private') and c.relkind in ('r','p','v') and c.relname not like 'r6\_rehearsal%'
   and a.attnum>0 and not a.attisdropped
 union all
 select 'trigger', t.tgrelid::regclass::text||' '||t.tgname, pg_catalog.pg_get_triggerdef(t.oid)
   ||' comment '||coalesce(pg_catalog.obj_description(t.oid,'pg_trigger'),'none')
  from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','private','storage') and not t.tgisinternal
 union all
 select 'policy', p.polrelid::regclass::text||' '||p.polname, p.polcmd::text||' '||coalesce(pg_catalog.pg_get_expr(p.polqual,p.polrelid),'')
   ||' / '||coalesce(pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid),'')
  from pg_catalog.pg_policy p join pg_catalog.pg_class c on c.oid=p.polrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','private','storage')
 union all
 select 'schema', 'private', 'service_role usage '||pg_catalog.has_schema_privilege('service_role','private','USAGE')::text
$$;
revoke all on function private.r6_rehearsal_catalogue() from public, anon, authenticated, service_role;
create table private.r6_rehearsal_before as select * from private.r6_rehearsal_catalogue();
alter table private.r6_rehearsal_before enable row level security;

-- 2. Fixtures, kept until .after.sql removes them, seeded under the roll's flag so seeding writes no chat line. 01 has
-- a disabled roster row and was suspended before the open beta, as suspend-account.sql then did it: the roster row
-- disabled (roster true) and no grant (none recorded, none made). 02 has an enabled roster row, a profile and a
-- one-off in three days. A third roster row, disabled, belongs to no Auth user. One legacy invitation (private.invitations)
-- and one invitation by number, both to 02's one-off.
select set_config('resbite.system','roll',false);
insert into auth.users(id,email,email_confirmed_at) values
 ('ea600000-0000-4000-8000-000000000001','r6-disabled@resbite-test.invalid',now()),
 ('ea600000-0000-4000-8000-000000000002','r6-enabled@resbite-test.invalid',now());
insert into public.profiles(id,display_name) values ('ea600000-0000-4000-8000-000000000002','Rehearsal host');
insert into private.tester_roster(email,enabled) values
 ('r6-disabled@resbite-test.invalid',false),('r6-enabled@resbite-test.invalid',true),('r6-no-account@resbite-test.invalid',false);
insert into private.suspensions(user_id,report_id,roster,grant_at,grant_made) values
 ('ea600000-0000-4000-8000-000000000001',null,true,null,false);
insert into public.plans(id,owner_id,title,starts_at,ends_at,time_zone,place_label,categories) values
 ('ea610000-0000-4000-8000-000000000001','ea600000-0000-4000-8000-000000000002','Rehearsal walk',
  now()+interval '3 days',now()+interval '3 days 2 hours','UTC','Park',array['community']);
insert into private.invitations(id,plan_id,token_hash,intended_email) values
 ('ea620000-0000-4000-8000-000000000001','ea610000-0000-4000-8000-000000000001',
  extensions.digest('r6-rehearsal-legacy-invitation','sha256'),'r6-invited@resbite-test.invalid');
insert into private.phone_invitations(plan_id,phone,country,invited_by) values
 ('ea610000-0000-4000-8000-000000000001','447700900561','44','ea600000-0000-4000-8000-000000000002');
select set_config('resbite.system','',false);

-- 3. The pre-state: invite_contacts and plan 2's write guard are there with their grants; no do-not-invite list and no
-- daily run yet; three roster rows and one legacy invitation; 01 is kept out by its roster row alone (no grant), 02 is
-- eligible.
do $$ begin
 if not exists(select 1 from private.r6_rehearsal_functions where signature='private.invite_contacts(uuid,jsonb)'
   and definition is not null and grants is not null) then
  raise exception 'invite_contacts is missing, or has no grants';
 end if;
 if not exists(select 1 from private.r6_rehearsal_functions where signature='private.guard_photo_write()'
   and definition not like '%Photo path retired; choose a new photo%') then
  raise exception 'The photo write guard is not plan 2''s interim body';
 end if;
 if pg_catalog.to_regclass('private.invite_objections') is not null then raise exception 'private.invite_objections already exists'; end if;
 if pg_catalog.to_regprocedure('private.run_retention()') is not null then raise exception 'private.run_retention() already exists'; end if;
 if (select count(*) from private.tester_roster)<>3 then
  raise exception 'The roster holds % rows, not 3', (select count(*) from private.tester_roster);
 end if;
 if (select count(*) from private.invitations)<>1 then
  raise exception 'There are % legacy invitations, not 1', (select count(*) from private.invitations);
 end if;
 if exists(select 1 from private.beta_access where user_id='ea600000-0000-4000-8000-000000000001') then raise exception '01 already has a grant'; end if;
 if private.user_eligible('ea600000-0000-4000-8000-000000000001') then raise exception '01 is eligible'; end if;
 if not private.user_eligible('ea600000-0000-4000-8000-000000000002') then raise exception '02 is not eligible'; end if;
end $$;
