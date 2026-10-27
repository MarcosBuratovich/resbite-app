-- Open-link approval (docs/superpowers/plans/2026-10-28-open-link-approval.md, Task 1): an answer through the open
-- event link becomes a request the host approves or declines. Synthetic identities only (prefix d2); one rolled-back
-- block.
-- Users d2…: 01 host, 02 Ana (phone only, nothing else), 03 an existing attendee, 04 Bea, 05 banned, 06 disabled on the
-- roster, 07 Cal, 08 a roster tester, 09 Leo (phone only, nothing else), 10 Dee, 11 Eve, 12 a revoked grant, 13 an
-- organizer who may no longer use the app, 14 a new account, 15 Fay, 16 Gus, 17 Hal (a grant holder), 18 Ida.
-- Codes: A the Picnic's live link, O its turned-off link, C a cancelled event, S a started one, Q the Quiz, I the
-- ineligible organizer's party, W the Walk.
begin;
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at,banned_until) values
 ('d2000000-0000-4000-8000-000000000001',null,null,'447700900401',now(),null),
 ('d2000000-0000-4000-8000-000000000002',null,null,'447700900402',now(),null),
 ('d2000000-0000-4000-8000-000000000003',null,null,'447700900403',now(),null),
 ('d2000000-0000-4000-8000-000000000004',null,null,'447700900404',now(),null),
 ('d2000000-0000-4000-8000-000000000005',null,null,'447700900405',now(),'2099-01-01 00:00+00'),
 ('d2000000-0000-4000-8000-000000000006','olr-disabled@resbite-test.invalid',null,'447700900406',now(),null),
 ('d2000000-0000-4000-8000-000000000007',null,null,'447700900407',now(),null),
 ('d2000000-0000-4000-8000-000000000008','olr-tester@resbite-test.invalid',now(),null,null,null),
 ('d2000000-0000-4000-8000-000000000009',null,null,'447700900409',now(),null),
 ('d2000000-0000-4000-8000-000000000010',null,null,'447700900410',now(),null),
 ('d2000000-0000-4000-8000-000000000011',null,null,'447700900411',now(),null),
 ('d2000000-0000-4000-8000-000000000012',null,null,'447700900412',now(),null),
 ('d2000000-0000-4000-8000-000000000013',null,null,'447700900413',now(),null),
 ('d2000000-0000-4000-8000-000000000014',null,null,'447700900414',now(),null),
 ('d2000000-0000-4000-8000-000000000015',null,null,'447700900415',now(),null),
 ('d2000000-0000-4000-8000-000000000016',null,null,'447700900416',now(),null),
 ('d2000000-0000-4000-8000-000000000017',null,null,'447700900417',now(),null),
 ('d2000000-0000-4000-8000-000000000018',null,null,'447700900418',now(),null);
insert into public.profiles(id,display_name) values
 ('d2000000-0000-4000-8000-000000000001','Host'),('d2000000-0000-4000-8000-000000000003','Guest'),
 ('d2000000-0000-4000-8000-000000000004','Bea'),('d2000000-0000-4000-8000-000000000005','Banned'),
 ('d2000000-0000-4000-8000-000000000006','Disabled'),('d2000000-0000-4000-8000-000000000007','Cal'),
 ('d2000000-0000-4000-8000-000000000008','Tester'),('d2000000-0000-4000-8000-000000000010','Dee'),
 ('d2000000-0000-4000-8000-000000000011','Eve'),('d2000000-0000-4000-8000-000000000012','Revoked'),
 ('d2000000-0000-4000-8000-000000000013','Ex host'),('d2000000-0000-4000-8000-000000000015','Fay'),
 ('d2000000-0000-4000-8000-000000000016','Gus'),('d2000000-0000-4000-8000-000000000017','Hal'),
 ('d2000000-0000-4000-8000-000000000018','Ida');
insert into private.age_attestations(user_id,terms_version)
 select ('d2000000-0000-4000-8000-0000000000'||n)::uuid,'2026-09' from unnest(array['04','05','06','07','08','10','11','12','15','16','17','18']) n;
insert into private.beta_access(user_id,source,revoked_at) values
 ('d2000000-0000-4000-8000-000000000001','maintainer',null),('d2000000-0000-4000-8000-000000000003','maintainer',null),
 ('d2000000-0000-4000-8000-000000000017','maintainer',null),('d2000000-0000-4000-8000-000000000012','maintainer',now());
insert into private.tester_roster(email,enabled) values ('olr-tester@resbite-test.invalid',true),('olr-disabled@resbite-test.invalid',false);
insert into public.plans(id,owner_id,title,starts_at,time_zone,place_label,area,categories) values
 ('d2100000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','Picnic','2099-06-01 12:00+00','UTC','Secret Park','Riverside',array['community']),
 ('d2100000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000001','Cancelled picnic','2099-06-02 12:00+00','UTC','Park','',array['community']),
 ('d2100000-0000-4000-8000-000000000003','d2000000-0000-4000-8000-000000000001','Started picnic','2099-06-03 12:00+00','UTC','Park','',array['community']),
 ('d2100000-0000-4000-8000-000000000004','d2000000-0000-4000-8000-000000000001','Quiz','2099-06-04 19:00+00','UTC','Pub','',array['community']),
 ('d2100000-0000-4000-8000-000000000005','d2000000-0000-4000-8000-000000000013','Ex host party','2099-06-05 19:00+00','UTC','Home','',array['community']),
 ('d2100000-0000-4000-8000-000000000006','d2000000-0000-4000-8000-000000000001','Walk','2099-06-06 10:00+00','UTC','Hill','',array['community']);
update public.plans set status='cancelled' where id='d2100000-0000-4000-8000-000000000002';
update public.plans set starts_at='2020-01-01 12:00+00' where id='d2100000-0000-4000-8000-000000000003';
insert into private.plan_links(plan_id,code,revoked_at) values
 ('d2100000-0000-4000-8000-000000000001',repeat('O',22),now()),
 ('d2100000-0000-4000-8000-000000000001',repeat('A',22),null),
 ('d2100000-0000-4000-8000-000000000002',repeat('C',22),null),
 ('d2100000-0000-4000-8000-000000000003',repeat('S',22),null),
 ('d2100000-0000-4000-8000-000000000004',repeat('Q',22),null),
 ('d2100000-0000-4000-8000-000000000005',repeat('I',22),null),
 ('d2100000-0000-4000-8000-000000000006',repeat('W',22),null);
insert into public.attendees(plan_id,user_id,response) values
 ('d2100000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000003','accepted');
create temporary table olr_codes(name text primary key, code text);
insert into olr_codes values ('A',repeat('A',22));
grant select, insert on olr_codes to authenticated, anon;

-- request: a phone-only account with no grant asks with a name and the tick. It gets a profile, the tick, a waiting
-- request and one notice to the host; no place on the event and no access.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 r := public.request_to_join(repeat('A',22),' Ana ','accepted','2026-10');
 if r is distinct from jsonb_build_object('state','waiting','plan_id','d2100000-0000-4000-8000-000000000001','response','accepted') then raise exception 'Request returned %', r; end if;
end $$;
reset role;
do $$ declare v private.join_requests; begin
 select * into v from private.join_requests where plan_id='d2100000-0000-4000-8000-000000000001' and user_id='d2000000-0000-4000-8000-000000000002';
 if v.status is distinct from 'waiting' or v.response is distinct from 'accepted' or v.decided_at is not null or v.created_at is null
  or v.plan_link_id is distinct from (select id from private.plan_links where code=repeat('A',22)) then raise exception 'Waiting request expected: %', row_to_json(v); end if;
 if (select display_name from public.profiles where id='d2000000-0000-4000-8000-000000000002') is distinct from 'Ana' then raise exception 'Profile Ana expected'; end if;
 if (select terms_version from private.age_attestations where user_id='d2000000-0000-4000-8000-000000000002') is distinct from '2026-10' then raise exception 'Attestation expected'; end if;
 if (select count(*) from private.notification_outbox where kind='join_request' and plan_id='d2100000-0000-4000-8000-000000000001'
   and recipient_id='d2000000-0000-4000-8000-000000000001' and actor_id='d2000000-0000-4000-8000-000000000002' and detail is null
   and dedupe_key='join:d2100000-0000-4000-8000-000000000001:d2000000-0000-4000-8000-000000000002:'||v.plan_link_id||':'||extract(epoch from v.created_at)) is distinct from 1 then
  raise exception 'One join_request notice to the host expected';
 end if;
 if (select count(*) from private.notification_outbox where actor_id='d2000000-0000-4000-8000-000000000002') is distinct from 1 then raise exception 'Only one notice expected'; end if;
 if exists(select 1 from public.attendees where user_id='d2000000-0000-4000-8000-000000000002') then raise exception 'A request made an attendee'; end if;
 if exists(select 1 from private.beta_access where user_id='d2000000-0000-4000-8000-000000000002') then raise exception 'A request made a grant'; end if;
 if private.user_eligible('d2000000-0000-4000-8000-000000000002') then raise exception 'A request made the account eligible'; end if;
