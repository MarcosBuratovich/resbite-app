-- Connections follow-ups (docs/superpowers/plans/2026-11-11-connections-3-follow-ups.md, Task 1): the weekly roll
-- carries every guest, one who changed from Going to Can't go too (CH-P20,
-- docs/superpowers/specs/2026-11-10-groups-and-chat-design.md), and a connection request's notice says how the two stand
-- (CO-P5, docs/superpowers/specs/2026-11-10-connections-and-circles-design.md). Synthetic identities only (emails h1-…;
-- ids with the prefix f5, as h1 is not hexadecimal); one rolled-back block per slice.

-- Slice 1: the roll (CH-P20). Users f5…: 01 owner, 02 a guest who was Going and said Can't go (stored 'withdrawn'), 03 a
-- guest who said Can't go (declined), 04 a Going guest, 05 a Going guest the owner made an admin, who then said Can't go.
-- All five have used the app. Plan f51…01 'Board game night' is 01's and weekly; it ended an hour ago.
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('f5000000-0000-4000-8000-000000000001','h1-owner@resbite-test.invalid',now()),
 ('f5000000-0000-4000-8000-000000000002','h1-going-then-cant@resbite-test.invalid',now()),
 ('f5000000-0000-4000-8000-000000000003','h1-cant-go@resbite-test.invalid',now()),
 ('f5000000-0000-4000-8000-000000000004','h1-going@resbite-test.invalid',now()),
 ('f5000000-0000-4000-8000-000000000005','h1-admin@resbite-test.invalid',now());
insert into private.tester_roster(email) values ('h1-owner@resbite-test.invalid'),('h1-going-then-cant@resbite-test.invalid'),
 ('h1-cant-go@resbite-test.invalid'),('h1-going@resbite-test.invalid'),('h1-admin@resbite-test.invalid');
insert into public.profiles(id,display_name) values
 ('f5000000-0000-4000-8000-000000000001','Owner'),('f5000000-0000-4000-8000-000000000002','Guest A'),
 ('f5000000-0000-4000-8000-000000000003','Guest B'),('f5000000-0000-4000-8000-000000000004','Guest C'),
 ('f5000000-0000-4000-8000-000000000005','Admin D');
insert into private.app_sessions(user_id) select ('f5000000-0000-4000-8000-0000000000'||n)::uuid
 from unnest(array['01','02','03','04','05']) n;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f5000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.create_plan_v4('f5100000-0000-4000-8000-000000000001','Board game night','',array['community'],null,
 '2099-06-04 19:00+00','2099-06-04 22:00+00','UTC','Kitchen',false,1::smallint,'');
reset role;
insert into public.attendees(plan_id,user_id,response) values
 ('f5100000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000002','accepted'),
 ('f5100000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000003','declined'),
 ('f5100000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000004','accepted'),
 ('f5100000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000005','accepted');
-- 01 makes 05 an admin. Then 02 and 05, both Going, say Can't go: the app stores it as 'withdrawn', and it ends 05's
-- admin role (CR-P15).
set local role authenticated;
select public.appoint_admin('f5100000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000005');
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
-- notice ('invited', detail 'again'); 05 as a guest, not as an admin.
do $$ declare n public.plans; begin
 if private.roll_repeating_plans()<>1 then raise exception 'Expected exactly one plan rolled'; end if;
 select * into n from public.plans where repeats_from='f5100000-0000-4000-8000-000000000001';
 if not found then raise exception 'No next occurrence'; end if;
 if not exists(select 1 from public.attendees where plan_id=n.id and user_id='f5000000-0000-4000-8000-000000000002') then
  raise exception 'The guest who said Can''t go after Going was not carried';
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

