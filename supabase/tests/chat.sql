-- Chat (docs/superpowers/plans/2026-11-11-chat-1-core.md, Tasks 1 to 3; docs/superpowers/specs/2026-11-10-groups-and-chat-design.md,
-- CH-P1, CH-P2, CH-P5, CH-P14, CH-P15 and the Data section): a chat per series, who is in it, when it closes and the reads
-- (slice 1); writing, announcements and the notices (slice 2); Resbite's own lines and the live signal (slice 3); an
-- account's deletion (the last block). Synthetic identities only: emails chat1-…@resbite-test.invalid, ids with the
-- prefixes c1, c3 and c5, no phone numbers.
--
-- Three transactions, each begin … rollback (NOTE 12). Slices 1 and 2 share the c1 cast, slice 3 has c3, and the deletion
-- block has c5. The prefixes c1 and c3 are also used by phone-accounts.sql and plan-covers.sql, which is harmless only
-- because every transaction rolls back.
-- Times moved by hand sit between set_config('resbite.system','roll',true) and set_config('resbite.system','',true), so no
-- change line skews a later count (K-N2). The setting is transaction-local: without the reset it would last until the
-- rollback and silence every later line (NOTE 12). An assertion that closes the c1 one-off moves its times back afterwards,
-- the same way, so later sends still work. The cast's guest rows, and the answer set by hand after the roll, sit between
-- the same two calls: they are the cast, not answers, so they write no line.
-- Rows inserted by hand into public.messages are dated an hour back (created_at and updated_at), so slice 2's rate limit
-- and a changed-since cursor skip them, unless a check says otherwise.
--
-- The c1 cast (pg_temp.c1_cast() and the start of the first transaction). Users c1…: 01 'Ana Host', the owner of both
-- resbites; 02 'Ada Admin', an admin of both, Going on both; 03 'Mia Going', Going on both; 04 'Leo Maybe', Maybe on the
-- one-off; 05 'Sol Pending', not answered, on both; 06 'Tom Declined', Can't go on the one-off; 07 'Eva Withdrawn', Can't
-- go after Going on the one-off; 08 'Max Stranger', on neither; 09 'Del Leaving', on neither, whose account is being
-- deleted (deletion_requested_at set). c1…99 has no account and no profile. 01 to 07 have used the app, so the roll
-- carries them. Plans c11…, both made with create_plan_v4 as 01: 01 'Board game night', a one-off, tomorrow for three
-- hours (pg_temp.c1_start()); 02 'Thursday run', weekly, a day later for an hour. Slice 1 rolls 02 to its next occurrence.

-- Helpers, for this file's session only (temporary: gone with it).
create function pg_temp.c1(p text) returns uuid language sql immutable as $$ select ('c1000000-0000-4000-8000-0000000000'||p)::uuid $$;
create function pg_temp.c1p(p text) returns uuid language sql immutable as $$ select ('c1100000-0000-4000-8000-0000000000'||p)::uuid $$;
-- The one-off's start: tomorrow, on the minute. now() is the transaction's start, so this is fixed within a transaction.
create function pg_temp.c1_start() returns timestamptz language sql stable as $$ select date_trunc('minute',now())+interval '1 day' $$;
-- Acting as someone: the claims auth.uid() reads (the role is set apart, with set local role).
create function pg_temp.ch_as(p_user uuid) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role','authenticated')::text,true)
$$;
create function pg_temp.ch_check(p_ok boolean, p_what text) returns void language plpgsql as $$
begin
 if p_ok is not true then raise exception '%', p_what; end if;
end $$;
-- A call that must be refused with exactly this code and message. The refusal undoes the call, as a real one would.
create function pg_temp.ch_refused(p_sql text, p_state text, p_message text) returns void language plpgsql as $$
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
-- A read's rows as their ids, in order: '12,13,14' ('' for none).
create function pg_temp.ch_ids(p jsonb) returns text language sql immutable as $$
 select coalesce(string_agg(e.value->>'id',',' order by e.ordinality),'') from jsonb_array_elements(p->'rows') with ordinality e
$$;
-- The ids a page should hold, as ch_ids writes them: the newest p_limit messages of a series before p_before (none: the
-- newest), in ascending order. The superuser's: it reads public.messages.
create function pg_temp.ch_newest(p_series uuid, p_before bigint, p_limit integer) returns text language plpgsql stable as $$
begin
 return (select coalesce(string_agg(x.id::text,',' order by x.id),'') from (select m.id from public.messages m where m.series_id=p_series
  and (p_before is null or m.id<p_before) order by m.id desc limit p_limit) x);
end $$;
-- People as their two-digit numbers, sorted: '01,02,03' ('' for nobody).
create function pg_temp.ch_who(p uuid[]) returns text language sql immutable as $$
 select coalesce(string_agg(right(u::text,2),',' order by u),'') from unnest(p) u
$$;
-- An object's keys, sorted: 'a,b,c'.
create function pg_temp.ch_keys(p jsonb) returns text language sql immutable as $$
 select coalesce(string_agg(k,',' order by k),'') from jsonb_object_keys(p) k
$$;
-- The caller's unread flag for a series, as chat_summary and my_chat_overview give it: 'false/false' ('absent' when the
-- overview has no entry for the series).
create function pg_temp.ch_unread(p_series uuid) returns text language plpgsql as $$
begin
 return (public.chat_summary(p_series)->>'unread')||'/'||coalesce(public.my_chat_overview()->'chats'->(p_series::text)->>'unread','absent');
end $$;
-- The c1 cast's accounts (see the header); the plans and guest rows are made at the start of the first transaction.
create function pg_temp.c1_cast() returns void language sql as $cast$
insert into auth.users(id,email,email_confirmed_at)
 select pg_temp.c1(n),'chat1-'||n||'@resbite-test.invalid',now() from unnest(array['01','02','03','04','05','06','07','08','09']) n;
insert into private.tester_roster(email)
 select 'chat1-'||n||'@resbite-test.invalid' from unnest(array['01','02','03','04','05','06','07','08']) n;
insert into public.profiles(id,display_name,deletion_requested_at) values
 (pg_temp.c1('01'),'Ana Host',null),(pg_temp.c1('02'),'Ada Admin',null),(pg_temp.c1('03'),'Mia Going',null),
 (pg_temp.c1('04'),'Leo Maybe',null),(pg_temp.c1('05'),'Sol Pending',null),(pg_temp.c1('06'),'Tom Declined',null),
 (pg_temp.c1('07'),'Eva Withdrawn',null),(pg_temp.c1('08'),'Max Stranger',null),(pg_temp.c1('09'),'Del Leaving',now());
insert into private.app_sessions(user_id) select pg_temp.c1(n) from unnest(array['01','02','03','04','05','06','07']) n;
$cast$;

-- Slice 1 (Task 1): a chat per series, who is in it, when it closes, and the reads.
begin;
select pg_temp.c1_cast();
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('01'));
select public.create_plan_v4(pg_temp.c1p('01'),'Board game night','',array['community'],null,pg_temp.c1_start(),
 pg_temp.c1_start()+interval '3 hours','Europe/London','Ana''s flat',false,null::smallint);
select public.create_plan_v4(pg_temp.c1p('02'),'Thursday run','',array['physical'],null,pg_temp.c1_start()+interval '1 day',
 pg_temp.c1_start()+interval '1 day 1 hour','Europe/London','The park',false,1::smallint);
