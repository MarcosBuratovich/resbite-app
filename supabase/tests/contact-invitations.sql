-- Contact invitations, host side (docs/superpowers/specs/2026-10-27-contact-invitations-design.md). Synthetic identities only.
-- Users d1..: 01 host, 02 other eligible user, 03 the "On Resbite" contact (201), 04 eligible but never used the app (202),
-- 05 an existing attendee (205), 06 not eligible.
begin;
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values
 ('d1000000-0000-4000-8000-000000000001',null,null,'447700900200',now()),
 ('d1000000-0000-4000-8000-000000000002',null,null,'447700900299',now()),
 ('d1000000-0000-4000-8000-000000000003',null,null,'447700900201',now()),
 ('d1000000-0000-4000-8000-000000000004',null,null,'447700900202',now()),
 ('d1000000-0000-4000-8000-000000000005',null,null,'447700900205',now()),
 ('d1000000-0000-4000-8000-000000000006',null,null,'447700900206',now());
insert into public.profiles(id,display_name) values
 ('d1000000-0000-4000-8000-000000000001','Host'),('d1000000-0000-4000-8000-000000000002','Other'),
 ('d1000000-0000-4000-8000-000000000003','Contact on Resbite'),('d1000000-0000-4000-8000-000000000004','Contact no app'),
 ('d1000000-0000-4000-8000-000000000005','Existing guest'),('d1000000-0000-4000-8000-000000000006','Not eligible');
insert into private.beta_access(user_id,source) values
 ('d1000000-0000-4000-8000-000000000001','maintainer'),('d1000000-0000-4000-8000-000000000002','maintainer'),
 ('d1000000-0000-4000-8000-000000000003','maintainer'),('d1000000-0000-4000-8000-000000000004','invitation'),
 ('d1000000-0000-4000-8000-000000000005','maintainer');
insert into private.app_sessions(user_id) values
 ('d1000000-0000-4000-8000-000000000001'),('d1000000-0000-4000-8000-000000000003'),('d1000000-0000-4000-8000-000000000005'),
 ('d1000000-0000-4000-8000-000000000006');
insert into public.plans(id,owner_id,title,starts_at,time_zone,place_label,categories) values
 ('d1100000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','Picnic','2099-06-01 12:00+00','UTC','Park',array['community']),
 ('d1100000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001','Cancelled picnic','2099-06-02 12:00+00','UTC','Park',array['community']);
update public.plans set status='cancelled' where id='d1100000-0000-4000-8000-000000000002';
insert into public.attendees(plan_id,user_id) values ('d1100000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000005');

-- lookup
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare r text[]; begin
 r := public.contacts_on_resbite(array['+44 7700 900201','447700900202','447700900203']);
 if r is distinct from array['447700900201'] then raise exception 'Lookup returned %', r; end if;
 -- the caller's own number is not returned; neither is a user who is not eligible
 r := public.contacts_on_resbite(array['447700900200','447700900206']);
 if coalesce(array_length(r,1),0)<>0 then raise exception 'Own or ineligible number returned: %', r; end if;
 begin perform public.contacts_on_resbite((select array_agg('4477009' || lpad(g::text,5,'0')) from generate_series(1,51) g)); raise exception '51 numbers allowed';
 exception when invalid_parameter_value then null; end;
end $$;
-- daily limit: 500 numbers per day (10 calls of 50 so far used 3 + 2; top up to exactly 500, then one more is refused)
do $$ declare i int; begin
 for i in 1..9 loop
  perform public.contacts_on_resbite((select array_agg('4477100' || lpad((i*100+g)::text,5,'0')) from generate_series(1,50) g));
 end loop;
 -- used so far: 3 + 2 + 450 = 455
 perform public.contacts_on_resbite((select array_agg('4477200' || lpad(g::text,5,'0')) from generate_series(1,45) g));
 begin perform public.contacts_on_resbite(array['447700900201']); raise exception 'The 501st number was allowed';
 exception when invalid_parameter_value then
  if sqlerrm<>'Try again tomorrow.' then raise exception 'Wrong message: %', sqlerrm; end if;
 end;
end $$;
-- The shared budget: invitations are charged to it too, and the day rolls over.
reset role;
do $$ begin
 if (select count from private.lookup_usage where user_id='d1000000-0000-4000-8000-000000000001')<>500 then raise exception '500 expected used'; end if;
 update private.lookup_usage set count=499 where user_id='d1000000-0000-4000-8000-000000000001';
end $$;
set local role authenticated;
do $$ begin
 begin perform public.invite_contacts('d1100000-0000-4000-8000-000000000001', jsonb_build_array(
   jsonb_build_object('phone','447700900201','country','44','code',repeat('A',22)),
   jsonb_build_object('phone','447700900202','country','44','code',repeat('A',22))));
  raise exception 'Invite past the daily budget allowed';
 exception when invalid_parameter_value then
  if sqlerrm<>'Try again tomorrow.' then raise exception 'Wrong message: %', sqlerrm; end if;
 end;
end $$;
reset role;
do $$ begin
 if exists(select 1 from private.phone_invitations) or exists(select 1 from private.notification_outbox where kind='invited')
  or (select count(*) from public.attendees where plan_id='d1100000-0000-4000-8000-000000000001')<>1 then raise exception 'Refused batch wrote something'; end if;
 if (select count from private.lookup_usage where user_id='d1000000-0000-4000-8000-000000000001')<>499 then raise exception 'Refused batch was charged'; end if;
 -- an invite of one fits and is charged
 update private.lookup_usage set count=499 where user_id='d1000000-0000-4000-8000-000000000001';
 -- the helper's day rollover resets the count
 update private.lookup_usage set day=day-1, count=500 where user_id='d1000000-0000-4000-8000-000000000001';
 perform private.charge_lookup('d1000000-0000-4000-8000-000000000001',7);
 if (select count from private.lookup_usage where user_id='d1000000-0000-4000-8000-000000000001')<>7
  or (select day from private.lookup_usage where user_id='d1000000-0000-4000-8000-000000000001')<>(now() at time zone 'utc')::date then raise exception 'Day rollover should reset the count'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000006","role":"authenticated"}',true);
