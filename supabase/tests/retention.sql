-- Retention and team tools (20261117130000_retention_and_team_tools.sql, App Store readiness plan 6; spec C3, C4 and
-- C6). Slice 1 (Task 1): the legal hold and the suspension history are closed to every API role, as are the four hold
-- and retention helpers; a hold names one account or one series, with a listed reason; series_under_hold reaches what a
-- held person hosted, joined, wrote in, was removed from, left, asked to join, or sent, brought or answered an
-- invitation by number to; series_end is null while the roll can still add an occurrence, else the
-- current occurrence's end. Slice 2 (Task 2): each row purge takes what is due and nothing else, skips what a hold
-- keeps (a closed report on a series under hold too), takes it at the next run once the hold is lifted, and stops at
-- its limit; run_retention runs the eight and answers their counts, a failing one as null. Slice 3 (Task 3): a
-- one-off's chat empties 90 days after it closed and a group's messages go at 12 months, with the chat's figures right
-- after; a series goes whole 12 months after it ends, never while a group still rolls; a web-only account idle for 12
-- months is queued for deletion, with or without a profile, unless a series it is part of is under hold; an Auth user
-- that confirmed nothing goes at 30 days; a number given at Add your number and never confirmed is cleared 30 days
-- after its code went; a hold keeps each, and the next run after its lift takes it; run_retention answers thirteen
-- keys. Slice 4 (Task 4): the do-not-invite list is closed to every API role; inviting needs no key while the
-- list is empty; object-number.sql lists a number by its keyed hash (the key made in Vault by the first objection),
-- deletes its invitations and removal records but what a hold keeps, and is safe to run twice; a listed number reads
-- 'unavailable' where it would have taken the link path, and stores nothing, while a Resbite user with it is still
-- invited in the app; withdraw-objection.sql takes it off. Slice 5 (Task 5): the photo and cover worker RPCs are
-- service_role's alone and the removal helpers nobody's; an unattached cover waits 7 days observed, is retired, and
-- can't be attached again; a held owner's cover, or one in a held series' folder, is never observed, and a hold set
-- after a claim makes prepare answer held; retire_plan_cover_now and remove_resbite_content queue a cover at once,
-- once however many occurrences shared it, but keep it under a hold; remove_profile_photo does the same for a photo.
-- Synthetic identities only: ids a6000000-0000-4000-8000-0000000000NN through pg_temp.a6(text), users 01 to 49 and
-- plans 51 to 99 (each plan its own series unless it says otherwise), and slice 3's hold twins b1 to b4; emails
-- r6-NN@resbite-test.invalid; numbers 4477009006NN (an account's NN is its user number; the numbers of people not on
-- Resbite are 81 to 89, slice 1's 94 and 95, and slice 4's 91 to 93; slice 3's numbers given and never confirmed are
-- 96 to 98). One rolled-back block.
-- Users a6…: 01 Hana, held, then lifted (slice 1), hosts slice 2's resbites; 02 Ola, hosts the one-off 52; 03 Gus, a
-- guest on 52; 04 Wen, wrote in 52's chat; 05 Rob, hosts the series the series_end checks read, held in slice 2 while
-- the invitations are purged, then lifted; 06 Ana, 07 Ben; 08 Cal, leaving (deletion asked); 09 Ivo, held through
-- slice 2, lifted before the last run, hosts 91. Slice 1 also, each held, then lifted: 31 Abe, removed from 52; 32 Bea,
-- who left 52; 33 Cy, who asked to join 52; 34 Dot, who answered an invitation by number to 52; 35 Eli, who sent one;
-- 36 Fay, who brought one. Slice 3: Ben and Gus held, then lifted before the last run; web accounts 10 Pia,
-- 11 Raj, 12 Sol, 13 Tom, 14 Uma (held), 15 Val, 16 Wes, 17 Xia, 18 Yan; Auth users with no profile 20 to 24 (24 held),
-- and 45, with a confirmed number and no profile, made 13 months ago. Numbers given at Add your number: Wen's (sent 31
-- days ago), Tom's (29 days ago) and held Uma's (31 days ago). The hold twins, held to the end: 37 Gil, whom Hana
-- removed from b1; 38 Hob, whose request to join b2 was declined; 39 Ike, who left b3. Web accounts tied to b4 only,
-- which a hold names, each made 13 months ago: 40 Jen, a guest; 41 Kim, who wrote in its chat; 42 Len, removed from it;
-- 43 Mia, who asked to join it; 44 Ned, who answered an invitation by number to it.
-- Slice 4: 25 Kai, on Resbite and in the app, whose number is listed. Slice 5: 26 Ida, hosts covers; 27 Jon, held;
-- 28 Lea, held after her cover's claim; 29 Max, whose photo is removed; 30 Nia, held, whose photo is removed.
-- Series a6…: 51 named by a hold (no plan: a hold names a series id); 52 Ola's one-off tomorrow; 53 a one-off that
-- ended 2 days ago; 54 a weekly running now; 55 a weekly whose current occurrence (56, repeating from 55) stopped
-- repeating and ended 3 days ago; 57 a weekly that ended 3 days ago, stopped, its chat closed; 58 a weekly that ended 3
-- days ago, not stopped, which the roll has yet to carry.
-- Slice 2's, all Hana's but 91: 60 a one-off in 2 days; 61 a one-off that ended 31 days ago; 62 one that ended 29 days
-- ago; 63 one that ended 31 days ago, named by a hold; 64 one that ended 31 days ago; 65 one that ended 29 days ago; 66
-- a weekly whose current occurrence (67) stopped repeating and ended 60 days ago; 68 the same (69) ended 91 days ago;
-- 71 a weekly that began 200 days ago and still rolls (72 is next week's); 96 a series with no plan left; 59 and 70
-- one-offs that ended 31 days ago, the first with Rob's invitations by number, the second with Ivo's removal record, so
-- that while either is held only his own series is under hold; 91 Ivo's one-off that ended 31 days ago.
-- Slice 3's: 73 to 75 one-offs whose chats closed 91, 89 and 91 days ago; 76 a weekly that began 13 months ago and
-- still rolls (77 is next week's); 78 to 83 resbites that ended 13 or 11 months ago (each says which); 84 a weekly
-- whose only occurrence ended 13 months ago, still rolling; 85 a weekly whose current occurrence (86, repeating from
-- 85) stopped repeating and ended 13 months ago. The hold twins, all Hana's: b1 a one-off whose chat closed 91 days
-- ago, with Ana's message; b2 a one-off that ended 13 months ago; b3 a weekly that stopped and ended 13 months ago, its
-- chat closed; b4 a one-off that ended 13 months ago, named by a hold, with Kim's message. Slice 4's: 87 Hana's one-off
-- in 4 days; 88 Rob's one-off in 5 days, named by a hold. Slice 5's: 89 Ida's weekly, which ended 6 days ago, and 90
-- its next occurrence, sharing its cover; 92 Lea's one-off
-- in 6 days, named by a hold after her cover's claim; 93 Ida's one-off in 7 days, named by a hold; 94 and 97 Lea's and
-- Jon's resbites that are gone (no plan: only their cover folders are left); 98 no resbite at all.
begin;
-- A check that must hold: raises p_what when p_ok is not true (false or null).
create function pg_temp.r6_check(p_ok boolean, p_what text) returns void language plpgsql as $$
begin
 if p_ok is not true then raise exception '%', p_what; end if;
end $$;
-- A statement that must be refused with exactly this code, whatever its message (a table's check). chat-safety.sql's
-- s3_refused_state.
create function pg_temp.r6_refused(p_sql text, p_state text) returns void language plpgsql as $$
declare v_state text;
begin
 begin
  execute p_sql;
 exception when others then
  get stacked diagnostics v_state = returned_sqlstate;
 end;
 if v_state is distinct from p_state then raise exception 'Expected %, got %: %', p_state, v_state, p_sql; end if;
end $$;
-- An id by number.
create function pg_temp.a6(p_n text) returns uuid language sql immutable as $$ select ('a6000000-0000-4000-8000-0000000000'||p_n)::uuid $$;

-- The cast, seeded under the roll's flag, so seeding writes no chat line (chat-groups.sql's e6_cast).
select set_config('resbite.system','roll',true);
insert into auth.users(id,phone,phone_confirmed_at) values
 (pg_temp.a6('01'),'447700900601',now()),(pg_temp.a6('02'),'447700900602',now()),(pg_temp.a6('05'),'447700900605',now());
insert into auth.users(id,email,email_confirmed_at) values
 (pg_temp.a6('03'),'r6-03@resbite-test.invalid',now()),(pg_temp.a6('04'),'r6-04@resbite-test.invalid',now());
insert into public.profiles(id,display_name) values
 (pg_temp.a6('01'),'Hana'),(pg_temp.a6('02'),'Ola'),(pg_temp.a6('03'),'Gus'),(pg_temp.a6('04'),'Wen'),(pg_temp.a6('05'),'Rob');
insert into public.plans(id,owner_id,title,starts_at,ends_at,time_zone,place_label,categories,repeat_weeks) values
 (pg_temp.a6('52'),pg_temp.a6('02'),'Picnic',now()+interval '1 day',now()+interval '1 day 2 hours','UTC','Park',array['community'],null),
 (pg_temp.a6('53'),pg_temp.a6('05'),'Quiz',now()-interval '2 days 2 hours',now()-interval '2 days','UTC','Pub',array['community'],null),
 (pg_temp.a6('54'),pg_temp.a6('05'),'Walk',now()-interval '1 hour',now()+interval '1 hour','UTC','Hill',array['community'],1),
 (pg_temp.a6('55'),pg_temp.a6('05'),'Swim',now()-interval '10 days 2 hours',now()-interval '10 days','UTC','Pool',array['physical'],1),
 (pg_temp.a6('57'),pg_temp.a6('05'),'Choir',now()-interval '3 days 2 hours',now()-interval '3 days','UTC','Hall',array['creative'],1),
 (pg_temp.a6('58'),pg_temp.a6('05'),'Chess',now()-interval '3 days 2 hours',now()-interval '3 days','UTC','Cafe',array['intellectual'],1);
-- 56 is 55's next occurrence, which stopped repeating.
insert into public.plans(id,owner_id,title,starts_at,ends_at,time_zone,place_label,categories,repeat_weeks,series_id,repeats_from) values
 (pg_temp.a6('56'),pg_temp.a6('05'),'Swim',now()-interval '3 days 2 hours',now()-interval '3 days','UTC','Pool',array['physical'],null,
  pg_temp.a6('55'),pg_temp.a6('55'));
-- 57's group stopped with its occurrence (Edit's stop time, or an owner who left), so its chat closed a day ago.
update public.chats set stopped_at=now()-interval '3 days' where series_id=pg_temp.a6('57');
insert into public.attendees(plan_id,user_id,response) values (pg_temp.a6('52'),pg_temp.a6('03'),'accepted');
insert into public.messages(series_id,plan_id,author_id,kind,body) values (pg_temp.a6('52'),pg_temp.a6('52'),pg_temp.a6('04'),'message','Wen here');
-- 52's other ties, each an account's only one: Abe (31) was removed from it, Bea (32) left it, Cy (33) asked to join
-- it, Dot (34) answered an invitation by number to it, Eli (35) sent one to 94 and Fay (36) brought one to 95.
insert into auth.users(id,phone,phone_confirmed_at)
 select pg_temp.a6(n),'4477009006'||n,now() from unnest(array['31','32','33','34','35','36']) n;
insert into public.profiles(id,display_name) values (pg_temp.a6('31'),'Abe'),(pg_temp.a6('32'),'Bea'),(pg_temp.a6('33'),'Cy'),
 (pg_temp.a6('34'),'Dot'),(pg_temp.a6('35'),'Eli'),(pg_temp.a6('36'),'Fay');
insert into private.plan_removals(series_id,user_id) values (pg_temp.a6('52'),pg_temp.a6('31'));
insert into private.series_leaves(series_id,user_id) values (pg_temp.a6('52'),pg_temp.a6('32'));
insert into private.join_requests(plan_id,user_id,response) values (pg_temp.a6('52'),pg_temp.a6('33'),'accepted');
insert into private.phone_invitations(plan_id,phone,country,invited_by,brought_by,user_id,answered_at) values
 (pg_temp.a6('52'),'447700900634','44',pg_temp.a6('02'),null,pg_temp.a6('34'),now()),
 (pg_temp.a6('52'),'447700900694','44',pg_temp.a6('35'),null,null,null),
 (pg_temp.a6('52'),'447700900695','44',pg_temp.a6('02'),pg_temp.a6('36'),null,null);
select set_config('resbite.system','',true);

-- Slice 1 (Task 1): the legal hold and the retention helpers.

-- holds_locked: no API role may touch either table or call any of the five helpers; row security is on.
do $$ declare r text; f text;
begin
 foreach r in array array['anon','authenticated','service_role'] loop
  perform pg_temp.r6_check(not has_table_privilege(r,'private.legal_holds','select,insert,update,delete')
   and not has_table_privilege(r,'private.suspension_history','select,insert,update,delete'), 'holds_locked: '||r||' may touch a hold table');
  foreach f in array array['private.account_held(uuid)','private.series_held(uuid)','private.series_under_hold(uuid)',
   'private.account_in_held_series(uuid)','private.series_end(uuid)'] loop
   perform pg_temp.r6_check(not has_function_privilege(r,f,'execute'), 'holds_locked: '||r||' may execute '||f);
  end loop;
 end loop;
 perform pg_temp.r6_check(not exists(select 1 from pg_catalog.pg_class c
   where c.oid in ('private.legal_holds'::regclass,'private.suspension_history'::regclass) and not c.relrowsecurity),
  'holds_locked: row security is off on a hold table');
end $$;

-- holds_shared: plan 2's migration runs first and made the shared three, which this file found in place; this file
-- made series_held and the three helpers. Each helper is SQL, stable, security definer, with an empty search path.
do $$ declare f text; v pg_catalog.pg_proc;
begin
 perform pg_temp.r6_check(pg_catalog.obj_description('private.legal_holds'::regclass,'pg_class') = 'resbite 20261117110000'
  and pg_catalog.obj_description('private.suspension_history'::regclass,'pg_class') = 'resbite 20261117110000'
  and pg_catalog.obj_description('private.account_held(uuid)'::regprocedure,'pg_proc') = 'resbite 20261117110000',
  'holds_shared: a shared object does not carry plan 2''s marker');
 foreach f in array array['private.series_held(uuid)','private.series_under_hold(uuid)','private.account_in_held_series(uuid)',
  'private.series_end(uuid)'] loop
  perform pg_temp.r6_check(pg_catalog.obj_description(f::regprocedure,'pg_proc') = 'resbite 20261117130000',
   'holds_shared: '||f||' does not carry this file''s marker');
 end loop;
 foreach f in array array['private.account_held(uuid)','private.series_held(uuid)','private.series_under_hold(uuid)',
  'private.account_in_held_series(uuid)','private.series_end(uuid)'] loop
  select * into v from pg_catalog.pg_proc p where p.oid = f::regprocedure;
  perform pg_temp.r6_check(v.prosecdef and v.provolatile = 's' and v.proconfig = array['search_path=""']
   and v.prolang = (select l.oid from pg_catalog.pg_language l where l.lanname = 'sql'),
   'holds_shared: '||f||' is not sql stable security definer with an empty search path');
 end loop;
end $$;

-- hold_scope: a hold names one account or one series, with a listed reason, until it is lifted.
insert into private.legal_holds(user_id,reason,case_ref,review_on) values (pg_temp.a6('01'),'police','LE-2026-001',current_date+90);
select pg_temp.r6_check(private.account_held(pg_temp.a6('01')) and not private.account_held(pg_temp.a6('02'))
 and not private.account_held(null), 'hold_scope: account hold');
select pg_temp.r6_check(not private.series_held(pg_temp.a6('01')), 'hold_scope: an account hold reads as a series hold');
update private.legal_holds set lifted_at=now() where user_id=pg_temp.a6('01') and lifted_at is null;
select pg_temp.r6_check(not private.account_held(pg_temp.a6('01')), 'hold_scope: a lifted hold still holds');
insert into private.legal_holds(series_id,reason,case_ref,review_on) values (pg_temp.a6('51'),'court','CT-2026-001',current_date+90);
select pg_temp.r6_check(private.series_held(pg_temp.a6('51')) and not private.series_held(pg_temp.a6('52'))
 and not private.series_held(null), 'hold_scope: series hold');
select pg_temp.r6_check(not private.account_held(pg_temp.a6('51')), 'hold_scope: a series hold reads as an account hold');
select pg_temp.r6_refused($$insert into private.legal_holds(user_id,series_id,reason,case_ref,review_on)
 values (pg_temp.a6('02'),pg_temp.a6('52'),'police','LE-2026-002',current_date+90)$$,'23514');
select pg_temp.r6_refused($$insert into private.legal_holds(reason,case_ref,review_on) values ('police','LE-2026-003',current_date+90)$$,'23514');
select pg_temp.r6_refused($$insert into private.legal_holds(user_id,reason,case_ref,review_on)
 values (pg_temp.a6('02'),'other','LE-2026-004',current_date+90)$$,'23514');

-- series_under_hold_reaches_context: 52 is under hold when a hold names it, or names its host (02), its guest (03) or
-- someone who wrote in its chat (04); a hold on one of them reaches no other series.
select pg_temp.r6_check(private.series_under_hold(pg_temp.a6('52')) is false, 'series_under_hold: 52 under hold with no hold on it');
select pg_temp.r6_check(private.series_under_hold(pg_temp.a6('51')), 'series_under_hold: a held series is not under hold');
insert into private.legal_holds(user_id,reason,case_ref,review_on) values (pg_temp.a6('03'),'nca','NCA-2026-001',current_date+90);
select pg_temp.r6_check(private.series_under_hold(pg_temp.a6('52')), 'series_under_hold: a held guest does not hold 52');
select pg_temp.r6_check(not private.series_under_hold(pg_temp.a6('53')), 'series_under_hold: a held guest of 52 holds 53');
update private.legal_holds set lifted_at=now() where user_id=pg_temp.a6('03') and lifted_at is null;
select pg_temp.r6_check(not private.series_under_hold(pg_temp.a6('52')), 'series_under_hold: a lifted guest hold still holds 52');
insert into private.legal_holds(user_id,reason,case_ref,review_on) values (pg_temp.a6('04'),'threat','TH-2026-001',current_date+90);
select pg_temp.r6_check(private.series_under_hold(pg_temp.a6('52')), 'series_under_hold: a held writer does not hold 52');
update private.legal_holds set lifted_at=now() where user_id=pg_temp.a6('04') and lifted_at is null;
insert into private.legal_holds(user_id,reason,case_ref,review_on) values (pg_temp.a6('02'),'ofcom','OF-2026-001',current_date+90);
select pg_temp.r6_check(private.series_under_hold(pg_temp.a6('52')), 'series_under_hold: a held host does not hold 52');
update private.legal_holds set lifted_at=now() where user_id=pg_temp.a6('02') and lifted_at is null;
select pg_temp.r6_check(not private.series_under_hold(pg_temp.a6('52')), 'series_under_hold: 52 under hold once every hold is lifted');
insert into private.legal_holds(series_id,reason,case_ref,review_on) values (pg_temp.a6('52'),'claim','CL-2026-001',current_date+90);
select pg_temp.r6_check(private.series_under_hold(pg_temp.a6('52')), 'series_under_hold: a hold on 52 does not hold 52');
update private.legal_holds set lifted_at=now() where series_id=pg_temp.a6('52') and lifted_at is null;
-- And when a hold names someone removed from 52, who left it, who asked to join it, or who answered, sent or brought an
-- invitation by number to it (the review's retention #0): each of those holds 52 and no other series, until lifted.
do $$ declare v_n text; v_who text;
begin
 for v_n, v_who in values ('31','removed from 52'),('32','who left 52'),('33','who asked to join 52'),
  ('34','who answered an invitation by number to 52'),('35','who sent one to 52'),('36','who brought one to 52') loop
  insert into private.legal_holds(user_id,reason,case_ref,review_on) values (pg_temp.a6(v_n),'police','LE-2026-0'||v_n,current_date+90);
  perform pg_temp.r6_check(private.series_under_hold(pg_temp.a6('52')), 'series_under_hold: a held account '||v_who||' does not hold 52');
  perform pg_temp.r6_check(not private.series_under_hold(pg_temp.a6('53')), 'series_under_hold: a held account '||v_who||' holds 53');
  update private.legal_holds set lifted_at=now() where user_id=pg_temp.a6(v_n) and lifted_at is null;
  perform pg_temp.r6_check(not private.series_under_hold(pg_temp.a6('52')),
   'series_under_hold: a lifted hold on an account '||v_who||' still holds 52');
 end loop;
end $$;
select pg_temp.r6_check(private.series_under_hold(null) is false, 'series_under_hold: null is not false');

-- series_end (Decision 3): null while the roll can still add an occurrence, else the current occurrence's end.
select pg_temp.r6_check(private.user_eligible(pg_temp.a6('05')), 'series_end: fixture: Rob may not use the app');
select pg_temp.r6_check(private.series_end(pg_temp.a6('53')) = (select ends_at from public.plans where id=pg_temp.a6('53')),
 'series_end: an ended one-off does not end at its end');
select pg_temp.r6_check(private.series_end(pg_temp.a6('54')) is null, 'series_end: a running weekly has an end');
select pg_temp.r6_check(private.series_end(pg_temp.a6('55')) = (select ends_at from public.plans where id=pg_temp.a6('56')),
 'series_end: a weekly that stopped repeating does not end at its current occurrence''s end');
select pg_temp.r6_check(private.series_end(pg_temp.a6('57')) = (select ends_at from public.plans where id=pg_temp.a6('57')),
 'series_end: a stopped weekly with its chat closed does not end at its end');
select pg_temp.r6_check(private.series_end(pg_temp.a6('58')) is null, 'series_end: a weekly the roll has yet to carry has an end');
select pg_temp.r6_check(private.series_end(pg_temp.a6('99')) is null and private.series_end(null) is null,
 'series_end: a series with no plan has an end');

-- Slice 2 (Task 2): the row purges and the daily run.

-- The cast and the records, seeded under the roll's flag. Rob and Ivo are held, and so is series 63; Cal is leaving.
select set_config('resbite.system','roll',true);
insert into auth.users(id,phone,phone_confirmed_at) values
 (pg_temp.a6('06'),'447700900606',now()),(pg_temp.a6('07'),'447700900607',now()),
 (pg_temp.a6('08'),'447700900608',now()),(pg_temp.a6('09'),'447700900609',now());
insert into public.profiles(id,display_name) values
 (pg_temp.a6('06'),'Ana'),(pg_temp.a6('07'),'Ben'),(pg_temp.a6('08'),'Cal'),(pg_temp.a6('09'),'Ivo');
insert into public.plans(id,owner_id,title,starts_at,ends_at,time_zone,place_label,categories,repeat_weeks) values
 (pg_temp.a6('60'),pg_temp.a6('01'),'Brunch',now()+interval '2 days',now()+interval '2 days 2 hours','UTC','Cafe',array['community'],null),
 (pg_temp.a6('61'),pg_temp.a6('01'),'Film',now()-interval '31 days 2 hours',now()-interval '31 days','UTC','Cinema',array['creative'],null),
 (pg_temp.a6('62'),pg_temp.a6('01'),'Bake',now()-interval '29 days 2 hours',now()-interval '29 days','UTC','Kitchen',array['creative'],null),
 (pg_temp.a6('63'),pg_temp.a6('01'),'Yoga',now()-interval '31 days 2 hours',now()-interval '31 days','UTC','Studio',array['physical'],null),
 (pg_temp.a6('64'),pg_temp.a6('01'),'Darts',now()-interval '31 days 2 hours',now()-interval '31 days','UTC','Pub',array['community'],null),
 (pg_temp.a6('65'),pg_temp.a6('01'),'Bowls',now()-interval '29 days 2 hours',now()-interval '29 days','UTC','Green',array['physical'],null),
 (pg_temp.a6('66'),pg_temp.a6('01'),'Run',now()-interval '67 days 2 hours',now()-interval '67 days','UTC','Track',array['physical'],1),
 (pg_temp.a6('68'),pg_temp.a6('01'),'Row',now()-interval '98 days 2 hours',now()-interval '98 days','UTC','River',array['physical'],1),
 (pg_temp.a6('71'),pg_temp.a6('01'),'Knit',now()-interval '200 days 2 hours',now()-interval '200 days','UTC','Library',array['creative'],1),
 (pg_temp.a6('59'),pg_temp.a6('01'),'Cards',now()-interval '31 days 2 hours',now()-interval '31 days','UTC','Club',array['community'],null),
 (pg_temp.a6('70'),pg_temp.a6('01'),'Golf',now()-interval '31 days 2 hours',now()-interval '31 days','UTC','Course',array['physical'],null),
 (pg_temp.a6('91'),pg_temp.a6('09'),'Poker',now()-interval '31 days 2 hours',now()-interval '31 days','UTC','Den',array['community'],null);
-- 67 and 69 stopped repeating; 72 is 71's next occurrence, still repeating.
insert into public.plans(id,owner_id,title,starts_at,ends_at,time_zone,place_label,categories,repeat_weeks,series_id,repeats_from) values
 (pg_temp.a6('67'),pg_temp.a6('01'),'Run',now()-interval '60 days 2 hours',now()-interval '60 days','UTC','Track',array['physical'],null,
  pg_temp.a6('66'),pg_temp.a6('66')),
 (pg_temp.a6('69'),pg_temp.a6('01'),'Row',now()-interval '91 days 2 hours',now()-interval '91 days','UTC','River',array['physical'],null,
  pg_temp.a6('68'),pg_temp.a6('68')),
 (pg_temp.a6('72'),pg_temp.a6('01'),'Knit',now()+interval '3 days',now()+interval '3 days 2 hours','UTC','Library',array['creative'],1,
  pg_temp.a6('71'),pg_temp.a6('71'));
insert into public.attendees(plan_id,user_id,response) values
 (pg_temp.a6('60'),pg_temp.a6('06'),'pending'),(pg_temp.a6('60'),pg_temp.a6('07'),'accepted');
update public.profiles set deletion_requested_at=now() where id=pg_temp.a6('08');
insert into private.legal_holds(user_id,reason,case_ref,review_on) values
 (pg_temp.a6('05'),'police','LE-2026-005',current_date+90),(pg_temp.a6('09'),'claim','CL-2026-009',current_date+90);
insert into private.legal_holds(series_id,reason,case_ref,review_on) values (pg_temp.a6('63'),'court','CT-2026-063',current_date+90);
-- Invitations by number, each number its own: 81 revoked, on a resbite still to come; 82 unanswered, on 61, 31 days
-- after; 83 answered, 29 days after; 84 sent by Rob, 85 brought by Rob, 86 answered by Rob, each on 59, 31 days after
-- (so while Rob is held, 59 is under hold and 61 is not); 87 on the held series 63; 88 unanswered, 29 days after.
insert into private.phone_invitations(plan_id,phone,country,invited_by,brought_by,user_id,answered_at,revoked_at) values
 (pg_temp.a6('60'),'447700900681','44',pg_temp.a6('01'),null,null,null,now()-interval '1 day'),
 (pg_temp.a6('61'),'447700900682','44',pg_temp.a6('01'),null,null,null,null),
 (pg_temp.a6('62'),'447700900683','44',pg_temp.a6('01'),null,pg_temp.a6('06'),now()-interval '30 days',null),
 (pg_temp.a6('59'),'447700900684','44',pg_temp.a6('05'),null,null,null,null),
 (pg_temp.a6('59'),'447700900685','44',pg_temp.a6('01'),pg_temp.a6('05'),null,null,null),
 (pg_temp.a6('59'),'447700900686','44',pg_temp.a6('01'),null,pg_temp.a6('05'),now()-interval '32 days',null),
 (pg_temp.a6('63'),'447700900687','44',pg_temp.a6('01'),null,null,null,null),
 (pg_temp.a6('62'),'447700900688','44',pg_temp.a6('01'),null,null,null,null);
-- Removals: a number on the one-off 64; Ivo's own row on the one-off 70 (so while Ivo is held, 70 is under hold and 64
-- is not); numbers on 65, 66, 68, 96 (no plan), 51 (no plan, held) and 63 (held); Ana's row on the rolling 71.
insert into private.plan_removals(series_id,user_id,phone) values
 (pg_temp.a6('64'),null,'447700900681'),(pg_temp.a6('70'),pg_temp.a6('09'),null),(pg_temp.a6('65'),null,'447700900682'),
 (pg_temp.a6('66'),null,'447700900683'),(pg_temp.a6('68'),null,'447700900684'),(pg_temp.a6('71'),pg_temp.a6('06'),null),
 (pg_temp.a6('96'),null,'447700900685'),(pg_temp.a6('51'),null,'447700900686'),(pg_temp.a6('63'),null,'447700900687');
insert into private.connection_refusals(series_id,from_user,to_user,refused_at) values
 (pg_temp.a6('52'),pg_temp.a6('01'),pg_temp.a6('06'),now()-interval '13 months'),
 (pg_temp.a6('52'),pg_temp.a6('01'),pg_temp.a6('07'),now()-interval '11 months'),
 (pg_temp.a6('52'),pg_temp.a6('01'),pg_temp.a6('09'),now()-interval '13 months');
insert into public.connections(user_a,user_b,state,requested_by,series_id,created_at,accepted_at) values
 (pg_temp.a6('06'),pg_temp.a6('07'),'requested',pg_temp.a6('06'),pg_temp.a6('52'),now()-interval '91 days',null),
 (pg_temp.a6('06'),pg_temp.a6('08'),'requested',pg_temp.a6('08'),pg_temp.a6('52'),now()-interval '89 days',null),
 (pg_temp.a6('07'),pg_temp.a6('08'),'connected',pg_temp.a6('07'),pg_temp.a6('52'),now()-interval '2 years',now()-interval '2 years'),
 (pg_temp.a6('06'),pg_temp.a6('09'),'requested',pg_temp.a6('09'),pg_temp.a6('52'),now()-interval '91 days',null);
-- Notices on 60, where Ana is not answered yet and Ben is going.
insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id,detail,created_at,delivered_at) values
 (pg_temp.a6('60'),pg_temp.a6('01'),'rsvp','r6:rsvp',pg_temp.a6('06'),'accepted',now()-interval '32 days',now()-interval '31 days'),
 (pg_temp.a6('60'),pg_temp.a6('06'),'invited','r6:invited-pending',pg_temp.a6('01'),null,now()-interval '31 days',null),
 (pg_temp.a6('60'),pg_temp.a6('07'),'invited','r6:invited-accepted',pg_temp.a6('01'),null,now()-interval '31 days',null),
 (pg_temp.a6('60'),pg_temp.a6('09'),'plan_changed','r6:held-recipient',pg_temp.a6('01'),null,now()-interval '31 days',null),
 (pg_temp.a6('60'),pg_temp.a6('01'),'rsvp','r6:held-actor',pg_temp.a6('09'),null,now()-interval '31 days',null),
 (pg_temp.a6('60'),pg_temp.a6('01'),'rsvp','r6:late',pg_temp.a6('07'),null,now()-interval '40 days',now()-interval '29 days');