reset role;
select set_config('resbite.system','roll',true);
insert into public.attendees(plan_id,user_id,response) values
 (pg_temp.c1p('01'),pg_temp.c1('02'),'accepted'),(pg_temp.c1p('01'),pg_temp.c1('03'),'accepted'),
 (pg_temp.c1p('01'),pg_temp.c1('04'),'maybe'),(pg_temp.c1p('01'),pg_temp.c1('05'),'pending'),
 (pg_temp.c1p('01'),pg_temp.c1('06'),'declined'),(pg_temp.c1p('01'),pg_temp.c1('07'),'withdrawn'),
 (pg_temp.c1p('02'),pg_temp.c1('02'),'accepted'),(pg_temp.c1p('02'),pg_temp.c1('03'),'accepted'),
 (pg_temp.c1p('02'),pg_temp.c1('05'),'pending');
insert into public.plan_admins(plan_id,user_id,appointed_by) values
 (pg_temp.c1p('01'),pg_temp.c1('02'),pg_temp.c1('01')),(pg_temp.c1p('02'),pg_temp.c1('02'),pg_temp.c1('01'));
select set_config('resbite.system','',true);

-- A chats row for each plan's series once create_plan_v4 has made it, starting empty. Nothing in plan 1 makes a chat a
-- group: every chats row, backfilled or new, has is_group false, and chat_is_group reads that column (CH-R-A6).
do $$ begin
 perform pg_temp.ch_check((select count(*) from public.chats where series_id in (pg_temp.c1p('01'),pg_temp.c1p('02')))=2,
  'create_plan_v4 did not give each series its chat row');
 perform pg_temp.ch_check((select (c.is_group,c.last_message_id,c.last_message_at,c.pinned_message_id,c.message_count)
   from public.chats c where c.series_id=pg_temp.c1p('01'))
   is not distinct from (false,null::bigint,null::timestamptz,null::bigint,0),'A new chat row does not start empty and not a group');
 perform pg_temp.ch_check(not exists(select 1 from public.chats where is_group),'A chat row is a group in plan 1');
 perform pg_temp.ch_check(not private.chat_is_group(pg_temp.c1p('01')) and not private.chat_is_group(pg_temp.c1p('02'))
  and not private.chat_is_group(gen_random_uuid()),'chat_is_group is true in plan 1');
end $$;

-- Who is in the one-off's chat (CH-P2): the owner, the admin, and the people Going or Maybe; not the people who have not
-- answered or said Can't go, a stranger, an account being deleted, nobody. A series that does not exist has no chat.
do $$ declare n text; begin
 foreach n in array array['01','02','03','04'] loop
  perform pg_temp.ch_check(private.chat_member(pg_temp.c1p('01'),pg_temp.c1(n)),n||' is not in the one-off''s chat');
 end loop;
 foreach n in array array['05','06','07','08','09','99'] loop
  perform pg_temp.ch_check(not private.chat_member(pg_temp.c1p('01'),pg_temp.c1(n)),n||' is in the one-off''s chat');
 end loop;
 perform pg_temp.ch_check(not private.chat_member(pg_temp.c1p('01'),null),'Nobody is in the one-off''s chat');
 perform pg_temp.ch_check(pg_temp.ch_who(array(select private.chat_members(pg_temp.c1p('01'))))='01,02,03,04',
  'chat_members of the one-off: '||pg_temp.ch_who(array(select private.chat_members(pg_temp.c1p('01')))));
 perform pg_temp.ch_check((private.current_occurrence(pg_temp.c1p('01'))).id=pg_temp.c1p('01'),
  'The one-off is not its own current occurrence');
 perform pg_temp.ch_check(not private.chat_member(gen_random_uuid(),pg_temp.c1('01'))
  and not exists(select 1 from private.chat_members(gen_random_uuid()))
  and (private.current_occurrence(gen_random_uuid())).id is null
  and private.chat_closes_at(gen_random_uuid()) is null and private.chat_open(gen_random_uuid()) is false,
  'A series that does not exist has a chat');
end $$;

-- The announcement audiences (SHOULD 1), built from chat_members: Going is the members who are a host or Going or Maybe
-- ("Going"); Everyone adds the people who have not answered, on a chat that is not a group ("Everyone invited"). With
-- is_group set by hand, Everyone is the members only, the not-answered 05 left out; it is set back at once.
do $$ begin
 perform pg_temp.ch_check(pg_temp.ch_who(array(select private.announcement_audience(pg_temp.c1p('01'),'going')))='01,02,03,04',
  'Going on the one-off: '||pg_temp.ch_who(array(select private.announcement_audience(pg_temp.c1p('01'),'going'))));
 perform pg_temp.ch_check(pg_temp.ch_who(array(select private.announcement_audience(pg_temp.c1p('01'),'everyone')))='01,02,03,04,05',
  'Everyone on the one-off: '||pg_temp.ch_who(array(select private.announcement_audience(pg_temp.c1p('01'),'everyone'))));
 perform pg_temp.ch_check(not exists(select 1 from private.announcement_audience(pg_temp.c1p('01'),'all')),
  'An unknown audience has people');
 update public.chats set is_group=true where series_id=pg_temp.c1p('01');
 perform pg_temp.ch_check(private.chat_is_group(pg_temp.c1p('01')),'chat_is_group does not read chats.is_group');
 perform pg_temp.ch_check(pg_temp.ch_who(array(select private.announcement_audience(pg_temp.c1p('01'),'everyone')))='01,02,03,04',
  'Everyone on a group: '||pg_temp.ch_who(array(select private.announcement_audience(pg_temp.c1p('01'),'everyone'))));
 perform pg_temp.ch_check(pg_temp.ch_who(array(select private.announcement_audience(pg_temp.c1p('01'),'going')))='01,02,03,04',
  'Going on a group: '||pg_temp.ch_who(array(select private.announcement_audience(pg_temp.c1p('01'),'going'))));
 update public.chats set is_group=false where series_id=pg_temp.c1p('01');
 perform pg_temp.ch_check(not private.chat_is_group(pg_temp.c1p('01')),'The one-off is still a group');
end $$;

-- chat_summary (K-N2, K-N7), as a signed-in 03: the one-off's header (accepted: 02 and 03 are Going), the people in it
-- (4), the sheet's counts (Going 4, Everyone 5), not a host, open, closing at the end + 48 hours, nothing written yet.
-- As 02, the admin, and 01, the owner: a host. As 05 (not answered), 08 and 07 (Can't go after Going): 42501 'Not in
-- this chat'.
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('03'));
do $$ declare s jsonb := public.chat_summary(pg_temp.c1p('01')); begin
 perform pg_temp.ch_check(pg_temp.ch_keys(s)='accepted,closes_at,ends_at,everyone,going,host,is_group,last,last_read_id,members,'
  'message_count,muted_chat,muted_resbite,names,open,pinned,plan_id,repeat_weeks,series_id,starts_at,status,stopped,time_zone,title,unread',
  'chat_summary''s keys: '||pg_temp.ch_keys(s));
 perform pg_temp.ch_check(s @> jsonb_build_object('series_id',pg_temp.c1p('01'),'plan_id',pg_temp.c1p('01'),'title','Board game night',
  'time_zone','Europe/London','status','active','repeat_weeks',null,'is_group',false,'stopped',false,'open',true,'host',false,
  'accepted',2,'members',4,'going',4,'everyone',5,'pinned',null,'last',null,'muted_chat',false,'muted_resbite',false,
  'last_read_id',0,'unread',false,'message_count',0),'chat_summary as 03: '||s::text);
 perform pg_temp.ch_check(s->'names'='{}'::jsonb and (s->>'starts_at')::timestamptz=pg_temp.c1_start()
  and (s->>'ends_at')::timestamptz=pg_temp.c1_start()+interval '3 hours'
  and (s->>'closes_at')::timestamptz=pg_temp.c1_start()+interval '51 hours','chat_summary''s times or names: '||s::text);