do $$ begin
 begin perform public.contacts_on_resbite(array['447700900201']); raise exception 'Ineligible caller looked up';
 exception when insufficient_privilege then null; end;
end $$;

-- invite
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 r := public.invite_contacts('d1100000-0000-4000-8000-000000000001', jsonb_build_array(
  jsonb_build_object('phone','+44 7700 900201','country','44','code',repeat('A',22)),
  jsonb_build_object('phone','447700900202','country','44','code',repeat('A',22)),
  jsonb_build_object('phone','447700900200','country','44','code',repeat('B',22)),
  jsonb_build_object('phone','447700900205','country','44','code',repeat('C',22))));
 if (select array_agg(e->>'kind') from jsonb_array_elements(r) e) is distinct from array['app','link','self','already'] then raise exception 'Kinds were %', r; end if;
 if (select array_agg(e->>'phone') from jsonb_array_elements(r) e) is distinct from array['447700900201','447700900202','447700900200','447700900205'] then raise exception 'Phones were %', r; end if;
 end $$;
reset role;
do $$ begin
 if (select count(*) from public.attendees where plan_id='d1100000-0000-4000-8000-000000000001' and user_id='d1000000-0000-4000-8000-000000000003' and response='pending')<>1 then raise exception 'Pending attendee expected'; end if;
 if (select count(*) from private.notification_outbox where kind='invited' and recipient_id='d1000000-0000-4000-8000-000000000003' and actor_id='d1000000-0000-4000-8000-000000000001' and detail is null
   and dedupe_key='invited:d1100000-0000-4000-8000-000000000001:d1000000-0000-4000-8000-000000000003')<>1 then raise exception 'One invited outbox row expected'; end if;
 if (select count(*) from private.notification_outbox where kind='invited')<>1 then raise exception 'Only one invited row expected'; end if;
 if (select count(*) from private.phone_invitations where plan_id='d1100000-0000-4000-8000-000000000001')<>1 then raise exception 'Only the link invitation is stored'; end if;
 if (select code_hash from private.phone_invitations where phone='447700900202') is distinct from extensions.digest(repeat('A',22),'sha256') then raise exception 'Hash A expected'; end if;
 if (select country from private.phone_invitations where phone='447700900202')<>'44' then raise exception 'Country expected'; end if;
end $$;
-- Inviting again with another code keeps one row, replaces the hash and leaves the answer alone.
update private.phone_invitations set user_id='d1000000-0000-4000-8000-000000000004', answered_at='2099-01-01 00:00+00' where phone='447700900202';
set local role authenticated;
do $$ declare r jsonb; begin
 r := public.invite_contacts('d1100000-0000-4000-8000-000000000001', jsonb_build_array(jsonb_build_object('phone','447700900202','country','44','code',repeat('B',22))));
 if r->0->>'kind'<>'link' then raise exception 'Link expected: %', r; end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from private.phone_invitations where phone='447700900202')<>1 then raise exception 'One row expected'; end if;
 if (select code_hash from private.phone_invitations where phone='447700900202') is distinct from extensions.digest(repeat('B',22),'sha256') then raise exception 'Hash B expected'; end if;
 if (select user_id from private.phone_invitations where phone='447700900202') is distinct from 'd1000000-0000-4000-8000-000000000004'::uuid
  or (select answered_at from private.phone_invitations where phone='447700900202') is null then raise exception 'Answer must be kept'; end if;
 end $$;
set local role authenticated;
do $$ begin
 begin perform public.invite_contacts('d1100000-0000-4000-8000-000000000001', jsonb_build_array(jsonb_build_object('phone','447700900202','country','44','code','short'))); raise exception 'Malformed code allowed';
 exception when invalid_parameter_value then null; end;
 begin perform public.invite_contacts('d1100000-0000-4000-8000-000000000001', (select jsonb_agg(jsonb_build_object('phone','4477009'||lpad(g::text,5,'0'),'country','44','code',repeat('A',22))) from generate_series(1,51) g)); raise exception '51 items allowed';
 exception when invalid_parameter_value then null; end;
 begin perform public.invite_contacts('d1100000-0000-4000-8000-000000000002', jsonb_build_array(jsonb_build_object('phone','447700900202','country','44','code',repeat('A',22)))); raise exception 'Cancelled plan allowed';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 begin perform public.invite_contacts('d1100000-0000-4000-8000-000000000001', jsonb_build_array(jsonb_build_object('phone','447700900202','country','44','code',repeat('A',22)))); raise exception 'Non-owner invited';
 exception when insufficient_privilege then null; end;
 begin perform public.plan_phone_invitations('d1100000-0000-4000-8000-000000000001'); raise exception 'Non-owner listed';
 exception when insufficient_privilege then null; end;
 begin perform public.revoke_phone_invitation('d1100000-0000-4000-8000-000000000001','447700900202'); raise exception 'Non-owner revoked';
 exception when insufficient_privilege then null; end;
end $$;

-- list and revoke (user 04 has answered; give them an attendee row so the response shows)
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
reset role;
insert into public.attendees(plan_id,user_id,response) values ('d1100000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000004','accepted');
set local role authenticated;
do $$ declare r jsonb; begin
 r := public.plan_phone_invitations('d1100000-0000-4000-8000-000000000001');
 if jsonb_array_length(r)<>1 or r->0 <> '{"phone":"447700900202","country":"44","answered":true,"response":"accepted"}'::jsonb then raise exception 'List was %', r; end if;
end $$;
reset role;
update private.phone_invitations set user_id=null, answered_at=null where phone='447700900202';
delete from public.attendees where user_id='d1000000-0000-4000-8000-000000000004';
set local role authenticated;
do $$ declare r jsonb; begin
 r := public.plan_phone_invitations('d1100000-0000-4000-8000-000000000001');
 if r->0 <> '{"phone":"447700900202","country":"44","answered":false,"response":null}'::jsonb then raise exception 'Unanswered list was %', r; end if;
 perform public.revoke_phone_invitation('d1100000-0000-4000-8000-000000000001','447700900202');
 if public.plan_phone_invitations('d1100000-0000-4000-8000-000000000001') <> '[]'::jsonb then raise exception 'Revoked invitation still listed'; end if;
