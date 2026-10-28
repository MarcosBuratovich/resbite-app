-- Push delivery (docs/superpowers/plans/2026-10-29-push-notifications.md, Task 1): 20261030120000_push_delivery puts the
-- ledger, the claim, register_device and the send-time audience on the hosted project, widened to phone-only accounts.
-- Runs in both modes: on the hosted baseline the migration creates every push object; in full mode it replaces the
-- functions and finds the ledger already made by the local-only files, so the last block pins that structure.
-- Synthetic identities only (prefix f4); one rolled-back block.
-- Users f4…: 01 Hana the host (phone, maintainer grant, has used the app), 02 Ana, 03 Bea, 15 Cal and 16 Dot (phone
-- only, nothing else: they ask to join), 04 Mia (phone, maintainer grant, has used the app: invited from contacts),
-- 05 Ben (banned), 06 Del (being deleted), 07 Ros (email tester, roster row switched off), 08 Old (a notice older than a
-- day), 09 Dec (said can't go), 10 Gil (going), 11 an anonymous account, 12 an unconfirmed one, 13 Amy and 14 Bob (two
-- accounts on one phone), 17 Eve, 19 Gus and 20 Ivy (phone only: they ask), 18 Fay (maintainer grant, has used the app:
-- asks, then is invited from contacts), 21 Lou and 23 Kit (web only) and 22 Ola and 24 Ned (have used the app; Lou folds
-- into Ola, Kit into Ned), 25 Zoe (a guest who is removed).
-- The Picnic (P1) is Hana's; its open link is L. Hana's Walk (P2) has the link W. Tokens are ExpoPushToken[<name>].
begin;
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at,banned_until,is_anonymous) values
 ('f4000000-0000-4000-8000-000000000001',null,null,'447700985001',now(),null,false),
 ('f4000000-0000-4000-8000-000000000002',null,null,'447700985002',now(),null,false),
 ('f4000000-0000-4000-8000-000000000003',null,null,'447700985003',now(),null,false),
 ('f4000000-0000-4000-8000-000000000004',null,null,'447700985004',now(),null,false),
 ('f4000000-0000-4000-8000-000000000005',null,null,'447700985005',now(),'2099-01-01 00:00+00',false),
 ('f4000000-0000-4000-8000-000000000006',null,null,'447700985006',now(),null,false),
 ('f4000000-0000-4000-8000-000000000007','push-disabled@resbite-test.invalid',now(),null,null,null,false),
 ('f4000000-0000-4000-8000-000000000008',null,null,'447700985008',now(),null,false),
 ('f4000000-0000-4000-8000-000000000009',null,null,'447700985009',now(),null,false),
 ('f4000000-0000-4000-8000-000000000010',null,null,'447700985010',now(),null,false),
 ('f4000000-0000-4000-8000-000000000011',null,null,'447700985011',now(),null,true),
 ('f4000000-0000-4000-8000-000000000012',null,null,'447700985012',null,null,false),
 ('f4000000-0000-4000-8000-000000000013',null,null,'447700985013',now(),null,false),
 ('f4000000-0000-4000-8000-000000000014',null,null,'447700985014',now(),null,false),
 ('f4000000-0000-4000-8000-000000000015',null,null,'447700985015',now(),null,false),
 ('f4000000-0000-4000-8000-000000000016',null,null,'447700985016',now(),null,false),
 ('f4000000-0000-4000-8000-000000000017',null,null,'447700985017',now(),null,false),
 ('f4000000-0000-4000-8000-000000000018',null,null,'447700985018',now(),null,false),
 ('f4000000-0000-4000-8000-000000000019',null,null,'447700985019',now(),null,false),
 ('f4000000-0000-4000-8000-000000000020',null,null,'447700985020',now(),null,false),
 ('f4000000-0000-4000-8000-000000000021',null,null,'447700985021',now(),null,false),
 ('f4000000-0000-4000-8000-000000000022',null,null,'447700985022',now(),null,false),
 ('f4000000-0000-4000-8000-000000000023',null,null,'447700985023',now(),null,false),
 ('f4000000-0000-4000-8000-000000000024',null,null,'447700985024',now(),null,false),
 ('f4000000-0000-4000-8000-000000000025',null,null,'447700985025',now(),null,false);
-- The anonymous and unconfirmed accounts have profiles, so a refusal comes from the account check, not the endpoint's key.
insert into public.profiles(id,display_name) values
 ('f4000000-0000-4000-8000-000000000001','Hana'),('f4000000-0000-4000-8000-000000000004','Mia'),
 ('f4000000-0000-4000-8000-000000000005','Ben'),('f4000000-0000-4000-8000-000000000006','Del'),
 ('f4000000-0000-4000-8000-000000000007','Ros'),('f4000000-0000-4000-8000-000000000008','Old'),
 ('f4000000-0000-4000-8000-000000000009','Dec'),('f4000000-0000-4000-8000-000000000010','Gil'),
 ('f4000000-0000-4000-8000-000000000011','Anon'),('f4000000-0000-4000-8000-000000000012','Unconfirmed'),
 ('f4000000-0000-4000-8000-000000000013','Amy'),('f4000000-0000-4000-8000-000000000014','Bob'),
 ('f4000000-0000-4000-8000-000000000018','Fay'),('f4000000-0000-4000-8000-000000000021','Lou'),
 ('f4000000-0000-4000-8000-000000000022','Ola'),('f4000000-0000-4000-8000-000000000023','Kit'),
 ('f4000000-0000-4000-8000-000000000024','Ned'),('f4000000-0000-4000-8000-000000000025','Zoe');
