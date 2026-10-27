-- Phone accounts, test-mode codes (docs/superpowers/specs/2026-10-27-phone-accounts-design.md). Synthetic identities only.
begin;
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values
 ('c1000000-0000-4000-8000-000000000001',null,null,'447700900834',null);
set local role supabase_auth_admin;
do $$ declare r jsonb; begin
 -- hook stores the code in test mode
 r := public.send_sms_hook('{"user":{"id":"c1000000-0000-4000-8000-000000000001","phone":"447700900834"},"sms":{"otp":"123456"}}');
 if r <> '{}'::jsonb then raise exception 'Hook should return {}, got %', r; end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from private.test_codes where phone='447700900834' and otp='123456')<>1 then raise exception 'Code not stored'; end if;
 if (select count(*) from private.test_mode_log where kind='sent' and phone_suffix='34' and user_id='c1000000-0000-4000-8000-000000000001')<>1 then raise exception 'Sent log row expected'; end if;
end $$;
-- hook prefers the new number
set local role supabase_auth_admin;
do $$ begin
 perform public.send_sms_hook('{"user":{"id":"c1000000-0000-4000-8000-000000000001","phone":"447700900001","new_phone":"+44 7700 900002"},"sms":{"otp":"111111"}}');
end $$;
reset role;
do $$ begin
 if (select count(*) from private.test_codes where phone='447700900002' and otp='111111')<>1 then raise exception 'New number not preferred'; end if;
 if exists(select 1 from private.test_codes where phone='447700900001') then raise exception 'Old number must not be stored'; end if;
end $$;
-- a new code replaces the old one
set local role supabase_auth_admin;
do $$ begin
 perform public.send_sms_hook('{"user":{"id":"c1000000-0000-4000-8000-000000000001","phone":"447700900834"},"sms":{"otp":"654321"}}');
end $$;
reset role;
do $$ begin
 if (select count(*) from private.test_codes where phone='447700900834')<>1 or (select otp from private.test_codes where phone='447700900834')<>'654321' then raise exception 'New code should replace the old'; end if;
end $$;
-- malformed event is refused
create temporary table cnt as select count(*) from private.test_codes;
grant select on cnt to supabase_auth_admin;
set local role supabase_auth_admin;
do $$ declare e constant jsonb := '{"error":{"http_code":400,"message":"Invalid code request."}}'; begin
 if public.send_sms_hook('{"user":{"id":"c1000000-0000-4000-8000-000000000001","phone":"447700900555"},"sms":{"otp":"12ab56"}}') <> e then raise exception 'Bad otp not refused'; end if;
 if public.send_sms_hook('{"user":{"id":"c1000000-0000-4000-8000-000000000001"},"sms":{"otp":"123456"}}') <> e then raise exception 'Missing phone not refused'; end if;
 if public.send_sms_hook('{}') <> e then raise exception 'Empty event not refused'; end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from private.test_codes)<>(select count from cnt) then raise exception 'Malformed event stored something'; end if;
end $$;
-- exchange returns the stored code for 000000 only
update private.test_codes set sent_at=now() where phone='447700900834';
set local role anon;
do $$ begin
 if public.exchange_test_code('+44 7700 900834','000000') is distinct from '654321' then raise exception 'Exchange should return the stored code'; end if;
 if public.exchange_test_code('+44 7700 900834','123456') is not null then raise exception 'Only 000000 may be exchanged'; end if;
 if public.exchange_test_code('+44 7700 900999','000000') is not null then raise exception 'Unknown number should give null'; end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from private.test_mode_log where kind='exchanged' and phone_suffix='34' and user_id='c1000000-0000-4000-8000-000000000001')<>1 then raise exception 'One exchanged row expected, none for null results'; end if;
 if (select count(*) from private.test_mode_log where kind='exchanged')<>1 then raise exception 'Null results must not be logged'; end if;
end $$;
update private.test_codes set sent_at = now() - interval '11 minutes';
set local role anon;
do $$ begin
 if public.exchange_test_code('+44 7700 900834','000000') is not null then raise exception 'Expired code exchanged'; end if;
end $$;
reset role;
-- live mode refuses and stores nothing
update private.test_codes set sent_at=now();
update private.phone_mode set test_mode=false;
set local role anon;
do $$ begin
 if public.exchange_test_code('+44 7700 900834','000000') is not null then raise exception 'Live mode exchanged a code'; end if;
