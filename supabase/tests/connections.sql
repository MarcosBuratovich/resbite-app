-- Connections (docs/superpowers/specs/2026-11-10-connections-and-circles-design.md, CO-D2, CO-D3, CO-P2, CO-P3, CO-P5):
-- two people who share a resbite connect, one asking and the other accepting. Synthetic identities only (prefix f1);
-- one rolled-back block per slice.
-- Users f1…: 01 owner, 02 guest Going, 03 guest Maybe, 04 guest invited in the app who hasn't answered, 05 a person on
-- no plan, 06 guest Can't go. All six are on the roster. Plan f11…01 'Film night' is 01's; plan f11…02 'Board game
-- night', 01's too and its own series, has 02 and 03 Going.

-- Slice 1: the pair, its request, acceptance, refusal and removal.
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('f1000000-0000-4000-8000-000000000001','co1-owner@resbite-test.invalid',now()),
 ('f1000000-0000-4000-8000-000000000002','co1-going@resbite-test.invalid',now()),
 ('f1000000-0000-4000-8000-000000000003','co1-maybe@resbite-test.invalid',now()),
 ('f1000000-0000-4000-8000-000000000004','co1-pending@resbite-test.invalid',now()),
 ('f1000000-0000-4000-8000-000000000005','co1-stranger@resbite-test.invalid',now()),
 ('f1000000-0000-4000-8000-000000000006','co1-cant-go@resbite-test.invalid',now());
insert into private.tester_roster(email) values ('co1-owner@resbite-test.invalid'),('co1-going@resbite-test.invalid'),
 ('co1-maybe@resbite-test.invalid'),('co1-pending@resbite-test.invalid'),('co1-stranger@resbite-test.invalid'),
 ('co1-cant-go@resbite-test.invalid');
insert into public.profiles(id,display_name) values
 ('f1000000-0000-4000-8000-000000000001','Owner'),('f1000000-0000-4000-8000-000000000002','Guest A'),
 ('f1000000-0000-4000-8000-000000000003','Guest B'),('f1000000-0000-4000-8000-000000000004','Guest C'),
 ('f1000000-0000-4000-8000-000000000005','Stranger'),('f1000000-0000-4000-8000-000000000006','Guest D');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.create_plan_v4('f1100000-0000-4000-8000-000000000001','Film night','',array['community'],null,
 '2099-06-04 19:00+00','2099-06-04 22:00+00','UTC','Cinema',false,null,'');
select public.create_plan_v4('f1100000-0000-4000-8000-000000000002','Board game night','',array['community'],null,
 '2099-06-11 19:00+00','2099-06-11 22:00+00','UTC','Kitchen',false,null,'');
reset role;
insert into public.attendees(plan_id,user_id,response) values
 ('f1100000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000002','accepted'),
 ('f1100000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000003','maybe'),
 ('f1100000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000004','pending'),
 ('f1100000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000006','declined'),
 ('f1100000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000002','accepted'),
 ('f1100000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003','accepted');

-- 02 asks 03, twice: one row, one notice, whose detail says both are going (02 Going, 03 Maybe; the follow-ups
-- migration, 20261111120000).
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if public.request_connection('f1000000-0000-4000-8000-000000000003','f1100000-0000-4000-8000-000000000001') is distinct from 'requested' then
  raise exception 'A first request did not say requested';
 end if;
 if public.request_connection('f1000000-0000-4000-8000-000000000003','f1100000-0000-4000-8000-000000000001') is distinct from 'requested' then
  raise exception 'Asking again did not say requested';
 end if;
end $$;
reset role;
do $$ declare c public.connections; o private.notification_outbox; v_series uuid; begin
 select series_id into v_series from public.plans where id='f1100000-0000-4000-8000-000000000001';
 select * into c from public.connections where user_a='f1000000-0000-4000-8000-000000000002' and user_b='f1000000-0000-4000-8000-000000000003';
 if c.state is distinct from 'requested' or c.requested_by is distinct from 'f1000000-0000-4000-8000-000000000002'
 or c.series_id is distinct from v_series or c.accepted_at is not null or c.created_at is null then
  raise exception 'Request row wrong: %', c;
 end if;
 if (select count(*) from public.connections)<>1 then raise exception 'One pair row expected'; end if;
 if (select count(*) from private.notification_outbox where kind='connection_request')<>1 then raise exception 'One request notice expected'; end if;
 select * into o from private.notification_outbox where kind='connection_request';
 if o.recipient_id is distinct from 'f1000000-0000-4000-8000-000000000003' or o.actor_id is distinct from 'f1000000-0000-4000-8000-000000000002'
 or o.plan_id is distinct from 'f1100000-0000-4000-8000-000000000001' or o.detail is distinct from 'going'
 or o.dedupe_key is distinct from 'connect:f1000000-0000-4000-8000-000000000002:f1000000-0000-4000-8000-000000000003:'||v_series||':f1000000-0000-4000-8000-000000000002' then
  raise exception 'Request notice wrong: %', o;
 end if;
end $$;

-- Who may ask whom: names are needed, and the person asked must have answered.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin
 begin perform public.request_connection('f1000000-0000-4000-8000-000000000002','f1100000-0000-4000-8000-000000000001');
  raise exception 'Someone who has not answered asked';
 exception when insufficient_privilege then if sqlerrm<>'Names required' then raise exception 'Wrong message: %', sqlerrm; end if; end;
end $$;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 begin perform public.request_connection('f1000000-0000-4000-8000-000000000004','f1100000-0000-4000-8000-000000000001');
  raise exception 'Someone who has not answered was asked';
 exception when insufficient_privilege then if sqlerrm<>'Not on this resbite' then raise exception 'Wrong message: %', sqlerrm; end if; end;
 begin perform public.request_connection('f1000000-0000-4000-8000-000000000005','f1100000-0000-4000-8000-000000000001');
  raise exception 'Someone on no plan was asked';
 exception when insufficient_privilege then if sqlerrm<>'Not on this resbite' then raise exception 'Wrong message: %', sqlerrm; end if; end;
 begin perform public.request_connection('f1000000-0000-4000-8000-000000000002','f1100000-0000-4000-8000-000000000001');
  raise exception 'The caller asked themself';
 exception when invalid_parameter_value then if sqlerrm<>'That is you' then raise exception 'Wrong message: %', sqlerrm; end if; end;
 if public.request_connection('f1000000-0000-4000-8000-000000000006','f1100000-0000-4000-8000-000000000001') is distinct from 'requested' then
  raise exception 'A guest who can''t go was not asked';
 end if;
end $$;
reset role;
-- The owner is on the resbite, but not while their account is being deleted: 02 asking 01, whose deletion is pending,
-- is refused with the same message.
update public.profiles set deletion_requested_at=now() where id='f1000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
 begin perform public.request_connection('f1000000-0000-4000-8000-000000000001','f1100000-0000-4000-8000-000000000001');
  raise exception 'An owner whose deletion is pending was asked';
 exception when insufficient_privilege then if sqlerrm<>'Not on this resbite' then raise exception 'Wrong message: %', sqlerrm; end if; end;
end $$;
reset role;
update public.profiles set deletion_requested_at=null where id='f1000000-0000-4000-8000-000000000001';
do $$ begin
 if exists(select 1 from public.connections where 'f1000000-0000-4000-8000-000000000004' in (user_a,user_b) or 'f1000000-0000-4000-8000-000000000005' in (user_a,user_b)
   or 'f1000000-0000-4000-8000-000000000001' in (user_a,user_b))
 or exists(select 1 from private.notification_outbox where recipient_id in ('f1000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000005',
   'f1000000-0000-4000-8000-000000000001')) then
  raise exception 'A refused request left a row or a notice';
 end if;
end $$;

-- Asking back accepts: 01 asks 02, then 02 asks 01. One pair row, connected; one acceptance notice, to 01 only.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 if public.request_connection('f1000000-0000-4000-8000-000000000002','f1100000-0000-4000-8000-000000000001') is distinct from 'requested' then
  raise exception 'The owner''s request did not say requested';
 end if;
end $$;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if public.request_connection('f1000000-0000-4000-8000-000000000001','f1100000-0000-4000-8000-000000000001') is distinct from 'connected' then
  raise exception 'Asking back did not connect';
 end if;
 if public.request_connection('f1000000-0000-4000-8000-000000000001','f1100000-0000-4000-8000-000000000001') is distinct from 'connected' then
  raise exception 'Asking a connection did not say connected';
 end if;
end $$;
reset role;
do $$ declare c public.connections; o private.notification_outbox; begin
 select * into c from public.connections where user_a='f1000000-0000-4000-8000-000000000001' and user_b='f1000000-0000-4000-8000-000000000002';
 if c.state is distinct from 'connected' or c.accepted_at is null or c.requested_by is distinct from 'f1000000-0000-4000-8000-000000000001' then
  raise exception 'Reverse request did not connect: %', c;
 end if;
 if (select count(*) from private.notification_outbox where kind='connection_accepted')<>1 then raise exception 'One acceptance notice expected'; end if;
 select * into o from private.notification_outbox where kind='connection_accepted';
 if o.recipient_id is distinct from 'f1000000-0000-4000-8000-000000000001' or o.actor_id is distinct from 'f1000000-0000-4000-8000-000000000002'
 or o.plan_id is distinct from 'f1100000-0000-4000-8000-000000000001'
 or o.dedupe_key is distinct from 'connected:f1000000-0000-4000-8000-000000000001:f1000000-0000-4000-8000-000000000002:'||extract(epoch from c.accepted_at) then
  raise exception 'Acceptance notice wrong: %', o;
 end if;
end $$;