end $$;
-- Asking again (Review Focus 1) changes the answer, needs no name or tick, keeps the waiting period and queues nothing.
-- now() is fixed inside this block, so Ana's first request and its notice are moved an hour back, as if made then.
update private.notification_outbox set dedupe_key='join:d2100000-0000-4000-8000-000000000001:d2000000-0000-4000-8000-000000000002:'
  ||(select id from private.plan_links where code=repeat('A',22))||':'||extract(epoch from now()-interval '1 hour')
 where kind='join_request' and actor_id='d2000000-0000-4000-8000-000000000002';
update private.join_requests set created_at=created_at-interval '1 hour' where user_id='d2000000-0000-4000-8000-000000000002';
set local role authenticated;
do $$ declare r jsonb; begin
 r := public.request_to_join(repeat('A',22),null,'maybe',null);
 if r is distinct from jsonb_build_object('state','waiting','plan_id','d2100000-0000-4000-8000-000000000001','response','maybe') then raise exception 'Second request returned %', r; end if;
end $$;
reset role;
do $$ begin
 if (select response from private.join_requests where user_id='d2000000-0000-4000-8000-000000000002') is distinct from 'maybe' then raise exception 'Second request did not change the answer'; end if;
 if (select count(*) from private.join_requests where user_id='d2000000-0000-4000-8000-000000000002') is distinct from 1 then raise exception 'Second request duplicated the row'; end if;
 if (select created_at from private.join_requests where user_id='d2000000-0000-4000-8000-000000000002') is distinct from now()-interval '1 hour' then raise exception 'Second request started a new waiting period'; end if;
 if (select count(*) from private.notification_outbox where actor_id='d2000000-0000-4000-8000-000000000002') is distinct from 1 then raise exception 'A repeated request queued another notice'; end if;
 if (select display_name from public.profiles where id='d2000000-0000-4000-8000-000000000002') is distinct from 'Ana' then raise exception 'The profile changed'; end if;
end $$;

-- request: the owner and an attendee are never turned into requests, from any of the event's links, live or not,
-- before or after the start.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 r := public.request_to_join(repeat('A',22),null,'accepted',null);
 if r is distinct from jsonb_build_object('state','owner','plan_id','d2100000-0000-4000-8000-000000000001','response',null) then raise exception 'Owner got %', r; end if;
 r := public.request_to_join(repeat('O',22),null,'accepted',null);
 if r->>'state' is distinct from 'owner' then raise exception 'Owner from a turned-off link got %', r; end if;
 r := public.request_to_join(repeat('S',22),null,'nope',null);
 if r is distinct from jsonb_build_object('state','owner','plan_id','d2100000-0000-4000-8000-000000000003','response',null) then raise exception 'Owner of a started event got %', r; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 r := public.request_to_join(repeat('A',22),null,'maybe',null);
 if r is distinct from jsonb_build_object('state','already','plan_id','d2100000-0000-4000-8000-000000000001','response','accepted') then raise exception 'Attendee got %', r; end if;
 r := public.request_to_join(repeat('O',22),null,'maybe',null);
 if r is distinct from jsonb_build_object('state','already','plan_id','d2100000-0000-4000-8000-000000000001','response','accepted') then raise exception 'Attendee from a turned-off link got %', r; end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from private.join_requests where user_id in ('d2000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000003'))
  or exists(select 1 from private.notification_outbox where actor_id in ('d2000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000003')) then
  raise exception 'The owner or an attendee wrote something';
 end if;
 if (select response from public.attendees where plan_id='d2100000-0000-4000-8000-000000000001' and user_id='d2000000-0000-4000-8000-000000000003') is distinct from 'accepted' then raise exception 'The attendee''s answer changed'; end if;
end $$;

-- request: refusals.
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
do $$ begin
 begin perform public.request_to_join(repeat('A',22),'Nobody','accepted','2026-10'); raise exception 'No session requested';
 exception when others then if sqlstate is distinct from '42501' or sqlerrm is distinct from 'Sign-in required' then raise; end if; end;
end $$;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
do $$ begin
 begin perform public.request_to_join(repeat('A',22),null,'accepted',null); raise exception 'A banned account requested';
 exception when others then if sqlstate is distinct from '42501' or sqlerrm is distinct from 'Sign-in required' then raise; end if; end;
end $$;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000012","role":"authenticated"}',true);
do $$ begin
 begin perform public.request_to_join(repeat('A',22),null,'accepted',null); raise exception 'A revoked grant requested';
 exception when others then if sqlstate is distinct from '42501' or sqlerrm is distinct from 'Invitation unavailable' then raise; end if; end;
end $$;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000006","role":"authenticated"}',true);
do $$ begin
 begin perform public.request_to_join(repeat('A',22),null,'accepted',null); raise exception 'A disabled roster email requested';
 exception when others then if sqlstate is distinct from '42501' or sqlerrm is distinct from 'Invitation unavailable' then raise; end if; end;
end $$;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ declare c text; begin
 foreach c in array array[repeat('O',22),repeat('C',22),repeat('S',22),repeat('I',22),repeat('Z',22),'short'] loop
  begin perform public.request_to_join(c,null,'accepted',null); raise exception 'Requested through %', c;
  exception when others then if sqlstate is distinct from '42501' or sqlerrm is distinct from 'Invitation unavailable' then raise; end if; end;
 end loop;
 begin perform public.request_to_join(null,null,'accepted',null); raise exception 'Requested with no code';
 exception when others then if sqlstate is distinct from '42501' or sqlerrm is distinct from 'Invitation unavailable' then raise; end if; end;
 begin perform public.request_to_join(repeat('A',22),null,'nope',null); raise exception 'Bad response allowed';
 exception when others then if sqlstate is distinct from '22023' or sqlerrm is distinct from 'Invalid response' then raise; end if; end;
 begin perform public.request_to_join(repeat('A',22),null,null,null); raise exception 'No response allowed';
 exception when others then if sqlstate is distinct from '22023' or sqlerrm is distinct from 'Invalid response' then raise; end if; end;
 begin perform public.request_to_join(repeat('A',22),null,'withdrawn',null); raise exception 'Withdrawn allowed';
 exception when others then if sqlstate is distinct from '22023' or sqlerrm is distinct from 'Invalid response' then raise; end if; end;
end $$;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000014","role":"authenticated"}',true);
do $$ begin
 begin perform public.request_to_join(repeat('A',22),'New','accepted',null); raise exception 'Missing tick allowed';
 exception when others then if sqlstate is distinct from '22023' or sqlerrm is distinct from 'Age confirmation required' then raise; end if; end;
 begin perform public.request_to_join(repeat('A',22),'New','accepted','2026'); raise exception 'Bad terms allowed';
 exception when others then if sqlstate is distinct from '22023' or sqlerrm is distinct from 'Age confirmation required' then raise; end if; end;
 begin perform public.request_to_join(repeat('A',22),'  ','accepted','2026-10'); raise exception 'Blank name allowed';
 exception when others then if sqlstate is distinct from '22023' or sqlerrm is distinct from 'Name required' then raise; end if; end;
 begin perform public.request_to_join(repeat('A',22),repeat('x',81),'accepted','2026-10'); raise exception 'Long name allowed';
 exception when others then if sqlstate is distinct from '22023' or sqlerrm is distinct from 'Name required' then raise; end if; end;
end $$;
reset role;
-- An organizer who may no longer use the app: refused even for someone with a grant.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000017","role":"authenticated"}',true);
do $$ begin
 begin perform public.request_to_join(repeat('I',22),null,'accepted',null); raise exception 'Requested through an ineligible organizer';
 exception when others then if sqlstate is distinct from '42501' or sqlerrm is distinct from 'Invitation unavailable' then raise; end if; end;
end $$;
reset role;
do $$ begin
 if exists(select 1 from private.join_requests where user_id is distinct from 'd2000000-0000-4000-8000-000000000002') then raise exception 'A refused request stored a request'; end if;
 if exists(select 1 from public.profiles where id='d2000000-0000-4000-8000-000000000014')
  or exists(select 1 from private.age_attestations where user_id='d2000000-0000-4000-8000-000000000014') then raise exception 'A refused request stored a profile or a tick'; end if;
 if exists(select 1 from private.notification_outbox where actor_id is distinct from 'd2000000-0000-4000-8000-000000000002') then raise exception 'A refused request queued a notice'; end if;
end $$;

