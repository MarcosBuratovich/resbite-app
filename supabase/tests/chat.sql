-- Chat (docs/superpowers/plans/2026-11-11-chat-1-core.md, Tasks 1 to 3; docs/superpowers/specs/2026-11-10-groups-and-chat-design.md,
-- CH-P1, CH-P2, CH-P5, CH-P14, CH-P15 and the Data section): a chat per series, who is in it, when it closes and the reads
-- (slice 1); writing, announcements and the notices (slice 2); Resbite's own lines and the live signal (slice 3); the
-- way back (the rollback, rehearsed); an account's deletion (the last block). Synthetic identities only: emails chat1-…,
-- chat3-…, chat5-… and chat6-…@resbite-test.invalid, ids with the prefixes c1, c3, c5 and c6, no phone numbers.
--
-- Four transactions, each begin … rollback (NOTE 12). Slices 1 and 2 share the c1 cast; slice 3 has the c1 cast again,
-- with its own plans and two more people (c3); the rollback's rehearsal has c6, and the deletion block c5. The prefixes
-- c1 and c3 are also used by phone-accounts.sql and plan-covers.sql, which is harmless only because every transaction
-- rolls back. Since slice 3, answers, changes and appointments write system lines by trigger (Decision 1); the only
-- lines slices 1 and 2 leave written are two real changes' (the crowd's), and slice 2 counts the first (H9).
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
-- The people a kind of notice went to about a message, as ch_who writes them ('' for nobody). The superuser's.
create function pg_temp.ch_to(p_kind text, p_message bigint) returns text language plpgsql stable as $$
begin
 return pg_temp.ch_who(array(select o.recipient_id from private.notification_outbox o where o.kind=p_kind and o.message_id=p_message));
end $$;
-- That notice to one person (two digits): its id. The superuser's.
create function pg_temp.ch_notice(p_kind text, p_message bigint, p_to text) returns bigint language plpgsql stable as $$
begin
 return (select o.id from private.notification_outbox o where o.kind=p_kind and o.message_id=p_message and o.recipient_id=pg_temp.c1(p_to));
end $$;
-- A message sent as the current claims, with a fresh client id: its id.
create function pg_temp.ch_send(p_series uuid, p_body text) returns bigint language plpgsql as $$
begin
 return (public.send_message(p_series,p_body,gen_random_uuid())->>'id')::bigint;
end $$;
-- Whether this transaction holds someone's lock, require_tester's key (hashtextextended of the uuid, 47). The superuser's.
create function pg_temp.ch_locked(p_user uuid) returns boolean language sql stable as $$
 select exists(select 1 from pg_catalog.pg_locks l where l.locktype='advisory' and l.pid=pg_catalog.pg_backend_pid() and l.granted
  and l.objsubid=1 and ((l.classid::bigint<<32)|l.objid::bigint)=pg_catalog.hashtextextended(p_user::text,47))
$$;
-- A slice 1 message by its words: its id. The superuser's.
create function pg_temp.ch_msg(p_body text) returns bigint language plpgsql stable as $$
begin
 return (select m.id from public.messages m where m.series_id=pg_temp.c1p('01') and m.body=p_body);
end $$;
-- Slice 3's ids: people beyond the c1 cast (c3…10, c3…11) and its plans (c31…).
create function pg_temp.c3(p text) returns uuid language sql immutable as $$ select ('c3000000-0000-4000-8000-0000000000'||p)::uuid $$;
create function pg_temp.c3p(p text) returns uuid language sql immutable as $$ select ('c3100000-0000-4000-8000-0000000000'||p)::uuid $$;
-- A series' system lines in id order, as event:user (the user's two digits, '-' for none): 'joined:04,admin:04' ('' for
-- none). The superuser's.
create function pg_temp.ch_lines(p_series uuid) returns text language plpgsql stable as $$
begin
 return (select coalesce(string_agg(m.event||':'||coalesce(right(m.payload->>'user',2),'-'),',' order by m.id),'') from public.messages m
  where m.series_id=p_series and m.kind='system');
end $$;
-- How many broadcasts name a message: rows of realtime.messages on its chat's topic whose payload has its id. The
-- superuser's (it reads past the policy).
create function pg_temp.ch_signals(p_id bigint) returns integer language plpgsql stable as $$
begin
 return (select count(*) from realtime.messages r join public.messages m on m.id=p_id
  where r.topic='chat:'||m.series_id and r.payload->>'id'=p_id::text);
end $$;
-- A change of a plan through change_plan_v4 as the current claims, at its current version, keeping its description,
-- categories, repeat, note and area: the new version.
create function pg_temp.ch_change(p_plan uuid, p_title text, p_start timestamptz, p_ends timestamptz, p_zone text, p_place text)
returns integer language plpgsql as $$
begin
 return public.change_plan_v4(p_plan,(select version from public.plans where id=p_plan),p_title,'',array['community'],p_start,p_ends,
  p_zone,p_place,false,null::smallint,null,null);
end $$;
-- One statement of a source file, from its first line (p_from) to the first p_to after it, both included. The
-- rollback rehearsal runs a migration's own text for a function, to compare what the rollback restored with it.
create function pg_temp.ch_source(p_text text, p_from text, p_to text) returns text language plpgsql immutable as $$
declare v_start integer := position(p_from in p_text); v_len integer;
begin
 if v_start=0 then raise exception 'Not in the source: %', p_from; end if;
 v_len := position(p_to in substring(p_text from v_start));
 if v_len=0 then raise exception 'No % after %', p_to, p_from; end if;
 return substring(p_text from v_start for v_len+length(p_to)-1);
end $$;
-- The chat rules (chat plan 3, confirmation 2's 2-a): once plan 3's table exists, every profile so far accepts its
-- current version, so this file's writers pass the check in both modes. Called after each insert of people who write.
-- The superuser's; nothing to do before plan 3.
create function pg_temp.ch_rules() returns void language plpgsql as $$
begin
 if pg_catalog.to_regclass('private.chat_rules_acceptances') is not null then
  execute 'insert into private.chat_rules_acceptances(user_id,version) select p.id,private.chat_rules_version() from public.profiles p '
   'on conflict do nothing';
 end if;
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
select pg_temp.ch_rules();
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

-- A chats row for each plan's series once create_plan_v4 has made it, starting empty. Since chat plan 2
-- (plans_group_flag), the weekly series is a group from create_plan_v4 on, and every other chats row, backfilled or new,
-- has is_group false; chat_is_group reads that column (CH-R-A6, confirmation 2 SHOULD 1).
do $$ begin
 perform pg_temp.ch_check((select count(*) from public.chats where series_id in (pg_temp.c1p('01'),pg_temp.c1p('02')))=2,
  'create_plan_v4 did not give each series its chat row');
 perform pg_temp.ch_check((select (c.is_group,c.last_message_id,c.last_message_at,c.pinned_message_id,c.message_count)
   from public.chats c where c.series_id=pg_temp.c1p('01'))
   is not distinct from (false,null::bigint,null::timestamptz,null::bigint,0),'A new chat row does not start empty and not a group');
 perform pg_temp.ch_check((select is_group from public.chats where series_id=pg_temp.c1p('02'))
  and not exists(select 1 from public.chats where is_group and series_id<>pg_temp.c1p('02')),'A chat row other than the weekly series'' is a group, or it is not');
 perform pg_temp.ch_check(not private.chat_is_group(pg_temp.c1p('01')) and private.chat_is_group(pg_temp.c1p('02'))
  and not private.chat_is_group(gen_random_uuid()),'chat_is_group does not read the flag');
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
-- ("Going"); Everyone adds the people who have not answered, on a chat that is not a group ("Everyone invited").
do $$ begin
 perform pg_temp.ch_check(pg_temp.ch_who(array(select private.announcement_audience(pg_temp.c1p('01'),'going')))='01,02,03,04',
  'Going on the one-off: '||pg_temp.ch_who(array(select private.announcement_audience(pg_temp.c1p('01'),'going'))));
 perform pg_temp.ch_check(pg_temp.ch_who(array(select private.announcement_audience(pg_temp.c1p('01'),'everyone')))='01,02,03,04,05',
  'Everyone on the one-off: '||pg_temp.ch_who(array(select private.announcement_audience(pg_temp.c1p('01'),'everyone'))));
 perform pg_temp.ch_check(not exists(select 1 from private.announcement_audience(pg_temp.c1p('01'),'all')),
  'An unknown audience has people');
end $$;

-- chat_summary (K-N2, K-N7), as a signed-in 03: the one-off's header (accepted: 02 and 03 are Going), the people in it
-- (4), the sheet's counts (Going 4, Everyone 5), not a host, open, closing at the end + 48 hours, nothing written yet.
-- As 02, the admin, and 01, the owner: a host. As 05 (not answered), 08 and 07 (Can't go after Going): 42501 'Not in
-- this chat'.
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('03'));
do $$ declare s jsonb := public.chat_summary(pg_temp.c1p('01')); begin
 perform pg_temp.ch_check(pg_temp.ch_keys(s)='accepted,closes_at,ends_at,everyone,going,host,is_group,last,last_read_id,members,'
  'message_count,muted_chat,muted_resbite,names,open,pinned,plan_id,repeat_weeks,rules_accepted,series_id,starts_at,status,stopped,time_zone,title,unread',
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

-- A weekly series, a group since chat plan 2 (plans_group_flag on create_plan_v4): every guest row of its current
-- occurrence is in, whatever the answer. Before the roll: 01, 02, 03 and 05 (not answered). The roll makes the next
-- occurrence in the same series, with no second chats row; it becomes the current occurrence, and membership follows
-- it: everyone carried is in again (not answered there; 02 carried as an admin), and still once 03 answers Going. A
-- running group has no close time and is open, before the roll and after it.
do $$ begin
 perform pg_temp.ch_check(pg_temp.ch_who(array(select private.chat_members(pg_temp.c1p('02'))))='01,02,03,05',
  'chat_members of the weekly series before the roll: '||pg_temp.ch_who(array(select private.chat_members(pg_temp.c1p('02')))));
 perform pg_temp.ch_check(private.chat_closes_at(pg_temp.c1p('02')) is null and private.chat_open(pg_temp.c1p('02')),
  'The running weekly chat has a close time, or is closed');
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
 perform pg_temp.ch_check(private.chat_closes_at(pg_temp.c1p('02')) is null and private.chat_open(pg_temp.c1p('02')),
  'The rolled weekly chat has a close time, or is closed');
 perform pg_temp.ch_check(pg_temp.ch_who(array(select private.chat_members(pg_temp.c1p('02'))))='01,02,03,05',
  'chat_members after the roll: '||pg_temp.ch_who(array(select private.chat_members(pg_temp.c1p('02')))));
end $$;
select set_config('resbite.system','roll',true);
update public.attendees set response='accepted'
 where plan_id=(select id from public.plans where repeats_from=pg_temp.c1p('02')) and user_id=pg_temp.c1('03');
select set_config('resbite.system','',true);
do $$ begin
 perform pg_temp.ch_check(pg_temp.ch_who(array(select private.chat_members(pg_temp.c1p('02'))))='01,02,03,05',
  'chat_members once 03 is Going on the rolled occurrence: '||pg_temp.ch_who(array(select private.chat_members(pg_temp.c1p('02')))));
 perform pg_temp.ch_as(pg_temp.c1('03'));
 perform pg_temp.ch_check((public.chat_summary(pg_temp.c1p('02'))->>'plan_id')::uuid=(select id from public.plans where repeats_from=pg_temp.c1p('02'))
  and public.chat_summary(pg_temp.c1p('02'))@>jsonb_build_object('series_id',pg_temp.c1p('02'),'repeat_weeks',1,'is_group',true),
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
-- has the plan's shape, with its plan_id since chat plan 2 (its chat_row); client_id is there only on the viewer's own
-- rows, and is the one stored.
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
   perform pg_temp.ch_check(pg_temp.ch_keys(v_row)='audience,author_id,body,client_id,created_at,event,id,kind,payload,plan_id,state,updated_at'
    and (v_row->>'client_id')::uuid=m.client_id,'03''s own row has no client_id, or the wrong one: '||v_row::text);
  else
   perform pg_temp.ch_check(pg_temp.ch_keys(v_row)='audience,author_id,body,created_at,event,id,kind,payload,plan_id,state,updated_at',
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
-- count, names covering each last row, and no announcement (03 has no unanswered invitation). As 05: one chat, the
-- weekly series' (a group since chat plan 2, so 05's unanswered row there makes 05 a member; not the one-off's) and,
-- for the one-off, where 05 has not answered, that announcement with its id, author and words (SHOULD 7), names
-- covering its author. As 07 (Can't go after Going): no chat and no announcement. Since chat plan 2 the weekly
-- series' last row is the roll's next line (actor null, so unread for both): 03, Going on the rolled occurrence, reads
-- its place; 05, who has not answered there, reads it without (Decision 11).
-- The card's announcement (H22, H23) is the series' latest sent announcement whose audience includes the caller: a
-- newer one to Going, or a newer one to everyone that was removed, leaves 05's card on the first. It is listed only for
-- the caller's unanswered row on the series' current occurrence while that is active and has not ended: a cancelled
-- or ended one-off gives none, though its chat may still be open; on the weekly series, a group since chat plan 2, an
-- announcement written on the past occurrence is on no card (it was last week's: ruling GR4, I-1), one written on the
-- current occurrence is listed under its id, and a row left only on the past occurrence gives none.
-- Every announcement here leaves 'sent' and both ids go back afterwards, so slice 2 starts with no pinned announcement.
do $$ declare v_ann bigint; v_going bigint; v_gone bigint; v_week bigint; v_msg bigint; v_last bigint; v_pinned bigint; v_next uuid;
 s jsonb; o jsonb; v_line public.messages; begin
 select * into v_line from public.messages where series_id=pg_temp.c1p('02') and kind='system' and event='next';
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
 perform pg_temp.ch_check(pg_temp.ch_keys(o)='announcements,chats,inviters,names' and pg_temp.ch_keys(o->'chats')=pg_temp.c1p('01')||','||pg_temp.c1p('02'),
  'my_chat_overview as 03: '||o::text);
 perform pg_temp.ch_check(o->'chats'->(pg_temp.c1p('01')::text)=jsonb_build_object('unread',true,'last',s->'last','open',true,
   'count',(select message_count from public.chats where series_id=pg_temp.c1p('01'))),'The overview''s one-off entry: '||(o->'chats'->(pg_temp.c1p('01')::text))::text);
 perform pg_temp.ch_check(o->'chats'->(pg_temp.c1p('02')::text)=jsonb_build_object('unread',true,'last',private.chat_row(v_line,pg_temp.c1('03')),
   'open',true,'count',(select message_count from public.chats where series_id=pg_temp.c1p('02')))
  and (select last_message_id from public.chats where series_id=pg_temp.c1p('02'))=v_line.id
  and o->'chats'->(pg_temp.c1p('02')::text)->'last'->'payload'->>'place_label'='The park','The overview''s weekly entry: '||o::text);
 perform pg_temp.ch_check(o->'announcements'='{}'::jsonb and o->'names'=jsonb_build_object(pg_temp.c1('04')::text,'Leo'),
  'The overview''s announcements or names as 03: '||o::text);
 perform pg_temp.ch_as(pg_temp.c1('05'));
 o := public.my_chat_overview();
 perform pg_temp.ch_check(o=jsonb_build_object('chats',jsonb_build_object(pg_temp.c1p('02')::text,jsonb_build_object('unread',true,
   'last',private.chat_row(v_line,pg_temp.c1('05')),'open',true,'count',(select message_count from public.chats where series_id=pg_temp.c1p('02')))),
  'announcements',jsonb_build_object(pg_temp.c1p('01')::text,
  jsonb_build_object('id',v_ann,'author_id',pg_temp.c1('01'),'body','Doors open at 7')),
  'inviters',jsonb_build_object(pg_temp.c1p('01')::text,pg_temp.c1('01'),v_next::text,pg_temp.c1('01')),'names',jsonb_build_object(pg_temp.c1('01')::text,'Ana')),
  'my_chat_overview as 05: '||o::text);
 perform pg_temp.ch_check(v_line.id is not null and not (o->'chats'->(pg_temp.c1p('02')::text)->'last'->'payload' ? 'place_label')
   and o->'chats'->(pg_temp.c1p('02')::text)->'last'->'payload' ? 'place_tbd','05 reads the next line''s place: '||o::text);
 perform pg_temp.ch_as(pg_temp.c1('07'));
 o := public.my_chat_overview();
 perform pg_temp.ch_check(o=jsonb_build_object('chats','{}'::jsonb,'announcements','{}'::jsonb,'inviters','{}'::jsonb,'names','{}'::jsonb),'my_chat_overview as 07: '||o::text);
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
 -- The weekly series: written on the past occurrence, on no card; written on the current one, listed under its id.
 insert into public.messages(series_id,plan_id,author_id,kind,audience,body,created_at,updated_at) values
  (pg_temp.c1p('02'),pg_temp.c1p('02'),pg_temp.c1('01'),'announcement','everyone','Last week''s water',now()-interval '1 hour',now()-interval '1 hour')
  returning id into v_week;
 perform pg_temp.ch_check(pg_temp.ch_keys(public.my_chat_overview()->'announcements')=pg_temp.c1p('01')::text,
  'Last week''s announcement is on 05''s card for this week: '||(public.my_chat_overview()->'announcements')::text);
 update public.messages set state='deleted' where id=v_week;
 insert into public.messages(series_id,plan_id,author_id,kind,audience,body,created_at,updated_at) values
  (pg_temp.c1p('02'),v_next,pg_temp.c1('01'),'announcement','everyone','Bring water',now()-interval '1 hour',now()-interval '1 hour')
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
 perform pg_temp.ch_check(public.my_chat_overview()->'announcements'='{}'::jsonb
   and pg_temp.ch_keys(public.my_chat_overview()->'chats')=pg_temp.c1p('02')::text,'A deleted announcement is on 05''s card, or 05''s chats changed');
 update public.chats set pinned_message_id=v_pinned,last_message_id=v_last where series_id=pg_temp.c1p('01');
end $$;
-- my_chat_overview as a signed-in 03 and 05.
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('03'));
select pg_temp.ch_check(pg_temp.ch_keys(public.my_chat_overview()->'chats')=pg_temp.c1p('01')||','||pg_temp.c1p('02'),
 'my_chat_overview as a signed-in 03 does not list its two chats');
select pg_temp.ch_as(pg_temp.c1('05'));
select pg_temp.ch_check(pg_temp.ch_keys(public.my_chat_overview()->'chats')=pg_temp.c1p('02')::text,
 'my_chat_overview as a signed-in 05 does not list the weekly group''s chat alone');
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

-- Slice 2 (Task 2): writing, announcements, delete and remove, mutes and reads; the two notices with one push a minute
-- (Decision 6), the claim's chat fields and its order (K-B3), and a delivery handed back (H21). On slice 1's cast and
-- plans: in the one-off's chat, 01 (the owner), 02 (an admin), 03 and 04 (Maybe), with 05 not answered; in the weekly
-- series' chat (its rolled occurrence, a group since chat plan 2), 01, 02, 03 and 05, who has not answered. Every row
-- written here is made in this transaction, after now(): each send counts toward its author's 30 a minute, each
-- announcement toward its author's one a minute in that chat, and each notice is inside the 60 seconds, unless a check
-- moves it back by hand. Ids pass between statements in transaction-local settings (c1.…).

-- 03 writes 'I can bring the snacks', signed in: a message by 03, sent, with its client id, returned as chat_row gives
-- it, and the chat's last message. Each other person in the chat, 01, 02 and 04, has a chat_message notice about it
-- (not 03, the author, nor 05, who is not in the chat), on the one-off, with 03 as actor, the message as message_id
-- and the key chat:<id>:<recipient> (K-B3.1).
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('03'));
select set_config('c1.snack_client',gen_random_uuid()::text,true);
select set_config('c1.snack_row',public.send_message(pg_temp.c1p('01'),'I can bring the snacks',current_setting('c1.snack_client')::uuid)::text,true);
reset role;
select set_config('c1.snack',current_setting('c1.snack_row')::jsonb->>'id',true);
do $$ declare v_id bigint := current_setting('c1.snack')::bigint; m public.messages; begin
 select * into m from public.messages where id=v_id;
 perform pg_temp.ch_check((m.series_id,m.plan_id,m.author_id,m.kind,m.audience,m.event,m.payload,m.body,m.state,m.client_id)
   is not distinct from (pg_temp.c1p('01'),pg_temp.c1p('01'),pg_temp.c1('03'),'message'::text,null::text,null::text,null::jsonb,
    'I can bring the snacks'::text,'sent'::text,current_setting('c1.snack_client')::uuid),'03''s message is not stored as sent: '||row_to_json(m)::text);
 perform pg_temp.ch_check(current_setting('c1.snack_row')::jsonb=private.chat_row(m,pg_temp.c1('03')),
  'send_message does not return the row as chat_row gives it: '||current_setting('c1.snack_row'));
 perform pg_temp.ch_check(pg_temp.ch_to('chat_message',v_id)='01,02,04','03''s message was told to '||pg_temp.ch_to('chat_message',v_id));
 perform pg_temp.ch_check(not exists(select 1 from private.notification_outbox o where o.message_id=v_id
   and (o.kind,o.plan_id,o.actor_id,o.dedupe_key,o.detail)
   is distinct from ('chat_message'::text,pg_temp.c1p('01'),pg_temp.c1('03'),'chat:'||v_id||':'||o.recipient_id,null::text)),
  'A notice of 03''s message has the wrong kind, plan, actor, key or detail');
 perform pg_temp.ch_check((select (c.last_message_id,c.last_message_at) from public.chats c where c.series_id=pg_temp.c1p('01'))
   is not distinct from (v_id,m.created_at),'The chat''s last message is not 03''s');
end $$;
-- The author's lock (H28): send_message takes require_tester's key itself before its limits, so one person's writes
-- queue one after another on hosted too, where require_tester takes no lock.
select pg_temp.ch_check(pg_temp.ch_locked(pg_temp.c1('03')),'send_message does not take its author''s lock');

-- The same client id again (K-S8, step 1, before every other check) is the stored row, whatever the words, and tells
-- nobody again. On the weekly series, or as an announcement (03 being no host), it is not that message: 22023 'Invalid
-- message'.
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('03'));
select pg_temp.ch_check(public.send_message(pg_temp.c1p('01'),'Something else',current_setting('c1.snack_client')::uuid)
 =current_setting('c1.snack_row')::jsonb,'The same client id again is not the stored row');
select pg_temp.ch_refused($$select public.send_message(pg_temp.c1p('02'),'I can bring the snacks',current_setting('c1.snack_client')::uuid)$$,
 '22023','Invalid message');
select pg_temp.ch_refused($$select public.send_announcement(pg_temp.c1p('01'),'I can bring the snacks','everyone',
 current_setting('c1.snack_client')::uuid)$$,'22023','Invalid message');
reset role;
select pg_temp.ch_check((select count(*) from public.messages where client_id=current_setting('c1.snack_client')::uuid)=1
 and pg_temp.ch_to('chat_message',current_setting('c1.snack')::bigint)='01,02,04','The repeat made a row or a notice');

-- The words (step 4; H28, H30): trimmed at both ends of white space (U+00A0, U+0085, U+115F, U+2060, U+2800, U+3164,
-- U+FFA0 and the other blanks this database's \s misses included) and of ZWNJ; then 1 to 1000 characters, at least one
-- of them visible: not white space, a control (Cc) or format (Cf) character, a default-ignorable one (U+034F, the
-- Hangul fillers, the variation selectors, the tags) or U+2800. Refused, 22023 'Invalid message', nothing stored: '',
-- '   ', two newlines, a lone U+00A0, a zero-width space, U+3000 with a BOM, ZWNJ, ZWJ, a word joiner, NEL, U+180E, a
-- soft hyphen, the Hangul fillers, a braille blank, RLO, LRI with PDI, invisible times, VS16, a combining grapheme
-- joiner, a tag space, BEL, ESC, DEL, a mix of them, 1001 characters, and none at all. Over 16,000 bytes is refused
-- before any pattern is run, whatever the words (H42 M4): 'hi' in 16,001 bytes of spaces, and in a megabyte of them.
-- Stored: '  hi\n' as 'hi', ZWNJ hi ZWNJ as 'hi', a word joiner, hi and a braille blank as 'hi', 1000 characters
-- between spaces whole, 'hi' in exactly 16,000 bytes of spaces as 'hi', an emoji held together by ZWJ whole, and a
-- zero-width space inside a word kept. None is told to anyone: 01, 02 and 04 have 03's notice from this minute (one
-- push a minute).
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('03'));
select pg_temp.ch_refused(format('select public.send_message(%L,%L,gen_random_uuid())',pg_temp.c1p('01'),b),'22023','Invalid message')
from unnest(array['','   ',e'\n\n',e'\u00a0',e'\u200b',e'\u3000\ufeff',e'\u200c',e'\u200d',e'\u2060',e'\u0085',e'\u180e',
 e'\u00ad',e'\u3164',e'\uffa0',e'\u115f\u1160',e'\u2800',e'\u202e',e'\u2066\u2069',e'\u2062',e'\ufe0f',e'\u034f',e'\U000e0020',
 e'\u0007',e'\u001b',e'\u007f',e' \u200d\u2060\u00ad\u034f \u2800\t',repeat('a',1001),repeat(' ',7999)||'hi'||repeat(' ',8000),
 repeat(' ',500000)||'hi'||repeat(' ',500000)]) b;
select pg_temp.ch_refused(format('select public.send_message(%L,null,gen_random_uuid())',pg_temp.c1p('01')),'22023','Invalid message');
select set_config('c1.hi',pg_temp.ch_send(pg_temp.c1p('01'),e'  hi\n')::text,true);
select set_config('c1.long',pg_temp.ch_send(pg_temp.c1p('01'),e'\u00a0 '||repeat('é',1000)||e'\u3000\n')::text,true);
select set_config('c1.padded',pg_temp.ch_send(pg_temp.c1p('01'),repeat(' ',7999)||'hi'||repeat(' ',7999))::text,true);
select set_config('c1.zwnj',pg_temp.ch_send(pg_temp.c1p('01'),e'\u200chi\u200c')::text,true);
select set_config('c1.joiner',pg_temp.ch_send(pg_temp.c1p('01'),e'\u2060hi\u2800')::text,true);
select set_config('c1.emoji',pg_temp.ch_send(pg_temp.c1p('01'),e'\U0001f469\u200d\U0001f4bb')::text,true);
select set_config('c1.inner',pg_temp.ch_send(pg_temp.c1p('01'),e'no\u200bspace')::text,true);
reset role;
do $$ begin
 perform pg_temp.ch_check((select body from public.messages where id=current_setting('c1.hi')::bigint)='hi','''  hi\n'' is not stored as ''hi''');
 perform pg_temp.ch_check((select body from public.messages where id=current_setting('c1.long')::bigint)=repeat('é',1000),
  '1000 characters between spaces are not stored whole');
 perform pg_temp.ch_check((select body from public.messages where id=current_setting('c1.padded')::bigint)='hi',
  '''hi'' in 16,000 bytes of spaces is not stored as ''hi''');
 perform pg_temp.ch_check((select body from public.messages where id=current_setting('c1.zwnj')::bigint)='hi'
   and (select body from public.messages where id=current_setting('c1.joiner')::bigint)='hi','ZWNJ, a word joiner or a braille blank at the ends was kept');
 perform pg_temp.ch_check((select body from public.messages where id=current_setting('c1.emoji')::bigint)=e'\U0001f469\u200d\U0001f4bb'
   and (select body from public.messages where id=current_setting('c1.inner')::bigint)=e'no\u200bspace','A joined emoji or an inner zero-width space was changed');
 perform pg_temp.ch_check((select count(*) from public.messages where author_id=pg_temp.c1('03') and created_at>=now())=8,
  'A refused message was stored');
 perform pg_temp.ch_check(not exists(select 1 from private.notification_outbox where message_id in (current_setting('c1.hi')::bigint,
   current_setting('c1.long')::bigint,current_setting('c1.padded')::bigint,current_setting('c1.zwnj')::bigint,current_setting('c1.joiner')::bigint,current_setting('c1.emoji')::bigint,
   current_setting('c1.inner')::bigint)),'03''s next messages in the minute were told');
end $$;

-- Not in the chat (step 2, before the words): 05 (not answered), 08 (a stranger) and 07 (Can't go after Going), and
-- anyone on a series that does not exist: 42501 'Not in this chat'.
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('05'));
select pg_temp.ch_refused($$select public.send_message(pg_temp.c1p('01'),'Hello?',gen_random_uuid())$$,'42501','Not in this chat');
select pg_temp.ch_refused($$select public.send_message(pg_temp.c1p('01'),'',gen_random_uuid())$$,'42501','Not in this chat');
select pg_temp.ch_as(pg_temp.c1('08'));
select pg_temp.ch_refused($$select public.send_message(pg_temp.c1p('01'),'Hello?',gen_random_uuid())$$,'42501','Not in this chat');
select pg_temp.ch_as(pg_temp.c1('07'));
select pg_temp.ch_refused($$select public.send_message(pg_temp.c1p('01'),'Hello?',gen_random_uuid())$$,'42501','Not in this chat');
select pg_temp.ch_as(pg_temp.c1('03'));
select pg_temp.ch_refused($$select public.send_message(gen_random_uuid(),'Hello?',gen_random_uuid())$$,'42501','Not in this chat');
-- 04 writes right after: 01 and 02 have 03's notice from this minute, so only 03 is told.
select pg_temp.ch_as(pg_temp.c1('04'));
select set_config('c1.count_me',pg_temp.ch_send(pg_temp.c1p('01'),'Count me in')::text,true);
reset role;
select pg_temp.ch_check(pg_temp.ch_to('chat_message',current_setting('c1.count_me')::bigint)='03',
 '04''s message right after 03''s was told to '||pg_temp.ch_to('chat_message',current_setting('c1.count_me')::bigint));

-- Announcements (K-S8). 03 and 05 are no hosts: 42501 'Hosts only'. 02, an admin, announces 'Doors open at 19:30' to
-- everyone: an announcement with its audience, returned as chat_row gives it, and pinned (K-S12). Everyone it reaches
-- but 02 has an announcement notice, though 01, 03 and 04 have chat notices this minute (CH-P7: never held back):
-- 01, 03, 04 and 05, who has not answered; with 02 as actor, the announcement as message_id (H6) and the key
-- announce:<id>:<recipient>. The summary pins it, and 05's My resbites shows it on the invitation card with its id and
-- its author's name (SHOULD 7, H15).
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('03'));
select pg_temp.ch_refused($$select public.send_announcement(pg_temp.c1p('01'),'Doors open at 7','everyone',gen_random_uuid())$$,'42501','Hosts only');
select pg_temp.ch_as(pg_temp.c1('05'));
select pg_temp.ch_refused($$select public.send_announcement(pg_temp.c1p('01'),'Doors open at 7','everyone',gen_random_uuid())$$,'42501','Hosts only');
select pg_temp.ch_as(pg_temp.c1('02'));
select set_config('c1.doors_client',gen_random_uuid()::text,true);
select set_config('c1.doors_row',public.send_announcement(pg_temp.c1p('01'),'Doors open at 19:30','everyone',
 current_setting('c1.doors_client')::uuid)::text,true);
reset role;
select set_config('c1.doors',current_setting('c1.doors_row')::jsonb->>'id',true);
do $$ declare v_id bigint := current_setting('c1.doors')::bigint; m public.messages; o jsonb; begin
 select * into m from public.messages where id=v_id;
 perform pg_temp.ch_check((m.series_id,m.plan_id,m.author_id,m.kind,m.audience,m.body,m.state,m.client_id)
   is not distinct from (pg_temp.c1p('01'),pg_temp.c1p('01'),pg_temp.c1('02'),'announcement'::text,'everyone'::text,
    'Doors open at 19:30'::text,'sent'::text,current_setting('c1.doors_client')::uuid),'02''s announcement is not stored: '||row_to_json(m)::text);
 perform pg_temp.ch_check(current_setting('c1.doors_row')::jsonb=private.chat_row(m,pg_temp.c1('02')),
  'send_announcement does not return the row as chat_row gives it');
 perform pg_temp.ch_check((select pinned_message_id from public.chats where series_id=pg_temp.c1p('01'))=v_id,'02''s announcement is not pinned');
 perform pg_temp.ch_check(pg_temp.ch_to('announcement',v_id)='01,03,04,05' and pg_temp.ch_to('chat_message',v_id)='',
  '02''s announcement was told to '||pg_temp.ch_to('announcement',v_id));
 perform pg_temp.ch_check(not exists(select 1 from private.notification_outbox o where o.message_id=v_id
   and (o.plan_id,o.actor_id,o.dedupe_key,o.detail) is distinct from (pg_temp.c1p('01'),pg_temp.c1('02'),'announce:'||v_id||':'||o.recipient_id,null::text)),
  'An announcement notice has the wrong plan, actor, key or detail');
 perform pg_temp.ch_as(pg_temp.c1('03'));
 perform pg_temp.ch_check((public.chat_summary(pg_temp.c1p('01'))->'pinned'->>'id')::bigint=v_id,'The summary does not pin 02''s announcement');
 perform pg_temp.ch_as(pg_temp.c1('05'));
 o := public.my_chat_overview();
 -- 05's one chat is the weekly group's (chat plan 2), whose last row names its author too.
 perform pg_temp.ch_check(o->'announcements'=jsonb_build_object(pg_temp.c1p('01')::text,
   jsonb_build_object('id',v_id,'author_id',pg_temp.c1('02'),'body','Doors open at 19:30')) and o->'names'@>jsonb_build_object(pg_temp.c1('02')::text,'Ada')
   and pg_temp.ch_keys(o->'chats')=pg_temp.c1p('02')::text,'my_chat_overview as 05: '||o::text);
end $$;
select pg_temp.ch_check(pg_temp.ch_locked(pg_temp.c1('02')),'send_announcement does not take its author''s lock');

-- One announcement a minute per author and chat (K-S8): 02 again in the one-off, to either audience: 22023 'Too fast'.
-- Before that check (step 3): an audience that is neither going nor everyone, none, or no words: 22023 'Invalid
-- message'. Before every check (step 1): its client id again is the stored announcement, and as a message it is not
-- that message: 'Invalid message'. 02 may announce on the weekly series in the same minute, to everyone there but 02:
-- 01, 03 and 05. 01, another host, may announce in the one-off in that minute, to Going: 02, 03 and 04, and it is pinned.
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('02'));
select pg_temp.ch_refused($$select public.send_announcement(pg_temp.c1p('01'),'Doors open at 19:45','everyone',gen_random_uuid())$$,'22023','Too fast');
select pg_temp.ch_refused($$select public.send_announcement(pg_temp.c1p('01'),'Doors open at 19:45','going',gen_random_uuid())$$,'22023','Too fast');
select pg_temp.ch_refused($$select public.send_announcement(pg_temp.c1p('01'),'Doors open at 19:45','all',gen_random_uuid())$$,'22023','Invalid message');
select pg_temp.ch_refused($$select public.send_announcement(pg_temp.c1p('01'),'Doors open at 19:45',null,gen_random_uuid())$$,'22023','Invalid message');
select pg_temp.ch_refused($$select public.send_announcement(pg_temp.c1p('01'),e' \u00a0','everyone',gen_random_uuid())$$,'22023','Invalid message');
select pg_temp.ch_refused($$select public.send_announcement(pg_temp.c1p('01'),e'\u200d\u2060','everyone',gen_random_uuid())$$,'22023','Invalid message');
select pg_temp.ch_check(public.send_announcement(pg_temp.c1p('01'),'Doors open at 19:45','going',current_setting('c1.doors_client')::uuid)
 =current_setting('c1.doors_row')::jsonb,'The same announcement again is not the stored row');
