-- Chat groups (docs/superpowers/plans/2026-11-11-chat-2-groups.md, Tasks 1 and 2; docs/superpowers/specs/2026-11-10-groups-and-chat-design.md,
-- CH-P1, CH-P4, CH-P15, CH-P20, CH-P21, with the rulings G-S1 to G-S6, G-B6, G-B7, G-N1, G-N3, G-N13, I1, I2, I6, I11
-- and the plan's Decisions 1, 2, 6, 7, 11 and 12): a repeating resbite's chat is a group. Slice 1 (Task 1): the group
-- flag, who is in a group's chat, when it closes, the summary and the leave record. Slice 2 (Task 2): the group's lines,
-- the roll, leaving, who sees the group, and its pushes in a cancelled week. Synthetic identities only: emails
-- g2-…@resbite-test.invalid, ids with the prefix e6, and one phone number, from Ofcom's drama range (07700 900xxx,
-- kept for fiction), in 2g.
--
-- One transaction per block, each begin … rollback, as connections.sql does: slice 1 is one block, slice 2 eleven. Each
-- block starts from the same cast, made by pg_temp.e6_cast(). Times, rows and flags set by hand sit between
-- set_config('resbite.system','roll',true) and set_config('resbite.system','',true), so they write no chat line; the
-- setting is transaction-local, so it is reset at once (it would otherwise silence every later line).
--
-- The cast. Users e6…: 01 'Ana Host', the owner of every plan; 02 'Ada Admin', an admin of every plan, Going; 03 'Mia
-- Going', Going; 04 'Leo Maybe', Maybe; 05 'Sol Pending', not answered; 06 'Tom Declined', Can't go; 08 'Max Stranger',
-- on no plan. 07 'Eva Friend', 09 'Kai Nine', 10 'Zoe Ten', 11 'Ian Eleven' and 12 'Web Twelve' have no guest row: each
-- test says how they come in. Everyone is on the tester roster and has used the app (an app session), so the roll
-- carries them. 01 is connected with 03, 04 and 07 (invite_contacts invites only connections in the app). Seven plans
-- e61…, each made with create_plan_v4 as 01, each with the guest rows above and 02 its admin: weekly, 01 'Board game
-- night', 02 'Film club', 03 'Quiz night' and 04 'Book club'; one-off, 05 'Picnic', 06 'Brunch' and 07 'Walk'. Plan k
-- starts k days from now, on the minute, for two hours (pg_temp.e6_start(k)).

-- Helpers, for this file's session only (temporary: gone with it).
create function pg_temp.e6(p text) returns uuid language sql immutable as $$ select ('e6000000-0000-4000-8000-0000000000'||p)::uuid $$;
create function pg_temp.e6p(p text) returns uuid language sql immutable as $$ select ('e6100000-0000-4000-8000-0000000000'||p)::uuid $$;
-- Plan k's start: k days from now, on the minute. now() is the transaction's start, so this is fixed within a transaction.
create function pg_temp.e6_start(k integer) returns timestamptz language sql stable as $$ select date_trunc('minute',now())+k*interval '1 day' $$;
-- Acting as someone: the claims auth.uid() reads (the role is set apart, with set local role).
create function pg_temp.g2_as(p_user uuid) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role','authenticated')::text,true)
$$;
create function pg_temp.g2_check(p_ok boolean, p_what text) returns void language plpgsql as $$
begin
 if p_ok is not true then raise exception '%', p_what; end if;
end $$;
-- A call that must be refused with exactly this code and message. The refusal undoes the call, as a real one would.
create function pg_temp.g2_refused(p_sql text, p_state text, p_message text) returns void language plpgsql as $$
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
create function pg_temp.g2_who(p uuid[]) returns text language sql immutable as $$
 select coalesce(string_agg(right(u::text,2),',' order by u),'') from unnest(p) u
$$;
-- An object's keys, sorted: 'a,b,c'.
create function pg_temp.g2_keys(p jsonb) returns text language sql immutable as $$
 select coalesce(string_agg(k,',' order by k),'') from jsonb_object_keys(p) k
$$;
-- A series' system lines in id order, as event:state: 'stopped:deleted,cancelled:sent' ('' for none). The superuser's.
create function pg_temp.g2_lines(p_series uuid) returns text language plpgsql stable as $$
begin
 return (select coalesce(string_agg(m.event||':'||m.state,',' order by m.id),'') from public.messages m
  where m.series_id=p_series and m.kind='system');
end $$;
-- A message sent as the current claims, with a fresh client id: its id.
create function pg_temp.g2_send(p_series uuid, p_body text) returns bigint language plpgsql as $$
begin
 return (public.send_message(p_series,p_body,gen_random_uuid())->>'id')::bigint;
end $$;
-- Edit through change_plan_v4 as the current claims, at the plan's version, keeping everything but the repeat (null:
-- "Doesn't repeat"; 1: "Every week"): the new version. The time and the place stay, so it writes no changed line.
create function pg_temp.g2_repeat(p_plan uuid, p_repeat smallint) returns integer language plpgsql as $$
declare p public.plans;
begin
 select * into p from public.plans where id=p_plan;
 return public.change_plan_v4(p_plan,p.version,p.title,p.description,p.categories,p.starts_at,p.ends_at,p.time_zone,p.place_label,
  p.place_tbd,p_repeat,null,null);
end $$;
-- Cancel through change_plan_v4 as the current claims: with p_stop "Cancel this and stop repeating", else "Cancel just
-- this one" (a one-off's Cancel): the new version.
create function pg_temp.g2_cancel(p_plan uuid, p_stop boolean) returns integer language plpgsql as $$
declare p public.plans;
begin
 select * into p from public.plans where id=p_plan;
 return public.change_plan_v4(p_plan,p.version,p.title,p.description,p.categories,p.starts_at,p.ends_at,p.time_zone,p.place_label,
  p.place_tbd,p.repeat_weeks,null,null,true,p_stop);
end $$;
-- The cast (see the header): accounts, connections, the seven plans and their guest rows and admin. Run as the
-- superuser at the start of each block; it leaves no claims and no flag behind.
create function pg_temp.e6_cast() returns void language plpgsql as $cast$
declare v_plans text[] := array['Board game night','Film club','Quiz night','Book club','Picnic','Brunch','Walk'];
 v_places text[] := array['Ana''s flat','The cinema','The pub','The library','The park','The cafe','The hill'];
 k integer;
begin
 insert into auth.users(id,email,email_confirmed_at)
  select pg_temp.e6(n),'g2-'||n||'@resbite-test.invalid',now() from unnest(array['01','02','03','04','05','06','07','08','09','10','11','12']) n;
 insert into private.tester_roster(email)
  select 'g2-'||n||'@resbite-test.invalid' from unnest(array['01','02','03','04','05','06','07','08','09','10','11','12']) n;
 insert into public.profiles(id,display_name) values
  (pg_temp.e6('01'),'Ana Host'),(pg_temp.e6('02'),'Ada Admin'),(pg_temp.e6('03'),'Mia Going'),(pg_temp.e6('04'),'Leo Maybe'),
  (pg_temp.e6('05'),'Sol Pending'),(pg_temp.e6('06'),'Tom Declined'),(pg_temp.e6('07'),'Eva Friend'),(pg_temp.e6('08'),'Max Stranger'),
  (pg_temp.e6('09'),'Kai Nine'),(pg_temp.e6('10'),'Zoe Ten'),(pg_temp.e6('11'),'Ian Eleven'),(pg_temp.e6('12'),'Web Twelve');
 insert into private.app_sessions(user_id)
  select pg_temp.e6(n) from unnest(array['01','02','03','04','05','06','07','08','09','10','11','12']) n;
 insert into public.connections(user_a,user_b,state,requested_by,accepted_at)
  select least(pg_temp.e6('01'),pg_temp.e6(n)),greatest(pg_temp.e6('01'),pg_temp.e6(n)),'connected',pg_temp.e6('01'),now()
  from unnest(array['03','04','07']) n;
 perform pg_temp.g2_as(pg_temp.e6('01'));
 for k in 1..7 loop
  perform public.create_plan_v4(pg_temp.e6p('0'||k),v_plans[k],'',array['community'],null,pg_temp.e6_start(k),
   pg_temp.e6_start(k)+interval '2 hours','Europe/London',v_places[k],false,case when k<=4 then 1::smallint end);
 end loop;
 perform set_config('request.jwt.claims','',true);
 perform set_config('resbite.system','roll',true);
 insert into public.attendees(plan_id,user_id,response)
  select pg_temp.e6p('0'||x.k),pg_temp.e6(g.n),g.response from generate_series(1,7) x(k)
  cross join (values ('02','accepted'),('03','accepted'),('04','maybe'),('05','pending'),('06','declined')) g(n,response);
 insert into public.plan_admins(plan_id,user_id,appointed_by) select pg_temp.e6p('0'||x.k),pg_temp.e6('02'),pg_temp.e6('01') from generate_series(1,7) x(k);
 perform set_config('resbite.system','',true);
 -- The chat rules (chat plan 3, confirmation S6): once its table exists, the cast's twelve accept its current version,
 -- so the writers here pass its check in both modes.
 if pg_catalog.to_regclass('private.chat_rules_acceptances') is not null then
  execute 'insert into private.chat_rules_acceptances(user_id,version) select pg_temp.e6(n),private.chat_rules_version() '
   'from unnest(array[''01'',''02'',''03'',''04'',''05'',''06'',''07'',''08'',''09'',''10'',''11'',''12'']) n on conflict do nothing';
 end if;
end $cast$;

-- Slice 1 (Task 1): the group flag, who is in a group's chat, when it closes, and the summary.
begin;
select pg_temp.e6_cast();

-- The flag (CH-R-A6): create_plan_v4 with a repeat makes a group; a one-off is not one. No chat starts stopped. A
-- running group has no close time and is open; a one-off keeps plan 1's close, its end + 48 hours.
do $$ declare n text; begin
 perform pg_temp.g2_check((select count(*) from public.chats where series_id in (select series_id from public.plans where id::text like 'e61%')
   and stopped_at is null)=7,'A new chat starts stopped');
 foreach n in array array['01','02','03','04'] loop
  perform pg_temp.g2_check(private.chat_is_group(pg_temp.e6p(n)),'Weekly plan '||n||' is not a group');
  perform pg_temp.g2_check(not private.group_stopped(pg_temp.e6p(n)) and private.chat_closes_at(pg_temp.e6p(n)) is null
   and private.chat_open(pg_temp.e6p(n)),'Weekly plan '||n||' is stopped, has a close time, or is closed');
 end loop;
 foreach n in array array['05','06','07'] loop
  perform pg_temp.g2_check(not private.chat_is_group(pg_temp.e6p(n)),'One-off '||n||' is a group');
  perform pg_temp.g2_check(not private.group_stopped(pg_temp.e6p(n)) and private.chat_open(pg_temp.e6p(n))
   and private.chat_closes_at(pg_temp.e6p(n))=(select ends_at from public.plans where id=pg_temp.e6p(n))+interval '48 hours',
   'One-off '||n||' does not keep plan 1''s close');
 end loop;
end $$;

-- Board game night (Review Focus 1, G-N13, I8): 01 writes, then turns the repeat off before the first Thursday (Edit →
-- "Doesn't repeat"). Still a group (CH-P1), stopped now, closing 48 hours after this occurrence's end, and one line,
-- stopped {actor 01, plan_id, starts_at, time_zone}, with no author: the chat's last message.
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('01'));
select set_config('g2.hello',pg_temp.g2_send(pg_temp.e6p('01'),'Who is bringing Catan?')::text,true);
select pg_temp.g2_repeat(pg_temp.e6p('01'),null);
reset role;
do $$ declare v_plan public.plans; v_line public.messages; begin
 select * into v_plan from public.plans where id=pg_temp.e6p('01');
 perform pg_temp.g2_check(v_plan.repeat_weeks is null and v_plan.status='active','Board game night still repeats, or is not active');
 perform pg_temp.g2_check(private.chat_is_group(pg_temp.e6p('01')),'Turning the repeat off made Board game night a one-off');
 perform pg_temp.g2_check((select stopped_at from public.chats where series_id=pg_temp.e6p('01'))=now()
   and private.group_stopped(pg_temp.e6p('01')),'Board game night is not stopped now');
 perform pg_temp.g2_check(private.chat_closes_at(pg_temp.e6p('01'))=v_plan.ends_at+interval '48 hours' and private.chat_open(pg_temp.e6p('01')),
  'A group stopped by Edit does not close 48 hours after the end, or is closed');
 perform pg_temp.g2_check(pg_temp.g2_lines(pg_temp.e6p('01'))='stopped:sent','Board game night''s lines: '||pg_temp.g2_lines(pg_temp.e6p('01')));
 select * into v_line from public.messages where series_id=pg_temp.e6p('01') and kind='system';
 perform pg_temp.g2_check(v_line.author_id is null and v_line.plan_id=pg_temp.e6p('01') and pg_temp.g2_keys(v_line.payload)='actor,plan_id,starts_at,time_zone'
   and v_line.payload->>'actor'=pg_temp.e6('01')::text and v_line.payload->>'plan_id'=pg_temp.e6p('01')::text
   and (v_line.payload->>'starts_at')::timestamptz=v_plan.starts_at and v_line.payload->>'time_zone'='Europe/London',
  'The stopped line: '||row_to_json(v_line)::text);
 perform pg_temp.g2_check((select last_message_id from public.chats where series_id=pg_temp.e6p('01'))=v_line.id,
  'The stopped line is not the chat''s last message');
 perform set_config('g2.stopped',v_line.id::text,true);
end $$;
-- Then back to "Every week" (a resume, Decision 12): running again (no stop time, no close time, open), the stopped line
-- deleted, by state, and signalled, with no line of its own; the chat's last message is 01's again, with its time
-- (NOTE 4), and the summary's last row is it. Board game night runs on from here.
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('01'));
select pg_temp.g2_repeat(pg_temp.e6p('01'),1::smallint);
reset role;
do $$ declare v_stopped bigint := current_setting('g2.stopped')::bigint; v_hello bigint := current_setting('g2.hello')::bigint; begin
 perform pg_temp.g2_check((select stopped_at from public.chats where series_id=pg_temp.e6p('01')) is null
   and not private.group_stopped(pg_temp.e6p('01')) and private.chat_closes_at(pg_temp.e6p('01')) is null and private.chat_open(pg_temp.e6p('01'))
   and private.chat_is_group(pg_temp.e6p('01')),'The resumed Board game night is not running');
 perform pg_temp.g2_check(pg_temp.g2_lines(pg_temp.e6p('01'))='stopped:deleted','Lines after the resume: '||pg_temp.g2_lines(pg_temp.e6p('01')));
 perform pg_temp.g2_check(exists(select 1 from realtime.messages r where r.topic='chat:'||pg_temp.e6p('01') and r.payload->>'id'=v_stopped::text
   and r.payload->>'state'='deleted'),'The stopped line''s deletion was not signalled');
 perform pg_temp.g2_check((select (c.last_message_id,c.last_message_at) from public.chats c where c.series_id=pg_temp.e6p('01'))
   is not distinct from (select (m.id,m.created_at) from public.messages m where m.id=v_hello),
  'The chat''s last message did not go back to 01''s: '||(select row_to_json(c)::text from public.chats c where c.series_id=pg_temp.e6p('01')));
 perform pg_temp.g2_as(pg_temp.e6('03'));
 perform pg_temp.g2_check((public.chat_summary(pg_temp.e6p('01'))->'last'->>'id')::bigint=v_hello,'The summary''s last row is not 01''s message');