-- Accepting is for the person asked only: 02 can't accept their own request; 03 accepts it.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 begin perform public.accept_connection('f1000000-0000-4000-8000-000000000003');
  raise exception 'The requester accepted their own request';
 exception when insufficient_privilege then if sqlerrm<>'No request' then raise exception 'Wrong message: %', sqlerrm; end if; end;
end $$;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 perform public.accept_connection('f1000000-0000-4000-8000-000000000002');
 begin perform public.accept_connection('f1000000-0000-4000-8000-000000000002');
  raise exception 'A connection was accepted twice';
 exception when insufficient_privilege then if sqlerrm<>'No request' then raise exception 'Wrong message: %', sqlerrm; end if; end;
end $$;
reset role;
do $$ declare c public.connections; o private.notification_outbox; begin
 select * into c from public.connections where user_a='f1000000-0000-4000-8000-000000000002' and user_b='f1000000-0000-4000-8000-000000000003';
 if c.state is distinct from 'connected' or c.accepted_at is null then raise exception 'Acceptance did not connect: %', c; end if;
 select * into o from private.notification_outbox where kind='connection_accepted' and recipient_id='f1000000-0000-4000-8000-000000000002';
 if o.actor_id is distinct from 'f1000000-0000-4000-8000-000000000003' or o.plan_id is distinct from 'f1100000-0000-4000-8000-000000000001'
 or o.dedupe_key is distinct from 'connected:f1000000-0000-4000-8000-000000000002:f1000000-0000-4000-8000-000000000003:'||extract(epoch from c.accepted_at) then
  raise exception 'Acceptance notice wrong: %', o;
 end if;
end $$;

-- Nobody reads or writes the pairs directly, not even their own sides: the functions are the only way in.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
do $$ begin
 begin perform 1 from public.connections;
  raise exception 'Someone on no pair read the pairs directly';
 exception when insufficient_privilege then null; end;
 begin insert into public.connections(user_a,user_b,state,requested_by) values
   ('f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000005','connected','f1000000-0000-4000-8000-000000000005');
  raise exception 'A pair was written directly';
 exception when insufficient_privilege then null; end;
end $$;
-- 06 is a side of 02's request, still 'requested'.
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000006","role":"authenticated"}',true);
do $$ begin
 begin perform 1 from public.connections;
  raise exception 'A side of a requested pair read the pairs directly';
 exception when insufficient_privilege then null; end;
end $$;

-- "Not now": 06 declines 02. The request goes, the refusal stays; asking again from the series looks sent ('requested')
-- but stores and sends nothing. Once 02 has cancelled it (hidden), the refuser's request is a real one, told to 02.
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
do $$ begin
 begin perform public.decline_connection('f1000000-0000-4000-8000-000000000002');
  raise exception 'A request that does not exist was declined';
 exception when insufficient_privilege then if sqlerrm<>'No request' then raise exception 'Wrong message: %', sqlerrm; end if; end;
end $$;
-- co1_mark holds the newest outbox row before a silent act (CO-P5: not now, cancelling and removing tell nobody).
reset role;
create temporary table co1_mark as select coalesce(max(id),0) as id from private.notification_outbox;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000006","role":"authenticated"}',true);
select public.decline_connection('f1000000-0000-4000-8000-000000000002');
reset role;
do $$ begin
 if exists(select 1 from public.connections where user_a='f1000000-0000-4000-8000-000000000002' and user_b='f1000000-0000-4000-8000-000000000006') then
  raise exception 'A declined request stayed';
 end if;
 if exists(select 1 from private.notification_outbox where id>(select id from co1_mark)) then raise exception 'Declining queued a notice'; end if;
 if not exists(select 1 from private.connection_refusals where series_id=(select series_id from public.plans where id='f1100000-0000-4000-8000-000000000001')
   and from_user='f1000000-0000-4000-8000-000000000002' and to_user='f1000000-0000-4000-8000-000000000006' and refused_at is not null and not hidden)
 or (select count(*) from private.connection_refusals)<>1 then
  raise exception 'The refusal was not kept for the series';
 end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if public.request_connection('f1000000-0000-4000-8000-000000000006','f1100000-0000-4000-8000-000000000001') is distinct from 'requested' then
  raise exception 'Asking again after a refusal did not look sent';
 end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from public.connections where user_a='f1000000-0000-4000-8000-000000000002' and user_b='f1000000-0000-4000-8000-000000000006') then
  raise exception 'A refused requester stored a request';
 end if;
 if (select count(*) from private.notification_outbox where recipient_id='f1000000-0000-4000-8000-000000000006')<>1 then
  raise exception 'A refused requester queued a notice';
 end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.cancel_connection_request('f1000000-0000-4000-8000-000000000006');
-- The notice's key carries who asked and the request's exact time, so 06's request is told however soon after 02's.
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000006","role":"authenticated"}',true);
do $$ begin
 if public.request_connection('f1000000-0000-4000-8000-000000000002','f1100000-0000-4000-8000-000000000001') is distinct from 'requested' then
  raise exception 'The refuser could not ask';
 end if;
end $$;
reset role;
do $$ begin
 if (select requested_by from public.connections where user_a='f1000000-0000-4000-8000-000000000002' and user_b='f1000000-0000-4000-8000-000000000006')
   is distinct from 'f1000000-0000-4000-8000-000000000006' then
  raise exception 'The refuser''s request was not stored';
 end if;
 if (select count(*) from private.notification_outbox where kind='connection_request' and recipient_id='f1000000-0000-4000-8000-000000000002'
   and actor_id='f1000000-0000-4000-8000-000000000006')<>1 then
  raise exception 'The refuser''s request was not told';
 end if;
end $$;
-- The refused requester asking back accepts the refuser's request, even from the series of the refusal, and the
-- refusal goes.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if public.request_connection('f1000000-0000-4000-8000-000000000006','f1100000-0000-4000-8000-000000000001') is distinct from 'connected' then
  raise exception 'Asking back the refuser did not connect';
 end if;
end $$;
reset role;
do $$ declare c public.connections; o private.notification_outbox; begin
 select * into c from public.connections where user_a='f1000000-0000-4000-8000-000000000002' and user_b='f1000000-0000-4000-8000-000000000006';
 if c.state is distinct from 'connected' or c.accepted_at is null then raise exception 'Asking back the refuser did not connect: %', c; end if;
 if (select count(*) from private.notification_outbox where kind='connection_accepted' and recipient_id='f1000000-0000-4000-8000-000000000006')<>1 then
  raise exception 'One acceptance notice to the refuser expected';
 end if;
 select * into o from private.notification_outbox where kind='connection_accepted' and recipient_id='f1000000-0000-4000-8000-000000000006';
 if o.actor_id is distinct from 'f1000000-0000-4000-8000-000000000002' or o.plan_id is distinct from 'f1100000-0000-4000-8000-000000000001'
 or o.dedupe_key is distinct from 'connected:f1000000-0000-4000-8000-000000000002:f1000000-0000-4000-8000-000000000006:'||extract(epoch from c.accepted_at) then
  raise exception 'Acceptance notice to the refuser wrong: %', o;
 end if;
 if exists(select 1 from private.connection_refusals where (from_user,to_user) in
   (('f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000006'),('f1000000-0000-4000-8000-000000000006','f1000000-0000-4000-8000-000000000002'))) then
  raise exception 'Accepting kept the refusal';
 end if;
end $$;

-- Removing: 02 removes 03, silently. It is kept as a refusal of 03 by 02 on the series they met at (CO-P14): 03 asking
-- 02 from it looks sent but stores and sends nothing, while 03 may ask 02 from another resbite and 02 may ask 03.
-- Removing what isn't connected changes nothing.
update co1_mark set id=(select coalesce(max(id),0) from private.notification_outbox);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.remove_connection('f1000000-0000-4000-8000-000000000003');
do $$ begin
 perform public.remove_connection('f1000000-0000-4000-8000-000000000003');
 perform public.remove_connection('f1000000-0000-4000-8000-000000000005');
end $$;
reset role;
do $$ begin
 if exists(select 1 from public.connections where user_a='f1000000-0000-4000-8000-000000000002' and user_b='f1000000-0000-4000-8000-000000000003') then
  raise exception 'A removed connection stayed';
 end if;
 if exists(select 1 from private.notification_outbox where id>(select id from co1_mark)) then raise exception 'Removing queued a notice'; end if;
 if not exists(select 1 from private.connection_refusals where series_id=(select series_id from public.plans where id='f1100000-0000-4000-8000-000000000001')
   and from_user='f1000000-0000-4000-8000-000000000003' and to_user='f1000000-0000-4000-8000-000000000002' and hidden)
 or exists(select 1 from private.connection_refusals where from_user='f1000000-0000-4000-8000-000000000002' and to_user='f1000000-0000-4000-8000-000000000003') then
  raise exception 'The removal was not kept as a refusal of the one removed';
 end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 if public.request_connection('f1000000-0000-4000-8000-000000000002','f1100000-0000-4000-8000-000000000001') is distinct from 'requested' then
  raise exception 'Asking the remover from the series they met at did not look sent';
 end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from public.connections where user_a='f1000000-0000-4000-8000-000000000002' and user_b='f1000000-0000-4000-8000-000000000003')
 or exists(select 1 from private.notification_outbox where kind='connection_request' and actor_id='f1000000-0000-4000-8000-000000000003') then
  raise exception 'Asking the remover from the series they met at stored or sent something';
 end if;
end $$;
-- From the other resbite (its own series) 03's request is a real one; 03's refusal by 02 on the series they met at
-- stands, as only an acceptance clears refusals.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 if public.request_connection('f1000000-0000-4000-8000-000000000002','f1100000-0000-4000-8000-000000000002') is distinct from 'requested' then
  raise exception 'Asking the remover from another resbite did not say requested';
 end if;