insert into private.notification_deliveries(outbox_id,token,endpoint_updated_at)
 select id,'ExpoPushToken[r6rsvp]',now()-interval '32 days' from private.notification_outbox where dedupe_key='r6:rsvp';
insert into private.plan_links(plan_id,code) values (pg_temp.a6('60'),'r6LinkCodeAAAAAAAAAAAA');
insert into private.link_opens(plan_link_id,opened_at)
 select l.id,t from private.plan_links l, unnest(array[now()-interval '13 months',now()-interval '11 months']) t where l.plan_id=pg_temp.a6('60');
-- Reports, tagged by details: A closed 181 days ago; B closed 179 days ago; C open for 2 years; D closed 181 days ago,
-- about Ivo; E closed 10 days ago, about leaving Cal's words; F closed 181 days ago, on the held series 63; G closed 10
-- days ago, about Cal's words, filed by Ivo; I closed 181 days ago, and J closed 10 days ago about leaving Cal's words,
-- both between other people on 91, which held Ivo hosts (the review's retention #2).
insert into private.reports(reporter_id,target_user_id,series_id,plan_id,about,reason,details,frozen_body,frozen_author,created_at,status,reviewed_at) values
 (pg_temp.a6('06'),pg_temp.a6('07'),null,null,'user','spam','r6-A',null,null,now()-interval '200 days','reviewed',now()-interval '181 days'),
 (pg_temp.a6('06'),pg_temp.a6('07'),null,null,'user','spam','r6-B',null,null,now()-interval '200 days','actioned',now()-interval '179 days'),
 (pg_temp.a6('07'),pg_temp.a6('06'),null,null,'user','harassment','r6-C',null,null,now()-interval '2 years','open',null),
 (pg_temp.a6('06'),pg_temp.a6('09'),null,null,'user','spam','r6-D',null,null,now()-interval '200 days','reviewed',now()-interval '181 days'),
 (pg_temp.a6('06'),pg_temp.a6('08'),pg_temp.a6('52'),pg_temp.a6('52'),'message','inappropriate','r6-E','Cal wrote this',pg_temp.a6('08'),
  now()-interval '20 days','reviewed',now()-interval '10 days'),
 (pg_temp.a6('06'),pg_temp.a6('07'),pg_temp.a6('63'),pg_temp.a6('63'),'user','spam','r6-F',null,null,now()-interval '200 days','reviewed',
  now()-interval '181 days'),
 (pg_temp.a6('09'),pg_temp.a6('08'),pg_temp.a6('52'),pg_temp.a6('52'),'message','spam','r6-G','Cal again',pg_temp.a6('08'),
  now()-interval '20 days','reviewed',now()-interval '10 days'),
 (pg_temp.a6('06'),pg_temp.a6('07'),pg_temp.a6('91'),pg_temp.a6('91'),'user','spam','r6-I',null,null,now()-interval '200 days','reviewed',
  now()-interval '181 days'),
 (pg_temp.a6('06'),pg_temp.a6('08'),pg_temp.a6('91'),pg_temp.a6('91'),'message','inappropriate','r6-J','Cal at the table',pg_temp.a6('08'),
  now()-interval '20 days','reviewed',now()-interval '10 days');
insert into private.suspension_history(user_id,report_id,suspended_at,ended_at,how) values
 (pg_temp.a6('06'),null,now()-interval '14 months',now()-interval '13 months','lifted'),
 (pg_temp.a6('07'),null,now()-interval '12 months',now()-interval '11 months','lifted'),
 (pg_temp.a6('09'),null,now()-interval '14 months',now()-interval '13 months','lifted'),
 (null,null,now()-interval '14 months',now()-interval '13 months','account_deleted');
select set_config('resbite.system','',true);

-- Whether a record is still there: an invitation by its number's ending, a removal by its series and number ending or
-- user, a notice by its key, a report by its tag.
create function pg_temp.r6_invited(p_end text) returns boolean language sql as $$
 select exists(select 1 from private.phone_invitations i where i.phone='4477009006'||p_end) $$;
create function pg_temp.r6_removal(p_series text, p_key text) returns boolean language sql as $$
 select exists(select 1 from private.plan_removals r where r.series_id=pg_temp.a6(p_series)
  and (r.phone='4477009006'||p_key or r.user_id=pg_temp.a6(p_key))) $$;
create function pg_temp.r6_notice(p_key text) returns boolean language sql as $$
 select exists(select 1 from private.notification_outbox o where o.dedupe_key='r6:'||p_key) $$;
create function pg_temp.r6_report(p_tag text) returns boolean language sql as $$
 select exists(select 1 from private.reports r where r.details='r6-'||p_tag) $$;

-- purges_locked: no API role may call any purge or the daily run; each is plpgsql, security definer, with an empty
-- search path, and this file's.
do $$ declare r text; f text; v pg_catalog.pg_proc;
begin
 foreach f in array array['private.purge_phone_invitations(integer)','private.purge_plan_removals(integer)',
  'private.purge_connection_refusals(integer)','private.purge_connection_requests(integer)','private.purge_notifications(integer)',
  'private.purge_link_opens(integer)','private.purge_closed_reports(integer)','private.purge_suspension_history(integer)',
  'private.run_retention()'] loop
  foreach r in array array['anon','authenticated','service_role'] loop
   perform pg_temp.r6_check(not has_function_privilege(r,f,'execute'), 'purges_locked: '||r||' may execute '||f);
  end loop;
  select * into v from pg_catalog.pg_proc p where p.oid = f::regprocedure;
  perform pg_temp.r6_check(v.prosecdef and v.proconfig = array['search_path=""']
   and v.prolang = (select l.oid from pg_catalog.pg_language l where l.lanname = 'plpgsql'),
   'purges_locked: '||f||' is not plpgsql security definer with an empty search path');
  perform pg_temp.r6_check(pg_catalog.obj_description(f::regprocedure,'pg_proc') = 'resbite 20261117130000',
   'purges_locked: '||f||' does not carry this file''s marker');
 end loop;
end $$;

-- phone_invitations (Decision 2): revoked, or 30 days after its resbite ends; not while a hold keeps it.
select pg_temp.r6_check(private.purge_phone_invitations() = 2, 'phone_invitations: the run did not answer 2');
select pg_temp.r6_check(not pg_temp.r6_invited('81'), 'phone_invitations: a revoked invitation stays');
select pg_temp.r6_check(not pg_temp.r6_invited('82'), 'phone_invitations: an unanswered one stays 31 days after its resbite');
select pg_temp.r6_check(pg_temp.r6_invited('83'), 'phone_invitations: an answered one goes 29 days after its resbite');
select pg_temp.r6_check(pg_temp.r6_invited('88'), 'phone_invitations: an unanswered one goes 29 days after its resbite');
select pg_temp.r6_check(pg_temp.r6_invited('84'), 'phone_invitations: one sent by held Rob goes');
select pg_temp.r6_check(pg_temp.r6_invited('85'), 'phone_invitations: one brought by held Rob goes');
select pg_temp.r6_check(pg_temp.r6_invited('86'), 'phone_invitations: one answered by held Rob goes');
select pg_temp.r6_check(pg_temp.r6_invited('87'), 'phone_invitations: one on the held series 63 goes');
-- The lift, then the next run: what the hold kept and is overdue goes.
update private.legal_holds set lifted_at=now() where user_id=pg_temp.a6('05') and lifted_at is null;
select pg_temp.r6_check(private.purge_phone_invitations() = 3, 'phone_invitations: the run after the lift did not answer 3');
select pg_temp.r6_check(not pg_temp.r6_invited('84') and not pg_temp.r6_invited('85') and not pg_temp.r6_invited('86'),
 'phone_invitations: Rob''s stay once his hold is lifted');
select pg_temp.r6_check(pg_temp.r6_invited('83') and pg_temp.r6_invited('87') and pg_temp.r6_invited('88'),
 'phone_invitations: the run after the lift took one that was not Rob''s');

-- plan_removals: 30 days after a one-off ends, 90 after any other series ends, at once when the series has no plan.
select pg_temp.r6_check(private.purge_plan_removals() = 3, 'plan_removals: the run did not answer 3');
select pg_temp.r6_check(not pg_temp.r6_removal('64','81'), 'plan_removals: a number stays 31 days after its one-off');
select pg_temp.r6_check(pg_temp.r6_removal('65','82'), 'plan_removals: a number goes 29 days after its one-off');
select pg_temp.r6_check(pg_temp.r6_removal('66','83'), 'plan_removals: a number goes 60 days after its weekly ended');
select pg_temp.r6_check(not pg_temp.r6_removal('68','84'), 'plan_removals: a number stays 91 days after its weekly ended');
select pg_temp.r6_check(pg_temp.r6_removal('71','06'), 'plan_removals: a row on a weekly still rolling goes');
select pg_temp.r6_check(not pg_temp.r6_removal('96','85'), 'plan_removals: a row on a series with no plan stays');
select pg_temp.r6_check(pg_temp.r6_removal('51','86'), 'plan_removals: a row on a held series with no plan goes');
select pg_temp.r6_check(pg_temp.r6_removal('63','87'), 'plan_removals: a row on the held series 63 goes');
select pg_temp.r6_check(pg_temp.r6_removal('70','09'), 'plan_removals: held Ivo''s row goes');

-- connection_refusals: 12 months; connection_requests: unanswered for 90 days.
select pg_temp.r6_check(private.purge_connection_refusals() = 1, 'connection_refusals: the run did not answer 1');
select pg_temp.r6_check(not exists(select 1 from private.connection_refusals where from_user=pg_temp.a6('01') and to_user=pg_temp.a6('06')),
 'connection_refusals: a refusal stays at 13 months');
select pg_temp.r6_check(exists(select 1 from private.connection_refusals where from_user=pg_temp.a6('01') and to_user=pg_temp.a6('07')),
 'connection_refusals: a refusal goes at 11 months');
select pg_temp.r6_check(exists(select 1 from private.connection_refusals where from_user=pg_temp.a6('01') and to_user=pg_temp.a6('09')),
 'connection_refusals: a refusal of held Ivo goes');
select pg_temp.r6_check(private.purge_connection_requests() = 1, 'connection_requests: the run did not answer 1');
select pg_temp.r6_check(not exists(select 1 from public.connections where user_a=pg_temp.a6('06') and user_b=pg_temp.a6('07')),
 'connection_requests: a request stays at 91 days');
select pg_temp.r6_check(exists(select 1 from public.connections where user_a=pg_temp.a6('06') and user_b=pg_temp.a6('08')),
 'connection_requests: a request goes at 89 days');
select pg_temp.r6_check(exists(select 1 from public.connections where user_a=pg_temp.a6('07') and user_b=pg_temp.a6('08') and state='connected'),
 'connection_requests: a connection made 2 years ago goes');
select pg_temp.r6_check(exists(select 1 from public.connections where user_a=pg_temp.a6('06') and user_b=pg_temp.a6('09')),
 'connection_requests: a request from held Ivo goes');

-- notifications: 30 days after sent (or made, when never sent), with their delivery rows; an invitation still pending
-- stays (DI-09).
select pg_temp.r6_check(private.purge_notifications() = 2, 'notifications: the run did not answer 2');
select pg_temp.r6_check(not pg_temp.r6_notice('rsvp'), 'notifications: an answer sent 31 days ago stays');
select pg_temp.r6_check(not exists(select 1 from private.notification_deliveries where token='ExpoPushToken[r6rsvp]'),
 'notifications: a purged notice''s delivery row stays');
select pg_temp.r6_check(pg_temp.r6_notice('invited-pending'), 'notifications: an invitation still pending goes');
select pg_temp.r6_check(not pg_temp.r6_notice('invited-accepted'), 'notifications: an invitation already answered stays');
select pg_temp.r6_check(pg_temp.r6_notice('held-recipient'), 'notifications: a notice to held Ivo goes');
select pg_temp.r6_check(pg_temp.r6_notice('held-actor'), 'notifications: a notice about held Ivo goes');
select pg_temp.r6_check(pg_temp.r6_notice('late'), 'notifications: a notice made 40 days ago but sent 29 days ago goes');

-- link_opens: 12 months; and the limit: two due opens, a limit of 1, one left.
select pg_temp.r6_check(private.purge_link_opens() = 1, 'link_opens: the run did not answer 1');
select pg_temp.r6_check((select count(*) from private.link_opens o join private.plan_links l on l.id=o.plan_link_id
  where l.plan_id=pg_temp.a6('60')) = 1
 and exists(select 1 from private.link_opens o where o.opened_at > now()-interval '12 months'),
 'link_opens: not just the open of 11 months ago is left');
insert into private.link_opens(plan_link_id,opened_at)
 select l.id,now()-interval '13 months' from private.plan_links l, generate_series(1,2) where l.plan_id=pg_temp.a6('60');
select pg_temp.r6_check(private.purge_link_opens(1) = 1, 'bounds: a limit of 1 did not answer 1');
select pg_temp.r6_check((select count(*) from private.link_opens where opened_at < now()-interval '12 months') = 1,
 'bounds: a limit of 1 did not leave one due open');

-- closed_reports: closed 180 days ago goes; a closed report about an account gone or leaving forgets who; open ones,
-- and ones a hold keeps, stay as they are.
select pg_temp.r6_check(private.purge_closed_reports() = 2, 'closed_reports: the run did not answer 2 (1 deleted, 1 cleared)');
select pg_temp.r6_check(not pg_temp.r6_report('A'), 'closed_reports: a report closed 181 days ago stays');
select pg_temp.r6_check(pg_temp.r6_report('B'), 'closed_reports: a report closed 179 days ago goes');
select pg_temp.r6_check(pg_temp.r6_report('C'), 'closed_reports: a report open for 2 years goes');
select pg_temp.r6_check(pg_temp.r6_report('D'), 'closed_reports: a report about held Ivo goes');
select pg_temp.r6_check(pg_temp.r6_report('F'), 'closed_reports: a report on the held series 63 goes');
select pg_temp.r6_check(pg_temp.r6_report('I'), 'closed_reports: a report closed 181 days ago on 91, which held Ivo hosts, goes');
select pg_temp.r6_check((select target_user_id=pg_temp.a6('08') and frozen_author=pg_temp.a6('08') from private.reports where details='r6-J'),
 'closed_reports: a closed report on 91, which held Ivo hosts, forgot whom it is about');
select pg_temp.r6_check((select target_user_id is null and frozen_author is null and frozen_body='Cal wrote this'
  from private.reports where details='r6-E'), 'closed_reports: a closed report about leaving Cal still names him, or lost its words');
select pg_temp.r6_check((select target_user_id=pg_temp.a6('08') and frozen_author=pg_temp.a6('08') from private.reports where details='r6-G'),
 'closed_reports: a report filed by held Ivo forgot whom it is about');
select pg_temp.r6_check((select target_user_id=pg_temp.a6('06') from private.reports where details='r6-C'),
 'closed_reports: an open report forgot whom it is about');

-- suspension_history: 12 months after it ended.
select pg_temp.r6_check(private.purge_suspension_history() = 2, 'suspension_history: the run did not answer 2');
select pg_temp.r6_check(not exists(select 1 from private.suspension_history where user_id=pg_temp.a6('06')),
 'suspension_history: one that ended 13 months ago stays');
select pg_temp.r6_check(not exists(select 1 from private.suspension_history where user_id is null),
 'suspension_history: a deleted account''s that ended 13 months ago stays');
select pg_temp.r6_check(exists(select 1 from private.suspension_history where user_id=pg_temp.a6('07')),
 'suspension_history: one that ended 11 months ago goes');
select pg_temp.r6_check(exists(select 1 from private.suspension_history where user_id=pg_temp.a6('09')),
 'suspension_history: held Ivo''s goes');

-- run_retention: a purge that fails gives its key null, and the others still run (rolled back to the savepoint).
savepoint r6_failing;
-- Its warning is expected: kept out of the run's output (the rollback to the savepoint puts the level back).
set local client_min_messages = error;
create or replace function private.purge_link_opens(p_limit integer default 5000) returns integer language plpgsql
security definer set search_path = '' as $$ begin raise exception 'r6: failing on purpose'; end $$;
select pg_temp.r6_check((select v->'link_opens' = 'null'::jsonb and jsonb_typeof(v->'suspension_history') = 'number'
  and jsonb_typeof(v->'phone_invitations') = 'number' from (select private.run_retention() v) x),
 'run_retention: a failing purge does not read null, or stops the run');
rollback to savepoint r6_failing;

-- run_retention after Ivo's hold is lifted: the eight keys, each a number, and what his hold kept goes (on 91 too);
-- what the hold on series 63 keeps stays. Slice 3 adds five keys (the series and account purges, and the numbers never
-- confirmed) and checks the whole answer; here they are left out.
update private.legal_holds set lifted_at=now() where user_id=pg_temp.a6('09') and lifted_at is null;
do $$ declare v jsonb := private.run_retention() - array['plans','chats','pending_phone_changes','web_accounts','unconfirmed_accounts']; k text;
begin
 perform pg_temp.r6_check((select array_agg(x order by x) from jsonb_object_keys(v) x) = array['closed_reports','connection_refusals',
  'connection_requests','link_opens','notifications','phone_invitations','plan_removals','suspension_history'],
  'run_retention: not exactly the eight keys: '||v::text);
 for k in select jsonb_object_keys(v) loop
  perform pg_temp.r6_check(jsonb_typeof(v->k) = 'number', 'run_retention: '||k||' is not a number: '||v::text);
 end loop;
 perform pg_temp.r6_check(v = '{"phone_invitations": 0, "plan_removals": 1, "connection_refusals": 1, "connection_requests": 1,
  "notifications": 2, "link_opens": 1, "closed_reports": 4, "suspension_history": 1}'::jsonb,
  'run_retention: after the lift it did not take exactly what Ivo''s hold kept: '||v::text);