end $$;
-- chat_hide_line leaves a row that is not a sent system line as it is (review M4): 01's message, and the stopped line
-- already deleted. Neither row changes or is signalled again, and the chat's figures stay.
do $$ declare v_stopped bigint := current_setting('g2.stopped')::bigint; v_hello bigint := current_setting('g2.hello')::bigint;
 v_before text; v_signals bigint; begin
 v_before := (select string_agg(m.id||':'||m.state||':'||coalesce(m.body,'-'),',' order by m.id) from public.messages m where m.id in (v_hello,v_stopped))
  ||'|'||(select row_to_json(c)::text from public.chats c where c.series_id=pg_temp.e6p('01'));
 v_signals := (select count(*) from realtime.messages r where r.topic='chat:'||pg_temp.e6p('01'));
 perform private.chat_hide_line(v_hello);
 perform private.chat_hide_line(v_stopped);
 perform pg_temp.g2_check((select string_agg(m.id||':'||m.state||':'||coalesce(m.body,'-'),',' order by m.id) from public.messages m where m.id in (v_hello,v_stopped))
   ||'|'||(select row_to_json(c)::text from public.chats c where c.series_id=pg_temp.e6p('01'))=v_before
   and (select count(*) from realtime.messages r where r.topic='chat:'||pg_temp.e6p('01'))=v_signals,
  'chat_hide_line changed a message, or a line already deleted, or the chat''s figures');
end $$;

-- Brunch (G-N8): a one-off with a message made weekly is a group, with one line, made_group {actor 01}. Walk, with no
-- messages but a system line (05 says Going, outside the flag: joined), made weekly: a group, and no made_group line,
-- since message_count counts messages and announcements only (K-N12, review M6). Then Walk under the roll's flag: its
-- repeat off, then on again, by hand. The stop time is still written and cleared, and no line (Global Constraints).
update public.attendees set response='accepted' where plan_id=pg_temp.e6p('07') and user_id=pg_temp.e6('05');
select pg_temp.g2_check(pg_temp.g2_lines(pg_temp.e6p('07'))='joined:sent'
 and (select message_count from public.chats where series_id=pg_temp.e6p('07'))=0,'Walk does not have one line and no message');
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('01'));
select pg_temp.g2_send(pg_temp.e6p('06'),'Pancakes or waffles?');
select pg_temp.g2_repeat(pg_temp.e6p('06'),1::smallint);
select pg_temp.g2_repeat(pg_temp.e6p('07'),1::smallint);
reset role;
do $$ declare v_line public.messages; begin
 perform pg_temp.g2_check(private.chat_is_group(pg_temp.e6p('06')) and private.chat_is_group(pg_temp.e6p('07')),'Brunch or Walk is not a group');
 perform pg_temp.g2_check(pg_temp.g2_lines(pg_temp.e6p('06'))='made_group:sent','Brunch''s lines: '||pg_temp.g2_lines(pg_temp.e6p('06')));
 select * into v_line from public.messages where series_id=pg_temp.e6p('06') and kind='system';
 perform pg_temp.g2_check(v_line.author_id is null and v_line.payload=jsonb_build_object('actor',pg_temp.e6('01')),'The made_group line: '||row_to_json(v_line)::text);
 perform pg_temp.g2_check(pg_temp.g2_lines(pg_temp.e6p('07'))='joined:sent','Walk''s lines: '||pg_temp.g2_lines(pg_temp.e6p('07')));
 perform pg_temp.g2_check(not exists(select 1 from public.chats where series_id in (pg_temp.e6p('06'),pg_temp.e6p('07')) and stopped_at is not null),
  'Brunch or Walk is stopped');
 perform set_config('resbite.system','roll',true);
 update public.plans set repeat_weeks=null where id=pg_temp.e6p('07');
 perform pg_temp.g2_check((select stopped_at from public.chats where series_id=pg_temp.e6p('07'))=now(),'The stop under the flag wrote no stop time');
 update public.plans set repeat_weeks=1 where id=pg_temp.e6p('07');
 perform set_config('resbite.system','',true);
 perform pg_temp.g2_check((select stopped_at from public.chats where series_id=pg_temp.e6p('07')) is null,'The resume under the flag left the stop time');
 perform pg_temp.g2_check(pg_temp.g2_lines(pg_temp.e6p('07'))='joined:sent','Walk''s lines under the flag: '||pg_temp.g2_lines(pg_temp.e6p('07')));
end $$;

-- Walk rolls (its times moved back an hour past the end, under the roll's flag, with a guest row for 13, a web
-- account that never used the app, so the roll leaves it on the first occurrence). Since Task 2 the roll writes its own
-- two lines, ended and next (slice 2 checks them).
-- Only the current occurrence speaks for the series (G-N4, review M3): the repeat turned off on the occurrence the roll
-- left behind, then that occurrence cancelled (under the flag, so chat core writes no line), stop nothing.
-- A fold clears a leave only when the row it moves lands on the current occurrence (Q2, Decision 1, CH-P4): 09 gets a
-- row on the rolled occurrence, which then ends, and leaves (a leave by hand). 13 folds into 09 (fold_web_account):
-- the row it moves is on the first occurrence, so the leave stays, and 09 is still out. The leave goes after.
insert into auth.users(id,email,email_confirmed_at) values (pg_temp.e6('13'),'g2-13@resbite-test.invalid',now());
insert into public.profiles(id,display_name) values (pg_temp.e6('13'),'Wes Web');
select set_config('resbite.system','roll',true);
insert into public.attendees(plan_id,user_id,response) values (pg_temp.e6p('07'),pg_temp.e6('13'),'accepted');
update public.plans set starts_at=now()-interval '3 hours',ends_at=now()-interval '1 hour' where id=pg_temp.e6p('07');
select pg_temp.g2_check(private.roll_repeating_plans()=1,'The roll did not roll Walk alone');
select set_config('resbite.system','',true);
select set_config('g2.walk2',(select id::text from public.plans where repeats_from=pg_temp.e6p('07')),true);
select set_config('resbite.system','roll',true);
update public.plans set repeat_weeks=null where id=pg_temp.e6p('07');
update public.plans set status='cancelled' where id=pg_temp.e6p('07');
select set_config('resbite.system','',true);
select pg_temp.g2_check((select stopped_at from public.chats where series_id=pg_temp.e6p('07')) is null and not private.group_stopped(pg_temp.e6p('07'))
 and private.chat_open(pg_temp.e6p('07')) and pg_temp.g2_lines(pg_temp.e6p('07'))='joined:sent,ended:sent,next:sent',
 'A change to the occurrence the roll left behind stopped Walk, or wrote a line');
select set_config('resbite.system','roll',true);
insert into public.attendees(plan_id,user_id,response) values (current_setting('g2.walk2')::uuid,pg_temp.e6('09'),'accepted');
update public.plans set starts_at=now()-interval '3 hours',ends_at=now()-interval '1 hour' where id=current_setting('g2.walk2')::uuid;
select set_config('resbite.system','',true);
insert into private.series_leaves(series_id,user_id) values (pg_temp.e6p('07'),pg_temp.e6('09'));
select pg_temp.g2_check(not private.chat_member(pg_temp.e6p('07'),pg_temp.e6('09')),'09, who left Walk after the end, is in its chat');
select pg_temp.g2_check((private.fold_web_account(pg_temp.e6('13'),pg_temp.e6('09'))->>'moved_attendees')::int=1,'The fold moved no row');
select pg_temp.g2_check(exists(select 1 from public.attendees where plan_id=pg_temp.e6p('07') and user_id=pg_temp.e6('09')),
 'The fold did not move 13''s row on the first occurrence to 09');
select pg_temp.g2_check(exists(select 1 from private.series_leaves where series_id=pg_temp.e6p('07') and user_id=pg_temp.e6('09'))
 and not private.chat_member(pg_temp.e6p('07'),pg_temp.e6('09')),'A fold onto an earlier occurrence cleared 09''s leave, or let 09 back in');
delete from private.series_leaves where series_id=pg_temp.e6p('07');

-- Who is in a group's chat (G-S5): the hosts of the current occurrence and everyone with a guest row on it, whatever
-- they answered: 01 to 06 on Board game night; not 07 (no row), 08 (a stranger), nobody. The one-off keeps plan 1's
-- rule: on the Picnic, 05 (not answered) and 06 (Can't go) are not in.
do $$ declare n text; begin
 foreach n in array array['01','02','03','04','05','06'] loop
  perform pg_temp.g2_check(private.chat_member(pg_temp.e6p('01'),pg_temp.e6(n)),n||' is not in Board game night''s chat');
 end loop;
 foreach n in array array['07','08'] loop
  perform pg_temp.g2_check(not private.chat_member(pg_temp.e6p('01'),pg_temp.e6(n)),n||' is in Board game night''s chat');
 end loop;
 perform pg_temp.g2_check(not private.chat_member(pg_temp.e6p('01'),null),'Nobody is in Board game night''s chat');
 perform pg_temp.g2_check(pg_temp.g2_who(array(select private.chat_members(pg_temp.e6p('01'))))='01,02,03,04,05,06',
  'chat_members of Board game night: '||pg_temp.g2_who(array(select private.chat_members(pg_temp.e6p('01')))));
 foreach n in array array['01','02','03','04'] loop
  perform pg_temp.g2_check(private.chat_member(pg_temp.e6p('05'),pg_temp.e6(n)),n||' is not in the Picnic''s chat');
 end loop;
 foreach n in array array['05','06','07','08'] loop
  perform pg_temp.g2_check(not private.chat_member(pg_temp.e6p('05'),pg_temp.e6(n)),n||' is in the Picnic''s chat');
 end loop;
 perform pg_temp.g2_check(pg_temp.g2_who(array(select private.chat_members(pg_temp.e6p('05'))))='01,02,03,04',
  'chat_members of the Picnic: '||pg_temp.g2_who(array(select private.chat_members(pg_temp.e6p('05')))));
end $$;

-- A leave (Decision 2). Board game night: 03's row on the running current occurrence plus a leave for 03, inserted by
-- hand: 03 is still in (no leave test while it runs). Once the occurrence has ended (its times moved back an hour past
-- the end), the leaver keeps the row but is no member, and series_is_group says no to them (challenge NOTE 3); 04, with
-- no leave, is still in, and the group, running, is open. The times and the leave go back.
insert into private.series_leaves(series_id,user_id) values (pg_temp.e6p('01'),pg_temp.e6('03'));
select pg_temp.g2_check(private.chat_member(pg_temp.e6p('01'),pg_temp.e6('03')),'A leave takes 03 out while Board game night runs');
select set_config('resbite.system','roll',true);
update public.plans set starts_at=now()-interval '3 hours',ends_at=now()-interval '1 hour' where id=pg_temp.e6p('01');
select set_config('resbite.system','',true);
do $$ begin
 perform pg_temp.g2_check(not private.chat_member(pg_temp.e6p('01'),pg_temp.e6('03'))
   and exists(select 1 from public.attendees where plan_id=pg_temp.e6p('01') and user_id=pg_temp.e6('03')),
  '03, who left after the end, is still in the chat, or lost the row');
 perform pg_temp.g2_check(pg_temp.g2_who(array(select private.chat_members(pg_temp.e6p('01'))))='01,02,04,05,06',
  'chat_members after 03 left an ended occurrence: '||pg_temp.g2_who(array(select private.chat_members(pg_temp.e6p('01')))));
 perform pg_temp.g2_check(private.chat_open(pg_temp.e6p('01')) and private.chat_closes_at(pg_temp.e6p('01')) is null,
  'A running group whose occurrence ended has a close time, or is closed');
end $$;
-- An update that names user_id without changing it is no way back in (review M5): the leave stays, and 03 is still out.
update public.attendees set user_id=user_id where plan_id=pg_temp.e6p('01') and user_id=pg_temp.e6('03');
select pg_temp.g2_check(exists(select 1 from private.series_leaves where series_id=pg_temp.e6p('01') and user_id=pg_temp.e6('03'))
 and not private.chat_member(pg_temp.e6p('01'),pg_temp.e6('03')),'An update leaving user_id as it was cleared 03''s leave');
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('03'));
select pg_temp.g2_check(not public.series_is_group(pg_temp.e6p('01')),'series_is_group says yes to 03, who left after the end');
select pg_temp.g2_as(pg_temp.e6('04'));
select pg_temp.g2_check(public.series_is_group(pg_temp.e6p('01')),'series_is_group says no to 04 on the ended occurrence');
reset role;
select set_config('resbite.system','roll',true);
update public.plans set starts_at=pg_temp.e6_start(1),ends_at=pg_temp.e6_start(1)+interval '2 hours' where id=pg_temp.e6p('01');
select set_config('resbite.system','',true);
delete from private.series_leaves where series_id=pg_temp.e6p('01');

-- Any way back in clears a leave (Decision 1, I7). Film club: a leave for 07 (and one for 07 on Quiz night, and one for
-- 09), inserted by hand, and a guest row for 12 on Film club's current occurrence, by hand, under the flag. A fold moves
-- 12's row to 07 (update public.attendees set user_id=…, as fold_web_account does): 07's leave for Film club is gone,
-- and 07 is in its chat; 07's leave for Quiz night and 09's stay. Then a guest row for 09 is inserted on Film club: 09's
-- leave goes too. The leave for Quiz night is taken away after.
insert into private.series_leaves(series_id,user_id) values
 (pg_temp.e6p('02'),pg_temp.e6('07')),(pg_temp.e6p('03'),pg_temp.e6('07')),(pg_temp.e6p('02'),pg_temp.e6('09'));