end $$;
reset role;
do $$ declare c public.connections; o private.notification_outbox; begin
 select * into c from public.connections where user_a='f1000000-0000-4000-8000-000000000002' and user_b='f1000000-0000-4000-8000-000000000003';
 if c.state is distinct from 'requested' or c.requested_by is distinct from 'f1000000-0000-4000-8000-000000000003'
 or c.series_id is distinct from (select series_id from public.plans where id='f1100000-0000-4000-8000-000000000002') then
  raise exception 'The request from another resbite was not stored: %', c;
 end if;
 select * into o from private.notification_outbox where kind='connection_request' and actor_id='f1000000-0000-4000-8000-000000000003';
 if o.recipient_id is distinct from 'f1000000-0000-4000-8000-000000000002' or o.plan_id is distinct from 'f1100000-0000-4000-8000-000000000002'
 or o.dedupe_key is distinct from 'connect:f1000000-0000-4000-8000-000000000002:f1000000-0000-4000-8000-000000000003:'||c.series_id||':f1000000-0000-4000-8000-000000000003' then
  raise exception 'The request from another resbite was not told: %', o;
 end if;
 if not exists(select 1 from private.connection_refusals where series_id=(select series_id from public.plans where id='f1100000-0000-4000-8000-000000000001')
   and from_user='f1000000-0000-4000-8000-000000000003' and to_user='f1000000-0000-4000-8000-000000000002') then
  raise exception 'A request from another resbite took the refusal on the first';
 end if;
end $$;
-- Cancelling or removing someone else's request changes nothing; 03 then takes it back.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 perform public.cancel_connection_request('f1000000-0000-4000-8000-000000000003');
 perform public.remove_connection('f1000000-0000-4000-8000-000000000003');
end $$;
reset role;
do $$ begin
 if not exists(select 1 from public.connections where user_a='f1000000-0000-4000-8000-000000000002' and user_b='f1000000-0000-4000-8000-000000000003'
   and state='requested' and requested_by='f1000000-0000-4000-8000-000000000003') then
  raise exception 'Cancelling or removing someone else''s request changed it';
 end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select public.cancel_connection_request('f1000000-0000-4000-8000-000000000002');

-- Cancelling: 02 asks 03 from the series they met at, a real request (the refusal is of 03, not of 02), and takes it
-- back, silently; a cancelled request may be sent again, but is told once per pair, series and requester (CO-R8).
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if public.request_connection('f1000000-0000-4000-8000-000000000003','f1100000-0000-4000-8000-000000000001') is distinct from 'requested' then
  raise exception 'The remover could not ask';
 end if;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from public.connections where user_a='f1000000-0000-4000-8000-000000000002' and user_b='f1000000-0000-4000-8000-000000000003'
   and state='requested' and requested_by='f1000000-0000-4000-8000-000000000002'
   and series_id=(select series_id from public.plans where id='f1100000-0000-4000-8000-000000000001')) then
  raise exception 'The remover''s request was not stored';
 end if;
end $$;
update co1_mark set id=(select coalesce(max(id),0) from private.notification_outbox);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 perform public.cancel_connection_request('f1000000-0000-4000-8000-000000000003');
 perform public.cancel_connection_request('f1000000-0000-4000-8000-000000000003');
end $$;
reset role;
do $$ begin
 if exists(select 1 from public.connections where user_a='f1000000-0000-4000-8000-000000000002' and user_b='f1000000-0000-4000-8000-000000000003') then
  raise exception 'A cancelled request stayed';
 end if;
 if exists(select 1 from private.notification_outbox where id>(select id from co1_mark)) then raise exception 'Cancelling queued a notice'; end if;
end $$;
-- Ask, cancel, ask, cancel, ask (the first two above): one notice for 02's requests to 03 from Film night's series, the
-- one queued at the start of this slice, with the static key; it goes while the request stands.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if public.request_connection('f1000000-0000-4000-8000-000000000003','f1100000-0000-4000-8000-000000000001') is distinct from 'requested' then
  raise exception 'A cancelled request could not be sent again';
 end if;
 perform public.cancel_connection_request('f1000000-0000-4000-8000-000000000003');
 if public.request_connection('f1000000-0000-4000-8000-000000000003','f1100000-0000-4000-8000-000000000001') is distinct from 'requested' then
  raise exception 'A request cancelled twice could not be sent again';
 end if;
end $$;
reset role;
do $$ declare c public.connections; o private.notification_outbox; begin
 select * into c from public.connections where user_a='f1000000-0000-4000-8000-000000000002' and user_b='f1000000-0000-4000-8000-000000000003';
 if c.state is distinct from 'requested' or c.requested_by is distinct from 'f1000000-0000-4000-8000-000000000002' then
  raise exception 'The request sent again does not stand: %', c;
 end if;
 if (select count(*) from private.notification_outbox where kind='connection_request' and recipient_id='f1000000-0000-4000-8000-000000000003'
   and actor_id='f1000000-0000-4000-8000-000000000002' and plan_id in (select id from public.plans where series_id=c.series_id))<>1 then
  raise exception 'Asking, cancelling and asking again queued more than one notice: %', (select array_agg(dedupe_key order by id)
   from private.notification_outbox where kind='connection_request' and recipient_id='f1000000-0000-4000-8000-000000000003');
 end if;
 select * into o from private.notification_outbox where kind='connection_request' and recipient_id='f1000000-0000-4000-8000-000000000003'
  and actor_id='f1000000-0000-4000-8000-000000000002' and plan_id in (select id from public.plans where series_id=c.series_id);
 if o.dedupe_key is distinct from 'connect:f1000000-0000-4000-8000-000000000002:f1000000-0000-4000-8000-000000000003:'||c.series_id||':f1000000-0000-4000-8000-000000000002' then
  raise exception 'The one notice''s key is not the pair, the series and the requester: %', o.dedupe_key;
 end if;
 if not private.notification_recipient_eligible(o.id) then raise exception 'The one notice does not go while the request stands'; end if;
end $$;
-- From another series, Board game night (both are going), 02's request is told on its own.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.cancel_connection_request('f1000000-0000-4000-8000-000000000003');
do $$ begin
 if public.request_connection('f1000000-0000-4000-8000-000000000003','f1100000-0000-4000-8000-000000000002') is distinct from 'requested' then
  raise exception 'Asking from another series did not say requested';
 end if;
end $$;
reset role;
do $$ declare c public.connections; o private.notification_outbox; begin
 select * into c from public.connections where user_a='f1000000-0000-4000-8000-000000000002' and user_b='f1000000-0000-4000-8000-000000000003';
 select * into o from private.notification_outbox where kind='connection_request' and recipient_id='f1000000-0000-4000-8000-000000000003'
  and actor_id='f1000000-0000-4000-8000-000000000002' and plan_id='f1100000-0000-4000-8000-000000000002';
 if c.series_id is distinct from (select series_id from public.plans where id='f1100000-0000-4000-8000-000000000002')
 or o.dedupe_key is distinct from 'connect:f1000000-0000-4000-8000-000000000002:f1000000-0000-4000-8000-000000000003:'||c.series_id||':f1000000-0000-4000-8000-000000000002'
 or not private.notification_recipient_eligible(o.id)
 or (select count(*) from private.notification_outbox where kind='connection_request' and recipient_id='f1000000-0000-4000-8000-000000000003'
   and actor_id='f1000000-0000-4000-8000-000000000002')<>2 then
  raise exception 'A request from another series was not told on its own: %', o;
 end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.cancel_connection_request('f1000000-0000-4000-8000-000000000003');
reset role;
do $$ begin
 if exists(select 1 from private.connection_refusals where to_user='f1000000-0000-4000-8000-000000000003') then
  raise exception 'A cancellation was kept as a refusal';
 end if;
 if (select count(*) from private.connection_refusals where from_user='f1000000-0000-4000-8000-000000000003')<>1
 or not exists(select 1 from private.connection_refusals where series_id=(select series_id from public.plans where id='f1100000-0000-4000-8000-000000000001')
   and from_user='f1000000-0000-4000-8000-000000000003' and to_user='f1000000-0000-4000-8000-000000000002' and hidden) then
  raise exception 'The refusal of 03 on the series they met at did not stand, hidden by 03''s cancel';
 end if;
end $$;

-- The end is not the boundary for connecting: on the ended plan 02 still asks 03.
update public.plans set starts_at=now()-interval '3 hours', ends_at=now()-interval '1 hour' where id='f1100000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if public.request_connection('f1000000-0000-4000-8000-000000000003','f1100000-0000-4000-8000-000000000001') is distinct from 'requested' then
  raise exception 'Asking on an ended plan did not say requested';
 end if;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from public.connections where user_a='f1000000-0000-4000-8000-000000000002' and user_b='f1000000-0000-4000-8000-000000000003'
   and state='requested' and requested_by='f1000000-0000-4000-8000-000000000002') then
  raise exception 'The request on an ended plan was not stored';
 end if;
end $$;