end $$;
reset role;
do $$ begin
 if (select code_hash from private.phone_invitations where phone='447700900202') is not null or (select revoked_at from private.phone_invitations where phone='447700900202') is null then raise exception 'Revoke incomplete'; end if;
end $$;
set local role authenticated;
do $$ begin
 -- inviting again after a revoke brings it back
 perform public.invite_contacts('d1100000-0000-4000-8000-000000000001', jsonb_build_array(jsonb_build_object('phone','447700900202','country','44','code',repeat('D',22))));
 if jsonb_array_length(public.plan_phone_invitations('d1100000-0000-4000-8000-000000000001'))<>1 then raise exception 'Re-invite not listed'; end if;
end $$;

-- revoking an answered invitation removes that guest
reset role;
update private.phone_invitations set user_id='d1000000-0000-4000-8000-000000000004', answered_at=now() where phone='447700900202';
insert into public.attendees(plan_id,user_id) values ('d1100000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000004');
set local role authenticated;
do $$ begin
 perform public.revoke_phone_invitation('d1100000-0000-4000-8000-000000000001','447700900202');
 if exists(select 1 from public.attendees where user_id='d1000000-0000-4000-8000-000000000004' and plan_id='d1100000-0000-4000-8000-000000000001') then raise exception 'Guest should be removed by revoke'; end if;
end $$;

-- remove_guest also revokes the phone invitation
reset role;
update private.phone_invitations set revoked_at=null, code_hash=extensions.digest(repeat('E',22),'sha256'), user_id='d1000000-0000-4000-8000-000000000004', answered_at=now() where phone='447700900202';
insert into public.attendees(plan_id,user_id) values ('d1100000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000004');
set local role authenticated;
do $$ begin
 perform public.remove_guest('d1100000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000004');
end $$;
reset role;
do $$ begin
 if exists(select 1 from public.attendees where user_id='d1000000-0000-4000-8000-000000000004' and plan_id='d1100000-0000-4000-8000-000000000001') then raise exception 'Guest not removed'; end if;
 if (select revoked_at from private.phone_invitations where phone='447700900202') is null or (select code_hash from private.phone_invitations where phone='447700900202') is not null then raise exception 'remove_guest must revoke the phone invitation'; end if;
end $$;

-- grants: anon cannot call any of the four
reset role;
set local role anon;
do $$ begin
 begin perform public.contacts_on_resbite(array['447700900201']); raise exception 'anon looked up';
 exception when insufficient_privilege then null; end;
 begin perform public.invite_contacts('d1100000-0000-4000-8000-000000000001','[]'::jsonb); raise exception 'anon invited';
 exception when insufficient_privilege then null; end;
 begin perform public.plan_phone_invitations('d1100000-0000-4000-8000-000000000001'); raise exception 'anon listed';
 exception when insufficient_privilege then null; end;
 begin perform public.revoke_phone_invitation('d1100000-0000-4000-8000-000000000001','447700900202'); raise exception 'anon revoked';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
-- the tables are closed to clients
do $$ declare r text; begin
 foreach r in array array['anon','authenticated','service_role'] loop
  if has_table_privilege(r,'private.phone_invitations','select') or has_table_privilege(r,'private.lookup_usage','select') then raise exception '% may read the tables', r; end if;
 end loop;
end $$;

-- Invitee side (plan 2, Task 2). Code A is the 202 invitation on the Picnic; F is the 207 invitation; G a cancelled event;
-- H a started event; I a revoked invitation. User 07 (207) has no profile and no grant; user 02 holds another confirmed number.
reset role;
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values
 ('d1000000-0000-4000-8000-000000000007',null,null,'447700900207',now());
insert into public.plans(id,owner_id,title,starts_at,time_zone,place_label,area,categories) values
 ('d1100000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000001','Started picnic','2099-06-03 12:00+00','UTC','Park','Town',array['community']);
update public.plans set starts_at='2020-01-01 12:00+00' where id='d1100000-0000-4000-8000-000000000003';
update public.plans set area='Riverside' where id='d1100000-0000-4000-8000-000000000001';
update private.phone_invitations set revoked_at=null, user_id=null, answered_at=null, code_hash=extensions.digest(repeat('A',22),'sha256'), check_count=0, check_window=null where phone='447700900202';
insert into private.phone_invitations(plan_id,phone,country,code_hash,invited_by) values
 ('d1100000-0000-4000-8000-000000000001','447700900207','44',extensions.digest(repeat('F',22),'sha256'),'d1000000-0000-4000-8000-000000000001'),
 ('d1100000-0000-4000-8000-000000000002','447700900202','44',extensions.digest(repeat('G',22),'sha256'),'d1000000-0000-4000-8000-000000000001'),
 ('d1100000-0000-4000-8000-000000000003','447700900202','44',extensions.digest(repeat('H',22),'sha256'),'d1000000-0000-4000-8000-000000000001'),
 ('d1100000-0000-4000-8000-000000000001','447700900203','44',null,'d1000000-0000-4000-8000-000000000001');
insert into private.phone_invitations(plan_id,phone,country,code_hash,invited_by,revoked_at) values
 ('d1100000-0000-4000-8000-000000000001','447700900204','44',extensions.digest(repeat('I',22),'sha256'),'d1000000-0000-4000-8000-000000000001',now());
update public.attendees set response='accepted' where plan_id='d1100000-0000-4000-8000-000000000001' and user_id='d1000000-0000-4000-8000-000000000003';