select pg_temp.ch_refused($$select public.send_message(pg_temp.c1p('01'),'Doors open at 19:30',current_setting('c1.doors_client')::uuid)$$,
 '22023','Invalid message');
select set_config('c1.water',(public.send_announcement(pg_temp.c1p('02'),'Bring water','everyone',gen_random_uuid())->>'id'),true);
select pg_temp.ch_as(pg_temp.c1('01'));
select set_config('c1.game',(public.send_announcement(pg_temp.c1p('01'),'Bring a game','going',gen_random_uuid())->>'id'),true);
reset role;
do $$ begin
 perform pg_temp.ch_check((select count(*) from public.messages where author_id=pg_temp.c1('02') and created_at>=now())=2,
  'A refused announcement was stored');
 perform pg_temp.ch_check(pg_temp.ch_to('announcement',current_setting('c1.water')::bigint)='01,03,05',
  '02''s weekly announcement was told to '||pg_temp.ch_to('announcement',current_setting('c1.water')::bigint));
 perform pg_temp.ch_check(pg_temp.ch_to('announcement',current_setting('c1.game')::bigint)='02,03,04',
  '01''s announcement to Going was told to '||pg_temp.ch_to('announcement',current_setting('c1.game')::bigint));
 perform pg_temp.ch_check((select pinned_message_id from public.chats where series_id=pg_temp.c1p('01'))=current_setting('c1.game')::bigint
  and (select pinned_message_id from public.chats where series_id=pg_temp.c1p('02'))=current_setting('c1.water')::bigint,
  'The latest announcements are not pinned');
end $$;

-- One push a minute (K-B3.1, Decision 6). Every chat notice so far is moved 61 s back. 03 writes in the weekly series:
-- 01, 02 and 05 (a member of the group, chat plan 2) are told there. Then 04 writes five messages within the minute in the one-off: the first is told to 01, 02
-- and 03, the other four to nobody, and those are the only chat notices of the one-off from the last 60 seconds; 01's
-- notice from the weekly series a moment before does not hold the one-off's back. Once those three are 61 s old, 04's
-- sixth is told to each of them again.
update private.notification_outbox set created_at=created_at-interval '61 seconds' where kind='chat_message';
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('03'));
select set_config('c1.weekly',pg_temp.ch_send(pg_temp.c1p('02'),'Same time next week?')::text,true);
select pg_temp.ch_as(pg_temp.c1('04'));
do $$ declare g int; v text := ''; begin
 for g in 1..5 loop
  v := v||case when g>1 then ',' else '' end||pg_temp.ch_send(pg_temp.c1p('01'),'Round '||g);
 end loop;
 perform set_config('c1.five',v,true);
end $$;
reset role;
do $$ declare v_five bigint[] := string_to_array(current_setting('c1.five'),',')::bigint[]; begin
 perform pg_temp.ch_check(pg_temp.ch_to('chat_message',current_setting('c1.weekly')::bigint)='01,02,05',
  '03''s weekly message was told to '||pg_temp.ch_to('chat_message',current_setting('c1.weekly')::bigint));
 perform pg_temp.ch_check(pg_temp.ch_to('chat_message',v_five[1])='01,02,03','04''s first was told to '||pg_temp.ch_to('chat_message',v_five[1]));
 perform pg_temp.ch_check(not exists(select 1 from private.notification_outbox where message_id=any(v_five[2:5])),'04''s second to fifth were told');
 perform pg_temp.ch_check((select string_agg(right(o.recipient_id::text,2)||':'||o.message_id,',' order by o.recipient_id)
   from private.notification_outbox o join public.messages m on m.id=o.message_id
   where o.kind='chat_message' and m.series_id=pg_temp.c1p('01') and o.created_at>now()-interval '60 seconds')
   ='01:'||v_five[1]||',02:'||v_five[1]||',03:'||v_five[1],'The one-off''s chat notices of the minute are not one each for 01, 02 and 03');
end $$;
update private.notification_outbox set created_at=created_at-interval '61 seconds'
 where message_id=(string_to_array(current_setting('c1.five'),','))[1]::bigint;
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('04'));
select set_config('c1.sixth',pg_temp.ch_send(pg_temp.c1p('01'),'Round 6')::text,true);
reset role;
select pg_temp.ch_check(pg_temp.ch_to('chat_message',current_setting('c1.sixth')::bigint)='01,02,03',
 '04''s sixth, a minute on, was told to '||pg_temp.ch_to('chat_message',current_setting('c1.sixth')::bigint));

-- Who may be told (CH-P8, K-N3), as private.notification_recipient_eligible decides for the claim and the sender. 03
-- mutes the one-off's chat (twice: one row; the summary says so): the chat notice to 03 (04's sixth) is no longer
-- eligible, and the announcement to 03 (02's) still is. A plan_mutes row for 03 on the series silences both. Both
-- rows go, and both notices are eligible again. 05 is not in the chat: set_chat_mute refuses, 42501 'Not in this chat'.
do $$ begin
 perform pg_temp.ch_check(private.notification_recipient_eligible(pg_temp.ch_notice('chat_message',current_setting('c1.sixth')::bigint,'03'))
  and private.notification_recipient_eligible(pg_temp.ch_notice('announcement',current_setting('c1.doors')::bigint,'03')),
  'The notices to 03 are not eligible before any mute');
end $$;
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('03'));
select public.set_chat_mute(pg_temp.c1p('01'),true);
select public.set_chat_mute(pg_temp.c1p('01'),true);
select pg_temp.ch_check(public.chat_summary(pg_temp.c1p('01'))@>'{"muted_chat":true,"muted_resbite":false}','03''s chat mute is not in the summary');
select pg_temp.ch_as(pg_temp.c1('05'));
select pg_temp.ch_refused($$select public.set_chat_mute(pg_temp.c1p('01'),true)$$,'42501','Not in this chat');
reset role;
do $$ declare v_msg bigint := pg_temp.ch_notice('chat_message',current_setting('c1.sixth')::bigint,'03');
 v_ann bigint := pg_temp.ch_notice('announcement',current_setting('c1.doors')::bigint,'03'); begin
 perform pg_temp.ch_check((select count(*) from public.chat_mutes where series_id=pg_temp.c1p('01'))=1
  and exists(select 1 from public.chat_mutes where series_id=pg_temp.c1p('01') and user_id=pg_temp.c1('03')),'03''s chat mute is not one row');
 perform pg_temp.ch_check(not private.notification_recipient_eligible(v_msg),'A chat notice to 03, who muted the chat, is eligible');
 perform pg_temp.ch_check(private.notification_recipient_eligible(v_ann),'An announcement to 03, who muted the chat, is not eligible');
 insert into public.plan_mutes(series_id,user_id) values (pg_temp.c1p('01'),pg_temp.c1('03'));
 perform pg_temp.ch_check(not private.notification_recipient_eligible(v_msg) and not private.notification_recipient_eligible(v_ann),
  'A plan_mutes row does not silence both');
 delete from public.plan_mutes where user_id=pg_temp.c1('03');
end $$;
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('03'));
select public.set_chat_mute(pg_temp.c1p('01'),false);
select pg_temp.ch_check(public.chat_summary(pg_temp.c1p('01'))@>'{"muted_chat":false}','03''s chat mute stayed in the summary');
reset role;
select pg_temp.ch_check(not exists(select 1 from public.chat_mutes)
 and private.notification_recipient_eligible(pg_temp.ch_notice('chat_message',current_setting('c1.sixth')::bigint,'03')),
 'The unmuted chat notice to 03 is not eligible');

-- Ages (K-N3): a chat notice is eligible at 59 minutes and not at 61; an announcement notice at 23 hours and not at 25.
-- Each goes back to now() afterwards.
do $$ declare v_msg bigint := pg_temp.ch_notice('chat_message',current_setting('c1.sixth')::bigint,'03');
 v_ann bigint := pg_temp.ch_notice('announcement',current_setting('c1.doors')::bigint,'03'); begin
 update private.notification_outbox set created_at=now()-interval '59 minutes' where id=v_msg;
 perform pg_temp.ch_check(private.notification_recipient_eligible(v_msg),'A chat notice 59 minutes old is not eligible');
 update private.notification_outbox set created_at=now()-interval '61 minutes' where id=v_msg;
 perform pg_temp.ch_check(not private.notification_recipient_eligible(v_msg),'A chat notice 61 minutes old is eligible');
 update private.notification_outbox set created_at=now()-interval '23 hours' where id=v_ann;
 perform pg_temp.ch_check(private.notification_recipient_eligible(v_ann),'An announcement notice 23 hours old is not eligible');
 update private.notification_outbox set created_at=now()-interval '25 hours' where id=v_ann;
 perform pg_temp.ch_check(not private.notification_recipient_eligible(v_ann),'An announcement notice 25 hours old is eligible');
 update private.notification_outbox set created_at=now() where id in (v_msg,v_ann);