select set_config('resbite.system','roll',true);
insert into public.attendees(plan_id,user_id,response) values (pg_temp.e6p('02'),pg_temp.e6('12'),'pending');
select set_config('resbite.system','',true);
select pg_temp.g2_check((select count(*) from private.series_leaves where user_id in (pg_temp.e6('07'),pg_temp.e6('09')))=3,'The leaves are not as inserted');
update public.attendees set user_id=pg_temp.e6('07') where user_id=pg_temp.e6('12');
do $$ begin
 perform pg_temp.g2_check(not exists(select 1 from private.series_leaves where series_id=pg_temp.e6p('02') and user_id=pg_temp.e6('07')),
  '07''s leave for Film club stayed after a fold moved a guest row to 07');
 perform pg_temp.g2_check(exists(select 1 from private.series_leaves where series_id=pg_temp.e6p('03') and user_id=pg_temp.e6('07'))
   and exists(select 1 from private.series_leaves where series_id=pg_temp.e6p('02') and user_id=pg_temp.e6('09')),
  'The fold cleared a leave of another series or another person');
 perform pg_temp.g2_check(private.chat_member(pg_temp.e6p('02'),pg_temp.e6('07')),'07 is not in Film club''s chat after the fold');
end $$;
select set_config('resbite.system','roll',true);
insert into public.attendees(plan_id,user_id,response) values (pg_temp.e6p('02'),pg_temp.e6('09'),'pending');
select set_config('resbite.system','',true);
select pg_temp.g2_check(not exists(select 1 from private.series_leaves where series_id=pg_temp.e6p('02') and user_id=pg_temp.e6('09')),
 '09''s leave for Film club stayed after a guest row for 09 was inserted');
delete from private.series_leaves where series_id=pg_temp.e6p('03');

-- Quiz night (Review Focus 2, G-S1): "Cancel this and stop repeating" on its first occurrence. Still a group, stopped
-- now; the chat closes 48 hours after the cancellation, never at once: open at 47 hours after it, closed at 48 (the stop
-- time moved back by hand). One cancelled line, and no stopped line (that is Edit's).
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('01'));
select pg_temp.g2_cancel(pg_temp.e6p('03'),true);
reset role;
do $$ begin
 perform pg_temp.g2_check((select (status,repeat_weeks) from public.plans where id=pg_temp.e6p('03')) is not distinct from ('cancelled'::text,null::smallint),
  'Quiz night is not cancelled with its repeat off');
 perform pg_temp.g2_check(private.chat_is_group(pg_temp.e6p('03')) and private.group_stopped(pg_temp.e6p('03'))
   and (select stopped_at from public.chats where series_id=pg_temp.e6p('03'))=now(),'Quiz night is not a group stopped now');
 perform pg_temp.g2_check(private.chat_closes_at(pg_temp.e6p('03'))=now()+interval '48 hours' and private.chat_open(pg_temp.e6p('03')),
  'Quiz night''s chat does not close 48 hours after the cancellation, or is closed');
 perform pg_temp.g2_check(pg_temp.g2_lines(pg_temp.e6p('03'))='cancelled:sent','Quiz night''s lines: '||pg_temp.g2_lines(pg_temp.e6p('03')));
 update public.chats set stopped_at=now()-interval '47 hours' where series_id=pg_temp.e6p('03');
 perform pg_temp.g2_check(private.chat_open(pg_temp.e6p('03')) and private.chat_closes_at(pg_temp.e6p('03'))=now()+interval '1 hour',
  'Quiz night''s chat is closed 47 hours after the cancellation');
 update public.chats set stopped_at=now()-interval '48 hours' where series_id=pg_temp.e6p('03');
 perform pg_temp.g2_check(private.chat_open(pg_temp.e6p('03')) is false,'Quiz night''s chat is open 48 hours after the cancellation');
end $$;

-- Book club (G-S1): Edit → "Doesn't repeat", the stop time moved back 3 days, then Cancel. The cancellation overwrites
-- the stop time with its own (now), so the chat is open 47 hours after it, never closed at once.
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('01'));
select pg_temp.g2_repeat(pg_temp.e6p('04'),null);
reset role;
update public.chats set stopped_at=now()-interval '3 days' where series_id=pg_temp.e6p('04');
select pg_temp.g2_check(private.chat_closes_at(pg_temp.e6p('04'))=pg_temp.e6_start(4)+interval '50 hours',
 'Book club, stopped by Edit, does not close 48 hours after its end');
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('01'));
select pg_temp.g2_cancel(pg_temp.e6p('04'),false);
reset role;
do $$ begin
 perform pg_temp.g2_check(abs(extract(epoch from (select stopped_at from public.chats where series_id=pg_temp.e6p('04'))-now()))<1,
  'Book club''s stop time is not the cancellation''s: '||(select stopped_at from public.chats where series_id=pg_temp.e6p('04'))::text);
 perform pg_temp.g2_check(private.chat_open(pg_temp.e6p('04')),'Book club''s chat is closed at the cancellation');
 update public.chats set stopped_at=stopped_at-interval '47 hours' where series_id=pg_temp.e6p('04');
 perform pg_temp.g2_check(private.chat_open(pg_temp.e6p('04')),'Book club''s chat is closed 47 hours after the cancellation');
 perform pg_temp.g2_check(pg_temp.g2_lines(pg_temp.e6p('04'))='stopped:sent,cancelled:sent','Book club''s lines: '||pg_temp.g2_lines(pg_temp.e6p('04')));
end $$;

-- Film club (CH-P15): "Cancel just this one". The series runs on, so the chat has no close time and stays open, though
-- this week's occurrence is cancelled.
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('01'));
select pg_temp.g2_cancel(pg_temp.e6p('02'),false);
reset role;
do $$ begin
 perform pg_temp.g2_check((select (status,repeat_weeks) from public.plans where id=pg_temp.e6p('02')) is not distinct from ('cancelled'::text,1::smallint),
  'Film club is not cancelled with its repeat kept');
 perform pg_temp.g2_check((select stopped_at from public.chats where series_id=pg_temp.e6p('02')) is null and not private.group_stopped(pg_temp.e6p('02')),
  '"Cancel just this one" stopped Film club');
 perform pg_temp.g2_check(private.chat_closes_at(pg_temp.e6p('02')) is null and private.chat_open(pg_temp.e6p('02')),
  'Film club''s chat has a close time, or is closed, after "Cancel just this one"');
end $$;

-- Board game night's summary as 05, a member who has not answered: a group, not stopped, weekly, 6 people (01 and every
-- guest row), open with no close time; the announcement sheet's Going 4 and Everyone 6.
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('05'));
do $$ declare s jsonb := public.chat_summary(pg_temp.e6p('01')); begin
 perform pg_temp.g2_check(s @> jsonb_build_object('series_id',pg_temp.e6p('01'),'plan_id',pg_temp.e6p('01'),'status','active','repeat_weeks',1,
   'is_group',true,'stopped',false,'closes_at',null,'open',true,'host',false,'accepted',2,'members',6,'going',4,'everyone',6),
  'chat_summary as 05: '||s::text);
end $$;
-- series_is_group: no to 08, a stranger; yes to 05 (not answered) and 06 (Can't go), members, and to 01, a host; no on
-- the Picnic, a one-off, to 03, in its chat.
select pg_temp.g2_as(pg_temp.e6('08'));
select pg_temp.g2_check(not public.series_is_group(pg_temp.e6p('01')),'series_is_group says yes to a stranger');
select pg_temp.g2_as(pg_temp.e6('05'));
select pg_temp.g2_check(public.series_is_group(pg_temp.e6p('01')),'series_is_group says no to 05, a member who has not answered');
select pg_temp.g2_as(pg_temp.e6('06'));
select pg_temp.g2_check(public.series_is_group(pg_temp.e6p('01')),'series_is_group says no to 06, a member who can''t go');
select pg_temp.g2_as(pg_temp.e6('01'));
select pg_temp.g2_check(public.series_is_group(pg_temp.e6p('01')),'series_is_group says no to 01, the owner');
select pg_temp.g2_as(pg_temp.e6('03'));
select pg_temp.g2_check(not public.series_is_group(pg_temp.e6p('05')),'series_is_group says yes on a one-off');
-- Nobody reads the leave record directly (K-S5): selecting or writing it as a signed-in member is refused.
select pg_temp.g2_refused($$select count(*) from private.series_leaves$$,'42501','permission denied for table series_leaves');
select pg_temp.g2_refused($$insert into private.series_leaves(series_id,user_id) values (pg_temp.e6p('01'),pg_temp.e6('03'))$$,
 '42501','permission denied for table series_leaves');
reset role;
-- series_is_group is false for a member who may no longer use the app (Q1, review M1): 05's roster row goes, then comes
-- back.
delete from private.tester_roster where email='g2-05@resbite-test.invalid';
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('05'));
select pg_temp.g2_check(public.series_is_group(pg_temp.e6p('01')) is false,'series_is_group says yes to 05, who may not use the app');
reset role;
insert into private.tester_roster(email) values ('g2-05@resbite-test.invalid');

-- The announcement audiences, unchanged (Global Constraints), on the group: Going this Thursday is the hosts and the
-- people Going or Maybe; Everyone in the group is every member.
do $$ begin
 perform pg_temp.g2_check(pg_temp.g2_who(array(select private.announcement_audience(pg_temp.e6p('01'),'going')))='01,02,03,04',
  'Going on Board game night: '||pg_temp.g2_who(array(select private.announcement_audience(pg_temp.e6p('01'),'going'))));
 perform pg_temp.g2_check(pg_temp.g2_who(array(select private.announcement_audience(pg_temp.e6p('01'),'everyone')))='01,02,03,04,05,06',
  'Everyone on Board game night: '||pg_temp.g2_who(array(select private.announcement_audience(pg_temp.e6p('01'),'everyone'))));
end $$;

-- The objects (K-S5, K-N13): the stop time's column; the leave record with RLS on, no policy and no privilege for any
-- role; the two triggers; every function this section makes or redefines a security definer with an empty search path,
-- the database's own but for chat_summary and series_is_group, which only authenticated may call.
do $$ declare f text; r text; p text; begin
 perform pg_temp.g2_check((select format_type(a.atttypid,a.atttypmod)||' '||a.attnotnull::text from pg_catalog.pg_attribute a
   where a.attrelid='public.chats'::regclass and a.attname='stopped_at' and not a.attisdropped)='timestamp with time zone false',
  'chats.stopped_at is not a nullable timestamptz');
 perform pg_temp.g2_check((select relrowsecurity from pg_catalog.pg_class where oid='private.series_leaves'::regclass)
   and not exists(select 1 from pg_catalog.pg_policy where polrelid='private.series_leaves'::regclass),'series_leaves has no RLS, or a policy');
 foreach r in array array['public','anon','authenticated','service_role'] loop
  foreach p in array array['select','insert','update','delete'] loop
   perform pg_temp.g2_check(not has_table_privilege(r,'private.series_leaves',p),r||' has '||p||' on series_leaves');
  end loop;
 end loop;
 perform pg_temp.g2_check((select string_agg(c.relname||'.'||t.tgname||' '||t.tgfoid::regprocedure::text||' '
    ||substring(pg_catalog.pg_get_triggerdef(t.oid) from '(AFTER .* FOR EACH ROW)'),' | ' order by t.tgname)
   from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid where t.tgname in ('plans_group_flag','attendees_clear_leave'))
   ='attendees.attendees_clear_leave private.attendees_clear_leave() AFTER INSERT OR UPDATE OF user_id ON public.attendees FOR EACH ROW | '
    'plans.plans_group_flag private.plans_group_flag() AFTER INSERT OR UPDATE OF repeat_weeks, status ON public.plans FOR EACH ROW',
  'The group triggers are wrong');
 foreach f in array array['private.chat_hide_line(bigint)','private.group_stopped(uuid)','private.plans_group_flag()','private.attendees_clear_leave()',
   'private.chat_member(uuid,uuid)','private.chat_closes_at(uuid)','private.chat_open(uuid)','private.chat_summary(uuid)','private.series_is_group(uuid)'] loop
  perform pg_temp.g2_check((select p.prosecdef and p.proconfig=array['search_path=""'] from pg_catalog.pg_proc p where p.oid=f::regprocedure),
   f||' is not a security definer with an empty search path');
 end loop;
 foreach f in array array['private.chat_hide_line(bigint)','private.group_stopped(uuid)','private.plans_group_flag()','private.attendees_clear_leave()',
   'private.chat_member(uuid,uuid)','private.chat_closes_at(uuid)','private.chat_open(uuid)'] loop
  foreach r in array array['public','anon','authenticated','service_role'] loop
   perform pg_temp.g2_check(not has_function_privilege(r,f,'execute'),r||' may execute '||f);
  end loop;
 end loop;
 foreach f in array array['private.chat_summary(uuid)','public.chat_summary(uuid)','private.series_is_group(uuid)','public.series_is_group(uuid)'] loop
  foreach r in array array['public','anon','service_role'] loop
   perform pg_temp.g2_check(not has_function_privilege(r,f,'execute'),r||' may execute '||f);
  end loop;
  perform pg_temp.g2_check(has_function_privilege('authenticated',f,'execute'),'authenticated may not execute '||f);
 end loop;
end $$;

-- An owner who can no longer use the app stops the group (G-S4): 01's roster row goes, and every series 01 owns is
-- stopped. Board game night, running: the summary (as 05) says stopped, and the chat closes 48 hours after its current
-- occurrence's end. Film club, its current occurrence cancelled with the repeat kept (as an account deletion leaves it):
-- the same close. The Picnic, a one-off, is not stopped. 01's roster row comes back, and Board game night runs again.
delete from private.tester_roster where email='g2-01@resbite-test.invalid';
do $$ declare s jsonb; begin
 perform pg_temp.g2_check(not private.user_eligible(pg_temp.e6('01')),'01 may still use the app');
 perform pg_temp.g2_as(pg_temp.e6('05'));
 s := public.chat_summary(pg_temp.e6p('01'));
 perform pg_temp.g2_check(s @> '{"stopped":true,"open":true}' and (s->>'closes_at')::timestamptz=pg_temp.e6_start(1)+interval '50 hours',
  'Board game night''s summary with an owner who may not use the app: '||s::text);
 perform pg_temp.g2_check(private.group_stopped(pg_temp.e6p('02'))
   and private.chat_closes_at(pg_temp.e6p('02'))=pg_temp.e6_start(2)+interval '50 hours' and private.chat_open(pg_temp.e6p('02')),
  'Film club with an owner who may not use the app does not close 48 hours after its end');
 -- The Picnic, a one-off of 01's, is never stopped (review M2): plan 1's close, and stopped false in its summary (as 03).
 perform pg_temp.g2_check(not private.group_stopped(pg_temp.e6p('05'))
   and private.chat_closes_at(pg_temp.e6p('05'))=pg_temp.e6_start(5)+interval '50 hours',
  'The Picnic, a one-off whose owner may not use the app, reads stopped');
 perform pg_temp.g2_as(pg_temp.e6('03'));
 perform pg_temp.g2_check(public.chat_summary(pg_temp.e6p('05'))@>'{"stopped":false,"is_group":false}','The Picnic''s summary says stopped');