-- page: anon
set local role anon;
do $$ declare r jsonb; begin
 r := public.personal_invitation_page(repeat('A',22));
 if r->>'state'<>'open' or r->>'ending'<>'02' or r->>'country'<>'44' or r->>'host'<>'Host' or r->>'title'<>'Picnic' or r->>'area'<>'Riverside'
  or (r->>'going')::int<>1 or r->'image'->>'kind'<>'mark' then raise exception 'Open page was %', r; end if;
 if r::text like '%Park%' or r::text like '%place_label%' or r::text like '%447700900202%' or r::text like '%Contact on Resbite%' then raise exception 'Page leaks: %', r; end if;
 if public.personal_invitation_page(repeat('Z',22))<>'{"state":"inactive"}'::jsonb
  or public.personal_invitation_page('short')<>'{"state":"inactive"}'::jsonb
  or public.personal_invitation_page(null)<>'{"state":"inactive"}'::jsonb
  or public.personal_invitation_page(repeat('I',22))<>'{"state":"inactive"}'::jsonb then raise exception 'Unknown, malformed or revoked must be inactive'; end if;
 r := public.personal_invitation_page(repeat('G',22));
 if r<>'{"state":"cancelled","host":"Host","title":"Cancelled picnic"}'::jsonb then raise exception 'Cancelled was %', r; end if;
 r := public.personal_invitation_page(repeat('H',22));
 if r<>'{"state":"happened","host":"Host","title":"Started picnic"}'::jsonb then raise exception 'Started was %', r; end if;
end $$;

-- check: anon, 10 an hour
do $$ declare i int; begin
 if public.check_invited_number(repeat('A',22),'07700 900202') then raise exception 'Local-format number without a country matched'; end if;
 if not public.check_invited_number(repeat('A',22),'+447700900202') then raise exception 'Matching number refused'; end if;
 if public.check_invited_number(repeat('Z',22),'+447700900202') or public.check_invited_number(repeat('I',22),'+447700900204')
  or public.check_invited_number(repeat('G',22),'+447700900202') or public.check_invited_number(repeat('H',22),'+447700900202') then raise exception 'Inactive or closed invitation matched'; end if;
 for i in 3..10 loop perform public.check_invited_number(repeat('A',22),'+447700900299'); end loop;
 begin perform public.check_invited_number(repeat('A',22),'+447700900202'); raise exception 'The 11th check was allowed';
 exception when invalid_parameter_value then
  if sqlerrm<>'Too many tries. Try again later.' then raise exception 'Wrong message: %', sqlerrm; end if;
 end;
end $$;
reset role;
do $$ begin
 if (select check_count from private.phone_invitations where code_hash=extensions.digest(repeat('A',22),'sha256'))<>10 then raise exception '10 checks expected'; end if;
 -- an hour later the window starts again
 update private.phone_invitations set check_window=now()-interval '61 minutes' where code_hash=extensions.digest(repeat('A',22),'sha256');
end $$;
set local role anon;
do $$ begin
 if not public.check_invited_number(repeat('A',22),'+447700900202') then raise exception 'New window should allow a check'; end if;
 begin perform public.my_phone_invitation(repeat('A',22)); raise exception 'anon my_phone_invitation';
 exception when insufficient_privilege then null; end;
 begin perform public.answer_phone_invitation(repeat('F',22),'Sam','accepted','2026-10'); raise exception 'anon answered';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if (select check_count from private.phone_invitations where code_hash=extensions.digest(repeat('A',22),'sha256'))<>1 then raise exception 'Window reset expected'; end if;
end $$;

-- answer: refusals first
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 begin perform public.answer_phone_invitation(repeat('F',22),'Sam','accepted','2026-10'); raise exception 'Forwarded link answered by another number';
 exception when insufficient_privilege then if sqlerrm<>'That isn''t the invited number.' then raise exception 'Wrong message: %', sqlerrm; end if; end;
end $$;
reset role;
do $$ begin
 if exists(select 1 from private.phone_invitations where user_id is not null and phone='447700900207') or exists(select 1 from public.attendees where user_id='d1000000-0000-4000-8000-000000000002') then raise exception 'Refused answer wrote something'; end if;
 update auth.users set phone_confirmed_at=null where id='d1000000-0000-4000-8000-000000000007';
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000007","role":"authenticated"}',true);
do $$ begin
 begin perform public.answer_phone_invitation(repeat('F',22),'Sam','accepted','2026-10'); raise exception 'Unconfirmed phone answered';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
update auth.users set phone_confirmed_at=now() where id='d1000000-0000-4000-8000-000000000007';
set local role authenticated;
do $$ begin
 begin perform public.answer_phone_invitation(repeat('I',22),'Sam','accepted','2026-10'); raise exception 'Revoked answered';
 exception when insufficient_privilege then if sqlerrm<>'Invitation unavailable' then raise exception 'Revoked refused for the wrong reason: %', sqlerrm; end if; end;
 begin perform public.answer_phone_invitation(repeat('Z',22),'Sam','accepted','2026-10'); raise exception 'Unknown answered';
 exception when insufficient_privilege then null; end;
 begin perform public.answer_phone_invitation(repeat('F',22),'Sam','nope','2026-10'); raise exception 'Bad response allowed';
 exception when invalid_parameter_value then null; end;
 begin perform public.answer_phone_invitation(repeat('F',22),'Sam','accepted','2026'); raise exception 'Bad terms allowed';
 exception when invalid_parameter_value then null; end;
 begin perform public.answer_phone_invitation(repeat('F',22),'  ','accepted','2026-10'); raise exception 'Empty name allowed';
 exception when invalid_parameter_value then null; end;
 begin perform public.answer_phone_invitation(repeat('F',22),repeat('x',81),'accepted','2026-10'); raise exception 'Long name allowed';
 exception when invalid_parameter_value then null; end;
end $$;
reset role;
do $$ begin
 if exists(select 1 from private.age_attestations where user_id='d1000000-0000-4000-8000-000000000007') or exists(select 1 from public.profiles where id='d1000000-0000-4000-8000-000000000007') or exists(select 1 from private.beta_access where user_id='d1000000-0000-4000-8000-000000000007') then raise exception 'Refused answers wrote something'; end if;
end $$;

-- answer: the invitee answers
set local role authenticated;
do $$ declare r jsonb; begin
 r := public.answer_phone_invitation(repeat('F',22),' Sam ','accepted','2026-10');
 if r<>jsonb_build_object('response','accepted','plan_id','d1100000-0000-4000-8000-000000000001') then raise exception 'Answer returned %', r; end if;
