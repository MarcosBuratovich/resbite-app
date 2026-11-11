-- Connections follow-ups (docs/superpowers/plans/2026-11-11-connections-3-follow-ups.md, Task 1): the weekly roll
-- carries every guest, one who changed from Going to Can't go too (CH-P20,
-- docs/superpowers/specs/2026-11-10-groups-and-chat-design.md), and a connection request's notice says how the two stand
-- (CO-P5, docs/superpowers/specs/2026-11-10-connections-and-circles-design.md). Synthetic identities only (emails h1-…;
-- ids with the prefix f5, as h1 is not hexadecimal); one rolled-back block per slice.

-- Slice 1: the roll (CH-P20). Users f5…: 01 owner, 02 a guest who was Going and said Can't go (stored 'withdrawn'), 03 a
-- guest who said Can't go (declined), 04 a Going guest, 05 a Going guest the owner made an admin, who then said Can't go,
-- 06 a Going guest the owner then removed. All six have used the app. Plan f51…01 'Board game night' is 01's and
-- weekly; it ended an hour ago.
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('f5000000-0000-4000-8000-000000000001','h1-owner@resbite-test.invalid',now()),
 ('f5000000-0000-4000-8000-000000000002','h1-going-then-cant@resbite-test.invalid',now()),
 ('f5000000-0000-4000-8000-000000000003','h1-cant-go@resbite-test.invalid',now()),
 ('f5000000-0000-4000-8000-000000000004','h1-going@resbite-test.invalid',now()),
 ('f5000000-0000-4000-8000-000000000005','h1-admin@resbite-test.invalid',now()),
 ('f5000000-0000-4000-8000-000000000006','h1-removed@resbite-test.invalid',now());
insert into private.tester_roster(email) values ('h1-owner@resbite-test.invalid'),('h1-going-then-cant@resbite-test.invalid'),
 ('h1-cant-go@resbite-test.invalid'),('h1-going@resbite-test.invalid'),('h1-admin@resbite-test.invalid'),
 ('h1-removed@resbite-test.invalid');
insert into public.profiles(id,display_name) values
 ('f5000000-0000-4000-8000-000000000001','Owner'),('f5000000-0000-4000-8000-000000000002','Guest A'),
 ('f5000000-0000-4000-8000-000000000003','Guest B'),('f5000000-0000-4000-8000-000000000004','Guest C'),
 ('f5000000-0000-4000-8000-000000000005','Admin D'),('f5000000-0000-4000-8000-000000000006','Guest E');
insert into private.app_sessions(user_id) select ('f5000000-0000-4000-8000-0000000000'||n)::uuid
 from unnest(array['01','02','03','04','05','06']) n;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f5000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.create_plan_v4('f5100000-0000-4000-8000-000000000001','Board game night','',array['community'],null,
 '2099-06-04 19:00+00','2099-06-04 22:00+00','UTC','Kitchen',false,1::smallint,'');
reset role;
insert into public.attendees(plan_id,user_id,response) values
 ('f5100000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000002','accepted'),
 ('f5100000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000003','declined'),
 ('f5100000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000004','accepted'),
 ('f5100000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000005','accepted'),
 ('f5100000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000006','accepted');