end $$;
insert into private.tester_roster(email) values ('g2-01@resbite-test.invalid');
select pg_temp.g2_check(not private.group_stopped(pg_temp.e6p('01')) and private.chat_closes_at(pg_temp.e6p('01')) is null,
 'Board game night did not run again with its owner back');

-- Last in the slice (challenge NOTE 12): 01 cancels the Picnic, a one-off. It is no group, so its chat row keeps no stop
-- time, and plan 1's rule closes it at once.
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('01'));
select pg_temp.g2_cancel(pg_temp.e6p('05'),false);
reset role;
do $$ begin
 perform pg_temp.g2_check((select (c.is_group,c.stopped_at) from public.chats c where c.series_id=pg_temp.e6p('05'))
   is not distinct from (false,null::timestamptz),'The cancelled Picnic is a group, or has a stop time');
 perform pg_temp.g2_check(private.chat_closes_at(pg_temp.e6p('05')) is null and private.chat_open(pg_temp.e6p('05')) is false,
  'The cancelled Picnic''s chat has a close time, or is open');
end $$;
rollback;

-- Slice 2 (Task 2): the group's lines, the roll, leaving, and who sees the group. Eleven blocks, 2a to 2k (2j and 2k
-- only where the deletion lifecycle exists), each begin …
-- rollback and each from the cast, so no block's roll or leave reaches another; within a block the lines run in the
-- order written, and each block names its rolls (challenge NOTE 11). Beyond the cast: 07 is invited in the app (2a, 2b,
-- 2e); 09, 10 and 11 are brought guests, rows made by hand under the flag, 09 by 06 and 10 and 11 by 03, at level 2
-- (2b). Times inside one transaction are moved by hand: "5 minutes later" moves a line's created_at 5 minutes back (an
-- update can't set updated_at, which messages_touch makes now(), and the built search takes any row updated in the last
-- 10 minutes). An update by hand that would write a line sits under the flag; one whose test is that it writes nothing
-- runs outside it. A roll runs only once the flag is reset, so it runs with the flag empty, as cron runs it; right after
-- it returns, the flag reads 'roll' (the roll set it itself) and is reset (I1): pg_temp.g2_roll.

-- Slice 2's helpers, for this file's session only.
-- An answer through respond, as the current claims, at the caller's own row's version: the new version.
create function pg_temp.g2_respond(p_plan uuid, p_response text) returns integer language plpgsql as $$
begin
 return public.respond(p_plan,p_response,(select a.version from public.attendees a where a.plan_id=p_plan and a.user_id=auth.uid()));
end $$;
-- An invitation in the app (invite_contacts with one {user} item) by the current claims: the item's kind.
create function pg_temp.g2_invite(p_plan uuid, p_user uuid) returns text language plpgsql as $$
begin
 return public.invite_contacts(p_plan,jsonb_build_array(jsonb_build_object('user',p_user)))->0->>'kind';
end $$;
-- Edit through change_plan_v4 as the current claims, keeping everything but the place: the new version.
create function pg_temp.g2_place(p_plan uuid, p_place text) returns integer language plpgsql as $$
declare p public.plans;
begin
 select * into p from public.plans where id=p_plan;
 return public.change_plan_v4(p_plan,p.version,p.title,p.description,p.categories,p.starts_at,p.ends_at,p.time_zone,p_place,false,
  p.repeat_weeks,null,null);
end $$;
-- A plan's times moved into the past (its end an hour ago), under the flag, reset at once: no line, and the next roll
-- sees an ended occurrence.
create function pg_temp.g2_past(p_plan uuid) returns void language plpgsql as $$
begin
 perform set_config('resbite.system','roll',true);
 update public.plans set starts_at=now()-interval '3 hours',ends_at=now()-interval '1 hour' where id=p_plan;
 perform set_config('resbite.system','',true);
end $$;
-- The roll as cron runs it: the flag is empty before it; right after it returns, the flag reads 'roll', which only the
-- roll's own set_config can have put there (I1); then it is reset. The number of plans rolled. The superuser's.
create function pg_temp.g2_roll() returns integer language plpgsql as $$
declare n integer;
begin
 perform pg_temp.g2_check(coalesce(current_setting('resbite.system',true),'')='','The flag is set before the roll');
 n := private.roll_repeating_plans();
 perform pg_temp.g2_check(current_setting('resbite.system',true) is not distinct from 'roll',
  'The roll did not set its flag (I1): '||coalesce(current_setting('resbite.system',true),'null'));
 perform set_config('resbite.system','',true);
 return n;
end $$;
-- The occurrence the roll made from a plan. The superuser's.
create function pg_temp.g2_next(p_plan uuid) returns uuid language plpgsql stable as $$
begin
 return (select id from public.plans where repeats_from=p_plan);
end $$;
-- A series' system lines in id order, as event:user:state, the user's two digits ('-' for none): 'joined:07:sent'.
-- The superuser's.
create function pg_temp.g2_ulines(p_series uuid) returns text language plpgsql stable as $$
begin
 return (select coalesce(string_agg(m.event||':'||coalesce(right(m.payload->>'user',2),'-')||':'||m.state,',' order by m.id),'')
  from public.messages m where m.series_id=p_series and m.kind='system');
end $$;
-- A series' latest system line of an event (a row of nulls for none). The superuser's.
create function pg_temp.g2_last(p_series uuid, p_event text) returns public.messages language plpgsql stable as $$
declare m public.messages;
begin
 select * into m from public.messages where series_id=p_series and kind='system' and event=p_event order by id desc limit 1;
 return m;
end $$;
-- A read's row with this id (null for none).
create function pg_temp.g2_row(p_read jsonb, p_id bigint) returns jsonb language sql immutable as $$
 select e.value from jsonb_array_elements(p_read->'rows') e where (e.value->>'id')::bigint=p_id
$$;
-- A notice of a kind about a message to one person: whether it is there and may be told now. The superuser's.
create function pg_temp.g2_told(p_kind text, p_message bigint, p_to uuid) returns boolean language plpgsql stable as $$
declare v_id bigint;
begin
 select o.id into v_id from private.notification_outbox o where o.kind=p_kind and o.message_id=p_message and o.recipient_id=p_to;
 if v_id is null then raise exception 'No % notice about % to %', p_kind, p_message, p_to; end if;
 return private.notification_recipient_eligible(v_id);
end $$;

-- 2a. Lines and replies (Decision 6, confirmation S3, I2, challenge NOTE 4, G-S2), on Board game night unless named. No
-- roll.
begin;
select pg_temp.e6_cast();
-- 03 says Can't go: one line, cant_go {actor 03, user 03}. 01 invites 07 in the app: one line, joined {actor 01, user
-- 07}, whatever the reply (07 has not answered).
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('03'));
select pg_temp.g2_respond(pg_temp.e6p('01'),'declined');
select pg_temp.g2_as(pg_temp.e6('01'));
select pg_temp.g2_check(pg_temp.g2_invite(pg_temp.e6p('01'),pg_temp.e6('07'))='app','01 could not invite 07');
reset role;
do $$ declare c public.messages := pg_temp.g2_last(pg_temp.e6p('01'),'cant_go'); j public.messages := pg_temp.g2_last(pg_temp.e6p('01'),'joined'); begin
 perform pg_temp.g2_check(pg_temp.g2_ulines(pg_temp.e6p('01'))='cant_go:03:sent,joined:07:sent','Board game night''s lines: '||pg_temp.g2_ulines(pg_temp.e6p('01')));
 perform pg_temp.g2_check(c.author_id is null and c.plan_id=pg_temp.e6p('01') and c.payload=jsonb_build_object('actor',pg_temp.e6('03'),'user',pg_temp.e6('03')),
  '03''s cant_go line: '||row_to_json(c)::text);
 perform pg_temp.g2_check(j.payload=jsonb_build_object('actor',pg_temp.e6('01'),'user',pg_temp.e6('07')),'07''s joined line: '||row_to_json(j)::text);
 perform set_config('g2.c03',c.id::text,true);
 perform set_config('g2.j07',concat_ws('|',j.id,j.event,j.payload,j.state,j.created_at),true);
end $$;
-- S3: 07 says Can't go within a minute of the invitation: two lines, joined and cant_go, and the joined line as it was.
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('07'));
select pg_temp.g2_respond(pg_temp.e6p('01'),'declined');
reset role;
do $$ declare j public.messages := pg_temp.g2_last(pg_temp.e6p('01'),'joined'); c public.messages := pg_temp.g2_last(pg_temp.e6p('01'),'cant_go'); begin
 perform pg_temp.g2_check(pg_temp.g2_ulines(pg_temp.e6p('01'))='cant_go:03:sent,joined:07:sent,cant_go:07:sent',
  'Lines once 07 said Can''t go: '||pg_temp.g2_ulines(pg_temp.e6p('01')));
 perform pg_temp.g2_check(concat_ws('|',j.id,j.event,j.payload,j.state,j.created_at)=current_setting('g2.j07'),'07''s joined line changed: '||row_to_json(j)::text);
 perform pg_temp.g2_check(c.payload=jsonb_build_object('actor',pg_temp.e6('07'),'user',pg_temp.e6('07')),'07''s cant_go line: '||row_to_json(c)::text);
 perform set_config('g2.c07',c.id::text,true);
end $$;
-- 5 minutes later 07 says Going: the cant_go line reads deleted (signalled), the joined line stays, and the chat's last
-- message is the joined line, with its time (NOTE 4).
update public.messages set created_at=created_at-interval '5 minutes' where id=current_setting('g2.c07')::bigint;
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('07'));
select pg_temp.g2_respond(pg_temp.e6p('01'),'accepted');
reset role;
do $$ declare v_j bigint := (pg_temp.g2_last(pg_temp.e6p('01'),'joined')).id; begin
 perform pg_temp.g2_check(pg_temp.g2_ulines(pg_temp.e6p('01'))='cant_go:03:sent,joined:07:sent,cant_go:07:deleted',
  'Lines once 07 said Going again: '||pg_temp.g2_ulines(pg_temp.e6p('01')));
 perform pg_temp.g2_check(exists(select 1 from realtime.messages r where r.topic='chat:'||pg_temp.e6p('01')
   and r.payload->>'id'=current_setting('g2.c07') and r.payload->>'state'='deleted'),'The cant_go line''s deletion was not signalled');
 perform pg_temp.g2_check((select (c.last_message_id,c.last_message_at) from public.chats c where c.series_id=pg_temp.e6p('01'))
   is not distinct from (select (m.id,m.created_at) from public.messages m where m.id=v_j),
  'The chat''s last message is not 07''s joined line: '||(select row_to_json(c)::text from public.chats c where c.series_id=pg_temp.e6p('01')));
end $$;
-- 07 says Can't go again: one new cant_go line, shown.
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('07'));
select pg_temp.g2_respond(pg_temp.e6p('01'),'declined');
reset role;
select pg_temp.g2_check(pg_temp.g2_ulines(pg_temp.e6p('01'))='cant_go:03:sent,joined:07:sent,cant_go:07:deleted,cant_go:07:sent',
 'Lines once 07 said Can''t go again: '||pg_temp.g2_ulines(pg_temp.e6p('01')));
select set_config('g2.c07b',(pg_temp.g2_last(pg_temp.e6p('01'),'cant_go')).id::text,true);
-- NOTE 4 (old states): that line moved 11 minutes back, then 07's reply set to Can't go again by hand, outside the flag
-- (the trigger fires on every update of response): no line, and the line as it was. Then from declined to withdrawn:
-- no line either.
update public.messages set created_at=created_at-interval '11 minutes' where id=current_setting('g2.c07b')::bigint;
select set_config('g2.c07b_row',(select concat_ws('|',m.event,m.payload,m.state,m.created_at) from public.messages m where m.id=current_setting('g2.c07b')::bigint),true);
update public.attendees set response='declined' where plan_id=pg_temp.e6p('01') and user_id=pg_temp.e6('07');
update public.attendees set response='withdrawn' where plan_id=pg_temp.e6p('01') and user_id=pg_temp.e6('07');
select pg_temp.g2_check(pg_temp.g2_ulines(pg_temp.e6p('01'))='cant_go:03:sent,joined:07:sent,cant_go:07:deleted,cant_go:07:sent'
 and (select concat_ws('|',m.event,m.payload,m.state,m.created_at) from public.messages m where m.id=current_setting('g2.c07b')::bigint)=current_setting('g2.c07b_row'),
 'A reply sent again, or declined to withdrawn, wrote or changed a line: '||pg_temp.g2_ulines(pg_temp.e6p('01')));
-- I2 (the 10 minutes): 03's cant_go line moved 11 minutes back, then 03 says Going: the line stays sent, and no line.
update public.messages set created_at=created_at-interval '11 minutes' where id=current_setting('g2.c03')::bigint;
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('03'));
select pg_temp.g2_respond(pg_temp.e6p('01'),'accepted');
reset role;
select pg_temp.g2_check(pg_temp.g2_ulines(pg_temp.e6p('01'))='cant_go:03:sent,joined:07:sent,cant_go:07:deleted,cant_go:07:sent',
 'Going again after 10 minutes changed or wrote a line: '||pg_temp.g2_ulines(pg_temp.e6p('01')));
-- Beyond the brief's list, the two other branches of a group's cant_go (Decision 6), on 04. 04 says Can't go, is put
-- back to Going by hand under the flag (no line), then, by hand outside it with 01's claims, to Can't go again: the
-- line merges in place (one cant_go line for 04, now with actor 01), as H33's guard holds. A later line names 04 (an
-- admin line, by hand); 04 says Going: the cant_go line reads deleted all the same, as the guard is for a merge, not
-- for the delete (I2). 04 says Can't go: a new line, the deleted one never brought back. Another line names 04, then
-- the same back and forth by hand: the guard stops the merge, so a new line.
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('04'));
select pg_temp.g2_respond(pg_temp.e6p('01'),'declined');
reset role;
select set_config('resbite.system','roll',true);
update public.attendees set response='accepted' where plan_id=pg_temp.e6p('01') and user_id=pg_temp.e6('04');
select set_config('resbite.system','',true);
select pg_temp.g2_as(pg_temp.e6('01'));
update public.attendees set response='declined' where plan_id=pg_temp.e6p('01') and user_id=pg_temp.e6('04');
select pg_temp.g2_check((select count(*) from public.messages where series_id=pg_temp.e6p('01') and event='cant_go' and payload->>'user'=pg_temp.e6('04')::text)=1
 and (pg_temp.g2_last(pg_temp.e6p('01'),'cant_go')).payload=jsonb_build_object('actor',pg_temp.e6('01'),'user',pg_temp.e6('04')),
 '04''s second Can''t go did not merge into the first: '||pg_temp.g2_ulines(pg_temp.e6p('01')));