end $$;
select pg_temp.r6_check(not pg_temp.r6_removal('70','09')
 and not exists(select 1 from private.connection_refusals where to_user=pg_temp.a6('09'))
 and not exists(select 1 from public.connections where pg_temp.a6('09') in (user_a,user_b))
 and not pg_temp.r6_notice('held-recipient') and not pg_temp.r6_notice('held-actor') and not pg_temp.r6_report('D')
 and not pg_temp.r6_report('I') and not exists(select 1 from private.suspension_history where user_id=pg_temp.a6('09')),
 'run_retention: a record Ivo''s hold kept stays once it is lifted');
select pg_temp.r6_check((select target_user_id is null and frozen_author is null from private.reports where details='r6-G')
  and (select target_user_id is null and frozen_author is null and frozen_body='Cal at the table' from private.reports where details='r6-J'),
 'run_retention: a report Ivo filed, or one on 91, still names leaving Cal once Ivo''s hold is lifted');
select pg_temp.r6_check(pg_temp.r6_invited('87') and pg_temp.r6_removal('63','87') and pg_temp.r6_report('F')
 and pg_temp.r6_removal('51','86'), 'run_retention: a record on a held series went');

-- Slice 3 (Task 3): the series purges (chats and plans), web-only and unconfirmed accounts.

-- The cast and the records, seeded under the roll's flag. Ben (07) and Gus (03) are held for this slice, and so are the
-- web account Uma (14) and the unconfirmed account 24.
select set_config('resbite.system','roll',true);
-- Web accounts: a confirmed number and no email (but Tom, 13), never in the app (but Sol, 12), all made 13 months ago
-- (but Val, 15, 11 months ago). Pia (10) was a guest on 81, which ended 13 months ago; Raj (11) on 82, which ended 11
-- months ago; Wes (16) asked to join 82 11 months ago; Xia (17) answered an invitation to 82 by number 11 months ago;
-- Yan (18) hosts 83, which ended 11 months ago.
insert into auth.users(id,phone,phone_confirmed_at,created_at) values
 (pg_temp.a6('10'),'447700900610',now()-interval '13 months',now()-interval '13 months'),
 (pg_temp.a6('11'),'447700900611',now()-interval '13 months',now()-interval '13 months'),
 (pg_temp.a6('12'),'447700900612',now()-interval '13 months',now()-interval '13 months'),
 (pg_temp.a6('13'),'447700900613',now()-interval '13 months',now()-interval '13 months'),
 (pg_temp.a6('14'),'447700900614',now()-interval '13 months',now()-interval '13 months'),
 (pg_temp.a6('15'),'447700900615',now()-interval '11 months',now()-interval '11 months'),
 (pg_temp.a6('16'),'447700900616',now()-interval '13 months',now()-interval '13 months'),
 (pg_temp.a6('17'),'447700900617',now()-interval '13 months',now()-interval '13 months'),
 (pg_temp.a6('18'),'447700900618',now()-interval '13 months',now()-interval '13 months');
update auth.users set email='r6-13@resbite-test.invalid' where id=pg_temp.a6('13');
insert into public.profiles(id,display_name) values
 (pg_temp.a6('10'),'Pia'),(pg_temp.a6('11'),'Raj'),(pg_temp.a6('12'),'Sol'),(pg_temp.a6('13'),'Tom'),(pg_temp.a6('14'),'Uma'),
 (pg_temp.a6('15'),'Val'),(pg_temp.a6('16'),'Wes'),(pg_temp.a6('17'),'Xia'),(pg_temp.a6('18'),'Yan');
insert into private.app_sessions(user_id) values (pg_temp.a6('12'));
-- Unconfirmed accounts, none with a profile: 20 confirmed nothing, 31 days old; 21 the same, 29 days old; 22 confirmed
-- its number, 31 days old; 23 anonymous, 31 days old; 24 held, confirmed nothing, 31 days old.
insert into auth.users(id,phone,phone_confirmed_at,is_anonymous,created_at) values
 (pg_temp.a6('20'),'447700900620',null,false,now()-interval '31 days'),
 (pg_temp.a6('21'),'447700900621',null,false,now()-interval '29 days'),
 (pg_temp.a6('22'),'447700900622',now()-interval '31 days',false,now()-interval '31 days'),
 (pg_temp.a6('23'),null,null,true,now()-interval '31 days'),
 (pg_temp.a6('24'),'447700900624',null,false,now()-interval '31 days');
