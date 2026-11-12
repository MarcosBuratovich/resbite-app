-- Chat safety (docs/superpowers/plans/2026-11-11-chat-3-safety.md, Tasks 1 and 2; docs/superpowers/specs/2026-11-10-groups-and-chat-design.md,
-- CH-P13 and CH-P18, with the rulings G-B1 to G-B4, G-N12, G-S9 to G-S14 and the challenge's B4, I1 to I11, N1 to
-- N8, R-Q1 to R-Q5, and the confirmations' I-1 to I-4, S2, S5 to S7, SHOULD 3 and 4 and NOTEs): blocks, and the block
-- rule in every read, push and way to connect (slice 1, Task 1); reports, moderators and their push, the chat rules,
-- the blocked terms, the deletion, the fold and the team's scripts (slice 2, Task 2); the way back (the rollback,
-- rehearsed). Synthetic identities only: emails s3-…@resbite-test.invalid (and one nobody@resbite-test.invalid that no
-- account holds), ids with the prefix e7, and two phone numbers from Ofcom's drama range (07700 900xxx, kept for fiction).
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
 'B2: 01''s plan_cancelled is no longer told to 07, who blocked 01 (the resbite''s own news must still arrive)');
rollback;

-- Slice 2 (Task 2): reports, moderators and their push, the chat rules, the blocked terms, the deletion and the fold,
-- and the team's scripts (supabase/ops), run as text. The cast is slice 1's, plus 14 'Wes Web' (a web account: an
-- email, no app session, no roster row, owns nothing), 15 'Wes App' (an app account), 16 'Gil Grant' (a live grant, no
-- roster row) and 17 'Mod Seventeen' (a tester, a moderator-to-be: neither 09 nor 17 is in private.moderators until a
-- line below puts them there). 10, 14 and 16 are Going on the one-off as well. The group rolls once in the setup, so it
-- has a previous occurrence (confirmation NOTE 1): 03's words and 01's announcement to everyone, by hand on its first
-- occurrence an hour back; that occurrence then ends and the roll makes the current one, where everyone the roll
-- carries (02, 03, 04, 05, 07 and 10) has not answered and 02 is still an admin; every row on the first occurrence stays.
-- Nobody has accepted the chat rules until the rules lines; then everyone does. The scripts are read through
-- resbite_repo (a backtick cat, as chat.sql's way back does), each with its one literal swapped by sed for an id this
-- transaction made, and run as the superuser.

-- Slice 2's helpers. A call that must be refused with exactly this code, whatever its message (a table's check).
create function pg_temp.s3_refused_state(p_sql text, p_state text) returns void language plpgsql as $$
declare v_state text;
begin
 begin
  execute p_sql;
 exception when others then
  get stacked diagnostics v_state = returned_sqlstate;
 end;
 if v_state is distinct from p_state then raise exception 'Expected %, got %: %', p_state, v_state, p_sql; end if;
end $$;
-- A call that must be refused with exactly this code and message and nothing more: no detail and no hint (ruling SR3:
-- a table check's DETAIL would print the whole row, the reported words and ids included).
create function pg_temp.s3_refused_bare(p_sql text, p_state text, p_message text) returns void language plpgsql as $$
declare v_state text; v_message text; v_detail text; v_hint text;
begin
 begin
  execute p_sql;
 exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_message = message_text, v_detail = pg_exception_detail, v_hint = pg_exception_hint;
 end;
 if v_state is distinct from p_state or v_message is distinct from p_message or coalesce(v_detail,'')<>'' or coalesce(v_hint,'')<>'' then
  raise exception 'Expected % "%" alone, got % "%" detail "%" hint "%": %', p_state, p_message, v_state, v_message, v_detail, v_hint, p_sql;
 end if;
end $$;
-- A uuid kept for later in this transaction (set_config 's3.<name>').
create function pg_temp.s3_uuid(p_name text) returns uuid language sql stable as $$ select current_setting('s3.'||p_name)::uuid $$;
-- The report_filed notices, the superuser's: how many there are; the people one report's went to, as s3_who writes them.
create function pg_temp.s3_filed() returns integer language plpgsql stable as $$
begin
 return (select count(*)::integer from private.notification_outbox o where o.kind='report_filed');
end $$;
create function pg_temp.s3_filed_to(p_report bigint) returns text language plpgsql stable as $$
begin
 return pg_temp.s3_who(array(select o.recipient_id from private.notification_outbox o
  where o.kind='report_filed' and o.dedupe_key like 'report:'||p_report||':%'));
end $$;
-- A report's id, the superuser's: one person's report of a message; one person's open report about another on a series.
create function pg_temp.s3_report_of(p_reporter uuid, p_message bigint) returns bigint language plpgsql stable as $$
begin
 return (select r.id from private.reports r where r.reporter_id=p_reporter and r.message_id=p_message);
end $$;
create function pg_temp.s3_report_about(p_reporter uuid, p_target uuid, p_series uuid) returns bigint language plpgsql stable as $$
begin
 return (select r.id from private.reports r where r.reporter_id=p_reporter and r.about='user' and r.target_user_id=p_target
  and r.series_id=p_series and r.status='open');
end $$;
-- An owner-run script's rows, run from its text as the current role: a jsonb array, one object per row.
create function pg_temp.s3_run(p_sql text) returns jsonb language plpgsql as $$
declare r record; v jsonb := '[]'::jsonb;
begin
 if coalesce(length(btrim(p_sql)),0)=0 then raise exception 'The script text is empty'; end if;
 for r in execute p_sql loop v := v||jsonb_build_array(to_jsonb(r)); end loop;
 return v;
end $$;
-- The same in a read-only subtransaction, undone after: a script that writes anything fails with 25006.
create function pg_temp.s3_run_read_only(p_sql text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
 begin
  perform set_config('transaction_read_only','on',true);
  v := pg_temp.s3_run(p_sql);
  raise exception 's3: the read-only run is over';
 exception when raise_exception then
  if sqlerrm is distinct from 's3: the read-only run is over' then raise; end if;
 end;
 return v;
end $$;
-- A script's column names, in order, as 'create temporary table … as <script>' makes them.
create function pg_temp.s3_columns(p_sql text) returns text language plpgsql as $$
declare v text;
begin
 execute 'create temporary table s3_columns_probe as '||regexp_replace(p_sql,';\s*$','');
 select string_agg(a.attname,',' order by a.attnum) into v from pg_catalog.pg_attribute a
 where a.attrelid='pg_temp.s3_columns_probe'::regclass and a.attnum>0 and not a.attisdropped;
 drop table pg_temp.s3_columns_probe;
 return v;
end $$;
-- One statement of a source file, from its first line (p_from) to the first p_to after it, both included, as create or
-- replace (chat core made most of its bodies with create function), as chat_groups.after.sql's ch2_source does.
create function pg_temp.s3_source(p_text text, p_from text, p_to text) returns text language plpgsql immutable as $$
declare v_start integer := position(p_from in p_text); v_len integer;
begin
 if v_start=0 then raise exception 'Not in the source: %', p_from; end if;
 v_len := position(p_to in substring(p_text from v_start));
 if v_len=0 then raise exception 'No % after %', p_to, p_from; end if;
 return regexp_replace(substring(p_text from v_start for v_len+length(p_to)-1),'^create function ','create or replace function ');
end $$;
-- The same statement from the n-th time p_from occurs (the migration's section 2 copies of section 1's bodies).
create function pg_temp.s3_nth(p_text text, p_from text, p_n integer) returns text language plpgsql immutable as $fn$
declare v_at integer := 0; v_rest text := p_text; i integer; v_pos integer;
begin
 for i in 1..p_n loop
  v_pos := position(p_from in v_rest);
  if v_pos=0 then raise exception 'Fewer than % of %', p_n, p_from; end if;
  v_at := v_at+v_pos;
  v_rest := substring(p_text from v_at+1);
 end loop;
 return pg_temp.s3_source(substring(p_text from v_at),p_from,'$$;');
end $fn$;

begin;
select pg_temp.e7_cast();
insert into auth.users(id,email,email_confirmed_at)
 select pg_temp.e7(n),'s3-'||n||'@resbite-test.invalid',now() from unnest(array['14','15','16','17']) n;
insert into private.tester_roster(email) select 's3-'||n||'@resbite-test.invalid' from unnest(array['15','17']) n;
insert into private.beta_access(user_id,source) values (pg_temp.e7('16'),'link');
insert into public.profiles(id,display_name) values (pg_temp.e7('14'),'Wes Web'),(pg_temp.e7('15'),'Wes App'),
 (pg_temp.e7('16'),'Gil Grant'),(pg_temp.e7('17'),'Mod Seventeen');
insert into private.app_sessions(user_id) select pg_temp.e7(n) from unnest(array['15','16','17']) n;
select set_config('resbite.system','roll',true);
insert into public.attendees(plan_id,user_id,response) select pg_temp.e7p('01'),pg_temp.e7(n),'accepted' from unnest(array['10','14','16']) n;
-- The group's first occurrence: 03's words and 01's announcement to everyone, an hour back; then it ends and rolls.
insert into public.messages(series_id,plan_id,author_id,kind,audience,body,created_at,updated_at) values
 (pg_temp.e7p('02'),pg_temp.e7p('02'),pg_temp.e7('03'),'message',null,'Mia on week one',now()-interval '1 hour',now()-interval '1 hour'),
 (pg_temp.e7p('02'),pg_temp.e7p('02'),pg_temp.e7('01'),'announcement','everyone','Week one news',now()-interval '1 hour',now()-interval '1 hour');
update public.plans set starts_at=now()-interval '3 hours',ends_at=now()-interval '2 hours' where id=pg_temp.e7p('02');
select pg_temp.s3_check(private.roll_repeating_plans()>=1,'The roll made no occurrence');
select set_config('resbite.system','',true);
select set_config('s3.next',(select id::text from public.plans where repeats_from=pg_temp.e7p('02')),true);
select set_config('s3.w1',(select id::text from public.messages where body='Mia on week one'),true);
select set_config('s3.w1a',(select id::text from public.messages where body='Week one news'),true);
select pg_temp.s3_check(pg_temp.s3_who(array(select a.user_id from public.attendees a where a.plan_id=pg_temp.s3_uuid('next')
  and a.response='pending'))='02,03,04,05,07,10' and private.is_host(pg_temp.s3_uuid('next'),pg_temp.e7('02'))
 and (select response from public.attendees where plan_id=pg_temp.e7p('02') and user_id=pg_temp.e7('04'))='accepted'
 and (private.current_occurrence(pg_temp.e7p('02'))).id=pg_temp.s3_uuid('next'),'The roll did not carry the group as slice 2 needs it');

-- Rules (G-B4(d), Decision 8): 03 writes before accepting: 22023 'Rules not accepted'. 02 announces on the group (an
-- admin carried by the roll, a host of its current occurrence) before accepting: the same. accept_chat_rules as 03,
-- twice: one row, version '2026-11'. chat_summary's rules_accepted: true for 03, false for 05. Then 03 writes.
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('03'));
select pg_temp.s3_refused(format('select public.send_message(%L,%L,gen_random_uuid())',pg_temp.e7p('01'),'Hello all'),'22023','Rules not accepted');
select pg_temp.s3_as(pg_temp.e7('02'));
select pg_temp.s3_refused(format('select public.send_announcement(%L,%L,''everyone'',gen_random_uuid())',pg_temp.e7p('02'),'This week'),
 '22023','Rules not accepted');
select pg_temp.s3_as(pg_temp.e7('03'));
select public.accept_chat_rules();
select public.accept_chat_rules();
select pg_temp.s3_check((public.chat_summary(pg_temp.e7p('01'))->>'rules_accepted')::boolean is true,'rules_accepted for 03 is not true');
select pg_temp.s3_as(pg_temp.e7('05'));
select pg_temp.s3_check((public.chat_summary(pg_temp.e7p('01'))->>'rules_accepted')::boolean is false,'rules_accepted for 05 is not false');
select pg_temp.s3_as(pg_temp.e7('03'));
select set_config('s3.hi_client',gen_random_uuid()::text,true);
select set_config('s3.hi',public.send_message(pg_temp.e7p('01'),'Hello all',pg_temp.s3_uuid('hi_client'))->>'id',true);
reset role;
select pg_temp.s3_check((select string_agg(user_id::text||' '||version,',') from private.chat_rules_acceptances)=pg_temp.e7('03')::text||' 2026-11'
 and private.chat_rules_version()='2026-11','03''s acceptances: '||coalesce((select string_agg(user_id::text||' '||version,',') from private.chat_rules_acceptances),'none'));
-- A resend with the same client id after the rules moved on (03's acceptance gone, in a savepoint) gets its stored row
-- (plan 1's step 1 comes first); a new message does not.
savepoint s3_rules;
delete from private.chat_rules_acceptances where user_id=pg_temp.e7('03');
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('03'));
select pg_temp.s3_check((public.send_message(pg_temp.e7p('01'),'Hello all',pg_temp.s3_uuid('hi_client'))->>'id')::bigint=pg_temp.s3_id('hi'),
 'A resend after the rules moved on is not its stored row');
select pg_temp.s3_refused(format('select public.send_message(%L,%L,gen_random_uuid())',pg_temp.e7p('01'),'Hello again'),'22023','Rules not accepted');
reset role;
rollback to savepoint s3_rules;
-- The slice's other senders accept the rules before they write (SHOULD 3): 02, 04, 05 and 10 through accept_chat_rules,
-- everyone else by hand.
set local role authenticated;
do $$ declare n text; begin
 foreach n in array array['02','04','05','10'] loop
  perform pg_temp.s3_as(pg_temp.e7(n));
  perform public.accept_chat_rules();
 end loop;
end $$;
reset role;
insert into private.chat_rules_acceptances(user_id,version) select p.id,private.chat_rules_version() from public.profiles p
 where p.id::text like 'e7000000-%' on conflict do nothing;

-- GR4 kept, in a savepoint, on the rolled group: 02 announces to everyone on its current occurrence. 05 (carried by the
-- roll, so not answered there) blocks 02: 05's pinned is null and 05's card has no announcement for the current
-- occurrence, since the only other one, 01's, was written on the previous occurrence and the fallback past a blocked
-- author keeps plan 2's current-occurrence rule. For 07 (no block), pinned is 02's.
savepoint s3_gr4;
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('02'));
select set_config('s3.gr4',pg_temp.s3_announce(pg_temp.e7p('02'),'This week at mine')::text,true);
select pg_temp.s3_as(pg_temp.e7('05'));
select public.block_user(pg_temp.e7('02'),true);
reset role;
do $$ declare s jsonb; o jsonb; begin
 perform pg_temp.s3_check(pg_temp.s3_blocked(pg_temp.e7('05'),pg_temp.e7('02')),'GR4 kept: 05''s block of 02 is not stored');
 perform pg_temp.s3_as(pg_temp.e7('05'));
 s := public.chat_summary(pg_temp.e7p('02'));
 o := public.my_chat_overview();
 perform pg_temp.s3_check(s->'pinned'='null'::jsonb,'GR4 kept: 05''s pinned: '||(s->'pinned')::text);
 perform pg_temp.s3_check(not (o->'announcements' ? pg_temp.s3_uuid('next')::text) and (o->'inviters' ? pg_temp.s3_uuid('next')::text),
  'GR4 kept: 05''s card on the current occurrence: '||o::text);
 perform pg_temp.s3_as(pg_temp.e7('07'));
 perform pg_temp.s3_check((public.chat_summary(pg_temp.e7p('02'))->'pinned'->>'id')::bigint=pg_temp.s3_id('gr4'),'GR4 kept: 07''s pinned is not 02''s');
end $$;
rollback to savepoint s3_gr4;

-- Blocked terms (G-B4(a), challenge N4): with 'zzbadword' listed, 'this has ZZBADWORD in it' is 22023 'Not allowed';
-- 'zzbadwords' is sent; an announcement holding it is refused too. A term with a regex character, one that cannot
-- start or end on a word character, one with two spaces or another blank, one not lowercased or trimmed: each a
-- check_violation. With 'zz bad' listed, its space matches a line break and a run of spaces; 'zzbad' is sent.
insert into private.blocked_terms(term) values ('zzbadword');
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('03'));
select pg_temp.s3_refused(format('select public.send_message(%L,%L,gen_random_uuid())',pg_temp.e7p('01'),'this has ZZBADWORD in it'),'22023','Not allowed');
select pg_temp.s3_check(pg_temp.s3_send(pg_temp.e7p('01'),'zzbadwords') is not null,'zzbadwords was refused');
select pg_temp.s3_as(pg_temp.e7('01'));
select pg_temp.s3_refused(format('select public.send_announcement(%L,%L,''everyone'',gen_random_uuid())',pg_temp.e7p('01'),'Bring zzbadword snacks'),
 '22023','Not allowed');