insert into private.beta_access(user_id,source)
 select ('f4000000-0000-4000-8000-0000000000'||n)::uuid,'maintainer' from unnest(array['01','04','05','06','08','09','10','13','14','18','22','24','25']) n;
insert into private.tester_roster(email,enabled) values ('push-disabled@resbite-test.invalid',false);
insert into private.app_sessions(user_id) values
 ('f4000000-0000-4000-8000-000000000001'),('f4000000-0000-4000-8000-000000000004'),('f4000000-0000-4000-8000-000000000018'),
 ('f4000000-0000-4000-8000-000000000022'),('f4000000-0000-4000-8000-000000000024');
update public.profiles set deletion_requested_at=now() where id='f4000000-0000-4000-8000-000000000006';
insert into public.plans(id,owner_id,title,description,starts_at,time_zone,place_label,guest_note,guest_note_at,categories) values
 ('f4100000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000001','Picnic','Secret description',
  '2099-07-01 12:00+00','UTC','Secret Park','Secret note',now(),array['community']),
 ('f4100000-0000-4000-8000-000000000002','f4000000-0000-4000-8000-000000000001','Walk','',
  '2099-07-02 10:00+00','UTC','Hill','',null,array['community']);
insert into private.plan_links(plan_id,code) values ('f4100000-0000-4000-8000-000000000001',repeat('L',22)),
 ('f4100000-0000-4000-8000-000000000002',repeat('W',22));
insert into public.attendees(plan_id,user_id,response)
 select 'f4100000-0000-4000-8000-000000000001',('f4000000-0000-4000-8000-0000000000'||n)::uuid,r
 from (values ('05','accepted'),('06','accepted'),('07','accepted'),('08','accepted'),('09','declined'),('10','accepted'),
  ('13','accepted'),('14','accepted'),('25','accepted')) v(n,r);
-- Endpoints of accounts that may not register (the banned, the leaving, the switched-off tester) were bound earlier.
insert into private.device_endpoints(token,user_id,platform) values
 ('ExpoPushToken[ben]','f4000000-0000-4000-8000-000000000005','ios'),
 ('ExpoPushToken[del]','f4000000-0000-4000-8000-000000000006','ios'),
 ('ExpoPushToken[ros]','f4000000-0000-4000-8000-000000000007','ios'),
 ('ExpoPushToken[old]','f4000000-0000-4000-8000-000000000008','ios'),
 ('ExpoPushToken[dec]','f4000000-0000-4000-8000-000000000009','ios'),
 ('ExpoPushToken[gil]','f4000000-0000-4000-8000-000000000010','android');
create temporary table push_jobs(step text, job jsonb);
grant select, insert on push_jobs to service_role;

-- Devices: who may register. The host and an invited member register; Ana, a phone-only account waiting for the host's
-- approval with no grant, registers too. Banned, leaving, anonymous, unconfirmed and signed-out callers get 42501.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f4000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.register_device('ExpoPushToken[hana]','ios');
do $$ begin
 begin perform public.register_device('not-a-token','ios'); raise exception 'A malformed token registered';
 exception when others then if sqlstate is distinct from '22023' or sqlerrm is distinct from 'Invalid endpoint' then raise; end if; end;
 begin perform public.register_device('ExpoPushToken[hana]','web'); raise exception 'An unknown platform registered';
 exception when others then if sqlstate is distinct from '22023' or sqlerrm is distinct from 'Invalid endpoint' then raise; end if; end;
 begin perform public.register_device('ExpoPushToken[hana]',null); raise exception 'A missing platform registered';
 exception when others then if sqlstate is distinct from '22023' or sqlerrm is distinct from 'Invalid endpoint' then raise; end if; end;
 begin perform public.register_device('ExpoPushToken[hana-new]',null); raise exception 'A missing platform registered a new token';
 exception when others then if sqlstate is distinct from '22023' or sqlerrm is distinct from 'Invalid endpoint' then raise; end if; end;