insert into public.messages(series_id,plan_id,kind,event,payload)
 values (pg_temp.e6p('01'),pg_temp.e6p('01'),'system','admin',jsonb_build_object('actor',pg_temp.e6('01'),'user',pg_temp.e6('04')));
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('04'));
select pg_temp.g2_respond(pg_temp.e6p('01'),'accepted');
select pg_temp.g2_respond(pg_temp.e6p('01'),'declined');
reset role;
insert into public.messages(series_id,plan_id,kind,event,payload)
 values (pg_temp.e6p('01'),pg_temp.e6p('01'),'system','admin',jsonb_build_object('actor',pg_temp.e6('01'),'user',pg_temp.e6('04')));
select set_config('resbite.system','roll',true);
update public.attendees set response='accepted' where plan_id=pg_temp.e6p('01') and user_id=pg_temp.e6('04');
select set_config('resbite.system','',true);
update public.attendees set response='declined' where plan_id=pg_temp.e6p('01') and user_id=pg_temp.e6('04');
select pg_temp.g2_check(pg_temp.g2_ulines(pg_temp.e6p('01'))='cant_go:03:sent,joined:07:sent,cant_go:07:deleted,cant_go:07:sent,'
 'cant_go:04:deleted,admin:04:sent,cant_go:04:sent,admin:04:sent,cant_go:04:sent','04''s back and forth: '||pg_temp.g2_ulines(pg_temp.e6p('01')));
-- A group's joined line names the bringer (review M6): a row for 09, brought by 03 at level 2, inserted by hand
-- outside the flag, as a guest's invitation inserts it: joined {actor, user 09, brought_by 03}.
insert into public.attendees(plan_id,user_id,response,brought_by,level) values (pg_temp.e6p('01'),pg_temp.e6('09'),'pending',pg_temp.e6('03'),2);
select pg_temp.g2_check(pg_temp.g2_keys((pg_temp.g2_last(pg_temp.e6p('01'),'joined')).payload)='actor,brought_by,user'
 and (pg_temp.g2_last(pg_temp.e6p('01'),'joined')).payload->>'user'=pg_temp.e6('09')::text
 and (pg_temp.g2_last(pg_temp.e6p('01'),'joined')).payload->>'brought_by'=pg_temp.e6('03')::text,
 'A brought guest''s joined line: '||coalesce(row_to_json(pg_temp.g2_last(pg_temp.e6p('01'),'joined'))::text,'none'));
-- G-S2: Film club, "Cancel just this one": cancelled {actor 01, stop false, starts_at, time_zone} of the cancelled
-- occurrence. Board game night, "Cancel this and stop repeating": cancelled {…, stop true, …}.
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('01'));
select pg_temp.g2_cancel(pg_temp.e6p('02'),false);
select pg_temp.g2_cancel(pg_temp.e6p('01'),true);
reset role;
do $$ declare m public.messages; p public.plans; n text; begin
 foreach n in array array['02','01'] loop
  m := pg_temp.g2_last(pg_temp.e6p(n),'cancelled');
  select * into p from public.plans where id=pg_temp.e6p(n);
  perform pg_temp.g2_check(m.plan_id=p.id and m.author_id is null and pg_temp.g2_keys(m.payload)='actor,starts_at,stop,time_zone'
    and m.payload->>'actor'=pg_temp.e6('01')::text and m.payload->'stop'=to_jsonb(n='01')
    and (m.payload->>'starts_at')::timestamptz=p.starts_at and m.payload->>'time_zone'=p.time_zone,
   'The cancelled line of plan '||n||': '||coalesce(row_to_json(m)::text,'none'));
 end loop;
 perform pg_temp.g2_check(pg_temp.g2_ulines(pg_temp.e6p('02'))='cancelled:-:sent','Film club''s lines: '||pg_temp.g2_ulines(pg_temp.e6p('02')));
end $$;
-- The objects (K-S5, K-N13): leave_series in both schemas, a security definer behind an invoker, only authenticated may
-- call; chat_place_hidden the database's own; every body this section redefines a security definer with an empty search
-- path that keeps its grants: nobody for the line triggers, the roll, the eligibility and the row, authenticated for
-- can_see_guests and request_connection. A series that does not exist hides the place.
do $$ declare f text; r text; begin
 foreach f in array array['private.leave_series(uuid)','private.chat_place_hidden(uuid,uuid)','private.attendees_chat_lines()','private.plans_chat_lines()',
   'private.roll_repeating_plans()','private.can_see_guests(uuid)','private.request_connection(uuid,uuid)','private.notification_recipient_eligible(bigint)',
   'private.chat_row(public.messages,uuid)'] loop
  perform pg_temp.g2_check((select p.prosecdef and p.proconfig=array['search_path=""'] from pg_catalog.pg_proc p where p.oid=f::regprocedure),
   f||' is not a security definer with an empty search path');
 end loop;
 perform pg_temp.g2_check((select not p.prosecdef and p.proconfig=array['search_path=""'] from pg_catalog.pg_proc p where p.oid='public.leave_series(uuid)'::regprocedure),
  'public.leave_series is not an invoker with an empty search path');
 foreach f in array array['private.chat_place_hidden(uuid,uuid)','private.attendees_chat_lines()','private.plans_chat_lines()','private.roll_repeating_plans()',
   'private.notification_recipient_eligible(bigint)','private.chat_row(public.messages,uuid)'] loop
  foreach r in array array['public','anon','authenticated','service_role'] loop
   perform pg_temp.g2_check(not has_function_privilege(r,f,'execute'),r||' may execute '||f);
  end loop;
 end loop;
 foreach f in array array['private.leave_series(uuid)','public.leave_series(uuid)','private.can_see_guests(uuid)','private.request_connection(uuid,uuid)',
   'public.request_connection(uuid,uuid)','private.my_chat_overview()','public.my_chat_overview()'] loop
  foreach r in array array['public','anon','service_role'] loop
   perform pg_temp.g2_check(not has_function_privilege(r,f,'execute'),r||' may execute '||f);
  end loop;
  perform pg_temp.g2_check(has_function_privilege('authenticated',f,'execute'),'authenticated may not execute '||f);
 end loop;
 perform pg_temp.g2_check(private.chat_place_hidden(gen_random_uuid(),pg_temp.e6('01')) and private.chat_place_hidden(pg_temp.e6p('05'),null),
  'A series that does not exist, or nobody, sees the place');
end $$;
rollback;

-- 2b. One roll, with 01 signed in (challenge NOTE 8). Before it, in this order: 01 invites 07 in the app; 09, 10 and 11
-- are made (11 Can't go, I9); 06 leaves, so 09's bringer is not carried (G-N3); 03 says Can't go (a cant_go line on the
-- old occurrence, for I2); 01 cancels Film club just this one; Board game night's and Film club's times go into the
-- past; the roll.
begin;
select pg_temp.e6_cast();
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('01'));
select pg_temp.g2_check(pg_temp.g2_invite(pg_temp.e6p('01'),pg_temp.e6('07'))='app','01 could not invite 07');
reset role;
select set_config('resbite.system','roll',true);
insert into public.attendees(plan_id,user_id,response,brought_by,level) values
 (pg_temp.e6p('01'),pg_temp.e6('09'),'pending',pg_temp.e6('06'),2),(pg_temp.e6p('01'),pg_temp.e6('10'),'pending',pg_temp.e6('03'),2),
 (pg_temp.e6p('01'),pg_temp.e6('11'),'declined',pg_temp.e6('03'),2);
select set_config('resbite.system','',true);
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('06'));
select public.leave_series(pg_temp.e6p('01'));
select pg_temp.g2_as(pg_temp.e6('03'));
select pg_temp.g2_respond(pg_temp.e6p('01'),'declined');
select pg_temp.g2_as(pg_temp.e6('01'));
select pg_temp.g2_cancel(pg_temp.e6p('02'),false);
reset role;
select set_config('g2.c03old',(pg_temp.g2_last(pg_temp.e6p('01'),'cant_go')).id::text,true);
select set_config('g2.c03old_row',(select concat_ws('|',m.plan_id,m.event,m.payload,m.state,m.created_at,m.updated_at) from public.messages m
 where m.id=current_setting('g2.c03old')::bigint),true);
select pg_temp.g2_past(pg_temp.e6p('01'));
select pg_temp.g2_past(pg_temp.e6p('02'));
select pg_temp.g2_as(pg_temp.e6('01'));
select pg_temp.g2_check(pg_temp.g2_roll()=2,'The roll did not roll Board game night and Film club alone');
select set_config('request.jwt.claims','',true);
select set_config('g2.new',pg_temp.g2_next(pg_temp.e6p('01'))::text,true);
-- G-B6: the roll carries admin 02 and guests 03, 04, 05, 07, 09, 10 and 11 onto the new occurrence, not answered, and
-- writes no joined line and no admin line there. NOTE 8: ended {actor null, title} on the old occurrence and next {actor
-- null, plan_id, starts_at, time_zone, place_label, place_tbd} on the new one, the chat's last message, though 01 is
-- signed in. Film club: no ended line on its cancelled occurrence, and a next line on its new one. G-N3: 09 is carried
-- with no bringer, 10 keeps 03. I9 (CO-Q1 "carried"): 11, brought by 03, who said Can't go, is carried, not answered,
-- with bringer 03 and level 2.
do $$ declare v_new uuid := current_setting('g2.new')::uuid; v_film uuid := pg_temp.g2_next(pg_temp.e6p('02')); p public.plans;
 e public.messages := pg_temp.g2_last(pg_temp.e6p('01'),'ended'); n public.messages := pg_temp.g2_last(pg_temp.e6p('01'),'next'); begin
 select * into p from public.plans where id=v_new;
 perform pg_temp.g2_check(p.series_id=pg_temp.e6p('01'),'The roll did not make Board game night''s next occurrence');
 perform pg_temp.g2_check(pg_temp.g2_who(array(select a.user_id from public.attendees a where a.plan_id=v_new))='02,03,04,05,07,09,10,11'
   and not exists(select 1 from public.attendees a where a.plan_id=v_new and a.response<>'pending'),
  'Carried: '||pg_temp.g2_who(array(select a.user_id from public.attendees a where a.plan_id=v_new)));
 perform pg_temp.g2_check(exists(select 1 from public.plan_admins pa where pa.plan_id=v_new and pa.user_id=pg_temp.e6('02')),'02 was not carried as an admin');
 perform pg_temp.g2_check((select coalesce(string_agg(m.event,',' order by m.id),'') from public.messages m where m.plan_id=v_new)='next',
  'Lines on the new occurrence: '||(select coalesce(string_agg(m.event,',' order by m.id),'') from public.messages m where m.plan_id=v_new));
 perform pg_temp.g2_check(e.plan_id=pg_temp.e6p('01') and e.author_id is null and e.payload=jsonb_build_object('actor',null,'title','Board game night'),
  'The ended line: '||coalesce(row_to_json(e)::text,'none'));
 perform pg_temp.g2_check(n.plan_id=v_new and n.author_id is null and pg_temp.g2_keys(n.payload)='actor,place_label,place_tbd,plan_id,starts_at,time_zone'
   and n.payload->'actor'='null'::jsonb and n.payload->>'plan_id'=v_new::text and (n.payload->>'starts_at')::timestamptz=p.starts_at
   and n.payload->>'time_zone'='Europe/London' and n.payload->>'place_label'='Ana''s flat' and n.payload->'place_tbd'='false'::jsonb,
  'The next line: '||coalesce(row_to_json(n)::text,'none'));
 perform pg_temp.g2_check((select last_message_id from public.chats where series_id=pg_temp.e6p('01'))=n.id,'The next line is not the chat''s last message');
 perform pg_temp.g2_check(not exists(select 1 from public.messages m where m.series_id=pg_temp.e6p('02') and m.event='ended')
   and (pg_temp.g2_last(pg_temp.e6p('02'),'next')).plan_id=v_film
   and ((pg_temp.g2_last(pg_temp.e6p('02'),'next')).payload->>'starts_at')::timestamptz=(select starts_at from public.plans where id=v_film),
  'Film club''s lines: '||pg_temp.g2_ulines(pg_temp.e6p('02')));
 perform pg_temp.g2_check((select brought_by from public.attendees where plan_id=v_new and user_id=pg_temp.e6('09')) is null
   and (select brought_by from public.attendees where plan_id=v_new and user_id=pg_temp.e6('10'))=pg_temp.e6('03'),
  '09 keeps a bringer who was not carried, or 10 lost 03');
 perform pg_temp.g2_check((select (response,brought_by,level) from public.attendees where plan_id=v_new and user_id=pg_temp.e6('11'))
   is not distinct from ('pending'::text,pg_temp.e6('03'),2::smallint),'11, brought by 03, who said Can''t go, is not carried as brought');
end $$;
-- I2 (this occurrence only), on the new occurrence, within 10 minutes of 03's cant_go line on the old one: 03 says Can't
-- go, one new cant_go line on the new occurrence, the old line as it was (a series-wide search would rewrite it and
-- write none); then Going, the new line reads deleted and the old one stays sent (a series-wide search would delete the
-- old one). ended and next name nobody, so H33's guard hides neither failure. 03 ends Going.
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('03'));
select pg_temp.g2_respond(current_setting('g2.new')::uuid,'declined');
reset role;
do $$ declare v_new uuid := current_setting('g2.new')::uuid; begin
 perform pg_temp.g2_check((select concat_ws('|',m.plan_id,m.event,m.payload,m.state,m.created_at,m.updated_at) from public.messages m
   where m.id=current_setting('g2.c03old')::bigint)=current_setting('g2.c03old_row'),'03''s old cant_go line changed');
 perform pg_temp.g2_check((select count(*) from public.messages m where m.series_id=pg_temp.e6p('01') and m.event='cant_go' and m.plan_id=v_new
   and m.state='sent' and m.payload=jsonb_build_object('actor',pg_temp.e6('03'),'user',pg_temp.e6('03')))=1,
  'No new cant_go line on the new occurrence: '||pg_temp.g2_ulines(pg_temp.e6p('01')));
 perform set_config('g2.c03new',(pg_temp.g2_last(pg_temp.e6p('01'),'cant_go')).id::text,true);
end $$;
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('03'));
select pg_temp.g2_respond(current_setting('g2.new')::uuid,'accepted');
reset role;
select pg_temp.g2_check((select state from public.messages where id=current_setting('g2.c03new')::bigint)='deleted'
 and (select state from public.messages where id=current_setting('g2.c03old')::bigint)='sent'
 and (select response from public.attendees where plan_id=current_setting('g2.new')::uuid and user_id=pg_temp.e6('03'))='accepted',
 'Going again on the new occurrence: '||pg_temp.g2_ulines(pg_temp.e6p('01')));
