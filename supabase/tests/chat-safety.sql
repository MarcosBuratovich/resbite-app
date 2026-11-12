-- Chat safety (docs/superpowers/plans/2026-11-11-chat-3-safety.md, Task 1; docs/superpowers/specs/2026-11-10-groups-and-chat-design.md,
-- CH-P13, with the rulings G-B1 to G-B3, G-N12, G-S10, G-S13 and the challenge's B4, I1, I2, I5, N1 to N3, R-Q5,
-- and the confirmation's I-2, I-3, S2, S7, SHOULD 4 and NOTEs 1, 3 and 13): blocks, and the block rule in every read,
-- push and way to connect. Slice 1 (Task 1). Synthetic identities only: emails s3-…@resbite-test.invalid, ids with the
-- prefix e7, and two phone numbers from Ofcom's drama range (07700 900xxx, kept for fiction).
--
-- One transaction per slice, begin … rollback, as connections.sql does. Times, rows and flags set by hand sit between
-- set_config('resbite.system','roll',true) and set_config('resbite.system','',true) where they would otherwise write a
-- chat line. now() is the transaction's start, so "a minute later" is written by moving a row's created_at back (NOTE 1):
-- send_message's one-push-a-minute test and send_announcement's 'Too fast' both read created_at against now().
--
-- The cast (pg_temp.e7_cast()). Users e7…: 01 'Ana Host', the owner of every plan; 02 'Ada Admin', an admin of the first
-- three, Going on them; 03 'Mia Going', 04 'Leo Going', 05 'Sol Going' and 07 'Eva Going', Going on the one-off and the
-- group; 06 'Tom Pending', not answered on the one-off only (on a group 06 would be in the chat and read its people);
-- 08 'Max Stranger', on no plan; 09 'Zed Nine', Going on the one-off only; 10 'Noa Brought', not answered on the
-- group, brought by 05; 11 'Ian Brought' and 12 'Kim Invited', not answered on the third plan, 11 brought by 03 and 12
-- with an 'invited' notice from 04 (set by hand, as an in-app invitation leaves them); 13 'Uma Quiet', Going on the
-- one-off only. Everyone is on the tester roster and has used the app. 01 and 03 have confirmed numbers. 03 and 04 are
-- connected on the group's series. Plans e71…, each made with create_plan_v4 as 01: 01 'Picnic', a one-off with an open
-- link; 02 'Board game night', weekly (a group); 03 'Quiz night', a one-off of its own series, with 03 and 04 Going; 04
-- 'Walk', a one-off with no guests (03 is on every other plan). Plan k starts k days from now, on the minute, for two
-- hours (pg_temp.e7_start(k)).

-- Helpers, for this file's session only (temporary: gone with it).
create function pg_temp.e7(p text) returns uuid language sql immutable as $$ select ('e7000000-0000-4000-8000-0000000000'||p)::uuid $$;
create function pg_temp.e7p(p text) returns uuid language sql immutable as $$ select ('e7100000-0000-4000-8000-0000000000'||p)::uuid $$;
create function pg_temp.e7_start(k integer) returns timestamptz language sql stable as $$ select date_trunc('minute',now())+k*interval '1 day' $$;
-- Acting as someone: the claims auth.uid() reads (the role is set apart, with set local role).
create function pg_temp.s3_as(p_user uuid) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role','authenticated')::text,true)
$$;
create function pg_temp.s3_check(p_ok boolean, p_what text) returns void language plpgsql as $$
begin
 if p_ok is not true then raise exception '%', p_what; end if;
end $$;
-- A call that must be refused with exactly this code and message. The refusal undoes the call, as a real one would.
create function pg_temp.s3_refused(p_sql text, p_state text, p_message text) returns void language plpgsql as $$
declare v_state text; v_message text;
begin
 begin
  execute p_sql;
 exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_message = message_text;
 end;
 if v_state is distinct from p_state or v_message is distinct from p_message then
  raise exception 'Expected % "%", got % "%": %', p_state, p_message, v_state, v_message, p_sql;
 end if;
end $$;
-- People as their two-digit numbers, sorted: '01,02,03' ('' for nobody).
create function pg_temp.s3_who(p uuid[]) returns text language sql immutable as $$
 select coalesce(string_agg(right(u::text,2),',' order by u),'') from unnest(p) u
$$;
-- An id kept for later in this transaction (set_config 's3.<name>').
create function pg_temp.s3_id(p_name text) returns bigint language sql stable as $$ select current_setting('s3.'||p_name)::bigint $$;
-- A message or an announcement sent as the current claims, with a fresh client id: its id.
create function pg_temp.s3_send(p_series uuid, p_body text) returns bigint language plpgsql as $$
begin
 return (public.send_message(p_series,p_body,gen_random_uuid())->>'id')::bigint;
end $$;
create function pg_temp.s3_announce(p_series uuid, p_body text) returns bigint language plpgsql as $$
begin
 return (public.send_announcement(p_series,p_body,'everyone',gen_random_uuid())->>'id')::bigint;
end $$;
-- A read's rows: whether one has this id; how many are by this author.
create function pg_temp.s3_has(p_read jsonb, p_id bigint) returns boolean language sql immutable as $$
 select exists(select 1 from jsonb_array_elements(p_read->'rows') e where (e.value->>'id')::bigint=p_id)
$$;
create function pg_temp.s3_by(p_read jsonb, p_author uuid) returns integer language sql immutable as $$
 select count(*)::integer from jsonb_array_elements(p_read->'rows') e where e.value->>'author_id'=p_author::text
$$;
-- The people a kind of notice went to about a message, as s3_who writes them. The superuser's.
create function pg_temp.s3_to(p_kind text, p_message bigint) returns text language plpgsql stable as $$
begin
 return pg_temp.s3_who(array(select o.recipient_id from private.notification_outbox o where o.kind=p_kind and o.message_id=p_message));
end $$;
-- A notice of a kind about a message to one person: whether it may be told now (an error when there is none). The
-- superuser's.
create function pg_temp.s3_told(p_kind text, p_message bigint, p_to uuid) returns boolean language plpgsql stable as $$
declare v_id bigint;
begin
 select o.id into v_id from private.notification_outbox o where o.kind=p_kind and o.message_id=p_message and o.recipient_id=p_to;
 if v_id is null then raise exception 'No % notice about % to %', p_kind, p_message, p_to; end if;
 return private.notification_recipient_eligible(v_id);
end $$;
-- Whether one person has blocked another. The superuser's.
create function pg_temp.s3_blocked(p_blocker uuid, p_blocked uuid) returns boolean language plpgsql stable as $$
begin
 return exists(select 1 from private.blocks b where b.blocker_id=p_blocker and b.blocked_id=p_blocked);
end $$;
-- The refusal from one person of another on a series: 'hidden', 'visible' or 'none'. The superuser's.
create function pg_temp.s3_refusal(p_series uuid, p_from uuid, p_to uuid) returns text language plpgsql stable as $$
begin
 return coalesce((select case when r.hidden then 'hidden' else 'visible' end from private.connection_refusals r
  where r.series_id=p_series and r.from_user=p_from and r.to_user=p_to),'none');
end $$;
-- Whether two people have a pair row. The superuser's.
create function pg_temp.s3_paired(p_a uuid, p_b uuid) returns boolean language plpgsql stable as $$
begin
 return exists(select 1 from public.connections c where (c.user_a,c.user_b)=(least(p_a,p_b),greatest(p_a,p_b)));
end $$;
-- Answering as the current claims, at the row's version.
create function pg_temp.s3_respond(p_plan uuid, p_response text) returns integer language plpgsql as $$
begin
 return public.respond(p_plan,p_response,(select a.version from public.attendees a
  where a.plan_id=p_plan and a.user_id=(current_setting('request.jwt.claims')::jsonb->>'sub')::uuid));
end $$;
-- Edit through change_plan_v4 as the current claims, at the plan's version, moving only its place (a real change: a
-- changed line and a plan_changed notice to the guests). With p_cancel, instead "Cancel just this one".
create function pg_temp.s3_change(p_plan uuid, p_place text, p_cancel boolean) returns integer language plpgsql as $$
declare p public.plans;
begin
 select * into p from public.plans where id=p_plan;
 return public.change_plan_v4(p_plan,p.version,p.title,p.description,p.categories,p.starts_at,p.ends_at,p.time_zone,
  coalesce(p_place,p.place_label),p.place_tbd,p.repeat_weeks,null,null,p_cancel,false);