reset role;
select pg_temp.s3_refused_state(format('insert into private.blocked_terms(term) values (%L)',t),'23514')
 from unnest(array['a.b','@ss','n-','two  spaces',e'tab\tterm','Caps',' padded','x(y)','a|b',repeat('z',81)]) t;
insert into private.blocked_terms(term) values ('zz bad');
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('03'));
select pg_temp.s3_refused(format('select public.send_message(%L,%L,gen_random_uuid())',pg_temp.e7p('01'),'it was zz'||e'\n'||'bad'),'22023','Not allowed');
select pg_temp.s3_refused(format('select public.send_message(%L,%L,gen_random_uuid())',pg_temp.e7p('01'),'zz   bad'),'22023','Not allowed');
select pg_temp.s3_check(pg_temp.s3_send(pg_temp.e7p('01'),'zzbad') is not null,'zzbad was refused');
-- D1 (SR3 additions): any blank of chat_body's class between the words matches the term's space, a no-break space
-- (U+00A0), a narrow one (U+202F) and an em space (U+2003) among them, in a message and in an announcement.
select pg_temp.s3_refused(format('select public.send_message(%L,%L,gen_random_uuid())',pg_temp.e7p('01'),'it was zz'||chr(c)||'bad'),'22023','Not allowed')
 from unnest(array[160,8239,8195,12288]) c;
select pg_temp.s3_as(pg_temp.e7('01'));
select pg_temp.s3_refused(format('select public.send_announcement(%L,%L,''everyone'',gen_random_uuid())',pg_temp.e7p('01'),'zz'||chr(160)||chr(8239)||'bad news'),
 '22023','Not allowed');
reset role;
-- A term holding any blank but a plain space is refused by the table (blocked-terms.sql makes it one first).
select pg_temp.s3_refused_state(format('insert into private.blocked_terms(term) values (%L)','zz'||chr(c)||'bad'),'23514')
 from unnest(array[160,8239,8203,12288]) c;
select pg_temp.s3_check((select count(*) from public.messages where body ilike '%zzbadword %' or body ilike '%zz%bad' and body<>'zzbad')=0,
 'A refused message was stored');
delete from private.blocked_terms;

-- The words reported below, on the one-off unless they say: 04's five (m4a to m4e), 05's, 07's five (m7a to m7e), 16's,
-- 10's, 02's announcement to everyone, and 07's on the group's current occurrence; a line on the one-off, by hand.
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('04'));
select set_config('s3.m4'||k,pg_temp.s3_send(pg_temp.e7p('01'),'Leo '||k)::text,true) from unnest(array['a','b','c','d','e']) k;
select pg_temp.s3_as(pg_temp.e7('05'));
select set_config('s3.m5a',pg_temp.s3_send(pg_temp.e7p('01'),'Sol here')::text,true);
select pg_temp.s3_as(pg_temp.e7('07'));
select set_config('s3.m7'||k,pg_temp.s3_send(pg_temp.e7p('01'),'Eva '||k)::text,true) from unnest(array['a','b','c','d','e']) k;
select set_config('s3.m7g',pg_temp.s3_send(pg_temp.e7p('02'),'Eva on the group')::text,true);
select pg_temp.s3_as(pg_temp.e7('16'));
select set_config('s3.m16',pg_temp.s3_send(pg_temp.e7p('01'),'Gil here')::text,true);
select pg_temp.s3_as(pg_temp.e7('10'));
select set_config('s3.m10',pg_temp.s3_send(pg_temp.e7p('01'),'Noa here')::text,true);
select pg_temp.s3_as(pg_temp.e7('02'));
select set_config('s3.a02',pg_temp.s3_announce(pg_temp.e7p('01'),'Everyone welcome')::text,true);
reset role;
insert into public.messages(series_id,plan_id,kind,event,payload,created_at,updated_at) values
 (pg_temp.e7p('01'),pg_temp.e7p('01'),'system','joined',jsonb_build_object('actor',pg_temp.e7('04'),'user',pg_temp.e7('04')),now()-interval '1 hour',now()-interval '1 hour');
select set_config('s3.line',(select max(id)::text from public.messages where series_id=pg_temp.e7p('01') and kind='system'),true);

-- report_message (G-S9, G-B4(e), G-N12). 05 reports 04's m4a: a row, the words and the author frozen, about 'message',
-- on the message's series and plan. The same report again (17 a moderator, in a savepoint): success, still one row,
-- and no report_filed row. 04 then deletes it: the report keeps its words.
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('05'));
select public.report_message(pg_temp.s3_id('m4a'),'harassment','Rude to everyone');
reset role;
select set_config('s3.r1',pg_temp.s3_report_of(pg_temp.e7('05'),pg_temp.s3_id('m4a'))::text,true);
select pg_temp.s3_check((select (r.about,r.reason,r.details,r.frozen_body,r.frozen_author,r.target_user_id,r.series_id,r.plan_id,r.status,r.action,r.reviewed_at)
  is not distinct from ('message'::text,'harassment'::text,'Rude to everyone'::text,'Leo a'::text,pg_temp.e7('04'),pg_temp.e7('04'),pg_temp.e7p('01'),pg_temp.e7p('01'),
   'open'::text,null::text,null::timestamptz) from private.reports r where r.id=pg_temp.s3_id('r1')),
 '05''s report of 04''s message: '||coalesce((select row_to_json(r)::text from private.reports r where r.id=pg_temp.s3_id('r1')),'none'));
savepoint s3_repeat;
insert into private.moderators(user_id) values (pg_temp.e7('17'));
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('05'));
select public.report_message(pg_temp.s3_id('m4a'),'spam',null);
reset role;
select pg_temp.s3_check((select count(*) from private.reports where reporter_id=pg_temp.e7('05'))=1 and pg_temp.s3_filed()=0
 and (select reason from private.reports where id=pg_temp.s3_id('r1'))='harassment','The repeated report stored or queued something');
rollback to savepoint s3_repeat;
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('04'));
select public.delete_message(pg_temp.s3_id('m4a'));
reset role;
select pg_temp.s3_check((select state from public.messages where id=pg_temp.s3_id('m4a'))='deleted'
 and (select (frozen_body,message_id) from private.reports where id=pg_temp.s3_id('r1'))=('Leo a'::text,pg_temp.s3_id('m4a')),
 'The report did not keep the deleted message''s words');
-- 08 (a stranger): 22023 'Report unavailable'. 05 on a system line, on the deleted message, on its own message and on no
-- message at all: the same.
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('08'));
select pg_temp.s3_refused(format('select public.report_message(%s,''spam'')',pg_temp.s3_id('m4b')),'22023','Report unavailable');
select pg_temp.s3_as(pg_temp.e7('05'));
select pg_temp.s3_refused(format('select public.report_message(%s,''spam'')',m),'22023','Report unavailable')
 from unnest(array[pg_temp.s3_id('line'),pg_temp.s3_id('m4a'),pg_temp.s3_id('m5a'),9007199254740991]) m;
reset role;
-- A leaver (plan 2): 03's words on the group's current occurrence, by hand an hour back. 04 leaves the group (its row
-- on the current occurrence goes, as it has not ended), then reports them: a row (04 left after they were written). 04
-- reports 03's words of the previous occurrence, where 04's row stays: a row.
insert into public.messages(series_id,plan_id,author_id,kind,body,created_at,updated_at) values
 (pg_temp.e7p('02'),pg_temp.s3_uuid('next'),pg_temp.e7('03'),'message','Mia this week',now()-interval '1 hour',now()-interval '1 hour');