-- I11, as 05 (not answered on the new occurrence, not a host): chat_messages and chat_messages_since give the next line
-- with no place_label and with place_tbd, and so do chat_summary's last (that line) and my_chat_overview's last. As 02
-- (an admin, not answered there: a host) and 03 (Going there): the place. Every row carries its message's plan_id
-- (carry 4).
do $$ declare v_next bigint := (pg_temp.g2_last(pg_temp.e6p('01'),'next')).id; r jsonb; n text; begin
 perform pg_temp.g2_as(pg_temp.e6('05'));
 r := public.chat_messages(pg_temp.e6p('01'));
 perform pg_temp.g2_check(not (pg_temp.g2_row(r,v_next)->'payload' ? 'place_label') and pg_temp.g2_row(r,v_next)->'payload'->'place_tbd'='false'::jsonb,
  'chat_messages as 05 gives the place: '||coalesce(pg_temp.g2_row(r,v_next)::text,'no row'));
 perform pg_temp.g2_check(jsonb_array_length(r->'rows')>0 and not exists(select 1 from jsonb_array_elements(r->'rows') e
   where (e.value->>'plan_id')::uuid is distinct from (select m.plan_id from public.messages m where m.id=(e.value->>'id')::bigint)),
  'A row''s plan_id is not its message''s: '||(r->'rows')::text);
 r := public.chat_messages_since(pg_temp.e6p('01'),0,null);
 perform pg_temp.g2_check(not (pg_temp.g2_row(r,v_next)->'payload' ? 'place_label') and pg_temp.g2_row(r,v_next)->'payload' ? 'place_tbd',
  'chat_messages_since as 05 gives the place: '||coalesce(pg_temp.g2_row(r,v_next)::text,'no row'));
 r := public.chat_summary(pg_temp.e6p('01'))->'last';
 perform pg_temp.g2_check((r->>'id')::bigint=v_next and not (r->'payload' ? 'place_label') and r->'payload' ? 'place_tbd',
  'chat_summary''s last as 05: '||coalesce(r::text,'none'));
 r := public.my_chat_overview()->'chats'->(pg_temp.e6p('01')::text)->'last';
 perform pg_temp.g2_check((r->>'id')::bigint=v_next and not (r->'payload' ? 'place_label') and r->'payload' ? 'place_tbd',
  'my_chat_overview''s last as 05: '||coalesce(r::text,'none'));
 foreach n in array array['02','03'] loop
  perform pg_temp.g2_as(pg_temp.e6(n));
  perform pg_temp.g2_check(pg_temp.g2_row(public.chat_messages(pg_temp.e6p('01')),v_next)->'payload'->>'place_label'='Ana''s flat'
    and public.chat_summary(pg_temp.e6p('01'))->'last'->'payload'->>'place_label'='Ana''s flat',n||' does not read the place in the next line');
 end loop;
end $$;
-- A guest who said Can't go reads the place too (review M4: eventPlace shows it for any answer): 10 says Can't go on
-- the new occurrence, then reads the next line with its place.
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('10'));
select pg_temp.g2_respond(current_setting('g2.new')::uuid,'declined');
select pg_temp.g2_check(pg_temp.g2_row(public.chat_messages(pg_temp.e6p('01')),(select max((e.value->>'id')::bigint) from
  jsonb_array_elements(public.chat_messages(pg_temp.e6p('01'))->'rows') e where e.value->>'event'='next'))->'payload'->>'place_label'='Ana''s flat',
 '10, who said Can''t go, does not read the place in the next line');
reset role;
-- 01 changes the place on the new occurrence: as 05, the changed line keeps what (place) and has no place_label; as 03
-- it has the new one.
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('01'));
select pg_temp.g2_place(current_setting('g2.new')::uuid,'The games cafe');
reset role;
do $$ declare v_changed bigint := (pg_temp.g2_last(pg_temp.e6p('01'),'changed')).id; r jsonb; begin
 perform pg_temp.g2_check(v_changed is not null,'No changed line');
 perform pg_temp.g2_as(pg_temp.e6('05'));
 r := pg_temp.g2_row(public.chat_messages(pg_temp.e6p('01')),v_changed);
 perform pg_temp.g2_check(r->'payload'->>'what'='place' and not (r->'payload' ? 'place_label'),'The changed line as 05: '||coalesce(r::text,'no row'));
 r := public.chat_summary(pg_temp.e6p('01'))->'last';
 perform pg_temp.g2_check((r->>'id')::bigint=v_changed and not (r->'payload' ? 'place_label'),'chat_summary''s last as 05: '||coalesce(r::text,'none'));
 perform pg_temp.g2_as(pg_temp.e6('03'));
 r := pg_temp.g2_row(public.chat_messages(pg_temp.e6p('01')),v_changed);
 perform pg_temp.g2_check(r->'payload'->>'place_label'='The games cafe','The changed line as 03: '||coalesce(r::text,'no row'));
end $$;
-- I6: the roll queued invited:<new occurrence>:<04>. 04 leaves: that notice is gone. 01 invites 04 again in the app: one
-- notice with that key, newer than the roll's.
select set_config('g2.inv04',(select id from private.notification_outbox
 where dedupe_key='invited:'||current_setting('g2.new')||':'||pg_temp.e6('04'))::text,true);
select pg_temp.g2_check(current_setting('g2.inv04')<>'','The roll queued no invited notice for 04');
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('04'));
select public.leave_series(pg_temp.e6p('01'));
reset role;
select pg_temp.g2_check(not exists(select 1 from private.notification_outbox where dedupe_key='invited:'||current_setting('g2.new')||':'||pg_temp.e6('04')),
 '04''s invited notice stayed after 04 left');
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('01'));
select pg_temp.g2_check(pg_temp.g2_invite(current_setting('g2.new')::uuid,pg_temp.e6('04'))='app','01 could not invite 04 again');
reset role;
select pg_temp.g2_check((select count(*) from private.notification_outbox where dedupe_key='invited:'||current_setting('g2.new')||':'||pg_temp.e6('04')
  and id>current_setting('g2.inv04')::bigint)=1
 and not exists(select 1 from private.series_leaves where series_id=pg_temp.e6p('01') and user_id=pg_temp.e6('04')),
 '04, invited again the same week, has no new notice, or kept the leave');
rollback;

-- 2c. Leaving while the occurrence runs, then one roll. 04 holds a personal link on Board game night, claimed (a
-- private.invitations row, made here).
begin;
select pg_temp.e6_cast();
insert into private.invitations(id,plan_id,token_hash,claimed_by)
 values (gen_random_uuid(),pg_temp.e6p('01'),extensions.digest(repeat('g',64),'sha256'),pg_temp.e6('04'));
select set_config('g2.outbox',(select count(*) from private.notification_outbox)::text,true);
-- 04 leaves: the guest row is gone, the leave stored, one line, left {actor 04, user 04}, out of the chat, no notice.
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('04'));
select public.leave_series(pg_temp.e6p('01'));
reset role;
do $$ declare l public.messages := pg_temp.g2_last(pg_temp.e6p('01'),'left'); begin
 perform pg_temp.g2_check(not exists(select 1 from public.attendees where plan_id=pg_temp.e6p('01') and user_id=pg_temp.e6('04'))
   and exists(select 1 from private.series_leaves where series_id=pg_temp.e6p('01') and user_id=pg_temp.e6('04')),'04''s row stayed, or no leave');
 perform pg_temp.g2_check(pg_temp.g2_ulines(pg_temp.e6p('01'))='left:04:sent' and l.plan_id=pg_temp.e6p('01') and l.author_id is null
   and l.payload=jsonb_build_object('actor',pg_temp.e6('04'),'user',pg_temp.e6('04')),'The left line: '||coalesce(row_to_json(l)::text,'none'));
 perform pg_temp.g2_check(not private.chat_member(pg_temp.e6p('01'),pg_temp.e6('04')),'04 is still in the chat');
 perform pg_temp.g2_check((select count(*) from private.notification_outbox)=current_setting('g2.outbox')::bigint,'Leaving queued a notice');
end $$;
-- G-N1: the personal link is revoked, so answering it is refused as after remove_guest. Leaving again: 42501 'Not in
-- this group' (challenge NOTE 12). The admin and the owner can't leave; a guest of the one-off is in no group.
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('04'));
select pg_temp.g2_refused($$select public.claim_invite(repeat('g',64))$$,'42501','Invitation unavailable');
select pg_temp.g2_refused($$select public.leave_series(pg_temp.e6p('01'))$$,'42501','Not in this group');
select pg_temp.g2_as(pg_temp.e6('02'));
select pg_temp.g2_refused($$select public.leave_series(pg_temp.e6p('01'))$$,'42501','Hosts can''t leave');
select pg_temp.g2_as(pg_temp.e6('01'));
select pg_temp.g2_refused($$select public.leave_series(pg_temp.e6p('01'))$$,'42501','Owner can''t leave');
select pg_temp.g2_as(pg_temp.e6('03'));
select pg_temp.g2_refused($$select public.leave_series(pg_temp.e6p('05'))$$,'42501','Not in this group');
-- CH-P4: 02 says Can't go, which ends the admin role; then 02 may leave: one line, left {actor 02, user 02}.
select pg_temp.g2_as(pg_temp.e6('02'));
select pg_temp.g2_respond(pg_temp.e6p('01'),'declined');
select public.leave_series(pg_temp.e6p('01'));
reset role;
select pg_temp.g2_check(pg_temp.g2_ulines(pg_temp.e6p('01'))='left:04:sent,cant_go:02:sent,left:02:sent'
 and (pg_temp.g2_last(pg_temp.e6p('01'),'left')).payload=jsonb_build_object('actor',pg_temp.e6('02'),'user',pg_temp.e6('02'))
 and not exists(select 1 from public.plan_admins where plan_id=pg_temp.e6p('01') and user_id=pg_temp.e6('02')),
 'Lines once 02 stepped down and left: '||pg_temp.g2_ulines(pg_temp.e6p('01')));
-- The roll carries neither 04 nor 02. 01 invites 04 again: the leave goes, and 04 is in the group.
select pg_temp.g2_past(pg_temp.e6p('01'));
select pg_temp.g2_check(pg_temp.g2_roll()=1,'The roll did not roll Board game night alone');
select set_config('g2.new',pg_temp.g2_next(pg_temp.e6p('01'))::text,true);
select pg_temp.g2_check(pg_temp.g2_who(array(select a.user_id from public.attendees a where a.plan_id=current_setting('g2.new')::uuid))='03,05,06',
 'Carried: '||pg_temp.g2_who(array(select a.user_id from public.attendees a where a.plan_id=current_setting('g2.new')::uuid)));
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('01'));
select pg_temp.g2_check(pg_temp.g2_invite(current_setting('g2.new')::uuid,pg_temp.e6('04'))='app','01 could not invite 04 again');
reset role;
select pg_temp.g2_check(not exists(select 1 from private.series_leaves where series_id=pg_temp.e6p('01') and user_id=pg_temp.e6('04'))
 and private.chat_member(pg_temp.e6p('01'),pg_temp.e6('04')),'04, invited again, kept the leave or is not in the group');
rollback;

-- 2d. A leave after the end, then one roll; last, a leave from a closed group.
begin;
select pg_temp.e6_cast();
-- G-N13: Board game night's current occurrence has ended (before the roll); 03 leaves: the leave is stored, the row
-- stays (a real attendance), and 03 is out of the chat. NOTE 3: series_is_group says no to 03, who can still read the
-- occurrence.
select pg_temp.g2_past(pg_temp.e6p('01'));
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('03'));
select public.leave_series(pg_temp.e6p('01'));
select pg_temp.g2_check(not public.series_is_group(pg_temp.e6p('01')),'series_is_group says yes to 03, who left after the end');
select pg_temp.g2_check(exists(select 1 from public.plans where id=pg_temp.e6p('01')),'03 can no longer read the occurrence');
reset role;
select pg_temp.g2_check(exists(select 1 from private.series_leaves where series_id=pg_temp.e6p('01') and user_id=pg_temp.e6('03'))
 and exists(select 1 from public.attendees where plan_id=pg_temp.e6p('01') and user_id=pg_temp.e6('03'))
 and not private.chat_member(pg_temp.e6p('01'),pg_temp.e6('03')) and pg_temp.g2_ulines(pg_temp.e6p('01'))='left:03:sent',
 'A leave after the end: '||pg_temp.g2_ulines(pg_temp.e6p('01')));
-- S1: 02 announces to Going, then (its time moved 61 seconds back, so 'Too fast' does not answer) to everyone. Neither
-- reaches 03, and the summary's Going and Everyone leave 03 out: Going 01, 02, 04; Everyone 01, 02, 04, 05, 06.
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('02'));
select set_config('g2.going',(public.send_announcement(pg_temp.e6p('01'),'Who is bringing snacks?','going',gen_random_uuid())->>'id'),true);
reset role;
update public.messages set created_at=now()-interval '61 seconds' where id=current_setting('g2.going')::bigint;
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('02'));
select set_config('g2.everyone',(public.send_announcement(pg_temp.e6p('01'),'Doors at seven','everyone',gen_random_uuid())->>'id'),true);
select pg_temp.g2_check(public.chat_summary(pg_temp.e6p('01'))@>'{"going":3,"everyone":5}','The summary''s audiences as 02: '||public.chat_summary(pg_temp.e6p('01'))::text);
reset role;
do $$ begin
 perform pg_temp.g2_check(not exists(select 1 from private.notification_outbox where kind='announcement' and recipient_id=pg_temp.e6('03')
   and message_id in (current_setting('g2.going')::bigint,current_setting('g2.everyone')::bigint)),'An announcement reached 03, who left');
 perform pg_temp.g2_check(pg_temp.g2_who(array(select private.announcement_audience(pg_temp.e6p('01'),'going')))='01,02,04'
   and pg_temp.g2_who(array(select private.announcement_audience(pg_temp.e6p('01'),'everyone')))='01,02,04,05,06',
  'The audiences: '||pg_temp.g2_who(array(select private.announcement_audience(pg_temp.e6p('01'),'everyone'))));
end $$;
-- 01 invites 03 again before the roll: refused on the ended occurrence, nothing written, the leave stays (Decision 2).
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('01'));
select pg_temp.g2_refused($$select public.invite_contacts(pg_temp.e6p('01'),jsonb_build_array(jsonb_build_object('user',pg_temp.e6('03'))))$$,
 '42501','Active plan owner required');