-- change_join_answer: the waiting screen changes the answer by plan; nothing is queued.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 r := public.change_join_answer('d2100000-0000-4000-8000-000000000001','accepted');
 if r is distinct from '{"status":"waiting","response":"accepted"}'::jsonb then raise exception 'Change returned %', r; end if;
 r := public.change_join_answer('d2100000-0000-4000-8000-000000000001','maybe');
 if r is distinct from '{"status":"waiting","response":"maybe"}'::jsonb then raise exception 'Change to maybe returned %', r; end if;
 begin perform public.change_join_answer('d2100000-0000-4000-8000-000000000001','nope'); raise exception 'Bad change allowed';
 exception when others then if sqlstate is distinct from '22023' or sqlerrm is distinct from 'Invalid response' then raise; end if; end;
 -- Another user's event, where the caller has no request.
 begin perform public.change_join_answer('d2100000-0000-4000-8000-000000000004','accepted'); raise exception 'Changed an answer with no request';
 exception when others then if sqlstate is distinct from '22023' or sqlerrm is distinct from 'Request already decided' then raise; end if; end;
 r := public.change_join_answer('d2100000-0000-4000-8000-000000000001','accepted');
end $$;
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
do $$ begin
 begin perform public.change_join_answer('d2100000-0000-4000-8000-000000000001','accepted'); raise exception 'No session changed an answer';
 exception when others then if sqlstate is distinct from '42501' or sqlerrm is distinct from 'Sign-in required' then raise; end if; end;
end $$;
reset role;
do $$ begin
 if (select response from private.join_requests where user_id='d2000000-0000-4000-8000-000000000002') is distinct from 'accepted' then raise exception 'Changed answer not stored'; end if;
 if (select count(*) from private.notification_outbox where actor_id='d2000000-0000-4000-8000-000000000002') is distinct from 1 then raise exception 'Changing the answer queued a notice'; end if;
end $$;

-- my_join_request / my_join_requests: the caller's own status and answer, never the place.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 r := public.my_join_request(repeat('A',22));
 if r->>'state' is distinct from 'open' or r->>'title' is distinct from 'Picnic' or r->>'host' is distinct from 'Host' or r->>'area' is distinct from 'Riverside'
  or r->'request' is distinct from '{"status":"waiting","response":"accepted"}'::jsonb or r->'member' is distinct from 'null'::jsonb then raise exception 'my_join_request was %', r; end if;
 if r::text like '%Secret Park%' or r::text like '%place%' then raise exception 'my_join_request leaks the place: %', r; end if;
 r := public.my_join_requests();
 if jsonb_array_length(r) is distinct from 1 or r->0->>'plan_id' is distinct from 'd2100000-0000-4000-8000-000000000001' or r->0->>'title' is distinct from 'Picnic' or r->0->>'host' is distinct from 'Host'
  or r->0->>'area' is distinct from 'Riverside' or r->0->'image' is distinct from '{"kind":"mark","ref":""}'::jsonb or r->0->>'response' is distinct from 'accepted' or r->0->>'status' is distinct from 'waiting'
  or r->0->>'time_zone' is distinct from 'UTC' or (r->0->>'starts_at')::timestamptz is distinct from '2099-06-01 12:00+00' or r->0->'ends_at' is distinct from 'null'::jsonb then raise exception 'my_join_requests was %', r; end if;
 if (select array_agg(k order by k) from jsonb_object_keys(r->0) k)
   is distinct from array['area','ends_at','host','image','plan_id','response','starts_at','status','time_zone','title'] then raise exception 'my_join_requests keys were %', r; end if;
 if r::text like '%Secret Park%' or r::text like '%place%' then raise exception 'my_join_requests leaks the place: %', r; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 r := public.my_join_request(repeat('A',22));
 if r->>'state' is distinct from 'open' or r->'request' is distinct from 'null'::jsonb or r->'member' is distinct from 'null'::jsonb then raise exception 'Another user''s request is visible: %', r; end if;
 if public.my_join_requests() is distinct from '[]'::jsonb then raise exception 'Another user''s request is listed'; end if;
 r := public.my_join_request(repeat('Z',22));
 if r is distinct from '{"state":"inactive","request":null,"member":null}'::jsonb then raise exception 'Unknown code gave %', r; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 r := public.my_join_request(repeat('A',22));
 if r->>'member' is distinct from 'owner' or r->'request' is distinct from 'null'::jsonb then raise exception 'Owner got %', r; end if;
 r := public.my_join_request(repeat('O',22));
 if r->>'state' is distinct from 'inactive' or r->>'member' is distinct from 'owner' then raise exception 'Owner from a turned-off link got %', r; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 r := public.my_join_request(repeat('A',22));
 if r->>'member' is distinct from 'attendee' or r->'request' is distinct from 'null'::jsonb then raise exception 'Attendee got %', r; end if;
end $$;
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
do $$ begin
 begin perform public.my_join_request(repeat('A',22)); raise exception 'No session read a request';
 exception when others then if sqlstate is distinct from '42501' or sqlerrm is distinct from 'Sign-in required' then raise; end if; end;
 begin perform public.my_join_requests(); raise exception 'No session listed requests';
 exception when others then if sqlstate is distinct from '42501' or sqlerrm is distinct from 'Sign-in required' then raise; end if; end;
end $$;

-- plan_join_requests: the host sees each waiting person's name, answer and the last two digits of their number.
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 r := public.plan_join_requests('d2100000-0000-4000-8000-000000000001');
 if jsonb_array_length(r) is distinct from 1 or r->0->>'user_id' is distinct from 'd2000000-0000-4000-8000-000000000002' or r->0->>'name' is distinct from 'Ana' or r->0->>'response' is distinct from 'accepted'
  or r->0->>'ending' is distinct from '02' or (r->0->>'created_at')::timestamptz is null then raise exception 'Host list was %', r; end if;
 if (select array_agg(k order by k) from jsonb_object_keys(r->0) k) is distinct from array['created_at','ending','name','response','user_id'] then raise exception 'Host list keys were %', r; end if;
 if public.plan_join_requests('d2100000-0000-4000-8000-000000000004') is distinct from '[]'::jsonb then raise exception 'An event with no requests listed some'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 begin perform public.plan_join_requests('d2100000-0000-4000-8000-000000000001'); raise exception 'A guest listed the requests';
 exception when insufficient_privilege then null; end;
 begin perform public.decide_join_request('d2100000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000002',true); raise exception 'A guest decided';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

-- decide: Bea asks too; the host approves Ana and declines Bea.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin perform public.request_to_join(repeat('A',22),null,'accepted',null); end $$;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 r := public.decide_join_request('d2100000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000002',true);
 if r is distinct from '{"status":"approved"}'::jsonb then raise exception 'Approve returned %', r; end if;
 begin perform public.decide_join_request('d2100000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000002',true); raise exception 'Approved twice';
 exception when others then if sqlstate is distinct from '22023' or sqlerrm is distinct from 'Request already decided' then raise; end if; end;
 begin perform public.decide_join_request('d2100000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000002',false); raise exception 'Declined after approving';
 exception when others then if sqlstate is distinct from '22023' or sqlerrm is distinct from 'Request already decided' then raise; end if; end;
 begin perform public.decide_join_request('d2100000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000014',true); raise exception 'Approved nobody';
 exception when others then if sqlstate is distinct from '22023' or sqlerrm is distinct from 'Request already decided' then raise; end if; end;
 r := public.decide_join_request('d2100000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000004',false);
 if r is distinct from '{"status":"declined"}'::jsonb then raise exception 'Decline returned %', r; end if;
 if public.plan_join_requests('d2100000-0000-4000-8000-000000000001') is distinct from '[]'::jsonb then raise exception 'Decided requests still listed'; end if;
end $$;
reset role;
do $$ declare v private.join_requests; begin
 if (select response from public.attendees where plan_id='d2100000-0000-4000-8000-000000000001' and user_id='d2000000-0000-4000-8000-000000000002') is distinct from 'accepted' then raise exception 'Approved guest not accepted on the event'; end if;
 if (select count(*) from private.beta_access where user_id='d2000000-0000-4000-8000-000000000002' and source='approval' and revoked_at is null
   and plan_link_id=(select id from private.plan_links where code=repeat('A',22))) is distinct from 1 then raise exception 'Approval grant expected'; end if;
 if not private.user_eligible('d2000000-0000-4000-8000-000000000002') then raise exception 'Approved guest not eligible'; end if;
 if (select count(*) from private.notification_outbox where kind='join_approved' and plan_id='d2100000-0000-4000-8000-000000000001'
   and recipient_id='d2000000-0000-4000-8000-000000000002' and actor_id='d2000000-0000-4000-8000-000000000001' and detail is null) is distinct from 1 then raise exception 'One join_approved notice expected'; end if;
 select * into v from private.join_requests where user_id='d2000000-0000-4000-8000-000000000002';
 if v.status is distinct from 'approved' or v.decided_at is null then raise exception 'Approved request expected: %', row_to_json(v); end if;
 select * into v from private.join_requests where user_id='d2000000-0000-4000-8000-000000000004';
 if v.status is distinct from 'declined' or v.decided_at is null then raise exception 'Declined request expected: %', row_to_json(v); end if;
 if exists(select 1 from public.attendees where user_id='d2000000-0000-4000-8000-000000000004')
  or exists(select 1 from private.beta_access where user_id='d2000000-0000-4000-8000-000000000004')
  or exists(select 1 from private.notification_outbox where recipient_id='d2000000-0000-4000-8000-000000000004') then raise exception 'A decline wrote something'; end if;