end $$;

-- 04 says Can't go (by hand, under the flag): the chat notice queued to 04 (03's message) is no longer eligible, nor
-- either announcement to 04 (04 is now in neither audience). 05, who has not answered, may still be told 02's
-- announcement to everyone. 04 is Maybe again afterwards, and told again.
select set_config('resbite.system','roll',true);
update public.attendees set response='declined' where plan_id=pg_temp.c1p('01') and user_id=pg_temp.c1('04');
select set_config('resbite.system','',true);
do $$ begin
 perform pg_temp.ch_check(not private.notification_recipient_eligible(pg_temp.ch_notice('chat_message',current_setting('c1.snack')::bigint,'04')),
  'A chat notice to 04, who said Can''t go, is eligible');
 perform pg_temp.ch_check(not private.notification_recipient_eligible(pg_temp.ch_notice('announcement',current_setting('c1.doors')::bigint,'04'))
  and not private.notification_recipient_eligible(pg_temp.ch_notice('announcement',current_setting('c1.game')::bigint,'04')),
  'An announcement to 04, who said Can''t go, is eligible');
 perform pg_temp.ch_check(private.notification_recipient_eligible(pg_temp.ch_notice('announcement',current_setting('c1.doors')::bigint,'05')),
  'The announcement to everyone is not eligible for 05, who has not answered');
end $$;
select set_config('resbite.system','roll',true);
update public.attendees set response='maybe' where plan_id=pg_temp.c1p('01') and user_id=pg_temp.c1('04');
select set_config('resbite.system','',true);
select pg_temp.ch_check(private.notification_recipient_eligible(pg_temp.ch_notice('chat_message',current_setting('c1.snack')::bigint,'04'))
 and private.notification_recipient_eligible(pg_temp.ch_notice('announcement',current_setting('c1.game')::bigint,'04')),'04, Maybe again, may not be told');

-- Who an announcement to everyone reaches on a one-off (H30): the people who have not answered only while it is active
-- and has not ended. Ended an hour ago, its chat still open, 05 is in no audience and 05's notice of 02's announcement
-- is no longer eligible; 03's still is. Cancelled, the plan's announcement notices are eligible to nobody, 03 and the
-- Going announcement's 04 included, and so is its chat notice to 03 (Task 3). The times and the status go back
-- afterwards, and the notices are eligible again.
select set_config('resbite.system','roll',true);
update public.plans set starts_at=now()-interval '4 hours',ends_at=now()-interval '1 hour' where id=pg_temp.c1p('01');
select set_config('resbite.system','',true);
do $$ begin
 perform pg_temp.ch_check(private.chat_open(pg_temp.c1p('01'))
   and pg_temp.ch_who(array(select private.announcement_audience(pg_temp.c1p('01'),'everyone')))='01,02,03,04',
  'Everyone on an ended one-off: '||pg_temp.ch_who(array(select private.announcement_audience(pg_temp.c1p('01'),'everyone'))));
 perform pg_temp.ch_check(not private.notification_recipient_eligible(pg_temp.ch_notice('announcement',current_setting('c1.doors')::bigint,'05'))
   and private.notification_recipient_eligible(pg_temp.ch_notice('announcement',current_setting('c1.doors')::bigint,'03')),
  'After the end, the announcement to everyone may still be told to 05, or may no longer be told to 03');
end $$;
select set_config('resbite.system','roll',true);
update public.plans set starts_at=pg_temp.c1_start(),ends_at=pg_temp.c1_start()+interval '3 hours',status='cancelled' where id=pg_temp.c1p('01');
select set_config('resbite.system','',true);
do $$ begin
 perform pg_temp.ch_check(pg_temp.ch_who(array(select private.announcement_audience(pg_temp.c1p('01'),'everyone')))='01,02,03,04',
  'Everyone on a cancelled one-off: '||pg_temp.ch_who(array(select private.announcement_audience(pg_temp.c1p('01'),'everyone'))));
 perform pg_temp.ch_check(not private.notification_recipient_eligible(pg_temp.ch_notice('announcement',current_setting('c1.doors')::bigint,'03'))
   and not private.notification_recipient_eligible(pg_temp.ch_notice('announcement',current_setting('c1.doors')::bigint,'05'))
   and not private.notification_recipient_eligible(pg_temp.ch_notice('announcement',current_setting('c1.game')::bigint,'04')),
  'A cancelled plan''s announcement may still be told');
 -- A chat notice too (Task 3): nothing is pushed about a resbite that is off, though its chat still reads.
 perform pg_temp.ch_check(not private.notification_recipient_eligible(pg_temp.ch_notice('chat_message',current_setting('c1.sixth')::bigint,'03')),
  'A cancelled plan''s chat message may still be told');
end $$;
select set_config('resbite.system','roll',true);
update public.plans set status='active' where id=pg_temp.c1p('01');
select set_config('resbite.system','',true);
select pg_temp.ch_check(private.notification_recipient_eligible(pg_temp.ch_notice('announcement',current_setting('c1.doors')::bigint,'05'))
 and private.notification_recipient_eligible(pg_temp.ch_notice('announcement',current_setting('c1.doors')::bigint,'03'))
 and private.notification_recipient_eligible(pg_temp.ch_notice('chat_message',current_setting('c1.sixth')::bigint,'03')),
 'The announcement or the chat message may not be told once the one-off is active again');

-- The claim (H6, H17, H19, H21). 01 and 05 have a device. Two plan_changed notices to 01 by hand, from 02 and from 09
-- (whose account is being deleted); where the deletion lifecycle exists, a third from 08, who has a deletion request but
-- no mark on the profile. One claim as the sender. 01's notice of 03's message is a job of kind chat_message with every
-- field the sender reads: series_id, message_id (as text, H6), message_body and audience (null), and actor_name as the
-- profile has it (the sender takes the first name). 05's notice of 02's announcement carries its audience. A
-- plan_changed job carries no chat field, and actor_name is null when the actor is being deleted, either way (H19).
insert into private.device_endpoints(token,user_id,platform) values
 ('ExpoPushToken[c1ana]',pg_temp.c1('01'),'ios'),('ExpoPushToken[c1sol]',pg_temp.c1('05'),'android');
insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id,detail) values
 (pg_temp.c1p('01'),pg_temp.c1('01'),'plan_changed','c1:changed:02',pg_temp.c1('02'),'time'),
 (pg_temp.c1p('01'),pg_temp.c1('01'),'plan_changed','c1:changed:09',pg_temp.c1('09'),'time');
do $$ begin
 if to_regclass('private.account_deletion_jobs') is not null then
  insert into private.account_deletion_jobs(request_id,user_id,recovery_hash) values (gen_random_uuid(),pg_temp.c1('08'),'\x00'::bytea);
  insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id,detail) values
   (pg_temp.c1p('01'),pg_temp.c1('01'),'plan_changed','c1:changed:08',pg_temp.c1('08'),'time');
 end if;
end $$;
select set_config('c1.snack01',pg_temp.ch_notice('chat_message',current_setting('c1.snack')::bigint,'01')::text,true);
select set_config('c1.doors05',pg_temp.ch_notice('announcement',current_setting('c1.doors')::bigint,'05')::text,true);
select set_config('c1.pc02',(select id from private.notification_outbox where dedupe_key='c1:changed:02')::text,true);
select set_config('c1.pc09',(select id from private.notification_outbox where dedupe_key='c1:changed:09')::text,true);
create temporary table ch_jobs(step text, job jsonb);
grant select, insert on ch_jobs to service_role;
set local role service_role;
insert into ch_jobs select 'first', j from jsonb_array_elements(public.claim_notification_deliveries(25)) j;
reset role;
do $$ declare j jsonb; v_keys text := 'actor_name,attempts,audience,brought_by_name,detail,id,kind,lease_id,message_body,message_id,outbox_id,'
  'plan_id,recipient_id,series_id,starts_at,ticket_created_at,ticket_id,time_zone,title,token'; begin
 select job into j from ch_jobs where step='first' and job->>'outbox_id'=current_setting('c1.snack01');
 perform pg_temp.ch_check(j is not null,'01''s notice of 03''s message was not claimed');
 perform pg_temp.ch_check(pg_temp.ch_keys(j)=v_keys,'The claim''s fields: '||pg_temp.ch_keys(j));
 perform pg_temp.ch_check(j @> jsonb_build_object('kind','chat_message','plan_id',pg_temp.c1p('01'),'recipient_id',pg_temp.c1('01'),
   'token','ExpoPushToken[c1ana]','title','Board game night','detail',null,'actor_name','Mia Going','brought_by_name',null,
   'series_id',pg_temp.c1p('01'),'message_id',current_setting('c1.snack'),'message_body','I can bring the snacks','audience',null,'attempts',1),
  'The chat_message job: '||j::text);
 perform pg_temp.ch_check(jsonb_typeof(j->'message_id')='string','The job''s message_id is not text: '||j::text);
 select job into j from ch_jobs where step='first' and job->>'outbox_id'=current_setting('c1.doors05');
 perform pg_temp.ch_check(j @> jsonb_build_object('kind','announcement','recipient_id',pg_temp.c1('05'),'token','ExpoPushToken[c1sol]',
   'actor_name','Ada Admin','series_id',pg_temp.c1p('01'),'message_id',current_setting('c1.doors'),'message_body','Doors open at 19:30',
   'audience','everyone'),'The announcement job: '||coalesce(j::text,'none'));
 select job into j from ch_jobs where step='first' and job->>'outbox_id'=current_setting('c1.pc02');
 perform pg_temp.ch_check(pg_temp.ch_keys(j)=v_keys and j @> jsonb_build_object('kind','plan_changed','detail','time','actor_name','Ada Admin',
   'series_id',null,'message_id',null,'message_body',null,'audience',null),'The plan_changed job: '||coalesce(j::text,'none'));
 select job into j from ch_jobs where step='first' and job->>'outbox_id'=current_setting('c1.pc09');
 perform pg_temp.ch_check(j @> '{"kind":"plan_changed","actor_name":null}','The job from 09, being deleted, names them: '||coalesce(j::text,'none'));
 if to_regclass('private.account_deletion_jobs') is not null then
  select job into j from ch_jobs where step='first'
   and job->>'outbox_id'=(select id::text from private.notification_outbox where dedupe_key='c1:changed:08');
  perform pg_temp.ch_check(j @> '{"kind":"plan_changed","actor_name":null}','The job from 08, with a deletion request, names them: '||coalesce(j::text,'none'));
 end if;
 perform pg_temp.ch_check(not exists(select 1 from ch_jobs where step='first' and job->>'kind' in ('chat_message','announcement')
   and (jsonb_typeof(job->'message_id') is distinct from 'string' or job->>'series_id' is null or job->>'message_body' is null)),
  'A chat job lacks its series, message or words');
end $$;

-- H21: a job the sender could not start is handed back exactly as the sender asks ({p_id, p_lease, p_outcome deferred,
-- p_ticket null, p_delay_seconds 0}): pending at once, its lease gone and the attempt the claim counted given back. A
-- retry waits its 30 s; a ticket waits for its receipt. A second call on the old lease changes nothing. An unknown
-- outcome is still refused.
set local role service_role;
do $$ declare j jsonb; n int := 0; begin
 for j in select job from ch_jobs where step='first' and job->>'outbox_id' in (current_setting('c1.snack01'),current_setting('c1.doors05')) loop
  perform public.finish_notification_delivery(p_id=>(j->>'id')::uuid,p_lease=>(j->>'lease_id')::uuid,p_outcome=>'deferred',p_ticket=>null,p_delay_seconds=>0);
  perform public.finish_notification_delivery(p_id=>(j->>'id')::uuid,p_lease=>(j->>'lease_id')::uuid,p_outcome=>'deferred',p_ticket=>null,p_delay_seconds=>0);
  n := n+1;
 end loop;
 perform pg_temp.ch_check(n=2,'The jobs to hand back are not two: '||n);
 select job into j from ch_jobs where step='first' and job->>'outbox_id'=current_setting('c1.pc02');
 perform public.finish_notification_delivery((j->>'id')::uuid,(j->>'lease_id')::uuid,'retry',null,0);
 select job into j from ch_jobs where step='first' and job->>'outbox_id'=current_setting('c1.pc09');
 perform public.finish_notification_delivery((j->>'id')::uuid,(j->>'lease_id')::uuid,'ticket','c1-ticket',900);
end $$;
select pg_temp.ch_refused($$select public.finish_notification_delivery(gen_random_uuid(),gen_random_uuid(),'later',null,0)$$,'P0001','Invalid delivery outcome');
reset role;
do $$ declare d private.notification_deliveries; n int := 0; begin
 for d in select * from private.notification_deliveries where outbox_id in (current_setting('c1.snack01')::bigint,current_setting('c1.doors05')::bigint) loop
  perform pg_temp.ch_check((d.state,d.attempts,d.next_attempt_at,d.lease_id,d.lease_until,d.ticket_id)
    is not distinct from ('pending'::text,0,now(),null::uuid,null::timestamptz,null::text),'A deferred job is not pending at once with its attempt back: '||row_to_json(d)::text);
  n := n+1;
 end loop;
 perform pg_temp.ch_check(n=2,'The deferred deliveries are not two: '||n);
 select * into d from private.notification_deliveries where outbox_id=current_setting('c1.pc02')::bigint;
 perform pg_temp.ch_check((d.state,d.attempts,d.next_attempt_at) is not distinct from ('pending'::text,1,now()+interval '30 seconds'),
  'A retried job: '||row_to_json(d)::text);
 select * into d from private.notification_deliveries where outbox_id=current_setting('c1.pc09')::bigint;
 perform pg_temp.ch_check((d.state,d.attempts,d.ticket_id) is not distinct from ('ticket'::text,1,'c1-ticket'::text),'A ticketed job: '||row_to_json(d)::text);
 perform pg_temp.ch_check(exists(select 1 from private.notification_outbox where id=current_setting('c1.snack01')::bigint and delivered_at is null),
  'A deferred job''s notice is marked delivered');
end $$;

-- H17 (K-N3): once its notice is 61 minutes old, the next claim drops 01's deferred chat job (suppressed, never sent),
-- while 05's announcement job, its notice 23 hours old, is claimed again (its attempt counted once more). The ticketed
-- job, due again, comes back with its ticket; handed back (deferred, no ticket) it keeps its ticket and stays a ticket.
update private.notification_outbox set created_at=now()-interval '61 minutes' where id=current_setting('c1.snack01')::bigint;
update private.notification_outbox set created_at=now()-interval '23 hours' where id=current_setting('c1.doors05')::bigint;
update private.notification_deliveries set next_attempt_at=now() where outbox_id=current_setting('c1.pc09')::bigint;
set local role service_role;
insert into ch_jobs select 'second', j from jsonb_array_elements(public.claim_notification_deliveries(25)) j;
reset role;
do $$ declare j jsonb; d private.notification_deliveries; begin
 perform pg_temp.ch_check(not exists(select 1 from ch_jobs where step='second' and job->>'outbox_id'=current_setting('c1.snack01'))
  and (select state from private.notification_deliveries where outbox_id=current_setting('c1.snack01')::bigint)='suppressed',
  'A chat job whose notice is 61 minutes old was not dropped');
 perform pg_temp.ch_check(exists(select 1 from ch_jobs where step='second' and job->>'outbox_id'=current_setting('c1.doors05') and job @> '{"attempts":1}'),
  'An announcement job whose notice is 23 hours old was not claimed again');
 perform pg_temp.ch_check(not exists(select 1 from ch_jobs where step='second' and job->>'outbox_id'=current_setting('c1.pc02')),
  'A retried job came back before its 30 s');
 select job into j from ch_jobs where step='second' and job->>'outbox_id'=current_setting('c1.pc09');
 perform pg_temp.ch_check(j @> '{"ticket_id":"c1-ticket","attempts":2}','The ticketed job, due again: '||coalesce(j::text,'none'));
 perform public.finish_notification_delivery(p_id=>(j->>'id')::uuid,p_lease=>(j->>'lease_id')::uuid,p_outcome=>'deferred',p_ticket=>null,p_delay_seconds=>0);
 select * into d from private.notification_deliveries where outbox_id=current_setting('c1.pc09')::bigint;
 perform pg_temp.ch_check((d.state,d.attempts,d.ticket_id,d.next_attempt_at,d.lease_id) is not distinct from ('ticket'::text,1,'c1-ticket'::text,now(),null::uuid),
  'A ticketed job handed back: '||row_to_json(d)::text);
end $$;
update private.notification_outbox set created_at=now() where id=current_setting('c1.doors05')::bigint;

-- The pinned announcement (K-S12, Decision 9) is the latest one still sent: 01's now. 02 removes 01's: removed, no
-- body, and 02's is pinned again; 01's notices are no longer eligible (it is no longer sent). 02 deletes its own:
-- deleted, and nothing is pinned, in the summary too.
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('02'));
select public.remove_message(current_setting('c1.game')::bigint);
reset role;
do $$ begin
 perform pg_temp.ch_check((select (state,body) from public.messages where id=current_setting('c1.game')::bigint)
   is not distinct from ('removed'::text,null::text),'01''s announcement is not removed');
 perform pg_temp.ch_check((select pinned_message_id from public.chats where series_id=pg_temp.c1p('01'))=current_setting('c1.doors')::bigint,
  'Removing the pinned announcement does not pin the one before');
 perform pg_temp.ch_check(not private.notification_recipient_eligible(pg_temp.ch_notice('announcement',current_setting('c1.game')::bigint,'03')),
  'A removed announcement may still be told');
end $$;
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('02'));
select public.delete_message(current_setting('c1.doors')::bigint);
select pg_temp.ch_check(public.chat_summary(pg_temp.c1p('01'))->'pinned'='null'::jsonb,'The summary still pins a deleted announcement');
reset role;
select pg_temp.ch_check((select (state,body) from public.messages where id=current_setting('c1.doors')::bigint)
  is not distinct from ('deleted'::text,null::text)
 and (select pinned_message_id from public.chats where series_id=pg_temp.c1p('01')) is null,'Deleting the last announcement leaves one pinned');

-- Delete and remove (K-B2, K-N12). 03 deletes its own older message (Message 2): deleted, no body, updated_at moved to
-- now(). 03 may not delete 04's message (Message 1), a system line, or a row that does not exist: 42501 'Not your
-- message'; nor remove anything, not being a host: 42501 'Hosts only'. 02 removes 04's (Message 1): removed. 02 writes
-- and removes its own message: deleted, never removed. 01, the owner, removes 03's (Message 4): removed. A system line,
-- or a row that does not exist, is never removed: 'Hosts only'. A row no longer sent keeps its state: 02 removing 03's
-- deleted Message 2 leaves it deleted, and 04 deleting its removed Message 1 leaves it removed.
select set_config('c1.m1',pg_temp.ch_msg('Message 1')::text,true);
select set_config('c1.m2',pg_temp.ch_msg('Message 2')::text,true);
select set_config('c1.m4',pg_temp.ch_msg('Message 4')::text,true);
select set_config('c1.line',(select min(id) from public.messages where series_id=pg_temp.c1p('01') and kind='system')::text,true);
select set_config('c1.m2_before',(select updated_at from public.messages where id=current_setting('c1.m2')::bigint)::text,true);
select set_config('c1.line_before',(select row_to_json(m)::text from public.messages m where id=current_setting('c1.line')::bigint),true);
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('03'));
select public.delete_message(current_setting('c1.m2')::bigint);
select pg_temp.ch_refused($$select public.delete_message(current_setting('c1.m1')::bigint)$$,'42501','Not your message');
select pg_temp.ch_refused($$select public.delete_message(current_setting('c1.line')::bigint)$$,'42501','Not your message');
select pg_temp.ch_refused($$select public.delete_message(-1)$$,'42501','Not your message');
select pg_temp.ch_refused($$select public.remove_message(current_setting('c1.m1')::bigint)$$,'42501','Hosts only');
select pg_temp.ch_refused($$select public.remove_message(current_setting('c1.m4')::bigint)$$,'42501','Hosts only');
select pg_temp.ch_as(pg_temp.c1('02'));
select public.remove_message(current_setting('c1.m1')::bigint);
select set_config('c1.late',pg_temp.ch_send(pg_temp.c1p('01'),'Running late')::text,true);
select public.remove_message(current_setting('c1.late')::bigint);
select pg_temp.ch_refused($$select public.remove_message(current_setting('c1.line')::bigint)$$,'42501','Hosts only');
select pg_temp.ch_refused($$select public.remove_message(-1)$$,'42501','Hosts only');
select public.remove_message(current_setting('c1.m2')::bigint);
select pg_temp.ch_as(pg_temp.c1('01'));
select public.remove_message(current_setting('c1.m4')::bigint);
select pg_temp.ch_as(pg_temp.c1('04'));
select public.delete_message(current_setting('c1.m1')::bigint);
reset role;
do $$ begin
 perform pg_temp.ch_check((select (state,body,updated_at) from public.messages where id=current_setting('c1.m2')::bigint)
   is not distinct from ('deleted'::text,null::text,now()) and current_setting('c1.m2_before')::timestamptz<now(),
  '03''s own message is not deleted with updated_at moved');
 perform pg_temp.ch_check((select (state,body) from public.messages where id=current_setting('c1.m1')::bigint) is not distinct from ('removed'::text,null::text),
  '04''s message is not removed, or 04 changed it back');
 perform pg_temp.ch_check((select (state,body) from public.messages where id=current_setting('c1.late')::bigint) is not distinct from ('deleted'::text,null::text),
  '02''s own message is not deleted when 02 removes it');
 perform pg_temp.ch_check((select (state,body) from public.messages where id=current_setting('c1.m4')::bigint) is not distinct from ('removed'::text,null::text),
  'The owner did not remove 03''s message');
 perform pg_temp.ch_check((select row_to_json(m)::text from public.messages m where id=current_setting('c1.line')::bigint)=current_setting('c1.line_before'),
  'A system line changed');
