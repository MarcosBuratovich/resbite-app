-- Phone-code test mode retired (20261117100000_phone_test_mode_retired; App Store readiness plan 1, Task 5). The Send
-- SMS hook is the send-sms Edge Function now, so the Postgres hook, the 000000 swap and their three tables are gone,
-- and nothing left in public or private still names them. private.phone_digits stays: the invitation functions use it.
begin;
do $$ declare r record; v_role text; begin
 if pg_catalog.to_regprocedure('public.exchange_test_code(text,text)') is not null then raise exception 'exchange_test_code still exists'; end if;
 if pg_catalog.to_regprocedure('public.send_sms_hook(jsonb)') is not null then raise exception 'send_sms_hook still exists'; end if;
 if pg_catalog.to_regclass('private.test_codes') is not null then raise exception 'private.test_codes still exists'; end if;
 if pg_catalog.to_regclass('private.test_mode_log') is not null then raise exception 'private.test_mode_log still exists'; end if;
 if pg_catalog.to_regclass('private.phone_mode') is not null then raise exception 'private.phone_mode still exists'; end if;
 if pg_catalog.to_regprocedure('private.phone_digits(text)') is null then raise exception 'private.phone_digits is gone'; end if;
 if private.phone_digits('+44 7700 900941') is distinct from '447700900941' then raise exception 'private.phone_digits changed'; end if;
 foreach v_role in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(v_role, 'private.phone_digits(text)', 'EXECUTE') then raise exception '% may execute private.phone_digits', v_role; end if;
 end loop;
 for r in select p.oid::regprocedure::text as signature from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public','private') and p.prokind in ('f','p')
   and pg_catalog.pg_get_functiondef(p.oid) ~ '(exchange_test_code|send_sms_hook|test_codes|test_mode_log|phone_mode)' loop
  raise exception '% still names a test-mode object', r.signature;
 end loop;
end $$;
rollback;