end $$;
reset role;
do $$ begin
 if (select terms_version from private.age_attestations where user_id='d1000000-0000-4000-8000-000000000007')<>'2026-10' then raise exception 'Attestation expected'; end if;
 if (select source from private.beta_access where user_id='d1000000-0000-4000-8000-000000000007')<>'invitation' then raise exception 'Invitation grant expected'; end if;
 if (select display_name from public.profiles where id='d1000000-0000-4000-8000-000000000007')<>'Sam' then raise exception 'Profile Sam expected'; end if;
 if (select response||version from public.attendees where plan_id='d1100000-0000-4000-8000-000000000001' and user_id='d1000000-0000-4000-8000-000000000007')<>'accepted1' then raise exception 'Accepted attendee expected'; end if;
 if (select user_id from private.phone_invitations where phone='447700900207') is distinct from 'd1000000-0000-4000-8000-000000000007' or (select answered_at from private.phone_invitations where phone='447700900207') is null then raise exception 'Invitation not marked answered'; end if;
 if (select count(*) from private.notification_outbox where kind='rsvp' and recipient_id='d1000000-0000-4000-8000-000000000001' and actor_id='d1000000-0000-4000-8000-000000000007' and detail='accepted')<>1 then raise exception 'One rsvp row expected'; end if;
 if not private.user_eligible('d1000000-0000-4000-8000-000000000007') then raise exception 'Invitee should be eligible'; end if;
end $$;
set local role authenticated;
do $$ begin
 perform public.answer_phone_invitation(repeat('F',22),'Other name','declined','not-checked');
end $$;
reset role;
do $$ begin
 if (select response||version from public.attendees where plan_id='d1100000-0000-4000-8000-000000000001' and user_id='d1000000-0000-4000-8000-000000000007')<>'declined2' then raise exception 'Declined, version 2 expected'; end if;
 if (select display_name from public.profiles where id='d1000000-0000-4000-8000-000000000007')<>'Sam' then raise exception 'Profile must stay'; end if;
 if (select count(*) from private.notification_outbox where kind='rsvp' and actor_id='d1000000-0000-4000-8000-000000000007')<>2 then raise exception 'Second rsvp row expected'; end if;
end $$;
-- maybe is an answer too
set local role authenticated;
do $$ begin
 perform public.answer_phone_invitation(repeat('F',22),null,'maybe',null);
 if (select response from public.attendees where plan_id='d1100000-0000-4000-8000-000000000001' and user_id='d1000000-0000-4000-8000-000000000007')<>'maybe' then raise exception 'Maybe expected'; end if;
end $$;

-- the same answer again is quiet: same version, no second notice
reset role;
create temp table t_before as select (select version from public.attendees where plan_id='d1100000-0000-4000-8000-000000000001' and user_id='d1000000-0000-4000-8000-000000000007') v,
 (select count(*) from private.notification_outbox where kind='rsvp' and actor_id='d1000000-0000-4000-8000-000000000007') n;
grant select on t_before to authenticated;
set local role authenticated;
do $$ declare r jsonb; begin
 r := public.answer_phone_invitation(repeat('F',22),null,'maybe',null);
 if r<>jsonb_build_object('response','maybe','plan_id','d1100000-0000-4000-8000-000000000001') then raise exception 'Repeat returned %', r; end if;
end $$;
reset role;
do $$ begin
 if (select version from public.attendees where plan_id='d1100000-0000-4000-8000-000000000001' and user_id='d1000000-0000-4000-8000-000000000007')<>(select v from t_before)
  or (select count(*) from private.notification_outbox where kind='rsvp' and actor_id='d1000000-0000-4000-8000-000000000007')<>(select n from t_before) then raise exception 'Repeated answer must change nothing'; end if;
end $$;
set local role authenticated;

-- my_phone_invitation
do $$ declare r jsonb; begin
 r := public.my_phone_invitation(repeat('F',22));
 if r->>'state'<>'open' or r->>'response'<>'maybe' then raise exception 'Attached caller got %', r; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 r := public.my_phone_invitation(repeat('F',22));
 if r->>'state'<>'open' or not (r ? 'response') or r->'response'<>'null'::jsonb then raise exception 'Other caller got %', r; end if;
end $$;

-- a ban, a cancelled event, a started event
reset role;
update private.beta_access set revoked_at=now() where user_id='d1000000-0000-4000-8000-000000000007';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000007","role":"authenticated"}',true);
do $$ begin
 begin perform public.answer_phone_invitation(repeat('F',22),'Sam','accepted','2026-10'); raise exception 'Banned grant answered';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
update private.beta_access set revoked_at=null where user_id='d1000000-0000-4000-8000-000000000007';
update private.phone_invitations set phone='447700900207' where code_hash=extensions.digest(repeat('G',22),'sha256');
update private.phone_invitations set phone='447700900207' where code_hash=extensions.digest(repeat('H',22),'sha256');
set local role authenticated;
do $$ begin
 begin perform public.answer_phone_invitation(repeat('G',22),'Sam','accepted','2026-10'); raise exception 'Cancelled answered';
 exception when insufficient_privilege then null; end;
 begin perform public.answer_phone_invitation(repeat('H',22),'Sam','accepted','2026-10'); raise exception 'Started answered';
 exception when insufficient_privilege then null; end;
end $$;
-- the owner cannot answer their own invitation
reset role;
update private.phone_invitations set phone='447700900200' where code_hash=extensions.digest(repeat('A',22),'sha256');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 begin perform public.answer_phone_invitation(repeat('A',22),'Host','accepted','2026-10'); raise exception 'Owner answered';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
-- an organizer who may no longer use the app gives no access through their links
update private.beta_access set revoked_at=now() where user_id='d1000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000007","role":"authenticated"}',true);
do $$ begin
 begin perform public.answer_phone_invitation(repeat('F',22),'Sam','accepted','2026-10'); raise exception 'Answered through an ineligible organizer';
 exception when insufficient_privilege then if sqlerrm<>'Invitation unavailable' then raise exception 'Wrong message: %', sqlerrm; end if; end;
end $$;
reset role;
do $$ begin
 if (select response from public.attendees where plan_id='d1100000-0000-4000-8000-000000000001' and user_id='d1000000-0000-4000-8000-000000000007')<>'maybe' then raise exception 'Refused answer changed the attendee'; end if;
 update private.beta_access set revoked_at=null where user_id='d1000000-0000-4000-8000-000000000001';