select set_config('s3.wcur',(select id::text from public.messages where body='Mia this week'),true);
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('04'));
select public.leave_series(pg_temp.e7p('02'));
select public.report_message(pg_temp.s3_id('wcur'),'other',null);
select public.report_message(pg_temp.s3_id('w1'),'other',null);
reset role;
select pg_temp.s3_check(not private.chat_member(pg_temp.e7p('02'),pg_temp.e7('04'))
 and not exists(select 1 from public.attendees where plan_id=pg_temp.s3_uuid('next') and user_id=pg_temp.e7('04'))
 and pg_temp.s3_report_of(pg_temp.e7('04'),pg_temp.s3_id('wcur')) is not null and pg_temp.s3_report_of(pg_temp.e7('04'),pg_temp.s3_id('w1')) is not null
 and (select plan_id from private.reports where id=pg_temp.s3_report_of(pg_temp.e7('04'),pg_temp.s3_id('wcur')))=pg_temp.s3_uuid('next'),
 'The leaver''s reports of the group''s words');
-- The guest row alone (SR3), in a savepoint: 07's row on the group's current occurrence goes by hand, so 07 is not in
-- the chat, has no leave and hosts nothing; 07's row on the first occurrence (any answer, on a group) still lets 07
-- report 03's words written there.
savepoint s3_guest_row;
delete from public.attendees where plan_id=pg_temp.s3_uuid('next') and user_id=pg_temp.e7('07');
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('07'));
select public.report_message(pg_temp.s3_id('w1'),'other',null);
reset role;
select pg_temp.s3_check(not private.chat_member(pg_temp.e7p('02'),pg_temp.e7('07'))
 and not exists(select 1 from private.series_leaves where user_id=pg_temp.e7('07'))
 and pg_temp.s3_report_of(pg_temp.e7('07'),pg_temp.s3_id('w1')) is not null,'The guest row alone did not admit 07''s report');
rollback to savepoint s3_guest_row;
-- 06 (not answered on the one-off) reports 02's announcement to everyone, which reaches 06: a row. NOTE 15: 06 reports
-- 04's plain message there: 22023 'Report unavailable' (not answered on a one-off is not enough).
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('06'));
select public.report_message(pg_temp.s3_id('a02'),'inappropriate',null);
select pg_temp.s3_refused(format('select public.report_message(%s,''spam'')',pg_temp.s3_id('m4b')),'22023','Report unavailable');
reset role;
select pg_temp.s3_check((select (frozen_author,target_user_id) from private.reports where id=pg_temp.s3_report_of(pg_temp.e7('06'),pg_temp.s3_id('a02')))
 =(pg_temp.e7('02'),pg_temp.e7('02')),'06''s report of 02''s announcement');
-- Decision 13, in a savepoint: after the one-off's chat closes (moved 50 hours back), 05 reports 04's m4c: a row.
savepoint s3_closed;
select set_config('resbite.system','roll',true);
update public.plans set starts_at=now()-interval '52 hours',ends_at=now()-interval '50 hours' where id=pg_temp.e7p('01');
select set_config('resbite.system','',true);
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('05'));
select public.report_message(pg_temp.s3_id('m4c'),'spam',null);
reset role;
select pg_temp.s3_check(not private.chat_open(pg_temp.e7p('01')) and pg_temp.s3_report_of(pg_temp.e7('05'),pg_temp.s3_id('m4c')) is not null,
 'Decision 13: no report after the one-off''s chat closed');
rollback to savepoint s3_closed;

-- report_user (G-S9). 05 about 04 on the group: a row, about 'user', on the latest occurrence the two share: the first,
-- since 04 left the current one. About 08 and about oneself: 22023 'Report unavailable'. NOTE 8: the same report again
-- while it is open (17 a moderator, in a savepoint): success, still one row, no report_filed row.
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('05'));
select public.report_user(pg_temp.e7('04'),pg_temp.e7p('02'),'harassment','On the group');
select pg_temp.s3_refused(format('select public.report_user(%L,%L,''spam'')',u,pg_temp.e7p('02')),'22023','Report unavailable')
 from unnest(array[pg_temp.e7('08'),pg_temp.e7('05'),gen_random_uuid()]) u;
reset role;
select set_config('s3.ru1',pg_temp.s3_report_about(pg_temp.e7('05'),pg_temp.e7('04'),pg_temp.e7p('02'))::text,true);
select pg_temp.s3_check((select (r.plan_id,r.message_id,r.frozen_body,r.frozen_author,r.reason,r.details) from private.reports r where r.id=pg_temp.s3_id('ru1'))
 is not distinct from (pg_temp.e7p('02'),null::bigint,null::text,null::uuid,'harassment'::text,'On the group'::text),
 '05''s report about 04: '||coalesce((select row_to_json(r)::text from private.reports r where r.id=pg_temp.s3_id('ru1')),'none'));
savepoint s3_repeat;
insert into private.moderators(user_id) values (pg_temp.e7('17'));
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('05'));
select public.report_user(pg_temp.e7('04'),pg_temp.e7p('02'),'spam',null);
reset role;
select pg_temp.s3_check((select count(*) from private.reports where reporter_id=pg_temp.e7('05') and about='user')=1 and pg_temp.s3_filed()=0,
 'NOTE 8: the repeated report about 04 stored or queued something');
rollback to savepoint s3_repeat;
-- close-report.sql closes it ('reviewed', 'none'): status, action, note and time set, the reported id kept (04 is
-- still here). Then 05's new report about 04 on the group stores a row.
select pg_temp.s3_id('ru1') as s3_rid \gset
\set s3_script `sed -e "s/^ (0, 'reviewed', 'none', 'No action needed')/ (:s3_rid, 'reviewed', 'none', 'Checked')/" :'resbite_repo'/supabase/ops/close-report.sql`
select set_config('s3.out',pg_temp.s3_run(:'s3_script')::text,true);
select pg_temp.s3_check(jsonb_array_length(current_setting('s3.out')::jsonb)=1
 and current_setting('s3.out')::jsonb->0 @> jsonb_build_object('id',pg_temp.s3_id('ru1'),'status','reviewed','action','none','review_note','Checked',
  'target_user_id',pg_temp.e7('04'))
 and (select (status,action,review_note,reviewed_at,target_user_id) from private.reports where id=pg_temp.s3_id('ru1'))
  =('reviewed'::text,'none'::text,'Checked'::text,now(),pg_temp.e7('04')),'close-report.sql: '||current_setting('s3.out'));
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('05'));
select public.report_user(pg_temp.e7('04'),pg_temp.e7p('02'),'harassment','Again');
reset role;
select set_config('s3.ru2',pg_temp.s3_report_about(pg_temp.e7('05'),pg_temp.e7('04'),pg_temp.e7p('02'))::text,true);
select pg_temp.s3_check(pg_temp.s3_id('ru2')<>pg_temp.s3_id('ru1')
 and (select count(*) from private.reports where reporter_id=pg_temp.e7('05') and about='user' and target_user_id=pg_temp.e7('04'))=2,
 'After the close, the new report about 04 was not stored');
-- S5: 10 wrote in the one-off's chat (m10); 01 removes 10. 05 reports 10 on the one-off's series: a row on the one-off.
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('01'));
select public.remove_guest(pg_temp.e7p('01'),pg_temp.e7('10'));
select pg_temp.s3_as(pg_temp.e7('05'));
select public.report_user(pg_temp.e7('10'),pg_temp.e7p('01'),'spam',null);
-- Reasons outside the four, and details over 500 characters: check_violation (500 are fine, in a savepoint).
select pg_temp.s3_refused_state(format('select public.report_user(%L,%L,''rude'')',pg_temp.e7('07'),pg_temp.e7p('01')),'23514');
select pg_temp.s3_refused_state(format('select public.report_message(%s,''sad'')',pg_temp.s3_id('m7a')),'23514');
select pg_temp.s3_refused_state(format('select public.report_user(%L,%L,''other'',%L)',pg_temp.e7('07'),pg_temp.e7p('01'),repeat('x',501)),'23514');
savepoint s3_details;
select public.report_user(pg_temp.e7('07'),pg_temp.e7p('01'),'other',repeat('x',500));
rollback to savepoint s3_details;
reset role;
-- SR3 (the leak): a bad reason, no reason, or details over 500 characters are refused, before anything else is read,
-- with 23514 'Invalid report' alone: never the row a table check would print (the reported words, the reporter, the
-- reported person and the ids). Nothing is stored, nothing counts toward the limit, and nobody is pushed (17 a
-- moderator, in a savepoint). 04, who left the group, gets the same on the words written before they left.
savepoint s3_invalid;
insert into private.moderators(user_id) values (pg_temp.e7('17'));
select set_config('s3.count',(select count(*)::text from private.reports),true);
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('05'));
select pg_temp.s3_refused_bare(x,'23514','Invalid report') from unnest(array[
 format('select public.report_message(%s,''rude'')',pg_temp.s3_id('m7a')),
 format('select public.report_message(%s,null)',pg_temp.s3_id('m7a')),
 format('select public.report_message(%s,''spam'',%L)',pg_temp.s3_id('m7a'),repeat('x',501)),
 format('select public.report_user(%L,%L,''rude'')',pg_temp.e7('07'),pg_temp.e7p('01')),
 format('select public.report_user(%L,%L,null)',pg_temp.e7('07'),pg_temp.e7p('01')),
 format('select public.report_user(%L,%L,''spam'',%L)',pg_temp.e7('07'),pg_temp.e7p('01'),repeat('x',501))]) x;
select pg_temp.s3_as(pg_temp.e7('04'));
select pg_temp.s3_refused_bare(format('select public.report_message(%s,''x'')',pg_temp.s3_id('wcur')),'23514','Invalid report');
reset role;
select pg_temp.s3_check((select count(*) from private.reports)=pg_temp.s3_id('count') and pg_temp.s3_filed()=0,
 'SR3: a refused report stored or queued something');
rollback to savepoint s3_invalid;
select pg_temp.s3_check((select plan_id from private.reports where id=pg_temp.s3_report_about(pg_temp.e7('05'),pg_temp.e7('10'),pg_temp.e7p('01')))
 =pg_temp.e7p('01') and not exists(select 1 from public.attendees where plan_id=pg_temp.e7p('01') and user_id=pg_temp.e7('10'))
 and pg_temp.s3_report_about(pg_temp.e7('05'),pg_temp.e7('07'),pg_temp.e7p('01')) is null,'S5: 05''s report about the removed 10');

-- N14 (d): 05 blocks 04, then reports 04's m4b by its id: a row.
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('05'));
select public.block_user(pg_temp.e7('04'),true);
select public.report_message(pg_temp.s3_id('m4b'),'harassment',null);
reset role;
select pg_temp.s3_check(pg_temp.s3_blocked(pg_temp.e7('05'),pg_temp.e7('04')) and pg_temp.s3_report_of(pg_temp.e7('05'),pg_temp.s3_id('m4b')) is not null,
 'N14 (d): 05''s report of a blocked person''s message');

-- R-Q1: 06 (not answered on the one-off, so no can_see_guests) reports 01, its owner, on the one-off's series: a row on
-- the one-off; and 02, whose announcement to everyone reaches 06: a row. 11 (not answered on the third plan, brought
-- by 03) reports 03 on that series: a row. 12 (invited there by 04) reports 03: 22023 'Report unavailable'.
do $$ begin
 perform pg_temp.s3_as(pg_temp.e7('06'));
 perform pg_temp.s3_check(not private.can_see_guests(pg_temp.e7p('01')),'06 sees the one-off''s guests');