end $$;

-- message_count (K-N12) counts sent messages and announcements, on both chats: never a system line, nor a removed or a
-- deleted row. The summary gives it.
do $$ declare s uuid; begin
 foreach s in array array[pg_temp.c1p('01'),pg_temp.c1p('02')] loop
  perform pg_temp.ch_check((select message_count from public.chats where series_id=s)
    =(select count(*) from public.messages where series_id=s and kind in ('message','announcement') and state='sent'),
   'message_count of '||s||': '||(select message_count from public.chats where series_id=s));
 end loop;
 perform pg_temp.ch_check(exists(select 1 from public.messages where series_id=pg_temp.c1p('01') and kind='system' and state='sent')
  and exists(select 1 from public.messages where series_id=pg_temp.c1p('01') and kind='message' and state<>'sent'),'The count has nothing to leave out');
 perform pg_temp.ch_as(pg_temp.c1('03'));
 perform pg_temp.ch_check((public.chat_summary(pg_temp.c1p('01'))->>'message_count')::int=(select message_count from public.chats where series_id=pg_temp.c1p('01')),
  'The summary''s message_count');
end $$;

-- A profile removed another way (H42 M1, CH-P18). Hosted has no deletion request: an account goes there only by hand
-- (the dashboard), once what blocks it is cleared, and the author's key then nulls the author. The words go with it.
-- 10 'Pip Gone', a tester Going on the one-off and an admin of it (both by hand, under the roll's flag), writes two
-- messages and announces to everyone (pinned); 02 removes the second message. 10's guest and admin rows are cleared and
-- 10's account deleted, by hand: the first message and the announcement read deleted, with no words and no author, and
-- the removed one stays removed, with no author; nothing is pinned again and message_count leaves them out; a read as
-- 03 shows none of 10's words; and 10's announcement notice to 05 is no longer eligible.
insert into auth.users(id,email,email_confirmed_at) values (pg_temp.c1('10'),'chat1-10@resbite-test.invalid',now());
insert into private.tester_roster(email) values ('chat1-10@resbite-test.invalid');
insert into public.profiles(id,display_name) values (pg_temp.c1('10'),'Pip Gone');
select pg_temp.ch_rules();
select set_config('resbite.system','roll',true);
insert into public.attendees(plan_id,user_id,response) values (pg_temp.c1p('01'),pg_temp.c1('10'),'accepted');
insert into public.plan_admins(plan_id,user_id,appointed_by) values (pg_temp.c1p('01'),pg_temp.c1('10'),pg_temp.c1('01'));
select set_config('resbite.system','',true);
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('10'));
select set_config('c1.pip1',pg_temp.ch_send(pg_temp.c1p('01'),'My flat is at 4 Elm Road')::text,true);
select set_config('c1.pip2',pg_temp.ch_send(pg_temp.c1p('01'),'Ring twice')::text,true);
select set_config('c1.pip_ann',public.send_announcement(pg_temp.c1p('01'),'Pip pinned this','everyone',gen_random_uuid())->>'id',true);
select pg_temp.ch_as(pg_temp.c1('02'));
select public.remove_message(current_setting('c1.pip2')::bigint);
reset role;
select pg_temp.ch_check((select pinned_message_id from public.chats where series_id=pg_temp.c1p('01'))=current_setting('c1.pip_ann')::bigint
 and (select (state,body) from public.messages where id=current_setting('c1.pip1')::bigint) is not distinct from ('sent'::text,'My flat is at 4 Elm Road'::text),
 '10''s message is not sent, or its announcement not pinned');
select set_config('c1.pip_ann05',pg_temp.ch_notice('announcement',current_setting('c1.pip_ann')::bigint,'05')::text,true);
delete from public.plan_admins where user_id=pg_temp.c1('10');
delete from public.attendees where user_id=pg_temp.c1('10');
delete from auth.users where id=pg_temp.c1('10');
do $$ declare r jsonb; begin
 perform pg_temp.ch_check((select (state,body,author_id) from public.messages where id=current_setting('c1.pip1')::bigint)
   is not distinct from ('deleted'::text,null::text,null::uuid)
  and (select (state,body,author_id) from public.messages where id=current_setting('c1.pip_ann')::bigint)
   is not distinct from ('deleted'::text,null::text,null::uuid)
  and (select (state,body,author_id) from public.messages where id=current_setting('c1.pip2')::bigint)
   is not distinct from ('removed'::text,null::text,null::uuid),
  'A deleted profile''s rows: '||(select string_agg(row_to_json(m)::text,' | ' order by m.id) from (select id,state,body,author_id
   from public.messages where id in (current_setting('c1.pip1')::bigint,current_setting('c1.pip2')::bigint,current_setting('c1.pip_ann')::bigint)) m));
 perform pg_temp.ch_check((select pinned_message_id from public.chats where series_id=pg_temp.c1p('01')) is null
  and (select message_count from public.chats where series_id=pg_temp.c1p('01'))
   =(select count(*) from public.messages where series_id=pg_temp.c1p('01') and kind in ('message','announcement') and state='sent'),
  'A deleted profile''s announcement is still pinned, or its words still counted');
 perform pg_temp.ch_check(not private.notification_recipient_eligible(current_setting('c1.pip_ann05')::bigint),
  'A deleted profile''s announcement may still be told');
 perform pg_temp.ch_as(pg_temp.c1('03'));
 r := public.chat_messages(pg_temp.c1p('01'));
 perform pg_temp.ch_check((select count(*) from jsonb_array_elements(r->'rows') e
    where e.value->>'id' in (current_setting('c1.pip1'),current_setting('c1.pip_ann')) and e.value->>'state'='deleted'
     and e.value->'body'='null'::jsonb and e.value->'author_id'='null'::jsonb)=2
  and not exists(select 1 from jsonb_array_elements(r->'rows') e where e.value->>'body' in ('My flat is at 4 Elm Road','Ring twice','Pip pinned this')),
  'A read still shows a deleted profile''s words: '||(r->'rows')::text);
end $$;

-- The close (CH-P15, K-S8, K-S17, Review Focus 4). At the end + 47 h 59 min 03 still writes. At the end + 48 h 01 min:
-- 03's message and 02's announcement are refused, 22023 'Chat closed' (05, not in the chat, still gets 'Not in this
-- chat'); the history still reads; 03's earlier client id again is its stored row, not 'Chat closed'; 03 deletes
-- another of its messages (Message 6) and 02 removes one of 04's (Message 5): both done. The times go back afterwards.
select set_config('c1.m5',pg_temp.ch_msg('Message 5')::text,true);
select set_config('c1.m6',pg_temp.ch_msg('Message 6')::text,true);
select set_config('resbite.system','roll',true);
update public.plans set starts_at=now()-interval '50 hours 59 minutes',ends_at=now()-interval '47 hours 59 minutes' where id=pg_temp.c1p('01');
select set_config('resbite.system','',true);
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('03'));
select pg_temp.ch_check(pg_temp.ch_send(pg_temp.c1p('01'),'Still here') is not null,'03 could not write at the end + 47 h 59 min');
reset role;
select set_config('resbite.system','roll',true);
update public.plans set starts_at=now()-interval '51 hours 1 minute',ends_at=now()-interval '48 hours 1 minute' where id=pg_temp.c1p('01');
select set_config('resbite.system','',true);
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('03'));
select pg_temp.ch_refused($$select public.send_message(pg_temp.c1p('01'),'Anyone?',gen_random_uuid())$$,'22023','Chat closed');
select pg_temp.ch_check(jsonb_array_length(public.chat_messages(pg_temp.c1p('01'))->'rows')=50,'chat_messages does not read after the close');
select pg_temp.ch_check(public.send_message(pg_temp.c1p('01'),'I can bring the snacks',current_setting('c1.snack_client')::uuid)
 =current_setting('c1.snack_row')::jsonb,'A repeat after the close is not the stored row');
select public.delete_message(current_setting('c1.m6')::bigint);
select pg_temp.ch_as(pg_temp.c1('02'));
select pg_temp.ch_refused($$select public.send_announcement(pg_temp.c1p('01'),'Thanks all','everyone',gen_random_uuid())$$,'22023','Chat closed');
select public.remove_message(current_setting('c1.m5')::bigint);
select pg_temp.ch_as(pg_temp.c1('05'));
select pg_temp.ch_refused($$select public.send_message(pg_temp.c1p('01'),'Anyone?',gen_random_uuid())$$,'42501','Not in this chat');
reset role;
select pg_temp.ch_check((select state from public.messages where id=current_setting('c1.m6')::bigint)='deleted'
 and (select state from public.messages where id=current_setting('c1.m5')::bigint)='removed','Delete or remove did not work after the close');
select set_config('resbite.system','roll',true);
update public.plans set starts_at=pg_temp.c1_start(),ends_at=pg_temp.c1_start()+interval '3 hours' where id=pg_temp.c1p('01');
select set_config('resbite.system','',true);

-- How far someone has read (K-S11, H23): mark_chat_read moves forward only, and never past the chat's last message.
-- 03 reads to its snacks message; then an older id leaves it there; then the largest id is clamped to the last
-- message, and the summary says nothing is unread. A null id changes nothing. 05, not in the chat: 42501 'Not in this chat'.
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('03'));
select public.mark_chat_read(pg_temp.c1p('01'),current_setting('c1.snack')::bigint);
select pg_temp.ch_check((public.chat_summary(pg_temp.c1p('01'))->>'last_read_id')::bigint=current_setting('c1.snack')::bigint,'03''s read is not at its message');
select public.mark_chat_read(pg_temp.c1p('01'),current_setting('c1.snack')::bigint-5);
select pg_temp.ch_check((public.chat_summary(pg_temp.c1p('01'))->>'last_read_id')::bigint=current_setting('c1.snack')::bigint,'03''s read moved backwards');
select public.mark_chat_read(pg_temp.c1p('01'),9223372036854775807);
select public.mark_chat_read(pg_temp.c1p('01'),null);
select pg_temp.ch_check(public.chat_summary(pg_temp.c1p('01'))@>'{"unread":false}','After reading to the end, the chat is unread');
select pg_temp.ch_as(pg_temp.c1('05'));
select pg_temp.ch_refused($$select public.mark_chat_read(pg_temp.c1p('01'),1)$$,'42501','Not in this chat');
reset role;
select pg_temp.ch_check((select last_read_id from public.chat_reads where series_id=pg_temp.c1p('01') and user_id=pg_temp.c1('03'))
 =(select last_message_id from public.chats where series_id=pg_temp.c1p('01'))
 and (select count(*) from public.chat_reads)=1,'03''s read is not clamped to the chat''s last message, or is not one row');

-- 30 a minute (K-S8, step 5): messages and announcements together, across chats. 01 has announced once this minute
-- (Bring a game). With 28 more of 01's messages from 30 s ago (by hand, on the weekly series), 01's 30th, a message,
-- goes; the 31st, a message or an announcement (01 has none on the weekly series this minute), is refused: 22023
-- 'Slow down'. Once those 28 are 61 s old, 01 writes again.
insert into public.messages(series_id,plan_id,author_id,kind,body,created_at,updated_at)
 select pg_temp.c1p('02'),(private.current_occurrence(pg_temp.c1p('02'))).id,pg_temp.c1('01'),'message','Quick '||g,now()-interval '30 seconds',now()
 from generate_series(1,28) g;
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('01'));
select pg_temp.ch_check(pg_temp.ch_send(pg_temp.c1p('02'),'The 30th') is not null,'01''s 30th message in a minute was refused');
select pg_temp.ch_refused($$select public.send_message(pg_temp.c1p('01'),'The 31st',gen_random_uuid())$$,'22023','Slow down');
select pg_temp.ch_refused($$select public.send_announcement(pg_temp.c1p('02'),'The 31st','everyone',gen_random_uuid())$$,'22023','Slow down');
reset role;
update public.messages set created_at=now()-interval '61 seconds' where author_id=pg_temp.c1('01') and body like 'Quick %';
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('01'));
select pg_temp.ch_check(pg_temp.ch_send(pg_temp.c1p('01'),'Back again') is not null,'01 could not write once the minute had passed');
reset role;

-- The expansion's order (K-B3.2, K-B3.4, Review Focus 3). Every earlier notice is marked expanded first. Users 11 to 39,
-- testers named 'Guest NN'. Three more one-offs (plans c1…03 to c1…05), owned by 11, 20 and 29, each with 8 people Going
-- (12–19, 21–28, 30–37). Five rounds of one message by each owner queue 24 chat notices a round, 120 in all; between
-- rounds every queued chat notice is moved 61 s back, so the minute's rule holds none back. Then a change of place on a
-- fourth one-off (c1…06: 38 its owner, 39 Going) queues one plan_changed notice, after all 120. 21, 30 and 39 have a
-- device. One claim as the sender expands the change first, and the first 99 chat notices in id order fill the run's
-- other places (rounds 1 to 4, and three of round 5's first chat); the other 21 wait. The claim has no minute's rule of
-- its own: 21 and 30 each get one delivery for each of their four expanded chat notices, 39 one for the change, and
-- the waiting notices none.
update private.notification_outbox set expanded_at=now() where expanded_at is null;
insert into auth.users(id,email,email_confirmed_at)
 select pg_temp.c1(n::text),'chat1-'||n||'@resbite-test.invalid',now() from generate_series(11,39) n;
insert into private.tester_roster(email) select 'chat1-'||n||'@resbite-test.invalid' from generate_series(11,39) n;
insert into public.profiles(id,display_name) select pg_temp.c1(n::text),'Guest '||n from generate_series(11,39) n;
select pg_temp.ch_rules();
set local role authenticated;
do $$ declare v_owner text[] := array['11','20','29','38']; v_plan text[] := array['03','04','05','06']; i int; begin
 for i in 1..4 loop
  perform pg_temp.ch_as(pg_temp.c1(v_owner[i]));
  perform public.create_plan_v4(pg_temp.c1p(v_plan[i]),'Crowd '||i,'',array['community'],null,pg_temp.c1_start(),
   pg_temp.c1_start()+interval '2 hours','Europe/London','The hall',false,null::smallint);
 end loop;
end $$;
reset role;
select set_config('resbite.system','roll',true);
insert into public.attendees(plan_id,user_id,response)
 select pg_temp.c1p(case when n<20 then '03' when n<29 then '04' when n<38 then '05' else '06' end),pg_temp.c1(n::text),'accepted'
 from generate_series(12,39) n where n not in (20,29,38);
select set_config('resbite.system','',true);
do $$ declare r int; i int; v_owner text[] := array['11','20','29']; v_plan text[] := array['03','04','05']; begin
 for r in 1..5 loop
  if r>1 then
   update private.notification_outbox set created_at=created_at-interval '61 seconds' where kind='chat_message' and expanded_at is null;
  end if;
  for i in 1..3 loop
   perform pg_temp.ch_as(pg_temp.c1(v_owner[i]));
   perform pg_temp.ch_send(pg_temp.c1p(v_plan[i]),'Round '||r);
  end loop;
 end loop;
end $$;
select set_config('c1.v6',(select version from public.plans where id=pg_temp.c1p('06'))::text,true);
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('38'));
select public.change_plan_v4(pg_temp.c1p('06'),current_setting('c1.v6')::int,'Crowd 4','',array['community'],pg_temp.c1_start(),
 pg_temp.c1_start()+interval '2 hours','Europe/London','The pub',false,null::smallint,null,null);
reset role;
-- The change is a real event, so its chat has its line (Task 3, H9): so far the one line any trigger writes in slices 1
-- and 2, where every other row set by hand sits under the roll's flag (the pick's change below writes the other).
-- Beside it, the two the roll writes itself since chat plan 2, ended and next, on the weekly series in slice 1.
select pg_temp.ch_check(pg_temp.ch_lines(pg_temp.c1p('06'))='changed:-'
 and (select string_agg(right(m.series_id::text,2)||':'||m.event,',' order by m.id) from public.messages m where m.kind='system' and m.created_at>=now())
  ='02:ended,02:next,06:changed',
 'Slices 1 and 2 wrote other lines: '||coalesce((select string_agg(right(m.series_id::text,2)||':'||m.event,',' order by m.id) from public.messages m
  where m.kind='system' and m.created_at>=now()),'none'));
insert into private.device_endpoints(token,user_id,platform) values
 ('ExpoPushToken[c1g21]',pg_temp.c1('21'),'ios'),('ExpoPushToken[c1g30]',pg_temp.c1('30'),'ios'),('ExpoPushToken[c1g39]',pg_temp.c1('39'),'android');
do $$ declare v_chat bigint[]; begin
 select array_agg(o.id order by o.id) into v_chat from private.notification_outbox o where o.kind='chat_message' and o.plan_id in
  (pg_temp.c1p('03'),pg_temp.c1p('04'),pg_temp.c1p('05'));
 perform pg_temp.ch_check(array_length(v_chat,1)=120 and not exists(select 1 from private.notification_outbox where expanded_at is null and id<>all(v_chat)
   and not (kind='plan_changed' and plan_id=pg_temp.c1p('06'))),'The crowd did not queue 120 chat notices and one change, and nothing else');
 perform pg_temp.ch_check((select array_agg(id) from private.notification_outbox where kind='plan_changed' and plan_id=pg_temp.c1p('06')
   and recipient_id=pg_temp.c1('39') and id>v_chat[120])
   =(select array_agg(id) from private.notification_outbox where plan_id=pg_temp.c1p('06')),'The change is not one notice to 39, after the chat notices');
end $$;
set local role service_role;
insert into ch_jobs select 'crowd', j from jsonb_array_elements(public.claim_notification_deliveries(25)) j;
reset role;
do $$ declare v_chat bigint[]; v_change bigint; u text; begin
 select array_agg(o.id order by o.id) into v_chat from private.notification_outbox o where o.kind='chat_message' and o.plan_id in
  (pg_temp.c1p('03'),pg_temp.c1p('04'),pg_temp.c1p('05'));
 select id into v_change from private.notification_outbox where plan_id=pg_temp.c1p('06');
 perform pg_temp.ch_check((select expanded_at from private.notification_outbox where id=v_change) is not null
   and (select count(*) from private.notification_deliveries where outbox_id=v_change)=1,'The change behind 120 chat notices was not expanded');
 perform pg_temp.ch_check(exists(select 1 from ch_jobs where step='crowd' and job->>'outbox_id'=v_change::text and job->>'kind'='plan_changed'),
  'The claim that expanded the change did not send it');
 perform pg_temp.ch_check(not exists(select 1 from private.notification_outbox where id=any(v_chat[1:99]) and expanded_at is null)
   and not exists(select 1 from private.notification_outbox where id=any(v_chat[100:120]) and expanded_at is not null),
  'The chat notices expanded are not the first 99: '||(select count(*) from private.notification_outbox where id=any(v_chat) and expanded_at is not null));
 foreach u in array array['21','30'] loop
  perform pg_temp.ch_check((select count(*) from private.notification_deliveries d join private.notification_outbox o on o.id=d.outbox_id
     where o.recipient_id=pg_temp.c1(u))=4
    and (select count(*) from private.notification_outbox o where o.recipient_id=pg_temp.c1(u) and o.expanded_at is not null)=4
    and not exists(select 1 from private.notification_outbox o where o.recipient_id=pg_temp.c1(u) and o.expanded_at is not null
     and (select count(*) from private.notification_deliveries d where d.outbox_id=o.id)<>1),
   u||' does not have one delivery for each of its four expanded chat notices');
 end loop;
 perform pg_temp.ch_check(not exists(select 1 from private.notification_deliveries where outbox_id=any(v_chat[100:120])),'A waiting chat notice has a delivery');
end $$;

-- The pick's order (K-B3.2, H42 I1): a change goes out before a lively chat's pushes, not only into the queue before
-- them. Every earlier notice is marked expanded, and every delivery still waiting is set aside by hand (suppressed).
-- Users 40 to 84, testers named 'Guest NN', 41 to 84 each with a device. 40 owns a fifth one-off (c1…07), with 41 to 84
-- Going. 40 writes one message (44 chat notices), then moves the start (44 plan_changed notices, made after them). The
-- first claim expands all 88, so every delivery has the same next_attempt_at, and its 25 jobs are all plan_changed;
-- the second takes the other 19 changes, then 6 chat jobs; the third and the fourth take the chat jobs left. No claim
-- takes a chat job while a change that is due is left behind.
update private.notification_outbox set expanded_at=now() where expanded_at is null;
update private.notification_deliveries set state='suppressed',lease_id=null,lease_until=null where state in ('pending','ticket');
insert into auth.users(id,email,email_confirmed_at)
 select pg_temp.c1(n::text),'chat1-'||n||'@resbite-test.invalid',now() from generate_series(40,84) n;
insert into private.tester_roster(email) select 'chat1-'||n||'@resbite-test.invalid' from generate_series(40,84) n;
insert into public.profiles(id,display_name) select pg_temp.c1(n::text),'Guest '||n from generate_series(40,84) n;
select pg_temp.ch_rules();
insert into private.device_endpoints(token,user_id,platform)
 select 'ExpoPushToken[c1p'||n||']',pg_temp.c1(n::text),'ios' from generate_series(41,84) n;
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('40'));
select public.create_plan_v4(pg_temp.c1p('07'),'Crowd 5','',array['community'],null,pg_temp.c1_start(),
 pg_temp.c1_start()+interval '2 hours','Europe/London','The hall',false,null::smallint);
reset role;
select set_config('resbite.system','roll',true);
insert into public.attendees(plan_id,user_id,response) select pg_temp.c1p('07'),pg_temp.c1(n::text),'accepted' from generate_series(41,84) n;
select set_config('resbite.system','',true);
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('40'));
select set_config('c1.crowd5',pg_temp.ch_send(pg_temp.c1p('07'),'See you all there')::text,true);
reset role;
select set_config('c1.v7',(select version from public.plans where id=pg_temp.c1p('07'))::text,true);
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('40'));
select public.change_plan_v4(pg_temp.c1p('07'),current_setting('c1.v7')::int,'Crowd 5','',array['community'],pg_temp.c1_start()+interval '1 hour',
 pg_temp.c1_start()+interval '3 hours','Europe/London','The hall',false,null::smallint,null,null);