end $$;
select set_config('request.jwt.claims','{"sub":"f4000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select public.register_device('ExpoPushToken[mia]','android');
select set_config('request.jwt.claims','{"sub":"f4000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 r := public.request_to_join(repeat('L',22),'Ana','accepted','2026-10');
 if r->>'state' is distinct from 'waiting' then raise exception 'Ana is not waiting: %', r; end if;
 perform public.register_device('ExpoPushToken[ana]','ios');
end $$;
do $$ declare u text; begin
 foreach u in array array['05','06','11','12'] loop
  perform set_config('request.jwt.claims',json_build_object('sub','f4000000-0000-4000-8000-0000000000'||u,'role','authenticated')::text,true);
  begin perform public.register_device('ExpoPushToken[refused'||u||']','ios'); raise exception 'Account % registered a device', u;
  exception when others then if sqlstate is distinct from '42501' or sqlerrm is distinct from 'Sign-in required' then raise; end if; end;
 end loop;
 perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
 begin perform public.register_device('ExpoPushToken[nobody]','ios'); raise exception 'A signed-out caller registered a device';
 exception when others then if sqlstate is distinct from '42501' or sqlerrm is distinct from 'Sign-in required' then raise; end if; end;
end $$;
reset role;
do $$ begin
 if (select user_id from private.device_endpoints where token='ExpoPushToken[ana]') is distinct from 'f4000000-0000-4000-8000-000000000002'::uuid
  or (select platform from private.device_endpoints where token='ExpoPushToken[ana]') is distinct from 'ios' then
  raise exception 'The waiting account''s endpoint is missing';
 end if;
 if private.user_eligible('f4000000-0000-4000-8000-000000000002') or exists(select 1 from private.beta_access where user_id='f4000000-0000-4000-8000-000000000002') then
  raise exception 'Ana may already use the app: the test needs her waiting';
 end if;
 if exists(select 1 from private.device_endpoints where token in ('ExpoPushToken[refused05]','ExpoPushToken[refused06]',
   'ExpoPushToken[refused11]','ExpoPushToken[refused12]','ExpoPushToken[nobody]','not-a-token')) then
  raise exception 'A refused registration wrote an endpoint';
 end if;
end $$;

-- Eligibility (Review Focus 3). The host approves Ana (a live 'approval' grant) and invites Mia from her contacts; the
-- Picnic's time changes for the banned, the leaving, the switched-off tester, someone who said can't go and someone
-- going, and one notice is more than a day old.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f4000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 r := public.decide_join_request('f4100000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000002',true);
 if r->>'status' is distinct from 'approved' then raise exception 'Approval returned %', r; end if;
 r := public.invite_contacts('f4100000-0000-4000-8000-000000000001',
  jsonb_build_array(jsonb_build_object('phone','447700985004','country','44','code',repeat('M',22))));
 if r->0->>'kind' is distinct from 'app' then raise exception 'Mia was not invited in the app: %', r; end if;
end $$;
reset role;
insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id,detail,created_at)
 select 'f4100000-0000-4000-8000-000000000001',('f4000000-0000-4000-8000-0000000000'||n)::uuid,k,'push:'||name,
  'f4000000-0000-4000-8000-000000000001',d,now()-age
 from (values ('05','ben','plan_changed','time',interval '0'),('06','del','plan_changed','time',interval '0'),
  ('07','ros','plan_changed','time',interval '0'),('08','old','plan_changed','time',interval '25 hours'),
  ('09','dec','plan_changed','time',interval '0'),('09','dec-cancel','plan_cancelled',null,interval '0'),
  ('10','gil','plan_changed','time',interval '0')) v(n,name,k,d,age);
set local role service_role;
insert into push_jobs select 'eligibility', j from jsonb_array_elements(public.claim_notification_deliveries(25)) j;
reset role;
do $$ declare j jsonb; begin
 if not exists(select 1 from private.notification_deliveries d join private.notification_outbox o on o.id=d.outbox_id
   where o.kind='join_approved' and o.recipient_id='f4000000-0000-4000-8000-000000000002' and d.token='ExpoPushToken[ana]') then
  raise exception 'The phone-only guest with an approval grant has no join_approved delivery';
 end if;
 if not exists(select 1 from private.notification_deliveries d join private.notification_outbox o on o.id=d.outbox_id
   where o.kind='invited' and o.recipient_id='f4000000-0000-4000-8000-000000000004' and d.token='ExpoPushToken[mia]') then
  raise exception 'The phone-only member has no invited delivery';
 end if;
 if not exists(select 1 from private.notification_deliveries d join private.notification_outbox o on o.id=d.outbox_id
   where o.dedupe_key='push:gil' and d.token='ExpoPushToken[gil]')
 or not exists(select 1 from private.notification_deliveries d join private.notification_outbox o on o.id=d.outbox_id
   where o.dedupe_key='push:dec-cancel' and d.token='ExpoPushToken[dec]') then
  raise exception 'A going guest''s change notice or a can''t-go guest''s cancellation has no delivery';
 end if;
 if exists(select 1 from private.notification_deliveries d join private.notification_outbox o on o.id=d.outbox_id
   where o.dedupe_key in ('push:ben','push:del','push:ros','push:old','push:dec')) then
  raise exception 'A banned, leaving, switched-off, can''t-go or day-old recipient has a delivery';
 end if;
 if exists(select 1 from private.notification_outbox where dedupe_key in ('push:ben','push:del','push:ros','push:old','push:dec')
   and (expanded_at is null or delivered_at is null)) then
  raise exception 'A notice nobody may get was left unprocessed';
 end if;
 -- Ana's request was decided before any claim: the host's notice about it is never expanded to the host's phone.
 if exists(select 1 from private.notification_deliveries d join private.notification_outbox o on o.id=d.outbox_id
   where o.kind='join_request' and o.actor_id='f4000000-0000-4000-8000-000000000002') then
  raise exception 'A request decided before the claim reached the host';
 end if;
 select job into j from push_jobs where step='eligibility' and job->>'kind'='join_approved';
 if j->>'token' is distinct from 'ExpoPushToken[ana]' or j->>'actor_name' is distinct from 'Hana' or j->>'title' is distinct from 'Picnic'
  or j->>'recipient_id' is distinct from 'f4000000-0000-4000-8000-000000000002' then
  raise exception 'join_approved job wrong: %', j;
 end if;
 select job into j from push_jobs where step='eligibility' and job->>'kind'='invited';
 if j->>'token' is distinct from 'ExpoPushToken[mia]' or j->>'actor_name' is distinct from 'Hana' then raise exception 'invited job wrong: %', j; end if;
 if (select count(*) from push_jobs where step='eligibility') is distinct from 4 then
  raise exception 'Four jobs expected: %', (select jsonb_agg(job) from push_jobs where step='eligibility');
 end if;
 if (select string_agg(job::text,'') from push_jobs) like '%Secret%' then raise exception 'A job carries the place, note or description'; end if;
end $$;

-- join_request (Review Focus 2). Bea, Cal and Dot ask; the claim hands the host's three notices to a worker. Cal changes
-- the answer while waiting: no second notice, and the first is still valid. The worker retries Bea's (back to pending)
-- and still holds Dot's lease when the host approves Bea and declines Dot. The next claim suppresses Bea's pending row;
-- Dot's lease fails validation and the worker suppresses it. No later claim sends the host either notice.
set local role authenticated;
do $$ declare u text; r jsonb; begin
 foreach u in array array['03:Bea:maybe','15:Cal:accepted','16:Dot:accepted'] loop
  perform set_config('request.jwt.claims',json_build_object('sub','f4000000-0000-4000-8000-0000000000'||split_part(u,':',1),'role','authenticated')::text,true);
  r := public.request_to_join(repeat('L',22),split_part(u,':',2),split_part(u,':',3),'2026-10');
  if r->>'state' is distinct from 'waiting' then raise exception '% is not waiting: %', u, r; end if;
 end loop;
end $$;
reset role;
insert into push_jobs select 'requests', j from jsonb_array_elements(public.claim_notification_deliveries(25)) j;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f4000000-0000-4000-8000-000000000015","role":"authenticated"}',true);
select public.change_join_answer('f4100000-0000-4000-8000-000000000001','maybe');
reset role;
do $$ declare j jsonb; n text; begin
 foreach n in array array['Bea','Cal','Dot'] loop
  select job into j from push_jobs where step='requests' and job->>'kind'='join_request' and job->>'actor_name'=n;
  if j->>'token' is distinct from 'ExpoPushToken[hana]' or j->>'recipient_id' is distinct from 'f4000000-0000-4000-8000-000000000001'
   or j->>'title' is distinct from 'Picnic' then
   raise exception 'The waiting request''s notice from % did not reach the host''s endpoint: %', n, j;
  end if;
 end loop;
 if (select count(*) from private.notification_outbox where actor_id='f4000000-0000-4000-8000-000000000015') is distinct from 1 then
  raise exception 'Changing the answer queued another notice';
 end if;
 select job into j from push_jobs where step='requests' and job->>'actor_name'='Cal';
 if not public.validate_notification_delivery((j->>'id')::uuid,(j->>'lease_id')::uuid) then raise exception 'Cal''s notice was fenced after the answer changed'; end if;
 perform public.finish_notification_delivery((j->>'id')::uuid,(j->>'lease_id')::uuid,'ticket','push-ticket-cal');
 select job into j from push_jobs where step='requests' and job->>'actor_name'='Bea';
 perform public.finish_notification_delivery((j->>'id')::uuid,(j->>'lease_id')::uuid,'retry');
 if (select state from private.notification_deliveries where id=(j->>'id')::uuid) is distinct from 'pending' then raise exception 'Bea''s row is not pending'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f4000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.decide_join_request('f4100000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000003',true);
select public.decide_join_request('f4100000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000016',false);
reset role;
insert into push_jobs select 'decided', j from jsonb_array_elements(public.claim_notification_deliveries(25)) j;
do $$ declare bea jsonb; dot jsonb; begin
 select job into bea from push_jobs where step='requests' and job->>'actor_name'='Bea';
 select job into dot from push_jobs where step='requests' and job->>'actor_name'='Dot';
 if (select state from private.notification_deliveries where id=(bea->>'id')::uuid) is distinct from 'suppressed' then
  raise exception 'The claim left the approved request''s pending row: %', (select state from private.notification_deliveries where id=(bea->>'id')::uuid);
 end if;
 if exists(select 1 from push_jobs where step='decided' and job->>'token'='ExpoPushToken[hana]') then
  raise exception 'The claim handed out a decided request''s notice';
 end if;
 if (select state from private.notification_deliveries where id=(dot->>'id')::uuid) is distinct from 'sending' then
  raise exception 'The claim took over a live lease';
 end if;
 if public.validate_notification_delivery((dot->>'id')::uuid,(dot->>'lease_id')::uuid) then raise exception 'A declined request''s leased notice validated'; end if;
 perform public.finish_notification_delivery((dot->>'id')::uuid,(dot->>'lease_id')::uuid,'suppressed');
 if (select state from private.notification_deliveries where id=(dot->>'id')::uuid) is distinct from 'suppressed' then raise exception 'Dot''s row is not suppressed'; end if;
 update private.notification_deliveries set next_attempt_at=now() where token='ExpoPushToken[hana]';
end $$;
insert into push_jobs select 'later', j from jsonb_array_elements(public.claim_notification_deliveries(25)) j;
do $$ begin
 if exists(select 1 from push_jobs where step='later' and job->>'kind'='join_request' and job->>'actor_name' in ('Bea','Dot')) then
  raise exception 'A later claim sends a decided request''s notice';
 end if;
 if exists(select 1 from private.notification_outbox where kind='join_request' and actor_id in ('f4000000-0000-4000-8000-000000000003','f4000000-0000-4000-8000-000000000016')
   and delivered_at is null) then
  raise exception 'A decided request''s notice is still open';
 end if;
end $$;

-- A request's notice goes out only for the request the host would see in their list (plan_join_requests).
-- Eve asks; the host approves her before any claim, removes her, and she asks again: only the new waiting period's
-- notice is sent, never the first one. now() is fixed inside this block, so Eve's first request and its notice are moved
-- an hour back, as if made then. Fay asks, then the host invites her from contacts while she is still waiting: she is on
-- the event another way, so nothing is sent. Gus asks on the Walk, which the host then cancels: nothing is sent. Ivy asks,
-- then her account is being deleted: nothing is sent.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f4000000-0000-4000-8000-000000000017","role":"authenticated"}',true);
select public.request_to_join(repeat('L',22),'Eve','accepted','2026-10');
reset role;
update private.notification_outbox set created_at=created_at-interval '1 hour',
  dedupe_key='join:f4100000-0000-4000-8000-000000000001:f4000000-0000-4000-8000-000000000017:'
  ||(select id from private.plan_links where code=repeat('L',22))||':'||extract(epoch from now()-interval '1 hour')
 where kind='join_request' and actor_id='f4000000-0000-4000-8000-000000000017';
update private.join_requests set created_at=created_at-interval '1 hour' where user_id='f4000000-0000-4000-8000-000000000017';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f4000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.decide_join_request('f4100000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000017',true);
select public.remove_guest('f4100000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000017');
select set_config('request.jwt.claims','{"sub":"f4000000-0000-4000-8000-000000000017","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 r := public.request_to_join(repeat('L',22),null,'maybe',null);
 if r->>'state' is distinct from 'waiting' then raise exception 'Eve is not waiting again: %', r; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"f4000000-0000-4000-8000-000000000018","role":"authenticated"}',true);
select public.request_to_join(repeat('L',22),null,'accepted',null);
select set_config('request.jwt.claims','{"sub":"f4000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 r := public.invite_contacts('f4100000-0000-4000-8000-000000000001',
  jsonb_build_array(jsonb_build_object('phone','447700985018','country','44','code',repeat('F',22))));
 if r->0->>'kind' is distinct from 'app' then raise exception 'Fay was not invited in the app: %', r; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"f4000000-0000-4000-8000-000000000019","role":"authenticated"}',true);