end $$;
-- The approved guest: the answer can't change any more, the list leaves the event out, the link says "already" and
-- the event reads.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 begin perform public.change_join_answer('d2100000-0000-4000-8000-000000000001','maybe'); raise exception 'Changed a decided answer';
 exception when others then if sqlstate is distinct from '22023' or sqlerrm is distinct from 'Request already decided' then raise; end if; end;
 if public.my_join_requests() is distinct from '[]'::jsonb then raise exception 'An approved request is still listed'; end if;
 r := public.request_to_join(repeat('A',22),null,'maybe',null);
 if r is distinct from jsonb_build_object('state','already','plan_id','d2100000-0000-4000-8000-000000000001','response','accepted') then raise exception 'Approved guest got %', r; end if;
 r := public.my_join_request(repeat('A',22));
 if r->>'member' is distinct from 'attendee' or r->'request' is distinct from 'null'::jsonb then raise exception 'Approved guest''s page was %', r; end if;
 if (select count(*) from public.plans where id='d2100000-0000-4000-8000-000000000001') is distinct from 1 then raise exception 'Approved guest cannot read the event'; end if;
end $$;

-- Declined (Review Focus 4): the same link says "declined" and changes nothing; a new link lets them ask again.
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 r := public.request_to_join(repeat('A',22),null,'maybe',null);
 if r is distinct from jsonb_build_object('state','declined','plan_id','d2100000-0000-4000-8000-000000000001','response','accepted') then raise exception 'Declined person got %', r; end if;
 r := public.my_join_request(repeat('A',22));
 if r->'request' is distinct from '{"status":"declined","response":"accepted"}'::jsonb then raise exception 'Declined page was %', r; end if;
 r := public.my_join_requests();
 if jsonb_array_length(r) is distinct from 1 or r->0->>'status' is distinct from 'declined' then raise exception 'Declined list was %', r; end if;
 begin perform public.change_join_answer('d2100000-0000-4000-8000-000000000001','maybe'); raise exception 'Changed a declined answer';
 exception when others then if sqlstate is distinct from '22023' or sqlerrm is distinct from 'Request already decided' then raise; end if; end;
end $$;
reset role;
do $$ begin
 if (select status||'|'||response from private.join_requests where user_id='d2000000-0000-4000-8000-000000000004') is distinct from 'declined|accepted' then raise exception 'Asking again on the same link changed the decline'; end if;
 if (select count(*) from private.notification_outbox where actor_id='d2000000-0000-4000-8000-000000000004') is distinct from 1 then raise exception 'Asking again on the same link queued a notice'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin insert into olr_codes values ('A2',public.rotate_plan_link('d2100000-0000-4000-8000-000000000001')); end $$;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 r := public.request_to_join((select code from olr_codes where name='A2'),null,'maybe',null);
 if r is distinct from jsonb_build_object('state','waiting','plan_id','d2100000-0000-4000-8000-000000000001','response','maybe') then raise exception 'New link gave %', r; end if;
 r := public.my_join_request((select code from olr_codes where name='A2'));
 if r->'request' is distinct from '{"status":"waiting","response":"maybe"}'::jsonb then raise exception 'Reopened page was %', r; end if;
end $$;
reset role;
do $$ declare v private.join_requests; begin
 select * into v from private.join_requests where user_id='d2000000-0000-4000-8000-000000000004';
 if v.status is distinct from 'waiting' or v.response is distinct from 'maybe' or v.decided_at is not null or v.created_at is distinct from now()
  or v.plan_link_id is distinct from (select id from private.plan_links where code=(select code from olr_codes where name='A2')) then raise exception 'Reopened request expected: %', row_to_json(v); end if;
 if (select count(*) from private.notification_outbox where kind='join_request' and actor_id='d2000000-0000-4000-8000-000000000004') is distinct from 2 then raise exception 'A reopened request must notify the host again'; end if;
end $$;
-- A declined person whose decline came from an older link sees no request on the new link's page until they ask.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin perform public.decide_join_request('d2100000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000004',false); end $$;
do $$ begin insert into olr_codes values ('A3',public.rotate_plan_link('d2100000-0000-4000-8000-000000000001')); end $$;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 r := public.my_join_request((select code from olr_codes where name='A3'));
 if r->>'state' is distinct from 'open' or r->'request' is distinct from 'null'::jsonb then raise exception 'An older decline showed on the new link: %', r; end if;
 r := public.my_join_request((select code from olr_codes where name='A2'));
 if r->'request' is distinct from '{"status":"declined","response":"maybe"}'::jsonb then raise exception 'The decline did not show on its own link: %', r; end if;
end $$;

-- decide: approval works after the link is turned off and the event is edited (Review Focus 2). Dee asks on A3; the
-- host edits the event and turns A3 off, then approves.
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000010","role":"authenticated"}',true);
do $$ begin perform public.request_to_join((select code from olr_codes where name='A3'),null,'accepted',null); end $$;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 perform public.change_plan_v3('d2100000-0000-4000-8000-000000000001',(select version from public.plans where id='d2100000-0000-4000-8000-000000000001'),
  'Picnic','Bring food',array['community'],'2099-06-01 12:00+00',null,'UTC','Secret Park','',false,'Riverside');
 insert into olr_codes values ('A4',public.rotate_plan_link('d2100000-0000-4000-8000-000000000001'));
 r := public.decide_join_request('d2100000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000010',true);
 if r is distinct from '{"status":"approved"}'::jsonb then raise exception 'Approve after turning the link off returned %', r; end if;
end $$;
reset role;
do $$ begin
 if (select response from public.attendees where plan_id='d2100000-0000-4000-8000-000000000001' and user_id='d2000000-0000-4000-8000-000000000010') is distinct from 'accepted' then raise exception 'Dee not on the event'; end if;
end $$;

-- decide: a cancelled or started event refuses approval (42501) and the request stays waiting. Eve asks on the Quiz.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000011","role":"authenticated"}',true);
do $$ begin perform public.request_to_join(repeat('Q',22),null,'accepted',null); end $$;
reset role;
update public.plans set status='cancelled' where id='d2100000-0000-4000-8000-000000000004';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 begin perform public.decide_join_request('d2100000-0000-4000-8000-000000000004','d2000000-0000-4000-8000-000000000011',true); raise exception 'Approved on a cancelled event';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.plans set status='active', starts_at=now()-interval '1 minute' where id='d2100000-0000-4000-8000-000000000004';
set local role authenticated;
do $$ begin
 begin perform public.decide_join_request('d2100000-0000-4000-8000-000000000004','d2000000-0000-4000-8000-000000000011',true); raise exception 'Approved on a started event';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if (select status from private.join_requests where user_id='d2000000-0000-4000-8000-000000000011') is distinct from 'waiting' then raise exception 'A refused approval changed the request'; end if;
 if exists(select 1 from public.attendees where user_id='d2000000-0000-4000-8000-000000000011')
  or exists(select 1 from private.beta_access where user_id='d2000000-0000-4000-8000-000000000011')
  or exists(select 1 from private.notification_outbox where recipient_id='d2000000-0000-4000-8000-000000000011') then raise exception 'A refused approval wrote something'; end if;
end $$;

-- decide: a ban (a revoked grant), a disabled roster row or a banned account refuses approval (42501), and the
-- request stays waiting. Cal asks on A4.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000007","role":"authenticated"}',true);
do $$ begin perform public.request_to_join((select code from olr_codes where name='A4'),null,'accepted',null); end $$;
reset role;
insert into private.beta_access(user_id,source,revoked_at) values ('d2000000-0000-4000-8000-000000000007','invitation',now());
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 begin perform public.decide_join_request('d2100000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000007',true); raise exception 'Approved a banned user';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
delete from private.beta_access where user_id='d2000000-0000-4000-8000-000000000007';
update auth.users set email='olr-disabled@resbite-test.invalid' where id='d2000000-0000-4000-8000-000000000007';
set local role authenticated;
do $$ begin
 begin perform public.decide_join_request('d2100000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000007',true); raise exception 'Approved a disabled roster email';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
