-- Rehearsal for 20261027120000_phone_accounts (hosted-baseline mode only); .after.sql removes everything here.
-- 1. Data in the pre-migration shape: a roster tester, a confirmed account with no roster row, an account with
-- nothing confirmed, and an account confirmed by phone only (Auth can make one before the migration).
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values
 ('c9000000-0000-4000-8000-000000000001','phone-rehearsal-tester@resbite-test.invalid',now(),null,null),
 ('c9000000-0000-4000-8000-000000000002','phone-rehearsal-waiting@resbite-test.invalid',now(),null,null),
 ('c9000000-0000-4000-8000-000000000003','phone-rehearsal-unconfirmed@resbite-test.invalid',null,null,null),
 ('c9000000-0000-4000-8000-000000000004',null,null,'447700900904',now());
insert into private.tester_roster(email) values ('phone-rehearsal-tester@resbite-test.invalid');
-- Before the migration a phone counts for nothing: the phone-only account is unconfirmed.
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c9000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin if public.account_access_status()->>'status'<>'approved' then raise exception 'Roster tester not approved before the apply'; end if; end $$;
select set_config('request.jwt.claims','{"sub":"c9000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin if public.account_access_status()->>'status'<>'access_pending' then raise exception 'Account without a roster row not waiting before the apply'; end if; end $$;
select set_config('request.jwt.claims','{"sub":"c9000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin if public.account_access_status()->>'status'<>'unconfirmed' then raise exception 'Unconfirmed account not unconfirmed before the apply'; end if; end $$;
select set_config('request.jwt.claims','{"sub":"c9000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin if public.account_access_status()->>'status'<>'unconfirmed' then raise exception 'Phone-only account not unconfirmed before the apply'; end if; end $$;
rollback;

-- 2. The exact definitions and grants the migration replaces or relies on, the grant-source check, and the absence
-- of every object it adds, so .after.sql can prove the rollback restores them.
create function private.phone_rehearsal_snapshot() returns table(name text, definition text)
language sql stable set search_path='' as $$
 with f(oid) as (values ('private.user_eligible(uuid)'::regprocedure),('private.eligible()'::regprocedure),
  ('private.deletion_pending(uuid)'::regprocedure),('private.has_live_grant(uuid)'::regprocedure),
  ('private.account_access_status()'::regprocedure),('public.account_access_status()'::regprocedure),
  ('private.save_registration_details(jsonb,jsonb)'::regprocedure),('public.save_registration_details(jsonb,jsonb)'::regprocedure),
  ('private.join_by_link(text,text,text)'::regprocedure),('public.join_by_link(text,text,text)'::regprocedure))
 select f.oid::text, pg_catalog.pg_get_functiondef(f.oid) from f
 union all
 select 'grants '||f.oid::text, p.proacl::text from f join pg_catalog.pg_proc p on p.oid=f.oid
 union all
 select 'constraint '||conname, pg_catalog.pg_get_constraintdef(oid) from pg_catalog.pg_constraint
 where conrelid='private.beta_access'::regclass
 union all
 select 'table '||t, pg_catalog.to_regclass(t)::text
 from unnest(array['private.phone_mode','private.test_codes','private.test_mode_log','private.app_sessions']) t
 union all
 select 'function '||fn, pg_catalog.to_regprocedure(fn)::text
 from unnest(array['private.phone_digits(text)','public.send_sms_hook(jsonb)','public.exchange_test_code(text,text)',
  'private.note_app_session()','public.note_app_session()','private.used_app(uuid)',
  'private.attest_age(text)','public.attest_age(text)']) fn
$$;
revoke all on function private.phone_rehearsal_snapshot() from public, anon, authenticated, service_role;
create table private.phone_rehearsal_baseline as select * from private.phone_rehearsal_snapshot();
alter table private.phone_rehearsal_baseline enable row level security;
do $$ begin
 if exists(select 1 from private.phone_rehearsal_baseline where (name like 'table %' or name like 'function %') and definition is not null) then
  raise exception 'Phone-account objects exist before the migration';
 end if;
 if (select count(*) from private.phone_rehearsal_baseline where name like 'grants %' and definition is not null)<>10 then
  raise exception 'Expected ten function fingerprints with grants';
 end if;
end $$;