select public.request_to_join(repeat('W',22),'Gus','accepted','2026-10');
select set_config('request.jwt.claims','{"sub":"f4000000-0000-4000-8000-000000000020","role":"authenticated"}',true);
select public.request_to_join(repeat('L',22),'Ivy','accepted','2026-10');
select set_config('request.jwt.claims','{"sub":"f4000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.change_plan_v3('f4100000-0000-4000-8000-000000000002',1,'Walk','',array['community'],'2099-07-02 10:00+00',null,'UTC','Hill','',true);
reset role;
update public.profiles set deletion_requested_at=now() where id='f4000000-0000-4000-8000-000000000020';
do $$ begin
 if (select count(*) from private.join_requests where status='waiting' and user_id in ('f4000000-0000-4000-8000-000000000017',
   'f4000000-0000-4000-8000-000000000018','f4000000-0000-4000-8000-000000000019','f4000000-0000-4000-8000-000000000020')) is distinct from 4
 or not exists(select 1 from public.attendees where plan_id='f4100000-0000-4000-8000-000000000001' and user_id='f4000000-0000-4000-8000-000000000018')
 or (select count(*) from private.notification_outbox where kind='join_request' and actor_id='f4000000-0000-4000-8000-000000000017') is distinct from 2 then
  raise exception 'The requests are not set up as the test needs';
 end if;
end $$;
insert into push_jobs select 'periods', j from jsonb_array_elements(public.claim_notification_deliveries(25)) j;
do $$ declare v text; begin
 if (select count(*) from push_jobs where step='periods' and job->>'kind'='join_request' and job->>'actor_name'='Eve') is distinct from 1 then
  raise exception 'Eve''s notices sent: %', (select jsonb_agg(job) from push_jobs where step='periods' and job->>'actor_name'='Eve');
 end if;
 if exists(select 1 from private.notification_deliveries d join private.notification_outbox o on o.id=d.outbox_id
   where o.kind='join_request' and o.actor_id='f4000000-0000-4000-8000-000000000017' and o.created_at<now()) then
  raise exception 'The first waiting period''s notice revived';
 end if;
 select string_agg(p.display_name,', ' order by p.display_name) into v from private.notification_deliveries d
  join private.notification_outbox o on o.id=d.outbox_id join public.profiles p on p.id=o.actor_id
  where o.kind='join_request' and o.actor_id in ('f4000000-0000-4000-8000-000000000018','f4000000-0000-4000-8000-000000000019',
   'f4000000-0000-4000-8000-000000000020');
 if v is not null then
  raise exception 'A notice went out for a request the host doesn''t see (Fay on the event, Gus''s cancelled Walk, Ivy leaving): %', v;
 end if;
 if exists(select 1 from private.notification_outbox where kind='join_request' and delivered_at is null and actor_id in
   ('f4000000-0000-4000-8000-000000000018','f4000000-0000-4000-8000-000000000019','f4000000-0000-4000-8000-000000000020')) then
  raise exception 'A notice nobody may get was left unprocessed';
 end if;
end $$;

-- A removed guest gets nothing: Zoe's Note to guests and a change of time are queued, the host removes her, and the
-- claim sends her neither.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f4000000-0000-4000-8000-000000000025","role":"authenticated"}',true);
select public.register_device('ExpoPushToken[zoe]','ios');
reset role;
insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id) values
 ('f4100000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000025','guest_note','push:zoe','f4000000-0000-4000-8000-000000000001');
insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id,detail) values
 ('f4100000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000025','plan_changed','push:zoe-change','f4000000-0000-4000-8000-000000000001','time');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f4000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.remove_guest('f4100000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000025');
reset role;
insert into push_jobs select 'removed', j from jsonb_array_elements(public.claim_notification_deliveries(25)) j;
do $$ begin
 if exists(select 1 from push_jobs where step='removed' and job->>'token'='ExpoPushToken[zoe]')
 or exists(select 1 from private.notification_deliveries where token='ExpoPushToken[zoe]') then
  raise exception 'A removed guest was sent a notice';
 end if;
 if exists(select 1 from private.notification_outbox where dedupe_key in ('push:zoe','push:zoe-change') and delivered_at is null)
 or (select count(*) from private.notification_outbox where dedupe_key in ('push:zoe','push:zoe-change'))<>2 then
  raise exception 'A removed guest''s notice is still open';
 end if;
end $$;

-- Two accounts on one phone (Review Focus 1). Amy registers the phone; her change notice is claimed and retried (pending).
-- Bob signs in on the same phone and registers the same token: the endpoint is rebound to him with a new generation, and
-- the next claim suppresses Amy's pending row. Bob's own notice then reaches the phone, and registering again with the
-- same account and platform keeps the generation, so his in-flight send stays valid.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f4000000-0000-4000-8000-000000000013","role":"authenticated"}',true);
select public.register_device('ExpoPushToken[shared]','ios');
reset role;
insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id,detail) values
 ('f4100000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000013','plan_changed','push:amy','f4000000-0000-4000-8000-000000000001','place');
