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

-- 02 asks 03, twice: one row, one notice.
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
 or o.plan_id is distinct from 'f1100000-0000-4000-8000-000000000001' or o.detail is not null
 or o.dedupe_key is distinct from 'connect:f1000000-0000-4000-8000-000000000002:f1000000-0000-4000-8000-000000000003:'||v_series||':'||extract(epoch from c.created_at)::bigint then
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
do $$ begin
 if exists(select 1 from public.connections where 'f1000000-0000-4000-8000-000000000004' in (user_a,user_b) or 'f1000000-0000-4000-8000-000000000005' in (user_a,user_b))
 or exists(select 1 from private.notification_outbox where recipient_id in ('f1000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000005')) then
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
 or o.dedupe_key is distinct from 'connected:f1000000-0000-4000-8000-000000000001:f1000000-0000-4000-8000-000000000002:'||extract(epoch from c.accepted_at)::bigint then
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
 or o.dedupe_key is distinct from 'connected:f1000000-0000-4000-8000-000000000002:f1000000-0000-4000-8000-000000000003:'||extract(epoch from c.accepted_at)::bigint then
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
-- but stores and sends nothing, while the refuser may still ask.
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
do $$ begin
 begin perform public.decline_connection('f1000000-0000-4000-8000-000000000002');
  raise exception 'A request that does not exist was declined';
 exception when insufficient_privilege then if sqlerrm<>'No request' then raise exception 'Wrong message: %', sqlerrm; end if; end;
end $$;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000006","role":"authenticated"}',true);
select public.decline_connection('f1000000-0000-4000-8000-000000000002');
reset role;
do $$ begin
 if exists(select 1 from public.connections where user_a='f1000000-0000-4000-8000-000000000002' and user_b='f1000000-0000-4000-8000-000000000006') then
  raise exception 'A declined request stayed';
 end if;
 if not exists(select 1 from private.connection_refusals where series_id=(select series_id from public.plans where id='f1100000-0000-4000-8000-000000000001')
   and from_user='f1000000-0000-4000-8000-000000000002' and to_user='f1000000-0000-4000-8000-000000000006' and refused_at is not null)
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
 or o.dedupe_key is distinct from 'connected:f1000000-0000-4000-8000-000000000002:f1000000-0000-4000-8000-000000000006:'||extract(epoch from c.accepted_at)::bigint then
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
 if not exists(select 1 from private.connection_refusals where series_id=(select series_id from public.plans where id='f1100000-0000-4000-8000-000000000001')
   and from_user='f1000000-0000-4000-8000-000000000003' and to_user='f1000000-0000-4000-8000-000000000002')
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
-- From the other resbite (its own series) 03's request is a real one.
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
 or o.dedupe_key is distinct from 'connect:f1000000-0000-4000-8000-000000000002:f1000000-0000-4000-8000-000000000003:'||c.series_id||':'||extract(epoch from c.created_at)::bigint then
  raise exception 'The request from another resbite was not told: %', o;
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
-- back; a cancelled request may be sent again, and is told again.
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
end $$;
create temporary table co1_told as select count(*) as n from private.notification_outbox
 where kind='connection_request' and actor_id='f1000000-0000-4000-8000-000000000002' and recipient_id='f1000000-0000-4000-8000-000000000003';
-- The notice's key carries the request's time to the second: the request sent again comes a second later.
select pg_sleep(1);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if public.request_connection('f1000000-0000-4000-8000-000000000003','f1100000-0000-4000-8000-000000000001') is distinct from 'requested' then
  raise exception 'A cancelled request could not be sent again';
 end if;
end $$;
reset role;
do $$ declare c public.connections; begin
 select * into c from public.connections where user_a='f1000000-0000-4000-8000-000000000002' and user_b='f1000000-0000-4000-8000-000000000003';
 if (select count(*) from private.notification_outbox where kind='connection_request' and actor_id='f1000000-0000-4000-8000-000000000002'
   and recipient_id='f1000000-0000-4000-8000-000000000003')<>(select n from co1_told)+1
 or not exists(select 1 from private.notification_outbox where kind='connection_request'
   and dedupe_key='connect:f1000000-0000-4000-8000-000000000002:f1000000-0000-4000-8000-000000000003:'||c.series_id||':'||extract(epoch from c.created_at)::bigint) then
  raise exception 'A request sent again after a cancel was not told again';
 end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.cancel_connection_request('f1000000-0000-4000-8000-000000000003');
reset role;
do $$ begin
 if (select count(*) from private.connection_refusals where to_user='f1000000-0000-4000-8000-000000000003' or from_user='f1000000-0000-4000-8000-000000000003')<>1 then
  raise exception 'A cancellation was kept as a refusal';
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
rollback;