end $$;
-- The cast (see the header). Run as the superuser at the start of each slice; it leaves no claims and no flag behind.
create function pg_temp.e7_cast() returns void language plpgsql as $cast$
declare v_people text[] := array['01','02','03','04','05','06','07','08','09','10','11','12','13'];
begin
 insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at)
  select pg_temp.e7(n),'s3-'||n||'@resbite-test.invalid',now(),case when n in ('01','03') then '4477009007'||n end,
   case when n in ('01','03') then now() end
  from unnest(v_people) n;
 insert into private.tester_roster(email) select 's3-'||n||'@resbite-test.invalid' from unnest(v_people) n;
 insert into public.profiles(id,display_name) values
  (pg_temp.e7('01'),'Ana Host'),(pg_temp.e7('02'),'Ada Admin'),(pg_temp.e7('03'),'Mia Going'),(pg_temp.e7('04'),'Leo Going'),
  (pg_temp.e7('05'),'Sol Going'),(pg_temp.e7('06'),'Tom Pending'),(pg_temp.e7('07'),'Eva Going'),(pg_temp.e7('08'),'Max Stranger'),
  (pg_temp.e7('09'),'Zed Nine'),(pg_temp.e7('10'),'Noa Brought'),(pg_temp.e7('11'),'Ian Brought'),(pg_temp.e7('12'),'Kim Invited'),(pg_temp.e7('13'),'Uma Quiet');
 insert into private.app_sessions(user_id) select pg_temp.e7(n) from unnest(v_people) n;
 perform pg_temp.s3_as(pg_temp.e7('01'));
 perform public.create_plan_v4(pg_temp.e7p('01'),'Picnic','',array['community'],null,pg_temp.e7_start(1),pg_temp.e7_start(1)+interval '2 hours',
  'Europe/London','The park',false,null::smallint);
 perform public.create_plan_v4(pg_temp.e7p('02'),'Board game night','',array['community'],null,pg_temp.e7_start(2),
  pg_temp.e7_start(2)+interval '2 hours','Europe/London','Ana''s flat',false,1::smallint);
 perform public.create_plan_v4(pg_temp.e7p('03'),'Quiz night','',array['community'],null,pg_temp.e7_start(3),pg_temp.e7_start(3)+interval '2 hours',
  'Europe/London','The pub',false,null::smallint);
 perform public.create_plan_v4(pg_temp.e7p('04'),'Walk','',array['physical'],null,pg_temp.e7_start(4),pg_temp.e7_start(4)+interval '2 hours',
  'Europe/London','The hill',false,null::smallint);
 perform set_config('request.jwt.claims','',true);
 perform set_config('resbite.system','roll',true);
 insert into public.attendees(plan_id,user_id,response)
  select pg_temp.e7p(x.p),pg_temp.e7(x.n),x.response from (values
   ('01','02','accepted'),('01','03','accepted'),('01','04','accepted'),('01','05','accepted'),('01','07','accepted'),('01','06','pending'),
   ('01','09','accepted'),('01','13','accepted'),
   ('02','02','accepted'),('02','03','accepted'),('02','04','accepted'),('02','05','accepted'),('02','07','accepted'),
   ('03','02','accepted'),('03','03','accepted'),('03','04','accepted'),('03','12','pending')) x(p,n,response);
 insert into public.attendees(plan_id,user_id,response,brought_by,level) values (pg_temp.e7p('03'),pg_temp.e7('11'),'pending',pg_temp.e7('03'),2),
  (pg_temp.e7p('02'),pg_temp.e7('10'),'pending',pg_temp.e7('05'),2);
 insert into public.plan_admins(plan_id,user_id,appointed_by) select pg_temp.e7p(p),pg_temp.e7('02'),pg_temp.e7('01') from unnest(array['01','02','03']) p;
 perform set_config('resbite.system','',true);
 insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id)
  values (pg_temp.e7p('03'),pg_temp.e7('12'),'invited','invited:'||pg_temp.e7p('03')||':'||pg_temp.e7('12'),pg_temp.e7('04'));
 insert into public.connections(user_a,user_b,state,requested_by,series_id,accepted_at)
  values (least(pg_temp.e7('03'),pg_temp.e7('04')),greatest(pg_temp.e7('03'),pg_temp.e7('04')),'connected',pg_temp.e7('03'),pg_temp.e7p('02'),now());
 insert into private.plan_links(plan_id,code) values (pg_temp.e7p('01'),'safetyPicnicLink000001');
end $cast$;

-- Slice 1 (Task 1): blocks, and the block rule everywhere.
begin;
select pg_temp.e7_cast();
-- Every sender accepts the chat rules (Task 2's table; until it exists, nothing to accept).
do $$ begin
 if pg_catalog.to_regclass('private.chat_rules_acceptances') is not null then
  execute 'insert into private.chat_rules_acceptances(user_id,version) select p.id,private.chat_rules_version() from public.profiles p '
   'where p.id::text like ''e7000000-%'' on conflict do nothing';
 end if;
end $$;
-- Two rows from before, dated an hour back (no notice, no rate count): a line naming 04 on the one-off (a system line
-- is never skipped, whoever it names), and 03's first words there.
insert into public.messages(series_id,plan_id,author_id,kind,event,payload,body,created_at,updated_at) values
 (pg_temp.e7p('01'),pg_temp.e7p('01'),null,'system','joined',jsonb_build_object('actor',pg_temp.e7('04'),'user',pg_temp.e7('04')),null,
  now()-interval '1 hour',now()-interval '1 hour'),
 (pg_temp.e7p('01'),pg_temp.e7p('01'),pg_temp.e7('03'),'message',null,null,'Mia says hi',now()-interval '1 hour',now()-interval '1 hour');
select set_config('s3.line04',(select id::text from public.messages where series_id=pg_temp.e7p('01') and kind='system'),true);
select set_config('s3.m0',(select id::text from public.messages where series_id=pg_temp.e7p('01') and body='Mia says hi'),true);

-- N1, on the one-off: 04 writes, and every other member gets a chat_message, 03 included. 04's summary is kept (G-B1:
-- the blocked person's counts never move). 03 blocks 04 (they are connected, so 03 may read 04), and 05 writes within
-- that minute: 03 gets a chat_message for 05's message, since 04's row no longer counts for 03's one push a minute. 04,
-- who had none, gets one too; everyone else already had 04's.
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('04'));
select set_config('s3.m1',pg_temp.s3_send(pg_temp.e7p('01'),'Leo here')::text,true);
select set_config('s3.sum04',public.chat_summary(pg_temp.e7p('01'))::text,true);
reset role;
select pg_temp.s3_check(pg_temp.s3_to('chat_message',pg_temp.s3_id('m1'))='01,02,03,05,07,09,13',
 '04''s first message did not reach every other member: '||pg_temp.s3_to('chat_message',pg_temp.s3_id('m1')));
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('03'));
select public.block_user(pg_temp.e7('04'),true);
select pg_temp.s3_as(pg_temp.e7('05'));
select set_config('s3.m2',pg_temp.s3_send(pg_temp.e7p('01'),'Sol here')::text,true);
reset role;
select pg_temp.s3_check(pg_temp.s3_blocked(pg_temp.e7('03'),pg_temp.e7('04')),'03''s block of 04 is not stored');
select pg_temp.s3_check(pg_temp.s3_to('chat_message',pg_temp.s3_id('m2'))='03,04',
 'N1: 05''s message within the minute went to '||pg_temp.s3_to('chat_message',pg_temp.s3_id('m2'))||', not 03 and 04');