end $$;
select pg_temp.ch_as(pg_temp.c1('02'));
select pg_temp.ch_check(public.chat_summary(pg_temp.c1p('01'))@>'{"host":true}','02, an admin, is not a host in the summary');
select pg_temp.ch_as(pg_temp.c1('01'));
select pg_temp.ch_check(public.chat_summary(pg_temp.c1p('01'))@>'{"host":true}','01, the owner, is not a host in the summary');
select pg_temp.ch_as(pg_temp.c1('05'));
select pg_temp.ch_refused($$select public.chat_summary(pg_temp.c1p('01'))$$,'42501','Not in this chat');
select pg_temp.ch_as(pg_temp.c1('08'));
select pg_temp.ch_refused($$select public.chat_summary(pg_temp.c1p('01'))$$,'42501','Not in this chat');
select pg_temp.ch_as(pg_temp.c1('07'));
select pg_temp.ch_refused($$select public.chat_summary(pg_temp.c1p('01'))$$,'42501','Not in this chat');
reset role;

-- The caller's two mutes (the chat's and the resbite's) are in their summary, and nobody else's are; both go again.
insert into public.chat_mutes(series_id,user_id) values (pg_temp.c1p('01'),pg_temp.c1('03'));
insert into public.plan_mutes(series_id,user_id) values (pg_temp.c1p('01'),pg_temp.c1('03'));
do $$ begin
 perform pg_temp.ch_as(pg_temp.c1('03'));
 perform pg_temp.ch_check(public.chat_summary(pg_temp.c1p('01'))@>'{"muted_chat":true,"muted_resbite":true}','03''s mutes are not in the summary');
 perform pg_temp.ch_as(pg_temp.c1('04'));
 perform pg_temp.ch_check(public.chat_summary(pg_temp.c1p('01'))@>'{"muted_chat":false,"muted_resbite":false}','03''s mutes show to 04');
end $$;
delete from public.chat_mutes where user_id=pg_temp.c1('03');
delete from public.plan_mutes where user_id=pg_temp.c1('03');

-- Closing (CH-P15): the end + 48 hours. Open at the end + 47 h 59 min, closed at the end + 48 h 01 min, though everyone is
-- still in it; with no end, the start is the end; cancelled, no close time and closed at once (CH-R-A2). The times and
-- the status go back afterwards.
do $$ begin
 perform pg_temp.ch_check(private.chat_closes_at(pg_temp.c1p('01'))=pg_temp.c1_start()+interval '51 hours'
  and private.chat_open(pg_temp.c1p('01')),'The one-off''s chat does not close 48 hours after its end, or is closed');
end $$;
select set_config('resbite.system','roll',true);
update public.plans set starts_at=now()-interval '50 hours 59 minutes',ends_at=now()-interval '47 hours 59 minutes' where id=pg_temp.c1p('01');
select set_config('resbite.system','',true);
do $$ begin
 perform pg_temp.ch_check(private.chat_open(pg_temp.c1p('01')) and private.chat_closes_at(pg_temp.c1p('01'))=now()+interval '1 minute',
  'The chat is closed at the end + 47 h 59 min');
end $$;
select set_config('resbite.system','roll',true);
update public.plans set starts_at=now()-interval '51 hours 1 minute',ends_at=now()-interval '48 hours 1 minute' where id=pg_temp.c1p('01');
select set_config('resbite.system','',true);
do $$ begin
 perform pg_temp.ch_check(private.chat_open(pg_temp.c1p('01')) is false,'The chat is open at the end + 48 h 01 min');
 perform pg_temp.ch_check(private.chat_member(pg_temp.c1p('01'),pg_temp.c1('03')),'The close changed who is in the chat');
 perform pg_temp.ch_as(pg_temp.c1('03'));
 perform pg_temp.ch_check(public.chat_summary(pg_temp.c1p('01'))@>'{"open":false}','The summary of a closed chat says open');
end $$;
select set_config('resbite.system','roll',true);
update public.plans set starts_at=pg_temp.c1_start(),ends_at=null where id=pg_temp.c1p('01');
select set_config('resbite.system','',true);
do $$ begin
 perform pg_temp.ch_check(private.chat_closes_at(pg_temp.c1p('01'))=pg_temp.c1_start()+interval '48 hours',
  'With no end, the chat does not close 48 hours after the start');
end $$;
select set_config('resbite.system','roll',true);
update public.plans set ends_at=pg_temp.c1_start()+interval '3 hours',status='cancelled' where id=pg_temp.c1p('01');
select set_config('resbite.system','',true);
do $$ begin
 perform pg_temp.ch_check(private.chat_closes_at(pg_temp.c1p('01')) is null and private.chat_open(pg_temp.c1p('01')) is false,
  'A cancelled one-off''s chat has a close time, or is open');
 perform pg_temp.ch_as(pg_temp.c1('03'));
 perform pg_temp.ch_check(public.chat_summary(pg_temp.c1p('01'))@>'{"closes_at":null,"open":false,"status":"cancelled"}',
  'The summary of a cancelled one-off');
end $$;
select set_config('resbite.system','roll',true);
update public.plans set status='active' where id=pg_temp.c1p('01');
select set_config('resbite.system','',true);
select pg_temp.ch_check(private.chat_open(pg_temp.c1p('01')),'The one-off''s chat did not open again');

-- A weekly series (Decision 4: one-off rules on its current occurrence until plan 2). Before the roll: 01, 02 and 03 are
-- in, 05 (not answered) is not. The roll makes the next occurrence in the same series, with no second chats row; it
-- becomes the current occurrence, and membership follows it: everyone carried is not answered again, so only the
-- hosts are in (02 is carried as an admin) until 03 answers Going there. The close follows it too.
do $$ begin
 perform pg_temp.ch_check(pg_temp.ch_who(array(select private.chat_members(pg_temp.c1p('02'))))='01,02,03',
  'chat_members of the weekly series before the roll: '||pg_temp.ch_who(array(select private.chat_members(pg_temp.c1p('02')))));
end $$;
select set_config('resbite.system','roll',true);
update public.plans set starts_at=now()-interval '3 hours',ends_at=now()-interval '2 hours' where id=pg_temp.c1p('02');
select pg_temp.ch_check(private.roll_repeating_plans()>=1,'The roll made no occurrence');
select set_config('resbite.system','',true);
do $$ declare v_next public.plans; begin
 select * into v_next from public.plans where repeats_from=pg_temp.c1p('02');
 perform pg_temp.ch_check(v_next.id is not null and v_next.series_id=pg_temp.c1p('02'),'The roll did not make the next occurrence');
 perform pg_temp.ch_check((select count(*) from public.chats where series_id=pg_temp.c1p('02'))=1
  and not exists(select 1 from public.chats where series_id=v_next.id),'The roll made a second chats row');
 perform pg_temp.ch_check((private.current_occurrence(pg_temp.c1p('02'))).id=v_next.id,'The rolled occurrence is not the current one');
 perform pg_temp.ch_check(private.chat_closes_at(pg_temp.c1p('02'))=v_next.ends_at+interval '48 hours'
  and private.chat_open(pg_temp.c1p('02')),'The weekly chat''s close does not follow the rolled occurrence');
 perform pg_temp.ch_check(pg_temp.ch_who(array(select private.chat_members(pg_temp.c1p('02'))))='01,02',
  'chat_members after the roll: '||pg_temp.ch_who(array(select private.chat_members(pg_temp.c1p('02')))));
 perform pg_temp.ch_check(not private.chat_is_group(pg_temp.c1p('02')) and not exists(select 1 from public.chats where is_group),
  'The roll made a group');
