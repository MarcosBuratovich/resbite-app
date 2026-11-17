-- Account deletion release (20261117110000_account_deletion_release.sql, spec C2): the jobs table and its held status,
-- the legal hold and the suspension history shared with plan 6, the September keys, and the two hosted
-- redefinitions. Runs in both modes (supabase/tests/hosted-baseline/tests.txt). Synthetic identities only (prefix dd);
-- one rolled-back block. Users dd000000-0000-4000-8000-0000000000NN, plans dd1…, sessions dd2…, requests dd3….
-- Users dd…: 05 under a hold not lifted, 06 under a hold lifted yesterday, 07 under none.
begin;
-- A statement that must be refused with exactly this code, whatever its message (a table's check).
create function pg_temp.dd_refused(p_sql text, p_state text) returns void language plpgsql as $$
declare v_state text;
begin
 begin
  execute p_sql;
 exception when others then
  get stacked diagnostics v_state = returned_sqlstate;
 end;
 if v_state is distinct from p_state then raise exception 'Expected %, got %: %', p_state, v_state, p_sql; end if;
end $$;

-- Holds. user_id has no foreign key: a hold outlives the account, so these need no Auth user.
insert into private.legal_holds(user_id,reason,case_ref,review_on,lifted_at) values
 ('dd000000-0000-4000-8000-000000000005','police','LE-1',current_date+90,null),
 ('dd000000-0000-4000-8000-000000000006','police','LE-2',current_date+90,now()-interval '1 day');

-- S1. Tables, keys, the hold and the two hosted redefinitions.

-- S1.1 A job may be held: the status check names 'held' beside the September three. The jobs' two indexes.
do $$ declare v_def text; begin
 select pg_catalog.pg_get_constraintdef(c.oid) into v_def from pg_catalog.pg_constraint c
  where c.conrelid='private.account_deletion_jobs'::regclass and c.conname='account_deletion_jobs_status_check';
 if v_def is null or v_def not like '%''held''%' or v_def not like '%''queued''%' or v_def not like '%''processing''%'
  or v_def not like '%''complete''%' then
  raise exception 'S1.1 The jobs status check is %', v_def;
 end if;
 if pg_catalog.pg_get_indexdef('private.account_deletion_pending_idx'::regclass)
   not like '%ON private.account_deletion_jobs USING btree (next_attempt_at) WHERE (status <> ''complete''::text)'
 or pg_catalog.pg_get_indexdef('private.account_deletion_completed_idx'::regclass)
   not like '%ON private.account_deletion_jobs USING btree (completed_at) WHERE (status = ''complete''::text)' then
  raise exception 'S1.1 The jobs indexes are wrong';
 end if;
 if pg_catalog.pg_get_indexdef('private.legal_holds_user_idx'::regclass)
   not like '%ON private.legal_holds USING btree (user_id) WHERE (lifted_at IS NULL)'
 or pg_catalog.pg_get_indexdef('private.legal_holds_series_idx'::regclass)
   not like '%ON private.legal_holds USING btree (series_id) WHERE (lifted_at IS NULL)' then
  raise exception 'S1.1 The hold indexes are wrong';
 end if;
end $$;

-- S1.2 The September delete rules: a deleted host's resbites lose their owner, a deleted guest's places go, a claimed
-- invitation forgets who claimed it. owner_id may be null.
do $$ declare v_rule text; begin
 select c.confdeltype::text into v_rule from pg_catalog.pg_constraint c
  where c.conrelid='public.plans'::regclass and c.conname='plans_owner_id_fkey' and c.confrelid='public.profiles'::regclass;
 if v_rule is distinct from 'n' then raise exception 'S1.2 plans_owner_id_fkey deletes with %', v_rule; end if;
 select c.confdeltype::text into v_rule from pg_catalog.pg_constraint c
  where c.conrelid='public.attendees'::regclass and c.conname='attendees_user_id_fkey' and c.confrelid='public.profiles'::regclass;
 if v_rule is distinct from 'c' then raise exception 'S1.2 attendees_user_id_fkey deletes with %', v_rule; end if;
 select c.confdeltype::text into v_rule from pg_catalog.pg_constraint c
  where c.conrelid='private.invitations'::regclass and c.conname='invitations_claimed_by_fkey' and c.confrelid='public.profiles'::regclass;
 if v_rule is distinct from 'n' then raise exception 'S1.2 invitations_claimed_by_fkey deletes with %', v_rule; end if;
 if (select a.attnotnull from pg_catalog.pg_attribute a where a.attrelid='public.plans'::regclass and a.attname='owner_id') then
  raise exception 'S1.2 public.plans.owner_id is still not null';
 end if;
end $$;

-- S1.3 This file made the shared objects, so each carries its marker and its rollback may drop them.
do $$ begin
 if pg_catalog.obj_description('private.legal_holds'::regclass,'pg_class') is distinct from 'resbite 20261117110000'
 or pg_catalog.obj_description('private.suspension_history'::regclass,'pg_class') is distinct from 'resbite 20261117110000'
 or pg_catalog.obj_description('private.account_held(uuid)'::regprocedure,'pg_proc') is distinct from 'resbite 20261117110000' then
  raise exception 'S1.3 A shared object lacks this file''s marker';
 end if;
end $$;

-- S1.4 No API role touches the three tables or asks whether an account is held. RLS is on. service_role may enter the
-- private schema, so the worker RPCs' wrappers reach their bodies.
do $$ declare r text; t text; begin
 foreach r in array array['anon','authenticated','service_role'] loop
  foreach t in array array['private.legal_holds','private.suspension_history','private.account_deletion_jobs'] loop
   if pg_catalog.has_table_privilege(r,t,'SELECT,INSERT,UPDATE,DELETE') then raise exception 'S1.4 % may use %', r, t; end if;
  end loop;
  if pg_catalog.has_function_privilege(r,'private.account_held(uuid)','EXECUTE') then
   raise exception 'S1.4 % may execute account_held', r;
  end if;
 end loop;
 if exists(select 1 from pg_catalog.pg_class c where c.oid in ('private.legal_holds'::regclass,
   'private.suspension_history'::regclass,'private.account_deletion_jobs'::regclass) and not c.relrowsecurity) then
  raise exception 'S1.4 A table lacks RLS';
 end if;
 if not pg_catalog.has_schema_privilege('service_role','private','USAGE') then raise exception 'S1.4 service_role lacks the private schema'; end if;
end $$;

-- S1.5 A hold not lifted names the account. A lifted hold, no hold and null are not held. A hold names exactly one of an
-- account or a series, for a known reason and a plain case reference.
do $$ begin
 if not private.account_held('dd000000-0000-4000-8000-000000000005') then raise exception 'S1.5 05 is not held'; end if;
 if private.account_held('dd000000-0000-4000-8000-000000000006') then raise exception 'S1.5 06 is held after the lift'; end if;
 if private.account_held('dd000000-0000-4000-8000-000000000007') then raise exception 'S1.5 07 is held with no hold'; end if;
 if private.account_held(null) is distinct from false then raise exception 'S1.5 null is not false'; end if;
end $$;
select pg_temp.dd_refused($$insert into private.legal_holds(user_id,series_id,reason,case_ref,review_on)
 values ('dd000000-0000-4000-8000-000000000007','dd100000-0000-4000-8000-000000000001','police','LE-3',current_date+90)$$,'23514');
select pg_temp.dd_refused($$insert into private.legal_holds(reason,case_ref,review_on) values ('police','LE-3',current_date+90)$$,'23514');
select pg_temp.dd_refused($$insert into private.legal_holds(user_id,reason,case_ref,review_on)
 values ('dd000000-0000-4000-8000-000000000007','other','LE-3',current_date+90)$$,'23514');
select pg_temp.dd_refused($$insert into private.legal_holds(user_id,reason,case_ref,review_on)
 values ('dd000000-0000-4000-8000-000000000007','police','a b',current_date+90)$$,'23514');

-- S1.6 A deletion job counts as being deleted, as the profile's mark does.
do $$ begin
 if private.deletion_pending('dd000000-0000-4000-8000-000000000007') then raise exception 'S1.6 07 is pending with no job'; end if;
 insert into private.account_deletion_jobs(request_id,user_id,recovery_hash)
  values ('dd300000-0000-4000-8000-000000000007','dd000000-0000-4000-8000-000000000007',pg_catalog.sha256('dd-07'::bytea));
 if not private.deletion_pending('dd000000-0000-4000-8000-000000000007') then raise exception 'S1.6 07''s job is not pending'; end if;
end $$;

-- S1.7 require_tester takes the account's lock (hashtextextended of the uuid, 47) and is no longer stable.
do $$ declare v_def text := pg_catalog.pg_get_functiondef('private.require_tester()'::regprocedure); begin
 if strpos(v_def,'hashtextextended(auth.uid()::text,47)')=0 then raise exception 'S1.7 require_tester takes no lock: %', v_def; end if;
 if strpos(v_def,'STABLE')>0 then raise exception 'S1.7 require_tester is still stable: %', v_def; end if;
end $$;

rollback;