-- 45 confirmed its number 13 months ago and never answered, so it has no profile: the link site makes such an account
-- when a person confirms their number and closes the tab (the review's cross-cutting #3).
insert into auth.users(id,phone,phone_confirmed_at,created_at) values
 (pg_temp.a6('45'),'447700900645',now()-interval '13 months',now()-interval '13 months');
-- Numbers given at Add your number and never confirmed (auth.users.phone_change, with its code and when it was sent):
-- Wen's, sent 31 days ago; Tom's, 29 days ago; held Uma's, 31 days ago.
update auth.users u set phone_change=x.phone, phone_change_token='r6-token-'||x.n, phone_change_sent_at=now()-x.age
 from (values ('04','447700900696',interval '31 days'),('13','447700900697',interval '29 days'),
  ('14','447700900698',interval '31 days')) x(n,phone,age)
 where u.id=pg_temp.a6(x.n);
-- Chats: 73 a one-off that ended 93 days ago, so its chat closed 91 days ago; 74 one that ended 91 days ago (closed 89
-- days ago); 75 one that ended 93 days ago, where held Ben wrote; 76 a weekly whose first occurrence ended 13 months ago
-- and which still rolls (77 is next week's). Plans: 78 a one-off that ended 13 months ago, with one of each record the
-- cascade takes; 79 one that ended 11 months ago; 80 one that ended 13 months ago, with held Gus as a guest; 81 and 82
-- the web accounts' (13 and 11 months ago); 83 Yan's (11 months ago); 84 a weekly whose only occurrence ended 13 months
-- ago and which the roll has yet to carry (it still rolls: series_end is null); 85 a finished weekly of two
-- occurrences, Ana a guest on each: 85 ended 13 months and a week ago, and 86, repeating from it, stopped repeating and
-- ended 13 months ago (repeats_from chains them, so the series can only go in one statement).
insert into public.plans(id,owner_id,title,starts_at,ends_at,time_zone,place_label,categories,repeat_weeks) values
 (pg_temp.a6('73'),pg_temp.a6('01'),'Quiz',now()-interval '93 days 2 hours',now()-interval '93 days','UTC','Pub',array['community'],null),
 (pg_temp.a6('74'),pg_temp.a6('01'),'Supper',now()-interval '91 days 2 hours',now()-interval '91 days','UTC','Hall',array['community'],null),
 (pg_temp.a6('75'),pg_temp.a6('01'),'Games',now()-interval '93 days 2 hours',now()-interval '93 days','UTC','Cafe',array['community'],null),
 (pg_temp.a6('76'),pg_temp.a6('01'),'Swim club',now()-interval '13 months 2 hours',now()-interval '13 months','UTC','Pool',array['physical'],1),
 (pg_temp.a6('78'),pg_temp.a6('01'),'Fair',now()-interval '13 months 2 hours',now()-interval '13 months','UTC','Green',array['community'],null),
 (pg_temp.a6('79'),pg_temp.a6('01'),'Gig',now()-interval '11 months 2 hours',now()-interval '11 months','UTC','Club',array['creative'],null),
 (pg_temp.a6('80'),pg_temp.a6('01'),'Market',now()-interval '13 months 2 hours',now()-interval '13 months','UTC','Square',array['community'],null),
 (pg_temp.a6('81'),pg_temp.a6('01'),'Talk',now()-interval '13 months 2 hours',now()-interval '13 months','UTC','Library',array['intellectual'],null),
 (pg_temp.a6('82'),pg_temp.a6('01'),'Tour',now()-interval '11 months 2 hours',now()-interval '11 months','UTC','Museum',array['intellectual'],null),
 (pg_temp.a6('83'),pg_temp.a6('18'),'Dance',now()-interval '11 months 2 hours',now()-interval '11 months','UTC','Studio',array['physical'],null),
 (pg_temp.a6('84'),pg_temp.a6('01'),'Choir club',now()-interval '13 months 2 hours',now()-interval '13 months','UTC','Hall',array['creative'],1),
 (pg_temp.a6('85'),pg_temp.a6('01'),'Run club',now()-interval '13 months 7 days 2 hours',now()-interval '13 months 7 days','UTC','Park',
  array['physical'],1);
insert into public.plans(id,owner_id,title,starts_at,ends_at,time_zone,place_label,categories,repeat_weeks,series_id,repeats_from) values
 (pg_temp.a6('77'),pg_temp.a6('01'),'Swim club',now()+interval '3 days',now()+interval '3 days 2 hours','UTC','Pool',array['physical'],1,
  pg_temp.a6('76'),pg_temp.a6('76')),
 (pg_temp.a6('86'),pg_temp.a6('01'),'Run club',now()-interval '13 months 2 hours',now()-interval '13 months','UTC','Park',array['physical'],null,
  pg_temp.a6('85'),pg_temp.a6('85'));
insert into public.attendees(plan_id,user_id,response) values
 (pg_temp.a6('76'),pg_temp.a6('06'),'accepted'),(pg_temp.a6('77'),pg_temp.a6('06'),'pending'),(pg_temp.a6('78'),pg_temp.a6('06'),'accepted'),
 (pg_temp.a6('79'),pg_temp.a6('06'),'accepted'),(pg_temp.a6('80'),pg_temp.a6('03'),'accepted'),(pg_temp.a6('81'),pg_temp.a6('10'),'accepted'),
 (pg_temp.a6('82'),pg_temp.a6('11'),'accepted'),(pg_temp.a6('85'),pg_temp.a6('06'),'accepted'),(pg_temp.a6('86'),pg_temp.a6('06'),'accepted');
-- 78's records: meeting details, a co-host, a join request, a link opened once, an invitation by number, a notice, a
-- mute, a leave; its message, read and chat mute come with the chats below.
insert into public.plan_meeting_details(plan_id,note) values (pg_temp.a6('78'),'Gate B');
insert into public.plan_admins(plan_id,user_id,appointed_by) values (pg_temp.a6('78'),pg_temp.a6('06'),pg_temp.a6('01'));
insert into private.join_requests(plan_id,user_id,response) values (pg_temp.a6('78'),pg_temp.a6('06'),'accepted');
insert into private.join_requests(plan_id,user_id,response,created_at) values (pg_temp.a6('82'),pg_temp.a6('16'),'accepted',now()-interval '11 months');
insert into private.plan_links(plan_id,code) values (pg_temp.a6('78'),'r6LinkCodeBBBBBBBBBBBB');
insert into private.link_opens(plan_link_id,opened_at) select id,now()-interval '13 months' from private.plan_links where plan_id=pg_temp.a6('78');
insert into private.phone_invitations(plan_id,phone,country,invited_by,user_id,answered_at) values
 (pg_temp.a6('78'),'447700900681','44',pg_temp.a6('01'),null,null),
 (pg_temp.a6('82'),'447700900617','44',pg_temp.a6('01'),pg_temp.a6('17'),now()-interval '11 months');
insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id) values
 (pg_temp.a6('78'),pg_temp.a6('01'),'rsvp','r6:plan78',pg_temp.a6('06'));
insert into public.plan_mutes(series_id,user_id) values (pg_temp.a6('78'),pg_temp.a6('06'));
insert into private.series_leaves(series_id,user_id) values (pg_temp.a6('78'),pg_temp.a6('06'));
-- A removal from the running weekly 76: Task 2's purge keeps it while the group rolls.
insert into private.plan_removals(series_id,user_id,phone) values (pg_temp.a6('76'),null,'447700900689');
-- Messages: on 73, Ana's message, Hana's announcement (pinned) and Hana's message; on 74 Ana's; on 75 Ana's and held
-- Ben's; on 78 and 80 Ana's.
insert into public.messages(series_id,plan_id,author_id,kind,body) values
 (pg_temp.a6('73'),pg_temp.a6('73'),pg_temp.a6('06'),'message','r6-73-ana'),
 (pg_temp.a6('73'),pg_temp.a6('73'),pg_temp.a6('01'),'announcement','r6-73-pin'),
 (pg_temp.a6('73'),pg_temp.a6('73'),pg_temp.a6('01'),'message','r6-73-hana'),
 (pg_temp.a6('74'),pg_temp.a6('74'),pg_temp.a6('06'),'message','r6-74-ana'),
 (pg_temp.a6('75'),pg_temp.a6('75'),pg_temp.a6('06'),'message','r6-75-ana'),
 (pg_temp.a6('75'),pg_temp.a6('75'),pg_temp.a6('07'),'message','r6-75-ben'),
 (pg_temp.a6('78'),pg_temp.a6('78'),pg_temp.a6('06'),'message','r6-78-ana'),
 (pg_temp.a6('80'),pg_temp.a6('80'),pg_temp.a6('06'),'message','r6-80-ana');
-- 76's chat, oldest first: Ana's message and Hana's pinned announcement, 13 months old; Ana's message and her message a
-- host removed, 11 months old; a system line 10 months old, hidden (chat_hide_line moves the last line back to the
-- removed one); and Ana's message written last but dated 13 months ago, so the chat's last line is one that goes.
insert into public.messages(series_id,plan_id,author_id,kind,body,state,created_at) values
 (pg_temp.a6('76'),pg_temp.a6('76'),pg_temp.a6('06'),'message','r6-76-old','sent',now()-interval '13 months'),
 (pg_temp.a6('76'),pg_temp.a6('76'),pg_temp.a6('01'),'announcement','r6-76-pin','sent',now()-interval '13 months'),
 (pg_temp.a6('76'),pg_temp.a6('77'),pg_temp.a6('06'),'message','r6-76-new','sent',now()-interval '11 months'),
 (pg_temp.a6('76'),pg_temp.a6('77'),pg_temp.a6('06'),'message','r6-76-removed','removed',now()-interval '11 months');
insert into public.messages(series_id,plan_id,author_id,kind,event,payload,created_at) values
 (pg_temp.a6('76'),pg_temp.a6('77'),null,'system','joined','{"r6":"76-line"}',now()-interval '10 months');
select private.chat_hide_line((select id from public.messages where payload->>'r6'='76-line'));
insert into public.messages(series_id,plan_id,author_id,kind,body,created_at) values
 (pg_temp.a6('76'),pg_temp.a6('77'),pg_temp.a6('06'),'message','r6-76-late',now()-interval '13 months');
-- Ana's reads on 73, 74, 75, 76 and 78; Hana's chat mutes on 73, 74, 75 and 78.
insert into public.chat_reads(series_id,user_id,last_read_id)
 select s,pg_temp.a6('06'),(select max(m.id) from public.messages m where m.series_id=s)
 from unnest(array[pg_temp.a6('73'),pg_temp.a6('74'),pg_temp.a6('75'),pg_temp.a6('76'),pg_temp.a6('78')]) s;
insert into public.chat_mutes(series_id,user_id)
 select s,pg_temp.a6('01') from unnest(array[pg_temp.a6('73'),pg_temp.a6('74'),pg_temp.a6('75'),pg_temp.a6('78')]) s;
-- Hana's report on Ana's message in 73, tagged H, with its frozen words.
insert into private.reports(reporter_id,target_user_id,message_id,series_id,plan_id,about,reason,details,frozen_body,frozen_author)
 select pg_temp.a6('01'),pg_temp.a6('06'),m.id,pg_temp.a6('73'),pg_temp.a6('73'),'message','spam','r6-H','r6-73-ana',pg_temp.a6('06')
 from public.messages m where m.body='r6-73-ana';
-- The hold twins (the review's retention #0 and #1, cross-cutting #0 and #3). Gil (37), Hob (38) and Ike (39) use the
-- app. b1 is Hana's one-off, made ahead so that she can remove Gil with remove_guest (below, signed in), then moved
-- back so that it ended 93 days ago (its chat closed 91 days ago), with Ana's message; b2 a one-off that ended 13
-- months ago, where Hob's request to join was declined; b3 a weekly that stopped and ended 13 months ago, its chat
-- closed, which Ike left; b4 a one-off that ended 13 months ago, which a hold names. The web accounts 40 to 44 are tied
-- to b4 only, each 13 months ago: Jen a guest, Kim wrote in its chat (no guest row), Len was removed from it, Mia asked
-- to join it, Ned answered an invitation by number to it.
insert into auth.users(id,phone,phone_confirmed_at) select pg_temp.a6(n),'4477009006'||n,now() from unnest(array['37','38','39']) n;
insert into auth.users(id,phone,phone_confirmed_at,created_at)
 select pg_temp.a6(n),'4477009006'||n,now()-interval '13 months',now()-interval '13 months' from unnest(array['40','41','42','43','44']) n;
insert into public.profiles(id,display_name) values (pg_temp.a6('37'),'Gil'),(pg_temp.a6('38'),'Hob'),(pg_temp.a6('39'),'Ike'),
 (pg_temp.a6('40'),'Jen'),(pg_temp.a6('41'),'Kim'),(pg_temp.a6('42'),'Len'),(pg_temp.a6('43'),'Mia'),(pg_temp.a6('44'),'Ned');
insert into private.app_sessions(user_id) select pg_temp.a6(n) from unnest(array['37','38','39']) n;
insert into public.plans(id,owner_id,title,starts_at,ends_at,time_zone,place_label,categories,repeat_weeks) values
 (pg_temp.a6('b1'),pg_temp.a6('01'),'Ceilidh',now()+interval '1 day',now()+interval '1 day 2 hours','UTC','Barn',array['community'],null),
 (pg_temp.a6('b2'),pg_temp.a6('01'),'Lecture',now()-interval '13 months 2 hours',now()-interval '13 months','UTC','Hall',array['intellectual'],null),
 (pg_temp.a6('b3'),pg_temp.a6('01'),'Book club',now()-interval '13 months 2 hours',now()-interval '13 months','UTC','Cafe',array['intellectual'],1),
 (pg_temp.a6('b4'),pg_temp.a6('01'),'Fete',now()-interval '13 months 2 hours',now()-interval '13 months','UTC','Green',array['community'],null);
update public.chats set stopped_at=now()-interval '13 months' where series_id=pg_temp.a6('b3');
insert into public.attendees(plan_id,user_id,response) values
 (pg_temp.a6('b1'),pg_temp.a6('37'),'accepted'),(pg_temp.a6('b1'),pg_temp.a6('06'),'accepted'),(pg_temp.a6('b4'),pg_temp.a6('40'),'accepted');
insert into private.join_requests(plan_id,user_id,response,status,created_at,decided_at) values
 (pg_temp.a6('b2'),pg_temp.a6('38'),'accepted','declined',now()-interval '13 months 1 day',now()-interval '13 months'),
 (pg_temp.a6('b4'),pg_temp.a6('43'),'accepted','waiting',now()-interval '13 months 1 day',null);
insert into private.series_leaves(series_id,user_id,left_at) values (pg_temp.a6('b3'),pg_temp.a6('39'),now()-interval '13 months');
insert into private.plan_removals(series_id,user_id,removed_at) values (pg_temp.a6('b4'),pg_temp.a6('42'),now()-interval '13 months');
insert into private.phone_invitations(plan_id,phone,country,invited_by,user_id,answered_at) values
 (pg_temp.a6('b4'),'447700900644','44',pg_temp.a6('01'),pg_temp.a6('44'),now()-interval '13 months');
insert into public.messages(series_id,plan_id,author_id,kind,body,created_at) values
 (pg_temp.a6('b1'),pg_temp.a6('b1'),pg_temp.a6('06'),'message','r6-b1-ana',now()),
 (pg_temp.a6('b4'),pg_temp.a6('b4'),pg_temp.a6('41'),'message','r6-b4-kim',now()-interval '13 months');
insert into private.legal_holds(user_id,reason,case_ref,review_on) values
 (pg_temp.a6('07'),'police','LE-2026-007',current_date+90),(pg_temp.a6('03'),'coroner','CO-2026-003',current_date+90),
 (pg_temp.a6('14'),'intimate_image','II-2026-014',current_date+90),(pg_temp.a6('24'),'claim','CL-2026-024',current_date+90);
select set_config('resbite.system','',true);
-- Hana removes Gil from b1, signed in, as the app does; then b1 moves back, so that it ended 93 days ago.
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.a6('01'),'role','authenticated')::text,true);
set local role authenticated;
select public.remove_guest('a6000000-0000-4000-8000-0000000000b1','a6000000-0000-4000-8000-000000000037');
reset role;
select set_config('request.jwt.claims','',true);
select set_config('resbite.system','roll',true);
update public.plans set starts_at=now()-interval '93 days 2 hours', ends_at=now()-interval '93 days' where id=pg_temp.a6('b1');
-- The twins' holds come after: Gil, Hob and Ike, and the series b4.
insert into private.legal_holds(user_id,reason,case_ref,review_on) values
 (pg_temp.a6('37'),'police','LE-2026-037',current_date+90),(pg_temp.a6('38'),'threat','TH-2026-038',current_date+90),
 (pg_temp.a6('39'),'nca','NCA-2026-039',current_date+90);
insert into private.legal_holds(series_id,reason,case_ref,review_on) values (pg_temp.a6('b4'),'court','CT-2026-0B4',current_date+90);
select set_config('resbite.system','',true);
-- The twins are as they should be: Gil is off b1 and on its removal record; each twin series is due but for its hold.
select pg_temp.r6_check(not exists(select 1 from public.attendees where plan_id=pg_temp.a6('b1') and user_id=pg_temp.a6('37'))
 and pg_temp.r6_removal('b1','37') and private.plan_end((select starts_at from public.plans where id=pg_temp.a6('b1')),
  (select ends_at from public.plans where id=pg_temp.a6('b1'))) < now()-interval '92 days'
 and private.series_end(pg_temp.a6('b2')) < now()-interval '12 months' and private.series_end(pg_temp.a6('b3')) < now()-interval '12 months'
 and private.series_end(pg_temp.a6('b4')) < now()-interval '12 months',
 'hold twins: Gil was not removed from b1 as the app removes a guest, or a twin series is not due');

