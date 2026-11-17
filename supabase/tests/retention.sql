-- Retention and team tools (20261117130000_retention_and_team_tools.sql, App Store readiness plan 6; spec C3, C4 and
-- C6). Slice 1 (Task 1): the legal hold and the suspension history are closed to every API role, as are the four hold
-- and retention helpers; a hold names one account or one series, with a listed reason; series_under_hold reaches what a
-- held person hosted, joined or wrote in; series_end is null while the roll can still add an occurrence, else the
-- current occurrence's end. Slice 2 (Task 2): each row purge takes what is due and nothing else, skips what a hold
-- keeps, takes it at the next run once the hold is lifted, and stops at its limit; run_retention runs the eight and
-- answers their counts, a failing one as null. Later slices add the series purges, the do-not-invite list and the
-- photo and cover cleanup.
-- Synthetic identities only: ids a6000000-0000-4000-8000-0000000000NN through pg_temp.a6(text), users 01 to 49 and
-- plans 51 to 99 (each plan its own series unless it says otherwise); emails r6-NN@resbite-test.invalid; numbers
-- 4477009006NN (an account's NN is its user number; the numbers of people not on Resbite are 81 to 89). One
-- rolled-back block.
-- Users a6…: 01 Hana, held, then lifted (slice 1), hosts slice 2's resbites; 02 Ola, hosts the one-off 52; 03 Gus, a
-- guest on 52; 04 Wen, wrote in 52's chat; 05 Rob, hosts the series the series_end checks read, held in slice 2 while
-- the invitations are purged, then lifted; 06 Ana, 07 Ben; 08 Cal, leaving (deletion asked); 09 Ivo, held through
-- slice 2, lifted before the last run.
-- Series a6…: 51 named by a hold (no plan: a hold names a series id); 52 Ola's one-off tomorrow; 53 a one-off that
-- ended 2 days ago; 54 a weekly running now; 55 a weekly whose current occurrence (56, repeating from 55) stopped
-- repeating and ended 3 days ago; 57 a weekly that ended 3 days ago, stopped, its chat closed; 58 a weekly that ended 3
-- days ago, not stopped, which the roll has yet to carry.
-- Slice 2's, all Hana's: 60 a one-off in 2 days; 61 a one-off that ended 31 days ago; 62 one that ended 29 days ago;
-- 63 one that ended 31 days ago, named by a hold; 64 one that ended 31 days ago; 65 one that ended 29 days ago; 66 a
-- weekly whose current occurrence (67) stopped repeating and ended 60 days ago; 68 the same (69) ended 91 days ago; 71
-- a weekly that began 200 days ago and still rolls (72 is next week's); 96 a series with no plan left.
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
select set_config('resbite.system','',true);

-- Slice 1 (Task 1): the legal hold and the retention helpers.

-- holds_locked: no API role may touch either table or call any of the four helpers; row security is on.
do $$ declare r text; f text;
begin
 foreach r in array array['anon','authenticated','service_role'] loop
  perform pg_temp.r6_check(not has_table_privilege(r,'private.legal_holds','select,insert,update,delete')
   and not has_table_privilege(r,'private.suspension_history','select,insert,update,delete'), 'holds_locked: '||r||' may touch a hold table');
  foreach f in array array['private.account_held(uuid)','private.series_held(uuid)','private.series_under_hold(uuid)','private.series_end(uuid)'] loop
   perform pg_temp.r6_check(not has_function_privilege(r,f,'execute'), 'holds_locked: '||r||' may execute '||f);
  end loop;
 end loop;
 perform pg_temp.r6_check(not exists(select 1 from pg_catalog.pg_class c
   where c.oid in ('private.legal_holds'::regclass,'private.suspension_history'::regclass) and not c.relrowsecurity),
  'holds_locked: row security is off on a hold table');
end $$;

-- holds_shared: plan 2's migration runs first and made the shared three, which this file found in place; this file
-- made series_held and the two helpers. Each helper is SQL, stable, security definer, with an empty search path.
do $$ declare f text; v pg_catalog.pg_proc;
begin
 perform pg_temp.r6_check(pg_catalog.obj_description('private.legal_holds'::regclass,'pg_class') = 'resbite 20261117110000'
  and pg_catalog.obj_description('private.suspension_history'::regclass,'pg_class') = 'resbite 20261117110000'
  and pg_catalog.obj_description('private.account_held(uuid)'::regprocedure,'pg_proc') = 'resbite 20261117110000',
  'holds_shared: a shared object does not carry plan 2''s marker');
 foreach f in array array['private.series_held(uuid)','private.series_under_hold(uuid)','private.series_end(uuid)'] loop
  perform pg_temp.r6_check(pg_catalog.obj_description(f::regprocedure,'pg_proc') = 'resbite 20261117130000',
   'holds_shared: '||f||' does not carry this file''s marker');
 end loop;
 foreach f in array array['private.account_held(uuid)','private.series_held(uuid)','private.series_under_hold(uuid)','private.series_end(uuid)'] loop
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
 (pg_temp.a6('71'),pg_temp.a6('01'),'Knit',now()-interval '200 days 2 hours',now()-interval '200 days','UTC','Library',array['creative'],1);
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
-- Invitations by number, each number its own: 81 revoked, on a resbite still to come; 82 unanswered, 31 days after;
-- 83 answered, 29 days after; 84 sent by Rob, 85 brought by Rob, 86 answered by Rob, each 31 days after; 87 on the held
-- series 63; 88 unanswered, 29 days after.
insert into private.phone_invitations(plan_id,phone,country,invited_by,brought_by,user_id,answered_at,revoked_at) values
 (pg_temp.a6('60'),'447700900681','44',pg_temp.a6('01'),null,null,null,now()-interval '1 day'),
 (pg_temp.a6('61'),'447700900682','44',pg_temp.a6('01'),null,null,null,null),
 (pg_temp.a6('62'),'447700900683','44',pg_temp.a6('01'),null,pg_temp.a6('06'),now()-interval '30 days',null),
 (pg_temp.a6('61'),'447700900684','44',pg_temp.a6('05'),null,null,null,null),
 (pg_temp.a6('61'),'447700900685','44',pg_temp.a6('01'),pg_temp.a6('05'),null,null,null),
 (pg_temp.a6('61'),'447700900686','44',pg_temp.a6('01'),null,pg_temp.a6('05'),now()-interval '32 days',null),
 (pg_temp.a6('63'),'447700900687','44',pg_temp.a6('01'),null,null,null,null),
 (pg_temp.a6('62'),'447700900688','44',pg_temp.a6('01'),null,null,null,null);
-- Removals: a number on the one-off 64 and Ivo's own row on it; numbers on 65, 66, 68, 96 (no plan), 51 (no plan,
-- held) and 63 (held); Ana's row on the rolling 71.
insert into private.plan_removals(series_id,user_id,phone) values
 (pg_temp.a6('64'),null,'447700900681'),(pg_temp.a6('64'),pg_temp.a6('09'),null),(pg_temp.a6('65'),null,'447700900682'),
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
-- days ago, about Cal's words, filed by Ivo.
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
select pg_temp.r6_check(pg_temp.r6_removal('64','09'), 'plan_removals: held Ivo''s row goes');

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
create or replace function private.purge_link_opens(p_limit integer default 5000) returns integer language plpgsql
security definer set search_path = '' as $$ begin raise exception 'r6: failing on purpose'; end $$;
select pg_temp.r6_check((select v->'link_opens' = 'null'::jsonb and jsonb_typeof(v->'suspension_history') = 'number'
  and jsonb_typeof(v->'phone_invitations') = 'number' from (select private.run_retention() v) x),
 'run_retention: a failing purge does not read null, or stops the run');
rollback to savepoint r6_failing;

-- run_retention after Ivo's hold is lifted: exactly the eight keys, each a number, and what his hold kept goes;
-- what the hold on series 63 keeps stays.
update private.legal_holds set lifted_at=now() where user_id=pg_temp.a6('09') and lifted_at is null;
do $$ declare v jsonb := private.run_retention(); k text;
begin
 perform pg_temp.r6_check((select array_agg(x order by x) from jsonb_object_keys(v) x) = array['closed_reports','connection_refusals',
  'connection_requests','link_opens','notifications','phone_invitations','plan_removals','suspension_history'],
  'run_retention: not exactly the eight keys: '||v::text);
 for k in select jsonb_object_keys(v) loop
  perform pg_temp.r6_check(jsonb_typeof(v->k) = 'number', 'run_retention: '||k||' is not a number: '||v::text);
 end loop;
 perform pg_temp.r6_check(v = '{"phone_invitations": 0, "plan_removals": 1, "connection_refusals": 1, "connection_requests": 1,
  "notifications": 2, "link_opens": 1, "closed_reports": 2, "suspension_history": 1}'::jsonb,
  'run_retention: after the lift it did not take exactly what Ivo''s hold kept: '||v::text);
end $$;
select pg_temp.r6_check(not pg_temp.r6_removal('64','09')
 and not exists(select 1 from private.connection_refusals where to_user=pg_temp.a6('09'))
 and not exists(select 1 from public.connections where pg_temp.a6('09') in (user_a,user_b))
 and not pg_temp.r6_notice('held-recipient') and not pg_temp.r6_notice('held-actor') and not pg_temp.r6_report('D')
 and not exists(select 1 from private.suspension_history where user_id=pg_temp.a6('09')),
 'run_retention: a record Ivo''s hold kept stays once it is lifted');
select pg_temp.r6_check((select target_user_id is null and frozen_author is null from private.reports where details='r6-G'),
 'run_retention: the report Ivo filed still names leaving Cal once Ivo''s hold is lifted');
select pg_temp.r6_check(pg_temp.r6_invited('87') and pg_temp.r6_removal('63','87') and pg_temp.r6_report('F')
 and pg_temp.r6_removal('51','86'), 'run_retention: a record on a held series went');

rollback;