end $$;
-- Only a sent announcement admits it, as block_user reads it: with 02's deleted (in a savepoint), 'Report unavailable'.
set local role authenticated;
savepoint s3_gone_announcement;
select pg_temp.s3_as(pg_temp.e7('02'));
select public.delete_message(pg_temp.s3_id('a02'));
select pg_temp.s3_as(pg_temp.e7('06'));
select pg_temp.s3_refused(format('select public.report_user(%L,%L,''other'')',pg_temp.e7('02'),pg_temp.e7p('01')),'22023','Report unavailable');
rollback to savepoint s3_gone_announcement;
select pg_temp.s3_as(pg_temp.e7('06'));
select public.report_user(pg_temp.e7('01'),pg_temp.e7p('01'),'other',null);
select public.report_user(pg_temp.e7('02'),pg_temp.e7p('01'),'other',null);
select pg_temp.s3_as(pg_temp.e7('11'));
select public.report_user(pg_temp.e7('03'),pg_temp.e7p('03'),'other',null);
select pg_temp.s3_as(pg_temp.e7('12'));
select pg_temp.s3_refused(format('select public.report_user(%L,%L,''other'')',pg_temp.e7('03'),pg_temp.e7p('03')),'22023','Report unavailable');
reset role;
select pg_temp.s3_check((select plan_id from private.reports where id=pg_temp.s3_report_about(pg_temp.e7('06'),pg_temp.e7('01'),pg_temp.e7p('01')))
  =pg_temp.e7p('01')
 and (select plan_id from private.reports where id=pg_temp.s3_report_about(pg_temp.e7('06'),pg_temp.e7('02'),pg_temp.e7p('01')))=pg_temp.e7p('01')
 and (select plan_id from private.reports where id=pg_temp.s3_report_about(pg_temp.e7('11'),pg_temp.e7('03'),pg_temp.e7p('03')))=pg_temp.e7p('03'),
 'R-Q1: the invitees'' reports');

-- I3, in a savepoint (confirmation 2's 2-b): 07 asks 05 to connect on the one-off's series, then 01 removes 05. 05
-- reports 07 there: a row (the waiting request admits it), on the series' current occurrence.
savepoint s3_request;
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('07'));
select pg_temp.s3_check(public.request_connection(pg_temp.e7('05'),pg_temp.e7p('01'))='requested','I3: 07 asking 05 is not requested');
select pg_temp.s3_as(pg_temp.e7('01'));
select public.remove_guest(pg_temp.e7p('01'),pg_temp.e7('05'));
select pg_temp.s3_as(pg_temp.e7('05'));
select public.report_user(pg_temp.e7('07'),pg_temp.e7p('01'),'spam',null);
reset role;
select pg_temp.s3_check((select plan_id from private.reports where id=pg_temp.s3_report_about(pg_temp.e7('05'),pg_temp.e7('07'),pg_temp.e7p('01')))
 =pg_temp.e7p('01') and not exists(select 1 from public.attendees where plan_id=pg_temp.e7p('01') and user_id=pg_temp.e7('05')),
 'I3: 05''s report about the person whose request is waiting');
rollback to savepoint s3_request;

-- N5: 05 reports 04's m4d and, with report_user, 04 on the one-off's series; m4d's row is then deleted by hand: the
-- delete goes through and both reports stay, one about 'message' (its message_id now null), one about 'user'.
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('05'));
select public.report_message(pg_temp.s3_id('m4d'),'harassment',null);
select public.report_user(pg_temp.e7('04'),pg_temp.e7p('01'),'harassment',null);
reset role;
select set_config('s3.rn5',pg_temp.s3_report_of(pg_temp.e7('05'),pg_temp.s3_id('m4d'))::text,true);
delete from public.messages where id=pg_temp.s3_id('m4d');
select pg_temp.s3_check((select (about,message_id,frozen_body,target_user_id) from private.reports where id=pg_temp.s3_id('rn5'))
  is not distinct from ('message'::text,null::bigint,'Leo d'::text,pg_temp.e7('04'))
 and pg_temp.s3_report_about(pg_temp.e7('05'),pg_temp.e7('04'),pg_temp.e7p('01')) is not null,'N5: the two reports after the message went');

-- I7, the limit, in a savepoint (NOTE 1), with 17 a moderator: 05's reports topped up by hand to exactly 20 made in the
-- last 24 hours, whatever their status, and one more 25 hours old. report_message and report_user as 05: 22023 'Report
-- limit', nothing stored, nothing queued. One of the 20 moved back 25 hours: report_message as 05 stores a row.
savepoint s3_limit;
insert into private.moderators(user_id) values (pg_temp.e7('17'));
do $$ declare v_n integer; begin
 select count(*) into v_n from private.reports where reporter_id=pg_temp.e7('05') and created_at>now()-interval '24 hours';
 perform pg_temp.s3_check(v_n between 1 and 19,'05 already filed '||v_n||' reports');
 insert into private.reports(reporter_id,about,reason,status,created_at)
  select pg_temp.e7('05'),'message','spam',case when g%2=0 then 'reviewed' else 'open' end,now()-interval '1 hour' from generate_series(1,20-v_n) g;
 insert into private.reports(reporter_id,about,reason,created_at) values (pg_temp.e7('05'),'message','spam',now()-interval '25 hours');
end $$;
select set_config('s3.count',(select count(*)::text from private.reports),true);
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('05'));
select pg_temp.s3_refused(format('select public.report_message(%s,''spam'')',pg_temp.s3_id('m7a')),'22023','Report limit');
select pg_temp.s3_refused(format('select public.report_user(%L,%L,''spam'')',pg_temp.e7('07'),pg_temp.e7p('01')),'22023','Report limit');
-- At exactly 20, a repeat still reads as the first did (SR3): 05's report of m4b again, and 05's open report about 04
-- on the one-off again: success, nothing stored, nothing queued.
select public.report_message(pg_temp.s3_id('m4b'),'spam',null);
select public.report_user(pg_temp.e7('04'),pg_temp.e7p('01'),'spam',null);
reset role;
select pg_temp.s3_check((select count(*) from private.reports)=pg_temp.s3_id('count') and pg_temp.s3_filed()=0,'The 21st report stored or queued something');
update private.reports set created_at=now()-interval '25 hours' where id=(select min(id) from private.reports where reporter_id=pg_temp.e7('05')
 and created_at=now()-interval '1 hour');
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('05'));
select public.report_message(pg_temp.s3_id('m7a'),'spam',null);
reset role;
select pg_temp.s3_check(pg_temp.s3_report_of(pg_temp.e7('05'),pg_temp.s3_id('m7a')) is not null
 and pg_temp.s3_filed_to(pg_temp.s3_report_of(pg_temp.e7('05'),pg_temp.s3_id('m7a')))='17','Under the limit again, the report was not stored and queued');
rollback to savepoint s3_limit;

-- I4 (the fold): 03 blocks 14 (Going on the one-off); 05 reports 14 with report_user and 14's words (by hand). By hand
-- too: 14 blocks 05, and 14 blocks 15 (after the fold, a block of oneself). NOTE 2-b first, in a savepoint: 15 is Going
-- on the one-off too and 05 reports 15 there; the fold leaves one open report by 05 about 15 there, and nothing naming
-- 14. Then the fold itself: blocks (03, 15) and (15, 05) and none naming 14, and no block of oneself; the user report's
-- target is 15; the message report's frozen author and target are 15, its words as they were.
insert into public.messages(series_id,plan_id,author_id,kind,body,created_at,updated_at) values
 (pg_temp.e7p('01'),pg_temp.e7p('01'),pg_temp.e7('14'),'message','Wes from the web',now()-interval '1 hour',now()-interval '1 hour');
select set_config('s3.m14',(select id::text from public.messages where body='Wes from the web'),true);
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('03'));
select public.block_user(pg_temp.e7('14'),true);
select pg_temp.s3_as(pg_temp.e7('05'));
select public.report_user(pg_temp.e7('14'),pg_temp.e7p('01'),'spam',null);
select public.report_message(pg_temp.s3_id('m14'),'spam',null);
reset role;
insert into private.blocks(blocker_id,blocked_id) values (pg_temp.e7('14'),pg_temp.e7('05')),(pg_temp.e7('14'),pg_temp.e7('15'));
select set_config('s3.r14u',pg_temp.s3_report_about(pg_temp.e7('05'),pg_temp.e7('14'),pg_temp.e7p('01'))::text,true);
select set_config('s3.r14m',pg_temp.s3_report_of(pg_temp.e7('05'),pg_temp.s3_id('m14'))::text,true);
select pg_temp.s3_check(pg_temp.s3_blocked(pg_temp.e7('03'),pg_temp.e7('14')) and pg_temp.s3_id('r14u') is not null and pg_temp.s3_id('r14m') is not null,
 'I4: the block of 14 or the reports about 14');
savepoint s3_fold;
select set_config('resbite.system','roll',true);
insert into public.attendees(plan_id,user_id,response) values (pg_temp.e7p('01'),pg_temp.e7('15'),'accepted');
select set_config('resbite.system','',true);
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('05'));
select public.report_user(pg_temp.e7('15'),pg_temp.e7p('01'),'spam',null);
reset role;
-- And both accounts reported 07's m7a (14's by hand: a web account reports nothing itself): the fold keeps 15's.
insert into private.reports(reporter_id,target_user_id,message_id,series_id,plan_id,about,reason,frozen_body,frozen_author)
 select u,m.author_id,m.id,m.series_id,m.plan_id,'message','spam',m.body,m.author_id from public.messages m,
  unnest(array[pg_temp.e7('14'),pg_temp.e7('15')]) u where m.id=pg_temp.s3_id('m7a');
select set_config('s3.r15m7a',pg_temp.s3_report_of(pg_temp.e7('15'),pg_temp.s3_id('m7a'))::text,true);
select private.fold_web_account(pg_temp.e7('14'),pg_temp.e7('15'));
select pg_temp.s3_check((select count(*) from private.reports where reporter_id=pg_temp.e7('05') and about='user' and status='open'
  and target_user_id=pg_temp.e7('15') and series_id=pg_temp.e7p('01'))=1
 and (select string_agg(id::text,',') from private.reports where message_id=pg_temp.s3_id('m7a'))=current_setting('s3.r15m7a')
 and not exists(select 1 from private.reports where pg_temp.e7('14') in (reporter_id,target_user_id,frozen_author)),
 'NOTE 2-b: the fold did not leave one open report about 15, and one report of m7a, 15''s');
rollback to savepoint s3_fold;
-- Q-1 (SR3): reports between the two accounts go with the fold, a report about oneself being meaningless: 14's about
-- 15 and 15's of 14's words (both by hand).
insert into private.reports(reporter_id,target_user_id,series_id,plan_id,about,reason) values
 (pg_temp.e7('14'),pg_temp.e7('15'),pg_temp.e7p('01'),pg_temp.e7p('01'),'user','spam');
insert into private.reports(reporter_id,target_user_id,message_id,series_id,plan_id,about,reason,frozen_body,frozen_author)
 select pg_temp.e7('15'),m.author_id,m.id,m.series_id,m.plan_id,'message','spam',m.body,m.author_id from public.messages m
 where m.id=pg_temp.s3_id('m14');
select private.fold_web_account(pg_temp.e7('14'),pg_temp.e7('15'));
select pg_temp.s3_check(not exists(select 1 from private.reports where reporter_id=pg_temp.e7('15') and pg_temp.e7('15') in (target_user_id,frozen_author)),
 'Q-1: a report between the two merged accounts stayed, now about oneself');
select pg_temp.s3_check(pg_temp.s3_blocked(pg_temp.e7('03'),pg_temp.e7('15')) and pg_temp.s3_blocked(pg_temp.e7('15'),pg_temp.e7('05'))
 and not exists(select 1 from private.blocks where pg_temp.e7('14') in (blocker_id,blocked_id))
 and not exists(select 1 from private.blocks where blocker_id=blocked_id),'I4: the blocks after the fold');
select pg_temp.s3_check((select target_user_id from private.reports where id=pg_temp.s3_id('r14u'))=pg_temp.e7('15')
 and (select (frozen_author,target_user_id,frozen_body) from private.reports where id=pg_temp.s3_id('r14m'))=(pg_temp.e7('15'),pg_temp.e7('15'),'Wes from the web'::text)
 and not exists(select 1 from private.reports where pg_temp.e7('14') in (reporter_id,target_user_id,frozen_author)),'I4: the reports after the fold');