insert into push_jobs select 'amy', j from jsonb_array_elements(public.claim_notification_deliveries(25)) j;
do $$ declare j jsonb; begin
 select job into j from push_jobs where step='amy' and job->>'token'='ExpoPushToken[shared]';
 if j->>'recipient_id' is distinct from 'f4000000-0000-4000-8000-000000000013' then raise exception 'Amy''s notice missing: %', j; end if;
 perform public.finish_notification_delivery((j->>'id')::uuid,(j->>'lease_id')::uuid,'retry');
end $$;
create temporary table push_generation as select updated_at from private.device_endpoints where token='ExpoPushToken[shared]';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f4000000-0000-4000-8000-000000000014","role":"authenticated"}',true);
select public.register_device('ExpoPushToken[shared]','ios');
reset role;
do $$ begin
 if (select user_id from private.device_endpoints where token='ExpoPushToken[shared]') is distinct from 'f4000000-0000-4000-8000-000000000014'::uuid then
  raise exception 'The token was not rebound to the second account';
 end if;
 if (select updated_at from private.device_endpoints where token='ExpoPushToken[shared]') <= (select updated_at from push_generation) then
  raise exception 'Rebinding kept the old generation';
 end if;
end $$;
insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id,detail) values
 ('f4100000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000014','plan_changed','push:bob','f4000000-0000-4000-8000-000000000001','place');
insert into push_jobs select 'bob', j from jsonb_array_elements(public.claim_notification_deliveries(25)) j;
do $$ declare j jsonb; begin
 if (select d.state from private.notification_deliveries d join private.notification_outbox o on o.id=d.outbox_id where o.dedupe_key='push:amy')
  is distinct from 'suppressed' then
  raise exception 'The first account''s pending row survived the rebinding';
 end if;
 if exists(select 1 from push_jobs where step='bob' and job->>'recipient_id'='f4000000-0000-4000-8000-000000000013') then
  raise exception 'The first account''s notice was sent to the rebound phone';
 end if;
 select job into j from push_jobs where step='bob' and job->>'token'='ExpoPushToken[shared]';
 if j->>'recipient_id' is distinct from 'f4000000-0000-4000-8000-000000000014' then raise exception 'Bob''s notice did not reach the phone: %', j; end if;
end $$;
set local role authenticated;
select public.register_device('ExpoPushToken[shared]','ios');
reset role;
do $$ declare j jsonb; begin
 select job into j from push_jobs where step='bob' and job->>'token'='ExpoPushToken[shared]';
 if not public.validate_notification_delivery((j->>'id')::uuid,(j->>'lease_id')::uuid) then raise exception 'Registering the same binding again fenced the send'; end if;
end $$;

-- unregister_device removes only the caller's own token (its body is private, behind the public façade).
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f4000000-0000-4000-8000-000000000010","role":"authenticated"}',true);
select public.unregister_device('ExpoPushToken[hana]');
select public.unregister_device('ExpoPushToken[gil]');
reset role;
do $$ begin
 if not exists(select 1 from private.device_endpoints where token='ExpoPushToken[hana]') then raise exception 'Another account''s token was removed'; end if;
 if exists(select 1 from private.device_endpoints where token='ExpoPushToken[gil]') then raise exception 'The caller''s own token was not removed'; end if;
end $$;

-- anon may call neither device function.
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ begin
 begin perform public.register_device('ExpoPushToken[anon]','ios'); raise exception 'anon registered a device';
 exception when insufficient_privilege then null; end;
 begin perform public.unregister_device('ExpoPushToken[hana]'); raise exception 'anon unregistered a device';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.register_device(text,text)','execute') or has_function_privilege('anon','private.register_device(text,text)','execute')
  or has_function_privilege('anon','public.unregister_device(text)','execute') or has_function_privilege('anon','private.unregister_device(text)','execute') then
  raise exception 'anon may call a device function';
 end if;
 if not has_function_privilege('authenticated','public.register_device(text,text)','execute') or not has_function_privilege('authenticated','private.register_device(text,text)','execute')
  or not has_function_privilege('authenticated','public.unregister_device(text)','execute')
  or not has_function_privilege('authenticated','private.unregister_device(text)','execute') then
  raise exception 'A signed-in account may not call a device function';
 end if;
