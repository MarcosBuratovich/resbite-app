begin;
insert into auth.users(id,email,email_confirmed_at) values('71000000-0000-4000-8000-000000000001','ledger@resbite-test.invalid',now());
insert into auth.sessions(id,user_id,created_at) values('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001',now());
insert into private.tester_roster(email) values('ledger@resbite-test.invalid');
insert into public.profiles(id,display_name) values('71000000-0000-4000-8000-000000000001','Retain until activation');
do $$ begin
 if has_function_privilege('anon','public.prepare_deletion_intent(uuid,uuid,uuid,text,text)','EXECUTE')
 or has_function_privilege('authenticated','public.activate_deletion_intent(uuid,uuid,text,text,text)','EXECUTE')
 or has_table_privilege('authenticated','private.deletion_intent_reservations','SELECT') then raise exception 'Client privilege leak'; end if;
end $$;
set local role service_role;
do $$ declare first jsonb; again jsonb; activated jsonb; begin
 begin
  perform public.prepare_deletion_intent('71000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000009','73000000-0000-4000-8000-000000000001',repeat('a',64),'fixture-project');
  raise exception 'Missing proof accepted';
 exception when insufficient_privilege then null; end;
 first:=public.prepare_deletion_intent('71000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001',repeat('a',64),'fixture-project');
 again:=public.prepare_deletion_intent('71000000-0000-4000-8000-000000000001',null,'73000000-0000-4000-8000-000000000001',repeat('a',64),'fixture-project');
 if first<>again then raise exception 'Unstable reservation'; end if;
 if first ? 'recoveryToken' or first ? 'sessionId' or first ? 'email' then raise exception 'Sensitive ledger payload'; end if;
 begin
  perform public.prepare_deletion_intent('71000000-0000-4000-8000-000000000001',null,'73000000-0000-4000-8000-000000000001',repeat('b',64),'fixture-project');
  raise exception 'Receipt mismatch accepted';
 exception when invalid_parameter_value then null; end;
 begin
  perform public.activate_deletion_intent('71000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001',repeat('a',64),'fixture-project','wrong-time');
  raise exception 'Changed intent activated';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if exists(select 1 from private.account_deletion_jobs where user_id='71000000-0000-4000-8000-000000000001') then raise exception 'Preparation queued deletion'; end if;
 if (select display_name from public.profiles where id='71000000-0000-4000-8000-000000000001')<>'Retain until activation' then raise exception 'Premature redaction'; end if;
 if not exists(select 1 from private.tester_roster where email='ledger@resbite-test.invalid') then raise exception 'Premature access block'; end if;
end $$;
-- An already authorized durable intent must remain activatable after proof expiry.
update auth.sessions set created_at=now()-interval '1 hour' where id='72000000-0000-4000-8000-000000000001';
set local role service_role;
do $$ declare prepared jsonb; result jsonb; begin
 prepared:=public.prepare_deletion_intent('71000000-0000-4000-8000-000000000001',null,'73000000-0000-4000-8000-000000000001',repeat('a',64),'fixture-project');
 result:=public.activate_deletion_intent('71000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001',repeat('a',64),'fixture-project',prepared->>'requestedAt');
 if result->>'status'<>'queued' then raise exception 'Activation failed'; end if;
 if result<>public.activate_deletion_intent('71000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001',repeat('a',64),'fixture-project',prepared->>'requestedAt') then raise exception 'Retry changed job'; end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from private.account_deletion_jobs where user_id='71000000-0000-4000-8000-000000000001')<>1 then raise exception 'Duplicate job'; end if;
 if exists(select 1 from private.tester_roster where email='ledger@resbite-test.invalid') then raise exception 'Access not blocked'; end if;
 if (select display_name from public.profiles where id='71000000-0000-4000-8000-000000000001')<>'Deleted member' then raise exception 'Profile not redacted'; end if;
end $$;
rollback;
