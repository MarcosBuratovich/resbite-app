-- Rehearsal checks for 20261030130000_phone_key (hosted-baseline mode only).
-- 1. The migration alone: the duplicate invitations collapsed (of 7777's two live rows the answered one; of 6666 the
-- live re-invite with the only code, not the revoked answered one), every invitation stored by key; the test codes are
-- gone; private.phone_rewrites is there and empty; and no account, pending change or phone identity changed (the
-- rewrite is the owner-run script's, section 3).
do $$ begin
 if (select count(*) from private.phone_invitations where plan_id='e2100000-0000-4000-8000-000000000001')<>3
 or not exists(select 1 from private.phone_invitations where plan_id='e2100000-0000-4000-8000-000000000001' and phone='541112347777'
   and user_id='e2000000-0000-4000-8000-000000000002')
 or not exists(select 1 from private.phone_invitations where plan_id='e2100000-0000-4000-8000-000000000001' and phone='541112348888') then
  raise exception 'Invitations were not collapsed and re-keyed';
 end if;
 if not exists(select 1 from private.phone_invitations where plan_id='e2100000-0000-4000-8000-000000000001' and phone='541112346666'
   and revoked_at is null and user_id is null and code_hash=extensions.digest(repeat('R',22),'sha256')) then
  raise exception 'The live re-invite with its code did not survive the collapse';
 end if;
 if exists(select 1 from private.test_codes) then
  raise exception 'Test codes were not deleted';
 end if;
 if exists(select 1 from private.phone_rewrites) then
  raise exception 'The migration recorded rewrites';
 end if;
 if (select phone from auth.users where id='e2000000-0000-4000-8000-000000000001') is distinct from '541112340001'
 or (select phone from auth.users where id='e2000000-0000-4000-8000-000000000002') is distinct from '5491112340002'
 or (select phone from auth.users where id='e2000000-0000-4000-8000-000000000003') is distinct from '541112340003'
 or (select phone from auth.users where id='e2000000-0000-4000-8000-000000000004') is distinct from '5491112340003'
 or (select phone from auth.users where id='e2000000-0000-4000-8000-000000000005') is distinct from '447700900805'
 or (select phone from auth.users where id='e2000000-0000-4000-8000-000000000006') is distinct from '541112340006'
 or (select phone_change from auth.users where id='e2000000-0000-4000-8000-000000000006') is distinct from '541112340066' then
  raise exception 'The migration changed an account';
 end if;
 if (select identity_data->>'phone' from auth.identities where user_id='e2000000-0000-4000-8000-000000000001' and provider='phone')
   is distinct from '541112340001'
 or (select identity_data->>'phone' from auth.identities where user_id='e2000000-0000-4000-8000-000000000006' and provider='phone')
   is distinct from '541112340006' then
  raise exception 'The migration changed a phone identity';
 end if;
end $$;
-- 2. Against the fingerprint: the migration added exactly private.phone_key and private.phone_variants (definition and
-- grants) and private.phone_rewrites (with its columns, key, index and reference to auth.users); redefined exactly the
-- seven functions (send_sms_hook, exchange_test_code, contacts_on_resbite, invite_contacts, revoke_phone_invitation,
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
  'column private.phone_rewrites.new_phone','column private.phone_rewrites.rewritten_at',
  'constraint private.phone_rewrites phone_rewrites_user_id_fkey']
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
    'private.phone_variants(text)'::regprocedure)
    and exists(select 1 from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
     where a.grantee=0 or a.grantee in
     (select oid from pg_catalog.pg_roles where rolname in ('anon','authenticated','service_role'))))
 or not (select relrowsecurity from pg_catalog.pg_class where oid='private.phone_rewrites'::regclass)
 or exists(select 1 from information_schema.role_table_grants g where g.table_schema='private'
    and g.table_name='phone_rewrites' and g.grantee in ('PUBLIC','anon','authenticated')) then
  raise exception 'phone_key, phone_variants or phone_rewrites grants are wrong';
 end if;
 -- The record goes with its account: a folded or deleted account's numbers do not outlive it.
 if (select pg_catalog.pg_get_constraintdef(oid) from pg_catalog.pg_constraint
   where conrelid='private.phone_rewrites'::regclass and conname='phone_rewrites_user_id_fkey')
   is distinct from 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE' then
  raise exception 'phone_rewrites.user_id does not reference auth.users on delete cascade';
 end if;