end $$;
-- an account whose email is disabled on the roster gets no new access
delete from private.beta_access where user_id='d1000000-0000-4000-8000-000000000007';
delete from public.attendees where user_id='d1000000-0000-4000-8000-000000000007';
update auth.users set email='disabled@example.test' where id='d1000000-0000-4000-8000-000000000007';
insert into private.tester_roster(email,enabled) values ('disabled@example.test',false);
set local role authenticated;
do $$ begin
 begin perform public.answer_phone_invitation(repeat('F',22),'Sam','accepted','2026-10'); raise exception 'Disabled tester answered';
 exception when insufficient_privilege then if sqlerrm<>'Invitation unavailable' then raise exception 'Wrong message: %', sqlerrm; end if; end;
end $$;
reset role;
do $$ begin
 if exists(select 1 from private.beta_access where user_id='d1000000-0000-4000-8000-000000000007') or exists(select 1 from public.attendees where user_id='d1000000-0000-4000-8000-000000000007') then raise exception 'Disabled tester got access'; end if;
end $$;

-- Folding a web-only account (plan 2, Task 3). 10 answered on the web: a place on the Picnic (through the J invitation)
-- and on the Supper, where 11 already is, an 18+ tick and an invitation grant. 11 is an email account with a profile and
-- nothing else. 12 is a web-only account whose grant was revoked (a ban), folded into 13, an email account with a live
-- grant and no profile yet. 14 has used the app; 15 organizes an event; 16 is a web-only guest on 11's own event.
reset role;
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values
 ('d1000000-0000-4000-8000-000000000010',null,null,'447700900210',now()),
 ('d1000000-0000-4000-8000-000000000011','fold-into@example.test',now(),null,null),
 ('d1000000-0000-4000-8000-000000000012',null,null,'447700900212',now()),
 ('d1000000-0000-4000-8000-000000000013','fold-banned@example.test',now(),null,null),
 ('d1000000-0000-4000-8000-000000000014',null,null,'447700900214',now()),
 ('d1000000-0000-4000-8000-000000000015',null,null,'447700900215',now()),
 ('d1000000-0000-4000-8000-000000000016',null,null,'447700900216',now());
insert into public.profiles(id,display_name) values
 ('d1000000-0000-4000-8000-000000000010','Web Sam'),('d1000000-0000-4000-8000-000000000011','Email Ana'),
 ('d1000000-0000-4000-8000-000000000012','Web Lee'),('d1000000-0000-4000-8000-000000000014','App Kim'),
 ('d1000000-0000-4000-8000-000000000015','Web Host'),('d1000000-0000-4000-8000-000000000016','Web Max');
insert into private.age_attestations(user_id,terms_version) values ('d1000000-0000-4000-8000-000000000010','2026-10');
insert into private.beta_access(user_id,source,revoked_at) values
 ('d1000000-0000-4000-8000-000000000010','invitation',null),('d1000000-0000-4000-8000-000000000012','invitation',now()),
 ('d1000000-0000-4000-8000-000000000013','maintainer',null);
insert into private.app_sessions(user_id) values ('d1000000-0000-4000-8000-000000000014');
insert into public.plans(id,owner_id,title,starts_at,time_zone,place_label,categories) values
 ('d1100000-0000-4000-8000-000000000010','d1000000-0000-4000-8000-000000000001','Supper','2099-06-04 19:00+00','UTC','Hall',array['community']),
 ('d1100000-0000-4000-8000-000000000011','d1000000-0000-4000-8000-000000000011','Ana''s walk','2099-06-05 10:00+00','UTC','Hill',array['community']),
 ('d1100000-0000-4000-8000-000000000015','d1000000-0000-4000-8000-000000000015','Web party','2099-06-06 20:00+00','UTC','Home',array['community']);
insert into public.attendees(plan_id,user_id,response) values
 ('d1100000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000010','accepted'),
 ('d1100000-0000-4000-8000-000000000010','d1000000-0000-4000-8000-000000000010','maybe'),
 ('d1100000-0000-4000-8000-000000000010','d1000000-0000-4000-8000-000000000011','declined'),
 ('d1100000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000012','accepted'),
 ('d1100000-0000-4000-8000-000000000011','d1000000-0000-4000-8000-000000000016','accepted');
insert into private.phone_invitations(plan_id,phone,country,code_hash,invited_by,user_id,answered_at) values
 ('d1100000-0000-4000-8000-000000000001','447700900210','44',extensions.digest(repeat('J',22),'sha256'),'d1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000010',now());

-- fold: only the service role may call it
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000011","role":"authenticated"}',true);
do $$ begin
 begin perform public.fold_web_account('d1000000-0000-4000-8000-000000000010','d1000000-0000-4000-8000-000000000011'); raise exception 'authenticated folded';
 exception when insufficient_privilege then null; end;
 begin perform private.fold_web_account('d1000000-0000-4000-8000-000000000010','d1000000-0000-4000-8000-000000000011'); raise exception 'authenticated folded through the private body';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.fold_web_account('d1000000-0000-4000-8000-000000000010','d1000000-0000-4000-8000-000000000011'); raise exception 'anon folded';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

-- fold: refusals (22023), which change nothing
set local role service_role;
do $$ begin
 begin perform public.fold_web_account('d1000000-0000-4000-8000-000000000010','d1000000-0000-4000-8000-000000000010'); raise exception 'Folded into itself';
 exception when invalid_parameter_value then null; end;
 begin perform public.fold_web_account('d1000000-0000-4000-8000-000000000014','d1000000-0000-4000-8000-000000000011'); raise exception 'Folded an account that used the app';
 exception when invalid_parameter_value then null; end;
 begin perform public.fold_web_account('d1000000-0000-4000-8000-000000000015','d1000000-0000-4000-8000-000000000011'); raise exception 'Folded an organizer';
 exception when invalid_parameter_value then null; end;
 begin perform public.fold_web_account('d1000000-0000-4000-8000-000000000010','d1000000-0000-4000-8000-0000000000ff'); raise exception 'Folded into a missing account';
 exception when invalid_parameter_value then null; end;