-- A message by its words; a chat's row by its series number.
create function pg_temp.r6_msg(p_body text) returns bigint language sql as $$
 select m.id from public.messages m where m.body=p_body $$;
create function pg_temp.r6_chat(p_series text) returns public.chats language sql as $$
 select c.* from public.chats c where c.series_id=pg_temp.a6(p_series) $$;

-- The fixtures say what they should: 76 is a running group with nothing to end it, and its chat's row names the late
-- message as its last line and the old announcement as its pin; 73's names its announcement as its pin.
select pg_temp.r6_check(private.chat_is_group(pg_temp.a6('76')) and private.series_end(pg_temp.a6('76')) is null
 and private.series_end(pg_temp.a6('84')) is null and not private.chat_is_group(pg_temp.a6('73')),
 'series fixtures: 76 or 84 is not a running group, or 73 is a group');
-- 85 is a finished series of two occurrences: its current occurrence is 86, and it ended 13 months ago.
select pg_temp.r6_check((select count(*) from public.plans where series_id=pg_temp.a6('85')) = 2
 and (private.current_occurrence(pg_temp.a6('85'))).id = pg_temp.a6('86')
 and private.series_end(pg_temp.a6('85')) = (select ends_at from public.plans where id=pg_temp.a6('86')),
 'series fixtures: 85 is not a finished series of two occurrences whose current one is 86');
select pg_temp.r6_check((select c.message_count=4 and c.last_message_id=pg_temp.r6_msg('r6-76-late')
  and c.pinned_message_id=pg_temp.r6_msg('r6-76-pin') from pg_temp.r6_chat('76') c), 'series fixtures: 76''s chat row is not as seeded');
select pg_temp.r6_check((select c.message_count=3 and c.pinned_message_id=pg_temp.r6_msg('r6-73-pin') from pg_temp.r6_chat('73') c),
 'series fixtures: 73''s chat row is not as seeded');

-- series_purges_locked: no API role may call any of the six; each is security definer, with an empty search path, and
-- this file's; the five purges are plpgsql, the list of dormant accounts is SQL.
do $$ declare r text; f text; v pg_catalog.pg_proc;
begin
 foreach f in array array['private.purge_chats(integer)','private.purge_plans(integer)','private.dormant_web_accounts(integer)',
  'private.purge_web_accounts(integer)','private.purge_unconfirmed_accounts(integer)','private.purge_pending_phone_changes(integer)'] loop
  foreach r in array array['anon','authenticated','service_role'] loop
   perform pg_temp.r6_check(not has_function_privilege(r,f,'execute'), 'series_purges_locked: '||r||' may execute '||f);
  end loop;
  select * into v from pg_catalog.pg_proc p where p.oid = f::regprocedure;
  perform pg_temp.r6_check(v.prosecdef and v.proconfig = array['search_path=""']
   and v.prolang = (select l.oid from pg_catalog.pg_language l
    where l.lanname = case when f like 'private.dormant_web_accounts%' then 'sql' else 'plpgsql' end),
   'series_purges_locked: '||f||' is not security definer in its language with an empty search path');
  perform pg_temp.r6_check(pg_catalog.obj_description(f::regprocedure,'pg_proc') = 'resbite 20261117130000',
   'series_purges_locked: '||f||' does not carry this file''s marker');
 end loop;
end $$;

-- dormant_web_accounts (Decision 11, AS-R4): Pia (10), whose guest row is on a resbite that ended 13 months ago, and
-- 45, who confirmed a number and never answered, so has no profile. Not the web accounts tied to b4, which a hold
-- names: what a held series holds stays whole, its guests included (the review's retention #1).
do $$ declare v_n text; v_why text;
begin
 perform pg_temp.r6_check(pg_temp.a6('10') in (select private.dormant_web_accounts()),
  'dormant_web_accounts: Pia (10), web-only and idle for 12 months, is not dormant');
 perform pg_temp.r6_check(pg_temp.a6('45') in (select private.dormant_web_accounts()),
  'dormant_web_accounts: 45, web-only with no profile and idle for 12 months, is not dormant');
 for v_n, v_why in values ('11','a guest on a resbite that ended 11 months ago'),('12','in the app (an app session)'),
  ('13','with an email'),('14','held'),('15','made 11 months ago'),('16','asked to join 11 months ago'),
  ('17','answered an invitation 11 months ago'),('18','hosting a resbite that ended 11 months ago'),
  ('40','a guest on b4, which a hold names'),('41','who wrote in b4''s chat'),('42','removed from b4'),
  ('43','who asked to join b4'),('44','who answered an invitation by number to b4') loop
  perform pg_temp.r6_check(pg_temp.a6(v_n) not in (select private.dormant_web_accounts()),
   'dormant_web_accounts: '||v_n||', '||v_why||', is dormant');
 end loop;
 perform pg_temp.r6_check((select count(*) from private.dormant_web_accounts()) = 2,
  'dormant_web_accounts: not just Pia and 45: '||(select array_agg(d)::text from private.dormant_web_accounts() d));
end $$;

-- purge_web_accounts: without plan 2's operator deletion it refuses with 55000 and the daily run reads null for its key
-- (the function is hidden in a savepoint when it exists; the brief's own case is the one where it is missing).
savepoint r6_no_operator;
-- Its warning is expected: kept out of the run's output (the rollback to the savepoint puts the level back).
set local client_min_messages = error;
do $$ begin
 if pg_catalog.to_regprocedure('private.operator_account_deletion(uuid)') is not null then
  alter function private.operator_account_deletion(uuid) rename to r6_operator_hidden;
 end if;
end $$;
do $$ declare v_state text; v_msg text;
begin
 begin
  perform private.purge_web_accounts();
 exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
 end;
 perform pg_temp.r6_check(v_state = '55000' and v_msg = 'Operator deletion missing',
  'purge_web_accounts: without the operator deletion it did not refuse with 55000 ''Operator deletion missing'': '
  ||coalesce(v_state,'no error')||' '||coalesce(v_msg,''));
 perform pg_temp.r6_check((select v->'web_accounts' = 'null'::jsonb and jsonb_typeof(v->'unconfirmed_accounts') = 'number'
   from (select private.run_retention() v) x), 'run_retention: a missing operator deletion does not read null for web_accounts');
end $$;
rollback to savepoint r6_no_operator;
-- Then a stub stands in only where plan 2's function is still missing, recording whom it was asked to delete.
do $$ begin
 if pg_catalog.to_regprocedure('private.operator_account_deletion(uuid)') is null then
  create temp table r6_operator_calls(user_id uuid);
  create function private.operator_account_deletion(p_user uuid) returns jsonb language sql as $f$
   insert into pg_temp.r6_operator_calls values (p_user) returning jsonb_build_object('status','queued') $f$;
 end if;
end $$;
select pg_temp.r6_check(private.purge_web_accounts() = 2, 'purge_web_accounts: the run did not answer 2');
do $$ declare v_ok boolean;
begin
 if pg_catalog.to_regclass('pg_temp.r6_operator_calls') is not null then
  execute 'select coalesce(array_agg(user_id) = array[pg_temp.a6(''10''),pg_temp.a6(''45'')], false) from pg_temp.r6_operator_calls' into v_ok;
 else
  -- Plan 2's real function: Pia's and 45's deletions are queued, so neither is dormant any more.
  v_ok := private.deletion_pending(pg_temp.a6('10')) and private.deletion_pending(pg_temp.a6('45'))
   and not exists(select 1 from private.dormant_web_accounts() d where d in (pg_temp.a6('10'),pg_temp.a6('45')));
 end if;
 perform pg_temp.r6_check(v_ok, 'purge_web_accounts: Pia''s (10) or 45''s deletion was not queued');
end $$;
select pg_temp.r6_check(not exists(select 1 from unnest(array['11','12','13','14','15','16','17','18','40','41','42','43','44']) n
  where private.deletion_pending(pg_temp.a6(n))), 'purge_web_accounts: an account that is not dormant is being deleted');
select pg_temp.r6_check((select body='r6-b4-kim' and author_id=pg_temp.a6('41') and state='sent' from public.messages where body='r6-b4-kim')
 and exists(select 1 from public.attendees where plan_id=pg_temp.a6('b4') and user_id=pg_temp.a6('40')),
 'purge_web_accounts: Kim''s message in b4, which a hold names, lost its words or author, or Jen''s guest row went');
select pg_temp.r6_check(coalesce(current_setting('resbite.system',true),'') = '',
 'purge_web_accounts: the deletion''s flag outlived the deletion');

-- purge_unconfirmed_accounts (AS-R4): an Auth user that confirmed nothing goes 30 days after it was made, unless it has
-- a profile, is anonymous or is held.
select pg_temp.r6_check(private.purge_unconfirmed_accounts() = 1, 'unconfirmed: the run did not answer 1');
select pg_temp.r6_check(not exists(select 1 from auth.users where id=pg_temp.a6('20')), 'unconfirmed: one that confirmed nothing stays at 31 days');
select pg_temp.r6_check(exists(select 1 from auth.users where id=pg_temp.a6('21')), 'unconfirmed: one that confirmed nothing goes at 29 days');
select pg_temp.r6_check(exists(select 1 from auth.users where id=pg_temp.a6('22')), 'unconfirmed: one that confirmed its number goes');
select pg_temp.r6_check(exists(select 1 from auth.users where id=pg_temp.a6('23')), 'unconfirmed: an anonymous one goes');
select pg_temp.r6_check(exists(select 1 from auth.users where id=pg_temp.a6('24')), 'unconfirmed: a held one goes');

-- purge_pending_phone_changes (privacy notice section 7: a number given to get a code, if never confirmed, 30 days;
-- the review's cross-cutting #5): the number, its code and when it was sent are cleared 30 days after the code went,
-- as Auth leaves them when nothing is pending, unless the account is held. A second run finds nothing.
select pg_temp.r6_check(private.purge_pending_phone_changes() = 1, 'pending_phone_changes: the run did not answer 1');
select pg_temp.r6_check((select phone_change='' and phone_change_token='' and phone_change_sent_at is null from auth.users where id=pg_temp.a6('04')),
 'pending_phone_changes: Wen''s number, its code sent 31 days ago, stays');
select pg_temp.r6_check((select phone_change='447700900697' and phone_change_token='r6-token-13' and phone_change_sent_at is not null
  from auth.users where id=pg_temp.a6('13')), 'pending_phone_changes: Tom''s number, its code sent 29 days ago, went');
select pg_temp.r6_check((select phone_change='447700900698' and phone_change_token='r6-token-14' from auth.users where id=pg_temp.a6('14')),
 'pending_phone_changes: held Uma''s number went');
select pg_temp.r6_check(private.purge_pending_phone_changes() = 0, 'pending_phone_changes: a second run took something');

-- purge_plans: 12 months after the series ends, the whole series and everything on it; never a running group, nor a
-- series under hold. It answers plans, not series: 78 and 81 (whose only guest, Pia, has just been deleted) and both
-- occurrences of the finished weekly 85 go, four plans in three series.
create temp table r6_before as select (select count(*) from private.link_opens) as opens;
select pg_temp.r6_check(private.purge_plans() = 4, 'plans: the run did not answer 4 (plans, not series)');
select pg_temp.r6_check(not exists(select 1 from public.plans where series_id in (pg_temp.a6('78'),pg_temp.a6('81'))),
 'plans: a one-off that ended 13 months ago stays');
select pg_temp.r6_check(not exists(select 1 from public.attendees where plan_id=pg_temp.a6('78'))
 and not exists(select 1 from public.plan_meeting_details where plan_id=pg_temp.a6('78'))
 and not exists(select 1 from public.plan_admins where plan_id=pg_temp.a6('78'))
 and not exists(select 1 from private.join_requests where plan_id=pg_temp.a6('78'))
 and not exists(select 1 from private.plan_links where code='r6LinkCodeBBBBBBBBBBBB')
 and (select count(*) from private.link_opens) = (select opens-1 from r6_before)
 and not pg_temp.r6_invited('81') and pg_temp.r6_msg('r6-78-ana') is null and not pg_temp.r6_notice('plan78'),
 'plans: a guest, meeting details, co-host, join request, link, link open, invitation, message or notice of 78 stays');
select pg_temp.r6_check(not exists(select 1 from public.plan_mutes where series_id=pg_temp.a6('78'))
 and not exists(select 1 from private.series_leaves where series_id=pg_temp.a6('78'))
 and not exists(select 1 from public.chat_reads where series_id=pg_temp.a6('78'))
 and not exists(select 1 from public.chat_mutes where series_id=pg_temp.a6('78'))
 and not exists(select 1 from public.chats where series_id=pg_temp.a6('78')),
 'plans: a mute, leave, chat read, chat mute or the chat row of 78 stays');
select pg_temp.r6_check(not exists(select 1 from public.plans where series_id=pg_temp.a6('85'))
 and not exists(select 1 from public.attendees where plan_id in (pg_temp.a6('85'),pg_temp.a6('86')))
 and not exists(select 1 from public.chats where series_id=pg_temp.a6('85')),
 'plans: an occurrence, guest or the chat row of the finished weekly 85 (86 repeating from 85) stays');
select pg_temp.r6_check(exists(select 1 from public.plans where id=pg_temp.a6('79')) and (pg_temp.r6_chat('79')).series_id is not null,
 'plans: a one-off that ended 11 months ago goes');
select pg_temp.r6_check((select count(*) from public.plans where series_id=pg_temp.a6('76')) = 2
 and (select count(*) from public.attendees where plan_id in (pg_temp.a6('76'),pg_temp.a6('77'))) = 2 and (pg_temp.r6_chat('76')).series_id is not null,
 'plans: an occurrence, guest or the chat of the weekly 76, which still rolls, goes');
select pg_temp.r6_check(exists(select 1 from public.plans where id=pg_temp.a6('84')),
 'plans: a weekly whose only occurrence ended 13 months ago, and which still rolls, goes');
select pg_temp.r6_check(exists(select 1 from public.plans where id=pg_temp.a6('80'))
 and exists(select 1 from public.attendees where plan_id=pg_temp.a6('80') and user_id=pg_temp.a6('03'))
 and pg_temp.r6_msg('r6-80-ana') is not null and (pg_temp.r6_chat('80')).series_id is not null,
 'plans: a one-off that ended 13 months ago with held Gus as a guest goes');
select pg_temp.r6_check(exists(select 1 from public.plans where id=pg_temp.a6('82')) and exists(select 1 from public.plans where id=pg_temp.a6('83')),
 'plans: a one-off that ended 11 months ago goes');
select pg_temp.r6_check(exists(select 1 from public.plans where id=pg_temp.a6('b2'))
 and exists(select 1 from private.join_requests where plan_id=pg_temp.a6('b2') and user_id=pg_temp.a6('38'))
 and exists(select 1 from public.plans where id=pg_temp.a6('b3'))
 and exists(select 1 from private.series_leaves where series_id=pg_temp.a6('b3') and user_id=pg_temp.a6('39'))
 and exists(select 1 from public.plans where id=pg_temp.a6('b4'))
 and exists(select 1 from public.attendees where plan_id=pg_temp.a6('b4') and user_id=pg_temp.a6('40'))
 and pg_temp.r6_removal('b4','42') and exists(select 1 from private.join_requests where plan_id=pg_temp.a6('b4') and user_id=pg_temp.a6('43'))
 and pg_temp.r6_invited('44'),
 'plans: a series held Hob asked to join, one held Ike left, or one a hold names, went or lost a record');

-- purge_chats: a one-off's messages, reads and mutes 90 days after its chat closed; a group's messages 12 months after
-- they were written, with the chat's figures put right; never a series under hold. 73's three and 76's three go.
select pg_temp.r6_check(private.purge_chats() = 6, 'chats: the run did not answer 6');
select pg_temp.r6_check(not exists(select 1 from public.messages where series_id=pg_temp.a6('73'))
 and not exists(select 1 from public.chat_reads where series_id=pg_temp.a6('73'))
 and not exists(select 1 from public.chat_mutes where series_id=pg_temp.a6('73')),
 'chats: a message, read or mute of a one-off whose chat closed 91 days ago stays');
select pg_temp.r6_check((select c.message_count=0 and c.last_message_id is null and c.last_message_at is null and c.pinned_message_id is null
  from pg_temp.r6_chat('73') c), 'chats: the row of a one-off emptied is not 0, null, null, null');
select pg_temp.r6_check((select message_id is null and frozen_body='r6-73-ana' from private.reports where details='r6-H'),
 'chats: a report on a message that went still names it, or lost its frozen words');
select pg_temp.r6_check(pg_temp.r6_msg('r6-74-ana') is not null
 and exists(select 1 from public.chat_reads where series_id=pg_temp.a6('74'))
 and exists(select 1 from public.chat_mutes where series_id=pg_temp.a6('74')) and (pg_temp.r6_chat('74')).message_count=1,
 'chats: a one-off whose chat closed 89 days ago lost something');
select pg_temp.r6_check(pg_temp.r6_msg('r6-75-ana') is not null and pg_temp.r6_msg('r6-75-ben') is not null
 and exists(select 1 from public.chat_reads where series_id=pg_temp.a6('75'))
 and exists(select 1 from public.chat_mutes where series_id=pg_temp.a6('75')) and (pg_temp.r6_chat('75')).message_count=2,
 'chats: a one-off whose chat closed 91 days ago, where held Ben wrote, lost something');
select pg_temp.r6_check(pg_temp.r6_msg('r6-76-old') is null and pg_temp.r6_msg('r6-76-pin') is null and pg_temp.r6_msg('r6-76-late') is null,
 'chats: a group message 13 months old stays');
select pg_temp.r6_check(pg_temp.r6_msg('r6-76-new') is not null and pg_temp.r6_msg('r6-76-removed') is not null
 and exists(select 1 from public.messages where payload->>'r6'='76-line'), 'chats: a group message 11 months old goes');
select pg_temp.r6_check((select c.message_count = (select count(*) from public.messages m where m.series_id=c.series_id
   and m.state='sent' and m.kind in ('message','announcement')) and c.message_count=1 from pg_temp.r6_chat('76') c),
 'chats: the group''s message_count is not its sent messages and announcements left');
select pg_temp.r6_check((pg_temp.r6_chat('76')).pinned_message_id is null, 'chats: the group still pins an announcement that went');
select pg_temp.r6_check((select c.last_message_id=pg_temp.r6_msg('r6-76-removed')
  and c.last_message_at=(select m.created_at from public.messages m where m.body='r6-76-removed') from pg_temp.r6_chat('76') c),
 'chats: the group''s last line is not the newest row left that is not a hidden system line');
select pg_temp.r6_check(exists(select 1 from public.chat_reads where series_id=pg_temp.a6('76')), 'chats: the group lost its reads');
select pg_temp.r6_check(pg_temp.r6_msg('r6-b1-ana') is not null and pg_temp.r6_removal('b1','37') and pg_temp.r6_msg('r6-b4-kim') is not null,
 'chats: a one-off whose chat closed 91 days ago, from which held Gil was removed, or one a hold names, lost a message or the removal');

-- run_retention: exactly the thirteen keys, each a number. With the holds still on, no series of this slice goes: what
-- Ben's and Gus's holds keep, the hold twins, and the running group's occurrences, guests, removal and newer messages,
-- stay. One account does: Xia's (17) only trace was her answered invitation to 82, which this run's invitations purge
-- takes (30 days after 82 ended) before the web-account purge looks, so she is idle now. (In the app, answering also
-- makes a guest row, which stays as long as the resbite does.) Ned's answered invitation to b4 stays: a hold names b4.
do $$ declare v jsonb := private.run_retention(); k text;
begin
 perform pg_temp.r6_check((select array_agg(x order by x collate "C") from jsonb_object_keys(v) x) = array['chats','closed_reports',
  'connection_refusals','connection_requests','link_opens','notifications','pending_phone_changes','phone_invitations','plan_removals',
  'plans','suspension_history','unconfirmed_accounts','web_accounts'], 'run_retention: not exactly the thirteen keys: '||v::text);
 for k in select jsonb_object_keys(v) loop
  perform pg_temp.r6_check(jsonb_typeof(v->k) = 'number', 'run_retention: '||k||' is not a number: '||v::text);
 end loop;
 perform pg_temp.r6_check(v->'plans' = '0' and v->'chats' = '0' and v->'web_accounts' = '1' and v->'unconfirmed_accounts' = '0'
  and v->'pending_phone_changes' = '0',
  'run_retention: with the holds on, a series or an account purge did not take just Xia: '||v::text);
end $$;
select pg_temp.r6_check(private.deletion_pending(pg_temp.a6('17')) and not exists(select 1
  from unnest(array['11','12','13','14','15','16','18','40','41','42','43','44']) n
  where private.deletion_pending(pg_temp.a6(n))), 'run_retention: not just Xia (17) is being deleted');
select pg_temp.r6_check(pg_temp.r6_invited('44') and pg_temp.r6_removal('b4','42') and pg_temp.r6_removal('b1','37')
 and pg_temp.r6_msg('r6-b1-ana') is not null and pg_temp.r6_msg('r6-b4-kim') is not null
 and (select count(*) from public.plans where id in (pg_temp.a6('b1'),pg_temp.a6('b2'),pg_temp.a6('b3'),pg_temp.a6('b4'))) = 4,
 'run_retention: a hold twin''s record went');
select pg_temp.r6_check(pg_temp.r6_msg('r6-75-ben') is not null and exists(select 1 from public.plans where id=pg_temp.a6('80'))
 and (select count(*) from public.plans where series_id=pg_temp.a6('76')) = 2
 and (select count(*) from public.attendees where plan_id in (pg_temp.a6('76'),pg_temp.a6('77'))) = 2
 and pg_temp.r6_removal('76','89') and pg_temp.r6_msg('r6-76-new') is not null,
 'run_retention: a record a hold or a running group keeps went');
-- The lift, then the next run: 80 goes (plans), and 75's two messages (chats), its row emptied.
update private.legal_holds set lifted_at=now() where user_id in (pg_temp.a6('07'),pg_temp.a6('03')) and lifted_at is null;
do $$ declare v jsonb := private.run_retention();
begin
 perform pg_temp.r6_check(v->'plans' = '1' and v->'chats' = '2',
  'run_retention: after Ben''s and Gus''s holds were lifted it did not take 80 and 75''s two messages: '||v::text);
end $$;
select pg_temp.r6_check(not exists(select 1 from public.plans where id=pg_temp.a6('80'))
 and not exists(select 1 from public.messages where series_id=pg_temp.a6('75'))
 and (select c.message_count=0 and c.last_message_id is null from pg_temp.r6_chat('75') c),
 'run_retention: what Ben''s and Gus''s holds kept stays once they are lifted');
select pg_temp.r6_check((select count(*) from public.plans where series_id=pg_temp.a6('76')) = 2 and pg_temp.r6_removal('76','89')
 and exists(select 1 from public.plans where id=pg_temp.a6('84')), 'run_retention: a running group went');

-- Slice 4 (Task 4): the do-not-invite list.

-- The cast and the records, seeded under the roll's flag. Kai (25) is on Resbite and uses the app. The number 92 has an
-- invitation on Hana's 87 and one on Rob's 88, which a hold names, and a removal record on Hana's 60.
select set_config('resbite.system','roll',true);
insert into auth.users(id,phone,phone_confirmed_at) values (pg_temp.a6('25'),'447700900625',now());
insert into public.profiles(id,display_name) values (pg_temp.a6('25'),'Kai');
insert into private.app_sessions(user_id) values (pg_temp.a6('25'));
insert into public.plans(id,owner_id,title,starts_at,ends_at,time_zone,place_label,categories,repeat_weeks) values
 (pg_temp.a6('87'),pg_temp.a6('01'),'Lunch',now()+interval '4 days',now()+interval '4 days 2 hours','UTC','Cafe',array['community'],null),
 (pg_temp.a6('88'),pg_temp.a6('05'),'Hike',now()+interval '5 days',now()+interval '5 days 2 hours','UTC','Hills',array['physical'],null);
insert into private.legal_holds(series_id,reason,case_ref,review_on) values (pg_temp.a6('88'),'police','LE-2026-088',current_date+90);
insert into private.phone_invitations(plan_id,phone,country,code_hash,invited_by) values
 (pg_temp.a6('87'),'447700900692','44',extensions.digest('r6-92-87','sha256'),pg_temp.a6('01')),
 (pg_temp.a6('88'),'447700900692','44',extensions.digest('r6-92-88','sha256'),pg_temp.a6('05'));
insert into private.plan_removals(series_id,user_id,phone) values (pg_temp.a6('60'),null,'447700900692');
select set_config('resbite.system','',true);

-- A host's invitations by number, sent as the app sends them (signed in, as authenticated), each number with a code of
-- its own: the answer.
create function pg_temp.r6_invite(p_host text, p_plan text, p_phones text[]) returns jsonb language plpgsql as $$
declare v jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.a6(p_host),'role','authenticated')::text,true);
 set local role authenticated;
 v := public.invite_contacts(pg_temp.a6(p_plan),(select jsonb_agg(jsonb_build_object('phone',x,'country','44',
  'code',rpad('r6'||x,22,'A')) order by o) from unnest(p_phones) with ordinality u(x,o)));
 reset role;
 perform set_config('request.jwt.claims','',true);
 return v;
end $$;
-- An owner-run script's rows, as a JSON array (chat-safety.sql's s3_run).
create function pg_temp.r6_run(p_sql text) returns jsonb language plpgsql as $$
declare r record; v jsonb := '[]'::jsonb;
begin
 if coalesce(length(btrim(p_sql)),0)=0 then raise exception 'The script text is empty'; end if;
 for r in execute p_sql loop v := v||jsonb_build_array(to_jsonb(r)); end loop;
 return v;