-- The reads: 03's chat_messages and chat_messages_since leave out 04's messages and keep the line naming 04, its own
-- words and 05's. 05 still sees 04's.
do $$ declare r jsonb; begin
 perform pg_temp.s3_as(pg_temp.e7('03'));
 foreach r in array array[public.chat_messages(pg_temp.e7p('01')),public.chat_messages_since(pg_temp.e7p('01'),0,null)] loop
  perform pg_temp.s3_check(pg_temp.s3_by(r,pg_temp.e7('04'))=0 and pg_temp.s3_has(r,pg_temp.s3_id('line04'))
   and pg_temp.s3_has(r,pg_temp.s3_id('m0')) and pg_temp.s3_has(r,pg_temp.s3_id('m2')),'03''s read of the one-off: '||r::text);
 end loop;
 perform pg_temp.s3_as(pg_temp.e7('05'));
 foreach r in array array[public.chat_messages(pg_temp.e7p('01')),public.chat_messages_since(pg_temp.e7p('01'),0,null)] loop
  perform pg_temp.s3_check(pg_temp.s3_has(r,pg_temp.s3_id('m1')),'05 does not see 04''s message: '||r::text);
 end loop;
end $$;

-- G-B1 connected: the block ends 03 and 04's connection. No pair row; a hidden refusal from 04 to 03 on the series they
-- met at, as remove_connection leaves it. As 04, 03 reads 'none', as after a removal; as 03, 04 reads 'none'. 03 asking
-- 04 is told to unblock first. 04's chat_summary of the one-off reads the same going, everyone and members as before.
do $$ declare s jsonb; v_before jsonb := current_setting('s3.sum04')::jsonb; begin
 perform pg_temp.s3_check(not pg_temp.s3_paired(pg_temp.e7('03'),pg_temp.e7('04'))
  and pg_temp.s3_refusal(pg_temp.e7p('02'),pg_temp.e7('04'),pg_temp.e7('03'))='hidden','G-B1: the connection did not end as a removal');
 perform pg_temp.s3_as(pg_temp.e7('04'));
 perform pg_temp.s3_check(public.plan_connection_states(pg_temp.e7p('01'))->>pg_temp.e7('03')::text='none','As 04, 03 does not read none');
 s := public.chat_summary(pg_temp.e7p('01'));
 perform pg_temp.s3_check((s->'going',s->'everyone',s->'members')=(v_before->'going',v_before->'everyone',v_before->'members'),
  'G-B1: 04''s counts moved: '||s::text);
 perform pg_temp.s3_as(pg_temp.e7('03'));
 perform pg_temp.s3_check(public.plan_connection_states(pg_temp.e7p('01'))->>pg_temp.e7('04')::text='none','As 03, 04 does not read none');
end $$;
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('03'));
select pg_temp.s3_refused(format('select public.request_connection(%L,%L)',pg_temp.e7('04'),pg_temp.e7p('01')),'22023','Unblock first');
reset role;

-- NOTE 1: a minute passes for the notices so far, so N1's rows hold nothing back.
update private.notification_outbox set created_at=now()-interval '61 seconds' where kind='chat_message';
-- S2: 04's new message queues no chat_message for 03; the one for 05 is queued and may be told.
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('04'));
select set_config('s3.m3',pg_temp.s3_send(pg_temp.e7p('01'),'Leo again')::text,true);
reset role;
select pg_temp.s3_check(pg_temp.s3_to('chat_message',pg_temp.s3_id('m3'))='01,02,05,07,09,13',
 'S2: 04''s message went to '||pg_temp.s3_to('chat_message',pg_temp.s3_id('m3')));
select pg_temp.s3_check(pg_temp.s3_told('chat_message',pg_temp.s3_id('m3'),pg_temp.e7('05')),'S2: 05''s notice of 04''s message may not be told');
-- With 04's message the newest row (G-B3): for 03, my_chat_overview and chat_summary show 05's as last, never 04's,
-- and count the sent messages 03 may see (message_count less 04's two). For 05, 04's is last and the count is the
-- chat's. 03 marks read the newest row 03 can see: nothing unread for 03.
do $$ declare s jsonb; o jsonb; v_all integer; begin
 select message_count into v_all from public.chats where series_id=pg_temp.e7p('01');
 perform pg_temp.s3_check((select last_message_id from public.chats where series_id=pg_temp.e7p('01'))=pg_temp.s3_id('m3') and v_all=4,
  'The one-off''s built figures are not 04''s message and 4');
 perform pg_temp.s3_as(pg_temp.e7('03'));
 s := public.chat_summary(pg_temp.e7p('01'));
 o := public.my_chat_overview()->'chats'->(pg_temp.e7p('01')::text);
 perform pg_temp.s3_check((s->'last'->>'id')::bigint=pg_temp.s3_id('m2') and (o->'last'->>'id')::bigint=pg_temp.s3_id('m2'),
  '03''s last on the one-off: '||(s->'last')::text||' / '||(o->'last')::text);
 perform pg_temp.s3_check((s->>'message_count')::integer=v_all-2 and (o->>'count')::integer=v_all-2,
  '03''s counts on the one-off: '||(s->>'message_count')||' / '||(o->>'count'));
 perform pg_temp.s3_as(pg_temp.e7('05'));
 s := public.chat_summary(pg_temp.e7p('01'));
 o := public.my_chat_overview()->'chats'->(pg_temp.e7p('01')::text);
 perform pg_temp.s3_check((s->'last'->>'id')::bigint=pg_temp.s3_id('m3') and (o->'last'->>'id')::bigint=pg_temp.s3_id('m3')
  and (s->>'message_count')::integer=v_all and (o->>'count')::integer=v_all,'05''s last or counts on the one-off: '||s::text);
 perform pg_temp.s3_as(pg_temp.e7('03'));
 perform public.mark_chat_read(pg_temp.e7p('01'),pg_temp.s3_id('m2'));
 perform pg_temp.s3_check((public.chat_summary(pg_temp.e7p('01'))->>'unread')::boolean is false
  and (public.my_chat_overview()->'chats'->(pg_temp.e7p('01')::text)->>'unread')::boolean is false,
  'G-B3: 04''s message is unread for 03');
end $$;
-- 20 seconds later, 05 writes: 03 has one chat_message this minute, for 05's message, and it may be told.
update private.notification_outbox set created_at=now()-interval '20 seconds' where message_id=pg_temp.s3_id('m3');
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('05'));
select set_config('s3.m4',pg_temp.s3_send(pg_temp.e7p('01'),'Sol again')::text,true);
reset role;
select pg_temp.s3_check((select array_agg(o.message_id) from private.notification_outbox o where o.recipient_id=pg_temp.e7('03')
  and o.kind='chat_message' and o.created_at>now()-interval '60 seconds')=array[pg_temp.s3_id('m4')]
 and pg_temp.s3_told('chat_message',pg_temp.s3_id('m4'),pg_temp.e7('03')),'S2: 03''s chat notices this minute are not just 05''s');

-- SHOULD 4, on the group, with 05's message the newest row: 07 says Can't go, then Going within 10 minutes, so its
-- cant_go line is hidden (state deleted). For 03, my_chat_overview's last and chat_summary's last are 05's message. A
-- guard (confirmation 2's NOTE 1-a): plan 2's chat_hide_line already moves last_message_id off the hidden line, so this
-- holds on plan 2's bodies too; the fallback's own deleted test is for the rows it passes over.
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('05'));
select set_config('s3.g1',pg_temp.s3_send(pg_temp.e7p('02'),'Who brings the dice?')::text,true);
select pg_temp.s3_as(pg_temp.e7('07'));
select pg_temp.s3_respond(pg_temp.e7p('02'),'declined');
select pg_temp.s3_respond(pg_temp.e7p('02'),'accepted');
reset role;
do $$ begin
 perform pg_temp.s3_check((select string_agg(m.event||':'||m.state,',' order by m.id) from public.messages m
  where m.series_id=pg_temp.e7p('02') and m.kind='system' and m.id>pg_temp.s3_id('g1'))='cant_go:deleted','07''s cant_go line is not hidden');
 perform pg_temp.s3_as(pg_temp.e7('03'));
 perform pg_temp.s3_check((public.chat_summary(pg_temp.e7p('02'))->'last'->>'id')::bigint=pg_temp.s3_id('g1')
  and (public.my_chat_overview()->'chats'->(pg_temp.e7p('02')::text)->'last'->>'id')::bigint=pg_temp.s3_id('g1'),
  'SHOULD 4: 03''s last on the group is not 05''s message');
