-- Chat groups (docs/superpowers/plans/2026-11-11-chat-2-groups.md, Tasks 1 and 2; docs/superpowers/specs/2026-11-10-groups-and-chat-design.md,
-- CH-P1, CH-P15, CH-P20, with the rulings G-S1, G-S4, G-S5, G-B7 and the plan's Decisions 1, 2, 6 and 12): a repeating
-- resbite's chat is a group. Slice 1 (Task 1): the group flag, who is in a group's chat, when it closes, the summary and
-- the leave record. Synthetic identities only: emails g2-…@resbite-test.invalid, ids with the prefix e6, no phone numbers.
--
-- One transaction per block, each begin … rollback, as connections.sql does: slice 1 is one block. Each block starts
-- from the same cast, made by pg_temp.e6_cast(). Times, rows and flags set by hand sit between
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

-- Brunch (G-N8): a one-off with a message made weekly is a group, with one line, made_group {actor 01}. Walk, with no
-- messages, made weekly: a group, and no line. Then Walk under the roll's flag: its repeat off, then on again, by hand.
-- The stop time is still written and cleared, and no line (Global Constraints).
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
 perform pg_temp.g2_check(pg_temp.g2_lines(pg_temp.e6p('07'))='','Walk''s lines: '||pg_temp.g2_lines(pg_temp.e6p('07')));
 perform pg_temp.g2_check(not exists(select 1 from public.chats where series_id in (pg_temp.e6p('06'),pg_temp.e6p('07')) and stopped_at is not null),
  'Brunch or Walk is stopped');
 perform set_config('resbite.system','roll',true);
 update public.plans set repeat_weeks=null where id=pg_temp.e6p('07');
 perform pg_temp.g2_check((select stopped_at from public.chats where series_id=pg_temp.e6p('07'))=now(),'The stop under the flag wrote no stop time');
 update public.plans set repeat_weeks=1 where id=pg_temp.e6p('07');
 perform set_config('resbite.system','',true);
 perform pg_temp.g2_check((select stopped_at from public.chats where series_id=pg_temp.e6p('07')) is null,'The resume under the flag left the stop time');
 perform pg_temp.g2_check(pg_temp.g2_lines(pg_temp.e6p('07'))='','Walk''s lines under the flag: '||pg_temp.g2_lines(pg_temp.e6p('07')));
end $$;

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
-- the same close. 01's roster row comes back, and Board game night runs again.
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