reset role;
select pg_temp.ch_check((select string_agg(kind||'='||n,',' order by kind) from (select o.kind,count(*) n from private.notification_outbox o
  where o.expanded_at is null group by 1) x)='chat_message=44,plan_changed=44'
 and (select max(id) from private.notification_outbox where kind='chat_message' and expanded_at is null)
  <(select min(id) from private.notification_outbox where kind='plan_changed' and expanded_at is null),
 'The crowd did not queue 44 chat notices, then 44 changes, and nothing else');
-- After a claim: whether it took a chat job while a delivery of another kind, due, was left waiting. The superuser's.
create function pg_temp.ch_chat_jumped(p_step text) returns boolean language sql stable as $$
 select exists(select 1 from ch_jobs where step=p_step and job->>'kind' in ('chat_message','announcement'))
  and exists(select 1 from private.notification_deliveries d join private.notification_outbox o on o.id=d.outbox_id
   where d.state in ('pending','ticket') and d.next_attempt_at<=now() and o.kind not in ('chat_message','announcement'))
$$;
set local role service_role;
insert into ch_jobs select 'pick1', j from jsonb_array_elements(public.claim_notification_deliveries(25)) j;
reset role;
select pg_temp.ch_check(not pg_temp.ch_chat_jumped('pick1'),'The first claim took chat jobs while changes were left: '
 ||(select string_agg(k||'='||n,',' order by k) from (select job->>'kind' k,count(*) n from ch_jobs where step='pick1' group by 1) y));
select pg_temp.ch_check((select count(*) from private.notification_outbox where expanded_at is null)=0
 and (select count(*) from private.notification_deliveries d join private.notification_outbox o on o.id=d.outbox_id where o.plan_id=pg_temp.c1p('07'))=88,
 'The first claim did not expand the 88 notices');
set local role service_role;
insert into ch_jobs select 'pick2', j from jsonb_array_elements(public.claim_notification_deliveries(25)) j;
reset role;
select pg_temp.ch_check(not pg_temp.ch_chat_jumped('pick2'),'The second claim took chat jobs while changes were left');
set local role service_role;
insert into ch_jobs select 'pick3', j from jsonb_array_elements(public.claim_notification_deliveries(25)) j;
reset role;
select pg_temp.ch_check(not pg_temp.ch_chat_jumped('pick3'),'The third claim took chat jobs while changes were left');
set local role service_role;
insert into ch_jobs select 'pick4', j from jsonb_array_elements(public.claim_notification_deliveries(25)) j;
reset role;
select pg_temp.ch_check(not pg_temp.ch_chat_jumped('pick4'),'The fourth claim took chat jobs while changes were left');
select pg_temp.ch_check(coalesce((select string_agg(x.step||' '||x.kinds,' | ' order by x.step) from (select step,
   string_agg(k||'='||n,',' order by k) kinds from (select step,job->>'kind' k,count(*) n from ch_jobs where step like 'pick%' group by 1,2) y group by 1) x),'none')
  ='pick1 plan_changed=25 | pick2 chat_message=6,plan_changed=19 | pick3 chat_message=25 | pick4 chat_message=13',
 'The claims took: '||coalesce((select string_agg(x.step||' '||x.kinds,' | ' order by x.step) from (select step,
   string_agg(k||'='||n,',' order by k) kinds from (select step,job->>'kind' k,count(*) n from ch_jobs where step like 'pick%' group by 1,2) y group by 1) x),'none'));

-- A message already read is not pushed (H42 M5). Every chat notice of the fifth one-off is moved 61 s back, so the
-- minute's rule holds none back, and 40 writes 'Who brings cups?' (44 chat notices). Before any claim, 41 reads up to it
-- and 42 reads only up to 40's first message. The claim expands all 44: 41's notice gets no delivery, and 42's and the
-- 42 others' do. The read is checked once, at the expansion (best effort): one of those whose job is still waiting
-- reads the message after the expansion, and the next claim still sends its job.
update private.notification_outbox set created_at=created_at-interval '61 seconds' where kind='chat_message' and plan_id=pg_temp.c1p('07');
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('40'));
select set_config('c1.cups',pg_temp.ch_send(pg_temp.c1p('07'),'Who brings cups?')::text,true);
select pg_temp.ch_as(pg_temp.c1('41'));
select public.mark_chat_read(pg_temp.c1p('07'),current_setting('c1.cups')::bigint);
select pg_temp.ch_as(pg_temp.c1('42'));
select public.mark_chat_read(pg_temp.c1p('07'),current_setting('c1.crowd5')::bigint);
reset role;
select pg_temp.ch_check(pg_temp.ch_to('chat_message',current_setting('c1.cups')::bigint)
  =(select string_agg(lpad(n::text,2,'0'),',' order by n) from generate_series(41,84) n),
 'The second message was not queued to 41 to 84: '||pg_temp.ch_to('chat_message',current_setting('c1.cups')::bigint));
set local role service_role;
insert into ch_jobs select 'read1', j from jsonb_array_elements(public.claim_notification_deliveries(25)) j;
reset role;
do $$ declare v_late uuid; begin
 perform pg_temp.ch_check((select count(*) from private.notification_outbox where message_id=current_setting('c1.cups')::bigint and expanded_at is null)=0,
  'The second message''s notices were not all expanded');
 perform pg_temp.ch_check(not exists(select 1 from private.notification_deliveries d where d.outbox_id=pg_temp.ch_notice('chat_message',current_setting('c1.cups')::bigint,'41')),
  '41 read the message before the claim, and still has a push for it');
 perform pg_temp.ch_check((select count(*) from private.notification_deliveries d join private.notification_outbox o on o.id=d.outbox_id
   where o.message_id=current_setting('c1.cups')::bigint)=43
  and exists(select 1 from private.notification_deliveries d where d.outbox_id=pg_temp.ch_notice('chat_message',current_setting('c1.cups')::bigint,'42')),
  'Those who had not read the message do not each have a push for it');
 select o.recipient_id into v_late from private.notification_deliveries d join private.notification_outbox o on o.id=d.outbox_id
 where o.message_id=current_setting('c1.cups')::bigint and d.state='pending' order by o.recipient_id limit 1;
 perform pg_temp.ch_check(v_late is not null,'Every push for the second message went in one claim');
 perform set_config('c1.late_reader',v_late::text,true);
end $$;
set local role authenticated;
select pg_temp.ch_as(current_setting('c1.late_reader')::uuid);
select public.mark_chat_read(pg_temp.c1p('07'),current_setting('c1.cups')::bigint);
reset role;
set local role service_role;
insert into ch_jobs select 'read2', j from jsonb_array_elements(public.claim_notification_deliveries(25)) j;
reset role;
select pg_temp.ch_check(exists(select 1 from ch_jobs where step='read2' and job->>'recipient_id'=current_setting('c1.late_reader')
  and job->>'message_id'=current_setting('c1.cups')),'A read after the expansion held back a push already made');

-- An announcement read before the claim is still pushed (H43; announcements always go, CH-P7). 40 announces, and 41 reads
-- up to it before any claim. The claim expands the notices: 41's gets its delivery all the same.
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('40'));
select set_config('c1.cups_ann',(public.send_announcement(pg_temp.c1p('07'),'Cups are on the stage','everyone',gen_random_uuid())->>'id'),true);
select pg_temp.ch_as(pg_temp.c1('41'));
select public.mark_chat_read(pg_temp.c1p('07'),current_setting('c1.cups_ann')::bigint);
reset role;
select pg_temp.ch_check(pg_temp.ch_notice('announcement',current_setting('c1.cups_ann')::bigint,'41') is not null,
 'The announcement was not queued to 41');
set local role service_role;
insert into ch_jobs select 'read3', j from jsonb_array_elements(public.claim_notification_deliveries(25)) j;
reset role;
select pg_temp.ch_check(exists(select 1 from private.notification_deliveries d
  where d.outbox_id=pg_temp.ch_notice('announcement',current_setting('c1.cups_ann')::bigint,'41')),
 '41 read the announcement before the claim, and has no push for it');

-- The schema (K-S5, K-N11, K-N13, H21). The six writers and their private bodies are for signed-in accounts only; the
-- public ones are not definers; every private one is a definer with an empty search path, and the stats trigger and
-- the words' helper are for no role. The trigger, the outbox's message_id (a cascading key to messages, with its own
-- index), the recipient index and the rate limit's index are as named, and the kind check holds the eleven earlier kinds and the two chat kinds. The
-- redefined claim, check and finish keep their grants: the worker's (service_role) only, and nobody for the check.
do $$ declare f text; r text; begin
 foreach f in array array['send_message(uuid,text,uuid)','send_announcement(uuid,text,text,uuid)','delete_message(bigint)',
   'remove_message(bigint)','mark_chat_read(uuid,bigint)','set_chat_mute(uuid,boolean)'] loop
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
 foreach f in array array['messages_chat_stats()','chat_body(text)'] loop
  perform pg_temp.ch_check((select prosecdef and proconfig=array['search_path=""'] from pg_catalog.pg_proc where oid=('private.'||f)::regprocedure),
   'private.'||f||' is not a definer with an empty search path');
  foreach r in array array['public','anon','authenticated','service_role'] loop
   perform pg_temp.ch_check(not has_function_privilege(r,'private.'||f,'execute'),r||' may call private.'||f);
  end loop;
 end loop;
 perform pg_temp.ch_check(exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid='public.messages'::regclass and t.tgname='messages_chat_stats'
   and t.tgfoid='private.messages_chat_stats()'::regprocedure
   and pg_catalog.pg_get_triggerdef(t.oid) like '%AFTER INSERT OR UPDATE ON public.messages FOR EACH ROW%'),'The messages_chat_stats trigger is missing');
 perform pg_temp.ch_check((select format_type(a.atttypid,a.atttypmod)||' '||a.attnotnull from pg_catalog.pg_attribute a
   where a.attrelid='private.notification_outbox'::regclass and a.attname='message_id')='bigint false'
  and exists(select 1 from pg_catalog.pg_constraint c join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
   where c.conrelid='private.notification_outbox'::regclass and c.contype='f' and a.attname='message_id'
    and c.confrelid='public.messages'::regclass and c.confdeltype='c'),'The outbox''s message_id is not a cascading key to messages');
 perform pg_temp.ch_check((select indexdef from pg_catalog.pg_indexes where schemaname='private' and indexname='notification_outbox_recipient_kind_idx')
   like '%ON private.notification_outbox USING btree (recipient_id, kind, created_at)'
  and (select indexdef from pg_catalog.pg_indexes where schemaname='private' and indexname='notification_outbox_message_idx')
   like '%ON private.notification_outbox USING btree (message_id)'
  and (select indexdef from pg_catalog.pg_indexes where schemaname='public' and indexname='messages_author_created_idx')
   like '%ON public.messages USING btree (author_id, created_at)','The outbox''s or the rate limit''s index is wrong');
 perform pg_temp.ch_check((select string_agg(k[1],',' order by k[1]) from regexp_matches(pg_catalog.pg_get_constraintdef(
   (select oid from pg_catalog.pg_constraint where conname='notification_outbox_kind_check')),'''([a-z_]+)''','g') k)
   ='admin_added,announcement,chat_message,connection_accepted,connection_request,guest_note,invitation,invited,join_approved,'
    'join_request,plan_cancelled,plan_changed,'||case when pg_catalog.to_regclass('private.reports') is not null then 'report_filed,' else '' end||'rsvp',
  'The outbox''s kinds are wrong (chat plan 3 adds report_filed)');
 foreach f in array array['claim_notification_deliveries(integer)','validate_notification_delivery(uuid,uuid)',
   'finish_notification_delivery(uuid,uuid,text,text,integer)'] loop
  perform pg_temp.ch_check(has_function_privilege('service_role','public.'||f,'execute') and not has_function_privilege('anon','public.'||f,'execute')
   and not has_function_privilege('authenticated','public.'||f,'execute'),'public.'||f||' is not the worker''s alone');
 end loop;
 foreach r in array array['public','anon','authenticated','service_role'] loop
  perform pg_temp.ch_check(not has_function_privilege(r,'private.notification_recipient_eligible(bigint)','execute'),r||' may call the eligibility check');
 end loop;
end $$;
rollback;

-- Slice 3 (Task 3): Resbite's own lines and the live signal (Decision 1, K-B2, K-S2, K-S3, K-S6, H8, H13, NOTE 3,
-- NOTE 11, NOTE 12). Its own transaction, on the c1 cast again, with fresh one-offs (prefix c3), so no time an earlier
-- slice moved can refuse a call. 01 owns 'Garden party' (c31…01), tomorrow for three hours at "Ana's garden", and
-- 'Spare evening' (c31…02), a day later. On the party: 03 Going; 02, 04, 05 and 06 not answered, 05 brought by 03.
-- c3…10 'Kai Joiner' asks to join through the party's open link; c3…11 'Zoe Invited' is 01's connection, invited in the
-- app; c3…12 'Rob Web' is a web account (a live grant, never used the app), not answered, folded later into c3…13
-- 'Wren App'; c3…14 'Ivy Brought', brought by 12, not answered. The cast's guest rows sit between the two flag calls
-- (they are the cast, not answers), and write no line. Lines are read as pg_temp.ch_lines gives them; broadcasts as the
-- stub's realtime.messages rows.
begin;
-- A series' newest system line. The superuser's. Made in this transaction, so it goes with it: it depends on the
-- messages' row type, which the rollback rehearsal below drops.
create function pg_temp.ch_last_line(p_series uuid) returns public.messages language plpgsql stable as $$
declare m public.messages;
begin
 select * into m from public.messages x where x.series_id=p_series and x.kind='system' order by x.id desc limit 1;
 return m;
end $$;
select pg_temp.c1_cast();
insert into auth.users(id,email,email_confirmed_at)
 select pg_temp.c3(n),'chat3-'||n||'@resbite-test.invalid',now() from unnest(array['10','11','12','13','14']) n;
insert into private.tester_roster(email) select 'chat3-'||n||'@resbite-test.invalid' from unnest(array['10','11','13','14']) n;
insert into private.beta_access(user_id,source) values (pg_temp.c3('12'),'maintainer');
insert into private.app_sessions(user_id) values (pg_temp.c3('13')),(pg_temp.c3('14'));
insert into public.profiles(id,display_name) values (pg_temp.c3('10'),'Kai Joiner'),(pg_temp.c3('11'),'Zoe Invited'),
 (pg_temp.c3('12'),'Rob Web'),(pg_temp.c3('13'),'Wren App'),(pg_temp.c3('14'),'Ivy Brought');
select pg_temp.ch_rules();
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('01'));
select public.create_plan_v4(pg_temp.c3p('01'),'Garden party','',array['community'],null,pg_temp.c1_start(),
 pg_temp.c1_start()+interval '3 hours','Europe/London','Ana''s garden',false,null::smallint);
select public.create_plan_v4(pg_temp.c3p('02'),'Spare evening','',array['community'],null,pg_temp.c1_start()+interval '1 day',
 pg_temp.c1_start()+interval '1 day 2 hours','Europe/London','The pub',false,null::smallint);
reset role;
select set_config('resbite.system','roll',true);
insert into public.attendees(plan_id,user_id,response,brought_by) values
 (pg_temp.c3p('01'),pg_temp.c1('03'),'accepted',null),(pg_temp.c3p('01'),pg_temp.c1('04'),'pending',null),
 (pg_temp.c3p('01'),pg_temp.c1('05'),'pending',pg_temp.c1('03')),(pg_temp.c3p('01'),pg_temp.c1('06'),'pending',null),
 (pg_temp.c3p('01'),pg_temp.c1('02'),'pending',null),(pg_temp.c3p('01'),pg_temp.c3('12'),'pending',null),
 (pg_temp.c3p('01'),pg_temp.c3('14'),'pending',pg_temp.c3('12'));
select set_config('resbite.system','',true);
insert into public.connections(user_a,user_b,state,requested_by,accepted_at) values
 (least(pg_temp.c1('01'),pg_temp.c3('11')),greatest(pg_temp.c1('01'),pg_temp.c3('11')),'connected',pg_temp.c1('01'),now());
insert into private.plan_links(plan_id,code) values (pg_temp.c3p('01'),repeat('J',22));
select pg_temp.ch_check(pg_temp.ch_lines(pg_temp.c3p('01'))='' and pg_temp.ch_lines(pg_temp.c3p('02'))=''
 and not exists(select 1 from realtime.messages where topic in ('chat:'||pg_temp.c3p('01'),'chat:'||pg_temp.c3p('02'))),
 'Making the resbites and the cast wrote a line or a broadcast');

-- 04 says Going (respond): one line, joined, with no author (K-B2), 04 the actor and the user, and no bringer, so no
-- brought_by; one broadcast. Then Maybe, then Going again (H8): a move between Going and Maybe writes nothing and
-- changes nothing, the line and its broadcasts as they were. Going once more is respond's no-op: nothing.
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('04'));
select set_config('c3.v04',public.respond(pg_temp.c3p('01'),'accepted',1)::text,true);
reset role;
do $$ declare m public.messages := pg_temp.ch_last_line(pg_temp.c3p('01')); begin
 perform pg_temp.ch_check(pg_temp.ch_lines(pg_temp.c3p('01'))='joined:04','04''s Going gave the lines '||pg_temp.ch_lines(pg_temp.c3p('01')));
 perform pg_temp.ch_check((m.series_id,m.plan_id,m.author_id,m.kind,m.event,m.payload,m.body,m.audience,m.client_id,m.state)
   is not distinct from (pg_temp.c3p('01'),pg_temp.c3p('01'),null::uuid,'system'::text,'joined'::text,
    jsonb_build_object('actor',pg_temp.c1('04'),'user',pg_temp.c1('04')),null::text,null::text,null::uuid,'sent'::text),
  '04''s joined line: '||row_to_json(m)::text);
 perform pg_temp.ch_check(pg_temp.ch_signals(m.id)=1,'04''s line was broadcast '||pg_temp.ch_signals(m.id)||' times');
 perform set_config('c3.line04',row_to_json(m)::text,true);
 perform set_config('c3.line04_id',m.id::text,true);
end $$;
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('04'));
select set_config('c3.v04',public.respond(pg_temp.c3p('01'),'maybe',current_setting('c3.v04')::integer)::text,true);
select set_config('c3.v04',public.respond(pg_temp.c3p('01'),'accepted',current_setting('c3.v04')::integer)::text,true);
select set_config('c3.v04',public.respond(pg_temp.c3p('01'),'accepted',current_setting('c3.v04')::integer)::text,true);
reset role;
select pg_temp.ch_check(pg_temp.ch_lines(pg_temp.c3p('01'))='joined:04'
 and (select row_to_json(m)::text from public.messages m where m.id=current_setting('c3.line04_id')::bigint)=current_setting('c3.line04')
 and pg_temp.ch_signals(current_setting('c3.line04_id')::bigint)=1
 and (select response from public.attendees where plan_id=pg_temp.c3p('01') and user_id=pg_temp.c1('04'))='accepted',
 'Maybe, then Going again, wrote, changed or broadcast a line: '||pg_temp.ch_lines(pg_temp.c3p('01')));

-- 01 makes 04 an admin (appoint_admin, after 04's Going and before the cancel: K-N2): admin {actor 01, user 04}. A read
-- names both by first name (K-B2): 01 'Ana', 04 'Leo'.
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('01'));
select public.appoint_admin(pg_temp.c3p('01'),pg_temp.c1('04'));
do $$ declare r jsonb := public.chat_messages(pg_temp.c3p('01')); begin
 perform pg_temp.ch_check(r->'rows'->-1 @> jsonb_build_object('kind','system','event','admin','author_id',null,'body',null)
   and r->'rows'->-1->'payload'=jsonb_build_object('actor',pg_temp.c1('01'),'user',pg_temp.c1('04')),'The admin line: '||(r->'rows'->-1)::text);
 perform pg_temp.ch_check(r->'names'=jsonb_build_object(pg_temp.c1('01')::text,'Ana',pg_temp.c1('04')::text,'Leo'),
  'The names of the admin line: '||(r->'names')::text);
end $$;
reset role;
select pg_temp.ch_check(pg_temp.ch_lines(pg_temp.c3p('01'))='joined:04,admin:04','The lines after the appointment: '||pg_temp.ch_lines(pg_temp.c3p('01')));

-- A join request, made as open-link-approval.sql makes one: 10 asks through the party's open link, Going. Waiting writes
-- nothing (10 has no guest row yet). 01 approves (decide_join_request): joined {actor 01, user 10}, and a read names 10
-- 'Kai' (Review Focus 7: "Kai joined", not "Ana joined").
set local role authenticated;
select pg_temp.ch_as(pg_temp.c3('10'));
select pg_temp.ch_check(public.request_to_join(repeat('J',22),'Kai Joiner','accepted','2026-10')->>'state'='waiting','10''s request is not waiting');
reset role;
select pg_temp.ch_check(pg_temp.ch_lines(pg_temp.c3p('01'))='joined:04,admin:04','A waiting request wrote a line');
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('01'));
select public.decide_join_request(pg_temp.c3p('01'),pg_temp.c3('10'),true);
do $$ declare r jsonb := public.chat_messages(pg_temp.c3p('01')); begin
 perform pg_temp.ch_check(r->'rows'->-1->>'event'='joined' and r->'rows'->-1->'payload'=jsonb_build_object('actor',pg_temp.c1('01'),'user',pg_temp.c3('10')),
  'The approval''s line: '||(r->'rows'->-1)::text);
 perform pg_temp.ch_check(r->'names'->>(pg_temp.c3('10')::text)='Kai' and r->'names'->>(pg_temp.c1('01')::text)='Ana',
  'The approval''s names: '||(r->'names')::text);
end $$;
reset role;
select pg_temp.ch_check(pg_temp.ch_lines(pg_temp.c3p('01'))='joined:04,admin:04,joined:10','The lines after the approval: '||pg_temp.ch_lines(pg_temp.c3p('01')));