end $$;

-- 03 blocks host 02. 02's announcement on the group, written before, is hidden from 03 and may not be told to 03 (05
-- still may be told it); 03's pinned is null, with no other announcement yet. G-B1: 02's chat_summary reads the same
-- going and everyone before and after. 02 also has a message there it deleted (by hand, an hour back). For 03, the
-- group's last falls back from 02's announcement past 07's hidden cant_go line to 05's message (the fallback's own
-- deleted test), and its count is the built one less 02's sent announcement only (the subtraction's announcement and
-- sent parts).
insert into public.messages(series_id,plan_id,author_id,kind,body,state,created_at,updated_at) values
 (pg_temp.e7p('02'),pg_temp.e7p('02'),pg_temp.e7('02'),'message',null,'deleted',now()-interval '1 hour',now()-interval '1 hour');
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('02'));
select set_config('s3.a1',pg_temp.s3_announce(pg_temp.e7p('02'),'Bring snacks')::text,true);
select set_config('s3.sum02',public.chat_summary(pg_temp.e7p('02'))::text,true);
select pg_temp.s3_as(pg_temp.e7('03'));
select public.block_user(pg_temp.e7('02'),true);
reset role;
do $$ declare s jsonb; o jsonb; v_all integer; v_before jsonb := current_setting('s3.sum02')::jsonb; begin
 perform pg_temp.s3_check(pg_temp.s3_blocked(pg_temp.e7('03'),pg_temp.e7('02')),'03''s block of 02 is not stored');
 perform pg_temp.s3_check(not pg_temp.s3_told('announcement',pg_temp.s3_id('a1'),pg_temp.e7('03'))
  and pg_temp.s3_told('announcement',pg_temp.s3_id('a1'),pg_temp.e7('05')),'02''s announcement may be told to 03, or not to 05');
 perform pg_temp.s3_as(pg_temp.e7('03'));
 perform pg_temp.s3_check(not pg_temp.s3_has(public.chat_messages(pg_temp.e7p('02')),pg_temp.s3_id('a1'))
  and not pg_temp.s3_has(public.chat_messages_since(pg_temp.e7p('02'),0,null),pg_temp.s3_id('a1')),'03 still reads 02''s announcement');
 perform pg_temp.s3_check(public.chat_summary(pg_temp.e7p('02'))->'pinned'='null'::jsonb,'03''s pinned is not null');
 select message_count into v_all from public.chats where series_id=pg_temp.e7p('02');
 s := public.chat_summary(pg_temp.e7p('02'));
 o := public.my_chat_overview()->'chats'->(pg_temp.e7p('02')::text);
 perform pg_temp.s3_check((select last_message_id from public.chats where series_id=pg_temp.e7p('02'))=pg_temp.s3_id('a1') and v_all=2,
  'The group''s built figures are not 02''s announcement and 2');
 perform pg_temp.s3_check((s->'last'->>'id')::bigint=pg_temp.s3_id('g1') and (o->'last'->>'id')::bigint=pg_temp.s3_id('g1'),
  '03''s last on the group: '||(s->'last')::text||' / '||(o->'last')::text);
 perform pg_temp.s3_check((s->>'message_count')::integer=v_all-1 and (o->>'count')::integer=v_all-1,
  '03''s counts on the group: '||(s->>'message_count')||' / '||(o->>'count'));
 perform pg_temp.s3_as(pg_temp.e7('02'));
 s := public.chat_summary(pg_temp.e7p('02'));
 perform pg_temp.s3_check((s->'going',s->'everyone')=(v_before->'going',v_before->'everyone'),'G-B1: 02''s counts moved: '||s::text);
end $$;

-- N2: 01 announces on the group: 03's pinned is 01's. A minute later (NOTE 1) 02 announces again: 03's pinned is still
-- 01's, 05's is 02's. A place change by 02 still writes a line, which 03 reads, and queues a plan_changed notice to 03
-- that may be told (R-Q5 keeps the resbite's own news).
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('01'));
select set_config('s3.a2',pg_temp.s3_announce(pg_temp.e7p('02'),'Doors at 7')::text,true);
reset role;
update public.messages set created_at=now()-interval '61 seconds' where id=pg_temp.s3_id('a1');
do $$ begin
 perform pg_temp.s3_as(pg_temp.e7('03'));
 perform pg_temp.s3_check((public.chat_summary(pg_temp.e7p('02'))->'pinned'->>'id')::bigint=pg_temp.s3_id('a2'),'N2: 03''s pinned is not 01''s');
end $$;
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('02'));
select set_config('s3.a3',pg_temp.s3_announce(pg_temp.e7p('02'),'Snacks again')::text,true);
select pg_temp.s3_change(pg_temp.e7p('02'),'The library',false);
reset role;
do $$ declare v_line bigint; v_notice bigint; begin
 perform pg_temp.s3_as(pg_temp.e7('03'));
 perform pg_temp.s3_check((public.chat_summary(pg_temp.e7p('02'))->'pinned'->>'id')::bigint=pg_temp.s3_id('a2'),
  'N2: 03''s pinned is not 01''s after 02''s second announcement');
 perform pg_temp.s3_as(pg_temp.e7('05'));
 perform pg_temp.s3_check((public.chat_summary(pg_temp.e7p('02'))->'pinned'->>'id')::bigint=pg_temp.s3_id('a3'),'N2: 05''s pinned is not 02''s');
 select m.id into v_line from public.messages m where m.series_id=pg_temp.e7p('02') and m.kind='system' and m.event='changed'
  and m.payload->>'actor'=pg_temp.e7('02')::text;
 select o.id into v_notice from private.notification_outbox o where o.kind='plan_changed' and o.plan_id=pg_temp.e7p('02')
  and o.recipient_id=pg_temp.e7('03') and o.actor_id=pg_temp.e7('02');
 perform pg_temp.s3_as(pg_temp.e7('03'));
 perform pg_temp.s3_check(v_line is not null and pg_temp.s3_has(public.chat_messages(pg_temp.e7p('02')),v_line),'03 does not read 02''s changed line');
 perform pg_temp.s3_check(v_notice is not null and private.notification_recipient_eligible(v_notice),'02''s plan_changed may not be told to 03');
end $$;

-- S7, on the one-off, where 06 has not answered: 01 announces to everyone, then 02 does. 06 blocks 02, whom 06 may read
-- only as the author of an announcement that reaches 06: a block row. A minute later (NOTE 1) 02 announces again. 06's
-- card is 01's announcement, never 02's (N2: the pick falls back inside its limit); 06's inviter on the one-off is 01 (no
-- bringer, no 'invited' notice: the owner). On the group, a member who has not answered this week has one too: 10's is
-- 05, who brought 10, whether or not an announcement exists. First, in a savepoint: an announcement of 02's that is no
-- longer sent (removed, by hand) reaches no card, so 06 may not block 02 through it: the same success, no row.
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('01'));
select set_config('s3.a4',pg_temp.s3_announce(pg_temp.e7p('01'),'Picnic at noon')::text,true);
reset role;
savepoint s3_unsent;
insert into public.messages(series_id,plan_id,author_id,kind,audience,body,state,created_at,updated_at) values
 (pg_temp.e7p('01'),pg_temp.e7p('01'),pg_temp.e7('02'),'announcement','everyone','Old news','removed',now()-interval '1 hour',now()-interval '1 hour');
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('06'));
select public.block_user(pg_temp.e7('02'),true);
reset role;
select pg_temp.s3_check(not pg_temp.s3_blocked(pg_temp.e7('06'),pg_temp.e7('02')),'06 blocked 02 through an announcement no longer sent');
rollback to savepoint s3_unsent;
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('02'));
select set_config('s3.a5',pg_temp.s3_announce(pg_temp.e7p('01'),'Bring a blanket')::text,true);
reset role;
do $$ begin
 perform pg_temp.s3_as(pg_temp.e7('06'));
 perform pg_temp.s3_check(not private.can_read_profile(pg_temp.e7('02')),'06 reads 02 without the announcement');