-- I11 (CH-P18, Decision 7): 03 reports 05's m5a and 16's m16. (A profile deleted by hand goes after its guest rows:
-- on the hosted baseline a guest row holds its profile.) In a savepoint, 05's profile deleted by hand: every
-- report 05 filed is gone (on delete cascade), and 03's report about 05 stays, with its words, target 05 and frozen
-- author 05. In another, 16's profile deleted by hand: 03's report about 16 keeps target 16; close-report.sql on it
-- then forgets who it was about (target and frozen author null).
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('03'));
select public.report_message(pg_temp.s3_id('m5a'),'spam',null);
select public.report_message(pg_temp.s3_id('m16'),'spam',null);
reset role;
select set_config('s3.r05',pg_temp.s3_report_of(pg_temp.e7('03'),pg_temp.s3_id('m5a'))::text,true);
select set_config('s3.r16',pg_temp.s3_report_of(pg_temp.e7('03'),pg_temp.s3_id('m16'))::text,true);
select set_config('s3.filed05',(select string_agg(id::text,',') from private.reports where reporter_id=pg_temp.e7('05')),true);
savepoint s3_gone;
delete from public.attendees where user_id=pg_temp.e7('05');
delete from public.profiles where id=pg_temp.e7('05');
select pg_temp.s3_check(not exists(select 1 from private.reports where id=any(string_to_array(current_setting('s3.filed05'),',')::bigint[]))
 and cardinality(string_to_array(current_setting('s3.filed05'),','))>=8,'CH-P18: a report 05 filed outlived 05''s profile');
select pg_temp.s3_check((select (frozen_body,target_user_id,frozen_author) from private.reports where id=pg_temp.s3_id('r05'))
 =('Sol here'::text,pg_temp.e7('05'),pg_temp.e7('05')),'CH-P18: the report about 05 did not stay as it was');
rollback to savepoint s3_gone;
savepoint s3_gone;
delete from public.attendees where user_id=pg_temp.e7('16');
delete from public.profiles where id=pg_temp.e7('16');
select pg_temp.s3_check((select (target_user_id,frozen_author,frozen_body) from private.reports where id=pg_temp.s3_id('r16'))
 =(pg_temp.e7('16'),pg_temp.e7('16'),'Gil here'::text),'I11: the open report about 16 did not keep its target');
select pg_temp.s3_id('r16') as s3_rid \gset
\set s3_script `sed -e "s/^ (0, 'reviewed', 'none', 'No action needed')/ (:s3_rid, 'actioned', 'account_suspended', 'Account gone')/" :'resbite_repo'/supabase/ops/close-report.sql`
select set_config('s3.out',pg_temp.s3_run(:'s3_script')::text,true);
select pg_temp.s3_check((select (status,action,target_user_id,frozen_author,frozen_body) from private.reports where id=pg_temp.s3_id('r16'))
 is not distinct from ('actioned'::text,'account_suspended'::text,null::uuid,null::uuid,'Gil here'::text)
 and current_setting('s3.out')::jsonb->0->'target_user_id'='null'::jsonb,'I11: close-report.sql kept the id of a profile that has gone');
rollback to savepoint s3_gone;

-- The moderators' push (G-B4(c), Decision 10): 09 is put in private.moderators. 05 reports 07's m7b: one report_filed
-- row, to 09, on the report's plan, with no actor and no message, dedupe 'report:<id>:<09>', and it may be told.
insert into private.moderators(user_id) values (pg_temp.e7('09'));
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('05'));
select public.report_message(pg_temp.s3_id('m7b'),'spam',null);
reset role;
select set_config('s3.rmod',pg_temp.s3_report_of(pg_temp.e7('05'),pg_temp.s3_id('m7b'))::text,true);
select set_config('s3.omod',(select id::text from private.notification_outbox where kind='report_filed' and recipient_id=pg_temp.e7('09')),true);
select pg_temp.s3_check(pg_temp.s3_filed()=1 and (select (o.recipient_id,o.plan_id,o.actor_id,o.message_id,o.dedupe_key,o.detail)
  is not distinct from (pg_temp.e7('09'),pg_temp.e7p('01'),null::uuid,null::bigint,'report:'||pg_temp.s3_id('rmod')||':'||pg_temp.e7('09'),null::text)
  from private.notification_outbox o where o.id=pg_temp.s3_id('omod'))
 and private.notification_recipient_eligible(pg_temp.s3_id('omod')),'The moderator''s report_filed row: '
 ||coalesce((select row_to_json(o)::text from private.notification_outbox o where o.kind='report_filed'),'none'));
-- The moderators' branch, each clause (SR3), each in a savepoint: with 09's roster row disabled (09 may not use the app),
-- 09's account being deleted, or the notice over a day old, 09's row may not be told.
savepoint s3_mod;
update private.tester_roster set enabled=false where email='s3-09@resbite-test.invalid';
select pg_temp.s3_check(not private.notification_recipient_eligible(pg_temp.s3_id('omod')),'A moderator who may not use the app is pushed');
rollback to savepoint s3_mod;
savepoint s3_mod;
update public.profiles set deletion_requested_at=now() where id=pg_temp.e7('09');
select pg_temp.s3_check(not private.notification_recipient_eligible(pg_temp.s3_id('omod')),'A moderator being deleted is pushed');
rollback to savepoint s3_mod;
savepoint s3_mod;
update private.notification_outbox set created_at=now()-interval '25 hours' where id=pg_temp.s3_id('omod');
select pg_temp.s3_check(not private.notification_recipient_eligible(pg_temp.s3_id('omod')),'A report_filed notice over a day old is pushed');
rollback to savepoint s3_mod;
-- I-4 (each exclusion can fail): 17 is a moderator too, and every report_filed row is moved 11 minutes back. 09 reports
-- 04's m4e: one row, to 17, none to 09 (the reporter). Every row moved back again; N8: 05 reports 09 on the one-off's
-- series: one row, to 17, none to 09 (the reported person).
insert into private.moderators(user_id) values (pg_temp.e7('17'));
update private.notification_outbox set created_at=now()-interval '11 minutes' where kind='report_filed';
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('09'));
select public.report_message(pg_temp.s3_id('m4e'),'spam',null);
reset role;
select pg_temp.s3_check(pg_temp.s3_filed_to(pg_temp.s3_report_of(pg_temp.e7('09'),pg_temp.s3_id('m4e')))='17',
 'I-4: 09''s report went to '||pg_temp.s3_filed_to(pg_temp.s3_report_of(pg_temp.e7('09'),pg_temp.s3_id('m4e'))));
update private.notification_outbox set created_at=now()-interval '11 minutes' where kind='report_filed';
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('05'));
select public.report_user(pg_temp.e7('09'),pg_temp.e7p('01'),'spam',null);
reset role;
select pg_temp.s3_check(pg_temp.s3_filed_to(pg_temp.s3_report_about(pg_temp.e7('05'),pg_temp.e7('09'),pg_temp.e7p('01')))='17',
 'N8: the report about 09 went to '||pg_temp.s3_filed_to(pg_temp.s3_report_about(pg_temp.e7('05'),pg_temp.e7('09'),pg_temp.e7p('01'))));
-- N14 (a): 09 is a Going guest of the reported resbite and mutes it: 09's row (omod) may still be told (no mute applies
-- to report_filed). 09 unmutes, and moderators.sql leaves 09 out (17's email only): the row may no longer be told, as
-- the first branch leaves the kind out and 09's guest row doesn't make it eligible.
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('09'));
select public.set_plan_mute(pg_temp.e7p('01'),true);
reset role;
select pg_temp.s3_check(exists(select 1 from public.plan_mutes where series_id=pg_temp.e7p('01') and user_id=pg_temp.e7('09'))
 and private.notification_recipient_eligible(pg_temp.s3_id('omod')),'N14 (a): a mute stopped the moderator''s push');
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('09'));
select public.set_plan_mute(pg_temp.e7p('01'),false);
reset role;
\set s3_script `sed -e "s/array\[\]::text\[\]/array['s3-17@resbite-test.invalid']::text[]/" :'resbite_repo'/supabase/ops/moderators.sql`
select set_config('s3.out',pg_temp.s3_run(:'s3_script')::text,true);
select pg_temp.s3_check(current_setting('s3.out')::jsonb=jsonb_build_array(jsonb_build_object('moderators',1,'no_account',jsonb_build_array()))
 and pg_temp.s3_who(array(select user_id from private.moderators))='17'
 and not private.notification_recipient_eligible(pg_temp.s3_id('omod')),'N14 (a): moderators.sql or the eligibility after it: '||current_setting('s3.out'));

-- I7, coalescing: 09 and 17 are moderators. Every report_filed row is moved 11 minutes back, then one to 09 is made 5
-- minutes ago (by hand). 05 reports m7c: one row, to 17. Every row to 09 moved back 11 minutes (I-4: all of them, not
-- only the hand-made one): 05 reports m7d: one row, to 09, and none to 17, whose row is from this transaction.
insert into private.moderators(user_id) values (pg_temp.e7('09'));
update private.notification_outbox set created_at=now()-interval '11 minutes' where kind='report_filed';
insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,created_at)
 values (pg_temp.e7p('01'),pg_temp.e7('09'),'report_filed','s3:coalesce:09',now()-interval '5 minutes');
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('05'));
select public.report_message(pg_temp.s3_id('m7c'),'spam',null);
reset role;
select pg_temp.s3_check(pg_temp.s3_filed_to(pg_temp.s3_report_of(pg_temp.e7('05'),pg_temp.s3_id('m7c')))='17',
 'I7: the report after 09''s recent push went to '||pg_temp.s3_filed_to(pg_temp.s3_report_of(pg_temp.e7('05'),pg_temp.s3_id('m7c'))));
update private.notification_outbox set created_at=now()-interval '11 minutes' where kind='report_filed' and recipient_id=pg_temp.e7('09');
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('05'));
select public.report_message(pg_temp.s3_id('m7d'),'spam',null);
reset role;
select pg_temp.s3_check(pg_temp.s3_filed_to(pg_temp.s3_report_of(pg_temp.e7('05'),pg_temp.s3_id('m7d')))='09',
 'I7: the next report went to '||pg_temp.s3_filed_to(pg_temp.s3_report_of(pg_temp.e7('05'),pg_temp.s3_id('m7d'))));

-- I7, priority, in a savepoint: every notice so far delivered; a device each for 09 and three of the one-off's people.
-- 150 chat_message rows about 07's m7e, then a report_filed row to 09 (05 reports m7e; 09's rows moved back first). One
-- claim(25) returns 09's job, expanded before any chat job, with a uuid plan_id and a digits-only outbox id (the
-- sender's checks), its title, and no chat fields, actor or bringer; most of the crowd waits.
savepoint s3_claim;
update private.notification_outbox set expanded_at=now(),delivered_at=now();
update private.notification_outbox set created_at=now()-interval '11 minutes' where kind='report_filed' and recipient_id=pg_temp.e7('09');
insert into private.device_endpoints(token,user_id,platform) select 'ExpoPushToken[s3c'||n||']',pg_temp.e7(n),'ios' from unnest(array['02','03','09','13']) n;
insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id,message_id)
 select pg_temp.e7p('01'),pg_temp.e7((array['02','03','13'])[1+g%3]),'chat_message','s3:crowd:'||g,pg_temp.e7('07'),pg_temp.s3_id('m7e')
 from generate_series(1,150) g;
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('05'));
select public.report_message(pg_temp.s3_id('m7e'),'spam',null);
reset role;
select set_config('s3.oprio',(select o.id::text from private.notification_outbox o where o.kind='report_filed' and o.recipient_id=pg_temp.e7('09')
 and o.dedupe_key='report:'||pg_temp.s3_report_of(pg_temp.e7('05'),pg_temp.s3_id('m7e'))||':'||pg_temp.e7('09')),true);
select pg_temp.s3_check(pg_temp.s3_id('oprio')>(select max(id) from private.notification_outbox where dedupe_key like 's3:crowd:%')
 and (select bool_and(private.notification_recipient_eligible(id)) from private.notification_outbox where dedupe_key like 's3:crowd:%'),
 'The crowd is not 150 eligible chat notices before 09''s report_filed row');