-- The live signal (K-S6, NOTE 3). 03 writes 'Bringing lemonade' and deletes it: two broadcasts on the private topic
-- chat:<series>, event chat, each with only {id, kind, state}: sent, then deleted.
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('03'));
select set_config('c3.lemonade',pg_temp.ch_send(pg_temp.c3p('01'),'Bringing lemonade')::text,true);
select public.delete_message(current_setting('c3.lemonade')::bigint);
reset role;
select pg_temp.ch_check((select string_agg(r.event||' '||r.extension||' '||r.private::text||' '||r.payload::text,' | ' order by r.id)
  from realtime.messages r where r.topic='chat:'||pg_temp.c3p('01') and r.payload->>'id'=current_setting('c3.lemonade'))
 =format('chat broadcast true {"id": %s, "kind": "message", "state": "sent"} | chat broadcast true {"id": %s, "kind": "message", "state": "deleted"}',
  current_setting('c3.lemonade'),current_setting('c3.lemonade')),
 'The broadcasts of 03''s message: '||coalesce((select string_agg(r.topic||' '||r.payload::text,' | ' order by r.id) from realtime.messages r
  where r.payload->>'id'=current_setting('c3.lemonade')),'none'));

-- Who may listen (K-S6, H23, H34). As a signed-in 03, in the chat, with Realtime's topic set to the party's, its
-- broadcasts read under RLS, and only the party's: another topic's broadcast (made by hand here) never does (K8); as 08,
-- a stranger, none. As 03 with a topic that is not exactly chat:<lower-case uuid> (not a uuid,
-- upper case, thirty-six hyphens, a trailing newline, a trailing digit, none at all), none, and no error. With 03's
-- roster entry turned off (03 may no longer use the app), none, though 03 is still in the chat.
select realtime.send('{"id": 0, "kind": "message", "state": "sent"}'::jsonb,'chat','chat:'||gen_random_uuid(),true);
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('03'));
select set_config('realtime.topic','chat:'||pg_temp.c3p('01'),true);
select pg_temp.ch_check((select count(*) from realtime.messages)>0,'03, in the chat, may not read its broadcasts');
select pg_temp.ch_check((select count(*) from realtime.messages where topic<>'chat:'||pg_temp.c3p('01'))=0,
 '03 reads another topic''s broadcast under the party''s check');
select pg_temp.ch_as(pg_temp.c1('08'));
select pg_temp.ch_check((select count(*) from realtime.messages)=0,'08, a stranger, may read the party''s broadcasts');
select pg_temp.ch_as(pg_temp.c1('03'));
do $$ declare t text; begin
 foreach t in array array['chat:not-a-uuid','chat:'||upper(pg_temp.c3p('01')::text),'chat:'||repeat('-',36),'chat:'||pg_temp.c3p('01')||e'\n',
   'chat:'||pg_temp.c3p('01')||'0','other:x',''] loop
  perform set_config('realtime.topic',t,true);
  perform pg_temp.ch_check((select count(*) from realtime.messages)=0,format('03 reads broadcasts with the topic %L',t));
 end loop;
end $$;
reset role;
update private.tester_roster set enabled=false where email='chat1-03@resbite-test.invalid';
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('03'));
select set_config('realtime.topic','chat:'||pg_temp.c3p('01'),true);
select pg_temp.ch_check((select count(*) from realtime.messages)=0,'03, who may no longer use the app, may still read the broadcasts');
select set_config('realtime.topic','',true);
reset role;
select pg_temp.ch_check(private.chat_member(pg_temp.c3p('01'),pg_temp.c1('03')),'03 left the chat with the roster entry');
update private.tester_roster set enabled=true where email='chat1-03@resbite-test.invalid';
-- can_listen itself: true for 03 on the party; false for every malformed topic, another family, a uuid that is no chat
-- of 03's, null, 08 and nobody signed in.
do $$ declare t text; begin
 perform pg_temp.ch_as(pg_temp.c1('03'));
 perform pg_temp.ch_check(private.can_listen('chat:'||pg_temp.c3p('01')),'can_listen is not true for 03 on the party');
 foreach t in array array['chat:not-a-uuid','other:x','chat:'||upper(pg_temp.c3p('01')::text),'chat:'||repeat('-',36),
   'chat:'||pg_temp.c3p('01')||e'\n','chat:'||pg_temp.c3p('01')||'0',' chat:'||pg_temp.c3p('01'),'chat:'||gen_random_uuid(),''] loop
  perform pg_temp.ch_check(private.can_listen(t) is false,format('can_listen(%L) is not false',t));
 end loop;
 perform pg_temp.ch_check(private.can_listen(null) is false,'can_listen(null) is not false');
 perform pg_temp.ch_as(pg_temp.c1('08'));
 perform pg_temp.ch_check(private.can_listen('chat:'||pg_temp.c3p('01')) is false,'can_listen is not false for 08');
 perform set_config('request.jwt.claims','',true);
 perform pg_temp.ch_check(private.can_listen('chat:'||pg_temp.c3p('01')) is false,'can_listen is not false for nobody');
end $$;

-- 03 says Can't go after Going (respond 'withdrawn', as the app sends it): cant_go {actor 03, user 03}; and from then
-- 03 may not listen (Review Focus 1). 02 says Maybe from not answered: joined {actor 02, user 02}.
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('03'));
select public.respond(pg_temp.c3p('01'),'withdrawn',1);
select set_config('realtime.topic','chat:'||pg_temp.c3p('01'),true);
select pg_temp.ch_check((select count(*) from realtime.messages)=0,'03, who said Can''t go, may still read the broadcasts');
select set_config('realtime.topic','',true);
reset role;
select pg_temp.ch_check(pg_temp.ch_lines(pg_temp.c3p('01'))='joined:04,admin:04,joined:10,cant_go:03'
 and (pg_temp.ch_last_line(pg_temp.c3p('01'))).payload=jsonb_build_object('actor',pg_temp.c1('03'),'user',pg_temp.c1('03')),
 '03''s Can''t go: '||pg_temp.ch_lines(pg_temp.c3p('01'))||' '||(pg_temp.ch_last_line(pg_temp.c3p('01'))).payload::text);
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('02'));
select set_config('c3.v02',public.respond(pg_temp.c3p('01'),'maybe',1)::text,true);
reset role;
select pg_temp.ch_check(pg_temp.ch_lines(pg_temp.c3p('01'))='joined:04,admin:04,joined:10,cant_go:03,joined:02'
 and (pg_temp.ch_last_line(pg_temp.c3p('01'))).payload=jsonb_build_object('actor',pg_temp.c1('02'),'user',pg_temp.c1('02')),
 '02''s Maybe: '||pg_temp.ch_lines(pg_temp.c3p('01')));
select set_config('c3.line02',row_to_json(pg_temp.ch_last_line(pg_temp.c3p('01')))::text,true);

-- 05, brought by 03, says Going: joined {actor 05, user 05, brought_by 03} ("joined · brought by Mia", H13), and a read
-- names both, brought_by being a person key.
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('05'));
select public.respond(pg_temp.c3p('01'),'accepted',1);
do $$ declare r jsonb := public.chat_messages(pg_temp.c3p('01')); begin
 perform pg_temp.ch_check(r->'rows'->-1->>'event'='joined'
   and r->'rows'->-1->'payload'=jsonb_build_object('actor',pg_temp.c1('05'),'user',pg_temp.c1('05'),'brought_by',pg_temp.c1('03')),
  'The brought guest''s line: '||(r->'rows'->-1)::text);
 perform pg_temp.ch_check(r->'names'->>(pg_temp.c1('03')::text)='Mia' and r->'names'->>(pg_temp.c1('05')::text)='Sol',
  'The brought guest''s names: '||(r->'names')::text);
end $$;
reset role;

-- 02 says Can't go from Maybe (respond 'declined') within the 10 minutes: only 05's line, which does not name 02, came
-- after 02's, so 02's line turns into cant_go {actor 02, user 02} in place (created_at kept, one more broadcast).
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('02'));
select public.respond(pg_temp.c3p('01'),'declined',current_setting('c3.v02')::integer);
reset role;
do $$ declare v jsonb := current_setting('c3.line02')::jsonb; m public.messages; begin
 select * into m from public.messages where id=(v->>'id')::bigint;
 perform pg_temp.ch_check(pg_temp.ch_lines(pg_temp.c3p('01'))='joined:04,admin:04,joined:10,cant_go:03,cant_go:02,joined:05'
   and m.payload=jsonb_build_object('actor',pg_temp.c1('02'),'user',pg_temp.c1('02')) and m.created_at=(v->>'created_at')::timestamptz
   and pg_temp.ch_signals(m.id)=2,'02''s Can''t go from Maybe: '||pg_temp.ch_lines(pg_temp.c3p('01'))||' '||row_to_json(m)::text);
end $$;

-- 01 invites 11, a connection, in the app (invite_contacts): a guest row not answered, and no line. 11 then says Can't
-- go: no line either.
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('01'));
select pg_temp.ch_check(public.invite_contacts(pg_temp.c3p('01'),jsonb_build_array(jsonb_build_object('user',pg_temp.c3('11'))))
 =jsonb_build_array(jsonb_build_object('user',pg_temp.c3('11'),'kind','app')),'01 could not invite 11 in the app');
reset role;
select pg_temp.ch_check(exists(select 1 from public.attendees where plan_id=pg_temp.c3p('01') and user_id=pg_temp.c3('11') and response='pending')
 and pg_temp.ch_lines(pg_temp.c3p('01'))='joined:04,admin:04,joined:10,cant_go:03,cant_go:02,joined:05',
 'The in-app invitation gave no guest row, or wrote a line: '||pg_temp.ch_lines(pg_temp.c3p('01')));
-- 11, never in the chat, says Can't go (respond): only a move out of Going or Maybe is news; nothing.
set local role authenticated;
select pg_temp.ch_as(pg_temp.c3('11'));
select public.respond(pg_temp.c3p('01'),'declined',1);
reset role;
select pg_temp.ch_check(pg_temp.ch_lines(pg_temp.c3p('01'))='joined:04,admin:04,joined:10,cant_go:03,cant_go:02,joined:05',
 'Can''t go from not answered wrote a line: '||pg_temp.ch_lines(pg_temp.c3p('01')));

-- 06 says Going, Can't go, Going, Can't go, Going within a minute (K-S2, Decision 10): one line about 06, made at the
-- first answer and updated in place each time after (its created_at kept, updated_at moved), with a broadcast each time:
-- five. After the second answer it read cant_go {actor 06, user 06}; at the end joined {actor 06, user 06}. Nobody
-- else's line changed.
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('06'));
select set_config('c3.v06',public.respond(pg_temp.c3p('01'),'accepted',1)::text,true);
reset role;
select set_config('c3.line06',(select row_to_json(m)::text from public.messages m where m.series_id=pg_temp.c3p('01') and m.kind='system'
 and m.payload->>'user'=pg_temp.c1('06')::text),true);
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('06'));
select set_config('c3.v06',public.respond(pg_temp.c3p('01'),'declined',current_setting('c3.v06')::integer)::text,true);
reset role;
do $$ declare v jsonb := current_setting('c3.line06')::jsonb; m public.messages := pg_temp.ch_last_line(pg_temp.c3p('01')); begin
 perform pg_temp.ch_check(m.id=(v->>'id')::bigint and m.event='cant_go' and m.payload=jsonb_build_object('actor',pg_temp.c1('06'),'user',pg_temp.c1('06'))
   and m.created_at=(v->>'created_at')::timestamptz and m.updated_at=now() and pg_temp.ch_signals(m.id)=2,
  '06''s Can''t go did not turn the line into cant_go in place: '||row_to_json(m)::text);
end $$;
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('06'));
select set_config('c3.v06',public.respond(pg_temp.c3p('01'),'accepted',current_setting('c3.v06')::integer)::text,true);
select set_config('c3.v06',public.respond(pg_temp.c3p('01'),'declined',current_setting('c3.v06')::integer)::text,true);
select set_config('c3.v06',public.respond(pg_temp.c3p('01'),'accepted',current_setting('c3.v06')::integer)::text,true);
reset role;
do $$ declare v jsonb := current_setting('c3.line06')::jsonb; m public.messages; begin
 select * into m from public.messages where id=(v->>'id')::bigint;
 perform pg_temp.ch_check(pg_temp.ch_lines(pg_temp.c3p('01'))='joined:04,admin:04,joined:10,cant_go:03,cant_go:02,joined:05,joined:06',
  'Five answers by 06 gave the lines '||pg_temp.ch_lines(pg_temp.c3p('01')));
 perform pg_temp.ch_check(m.event='joined' and m.payload=jsonb_build_object('actor',pg_temp.c1('06'),'user',pg_temp.c1('06'))
   and m.created_at=(v->>'created_at')::timestamptz and m.created_at>=now() and m.updated_at=now(),'06''s line after five answers: '||row_to_json(m)::text);
 perform pg_temp.ch_check(pg_temp.ch_signals(m.id)=5,'06''s line was broadcast '||pg_temp.ch_signals(m.id)||' times, not 5');
 perform pg_temp.ch_check((select count(*) from realtime.messages r where r.topic='chat:'||pg_temp.c3p('01') and r.payload->>'id'=m.id::text
   and r.payload=jsonb_build_object('id',m.id,'kind','system','state','sent'))=5,'06''s broadcasts are not {id, kind system, state sent}');
 perform pg_temp.ch_check((select row_to_json(x)::text from public.messages x where x.id=current_setting('c3.line04_id')::bigint)=current_setting('c3.line04'),
  '06''s answers changed 04''s line');
end $$;
-- Ten minutes (K-S2): with 06's line made 9 min 59 s ago (moved by hand: a broadcast), 06's Can't go still updates it
-- (a broadcast); made 10 min 1 s ago (another), 06's Going is a new line, and the old one keeps saying cant_go.
update public.messages set created_at=now()-interval '9 minutes 59 seconds' where id=(current_setting('c3.line06')::jsonb->>'id')::bigint;
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('06'));
select set_config('c3.v06',public.respond(pg_temp.c3p('01'),'declined',current_setting('c3.v06')::integer)::text,true);
reset role;
select pg_temp.ch_check(pg_temp.ch_lines(pg_temp.c3p('01'))='joined:04,admin:04,joined:10,cant_go:03,cant_go:02,joined:05,cant_go:06'
 and pg_temp.ch_signals((current_setting('c3.line06')::jsonb->>'id')::bigint)=7,
 'A Can''t go 9 min 59 s after the line did not update it: '||pg_temp.ch_lines(pg_temp.c3p('01')));
update public.messages set created_at=now()-interval '10 minutes 1 second' where id=(current_setting('c3.line06')::jsonb->>'id')::bigint;
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('06'));
select set_config('c3.v06',public.respond(pg_temp.c3p('01'),'accepted',current_setting('c3.v06')::integer)::text,true);
reset role;
select pg_temp.ch_check(pg_temp.ch_lines(pg_temp.c3p('01'))='joined:04,admin:04,joined:10,cant_go:03,cant_go:02,joined:05,cant_go:06,joined:06'
 and pg_temp.ch_signals((current_setting('c3.line06')::jsonb->>'id')::bigint)=8
 and pg_temp.ch_signals((pg_temp.ch_last_line(pg_temp.c3p('01'))).id)=1
 and (pg_temp.ch_last_line(pg_temp.c3p('01'))).payload=jsonb_build_object('actor',pg_temp.c1('06'),'user',pg_temp.c1('06')),
 'A Going 10 min 1 s after the line was not a new line: '||pg_temp.ch_lines(pg_temp.c3p('01')));

-- 04, an admin since its appointment, says Can't go from Going (respond 'declined'; the role ends with it) within the
-- 10 minutes of its joined line. The admin line names 04 and came after it, so neither line changes (H33: the feed keeps
-- its order, and only joined and cant_go lines ever merge): a new cant_go {actor 04, user 04}.
select set_config('c3.lines_before04',(select string_agg(row_to_json(m)::text,'|' order by m.id) from public.messages m
 where m.series_id=pg_temp.c3p('01') and m.kind='system'),true);
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('04'));
select public.respond(pg_temp.c3p('01'),'declined',current_setting('c3.v04')::integer);
reset role;
select pg_temp.ch_check(pg_temp.ch_lines(pg_temp.c3p('01'))='joined:04,admin:04,joined:10,cant_go:03,cant_go:02,joined:05,cant_go:06,joined:06,cant_go:04'
 and (select string_agg(row_to_json(m)::text,'|' order by m.id) from public.messages m where m.series_id=pg_temp.c3p('01') and m.kind='system'
  and m.id<(pg_temp.ch_last_line(pg_temp.c3p('01'))).id)=current_setting('c3.lines_before04')
 and (pg_temp.ch_last_line(pg_temp.c3p('01'))).payload=jsonb_build_object('actor',pg_temp.c1('04'),'user',pg_temp.c1('04'))
 and not exists(select 1 from public.plan_admins where plan_id=pg_temp.c3p('01') and user_id=pg_temp.c1('04')),
 '04''s Can''t go after its admin line: '||pg_temp.ch_lines(pg_temp.c3p('01')));

-- Changes (K-S2, K-S3), through change_plan_v4 as 01: each a changed line, actor 01, with exactly the eight keys of
-- K-S3 beside it. The place ('The bandstand'): what 'place', the starts, ends and zones the same, place_label the new
-- label. The start half an hour later: what 'time', from_start and to_start differing. The end an hour later: what
-- 'time', from_end and to_end differing. The zone (Europe/Paris, the same instants): what 'time', from_zone and to_zone
-- differing. The start and the place together: 'time_place'. The title alone: nothing.
do $$ declare s timestamptz := pg_temp.c1_start(); e timestamptz := pg_temp.c1_start()+interval '3 hours'; m public.messages;
 n bigint := (select count(*) from public.messages where series_id=pg_temp.c3p('01') and kind='system'); begin
 perform pg_temp.ch_as(pg_temp.c1('01'));
 perform pg_temp.ch_change(pg_temp.c3p('01'),'Garden party',s,e,'Europe/London','The bandstand');
 m := pg_temp.ch_last_line(pg_temp.c3p('01'));
 perform pg_temp.ch_check(m.event='changed' and m.author_id is null and m.payload=jsonb_build_object('actor',pg_temp.c1('01'),'what','place',
   'from_start',s,'to_start',s,'from_end',e,'to_end',e,'from_zone','Europe/London','to_zone','Europe/London','place_label','The bandstand'),
  'The place change: '||coalesce(m.event,'none')||' '||coalesce(m.payload::text,''));
 perform pg_temp.ch_change(pg_temp.c3p('01'),'Garden party',s+interval '30 minutes',e,'Europe/London','The bandstand');
 m := pg_temp.ch_last_line(pg_temp.c3p('01'));
 perform pg_temp.ch_check(m.event='changed' and m.payload=jsonb_build_object('actor',pg_temp.c1('01'),'what','time',
   'from_start',s,'to_start',s+interval '30 minutes','from_end',e,'to_end',e,'from_zone','Europe/London','to_zone','Europe/London',
   'place_label','The bandstand'),'The start change: '||m.payload::text);
 perform pg_temp.ch_change(pg_temp.c3p('01'),'Garden party',s+interval '30 minutes',e+interval '1 hour','Europe/London','The bandstand');
 m := pg_temp.ch_last_line(pg_temp.c3p('01'));
 perform pg_temp.ch_check(m.event='changed' and m.payload=jsonb_build_object('actor',pg_temp.c1('01'),'what','time',
   'from_start',s+interval '30 minutes','to_start',s+interval '30 minutes','from_end',e,'to_end',e+interval '1 hour',
   'from_zone','Europe/London','to_zone','Europe/London','place_label','The bandstand'),'The end change: '||m.payload::text);
 perform pg_temp.ch_change(pg_temp.c3p('01'),'Garden party',s+interval '30 minutes',e+interval '1 hour','Europe/Paris','The bandstand');
 m := pg_temp.ch_last_line(pg_temp.c3p('01'));
 perform pg_temp.ch_check(m.event='changed' and m.payload=jsonb_build_object('actor',pg_temp.c1('01'),'what','time',
   'from_start',s+interval '30 minutes','to_start',s+interval '30 minutes','from_end',e+interval '1 hour','to_end',e+interval '1 hour',
   'from_zone','Europe/London','to_zone','Europe/Paris','place_label','The bandstand'),'The zone change: '||m.payload::text);
 perform pg_temp.ch_change(pg_temp.c3p('01'),'Garden party',s,e+interval '1 hour','Europe/Paris','The rose garden');
 m := pg_temp.ch_last_line(pg_temp.c3p('01'));
 perform pg_temp.ch_check(m.event='changed' and m.payload=jsonb_build_object('actor',pg_temp.c1('01'),'what','time_place',
   'from_start',s+interval '30 minutes','to_start',s,'from_end',e+interval '1 hour','to_end',e+interval '1 hour',
   'from_zone','Europe/Paris','to_zone','Europe/Paris','place_label','The rose garden'),'The start and place change: '||m.payload::text);
 perform pg_temp.ch_check((select count(*) from public.messages where series_id=pg_temp.c3p('01') and kind='system')=n+5,
  'The five changes did not write five lines');
 perform pg_temp.ch_change(pg_temp.c3p('01'),'Summer garden party',s,e+interval '1 hour','Europe/Paris','The rose garden');
 perform pg_temp.ch_check((select count(*) from public.messages where series_id=pg_temp.c3p('01') and kind='system')=n+5,
  'A new title wrote a line');
