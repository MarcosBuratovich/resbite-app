-- Phone key (docs/superpowers/specs/2026-10-29-phone-key-design.md). Synthetic identities only.
begin;
-- 1. the key and its variants
do $$ begin
 if private.phone_key('+5491112341234')<>'541112341234' then raise exception 'AR mobile 9 not dropped'; end if;
 if private.phone_key('+541112341234')<>'541112341234' then raise exception 'AR without 9 changed'; end if;
 if private.phone_key('5491112341234')<>'541112341234' then raise exception 'Digits-only AR mobile not keyed'; end if;
 if private.phone_key('+54 9 11 1234 1234')<>'541112341234' then raise exception 'Spaces not removed'; end if;
 if private.phone_key('+5493511234567')<>'543511234567' then raise exception 'Cordoba mobile not keyed'; end if;
 if private.phone_key('+13055550123')<>'13055550123' then raise exception 'US number changed'; end if;
 if private.phone_key('+447700900834')<>'447700900834' then raise exception 'UK number changed'; end if;
 if private.phone_key('549123456789')<>'549123456789' then raise exception '549 with nine digits must stay'; end if;
 if private.phone_key(null)<>'' or private.phone_key('abc')<>'' then raise exception 'Null and letters must give the empty string'; end if;
 if private.phone_variants('541112341234')<>array['541112341234','5491112341234'] then raise exception 'AR variants wrong'; end if;
 if private.phone_variants('447700900834')<>array['447700900834'] then raise exception 'UK variants wrong'; end if;
 if private.phone_variants('5491112341234')<>array['5491112341234'] then raise exception 'A 9 form is not a key: itself only'; end if;
end $$;
-- closed to clients
set local role authenticated;
do $$ begin
 begin perform private.phone_key('1'); raise exception 'authenticated ran phone_key';
 exception when insufficient_privilege or undefined_function then null; end;
end $$;
reset role;
-- 2. test mode stores and finds codes by key
update private.phone_mode set test_mode=true;
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values
 ('d2000000-0000-4000-8000-000000000001',null,null,'541112345678',now()),
 ('d2000000-0000-4000-8000-000000000002',null,null,'5491112349999',now());
set local role supabase_auth_admin;
do $$ begin
 if public.send_sms_hook('{"user":{"id":"d2000000-0000-4000-8000-000000000001","phone":"5491112345678"},"sms":{"otp":"123456"}}') <> '{}'::jsonb then raise exception 'Hook refused an AR mobile'; end if;
end $$;
reset role;
do $$ begin
 if (select phone from private.test_codes where otp='123456')<>'541112345678' then raise exception 'Code must be stored by key'; end if;
end $$;
set local role anon;
do $$ begin
 if public.exchange_test_code('+54 11 1234 5678','000000') is distinct from '123456' then raise exception 'No-9 form must find the code'; end if;
 if public.exchange_test_code('+54 9 11 1234 5678','000000') is distinct from '123456' then raise exception '9 form must find the code'; end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from private.test_mode_log where kind='exchanged' and user_id='d2000000-0000-4000-8000-000000000001')<>2 then raise exception 'The older account must be named as the holder through variants'; end if;
end $$;
-- 3. the invitation functions compare by key
-- d2..11 host (9 form), d2..12 contact On Resbite (older form), d2..13 invitee (9 form, no profile).
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values
 ('d2000000-0000-4000-8000-000000000011',null,null,'5491112340011',now()),
 ('d2000000-0000-4000-8000-000000000012',null,null,'541112340012',now()),
 ('d2000000-0000-4000-8000-000000000013',null,null,'5491199998888',now());
insert into public.profiles(id,display_name) values
 ('d2000000-0000-4000-8000-000000000011','Host'),('d2000000-0000-4000-8000-000000000012','Contact');
insert into private.beta_access(user_id,source) values
 ('d2000000-0000-4000-8000-000000000011','maintainer'),('d2000000-0000-4000-8000-000000000012','maintainer');
insert into private.app_sessions(user_id) values
 ('d2000000-0000-4000-8000-000000000011'),('d2000000-0000-4000-8000-000000000012');
insert into public.plans(id,owner_id,title,starts_at,time_zone,place_label,categories) values
 ('d2100000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000011','Picnic','2099-06-01 12:00+00','UTC','Park',array['community']);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000011","role":"authenticated"}',true);
do $$ declare r text[]; j jsonb; begin
 r := public.contacts_on_resbite(array['+54 9 11 1234 0012','+54 11 1234 0012','+54 9 11 9999 8888']);
 if r<>array['541112340012'] then raise exception 'Lookup must return the key once, found through variants'; end if;
 j := public.invite_contacts('d2100000-0000-4000-8000-000000000001', jsonb_build_array(
  jsonb_build_object('phone','+5491112340012','country','54','code',repeat('K',22)),
  jsonb_build_object('phone','+54 11 1234 0011','country','54','code',repeat('L',22)),
  jsonb_build_object('phone','+541199998888','country','54','code',repeat('M',22))));
 if j->0->>'kind'<>'app' or j->0->>'phone'<>'541112340012' then raise exception 'Holder not found by variants, or key not returned'; end if;
 if j->1->>'kind'<>'self' then raise exception 'The host''s own number in the other form is self'; end if;
 if j->2->>'kind'<>'link' or j->2->>'phone'<>'541199998888' then raise exception 'Link invitation not keyed'; end if;
 j := public.invite_contacts('d2100000-0000-4000-8000-000000000001', jsonb_build_array(
  jsonb_build_object('phone','+54 9 11 9999 8888','country','54','code',repeat('N',22))));
 if j->0->>'kind'<>'link' then raise exception 'Inviting the 9 form again is the same link'; end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from private.phone_invitations where plan_id='d2100000-0000-4000-8000-000000000001' and phone='541199998888')<>1 then raise exception 'One row per key'; end if;
 if (select count(*) from private.phone_invitations where plan_id='d2100000-0000-4000-8000-000000000001')<>1 then raise exception 'Only the link invitation is a row'; end if;
end $$;
set local role anon;
do $$ begin
 if not public.check_invited_number(repeat('N',22),'+5491199998888') then raise exception '9 form must match'; end if;
 if not public.check_invited_number(repeat('N',22),'+541199998888') then raise exception 'No-9 form must match'; end if;
 if public.check_invited_number(repeat('N',22),'+541199998889') then raise exception 'Another number matched'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000013","role":"authenticated"}',true);
do $$ begin
 perform public.answer_phone_invitation(repeat('N',22),'Juan','accepted','2026-10');
end $$;
reset role;
do $$ begin
 if (select user_id from private.phone_invitations where plan_id='d2100000-0000-4000-8000-000000000001' and phone='541199998888') is distinct from 'd2000000-0000-4000-8000-000000000013' then raise exception 'The invitee with the 9 form must be attached'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000011","role":"authenticated"}',true);
do $$ begin
 perform public.revoke_phone_invitation('d2100000-0000-4000-8000-000000000001','+54 9 11 9999 8888');
end $$;
reset role;
do $$ begin
 if (select revoked_at from private.phone_invitations where plan_id='d2100000-0000-4000-8000-000000000001' and phone='541199998888') is null then raise exception 'Revoking with the 9 form must revoke the key''s row'; end if;
end $$;
rollback;