reset role;
select pg_temp.g2_check((select count(*) from public.attendees where user_id=pg_temp.e6('03') and plan_id in (select id from public.plans where series_id=pg_temp.e6p('01')))=1
 and exists(select 1 from private.series_leaves where series_id=pg_temp.e6p('01') and user_id=pg_temp.e6('03')),'A refused invitation changed 03''s row or leave');
-- The roll does not carry 03, and the leave stays.
select pg_temp.g2_check(pg_temp.g2_roll()=1,'The roll did not roll Board game night alone');
select pg_temp.g2_check(pg_temp.g2_who(array(select a.user_id from public.attendees a where a.plan_id=pg_temp.g2_next(pg_temp.e6p('01'))))='02,04,05,06'
 and exists(select 1 from private.series_leaves where series_id=pg_temp.e6p('01') and user_id=pg_temp.e6('03'))
 and not private.chat_member(pg_temp.e6p('01'),pg_temp.e6('03')),
 'Carried after 03 left: '||pg_temp.g2_who(array(select a.user_id from public.attendees a where a.plan_id=pg_temp.g2_next(pg_temp.e6p('01')))));
-- Challenge NOTE 12, a closed group: Film club stopped by Edit, its end moved 49 hours back, so its chat is closed. 04
-- may leave: one line, left {actor 04, user 04}; the row stays (ended, not cancelled); 04 is out.
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('01'));
select pg_temp.g2_repeat(pg_temp.e6p('02'),null);
reset role;
select set_config('resbite.system','roll',true);
update public.plans set starts_at=now()-interval '51 hours',ends_at=now()-interval '49 hours' where id=pg_temp.e6p('02');
select set_config('resbite.system','',true);
select pg_temp.g2_check(private.chat_open(pg_temp.e6p('02')) is false,'Film club''s chat is open');
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('04'));
select public.leave_series(pg_temp.e6p('02'));
reset role;
select pg_temp.g2_check(pg_temp.g2_ulines(pg_temp.e6p('02'))='stopped:-:sent,left:04:sent'
 and (pg_temp.g2_last(pg_temp.e6p('02'),'left')).payload=jsonb_build_object('actor',pg_temp.e6('04'),'user',pg_temp.e6('04'))
 and exists(select 1 from public.attendees where plan_id=pg_temp.e6p('02') and user_id=pg_temp.e6('04'))
 and not private.chat_member(pg_temp.e6p('02'),pg_temp.e6('04')),'A leave from a closed group: '||pg_temp.g2_ulines(pg_temp.e6p('02')));
rollback;

-- 2e. Who sees the group (CH-P21, G-S3). 01 invites 07 in the app, then one roll, so 07 and 05 are not answered on the
-- past occurrence and carried.
begin;
select pg_temp.e6_cast();
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('01'));
select pg_temp.g2_check(pg_temp.g2_invite(pg_temp.e6p('01'),pg_temp.e6('07'))='app','01 could not invite 07');
reset role;
select pg_temp.g2_past(pg_temp.e6p('01'));
select pg_temp.g2_check(pg_temp.g2_roll()=1,'The roll did not roll Board game night alone');
select set_config('g2.new',pg_temp.g2_next(pg_temp.e6p('01'))::text,true);
select pg_temp.g2_check((select count(*) from public.attendees where user_id in (pg_temp.e6('05'),pg_temp.e6('07')) and response='pending'
 and plan_id in (pg_temp.e6p('01'),current_setting('g2.new')::uuid))=4,'05 and 07 are not pending on both occurrences');
-- As 05 (not answered): the group's guests, on its current occurrence, not the one-off's; 02's name.
do $$ begin
 perform pg_temp.g2_as(pg_temp.e6('05'));
 perform pg_temp.g2_check(private.can_see_guests(current_setting('g2.new')::uuid),'05 may not see the group''s guests');
 perform pg_temp.g2_check(not private.can_see_guests(pg_temp.e6p('05')),'05 may see the one-off''s guests');
end $$;
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('05'));
select pg_temp.g2_check((select display_name from public.profiles where id=pg_temp.e6('02'))='Ada Admin','05 does not read 02''s name');
select pg_temp.g2_check((select count(*) from public.attendees where plan_id=current_setting('g2.new')::uuid)=6,'05 does not read the group''s guest list');
-- 03 (not answered on the new occurrence) asks 05 (not answered) on the group: requested. On the one-off, 05 is not
-- answered: 42501 'Not on this resbite'. series_is_group from the past occurrence's series: yes.
select pg_temp.g2_as(pg_temp.e6('03'));
select pg_temp.g2_check(public.request_connection(pg_temp.e6('05'),current_setting('g2.new')::uuid)='requested','03 could not ask 05 on the group');
select pg_temp.g2_refused($$select public.request_connection(pg_temp.e6('05'),pg_temp.e6p('05'))$$,'42501','Not on this resbite');
select pg_temp.g2_check(public.series_is_group((select series_id from public.plans where id=pg_temp.e6p('01'))),'series_is_group says no to 03 from the past occurrence');
-- Q2 (ruling GR3): from the past occurrence, 03 may ask 07, not answered there and still in the group: requested.
select pg_temp.g2_check(public.request_connection(pg_temp.e6('07'),pg_temp.e6p('01'))='requested','03 could not ask 07, a member, from the past occurrence');
-- G-S3: 05 leaves. On the past occurrence, where 05's row is not answered: no guests, and asking 03 there is 42501
-- 'Names required'. series_is_group: no.
select pg_temp.g2_as(pg_temp.e6('05'));
select public.leave_series(pg_temp.e6p('01'));
select pg_temp.g2_check((select response from public.attendees where plan_id=pg_temp.e6p('01') and user_id=pg_temp.e6('05'))='pending',
 '05 has no unanswered row on the past occurrence');
select pg_temp.g2_check((select count(*) from public.attendees where plan_id=pg_temp.e6p('01'))=1,'05, who left, reads the past occurrence''s guests');
select pg_temp.g2_refused($$select public.request_connection(pg_temp.e6('03'),pg_temp.e6p('01'))$$,'42501','Names required');
select pg_temp.g2_check(not public.series_is_group(pg_temp.e6p('01')),'series_is_group says yes to 05, who left');
-- Q2 (ruling GR3): leaving stops the group's contact. 03 can't ask 05, who left, through 05's unanswered row on the
-- past occurrence: 42501 'Not on this resbite', as on any resbite where 05 has not answered.
select pg_temp.g2_as(pg_temp.e6('03'));
select pg_temp.g2_refused($$select public.request_connection(pg_temp.e6('05'),pg_temp.e6p('01'))$$,'42501','Not on this resbite');
-- A late joiner (review M5): a row for 09 on the current occurrence only, by hand under the flag. 09 sees the current
-- occurrence's guests, not the past one's, where 09 has no row (the group branch needs a row on the plan): asking 03
-- there is 42501 'Names required'.
reset role;
select set_config('resbite.system','roll',true);
insert into public.attendees(plan_id,user_id,response) values (current_setting('g2.new')::uuid,pg_temp.e6('09'),'pending');
select set_config('resbite.system','',true);
do $$ begin
 perform pg_temp.g2_as(pg_temp.e6('09'));
 perform pg_temp.g2_check(private.can_see_guests(current_setting('g2.new')::uuid) and not private.can_see_guests(pg_temp.e6p('01')),
  '09, a late joiner, sees the past occurrence''s guests, or not the current one''s');
end $$;
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('09'));
select pg_temp.g2_refused($$select public.request_connection(pg_temp.e6('03'),pg_temp.e6p('01'))$$,'42501','Names required');
-- Removed rather than left (challenge NOTE 12): 01 removes 07 from the current occurrence; on the past one, where 07 is
-- not answered, 07 sees no guests.
select pg_temp.g2_as(pg_temp.e6('01'));
select public.remove_guest(current_setting('g2.new')::uuid,pg_temp.e6('07'));
reset role;
do $$ begin
 perform pg_temp.g2_as(pg_temp.e6('05'));
 perform pg_temp.g2_check(not private.can_see_guests(pg_temp.e6p('01')),'05, who left, may see the past occurrence''s guests');
 perform pg_temp.g2_as(pg_temp.e6('07'));
 perform pg_temp.g2_check((select response from public.attendees where plan_id=pg_temp.e6p('01') and user_id=pg_temp.e6('07'))='pending'
   and not private.can_see_guests(pg_temp.e6p('01')),'07, who was removed, may see the past occurrence''s guests');
end $$;
rollback;

-- 2f. Pushes in a cancelled week (P2-Q1, Decision 7, B1), through notification_recipient_eligible. No roll. Each message
-- is the first in its chat in this block, so the one-a-minute rule holds no notice back.
begin;
select pg_temp.e6_cast();
-- Board game night, "Cancel just this one": 03's message and 02's announcement to everyone may both be told to 04. 05
-- mutes the chat: the message no longer, the announcement still. 06 mutes the resbite: neither.
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('01'));
select pg_temp.g2_cancel(pg_temp.e6p('01'),false);
select pg_temp.g2_as(pg_temp.e6('03'));
select set_config('g2.m1',pg_temp.g2_send(pg_temp.e6p('01'),'Drinks anyway?')::text,true);
select pg_temp.g2_as(pg_temp.e6('02'));
select set_config('g2.a1',(public.send_announcement(pg_temp.e6p('01'),'The pub instead, same time','everyone',gen_random_uuid())->>'id'),true);
select pg_temp.g2_as(pg_temp.e6('05'));
select public.set_chat_mute(pg_temp.e6p('01'),true);
reset role;
insert into public.plan_mutes(series_id,user_id) values (pg_temp.e6p('01'),pg_temp.e6('06'));
do $$ declare m bigint := current_setting('g2.m1')::bigint; a bigint := current_setting('g2.a1')::bigint; begin
 perform pg_temp.g2_check(pg_temp.g2_told('chat_message',m,pg_temp.e6('04')) and pg_temp.g2_told('announcement',a,pg_temp.e6('04')),
  'A group''s message or announcement in a cancelled week may not be told to 04');
 perform pg_temp.g2_check(not pg_temp.g2_told('chat_message',m,pg_temp.e6('05')) and pg_temp.g2_told('announcement',a,pg_temp.e6('05')),
  '05, who muted the chat, may be told the message, or not the announcement');
 perform pg_temp.g2_check(not pg_temp.g2_told('chat_message',m,pg_temp.e6('06')) and not pg_temp.g2_told('announcement',a,pg_temp.e6('06')),
  '06, who muted the resbite, may be told');
end $$;
-- Film club, "Cancel this and stop repeating", its stop time 47 hours back: both may be told to 04. At 48 hours and a
-- minute (closed): neither.
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('01'));
select pg_temp.g2_cancel(pg_temp.e6p('02'),true);
reset role;
update public.chats set stopped_at=stopped_at-interval '47 hours' where series_id=pg_temp.e6p('02');
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('03'));
select set_config('g2.m2',pg_temp.g2_send(pg_temp.e6p('02'),'Same crew, new night?')::text,true);
select pg_temp.g2_as(pg_temp.e6('02'));
select set_config('g2.a2',(public.send_announcement(pg_temp.e6p('02'),'Thanks for every film','everyone',gen_random_uuid())->>'id'),true);
reset role;
select pg_temp.g2_check(pg_temp.g2_told('chat_message',current_setting('g2.m2')::bigint,pg_temp.e6('04'))
 and pg_temp.g2_told('announcement',current_setting('g2.a2')::bigint,pg_temp.e6('04')),'The stopped group''s goodbye may not be told within 48 hours');
update public.chats set stopped_at=now()-interval '48 hours 1 minute' where series_id=pg_temp.e6p('02');
select pg_temp.g2_check(private.chat_open(pg_temp.e6p('02')) is false
 and not pg_temp.g2_told('chat_message',current_setting('g2.m2')::bigint,pg_temp.e6('04'))
 and not pg_temp.g2_told('announcement',current_setting('g2.a2')::bigint,pg_temp.e6('04')),'A closed group''s message may still be told');
-- The one-off (H30): 03 writes, then 01 cancels the Picnic: 04's notice may no longer be told.
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('03'));
select set_config('g2.m3',pg_temp.g2_send(pg_temp.e6p('05'),'Blanket or chairs?')::text,true);
select pg_temp.g2_as(pg_temp.e6('01'));
select pg_temp.g2_cancel(pg_temp.e6p('05'),false);
reset role;
select pg_temp.g2_check(not pg_temp.g2_told('chat_message',current_setting('g2.m3')::bigint,pg_temp.e6('04')),'A cancelled one-off''s message may still be told');
rollback;

-- 2g. Leaving sticks (ruling GR3: D1, review M8, M2, M3). No roll. 01 invites 07 in the app on Board game night and on
-- Film club first, so 07 has a row and an invited notice on each.
begin;
select pg_temp.e6_cast();
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('01'));
select pg_temp.g2_check(pg_temp.g2_invite(pg_temp.e6p('01'),pg_temp.e6('07'))='app' and pg_temp.g2_invite(pg_temp.e6p('02'),pg_temp.e6('07'))='app',
 '01 could not invite 07');
-- D1 (G-N1, Review Focus 6): 01 sends a link by number to a number nobody holds yet (a number from Ofcom's drama range,
-- kept for fiction); 05, on Board game night already, then confirms that number. 05 leaves: the link to 05's number
-- is revoked with the leave, as remove_guest revokes it, so answering it, Can't go included, is refused and 05 stays
-- out.
select pg_temp.g2_check(public.invite_contacts(pg_temp.e6p('01'),jsonb_build_array(jsonb_build_object('phone','447700900861','country','44',
 'code','G2leaveLink05xxxxxxxxx')))->0->>'kind'='link','01''s link to an unheld number is not a link');
reset role;
update auth.users set phone='447700900861',phone_confirmed_at=now() where id=pg_temp.e6('05');
insert into private.age_attestations(user_id,terms_version) values (pg_temp.e6('05'),'2026-10');
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('05'));
select public.leave_series(pg_temp.e6p('01'));
select pg_temp.g2_refused($$select public.answer_phone_invitation('G2leaveLink05xxxxxxxxx',null,'declined','2026-10')$$,'42501','Invitation unavailable');
reset role;
select pg_temp.g2_check(exists(select 1 from private.series_leaves where series_id=pg_temp.e6p('01') and user_id=pg_temp.e6('05'))
 and not exists(select 1 from public.attendees where plan_id=pg_temp.e6p('01') and user_id=pg_temp.e6('05'))
 and not private.chat_member(pg_temp.e6p('01'),pg_temp.e6('05'))
 and (select revoked_at is not null and code_hash is null from private.phone_invitations where plan_id=pg_temp.e6p('01') and phone='447700900861'),
 '05''s link to 05''s own number let 05 back in, or is still live');
