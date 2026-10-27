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