end $$;
reset role;
do $$ begin
 if (select count(*) from public.attendees where user_id='d1000000-0000-4000-8000-000000000010')<>2
  or not exists(select 1 from public.profiles where id='d1000000-0000-4000-8000-000000000014')
  or not exists(select 1 from public.profiles where id='d1000000-0000-4000-8000-000000000015') then raise exception 'A refused fold changed something'; end if;
end $$;

-- fold: the web-only account's places, invitation, tick and grant move; where the account is already on the event its
-- own answer stays; the web profile goes, and the user is left for the Edge Function to delete
set local role service_role;
do $$ declare r jsonb; begin
 r := public.fold_web_account('d1000000-0000-4000-8000-000000000010','d1000000-0000-4000-8000-000000000011');
 if r<>'{"moved_attendees":1}'::jsonb then raise exception 'Fold returned %', r; end if;
end $$;
reset role;
do $$ begin
 if (select response from public.attendees where plan_id='d1100000-0000-4000-8000-000000000001' and user_id='d1000000-0000-4000-8000-000000000011') is distinct from 'accepted'
  or (select response from public.attendees where plan_id='d1100000-0000-4000-8000-000000000010' and user_id='d1000000-0000-4000-8000-000000000011') is distinct from 'declined'
  then raise exception 'Places not folded'; end if;
 if exists(select 1 from public.attendees where user_id='d1000000-0000-4000-8000-000000000010') then raise exception 'Web places left behind'; end if;
 if (select user_id from private.phone_invitations where code_hash=extensions.digest(repeat('J',22),'sha256')) is distinct from 'd1000000-0000-4000-8000-000000000011' then raise exception 'Invitation not moved'; end if;
 if (select terms_version from private.age_attestations where user_id='d1000000-0000-4000-8000-000000000011') is distinct from '2026-10'
  or exists(select 1 from private.age_attestations where user_id='d1000000-0000-4000-8000-000000000010') then raise exception 'Tick not moved'; end if;
 if (select source from private.beta_access where user_id='d1000000-0000-4000-8000-000000000011' and revoked_at is null) is distinct from 'invitation'
  or exists(select 1 from private.beta_access where user_id='d1000000-0000-4000-8000-000000000010') then raise exception 'Grant not moved'; end if;
 if not private.user_eligible('d1000000-0000-4000-8000-000000000011') then raise exception 'The moved grant should let the account in'; end if;
 if private.user_eligible('d1000000-0000-4000-8000-000000000010') then raise exception 'The folded account still gets in'; end if;
 if exists(select 1 from public.profiles where id='d1000000-0000-4000-8000-000000000010') then raise exception 'Web profile not deleted'; end if;
 if (select display_name from public.profiles where id='d1000000-0000-4000-8000-000000000011') is distinct from 'Email Ana' then raise exception 'The account''s own name changed'; end if;
 if not exists(select 1 from auth.users where id='d1000000-0000-4000-8000-000000000010') then raise exception 'The fold deleted the user'; end if;
end $$;

-- fold: again, and once the user is deleted, moves nothing
set local role service_role;
do $$ declare r jsonb; begin
 r := public.fold_web_account('d1000000-0000-4000-8000-000000000010','d1000000-0000-4000-8000-000000000011');
 if r<>'{"moved_attendees":0}'::jsonb then raise exception 'Second fold returned %', r; end if;
end $$;
reset role;
delete from auth.users where id='d1000000-0000-4000-8000-000000000010';
set local role service_role;
do $$ declare r jsonb; begin
 r := public.fold_web_account('d1000000-0000-4000-8000-000000000010','d1000000-0000-4000-8000-000000000011');
 if r<>'{"moved_attendees":0}'::jsonb then raise exception 'Fold of a deleted account returned %', r; end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from public.attendees where user_id='d1000000-0000-4000-8000-000000000011')<>2
  or (select source from private.beta_access where user_id='d1000000-0000-4000-8000-000000000011' and revoked_at is null) is distinct from 'invitation'
  then raise exception 'A repeated fold changed the account'; end if;
end $$;

-- fold: a ban on the web account carries over to a live grant, and an account with no profile yet takes the web name
set local role service_role;
do $$ declare r jsonb; begin
 r := public.fold_web_account('d1000000-0000-4000-8000-000000000012','d1000000-0000-4000-8000-000000000013');
 if r<>'{"moved_attendees":1}'::jsonb then raise exception 'Banned fold returned %', r; end if;
end $$;
reset role;
do $$ begin
 if (select revoked_at from private.beta_access where user_id='d1000000-0000-4000-8000-000000000013') is null then raise exception 'The ban did not carry over'; end if;
 if (select revoked_at from private.beta_access where user_id='d1000000-0000-4000-8000-000000000012') is null then raise exception 'The web account lost its ban'; end if;
 if (select display_name from public.profiles where id='d1000000-0000-4000-8000-000000000013') is distinct from 'Web Lee' then raise exception 'The web name did not carry over'; end if;
 if (select response from public.attendees where plan_id='d1100000-0000-4000-8000-000000000001' and user_id='d1000000-0000-4000-8000-000000000013') is distinct from 'accepted' then raise exception 'Place not moved to the new profile'; end if;
end $$;

-- fold: a web place on the account's own event is dropped, not turned into the organizer's own place
set local role service_role;
do $$ declare r jsonb; begin
 r := public.fold_web_account('d1000000-0000-4000-8000-000000000016','d1000000-0000-4000-8000-000000000011');
 if r<>'{"moved_attendees":0}'::jsonb then raise exception 'Organizer fold returned %', r; end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from public.attendees where plan_id='d1100000-0000-4000-8000-000000000011') then raise exception 'The organizer became their own guest'; end if;
end $$;

-- fold: what doesn't move is deleted, so the folded account gets nothing back if its user outlives the fold. 17 is a
-- web-only account with a live grant and its own tick, folded into 11, which has both already.
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values
 ('d1000000-0000-4000-8000-000000000017',null,null,'447700900217',now());