update auth.users set email=null, banned_until='2099-01-01 00:00+00' where id='d2000000-0000-4000-8000-000000000007';
set local role authenticated;
do $$ begin
 begin perform public.decide_join_request('d2100000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000007',true); raise exception 'Approved a banned account';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if (select status from private.join_requests where user_id='d2000000-0000-4000-8000-000000000007') is distinct from 'waiting' then raise exception 'A refused approval changed Cal''s request'; end if;
 if exists(select 1 from public.attendees where user_id='d2000000-0000-4000-8000-000000000007')
  or exists(select 1 from private.beta_access where user_id='d2000000-0000-4000-8000-000000000007')
  or exists(select 1 from private.notification_outbox where recipient_id='d2000000-0000-4000-8000-000000000007') then raise exception 'A refused approval wrote something for Cal'; end if;
end $$;
update auth.users set banned_until=null where id='d2000000-0000-4000-8000-000000000007';

-- decide: someone who joined another way meanwhile (a personal invitation) keeps their answer; the request is still
-- approved. While they are on the event, their stale waiting request is hidden from both lists.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000015","role":"authenticated"}',true);
do $$ begin perform public.request_to_join((select code from olr_codes where name='A4'),null,'accepted',null); end $$;
reset role;
insert into public.attendees(plan_id,user_id,response) values ('d2100000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000015','declined');
set local role authenticated;
do $$ declare r jsonb; begin
 if public.my_join_requests() is distinct from '[]'::jsonb then raise exception 'A stale request is listed for a guest'; end if;
 r := public.my_join_request((select code from olr_codes where name='A4'));
 if r->>'member' is distinct from 'attendee' or r->'request' is distinct from 'null'::jsonb then raise exception 'A stale request shows on the page: %', r; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 if exists(select 1 from jsonb_array_elements(public.plan_join_requests('d2100000-0000-4000-8000-000000000001')) e where e->>'user_id'='d2000000-0000-4000-8000-000000000015') then
  raise exception 'The host''s list shows a guest already on the event';
 end if;
 r := public.decide_join_request('d2100000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000015',true);
 if r is distinct from '{"status":"approved"}'::jsonb then raise exception 'Approving a guest already on the event returned %', r; end if;
end $$;
reset role;
do $$ begin
 if (select response from public.attendees where plan_id='d2100000-0000-4000-8000-000000000001' and user_id='d2000000-0000-4000-8000-000000000015') is distinct from 'declined' then raise exception 'Approval replaced the guest''s own answer'; end if;
 if (select status from private.join_requests where user_id='d2000000-0000-4000-8000-000000000015') is distinct from 'approved' then raise exception 'Request not approved'; end if;
end $$;

-- A guest who was approved and later removed asks again on the same link: a new waiting request and a new notice.
-- Gus asks on the Walk, is approved, then removed. now() is fixed inside this block, so his first request and its
-- notice are moved an hour back, as if made then.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000016","role":"authenticated"}',true);
do $$ begin perform public.request_to_join(repeat('W',22),null,'accepted',null); end $$;
reset role;
update private.join_requests set created_at=created_at-interval '1 hour' where user_id='d2000000-0000-4000-8000-000000000016';
update private.notification_outbox set dedupe_key='join:d2100000-0000-4000-8000-000000000006:d2000000-0000-4000-8000-000000000016:'
  ||(select id from private.plan_links where code=repeat('W',22))||':'
  ||extract(epoch from (select created_at from private.join_requests where user_id='d2000000-0000-4000-8000-000000000016'))
 where kind='join_request' and actor_id='d2000000-0000-4000-8000-000000000016'
  and dedupe_key='join:d2100000-0000-4000-8000-000000000006:d2000000-0000-4000-8000-000000000016:'
  ||(select id from private.plan_links where code=repeat('W',22))||':'||extract(epoch from now());
do $$ begin
 if not exists(select 1 from private.notification_outbox where kind='join_request' and actor_id='d2000000-0000-4000-8000-000000000016'
  and dedupe_key like '%:'||extract(epoch from now()-interval '1 hour')) then raise exception 'Gus''s first notice was not moved back'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 perform public.decide_join_request('d2100000-0000-4000-8000-000000000006','d2000000-0000-4000-8000-000000000016',true);
 perform public.remove_guest('d2100000-0000-4000-8000-000000000006','d2000000-0000-4000-8000-000000000016');
end $$;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000016","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 r := public.my_join_request(repeat('W',22));
 if r->'request' is distinct from 'null'::jsonb or r->'member' is distinct from 'null'::jsonb then raise exception 'A removed guest''s page was %', r; end if;
 r := public.request_to_join(repeat('W',22),null,'maybe',null);
 if r is distinct from jsonb_build_object('state','waiting','plan_id','d2100000-0000-4000-8000-000000000006','response','maybe') then raise exception 'A removed guest asking again got %', r; end if;
end $$;
reset role;
do $$ declare v private.join_requests; begin
 select * into v from private.join_requests where user_id='d2000000-0000-4000-8000-000000000016';
 if v.status is distinct from 'waiting' or v.response is distinct from 'maybe' or v.decided_at is not null or v.created_at is distinct from now() then raise exception 'Reopened request expected: %', row_to_json(v); end if;
 if (select count(*) from private.notification_outbox where kind='join_request' and actor_id='d2000000-0000-4000-8000-000000000016') is distinct from 2 then raise exception 'Asking again after removal must notify the host again'; end if;
 if exists(select 1 from public.attendees where user_id='d2000000-0000-4000-8000-000000000016') then raise exception 'Asking again put the guest back'; end if;
end $$;

-- legacy (Review Focus 3): an old build's claim_plan_link and join_by_link return the event and make a waiting
-- request, with no attendee and no grant.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000008","role":"authenticated"}',true);
do $$ begin
 if public.claim_plan_link((select code from olr_codes where name='A4')) is distinct from 'd2100000-0000-4000-8000-000000000001' then raise exception 'Legacy claim returned another plan'; end if;
 if public.claim_plan_link((select code from olr_codes where name='A4')) is distinct from 'd2100000-0000-4000-8000-000000000001' then raise exception 'Repeated legacy claim returned another plan'; end if;
 -- Refusals are unchanged.
 begin perform public.claim_plan_link(repeat('A',22)); raise exception 'Legacy claim through a turned-off link';
 exception when insufficient_privilege then null; end;
 begin perform public.claim_plan_link(repeat('C',22)); raise exception 'Legacy claim of a cancelled event';
 exception when insufficient_privilege then null; end;
 begin perform public.claim_plan_link(repeat('S',22)); raise exception 'Legacy claim of a started event';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000009","role":"authenticated"}',true);
do $$ begin
 if public.join_by_link((select code from olr_codes where name='A4'),' Leo ','2026-10') is distinct from 'd2100000-0000-4000-8000-000000000001' then raise exception 'Legacy join returned another plan'; end if;
 if public.account_access_status()->>'status' is distinct from 'access_pending' then raise exception 'Legacy join approved the account'; end if;
end $$;
reset role;
do $$ begin
 if (select status||'|'||response from private.join_requests where plan_id='d2100000-0000-4000-8000-000000000001' and user_id='d2000000-0000-4000-8000-000000000008') is distinct from 'waiting|pending' then raise exception 'Legacy claim made no waiting request'; end if;
 if (select status||'|'||response from private.join_requests where plan_id='d2100000-0000-4000-8000-000000000001' and user_id='d2000000-0000-4000-8000-000000000009') is distinct from 'waiting|pending' then raise exception 'Legacy join made no waiting request'; end if;
 if exists(select 1 from public.attendees where user_id in ('d2000000-0000-4000-8000-000000000008','d2000000-0000-4000-8000-000000000009'))
  or exists(select 1 from private.beta_access where user_id in ('d2000000-0000-4000-8000-000000000008','d2000000-0000-4000-8000-000000000009')) then raise exception 'A legacy call admitted someone'; end if;
 if (select count(*) from private.notification_outbox where kind='join_request' and actor_id='d2000000-0000-4000-8000-000000000008') is distinct from 1
  or (select count(*) from private.notification_outbox where kind='join_request' and actor_id='d2000000-0000-4000-8000-000000000009') is distinct from 1 then raise exception 'One notice per legacy request expected'; end if;
 if exists(select 1 from private.notification_outbox where kind='invitation' and plan_id='d2100000-0000-4000-8000-000000000001') then raise exception 'A legacy call queued an invitation notice'; end if;
 if (select display_name from public.profiles where id='d2000000-0000-4000-8000-000000000009') is distinct from 'Leo'
  or (select terms_version from private.age_attestations where user_id='d2000000-0000-4000-8000-000000000009') is distinct from '2026-10' then raise exception 'Legacy join did not store the name and tick'; end if;
 if private.user_eligible('d2000000-0000-4000-8000-000000000009') then raise exception 'Legacy join made the account eligible'; end if;