end $$;
reset role;
set local role supabase_auth_admin;
do $$ begin
 if public.send_sms_hook('{"user":{"id":"c1000000-0000-4000-8000-000000000001","phone":"447700900777"},"sms":{"otp":"123456"}}')
   <> '{"error":{"http_code":503,"message":"Text messages aren''t set up yet."}}'::jsonb then raise exception 'Live mode should return 503'; end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from private.test_codes where phone='447700900777') then raise exception 'Live mode stored a code'; end if;
 if (select count(*) from private.test_mode_log where kind='sent')<>3 then raise exception 'Live mode logged'; end if;
end $$;
-- a missing mode row is live mode: test mode never fails open
update private.phone_mode set test_mode=true;
delete from private.phone_mode;
set local role anon;
do $$ begin
 if public.exchange_test_code('+44 7700 900834','000000') is not null then raise exception 'Exchange worked with no mode row'; end if;
end $$;
reset role;
set local role supabase_auth_admin;
do $$ begin
 if public.send_sms_hook('{"user":{"id":"c1000000-0000-4000-8000-000000000001","phone":"447700900778"},"sms":{"otp":"123456"}}')
   <> '{"error":{"http_code":503,"message":"Text messages aren''t set up yet."}}'::jsonb then raise exception 'No mode row should return 503'; end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from private.test_codes where phone='447700900778') then raise exception 'No mode row stored a code'; end if;
 if (select count(*) from private.test_mode_log where kind='exchanged')<>1 then raise exception 'No mode row logged an exchange'; end if;
end $$;
-- grants
do $$ declare r text; begin
 foreach r in array array['anon','authenticated','service_role'] loop
  begin
   execute format('set local role %I', r);
   perform public.send_sms_hook('{}');
   raise exception 'Role % could call send_sms_hook', r;
  exception when insufficient_privilege then null;
  end;
  reset role;
 end loop;
 begin
  set local role anon;
  perform 1 from private.test_codes;
  raise exception 'anon read test_codes';
 exception when insufficient_privilege then null;
 end;
 reset role;
end $$;
rollback;
-- Accounts confirmed by phone: a confirmed phone counts as a confirmed account, the maintainer grant, app use and
-- the 18+ tick. Synthetic identities only (prefix c2); one rolled-back block.
begin;
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values
 ('c2000000-0000-4000-8000-000000000001',null,null,'447700900101',now()),
 ('c2000000-0000-4000-8000-000000000002',null,null,'447700900102',now()),
 ('c2000000-0000-4000-8000-000000000003',null,null,'447700900103',null),
 ('c2000000-0000-4000-8000-000000000004','phone-accounts-roster@resbite-test.invalid',now(),null,null),
 ('c2000000-0000-4000-8000-000000000005',null,null,'447700900105',now());
insert into private.tester_roster(email) values ('phone-accounts-roster@resbite-test.invalid');
-- This fixture helper runs as its caller; it is not an application endpoint.
create function pg_temp.phone_access(p_uid uuid) returns text language plpgsql security invoker as $$
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_uid,'role','authenticated')::text,true);
 return public.account_access_status()->>'status';
end $$;
-- A phone-only account with a maintainer grant is approved.
insert into private.beta_access(user_id,source) values ('c2000000-0000-4000-8000-000000000001','maintainer');
do $$ begin
 if not private.user_eligible('c2000000-0000-4000-8000-000000000001') then raise exception 'Phone-only account with a maintainer grant not eligible'; end if;
end $$;
set local role authenticated;
do $$ begin
 if pg_temp.phone_access('c2000000-0000-4000-8000-000000000001') is distinct from 'approved' then raise exception 'Phone-only account with a maintainer grant not approved'; end if;
 -- Without the grant it waits; with nothing confirmed it is unconfirmed; an email-confirmed roster tester is approved.
 if pg_temp.phone_access('c2000000-0000-4000-8000-000000000002') is distinct from 'access_pending' then raise exception 'Phone-only account without a grant not waiting'; end if;
 if pg_temp.phone_access('c2000000-0000-4000-8000-000000000003') is distinct from 'unconfirmed' then raise exception 'Account with nothing confirmed not unconfirmed'; end if;
 if pg_temp.phone_access('c2000000-0000-4000-8000-000000000004') is distinct from 'approved' then raise exception 'Email-confirmed roster tester not approved'; end if;