set local role service_role;
select set_config('s3.jobs',public.claim_notification_deliveries(25)::text,true);
reset role;
do $$ declare j jsonb; begin
 select e.value into j from jsonb_array_elements(current_setting('s3.jobs')::jsonb) e where e.value->>'outbox_id'=pg_temp.s3_id('oprio')::text;
 perform pg_temp.s3_check(j is not null,'I7: the claim did not return 09''s report_filed job: '||current_setting('s3.jobs'));
 perform pg_temp.s3_check(j->>'kind'='report_filed' and j->>'recipient_id'=pg_temp.e7('09')::text and j->>'plan_id'=pg_temp.e7p('01')::text
  and j->>'plan_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' and j->>'outbox_id' ~ '^\d+$'
  and j->>'title'='Picnic' and j->'actor_name'='null'::jsonb and j->'brought_by_name'='null'::jsonb and j->'series_id'='null'::jsonb
  and j->'message_id'='null'::jsonb and j->'message_body'='null'::jsonb and j->'audience'='null'::jsonb and j->'detail'='null'::jsonb,
  'I7: 09''s job: '||j::text);
 perform pg_temp.s3_check((select count(*) from private.notification_outbox where dedupe_key like 's3:crowd:%' and expanded_at is not null)<=99
  and (select count(*) from jsonb_array_elements(current_setting('s3.jobs')::jsonb))=25,'I7: the claim is not the crowd''s first page');
end $$;
rollback to savepoint s3_claim;

-- N14 (d), on the group, after its chat closed (stopped and 48 hours past by hand, under the roll's flag): 05 reports
-- 07's words there: a row. remove-reported-message.sql uses it below: 05 is still in the chat.
select set_config('resbite.system','roll',true);
update public.chats set stopped_at=now()-interval '50 hours' where series_id=pg_temp.e7p('02');
update public.plans set starts_at=now()-interval '52 hours',ends_at=now()-interval '50 hours' where id=pg_temp.s3_uuid('next');
select set_config('resbite.system','',true);
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('05'));
select public.report_message(pg_temp.s3_id('m7g'),'harassment','On the group');
reset role;
select set_config('s3.rgroup',pg_temp.s3_report_of(pg_temp.e7('05'),pg_temp.s3_id('m7g'))::text,true);
select pg_temp.s3_check(not private.chat_open(pg_temp.e7p('02')) and private.chat_member(pg_temp.e7p('02'),pg_temp.e7('05'))
 and pg_temp.s3_id('rgroup') is not null,'N14 (d): no report on the closed group');

-- open-reports.sql (G-S14, I10, I11, R-Q2): 03 blocks 04 (the block the team should read, confirmation 2's 2-b), 07
-- blocks 03, and 05's block of 04 is moved 8 days back. One report is moved two hours back, so it reads first.
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('03'));
select public.block_user(pg_temp.e7('04'),true);
select pg_temp.s3_as(pg_temp.e7('07'));
select public.block_user(pg_temp.e7('03'),true);
reset role;
update private.blocks set created_at=now()-interval '8 days' where blocker_id=pg_temp.e7('05') and blocked_id=pg_temp.e7('04');
update private.reports set created_at=now()-interval '2 hours' where id=pg_temp.s3_id('rgroup');
\set s3_script `cat :'resbite_repo'/supabase/ops/open-reports.sql`
select pg_temp.s3_check(pg_temp.s3_columns(:'s3_script')='item,id,created_at,reason,details,frozen_body,reporter_name,target_name,resbite_title,resbite_date',
 'open-reports.sql''s columns: '||pg_temp.s3_columns(:'s3_script'));