end $$;
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('06'));
select public.block_user(pg_temp.e7('02'),true);
reset role;
select pg_temp.s3_check(pg_temp.s3_blocked(pg_temp.e7('06'),pg_temp.e7('02')),'S7: 06''s block of 02 is not stored');
update public.messages set created_at=now()-interval '61 seconds' where id=pg_temp.s3_id('a5');
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('02'));
select set_config('s3.a6',pg_temp.s3_announce(pg_temp.e7p('01'),'Blanket reminder')::text,true);
reset role;
do $$ declare o jsonb; begin
 perform pg_temp.s3_as(pg_temp.e7('06'));
 o := public.my_chat_overview();
 perform pg_temp.s3_check((o->'announcements'->(pg_temp.e7p('01')::text)->>'id')::bigint=pg_temp.s3_id('a4'),'S7: 06''s card: '||o::text);
 perform pg_temp.s3_check(o->'inviters'=jsonb_build_object(pg_temp.e7p('01')::text,pg_temp.e7('01'))
  and o->'names'->>pg_temp.e7('01')::text='Ana','06''s inviters: '||o::text);
 perform pg_temp.s3_as(pg_temp.e7('10'));
 o := public.my_chat_overview();
 perform pg_temp.s3_check(o->'inviters'=jsonb_build_object(pg_temp.e7p('02')::text,pg_temp.e7('05')) and o->'names'->>pg_temp.e7('05')::text='Sol',
  '10''s inviters: '||o::text);
end $$;
-- I-2: 06 blocks 01, the owner the card names (a pending invitee reads the owner): a block row. 06's overview then has
-- no announcement and no inviter for the one-off (both announcers and the inviter blocked), and none at all.
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('06'));
select public.block_user(pg_temp.e7('01'),true);
reset role;
do $$ declare o jsonb; begin
 perform pg_temp.s3_check(pg_temp.s3_blocked(pg_temp.e7('06'),pg_temp.e7('01')),'I-2: 06''s block of 01 is not stored');
 perform pg_temp.s3_as(pg_temp.e7('06'));
 o := public.my_chat_overview();
 perform pg_temp.s3_check(not (o->'announcements' ? pg_temp.e7p('01')::text) and not (o->'inviters' ? pg_temp.e7p('01')::text)
  and o->'announcements'='{}'::jsonb and o->'inviters'='{}'::jsonb,'I-2: 06''s overview: '||o::text);
end $$;

-- G-B1 asking, from the third plan's series, where without the block 04 would make a real request and a push (NOTE 13:
-- the refusal from the block is on the group's series): 'requested', a visible refusal from 04 to 03 on that series, no
-- pair row and no notice. As 04, 03 reads 'requested_by_me' there.
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('04'));
select pg_temp.s3_check(public.request_connection(pg_temp.e7('03'),pg_temp.e7p('03'))='requested','G-B1: 04 asking 03 is not requested');
select pg_temp.s3_check(public.plan_connection_states(pg_temp.e7p('03'))->>pg_temp.e7('03')::text='requested_by_me',
 'G-B1: as 04, 03 does not read requested_by_me');
reset role;
select pg_temp.s3_check(pg_temp.s3_refusal(pg_temp.e7p('03'),pg_temp.e7('04'),pg_temp.e7('03'))='visible'
 and not pg_temp.s3_paired(pg_temp.e7('03'),pg_temp.e7('04'))
 and not exists(select 1 from private.notification_outbox o where o.kind in ('connection_request','connection_accepted')
  and pg_temp.e7('03') in (o.recipient_id,o.actor_id)),'G-B1: 04 asking 03 stored or sent something');

-- G-B1 pending: 05 asks 03 (a real request, and its notice may be told), then 03 blocks 05: no pair row, a visible
-- refusal from 05 to 03, as decline_connection leaves it, and the notice may no longer be told. As 05, 03 still reads
-- 'requested_by_me'.
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('05'));
select pg_temp.s3_check(public.request_connection(pg_temp.e7('03'),pg_temp.e7p('01'))='requested','05 asking 03 is not requested');
reset role;
select set_config('s3.req05',(select o.id::text from private.notification_outbox o where o.kind='connection_request'
 and o.recipient_id=pg_temp.e7('03') and o.actor_id=pg_temp.e7('05')),true);
select pg_temp.s3_check(pg_temp.s3_paired(pg_temp.e7('03'),pg_temp.e7('05'))
 and private.notification_recipient_eligible(pg_temp.s3_id('req05')),'05''s request is not real');
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('03'));
select public.block_user(pg_temp.e7('05'),true);
select pg_temp.s3_as(pg_temp.e7('05'));
select pg_temp.s3_check(public.plan_connection_states(pg_temp.e7p('01'))->>pg_temp.e7('03')::text='requested_by_me',
 'G-B1 pending: as 05, 03 does not read requested_by_me');
reset role;
select pg_temp.s3_check(not pg_temp.s3_paired(pg_temp.e7('03'),pg_temp.e7('05'))
 and pg_temp.s3_refusal(pg_temp.e7p('01'),pg_temp.e7('05'),pg_temp.e7('03'))='visible'
 and not private.notification_recipient_eligible(pg_temp.s3_id('req05')),'G-B1 pending: the block did not leave a declined request');

-- G-B2: 03 asks 07, and 07 says Not now (a refusal from 03 to 07). 03 blocks 07. 07 asks 03, which without the block
-- would accept the request 07 refused: 'requested', no pair row and no connection_accepted notice. As 03, 07 reads
-- 'none' once blocked, though 03's visible refusal by 07 would read 'requested_by_me'.
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('03'));
select public.request_connection(pg_temp.e7('07'),pg_temp.e7p('01'));
select pg_temp.s3_as(pg_temp.e7('07'));
select public.decline_connection(pg_temp.e7('03'));
select pg_temp.s3_as(pg_temp.e7('03'));
select public.block_user(pg_temp.e7('07'),true);
select pg_temp.s3_check(public.plan_connection_states(pg_temp.e7p('01'))->>pg_temp.e7('07')::text='none','As 03, 07 does not read none');
select pg_temp.s3_as(pg_temp.e7('07'));
select pg_temp.s3_check(public.request_connection(pg_temp.e7('03'),pg_temp.e7p('01'))='requested','G-B2: 07 asking 03 is not requested');
reset role;
select pg_temp.s3_check(pg_temp.s3_refusal(pg_temp.e7p('01'),pg_temp.e7('03'),pg_temp.e7('07'))='visible'
 and not pg_temp.s3_paired(pg_temp.e7('03'),pg_temp.e7('07'))
 and not exists(select 1 from private.notification_outbox o where o.kind='connection_accepted'
  and (o.recipient_id,o.actor_id) in ((pg_temp.e7('03'),pg_temp.e7('07')),(pg_temp.e7('07'),pg_temp.e7('03')))),
 'G-B2: 07 asking 03 connected them');