end $$;
-- The host sees both; the tester has no number, so no ending.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 r := public.plan_join_requests('d2100000-0000-4000-8000-000000000001');
 if (select e->'ending' from jsonb_array_elements(r) e where e->>'user_id'='d2000000-0000-4000-8000-000000000008') is distinct from 'null'::jsonb
  or (select e->>'name' from jsonb_array_elements(r) e where e->>'user_id'='d2000000-0000-4000-8000-000000000008') is distinct from 'Tester'
  or (select e->>'ending' from jsonb_array_elements(r) e where e->>'user_id'='d2000000-0000-4000-8000-000000000009') is distinct from '09'
  or (select e->>'response' from jsonb_array_elements(r) e where e->>'user_id'='d2000000-0000-4000-8000-000000000009') is distinct from 'pending' then
  raise exception 'Host list of legacy requests was %', r;
 end if;
end $$;
reset role;
-- The owner and people already on the event keep today's behaviour: the event from any link, nothing written.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 if public.claim_plan_link(repeat('O',22)) is distinct from 'd2100000-0000-4000-8000-000000000001' then raise exception 'Owner refused by a turned-off link'; end if;
 if public.claim_plan_link(repeat('S',22)) is distinct from 'd2100000-0000-4000-8000-000000000003' then raise exception 'Owner refused after the start'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 if public.claim_plan_link(repeat('O',22)) is distinct from 'd2100000-0000-4000-8000-000000000001' then raise exception 'Attendee refused by a turned-off link'; end if;
 if public.join_by_link((select code from olr_codes where name='A4'),'ignored','ignored') is distinct from 'd2100000-0000-4000-8000-000000000001' then raise exception 'Attendee join returned another plan'; end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from private.join_requests where user_id in ('d2000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000003')) then raise exception 'The owner or an attendee became a request'; end if;
end $$;

-- visibility (Review Focus 5): a waiting person, even one who may use the app, reads neither the event nor its guests,
-- and the going count leaves them out.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000017","role":"authenticated"}',true);
do $$ declare g int; begin
 g := (public.invitation_page((select code from olr_codes where name='A4'))->>'going')::int;
 perform public.request_to_join((select code from olr_codes where name='A4'),null,'accepted',null);
 if (public.invitation_page((select code from olr_codes where name='A4'))->>'going')::int is distinct from g then raise exception 'A waiting answer counted as going'; end if;
 if exists(select 1 from public.plans where id='d2100000-0000-4000-8000-000000000001') then raise exception 'A waiting grant holder reads the event'; end if;
 if exists(select 1 from public.attendees where plan_id='d2100000-0000-4000-8000-000000000001') then raise exception 'A waiting grant holder reads the guests'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000008","role":"authenticated"}',true);
do $$ begin
 if exists(select 1 from public.plans where id='d2100000-0000-4000-8000-000000000001') then raise exception 'A waiting tester reads the event'; end if;
end $$;
reset role;
do $$ begin
 if (select (private.invitation_page((select code from olr_codes where name='A4'))->>'going')::int)
   is distinct from (select count(*) from public.attendees where plan_id='d2100000-0000-4000-8000-000000000001' and response='accepted') then raise exception 'Going is not the attendees'' count'; end if;
end $$;

-- decide: each answer carries onto the event as it is. Approve the tester (pending, no grant: the roster lets them in),
-- Leo (pending, with a grant) and Ida, who answered declined.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000018","role":"authenticated"}',true);
do $$ begin perform public.request_to_join((select code from olr_codes where name='A4'),null,'declined',null); end $$;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 perform public.decide_join_request('d2100000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000008',true);
 perform public.decide_join_request('d2100000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000009',true);
 perform public.decide_join_request('d2100000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000018',true);
 perform public.decide_join_request('d2100000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000017',true);
end $$;
reset role;
do $$ begin
 if (select response from public.attendees where plan_id='d2100000-0000-4000-8000-000000000001' and user_id='d2000000-0000-4000-8000-000000000008') is distinct from 'pending'
  or (select response from public.attendees where plan_id='d2100000-0000-4000-8000-000000000001' and user_id='d2000000-0000-4000-8000-000000000009') is distinct from 'pending'
  or (select response from public.attendees where plan_id='d2100000-0000-4000-8000-000000000001' and user_id='d2000000-0000-4000-8000-000000000018') is distinct from 'declined'
  or (select response from public.attendees where plan_id='d2100000-0000-4000-8000-000000000001' and user_id='d2000000-0000-4000-8000-000000000017') is distinct from 'accepted' then
  raise exception 'Answers did not carry onto the event';
 end if;
 if exists(select 1 from private.beta_access where user_id='d2000000-0000-4000-8000-000000000008') then raise exception 'A roster tester got a grant'; end if;
 if (select source from private.beta_access where user_id='d2000000-0000-4000-8000-000000000017') is distinct from 'maintainer' then raise exception 'An existing grant was replaced'; end if;
 if (select source from private.beta_access where user_id='d2000000-0000-4000-8000-000000000009' and revoked_at is null) is distinct from 'approval' then raise exception 'Leo has no approval grant'; end if;
end $$;

-- A 'pending' answer never replaces a stored one: an old build's claim_plan_link or join_by_link, or the app opening
-- the link with 'pending', keeps the answer given on the web, whether the request is waiting or reopened, and returns
-- it. Any other answer replaces it. 19 Joy holds a grant (claim_plan_link); 20 Kim has none (join_by_link).
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values
 ('d2000000-0000-4000-8000-000000000019',null,null,'447700900419',now()),
 ('d2000000-0000-4000-8000-000000000020',null,null,'447700900420',now());
insert into public.profiles(id,display_name) values ('d2000000-0000-4000-8000-000000000019','Joy'),('d2000000-0000-4000-8000-000000000020','Kim');
insert into private.age_attestations(user_id,terms_version) values
 ('d2000000-0000-4000-8000-000000000019','2026-09'),('d2000000-0000-4000-8000-000000000020','2026-09');
insert into private.beta_access(user_id,source) values ('d2000000-0000-4000-8000-000000000019','maintainer');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000019","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 r := public.request_to_join(repeat('W',22),null,'accepted',null);
 if r->>'response' is distinct from 'accepted' then raise exception 'Joy''s request returned %', r; end if;
 if public.claim_plan_link(repeat('W',22)) is distinct from 'd2100000-0000-4000-8000-000000000006' then raise exception 'Joy''s claim returned another plan'; end if;
 if public.my_join_request(repeat('W',22))->'request' is distinct from '{"status":"waiting","response":"accepted"}'::jsonb then raise exception 'A legacy claim replaced the answer'; end if;
 r := public.request_to_join(repeat('W',22),null,'pending',null);
 if r is distinct from jsonb_build_object('state','waiting','plan_id','d2100000-0000-4000-8000-000000000006','response','accepted') then raise exception 'Opening again with pending returned %', r; end if;
 if public.my_join_request(repeat('W',22))->'request'->>'response' is distinct from 'accepted' then raise exception 'Opening again with pending replaced the answer'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000020","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 perform public.request_to_join(repeat('W',22),null,'accepted',null);
 if public.join_by_link(repeat('W',22),null,null) is distinct from 'd2100000-0000-4000-8000-000000000006' then raise exception 'Kim''s join returned another plan'; end if;
 if public.my_join_request(repeat('W',22))->'request' is distinct from '{"status":"waiting","response":"accepted"}'::jsonb then raise exception 'A legacy join replaced the answer'; end if;
 r := public.request_to_join(repeat('W',22),null,'pending',null);
 if r->>'response' is distinct from 'accepted' then raise exception 'Kim opening again with pending got %', r; end if;
end $$;
-- Reopened: the host declines Joy and turns the Walk's link off; Joy's old build claims the new link. The request is
-- waiting again, with her answer.
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 perform public.decide_join_request('d2100000-0000-4000-8000-000000000006','d2000000-0000-4000-8000-000000000019',false);
 insert into olr_codes values ('W2',public.rotate_plan_link('d2100000-0000-4000-8000-000000000006'));
end $$;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000019","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 if public.claim_plan_link((select code from olr_codes where name='W2')) is distinct from 'd2100000-0000-4000-8000-000000000006' then raise exception 'Joy''s reopening claim returned another plan'; end if;
 if public.my_join_request((select code from olr_codes where name='W2'))->'request' is distinct from '{"status":"waiting","response":"accepted"}'::jsonb then
  raise exception 'A reopening legacy claim replaced the answer';
 end if;
 -- A later answer replaces it.
 r := public.request_to_join((select code from olr_codes where name='W2'),null,'maybe',null);
 if r->>'response' is distinct from 'maybe' then raise exception 'Joy''s maybe returned %', r; end if;
 perform public.claim_plan_link((select code from olr_codes where name='W2'));
end $$;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000020","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 r := public.request_to_join((select code from olr_codes where name='W2'),null,'maybe',null);
 if r->>'response' is distinct from 'maybe' then raise exception 'Kim''s maybe returned %', r; end if;
 perform public.join_by_link((select code from olr_codes where name='W2'),null,null);
