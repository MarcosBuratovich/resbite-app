-- Rehearsal for 20261117122000_optional_details_removal (hosted-baseline mode only), after the apply. Removes what
-- .before.sql made.
-- 1. bc…01 keeps only its name; bc…02 (an array) is unchanged; no account holds either key; both functions are gone.
do $$ begin
 if (select raw_user_meta_data from auth.users where id='bc000000-0000-4000-8000-000000000001')
   is distinct from '{"display_name":"Rehearsal"}'::jsonb then
  raise exception 'bc…01 after the apply: %', (select raw_user_meta_data from auth.users where id='bc000000-0000-4000-8000-000000000001');
 end if;
 if (select raw_user_meta_data from auth.users where id='bc000000-0000-4000-8000-000000000002') is distinct from '[]'::jsonb then
  raise exception 'bc…02 after the apply: %', (select raw_user_meta_data from auth.users where id='bc000000-0000-4000-8000-000000000002');
 end if;
 if exists(select 1 from auth.users where jsonb_typeof(raw_user_meta_data)='object'
   and raw_user_meta_data ?| array['registration_details','registration_details_version']) then
  raise exception 'An account still holds the optional details';
 end if;
 if pg_catalog.to_regprocedure('private.save_registration_details(jsonb,jsonb)') is not null
   or pg_catalog.to_regprocedure('public.save_registration_details(jsonb,jsonb)') is not null then
  raise exception 'save_registration_details survived the apply';
 end if;
end $$;

-- 2. The rollback recreates both functions with the captured definitions and grants, and the RPC comes back empty:
-- bc…01 saves with JSON null as the expected details.
begin;
\ir ../../rollback/20261117122000_optional_details_removal.rollback.sql
do $$ begin
 if exists(select 1 from private.bc_rehearsal_functions f
   where pg_catalog.pg_get_functiondef(f.signature::regprocedure) is distinct from f.definition
   or (select p.proacl::text from pg_catalog.pg_proc p where p.oid=f.signature::regprocedure) is distinct from f.grants) then
  raise exception 'Rollback did not restore the dropped functions with their grants';
 end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"bc000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 r := public.save_registration_details(null,'{"birth_date":null,"phone":null,"city":"York","interests":[]}');
 if r is distinct from jsonb_build_object('account_id','bc000000-0000-4000-8000-000000000001'::uuid,
   'registration_details','{"birth_date":null,"phone":null,"city":"York","interests":[]}'::jsonb) then
  raise exception 'The restored RPC did not save from empty: %', r;
 end if;
end $$;
reset role;
rollback;

-- 3. Run again over the restored functions, the rollback stops with 42723 and changes nothing (it runs from its text;
-- the harness passes the repository's path as resbite_repo).
\set bc_rollback `cat :'resbite_repo'/supabase/rollback/20261117122000_optional_details_removal.rollback.sql`
create temporary table bc_rehearsal_scripts as select :'bc_rollback'::text as rollback;
begin;
\ir ../../rollback/20261117122000_optional_details_removal.rollback.sql
do $$ declare v_state text; begin
 if coalesce(length(btrim((select rollback from bc_rehearsal_scripts))),0)=0 then raise exception 'The rollback text is empty'; end if;
 begin
  execute (select rollback from bc_rehearsal_scripts);
 exception when others then
  get stacked diagnostics v_state = returned_sqlstate;
 end;
 if v_state is distinct from '42723' then
  raise exception 'A second rollback: expected 42723, got %', coalesce(v_state,'success');
 end if;
 if exists(select 1 from private.bc_rehearsal_functions f
   where pg_catalog.pg_get_functiondef(f.signature::regprocedure) is distinct from f.definition
   or (select p.proacl::text from pg_catalog.pg_proc p where p.oid=f.signature::regprocedure) is distinct from f.grants) then
  raise exception 'The refused rollback changed the restored functions';
 end if;
end $$;
rollback;

-- 4. Remove the rehearsal's accounts and helpers so later tests start clean.
delete from auth.users where id in ('bc000000-0000-4000-8000-000000000001','bc000000-0000-4000-8000-000000000002');
drop table private.bc_rehearsal_functions;
drop table bc_rehearsal_scripts;