end $$;
reset role;
-- A phone-only account that is leaving is not eligible, grant or not.
insert into private.beta_access(user_id,source) values ('c2000000-0000-4000-8000-000000000005','maintainer');
insert into public.profiles(id,display_name,deletion_requested_at) values ('c2000000-0000-4000-8000-000000000005','Leaving',now());
do $$ begin
 if private.user_eligible('c2000000-0000-4000-8000-000000000002') then raise exception 'Phone-only account without a grant eligible'; end if;
 if private.user_eligible('c2000000-0000-4000-8000-000000000005') then raise exception 'Leaving phone-only account eligible'; end if;
 if not private.user_eligible('c2000000-0000-4000-8000-000000000004') then raise exception 'Email-confirmed roster tester not eligible'; end if;
end $$;
-- A roster row needs a confirmed email: a confirmed phone with an unconfirmed roster email waits until the email
-- is confirmed.
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values
 ('c2000000-0000-4000-8000-000000000006','phone-accounts-roster-unconfirmed@resbite-test.invalid',null,'447700900106',now());
insert into private.tester_roster(email,enabled) values ('phone-accounts-roster-unconfirmed@resbite-test.invalid',true);
do $$ begin
 if private.user_eligible('c2000000-0000-4000-8000-000000000006') then raise exception 'Roster match with an unconfirmed email eligible'; end if;
end $$;
set local role authenticated;
do $$ begin
 if pg_temp.phone_access('c2000000-0000-4000-8000-000000000006') is distinct from 'access_pending' then raise exception 'Roster match with an unconfirmed email not waiting'; end if;
end $$;
reset role;
update auth.users set email_confirmed_at=now() where id='c2000000-0000-4000-8000-000000000006';
set local role authenticated;
do $$ begin
 if pg_temp.phone_access('c2000000-0000-4000-8000-000000000006') is distinct from 'approved' then raise exception 'Roster match with the email confirmed not approved'; end if;
end $$;
reset role;
-- A phone-confirmed account awaiting access may save its details; one with nothing confirmed may not.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 r := public.save_registration_details(null,'{"birth_date":null,"phone":null,"city":"Leeds","interests":[]}');
 if r->'registration_details'->>'city' is distinct from 'Leeds' then raise exception 'Details not saved: %', r; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"c2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 begin
  perform public.save_registration_details(null,'{"birth_date":null,"phone":null,"city":"Leeds","interests":[]}');
  raise exception 'Unconfirmed account saved details';
 exception when insufficient_privilege then null;
 end;