-- my_connections for 03 omits 04 (no pair row survives a block; my_connections is not redefined). Mutual blocks (Review
-- Focus 6): 03 writes; 04 blocks 03; 03 unblocks 04: 04's messages are back for 03, no connection comes back, and 04
-- still does not see 03's message, and the refusals stay (04's hidden one from the block, its visible one from asking).
-- 04 unblocks 03: 04 sees it again.
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('03'));
select pg_temp.s3_check(not (public.my_connections()::text like '%'||pg_temp.e7('04')||'%'),'03''s connections list 04');
select set_config('s3.m5',pg_temp.s3_send(pg_temp.e7p('01'),'Mia again')::text,true);
select pg_temp.s3_as(pg_temp.e7('04'));
select public.block_user(pg_temp.e7('03'),true);
select pg_temp.s3_as(pg_temp.e7('03'));
select public.block_user(pg_temp.e7('04'),false);
reset role;
do $$ begin
 perform pg_temp.s3_check(not pg_temp.s3_blocked(pg_temp.e7('03'),pg_temp.e7('04')) and pg_temp.s3_blocked(pg_temp.e7('04'),pg_temp.e7('03'))
  and not pg_temp.s3_paired(pg_temp.e7('03'),pg_temp.e7('04')),'Unblocking 04 took 04''s block, or brought the connection back');
 perform pg_temp.s3_check(pg_temp.s3_refusal(pg_temp.e7p('02'),pg_temp.e7('04'),pg_temp.e7('03'))='hidden'
  and pg_temp.s3_refusal(pg_temp.e7p('03'),pg_temp.e7('04'),pg_temp.e7('03'))='visible','Unblocking 04 changed the refusals');
 perform pg_temp.s3_as(pg_temp.e7('03'));
 perform pg_temp.s3_check(pg_temp.s3_has(public.chat_messages(pg_temp.e7p('01')),pg_temp.s3_id('m1'))
  and pg_temp.s3_has(public.chat_messages(pg_temp.e7p('01')),pg_temp.s3_id('m3')),'04''s messages are not back for 03');
 perform pg_temp.s3_as(pg_temp.e7('04'));
 perform pg_temp.s3_check(not pg_temp.s3_has(public.chat_messages(pg_temp.e7p('01')),pg_temp.s3_id('m5')),'04 sees 03''s message through its block');
end $$;
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('04'));
select public.block_user(pg_temp.e7('03'),false);
select pg_temp.s3_check(pg_temp.s3_has(public.chat_messages(pg_temp.e7p('01')),pg_temp.s3_id('m5')),'04 does not see 03''s message after unblocking');
reset role;

-- G-N12: block_user as 03 on a random id, and on 08, whom 03 may not read: the same success, no row. 09 writes in the
-- one-off and is then removed, so 03 may read 09 only as an author in a chat 03 is in: a row. A null person, or a null
-- p_block (here on 05, whom 03 blocked), is 22023 'Invalid block' and changes nothing.
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('09'));
select pg_temp.s3_send(pg_temp.e7p('01'),'Zed was here');
select pg_temp.s3_as(pg_temp.e7('01'));
select public.remove_guest(pg_temp.e7p('01'),pg_temp.e7('09'));
reset role;
do $$ begin
 perform pg_temp.s3_as(pg_temp.e7('03'));
 perform pg_temp.s3_check(not private.can_read_profile(pg_temp.e7('09')) and not private.can_read_profile(pg_temp.e7('08')),
  '03 reads 09 or 08 without the chat');
end $$;
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('03'));
select public.block_user(gen_random_uuid(),true);
select public.block_user(pg_temp.e7('08'),true);
select public.block_user(pg_temp.e7('09'),true);
select pg_temp.s3_refused(format('select public.block_user(%L,true)',pg_temp.e7('03')),'22023','That is you');
select pg_temp.s3_refused('select public.block_user(null,true)','22023','Invalid block');
select pg_temp.s3_refused(format('select public.block_user(%L,null)',pg_temp.e7('05')),'22023','Invalid block');
reset role;
select pg_temp.s3_check((select count(*) from private.blocks b where b.blocker_id=pg_temp.e7('03'))=4
 and not pg_temp.s3_blocked(pg_temp.e7('03'),pg_temp.e7('08')) and pg_temp.s3_blocked(pg_temp.e7('03'),pg_temp.e7('09')),
 'G-N12: 03''s blocks are not 02, 05, 07 and 09');

-- I2: 03 asks 13 (Going on the one-off, never writes), then blocks 13: the request goes, as 03's cancel takes it. 01
-- removes 13, who then shares nothing with 03; block_user(13, false) as 03 still deletes the row.
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('03'));
select public.request_connection(pg_temp.e7('13'),pg_temp.e7p('01'));
select public.block_user(pg_temp.e7('13'),true);
select pg_temp.s3_as(pg_temp.e7('01'));
select public.remove_guest(pg_temp.e7p('01'),pg_temp.e7('13'));
reset role;
do $$ begin
 perform pg_temp.s3_check(pg_temp.s3_blocked(pg_temp.e7('03'),pg_temp.e7('13')) and not pg_temp.s3_paired(pg_temp.e7('03'),pg_temp.e7('13')),
  'I2: 03''s block of 13 is not stored, or 03''s request stands');
 perform pg_temp.s3_as(pg_temp.e7('03'));
 perform pg_temp.s3_check(not private.can_read_profile(pg_temp.e7('13')),'03 still reads 13');
end $$;
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('03'));
select public.block_user(pg_temp.e7('13'),false);
reset role;
select pg_temp.s3_check(not pg_temp.s3_blocked(pg_temp.e7('03'),pg_temp.e7('13')),'I2: unblocking 13 kept the row');

-- B4, on the third plan, which has no announcement. As 11, the inviter is 03 (11's bringer), named; as 12, 04 (the
-- 'invited' notice's actor). 11 blocks 03, whom 11 may read only as the person who brought 11: a row, and 11's overview
-- then names no inviter for the third plan. 12 blocks 04 (the notice's actor): a row. 12 blocks 03, whom 12 may not
-- read: the same success, no row.
do $$ declare o jsonb; begin
 perform pg_temp.s3_as(pg_temp.e7('11'));
 o := public.my_chat_overview();
 perform pg_temp.s3_check(o->'inviters'=jsonb_build_object(pg_temp.e7p('03')::text,pg_temp.e7('03')) and o->'announcements'='{}'::jsonb
  and o->'names'->>pg_temp.e7('03')::text='Mia','B4: 11''s overview: '||o::text);
 perform pg_temp.s3_check(not private.can_read_profile(pg_temp.e7('03')),'11 reads 03 without the invitation');
 perform pg_temp.s3_as(pg_temp.e7('12'));
 o := public.my_chat_overview();
 perform pg_temp.s3_check(o->'inviters'=jsonb_build_object(pg_temp.e7p('03')::text,pg_temp.e7('04')),'B4: 12''s overview: '||o::text);
end $$;
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('11'));
select public.block_user(pg_temp.e7('03'),true);
select pg_temp.s3_check(public.my_chat_overview()->'inviters'='{}'::jsonb,'B4: 11 still has an inviter after blocking 03');
select pg_temp.s3_as(pg_temp.e7('12'));
select public.block_user(pg_temp.e7('04'),true);
select public.block_user(pg_temp.e7('03'),true);
reset role;
select pg_temp.s3_check(pg_temp.s3_blocked(pg_temp.e7('11'),pg_temp.e7('03')) and pg_temp.s3_blocked(pg_temp.e7('12'),pg_temp.e7('04'))
 and not pg_temp.s3_blocked(pg_temp.e7('12'),pg_temp.e7('03')),'B4: the inviters'' blocks are not as expected');

-- my_blocks (G-S10), after 03 blocks 04 again: 03's blocks, newest first, each with the first word of its name. With
-- 04's account being deleted (set by hand in a savepoint, undone after, so 04 can still write below), 04's name is null.
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('03'));
select public.block_user(pg_temp.e7('04'),true);
select pg_temp.s3_check(public.my_blocks()=jsonb_build_array(jsonb_build_object('user_id',pg_temp.e7('04'),'name','Leo'),
  jsonb_build_object('user_id',pg_temp.e7('09'),'name','Zed'),jsonb_build_object('user_id',pg_temp.e7('07'),'name','Eva'),
  jsonb_build_object('user_id',pg_temp.e7('05'),'name','Sol'),jsonb_build_object('user_id',pg_temp.e7('02'),'name','Ada')),
 '03''s blocks: '||public.my_blocks()::text);