-- Two who each refused the other: 01 asks 03 and 03 says "Not now"; 01 takes it back (the refusal is hidden), so 03's
-- request is a real one, and 01 says "Not now" to it. 03's request still looks sent to 03, so it stands: 01 asking 03
-- accepts it, even from the series where 01's own request was refused.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.request_connection('f1000000-0000-4000-8000-000000000003','f1100000-0000-4000-8000-000000000001');
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select public.decline_connection('f1000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.cancel_connection_request('f1000000-0000-4000-8000-000000000003');
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 if public.request_connection('f1000000-0000-4000-8000-000000000001','f1100000-0000-4000-8000-000000000001') is distinct from 'requested' then
  raise exception 'The refuser''s request after a cancel did not say requested';
 end if;
end $$;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.decline_connection('f1000000-0000-4000-8000-000000000003');
reset role;
do $$ declare v_series uuid := (select series_id from public.plans where id='f1100000-0000-4000-8000-000000000001'); begin
 if exists(select 1 from public.connections where user_a='f1000000-0000-4000-8000-000000000001' and user_b='f1000000-0000-4000-8000-000000000003')
 or not exists(select 1 from private.connection_refusals where series_id=v_series and from_user='f1000000-0000-4000-8000-000000000001'
   and to_user='f1000000-0000-4000-8000-000000000003' and hidden)
 or not exists(select 1 from private.connection_refusals where series_id=v_series and from_user='f1000000-0000-4000-8000-000000000003'
   and to_user='f1000000-0000-4000-8000-000000000001' and not hidden) then
  raise exception 'The two refusals are not as set up';
 end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 if public.request_connection('f1000000-0000-4000-8000-000000000003','f1100000-0000-4000-8000-000000000001') is distinct from 'connected' then
  raise exception 'Asking someone whose refused request stands, from the series of one''s own refusal, did not connect';
 end if;
end $$;
reset role;
do $$ declare c public.connections; begin
 select * into c from public.connections where user_a='f1000000-0000-4000-8000-000000000001' and user_b='f1000000-0000-4000-8000-000000000003';
 if c.state is distinct from 'connected' or c.requested_by is distinct from 'f1000000-0000-4000-8000-000000000003' or c.accepted_at is null
 or exists(select 1 from private.connection_refusals where (from_user,to_user) in
   (('f1000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000003'),('f1000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000001')))
 or (select count(*) from private.notification_outbox where kind='connection_accepted' and recipient_id='f1000000-0000-4000-8000-000000000003'
   and actor_id='f1000000-0000-4000-8000-000000000001')<>1 then
  raise exception 'The two who refused each other were not connected, or a refusal stayed: %', c;
 end if;
end $$;
rollback;

-- Slice 2: what each person may read of the pair. my_connections lists the requests to the caller and their
-- connections; plan_connection_states gives the caller's state with each person on a plan, a refusal of the caller's
-- request still reading as sent (CO-P3) until they cancel it; the two sides of a pair, asked or connected, read each
-- other's profile.
-- Here plan f11…02 'Board game night' (its own series) has 02 and 06 Going, and 07 is a seventh person on no plan.
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('f1000000-0000-4000-8000-000000000001','co1-owner@resbite-test.invalid',now()),
 ('f1000000-0000-4000-8000-000000000002','co1-going@resbite-test.invalid',now()),
 ('f1000000-0000-4000-8000-000000000003','co1-maybe@resbite-test.invalid',now()),
 ('f1000000-0000-4000-8000-000000000004','co1-pending@resbite-test.invalid',now()),
 ('f1000000-0000-4000-8000-000000000005','co1-stranger@resbite-test.invalid',now()),
 ('f1000000-0000-4000-8000-000000000006','co1-cant-go@resbite-test.invalid',now()),
 ('f1000000-0000-4000-8000-000000000007','co1-unrelated@resbite-test.invalid',now());
insert into private.tester_roster(email) values ('co1-owner@resbite-test.invalid'),('co1-going@resbite-test.invalid'),
 ('co1-maybe@resbite-test.invalid'),('co1-pending@resbite-test.invalid'),('co1-stranger@resbite-test.invalid'),
 ('co1-cant-go@resbite-test.invalid'),('co1-unrelated@resbite-test.invalid');
insert into public.profiles(id,display_name) values
 ('f1000000-0000-4000-8000-000000000001','Owner'),('f1000000-0000-4000-8000-000000000002','Guest A'),
 ('f1000000-0000-4000-8000-000000000003','Guest B'),('f1000000-0000-4000-8000-000000000004','Guest C'),
 ('f1000000-0000-4000-8000-000000000005','Stranger'),('f1000000-0000-4000-8000-000000000006','Guest D'),
 ('f1000000-0000-4000-8000-000000000007','Unrelated');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.create_plan_v4('f1100000-0000-4000-8000-000000000001','Film night','',array['community'],null,
 '2099-06-04 19:00+00','2099-06-04 22:00+00','UTC','Cinema',false,null,'');
select public.create_plan_v4('f1100000-0000-4000-8000-000000000002','Board game night','',array['community'],null,
 '2099-06-11 19:00+00','2099-06-11 22:00+00','UTC','Kitchen',false,null,'');
reset role;
insert into public.attendees(plan_id,user_id,response) values
 ('f1100000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000002','accepted'),
 ('f1100000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000003','maybe'),
 ('f1100000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000004','pending'),
 ('f1100000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000006','declined'),
 ('f1100000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000002','accepted'),
 ('f1100000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000006','accepted');
-- 02 asks 03; 01 asks 02 and 02 accepts.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.request_connection('f1000000-0000-4000-8000-000000000003','f1100000-0000-4000-8000-000000000001');
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.request_connection('f1000000-0000-4000-8000-000000000002','f1100000-0000-4000-8000-000000000001');
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.accept_connection('f1000000-0000-4000-8000-000000000001');

-- my_connections: 03 has 02's request, with the resbite they met at and "You're both going"; 02 has no request (the one
-- they sent is not listed) and is connected to 01. Each entry names the other person.
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ declare v_series uuid := (select series_id from public.plans where id='f1100000-0000-4000-8000-000000000001'); begin
 if public.my_connections() is distinct from jsonb_build_object(
   'requests',jsonb_build_array(jsonb_build_object('user_id','f1000000-0000-4000-8000-000000000002','name','Guest A','avatar_path',null,
    'avatar_revision',0,'series_id',v_series,'title','Film night','context','going')),
   'connected','[]'::jsonb) then
  raise exception 'my_connections of the person asked wrong: %', public.my_connections();
 end if;
end $$;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare v_series uuid := (select series_id from public.plans where id='f1100000-0000-4000-8000-000000000001'); begin
 if public.my_connections() is distinct from jsonb_build_object('requests','[]'::jsonb,
   'connected',jsonb_build_array(jsonb_build_object('user_id','f1000000-0000-4000-8000-000000000001','name','Owner','avatar_path',null,
    'avatar_revision',0,'series_id',v_series,'title','Film night'))) then
  raise exception 'my_connections of the requester wrong: %', public.my_connections();
 end if;
end $$;

-- plan_connection_states: everyone on the plan but the caller, the pending guest included; names are needed.
do $$ begin
 if public.plan_connection_states('f1100000-0000-4000-8000-000000000001') is distinct from jsonb_build_object(
   'f1000000-0000-4000-8000-000000000001','connected','f1000000-0000-4000-8000-000000000003','requested_by_me',
   'f1000000-0000-4000-8000-000000000004','none','f1000000-0000-4000-8000-000000000006','none') then
  raise exception 'States of the requester wrong: %', public.plan_connection_states('f1100000-0000-4000-8000-000000000001');
 end if;
end $$;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 if public.plan_connection_states('f1100000-0000-4000-8000-000000000001') is distinct from jsonb_build_object(
   'f1000000-0000-4000-8000-000000000001','none','f1000000-0000-4000-8000-000000000002','requested_by_them',
   'f1000000-0000-4000-8000-000000000004','none','f1000000-0000-4000-8000-000000000006','none') then
  raise exception 'States of the person asked wrong: %', public.plan_connection_states('f1100000-0000-4000-8000-000000000001');
 end if;
end $$;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin
 begin perform public.plan_connection_states('f1100000-0000-4000-8000-000000000001');
  raise exception 'Someone who has not answered read the states';
 exception when insufficient_privilege then if sqlerrm<>'Names required' then raise exception 'Wrong message: %', sqlerrm; end if; end;
end $$;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
do $$ begin
 begin perform public.plan_connection_states('f1100000-0000-4000-8000-000000000001');
  raise exception 'Someone on no plan read the states';
 exception when insufficient_privilege then if sqlerrm<>'Names required' then raise exception 'Wrong message: %', sqlerrm; end if; end;
end $$;

-- 06 declines 02 ("Not now"): 02 still reads requested_by_me on every resbite they share, Board game night (another
-- series) too, and 06 reads none.
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.request_connection('f1000000-0000-4000-8000-000000000006','f1100000-0000-4000-8000-000000000001');
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000006","role":"authenticated"}',true);
select public.decline_connection('f1000000-0000-4000-8000-000000000002');
do $$ begin
 if public.plan_connection_states('f1100000-0000-4000-8000-000000000001') is distinct from jsonb_build_object(
   'f1000000-0000-4000-8000-000000000001','none','f1000000-0000-4000-8000-000000000002','none',
   'f1000000-0000-4000-8000-000000000003','none','f1000000-0000-4000-8000-000000000004','none') then
  raise exception 'States of the refuser wrong: %', public.plan_connection_states('f1100000-0000-4000-8000-000000000001');
 end if;
end $$;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if public.plan_connection_states('f1100000-0000-4000-8000-000000000001') is distinct from jsonb_build_object(
   'f1000000-0000-4000-8000-000000000001','connected','f1000000-0000-4000-8000-000000000003','requested_by_me',
   'f1000000-0000-4000-8000-000000000004','none','f1000000-0000-4000-8000-000000000006','requested_by_me') then
  raise exception 'States of the refused requester wrong: %', public.plan_connection_states('f1100000-0000-4000-8000-000000000001');
 end if;
 if public.plan_connection_states('f1100000-0000-4000-8000-000000000002') is distinct from jsonb_build_object(
   'f1000000-0000-4000-8000-000000000001','connected','f1000000-0000-4000-8000-000000000006','requested_by_me') then
  raise exception 'States on another series wrong: %', public.plan_connection_states('f1100000-0000-4000-8000-000000000002');
 end if;