end $$;
select set_config('resbite.system','roll',true);
update public.attendees set response='accepted'
 where plan_id=(select id from public.plans where repeats_from=pg_temp.c1p('02')) and user_id=pg_temp.c1('03');
select set_config('resbite.system','',true);
do $$ begin
 perform pg_temp.ch_check(pg_temp.ch_who(array(select private.chat_members(pg_temp.c1p('02'))))='01,02,03',
  'chat_members once 03 is Going on the rolled occurrence: '||pg_temp.ch_who(array(select private.chat_members(pg_temp.c1p('02')))));
 perform pg_temp.ch_as(pg_temp.c1('03'));
 perform pg_temp.ch_check((public.chat_summary(pg_temp.c1p('02'))->>'plan_id')::uuid=(select id from public.plans where repeats_from=pg_temp.c1p('02'))
  and public.chat_summary(pg_temp.c1p('02'))@>jsonb_build_object('series_id',pg_temp.c1p('02'),'repeat_weeks',1,'is_group',false),
  'The weekly chat''s summary is not about the rolled occurrence');
end $$;

-- The reads (K-B1, K-B2, K-N10). 120 messages by 03 and 04 in turn, each with a client id; then three system lines
-- (author null, K-B2): one names 09, whose account is being deleted; one names c1…99, which has no profile; and a
-- `changed` line whose place label, free text, is 08's uuid (H22: only the person keys are looked up).
insert into public.messages(series_id,plan_id,author_id,kind,body,client_id,created_at,updated_at)
 select pg_temp.c1p('01'),pg_temp.c1p('01'),pg_temp.c1(case when g%2=0 then '03' else '04' end),'message','Message '||g,
  gen_random_uuid(),now()-interval '1 hour'+g*interval '1 second',now()-interval '1 hour'+g*interval '1 second'
 from generate_series(1,120) g order by g;
insert into public.messages(series_id,plan_id,kind,event,payload,created_at,updated_at) values
 (pg_temp.c1p('01'),pg_temp.c1p('01'),'system','joined',jsonb_build_object('actor',null,'user',pg_temp.c1('09')),
  now()-interval '58 minutes',now()-interval '58 minutes'),
 (pg_temp.c1p('01'),pg_temp.c1p('01'),'system','admin',jsonb_build_object('actor',pg_temp.c1('01'),'user',pg_temp.c1('99')),
  now()-interval '58 minutes',now()-interval '58 minutes'),
 (pg_temp.c1p('01'),pg_temp.c1p('01'),'system','changed',jsonb_build_object('actor',null,'what','place','place_label',pg_temp.c1('08')),
  now()-interval '58 minutes',now()-interval '58 minutes');

-- As a signed-in 03: chat_messages gives {rows, names, as_of}, the newest 50 in id order; chat_messages_since gives every
-- row after an id. As 08 (a stranger), 05 (not answered) and 07 (Can't go after Going): 42501 'Not in this chat', for
-- both reads.
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('03'));
select pg_temp.ch_check(pg_temp.ch_keys(public.chat_messages(pg_temp.c1p('01')))='as_of,names,rows'
 and jsonb_array_length(public.chat_messages(pg_temp.c1p('01'))->'rows')=50,'chat_messages as 03 is not a page of 50');
select pg_temp.ch_check(pg_temp.ch_keys(public.chat_messages_since(pg_temp.c1p('01'),0,null))='as_of,names,rows'
 and jsonb_array_length(public.chat_messages_since(pg_temp.c1p('01'),0,null)->'rows')=123,'chat_messages_since as 03 is not every row');
select pg_temp.ch_as(pg_temp.c1('08'));
select pg_temp.ch_refused($$select public.chat_messages(pg_temp.c1p('01'))$$,'42501','Not in this chat');
select pg_temp.ch_refused($$select public.chat_messages_since(pg_temp.c1p('01'),0,null)$$,'42501','Not in this chat');
select pg_temp.ch_as(pg_temp.c1('05'));
select pg_temp.ch_refused($$select public.chat_messages(pg_temp.c1p('01'),null,10)$$,'42501','Not in this chat');
select pg_temp.ch_refused($$select public.chat_messages_since(pg_temp.c1p('01'),0,now())$$,'42501','Not in this chat');
select pg_temp.ch_as(pg_temp.c1('07'));
select pg_temp.ch_refused($$select public.chat_messages(pg_temp.c1p('01'))$$,'42501','Not in this chat');
select pg_temp.ch_refused($$select public.chat_messages_since(pg_temp.c1p('01'),0,null)$$,'42501','Not in this chat');
reset role;

-- The page's rows and names. names maps each author and each person in a payload (actor, user, brought_by: H22) to a
-- first name: 03 'Mia', 04 'Leo', 01 'Ana' (an actor); 09, being deleted, and c1…99, with no profile, to null (the app
-- shows "Someone"). The `changed` line maps nothing: its place label is free text, though it holds 08's uuid. Every row
-- has the plan's shape; client_id is there only on the viewer's own rows, and is the one stored.
do $$ declare r jsonb; v_row jsonb; m public.messages; begin
 perform pg_temp.ch_as(pg_temp.c1('03'));
 r := public.chat_messages(pg_temp.c1p('01'));
 perform pg_temp.ch_check(pg_temp.ch_ids(r)=pg_temp.ch_newest(pg_temp.c1p('01'),null,50),'chat_messages is not the newest 50 in order');
 perform pg_temp.ch_check((r->>'as_of')::timestamptz=now(),'as_of is not now()');
 perform pg_temp.ch_check(r->'names'=jsonb_build_object(pg_temp.c1('01')::text,'Ana',pg_temp.c1('03')::text,'Mia',pg_temp.c1('04')::text,'Leo',
  pg_temp.c1('09')::text,null,pg_temp.c1('99')::text,null),'chat_messages'' names: '||(r->'names')::text);
 for v_row in select e.value from jsonb_array_elements(r->'rows') e loop
  select * into m from public.messages where id=(v_row->>'id')::bigint;
  if m.author_id=pg_temp.c1('03') then
   perform pg_temp.ch_check(pg_temp.ch_keys(v_row)='audience,author_id,body,client_id,created_at,event,id,kind,payload,state,updated_at'
    and (v_row->>'client_id')::uuid=m.client_id,'03''s own row has no client_id, or the wrong one: '||v_row::text);
  else
   perform pg_temp.ch_check(pg_temp.ch_keys(v_row)='audience,author_id,body,created_at,event,id,kind,payload,state,updated_at',
    'Someone else''s row shows a client_id, or has the wrong keys: '||v_row::text);
  end if;
 end loop;
 select * into m from public.messages where series_id=pg_temp.c1p('01') and body='Message 119';
 perform pg_temp.ch_check(r->'rows' @> jsonb_build_array(jsonb_build_object('id',m.id,'kind','message','audience',null,'event',null,
  'payload',null,'body','Message 119','state','sent','author_id',pg_temp.c1('04'),'created_at',m.created_at,'updated_at',m.updated_at)),
  'Message 119 does not read as stored');
 perform pg_temp.ch_check(private.chat_names((select jsonb_build_array(private.chat_row(x,pg_temp.c1('03'))) from public.messages x
   where x.series_id=pg_temp.c1p('01') and x.event='changed'))='{}'::jsonb,'The changed line''s place label was looked up as a person');
 -- Only the person keys, at the payload's top level: a uuid under plan_id, title or place_label, or nested, is never looked up.
 perform pg_temp.ch_check(private.chat_names(jsonb_build_array(
   jsonb_build_object('author_id',null,'payload',jsonb_build_object('actor',pg_temp.c1('01'),'user',pg_temp.c1('03'),'brought_by',pg_temp.c1('04'))),
   jsonb_build_object('author_id',pg_temp.c1('02'),'payload',jsonb_build_object('plan_id',pg_temp.c1('05'),'title',pg_temp.c1('06'),
    'place_label',pg_temp.c1('07'),'nested',jsonb_build_object('user',pg_temp.c1('08'))))))
   =jsonb_build_object(pg_temp.c1('01')::text,'Ana',pg_temp.c1('02')::text,'Ada',pg_temp.c1('03')::text,'Mia',pg_temp.c1('04')::text,'Leo'),
  'chat_names looks up more than the authors and the person keys');