end $$;
-- Whether number NN is invited to plan PP.
create function pg_temp.r6_invited_to(p_end text, p_plan text) returns boolean language sql as $$
 select exists(select 1 from private.phone_invitations i where i.phone='4477009006'||p_end and i.plan_id=pg_temp.a6(p_plan)) $$;

-- objections_locked: no API role may touch the list or call any of the five; row security is on; each function is
-- security definer with an empty search path, and this file's, as is the list; the keyed hash is plpgsql and stable.
-- invite_contacts keeps its grants: authenticated only, its wrapper too.
do $$ declare r text; f text; v pg_catalog.pg_proc;
begin
 foreach r in array array['public','anon','authenticated','service_role'] loop
  perform pg_temp.r6_check(not has_table_privilege(r,'private.invite_objections','select,insert,update,delete,truncate,references,trigger'),
   'objections_locked: '||r||' may touch the list');
  foreach f in array array['private.objection_key_hash(text)','private.ensure_objection_key()','private.number_objected(text)',
   'private.record_objection(text)','private.withdraw_objection(text)'] loop
   perform pg_temp.r6_check(not has_function_privilege(r,f,'execute'), 'objections_locked: '||r||' may execute '||f);
  end loop;
 end loop;
 perform pg_temp.r6_check((select c.relrowsecurity from pg_catalog.pg_class c where c.oid='private.invite_objections'::regclass),
  'objections_locked: row security is off on the list');
 perform pg_temp.r6_check(pg_catalog.obj_description('private.invite_objections'::regclass,'pg_class') = 'resbite 20261117130000',
  'objections_locked: the list does not carry this file''s marker');
 foreach f in array array['private.objection_key_hash(text)','private.ensure_objection_key()','private.number_objected(text)',
  'private.record_objection(text)','private.withdraw_objection(text)'] loop
  select * into v from pg_catalog.pg_proc p where p.oid = f::regprocedure;
  perform pg_temp.r6_check(v.prosecdef and v.proconfig = array['search_path=""'],
   'objections_locked: '||f||' is not security definer with an empty search path');
  perform pg_temp.r6_check(pg_catalog.obj_description(f::regprocedure,'pg_proc') = 'resbite 20261117130000',
   'objections_locked: '||f||' does not carry this file''s marker');
 end loop;
 select * into v from pg_catalog.pg_proc p where p.oid = 'private.objection_key_hash(text)'::regprocedure;
 perform pg_temp.r6_check(v.provolatile = 's' and v.prolang = (select l.oid from pg_catalog.pg_language l where l.lanname = 'plpgsql'),
  'objections_locked: objection_key_hash is not plpgsql and stable');
 foreach f in array array['public.invite_contacts(uuid,jsonb)','private.invite_contacts(uuid,jsonb)'] loop
  perform pg_temp.r6_check(has_function_privilege('authenticated',f,'execute') and not has_function_privilege('anon',f,'execute')
   and not has_function_privilege('service_role',f,'execute') and not has_function_privilege('public',f,'execute'),
   'objections_locked: '||f||' is not executable by authenticated only');
 end loop;
end $$;

-- objection_empty: no key in Vault and nothing on the list. A number is not listed, and inviting it never needs the
-- key: the host's invitation takes the link path as before. The keyed hash itself refuses without the key.
delete from vault.secrets where name='invite_objection_key';
select pg_temp.r6_check(not exists(select 1 from private.invite_objections), 'objection_empty: fixture: the list is not empty');
select pg_temp.r6_check(private.number_objected('447700900691') is false, 'objection_empty: a number is listed on an empty list');
do $$ declare v_state text; v_msg text;
begin
 begin
  perform private.objection_key_hash('447700900691');
 exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
 end;
 perform pg_temp.r6_check(v_state = '55000' and v_msg = 'Objection key missing',
  'objection_empty: the keyed hash without a key did not refuse with 55000 ''Objection key missing'': '
  ||coalesce(v_state,'no error')||' '||coalesce(v_msg,''));
end $$;
do $$ declare v jsonb := pg_temp.r6_invite('01','87',array['447700900691']);
begin
 perform pg_temp.r6_check(v = '[{"phone": "447700900691", "kind": "link"}]'::jsonb, 'objection_empty: the invitation did not read link: '||v::text);
 perform pg_temp.r6_check(pg_temp.r6_invited_to('91','87'), 'objection_empty: the invitation by link was not stored');
end $$;

-- object_number: object-number.sql, its literal swapped, lists 92. It deletes the invitation on 87 and the removal on
-- 60, keeps the one on the held 88, and makes the key: one secret in Vault, one row on the list, and that row is the
-- number's keyed hash, not the number nor its plain hash.
\set r6_object `sed -e "s/'447700900000'/'447700900692'/" :'resbite_repo'/supabase/ops/object-number.sql`
select pg_temp.r6_check(position('''447700900692''' in :'r6_object') > 0, 'object_number: the script''s literal was not swapped');
select set_config('r6.out',pg_temp.r6_run(:'r6_object')::text,true);
select pg_temp.r6_check(current_setting('r6.out')::jsonb = '[{"result": {"already_listed": false, "invitations_deleted": 1,
  "removals_deleted": 1, "held_kept": 1}}]'::jsonb, 'object_number: the first run answered '||current_setting('r6.out'));
select pg_temp.r6_check((select count(*) from vault.secrets where name='invite_objection_key') = 1
 and (select count(*) from private.invite_objections) = 1, 'object_number: not one secret and one listed row');
select pg_temp.r6_check((select o.key_hash <> extensions.digest('447700900692','sha256') and position('447700900692'::bytea in o.key_hash) = 0
  and o.key_hash = extensions.hmac('447700900692',(select s.secret from vault.secrets s where s.name='invite_objection_key'),'sha256')
  from private.invite_objections o), 'object_number: the listed row is not the number''s keyed hash, or holds the number');
select pg_temp.r6_check(not pg_temp.r6_invited_to('92','87') and pg_temp.r6_invited_to('92','88') and not pg_temp.r6_removal('60','92'),
 'object_number: the invitation on 87 or the removal on 60 stays, or the one on the held 88 went');
select pg_temp.r6_check(pg_temp.r6_invited_to('91','87'), 'object_number: another number''s invitation went');
select pg_temp.r6_check(private.number_objected('+44 7700 900692') and not private.number_objected('447700900693'),
 'object_number: the number (as typed) is not listed, or another one is');
select pg_temp.r6_check(private.ensure_objection_key() is false and (select count(*) from vault.secrets where name='invite_objection_key') = 1,
 'object_number: the key was made again');
-- Run again: already listed, nothing deleted, still one row and one secret.
select set_config('r6.out',pg_temp.r6_run(:'r6_object')::text,true);
select pg_temp.r6_check(current_setting('r6.out')::jsonb = '[{"result": {"already_listed": true, "invitations_deleted": 0,
  "removals_deleted": 0, "held_kept": 1}}]'::jsonb, 'object_number: the second run answered '||current_setting('r6.out'));
select pg_temp.r6_check((select count(*) from vault.secrets where name='invite_objection_key') = 1
 and (select count(*) from private.invite_objections) = 1, 'object_number: the second run changed the secret or the list');

-- listed_unavailable: Hana invites 92 and 93 on 87. 92, listed, reads unavailable and is stored nowhere; 93 is invited
-- by link as before; neither has a guest row or a notice.
do $$ declare v jsonb := pg_temp.r6_invite('01','87',array['447700900692','447700900693']);
begin
 perform pg_temp.r6_check(v = '[{"phone": "447700900692", "kind": "unavailable"}, {"phone": "447700900693", "kind": "link"}]'::jsonb,
  'listed_unavailable: the answer was '||v::text);
end $$;
select pg_temp.r6_check(not pg_temp.r6_invited_to('92','87')
 and (select count(*) from private.phone_invitations where phone='447700900692') = 1,
 'listed_unavailable: an invitation of the listed number was stored');
select pg_temp.r6_check(pg_temp.r6_invited_to('93','87'), 'listed_unavailable: the other number''s invitation was not stored');
select pg_temp.r6_check(not exists(select 1 from public.attendees where plan_id=pg_temp.a6('87'))
 and not exists(select 1 from private.notification_outbox where plan_id=pg_temp.a6('87')),
 'listed_unavailable: a guest row or a notice was made on 87');

-- listed_user (LI-4): Kai's number is listed (record_objection, as the script calls it), and Hana invites it: Kai is
-- on Resbite and in the app, so Kai is invited in the app, with a guest row and a notice.
select set_config('r6.out',private.record_objection('447700900625')::text,true);
select pg_temp.r6_check(current_setting('r6.out')::jsonb = '{"already_listed": false, "invitations_deleted": 0,
  "removals_deleted": 0, "held_kept": 0}'::jsonb and private.number_objected('447700900625'),
 'listed_user: Kai''s number was not listed: '||current_setting('r6.out'));
do $$ declare v jsonb := pg_temp.r6_invite('01','87',array['447700900625']);
begin
 perform pg_temp.r6_check(v = '[{"phone": "447700900625", "kind": "app"}]'::jsonb, 'listed_user: the answer was '||v::text);
end $$;
select pg_temp.r6_check(exists(select 1 from public.attendees where plan_id=pg_temp.a6('87') and user_id=pg_temp.a6('25') and response='pending')
 and exists(select 1 from private.notification_outbox where plan_id=pg_temp.a6('87') and recipient_id=pg_temp.a6('25') and kind='invited')
 and not pg_temp.r6_invited_to('25','87'), 'listed_user: Kai has no guest row or notice on 87, or a link invitation');

-- withdraw_objection: withdraw-objection.sql, its literal swapped, takes 92 off; Hana's next invitation of it takes the
-- link path again. Run again, it removes nothing. Kai's entry is untouched.
\set r6_withdraw `sed -e "s/'447700900000'/'447700900692'/" :'resbite_repo'/supabase/ops/withdraw-objection.sql`
select pg_temp.r6_check(position('''447700900692''' in :'r6_withdraw') > 0, 'withdraw_objection: the script''s literal was not swapped');
select set_config('r6.out',pg_temp.r6_run(:'r6_withdraw')::text,true);
select pg_temp.r6_check(current_setting('r6.out')::jsonb = '[{"removed": true}]'::jsonb,
 'withdraw_objection: the first run answered '||current_setting('r6.out'));
