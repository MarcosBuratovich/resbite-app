-- Rehearsal checks for 20261027120000_phone_accounts (hosted-baseline mode only).
-- 1. The migration added its four tables and eight functions, redefined exactly user_eligible(),
-- account_access_status() and save_registration_details() and kept every grant, allowed maintainer grants, left
-- test mode on and wrote no rows.
do $$ declare item record; begin
 if exists(select 1 from private.phone_rehearsal_snapshot() where (name like 'table %' or name like 'function %') and definition is null) then
  raise exception 'Phone-account objects missing after the apply';
 end if;
 for item in
  select b.name, b.definition as before, n.definition as after
  from private.phone_rehearsal_baseline b join private.phone_rehearsal_snapshot() n on n.name=b.name
  where b.name not like 'table %' and b.name not like 'function %'
 loop
  if item.name in ('private.user_eligible(uuid)','private.account_access_status()','private.save_registration_details(jsonb,jsonb)',
   'constraint beta_access_source_check') then
   if item.before=item.after then raise exception '% not redefined by the apply', item.name; end if;
  elsif item.before is distinct from item.after then
   raise exception 'The apply changed %', item.name;
  end if;
 end loop;
 if (select definition from private.phone_rehearsal_snapshot() where name='constraint beta_access_source_check')
    not like '%maintainer%' then raise exception 'Maintainer grants not allowed'; end if;
 if (select count(*) from private.phone_mode)<>1 or not (select test_mode from private.phone_mode) then
  raise exception 'Test mode not on after the apply';
 end if;
 if exists(select 1 from private.test_codes) or exists(select 1 from private.test_mode_log) or exists(select 1 from private.app_sessions)
 or exists(select 1 from private.beta_access) or exists(select 1 from private.age_attestations) then
  raise exception 'The apply wrote rows';
 end if;
end $$;
-- 2. Grants on the new objects: the hook for Auth only, the exchange for anyone, app use and the tick for signed-in
-- accounts only, and the tables and the remaining helpers for nobody.
do $$ declare r text; begin
 foreach r in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(r,'public.send_sms_hook(jsonb)','execute') then raise exception '% may call send_sms_hook', r; end if;
  if has_function_privilege(r,'private.phone_digits(text)','execute') then raise exception '% may call phone_digits', r; end if;
  if has_function_privilege(r,'private.used_app(uuid)','execute') then raise exception '% may call used_app', r; end if;
  if has_table_privilege(r,'private.phone_mode','select') or has_table_privilege(r,'private.test_codes','select')
  or has_table_privilege(r,'private.test_mode_log','select') or has_table_privilege(r,'private.app_sessions','select') then
   raise exception '% may read a phone-account table', r;
  end if;
 end loop;
 if not has_function_privilege('supabase_auth_admin','public.send_sms_hook(jsonb)','execute') then raise exception 'Auth may not call the hook'; end if;
 if not has_function_privilege('anon','public.exchange_test_code(text,text)','execute')
 or not has_function_privilege('authenticated','public.exchange_test_code(text,text)','execute')
 or has_function_privilege('service_role','public.exchange_test_code(text,text)','execute') then
  raise exception 'exchange_test_code grants wrong';
 end if;
 foreach r in array array['public.note_app_session()','private.note_app_session()','public.attest_age(text)','private.attest_age(text)'] loop
  if not has_function_privilege('authenticated',r,'execute') or has_function_privilege('anon',r,'execute')
  or has_function_privilege('service_role',r,'execute') then raise exception '% grants wrong', r; end if;
 end loop;
