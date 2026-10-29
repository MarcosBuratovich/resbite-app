-- Rehearsal checks for 20261030130000_phone_key (hosted-baseline mode only).
-- 1. The older Argentine accounts are rewritten (phone and pending change) and recorded; the rest are untouched;
-- the duplicate invitations collapsed to the answered one, stored by key; the test codes are gone.
do $$ begin
 if (select phone from auth.users where id='e2000000-0000-4000-8000-000000000001') is distinct from '5491112340001' then
  raise exception 'The older Argentine account was not rewritten';
 end if;
 if (select phone from auth.users where id='e2000000-0000-4000-8000-000000000002') is distinct from '5491112340002'
 or (select phone from auth.users where id='e2000000-0000-4000-8000-000000000003') is distinct from '541112340003'
 or (select phone from auth.users where id='e2000000-0000-4000-8000-000000000004') is distinct from '5491112340003'
 or (select phone from auth.users where id='e2000000-0000-4000-8000-000000000005') is distinct from '447700900805' then
  raise exception 'An account that should stay was changed';
 end if;
 if (select phone from auth.users where id='e2000000-0000-4000-8000-000000000006') is distinct from '5491112340006'
 or (select phone_change from auth.users where id='e2000000-0000-4000-8000-000000000006') is distinct from '5491112340066' then
  raise exception 'The phone and the pending change were not both rewritten';
 end if;
 if (select count(*) from private.phone_rewrites where user_id::text like 'e2%')<>2
 or not exists(select 1 from private.phone_rewrites where user_id='e2000000-0000-4000-8000-000000000001' and old_phone='541112340001' and new_phone='5491112340001')
 or not exists(select 1 from private.phone_rewrites where user_id='e2000000-0000-4000-8000-000000000006' and old_phone='541112340006' and new_phone='5491112340006') then
  raise exception 'phone_rewrites rows wrong';
 end if;
 if (select count(*) from private.phone_invitations where plan_id='e2100000-0000-4000-8000-000000000001')<>2
 or not exists(select 1 from private.phone_invitations where plan_id='e2100000-0000-4000-8000-000000000001' and phone='541112347777'
   and user_id='e2000000-0000-4000-8000-000000000002')
 or not exists(select 1 from private.phone_invitations where plan_id='e2100000-0000-4000-8000-000000000001' and phone='541112348888') then
  raise exception 'Invitations were not collapsed and re-keyed';
 end if;
 if exists(select 1 from private.test_codes) then
  raise exception 'Test codes were not deleted';
 end if;