-- M8: the leaver's admin row goes with the guest row, as remove_guest deletes it. 02, an admin whose own reply is
-- withdrawn (set by hand under the flag: respond would end the role), is no host, so may leave; the admin row goes.
select set_config('resbite.system','roll',true);
update public.attendees set response='withdrawn' where plan_id=pg_temp.e6p('01') and user_id=pg_temp.e6('02');
select set_config('resbite.system','',true);
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('02'));
select public.leave_series(pg_temp.e6p('01'));
reset role;
select pg_temp.g2_check(not exists(select 1 from public.plan_admins where plan_id=pg_temp.e6p('01') and user_id=pg_temp.e6('02'))
 and not exists(select 1 from public.attendees where plan_id=pg_temp.e6p('01') and user_id=pg_temp.e6('02')),'02 left, and kept the admin row or the guest row');
-- M2: a leave from an occurrence that has ended and was cancelled ("Cancel just this one", its end passed before the
-- roll): no attendance to keep, so the row goes, with its invited notice.
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('01'));
select pg_temp.g2_cancel(pg_temp.e6p('01'),false);
reset role;
select pg_temp.g2_past(pg_temp.e6p('01'));
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('07'));
select public.leave_series(pg_temp.e6p('01'));
reset role;
select pg_temp.g2_check(not exists(select 1 from public.attendees where plan_id=pg_temp.e6p('01') and user_id=pg_temp.e6('07'))
 and not exists(select 1 from private.notification_outbox where dedupe_key='invited:'||pg_temp.e6p('01')||':'||pg_temp.e6('07'))
 and exists(select 1 from private.series_leaves where series_id=pg_temp.e6p('01') and user_id=pg_temp.e6('07')),
 '07 left a cancelled occurrence that has ended, and kept the row or the notice');
-- M3: a leave from an occurrence that has ended and was not cancelled keeps the row, a real attendance, and its
-- invited notice with it.
select pg_temp.g2_past(pg_temp.e6p('02'));
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('07'));
select public.leave_series(pg_temp.e6p('02'));
reset role;
select pg_temp.g2_check(exists(select 1 from public.attendees where plan_id=pg_temp.e6p('02') and user_id=pg_temp.e6('07'))
 and exists(select 1 from private.notification_outbox where dedupe_key='invited:'||pg_temp.e6p('02')||':'||pg_temp.e6('07'))
 and not private.chat_member(pg_temp.e6p('02'),pg_temp.e6('07')),'07 left Film club after its end, and lost the row or its notice');
rollback;

-- 2h. A closed group is finished for the roll (ruling GR3 Q1; G-S4; the spec's anti-goal "a chat that outlives its 48
-- hours"). Board game night ended three weeks ago, Film club an hour ago, and 01, their owner, may no longer use the
-- app (the roster row goes): the roll skips both (G-S4). Board game night's chat has closed (48 hours after its end), so
-- the roll writes its stop time, the end; Film club's is still open, so nothing is written. 01 comes back: the roll
-- rolls Film club, whose chat never closed, and leaves Board game night closed, with no line. Only the owner's Edit
-- reopens it: its repeat off and on again (by hand under the flag, since change_plan_v4 refuses an occurrence that has
-- ended) clears the stop time, and the next roll rolls it.
begin;
select pg_temp.e6_cast();
select set_config('resbite.system','roll',true);
update public.plans set starts_at=now()-interval '21 days 3 hours',ends_at=now()-interval '21 days 1 hour' where id=pg_temp.e6p('01');
update public.plans set starts_at=now()-interval '3 hours',ends_at=now()-interval '1 hour' where id=pg_temp.e6p('02');
select set_config('resbite.system','',true);
delete from private.tester_roster where email='g2-01@resbite-test.invalid';
select pg_temp.g2_check(pg_temp.g2_roll()=0,'The roll rolled a plan of an owner who may not use the app');
select pg_temp.g2_check((select stopped_at from public.chats where series_id=pg_temp.e6p('01'))=(select ends_at from public.plans where id=pg_temp.e6p('01'))
 and private.chat_open(pg_temp.e6p('01')) is false,'Board game night''s closed chat has no stop time: '
 ||coalesce((select stopped_at::text from public.chats where series_id=pg_temp.e6p('01')),'null'));
select pg_temp.g2_check((select stopped_at from public.chats where series_id=pg_temp.e6p('02')) is null and private.chat_open(pg_temp.e6p('02')),
 'Film club, whose chat is still open, has a stop time');
insert into private.tester_roster(email) values ('g2-01@resbite-test.invalid');
select pg_temp.g2_check(pg_temp.g2_roll()=1,'With 01 back, the roll did not roll one plan');
select pg_temp.g2_check(pg_temp.g2_next(pg_temp.e6p('02')) is not null and pg_temp.g2_next(pg_temp.e6p('01')) is null,
 'With 01 back, the roll did not roll Film club alone');
select pg_temp.g2_check(private.group_stopped(pg_temp.e6p('01')) and private.chat_open(pg_temp.e6p('01')) is false
 and pg_temp.g2_ulines(pg_temp.e6p('01'))='','Board game night''s closed chat opened again, or got a line: '||pg_temp.g2_ulines(pg_temp.e6p('01')));
select set_config('resbite.system','roll',true);
update public.plans set repeat_weeks=null where id=pg_temp.e6p('01');
update public.plans set repeat_weeks=1 where id=pg_temp.e6p('01');
select set_config('resbite.system','',true);
select pg_temp.g2_check((select stopped_at from public.chats where series_id=pg_temp.e6p('01')) is null and private.chat_open(pg_temp.e6p('01')),
 'The repeat set again did not reopen Board game night');
select pg_temp.g2_check(pg_temp.g2_roll()=1,'The roll did not roll the reopened Board game night');
select pg_temp.g2_check(pg_temp.g2_next(pg_temp.e6p('01')) is not null,'The reopened Board game night has no next occurrence');
rollback;

-- 2i. A group's announcement belongs to its week (ruling GR4: the final review's I-1 and M-3; its M-5). 01 announces to
-- everyone on Board game night: 05, who has not answered, has it on the invitation card (my_chat_overview's
-- announcements, keyed by the occurrence), and it is the chat's pinned announcement; 03, Going, has no card note. The
-- roll: on the new occurrence 05 and 03 have not answered, last week's announcement is on neither card, and nothing is
-- pinned (the row stays in the chat with its plan_id). 01 announces to everyone again, now on the new occurrence (last
-- week's moved 61 seconds back, so 'Too fast' does not answer): it is on both cards, keyed by the new occurrence, and
-- pinned. A one-off is as before: 01's announcement on the Picnic is on 05's card.
begin;
select pg_temp.e6_cast();
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('01'));
select set_config('g2.red_lion',(public.send_announcement(pg_temp.e6p('01'),'Tonight we meet at the Red Lion','everyone',gen_random_uuid())->>'id'),true);
select pg_temp.g2_as(pg_temp.e6('05'));
select pg_temp.g2_check(public.my_chat_overview()->'announcements'=jsonb_build_object(pg_temp.e6p('01')::text,jsonb_build_object(
  'id',current_setting('g2.red_lion')::bigint,'author_id',pg_temp.e6('01'),'body','Tonight we meet at the Red Lion')),
 '05''s card before the roll: '||(public.my_chat_overview()->'announcements')::text);
select pg_temp.g2_check((public.chat_summary(pg_temp.e6p('01'))->'pinned'->>'id')::bigint=current_setting('g2.red_lion')::bigint,
 'The announcement is not pinned in its week');
select pg_temp.g2_as(pg_temp.e6('03'));
select pg_temp.g2_check(public.my_chat_overview()->'announcements'='{}'::jsonb,'03, Going, has a card note');
reset role;
select pg_temp.g2_past(pg_temp.e6p('01'));
select pg_temp.g2_check(pg_temp.g2_roll()=1,'The roll did not roll Board game night alone');
select set_config('g2.new',pg_temp.g2_next(pg_temp.e6p('01'))::text,true);
set local role authenticated;
do $$ declare n text; begin
 foreach n in array array['05','03'] loop
  perform pg_temp.g2_as(pg_temp.e6(n));
  perform pg_temp.g2_check(public.my_chat_overview()->'announcements'='{}'::jsonb,
   'Last week''s announcement is on '||n||'''s card for the new week: '||(public.my_chat_overview()->'announcements')::text);
  perform pg_temp.g2_check(public.chat_summary(pg_temp.e6p('01'))->'pinned'='null'::jsonb,
   'Last week''s announcement is pinned for '||n||': '||(public.chat_summary(pg_temp.e6p('01'))->'pinned')::text);
 end loop;
end $$;
reset role;
update public.messages set created_at=now()-interval '61 seconds' where id=current_setting('g2.red_lion')::bigint;
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('01'));
select set_config('g2.same_table',(public.send_announcement(pg_temp.e6p('01'),'Same table, same time','everyone',gen_random_uuid())->>'id'),true);
select set_config('g2.picnic',(public.send_announcement(pg_temp.e6p('05'),'Bring a blanket','everyone',gen_random_uuid())->>'id'),true);
do $$ declare n text; begin
 foreach n in array array['05','03'] loop
  perform pg_temp.g2_as(pg_temp.e6(n));
  perform pg_temp.g2_check(public.my_chat_overview()->'announcements'->current_setting('g2.new')=jsonb_build_object(
    'id',current_setting('g2.same_table')::bigint,'author_id',pg_temp.e6('01'),'body','Same table, same time')
    and (public.chat_summary(pg_temp.e6p('01'))->'pinned'->>'id')::bigint=current_setting('g2.same_table')::bigint,
   'This week''s announcement is not on '||n||'''s card, or not pinned: '||(public.my_chat_overview()->'announcements')::text);
 end loop;
 perform pg_temp.g2_as(pg_temp.e6('05'));
 perform pg_temp.g2_check((public.my_chat_overview()->'announcements'->(pg_temp.e6p('05')::text)->>'id')::bigint=current_setting('g2.picnic')::bigint,
  'The Picnic''s announcement is not on 05''s card');
end $$;
reset role;
rollback;

-- 2j and 2k. G-S4 through a real account deletion (the final review's M-5), only where the deletion lifecycle exists
-- (full mode: it is local-only). Each in its own transaction, as the deletion's flag lasts to its end.
select pg_catalog.to_regprocedure('private.request_account_deletion(uuid,uuid,uuid,text)') is not null as g2_deletion \gset
\if :g2_deletion
-- 2j. The owner goes. 01 deletes their account: the deletion's plan loop cancels every future resbite of 01's, under
-- its flag (no line), and Board game night keeps its repeat. The group has stopped, its owner unable to use the app
-- (G-S4): the summary, as 03, says stopped and cancelled, the chat closes 48 hours after this occurrence's end and is
-- open until then (the final review's M-1, parked for the account-deletion lifecycle), and no line is written. The
-- roll, run as the next cron run would (the flag empty), skips it and writes no stop time while the chat is open.
begin;
select pg_temp.e6_cast();
insert into auth.sessions(id,user_id,created_at) values ('e6300000-0000-4000-8000-000000000001',pg_temp.e6('01'),now());
select private.request_account_deletion(pg_temp.e6('01'),'e6300000-0000-4000-8000-000000000001','e6400000-0000-4000-8000-000000000001',repeat('a',64));
do $$ declare s jsonb; p public.plans; begin
 select * into p from public.plans where id=pg_temp.e6p('01');
 perform pg_temp.g2_check(p.status='cancelled' and p.repeat_weeks=1,'The deletion did not cancel Board game night, or ended its repeat');
 perform pg_temp.g2_as(pg_temp.e6('03'));
 s := public.chat_summary(pg_temp.e6p('01'));
 perform pg_temp.g2_check(s @> '{"is_group":true,"stopped":true,"status":"cancelled","open":true}'
   and (s->>'closes_at')::timestamptz=p.ends_at+interval '48 hours','The summary after the owner''s deletion: '||s::text);
 perform pg_temp.g2_check(pg_temp.g2_ulines(pg_temp.e6p('01'))='' and (select stopped_at from public.chats where series_id=pg_temp.e6p('01')) is null,
  'The owner''s deletion wrote a line or a stop time: '||pg_temp.g2_ulines(pg_temp.e6p('01')));
end $$;
select set_config('request.jwt.claims','',true);
select set_config('resbite.system','',true);
select pg_temp.g2_check(pg_temp.g2_roll()=0,'The roll rolled a group whose owner is being deleted');
select pg_temp.g2_check(pg_temp.g2_next(pg_temp.e6p('01')) is null and (select stopped_at from public.chats where series_id=pg_temp.e6p('01')) is null
 and private.chat_open(pg_temp.e6p('01')),'The roll changed the owner''s open group');
rollback;

-- 2k. A member goes. 03 writes in Board game night's chat and says Can't go there (a line naming 03), then deletes their
-- account: the message reads deleted with no author and no words, the line stays as written (K-S3), 03 is out of the
-- group (the deletion takes the guest rows), and the group runs on: not stopped, no close time, open, five people (01,
-- 02, 04, 05, 06). No line is written.
begin;
select pg_temp.e6_cast();
set local role authenticated;
select pg_temp.g2_as(pg_temp.e6('03'));
select set_config('g2.m03',pg_temp.g2_send(pg_temp.e6p('01'),'Count me in for Catan')::text,true);
select pg_temp.g2_respond(pg_temp.e6p('01'),'declined');
reset role;
insert into auth.sessions(id,user_id,created_at) values ('e6300000-0000-4000-8000-000000000003',pg_temp.e6('03'),now());
select private.request_account_deletion(pg_temp.e6('03'),'e6300000-0000-4000-8000-000000000003','e6400000-0000-4000-8000-000000000003',repeat('b',64));
do $$ declare s jsonb; begin
 perform pg_temp.g2_check((select (state,author_id,body) from public.messages where id=current_setting('g2.m03')::bigint)
   is not distinct from ('deleted'::text,null::uuid,null::text),'03''s message kept its author or words');
 perform pg_temp.g2_check(pg_temp.g2_ulines(pg_temp.e6p('01'))='cant_go:03:sent','The lines after 03''s deletion: '||pg_temp.g2_ulines(pg_temp.e6p('01')));
 perform pg_temp.g2_check(not private.chat_member(pg_temp.e6p('01'),pg_temp.e6('03'))
   and not exists(select 1 from public.attendees where user_id=pg_temp.e6('03')),'03, deleted, is still in the group');
 perform pg_temp.g2_as(pg_temp.e6('01'));
 s := public.chat_summary(pg_temp.e6p('01'));
 perform pg_temp.g2_check(s @> '{"stopped":false,"open":true,"closes_at":null,"members":5}','The summary after a member''s deletion: '||s::text);
end $$;
rollback;
\endif