end $$;
-- 3. The apply alone lets nobody in: email accounts keep their status, and the phone-only account goes from
-- unconfirmed to waiting.
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c9000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin if public.account_access_status()->>'status'<>'approved' then raise exception 'Roster tester not approved after the apply'; end if; end $$;
select set_config('request.jwt.claims','{"sub":"c9000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin if public.account_access_status()->>'status'<>'access_pending' then raise exception 'Account approved by the apply alone'; end if; end $$;
select set_config('request.jwt.claims','{"sub":"c9000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin if public.account_access_status()->>'status'<>'unconfirmed' then raise exception 'Unconfirmed account changed by the apply'; end if; end $$;
select set_config('request.jwt.claims','{"sub":"c9000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin if public.account_access_status()->>'status'<>'access_pending' then raise exception 'Phone-only account not waiting after the apply'; end if; end $$;
rollback;
-- 4. A maintainer grant lets the phone-only account in, which then uses the app, ticks and gets a code; the
-- rollback restores every definition, grant and the check exactly and removes every new object; rehearsed, then
-- undone.
begin;
insert into private.beta_access(user_id,source) values
 ('c9000000-0000-4000-8000-000000000004','maintainer'),
 ('c9000000-0000-4000-8000-000000000002','link');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c9000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin
 if public.account_access_status()->>'status'<>'approved' then raise exception 'Maintainer grant did not approve the phone-only account'; end if;
 perform public.note_app_session();
 perform public.attest_age('2026-10');
end $$;
reset role;
set local role supabase_auth_admin;
do $$ begin
 if public.send_sms_hook('{"user":{"id":"c9000000-0000-4000-8000-000000000004","phone":"447700900904"},"sms":{"otp":"123456"}}')<>'{}'::jsonb then
  raise exception 'Hook did not store the code';
 end if;
end $$;
reset role;
do $$ begin
 if not private.used_app('c9000000-0000-4000-8000-000000000004') or not exists(select 1 from private.test_codes where phone='447700900904') then
  raise exception 'App use or code not recorded';
 end if;
end $$;
\ir ../../rollback/20261027120000_phone_accounts.rollback.sql
do $$ declare item record; begin
 for item in
  select coalesce(b.name,n.name) as name, b.definition as before, n.definition as after
  from private.phone_rehearsal_baseline b full join private.phone_rehearsal_snapshot() n on n.name=b.name
 loop
  if item.before is distinct from item.after then raise exception 'Rollback did not restore %', item.name; end if;
 end loop;
 -- The maintainer grant is gone; the link grant and the 18+ tick (GI2's rows) stay; the roster is unchanged.
 if exists(select 1 from private.beta_access where source<>'link')
 or not exists(select 1 from private.beta_access where user_id='c9000000-0000-4000-8000-000000000002' and source='link') then
  raise exception 'Rollback deleted the wrong grants';
 end if;
 if (select terms_version from private.age_attestations where user_id='c9000000-0000-4000-8000-000000000004') is distinct from '2026-10' then
  raise exception 'Rollback lost the tick';
 end if;
 if (select count(*) from private.tester_roster where email like 'phone-rehearsal-%')<>1 then raise exception 'Rollback changed the roster'; end if;
end $$;
-- The phone-only account is unconfirmed again; the email accounts keep their access.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c9000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin if public.account_access_status()->>'status'<>'unconfirmed' then raise exception 'Phone-only account not unconfirmed after the rollback'; end if; end $$;
select set_config('request.jwt.claims','{"sub":"c9000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin if public.account_access_status()->>'status'<>'approved' then raise exception 'Roster tester lost access in the rollback'; end if; end $$;
select set_config('request.jwt.claims','{"sub":"c9000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin if public.account_access_status()->>'status'<>'approved' then raise exception 'Link grant holder lost access in the rollback'; end if; end $$;
reset role;
rollback;
-- 5. Remove the seed and the rehearsal helpers so later tests start clean.
delete from private.tester_roster where email='phone-rehearsal-tester@resbite-test.invalid';
delete from auth.users where id in ('c9000000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-000000000002',
 'c9000000-0000-4000-8000-000000000003','c9000000-0000-4000-8000-000000000004');
drop table private.phone_rehearsal_baseline;
drop function private.phone_rehearsal_snapshot();
