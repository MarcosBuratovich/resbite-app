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
rollback;