select set_config('s3.out',pg_temp.s3_run_read_only(:'s3_script')::text,true);
do $$ declare v jsonb := current_setting('s3.out')::jsonb; b jsonb; begin
 -- Its 'report' rows are the open reports, oldest first, then the blocks, then nothing due.
 perform pg_temp.s3_check((select string_agg(t.value->>'id',',' order by t.n) from jsonb_array_elements(v) with ordinality t(value,n)
   where t.value->>'item'='report')
  =(select string_agg(id::text,',' order by created_at,id) from private.reports where status='open'),'open-reports.sql''s reports: '||v::text);
 perform pg_temp.s3_check(v->0->>'id'=pg_temp.s3_id('rgroup')::text and v->0 @> jsonb_build_object('item','report','reason','harassment',
   'details','On the group','frozen_body','Eva on the group','reporter_name','Sol Going','target_name','Eva Going','resbite_title','Board game night'),
  'open-reports.sql''s first row: '||(v->0)::text);
 perform pg_temp.s3_check((select string_agg(e.value->>'item',',' order by n) from jsonb_array_elements(v) with ordinality e(value,n))
  ~ '^(report,)+(block,)+block$','open-reports.sql''s items are not reports, then blocks: '||v::text);
 select e.value into b from jsonb_array_elements(v) e where e.value->>'item'='block' and e.value->>'reporter_name'='Mia Going'
  and e.value->>'target_name'='Leo Going';
 perform pg_temp.s3_check(b is not null and b->'id'='null'::jsonb and b->'details'='null'::jsonb and b->'frozen_body'='null'::jsonb
  and b->'reason'='null'::jsonb and b->'resbite_title'='null'::jsonb and b->'resbite_date'='null'::jsonb
  and (b->>'created_at')::timestamptz=(select created_at from private.blocks where blocker_id=pg_temp.e7('03') and blocked_id=pg_temp.e7('04')),
  'open-reports.sql: 03''s block of 04: '||coalesce(b::text,'none'));
 perform pg_temp.s3_check(not exists(select 1 from jsonb_array_elements(v) e where e.value->>'item'='block' and e.value->>'reporter_name'='Sol Going'
   and e.value->>'target_name'='Leo Going'),'open-reports.sql lists a block from 8 days ago');
 perform pg_temp.s3_check((select string_agg(e.value->>'created_at',',' order by n) from jsonb_array_elements(v) with ordinality e(value,n) where e.value->>'item'='block')
  =(select string_agg(to_jsonb(created_at)#>>'{}',',' order by created_at desc) from private.blocks where created_at>now()-interval '7 days'),
  'open-reports.sql''s blocks are not the last 7 days'', newest first');
 perform pg_temp.s3_check(v::text !~ '@|447700','open-reports.sql shows an email or a phone number');
end $$;
-- With a report closed 181 days ago (in a savepoint): one 'due' row, saying how many and what to run; nothing else.
savepoint s3_due;
update private.reports set reviewed_at=now()-interval '181 days' where id=pg_temp.s3_id('ru1');
select set_config('s3.out',pg_temp.s3_run_read_only(:'s3_script')::text,true);
select pg_temp.s3_check((select count(*) from jsonb_array_elements(current_setting('s3.out')::jsonb) e where e.value->>'item'='due')=1
 and (select e.value - 'details' - 'item' = jsonb_build_object('id',null,'created_at',null,'reason',null,'frozen_body',null,'reporter_name',null,
   'target_name',null,'resbite_title',null,'resbite_date',null)
  and e.value->>'details' ~ '^1 \S.*purge-closed-reports\.sql' from jsonb_array_elements(current_setting('s3.out')::jsonb) e where e.value->>'item'='due'),
 'open-reports.sql''s due row: '||current_setting('s3.out'));
rollback to savepoint s3_due;

-- remove-reported-message.sql on 05's report of 07's words on the group: the message reads removed, with no body and
-- payload {"by": "resbite"}; the chat's count drops by one; the report stays open. chat_messages as 05 returns that
-- payload, and its names map has no 'resbite' key. A second run changes nothing.
select set_config('s3.count',(select message_count::text from public.chats where series_id=pg_temp.e7p('02')),true);
select pg_temp.s3_id('rgroup') as s3_rid \gset
\set s3_script `sed -e 's/(values (0))/(values (:s3_rid))/' :'resbite_repo'/supabase/ops/remove-reported-message.sql`
select set_config('s3.out',pg_temp.s3_run(:'s3_script')::text,true);
select pg_temp.s3_check(current_setting('s3.out')::jsonb=jsonb_build_array(jsonb_build_object('message_id',pg_temp.s3_id('m7g'),'state','removed'))
 and (select (state,body,payload) from public.messages where id=pg_temp.s3_id('m7g')) is not distinct from ('removed'::text,null::text,'{"by": "resbite"}'::jsonb)
 and (select message_count from public.chats where series_id=pg_temp.e7p('02'))=pg_temp.s3_id('count')-1
 and (select status from private.reports where id=pg_temp.s3_id('rgroup'))='open','remove-reported-message.sql: '||current_setting('s3.out'));
do $$ declare r jsonb; begin
 perform pg_temp.s3_as(pg_temp.e7('05'));
 r := public.chat_messages(pg_temp.e7p('02'));
 perform pg_temp.s3_check(exists(select 1 from jsonb_array_elements(r->'rows') e where (e.value->>'id')::bigint=pg_temp.s3_id('m7g')
   and e.value->'payload'='{"by": "resbite"}'::jsonb and e.value->>'state'='removed' and e.value->'body'='null'::jsonb)
  and not (r->'names' ? 'resbite'),'05''s read of the removed message: '||r::text);
end $$;
select set_config('s3.ctid',(select ctid::text from public.messages where id=pg_temp.s3_id('m7g')),true);
select set_config('s3.out',pg_temp.s3_run(:'s3_script')::text,true);
select pg_temp.s3_check(current_setting('s3.out')::jsonb=jsonb_build_array(jsonb_build_object('message_id',pg_temp.s3_id('m7g'),'state','removed'))
 and (select ctid::text from public.messages where id=pg_temp.s3_id('m7g'))=current_setting('s3.ctid'),'remove-reported-message.sql run again changed the message');

-- Deletion (guarded: only where the deletion lifecycle exists), in a savepoint (confirmation 2's 2-b). 04's account is
-- deleted first: every report about 04 stays, with its words, though 04's messages lose theirs. Then 03's, 05's and 09's:
-- 03's blocks both ways go, and so does 03's acceptance; 05's reports go (CH-P18); 09's moderator row goes.
select to_regprocedure('private.request_account_deletion(uuid,uuid,uuid,text)') is not null as s3_deletion \gset
\if :s3_deletion
savepoint s3_deletion;
select set_config('s3.about04',(select string_agg(id||':'||coalesce(frozen_body,'-'),',' order by id) from private.reports
 where target_user_id=pg_temp.e7('04')),true);
select pg_temp.s3_check(current_setting('s3.about04') like '%:Leo a%' and (select count(*) from private.blocks where pg_temp.e7('03') in (blocker_id,blocked_id))>=3
 and exists(select 1 from private.blocks where blocked_id=pg_temp.e7('03'))
 and exists(select 1 from private.chat_rules_acceptances where user_id=pg_temp.e7('03')) and exists(select 1 from private.moderators where user_id=pg_temp.e7('09'))
 and exists(select 1 from private.reports where reporter_id=pg_temp.e7('05')),'The deletion''s rows are not there before it');
insert into auth.sessions(id,user_id,created_at) select ('e7200000-0000-4000-8000-0000000000'||n)::uuid,pg_temp.e7(n),now() from unnest(array['03','04','05','09']) n;
select private.request_account_deletion(pg_temp.e7('04'),'e7200000-0000-4000-8000-000000000004','e7300000-0000-4000-8000-000000000004',repeat('d',64));
select pg_temp.s3_check((select string_agg(id||':'||coalesce(frozen_body,'-'),',' order by id) from private.reports where target_user_id=pg_temp.e7('04'))
  =current_setting('s3.about04') and (select body from public.messages where id=pg_temp.s3_id('m4b')) is null,
 'Deletion: the reports about 04 did not stay with their words');
select private.request_account_deletion(pg_temp.e7(n),('e7200000-0000-4000-8000-0000000000'||n)::uuid,('e7300000-0000-4000-8000-0000000000'||n)::uuid,
 repeat('d',64)) from unnest(array['03','05','09']) n;
select pg_temp.s3_check(not exists(select 1 from private.blocks where pg_temp.e7('03') in (blocker_id,blocked_id)),'Deletion: 03''s blocks stayed');
select pg_temp.s3_check(not exists(select 1 from private.chat_rules_acceptances where user_id=pg_temp.e7('03')),'Deletion: 03''s acceptance stayed');
select pg_temp.s3_check(not exists(select 1 from private.reports where reporter_id=pg_temp.e7('05')),'Deletion: 05''s reports stayed');
select pg_temp.s3_check(not exists(select 1 from private.moderators where user_id=pg_temp.e7('09')),'Deletion: 09''s moderator row stayed');
rollback to savepoint s3_deletion;
\endif

-- suspend-account.sql (G-B4(b), N14 (b)): on a report about 04 (05's open one on the group), 04's roster row is
-- disabled: user_eligible(04) is false, and it prints 1 and 0. On 03's report about 16 (a live grant, no roster row):
-- user_eligible(16) is false, and it prints 0 and 1.
select pg_temp.s3_id('ru2') as s3_rid \gset
\set s3_script `sed -e 's/(values (0))/(values (:s3_rid))/' :'resbite_repo'/supabase/ops/suspend-account.sql`
select set_config('s3.out',pg_temp.s3_run(:'s3_script')::text,true);
select pg_temp.s3_check(current_setting('s3.out')::jsonb=jsonb_build_array(jsonb_build_object('roster_rows_disabled',1,'grants_revoked',0))
 and not private.user_eligible(pg_temp.e7('04')),'suspend-account.sql on 04: '||current_setting('s3.out'));
select pg_temp.s3_id('r16') as s3_rid \gset
\set s3_script `sed -e 's/(values (0))/(values (:s3_rid))/' :'resbite_repo'/supabase/ops/suspend-account.sql`
select set_config('s3.out',pg_temp.s3_run(:'s3_script')::text,true);
select pg_temp.s3_check(current_setting('s3.out')::jsonb=jsonb_build_array(jsonb_build_object('roster_rows_disabled',0,'grants_revoked',1))
 and not private.user_eligible(pg_temp.e7('16')),'suspend-account.sql on 16: '||current_setting('s3.out'));
-- D3 (SR3 additions): the undo in suspend-account.sql's closing comment, run with the same report's id, puts back only
-- what that suspension changed. In savepoints: on 16's, the grant comes back ({0,1}) and 16 may use the app again; on
-- 04's, the roster row comes back ({1,0}). Then two people banned a month earlier (in one savepoint): 13 (roster row
-- disabled and a grant revoked then) is suspended ({0,0}) and undone ({0,0}), and stays banned, the grant's month-old
-- time kept; 07 (roster row on, a grant revoked a month ago) is suspended ({1,0}) and undone ({1,0}): the roster row
-- comes back, the old revocation stays.
savepoint s3_undo;
\set s3_undo `sed -n -e '/^-- To undo it/,$ s/^--   //p' :'resbite_repo'/supabase/ops/suspend-account.sql | sed -e 's/(values (0))/(values (:s3_rid))/'`
select set_config('s3.out',pg_temp.s3_run(:'s3_undo')::text,true);
select pg_temp.s3_check(current_setting('s3.out')::jsonb=jsonb_build_array(jsonb_build_object('roster_rows_enabled',0,'grants_restored',1))
 and private.user_eligible(pg_temp.e7('16')),'The undo on 16: '||current_setting('s3.out'));
rollback to savepoint s3_undo;
savepoint s3_undo;
select pg_temp.s3_id('ru2') as s3_rid \gset
\set s3_undo `sed -n -e '/^-- To undo it/,$ s/^--   //p' :'resbite_repo'/supabase/ops/suspend-account.sql | sed -e 's/(values (0))/(values (:s3_rid))/'`
select set_config('s3.out',pg_temp.s3_run(:'s3_undo')::text,true);
select pg_temp.s3_check(current_setting('s3.out')::jsonb=jsonb_build_array(jsonb_build_object('roster_rows_enabled',1,'grants_restored',0))
 and private.user_eligible(pg_temp.e7('04')),'The undo on 04: '||current_setting('s3.out'));
rollback to savepoint s3_undo;
savepoint s3_undo;
update private.tester_roster set enabled=false where email='s3-13@resbite-test.invalid';
insert into private.beta_access(user_id,source,granted_at,revoked_at) values
 (pg_temp.e7('13'),'link',now()-interval '60 days',now()-interval '30 days'),(pg_temp.e7('07'),'link',now()-interval '60 days',now()-interval '30 days');
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('03'));
select public.report_user(pg_temp.e7(n),pg_temp.e7p('01'),'harassment',null) from unnest(array['13','07']) n;
reset role;
select pg_temp.s3_report_about(pg_temp.e7('03'),pg_temp.e7('13'),pg_temp.e7p('01')) as s3_rid \gset
\set s3_script `sed -e 's/(values (0))/(values (:s3_rid))/' :'resbite_repo'/supabase/ops/suspend-account.sql`
\set s3_undo `sed -n -e '/^-- To undo it/,$ s/^--   //p' :'resbite_repo'/supabase/ops/suspend-account.sql | sed -e 's/(values (0))/(values (:s3_rid))/'`
select set_config('s3.out',pg_temp.s3_run(:'s3_script')::text,true);
select set_config('s3.out2',pg_temp.s3_run(:'s3_undo')::text,true);
select pg_temp.s3_check(current_setting('s3.out')::jsonb=jsonb_build_array(jsonb_build_object('roster_rows_disabled',0,'grants_revoked',0))
 and current_setting('s3.out2')::jsonb=jsonb_build_array(jsonb_build_object('roster_rows_enabled',0,'grants_restored',0))
 and not private.user_eligible(pg_temp.e7('13'))
 and (select revoked_at from private.beta_access where user_id=pg_temp.e7('13'))=now()-interval '30 days',
 'D3: the undo lifted 13''s earlier ban: '||current_setting('s3.out')||' '||current_setting('s3.out2'));
select pg_temp.s3_report_about(pg_temp.e7('03'),pg_temp.e7('07'),pg_temp.e7p('01')) as s3_rid \gset
\set s3_script `sed -e 's/(values (0))/(values (:s3_rid))/' :'resbite_repo'/supabase/ops/suspend-account.sql`
\set s3_undo `sed -n -e '/^-- To undo it/,$ s/^--   //p' :'resbite_repo'/supabase/ops/suspend-account.sql | sed -e 's/(values (0))/(values (:s3_rid))/'`
select set_config('s3.out',pg_temp.s3_run(:'s3_script')::text,true);
select pg_temp.s3_check(current_setting('s3.out')::jsonb=jsonb_build_array(jsonb_build_object('roster_rows_disabled',1,'grants_revoked',0))
 and not private.user_eligible(pg_temp.e7('07')),'D3: the suspension of 07: '||current_setting('s3.out'));
select set_config('s3.out',pg_temp.s3_run(:'s3_undo')::text,true);
select pg_temp.s3_check(current_setting('s3.out')::jsonb=jsonb_build_array(jsonb_build_object('roster_rows_enabled',1,'grants_restored',0))
 and private.user_eligible(pg_temp.e7('07'))
 and (select revoked_at from private.beta_access where user_id=pg_temp.e7('07'))=now()-interval '30 days',
 'D3: the undo did not put back only 07''s roster row: '||current_setting('s3.out'));
rollback to savepoint s3_undo;

-- close-report.sql records the action on 05's report of the removed words: ('actioned', 'both', 'Removed and
-- suspended'), with the time; 07 still has a profile, so who it was about stays.
select pg_temp.s3_id('rgroup') as s3_rid \gset
\set s3_script `sed -e "s/^ (0, 'reviewed', 'none', 'No action needed')/ (:s3_rid, 'actioned', 'both', 'Removed and suspended')/" :'resbite_repo'/supabase/ops/close-report.sql`
select set_config('s3.out',pg_temp.s3_run(:'s3_script')::text,true);
select pg_temp.s3_check((select (status,action,review_note,reviewed_at,target_user_id,frozen_author) from private.reports where id=pg_temp.s3_id('rgroup'))
 =('actioned'::text,'both'::text,'Removed and suspended'::text,now(),pg_temp.e7('07'),pg_temp.e7('07')),'close-report.sql on the removed words: '||current_setting('s3.out'));

-- purge-closed-reports.sql (I11, R-Q3), in a savepoint: 05's first report about 04 closed 181 days ago goes; the report
-- of the removed words, closed 179 days ago, and the open ones stay, 05's new open report about 16 with its target;
-- 03's report about 16, closed, whose profile is then deleted by hand, stays with no target and no frozen author. It
-- prints 1 and 1. open-reports.sql shows 2 due before, none after.
savepoint s3_purge;
set local role authenticated;
select pg_temp.s3_as(pg_temp.e7('05'));
select public.report_user(pg_temp.e7('16'),pg_temp.e7p('01'),'spam',null);
reset role;
select set_config('s3.ru16',pg_temp.s3_report_about(pg_temp.e7('05'),pg_temp.e7('16'),pg_temp.e7p('01'))::text,true);
update private.reports set reviewed_at=now()-interval '181 days' where id=pg_temp.s3_id('ru1');
update private.reports set reviewed_at=now()-interval '179 days' where id=pg_temp.s3_id('rgroup');
update private.reports set status='reviewed',action='none',reviewed_at=now() where id=pg_temp.s3_id('r16');
delete from public.attendees where user_id=pg_temp.e7('16');
delete from public.profiles where id=pg_temp.e7('16');
\set s3_open `cat :'resbite_repo'/supabase/ops/open-reports.sql`
select pg_temp.s3_check((select e.value->>'details' from jsonb_array_elements(pg_temp.s3_run_read_only(:'s3_open')) e where e.value->>'item'='due') ~ '^2 ',
 'open-reports.sql does not show 2 due');
\set s3_script `cat :'resbite_repo'/supabase/ops/purge-closed-reports.sql`
select set_config('s3.out',pg_temp.s3_run(:'s3_script')::text,true);
select pg_temp.s3_check(current_setting('s3.out')::jsonb=jsonb_build_array(jsonb_build_object('deleted',1,'cleared',1))
 and not exists(select 1 from private.reports where id=pg_temp.s3_id('ru1'))
 and exists(select 1 from private.reports where id=pg_temp.s3_id('rgroup')) and exists(select 1 from private.reports where id=pg_temp.s3_id('r1') and status='open')
 and (select (target_user_id,frozen_author,frozen_body) from private.reports where id=pg_temp.s3_id('r16')) is not distinct from (null::uuid,null::uuid,'Gil here'::text)
 and (select (status,target_user_id) from private.reports where id=pg_temp.s3_id('ru16'))=('open'::text,pg_temp.e7('16')),
 'purge-closed-reports.sql: '||current_setting('s3.out'));
select pg_temp.s3_check(not exists(select 1 from jsonb_array_elements(pg_temp.s3_run_read_only(:'s3_open')) e where e.value->>'item'='due'),
 'open-reports.sql still shows reports due after the purge');
rollback to savepoint s3_purge;

-- moderators.sql with one email: one row; with an email no account holds besides: still one, and that email listed.
-- blocked-terms.sql with two terms (three written, one twice in another case and with blanks round it, one with a
-- no-break space between its words): two rows, the no-break space a plain one, and it prints 2, never a term. With the repository's empty list: none, and it prints 0.
\set s3_script `sed -e "s/array\[\]::text\[\]/array['S3-17@resbite-test.invalid ']::text[]/" :'resbite_repo'/supabase/ops/moderators.sql`
select set_config('s3.out',pg_temp.s3_run(:'s3_script')::text,true);
select pg_temp.s3_check(current_setting('s3.out')::jsonb=jsonb_build_array(jsonb_build_object('moderators',1,'no_account',jsonb_build_array()))
 and pg_temp.s3_who(array(select user_id from private.moderators))='17','moderators.sql with one email: '||current_setting('s3.out'));
\set s3_script `sed -e "s/array\[\]::text\[\]/array['s3-17@resbite-test.invalid','nobody@resbite-test.invalid']::text[]/" :'resbite_repo'/supabase/ops/moderators.sql`
select set_config('s3.out',pg_temp.s3_run(:'s3_script')::text,true);
select pg_temp.s3_check(current_setting('s3.out')::jsonb=jsonb_build_array(jsonb_build_object('moderators',1,'no_account',jsonb_build_array('nobody@resbite-test.invalid')))
 and pg_temp.s3_who(array(select user_id from private.moderators))='17','moderators.sql with an unknown email: '||current_setting('s3.out'));
\set s3_script `sed -e "s/array\[\]::text\[\]/array['ZZone ',' zz'||chr(160)||'two','zzone']::text[]/" :'resbite_repo'/supabase/ops/blocked-terms.sql`
select set_config('s3.out',pg_temp.s3_run(:'s3_script')::text,true);
select pg_temp.s3_check(current_setting('s3.out')::jsonb=jsonb_build_array(jsonb_build_object('terms',2))
 and (select string_agg(term,',' order by term collate "C") from private.blocked_terms)='zz two,zzone','blocked-terms.sql with two terms: '||current_setting('s3.out'));
\set s3_script `cat :'resbite_repo'/supabase/ops/blocked-terms.sql`
select set_config('s3.out',pg_temp.s3_run(:'s3_script')::text,true);
select pg_temp.s3_check(current_setting('s3.out')::jsonb=jsonb_build_array(jsonb_build_object('terms',0))
 and not exists(select 1 from private.blocked_terms),'blocked-terms.sql with the empty list: '||current_setting('s3.out'));
rollback;

-- Section 2 of the migration redefines three of section 1's bodies, chat_summary, send_message and
-- notification_recipient_eligible, each copied from section 1 with only Task 2's lines added (rules_accepted; the rules
-- and the blocked terms; report_filed in the kind list and the fourth branch). With those lines taken out, each copy
-- must read exactly as section 1's statement, so a later change to section 1 cannot be lost under a stale copy.
\set s3_migration `cat :'resbite_repo'/supabase/migrations/20261111160000_chat_safety.sql`
select pg_temp.s3_check(replace(pg_temp.s3_nth(:'s3_migration','create or replace function private.chat_summary(',2),$ins$
  'rules_accepted', exists (select 1 from private.chat_rules_acceptances r where r.user_id = v_uid and r.version = private.chat_rules_version()),$ins$,'')
 =pg_temp.s3_nth(:'s3_migration','create or replace function private.chat_summary(',1),
 'Section 2''s chat_summary is not section 1''s with rules_accepted');
select pg_temp.s3_check(replace(replace(pg_temp.s3_nth(:'s3_migration','create or replace function private.send_message(',2),$ins$
 -- The chat rules (G-B4(d), Decision 8): the current version accepted, else 22023 'Rules not accepted'.
 if not exists (select 1 from private.chat_rules_acceptances r where r.user_id = v_uid and r.version = private.chat_rules_version()) then
  raise exception 'Rules not accepted' using errcode='22023';
 end if;$ins$,''),$ins$
 -- The blocked terms (G-B4(a), challenge N4): a listed term as a whole word, in any case; a space in it is any run of
 -- the blanks chat_body trims (a line break, a no-break space and the others \s here misses; SR3's D1). chat_body has
 -- already refused a body over 16,000 bytes, so no term meets a huge one.
 if exists (select 1 from private.blocked_terms t
  where v_body ~* ('\m' || replace(t.term, ' ', '[\s\u0085\u00a0\u115f\u1680\u2000-\u200c\u2028\u2029\u202f\u205f\u2060\u2800\u3000\u3164\ufeff\uffa0]+') || '\M')) then
  raise exception 'Not allowed' using errcode='22023';
 end if;$ins$,'')
 =pg_temp.s3_nth(:'s3_migration','create or replace function private.send_message(',1),
 'Section 2''s send_message is not section 1''s with the rules and the blocked terms');
select pg_temp.s3_check(replace(replace(pg_temp.s3_nth(:'s3_migration','create or replace function private.notification_recipient_eligible(',2),
 $ins$'chat_message','announcement','report_filed')$ins$,$ins$'chat_message','announcement')$ins$),$ins$
 ) or exists (
 select 1 from private.notification_outbox o
 where o.id=p_outbox and o.kind='report_filed'
 and exists(select 1 from private.moderators m where m.user_id=o.recipient_id)
 and private.user_eligible(o.recipient_id) and not private.deletion_pending(o.recipient_id)
 and o.created_at>now()-interval '24 hours'$ins$,'')
 =pg_temp.s3_nth(:'s3_migration','create or replace function private.notification_recipient_eligible(',1),
 'Section 2''s notification_recipient_eligible is not section 1''s with report_filed');