end $$;
reset role;
do $$ begin
 if (select response from private.join_requests where plan_id='d2100000-0000-4000-8000-000000000006' and user_id='d2000000-0000-4000-8000-000000000019') is distinct from 'maybe'
  or (select response from private.join_requests where plan_id='d2100000-0000-4000-8000-000000000006' and user_id='d2000000-0000-4000-8000-000000000020') is distinct from 'maybe' then
  raise exception 'A later answer was not kept';
 end if;
 if (select count(*) from private.notification_outbox where kind='join_request' and actor_id='d2000000-0000-4000-8000-000000000019') is distinct from 2
  or (select count(*) from private.notification_outbox where kind='join_request' and actor_id='d2000000-0000-4000-8000-000000000020') is distinct from 1 then
  raise exception 'Opening again queued the wrong notices';
 end if;
end $$;

-- People who already have access (testers and grant holders) are not asked for the tick or a name, as join_by_link never
-- asked them; a missing profile is made only from a name they give. 25 Quin is a roster tester with a profile and no
-- tick; 26 a grant holder with neither, who gives a name.
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values
 ('d2000000-0000-4000-8000-000000000025','olr-quin@resbite-test.invalid',now(),null,null),
 ('d2000000-0000-4000-8000-000000000026',null,null,'447700900426',now());
insert into private.tester_roster(email) values ('olr-quin@resbite-test.invalid');
insert into public.profiles(id,display_name) values ('d2000000-0000-4000-8000-000000000025','Quin');
insert into private.beta_access(user_id,source) values ('d2000000-0000-4000-8000-000000000026','maintainer');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000025","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 r := public.request_to_join((select code from olr_codes where name='A4'),null,'accepted',null);
 if r is distinct from jsonb_build_object('state','waiting','plan_id','d2100000-0000-4000-8000-000000000001','response','accepted') then
  raise exception 'A tester with no tick got %', r;
 end if;
end $$;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000026","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 r := public.request_to_join((select code from olr_codes where name='A4'),' Max ','maybe',null);
 if r->>'state' is distinct from 'waiting' then raise exception 'A grant holder with no tick or profile got %', r; end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from private.age_attestations where user_id in ('d2000000-0000-4000-8000-000000000025','d2000000-0000-4000-8000-000000000026')) then
  raise exception 'A tick was stored without being asked';
 end if;
 if (select display_name from public.profiles where id='d2000000-0000-4000-8000-000000000026') is distinct from 'Max' then raise exception 'The missing profile was not made from the name'; end if;
 if (select display_name from public.profiles where id='d2000000-0000-4000-8000-000000000025') is distinct from 'Quin' then raise exception 'The tester''s name changed'; end if;
end $$;

-- Approval refuses the people request_to_join refuses, even when they may use the app: Quin (a roster tester) now holds
-- a revoked grant, and Max (a grant holder) an email disabled on the roster. Both stay waiting.
insert into private.beta_access(user_id,source,revoked_at) values ('d2000000-0000-4000-8000-000000000025','invitation',now());
update auth.users set email='olr-disabled@resbite-test.invalid' where id='d2000000-0000-4000-8000-000000000026';
do $$ begin
 if not private.user_eligible('d2000000-0000-4000-8000-000000000025') or not private.user_eligible('d2000000-0000-4000-8000-000000000026') then
  raise exception 'Quin and Max should still be eligible';
 end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 begin perform public.decide_join_request('d2100000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000025',true); raise exception 'Approved a tester with a revoked grant';
 exception when others then if sqlstate is distinct from '42501' or sqlerrm is distinct from 'Invitation unavailable' then raise; end if; end;
 begin perform public.decide_join_request('d2100000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000026',true); raise exception 'Approved a grant holder disabled on the roster';
 exception when others then if sqlstate is distinct from '42501' or sqlerrm is distinct from 'Invitation unavailable' then raise; end if; end;
end $$;
reset role;
do $$ begin
 if (select count(*) from private.join_requests where user_id in ('d2000000-0000-4000-8000-000000000025','d2000000-0000-4000-8000-000000000026') and status='waiting') is distinct from 2
  or exists(select 1 from public.attendees where user_id in ('d2000000-0000-4000-8000-000000000025','d2000000-0000-4000-8000-000000000026')) then
  raise exception 'A refused approval changed Quin''s or Max''s request';
 end if;
end $$;

-- The host's list leaves out a requester whose account is being deleted. 28 Rae asks, then asks to be deleted.
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values ('d2000000-0000-4000-8000-000000000028',null,null,'447700900428',now());
insert into public.profiles(id,display_name) values ('d2000000-0000-4000-8000-000000000028','Rae');
insert into private.age_attestations(user_id,terms_version) values ('d2000000-0000-4000-8000-000000000028','2026-09');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000028","role":"authenticated"}',true);
do $$ begin perform public.request_to_join((select code from olr_codes where name='A4'),null,'accepted',null); end $$;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 if not exists(select 1 from jsonb_array_elements(public.plan_join_requests('d2100000-0000-4000-8000-000000000001')) e where e->>'user_id'='d2000000-0000-4000-8000-000000000028') then
  raise exception 'Rae should be listed before asking to be deleted';
 end if;
end $$;
reset role;
update public.profiles set deletion_requested_at=now() where id='d2000000-0000-4000-8000-000000000028';
set local role authenticated;
do $$ begin
 if exists(select 1 from jsonb_array_elements(public.plan_join_requests('d2100000-0000-4000-8000-000000000001')) e where e->>'user_id'='d2000000-0000-4000-8000-000000000028') then
  raise exception 'A requester being deleted is listed';
 end if;
end $$;

-- Asking again while waiting moves the request to the link used, so a decline holds there. 24 Pia asks on A4; the host
-- turns it off (A5); Pia asks again on A5 and is declined; asking on A5 again is "declined".
reset role;
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values ('d2000000-0000-4000-8000-000000000024',null,null,'447700900424',now());
insert into public.profiles(id,display_name) values ('d2000000-0000-4000-8000-000000000024','Pia');
insert into private.age_attestations(user_id,terms_version) values ('d2000000-0000-4000-8000-000000000024','2026-09');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000024","role":"authenticated"}',true);
do $$ begin perform public.request_to_join((select code from olr_codes where name='A4'),null,'accepted',null); end $$;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin insert into olr_codes values ('A5',public.rotate_plan_link('d2100000-0000-4000-8000-000000000001')); end $$;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000024","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 r := public.request_to_join((select code from olr_codes where name='A5'),null,'maybe',null);
 if r->>'state' is distinct from 'waiting' then raise exception 'Pia asking again got %', r; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin perform public.decide_join_request('d2100000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000024',false); end $$;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000024","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 r := public.request_to_join((select code from olr_codes where name='A5'),null,'accepted',null);
 if r is distinct from jsonb_build_object('state','declined','plan_id','d2100000-0000-4000-8000-000000000001','response','maybe') then
  raise exception 'Asking on the link of the decline got %', r;
 end if;
end $$;

-- decide_join_request with a missing argument is 22023 "Invalid decision".
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 begin perform public.decide_join_request(null,'d2000000-0000-4000-8000-000000000007',true); raise exception 'Decided with no event';
 exception when others then if sqlstate is distinct from '22023' or sqlerrm is distinct from 'Invalid decision' then raise; end if; end;
 begin perform public.decide_join_request('d2100000-0000-4000-8000-000000000001',null,true); raise exception 'Decided with no person';
 exception when others then if sqlstate is distinct from '22023' or sqlerrm is distinct from 'Invalid decision' then raise; end if; end;
 begin perform public.decide_join_request('d2100000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000007',null); raise exception 'Decided nothing';
 exception when others then if sqlstate is distinct from '22023' or sqlerrm is distinct from 'Invalid decision' then raise; end if; end;
end $$;

-- change_join_answer on a request that no longer applies changes nothing: Cal is now on the event another way (22023),
-- and Eve's Quiz has started, then is cancelled (42501).
reset role;
insert into public.attendees(plan_id,user_id,response) values ('d2100000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000007','declined');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000007","role":"authenticated"}',true);
do $$ begin
 begin perform public.change_join_answer('d2100000-0000-4000-8000-000000000001','maybe'); raise exception 'Changed the answer of a guest already on the event';
 exception when others then if sqlstate is distinct from '22023' or sqlerrm is distinct from 'Request already decided' then raise; end if; end;
end $$;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000011","role":"authenticated"}',true);
do $$ begin
 begin perform public.change_join_answer('d2100000-0000-4000-8000-000000000004','maybe'); raise exception 'Changed the answer on a started event';
 exception when others then if sqlstate is distinct from '42501' or sqlerrm is distinct from 'Invitation unavailable' then raise; end if; end;
end $$;
reset role;
update public.plans set status='cancelled', starts_at='2099-06-04 19:00+00' where id='d2100000-0000-4000-8000-000000000004';
set local role authenticated;
do $$ begin
 begin perform public.change_join_answer('d2100000-0000-4000-8000-000000000004','maybe'); raise exception 'Changed the answer on a cancelled event';
 exception when others then if sqlstate is distinct from '42501' or sqlerrm is distinct from 'Invitation unavailable' then raise; end if; end;