end $$;

-- Fold (Review Focus 5's missing name): Lou, a web-only account, asks to join; her notice to the host hasn't gone out.
-- Folding Lou into Ola moves it to Ola, so the claim names Ola; a notice Lou caused that has gone out is left alone.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f4000000-0000-4000-8000-000000000021","role":"authenticated"}',true);
select public.request_to_join(repeat('L',22),null,'accepted','2026-10');
reset role;
insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id,detail,delivered_at) values
 ('f4100000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000001','rsvp','push:lou-sent','f4000000-0000-4000-8000-000000000021','accepted',now());
set local role service_role;
select public.fold_web_account('f4000000-0000-4000-8000-000000000021','f4000000-0000-4000-8000-000000000022');
reset role;
insert into push_jobs select 'fold', j from jsonb_array_elements(public.claim_notification_deliveries(25)) j;
do $$ declare j jsonb; begin
 if (select actor_id from private.notification_outbox where kind='join_request' and dedupe_key like 'join:f4100000-0000-4000-8000-000000000001:f4000000-0000-4000-8000-000000000021:%')
  is distinct from 'f4000000-0000-4000-8000-000000000022'::uuid then
  raise exception 'The undelivered notice did not move to the app account';
 end if;
 if (select actor_id from private.notification_outbox where dedupe_key='push:lou-sent') is not null then
  raise exception 'A delivered notice was moved';
 end if;
 if exists(select 1 from public.profiles where id='f4000000-0000-4000-8000-000000000021') then raise exception 'The web profile is still there'; end if;
 select job into j from push_jobs where step='fold' and job->>'kind'='join_request';
 if j->>'actor_name' is distinct from 'Ola' or j->>'token' is distinct from 'ExpoPushToken[hana]' then
  raise exception 'The folded request''s notice does not name the app account: %', j;
 end if;
end $$;

-- Fold duplicates: Ned (has used the app) asked on the Picnic, then so did Kit (web only), with the same number. Ned's own
-- request stands and Kit's goes, so Kit's unsent notice goes too: the host is told once, by Ned's.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f4000000-0000-4000-8000-000000000024","role":"authenticated"}',true);
select public.request_to_join(repeat('L',22),null,'accepted',null);
select set_config('request.jwt.claims','{"sub":"f4000000-0000-4000-8000-000000000023","role":"authenticated"}',true);
select public.request_to_join(repeat('L',22),null,'maybe','2026-10');
reset role;
set local role service_role;
select public.fold_web_account('f4000000-0000-4000-8000-000000000023','f4000000-0000-4000-8000-000000000024');
reset role;
insert into push_jobs select 'fold-duplicate', j from jsonb_array_elements(public.claim_notification_deliveries(25)) j;
do $$ begin
 if (select count(*) from push_jobs where step='fold-duplicate' and job->>'kind'='join_request' and job->>'token'='ExpoPushToken[hana]')
  is distinct from 1 then
  raise exception 'The host was not told exactly once: %', (select jsonb_agg(job) from push_jobs where step='fold-duplicate');
 end if;
 if (select job->>'actor_name' from push_jobs where step='fold-duplicate' and job->>'kind'='join_request') is distinct from 'Ned' then
  raise exception 'The notice does not name the app account';
 end if;
 if exists(select 1 from private.notification_outbox where kind='join_request'
   and dedupe_key like 'join:f4100000-0000-4000-8000-000000000001:f4000000-0000-4000-8000-000000000023:%') then
  raise exception 'The web account''s duplicate notice was kept';
 end if;
 if (select response from private.join_requests where plan_id='f4100000-0000-4000-8000-000000000001' and user_id='f4000000-0000-4000-8000-000000000024')
  is distinct from 'accepted' then
  raise exception 'The app account''s own request was replaced';
 end if;
end $$;

-- Worker functions: service_role only. Private helpers and definers as in the house pattern.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f4000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 begin perform public.claim_notification_deliveries(); raise exception 'A signed-in account claimed deliveries';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ declare f text; r text; begin
 foreach f in array array['public.claim_notification_deliveries(integer)','public.validate_notification_delivery(uuid,uuid)',
  'public.finish_notification_delivery(uuid,uuid,text,text,integer)'] loop
  if not has_function_privilege('service_role',f,'execute') then raise exception 'service_role may not call %', f; end if;
  foreach r in array array['anon','authenticated'] loop
   if has_function_privilege(r,f,'execute') then raise exception '% may call %', r, f; end if;
  end loop;
  if not (select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid=f::regprocedure) then
   raise exception '% is not a definer with an empty search path', f;
  end if;
 end loop;
 foreach r in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(r,'private.notification_recipient_eligible(bigint)','execute') then raise exception '% may call the audience check', r; end if;
  if has_table_privilege(r,'private.notification_deliveries','select,insert,update,delete') then raise exception '% may touch the ledger', r; end if;
 end loop;
 if (select prosecdef from pg_proc where oid='public.register_device(text,text)'::regprocedure)
 or (select prosecdef from pg_proc where oid='public.unregister_device(text)'::regprocedure) then
  raise exception 'A public device façade is a definer';
 end if;
 if not (select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid='private.register_device(text,text)'::regprocedure)
 or not (select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid='private.unregister_device(text)'::regprocedure) then
  raise exception 'A private device body is not a definer with an empty search path';
 end if;
 if not (select relrowsecurity from pg_class where oid='private.notification_deliveries'::regclass) then raise exception 'The ledger has no RLS'; end if;
 if has_function_privilege('anon','public.fold_web_account(uuid,uuid)','execute') or has_function_privilege('authenticated','public.fold_web_account(uuid,uuid)','execute')
  or not has_function_privilege('service_role','public.fold_web_account(uuid,uuid)','execute')
  or has_function_privilege('service_role','private.fold_web_account(uuid,uuid)','execute') then
  raise exception 'The fold''s grants changed';
 end if;