end $$;
-- 06 leaves both resbites: 02 still reads 06's profile, as while a request is live. 02 cancels the refused request: 02
-- no longer reads it, and once 06 is back 02 reads none. Asking again looks sent ('requested') and reads
-- requested_by_me, but stores and sends nothing.
reset role;
delete from public.attendees where user_id='f1000000-0000-4000-8000-000000000006';
set local role authenticated;
do $$ begin
 if (select display_name from public.profiles where id='f1000000-0000-4000-8000-000000000006') is distinct from 'Guest D' then
  raise exception 'A refused requester sharing no resbite lost the refuser''s profile';
 end if;
end $$;
select public.cancel_connection_request('f1000000-0000-4000-8000-000000000006');
do $$ begin
 if exists(select 1 from public.profiles where id='f1000000-0000-4000-8000-000000000006') then
  raise exception 'A cancelled refused request still read the refuser''s profile';
 end if;
end $$;
reset role;
insert into public.attendees(plan_id,user_id,response) values
 ('f1100000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000006','declined'),
 ('f1100000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000006','accepted');
set local role authenticated;
do $$ begin
 if public.plan_connection_states('f1100000-0000-4000-8000-000000000001')->>'f1000000-0000-4000-8000-000000000006' is distinct from 'none' then
  raise exception 'A cancelled refused request still read as sent: %', public.plan_connection_states('f1100000-0000-4000-8000-000000000001');
 end if;
 if public.request_connection('f1000000-0000-4000-8000-000000000006','f1100000-0000-4000-8000-000000000001') is distinct from 'requested' then
  raise exception 'Asking again after a refusal did not look sent';
 end if;
 if public.plan_connection_states('f1100000-0000-4000-8000-000000000001')->>'f1000000-0000-4000-8000-000000000006' is distinct from 'requested_by_me' then
  raise exception 'Asking again after a refusal did not read as sent: %', public.plan_connection_states('f1100000-0000-4000-8000-000000000001');
 end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from public.connections where user_a='f1000000-0000-4000-8000-000000000002' and user_b='f1000000-0000-4000-8000-000000000006')
 or (select count(*) from private.notification_outbox where kind='connection_request' and recipient_id='f1000000-0000-4000-8000-000000000006')<>1 then
  raise exception 'Asking again after a refusal stored or sent something';
 end if;
end $$;
-- From another series, Board game night, 02's request is a real one: stored and told. 02's refusal by 06 on Film night
-- stands: only an acceptance clears refusals.
set local role authenticated;
do $$ begin
 if public.request_connection('f1000000-0000-4000-8000-000000000006','f1100000-0000-4000-8000-000000000002') is distinct from 'requested' then
  raise exception 'Asking from another series did not say requested';
 end if;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from public.connections where user_a='f1000000-0000-4000-8000-000000000002' and user_b='f1000000-0000-4000-8000-000000000006'
   and state='requested' and requested_by='f1000000-0000-4000-8000-000000000002'
   and series_id=(select series_id from public.plans where id='f1100000-0000-4000-8000-000000000002'))
 or (select count(*) from private.notification_outbox where kind='connection_request' and recipient_id='f1000000-0000-4000-8000-000000000006'
   and plan_id='f1100000-0000-4000-8000-000000000002')<>1
 or not exists(select 1 from private.connection_refusals where series_id=(select series_id from public.plans where id='f1100000-0000-4000-8000-000000000001')
   and from_user='f1000000-0000-4000-8000-000000000002' and to_user='f1000000-0000-4000-8000-000000000006' and not hidden) then
  raise exception 'A request from another series was not a real one, or took the refusal';
 end if;
end $$;
-- 06 declines that one too: asking again from Film night still looks sent and stores and sends nothing.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000006","role":"authenticated"}',true);
select public.decline_connection('f1000000-0000-4000-8000-000000000002');
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if public.request_connection('f1000000-0000-4000-8000-000000000006','f1100000-0000-4000-8000-000000000001') is distinct from 'requested' then
  raise exception 'Asking again from the series of a standing refusal did not look sent';
 end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from public.connections where user_a='f1000000-0000-4000-8000-000000000002' and user_b='f1000000-0000-4000-8000-000000000006')
 or (select count(*) from private.notification_outbox where kind='connection_request' and recipient_id='f1000000-0000-4000-8000-000000000006')<>2 then
  raise exception 'Asking again from the series of a standing refusal stored or sent something';
 end if;
end $$;
-- Then 06 asks 02 from Film night: 02's refused request still looks sent to 02, so it stands and 06's asking accepts it.
-- Connected, with 02 told of the acceptance (not of a request), and no refusal left on any series.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000006","role":"authenticated"}',true);
do $$ begin
 if public.request_connection('f1000000-0000-4000-8000-000000000002','f1100000-0000-4000-8000-000000000001') is distinct from 'connected' then
  raise exception 'Asking someone whose refused request still looks sent did not connect';
 end if;
end $$;
reset role;
do $$ declare c public.connections; begin
 select * into c from public.connections where user_a='f1000000-0000-4000-8000-000000000002' and user_b='f1000000-0000-4000-8000-000000000006';
 if c.state is distinct from 'connected' or c.requested_by is distinct from 'f1000000-0000-4000-8000-000000000002' or c.accepted_at is null then
  raise exception 'The standing request was not accepted: %', c;
 end if;
 if (select count(*) from private.notification_outbox where kind='connection_accepted' and recipient_id='f1000000-0000-4000-8000-000000000002'
   and actor_id='f1000000-0000-4000-8000-000000000006')<>1
 or exists(select 1 from private.notification_outbox where kind='connection_request' and recipient_id='f1000000-0000-4000-8000-000000000002'
   and actor_id='f1000000-0000-4000-8000-000000000006')
 or exists(select 1 from private.connection_refusals where (from_user,to_user) in
   (('f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000006'),('f1000000-0000-4000-8000-000000000006','f1000000-0000-4000-8000-000000000002'))) then
  raise exception 'Accepting the standing request told the wrong thing or left a refusal';
 end if;
end $$;
set local role authenticated;

-- Profiles: 05 shares no plan with 02 and reads only their own; connected directly, 05 and 02 read each other; a
-- request is enough too; 07 still reads nobody else. A pair with no series has no title and is only 'met'.
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
do $$ begin
 if exists(select 1 from public.profiles where id='f1000000-0000-4000-8000-000000000002') or (select count(*) from public.profiles)<>1 then
  raise exception 'Someone sharing no plan read a profile';
 end if;
end $$;
reset role;
insert into public.connections(user_a,user_b,state,requested_by,accepted_at) values
 ('f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000005','connected','f1000000-0000-4000-8000-000000000002',now());
set local role authenticated;
do $$ begin
 if (select display_name from public.profiles where id='f1000000-0000-4000-8000-000000000002') is distinct from 'Guest A'
 or (select count(*) from public.profiles)<>2 then
  raise exception 'A connection did not read the other''s profile, or read more';
 end if;
end $$;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare v_series uuid := (select series_id from public.plans where id='f1100000-0000-4000-8000-000000000001'); begin
 if (select display_name from public.profiles where id='f1000000-0000-4000-8000-000000000005') is distinct from 'Stranger' then
  raise exception 'The other side did not read the connection''s profile';
 end if;
 if public.my_connections()->'connected' is distinct from jsonb_build_array(
   jsonb_build_object('user_id','f1000000-0000-4000-8000-000000000006','name','Guest D','avatar_path',null,'avatar_revision',0,
    'series_id',v_series,'title','Film night'),
   jsonb_build_object('user_id','f1000000-0000-4000-8000-000000000001','name','Owner','avatar_path',null,'avatar_revision',0,
    'series_id',v_series,'title','Film night'),
   jsonb_build_object('user_id','f1000000-0000-4000-8000-000000000005','name','Stranger','avatar_path',null,'avatar_revision',0,
    'series_id',null,'title',null)) then
  raise exception 'Connected list wrong: %', public.my_connections()->'connected';
 end if;
end $$;
reset role;
update public.connections set state='requested',accepted_at=null
 where user_a='f1000000-0000-4000-8000-000000000002' and user_b='f1000000-0000-4000-8000-000000000005';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
do $$ begin
 if (select display_name from public.profiles where id='f1000000-0000-4000-8000-000000000002') is distinct from 'Guest A' then
  raise exception 'The person asked did not read the requester''s profile';
 end if;
 if public.my_connections() is distinct from jsonb_build_object(
   'requests',jsonb_build_array(jsonb_build_object('user_id','f1000000-0000-4000-8000-000000000002','name','Guest A','avatar_path',null,
    'avatar_revision',0,'series_id',null,'title',null,'context','met')),
   'connected','[]'::jsonb) then
  raise exception 'A request with no series wrong: %', public.my_connections();
 end if;
end $$;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000007","role":"authenticated"}',true);
do $$ begin
 if exists(select 1 from public.profiles where id in ('f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000005'))
 or (select count(*) from public.profiles)<>1 then
  raise exception 'Someone on no pair read a profile';
 end if;
end $$;