-- Slice 2: a request's notice says how the two stand on the resbite it was asked from (CO-P5): 'going' while it is on
-- (not cancelled, not ended) and both are on it (each a host, or a guest who is Going or Maybe), 'met' once it has
-- ended, else 'invited'. Users f5…: 01 owner, 02 and 04 Going, 03 Maybe, 06 Can't go, 07 a guest of the ended plan only.
-- 01's plans: f51…02 'Film night' is open (02, 03, 04, 06); f51…03 'Picnic' has ended (02 and 07 Going); f51…04 'Quiz'
-- is cancelled and has not ended (02 and 04 Going).
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('f5000000-0000-4000-8000-000000000001','h1-owner@resbite-test.invalid',now()),
 ('f5000000-0000-4000-8000-000000000002','h1-going@resbite-test.invalid',now()),
 ('f5000000-0000-4000-8000-000000000003','h1-maybe@resbite-test.invalid',now()),
 ('f5000000-0000-4000-8000-000000000004','h1-going-too@resbite-test.invalid',now()),
 ('f5000000-0000-4000-8000-000000000006','h1-cant-go@resbite-test.invalid',now()),
 ('f5000000-0000-4000-8000-000000000007','h1-picnic@resbite-test.invalid',now());
insert into private.tester_roster(email) values ('h1-owner@resbite-test.invalid'),('h1-going@resbite-test.invalid'),
 ('h1-maybe@resbite-test.invalid'),('h1-going-too@resbite-test.invalid'),('h1-cant-go@resbite-test.invalid'),
 ('h1-picnic@resbite-test.invalid');
insert into public.profiles(id,display_name) values
 ('f5000000-0000-4000-8000-000000000001','Owner'),('f5000000-0000-4000-8000-000000000002','Guest A'),
 ('f5000000-0000-4000-8000-000000000003','Guest B'),('f5000000-0000-4000-8000-000000000004','Guest C'),
 ('f5000000-0000-4000-8000-000000000006','Guest D'),('f5000000-0000-4000-8000-000000000007','Guest E');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f5000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.create_plan_v4('f5100000-0000-4000-8000-000000000002','Film night','',array['community'],null,
 '2099-06-04 19:00+00','2099-06-04 22:00+00','UTC','Cinema',false,null,'');
select public.create_plan_v4('f5100000-0000-4000-8000-000000000003','Picnic','',array['community'],null,
 '2099-06-05 12:00+00','2099-06-05 15:00+00','UTC','Park',false,null,'');
select public.create_plan_v4('f5100000-0000-4000-8000-000000000004','Quiz','',array['community'],null,
 '2099-06-06 19:00+00','2099-06-06 22:00+00','UTC','Pub',false,null,'');
reset role;
insert into public.attendees(plan_id,user_id,response) values
 ('f5100000-0000-4000-8000-000000000002','f5000000-0000-4000-8000-000000000002','accepted'),
 ('f5100000-0000-4000-8000-000000000002','f5000000-0000-4000-8000-000000000003','maybe'),
 ('f5100000-0000-4000-8000-000000000002','f5000000-0000-4000-8000-000000000004','accepted'),
 ('f5100000-0000-4000-8000-000000000002','f5000000-0000-4000-8000-000000000006','declined'),
 ('f5100000-0000-4000-8000-000000000003','f5000000-0000-4000-8000-000000000002','accepted'),
 ('f5100000-0000-4000-8000-000000000003','f5000000-0000-4000-8000-000000000007','accepted'),
 ('f5100000-0000-4000-8000-000000000004','f5000000-0000-4000-8000-000000000002','accepted'),
 ('f5100000-0000-4000-8000-000000000004','f5000000-0000-4000-8000-000000000004','accepted');
update public.plans set starts_at=now()-interval '4 hours', ends_at=now()-interval '1 hour' where id='f5100000-0000-4000-8000-000000000003';
update public.plans set status='cancelled' where id='f5100000-0000-4000-8000-000000000004';

-- 02 (Going) asks 03 (Maybe) on the open plan, 07 on the ended one and 04 on the cancelled one; 04 (Going) asks 06
-- (Can't go) on the open plan; 01, its owner (a host, with no guest row), asks 04 (Going) on it. Each is a new request.
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
 if (select count(*) from private.notification_outbox where kind='connection_request')<>5 then raise exception 'Five request notices expected'; end if;
end $$;

-- The detail check takes the three for a request only: 'soon' on a request, or any detail on an acceptance, is refused.
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