-- 01 makes 05 an admin and removes 06, whose row goes. Then 02 and 05, both Going, say Can't go: the app stores it as
-- 'withdrawn', and it ends 05's admin role (CR-P15).
set local role authenticated;
select public.appoint_admin('f5100000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000005');
select public.remove_guest('f5100000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000006');
select set_config('request.jwt.claims','{"sub":"f5000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.respond('f5100000-0000-4000-8000-000000000001','withdrawn',1);
select set_config('request.jwt.claims','{"sub":"f5000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select public.respond('f5100000-0000-4000-8000-000000000001','withdrawn',1);
reset role;
do $$ begin
 if (select string_agg(right(user_id::text,2)||':'||response,',' order by user_id) from public.attendees
   where plan_id='f5100000-0000-4000-8000-000000000001') is distinct from '02:withdrawn,03:declined,04:accepted,05:withdrawn' then
  raise exception 'The replies before the roll are wrong';
 end if;
 if exists(select 1 from public.plan_admins where plan_id='f5100000-0000-4000-8000-000000000001') then
  raise exception 'Can''t go did not end the admin role';
 end if;
end $$;
update public.plans set starts_at=now()-interval '4 hours', ends_at=now()-interval '1 hour' where id='f5100000-0000-4000-8000-000000000001';

-- The roll, as the database runs it: every guest is carried, as not answered, and invited again with the "is on again"
-- notice ('invited', detail 'again'); 05 as a guest, not as an admin. 06, removed, has no row to carry: they are not
-- on the next occurrence and are not invited to it.
do $$ declare n public.plans; begin
 if private.roll_repeating_plans()<>1 then raise exception 'Expected exactly one plan rolled'; end if;
 select * into n from public.plans where repeats_from='f5100000-0000-4000-8000-000000000001';
 if not found then raise exception 'No next occurrence'; end if;
 if not exists(select 1 from public.attendees where plan_id=n.id and user_id='f5000000-0000-4000-8000-000000000002') then
  raise exception 'The guest who said Can''t go after Going was not carried';
 end if;
 if exists(select 1 from public.attendees where plan_id=n.id and user_id='f5000000-0000-4000-8000-000000000006')
 or exists(select 1 from private.notification_outbox where plan_id=n.id and recipient_id='f5000000-0000-4000-8000-000000000006') then
  raise exception 'The removed guest was carried, or invited again';
 end if;
 if (select array_agg(user_id order by user_id) from public.attendees where plan_id=n.id) is distinct from array[
   'f5000000-0000-4000-8000-000000000002','f5000000-0000-4000-8000-000000000003','f5000000-0000-4000-8000-000000000004',
   'f5000000-0000-4000-8000-000000000005']::uuid[] then
  raise exception 'Wrong people carried: %', (select array_agg(user_id order by user_id) from public.attendees where plan_id=n.id);
 end if;
 if exists(select 1 from public.attendees where plan_id=n.id and (response<>'pending' or version<>1)) then
  raise exception 'Replies did not start empty';
 end if;
 if exists(select 1 from public.plan_admins where plan_id=n.id) then raise exception 'The admin who said Can''t go was carried as an admin'; end if;
 if not exists(select 1 from private.notification_outbox where plan_id=n.id and recipient_id='f5000000-0000-4000-8000-000000000002'
   and kind='invited' and detail='again' and actor_id='f5000000-0000-4000-8000-000000000001'
   and dedupe_key='invited:'||n.id||':f5000000-0000-4000-8000-000000000002') then
  raise exception 'The guest who said Can''t go after Going was not invited again';
 end if;
 if (select array_agg(recipient_id order by recipient_id) from private.notification_outbox where plan_id=n.id) is distinct from array[
   'f5000000-0000-4000-8000-000000000002','f5000000-0000-4000-8000-000000000003','f5000000-0000-4000-8000-000000000004',
   'f5000000-0000-4000-8000-000000000005']::uuid[]
 or exists(select 1 from private.notification_outbox where plan_id=n.id and (kind<>'invited' or detail is distinct from 'again')) then
  raise exception 'Wrong invitations: %', (select array_agg(recipient_id order by recipient_id) from private.notification_outbox where plan_id=n.id);
 end if;
end $$;
rollback;

-- Slice 2: a request's notice says how the two stand on the resbite it was asked from (CO-P5). Both are going when each
-- is its owner or a guest whose own reply is Going or Maybe (an admin counts by their reply alone). 'going': it is on
-- (not cancelled, not ended) and both are going; 'met': it has ended, was not cancelled, and both were going;
-- 'were_invited': ended, and not 'met'; 'invited': not ended, and not 'going'. Users f5…: 01 owner, 02 and 04 Going, 03
-- Maybe, 06 Can't go, 07 a guest of the ended plans only, 08 an admin of Film night whose own reply is pending (as the
-- roll carries one). 01's plans: f51…02 'Film night' is open (02, 03, 04, 06, admin 08); f51…03 'Picnic' has ended (02
-- and 07 Going, 06 Can't go); f51…04 'Quiz' is cancelled and has not ended (02 and 04 Going); f51…05 'Brunch' was
-- cancelled and has ended (03 and 07 Going).
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('f5000000-0000-4000-8000-000000000001','h1-owner@resbite-test.invalid',now()),
 ('f5000000-0000-4000-8000-000000000002','h1-going@resbite-test.invalid',now()),
 ('f5000000-0000-4000-8000-000000000003','h1-maybe@resbite-test.invalid',now()),
 ('f5000000-0000-4000-8000-000000000004','h1-going-too@resbite-test.invalid',now()),
 ('f5000000-0000-4000-8000-000000000006','h1-cant-go@resbite-test.invalid',now()),
 ('f5000000-0000-4000-8000-000000000007','h1-picnic@resbite-test.invalid',now()),
 ('f5000000-0000-4000-8000-000000000008','h1-admin-pending@resbite-test.invalid',now());
insert into private.tester_roster(email) values ('h1-owner@resbite-test.invalid'),('h1-going@resbite-test.invalid'),
 ('h1-maybe@resbite-test.invalid'),('h1-going-too@resbite-test.invalid'),('h1-cant-go@resbite-test.invalid'),
 ('h1-picnic@resbite-test.invalid'),('h1-admin-pending@resbite-test.invalid');
insert into public.profiles(id,display_name) values
 ('f5000000-0000-4000-8000-000000000001','Owner'),('f5000000-0000-4000-8000-000000000002','Guest A'),
 ('f5000000-0000-4000-8000-000000000003','Guest B'),('f5000000-0000-4000-8000-000000000004','Guest C'),
 ('f5000000-0000-4000-8000-000000000006','Guest D'),('f5000000-0000-4000-8000-000000000007','Guest E'),
 ('f5000000-0000-4000-8000-000000000008','Admin F');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f5000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.create_plan_v4('f5100000-0000-4000-8000-000000000002','Film night','',array['community'],null,
 '2099-06-04 19:00+00','2099-06-04 22:00+00','UTC','Cinema',false,null,'');
select public.create_plan_v4('f5100000-0000-4000-8000-000000000003','Picnic','',array['community'],null,
 '2099-06-05 12:00+00','2099-06-05 15:00+00','UTC','Park',false,null,'');
select public.create_plan_v4('f5100000-0000-4000-8000-000000000004','Quiz','',array['community'],null,
 '2099-06-06 19:00+00','2099-06-06 22:00+00','UTC','Pub',false,null,'');
select public.create_plan_v4('f5100000-0000-4000-8000-000000000005','Brunch','',array['community'],null,
 '2099-06-07 10:00+00','2099-06-07 12:00+00','UTC','Cafe',false,null,'');
reset role;
insert into public.attendees(plan_id,user_id,response) values
 ('f5100000-0000-4000-8000-000000000002','f5000000-0000-4000-8000-000000000002','accepted'),
 ('f5100000-0000-4000-8000-000000000002','f5000000-0000-4000-8000-000000000003','maybe'),
 ('f5100000-0000-4000-8000-000000000002','f5000000-0000-4000-8000-000000000004','accepted'),
 ('f5100000-0000-4000-8000-000000000002','f5000000-0000-4000-8000-000000000006','declined'),
 ('f5100000-0000-4000-8000-000000000003','f5000000-0000-4000-8000-000000000002','accepted'),
 ('f5100000-0000-4000-8000-000000000003','f5000000-0000-4000-8000-000000000007','accepted'),
 ('f5100000-0000-4000-8000-000000000003','f5000000-0000-4000-8000-000000000006','declined'),
 ('f5100000-0000-4000-8000-000000000004','f5000000-0000-4000-8000-000000000002','accepted'),
 ('f5100000-0000-4000-8000-000000000004','f5000000-0000-4000-8000-000000000004','accepted'),
 ('f5100000-0000-4000-8000-000000000005','f5000000-0000-4000-8000-000000000003','accepted'),
 ('f5100000-0000-4000-8000-000000000005','f5000000-0000-4000-8000-000000000007','accepted'),
 ('f5100000-0000-4000-8000-000000000002','f5000000-0000-4000-8000-000000000008','pending');
insert into public.plan_admins(plan_id,user_id,appointed_by,appointed_at) values
 ('f5100000-0000-4000-8000-000000000002','f5000000-0000-4000-8000-000000000008','f5000000-0000-4000-8000-000000000001',now());
update public.plans set starts_at=now()-interval '4 hours', ends_at=now()-interval '1 hour'
 where id in ('f5100000-0000-4000-8000-000000000003','f5100000-0000-4000-8000-000000000005');
update public.plans set status='cancelled' where id in ('f5100000-0000-4000-8000-000000000004','f5100000-0000-4000-8000-000000000005');

-- 02 (Going) asks 03 (Maybe) on the open plan, 07 on the ended one and 04 on the cancelled one; 04 (Going) asks 06
-- (Can't go) on the open plan; 01, its owner (a host, with no guest row), asks 04 (Going) on it; 03 asks 07 on the
-- cancelled plan that has ended; 07 asks 06, who said Can't go, on the ended plan; 08, the admin who has not answered,
-- asks 04 (Going) on the open plan. Each is a new request.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f5000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if public.request_connection('f5000000-0000-4000-8000-000000000003','f5100000-0000-4000-8000-000000000002') is distinct from 'requested'
 or public.request_connection('f5000000-0000-4000-8000-000000000007','f5100000-0000-4000-8000-000000000003') is distinct from 'requested'
 or public.request_connection('f5000000-0000-4000-8000-000000000004','f5100000-0000-4000-8000-000000000004') is distinct from 'requested' then
  raise exception '02''s requests did not say requested';
 end if;
end $$;
select set_config('request.jwt.claims','{"sub":"f5000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin
 if public.request_connection('f5000000-0000-4000-8000-000000000006','f5100000-0000-4000-8000-000000000002') is distinct from 'requested' then
  raise exception '04''s request did not say requested';
 end if;
end $$;
select set_config('request.jwt.claims','{"sub":"f5000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 if public.request_connection('f5000000-0000-4000-8000-000000000004','f5100000-0000-4000-8000-000000000002') is distinct from 'requested' then
  raise exception 'The owner''s request did not say requested';
 end if;
end $$;
select set_config('request.jwt.claims','{"sub":"f5000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 if public.request_connection('f5000000-0000-4000-8000-000000000007','f5100000-0000-4000-8000-000000000005') is distinct from 'requested' then
  raise exception '03''s request did not say requested';
 end if;
end $$;
select set_config('request.jwt.claims','{"sub":"f5000000-0000-4000-8000-000000000007","role":"authenticated"}',true);
do $$ begin
 if public.request_connection('f5000000-0000-4000-8000-000000000006','f5100000-0000-4000-8000-000000000003') is distinct from 'requested' then
  raise exception '07''s request did not say requested';
 end if;
end $$;
select set_config('request.jwt.claims','{"sub":"f5000000-0000-4000-8000-000000000008","role":"authenticated"}',true);
do $$ begin
 if public.request_connection('f5000000-0000-4000-8000-000000000004','f5100000-0000-4000-8000-000000000002') is distinct from 'requested' then
  raise exception 'The pending admin''s request did not say requested';
 end if;
end $$;
reset role;
do $$ begin
 if (select detail from private.notification_outbox where kind='connection_request'
   and actor_id='f5000000-0000-4000-8000-000000000002' and recipient_id='f5000000-0000-4000-8000-000000000003') is distinct from 'going' then
  raise exception 'Going and Maybe on an open plan is not going: %', (select detail from private.notification_outbox where kind='connection_request'
   and actor_id='f5000000-0000-4000-8000-000000000002' and recipient_id='f5000000-0000-4000-8000-000000000003');
 end if;
 if (select detail from private.notification_outbox where kind='connection_request'
   and actor_id='f5000000-0000-4000-8000-000000000004' and recipient_id='f5000000-0000-4000-8000-000000000006') is distinct from 'invited' then
  raise exception 'Going and Can''t go on an open plan is not invited';
 end if;
 if (select detail from private.notification_outbox where kind='connection_request'
   and actor_id='f5000000-0000-4000-8000-000000000002' and recipient_id='f5000000-0000-4000-8000-000000000007') is distinct from 'met' then
  raise exception 'Two guests of an ended plan did not meet';
 end if;
 if (select detail from private.notification_outbox where kind='connection_request'
   and actor_id='f5000000-0000-4000-8000-000000000001' and recipient_id='f5000000-0000-4000-8000-000000000004') is distinct from 'going' then
  raise exception 'The owner and a Going guest on an open plan is not going';
 end if;
 if (select detail from private.notification_outbox where kind='connection_request'
   and actor_id='f5000000-0000-4000-8000-000000000002' and recipient_id='f5000000-0000-4000-8000-000000000004') is distinct from 'invited' then
  raise exception 'Two Going guests of a cancelled plan that has not ended is not invited';
 end if;
 if (select detail from private.notification_outbox where kind='connection_request'
   and actor_id='f5000000-0000-4000-8000-000000000003' and recipient_id='f5000000-0000-4000-8000-000000000007') is distinct from 'were_invited' then
  raise exception 'Two Going guests of a cancelled plan that has ended is not were_invited: %', (select detail from private.notification_outbox
   where kind='connection_request' and actor_id='f5000000-0000-4000-8000-000000000003' and recipient_id='f5000000-0000-4000-8000-000000000007');
 end if;
 if (select detail from private.notification_outbox where kind='connection_request'
   and actor_id='f5000000-0000-4000-8000-000000000007' and recipient_id='f5000000-0000-4000-8000-000000000006') is distinct from 'were_invited' then
  raise exception 'Going and Can''t go on an ended plan is not were_invited: %', (select detail from private.notification_outbox
   where kind='connection_request' and actor_id='f5000000-0000-4000-8000-000000000007' and recipient_id='f5000000-0000-4000-8000-000000000006');
 end if;
 if (select detail from private.notification_outbox where kind='connection_request'
   and actor_id='f5000000-0000-4000-8000-000000000008' and recipient_id='f5000000-0000-4000-8000-000000000004') is distinct from 'invited' then
  raise exception 'A pending admin and a Going guest on an open plan is not invited: %', (select detail from private.notification_outbox
   where kind='connection_request' and actor_id='f5000000-0000-4000-8000-000000000008' and recipient_id='f5000000-0000-4000-8000-000000000004');
 end if;
 if (select count(*) from private.notification_outbox where kind='connection_request')<>8 then raise exception 'Eight request notices expected'; end if;
end $$;

-- The Connections card says the same (Ruling 6): a request's context, read by the person asked, is how the two stand on
-- the series' latest occurrence they may read, here the resbite each request came from, as the push's detail. 04 has
-- 01's request (going), 02's from the cancelled Quiz (invited) and 08's, the admin who has not answered (invited); 06
-- has 04's (invited) and 07's from the ended Picnic 06 said Can't go to (were_invited); 03 has 02's (going); 07 has 02's
-- from Picnic (met) and 03's from the cancelled Brunch (were_invited).
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f5000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin
 if (select string_agg(right(r->>'user_id',2)||':'||(r->>'context'),',' order by r->>'user_id')
   from jsonb_array_elements(public.my_connections()->'requests') r) is distinct from '01:going,02:invited,08:invited' then
  raise exception 'The card of 04, asked by the owner, from a cancelled plan and by a pending admin, is wrong: %', public.my_connections()->'requests';
 end if;
end $$;
select set_config('request.jwt.claims','{"sub":"f5000000-0000-4000-8000-000000000006","role":"authenticated"}',true);
do $$ begin
 if (select string_agg(right(r->>'user_id',2)||':'||(r->>'context'),',' order by r->>'user_id')
   from jsonb_array_elements(public.my_connections()->'requests') r) is distinct from '04:invited,07:were_invited' then
  raise exception 'The card of 06, who said Can''t go, is wrong: %', public.my_connections()->'requests';
 end if;
end $$;
select set_config('request.jwt.claims','{"sub":"f5000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 if (select string_agg(right(r->>'user_id',2)||':'||(r->>'context'),',' order by r->>'user_id')
   from jsonb_array_elements(public.my_connections()->'requests') r) is distinct from '02:going' then
  raise exception 'The card of 03, both going, is wrong: %', public.my_connections()->'requests';
 end if;
end $$;
select set_config('request.jwt.claims','{"sub":"f5000000-0000-4000-8000-000000000007","role":"authenticated"}',true);
do $$ begin
 if (select string_agg(right(r->>'user_id',2)||':'||(r->>'context'),',' order by r->>'user_id')
   from jsonb_array_elements(public.my_connections()->'requests') r) is distinct from '02:met,03:were_invited' then
  raise exception 'The card of 07, on two ended plans, is wrong: %', public.my_connections()->'requests';
 end if;
end $$;
reset role;
-- The helper is the database's own: no API role may call it.
do $$ declare r text; begin
 foreach r in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(r,'private.pair_standing(uuid,uuid,uuid)','execute') then raise exception '% may call pair_standing', r; end if;
 end loop;
end $$;

-- Not on the latest occurrence (Rulings 7 and 14): the card reads the series' latest occurrence the person asked may
-- read, and the requester may have no place on it (not carried, or removed): then pair_standing has nothing to say
-- (null) and the card is 'from', never 'invited' or 'met'. 01's 'Supper' f51…06 has 03 and 08 Going; its next
-- occurrence f51…07 has 08 only. 03 asks 08 from the first: the push says 'going', and 08's card, on the next one,
-- says 'from'.
insert into public.plans(id,owner_id,title,starts_at,ends_at,time_zone,place_label,categories) values
 ('f5100000-0000-4000-8000-000000000006','f5000000-0000-4000-8000-000000000001','Supper',
  '2099-06-08 19:00+00','2099-06-08 22:00+00','UTC','Kitchen',array['community']);
insert into public.plans(id,owner_id,title,starts_at,ends_at,time_zone,place_label,categories,series_id) values
 ('f5100000-0000-4000-8000-000000000007','f5000000-0000-4000-8000-000000000001','Supper',
  '2099-06-15 19:00+00','2099-06-15 22:00+00','UTC','Kitchen',array['community'],'f5100000-0000-4000-8000-000000000006');
insert into public.attendees(plan_id,user_id,response) values
 ('f5100000-0000-4000-8000-000000000006','f5000000-0000-4000-8000-000000000003','accepted'),
 ('f5100000-0000-4000-8000-000000000006','f5000000-0000-4000-8000-000000000008','accepted'),
 ('f5100000-0000-4000-8000-000000000007','f5000000-0000-4000-8000-000000000008','accepted');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f5000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 if public.request_connection('f5000000-0000-4000-8000-000000000008','f5100000-0000-4000-8000-000000000006') is distinct from 'requested' then
  raise exception '03''s request from Supper did not say requested';
 end if;
end $$;
select set_config('request.jwt.claims','{"sub":"f5000000-0000-4000-8000-000000000008","role":"authenticated"}',true);
do $$ begin
 if (select string_agg(right(r->>'user_id',2)||':'||(r->>'title')||':'||(r->>'context'),',' order by r->>'user_id')
   from jsonb_array_elements(public.my_connections()->'requests') r) is distinct from '03:Supper:from' then
  raise exception 'The card of 08, asked by 03 who is not on the latest occurrence, is wrong: %', public.my_connections()->'requests';
 end if;
end $$;
reset role;
do $$ begin
 if (select detail from private.notification_outbox where kind='connection_request'
   and actor_id='f5000000-0000-4000-8000-000000000003' and recipient_id='f5000000-0000-4000-8000-000000000008') is distinct from 'going' then
  raise exception 'Two Going guests of the first Supper is not going';
 end if;
 -- Either way round, and on an ended or cancelled occurrence too: no place is null.
 if private.pair_standing('f5100000-0000-4000-8000-000000000007','f5000000-0000-4000-8000-000000000003','f5000000-0000-4000-8000-000000000008') is not null
 or private.pair_standing('f5100000-0000-4000-8000-000000000007','f5000000-0000-4000-8000-000000000008','f5000000-0000-4000-8000-000000000003') is not null then
  raise exception 'Someone with no place on the occurrence gave a standing';
 end if;
 update public.plans set status='cancelled' where id='f5100000-0000-4000-8000-000000000007';
 if private.pair_standing('f5100000-0000-4000-8000-000000000007','f5000000-0000-4000-8000-000000000003','f5000000-0000-4000-8000-000000000008') is not null then
  raise exception 'Someone with no place on a cancelled occurrence gave a standing';
 end if;
 update public.plans set starts_at=now()-interval '4 hours', ends_at=now()-interval '1 hour' where id='f5100000-0000-4000-8000-000000000007';
 if private.pair_standing('f5100000-0000-4000-8000-000000000007','f5000000-0000-4000-8000-000000000003','f5000000-0000-4000-8000-000000000008') is not null then
  raise exception 'Someone with no place on an ended, cancelled occurrence gave a standing';
 end if;
 -- A resbite that does not exist has no standing either, whoever is asked about.
 if private.pair_standing('f5100000-0000-4000-8000-0000000000ff','f5000000-0000-4000-8000-000000000003','f5000000-0000-4000-8000-000000000008') is not null
 or private.pair_standing(null,'f5000000-0000-4000-8000-000000000003','f5000000-0000-4000-8000-000000000008') is not null then
  raise exception 'An unknown resbite gave a standing';
 end if;
end $$;

-- Not answered on the latest occurrence (Rulings 11 and 14): someone who has not answered does not see who else is on
-- a resbite (UX-P5, private.can_see_guests), so their card does not say either: it is 'from', whatever the requester's
-- place there. 01's 'Walk' f51…08 has 06 and 08 Going; its next occurrence f51…09 has 08 Going and 06 not answered, as
-- the roll carries a guest. 08 asks 06 from the first: 06's card, on the next one, says 'from'; once 06 answers Going
-- there, it says how the two stand, 'going'.
insert into public.plans(id,owner_id,title,starts_at,ends_at,time_zone,place_label,categories) values
 ('f5100000-0000-4000-8000-000000000008','f5000000-0000-4000-8000-000000000001','Walk',
  '2099-06-09 10:00+00','2099-06-09 12:00+00','UTC','Park',array['community']);
insert into public.plans(id,owner_id,title,starts_at,ends_at,time_zone,place_label,categories,series_id) values
 ('f5100000-0000-4000-8000-000000000009','f5000000-0000-4000-8000-000000000001','Walk',
  '2099-06-16 10:00+00','2099-06-16 12:00+00','UTC','Park',array['community'],'f5100000-0000-4000-8000-000000000008');
insert into public.attendees(plan_id,user_id,response) values
 ('f5100000-0000-4000-8000-000000000008','f5000000-0000-4000-8000-000000000006','accepted'),
 ('f5100000-0000-4000-8000-000000000008','f5000000-0000-4000-8000-000000000008','accepted'),
 ('f5100000-0000-4000-8000-000000000009','f5000000-0000-4000-8000-000000000006','pending'),
 ('f5100000-0000-4000-8000-000000000009','f5000000-0000-4000-8000-000000000008','accepted');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f5000000-0000-4000-8000-000000000008","role":"authenticated"}',true);
do $$ begin
 if public.request_connection('f5000000-0000-4000-8000-000000000006','f5100000-0000-4000-8000-000000000008') is distinct from 'requested' then
  raise exception '08''s request from Walk did not say requested';
 end if;
end $$;
select set_config('request.jwt.claims','{"sub":"f5000000-0000-4000-8000-000000000006","role":"authenticated"}',true);
do $$ begin
 if (select string_agg(right(r->>'user_id',2)||':'||(r->>'title')||':'||(r->>'context'),',' order by r->>'user_id')
   from jsonb_array_elements(public.my_connections()->'requests') r where r->>'user_id'='f5000000-0000-4000-8000-000000000008')
   is distinct from '08:Walk:from' then
  raise exception 'The card of 06, who has not answered on the latest occurrence, is wrong: %', public.my_connections()->'requests';
 end if;
end $$;
select public.respond('f5100000-0000-4000-8000-000000000009','accepted',1);
do $$ begin
 if (select string_agg(right(r->>'user_id',2)||':'||(r->>'title')||':'||(r->>'context'),',' order by r->>'user_id')
   from jsonb_array_elements(public.my_connections()->'requests') r where r->>'user_id'='f5000000-0000-4000-8000-000000000008')
   is distinct from '08:Walk:going' then
  raise exception 'The card of 06, once Going on the latest occurrence, is wrong: %', public.my_connections()->'requests';
 end if;
end $$;
reset role;
do $$ begin
 if (select detail from private.notification_outbox where kind='connection_request'
   and actor_id='f5000000-0000-4000-8000-000000000008' and recipient_id='f5000000-0000-4000-8000-000000000006') is distinct from 'going' then
  raise exception 'Two Going guests of the first Walk is not going';
 end if;
end $$;

-- The detail check takes the four for a request only: 'soon' on a request, or any detail on an acceptance, is refused.
do $$ begin
 begin
  insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id,detail) values
   ('f5100000-0000-4000-8000-000000000002','f5000000-0000-4000-8000-000000000003','connection_request','h1-soon',
    'f5000000-0000-4000-8000-000000000002','soon');
  raise exception 'The detail check took soon on a request';
 exception when check_violation then null; end;
 begin
  insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id,detail) values
   ('f5100000-0000-4000-8000-000000000002','f5000000-0000-4000-8000-000000000002','connection_accepted','h1-accepted',
    'f5000000-0000-4000-8000-000000000003','going');
  raise exception 'The detail check took a detail on an acceptance';
 exception when check_violation then null; end;
end $$;
rollback;