-- The title and the context come from the series' latest occurrence the caller may read (CO-R9): with 03 on neither
-- Film night nor the later 'Film night again', no title ("Met on Resbite") and 'met'; back on Film night, its title
-- (both going); on the later one too, its title, 'met' while 02 is not on it. With both answered it is 'going', and a
-- host counts as going (01 asks 03); once it has ended it is 'met'.
reset role;
insert into public.plans(id,owner_id,title,starts_at,ends_at,time_zone,place_label,categories,series_id) values
 ('f1100000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000001','Film night again',
  '2099-06-18 19:00+00','2099-06-18 22:00+00','UTC','Cinema',array['community'],
  (select series_id from public.plans where id='f1100000-0000-4000-8000-000000000001'));
delete from public.attendees where plan_id='f1100000-0000-4000-8000-000000000001' and user_id='f1000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 if jsonb_array_length(public.my_connections()->'requests')<>1
 or public.my_connections()->'requests'->0->>'title' is not null
 or public.my_connections()->'requests'->0->>'context' is distinct from 'met' then
  raise exception 'An occurrence the caller may not read gave the title: %', public.my_connections();
 end if;
end $$;
reset role;
insert into public.attendees(plan_id,user_id,response) values
 ('f1100000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000003','maybe');
set local role authenticated;
do $$ begin
 if public.my_connections()->'requests'->0->>'title' is distinct from 'Film night'
 or public.my_connections()->'requests'->0->>'context' is distinct from 'going' then
  raise exception 'The latest occurrence the caller may read did not give the title, or the context: %', public.my_connections();
 end if;
end $$;
reset role;
insert into public.attendees(plan_id,user_id,response) values
 ('f1100000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000003','maybe');
set local role authenticated;
do $$ begin
 if public.my_connections()->'requests'->0->>'title' is distinct from 'Film night again'
 or public.my_connections()->'requests'->0->>'context' is distinct from 'met' then
  raise exception 'The latest occurrence did not give the title, or the context: %', public.my_connections();
 end if;
end $$;
reset role;
insert into public.attendees(plan_id,user_id,response) values
 ('f1100000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000002','accepted');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.request_connection('f1000000-0000-4000-8000-000000000003','f1100000-0000-4000-8000-000000000001');
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 if (select jsonb_agg(jsonb_build_array(r->>'name',r->>'title',r->>'context') order by n) from jsonb_array_elements(public.my_connections()->'requests') with ordinality e(r,n))
   is distinct from '[["Owner","Film night again","going"],["Guest A","Film night again","going"]]'::jsonb then
  raise exception 'Both going on the latest occurrence, newest request first, wrong: %', public.my_connections();
 end if;
end $$;
-- 02 takes the request back and sends it again: now 02's is the newest.
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.cancel_connection_request('f1000000-0000-4000-8000-000000000003');
select public.request_connection('f1000000-0000-4000-8000-000000000003','f1100000-0000-4000-8000-000000000001');
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 if (select jsonb_agg(r->>'name' order by n) from jsonb_array_elements(public.my_connections()->'requests') with ordinality e(r,n))
   is distinct from '["Guest A","Owner"]'::jsonb then
  raise exception 'Requests not newest first: %', public.my_connections();
 end if;
end $$;
-- A cancelled latest occurrence is 'met'.
reset role;
update public.plans set status='cancelled' where id='f1100000-0000-4000-8000-000000000003';
set local role authenticated;
do $$ begin
 if (select jsonb_agg(jsonb_build_array(r->>'name',r->>'title',r->>'context') order by n) from jsonb_array_elements(public.my_connections()->'requests') with ordinality e(r,n))
   is distinct from '[["Guest A","Film night again","met"],["Owner","Film night again","met"]]'::jsonb then
  raise exception 'A cancelled latest occurrence wrong: %', public.my_connections();
 end if;
end $$;
reset role;
update public.plans set status='active' where id='f1100000-0000-4000-8000-000000000003';
update public.plans set starts_at=now()-interval '3 days', ends_at=now()-interval '3 days'+interval '3 hours' where id='f1100000-0000-4000-8000-000000000001';
update public.plans set starts_at=now()-interval '3 hours', ends_at=now()-interval '1 hour' where id='f1100000-0000-4000-8000-000000000003';
set local role authenticated;
do $$ begin
 if (select jsonb_agg(jsonb_build_array(r->>'name',r->>'title',r->>'context') order by n) from jsonb_array_elements(public.my_connections()->'requests') with ordinality e(r,n))
   is distinct from '[["Guest A","Film night again","met"],["Owner","Film night again","met"]]'::jsonb then
  raise exception 'An ended latest occurrence wrong: %', public.my_connections();
 end if;
end $$;

-- A removal's refusal is hidden: 03 accepts 02, 02 removes 03, and 03 reads none for 02. 03 asking 02 from the series
-- looks sent ('requested') and then reads requested_by_me, but stores and sends nothing.
select public.accept_connection('f1000000-0000-4000-8000-000000000002');
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.remove_connection('f1000000-0000-4000-8000-000000000003');
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 if public.plan_connection_states('f1100000-0000-4000-8000-000000000001')->>'f1000000-0000-4000-8000-000000000002' is distinct from 'none' then
  raise exception 'The one removed read a request they did not send: %', public.plan_connection_states('f1100000-0000-4000-8000-000000000001');
 end if;
 if public.request_connection('f1000000-0000-4000-8000-000000000002','f1100000-0000-4000-8000-000000000001') is distinct from 'requested' then
  raise exception 'Asking the remover did not look sent';
 end if;
 if public.plan_connection_states('f1100000-0000-4000-8000-000000000001')->>'f1000000-0000-4000-8000-000000000002' is distinct from 'requested_by_me' then
  raise exception 'Asking the remover did not read as sent: %', public.plan_connection_states('f1100000-0000-4000-8000-000000000001');
 end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from public.connections where user_a='f1000000-0000-4000-8000-000000000002' and user_b='f1000000-0000-4000-8000-000000000003')
 or exists(select 1 from private.notification_outbox where kind='connection_request' and actor_id='f1000000-0000-4000-8000-000000000003') then
  raise exception 'Asking the remover stored or sent something';
 end if;
end $$;
rollback;

-- Slice 3: inviting a connection in the app, the two notices' eligibility, and deletion.
-- Here plan f11…02 'Board game night' (its own series) has only 02, Going.
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('f1000000-0000-4000-8000-000000000001','co1-owner@resbite-test.invalid',now()),
 ('f1000000-0000-4000-8000-000000000002','co1-going@resbite-test.invalid',now()),
 ('f1000000-0000-4000-8000-000000000003','co1-maybe@resbite-test.invalid',now()),
 ('f1000000-0000-4000-8000-000000000004','co1-pending@resbite-test.invalid',now()),
 ('f1000000-0000-4000-8000-000000000005','co1-stranger@resbite-test.invalid',now()),
 ('f1000000-0000-4000-8000-000000000006','co1-cant-go@resbite-test.invalid',now());
insert into private.tester_roster(email) values ('co1-owner@resbite-test.invalid'),('co1-going@resbite-test.invalid'),
 ('co1-maybe@resbite-test.invalid'),('co1-pending@resbite-test.invalid'),('co1-stranger@resbite-test.invalid'),
 ('co1-cant-go@resbite-test.invalid');
insert into public.profiles(id,display_name) values
 ('f1000000-0000-4000-8000-000000000001','Owner'),('f1000000-0000-4000-8000-000000000002','Guest A'),
 ('f1000000-0000-4000-8000-000000000003','Guest B'),('f1000000-0000-4000-8000-000000000004','Guest C'),
 ('f1000000-0000-4000-8000-000000000005','Stranger'),('f1000000-0000-4000-8000-000000000006','Guest D');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.create_plan_v4('f1100000-0000-4000-8000-000000000001','Film night','',array['community'],null,
 '2099-06-04 19:00+00','2099-06-04 22:00+00','UTC','Cinema',false,null,'');
select public.create_plan_v4('f1100000-0000-4000-8000-000000000002','Board game night','',array['community'],null,
 '2099-06-11 19:00+00','2099-06-11 22:00+00','UTC','Kitchen',false,null,'');
reset role;
insert into public.attendees(plan_id,user_id,response) values
 ('f1100000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000002','accepted'),
 ('f1100000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000003','maybe'),
 ('f1100000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000004','pending'),
 ('f1100000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000006','declined'),
 ('f1100000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000002','accepted');