end $$;

-- 3. The owner-run rewrite script, run as text (the harness passes the repository's path as resbite_repo): the older
-- Argentine accounts are rewritten (phone, pending change and phone identity) and recorded; the colliding pair and the
-- rest are untouched.
\set phone_key_rewrite `cat :'resbite_repo'/supabase/ops/rewrite-older-argentine-accounts.sql`
create temporary table phone_key_rehearsal_rewrite as select :'phone_key_rewrite'::text as script;
do $$ begin
 if coalesce(length(btrim((select script from phone_key_rehearsal_rewrite))),0)=0 then
  raise exception 'The rewrite script text is empty';
 end if;
end $$;
:phone_key_rewrite
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
 if (select count(*) from private.phone_rewrites)<>2
 or not exists(select 1 from private.phone_rewrites where user_id='e2000000-0000-4000-8000-000000000001' and old_phone='541112340001' and new_phone='5491112340001')
 or not exists(select 1 from private.phone_rewrites where user_id='e2000000-0000-4000-8000-000000000006' and old_phone='541112340006' and new_phone='5491112340006') then
  raise exception 'phone_rewrites rows wrong';
 end if;
 if (select identity_data->>'phone' from auth.identities where user_id='e2000000-0000-4000-8000-000000000001' and provider='phone')
   is distinct from '5491112340001'
 or (select identity_data->>'phone' from auth.identities where user_id='e2000000-0000-4000-8000-000000000006' and provider='phone')
   is distinct from '5491112340006' then
  raise exception 'The phone identities were not rewritten';
 end if;
end $$;
-- The collision count and the pair the runbook names: older numbers that also exist in the 549 form (the rehearsal's
-- pair), listed by account only.
do $$ begin
 if (select count(*) from auth.users u where u.phone ~ '^54[0-9]{10}$'
     and exists(select 1 from auth.users v where v.phone='549'||substr(u.phone,3)))<>1 then
  raise exception 'Collision count is not the one pair';
 end if;
 if (select array_agg(array[u.id, v.id]) from auth.users u join auth.users v on v.phone='549'||substr(u.phone,3)
     where u.phone ~ '^54[0-9]{10}$')
   is distinct from array[array['e2000000-0000-4000-8000-000000000003'::uuid,'e2000000-0000-4000-8000-000000000004'::uuid]] then
  raise exception 'The runbook''s collision pair query does not list the one pair';
 end if;
end $$;
-- 4. Run a second time, the script changes nothing: every account, record and identity is the same row version.
create temporary table phone_key_rehearsal_rewritten as
 select 'user' as what, u.xmin::text as version, to_jsonb(u)::text as row from auth.users u
 union all select 'rewrite', r.xmin::text, to_jsonb(r)::text from private.phone_rewrites r
 union all select 'identity', i.xmin::text, to_jsonb(i)::text from auth.identities i;
:phone_key_rewrite
do $$ begin
 if exists(select * from phone_key_rehearsal_rewritten except
   (select 'user', u.xmin::text, to_jsonb(u)::text from auth.users u
    union all select 'rewrite', r.xmin::text, to_jsonb(r)::text from private.phone_rewrites r
    union all select 'identity', i.xmin::text, to_jsonb(i)::text from auth.identities i))
 or (select count(*) from phone_key_rehearsal_rewritten)<>
   (select (select count(*) from auth.users)+(select count(*) from private.phone_rewrites)+(select count(*) from auth.identities)) then
  raise exception 'The second run of the rewrite script changed something';
 end if;
end $$;
drop table pg_temp.phone_key_rehearsal_rewritten;
drop table pg_temp.phone_key_rehearsal_rewrite;

-- 5. The rollback, rehearsed and undone: run as text inside a savepoint. First, while another account holds an older
-- number it would put back, it stops at its pre-check (before its first change) with the count only. Then, with that
-- account gone, it goes through: the older accounts' numbers and phone identities come back (the pending change is not
-- restored), the record is gone, every fingerprint entry equals the baseline again (the seven bodies and grants) and the
-- two new functions are gone. Then the savepoint is rolled back, so the tests that follow see the migrated state.
\set phone_key_rollback `cat :'resbite_repo'/supabase/rollback/20261030130000_phone_key.rollback.sql`
create temporary table phone_key_rehearsal_rollback as select :'phone_key_rollback'::text as script;
begin;
savepoint before_rollback;
do $check$ declare v_code text; v_do integer; v_guard integer; v_end integer; v_first integer;
begin
 if coalesce(length(btrim((select script from phone_key_rehearsal_rollback))),0)=0 then
  raise exception 'The phone key rollback text is empty';
 end if;
 v_code := regexp_replace((select script from phone_key_rehearsal_rollback),'--[^\n]*','','g');
 v_do := strpos(v_code,'do $$ declare v_taken bigint; begin');
 v_guard := strpos(v_code,'raise exception ''% older numbers are now held by other accounts; settle them first'', v_taken;');
 v_end := strpos(v_code,'end $$;');
 v_first := regexp_instr(v_code,'\m(create|drop|update|delete|insert|alter)\M',1,1,0,'i');
 if v_guard=0 then raise exception 'The phone key rollback has no pre-check'; end if;
 if v_do=0 or v_end=0 or v_first=0 or not (v_do<v_guard and v_guard<v_end and v_end<v_first) then
  raise exception 'The phone key rollback''s pre-check is not a DO block before its first change (do %, guard %, end %, change %)',
   v_do, v_guard, v_end, v_first;
 end if;