insert into public.profiles(id,display_name) values ('d1000000-0000-4000-8000-000000000017','Web Jo');
insert into private.age_attestations(user_id,terms_version) values ('d1000000-0000-4000-8000-000000000017','2026-09');
insert into private.beta_access(user_id,source) values ('d1000000-0000-4000-8000-000000000017','invitation');
set local role service_role;
do $$ begin perform public.fold_web_account('d1000000-0000-4000-8000-000000000017','d1000000-0000-4000-8000-000000000011'); end $$;
reset role;
do $$ begin
 if exists(select 1 from private.beta_access where user_id='d1000000-0000-4000-8000-000000000017')
  or exists(select 1 from private.age_attestations where user_id='d1000000-0000-4000-8000-000000000017') then raise exception 'The folded account kept its grant or tick'; end if;
 if private.user_eligible('d1000000-0000-4000-8000-000000000017') then raise exception 'The folded account still gets in before its user is deleted'; end if;
 if (select terms_version from private.age_attestations where user_id='d1000000-0000-4000-8000-000000000011') is distinct from '2026-10' then raise exception 'The account''s own tick changed'; end if;
end $$;

-- fold: a tester whose roster entry is disabled gets the answers and the tick, but no live grant. 19 is a web-only
-- account with a live grant, folded into 18, an email account disabled on the roster.
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values
 ('d1000000-0000-4000-8000-000000000018','fold-disabled@example.test',now(),null,null),
 ('d1000000-0000-4000-8000-000000000019',null,null,'447700900219',now());
insert into public.profiles(id,display_name) values
 ('d1000000-0000-4000-8000-000000000018','Disabled Dee'),('d1000000-0000-4000-8000-000000000019','Web Ray');
insert into private.tester_roster(email,enabled) values ('fold-disabled@example.test',false);
insert into private.age_attestations(user_id,terms_version) values ('d1000000-0000-4000-8000-000000000019','2026-10');
insert into private.beta_access(user_id,source) values ('d1000000-0000-4000-8000-000000000019','invitation');
insert into public.attendees(plan_id,user_id,response) values
 ('d1100000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000019','accepted');
set local role service_role;
do $$ declare r jsonb; begin
 r := public.fold_web_account('d1000000-0000-4000-8000-000000000019','d1000000-0000-4000-8000-000000000018');
 if r<>'{"moved_attendees":1}'::jsonb then raise exception 'Disabled fold returned %', r; end if;
end $$;
reset role;
do $$ begin
 if (select response from public.attendees where plan_id='d1100000-0000-4000-8000-000000000001' and user_id='d1000000-0000-4000-8000-000000000018') is distinct from 'accepted'
  or (select terms_version from private.age_attestations where user_id='d1000000-0000-4000-8000-000000000018') is distinct from '2026-10' then raise exception 'The disabled tester''s answer or tick did not move'; end if;
 if exists(select 1 from private.beta_access where user_id in ('d1000000-0000-4000-8000-000000000018','d1000000-0000-4000-8000-000000000019')) then raise exception 'A live grant survived for a disabled tester'; end if;
 if private.user_eligible('d1000000-0000-4000-8000-000000000018') then raise exception 'The fold let a disabled tester in'; end if;
 if private.user_eligible('d1000000-0000-4000-8000-000000000019') then raise exception 'The folded account still gets in'; end if;
end $$;

-- fold: a ban is copied to an account with no grant and stays on the web account, so a web user that outlives the
-- fold still can't join by a link. 20 is a banned web-only account, folded into 21, an email account with no grant;
-- the Picnic has an event link.
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values
 ('d1000000-0000-4000-8000-000000000020',null,null,'447700900220',now()),
 ('d1000000-0000-4000-8000-000000000021','fold-plain@example.test',now(),null,null);
insert into public.profiles(id,display_name) values
 ('d1000000-0000-4000-8000-000000000020','Web Pat'),('d1000000-0000-4000-8000-000000000021','Email Bo');
insert into private.beta_access(user_id,source,revoked_at) values ('d1000000-0000-4000-8000-000000000020','invitation',now());
insert into private.plan_links(plan_id,code) values ('d1100000-0000-4000-8000-000000000001',repeat('P',22));
set local role service_role;
do $$ declare r jsonb; begin
 r := public.fold_web_account('d1000000-0000-4000-8000-000000000020','d1000000-0000-4000-8000-000000000021');
 if r<>'{"moved_attendees":0}'::jsonb then raise exception 'Banned fold returned %', r; end if;
end $$;
reset role;
do $$ begin
 if (select revoked_at from private.beta_access where user_id='d1000000-0000-4000-8000-000000000020') is null then raise exception 'The web account lost its ban'; end if;
 if (select revoked_at from private.beta_access where user_id='d1000000-0000-4000-8000-000000000021') is null then raise exception 'The ban did not carry over to an account with no grant'; end if;
 if private.has_live_grant('d1000000-0000-4000-8000-000000000020') or private.user_eligible('d1000000-0000-4000-8000-000000000020') then raise exception 'The banned web account gets in'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000020","role":"authenticated"}',true);
do $$ begin
 begin perform public.join_by_link(repeat('P',22),'Web Pat','2026-10'); raise exception 'The banned web account joined by a link';
 exception when insufficient_privilege then if sqlerrm<>'Invitation unavailable' then raise exception 'Wrong refusal: %', sqlerrm; end if; end;
end $$;
-- the same link lets in a folded web account that was never banned (17, above): the refusal is the ban's
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000017","role":"authenticated"}',true);
do $$ begin perform public.join_by_link(repeat('P',22),'Web Jo','2026-10'); end $$;
reset role;
do $$ begin
 if exists(select 1 from public.attendees where user_id='d1000000-0000-4000-8000-000000000020')
  or exists(select 1 from private.beta_access where user_id='d1000000-0000-4000-8000-000000000020' and revoked_at is null) then raise exception 'The refused join wrote something'; end if;
 if not exists(select 1 from public.attendees where plan_id='d1100000-0000-4000-8000-000000000001' and user_id='d1000000-0000-4000-8000-000000000017') then raise exception 'The control join failed'; end if;
end $$;
rollback;