end $$;

-- After the close (the end + 48 h 01 min), the history still reads (rule 4: reading only): the same newest page, and
-- every row since 0. The times go back afterwards.
do $$ declare v_page text := pg_temp.ch_newest(pg_temp.c1p('01'),null,50); begin
 perform set_config('resbite.system','roll',true);
 update public.plans set starts_at=now()-interval '51 hours 1 minute',ends_at=now()-interval '48 hours 1 minute' where id=pg_temp.c1p('01');
 perform set_config('resbite.system','',true);
 perform pg_temp.ch_as(pg_temp.c1('03'));
 perform pg_temp.ch_check(private.chat_open(pg_temp.c1p('01')) is false,'The chat did not close');
 perform pg_temp.ch_check(pg_temp.ch_ids(public.chat_messages(pg_temp.c1p('01')))=v_page,'chat_messages does not read after the close');
 perform pg_temp.ch_check(jsonb_array_length(public.chat_messages_since(pg_temp.c1p('01'),0,null)->'rows')
   =(select count(*) from public.messages where series_id=pg_temp.c1p('01')),'chat_messages_since does not read after the close');
 perform set_config('resbite.system','roll',true);
 update public.plans set starts_at=pg_temp.c1_start(),ends_at=pg_temp.c1_start()+interval '3 hours' where id=pg_temp.c1p('01');
 perform set_config('resbite.system','',true);
end $$;

-- p_limit is clamped to 1..100 (K-N10): 0 and -5 give 1 row, 500 gives 100, null gives 50. A page ends just before p_before.
do $$ declare v_mid bigint; begin
 perform pg_temp.ch_as(pg_temp.c1('03'));
 perform pg_temp.ch_check(pg_temp.ch_ids(public.chat_messages(pg_temp.c1p('01'),null,0))=pg_temp.ch_newest(pg_temp.c1p('01'),null,1),
  'p_limit 0 is not one row');
 perform pg_temp.ch_check(pg_temp.ch_ids(public.chat_messages(pg_temp.c1p('01'),null,-5))=pg_temp.ch_newest(pg_temp.c1p('01'),null,1),
  'p_limit -5 is not one row');
 perform pg_temp.ch_check(jsonb_array_length(public.chat_messages(pg_temp.c1p('01'),null,500)->'rows')=100
  and pg_temp.ch_ids(public.chat_messages(pg_temp.c1p('01'),null,500))=pg_temp.ch_newest(pg_temp.c1p('01'),null,100),'p_limit 500 is not 100 rows');
 perform pg_temp.ch_check(pg_temp.ch_ids(public.chat_messages(pg_temp.c1p('01'),null,null))=pg_temp.ch_newest(pg_temp.c1p('01'),null,50),
  'p_limit null is not 50 rows');
 select id into v_mid from public.messages where series_id=pg_temp.c1p('01') and body='Message 61';
 perform pg_temp.ch_check(pg_temp.ch_ids(public.chat_messages(pg_temp.c1p('01'),v_mid,10))=pg_temp.ch_newest(pg_temp.c1p('01'),v_mid,10),
  'A page does not end just before p_before');
 perform pg_temp.ch_check(pg_temp.ch_ids(public.chat_messages(pg_temp.c1p('01'),v_mid,10))
  =(select string_agg(id::text,',' order by id) from public.messages where body in ('Message 51','Message 52','Message 53','Message 54',
   'Message 55','Message 56','Message 57','Message 58','Message 59','Message 60') and series_id=pg_temp.c1p('01')),
  'The page before Message 61 is not Messages 51 to 60');
end $$;

-- chat_messages_since (K-B1): with the app holding the newest id and no cursor, nothing comes back.
do $$ declare r jsonb; begin
 perform pg_temp.ch_as(pg_temp.c1('03'));
 r := public.chat_messages_since(pg_temp.c1p('01'),(select max(id) from public.messages where series_id=pg_temp.c1p('01')),null);
 perform pg_temp.ch_check(r->'rows'='[]'::jsonb and r->'names'='{}'::jsonb and (r->>'as_of')::timestamptz=now(),
  'chat_messages_since after the newest id: '||r::text);
end $$;
-- A late commit: two rows inserted in order (the lower id 10 minutes back, the higher 9), the app holding the higher id.
-- With a cursor a second before the lower row's updated_at, the lower row comes back (and the higher, inside the
-- overlap); with no cursor, nothing does: a null cursor tests ids only.
insert into public.messages(series_id,plan_id,author_id,kind,body,created_at,updated_at) values
 (pg_temp.c1p('01'),pg_temp.c1p('01'),pg_temp.c1('04'),'message','Committed late',now()-interval '10 minutes',now()-interval '10 minutes');
insert into public.messages(series_id,plan_id,author_id,kind,body,created_at,updated_at) values
 (pg_temp.c1p('01'),pg_temp.c1p('01'),pg_temp.c1('03'),'message','Read first',now()-interval '9 minutes',now()-interval '9 minutes');
do $$ declare v_low bigint := (select id from public.messages where series_id=pg_temp.c1p('01') and body='Committed late');
 v_high bigint := (select id from public.messages where series_id=pg_temp.c1p('01') and body='Read first'); begin
 perform pg_temp.ch_check(v_low<v_high,'The late row does not have the lower id');
 perform pg_temp.ch_as(pg_temp.c1('03'));
 perform pg_temp.ch_check(pg_temp.ch_ids(public.chat_messages_since(pg_temp.c1p('01'),v_high,now()-interval '10 minutes'-interval '1 second'))
  =v_low||','||v_high,'The late commit does not come back: '
  ||pg_temp.ch_ids(public.chat_messages_since(pg_temp.c1p('01'),v_high,now()-interval '10 minutes'-interval '1 second')));
 perform pg_temp.ch_check(pg_temp.ch_ids(public.chat_messages_since(pg_temp.c1p('01'),v_high,null))='',
  'With no cursor, a row at or below the id the app holds comes back');
