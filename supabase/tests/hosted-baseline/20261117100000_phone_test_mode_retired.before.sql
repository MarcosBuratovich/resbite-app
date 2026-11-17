-- Rehearsal for 20261117100000_phone_test_mode_retired (hosted-baseline mode only); .after.sql removes everything here.
-- It also rehearses the switch-off sitting that comes first: supabase/ops/phone-test-mode-off.sql, then the read-only
-- supabase/ops/phone-test-mode-review.sql, on the hosted baseline with test mode on.
-- 1. The five objects the migration drops, as they stand, so .after.sql can prove the rollback restores them exactly:
-- each function's definition and grants; each table's column fingerprint (the expression of
-- supabase/ops/hosted-fingerprint.sql), row-level security, grants and constraints.
create table private.pc_rehearsal_functions as
 select f as signature, pg_catalog.pg_get_functiondef(f::regprocedure) as definition,
  (select p.proacl::text from pg_catalog.pg_proc p where p.oid=f::regprocedure) as grants
 from unnest(array['public.exchange_test_code(text,text)','public.send_sms_hook(jsonb)']) f;
alter table private.pc_rehearsal_functions enable row level security;
create table private.pc_rehearsal_tables as
 select t as name,
  (select md5(string_agg(a.attname||' '||pg_catalog.format_type(a.atttypid,a.atttypmod)||' '||a.attnotnull||' '||coalesce(pg_catalog.pg_get_expr(d.adbin,d.adrelid),''), ',' order by a.attnum))
   from pg_catalog.pg_attribute a left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
   where a.attrelid=t::regclass and a.attnum>0 and not a.attisdropped) as columns,
  (select c.relrowsecurity from pg_catalog.pg_class c where c.oid=t::regclass) as rls,
  (select c.relacl::text from pg_catalog.pg_class c where c.oid=t::regclass) as grants,
  (select string_agg(k.conname||' '||pg_catalog.pg_get_constraintdef(k.oid), ',' order by k.conname)
   from pg_catalog.pg_constraint k where k.conrelid=t::regclass) as constraints
 from unnest(array['private.phone_mode','private.test_codes','private.test_mode_log']) t;
alter table private.pc_rehearsal_tables enable row level security;
do $$ begin
 if (select count(*) from private.pc_rehearsal_functions where definition is not null and grants is not null)<>2 then
  raise exception 'A test-mode function is missing or has no grants';
 end if;
 if (select count(*) from private.pc_rehearsal_tables where columns is not null and rls and grants is not null and constraints is not null)<>3 then
  raise exception 'A test-mode table is missing, open, or has no grants or constraints';
 end if;
end $$;

-- 2. Fixtures, kept until .after.sql removes them: account 01 with a code waiting, its two log rows, a phone identity,
-- a session and a refresh token.
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values
 ('ac1d0000-0000-4000-8000-000000000001',null,null,'447700900941',now());
insert into auth.identities(provider_id,user_id,identity_data,provider) values
 ('ac1d0000-0000-4000-8000-000000000001','ac1d0000-0000-4000-8000-000000000001','{"phone":"447700900941"}','phone');
insert into private.test_codes(phone,otp,sent_at) values ('447700900941','123456',now());
insert into private.test_mode_log(kind,phone_suffix,user_id) values
 ('sent','41','ac1d0000-0000-4000-8000-000000000001'),('exchanged','41','ac1d0000-0000-4000-8000-000000000001');
insert into auth.sessions(id,user_id) values ('ac1d0000-0000-4000-8000-000000000011','ac1d0000-0000-4000-8000-000000000001');
insert into auth.refresh_tokens(user_id,session_id) values ('ac1d0000-0000-4000-8000-000000000001','ac1d0000-0000-4000-8000-000000000011');

-- The pre-state: the hosted baseline has test mode on, so 000000 swaps for the stored code (rolled back, so the log
-- keeps its two rows).
begin;
do $$ begin
 if not coalesce((select test_mode from private.phone_mode), false) then raise exception 'Test mode is not on before the switch-off'; end if;
end $$;
set local role anon;
do $$ begin
 if public.exchange_test_code('+44 7700 900941','000000') is distinct from '123456' then
  raise exception 'Before the switch-off, 000000 should swap for the stored code';
 end if;
end $$;
rollback;

-- 3. The switch-off, as the owner script runs it (its statements one by one).
\ir ../../ops/phone-test-mode-off.sql

-- 4. Test mode is off, no code is stored, every session and refresh token is gone, the log is kept; 000000 swaps for
-- nothing, and the Postgres hook refuses a well-formed event (503) and stores nothing (Review Focus 5).
do $$ begin
 if (select count(*) from private.phone_mode)<>1 then raise exception 'The mode row is missing or doubled'; end if;
 if coalesce((select test_mode from private.phone_mode), true) then raise exception 'Test mode is still on'; end if;
 if exists(select 1 from private.test_codes) then raise exception 'A stored code is left'; end if;
 if exists(select 1 from auth.sessions) then raise exception 'A session is left'; end if;
 if exists(select 1 from auth.refresh_tokens) then raise exception 'A refresh token is left'; end if;
 if (select count(*) from private.test_mode_log where user_id='ac1d0000-0000-4000-8000-000000000001')<>2 then
  raise exception 'The switch-off changed the test-mode log';
 end if;
end $$;
set role anon;
do $$ begin
 if public.exchange_test_code('+44 7700 900941','000000') is not null then raise exception '000000 swapped after the switch-off'; end if;
end $$;
reset role;
set role supabase_auth_admin;
do $$ declare r jsonb; begin
 r := public.send_sms_hook('{"user":{"id":"ac1d0000-0000-4000-8000-000000000001","phone":"447700900941"},"sms":{"otp":"654321"}}');
 if r is distinct from '{"error":{"http_code":503,"message":"Text messages aren''t set up yet."}}'::jsonb then
  raise exception 'The Postgres hook answered % after the switch-off', r;
 end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from private.test_codes) then raise exception 'The Postgres hook stored a code after the switch-off'; end if;
 if (select count(*) from private.test_mode_log)<>2 then raise exception 'The test-mode log changed after the switch-off'; end if;
end $$;

-- 5. The review runs (read-only) and the log still has its two rows.
\ir ../../ops/phone-test-mode-review.sql
do $$ begin
 if (select count(*) from private.test_mode_log)<>2 then raise exception 'The review changed the test-mode log'; end if;
end $$;