-- 02 asks 01 and 01 accepts (02 is told); 01 asks 03 and 03 accepts; 02 asks 03 (03 is told).
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.request_connection('f1000000-0000-4000-8000-000000000001','f1100000-0000-4000-8000-000000000001');
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.accept_connection('f1000000-0000-4000-8000-000000000002');
select public.request_connection('f1000000-0000-4000-8000-000000000003','f1100000-0000-4000-8000-000000000001');
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select public.accept_connection('f1000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.request_connection('f1000000-0000-4000-8000-000000000003','f1100000-0000-4000-8000-000000000001');

-- A connection who may not use the app is no connection to invite, refused with the same message: 03 with the roster
-- entry disabled, then with a deletion pending. Neither adds 03 or tells them anything.
reset role;
update private.tester_roster set enabled=false where email='co1-maybe@resbite-test.invalid';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 begin perform public.invite_contacts('f1100000-0000-4000-8000-000000000002',jsonb_build_array(jsonb_build_object('user','f1000000-0000-4000-8000-000000000003')));
  raise exception 'A connection who is not eligible was invited';
 exception when insufficient_privilege then if sqlerrm<>'Not a connection' then raise exception 'Wrong message: %', sqlerrm; end if; end;
end $$;
reset role;
update private.tester_roster set enabled=true where email='co1-maybe@resbite-test.invalid';
update public.profiles set deletion_requested_at=now() where id='f1000000-0000-4000-8000-000000000003';
set local role authenticated;
do $$ begin
 begin perform public.invite_contacts('f1100000-0000-4000-8000-000000000002',jsonb_build_array(jsonb_build_object('user','f1000000-0000-4000-8000-000000000003')));
  raise exception 'A connection whose deletion is pending was invited';
 exception when insufficient_privilege then if sqlerrm<>'Not a connection' then raise exception 'Wrong message: %', sqlerrm; end if; end;
end $$;
reset role;
update public.profiles set deletion_requested_at=null where id='f1000000-0000-4000-8000-000000000003';
-- Asked is not connected: 02, made an admin of Board game night, has only asked 03, and is refused the same way.
insert into public.plan_admins(plan_id,user_id,appointed_by) values
 ('f1100000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 begin perform public.invite_contacts('f1100000-0000-4000-8000-000000000002',jsonb_build_array(jsonb_build_object('user','f1000000-0000-4000-8000-000000000003')));
  raise exception 'A host who has only asked invited the person asked';
 exception when insufficient_privilege then if sqlerrm<>'Not a connection' then raise exception 'Wrong message: %', sqlerrm; end if; end;
end $$;
reset role;
do $$ begin
 if exists(select 1 from public.attendees where plan_id='f1100000-0000-4000-8000-000000000002' and user_id='f1000000-0000-4000-8000-000000000003')
 or exists(select 1 from private.notification_outbox where kind='invited') then
  raise exception 'A refused invitation by user added or told someone';
 end if;
end $$;
set local role authenticated;

-- Inviting a connection in the app: 01 invites 03, a connection not on Board game night. 'app': a pending guest row and
-- the invited notice from 01. An item by user is not charged to the lookup budget.
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 r := public.invite_contacts('f1100000-0000-4000-8000-000000000002',jsonb_build_array(jsonb_build_object('user','f1000000-0000-4000-8000-000000000003')));
 if r is distinct from jsonb_build_array(jsonb_build_object('user','f1000000-0000-4000-8000-000000000003','kind','app')) then
  raise exception 'Inviting a connection wrong: %', r;
 end if;
end $$;
reset role;
do $$ declare o private.notification_outbox; begin
 if not exists(select 1 from public.attendees where plan_id='f1100000-0000-4000-8000-000000000002'
   and user_id='f1000000-0000-4000-8000-000000000003' and response='pending') then
  raise exception 'The connection invited has no pending guest row';
 end if;
 if (select count(*) from private.notification_outbox where kind='invited' and recipient_id='f1000000-0000-4000-8000-000000000003')<>1 then
  raise exception 'One invited notice expected';
 end if;
 select * into o from private.notification_outbox where kind='invited' and recipient_id='f1000000-0000-4000-8000-000000000003';
 if o.plan_id is distinct from 'f1100000-0000-4000-8000-000000000002' or o.actor_id is distinct from 'f1000000-0000-4000-8000-000000000001'
 or o.dedupe_key is distinct from 'invited:f1100000-0000-4000-8000-000000000002:f1000000-0000-4000-8000-000000000003' then
  raise exception 'Invited notice wrong: %', o;
 end if;
 if coalesce((select count from private.lookup_usage where user_id='f1000000-0000-4000-8000-000000000001'),0)<>0 then
  raise exception 'An item by user was charged';
 end if;
end $$;

-- Already on the resbite: 02, a guest, and 01, its owner, invited by 02 as an admin: 'already', nothing new. Someone
-- who is no connection of the caller (05, or the caller themself) is refused, as is an item whose user is not an id.
set local role authenticated;
do $$ declare r jsonb; begin
 r := public.invite_contacts('f1100000-0000-4000-8000-000000000002',jsonb_build_array(jsonb_build_object('user','f1000000-0000-4000-8000-000000000002')));
 if r is distinct from jsonb_build_array(jsonb_build_object('user','f1000000-0000-4000-8000-000000000002','kind','already')) then
  raise exception 'Inviting a connection already on the resbite wrong: %', r;
 end if;
 begin perform public.invite_contacts('f1100000-0000-4000-8000-000000000002',jsonb_build_array(jsonb_build_object('user','f1000000-0000-4000-8000-000000000005')));
  raise exception 'Someone who is not a connection was invited';
 exception when insufficient_privilege then if sqlerrm<>'Not a connection' then raise exception 'Wrong message: %', sqlerrm; end if; end;
 begin perform public.invite_contacts('f1100000-0000-4000-8000-000000000002',jsonb_build_array(jsonb_build_object('user','f1000000-0000-4000-8000-000000000001')));
  raise exception 'The caller invited themself';
 exception when insufficient_privilege then if sqlerrm<>'Not a connection' then raise exception 'Wrong message: %', sqlerrm; end if; end;
 begin perform public.invite_contacts('f1100000-0000-4000-8000-000000000002',jsonb_build_array(jsonb_build_object('user','not-an-id')));
  raise exception 'An item whose user is not an id was taken';
 exception when invalid_parameter_value then if sqlerrm<>'Invalid invitation' then raise exception 'Wrong message: %', sqlerrm; end if; end;
end $$;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 r := public.invite_contacts('f1100000-0000-4000-8000-000000000002',jsonb_build_array(jsonb_build_object('user','f1000000-0000-4000-8000-000000000001')));
 if r is distinct from jsonb_build_array(jsonb_build_object('user','f1000000-0000-4000-8000-000000000001','kind','already')) then
  raise exception 'An admin inviting the owner wrong: %', r;
 end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from public.attendees where plan_id='f1100000-0000-4000-8000-000000000002')<>2
 or not exists(select 1 from public.attendees where plan_id='f1100000-0000-4000-8000-000000000002'
   and user_id='f1000000-0000-4000-8000-000000000002' and response='accepted')
 or exists(select 1 from private.notification_outbox where kind='invited' and recipient_id<>'f1000000-0000-4000-8000-000000000003') then
  raise exception 'Inviting someone already on the resbite, or refused, wrote something';
 end if;
end $$;

-- A batch may mix the two shapes: one result per item, in order; only the number is charged.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 r := public.invite_contacts('f1100000-0000-4000-8000-000000000002',jsonb_build_array(
  jsonb_build_object('user','f1000000-0000-4000-8000-000000000003'),
  jsonb_build_object('phone','447700900301','country','44','code',repeat('F',22))));
 if r is distinct from jsonb_build_array(jsonb_build_object('user','f1000000-0000-4000-8000-000000000003','kind','already'),
   jsonb_build_object('phone','447700900301','kind','link')) then
  raise exception 'A mixed batch wrong: %', r;
 end if;
end $$;
reset role;
do $$ begin
 if (select count from private.lookup_usage where user_id='f1000000-0000-4000-8000-000000000001') is distinct from 1 then
  raise exception 'A mixed batch charged other than its number';
 end if;
end $$;

-- The two notices go only while what they tell stands: 02's request to 03 while one by 02 is live (not tied to the
-- resbite: 03 off Film night and muting its series is still told; not after a day; not held to the request's time, as
-- one notice serves every request 02 sends 03 from that series, CO-R8); the acceptance to 02 while the two are
-- connected, and only while it is not older than accepted_at. Each is stamped with its row's time when queued. The
-- invited notice keeps the rule it had.
create temporary table co3_notices on commit drop as select
 (select id from private.notification_outbox where kind='connection_request' and recipient_id='f1000000-0000-4000-8000-000000000003'
   and actor_id='f1000000-0000-4000-8000-000000000002') as request,
 (select id from private.notification_outbox where kind='connection_accepted' and recipient_id='f1000000-0000-4000-8000-000000000002'
   and actor_id='f1000000-0000-4000-8000-000000000001') as accepted,
 (select id from private.notification_outbox where kind='invited' and recipient_id='f1000000-0000-4000-8000-000000000003') as invited;