end $$;
-- A removal: an older row set to 'removed' by hand (its body left in the column) has updated_at moved to now() by the
-- touch trigger, created_at kept. chat_messages_since(newest id, as_of − 2 minutes) returns that row only, with no body.
do $$ declare v_old public.messages; v_newest bigint; v_as_of timestamptz; r jsonb; begin
 select * into v_old from public.messages where series_id=pg_temp.c1p('01') and body='Message 10';
 select max(id) into v_newest from public.messages where series_id=pg_temp.c1p('01');
 perform pg_temp.ch_as(pg_temp.c1('03'));
 v_as_of := (public.chat_messages(pg_temp.c1p('01'))->>'as_of')::timestamptz;
 update public.messages set state='removed' where id=v_old.id;
 perform pg_temp.ch_check((select (updated_at,created_at) from public.messages where id=v_old.id) is not distinct from (now(),v_old.created_at),
  'The update did not move updated_at to now(), or moved created_at');
 r := public.chat_messages_since(pg_temp.c1p('01'),v_newest,v_as_of-interval '2 minutes');
 perform pg_temp.ch_check(pg_temp.ch_ids(r)=v_old.id::text,'chat_messages_since after the removal: '||pg_temp.ch_ids(r));
 perform pg_temp.ch_check(r->'rows'->0->'body'='null'::jsonb and r->'rows'->0->>'state'='removed'
  and r->'names'=jsonb_build_object(pg_temp.c1('03')::text,'Mia'),'The removed row: '||r::text);
end $$;

-- unread (K-S11): with 03's read at the newest id, nothing is unread; then a row by 03, a line whose actor is 03 and a
-- removed row by 04 keep it so; a row by 04 makes it unread. chat_summary and 03's entry in my_chat_overview agree each
-- time, so a person's own rows never light the dot on My resbites either. The summary gives 03's last read id.
insert into public.chat_reads(series_id,user_id,last_read_id)
 select pg_temp.c1p('01'),pg_temp.c1('03'),max(id) from public.messages where series_id=pg_temp.c1p('01');
do $$ declare v_read bigint := (select last_read_id from public.chat_reads where series_id=pg_temp.c1p('01') and user_id=pg_temp.c1('03')); begin
 perform pg_temp.ch_as(pg_temp.c1('03'));
 perform pg_temp.ch_check(public.chat_summary(pg_temp.c1p('01'))@>jsonb_build_object('last_read_id',v_read),'The wrong last read id');
 perform pg_temp.ch_check(pg_temp.ch_unread(pg_temp.c1p('01'))='false/false',
  'Unread (summary/overview) with the read at the newest id: '||pg_temp.ch_unread(pg_temp.c1p('01')));
 insert into public.messages(series_id,plan_id,author_id,kind,body,created_at,updated_at) values
  (pg_temp.c1p('01'),pg_temp.c1p('01'),pg_temp.c1('03'),'message','My own',now()-interval '1 hour',now()-interval '1 hour');
 perform pg_temp.ch_check(pg_temp.ch_unread(pg_temp.c1p('01'))='false/false','03''s own message makes the chat unread (summary/overview): '||pg_temp.ch_unread(pg_temp.c1p('01')));
 insert into public.messages(series_id,plan_id,kind,event,payload,created_at,updated_at) values
  (pg_temp.c1p('01'),pg_temp.c1p('01'),'system','joined',jsonb_build_object('actor',pg_temp.c1('03'),'user',pg_temp.c1('03')),
   now()-interval '1 hour',now()-interval '1 hour');
 perform pg_temp.ch_check(pg_temp.ch_unread(pg_temp.c1p('01'))='false/false','03''s own line makes the chat unread (summary/overview): '||pg_temp.ch_unread(pg_temp.c1p('01')));
 insert into public.messages(series_id,plan_id,author_id,kind,body,state,created_at,updated_at) values
  (pg_temp.c1p('01'),pg_temp.c1p('01'),pg_temp.c1('04'),'message','Gone','removed',now()-interval '1 hour',now()-interval '1 hour');
 perform pg_temp.ch_check(pg_temp.ch_unread(pg_temp.c1p('01'))='false/false','A removed message makes the chat unread (summary/overview): '||pg_temp.ch_unread(pg_temp.c1p('01')));
 insert into public.messages(series_id,plan_id,author_id,kind,body,created_at,updated_at) values
  (pg_temp.c1p('01'),pg_temp.c1p('01'),pg_temp.c1('04'),'message','New from Leo',now()-interval '1 hour',now()-interval '1 hour');
 perform pg_temp.ch_check(pg_temp.ch_unread(pg_temp.c1p('01'))='true/true','04''s message does not make the chat unread (summary/overview): '
  ||pg_temp.ch_unread(pg_temp.c1p('01')));
end $$;
delete from public.chat_reads where user_id=pg_temp.c1('03');