end $$;
-- 2. The collision count the runbook names: older numbers that also exist in the 549 form (the rehearsal's pair).
do $$ begin
 if (select count(*) from auth.users u where u.phone ~ '^54[0-9]{10}$'
     and exists(select 1 from auth.users v where v.phone='549'||substr(u.phone,3)))<>1 then
  raise exception 'Collision count is not the one pair';
 end if;
end $$;
-- 3. Against the fingerprint: the migration added exactly private.phone_key and private.phone_variants (definition and
-- grants) and private.phone_rewrites (with its columns, key and index); redefined exactly the seven functions
-- (send_sms_hook, exchange_test_code, contacts_on_resbite, invite_contacts, revoke_phone_invitation,
-- check_invited_number, answer_phone_invitation), each with its grants as they were; removed nothing; changed nothing
-- else in private or public.
do $$ declare v_new text[] := array['private.phone_key(text)','private.phone_variants(text)'];
 v_redefined text[] := array['public.send_sms_hook(jsonb)','public.exchange_test_code(text,text)',
  'private.contacts_on_resbite(text[])','private.invite_contacts(uuid,jsonb)','private.revoke_phone_invitation(uuid,text)',
  'private.check_invited_number(text,text)','private.answer_phone_invitation(text,text,text,text)'];
 v_added text[]; v_removed text[]; v_changed text[]; v_expected text[];
begin
 v_expected := array['relation private.phone_rewrites','relation private.phone_rewrites_pkey',
  'index private.phone_rewrites_pkey','constraint private.phone_rewrites phone_rewrites_pkey',
  'column private.phone_rewrites.user_id','column private.phone_rewrites.old_phone',
  'column private.phone_rewrites.new_phone','column private.phone_rewrites.rewritten_at']
  || array(select 'definition '||f from unnest(v_new) f) || array(select 'grants '||f from unnest(v_new) f);
 select coalesce(array_agg(n.name order by n.name),'{}') into v_added from private.phone_key_rehearsal_snapshot() n
  where not exists(select 1 from private.phone_key_rehearsal_baseline b where b.name=n.name);
 select coalesce(array_agg(b.name order by b.name),'{}') into v_removed from private.phone_key_rehearsal_baseline b
  where not exists(select 1 from private.phone_key_rehearsal_snapshot() n where n.name=b.name);
 select coalesce(array_agg(b.name order by b.name),'{}') into v_changed from private.phone_key_rehearsal_baseline b
  join private.phone_key_rehearsal_snapshot() n on n.name=b.name where b.definition is distinct from n.definition;
 if v_added is distinct from array(select e from unnest(v_expected) e order by e) then
  raise exception 'The apply added %', v_added;
 end if;
 if v_removed<>'{}' then raise exception 'The apply removed %', v_removed; end if;
 if v_changed is distinct from array(select 'definition '||f from unnest(v_redefined) f order by 1) then
  raise exception 'The apply changed %', v_changed;
 end if;
 -- The new functions are for nobody; the new table is private, row security on, and no role the app uses holds a grant.
 if exists(select 1 from pg_catalog.pg_proc p where p.oid in ('private.phone_key(text)'::regprocedure,
    'private.phone_variants(text)'::regprocedure) and p.proacl is not null
    and exists(select 1 from pg_catalog.aclexplode(p.proacl) a where a.grantee=0 or a.grantee in
     (select oid from pg_catalog.pg_roles where rolname in ('anon','authenticated','service_role'))))
 or not (select relrowsecurity from pg_catalog.pg_class where oid='private.phone_rewrites'::regclass)
 or exists(select 1 from information_schema.role_table_grants g where g.table_schema='private'
    and g.table_name='phone_rewrites' and g.grantee in ('PUBLIC','anon','authenticated')) then
  raise exception 'phone_key, phone_variants or phone_rewrites grants are wrong';
 end if;
end $$;

-- 4. The rollback, rehearsed and undone: run as text (the harness passes the repository's path as resbite_repo) inside
-- a savepoint. The older accounts' numbers come back (the pending change is not restored), the log is gone, every
-- fingerprint entry equals the baseline again (the seven bodies and grants) and the two new functions are gone. Then
-- the savepoint is rolled back, so the tests that follow see the migrated state.
\set phone_key_rollback `cat :'resbite_repo'/supabase/rollback/20261030130000_phone_key.rollback.sql`
create temporary table phone_key_rehearsal_rollback as select :'phone_key_rollback'::text as script;
begin;
savepoint before_rollback;
do $$ begin
 if coalesce(length(btrim((select script from phone_key_rehearsal_rollback))),0)=0 then
  raise exception 'The phone key rollback text is empty';
 end if;
end $$;
:phone_key_rollback
do $$ declare v_diff text[]; begin
 if (select phone from auth.users where id='e2000000-0000-4000-8000-000000000001') is distinct from '541112340001'
 or (select phone from auth.users where id='e2000000-0000-4000-8000-000000000006') is distinct from '541112340006' then
  raise exception 'The rollback did not restore the older Argentine numbers';
 end if;
 if (select phone from auth.users where id='e2000000-0000-4000-8000-000000000002') is distinct from '5491112340002'
 or (select phone from auth.users where id='e2000000-0000-4000-8000-000000000003') is distinct from '541112340003'
 or (select phone from auth.users where id='e2000000-0000-4000-8000-000000000004') is distinct from '5491112340003' then
  raise exception 'The rollback changed an account it should not touch';
 end if;
 if pg_catalog.to_regclass('private.phone_rewrites') is not null then
  raise exception 'private.phone_rewrites survived the rollback';
 end if;
 if pg_catalog.to_regprocedure('private.phone_key(text)') is not null
 or pg_catalog.to_regprocedure('private.phone_variants(text)') is not null then
  raise exception 'A phone key function survived the rollback';
 end if;
 select coalesce(array_agg(x.name order by x.name),'{}') into v_diff from (
  (select name, definition from private.phone_key_rehearsal_baseline except select name, definition from private.phone_key_rehearsal_snapshot())
  union all
  (select name, definition from private.phone_key_rehearsal_snapshot() except select name, definition from private.phone_key_rehearsal_baseline)) x;
 if v_diff<>'{}' then raise exception 'The rollback did not restore the fingerprint: %', v_diff; end if;
end $$;
rollback to savepoint before_rollback;
commit;
-- The migrated state is back: the rewrite log and both functions exist, and the account is on the 549 form.
do $$ begin
 if pg_catalog.to_regclass('private.phone_rewrites') is null
 or pg_catalog.to_regprocedure('private.phone_key(text)') is null
 or (select phone from auth.users where id='e2000000-0000-4000-8000-000000000001') is distinct from '5491112340001' then
  raise exception 'The migrated state was not restored after the rollback rehearsal';
 end if;
end $$;
drop table pg_temp.phone_key_rehearsal_rollback;
-- 5. The rehearsal's helpers.
-- Remove the seed so later tests start clean.
delete from public.plans where id='e2100000-0000-4000-8000-000000000001';
delete from private.phone_rewrites where user_id::text like 'e2%';
delete from auth.users where id::text like 'e2000000-0000-4000-8000-0000000000%';
delete from public.profiles where id='e2000000-0000-4000-8000-000000000005';
drop table private.phone_key_rehearsal_baseline;
drop function private.phone_key_rehearsal_snapshot();
