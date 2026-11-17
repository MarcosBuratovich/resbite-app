-- Test-mode codes retired by 20261117100000_phone_test_mode_retired (see phone-test-mode-retired.sql).
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
 -- Without the grant it is approved too (since the open beta, 20261116120000; it used to wait); with nothing confirmed it
 -- is unconfirmed; an email-confirmed roster tester is approved.
 if pg_temp.phone_access('c2000000-0000-4000-8000-000000000002') is distinct from 'approved' then raise exception 'Phone-only account without a grant not approved (open beta)'; end if;
 if pg_temp.phone_access('c2000000-0000-4000-8000-000000000003') is distinct from 'unconfirmed' then raise exception 'Account with nothing confirmed not unconfirmed'; end if;
 if pg_temp.phone_access('c2000000-0000-4000-8000-000000000004') is distinct from 'approved' then raise exception 'Email-confirmed roster tester not approved'; end if;
end $$;
reset role;
-- A phone-only account that is leaving is not eligible, grant or not.
insert into private.beta_access(user_id,source) values ('c2000000-0000-4000-8000-000000000005','maintainer');
insert into public.profiles(id,display_name,deletion_requested_at) values ('c2000000-0000-4000-8000-000000000005','Leaving',now());
do $$ begin
 if not private.user_eligible('c2000000-0000-4000-8000-000000000002') then raise exception 'Phone-only account without a grant not eligible (open beta)'; end if;
 if private.user_eligible('c2000000-0000-4000-8000-000000000005') then raise exception 'Leaving phone-only account eligible'; end if;
 if not private.user_eligible('c2000000-0000-4000-8000-000000000004') then raise exception 'Email-confirmed roster tester not eligible'; end if;
end $$;
-- A roster row needs a confirmed email: a confirmed phone with an unconfirmed roster email is no roster tester
-- (granted_access) until the email is confirmed. Since the open beta (20261116120000) the confirmed phone lets it use
-- the app either way (it used to wait for the email).
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values
 ('c2000000-0000-4000-8000-000000000006','phone-accounts-roster-unconfirmed@resbite-test.invalid',null,'447700900106',now());
insert into private.tester_roster(email,enabled) values ('phone-accounts-roster-unconfirmed@resbite-test.invalid',true);
do $$ begin
 if private.granted_access('c2000000-0000-4000-8000-000000000006') then raise exception 'Roster match with an unconfirmed email counted'; end if;
 if not private.user_eligible('c2000000-0000-4000-8000-000000000006') then raise exception 'Confirmed phone account not eligible (open beta)'; end if;
end $$;
set local role authenticated;
do $$ begin
 if pg_temp.phone_access('c2000000-0000-4000-8000-000000000006') is distinct from 'approved' then raise exception 'Confirmed phone account not approved (open beta)'; end if;
end $$;
reset role;
update auth.users set email_confirmed_at=now() where id='c2000000-0000-4000-8000-000000000006';
do $$ begin
 if not private.granted_access('c2000000-0000-4000-8000-000000000006') then raise exception 'Roster match with the email confirmed not counted'; end if;
end $$;
set local role authenticated;
do $$ begin
 if pg_temp.phone_access('c2000000-0000-4000-8000-000000000006') is distinct from 'approved' then raise exception 'Roster match with the email confirmed not approved'; end if;
end $$;
reset role;
-- App use: one row per account, the first time kept and the last time bumped.
set local role authenticated;
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
-- account asks to join and is on the event once the host approves (open-link approval, 20261029120000); an account with
-- neither confirmed is refused. Since the open beta (20261116120000) the phone-only account may use the app before it
-- asks (it used to wait for the approval). Synthetic identities only (prefix c3); one rolled-back block.
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
 if public.account_access_status()->>'status'<>'approved' then raise exception 'Phone-only account not approved before joining (open beta)'; end if;
 if public.join_by_link((select code from phone_link_codes where name='one'),'Phone Guest','2026-10')<>'c3100000-0000-4000-8000-000000000001' then
  raise exception 'Phone-only join returned another plan';
 end if;
 if public.account_access_status()->>'status'<>'approved' then raise exception 'Phone-only account not approved after asking (open beta)'; end if;
end $$;
-- Asking only asks: no grant and no place before the host approves.
reset role;
do $$ begin
 if exists(select 1 from private.beta_access where user_id='c3000000-0000-4000-8000-000000000002')
 or exists(select 1 from public.attendees where user_id='c3000000-0000-4000-8000-000000000002') then raise exception 'Phone-only account admitted before the host approved'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c3000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.decide_join_request('c3100000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"c3000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if public.account_access_status()->>'status'<>'approved' then raise exception 'Phone-only account not approved after the host approved'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"c3000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 begin perform public.join_by_link((select code from phone_link_codes where name='one'),'Unconfirmed','2026-10'); raise exception 'Account with nothing confirmed joined';
 exception when others then if sqlstate<>'42501' or sqlerrm<>'Sign-in required' then raise; end if; end;
end $$;
reset role;
do $$ begin
 if not private.user_eligible('c3000000-0000-4000-8000-000000000002') then raise exception 'Phone-only account not eligible after joining'; end if;
 if (select count(*) from private.beta_access where user_id='c3000000-0000-4000-8000-000000000002' and source='approval' and revoked_at is null)<>1 then raise exception 'One approval grant expected'; end if;
 if (select display_name from public.profiles where id='c3000000-0000-4000-8000-000000000002') is distinct from 'Phone Guest' then raise exception 'Profile not created with the name'; end if;
 if (select response from public.attendees where plan_id='c3100000-0000-4000-8000-000000000001' and user_id='c3000000-0000-4000-8000-000000000002') is distinct from 'pending' then raise exception 'Phone guest not on the event'; end if;
 if exists(select 1 from private.beta_access where user_id='c3000000-0000-4000-8000-000000000003')
 or exists(select 1 from public.profiles where id='c3000000-0000-4000-8000-000000000003')
 or exists(select 1 from public.attendees where user_id='c3000000-0000-4000-8000-000000000003') then raise exception 'A refused join wrote something'; end if;
end $$;
rollback;