end $$;

-- Same structure in both modes. In full mode the ledger, its indexes and constraints and expanded_at come from the
-- local-only 20260918001308_notification_delivery_preparation.sql; on the hosted baseline from 20261030120000. Both must
-- read exactly as below.
do $$ declare v text; begin
 select string_agg(format('%s %s %s %s',a.attname,pg_catalog.format_type(a.atttypid,a.atttypmod),
   case when a.attnotnull then 'not null' else 'null' end,coalesce(pg_catalog.pg_get_expr(d.adbin,d.adrelid),'-')),'; ' order by a.attnum) into v
  from pg_catalog.pg_attribute a left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
  where a.attrelid='private.notification_deliveries'::regclass and a.attnum>0 and not a.attisdropped;
 if v is distinct from 'id uuid not null gen_random_uuid(); outbox_id bigint not null -; token text not null -; '
  ||'endpoint_updated_at timestamp with time zone not null -; state text not null ''pending''::text; attempts integer not null 0; '
  ||'next_attempt_at timestamp with time zone not null now(); lease_id uuid null -; lease_until timestamp with time zone null -; '
  ||'ticket_id text null -; ticket_created_at timestamp with time zone null -' then
  raise exception 'Ledger columns differ: %', v;
 end if;
 select string_agg(conname||' '||pg_catalog.pg_get_constraintdef(oid),'; ' order by conname) into v
  from pg_catalog.pg_constraint where conrelid='private.notification_deliveries'::regclass;
 if v is distinct from 'notification_deliveries_outbox_id_fkey FOREIGN KEY (outbox_id) REFERENCES private.notification_outbox(id) ON DELETE CASCADE; '
  ||'notification_deliveries_outbox_id_token_key UNIQUE (outbox_id, token); notification_deliveries_pkey PRIMARY KEY (id); '
  ||'notification_deliveries_state_check CHECK ((state = ANY (ARRAY[''pending''::text, ''sending''::text, ''ticket''::text, ''received''::text, '
  ||'''failed''::text, ''invalid''::text, ''unknown''::text, ''suppressed''::text])))' then
  raise exception 'Ledger constraints differ: %', v;
 end if;
 select string_agg(pg_catalog.pg_get_indexdef(i.indexrelid),'; ' order by c.relname) into v
  from pg_catalog.pg_index i join pg_catalog.pg_class c on c.oid=i.indexrelid where i.indrelid='private.notification_deliveries'::regclass;
 if v is distinct from 'CREATE INDEX notification_deliveries_due_idx ON private.notification_deliveries USING btree (next_attempt_at) '
  ||'WHERE (state = ANY (ARRAY[''pending''::text, ''ticket''::text, ''sending''::text])); '
  ||'CREATE UNIQUE INDEX notification_deliveries_outbox_id_token_key ON private.notification_deliveries USING btree (outbox_id, token); '
  ||'CREATE UNIQUE INDEX notification_deliveries_pkey ON private.notification_deliveries USING btree (id)' then
  raise exception 'Ledger indexes differ: %', v;
 end if;
 select format('%s %s %s',pg_catalog.format_type(a.atttypid,a.atttypmod),case when a.attnotnull then 'not null' else 'null' end,
   coalesce(pg_catalog.pg_get_expr(d.adbin,d.adrelid),'-')) into v
  from pg_catalog.pg_attribute a left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
  where a.attrelid='private.notification_outbox'::regclass and a.attname='expanded_at' and not a.attisdropped;
 if v is distinct from 'timestamp with time zone null -' then raise exception 'expanded_at differs: %', v; end if;
 if pg_catalog.col_description('private.notification_outbox'::regclass,
   (select attnum from pg_catalog.pg_attribute where attrelid='private.notification_outbox'::regclass and attname='delivered_at'))
  is distinct from 'Worker processing finished across all endpoints; not a guarantee of delivery or reading. Inspect delivery ledger outcomes.' then
  raise exception 'delivered_at''s comment differs';
 end if;
 -- No other index on the outbox than the ones both modes share.
 select string_agg(c.relname,', ' order by c.relname) into v
  from pg_catalog.pg_index i join pg_catalog.pg_class c on c.oid=i.indexrelid where i.indrelid='private.notification_outbox'::regclass;
 if v is distinct from 'notification_outbox_actor_idx, notification_outbox_dedupe_key_key, notification_outbox_pending_idx, notification_outbox_pkey, '
  ||'notification_outbox_plan_idx, notification_outbox_recipient_idx' then
  raise exception 'Outbox indexes differ: %', v;
 end if;
end $$;
rollback;