-- The pinned and last rows, and my_chat_overview. An announcement by 01 to everyone, inserted by hand, with chats'
-- pinned_message_id and last_message_id set by hand to it and to 04's newest message (Task 2's trigger keeps them):
-- chat_summary as 03 gives both rows, and names covers both. my_chat_overview as 03 lists both of 03's chats (the
-- one-off and the weekly series, 03 Going on its current occurrence), keyed by series, with unread, last, open and the
-- count, names covering each last row, and no announcement (03 has no unanswered invitation). As 05: no chat (05 is in
-- none) and, for the one-off, where 05 has not answered, that announcement with its id, author and words (SHOULD 7),
-- names covering its author. As 07 (Can't go after Going): no chat and no announcement.
-- The card's announcement (H22, H23) is the series' latest sent announcement whose audience includes the caller: a
-- newer one to Going, or a newer one to everyone that was removed, leaves 05's card on the first. It is listed only for
-- the caller's unanswered row on the series' current occurrence while that is active and has not ended: a cancelled
-- or ended one-off gives none, though its chat may still be open; on the weekly series, an announcement written on the
-- past occurrence is listed under the current one's id, and a row left only on the past occurrence gives none.
-- Every announcement here leaves 'sent' and both ids go back afterwards, so slice 2 starts with no pinned announcement.
do $$ declare v_ann bigint; v_going bigint; v_gone bigint; v_week bigint; v_msg bigint; v_last bigint; v_pinned bigint; v_next uuid;
 s jsonb; o jsonb; begin
 select c.last_message_id,c.pinned_message_id into v_last,v_pinned from public.chats c where c.series_id=pg_temp.c1p('01');
 select id into v_next from public.plans where repeats_from=pg_temp.c1p('02');
 insert into public.messages(series_id,plan_id,author_id,kind,audience,body,created_at,updated_at) values
  (pg_temp.c1p('01'),pg_temp.c1p('01'),pg_temp.c1('01'),'announcement','everyone','Doors open at 7',now()-interval '1 hour',now()-interval '1 hour')
  returning id into v_ann;
 select id into v_msg from public.messages where series_id=pg_temp.c1p('01') and body='New from Leo';
 update public.chats set pinned_message_id=v_ann,last_message_id=v_msg where series_id=pg_temp.c1p('01');
 perform pg_temp.ch_as(pg_temp.c1('03'));
 s := public.chat_summary(pg_temp.c1p('01'));
 perform pg_temp.ch_check((s->'pinned'->>'id')::bigint=v_ann and s->'pinned'@>'{"kind":"announcement","audience":"everyone","body":"Doors open at 7","state":"sent"}'
  and (s->'last'->>'id')::bigint=v_msg and s->'last'->>'body'='New from Leo' and not (s->'last' ? 'client_id'),'The summary''s pinned or last: '||s::text);
 perform pg_temp.ch_check(s->'names'=jsonb_build_object(pg_temp.c1('01')::text,'Ana',pg_temp.c1('04')::text,'Leo'),'The summary''s names: '||(s->'names')::text);
 o := public.my_chat_overview();
 perform pg_temp.ch_check(pg_temp.ch_keys(o)='announcements,chats,names' and pg_temp.ch_keys(o->'chats')=pg_temp.c1p('01')||','||pg_temp.c1p('02'),
  'my_chat_overview as 03: '||o::text);
 perform pg_temp.ch_check(o->'chats'->(pg_temp.c1p('01')::text)=jsonb_build_object('unread',true,'last',s->'last','open',true,
   'count',(select message_count from public.chats where series_id=pg_temp.c1p('01'))),'The overview''s one-off entry: '||(o->'chats'->(pg_temp.c1p('01')::text))::text);
 perform pg_temp.ch_check(o->'chats'->(pg_temp.c1p('02')::text)=jsonb_build_object('unread',false,'last',null,'open',true,
   'count',(select message_count from public.chats where series_id=pg_temp.c1p('02'))),'The overview''s weekly entry: '||o::text);
 perform pg_temp.ch_check(o->'announcements'='{}'::jsonb and o->'names'=jsonb_build_object(pg_temp.c1('04')::text,'Leo'),
  'The overview''s announcements or names as 03: '||o::text);
 perform pg_temp.ch_as(pg_temp.c1('05'));
 o := public.my_chat_overview();
 perform pg_temp.ch_check(o=jsonb_build_object('chats','{}'::jsonb,'announcements',jsonb_build_object(pg_temp.c1p('01')::text,
  jsonb_build_object('id',v_ann,'author_id',pg_temp.c1('01'),'body','Doors open at 7')),'names',jsonb_build_object(pg_temp.c1('01')::text,'Ana')),
  'my_chat_overview as 05: '||o::text);
 perform pg_temp.ch_as(pg_temp.c1('07'));
 o := public.my_chat_overview();
 perform pg_temp.ch_check(o=jsonb_build_object('chats','{}'::jsonb,'announcements','{}'::jsonb,'names','{}'::jsonb),'my_chat_overview as 07: '||o::text);
 -- The latest announcement whose audience includes 05.
 insert into public.messages(series_id,plan_id,author_id,kind,audience,body,created_at,updated_at) values
  (pg_temp.c1p('01'),pg_temp.c1p('01'),pg_temp.c1('01'),'announcement','going','For the people going',now()-interval '1 hour',now()-interval '1 hour')
  returning id into v_going;
 insert into public.messages(series_id,plan_id,author_id,kind,audience,body,state,created_at,updated_at) values
  (pg_temp.c1p('01'),pg_temp.c1p('01'),pg_temp.c1('01'),'announcement','everyone','Taken back','removed',now()-interval '1 hour',now()-interval '1 hour')
  returning id into v_gone;
 perform pg_temp.ch_as(pg_temp.c1('05'));
 perform pg_temp.ch_check((public.my_chat_overview()->'announcements'->(pg_temp.c1p('01')::text)->>'id')::bigint=v_ann,
  '05''s card is not the latest announcement that reaches 05: '||(public.my_chat_overview()->'announcements')::text);
 -- Only while the current occurrence is active and has not ended.
 perform set_config('resbite.system','roll',true);
 update public.plans set status='cancelled' where id=pg_temp.c1p('01');
 perform set_config('resbite.system','',true);
 perform pg_temp.ch_check(public.my_chat_overview()->'announcements'='{}'::jsonb,'A cancelled one-off''s announcement is on 05''s card');
 perform set_config('resbite.system','roll',true);
 update public.plans set status='active',starts_at=now()-interval '4 hours',ends_at=now()-interval '1 hour' where id=pg_temp.c1p('01');
 perform set_config('resbite.system','',true);
 perform pg_temp.ch_check(private.chat_open(pg_temp.c1p('01')) and public.my_chat_overview()->'announcements'='{}'::jsonb,
  'An ended one-off''s announcement is on 05''s card');
 perform set_config('resbite.system','roll',true);
 update public.plans set starts_at=pg_temp.c1_start(),ends_at=pg_temp.c1_start()+interval '3 hours' where id=pg_temp.c1p('01');
 perform set_config('resbite.system','',true);
 -- The weekly series: written on the past occurrence, listed under the current one's id.
 insert into public.messages(series_id,plan_id,author_id,kind,audience,body,created_at,updated_at) values
  (pg_temp.c1p('02'),pg_temp.c1p('02'),pg_temp.c1('01'),'announcement','everyone','Bring water',now()-interval '1 hour',now()-interval '1 hour')
  returning id into v_week;
 o := public.my_chat_overview();
 perform pg_temp.ch_check(o->'announcements'=jsonb_build_object(pg_temp.c1p('01')::text,
   jsonb_build_object('id',v_ann,'author_id',pg_temp.c1('01'),'body','Doors open at 7'),v_next::text,
   jsonb_build_object('id',v_week,'author_id',pg_temp.c1('01'),'body','Bring water')),'05''s cards with the weekly series: '||o::text);
 perform set_config('resbite.system','roll',true);
 update public.attendees set response='declined' where plan_id=v_next and user_id=pg_temp.c1('05');
 perform set_config('resbite.system','',true);
 perform pg_temp.ch_check(pg_temp.ch_keys(public.my_chat_overview()->'announcements')=pg_temp.c1p('01')::text,
  'A row left only on a past occurrence brings its announcement to 05''s card');
 perform set_config('resbite.system','roll',true);
 update public.attendees set response='pending' where plan_id=v_next and user_id=pg_temp.c1('05');
 perform set_config('resbite.system','',true);
 -- An announcement to Going, or one no longer sent, is on no card.
 update public.messages set audience='going' where id=v_ann;
 perform pg_temp.ch_check(not (public.my_chat_overview()->'announcements' ? pg_temp.c1p('01')::text),'An announcement to Going is on 05''s card');
 update public.messages set state='deleted' where id in (v_ann,v_going,v_week);
 update public.messages set audience='everyone' where id=v_ann;
 perform pg_temp.ch_check(public.my_chat_overview()=jsonb_build_object('chats','{}'::jsonb,'announcements','{}'::jsonb,'names','{}'::jsonb),
  'A deleted announcement is on 05''s card');
 update public.chats set pinned_message_id=v_pinned,last_message_id=v_last where series_id=pg_temp.c1p('01');
end $$;
-- my_chat_overview as a signed-in 03 and 05.
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('03'));
select pg_temp.ch_check(pg_temp.ch_keys(public.my_chat_overview()->'chats')=pg_temp.c1p('01')||','||pg_temp.c1p('02'),
 'my_chat_overview as a signed-in 03 does not list its two chats');
select pg_temp.ch_as(pg_temp.c1('05'));
select pg_temp.ch_check(public.my_chat_overview()->'chats'='{}'::jsonb,'my_chat_overview as a signed-in 05 lists a chat');
reset role;

-- The tables' rules. A body is 1 to 1000 characters; kind, audience and state take only their words; a client id is
-- unique per author.
select pg_temp.ch_refused($$insert into public.messages(series_id,plan_id,author_id,kind,body) values
 (pg_temp.c1p('01'),pg_temp.c1p('01'),pg_temp.c1('03'),'message','')$$,'23514',
 'new row for relation "messages" violates check constraint "messages_body_check"');
select pg_temp.ch_refused($$insert into public.messages(series_id,plan_id,author_id,kind,body) values
 (pg_temp.c1p('01'),pg_temp.c1p('01'),pg_temp.c1('03'),'message',repeat('é',1001))$$,'23514',
 'new row for relation "messages" violates check constraint "messages_body_check"');
select pg_temp.ch_refused($$insert into public.messages(series_id,plan_id,kind) values (pg_temp.c1p('01'),pg_temp.c1p('01'),'note')$$,'23514',
 'new row for relation "messages" violates check constraint "messages_kind_check"');