do $$ declare n co3_notices; v_at timestamptz; begin
 select * into n from co3_notices;
 if n.request is null or n.accepted is null or n.invited is null then raise exception 'A notice is missing: %', n; end if;
 if (select created_at from private.notification_outbox where id=n.request) is distinct from (select created_at from public.connections
   where user_a='f1000000-0000-4000-8000-000000000002' and user_b='f1000000-0000-4000-8000-000000000003')
 or (select created_at from private.notification_outbox where id=n.accepted) is distinct from (select accepted_at from public.connections
   where user_a='f1000000-0000-4000-8000-000000000001' and user_b='f1000000-0000-4000-8000-000000000002') then
  raise exception 'A connection notice is not stamped with its row''s time';
 end if;
 if not private.notification_recipient_eligible(n.request) then raise exception 'A live request''s notice was not eligible'; end if;
 if not private.notification_recipient_eligible(n.accepted) then raise exception 'A connection''s acceptance notice was not eligible'; end if;
 if not private.notification_recipient_eligible(n.invited) then raise exception 'The invited notice was not eligible'; end if;
 delete from public.attendees where plan_id='f1100000-0000-4000-8000-000000000001' and user_id='f1000000-0000-4000-8000-000000000003';
 insert into public.plan_mutes(series_id,user_id) values
  ((select series_id from public.plans where id='f1100000-0000-4000-8000-000000000001'),'f1000000-0000-4000-8000-000000000003');
 if not private.notification_recipient_eligible(n.request) then raise exception 'A request''s notice was tied to the resbite or its mute'; end if;
 -- A day old: 23 hours old it goes, 25 hours old it does not. Only the notice is aged: it is older than the request
 -- row then, which does not stop it (CO-R8); the day does.
 select created_at into v_at from private.notification_outbox where id=n.request;
 update private.notification_outbox set created_at=now()-interval '23 hours' where id=n.request;
 if not private.notification_recipient_eligible(n.request) then raise exception 'A request''s notice under a day old was not eligible'; end if;
 update private.notification_outbox set created_at=now()-interval '25 hours' where id=n.request;
 if private.notification_recipient_eligible(n.request) then raise exception 'A day-old request''s notice was eligible'; end if;
 update private.notification_outbox set created_at=v_at where id=n.request;
 select accepted_at into v_at from public.connections
  where user_a='f1000000-0000-4000-8000-000000000001' and user_b='f1000000-0000-4000-8000-000000000002';
 update public.connections set accepted_at=now()-interval '26 hours'
  where user_a='f1000000-0000-4000-8000-000000000001' and user_b='f1000000-0000-4000-8000-000000000002';
 update private.notification_outbox set created_at=now()-interval '23 hours' where id=n.accepted;
 if not private.notification_recipient_eligible(n.accepted) then raise exception 'An acceptance notice under a day old was not eligible'; end if;
 update private.notification_outbox set created_at=now()-interval '25 hours' where id=n.accepted;
 if private.notification_recipient_eligible(n.accepted) then raise exception 'A day-old acceptance notice was eligible'; end if;
 update public.connections set accepted_at=v_at
  where user_a='f1000000-0000-4000-8000-000000000001' and user_b='f1000000-0000-4000-8000-000000000002';
 update private.notification_outbox set created_at=v_at where id=n.accepted;
 update public.connections set accepted_at=accepted_at+interval '1 second'
  where user_a='f1000000-0000-4000-8000-000000000001' and user_b='f1000000-0000-4000-8000-000000000002';
 if private.notification_recipient_eligible(n.accepted) then raise exception 'An acceptance notice older than the acceptance was eligible'; end if;
 update public.connections set accepted_at=accepted_at-interval '1 second'
  where user_a='f1000000-0000-4000-8000-000000000001' and user_b='f1000000-0000-4000-8000-000000000002';
 if not private.notification_recipient_eligible(n.accepted) then raise exception 'The acceptance notice did not come back'; end if;
 update public.connections set requested_by='f1000000-0000-4000-8000-000000000003'
  where user_a='f1000000-0000-4000-8000-000000000002' and user_b='f1000000-0000-4000-8000-000000000003';
 if private.notification_recipient_eligible(n.request) then raise exception 'A request''s notice was eligible once the request was the other way'; end if;
 update public.connections set requested_by='f1000000-0000-4000-8000-000000000002'
  where user_a='f1000000-0000-4000-8000-000000000002' and user_b='f1000000-0000-4000-8000-000000000003';
 delete from public.plan_mutes where user_id='f1000000-0000-4000-8000-000000000003';
 insert into public.attendees(plan_id,user_id,response) values
  ('f1100000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000003','maybe');
end $$;
-- 02 takes the request back and sends it again at once: the one notice does not go while there is no request, and goes
-- again once it is sent again; nothing new is queued (CO-R8), though the request row is newer than its notice.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.cancel_connection_request('f1000000-0000-4000-8000-000000000003');
reset role;
do $$ begin
 if private.notification_recipient_eligible((select request from co3_notices)) then raise exception 'A cancelled request''s notice was eligible'; end if;
end $$;
set local role authenticated;
select public.request_connection('f1000000-0000-4000-8000-000000000003','f1100000-0000-4000-8000-000000000001');
reset role;
do $$ declare n co3_notices; c public.connections; begin
 select * into n from co3_notices;
 select * into c from public.connections where user_a='f1000000-0000-4000-8000-000000000002' and user_b='f1000000-0000-4000-8000-000000000003';
 if (select count(*) from private.notification_outbox where kind='connection_request'
   and recipient_id='f1000000-0000-4000-8000-000000000003' and actor_id='f1000000-0000-4000-8000-000000000002')<>1
 or (select dedupe_key from private.notification_outbox where id=n.request) is distinct from
   'connect:f1000000-0000-4000-8000-000000000002:f1000000-0000-4000-8000-000000000003:'||c.series_id||':f1000000-0000-4000-8000-000000000002'
 or (select created_at from private.notification_outbox where id=n.request)>=c.created_at then
  raise exception 'The request sent again at once queued another notice, or the one notice is not the first request''s';
 end if;
 if not private.notification_recipient_eligible(n.request) then raise exception 'The notice of the request sent again did not go'; end if;
end $$;
-- 03 declines 02: the request's notice no longer goes. 01 removes 02: the acceptance's no longer goes.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select public.decline_connection('f1000000-0000-4000-8000-000000000002');
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.remove_connection('f1000000-0000-4000-8000-000000000002');
reset role;
do $$ declare n co3_notices; begin
 select * into n from co3_notices;
 if private.notification_recipient_eligible(n.request) then raise exception 'A declined request''s notice was eligible'; end if;
 if private.notification_recipient_eligible(n.accepted) then raise exception 'A removed connection''s acceptance notice was eligible'; end if;
end $$;

-- Deletion clears every pair and every refusal of the person deleted, either side (the profile stays, as 'Deleted
-- member', so nothing cascades). The deletion lifecycle is local-only: this runs where it exists. Before it, 03 is
-- connected to 02 (03's asking from Board game night accepts 02's request, refused but still looking sent), has asked
-- 06 (03 the first of the pair), has removed 01 and been refused by 01; 01 has asked 06, and 02 stays refused by 01's
-- removal.
update public.attendees set response='accepted' where plan_id='f1100000-0000-4000-8000-000000000002' and user_id='f1000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 if public.request_connection('f1000000-0000-4000-8000-000000000002','f1100000-0000-4000-8000-000000000002') is distinct from 'connected' then
  raise exception 'Asking the refused requester back did not connect';
 end if;
 perform public.remove_connection('f1000000-0000-4000-8000-000000000001');
 if public.request_connection('f1000000-0000-4000-8000-000000000001','f1100000-0000-4000-8000-000000000001') is distinct from 'requested' then
  raise exception 'The remover could not ask';
 end if;
 if public.request_connection('f1000000-0000-4000-8000-000000000006','f1100000-0000-4000-8000-000000000001') is distinct from 'requested' then
  raise exception 'Asking a guest who can''t go did not say requested';
 end if;
end $$;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.decline_connection('f1000000-0000-4000-8000-000000000003');
select public.request_connection('f1000000-0000-4000-8000-000000000006','f1100000-0000-4000-8000-000000000001');
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if not exists(select 1 from jsonb_array_elements(public.my_connections()->'connected') e where e->>'user_id'='f1000000-0000-4000-8000-000000000003') then
  raise exception 'Before the deletion 02 does not list 03: %', public.my_connections();
 end if;
end $$;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000006","role":"authenticated"}',true);
do $$ begin
 if not exists(select 1 from jsonb_array_elements(public.my_connections()->'requests') e where e->>'user_id'='f1000000-0000-4000-8000-000000000003') then
  raise exception 'Before the deletion 06 does not list 03''s request: %', public.my_connections();
 end if;
end $$;
reset role;
do $$ begin
 if (select array_agg(state order by user_a,user_b) from public.connections where 'f1000000-0000-4000-8000-000000000003' in (user_a,user_b))
   is distinct from array['connected','requested']
 or (select count(*) from private.connection_refusals where from_user='f1000000-0000-4000-8000-000000000003'
   and to_user='f1000000-0000-4000-8000-000000000001')<>1
 or (select count(*) from private.connection_refusals where from_user='f1000000-0000-4000-8000-000000000001'
   and to_user='f1000000-0000-4000-8000-000000000003' and hidden)<>1 then
  raise exception 'The pairs and refusals before the deletion are not as set up';
 end if;
end $$;
insert into auth.sessions(id,user_id,created_at) values('f1200000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000003',now());
set local role service_role;
do $$ begin
 if to_regprocedure('public.request_account_deletion(uuid,uuid,uuid,text)') is not null then
  perform private.request_account_deletion('f1000000-0000-4000-8000-000000000003','f1200000-0000-4000-8000-000000000003',
   'f1300000-0000-4000-8000-000000000003',repeat('c',64));
 end if;
end $$;
reset role;
do $$ begin
 if to_regprocedure('public.request_account_deletion(uuid,uuid,uuid,text)') is not null then
  if exists(select 1 from public.connections where 'f1000000-0000-4000-8000-000000000003' in (user_a,user_b))
  or exists(select 1 from private.connection_refusals where 'f1000000-0000-4000-8000-000000000003' in (from_user,to_user)) then
   raise exception 'The deletion left a pair or a refusal of the person deleted';
  end if;
  if not exists(select 1 from public.connections where user_a='f1000000-0000-4000-8000-000000000001' and user_b='f1000000-0000-4000-8000-000000000006')
  or not exists(select 1 from private.connection_refusals where from_user='f1000000-0000-4000-8000-000000000002' and to_user='f1000000-0000-4000-8000-000000000001') then
   raise exception 'The deletion took someone else''s pair or refusal';
  end if;
 end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if to_regprocedure('public.request_account_deletion(uuid,uuid,uuid,text)') is not null
 and exists(select 1 from jsonb_array_elements((public.my_connections()->'connected')||(public.my_connections()->'requests')) e
   where e->>'user_id'='f1000000-0000-4000-8000-000000000003') then
  raise exception 'After the deletion 02 still lists 03: %', public.my_connections();
 end if;
end $$;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000006","role":"authenticated"}',true);
do $$ begin
 if to_regprocedure('public.request_account_deletion(uuid,uuid,uuid,text)') is not null
 and exists(select 1 from jsonb_array_elements((public.my_connections()->'connected')||(public.my_connections()->'requests')) e
   where e->>'user_id'='f1000000-0000-4000-8000-000000000003') then
  raise exception 'After the deletion 06 still lists 03: %', public.my_connections();
 end if;
end $$;
rollback;