end $$;
reset role;
do $$ begin
 if (select status||'|'||response from private.join_requests where plan_id='d2100000-0000-4000-8000-000000000001' and user_id='d2000000-0000-4000-8000-000000000007') is distinct from 'waiting|accepted'
  or (select status||'|'||response from private.join_requests where plan_id='d2100000-0000-4000-8000-000000000004' and user_id='d2000000-0000-4000-8000-000000000011') is distinct from 'waiting|accepted' then
  raise exception 'A refused change touched the request';
 end if;
 if (select response from public.attendees where plan_id='d2100000-0000-4000-8000-000000000001' and user_id='d2000000-0000-4000-8000-000000000007') is distinct from 'declined' then
  raise exception 'A refused change touched the guest''s answer';
 end if;
end $$;

-- Folding a web-only account carries its requests over. 21 Lou (web only) asked on the Picnic, the Walk, Ola's party
-- and the Supper; 22 Ola (has used the app) has her own request on the Walk, organizes the party and is already on the
-- Supper. Lou's Picnic request moves to Ola with its answer; on the other three Ola keeps what she has and Lou's goes.
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values
 ('d2000000-0000-4000-8000-000000000021',null,null,'447700900421',now()),
 ('d2000000-0000-4000-8000-000000000022',null,null,'447700900422',now());
insert into public.profiles(id,display_name) values ('d2000000-0000-4000-8000-000000000021','Lou'),('d2000000-0000-4000-8000-000000000022','Ola');
insert into private.age_attestations(user_id,terms_version) values ('d2000000-0000-4000-8000-000000000021','2026-09'),('d2000000-0000-4000-8000-000000000022','2026-09');
insert into private.beta_access(user_id,source) values ('d2000000-0000-4000-8000-000000000022','maintainer');
insert into private.app_sessions(user_id) values ('d2000000-0000-4000-8000-000000000022');
insert into public.plans(id,owner_id,title,starts_at,time_zone,place_label,area,categories) values
 ('d2100000-0000-4000-8000-000000000007','d2000000-0000-4000-8000-000000000022','Ola''s party','2099-06-07 20:00+00','UTC','Home','',array['community']),
 ('d2100000-0000-4000-8000-000000000008','d2000000-0000-4000-8000-000000000001','Supper','2099-06-08 19:00+00','UTC','Hall','',array['community']);
insert into private.plan_links(plan_id,code) values ('d2100000-0000-4000-8000-000000000007',repeat('X',22)),('d2100000-0000-4000-8000-000000000008',repeat('Y',22));
insert into public.attendees(plan_id,user_id,response) values ('d2100000-0000-4000-8000-000000000008','d2000000-0000-4000-8000-000000000022','maybe');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000022","role":"authenticated"}',true);
do $$ begin perform public.request_to_join((select code from olr_codes where name='W2'),null,'maybe',null); end $$;
select set_config('request.jwt.claims','{"sub":"d2000000-0000-4000-8000-000000000021","role":"authenticated"}',true);
do $$ begin
 perform public.request_to_join((select code from olr_codes where name='A5'),null,'accepted',null);
 perform public.request_to_join((select code from olr_codes where name='W2'),null,'accepted',null);
 perform public.request_to_join(repeat('X',22),null,'accepted',null);
 perform public.request_to_join(repeat('Y',22),null,'accepted',null);
end $$;
reset role;
set local role service_role;
do $$ begin perform public.fold_web_account('d2000000-0000-4000-8000-000000000021','d2000000-0000-4000-8000-000000000022'); end $$;
reset role;
do $$ begin
 if exists(select 1 from private.join_requests where user_id='d2000000-0000-4000-8000-000000000021') then raise exception 'The web account kept requests'; end if;
 if (select status||'|'||response||'|'||plan_link_id from private.join_requests where plan_id='d2100000-0000-4000-8000-000000000001' and user_id='d2000000-0000-4000-8000-000000000022')
  is distinct from 'waiting|accepted|'||(select id from private.plan_links where code=(select code from olr_codes where name='A5')) then
  raise exception 'The Picnic request did not move with its answer';
 end if;
 if (select response from private.join_requests where plan_id='d2100000-0000-4000-8000-000000000006' and user_id='d2000000-0000-4000-8000-000000000022') is distinct from 'maybe' then
  raise exception 'The account''s own request was replaced';
 end if;
 if exists(select 1 from private.join_requests where plan_id in ('d2100000-0000-4000-8000-000000000007','d2100000-0000-4000-8000-000000000008')) then
  raise exception 'A request moved onto the account''s own event or one it is on';
 end if;
 if (select response from public.attendees where plan_id='d2100000-0000-4000-8000-000000000008' and user_id='d2000000-0000-4000-8000-000000000022') is distinct from 'maybe' then
  raise exception 'The fold changed the account''s place';
 end if;
end $$;

-- grants: anon can call none of the new functions, the helper is closed to every client role, and nobody reads the
-- table.
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ begin
 begin perform public.request_to_join(repeat('A',22),'Anon','accepted','2026-10'); raise exception 'anon requested';
 exception when insufficient_privilege then null; end;
 begin perform public.my_join_request(repeat('A',22)); raise exception 'anon read a request';
 exception when insufficient_privilege then null; end;
 begin perform public.my_join_requests(); raise exception 'anon listed requests';
 exception when insufficient_privilege then null; end;
 begin perform public.change_join_answer('d2100000-0000-4000-8000-000000000001','maybe'); raise exception 'anon changed an answer';
 exception when insufficient_privilege then null; end;
 begin perform public.plan_join_requests('d2100000-0000-4000-8000-000000000001'); raise exception 'anon listed the host''s requests';
 exception when insufficient_privilege then null; end;
 begin perform public.decide_join_request('d2100000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000007',true); raise exception 'anon decided';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ declare f text; r text; begin
 foreach f in array array['request_to_join(text,text,text,text)','my_join_request(text)','my_join_requests()',
  'change_join_answer(uuid,text)','plan_join_requests(uuid)','decide_join_request(uuid,uuid,boolean)'] loop
  if has_function_privilege('anon','public.'||f,'execute') or has_function_privilege('anon','private.'||f,'execute')
   or has_function_privilege('service_role','public.'||f,'execute') or has_function_privilege('service_role','private.'||f,'execute') then
   raise exception '% is open beyond authenticated', f;
  end if;
  if not has_function_privilege('authenticated','public.'||f,'execute') or not has_function_privilege('authenticated','private.'||f,'execute') then
   raise exception 'authenticated may not call %', f;
  end if;
  if (select prosecdef from pg_proc where oid=('public.'||f)::regprocedure) then raise exception 'public.% is a definer', f; end if;
  if not (select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid=('private.'||f)::regprocedure) then
   raise exception 'private.% is not a definer with an empty search path', f;
  end if;
 end loop;
 foreach r in array array['public','anon','authenticated','service_role'] loop
  if has_function_privilege(r,'private.request_join(uuid,private.plan_links,public.plans,text)','execute') then raise exception '% may call request_join', r; end if;
  if r is distinct from 'public' and has_table_privilege(r,'private.join_requests','select,insert,update,delete') then raise exception '% may touch join_requests', r; end if;
 end loop;
 if not (select relrowsecurity from pg_class where oid='private.join_requests'::regclass) then raise exception 'join_requests has no RLS'; end if;
 -- The checks keep every earlier value.
 if pg_get_constraintdef((select oid from pg_constraint where conname='notification_outbox_kind_check'))
  not like '%''invitation''%''rsvp''%''plan_changed''%''plan_cancelled''%''guest_note''%''invited''%''join_request''%''join_approved''%' then
  raise exception 'Outbox kinds wrong: %', pg_get_constraintdef((select oid from pg_constraint where conname='notification_outbox_kind_check'));
 end if;
 if pg_get_constraintdef((select oid from pg_constraint where conname='beta_access_source_check'))
  not like '%''link''%''maintainer''%''invitation''%''approval''%' then
  raise exception 'Grant sources wrong: %', pg_get_constraintdef((select oid from pg_constraint where conname='beta_access_source_check'));
 end if;
 begin insert into private.join_requests(plan_id,user_id,response) values ('d2100000-0000-4000-8000-000000000006','d2000000-0000-4000-8000-000000000014','withdrawn');
  raise exception 'A withdrawn request was stored';
 exception when check_violation then null; end;
 begin insert into private.join_requests(plan_id,user_id,response,status) values ('d2100000-0000-4000-8000-000000000006','d2000000-0000-4000-8000-000000000014','accepted','removed');
  raise exception 'An unknown status was stored';
 exception when check_violation then null; end;
end $$;
rollback;