select pg_temp.ch_refused($$insert into public.messages(series_id,plan_id,kind,audience) values (pg_temp.c1p('01'),pg_temp.c1p('01'),'announcement','all')$$,
 '23514','new row for relation "messages" violates check constraint "messages_audience_check"');
select pg_temp.ch_refused($$insert into public.messages(series_id,plan_id,kind,state) values (pg_temp.c1p('01'),pg_temp.c1p('01'),'system','hidden')$$,
 '23514','new row for relation "messages" violates check constraint "messages_state_check"');
select pg_temp.ch_refused($$insert into public.messages(series_id,plan_id,author_id,kind,body,client_id)
 select series_id,plan_id,author_id,kind,body,client_id from public.messages where body='Message 2'$$,'23505',
 'duplicate key value violates unique constraint "messages_author_id_client_id_key"');

-- The schema (Global Constraints, K-S5, K-N13). The four tables have RLS on, no policy and no grant, and so has the
-- messages' id sequence: no API role reads or writes them directly, and a direct select is refused. The four reads and
-- their private bodies are for signed-in accounts only; the helpers and the trigger functions are for no role. Every
-- new private function is a definer with an empty search path; the public wrappers are not definers. The triggers,
-- indexes (the announcements' partial one too, H22), defaults, keys and foreign keys are as the plan names them.
do $$ declare t text; r text; p text; begin
 foreach t in array array['public.messages','public.chats','public.chat_reads','public.chat_mutes'] loop
  perform pg_temp.ch_check((select relrowsecurity from pg_catalog.pg_class where oid=t::regclass)
   and not exists(select 1 from pg_catalog.pg_policy where polrelid=t::regclass),t||' has no RLS, or a policy');
  foreach r in array array['public','anon','authenticated','service_role'] loop
   foreach p in array array['select','insert','update','delete','truncate','references','trigger'] loop
    perform pg_temp.ch_check(not has_table_privilege(r,t,p),r||' has '||p||' on '||t);
   end loop;
  end loop;
 end loop;
 foreach r in array array['public','anon','authenticated','service_role'] loop
  foreach p in array array['usage','select','update'] loop
   perform pg_temp.ch_check(not has_sequence_privilege(r,pg_catalog.pg_get_serial_sequence('public.messages','id'),p),r||' has '||p||' on the messages'' sequence');
  end loop;
 end loop;
end $$;
do $$ declare r text; t text; begin
 foreach r in array array['anon','authenticated','service_role'] loop
  foreach t in array array['messages','chats','chat_reads','chat_mutes'] loop
   execute format('set local role %I',r);
   begin
    execute format('select 1 from public.%I limit 1',t);
    raise exception '% read public.%',r,t;
   exception when insufficient_privilege then null;
   end;
   reset role;
  end loop;
 end loop;
end $$;
do $$ declare f text; r text; begin
 foreach f in array array['chat_summary(uuid)','chat_messages(uuid,bigint,integer)','chat_messages_since(uuid,bigint,timestamptz)','my_chat_overview()'] loop
  perform pg_temp.ch_check(has_function_privilege('authenticated','public.'||f,'execute') and has_function_privilege('authenticated','private.'||f,'execute'),
   'authenticated may not call public.'||f||' or its body');
  foreach r in array array['public','anon','service_role'] loop
   perform pg_temp.ch_check(not has_function_privilege(r,'public.'||f,'execute') and not has_function_privilege(r,'private.'||f,'execute'),
    r||' may call public.'||f||' or its body');
  end loop;
  perform pg_temp.ch_check(not (select prosecdef from pg_catalog.pg_proc where oid=('public.'||f)::regprocedure),'public.'||f||' is a definer');
  perform pg_temp.ch_check((select prosecdef and proconfig=array['search_path=""'] from pg_catalog.pg_proc where oid=('private.'||f)::regprocedure),
   'private.'||f||' is not a definer with an empty search path');
 end loop;
 foreach f in array array['current_occurrence(uuid)','chat_member(uuid,uuid)','chat_members(uuid)','chat_closes_at(uuid)','chat_open(uuid)',
   'chat_is_group(uuid)','announcement_audience(uuid,text)','chat_first_name(uuid)','chat_row(public.messages,uuid)','chat_names(jsonb)',
   'messages_touch()','plans_chat_row()'] loop
  perform pg_temp.ch_check((select prosecdef and proconfig=array['search_path=""'] from pg_catalog.pg_proc where oid=('private.'||f)::regprocedure),
   'private.'||f||' is not a definer with an empty search path');
  foreach r in array array['public','anon','authenticated','service_role'] loop
   perform pg_temp.ch_check(not has_function_privilege(r,'private.'||f,'execute'),r||' may call private.'||f);
  end loop;
 end loop;
 perform pg_temp.ch_check(exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid='public.messages'::regclass and t.tgname='messages_touch'
   and t.tgfoid='private.messages_touch()'::regprocedure and pg_catalog.pg_get_triggerdef(t.oid) like '%BEFORE UPDATE ON public.messages FOR EACH ROW%'),
  'The messages_touch trigger is missing');
 perform pg_temp.ch_check(exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid='public.plans'::regclass and t.tgname='plans_chat_row'
   and t.tgfoid='private.plans_chat_row()'::regprocedure and pg_catalog.pg_get_triggerdef(t.oid) like '%AFTER INSERT ON public.plans FOR EACH ROW%'),
  'The plans_chat_row trigger is missing');
 perform pg_temp.ch_check((select indexdef from pg_catalog.pg_indexes where schemaname='public' and indexname='messages_series_idx')
   like '%ON public.messages USING btree (series_id, id)'
  and (select indexdef from pg_catalog.pg_indexes where schemaname='public' and indexname='messages_series_updated_idx')
   like '%ON public.messages USING btree (series_id, updated_at)'
  and (select indexdef from pg_catalog.pg_indexes where schemaname='public' and indexname='messages_series_announcements_idx')
   like '%ON public.messages USING btree (series_id, id) WHERE (kind = ''announcement''::text)','The messages indexes are wrong');
 perform pg_temp.ch_check(exists(select 1 from pg_catalog.pg_constraint where conrelid='public.messages'::regclass and contype='u'
   and pg_catalog.pg_get_constraintdef(oid)='UNIQUE (author_id, client_id)'),'messages has no unique (author_id, client_id)');
 perform pg_temp.ch_check((select string_agg(a.attname||'='||pg_catalog.pg_get_expr(d.adbin,d.adrelid),',' order by a.attname)
   from pg_catalog.pg_attribute a join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid='public.messages'::regclass)
   ='created_at=clock_timestamp(),state=''sent''::text,updated_at=now()'
  and (select attidentity from pg_catalog.pg_attribute where attrelid='public.messages'::regclass and attname='id')='a',
  'The messages defaults are wrong');
 perform pg_temp.ch_check((select string_agg(k.fk,',' order by k.fk) from (select c.conrelid::regclass::text||'.'||a.attname||'>'
   ||c.confrelid::regclass::text||':'||c.confdeltype::text as fk
   from pg_catalog.pg_constraint c join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
   where c.contype='f' and c.conrelid in ('public.messages'::regclass,'public.chats'::regclass,'public.chat_reads'::regclass,'public.chat_mutes'::regclass)) k)
   ='chat_mutes.user_id>profiles:c,chat_reads.user_id>profiles:c,messages.author_id>profiles:n,messages.plan_id>plans:c',
  'The chat tables'' foreign keys are wrong');
end $$;

-- Slice 2 (Task 2) continues here, on the c1 cast, before this rollback.
rollback;