reset role;
savepoint s3_deleting;
update public.profiles set deletion_requested_at=now() where id=pg_temp.e7('04');
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('03'));
select pg_temp.s3_check(public.my_blocks()->0=jsonb_build_object('user_id',pg_temp.e7('04'),'name',null),
 'A deleting account''s name in 03''s blocks: '||public.my_blocks()::text);
rollback to savepoint s3_deleting;
reset role;

-- G-S13: an 'invited' notice from 01 to 03, queued before (on the one-off, where 03 is Going), may be told; 01's
-- contact lookup holds 03's number (I5); and 01 inviting 03's number to the Walk would reach 03 in the app (tried in a
-- savepoint, undone). 03 blocks 01. Then 01 invites 03's number to the Walk, a plan 03 is not on (on any other the
-- answer is 'already', which comes before the block's choice and is unchanged): 'link', a personal invitation, and no
-- guest row and no notice for 03; the earlier notice may no longer be told. Before the block 03 asks 01, 01 says Not
-- now, and 03 asks again from the group (a real request): the block takes 03's request as cancel_connection_request
-- does, so 03's refusal by 01 is hidden and no pair row is left.
insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id)
 values (pg_temp.e7p('01'),pg_temp.e7('03'),'invited','invited:'||pg_temp.e7p('01')||':'||pg_temp.e7('03'),pg_temp.e7('01'));
select set_config('s3.inv03',(select id::text from private.notification_outbox where dedupe_key='invited:'||pg_temp.e7p('01')||':'||pg_temp.e7('03')),true);
select pg_temp.s3_check(private.notification_recipient_eligible(pg_temp.s3_id('inv03')),'01''s invited notice to 03 may not be told before the block');
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('01'));
select pg_temp.s3_check(public.contacts_on_resbite(array['447700900703'])=array['447700900703'],'I5: 01''s lookup does not hold 03''s number');
savepoint s3_invite;
select pg_temp.s3_check(public.invite_contacts(pg_temp.e7p('04'),jsonb_build_array(jsonb_build_object('phone','447700900703','country','44',
 'code','safetyInviteCode000004')))->0->>'kind'='app','Before the block, 03''s number is not invited in the app');
rollback to savepoint s3_invite;
select pg_temp.s3_as(pg_temp.e7('03'));
select public.request_connection(pg_temp.e7('01'),pg_temp.e7p('01'));
select pg_temp.s3_as(pg_temp.e7('01'));
select public.decline_connection(pg_temp.e7('03'));
select pg_temp.s3_as(pg_temp.e7('03'));
select public.request_connection(pg_temp.e7('01'),pg_temp.e7p('02'));
select pg_temp.s3_as(pg_temp.e7('01'));
select pg_temp.s3_check(public.my_connections()->'requests'@>jsonb_build_array(jsonb_build_object('user_id',pg_temp.e7('03'))),
 '03''s second request to 01 is not real');
select pg_temp.s3_as(pg_temp.e7('03'));
select public.block_user(pg_temp.e7('01'),true);
select pg_temp.s3_as(pg_temp.e7('01'));
select pg_temp.s3_check(public.invite_contacts(pg_temp.e7p('04'),jsonb_build_array(jsonb_build_object('phone','447700900703','country','44',
 'code','safetyInviteCode000003')))=jsonb_build_array(jsonb_build_object('phone','447700900703','kind','link')),'G-S13: 03''s number is not a link');
-- I5: 01's lookup no longer holds 03's number.
select pg_temp.s3_check(public.contacts_on_resbite(array['447700900703'])=array[]::text[],'I5: 01''s lookup still holds 03''s number');
reset role;
select pg_temp.s3_check(pg_temp.s3_blocked(pg_temp.e7('03'),pg_temp.e7('01'))
 and not exists(select 1 from public.attendees where plan_id=pg_temp.e7p('04') and user_id=pg_temp.e7('03'))
 and not exists(select 1 from private.notification_outbox where plan_id=pg_temp.e7p('04') and recipient_id=pg_temp.e7('03'))
 and exists(select 1 from private.phone_invitations where plan_id=pg_temp.e7p('04') and phone='447700900703' and revoked_at is null),
 'G-S13: 01''s invitation of 03''s number reached 03');
select pg_temp.s3_check(not private.notification_recipient_eligible(pg_temp.s3_id('inv03')),'G-S13: 01''s invited notice may still be told to 03');
select pg_temp.s3_check(pg_temp.s3_refusal(pg_temp.e7p('01'),pg_temp.e7('03'),pg_temp.e7('01'))='hidden'
 and not pg_temp.s3_paired(pg_temp.e7('03'),pg_temp.e7('01')),'03''s block of 01 did not take 03''s request as a cancel');
-- NOTE 3: the roll's "on again" ('invited' with detail 'again', the owner its actor), made by hand on the group's
-- current occurrence, may be told to 03 after 03's block of 01; with no detail, it may not.
insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id,detail)
 values (pg_temp.e7p('02'),pg_temp.e7('03'),'invited','invited:'||pg_temp.e7p('02')||':'||pg_temp.e7('03'),pg_temp.e7('01'),'again');
select set_config('s3.again03',(select id::text from private.notification_outbox where dedupe_key='invited:'||pg_temp.e7p('02')||':'||pg_temp.e7('03')),true);
select pg_temp.s3_check(private.notification_recipient_eligible(pg_temp.s3_id('again03')),'NOTE 3: "on again" may not be told to 03');
update private.notification_outbox set detail=null where id=pg_temp.s3_id('again03');
select pg_temp.s3_check(not private.notification_recipient_eligible(pg_temp.s3_id('again03')),'NOTE 3: 01''s invitation with no detail may be told to 03');
-- 03 unblocks 01 (confirmation 2's 1-a): I1 below reads 01's rows as 03, which 03's block of 01 would hide.
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('03'));
select public.block_user(pg_temp.e7('01'),false);
reset role;

-- R-Q5: 08 asks to join the one-off by its open link; 01 then blocks 08, whom 01 may read only as a waiting requester.
-- The join_request notice to 01 may not be told, the one to 02 may, and plan_join_requests as 01 still lists 08. 08,
-- not on the one-off, asking to connect there gets the same 42501 from 01, who blocked 08, as from 02, who did not (the
-- block checks come after the visibility refusals, CH-R-A1).
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('08'));
select pg_temp.s3_check(public.request_to_join('safetyPicnicLink000001',null,'accepted',null)->>'state'='waiting','08''s request is not waiting');
reset role;
do $$ begin
 perform pg_temp.s3_as(pg_temp.e7('01'));
 perform pg_temp.s3_check(not private.can_read_profile(pg_temp.e7('08')),'01 reads 08 without the request');
end $$;
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('01'));
select public.block_user(pg_temp.e7('08'),true);
select pg_temp.s3_check((select count(*) from jsonb_array_elements(public.plan_join_requests(pg_temp.e7p('01'))) e
 where e.value->>'user_id'=pg_temp.e7('08')::text)=1,'R-Q5: 01 no longer lists 08''s request');
select pg_temp.s3_as(pg_temp.e7('08'));
select pg_temp.s3_refused(format('select public.request_connection(%L,%L)',pg_temp.e7('01'),pg_temp.e7p('01')),'42501','Names required');
select pg_temp.s3_refused(format('select public.request_connection(%L,%L)',pg_temp.e7('02'),pg_temp.e7p('01')),'42501','Names required');
reset role;
select pg_temp.s3_check(pg_temp.s3_blocked(pg_temp.e7('01'),pg_temp.e7('08'))
 and not private.notification_recipient_eligible((select id from private.notification_outbox where kind='join_request'
  and recipient_id=pg_temp.e7('01') and actor_id=pg_temp.e7('08')))
 and private.notification_recipient_eligible((select id from private.notification_outbox where kind='join_request'
  and recipient_id=pg_temp.e7('02') and actor_id=pg_temp.e7('08'))),'R-Q5: 08''s join request notices');