end $$;
-- A flip of place_tbd with the label as it is (by hand; plans_place_tbd_valid lets it only while the label reads 'To be
-- decided', put there under the roll's flag): nothing, either way. The label goes back the same way. The circle
-- (set_plan_circle as 01, NOTE 11): nothing; only bring_invites, bring_levels and the version change.
do $$ declare n bigint := (select count(*) from public.messages where series_id=pg_temp.c3p('01'));
 v_before jsonb; v_after jsonb; begin
 perform set_config('resbite.system','roll',true);
 update public.plans set place_label='To be decided' where id=pg_temp.c3p('01');
 perform set_config('resbite.system','',true);
 update public.plans set place_tbd=true where id=pg_temp.c3p('01');
 update public.plans set place_tbd=false where id=pg_temp.c3p('01');
 perform pg_temp.ch_check((select count(*) from public.messages where series_id=pg_temp.c3p('01'))=n,'A place_tbd flip wrote a line');
 perform set_config('resbite.system','roll',true);
 update public.plans set place_label='The rose garden' where id=pg_temp.c3p('01');
 perform set_config('resbite.system','',true);
 v_before := (select to_jsonb(p) from public.plans p where p.id=pg_temp.c3p('01'));
 perform pg_temp.ch_as(pg_temp.c1('01'));
 perform public.set_plan_circle(pg_temp.c3p('01'),1::smallint,2::smallint);
 v_after := (select to_jsonb(p) from public.plans p where p.id=pg_temp.c3p('01'));
 perform pg_temp.ch_check(v_after-'bring_invites'-'bring_levels'-'version'=v_before-'bring_invites'-'bring_levels'-'version'
   and v_after->>'bring_invites'='1' and v_after->>'bring_levels'='2' and (v_after->>'version')::integer=(v_before->>'version')::integer+1,
  'set_plan_circle changed more than the circle and the version: '||v_after::text);
 perform pg_temp.ch_check((select count(*) from public.messages where series_id=pg_temp.c3p('01'))=n,'set_plan_circle wrote a line');
end $$;

-- The flags (K-S2, NOTE 12). chat_lines_off is true for 'roll' and 'deletion' only. Under 'roll' (the roll's; plan 2's
-- G-B6 runs the real one): an accepted guest row and a plan_admins row (07) write no line. Under 'deletion' (the
-- deletion request's): 01 cancelling the spare evening writes no line on it, and no broadcast. Each ends with the flag
-- reset, so the lines after it are written.
do $$ declare n bigint := (select count(*) from public.messages where series_id=pg_temp.c3p('01')); begin
 perform pg_temp.ch_check(private.chat_lines_off() is false,'The lines are off with no flag');
 perform set_config('resbite.system','roll',true);
 perform pg_temp.ch_check(private.chat_lines_off(),'The lines are on under the roll''s flag');
 insert into public.attendees(plan_id,user_id,response) values (pg_temp.c3p('01'),pg_temp.c1('07'),'accepted');
 insert into public.plan_admins(plan_id,user_id,appointed_by) values (pg_temp.c3p('01'),pg_temp.c1('07'),pg_temp.c1('01'));
 perform set_config('resbite.system','',true);
 perform pg_temp.ch_check((select count(*) from public.messages where series_id=pg_temp.c3p('01'))=n,'Under the roll''s flag, 07''s rows wrote a line');
 perform pg_temp.ch_check(private.chat_lines_off() is false,'The lines are off with the flag reset');
 perform set_config('resbite.system','other',true);
 perform pg_temp.ch_check(private.chat_lines_off() is false,'The lines are off under another flag');
 perform set_config('resbite.system','deletion',true);
 perform pg_temp.ch_check(private.chat_lines_off(),'The lines are on under the deletion''s flag');
 perform pg_temp.ch_as(pg_temp.c1('01'));
 perform public.change_plan_v4(pg_temp.c3p('02'),(select version from public.plans where id=pg_temp.c3p('02')),'Spare evening','',
  array['community'],null,null,null,null,null,null::smallint,null,null,true);
 perform set_config('resbite.system','',true);
 perform pg_temp.ch_check((select status from public.plans where id=pg_temp.c3p('02'))='cancelled'
   and not exists(select 1 from public.messages where series_id=pg_temp.c3p('02'))
   and not exists(select 1 from realtime.messages where topic='chat:'||pg_temp.c3p('02')),'Under the deletion''s flag, the cancel wrote a line');
end $$;

-- The fold (fold_web_account, H33, H34). 12, a web account with a live grant, says Going (joined {actor 12, user 12})
-- and writes 'On my way'; 14, whom 12 brought, says Going (joined {actor 14, user 14, brought_by 12}). Then 12 is
-- folded into the app account 13: the moved guest row, already answered, writes no line; the message's author and
-- every person key naming 12 (actor, user, brought_by) now name 13, so a read names Wren, and 12 nowhere. The message
-- keeps its words and stays sent (H42 M1: the fold moves an author to another account, never to nobody).
set local role authenticated;
select pg_temp.ch_as(pg_temp.c3('12'));
select public.respond(pg_temp.c3p('01'),'accepted',1);
select set_config('c3.onmyway',pg_temp.ch_send(pg_temp.c3p('01'),'On my way')::text,true);
select pg_temp.ch_as(pg_temp.c3('14'));
select public.respond(pg_temp.c3p('01'),'accepted',1);
reset role;
select set_config('c3.line12',(select id::text from public.messages where series_id=pg_temp.c3p('01') and kind='system' and payload->>'user'=pg_temp.c3('12')::text),true);
select set_config('c3.line14',(select id::text from public.messages where series_id=pg_temp.c3p('01') and kind='system' and payload->>'user'=pg_temp.c3('14')::text),true);
select pg_temp.ch_check((select payload from public.messages where id=current_setting('c3.line12')::bigint)=jsonb_build_object('actor',pg_temp.c3('12'),'user',pg_temp.c3('12'))
 and (select payload from public.messages where id=current_setting('c3.line14')::bigint)=jsonb_build_object('actor',pg_temp.c3('14'),'user',pg_temp.c3('14'),'brought_by',pg_temp.c3('12'))
 and (select author_id from public.messages where id=current_setting('c3.onmyway')::bigint)=pg_temp.c3('12'),'12''s and 14''s lines, or 12''s message, are not as written');
select set_config('c3.system_before_fold',(select count(*)::text from public.messages where series_id=pg_temp.c3p('01') and kind='system'),true);
select private.fold_web_account(pg_temp.c3('12'),pg_temp.c3('13'));
do $$ declare r jsonb; begin
 perform pg_temp.ch_check((select count(*)::text from public.messages where series_id=pg_temp.c3p('01') and kind='system')=current_setting('c3.system_before_fold')
   and (select response from public.attendees where plan_id=pg_temp.c3p('01') and user_id=pg_temp.c3('13'))='accepted'
   and not exists(select 1 from public.attendees where user_id=pg_temp.c3('12')),'The fold wrote a line, or did not move 12''s answered row');
 perform pg_temp.ch_check((select payload from public.messages where id=current_setting('c3.line12')::bigint)=jsonb_build_object('actor',pg_temp.c3('13'),'user',pg_temp.c3('13'))
   and (select payload from public.messages where id=current_setting('c3.line14')::bigint)=jsonb_build_object('actor',pg_temp.c3('14'),'user',pg_temp.c3('14'),'brought_by',pg_temp.c3('13'))
   and (select (author_id,body,state) from public.messages where id=current_setting('c3.onmyway')::bigint)
    is not distinct from (pg_temp.c3('13'),'On my way'::text,'sent'::text)
   and not exists(select 1 from public.messages m where m.author_id=pg_temp.c3('12') or pg_temp.c3('12')::text in (m.payload->>'actor',m.payload->>'user',m.payload->>'brought_by')),
  'The fold left the web account in the chat: '||(select string_agg(id||' '||coalesce(author_id::text,'-')||' '||coalesce(payload::text,'-'),' | ' order by id)
   from public.messages where id in (current_setting('c3.line12')::bigint,current_setting('c3.line14')::bigint,current_setting('c3.onmyway')::bigint)));
 perform pg_temp.ch_as(pg_temp.c1('01'));
 r := public.chat_messages(pg_temp.c3p('01'));
 perform pg_temp.ch_check(r->'names'->>(pg_temp.c3('13')::text)='Wren' and not (r->'names' ? pg_temp.c3('12')::text),
  'After the fold, the names: '||(r->'names')::text);
end $$;

-- A broadcast that fails never stops a write (H33): with realtime.send raising, and then with no realtime.send at all,
-- 11's Going (respond), 05's message (send_message) and 01 making 05 an admin (appoint_admin) all go through, with their
-- line, row and line, and no broadcast. Undone afterwards (a savepoint), realtime.send included.
savepoint ch_no_realtime;
create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void
language plpgsql as $$ begin raise exception 'Realtime is down'; end $$;
do $$ declare n bigint := (select count(*) from realtime.messages); v_id bigint; begin
 perform pg_temp.ch_as(pg_temp.c3('11'));
 perform public.respond(pg_temp.c3p('01'),'accepted',(select version from public.attendees where plan_id=pg_temp.c3p('01') and user_id=pg_temp.c3('11')));
 perform pg_temp.ch_as(pg_temp.c1('05'));
 v_id := pg_temp.ch_send(pg_temp.c3p('01'),'Is it still on?');
 perform pg_temp.ch_as(pg_temp.c1('01'));
 perform public.appoint_admin(pg_temp.c3p('01'),pg_temp.c1('05'));
 perform pg_temp.ch_check(pg_temp.ch_lines(pg_temp.c3p('01')) like '%,joined:11,admin:05' and exists(select 1 from public.messages where id=v_id and body='Is it still on?')
   and (select count(*) from realtime.messages)=n,'With realtime.send raising, a write failed or broadcast: '||pg_temp.ch_lines(pg_temp.c3p('01')));
end $$;
rollback to savepoint ch_no_realtime;
savepoint ch_no_realtime;
drop function realtime.send(jsonb,text,text,boolean);
do $$ declare v_id bigint; begin
 perform pg_temp.ch_as(pg_temp.c3('11'));
 perform public.respond(pg_temp.c3p('01'),'accepted',(select version from public.attendees where plan_id=pg_temp.c3p('01') and user_id=pg_temp.c3('11')));
 perform pg_temp.ch_as(pg_temp.c1('05'));
 v_id := pg_temp.ch_send(pg_temp.c3p('01'),'Is it still on?');
 perform pg_temp.ch_as(pg_temp.c1('01'));
 perform public.appoint_admin(pg_temp.c3p('01'),pg_temp.c1('05'));
 perform pg_temp.ch_check(pg_temp.ch_lines(pg_temp.c3p('01')) like '%,joined:11,admin:05' and exists(select 1 from public.messages where id=v_id),
  'With no realtime.send, a write failed: '||pg_temp.ch_lines(pg_temp.c3p('01')));
end $$;
rollback to savepoint ch_no_realtime;
release savepoint ch_no_realtime;
select pg_temp.ch_check(pg_catalog.to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null
 and not exists(select 1 from public.messages where series_id=pg_temp.c3p('01') and body='Is it still on?'),'The savepoint did not undo the failing signal''s test');

-- 01 cancels the party through change_plan_v4: cancelled {actor 01, stop, starts_at, time_zone} (chat plan 2, G-S2):
-- stop true, as a one-off has no rule to stop, and the cancelled occurrence's start and zone.
do $$ declare m public.messages; p public.plans; begin
 perform pg_temp.ch_as(pg_temp.c1('01'));
 perform public.change_plan_v4(pg_temp.c3p('01'),(select version from public.plans where id=pg_temp.c3p('01')),'Summer garden party','',
  array['community'],null,null,null,null,null,null::smallint,null,null,true);
 m := pg_temp.ch_last_line(pg_temp.c3p('01'));
 select * into p from public.plans where id=pg_temp.c3p('01');
 perform pg_temp.ch_check(m.event='cancelled' and pg_temp.ch_keys(m.payload)='actor,starts_at,stop,time_zone'
   and m.payload->>'actor'=pg_temp.c1('01')::text and m.payload->'stop'='true'::jsonb
   and (m.payload->>'starts_at')::timestamptz=p.starts_at and m.payload->>'time_zone'=p.time_zone and pg_temp.ch_signals(m.id)=1,
  'The cancel''s line: '||coalesce(row_to_json(m)::text,'none'));
 perform set_config('c3.cancelled',m.id::text,true);
end $$;

-- A cancelled plan's later edits (by hand: change_plan_v4 refuses them) write no line: a new title, then a new time
-- and place (H33: the cancel guard; only active plans have changes).
do $$ declare n bigint := (select count(*) from public.messages where series_id=pg_temp.c3p('01') and kind='system'); begin
 update public.plans set title='Garden party, off' where id=pg_temp.c3p('01');
 update public.plans set starts_at=starts_at+interval '1 day',ends_at=ends_at+interval '1 day',place_label='The shed' where id=pg_temp.c3p('01');
 perform pg_temp.ch_check((select count(*) from public.messages where series_id=pg_temp.c3p('01') and kind='system')=n,
  'An edit of a cancelled plan wrote a line: '||pg_temp.ch_lines(pg_temp.c3p('01')));
end $$;

-- A system line is nobody's message (K-B2): its actor may not delete it, 42501 'Not your message', nor a host remove
-- it, 42501 'Hosts only'; it stays as it was.
select set_config('c3.lines_before',(select string_agg(row_to_json(m)::text,'|' order by m.id) from public.messages m
 where m.series_id=pg_temp.c3p('01') and m.kind='system'),true);
set local role authenticated;
select pg_temp.ch_as(pg_temp.c1('01'));
select pg_temp.ch_refused(format('select public.delete_message(%s)',current_setting('c3.cancelled')),'42501','Not your message');
select pg_temp.ch_refused(format('select public.remove_message(%s)',current_setting('c3.line04_id')),'42501','Hosts only');
select pg_temp.ch_as(pg_temp.c1('04'));
select pg_temp.ch_refused(format('select public.delete_message(%s)',current_setting('c3.line04_id')),'42501','Not your message');
select pg_temp.ch_refused(format('select public.remove_message(%s)',current_setting('c3.cancelled')),'42501','Hosts only');
reset role;
select pg_temp.ch_check((select string_agg(row_to_json(m)::text,'|' order by m.id) from public.messages m
 where m.series_id=pg_temp.c3p('01') and m.kind='system')=current_setting('c3.lines_before'),'A refused delete or remove changed a system line');

-- chat_system_line itself (Shared interfaces): kind system, no author, on the plan's chat; it adds actor = auth.uid()
-- unless the payload names an actor, null included (plan 2's roll writes its group lines with actor null through it),
-- and it checks no flag. On the spare evening's chat, with 01 signed in.
do $$ declare m public.messages; begin
 perform pg_temp.ch_as(pg_temp.c1('01'));
 perform set_config('resbite.system','roll',true);
 perform private.chat_system_line(pg_temp.c3p('02'),'ended',jsonb_build_object('actor',null,'title','Spare evening'));
 perform set_config('resbite.system','',true);
 m := pg_temp.ch_last_line(pg_temp.c3p('02'));
 perform pg_temp.ch_check((m.series_id,m.plan_id,m.author_id,m.kind,m.event,m.payload,m.body,m.state) is not distinct from
   (pg_temp.c3p('02'),pg_temp.c3p('02'),null::uuid,'system'::text,'ended'::text,jsonb_build_object('actor',null,'title','Spare evening'),
    null::text,'sent'::text),'A line naming its actor as nobody, under the roll''s flag: '||coalesce(row_to_json(m)::text,'none'));
 perform private.chat_system_line(pg_temp.c3p('02'),'next',jsonb_build_object('title','Spare evening'));
 perform pg_temp.ch_check((pg_temp.ch_last_line(pg_temp.c3p('02'))).payload=jsonb_build_object('actor',pg_temp.c1('01'),'title','Spare evening'),
  'A line naming no actor did not get the caller''s');
 perform private.chat_system_line(pg_temp.c3p('02'),'stopped',null);
 perform pg_temp.ch_check((pg_temp.ch_last_line(pg_temp.c3p('02'))).payload=jsonb_build_object('actor',pg_temp.c1('01'))
   and pg_temp.ch_lines(pg_temp.c3p('02'))='ended:-,next:-,stopped:-','A line with no payload: '||pg_temp.ch_lines(pg_temp.c3p('02')));
end $$;

-- Every row written here and every update in place was broadcast once (NOTE 3): on chat:<the party>, event chat,
-- extension broadcast, private, with only {id, kind, state}; the latest broadcast of each row carries its state now;
-- and there are as many broadcasts as rows, plus the updates in place (03's deletion, 02's Can't go, 06's four answers
-- and its one more, the two hand moves of 06's line's time, and the fold's three: 12's line, 14's line, 12's message).
do $$ begin
 perform pg_temp.ch_check(not exists(select 1 from realtime.messages r where r.topic='chat:'||pg_temp.c3p('01')
   and (r.event,r.extension,r.private,pg_temp.ch_keys(r.payload)) is distinct from ('chat'::text,'broadcast'::text,true,'id,kind,state'::text)),
  'A broadcast is not a private chat broadcast of {id, kind, state}');
 perform pg_temp.ch_check(not exists(select 1 from public.messages m where m.series_id=pg_temp.c3p('01')
   and (select r.payload from realtime.messages r where r.topic='chat:'||pg_temp.c3p('01') and r.payload->>'id'=m.id::text order by r.id desc limit 1)
    is distinct from jsonb_build_object('id',m.id,'kind',m.kind,'state',m.state)),'A row''s latest broadcast does not carry it as it is');
 perform pg_temp.ch_check((select count(*) from realtime.messages where topic='chat:'||pg_temp.c3p('01'))
   =(select count(*) from public.messages where series_id=pg_temp.c3p('01'))+12,
  'Broadcasts: '||(select count(*) from realtime.messages where topic='chat:'||pg_temp.c3p('01'))||' for '
   ||(select count(*) from public.messages where series_id=pg_temp.c3p('01'))||' rows');
end $$;

-- The schema (K-N13, K-S6, NOTE 3). The seven functions of this section are definers with an empty search path, and
-- no role may call them, but can_listen, which only signed-in accounts may (plpgsql: a topic is matched before any
-- cast). chat_member stays ungranted. The four triggers are as named. realtime.messages has exactly one policy, for
-- reading, to authenticated: a broadcast on the topic being checked, through can_listen (H34); none to write (clients
-- never send).
do $$ declare f text; r text; begin
 foreach f in array array['chat_system_line(uuid,text,jsonb)','chat_lines_off()','attendees_chat_lines()','plans_chat_lines()',
   'plan_admins_chat_lines()','messages_signal()','can_listen(text)'] loop
  perform pg_temp.ch_check((select prosecdef and proconfig=array['search_path=""'] from pg_catalog.pg_proc where oid=('private.'||f)::regprocedure),
   'private.'||f||' is not a definer with an empty search path');
  foreach r in array array['public','anon','authenticated','service_role'] loop
   perform pg_temp.ch_check(has_function_privilege(r,'private.'||f,'execute')=(f='can_listen(text)' and r='authenticated'),
    r||(case when has_function_privilege(r,'private.'||f,'execute') then ' may' else ' may not' end)||' call private.'||f);
  end loop;
 end loop;
 perform pg_temp.ch_check(has_function_privilege('authenticated','private.can_listen(text)','execute')
   and not has_function_privilege('authenticated','private.chat_member(uuid,uuid)','execute')
   and not has_function_privilege('anon','private.chat_system_line(uuid,text,jsonb)','execute'),'The listening grants are wrong');
 perform pg_temp.ch_check((select l.lanname from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid=p.prolang
   where p.oid='private.can_listen(text)'::regprocedure)='plpgsql','can_listen is not plpgsql');
 perform pg_temp.ch_check((select string_agg(c.relname||'.'||t.tgname||' '||t.tgfoid::regprocedure::text||' '
    ||substring(pg_catalog.pg_get_triggerdef(t.oid) from '(AFTER .* FOR EACH ROW)'),' | ' order by t.tgname)
   from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid
   where t.tgname in ('attendees_chat_lines','plans_chat_lines','plan_admins_chat_lines','messages_signal'))
   ='attendees.attendees_chat_lines private.attendees_chat_lines() AFTER INSERT OR UPDATE OF response ON public.attendees FOR EACH ROW | '
    'messages.messages_signal private.messages_signal() AFTER INSERT OR UPDATE ON public.messages FOR EACH ROW | '
    'plan_admins.plan_admins_chat_lines private.plan_admins_chat_lines() AFTER INSERT ON public.plan_admins FOR EACH ROW | '
    'plans.plans_chat_lines private.plans_chat_lines() AFTER UPDATE ON public.plans FOR EACH ROW','The line and signal triggers are wrong');
 perform pg_temp.ch_check((select string_agg(p.policyname||' '||p.cmd||' '||p.permissive||' '||p.roles::text||' '||coalesce(p.with_check,'-'),' | ')
   from pg_catalog.pg_policies p where p.schemaname='realtime' and p.tablename='messages')
   ='chat_members_listen SELECT PERMISSIVE {authenticated} -','realtime.messages'' policies are wrong');
 perform pg_temp.ch_check((select regexp_replace(qual,'\s+',' ','g') from pg_catalog.pg_policies where schemaname='realtime' and policyname='chat_members_listen')
   ='((extension = ''broadcast''::text) AND (topic = ( SELECT realtime.topic() AS topic)) AND private.can_listen(( SELECT realtime.topic() AS topic)))',
  'The policy is not a broadcast on its own topic through can_listen: '||(select qual from pg_catalog.pg_policies where schemaname='realtime' and policyname='chat_members_listen'));
end $$;
rollback;

-- The way back (Task 3; K-N9, BLOCKING 1, NOTE 4, NOTE 5), rehearsed in a transaction that ends in rollback, switched on
-- whether chat plan 2 is applied (its private.series_leaves exists), as circles-of-trust.sql's slice 17 is on chat. With
-- plan 2 applied, the rollback refuses with plan 2's message and changes nothing. Without it, the full run: while a
-- private.series_leaves table stands in for plan 2 the rollback refuses and changes nothing; otherwise it runs on a chat
-- with a guest's joined line, a message, an announcement, their notices (one with a delivery), a read and a mute,
-- beside an ordinary notice: the policy, the seven triggers, the four tables (and chats.is_group with them), every
-- new function, the outbox's message_id (its index with it), its recipient index and the two kinds' notices go; the
-- ordinary notice, the plan and its guest stay, and so do the other triggers of the tables the chat's triggers were on;
-- the outbox's kind check holds the eleven kinds again. Each restored function is its source migration's text exactly
-- (running that text again changes nothing), with its grants as they were: the notice audience
-- (20261110120000_connections), the worker's claim and the fold (20261111130000_circles_of_trust, H34), the worker's
-- outcome (20261030120000_push_delivery) and, where the deletion lifecycle exists (full mode), request_account_deletion
-- (the circles body, BLOCKING 1). The circles rollback, which refuses while chat is applied, then runs. The rehearsal against
-- the hosted state is 20261111140000_chat_core.after.sql's.
\set ch_rollback `cat :'resbite_repo'/supabase/rollback/20261111140000_chat_core.rollback.sql`
\set ch_circles_rollback `cat :'resbite_repo'/supabase/rollback/20261111130000_circles_of_trust.rollback.sql`
\set ch_connections `cat :'resbite_repo'/supabase/migrations/20261110120000_connections.sql`
\set ch_circles `cat :'resbite_repo'/supabase/migrations/20261111130000_circles_of_trust.sql`
\set ch_push `cat :'resbite_repo'/supabase/migrations/20261030120000_push_delivery.sql`
select pg_catalog.to_regclass('private.series_leaves') is not null as ch_groups \gset
\if :ch_groups
begin;
create temporary table ch_texts on commit drop as select :'ch_rollback'::text as rollback;
do $$ begin
 perform pg_temp.ch_check(coalesce(length(btrim((select rollback from ch_texts))),0)>0,'The rollback text is empty');
 begin
  execute (select rollback from ch_texts);
  raise exception 'The chat core rollback ran while chat plan 2 is applied';
 exception when raise_exception then
  if sqlerrm is distinct from 'Run the chat groups rollback before the chat core rollback' then raise; end if;
 end;
 perform pg_temp.ch_check(pg_catalog.to_regclass('public.messages') is not null and pg_catalog.to_regclass('private.series_leaves') is not null
   and pg_catalog.to_regprocedure('private.can_listen(text)') is not null
   and exists(select 1 from pg_catalog.pg_policies where schemaname='realtime' and policyname='chat_members_listen')
   and exists(select 1 from pg_catalog.pg_trigger where tgname='attendees_chat_lines'),'The refused rollback changed something');
end $$;
rollback;
\else
begin;
create temporary table ch_texts on commit drop as select :'ch_rollback'::text as rollback, :'ch_circles_rollback'::text as circles_rollback;
-- Each function the rollback restores, the statement that made it in its source migration, and its grants now.
create temporary table ch_restores on commit drop as
 select x.signature, x.source, (select p.proacl::text from pg_catalog.pg_proc p where p.oid=x.signature::regprocedure) as grants
 from (values
  ('private.notification_recipient_eligible(bigint)',pg_temp.ch_source(:'ch_connections','create or replace function private.notification_recipient_eligible(','$$;')),
  ('public.claim_notification_deliveries(integer)',pg_temp.ch_source(:'ch_circles','create or replace function public.claim_notification_deliveries(','$$;')),
  ('public.finish_notification_delivery(uuid,uuid,text,text,integer)',pg_temp.ch_source(:'ch_push','create or replace function public.finish_notification_delivery(','$$;')),
  ('private.fold_web_account(uuid,uuid)',pg_temp.ch_source(:'ch_circles','create or replace function private.fold_web_account(','$$;')),
  ('private.request_account_deletion(uuid,uuid,uuid,text)',pg_temp.ch_source(:'ch_circles','create or replace function private.request_account_deletion(','$$;'))) x(signature,source)
 where pg_catalog.to_regprocedure(x.signature) is not null;
-- The other triggers of the tables the chat's triggers are on, which stay.
create temporary table ch_other_triggers on commit drop as
 select t.tgrelid::regclass::text as tbl, t.tgname, pg_catalog.pg_get_triggerdef(t.oid) as definition from pg_catalog.pg_trigger t
 where t.tgrelid in ('public.plans'::regclass,'public.attendees'::regclass,'public.plan_admins'::regclass) and not t.tgisinternal
  and t.tgname not in ('plans_chat_row','plans_chat_lines','attendees_chat_lines','plan_admins_chat_lines');
do $$ begin
 perform pg_temp.ch_check(coalesce(length(btrim((select rollback from ch_texts))),0)>0,'The rollback text is empty');
 perform pg_temp.ch_check((select count(*) from ch_restores)=case when pg_catalog.to_regprocedure('private.request_account_deletion(uuid,uuid,uuid,text)') is null then 4 else 5 end
   and not exists(select 1 from ch_restores where source is null or grants is null),'A function to restore, or its source, is missing');
 create table private.series_leaves(id integer);
 begin
  execute (select rollback from ch_texts);
  raise exception 'The chat core rollback ran while chat plan 2 is applied';
 exception when raise_exception then
  if sqlerrm is distinct from 'Run the chat groups rollback before the chat core rollback' then raise; end if;
 end;
 drop table private.series_leaves;
 perform pg_temp.ch_check(pg_catalog.to_regclass('public.messages') is not null and pg_catalog.to_regprocedure('private.can_listen(text)') is not null
   and exists(select 1 from pg_catalog.pg_policies where schemaname='realtime' and policyname='chat_members_listen')
   and exists(select 1 from pg_catalog.pg_trigger where tgname='attendees_chat_lines'),'The refused rollback changed something');
end $$;
create function pg_temp.c6(p text) returns uuid language sql immutable as $$ select ('c6000000-0000-4000-8000-0000000000'||p)::uuid $$;
insert into auth.users(id,email,email_confirmed_at) values
 (pg_temp.c6('01'),'chat6-01@resbite-test.invalid',now()),(pg_temp.c6('02'),'chat6-02@resbite-test.invalid',now());
insert into private.tester_roster(email) values ('chat6-01@resbite-test.invalid'),('chat6-02@resbite-test.invalid');
insert into public.profiles(id,display_name) values (pg_temp.c6('01'),'Rehearsal host'),(pg_temp.c6('02'),'Rehearsal guest');
insert into public.plans(id,owner_id,title,starts_at,ends_at,time_zone,place_label,categories) values
 ('c6100000-0000-4000-8000-000000000001',pg_temp.c6('01'),'Rehearsal picnic',now()+interval '1 day',now()+interval '1 day 2 hours',
  'UTC','Lawn',array['community']);
insert into public.attendees(plan_id,user_id,response) values ('c6100000-0000-4000-8000-000000000001',pg_temp.c6('02'),'accepted');
do $$ begin
 perform pg_temp.ch_as(pg_temp.c6('02'));
 perform public.send_message('c6100000-0000-4000-8000-000000000001','See you there',gen_random_uuid());
 perform pg_temp.ch_as(pg_temp.c6('01'));
 perform public.send_announcement('c6100000-0000-4000-8000-000000000001','Bring a blanket','everyone',gen_random_uuid());
end $$;
insert into private.notification_deliveries(outbox_id,token,endpoint_updated_at)
 select o.id,'ExpoPushToken[c6]',now() from private.notification_outbox o where o.plan_id='c6100000-0000-4000-8000-000000000001' and o.kind='chat_message';
insert into public.chat_reads(series_id,user_id,last_read_id)
 select 'c6100000-0000-4000-8000-000000000001',pg_temp.c6('02'),max(id) from public.messages where series_id='c6100000-0000-4000-8000-000000000001';
insert into public.chat_mutes(series_id,user_id) values ('c6100000-0000-4000-8000-000000000001',pg_temp.c6('02'));
insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key) values
 ('c6100000-0000-4000-8000-000000000001',pg_temp.c6('02'),'plan_changed','c6:changed');
select pg_temp.ch_check(pg_temp.ch_lines('c6100000-0000-4000-8000-000000000001')='joined:02'
 and (select string_agg(kind,',' order by kind) from private.notification_outbox where plan_id='c6100000-0000-4000-8000-000000000001')
  ='announcement,chat_message,plan_changed'
 and exists(select 1 from private.notification_deliveries where token='ExpoPushToken[c6]'),'The rehearsal''s chat is not as seeded');
\ir ../rollback/20261111140000_chat_core.rollback.sql
do $$ declare f record; v_def text; begin
 perform pg_temp.ch_check(not exists(select 1 from pg_catalog.pg_policies where schemaname='realtime'),'The rollback left a Realtime policy');
 perform pg_temp.ch_check(not exists(select 1 from pg_catalog.pg_trigger where tgname in ('messages_signal','attendees_chat_lines','plans_chat_lines',
   'plan_admins_chat_lines','messages_chat_stats','messages_touch','plans_chat_row')),'The rollback left a chat trigger');
 perform pg_temp.ch_check((select coalesce(string_agg(x.d,' | ' order by x.d),'') from (select t.tgrelid::regclass::text||' '||t.tgname||' '
    ||pg_catalog.pg_get_triggerdef(t.oid) as d from pg_catalog.pg_trigger t
    where t.tgrelid in ('public.plans'::regclass,'public.attendees'::regclass,'public.plan_admins'::regclass) and not t.tgisinternal) x)
   =(select coalesce(string_agg(x.d,' | ' order by x.d),'') from (select tbl||' '||tgname||' '||definition as d from ch_other_triggers) x),
  'The rollback changed another trigger');
 perform pg_temp.ch_check(pg_catalog.to_regclass('public.messages') is null and pg_catalog.to_regclass('public.chats') is null
   and pg_catalog.to_regclass('public.chat_reads') is null and pg_catalog.to_regclass('public.chat_mutes') is null
   and pg_catalog.to_regclass('public.messages_id_seq') is null,'The rollback left a chat table');
 perform pg_temp.ch_check(not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
   where n.nspname in ('public','private') and p.proname in ('messages_touch','plans_chat_row','current_occurrence','chat_member','chat_members',
    'chat_closes_at','chat_open','chat_is_group','announcement_audience','chat_first_name','chat_row','chat_names','chat_summary','chat_messages',
    'chat_messages_since','my_chat_overview','messages_chat_stats','chat_body','send_message','send_announcement','delete_message','remove_message',
    'mark_chat_read','set_chat_mute','chat_system_line','chat_lines_off','attendees_chat_lines','plans_chat_lines','plan_admins_chat_lines',
    'messages_signal','can_listen')),'The rollback left a chat function: '||coalesce((select string_agg(n.nspname||'.'||p.proname,', ')
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')
    and (p.proname like '%chat%' or p.proname in ('current_occurrence','announcement_audience','messages_touch','messages_signal','send_message',
     'send_announcement','delete_message','remove_message','can_listen'))),''));
 perform pg_temp.ch_check(not exists(select 1 from pg_catalog.pg_attribute where attrelid='private.notification_outbox'::regclass and attname='message_id'
   and not attisdropped) and pg_catalog.to_regclass('private.notification_outbox_recipient_kind_idx') is null
   and pg_catalog.to_regclass('private.notification_outbox_message_idx') is null,'The rollback left the outbox''s message_id or an index');
 perform pg_temp.ch_check(not exists(select 1 from private.notification_outbox where kind in ('chat_message','announcement'))
   and not exists(select 1 from private.notification_deliveries where token='ExpoPushToken[c6]')
   and exists(select 1 from private.notification_outbox where dedupe_key='c6:changed'),'The rollback kept a chat notice, or lost another');
 perform pg_temp.ch_check(exists(select 1 from public.attendees where plan_id='c6100000-0000-4000-8000-000000000001' and user_id=pg_temp.c6('02')
   and response='accepted'),'The rollback lost the resbite or its guest');
 perform pg_temp.ch_check((select string_agg(k[1],',' order by k[1]) from regexp_matches(pg_catalog.pg_get_constraintdef(
   (select oid from pg_catalog.pg_constraint where conrelid='private.notification_outbox'::regclass and conname='notification_outbox_kind_check')),'''([a-z_]+)''','g') k)
   ='admin_added,connection_accepted,connection_request,guest_note,invitation,invited,join_approved,join_request,plan_cancelled,plan_changed,rsvp',
  'The outbox''s kinds are not the eleven again');
 for f in select * from ch_restores loop
  v_def := pg_catalog.pg_get_functiondef(f.signature::regprocedure);
  perform pg_temp.ch_check((select p.proacl::text from pg_catalog.pg_proc p where p.oid=f.signature::regprocedure) is not distinct from f.grants,
   'The rollback changed the grants of '||f.signature);
  execute f.source;
  perform pg_temp.ch_check(pg_catalog.pg_get_functiondef(f.signature::regprocedure)=v_def,'The rollback did not restore '||f.signature||' as its source has it');
 end loop;
 begin
  execute (select circles_rollback from ch_texts);
 exception when raise_exception then
  raise exception 'The circles rollback refused after the chat core rollback: %', sqlerrm;
 end;
 perform pg_temp.ch_check(pg_catalog.to_regclass('private.plan_removals') is null,'The circles rollback did not run after the chat core rollback');