select pg_temp.r6_check(not private.number_objected('447700900692') and private.number_objected('447700900625')
 and (select count(*) from private.invite_objections) = 1, 'withdraw_objection: 92 is still listed, or Kai is not');
do $$ declare v jsonb := pg_temp.r6_invite('01','87',array['447700900692']);
begin
 perform pg_temp.r6_check(v = '[{"phone": "447700900692", "kind": "link"}]'::jsonb, 'withdraw_objection: the answer was '||v::text);
 perform pg_temp.r6_check(pg_temp.r6_invited_to('92','87'), 'withdraw_objection: the invitation by link was not stored');
end $$;
select set_config('r6.out',pg_temp.r6_run(:'r6_withdraw')::text,true);
select pg_temp.r6_check(current_setting('r6.out')::jsonb = '[{"removed": false}]'::jsonb,
 'withdraw_objection: the second run answered '||current_setting('r6.out'));
-- Once the list is empty, a withdrawal needs no key either.
select pg_temp.r6_check(private.withdraw_objection('447700900625'), 'withdraw_objection: Kai''s entry was not taken off');
select pg_temp.r6_check(not exists(select 1 from private.invite_objections), 'withdraw_objection: the list is not empty');
delete from vault.secrets where name='invite_objection_key';
select pg_temp.r6_check(private.withdraw_objection('447700900625') is false and private.number_objected('447700900625') is false,
 'withdraw_objection: on an empty list with no key, a withdrawal or a check did not answer false');

-- record_objection refuses what is not a number.
select pg_temp.r6_refused($$select private.record_objection('12')$$,'22023');
select pg_temp.r6_refused($$select private.record_objection(null)$$,'22023');
do $$ declare v_msg text;
begin
 begin
  perform private.record_objection('12');
 exception when others then
  get stacked diagnostics v_msg = message_text;
 end;
 perform pg_temp.r6_check(v_msg = 'Invalid number', 'record_objection: ''12'' was refused with '||coalesce(v_msg,'nothing'));
end $$;

-- Slice 5 (Task 5): orphan profile photos and replaced covers.

-- photos_covers_locked: the eight worker RPCs, photos' and covers' (each public wrapper and the private body it calls,
-- as 20260923152816_orphan_profile_photo_cleanup.sql:189-194 has them), are service_role's alone; the three guards and
-- the four remove and retire functions are nobody's; the four tables are closed to every API role, with row security
-- on. The private ones are security definer and the wrappers invoker, all with an empty search path. What this file
-- makes carries its marker; the carried photo functions and their trigger carry it exactly when the photo tables do
-- (made here, as on hosted; in the local replay the September file made them). The photo write guard, plan 2's or the
-- September file's, holds the retired-path lines. The cover guard fires on a cover_path write, between the deletion's
-- redaction and the revision counter.
do $$ declare r text; f text; s text; t text; v pg_catalog.pg_proc; v_here boolean;
begin
 foreach f in array array['claim_orphan_profile_photos(integer)','prepare_orphan_profile_photo(uuid,uuid)',
  'finish_orphan_profile_photo(uuid,uuid,boolean)','prune_profile_photo_cleanup()','claim_orphan_plan_covers(integer)',
  'prepare_orphan_plan_cover(uuid,uuid)','finish_orphan_plan_cover(uuid,uuid,boolean)','prune_plan_cover_cleanup()'] loop
  foreach s in array array['public.','private.'] loop
   perform pg_temp.r6_check(has_function_privilege('service_role',s||f,'execute'), 'photos_covers_locked: service_role may not execute '||s||f);
   foreach r in array array['public','anon','authenticated'] loop
    perform pg_temp.r6_check(not has_function_privilege(r,s||f,'execute'), 'photos_covers_locked: '||r||' may execute '||s||f);
   end loop;
   select * into v from pg_catalog.pg_proc p where p.oid = (s||f)::regprocedure;
   perform pg_temp.r6_check(v.prosecdef = (s = 'private.') and v.proconfig = array['search_path=""'],
    'photos_covers_locked: '||s||f||' is not '||case when s = 'private.' then 'security definer' else 'invoker' end||' with an empty search path');
  end loop;
 end loop;
 foreach f in array array['private.guard_photo_write()','private.guard_profile_photo_reference()','private.guard_plan_cover_reference()',
  'private.retire_profile_photo_now(uuid,text)','private.remove_profile_photo(uuid)','private.retire_plan_cover_now(text)',
  'private.remove_resbite_content(uuid,boolean,boolean,boolean,boolean)'] loop
  foreach r in array array['public','anon','authenticated','service_role'] loop
   perform pg_temp.r6_check(not has_function_privilege(r,f,'execute'), 'photos_covers_locked: '||r||' may execute '||f);
  end loop;
  select * into v from pg_catalog.pg_proc p where p.oid = f::regprocedure;
  perform pg_temp.r6_check(v.prosecdef and v.proconfig = array['search_path=""'],
   'photos_covers_locked: '||f||' is not security definer with an empty search path');
 end loop;
 foreach t in array array['private.profile_photo_retired_paths','private.profile_photo_cleanup_jobs','private.plan_cover_retired_paths',
  'private.plan_cover_cleanup_jobs'] loop
  foreach r in array array['public','anon','authenticated','service_role'] loop
   perform pg_temp.r6_check(not has_table_privilege(r,t,'select,insert,update,delete,truncate,references,trigger'),
    'photos_covers_locked: '||r||' may touch '||t);
  end loop;
  perform pg_temp.r6_check((select c.relrowsecurity from pg_catalog.pg_class c where c.oid = t::regclass),
   'photos_covers_locked: row security is off on '||t);
 end loop;
 foreach t in array array['private.plan_cover_retired_paths','private.plan_cover_cleanup_jobs'] loop
  perform pg_temp.r6_check(pg_catalog.obj_description(t::regclass,'pg_class') = 'resbite 20261117130000',
   'photos_covers_locked: '||t||' does not carry this file''s marker');
 end loop;
 foreach f in array array['private.guard_plan_cover_reference()','private.retire_profile_photo_now(uuid,text)',
  'private.remove_profile_photo(uuid)','private.retire_plan_cover_now(text)',
  'private.remove_resbite_content(uuid,boolean,boolean,boolean,boolean)','private.claim_orphan_plan_covers(integer)',
  'private.prepare_orphan_plan_cover(uuid,uuid)','private.finish_orphan_plan_cover(uuid,uuid,boolean)','private.prune_plan_cover_cleanup()',
  'public.claim_orphan_plan_covers(integer)','public.prepare_orphan_plan_cover(uuid,uuid)',
  'public.finish_orphan_plan_cover(uuid,uuid,boolean)','public.prune_plan_cover_cleanup()'] loop
  perform pg_temp.r6_check(pg_catalog.obj_description(f::regprocedure,'pg_proc') = 'resbite 20261117130000',
   'photos_covers_locked: '||f||' does not carry this file''s marker');
 end loop;
 v_here := pg_catalog.obj_description('private.profile_photo_cleanup_jobs'::regclass,'pg_class') is not distinct from 'resbite 20261117130000';
 perform pg_temp.r6_check(v_here = (pg_catalog.obj_description('private.profile_photo_retired_paths'::regclass,'pg_class')
  is not distinct from 'resbite 20261117130000'), 'photos_covers_locked: one photo table carries the marker, the other not');
 foreach f in array array['private.guard_profile_photo_reference()','private.claim_orphan_profile_photos(integer)',
  'private.prepare_orphan_profile_photo(uuid,uuid)','private.finish_orphan_profile_photo(uuid,uuid,boolean)',
  'private.prune_profile_photo_cleanup()','public.claim_orphan_profile_photos(integer)','public.prepare_orphan_profile_photo(uuid,uuid)',
  'public.finish_orphan_profile_photo(uuid,uuid,boolean)','public.prune_profile_photo_cleanup()'] loop
  perform pg_temp.r6_check((pg_catalog.obj_description(f::regprocedure,'pg_proc') is not distinct from 'resbite 20261117130000') = v_here,
   'photos_covers_locked: '||f||'''s marker does not follow the photo tables''');
 end loop;
 perform pg_temp.r6_check((select (pg_catalog.obj_description(t.oid,'pg_trigger') is not distinct from 'resbite 20261117130000') = v_here
   from pg_catalog.pg_trigger t where t.tgrelid = 'public.profiles'::regclass and t.tgname = 'resbite_profile_photo_reference_guard'),
  'photos_covers_locked: the photo reference trigger''s marker does not follow the photo tables''');
 perform pg_temp.r6_check(pg_catalog.obj_description('private.guard_photo_write()'::regprocedure,'pg_proc') is distinct from 'resbite 20261117130000'
  and (select p.prosrc like '%Photo path retired; choose a new photo%'
   and p.prosrc like '%delete from private.profile_photo_cleanup_jobs where path_hash=extensions.digest(new.name,''sha256'') and status=''observed''%'
   from pg_catalog.pg_proc p where p.oid = 'private.guard_photo_write()'::regprocedure),
  'photos_covers_locked: the photo write guard lacks the retired-path lines, or carries this file''s marker');
 perform pg_temp.r6_check((select pg_catalog.pg_get_triggerdef(t.oid) from pg_catalog.pg_trigger t
   where t.tgrelid = 'public.plans'::regclass and t.tgname = 'plans_retired_cover_guard')
  = 'CREATE TRIGGER plans_retired_cover_guard BEFORE INSERT OR UPDATE OF cover_path ON public.plans FOR EACH ROW EXECUTE FUNCTION private.guard_plan_cover_reference()'
  and (select pg_catalog.obj_description(t.oid,'pg_trigger') from pg_catalog.pg_trigger t
   where t.tgrelid = 'public.plans'::regclass and t.tgname = 'plans_retired_cover_guard') = 'resbite 20261117130000',
  'photos_covers_locked: the cover guard trigger is not as it should be');
 perform pg_temp.r6_check((select array_agg(t.tgname::text order by t.tgname) from pg_catalog.pg_trigger t
   where t.tgrelid = 'public.plans'::regclass and t.tgname in ('plans_redact_deleting_owner','plans_retired_cover_guard','plans_track_cover_revision'))
  = array['plans_redact_deleting_owner','plans_retired_cover_guard','plans_track_cover_revision'],
  'photos_covers_locked: the cover guard does not fire between the redaction and the revision counter');
 perform pg_temp.r6_check(exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid = 'storage.objects'::regclass
   and t.tgname = 'resbite_photo_write_guard' and t.tgfoid = 'private.guard_photo_write()'::regprocedure),
  'photos_covers_locked: the photo write guard''s trigger is missing');
end $$;

-- A refusal with this code and this message.
create function pg_temp.r6_refused_with(p_sql text, p_state text, p_msg text) returns void language plpgsql as $$
declare v_state text; v_msg text;
begin
 begin
  execute p_sql;
 exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
 end;
 if v_state is distinct from p_state or v_msg is distinct from p_msg then
  raise exception 'Expected % %, got % %: %', p_state, p_msg, coalesce(v_state,'no error'), coalesce(v_msg,''), p_sql;
 end if;
end $$;
-- A cover's path, <owner>/<plan>/<name>.jpg, and a profile photo's, <account>/<name>.jpg; each one's job and fence.
create function pg_temp.r6_cover(p_owner text, p_plan text, p_name text) returns text language sql immutable as $$
 select pg_temp.a6(p_owner)::text||'/'||pg_temp.a6(p_plan)::text||'/'||p_name||'.jpg' $$;
create function pg_temp.r6_photo(p_user text, p_name text) returns text language sql immutable as $$
 select pg_temp.a6(p_user)::text||'/'||p_name||'.jpg' $$;
create function pg_temp.r6_cover_job(p_path text) returns private.plan_cover_cleanup_jobs language sql as $$
 select j.* from private.plan_cover_cleanup_jobs j where j.path=p_path $$;
create function pg_temp.r6_cover_fenced(p_path text) returns boolean language sql as $$
 select exists(select 1 from private.plan_cover_retired_paths r where r.path_hash=extensions.digest(p_path,'sha256')) $$;
create function pg_temp.r6_photo_job(p_path text) returns private.profile_photo_cleanup_jobs language sql as $$
 select j.* from private.profile_photo_cleanup_jobs j where j.path=p_path $$;
create function pg_temp.r6_photo_fenced(p_path text) returns boolean language sql as $$
 select exists(select 1 from private.profile_photo_retired_paths r where r.path_hash=extensions.digest(p_path,'sha256')) $$;

-- The cast and the files, seeded under the roll's flag. Ida (26) hosts the weekly 89, whose next occurrence 90 shares
-- its cover C1, and the one-off 93, which a hold names, with its cover C6. Jon (27) is held; Lea (28) hosts 92. Cover
-- files: C1; C2, in 89's folder, attached nowhere; C3, in the folder of Jon's 97, which is gone; C4, in 92's folder,
-- attached nowhere; C6; C7, in 93's folder, attached nowhere; C9, in the folder of Lea's 94, which is gone. 89 and 90
-- have a guest note and meeting details, as has 93. Max (29) and Nia (30, held) have profile photos, a.jpg; Nia also
-- has b.jpg, and c.jpg, whose observation began before her hold.
select set_config('resbite.system','roll',true);
insert into auth.users(id,email,email_confirmed_at)
 select pg_temp.a6(n),'r6-'||n||'@resbite-test.invalid',now() from unnest(array['26','27','28','29','30']) n;
insert into public.profiles(id,display_name) values (pg_temp.a6('26'),'Ida'),(pg_temp.a6('27'),'Jon'),(pg_temp.a6('28'),'Lea');
insert into public.profiles(id,display_name,avatar_path) values
 (pg_temp.a6('29'),'Max',pg_temp.r6_photo('29','a')),(pg_temp.a6('30'),'Nia',pg_temp.r6_photo('30','a'));
insert into storage.objects(bucket_id,name) values
 ('plan-covers',pg_temp.r6_cover('26','89','c1')),('plan-covers',pg_temp.r6_cover('26','89','c2')),
 ('plan-covers',pg_temp.r6_cover('27','97','c3')),('plan-covers',pg_temp.r6_cover('28','92','c4')),
 ('plan-covers',pg_temp.r6_cover('26','93','c6')),('plan-covers',pg_temp.r6_cover('26','93','c7')),
 ('plan-covers',pg_temp.r6_cover('28','94','c9')),
 ('profile-photos',pg_temp.r6_photo('29','a')),('profile-photos',pg_temp.r6_photo('30','a')),
 ('profile-photos',pg_temp.r6_photo('30','b')),('profile-photos',pg_temp.r6_photo('30','c'));
insert into public.plans(id,owner_id,title,description,starts_at,ends_at,time_zone,place_label,categories,repeat_weeks,
 guest_note,guest_note_at,has_meeting_details,cover_path) values
 (pg_temp.a6('89'),pg_temp.a6('26'),'Swim','Lake swim',now()-interval '6 days 2 hours',now()-interval '6 days','UTC','Lake',
  array['physical'],1,'Bring a towel',now(),true,pg_temp.r6_cover('26','89','c1')),
 (pg_temp.a6('92'),pg_temp.a6('28'),'Bake','',now()+interval '6 days',now()+interval '6 days 2 hours','UTC','Kitchen',
  array['creative'],null,'',null,false,null),
 (pg_temp.a6('93'),pg_temp.a6('26'),'Talk','A talk',now()+interval '7 days',now()+interval '7 days 2 hours','UTC','Hall',
  array['intellectual'],null,'Doors at six',now(),true,pg_temp.r6_cover('26','93','c6'));
insert into public.plans(id,owner_id,title,description,starts_at,ends_at,time_zone,place_label,categories,repeat_weeks,
 guest_note,guest_note_at,has_meeting_details,cover_path,series_id,repeats_from) values
 (pg_temp.a6('90'),pg_temp.a6('26'),'Swim','Lake swim',now()+interval '1 day',now()+interval '1 day 2 hours','UTC','Lake',
  array['physical'],1,'Bring a towel',now(),true,pg_temp.r6_cover('26','89','c1'),pg_temp.a6('89'),pg_temp.a6('89'));
insert into public.plan_meeting_details(plan_id,note) values
 (pg_temp.a6('89'),'Gate code by the shed'),(pg_temp.a6('90'),'Gate code by the shed'),(pg_temp.a6('93'),'Room 2');
insert into private.legal_holds(user_id,reason,case_ref,review_on) values
 (pg_temp.a6('27'),'police','LE-2026-027',current_date+90),(pg_temp.a6('30'),'police','LE-2026-030',current_date+90);
insert into private.legal_holds(series_id,reason,case_ref,review_on) values (pg_temp.a6('93'),'court','CT-2026-093',current_date+90);
insert into private.profile_photo_cleanup_jobs(path_hash,user_id,path,object_id,observed_at)
 select extensions.digest(o.name,'sha256'),pg_temp.a6('30'),o.name,o.id,now()-interval '8 days'
 from storage.objects o where o.bucket_id='profile-photos' and o.name=pg_temp.r6_photo('30','c');
select set_config('resbite.system','',true);

-- covers_observed: the first claim takes nothing, as every observation is fresh. It observes C2, C4 and C9; not C1 or
-- C6, which occurrences use; not C3, whose owner is held; not C7, in the folder of a series a hold names.
do $$ declare v jsonb := public.claim_orphan_plan_covers(5);
begin
 perform pg_temp.r6_check(v = '[]'::jsonb, 'covers_observed: the first claim took '||v::text);