-- I-3, the claim, in a savepoint: every notice so far delivered; a device each for 01 and 02. 01 blocks 03. 11 (brought
-- by 03) answers Going on the third plan: an rsvp to 01 and one to 02. One claim, as postgres, returns both: 01's with
-- no bringer's name, 02's with 03's. Undone; then again with 01 blocking 11 instead: no rsvp for 01, and 02's names 03.
savepoint s3_claim;
update private.notification_outbox set expanded_at=now(),delivered_at=now();
insert into private.device_endpoints(token,user_id,platform) values ('s3-device-01',pg_temp.e7('01'),'ios'),('s3-device-02',pg_temp.e7('02'),'ios');
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('01'));
select public.block_user(pg_temp.e7('03'),true);
select pg_temp.s3_as(pg_temp.e7('11'));
select pg_temp.s3_respond(pg_temp.e7p('03'),'accepted');
reset role;
do $$ declare j jsonb; begin
 j := public.claim_notification_deliveries(25);
 perform pg_temp.s3_check(jsonb_array_length(j)=2 and (select count(*) from jsonb_array_elements(j) e where e.value->>'kind'='rsvp')=2,
  'I-3: the claim did not return the two rsvp jobs: '||j::text);
 perform pg_temp.s3_check((select e.value->'brought_by_name' from jsonb_array_elements(j) e where e.value->>'recipient_id'=pg_temp.e7('01')::text)='null'::jsonb
  and (select e.value->>'brought_by_name' from jsonb_array_elements(j) e where e.value->>'recipient_id'=pg_temp.e7('02')::text)='Mia',
  'I-3: the bringer''s name: '||j::text);
end $$;
rollback to savepoint s3_claim;
savepoint s3_claim;
update private.notification_outbox set expanded_at=now(),delivered_at=now();
insert into private.device_endpoints(token,user_id,platform) values ('s3-device-01',pg_temp.e7('01'),'ios'),('s3-device-02',pg_temp.e7('02'),'ios');
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('01'));
select public.block_user(pg_temp.e7('11'),true);
select pg_temp.s3_as(pg_temp.e7('11'));
select pg_temp.s3_respond(pg_temp.e7p('03'),'accepted');
reset role;
do $$ declare j jsonb; begin
 j := public.claim_notification_deliveries(25);
 perform pg_temp.s3_check(not exists(select 1 from jsonb_array_elements(j) e where e.value->>'recipient_id'=pg_temp.e7('01')::text)
  and (select e.value->>'brought_by_name' from jsonb_array_elements(j) e where e.value->>'kind'='rsvp'
   and e.value->>'recipient_id'=pg_temp.e7('02')::text)='Mia','I-3: with 01 blocking the answerer: '||j::text);
end $$;
rollback to savepoint s3_claim;

-- I1, the skip inside the limit, with 03's block of 04 standing, on the third plan's chat. Rows by hand, dated 2 minutes
-- back (out of send_message's one-minute count, NOTE 1): 01 writes 60, then 04 writes 60, so the newest 50 are all 04's.
-- 03's newest page holds 50 rows, none by 04, and names nobody but 01; the page before it holds more. From a cursor, 04
-- writes 150 and then 01 writes 60: chat_messages_since from that cursor returns exactly 01's 60.
insert into public.messages(series_id,plan_id,author_id,kind,body,created_at,updated_at)
 select pg_temp.e7p('03'),pg_temp.e7p('03'),pg_temp.e7(w.who),'message',w.who||' says '||n,now()-interval '2 minutes',now()-interval '2 minutes'
 from (values (1,'01'),(2,'04')) w(k,who) cross join generate_series(1,60) n order by w.k,n;
do $$ declare r jsonb; v_cursor bigint; begin
 perform pg_temp.s3_as(pg_temp.e7('03'));
 r := public.chat_messages(pg_temp.e7p('03'),null,50);
 perform pg_temp.s3_check(jsonb_array_length(r->'rows')=50 and pg_temp.s3_by(r,pg_temp.e7('04'))=0 and pg_temp.s3_by(r,pg_temp.e7('01'))=50
  and r->'names'=jsonb_build_object(pg_temp.e7('01')::text,'Ana'),'I1: 03''s newest page: '||jsonb_array_length(r->'rows')||' rows, '
  ||pg_temp.s3_by(r,pg_temp.e7('04'))||' by 04');
 r := public.chat_messages(pg_temp.e7p('03'),(r->'rows'->0->>'id')::bigint,50);
 perform pg_temp.s3_check(jsonb_array_length(r->'rows')>0 and pg_temp.s3_by(r,pg_temp.e7('04'))=0,'I1: 03''s page before is empty or holds 04''s');
 select max(id) into v_cursor from public.messages;
 insert into public.messages(series_id,plan_id,author_id,kind,body,created_at,updated_at)
  select pg_temp.e7p('03'),pg_temp.e7p('03'),pg_temp.e7(w.who),'message',w.who||' later '||n,now()-interval '2 minutes',now()-interval '2 minutes'
  from (values (1,'04',150),(2,'01',60)) w(k,who,c) cross join lateral generate_series(1,w.c) n order by w.k,n;
 r := public.chat_messages_since(pg_temp.e7p('03'),v_cursor,null);
 perform pg_temp.s3_check(jsonb_array_length(r->'rows')=60 and pg_temp.s3_by(r,pg_temp.e7('01'))=60
  and (select string_agg(e.value->>'id',',' order by (e.value->>'id')::bigint) from jsonb_array_elements(r->'rows') e)=
   (select string_agg(m.id::text,',' order by m.id) from public.messages m where m.series_id=pg_temp.e7p('03') and m.id>v_cursor
    and m.author_id=pg_temp.e7('01')),'I1: 03''s since read: '||jsonb_array_length(r->'rows')||' rows');
end $$;

-- B2 (P2-Q1, plan 2's eligibility kept), last, with 03's block of 04 standing: a minute passes for every chat notice
-- (NOTE 1), the group's week is cancelled just this once, and 04 writes: the chat_message to 05 may be told, and none
-- is queued for 03. 07 blocks 01 first: 07's plan_cancelled notice from 01's cancel may still be told (R-Q5 keeps the
-- resbite's own news).
update private.notification_outbox set created_at=now()-interval '61 seconds' where kind='chat_message';
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('07'));
select public.block_user(pg_temp.e7('01'),true);
select pg_temp.s3_as(pg_temp.e7('01'));
select pg_temp.s3_change(pg_temp.e7p('02'),null,true);
select pg_temp.s3_as(pg_temp.e7('04'));
select set_config('s3.b2',pg_temp.s3_send(pg_temp.e7p('02'),'Drinks anyway?')::text,true);
reset role;
select pg_temp.s3_check((select status from public.plans where id=pg_temp.e7p('02'))='cancelled'
 and pg_temp.s3_told('chat_message',pg_temp.s3_id('b2'),pg_temp.e7('05'))
 and not ('03'=any(string_to_array(pg_temp.s3_to('chat_message',pg_temp.s3_id('b2')),','))),'B2: 04''s message in the cancelled week');
select pg_temp.s3_check(pg_temp.s3_blocked(pg_temp.e7('07'),pg_temp.e7('01'))
 and private.notification_recipient_eligible((select o.id from private.notification_outbox o where o.kind='plan_cancelled'
  and o.plan_id=pg_temp.e7p('02') and o.recipient_id=pg_temp.e7('07') and o.actor_id=pg_temp.e7('01'))),
 'B2: 01''s plan_cancelled may not be told to 07, who blocked 01');
rollback;