end $check$;
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values
 ('e2000000-0000-4000-8000-000000000007',null,null,'541112340001',now());
do $$ begin
 execute (select script from phone_key_rehearsal_rollback);
 raise exception 'The phone key rollback ran while an older number was taken';
exception when raise_exception then
 if sqlerrm is distinct from '1 older numbers are now held by other accounts; settle them first' then raise; end if;
end $$;
delete from auth.users where id='e2000000-0000-4000-8000-000000000007';
:phone_key_rollback
do $$ declare v_diff text[]; begin
 if (select phone from auth.users where id='e2000000-0000-4000-8000-000000000001') is distinct from '541112340001'
 or (select phone from auth.users where id='e2000000-0000-4000-8000-000000000006') is distinct from '541112340006' then
  raise exception 'The rollback did not restore the older Argentine numbers';
 end if;
 if (select identity_data->>'phone' from auth.identities where user_id='e2000000-0000-4000-8000-000000000001' and provider='phone')
   is distinct from '541112340001'
 or (select identity_data->>'phone' from auth.identities where user_id='e2000000-0000-4000-8000-000000000006' and provider='phone')
   is distinct from '541112340006' then
  raise exception 'The rollback did not restore the phone identities';
 end if;
 if (select phone_change from auth.users where id='e2000000-0000-4000-8000-000000000006') is distinct from '5491112340066' then
  raise exception 'The rollback changed a pending number change (it does not restore them)';
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
-- The migrated, rewritten state is back: the record and both functions exist, and the account and its identity are on
-- the 549 form.
do $$ begin
 if pg_catalog.to_regclass('private.phone_rewrites') is null
 or pg_catalog.to_regprocedure('private.phone_key(text)') is null
 or (select phone from auth.users where id='e2000000-0000-4000-8000-000000000001') is distinct from '5491112340001'
 or (select identity_data->>'phone' from auth.identities where user_id='e2000000-0000-4000-8000-000000000001' and provider='phone')
   is distinct from '5491112340001' then
  raise exception 'The migrated state was not restored after the rollback rehearsal';
 end if;
end $$;
drop table pg_temp.phone_key_rehearsal_rollback;
-- 6. The rehearsal's helpers.
-- Remove the seed so later tests start clean; the identities stand-in goes with it (only the rows, where the table was
-- there before).
delete from public.plans where id='e2100000-0000-4000-8000-000000000001';
delete from private.phone_rewrites where user_id::text like 'e2%';
do $$ begin
 if pg_catalog.obj_description('auth.identities'::regclass, 'pg_class') is not distinct from 'phone key rehearsal stand-in' then
  drop table auth.identities;
 else
  delete from auth.identities where user_id::text like 'e2%';
 end if;
end $$;
delete from auth.users where id::text like 'e2000000-0000-4000-8000-0000000000%';
delete from public.profiles where id='e2000000-0000-4000-8000-000000000005';
drop table private.phone_key_rehearsal_baseline;
drop function private.phone_key_rehearsal_snapshot();