end $$;
rollback;
\endif

-- The deletion block (Task 2; K-B2, K-N5, K-S2, K-S3, K-S12, BLOCKING 1). Last in the file, in its own transaction with
-- the prefix c5, because the deletion's flag lasts until the rollback (NOTE 12); only where the deletion lifecycle
-- exists (full mode). The c5 cast: 01 'Ana Host', 03 'Mia Leaving', 04 'Leo Going', 09 'Kai Brought', all testers
-- (chat5-…@resbite-test.invalid). 03 owns 'Picnic' (c51…01), a one-off tomorrow, with 04 Going and 09 not answered,
-- brought by 03; 01 owns 'Quiz' (c51…02), the day after, with 03 and 04 Going. On the Picnic 03 writes a message and an
-- announcement (pinned) and 04 a message; on the Quiz 03 writes two messages, and 01 removes the second. A system line
-- on the Picnic names 03 (03 made 04 an admin), and 09's row is inserted by hand. 03 has read the Picnic and muted the
-- Quiz; 04 has read the Picnic.
select to_regprocedure('private.request_account_deletion(uuid,uuid,uuid,text)') is not null as c5_deletion \gset
\if :c5_deletion
begin;
create function pg_temp.c5(p text) returns uuid language sql immutable as $$ select ('c5000000-0000-4000-8000-0000000000'||p)::uuid $$;
create function pg_temp.c5p(p text) returns uuid language sql immutable as $$ select ('c5100000-0000-4000-8000-0000000000'||p)::uuid $$;
insert into auth.users(id,email,email_confirmed_at)
 select pg_temp.c5(n),'chat5-'||n||'@resbite-test.invalid',now() from unnest(array['01','03','04','09']) n;
insert into private.tester_roster(email) select 'chat5-'||n||'@resbite-test.invalid' from unnest(array['01','03','04','09']) n;
insert into public.profiles(id,display_name) values
 (pg_temp.c5('01'),'Ana Host'),(pg_temp.c5('03'),'Mia Leaving'),(pg_temp.c5('04'),'Leo Going'),(pg_temp.c5('09'),'Kai Brought');
select pg_temp.ch_rules();
set local role authenticated;
select pg_temp.ch_as(pg_temp.c5('03'));
select public.create_plan_v4(pg_temp.c5p('01'),'Picnic','',array['community'],null,pg_temp.c1_start(),pg_temp.c1_start()+interval '2 hours',
 'Europe/London','The meadow',false,null::smallint);
select pg_temp.ch_as(pg_temp.c5('01'));
select public.create_plan_v4(pg_temp.c5p('02'),'Quiz','',array['community'],null,pg_temp.c1_start()+interval '1 day',
 pg_temp.c1_start()+interval '1 day 2 hours','Europe/London','The pub',false,null::smallint);
reset role;
select set_config('resbite.system','roll',true);
insert into public.attendees(plan_id,user_id,response,brought_by) values
 (pg_temp.c5p('01'),pg_temp.c5('04'),'accepted',null),(pg_temp.c5p('01'),pg_temp.c5('09'),'pending',pg_temp.c5('03')),
 (pg_temp.c5p('02'),pg_temp.c5('03'),'accepted',null),(pg_temp.c5p('02'),pg_temp.c5('04'),'accepted',null);
select set_config('resbite.system','',true);
set local role authenticated;
select pg_temp.ch_as(pg_temp.c5('03'));
select set_config('c5.blanket',pg_temp.ch_send(pg_temp.c5p('01'),'Bring a blanket')::text,true);
select set_config('c5.gates',(public.send_announcement(pg_temp.c5p('01'),'Gates at noon','everyone',gen_random_uuid())->>'id'),true);
select set_config('c5.quiz',pg_temp.ch_send(pg_temp.c5p('02'),'Team name ideas?')::text,true);
select set_config('c5.rude',pg_temp.ch_send(pg_temp.c5p('02'),'Rude words')::text,true);
select public.set_chat_mute(pg_temp.c5p('02'),true);
select pg_temp.ch_as(pg_temp.c5('04'));
select set_config('c5.lovely',pg_temp.ch_send(pg_temp.c5p('01'),'Lovely')::text,true);
select pg_temp.ch_as(pg_temp.c5('01'));
select public.remove_message(current_setting('c5.rude')::bigint);
reset role;
insert into public.messages(series_id,plan_id,kind,event,payload) values
 (pg_temp.c5p('01'),pg_temp.c5p('01'),'system','admin',jsonb_build_object('actor',pg_temp.c5('03'),'user',pg_temp.c5('04')));
insert into public.chat_reads(series_id,user_id,last_read_id) values
 (pg_temp.c5p('01'),pg_temp.c5('03'),current_setting('c5.gates')::bigint),(pg_temp.c5p('01'),pg_temp.c5('04'),current_setting('c5.gates')::bigint);
select set_config('c5.line',(select row_to_json(m)::text from public.messages m where m.series_id=pg_temp.c5p('01') and m.kind='system'),true);
select pg_temp.ch_check((select pinned_message_id from public.chats where series_id=pg_temp.c5p('01'))=current_setting('c5.gates')::bigint,
 '03''s announcement is not pinned before the deletion');

-- 03 asks to delete their account. Every message and announcement of 03's still sent, on either chat, reads deleted,
-- with no body and no author (K-N5, Decision 14); the one 01 removed stays removed, with no author (H27); 04's is as it
-- was. The system line naming 03 is unchanged, payload and all (K-S3),
-- and the names map gives 03 as null. 03's announcement is no longer pinned, and nothing is (K-S12), and the counts
-- leave 03's words out. 09 keeps its row on the Picnic, with nobody as its bringer (BLOCKING 1). 03's read and mute
-- rows are gone; 04's read stays. The deletion's flag is set (K-S2): 03's own one-off is cancelled and its place
-- scrubbed, and no system line is written on it (the one there is the hand-made admin line) nor on the Quiz, where 03's
-- guest row goes (K-S2, K-S3).
insert into auth.sessions(id,user_id,created_at) values ('c5200000-0000-4000-8000-000000000003',pg_temp.c5('03'),now());
select private.request_account_deletion(pg_temp.c5('03'),'c5200000-0000-4000-8000-000000000003','c5300000-0000-4000-8000-000000000003',repeat('d',64));
do $$ declare v_ids bigint[] := array[current_setting('c5.blanket')::bigint,current_setting('c5.gates')::bigint,current_setting('c5.quiz')::bigint];
 r jsonb; begin
 perform pg_temp.ch_check(not exists(select 1 from public.messages where id=any(v_ids)
   and (state,body,author_id) is distinct from ('deleted'::text,null::text,null::uuid))
  and (select count(*) from public.messages where id=any(v_ids))=3,'03''s messages are not deleted, without words or author');
 perform pg_temp.ch_check((select (state,body,author_id) from public.messages where id=current_setting('c5.rude')::bigint)
   is not distinct from ('removed'::text,null::text,null::uuid),'03''s removed message is not still removed, without author');
 perform pg_temp.ch_check(not exists(select 1 from public.messages where author_id=pg_temp.c5('03')),'A row still names 03 as its author');
 perform pg_temp.ch_check((select (state,body,author_id) from public.messages where id=current_setting('c5.lovely')::bigint)
   is not distinct from ('sent'::text,'Lovely'::text,pg_temp.c5('04')),'04''s message changed');
 perform pg_temp.ch_check((select row_to_json(m)::text from public.messages m where m.series_id=pg_temp.c5p('01') and m.kind='system')=current_setting('c5.line'),
  'The system line naming 03 changed');
 perform pg_temp.ch_as(pg_temp.c5('04'));
 r := public.chat_messages(pg_temp.c5p('01'));
 perform pg_temp.ch_check(r->'names'=jsonb_build_object(pg_temp.c5('03')::text,null,pg_temp.c5('04')::text,'Leo'),'The names after 03''s deletion: '||(r->'names')::text);
 perform pg_temp.ch_check((select (pinned_message_id,message_count) from public.chats where series_id=pg_temp.c5p('01'))
   is not distinct from (null::bigint,1),'The Picnic''s pin or count after 03''s deletion');
 perform pg_temp.ch_check((select message_count from public.chats where series_id=pg_temp.c5p('02'))=0,'The Quiz''s count after 03''s deletion');
 perform pg_temp.ch_check((select (response,brought_by) from public.attendees where plan_id=pg_temp.c5p('01') and user_id=pg_temp.c5('09'))
   is not distinct from ('pending'::text,null::uuid),'09''s row did not stay, with no bringer');
 perform pg_temp.ch_check(not exists(select 1 from public.chat_reads where user_id=pg_temp.c5('03'))
  and not exists(select 1 from public.chat_mutes where user_id=pg_temp.c5('03'))
  and exists(select 1 from public.chat_reads where user_id=pg_temp.c5('04')),'03''s reads or mutes stayed, or 04''s read went');
 perform pg_temp.ch_check(current_setting('resbite.system',true)='deletion','The deletion did not set its flag');
 perform pg_temp.ch_check((select (status,place_label) from public.plans where id=pg_temp.c5p('01'))
   is not distinct from ('cancelled'::text,'Meeting place removed'::text),'03''s own one-off is not cancelled and scrubbed');
 perform pg_temp.ch_check((select string_agg(m.event,',' order by m.id) from public.messages m where m.series_id=pg_temp.c5p('01') and m.kind='system')='admin'
   and not exists(select 1 from public.messages m where m.series_id=pg_temp.c5p('02') and m.kind='system'),
  'The deletion wrote a line: '||coalesce((select string_agg(m.event,',' order by m.id) from public.messages m
   where m.series_id in (pg_temp.c5p('01'),pg_temp.c5p('02')) and m.kind='system'),''));
end $$;
rollback;
\endif