end $$;
-- App use: one row per account, the first time kept and the last time bumped.
select set_config('request.jwt.claims','{"sub":"c2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.note_app_session();
reset role;
update private.app_sessions set first_at=now()-interval '1 day', last_at=now()-interval '1 day' where user_id='c2000000-0000-4000-8000-000000000001';
set local role authenticated;
select public.note_app_session();
reset role;
do $$ begin
 if (select count(*) from private.app_sessions where user_id='c2000000-0000-4000-8000-000000000001')<>1 then raise exception 'One app-session row expected'; end if;
 if not exists(select 1 from private.app_sessions where user_id='c2000000-0000-4000-8000-000000000001'
  and first_at=now()-interval '1 day' and last_at=now() and last_at>=first_at) then raise exception 'last_at not bumped or first_at moved'; end if;
 if not private.used_app('c2000000-0000-4000-8000-000000000001') then raise exception 'used_app false after a session'; end if;
 if private.used_app('c2000000-0000-4000-8000-000000000002') then raise exception 'used_app true without a session'; end if;
end $$;
-- The 18+ tick: written once, never overwritten; a malformed Terms version is refused.
set local role authenticated;
do $$ begin
 perform public.attest_age('2026-10');
 perform public.attest_age('2026-11');
 begin perform public.attest_age('oct'); raise exception 'Malformed Terms version accepted';
 exception when invalid_parameter_value then null; end;
 begin perform public.attest_age(null); raise exception 'Missing Terms version accepted';
 exception when invalid_parameter_value then null; end;
end $$;
-- No session: both refuse.
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
do $$ begin
 begin perform public.note_app_session(); raise exception 'Session noted without an account'; exception when insufficient_privilege then null; end;
 begin perform public.attest_age('2026-10'); raise exception 'Tick stored without an account'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if (select count(*) from private.age_attestations where user_id='c2000000-0000-4000-8000-000000000001')<>1
 or (select terms_version from private.age_attestations where user_id='c2000000-0000-4000-8000-000000000001')<>'2026-10' then
  raise exception 'The first tick should stay';
 end if;
end $$;
-- anon may call neither.
set local role anon;
do $$ begin
 begin perform public.note_app_session(); raise exception 'anon noted an app session'; exception when insufficient_privilege then null; end;
 begin perform public.attest_age('2026-10'); raise exception 'anon stored a tick'; exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Grant sources: link and maintainer only.
do $$ begin
 begin
  insert into private.beta_access(user_id,source) values ('c2000000-0000-4000-8000-000000000002','other');
  raise exception 'Unknown grant source accepted';
 exception when check_violation then null;
 end;
end $$;
-- Grants: the app-use marker and used_app stay with the database; the façades and bodies go to authenticated only.
do $$ declare r text; begin
 foreach r in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(r,'private.used_app(uuid)','execute') then raise exception '% may call used_app', r; end if;
  if has_table_privilege(r,'private.app_sessions','select') then raise exception '% may read app_sessions', r; end if;
 end loop;
 foreach r in array array['public.note_app_session()','private.note_app_session()','public.attest_age(text)','private.attest_age(text)'] loop
  if not has_function_privilege('authenticated',r,'execute') then raise exception 'authenticated may not call %', r; end if;
  if has_function_privilege('anon',r,'execute') or has_function_privilege('service_role',r,'execute') then raise exception '% is open beyond authenticated', r; end if;
 end loop;
end $$;
rollback;
-- Joining by an event link (GI2's join_by_link): a confirmed phone counts as a confirmed account, so a phone-only
-- account waiting for access joins and becomes eligible; an account with neither confirmed is refused. Synthetic
-- identities only (prefix c3); one rolled-back block.
begin;
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values
 ('c3000000-0000-4000-8000-000000000001','phone-accounts-link-owner@resbite-test.invalid',now(),null,null),
 ('c3000000-0000-4000-8000-000000000002',null,null,'447700900302',now()),
 ('c3000000-0000-4000-8000-000000000003',null,null,'447700900303',null);
insert into private.tester_roster(email) values ('phone-accounts-link-owner@resbite-test.invalid');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c3000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.save_profile('Owner');
create temporary table phone_link_codes(name text primary key, code text);
do $$ begin
 perform public.create_plan_v3('c3100000-0000-4000-8000-000000000001','Film night','',array['community'],null,
  '2099-06-01 19:30+00',null,'UTC','Cinema room, 12 Example Street','');
 insert into phone_link_codes values('one',public.plan_link('c3100000-0000-4000-8000-000000000001'));
end $$;
select set_config('request.jwt.claims','{"sub":"c3000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if public.account_access_status()->>'status'<>'access_pending' then raise exception 'Phone-only account not waiting before joining'; end if;
 if public.join_by_link((select code from phone_link_codes where name='one'),'Phone Guest','2026-10')<>'c3100000-0000-4000-8000-000000000001' then
  raise exception 'Phone-only join returned another plan';
 end if;
 if public.account_access_status()->>'status'<>'approved' then raise exception 'Phone-only account not approved after joining'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"c3000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 begin perform public.join_by_link((select code from phone_link_codes where name='one'),'Unconfirmed','2026-10'); raise exception 'Account with nothing confirmed joined';
 exception when others then if sqlstate<>'42501' or sqlerrm<>'Sign-in required' then raise; end if; end;
end $$;
reset role;
do $$ begin
 if not private.user_eligible('c3000000-0000-4000-8000-000000000002') then raise exception 'Phone-only account not eligible after joining'; end if;
 if (select count(*) from private.beta_access where user_id='c3000000-0000-4000-8000-000000000002' and source='link' and revoked_at is null)<>1 then raise exception 'One link grant expected'; end if;
 if (select display_name from public.profiles where id='c3000000-0000-4000-8000-000000000002') is distinct from 'Phone Guest' then raise exception 'Profile not created with the name'; end if;
 if (select response from public.attendees where plan_id='c3100000-0000-4000-8000-000000000001' and user_id='c3000000-0000-4000-8000-000000000002') is distinct from 'pending' then raise exception 'Phone guest not on the event'; end if;
 if exists(select 1 from private.beta_access where user_id='c3000000-0000-4000-8000-000000000003')
 or exists(select 1 from public.profiles where id='c3000000-0000-4000-8000-000000000003')
 or exists(select 1 from public.attendees where user_id='c3000000-0000-4000-8000-000000000003') then raise exception 'A refused join wrote something'; end if;
end $$;
rollback;