end $$;
select pg_temp.r6_check((select array_agg(j.path order by j.path) from private.plan_cover_cleanup_jobs j)
  = array[pg_temp.r6_cover('26','89','c2'),pg_temp.r6_cover('28','92','c4'),pg_temp.r6_cover('28','94','c9')]
 and (select bool_and(j.status='observed' and j.attempts=0 and j.owner_id=pg_temp.a6(substr(split_part(j.path,'/',1),35,2)))
  from private.plan_cover_cleanup_jobs j)
 and not exists(select 1 from private.plan_cover_retired_paths),
 'covers_observed: the observed covers are '||coalesce((select string_agg(j.path||' '||j.status,', ' order by j.path)
  from private.plan_cover_cleanup_jobs j),'none'));

-- cover_cleanup: once C2 has waited 7 days observed, the claim takes it for Ida and retires it; prepare names it for
-- deletion; finish refuses while the file is still there, and completes once Storage has removed it. The retired path
-- can't be attached again. Its receipt goes after 30 days; its fence stays while Ida's account does.
update private.plan_cover_cleanup_jobs set observed_at=now()-interval '8 days' where path=pg_temp.r6_cover('26','89','c2');
do $$ declare c2 text := pg_temp.r6_cover('26','89','c2'); v jsonb; v_job uuid; v_lease uuid; v_prep jsonb; v_state text; v_done boolean;
begin
 v := public.claim_orphan_plan_covers(5);
 perform pg_temp.r6_check(jsonb_array_length(v) = 1 and (v->0->>'jobId')::uuid = (pg_temp.r6_cover_job(c2)).job_id
  and (v->0->>'userId')::uuid = pg_temp.a6('26') and (v->0->>'attempts')::integer = 1 and v->0->>'leaseId' is not null,
  'cover_cleanup: the claim took '||v::text);
 v_job := (v->0->>'jobId')::uuid;
 v_lease := (v->0->>'leaseId')::uuid;
 perform pg_temp.r6_check(pg_temp.r6_cover_fenced(c2) and (pg_temp.r6_cover_job(c2)).status = 'processing',
  'cover_cleanup: C2 was not retired, or its job is not processing');
 v_prep := public.prepare_orphan_plan_cover(v_job,v_lease);
 perform pg_temp.r6_check(v_prep = jsonb_build_object('action','delete','path',c2), 'cover_cleanup: prepare answered '||v_prep::text);
 begin
  perform public.finish_orphan_plan_cover(v_job,v_lease,true);
 exception when others then
  get stacked diagnostics v_state = returned_sqlstate;
 end;
 perform pg_temp.r6_check(v_state = '22023', 'cover_cleanup: finish with the file still there answered '||coalesce(v_state,'no error'));
 -- Storage removes the file: the worker's HTTP call, simulated.
 delete from storage.objects where bucket_id='plan-covers' and name=c2;
 v_done := public.finish_orphan_plan_cover(v_job,v_lease,true);
 perform pg_temp.r6_check(v_done and (pg_temp.r6_cover_job(c2)).status = 'complete' and (pg_temp.r6_cover_job(c2)).completed_at is not null,
  'cover_cleanup: the job did not complete once the file was gone');
end $$;
select pg_temp.r6_refused_with($$update public.plans set cover_path=pg_temp.r6_cover('26','89','c2') where id=pg_temp.a6('89')$$,
 '42501','Cover retired; choose a new photo');
update private.plan_cover_cleanup_jobs set completed_at=now()-interval '31 days' where path=pg_temp.r6_cover('26','89','c2');
select pg_temp.r6_check(public.prune_plan_cover_cleanup() = 1, 'cover_cleanup: the old receipt was not pruned');
select pg_temp.r6_check((pg_temp.r6_cover_job(pg_temp.r6_cover('26','89','c2'))).job_id is null
 and pg_temp.r6_cover_fenced(pg_temp.r6_cover('26','89','c2')), 'cover_cleanup: the receipt stayed, or the fence went while Ida''s account is there');

-- covers_held: Lea's C4 and C9 are claimed together. Then a hold names the series 92: C4's prepare answers held, C9's
-- still delete, and once C4's lease has run out the next claim leaves it. Then a hold names Lea: C9's prepare answers
-- held too, and once its lease has run out the next claim leaves it. The worker keeps both files. Jon's C3 and the held
-- series' C7 are still not observed.
update private.plan_cover_cleanup_jobs set observed_at=now()-interval '8 days'
 where path in (pg_temp.r6_cover('28','92','c4'),pg_temp.r6_cover('28','94','c9'));
do $$ declare c4 text := pg_temp.r6_cover('28','92','c4'); c9 text := pg_temp.r6_cover('28','94','c9'); v jsonb; v_prep jsonb;
 j4 uuid; l4 uuid; j9 uuid; l9 uuid;
begin
 v := public.claim_orphan_plan_covers(5);
 perform pg_temp.r6_check(jsonb_array_length(v) = 2 and (v->0->>'jobId')::uuid = (pg_temp.r6_cover_job(c4)).job_id
  and (v->1->>'jobId')::uuid = (pg_temp.r6_cover_job(c9)).job_id
  and (v->0->>'userId')::uuid = pg_temp.a6('28') and (v->1->>'userId')::uuid = pg_temp.a6('28'), 'covers_held: the claim took '||v::text);
 j4 := (v->0->>'jobId')::uuid; l4 := (v->0->>'leaseId')::uuid; j9 := (v->1->>'jobId')::uuid; l9 := (v->1->>'leaseId')::uuid;
 insert into private.legal_holds(series_id,reason,case_ref,review_on) values (pg_temp.a6('92'),'ofcom','OF-2026-092',current_date+90);
 v_prep := public.prepare_orphan_plan_cover(j4,l4);
 perform pg_temp.r6_check(v_prep = '{"action": "held"}'::jsonb, 'covers_held: prepare under a series hold answered '||v_prep::text);
 v_prep := public.prepare_orphan_plan_cover(j9,l9);
 perform pg_temp.r6_check(v_prep = jsonb_build_object('action','delete','path',c9), 'covers_held: prepare of C9 answered '||v_prep::text);
 update private.plan_cover_cleanup_jobs set lease_until=now()-interval '1 second' where path=c4;
 v := public.claim_orphan_plan_covers(5);
 perform pg_temp.r6_check(v = '[]'::jsonb, 'covers_held: the claim after the series hold took '||v::text);
 insert into private.legal_holds(user_id,reason,case_ref,review_on) values (pg_temp.a6('28'),'nca','NCA-2026-028',current_date+90);
 v_prep := public.prepare_orphan_plan_cover(j9,l9);
 perform pg_temp.r6_check(v_prep = '{"action": "held"}'::jsonb, 'covers_held: prepare under an account hold answered '||v_prep::text);
 update private.plan_cover_cleanup_jobs set lease_until=now()-interval '1 second' where path=c9;
 v := public.claim_orphan_plan_covers(5);
 perform pg_temp.r6_check(v = '[]'::jsonb, 'covers_held: the claim after the account hold took '||v::text);
 perform pg_temp.r6_check((select count(*) from storage.objects where bucket_id='plan-covers' and name in (c4,c9)) = 2,
  'covers_held: a held file went');
end $$;
select pg_temp.r6_check((pg_temp.r6_cover_job(pg_temp.r6_cover('27','97','c3'))).job_id is null
 and (pg_temp.r6_cover_job(pg_temp.r6_cover('26','93','c7'))).job_id is null
 and not pg_temp.r6_cover_fenced(pg_temp.r6_cover('27','97','c3')) and not pg_temp.r6_cover_fenced(pg_temp.r6_cover('26','93','c7')),
 'covers_held: a held owner''s cover, or one in a held series'' folder, was observed or retired');

-- cover_retire_now: retire_plan_cover_now queues C5, new in 89's folder and attached nowhere, at once, and the next claim
-- takes it. It refuses (false) a cover an occurrence uses (C1), a held owner's (C3), one in a held series' folder (C7),
-- one that is not there, a path that is not a cover's, and null.
insert into storage.objects(bucket_id,name) values ('plan-covers',pg_temp.r6_cover('26','89','c5'));
select pg_temp.r6_check(private.retire_plan_cover_now(pg_temp.r6_cover('26','89','c5')) is true, 'cover_retire_now: C5 was not queued');
select pg_temp.r6_check(pg_temp.r6_cover_fenced(pg_temp.r6_cover('26','89','c5'))
 and (pg_temp.r6_cover_job(pg_temp.r6_cover('26','89','c5'))).status = 'queued', 'cover_retire_now: C5 is not retired and queued');
do $$ declare v jsonb := public.claim_orphan_plan_covers(5);
begin
 perform pg_temp.r6_check(jsonb_array_length(v) = 1
  and (v->0->>'jobId')::uuid = (pg_temp.r6_cover_job(pg_temp.r6_cover('26','89','c5'))).job_id
  and (v->0->>'userId')::uuid = pg_temp.a6('26'), 'cover_retire_now: the claim took '||v::text);
end $$;
do $$ declare p text;
begin
 foreach p in array array[pg_temp.r6_cover('26','89','c1'),pg_temp.r6_cover('27','97','c3'),pg_temp.r6_cover('26','93','c7'),
  pg_temp.r6_cover('26','89','c8'),pg_temp.a6('26')::text||'/../c1.jpg'] loop
  perform pg_temp.r6_check(private.retire_plan_cover_now(p) is false, 'cover_retire_now: '||p||' was queued');
  perform pg_temp.r6_check(not pg_temp.r6_cover_fenced(p) and (pg_temp.r6_cover_job(p)).job_id is null,
   'cover_retire_now: '||p||' was retired or has a job');
 end loop;
 perform pg_temp.r6_check(private.retire_plan_cover_now(null) is false, 'cover_retire_now: null did not answer false');
end $$;

-- resbite_content_removed: the team takes down 89's title, notes and cover. Both occurrences of the weekly read
-- 'Resbite', with no cover, no meeting details and no guest note, each one version on; the description stays. C1,
-- which both used, is queued once, and attaching it again is refused. A second run changes nothing. On 93, which a hold
-- names, the content goes but the file stays: nothing is queued. An unknown resbite is refused.
do $$ declare v jsonb; v89 integer; v90 integer; c1 text := pg_temp.r6_cover('26','89','c1');
begin
 select p.version into v89 from public.plans p where p.id=pg_temp.a6('89');
 select p.version into v90 from public.plans p where p.id=pg_temp.a6('90');
 v := private.remove_resbite_content(pg_temp.a6('89'),true,false,true,true);
 perform pg_temp.r6_check(v = '{"occurrences": 2, "covers_queued": 1, "held": false}'::jsonb,
  'resbite_content_removed: the takedown answered '||v::text);
 perform pg_temp.r6_check((select count(*) from public.plans p where p.series_id=pg_temp.a6('89') and p.title='Resbite'
   and p.description='Lake swim' and p.cover_path is null and p.cover_description='' and p.guest_note='' and p.guest_note_at is null
   and not p.has_meeting_details) = 2
  and not exists(select 1 from public.plan_meeting_details d where d.plan_id in (pg_temp.a6('89'),pg_temp.a6('90'))),
  'resbite_content_removed: an occurrence kept its title, notes or cover, or lost its description');
 perform pg_temp.r6_check((select p.version from public.plans p where p.id=pg_temp.a6('89')) = v89+1
  and (select p.version from public.plans p where p.id=pg_temp.a6('90')) = v90+1, 'resbite_content_removed: not one version on each');
 perform pg_temp.r6_check((select count(*) from private.plan_cover_cleanup_jobs j where j.path=c1) = 1
  and (pg_temp.r6_cover_job(c1)).status = 'queued' and pg_temp.r6_cover_fenced(c1), 'resbite_content_removed: C1 is not queued once');
 v := private.remove_resbite_content(pg_temp.a6('90'),true,false,true,true);
 perform pg_temp.r6_check(v = '{"occurrences": 0, "covers_queued": 0, "held": false}'::jsonb,
  'resbite_content_removed: the second takedown answered '||v::text);
end $$;
select pg_temp.r6_refused_with($$update public.plans set cover_path=pg_temp.r6_cover('26','89','c1') where id=pg_temp.a6('90')$$,
 '42501','Cover retired; choose a new photo');
do $$ declare v jsonb; c6 text := pg_temp.r6_cover('26','93','c6');
begin
 v := private.remove_resbite_content(pg_temp.a6('93'),true,true,true,true);
 perform pg_temp.r6_check(v = '{"occurrences": 1, "covers_queued": 0, "held": true}'::jsonb,
  'resbite_content_removed: the takedown on the held series answered '||v::text);
 perform pg_temp.r6_check((select p.title='Resbite' and p.description='' and p.cover_path is null and p.guest_note=''
   and not p.has_meeting_details from public.plans p where p.id=pg_temp.a6('93'))
  and not exists(select 1 from public.plan_meeting_details d where d.plan_id=pg_temp.a6('93')),
  'resbite_content_removed: the held series kept its content');
 perform pg_temp.r6_check((pg_temp.r6_cover_job(c6)).job_id is null and not pg_temp.r6_cover_fenced(c6)
  and exists(select 1 from storage.objects where bucket_id='plan-covers' and name=c6),
  'resbite_content_removed: the held series'' cover was queued, retired or removed');
end $$;
select pg_temp.r6_refused($$select private.remove_resbite_content(pg_temp.a6('98'),true,true,true,true)$$,'P0002');

-- photo_removed: remove_profile_photo takes Max's photo off his profile and queues the file, which the next claim takes
-- at once; a hold set after the claim makes prepare answer held, and its lift lets the file go. Nia is held: her photo
-- comes off her profile but the file stays and nothing is queued; b.jpg is never observed; c.jpg, observed before her
-- hold, stays as it was. A second removal finds no photo.
do $$ declare v jsonb := private.remove_profile_photo(pg_temp.a6('29'));
begin
 perform pg_temp.r6_check(v = '{"detached": true, "queued": true, "held": false}'::jsonb, 'photo_removed: Max''s removal answered '||v::text);
end $$;
select pg_temp.r6_check((select p.avatar_path is null from public.profiles p where p.id=pg_temp.a6('29'))
 and pg_temp.r6_photo_fenced(pg_temp.r6_photo('29','a')) and (pg_temp.r6_photo_job(pg_temp.r6_photo('29','a'))).status = 'queued',
 'photo_removed: Max''s photo is still on his profile, or its file is not retired and queued');
-- The fence holds in Storage too: the retired path can't be written again, nor attached.
select pg_temp.r6_refused_with($$insert into storage.objects(bucket_id,name) values ('profile-photos',pg_temp.r6_photo('29','a'))$$,
 '42501','Photo path retired; choose a new photo');
select pg_temp.r6_refused_with($$update public.profiles set avatar_path=pg_temp.r6_photo('29','a') where id=pg_temp.a6('29')$$,
 '42501','Photo path retired; choose a new photo');
do $$ declare a text := pg_temp.r6_photo('29','a'); v jsonb; v_prep jsonb;
begin
 v := public.claim_orphan_profile_photos(5);
 perform pg_temp.r6_check(jsonb_array_length(v) = 1 and (v->0->>'jobId')::uuid = (pg_temp.r6_photo_job(a)).job_id
  and (v->0->>'userId')::uuid = pg_temp.a6('29'), 'photo_removed: the claim took '||v::text);
 insert into private.legal_holds(user_id,reason,case_ref,review_on) values (pg_temp.a6('29'),'claim','CL-2026-029',current_date+90);
 v_prep := public.prepare_orphan_profile_photo((v->0->>'jobId')::uuid,(v->0->>'leaseId')::uuid);
 perform pg_temp.r6_check(v_prep = '{"action": "held"}'::jsonb, 'photo_removed: prepare under a hold answered '||v_prep::text);
 update private.legal_holds set lifted_at=now() where user_id=pg_temp.a6('29') and lifted_at is null;
 v_prep := public.prepare_orphan_profile_photo((v->0->>'jobId')::uuid,(v->0->>'leaseId')::uuid);
 perform pg_temp.r6_check(v_prep = jsonb_build_object('action','delete','path',a), 'photo_removed: prepare after the lift answered '||v_prep::text);
end $$;
do $$ declare v jsonb := private.remove_profile_photo(pg_temp.a6('30'));
begin
 perform pg_temp.r6_check(v = '{"detached": true, "queued": false, "held": true}'::jsonb, 'photo_removed: Nia''s removal answered '||v::text);
end $$;
select pg_temp.r6_check((select p.avatar_path is null from public.profiles p where p.id=pg_temp.a6('30'))
 and not pg_temp.r6_photo_fenced(pg_temp.r6_photo('30','a')) and (pg_temp.r6_photo_job(pg_temp.r6_photo('30','a'))).job_id is null
 and exists(select 1 from storage.objects where bucket_id='profile-photos' and name=pg_temp.r6_photo('30','a')),
 'photo_removed: Nia''s photo is still on her profile, or its file was retired, queued or removed');
do $$ declare v jsonb := public.claim_orphan_profile_photos(5);
begin
 perform pg_temp.r6_check(v = '[]'::jsonb, 'photo_removed: the claim after Nia''s removal took '||v::text);
end $$;
select pg_temp.r6_check((pg_temp.r6_photo_job(pg_temp.r6_photo('30','a'))).job_id is null
 and (pg_temp.r6_photo_job(pg_temp.r6_photo('30','b'))).job_id is null
 and (select j.status = 'observed' and j.attempts = 0 and j.observed_at < now()-interval '7 days'
  from private.profile_photo_cleanup_jobs j where j.path=pg_temp.r6_photo('30','c'))
 and not exists(select 1 from private.profile_photo_retired_paths r where r.user_id=pg_temp.a6('30')),
 'photo_removed: a held account''s photo was observed, or its earlier observation changed');
select pg_temp.r6_check(private.remove_profile_photo(pg_temp.a6('29')) = '{"detached": false, "queued": false, "held": false}'::jsonb,
 'photo_removed: a second removal found a photo');

rollback;
