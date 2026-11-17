-- Retention and team tools (20261117130000_retention_and_team_tools.sql, App Store readiness plan 6; spec C3, C4 and
-- C6). Slice 1 (Task 1): the legal hold and the suspension history are closed to every API role, as are the four hold
-- and retention helpers; a hold names one account or one series, with a listed reason; series_under_hold reaches what a
-- held person hosted, joined or wrote in; series_end is null while the roll can still add an occurrence, else the
-- current occurrence's end. Later slices add the purges, the do-not-invite list and the photo and cover cleanup.
-- Synthetic identities only: ids a6000000-0000-4000-8000-0000000000NN through pg_temp.a6(text), users 01 to 49 and
-- plans 51 to 99 (each plan its own series unless it says otherwise); emails r6-NN@resbite-test.invalid; numbers
-- 4477009006NN. One rolled-back block.
-- Users a6…: 01 Hana, held, then lifted; 02 Ola, hosts the one-off 52; 03 Gus, a guest on 52; 04 Wen, wrote in 52's
-- chat; 05 Rob, hosts the series the series_end checks read.
-- Series a6…: 51 named by a hold (no plan: a hold names a series id); 52 Ola's one-off tomorrow; 53 a one-off that
-- ended 2 days ago; 54 a weekly running now; 55 a weekly whose current occurrence (56, repeating from 55) stopped
-- repeating and ended 3 days ago; 57 a weekly that ended 3 days ago, stopped, its chat closed; 58 a weekly that ended 3
-- days ago, not stopped, which the roll has yet to carry.
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

rollback;