-- The way back (Task 2; G-N11, challenge B2), rehearsed in a transaction that ends in rollback, in both modes (the
-- deletion's body only where the deletion lifecycle exists, in full mode; 20261111160000_chat_safety.after.sql also
-- compares each body with the one before the migration, on the hosted baseline). Seeded: a block, a report, a
-- moderator, an acceptance, a blocked term and a report_filed notice with a delivery. The rollback restores each of the
-- fourteen bodies the migration replaced: no longer the migration's, its grants as they were, and its source
-- migration's text exactly (running that text again, as create or replace, changes nothing). The five tables, the ten
-- functions and every report_filed notice go, and the kind check is chat core's thirteen kinds again. Then plan 2's
-- rollback, whose guard refuses while private.blocks exists, runs.
\set s3_core `cat :'resbite_repo'/supabase/migrations/20261111140000_chat_core.sql`
\set s3_groups `cat :'resbite_repo'/supabase/migrations/20261111150000_chat_groups.sql`
\set s3_connections `cat :'resbite_repo'/supabase/migrations/20261110120000_connections.sql`
\set s3_circles `cat :'resbite_repo'/supabase/migrations/20261111130000_circles_of_trust.sql`
\set s3_phone_key `cat :'resbite_repo'/supabase/migrations/20261030130000_phone_key.sql`
begin;
select pg_temp.e7_cast();
create temporary table s3_restores on commit drop as
 select x.signature, x.source, (select p.proacl::text from pg_catalog.pg_proc p where p.oid=x.signature::regprocedure) as grants,
  pg_catalog.pg_get_functiondef(x.signature::regprocedure) as migration_definition
 from (values
  ('private.chat_messages(uuid,bigint,integer)',pg_temp.s3_source(:'s3_core','create function private.chat_messages(','$$;')),
  ('private.chat_messages_since(uuid,bigint,timestamp with time zone)',pg_temp.s3_source(:'s3_core','create function private.chat_messages_since(','$$;')),
  ('private.send_message(uuid,text,uuid)',pg_temp.s3_source(:'s3_core','create function private.send_message(','$$;')),
  ('private.send_announcement(uuid,text,text,uuid)',pg_temp.s3_source(:'s3_core','create function private.send_announcement(','$$;')),
  ('public.claim_notification_deliveries(integer)',pg_temp.s3_source(:'s3_core','create or replace function public.claim_notification_deliveries(','$$;')),
  ('private.request_account_deletion(uuid,uuid,uuid,text)',pg_temp.s3_source(:'s3_core','create or replace function private.request_account_deletion(','$$;')),
  ('private.fold_web_account(uuid,uuid)',pg_temp.s3_source(:'s3_core','create or replace function private.fold_web_account(','$$;')),
  ('private.chat_summary(uuid)',pg_temp.s3_source(:'s3_groups','create or replace function private.chat_summary(','$$;')),
  ('private.request_connection(uuid,uuid)',pg_temp.s3_source(:'s3_groups','create or replace function private.request_connection(','$$;')),
  ('private.notification_recipient_eligible(bigint)',pg_temp.s3_source(:'s3_groups','create or replace function private.notification_recipient_eligible(','$$;')),
  ('private.my_chat_overview()',pg_temp.s3_source(:'s3_groups','create or replace function private.my_chat_overview(','$$;')),
  ('private.plan_connection_states(uuid)',pg_temp.s3_source(:'s3_connections','create function private.plan_connection_states(','$$;')),
  ('private.invite_contacts(uuid,jsonb)',pg_temp.s3_source(:'s3_circles','create or replace function private.invite_contacts(','$$;')),
  ('private.contacts_on_resbite(text[])',pg_temp.s3_source(:'s3_phone_key','create or replace function private.contacts_on_resbite(','$$;'))) x(signature,source)
 where pg_catalog.to_regprocedure(x.signature) is not null;
select pg_temp.s3_check((select count(*) from s3_restores where source like 'create or replace function %' and grants is not null)
 =case when pg_catalog.to_regprocedure('private.request_account_deletion(uuid,uuid,uuid,text)') is null then 13 else 14 end,
 'A body to restore, or its source, is missing');
insert into private.blocks(blocker_id,blocked_id) values (pg_temp.e7('03'),pg_temp.e7('04'));
insert into private.reports(reporter_id,target_user_id,series_id,plan_id,about,reason) values
 (pg_temp.e7('03'),pg_temp.e7('04'),pg_temp.e7p('01'),pg_temp.e7p('01'),'user','spam');
insert into private.moderators(user_id) values (pg_temp.e7('09'));
insert into private.chat_rules_acceptances(user_id,version) values (pg_temp.e7('03'),private.chat_rules_version());
insert into private.blocked_terms(term) values ('zzbadword');
insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key) values (pg_temp.e7p('01'),pg_temp.e7('09'),'report_filed','s3:wayback');
insert into private.notification_deliveries(outbox_id,token,endpoint_updated_at)
 select id,'ExpoPushToken[s3wayback]',now() from private.notification_outbox where dedupe_key='s3:wayback';
\ir ../rollback/20261111160000_chat_safety.rollback.sql
do $$ declare f record; v_def text; begin
 for f in select * from s3_restores loop
  v_def := pg_catalog.pg_get_functiondef(f.signature::regprocedure);
  perform pg_temp.s3_check(v_def is distinct from f.migration_definition,'The rollback left the migration''s body of '||f.signature);
  perform pg_temp.s3_check((select p.proacl::text from pg_catalog.pg_proc p where p.oid=f.signature::regprocedure) is not distinct from f.grants,
   'The rollback changed the grants of '||f.signature);
  execute f.source;
  perform pg_temp.s3_check(pg_catalog.pg_get_functiondef(f.signature::regprocedure)=v_def,'The rollback did not restore '||f.signature||' as its source has it');
 end loop;
 perform pg_temp.s3_check(pg_catalog.to_regclass('private.blocks') is null and pg_catalog.to_regclass('private.reports') is null
  and pg_catalog.to_regclass('private.moderators') is null and pg_catalog.to_regclass('private.chat_rules_acceptances') is null
  and pg_catalog.to_regclass('private.blocked_terms') is null,'The rollback left a table');
 perform pg_temp.s3_check(not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
   where n.nspname in ('public','private') and p.proname in ('block_user','my_blocks','report_message','report_user','accept_chat_rules',
    'chat_rules_version','report_keep_days','invited_by','inviter_of')),'The rollback left a function');
 perform pg_temp.s3_check(not exists(select 1 from private.notification_outbox where kind='report_filed')
  and not exists(select 1 from private.notification_deliveries where token='ExpoPushToken[s3wayback]'),'The rollback left a report_filed notice');
 perform pg_temp.s3_check((select pg_catalog.pg_get_constraintdef(oid) from pg_catalog.pg_constraint where conname='notification_outbox_kind_check'
   and conrelid='private.notification_outbox'::regclass)=
  'CHECK ((kind = ANY (ARRAY[''invitation''::text, ''rsvp''::text, ''plan_changed''::text, ''plan_cancelled''::text, ''guest_note''::text, ''invited''::text, '
  '''join_request''::text, ''join_approved''::text, ''admin_added''::text, ''connection_request''::text, ''connection_accepted''::text, '
  '''chat_message''::text, ''announcement''::text])))','The rollback did not restore chat core''s kind check');
end $$;
\ir ../rollback/20261111150000_chat_groups.rollback.sql
select pg_temp.s3_check(pg_catalog.to_regclass('private.series_leaves') is null,'Plan 2''s rollback did not run after this one');
rollback;
