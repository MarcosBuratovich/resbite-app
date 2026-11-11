-- Circles of trust (docs/superpowers/plans/2026-11-10-connections-2-circles-of-trust.md, Task 1;
-- docs/superpowers/specs/2026-11-10-connections-and-circles-design.md, CO-D4, CO-D5, CO-P8–P13, CO-P15): a host lets
-- each guest bring people (invites) and says how far that trust travels (levels); a guest brings a connection or a
-- phone contact, who joins without approval; a person the host removed is not brought straight back. Synthetic
-- identities only (emails co2-…; ids with the prefix f6, as co2 is not hexadecimal); one rolled-back block per slice.
--
-- The cast, made afresh in each slice by pg_temp.co2_cast() below. Users f6…: 01 'Ana Host', the owner; 02 'Pedro P',
-- Going; 03 'Marta M', Maybe; 04 'Guest Four', not answered; 05 'Guest Five', Can't go; 06 'Clara C' and 07 'Tomas T',
-- connections of 02 (06 also of 01); 08 'Sol S', a connection of 03; 09, 10 and 11, phone-only (no email, no profile,
-- no grant until they answer a link); 12 'Ada Admin', Going and an admin; 13 'Stan S', a stranger who asked through the
-- link (waiting) and is a connection of 02. 06, 07, 08 and 13 are not on the resbite. Everyone has a confirmed phone,
-- 4477009006 followed by their number. 01–06, 08, 12 and 13 have used the app; 07 and 09–11 have not, so their numbers
-- give 'link' (an item by user needs no app session). Plan f61…01 'Board game night' is 01's, open, its own series.
-- Its base circle is (1,1): each guest may bring one person, one level deep. Each slice says every change it makes
-- to the circle, as set_plan_circle(invites, levels).

-- Helpers, for this file's session only (temporary: gone with it).
create function pg_temp.co2(p text) returns uuid language sql immutable as $$ select ('f6000000-0000-4000-8000-0000000000'||p)::uuid $$;
create function pg_temp.co2p() returns uuid language sql immutable as $$ select 'f6100000-0000-4000-8000-000000000001'::uuid $$;
create function pg_temp.co2_phone(p text) returns text language sql immutable as $$ select '4477009006'||p $$;
create function pg_temp.co2_user(p text) returns jsonb language sql immutable as $$ select jsonb_build_object('user',pg_temp.co2(p)) $$;
create function pg_temp.co2_number(p text, c text) returns jsonb language sql immutable as $$
 select jsonb_build_object('phone',pg_temp.co2_phone(p),'country','44','code',repeat(c,22))
$$;
-- Acting as someone: the claims auth.uid() reads (the role is set apart, set local role authenticated).
create function pg_temp.co2_as(p text) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.co2(p),'role','authenticated')::text,true)
$$;
-- The kinds of an invite_contacts reply, in order: 'app,already'.
create function pg_temp.co2_kinds(r jsonb) returns text language sql immutable as $$
 select string_agg(e.value->>'kind',',' order by e.ordinality) from jsonb_array_elements(r) with ordinality e
$$;
create function pg_temp.co2_check(p_ok boolean, p_what text) returns void language plpgsql as $$
begin
 if p_ok is not true then raise exception '%', p_what; end if;
end $$;
-- A call that must be refused with exactly this code and message. The refusal undoes the call, as a real one would.
create function pg_temp.co2_refused(p_sql text, p_state text, p_message text) returns void language plpgsql as $$
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
-- The cast (see the header).
create function pg_temp.co2_cast() returns void language sql as $cast$
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values
 ('f6000000-0000-4000-8000-000000000001','co2-owner@resbite-test.invalid',now(),'447700900601',now()),
 ('f6000000-0000-4000-8000-000000000002','co2-going@resbite-test.invalid',now(),'447700900602',now()),
 ('f6000000-0000-4000-8000-000000000003','co2-maybe@resbite-test.invalid',now(),'447700900603',now()),
 ('f6000000-0000-4000-8000-000000000004','co2-pending@resbite-test.invalid',now(),'447700900604',now()),
 ('f6000000-0000-4000-8000-000000000005','co2-cant-go@resbite-test.invalid',now(),'447700900605',now()),
 ('f6000000-0000-4000-8000-000000000006','co2-clara@resbite-test.invalid',now(),'447700900606',now()),
 ('f6000000-0000-4000-8000-000000000007','co2-tomas@resbite-test.invalid',now(),'447700900607',now()),
 ('f6000000-0000-4000-8000-000000000008','co2-sol@resbite-test.invalid',now(),'447700900608',now()),
 ('f6000000-0000-4000-8000-000000000009',null,null,'447700900609',now()),
 ('f6000000-0000-4000-8000-000000000010',null,null,'447700900610',now()),
 ('f6000000-0000-4000-8000-000000000011',null,null,'447700900611',now()),
 ('f6000000-0000-4000-8000-000000000012','co2-admin@resbite-test.invalid',now(),'447700900612',now()),
 ('f6000000-0000-4000-8000-000000000013','co2-stranger@resbite-test.invalid',now(),'447700900613',now());
insert into private.tester_roster(email) values ('co2-owner@resbite-test.invalid'),('co2-going@resbite-test.invalid'),
 ('co2-maybe@resbite-test.invalid'),('co2-pending@resbite-test.invalid'),('co2-cant-go@resbite-test.invalid'),
 ('co2-clara@resbite-test.invalid'),('co2-tomas@resbite-test.invalid'),('co2-sol@resbite-test.invalid'),
 ('co2-admin@resbite-test.invalid'),('co2-stranger@resbite-test.invalid');
insert into public.profiles(id,display_name) values
 ('f6000000-0000-4000-8000-000000000001','Ana Host'),('f6000000-0000-4000-8000-000000000002','Pedro P'),
 ('f6000000-0000-4000-8000-000000000003','Marta M'),('f6000000-0000-4000-8000-000000000004','Guest Four'),
 ('f6000000-0000-4000-8000-000000000005','Guest Five'),('f6000000-0000-4000-8000-000000000006','Clara C'),
 ('f6000000-0000-4000-8000-000000000007','Tomas T'),('f6000000-0000-4000-8000-000000000008','Sol S'),
 ('f6000000-0000-4000-8000-000000000012','Ada Admin'),('f6000000-0000-4000-8000-000000000013','Stan S');
insert into private.app_sessions(user_id) select ('f6000000-0000-4000-8000-0000000000'||n)::uuid
 from unnest(array['01','02','03','04','05','06','08','12','13']) n;
insert into public.plans(id,owner_id,title,starts_at,ends_at,time_zone,place_label,categories,bring_invites,bring_levels) values
 ('f6100000-0000-4000-8000-000000000001','f6000000-0000-4000-8000-000000000001','Board game night',
  '2099-06-04 19:00+00','2099-06-04 22:00+00','UTC','Kitchen',array['community'],1,1);
insert into public.attendees(plan_id,user_id,response) values
 ('f6100000-0000-4000-8000-000000000001','f6000000-0000-4000-8000-000000000002','accepted'),
 ('f6100000-0000-4000-8000-000000000001','f6000000-0000-4000-8000-000000000003','maybe'),
 ('f6100000-0000-4000-8000-000000000001','f6000000-0000-4000-8000-000000000004','pending'),
 ('f6100000-0000-4000-8000-000000000001','f6000000-0000-4000-8000-000000000005','declined'),
 ('f6100000-0000-4000-8000-000000000001','f6000000-0000-4000-8000-000000000012','accepted');
insert into public.plan_admins(plan_id,user_id,appointed_by) values
 ('f6100000-0000-4000-8000-000000000001','f6000000-0000-4000-8000-000000000012','f6000000-0000-4000-8000-000000000001');
insert into private.join_requests(plan_id,user_id,response) values
 ('f6100000-0000-4000-8000-000000000001','f6000000-0000-4000-8000-000000000013','accepted');
insert into public.connections(user_a,user_b,state,requested_by,accepted_at) values
 ('f6000000-0000-4000-8000-000000000001','f6000000-0000-4000-8000-000000000006','connected','f6000000-0000-4000-8000-000000000001',now()),
 ('f6000000-0000-4000-8000-000000000002','f6000000-0000-4000-8000-000000000006','connected','f6000000-0000-4000-8000-000000000002',now()),
 ('f6000000-0000-4000-8000-000000000002','f6000000-0000-4000-8000-000000000007','connected','f6000000-0000-4000-8000-000000000002',now()),
 ('f6000000-0000-4000-8000-000000000002','f6000000-0000-4000-8000-000000000013','connected','f6000000-0000-4000-8000-000000000002',now()),
 ('f6000000-0000-4000-8000-000000000003','f6000000-0000-4000-8000-000000000008','connected','f6000000-0000-4000-8000-000000000003',now());
$cast$;
-- What bring_allowance says for someone on a plan, as 'allowed,used,remaining,level,may_bring' (superuser only: the
-- function is the database's own).
create function pg_temp.co2_allowance(p_plan uuid, p text) returns text language sql as $$
 select concat_ws(',',a.allowed,a.used,a.remaining,coalesce(a.level::text,'null'),a.may_bring::text)
 from private.bring_allowance(p_plan,pg_temp.co2(p)) a
$$;
create function pg_temp.co2_used(p text) returns integer language sql as $$
 select a.used::integer from private.bring_allowance(pg_temp.co2p(),pg_temp.co2(p)) a
$$;

-- Slice 1: the schema (C-R1). Exactly one foreign key links attendees to profiles, and one plans to profiles, so the
-- installed builds' profiles(display_name) embeds still resolve; both brought_by columns point at auth.users and are
-- set to null when the account goes. plan_removals is the database's own: RLS on, no policy, no grant.
begin;
do $$ begin
 if (select count(*) from pg_catalog.pg_constraint where conrelid='public.attendees'::regclass and confrelid='public.profiles'::regclass)<>1
 or (select count(*) from pg_catalog.pg_constraint where conrelid='public.plans'::regclass and confrelid='public.profiles'::regclass)<>1 then
  raise exception 'A second foreign key to profiles';
 end if;
 if (select count(*) from pg_catalog.pg_constraint c join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
   where c.contype='f' and c.confrelid='auth.users'::regclass and c.confdeltype='n' and a.attname='brought_by'
    and c.conrelid in ('public.attendees'::regclass,'private.phone_invitations'::regclass) and cardinality(c.conkey)=1)<>2 then
  raise exception 'brought_by does not reference auth.users on delete set null on both tables';
 end if;
 if (select string_agg(c.relname||'.'||a.attname||'='||pg_catalog.pg_get_expr(d.adbin,d.adrelid),',' order by c.relname,a.attname)
   from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid=a.attrelid
   join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
   where a.attrelid in ('public.plans'::regclass,'public.attendees'::regclass,'private.phone_invitations'::regclass)
    and a.attname in ('bring_invites','bring_levels','level'))
   is distinct from 'attendees.level=1,phone_invitations.level=1,plans.bring_invites=0,plans.bring_levels=1' then
  raise exception 'The circle columns'' defaults are wrong';
 end if;
 if not (select relrowsecurity from pg_catalog.pg_class where oid='private.plan_removals'::regclass)
 or exists(select 1 from pg_catalog.pg_policy where polrelid='private.plan_removals'::regclass)
 or has_table_privilege('authenticated','private.plan_removals','select') or has_table_privilege('anon','private.plan_removals','select')
 or has_table_privilege('service_role','private.plan_removals','select') then
  raise exception 'plan_removals is open';
 end if;
end $$;
rollback;

-- Slice 2: set_plan_circle. Base (1,1). 01 sets (1,2): the next version, no notice. 12, an admin, sets (2,3). 02, a
-- guest, is refused as a non-host is today; numbers out of range or missing are invalid; after the end nobody sets it.
begin;
select pg_temp.co2_cast();
set local role authenticated;
select pg_temp.co2_as('01');
select pg_temp.co2_check(public.set_plan_circle(pg_temp.co2p(),1::smallint,2::smallint)=2,'set_plan_circle did not return the next version');
select pg_temp.co2_as('12');
select pg_temp.co2_check(public.set_plan_circle(pg_temp.co2p(),2::smallint,3::smallint)=3,'An admin did not set the circle');
select pg_temp.co2_as('02');
select pg_temp.co2_refused($$select public.set_plan_circle(pg_temp.co2p(),1::smallint,1::smallint)$$,'42501','Active plan owner required');
select pg_temp.co2_as('01');
select pg_temp.co2_refused($$select public.set_plan_circle(pg_temp.co2p(),4::smallint,1::smallint)$$,'22023','Invalid circle');
select pg_temp.co2_refused($$select public.set_plan_circle(pg_temp.co2p(),1::smallint,0::smallint)$$,'22023','Invalid circle');
select pg_temp.co2_refused($$select public.set_plan_circle(pg_temp.co2p(),null::smallint,1::smallint)$$,'22023','Invalid circle');
select pg_temp.co2_refused($$select public.set_plan_circle(pg_temp.co2p(),1::smallint,null::smallint)$$,'22023','Invalid circle');
reset role;
do $$ begin
 if (select (bring_invites,bring_levels,version) from public.plans where id=pg_temp.co2p()) is distinct from (2::smallint,3::smallint,3) then
  raise exception 'The circle is not (2,3) at version 3: %', (select (bring_invites,bring_levels,version) from public.plans where id=pg_temp.co2p());
 end if;
 if exists(select 1 from private.notification_outbox where plan_id=pg_temp.co2p()) then raise exception 'Setting the circle told someone'; end if;
end $$;
update public.plans set starts_at=now()-interval '3 hours', ends_at=now()-interval '1 hour' where id=pg_temp.co2p();
set local role authenticated;
select pg_temp.co2_refused($$select public.set_plan_circle(pg_temp.co2p(),1::smallint,1::smallint)$$,'42501','Active plan owner required');
rollback;

-- Slice 3: the allowance. Base (1,1). A host has none (level 0); someone not on the resbite has none and no level;
-- 02 (Going) and 03 (Maybe) may bring one; 04 (not answered) and 05 (Can't go) may not. my_bring_allowance says the
-- same to the caller and refuses someone who is neither a host nor on the resbite. With (0,1) nobody may bring.
begin;
select pg_temp.co2_cast();
do $$ begin
 perform pg_temp.co2_check(pg_temp.co2_allowance(pg_temp.co2p(),'01')='0,0,0,0,false','01: '||pg_temp.co2_allowance(pg_temp.co2p(),'01'));
 perform pg_temp.co2_check(pg_temp.co2_allowance(pg_temp.co2p(),'12')='0,0,0,0,false','12: '||pg_temp.co2_allowance(pg_temp.co2p(),'12'));
 perform pg_temp.co2_check(pg_temp.co2_allowance(pg_temp.co2p(),'02')='1,0,1,1,true','02: '||pg_temp.co2_allowance(pg_temp.co2p(),'02'));
 perform pg_temp.co2_check(pg_temp.co2_allowance(pg_temp.co2p(),'03')='1,0,1,1,true','03: '||pg_temp.co2_allowance(pg_temp.co2p(),'03'));
 perform pg_temp.co2_check(pg_temp.co2_allowance(pg_temp.co2p(),'04')='1,0,1,1,false','04: '||pg_temp.co2_allowance(pg_temp.co2p(),'04'));
 perform pg_temp.co2_check(pg_temp.co2_allowance(pg_temp.co2p(),'05')='1,0,1,1,false','05: '||pg_temp.co2_allowance(pg_temp.co2p(),'05'));
 perform pg_temp.co2_check(pg_temp.co2_allowance(pg_temp.co2p(),'13')='0,0,0,null,false','13: '||pg_temp.co2_allowance(pg_temp.co2p(),'13'));
end $$;
set local role authenticated;
select pg_temp.co2_as('02');
select pg_temp.co2_check(public.my_bring_allowance(pg_temp.co2p())='{"allowed":1,"used":0,"remaining":1,"level":1,"may_bring":true}'::jsonb,
 'my_bring_allowance for 02: '||public.my_bring_allowance(pg_temp.co2p())::text);
select pg_temp.co2_as('01');
select pg_temp.co2_check(public.my_bring_allowance(pg_temp.co2p())='{"allowed":0,"used":0,"remaining":0,"level":0,"may_bring":false}'::jsonb,
 'my_bring_allowance for 01: '||public.my_bring_allowance(pg_temp.co2p())::text);
select pg_temp.co2_as('13');
select pg_temp.co2_refused($$select public.my_bring_allowance(pg_temp.co2p())$$,'42501','Not invited');
-- set_plan_circle(0,1)
select pg_temp.co2_as('01');
select public.set_plan_circle(pg_temp.co2p(),0::smallint,1::smallint);
select pg_temp.co2_as('02');
select pg_temp.co2_check(public.my_bring_allowance(pg_temp.co2p())='{"allowed":0,"used":0,"remaining":0,"level":1,"may_bring":false}'::jsonb,
 'my_bring_allowance for 02 at (0,1): '||public.my_bring_allowance(pg_temp.co2p())::text);
rollback;

-- Slice 4: bringing a connection. Base (1,1). 02 brings 06: 'app', a pending row brought by 02 one level down, the
-- invitation from 02; 02 has used the invite and may still bring. A second new person is one too many and writes
-- nothing; 'self' and 'already' cost nothing. 03, with one invite, asking two new numbers at once is refused whole;
-- the same connection twice is one 'app' and one 'already'. 04 (not answered), 05 (Can't go), and anyone on an ended
-- or cancelled resbite may not bring. An admin at (0,1) still invites, as a host: the row is level 1 with no bringer.
begin;
select pg_temp.co2_cast();
set local role authenticated;
select pg_temp.co2_as('02');
select pg_temp.co2_check(public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_user('06')))
 =jsonb_build_array(jsonb_build_object('user',pg_temp.co2('06'),'kind','app')),'02 bringing 06');
reset role;
do $$ begin
 if (select (response,brought_by,level) from public.attendees where plan_id=pg_temp.co2p() and user_id=pg_temp.co2('06'))
   is distinct from ('pending'::text,pg_temp.co2('02'),2::smallint) then
  raise exception '06''s row is wrong';
 end if;
 if not exists(select 1 from private.notification_outbox where plan_id=pg_temp.co2p() and recipient_id=pg_temp.co2('06')
   and kind='invited' and actor_id=pg_temp.co2('02')) then
  raise exception '06 was not told, by 02';
 end if;
 perform pg_temp.co2_check(pg_temp.co2_allowance(pg_temp.co2p(),'02')='1,1,0,1,true','02 after bringing 06: '||pg_temp.co2_allowance(pg_temp.co2p(),'02'));
end $$;
set local role authenticated;
select pg_temp.co2_refused($$select public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_user('07')))$$,'22023','No invites left');
select pg_temp.co2_check(pg_temp.co2_kinds(public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_number('02','A'),
 pg_temp.co2_number('01','B'))))='self,already','02''s own number and the owner''s');
select pg_temp.co2_as('03');
select pg_temp.co2_refused($$select public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_number('09','C'),pg_temp.co2_number('10','D')))$$,
 '22023','No invites left');
reset role;
do $$ begin
 if exists(select 1 from public.attendees where plan_id=pg_temp.co2p() and user_id in (pg_temp.co2('07'),pg_temp.co2('09'),pg_temp.co2('10')))
 or exists(select 1 from private.phone_invitations where plan_id=pg_temp.co2p())
 or exists(select 1 from private.notification_outbox where recipient_id=pg_temp.co2('07')) then
  raise exception 'A refused bringing wrote something';
 end if;
end $$;
set local role authenticated;
select pg_temp.co2_check(pg_temp.co2_kinds(public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_user('08'),pg_temp.co2_user('08'))))
 ='app,already','03 bringing 08 twice');
select pg_temp.co2_as('04');
select pg_temp.co2_refused($$select public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_number('09','E')))$$,'42501','Not allowed to bring people here');
select pg_temp.co2_as('05');
select pg_temp.co2_refused($$select public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_number('09','E')))$$,'42501','Not allowed to bring people here');
-- set_plan_circle(0,1): the admin invites as a host.
select pg_temp.co2_as('01');
select public.set_plan_circle(pg_temp.co2p(),0::smallint,1::smallint);
select pg_temp.co2_as('12');
select pg_temp.co2_check(pg_temp.co2_kinds(public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_number('09','F'))))='link','12 inviting 09');
reset role;
do $$ begin
 if (select (invited_by,brought_by,level) from private.phone_invitations where plan_id=pg_temp.co2p() and phone=pg_temp.co2_phone('09'))
   is distinct from (pg_temp.co2('12'),null::uuid,1::smallint) then
  raise exception 'The admin''s link is not level 1 with no bringer';
 end if;
end $$;
-- set_plan_circle(1,1) again, then the end: 02 may not bring, even what would cost nothing ('self'); then cancelled.
set local role authenticated;
select pg_temp.co2_as('01');
select public.set_plan_circle(pg_temp.co2p(),1::smallint,1::smallint);
reset role;
update public.plans set starts_at=now()-interval '3 hours', ends_at=now()-interval '1 hour' where id=pg_temp.co2p();
set local role authenticated;
select pg_temp.co2_as('02');
select pg_temp.co2_refused($$select public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_number('02','G')))$$,'42501','Not allowed to bring people here');
reset role;
update public.plans set starts_at='2099-06-04 19:00+00', ends_at='2099-06-04 22:00+00', status='cancelled' where id=pg_temp.co2p();
set local role authenticated;
select pg_temp.co2_refused($$select public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_number('02','G')))$$,'42501','Not allowed to bring people here');
rollback;

-- Slice 5: levels. set_plan_circle(1,2). 02 brings 06 (level 2), who says Going and brings 09 by link: the row is 06's,
-- level 3. 09 answers Going and is level 3, brought by 06; at level 3 with two levels, 09 may not bring.
begin;
select pg_temp.co2_cast();
set local role authenticated;
select pg_temp.co2_as('01');
select public.set_plan_circle(pg_temp.co2p(),1::smallint,2::smallint);
select pg_temp.co2_as('02');
select public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_user('06')));
select pg_temp.co2_as('06');
select public.respond(pg_temp.co2p(),'accepted',1);
select pg_temp.co2_check(pg_temp.co2_kinds(public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_number('09','A'))))='link','06 bringing 09');
reset role;
do $$ begin
 if (select (invited_by,brought_by,level) from private.phone_invitations where plan_id=pg_temp.co2p() and phone=pg_temp.co2_phone('09'))
   is distinct from (pg_temp.co2('06'),pg_temp.co2('06'),3::smallint) then
  raise exception '06''s link to 09 is wrong';
 end if;
end $$;
set local role authenticated;
select pg_temp.co2_as('09');
select public.answer_phone_invitation(repeat('A',22),'Nico N','accepted','2026-10');
reset role;
do $$ begin
 if (select (response,brought_by,level) from public.attendees where plan_id=pg_temp.co2p() and user_id=pg_temp.co2('09'))
   is distinct from ('accepted'::text,pg_temp.co2('06'),3::smallint) then
  raise exception '09''s row is wrong';
 end if;
end $$;
set local role authenticated;
select pg_temp.co2_refused($$select public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_number('10','B')))$$,'42501','Not allowed to bring people here');
rollback;

-- Slice 6: numbers that already have a row (C-R3). Base (1,1). Someone else's live link is 'already' and keeps its
-- code; the caller's own live link is sent again with the new code, at no cost; a link its bringer revoked comes back
-- as a new one, counted, and is the new bringer's. A host's link makes the row the host's. A bringer's own live link
-- answered in the app is replaced, at no cost. A host's in-app invitation, by user or by number, revokes a bringer's
-- live link on that person's number, so the bringer's invite is free again.
begin;
select pg_temp.co2_cast();
set local role authenticated;
select pg_temp.co2_as('01');
select public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_number('10','A')));
select pg_temp.co2_as('03');
select pg_temp.co2_check(pg_temp.co2_kinds(public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_number('10','B'))))='already','03 asking 01''s number');
reset role;
do $$ begin
 if (select (code_hash,invited_by,brought_by,level) from private.phone_invitations where plan_id=pg_temp.co2p() and phone=pg_temp.co2_phone('10'))
   is distinct from (extensions.digest(repeat('A',22),'sha256'),pg_temp.co2('01'),null::uuid,1::smallint) then
  raise exception 'The owner''s link changed';
 end if;
 perform pg_temp.co2_check(pg_temp.co2_used('03')=0,'''already'' cost 03 an invite');
end $$;
set local role authenticated;
select pg_temp.co2_check(pg_temp.co2_kinds(public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_number('11','C'))))='link','03 bringing 11');
select pg_temp.co2_check(pg_temp.co2_kinds(public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_number('11','D'))))='link','03 sending 11 again');
reset role;
do $$ begin
 if (select code_hash from private.phone_invitations where plan_id=pg_temp.co2p() and phone=pg_temp.co2_phone('11'))
   is distinct from extensions.digest(repeat('D',22),'sha256') then
  raise exception 'Sending again did not take the new code';
 end if;
 perform pg_temp.co2_check(pg_temp.co2_used('03')=1,'Sending again cost 03 a second invite');
end $$;
set local role authenticated;
select public.revoke_phone_invitation(pg_temp.co2p(),pg_temp.co2_phone('11'));
reset role;
do $$ begin
 perform pg_temp.co2_check(pg_temp.co2_used('03')=0,'Revoking did not free 03''s invite');
 if exists(select 1 from private.plan_removals) then raise exception 'A bringer''s revocation was recorded as a removal'; end if;
end $$;
-- set_plan_circle(2,2)
set local role authenticated;
select pg_temp.co2_as('01');
select public.set_plan_circle(pg_temp.co2p(),2::smallint,2::smallint);
select pg_temp.co2_as('02');
select pg_temp.co2_check(pg_temp.co2_kinds(public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_number('11','E'))))='link','02 bringing 11 after 03 revoked');
reset role;
do $$ begin
 if (select (code_hash,invited_by,brought_by,level,revoked_at) from private.phone_invitations where plan_id=pg_temp.co2p() and phone=pg_temp.co2_phone('11'))
   is distinct from (extensions.digest(repeat('E',22),'sha256'),pg_temp.co2('02'),pg_temp.co2('02'),2::smallint,null::timestamptz) then
  raise exception 'The reopened link is not 02''s';
 end if;
 perform pg_temp.co2_check(pg_temp.co2_used('02')=1,'The reopened link was not counted');
end $$;
set local role authenticated;
select pg_temp.co2_as('01');
select pg_temp.co2_check(pg_temp.co2_kinds(public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_number('11','F'))))='link','01 sending 11 a link');
reset role;
do $$ begin
 if (select (code_hash,brought_by,level) from private.phone_invitations where plan_id=pg_temp.co2p() and phone=pg_temp.co2_phone('11'))
   is distinct from (extensions.digest(repeat('F',22),'sha256'),null::uuid,1::smallint) then
  raise exception 'The host''s link did not make the row the host''s';
 end if;
 perform pg_temp.co2_check(pg_temp.co2_used('02')=0,'02''s invite was not freed when the host took the row');
end $$;
set local role authenticated;
select pg_temp.co2_as('02');
select pg_temp.co2_check(pg_temp.co2_kinds(public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_number('07','G'))))='link','02 bringing 07 by number');
-- set_plan_circle(1,2): 02 has no invite left, yet answering their own link in the app costs nothing.
select pg_temp.co2_as('01');
select public.set_plan_circle(pg_temp.co2p(),1::smallint,2::smallint);
select pg_temp.co2_as('02');
select pg_temp.co2_check(pg_temp.co2_kinds(public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_user('07'))))='app','02 bringing 07 by user over their own link');
reset role;
do $$ begin
 if (select revoked_at is null or code_hash is not null from private.phone_invitations where plan_id=pg_temp.co2p() and phone=pg_temp.co2_phone('07')) then
  raise exception '02''s link to 07 was not revoked';
 end if;
 if (select (response,brought_by,level) from public.attendees where plan_id=pg_temp.co2p() and user_id=pg_temp.co2('07'))
   is distinct from ('pending'::text,pg_temp.co2('02'),2::smallint) then
  raise exception '07''s row is wrong';
 end if;
 perform pg_temp.co2_check(pg_temp.co2_used('02')=1,'Replacing the link changed what 02 used');
 -- 02's live link to 06's number, as a bringer would have sent it.
 insert into private.phone_invitations(plan_id,phone,country,code_hash,invited_by,brought_by,level) values
  (pg_temp.co2p(),pg_temp.co2_phone('06'),'44',extensions.digest(repeat('H',22),'sha256'),pg_temp.co2('02'),pg_temp.co2('02'),2);
 perform pg_temp.co2_check(pg_temp.co2_used('02')=2,'02''s link to 06 was not counted');
end $$;
set local role authenticated;
select pg_temp.co2_as('01');
select pg_temp.co2_check(pg_temp.co2_kinds(public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_user('06'))))='app','01 inviting 06 by user');
reset role;
do $$ begin
 if (select revoked_at is null or code_hash is not null from private.phone_invitations where plan_id=pg_temp.co2p() and phone=pg_temp.co2_phone('06')) then
  raise exception 'The host''s invitation by user left 02''s link to 06 live';
 end if;
 if (select (brought_by,level) from public.attendees where plan_id=pg_temp.co2p() and user_id=pg_temp.co2('06')) is distinct from (null::uuid,1::smallint) then
  raise exception '06, invited by the host, has a bringer';
 end if;
 perform pg_temp.co2_check(pg_temp.co2_used('02')=1,'The host''s invitation by user did not free 02''s invite');
 -- The same with a number: 06 off the resbite again and 02's link live again.
 delete from public.attendees where plan_id=pg_temp.co2p() and user_id=pg_temp.co2('06');
 update private.phone_invitations set revoked_at=null, code_hash=extensions.digest(repeat('H',22),'sha256')
  where plan_id=pg_temp.co2p() and phone=pg_temp.co2_phone('06');
 perform pg_temp.co2_check(pg_temp.co2_used('02')=2,'02''s link to 06 is not live again');
end $$;
set local role authenticated;
select pg_temp.co2_check(pg_temp.co2_kinds(public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_number('06','I'))))='app','01 inviting 06 by number');
reset role;
do $$ begin
 if (select revoked_at is null or code_hash is not null from private.phone_invitations where plan_id=pg_temp.co2p() and phone=pg_temp.co2_phone('06')) then
  raise exception 'The host''s invitation by number left 02''s link to 06 live';
 end if;
 perform pg_temp.co2_check(pg_temp.co2_used('02')=1,'The host''s invitation by number did not free 02''s invite');
end $$;
rollback;

-- Slice 7: removals (C-R2). Base (1,1). Whom a host removed, declined or revoked, a guest cannot bring back to the
-- series, by connection or by number, until a host invites them; a guest's own revocation records nothing; an admin who
-- leaves is not removed. Each row is one key: a user or a number.
begin;
select pg_temp.co2_cast();
set local role authenticated;
select pg_temp.co2_as('02');
select public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_user('06')));
select pg_temp.co2_as('01');
select public.remove_guest(pg_temp.co2p(),pg_temp.co2('06'));
select pg_temp.co2_as('02');
select pg_temp.co2_refused($$select public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_user('06')))$$,'42501','Not allowed to bring people here');
select pg_temp.co2_refused($$select public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_number('06','A')))$$,'42501','Not allowed to bring people here');
reset role;
do $$ begin
 if (select string_agg(coalesce(right(user_id::text,2),'-')||'/'||coalesce(phone,'-'),',') from private.plan_removals where series_id=pg_temp.co2p())
   is distinct from '06/-' then
  raise exception 'Removing 06 did not record one user row';
 end if;
 if exists(select 1 from public.attendees where plan_id=pg_temp.co2p() and user_id=pg_temp.co2('06')) then raise exception '06 was brought back'; end if;
end $$;
set local role authenticated;
select pg_temp.co2_as('01');
select public.decide_join_request(pg_temp.co2p(),pg_temp.co2('13'),false);
select pg_temp.co2_as('02');
select pg_temp.co2_refused($$select public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_user('13')))$$,'42501','Not allowed to bring people here');
select pg_temp.co2_check(pg_temp.co2_kinds(public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_number('11','B'))))='link','02 bringing 11');
reset role;
select id as co2_link from private.phone_invitations where plan_id=pg_temp.co2p() and phone=pg_temp.co2_phone('11') \gset
set local role authenticated;
select pg_temp.co2_as('01');
select public.revoke_brought_invitation(pg_temp.co2p(),:'co2_link');
select pg_temp.co2_as('02');
select pg_temp.co2_refused($$select public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_number('11','C')))$$,'42501','Not allowed to bring people here');
reset role;
do $$ begin
 if (select string_agg(coalesce(right(user_id::text,2),'-')||'/'||coalesce(phone,'-'),',' order by user_id,phone) from private.plan_removals where series_id=pg_temp.co2p())
   is distinct from '06/-,13/-,-/447700900611' then
  raise exception 'Removals wrong: %', (select string_agg(coalesce(right(user_id::text,2),'-')||'/'||coalesce(phone,'-'),',' order by user_id,phone) from private.plan_removals);
 end if;
 perform pg_temp.co2_check(pg_temp.co2_used('02')=0,'The host''s revocation did not free 02''s invite');
end $$;
-- A host's own invitation clears the record: of the number, by link; of the person, in the app.
set local role authenticated;
select pg_temp.co2_as('01');
select pg_temp.co2_check(pg_temp.co2_kinds(public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_number('11','D'))))='link','01 inviting 11');
select pg_temp.co2_check(pg_temp.co2_kinds(public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_number('06','E'))))='app','01 inviting 06');
-- 12 leaves on their own: not a removal.
select pg_temp.co2_as('12');
select public.remove_guest(pg_temp.co2p(),pg_temp.co2('12'));
reset role;
do $$ begin
 if (select string_agg(coalesce(right(user_id::text,2),'-')||'/'||coalesce(phone,'-'),',' order by user_id,phone) from private.plan_removals where series_id=pg_temp.co2p())
   is distinct from '13/-' then
  raise exception 'The host''s invitations did not clear the records, or 12 leaving was recorded: %',
   (select string_agg(coalesce(right(user_id::text,2),'-')||'/'||coalesce(phone,'-'),',' order by user_id,phone) from private.plan_removals);
 end if;
end $$;
-- A host revoking their own link records the number (10), and the person too once it was answered (09); a number on
-- record refuses an item by user whose confirmed number it is (07).
set local role authenticated;
select pg_temp.co2_as('01');
select public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_number('10','F'),pg_temp.co2_number('09','G'),pg_temp.co2_number('07','H')));
select pg_temp.co2_as('09');
select public.answer_phone_invitation(repeat('G',22),'Nico N','accepted','2026-10');
select pg_temp.co2_as('01');
select public.revoke_phone_invitation(pg_temp.co2p(),pg_temp.co2_phone('10'));
select public.revoke_phone_invitation(pg_temp.co2p(),pg_temp.co2_phone('09'));
select public.revoke_phone_invitation(pg_temp.co2p(),pg_temp.co2_phone('07'));
select pg_temp.co2_as('02');
select pg_temp.co2_refused($$select public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_number('10','I')))$$,'42501','Not allowed to bring people here');
select pg_temp.co2_refused($$select public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_number('09','J')))$$,'42501','Not allowed to bring people here');
select pg_temp.co2_refused($$select public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_user('07')))$$,'42501','Not allowed to bring people here');
reset role;
do $$ begin
 if (select string_agg(coalesce(right(user_id::text,2),'-')||'/'||coalesce(phone,'-'),',' order by user_id,phone) from private.plan_removals where series_id=pg_temp.co2p())
   is distinct from '09/-,13/-,-/447700900607,-/447700900609,-/447700900610' then
  raise exception 'The host''s revocations recorded the wrong rows: %',
   (select string_agg(coalesce(right(user_id::text,2),'-')||'/'||coalesce(phone,'-'),',' order by user_id,phone) from private.plan_removals);
 end if;
 if exists(select 1 from public.attendees where plan_id=pg_temp.co2p() and user_id=pg_temp.co2('09')) then raise exception '09 is still on the resbite'; end if;
end $$;
rollback;

-- Slice 8: a sent invitation stands (CO-P15). set_plan_circle(2,2): 02 brings 06 (who says Going) and sends 10 a link.
-- set_plan_circle(0,1): 06 may not bring, yet 10's answer puts them on the resbite brought by 02. 02 saying Can't go,
-- then being removed, leaves both rows as they were.
begin;
select pg_temp.co2_cast();
set local role authenticated;
select pg_temp.co2_as('01');
select public.set_plan_circle(pg_temp.co2p(),2::smallint,2::smallint);
select pg_temp.co2_as('02');
select public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_user('06'),pg_temp.co2_number('10','A')));
select pg_temp.co2_as('06');
select public.respond(pg_temp.co2p(),'accepted',1);
select pg_temp.co2_as('01');
select public.set_plan_circle(pg_temp.co2p(),0::smallint,1::smallint);
select pg_temp.co2_as('06');
select pg_temp.co2_refused($$select public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_number('11','B')))$$,'42501','Not allowed to bring people here');
select pg_temp.co2_as('10');
select public.answer_phone_invitation(repeat('A',22),'Lia L','accepted','2026-10');
select pg_temp.co2_as('02');
select public.respond(pg_temp.co2p(),'declined',1);
reset role;
do $$ begin
 if (select string_agg(right(user_id::text,2)||':'||response||':'||right(brought_by::text,2)||':'||level,',' order by user_id) from public.attendees
   where plan_id=pg_temp.co2p() and user_id in (pg_temp.co2('06'),pg_temp.co2('10'))) is distinct from '06:accepted:02:2,10:accepted:02:2' then
  raise exception 'After 02 said Can''t go: %', (select string_agg(right(user_id::text,2)||':'||response||':'||coalesce(right(brought_by::text,2),'-')||':'||level,',' order by user_id)
   from public.attendees where plan_id=pg_temp.co2p() and user_id in (pg_temp.co2('06'),pg_temp.co2('10')));
 end if;
end $$;
set local role authenticated;
select pg_temp.co2_as('01');
select public.remove_guest(pg_temp.co2p(),pg_temp.co2('02'));
reset role;
do $$ begin
 if (select string_agg(right(user_id::text,2)||':'||response||':'||right(brought_by::text,2)||':'||level,',' order by user_id) from public.attendees
   where plan_id=pg_temp.co2p() and user_id in (pg_temp.co2('06'),pg_temp.co2('10'))) is distinct from '06:accepted:02:2,10:accepted:02:2' then
  raise exception 'Removing 02 changed the people 02 brought';
 end if;
end $$;
rollback;

-- Slice 9: an invite frees when the person says Can't go. Base (1,1). 03 brings 08, who says Can't go; 03 brings 11.
begin;
select pg_temp.co2_cast();
set local role authenticated;
select pg_temp.co2_as('03');
select public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_user('08')));
select pg_temp.co2_as('08');
select public.respond(pg_temp.co2p(),'declined',1);
reset role;
select pg_temp.co2_check(pg_temp.co2_used('03')=0,'08''s Can''t go did not free 03''s invite');
set local role authenticated;
select pg_temp.co2_as('03');
select pg_temp.co2_check(pg_temp.co2_kinds(public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_number('11','A'))))='link','03 bringing 11');
rollback;

-- Slice 10: nobody brought them. Base (1,1). A per-person link claimed (07) and an approved request (13) give level 1
-- with no bringer. An admin's link stays the host's after the admin says Can't go: 09 answers it with no bringer, and
-- its page names nobody.
begin;
select pg_temp.co2_cast();
set local role authenticated;
select pg_temp.co2_as('01');
select public.create_invite('f6200000-0000-4000-8000-000000000001',pg_temp.co2p(),repeat('c',64));
select public.decide_join_request(pg_temp.co2p(),pg_temp.co2('13'),true);
select pg_temp.co2_as('07');
select public.claim_invite(repeat('c',64));
select pg_temp.co2_as('12');
select public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_number('09','A')));
select public.respond(pg_temp.co2p(),'declined',1);
set local role anon;
select pg_temp.co2_check(public.personal_invitation_page(repeat('A',22))->>'state'='open' and not public.personal_invitation_page(repeat('A',22))?'inviter',
 'The admin''s link names an inviter');
set local role authenticated;
select pg_temp.co2_as('09');
select public.answer_phone_invitation(repeat('A',22),'Nico N','accepted','2026-10');
reset role;
do $$ begin
 if (select string_agg(right(user_id::text,2)||':'||coalesce(right(brought_by::text,2),'-')||':'||level,',' order by user_id) from public.attendees
   where plan_id=pg_temp.co2p() and user_id in (pg_temp.co2('07'),pg_temp.co2('09'),pg_temp.co2('13'))) is distinct from '07:-:1,09:-:1,13:-:1' then
  raise exception 'People nobody brought: %', (select string_agg(right(user_id::text,2)||':'||coalesce(right(brought_by::text,2),'-')||':'||level,',' order by user_id)
   from public.attendees where plan_id=pg_temp.co2p() and user_id in (pg_temp.co2('07'),pg_temp.co2('09'),pg_temp.co2('13')));
 end if;
 if (select (brought_by,level) from private.phone_invitations where plan_id=pg_temp.co2p() and phone=pg_temp.co2_phone('09')) is distinct from (null::uuid,1::smallint) then
  raise exception 'The admin''s link changed';
 end if;
 perform pg_temp.co2_check(pg_temp.co2_used('12')=0,'The admin''s link counts against them');
end $$;
rollback;

-- Slice 11: someone already on the resbite keeps their place. Base (1,1). 01 invites 06 (level 1, no bringer); 06 then
-- answers a link to their number that 02 had sent (level 2): the row keeps its own.
begin;
select pg_temp.co2_cast();
set local role authenticated;
select pg_temp.co2_as('01');
select public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_user('06')));
reset role;
insert into private.phone_invitations(plan_id,phone,country,code_hash,invited_by,brought_by,level) values
 (pg_temp.co2p(),pg_temp.co2_phone('06'),'44',extensions.digest(repeat('A',22),'sha256'),pg_temp.co2('02'),pg_temp.co2('02'),2);
set local role authenticated;
select pg_temp.co2_as('06');
select public.answer_phone_invitation(repeat('A',22),'Clara C','accepted','2026-10');
reset role;
do $$ begin
 if (select (response,brought_by,level) from public.attendees where plan_id=pg_temp.co2p() and user_id=pg_temp.co2('06'))
   is distinct from ('accepted'::text,null::uuid,1::smallint) then
  raise exception '06 took the link''s bringer';
 end if;
end $$;
rollback;

-- Slice 12: the personal page names the person who brought you. set_plan_circle(1,2). 06's link says 'Clara' as
-- inviter and keeps the host; the owner's link has no inviter key; once 06's account is being deleted (the deletion
-- marks the profile and renames it 'Deleted member'), 06's link has no inviter key either.
begin;
select pg_temp.co2_cast();
set local role authenticated;
select pg_temp.co2_as('01');
select public.set_plan_circle(pg_temp.co2p(),1::smallint,2::smallint);
select public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_number('10','B')));
select pg_temp.co2_as('02');
select public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_user('06')));
select pg_temp.co2_as('06');
select public.respond(pg_temp.co2p(),'accepted',1);
select public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_number('09','A')));
set local role anon;
do $$ declare r jsonb; h jsonb; begin
 r := public.personal_invitation_page(repeat('A',22));
 h := public.personal_invitation_page(repeat('B',22));
 if r->>'state' is distinct from 'open' or r->>'inviter' is distinct from 'Clara' or r->>'host' is distinct from 'Ana Host' then
  raise exception '06''s link page: %', r;
 end if;
 if h->>'state' is distinct from 'open' or h?'inviter' or h->>'host' is distinct from 'Ana Host' then raise exception 'The owner''s link page: %', h; end if;
 if (select array_agg(k order by k) from jsonb_object_keys(r-'inviter') k) is distinct from (select array_agg(k order by k) from jsonb_object_keys(h) k) then
  raise exception 'The inviter changed the page''s other keys: % / %', r, h;
 end if;
end $$;
reset role;
update public.profiles set deletion_requested_at=now(), display_name='Deleted member' where id=pg_temp.co2('06');
set local role anon;
do $$ declare r jsonb; begin
 r := public.personal_invitation_page(repeat('A',22));
 if r->>'state' is distinct from 'open' or r?'inviter' or r::text like '%Deleted member%' then
  raise exception 'A bringer being deleted is named: %', r;
 end if;
end $$;
rollback;

-- Slice 13: the lists (C-R6, finding 8). set_plan_circle(2,2). 03 sends 11 a link, 02 sends 10 one, 01 sends 09 one.
-- plan_phone_invitations: a bringer sees their own links only, in today's shape; someone with no row is refused; a host
-- sees today's list of host links (level 1), in today's shape. plan_brought_invitations: a host sees the others, by
-- the last two digits and the bringer's first name, never the number; nobody else may ask. A bringer revokes their own
-- unanswered link, nobody else's; withdraws their own unanswered in-app invitation, nobody else's; neither after the
-- end. A guest may not revoke by id.
begin;
select pg_temp.co2_cast();
set local role authenticated;
select pg_temp.co2_as('01');
select public.set_plan_circle(pg_temp.co2p(),2::smallint,2::smallint);
select public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_number('09','A')));
select pg_temp.co2_as('03');
select public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_number('11','B')));
select pg_temp.co2_as('02');
select public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_number('10','C')));
select pg_temp.co2_as('03');
select pg_temp.co2_check(public.plan_phone_invitations(pg_temp.co2p())='[{"phone":"447700900611","country":"44","answered":false,"response":null}]'::jsonb,
 '03''s list: '||public.plan_phone_invitations(pg_temp.co2p())::text);
select pg_temp.co2_as('04');
select pg_temp.co2_check(public.plan_phone_invitations(pg_temp.co2p())='[]'::jsonb,'04, who brought nobody, listed something');
select pg_temp.co2_as('13');
select pg_temp.co2_refused($$select public.plan_phone_invitations(pg_temp.co2p())$$,'42501','Plan owner required');
select pg_temp.co2_as('01');
select pg_temp.co2_check(public.plan_phone_invitations(pg_temp.co2p())='[{"phone":"447700900609","country":"44","answered":false,"response":null}]'::jsonb,
 'The host''s list: '||public.plan_phone_invitations(pg_temp.co2p())::text);
reset role;
do $$ declare r jsonb; begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.co2('01'),'role','authenticated')::text,true);
 r := public.plan_brought_invitations(pg_temp.co2p());
 if jsonb_array_length(r)<>2
 or exists(select 1 from jsonb_array_elements(r) e where (select array_agg(k order by k) from jsonb_object_keys(e.value) k)
   is distinct from array['brought_by_name','country','ending','id'])
 or (select string_agg(e.value->>'ending'||':'||(e.value->>'country')||':'||(e.value->>'brought_by_name'),',' order by e.value->>'ending') from jsonb_array_elements(r) e)
   is distinct from '10:44:Pedro,11:44:Marta'
 or exists(select 1 from jsonb_array_elements(r) e where (e.value->>'id')::uuid is distinct from
   (select id from private.phone_invitations where plan_id=pg_temp.co2p() and phone='4477009006'||(e.value->>'ending'))) then
  raise exception 'The host''s brought list: %', r;
 end if;
 if r::text like '%4477009006%' then raise exception 'The brought list shows a number: %', r; end if;
end $$;
set local role authenticated;
select pg_temp.co2_as('02');
select pg_temp.co2_refused($$select public.plan_brought_invitations(pg_temp.co2p())$$,'42501','Plan owner required');
-- Revoking: 03 their own unanswered link (the invite frees, nothing recorded), not the owner's.
select pg_temp.co2_as('03');
select public.revoke_phone_invitation(pg_temp.co2p(),pg_temp.co2_phone('11'));
select pg_temp.co2_refused($$select public.revoke_phone_invitation(pg_temp.co2p(),pg_temp.co2_phone('09'))$$,'42501','Active plan owner required');
select pg_temp.co2_refused($$select public.revoke_phone_invitation(pg_temp.co2p(),pg_temp.co2_phone('10'))$$,'42501','Active plan owner required');
reset role;
do $$ begin
 perform pg_temp.co2_check(pg_temp.co2_used('03')=0,'03''s revocation did not free the invite');
 if exists(select 1 from private.plan_removals) then raise exception 'A bringer''s revocation was recorded'; end if;
 if exists(select 1 from private.phone_invitations where plan_id=pg_temp.co2p() and phone in (pg_temp.co2_phone('09'),pg_temp.co2_phone('10')) and revoked_at is not null) then
  raise exception '03 revoked someone else''s link';
 end if;
end $$;
-- Withdrawing: 02 brings 06 in the app; 03 may not withdraw it; 02 may, and the invite frees.
set local role authenticated;
select pg_temp.co2_as('02');
select public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_user('06')));
select pg_temp.co2_as('03');
select pg_temp.co2_refused($$select public.withdraw_brought_invitation(pg_temp.co2p(),pg_temp.co2('06'))$$,'42501','Not your invitation');
select pg_temp.co2_as('02');
select pg_temp.co2_refused($$select public.withdraw_brought_invitation(pg_temp.co2p(),pg_temp.co2('03'))$$,'42501','Not your invitation');
select public.withdraw_brought_invitation(pg_temp.co2p(),pg_temp.co2('06'));
reset role;
do $$ begin
 if exists(select 1 from public.attendees where plan_id=pg_temp.co2p() and user_id=pg_temp.co2('06')) then raise exception 'The withdrawn row is still there'; end if;
 perform pg_temp.co2_check(pg_temp.co2_used('02')=1,'Withdrawing did not free 02''s invite');
 if exists(select 1 from private.plan_removals) then raise exception 'A withdrawal was recorded'; end if;
end $$;
select id as co2_link from private.phone_invitations where plan_id=pg_temp.co2p() and phone=pg_temp.co2_phone('10') \gset
set local role authenticated;
select pg_temp.co2_refused($$select public.revoke_brought_invitation(pg_temp.co2p(),'$$||:'co2_link'||$$')$$,'42501','Active plan owner required');
-- After the end: 03 sends 11 again and 02 brings 06 again; once it has ended neither may take it back.
select pg_temp.co2_as('03');
select public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_number('11','D')));
select pg_temp.co2_as('02');
select public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_user('06')));
reset role;
update public.plans set starts_at=now()-interval '3 hours', ends_at=now()-interval '1 hour' where id=pg_temp.co2p();
set local role authenticated;
select pg_temp.co2_as('03');
select pg_temp.co2_refused($$select public.revoke_phone_invitation(pg_temp.co2p(),pg_temp.co2_phone('11'))$$,'42501','Active plan owner required');
select pg_temp.co2_as('02');
select pg_temp.co2_refused($$select public.withdraw_brought_invitation(pg_temp.co2p(),pg_temp.co2('06'))$$,'42501','Not your invitation');
-- A bringer being deleted is not named in the host's brought list (still open to read after the end).
reset role;
update public.profiles set deletion_requested_at=now() where id=pg_temp.co2('02');
set local role authenticated;
select pg_temp.co2_as('01');
select pg_temp.co2_check((select count(*) from jsonb_array_elements(public.plan_brought_invitations(pg_temp.co2p())) e
 where e.value->>'ending'='10' and not e.value?'brought_by_name')=1,'A bringer being deleted is named: '||public.plan_brought_invitations(pg_temp.co2p())::text);
rollback;

-- Slice 14: plan_bringers. set_plan_circle(1,2). 02 brings 06, who says Going and brings 09, who answers Going. Whoever
-- may see the names gets each bringer's first name, by id, whether or not the bringer is still on the resbite;
-- someone who may not see the names is refused; a bringer being deleted is left out.
begin;
select pg_temp.co2_cast();
set local role authenticated;
select pg_temp.co2_as('01');
select public.set_plan_circle(pg_temp.co2p(),1::smallint,2::smallint);
select pg_temp.co2_as('02');
select public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_user('06')));
select pg_temp.co2_as('06');
select public.respond(pg_temp.co2p(),'accepted',1);
select public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_number('09','A')));
select pg_temp.co2_as('09');
select public.answer_phone_invitation(repeat('A',22),'Nico N','accepted','2026-10');
select pg_temp.co2_as('01');
select pg_temp.co2_check(public.plan_bringers(pg_temp.co2p())=jsonb_build_object(pg_temp.co2('02'),'Pedro',pg_temp.co2('06'),'Clara'),
 'plan_bringers: '||public.plan_bringers(pg_temp.co2p())::text);
select public.remove_guest(pg_temp.co2p(),pg_temp.co2('02'));
select pg_temp.co2_check(public.plan_bringers(pg_temp.co2p())=jsonb_build_object(pg_temp.co2('02'),'Pedro',pg_temp.co2('06'),'Clara'),
 'plan_bringers after 02 was removed: '||public.plan_bringers(pg_temp.co2p())::text);
select pg_temp.co2_as('03');
select pg_temp.co2_check(public.plan_bringers(pg_temp.co2p())=jsonb_build_object(pg_temp.co2('02'),'Pedro',pg_temp.co2('06'),'Clara'),
 'plan_bringers for a guest: '||public.plan_bringers(pg_temp.co2p())::text);
select pg_temp.co2_as('04');
select pg_temp.co2_refused($$select public.plan_bringers(pg_temp.co2p())$$,'42501','Names required');
reset role;
update public.profiles set deletion_requested_at=now() where id=pg_temp.co2('02');
set local role authenticated;
select pg_temp.co2_as('01');
select pg_temp.co2_check(public.plan_bringers(pg_temp.co2p())=jsonb_build_object(pg_temp.co2('06'),'Clara'),
 'plan_bringers with 02 being deleted: '||public.plan_bringers(pg_temp.co2p())::text);
rollback;

-- Slice 15: the roll (CO-P12, CH-P20). 01's weekly plan f61…02 'Weekly quiz', set_plan_circle(1,2) when made: 02 Going
-- brings 11, who says Can't go, then 10, who says Going; 01 invites 06 and removes them. 10 and 11 use the app
-- afterwards (the roll carries only people who use the app). It ends; the roll copies the circle and carries 10 and 11
-- as not answered, brought by 02 at level 2, so 02 has used two of one invite. 06's removal is the series': 02, Going on
-- the next occurrence, may not bring them (not 'No invites left': the removal is checked first).
begin;
select pg_temp.co2_cast();
insert into public.plans(id,owner_id,title,starts_at,ends_at,time_zone,place_label,categories,repeat_weeks,bring_invites,bring_levels) values
 ('f6100000-0000-4000-8000-000000000002','f6000000-0000-4000-8000-000000000001','Weekly quiz',
  '2099-06-11 19:00+00','2099-06-11 22:00+00','UTC','Pub',array['community'],1,1,2);
insert into public.attendees(plan_id,user_id,response) values
 ('f6100000-0000-4000-8000-000000000002','f6000000-0000-4000-8000-000000000002','accepted');
set local role authenticated;
select pg_temp.co2_as('02');
select public.invite_contacts('f6100000-0000-4000-8000-000000000002',jsonb_build_array(pg_temp.co2_number('11','A')));
select pg_temp.co2_as('11');
select public.answer_phone_invitation(repeat('A',22),'Ivo I','declined','2026-10');
select pg_temp.co2_as('02');
select public.invite_contacts('f6100000-0000-4000-8000-000000000002',jsonb_build_array(pg_temp.co2_number('10','B')));
select pg_temp.co2_as('10');
select public.answer_phone_invitation(repeat('B',22),'Lia L','accepted','2026-10');
select pg_temp.co2_as('01');
select public.invite_contacts('f6100000-0000-4000-8000-000000000002',jsonb_build_array(pg_temp.co2_user('06')));
select public.remove_guest('f6100000-0000-4000-8000-000000000002',pg_temp.co2('06'));
reset role;
insert into private.app_sessions(user_id) values (pg_temp.co2('10')),(pg_temp.co2('11'));
update public.plans set starts_at=now()-interval '3 hours', ends_at=now()-interval '1 hour' where id='f6100000-0000-4000-8000-000000000002';
do $$ declare n public.plans; begin
 if private.roll_repeating_plans()<1 then raise exception 'Nothing rolled'; end if;
 select * into n from public.plans where repeats_from='f6100000-0000-4000-8000-000000000002';
 if not found then raise exception 'No next occurrence'; end if;
 if (n.bring_invites,n.bring_levels) is distinct from (1::smallint,2::smallint) then raise exception 'The circle was not copied'; end if;
 if (select string_agg(right(user_id::text,2)||':'||response||':'||coalesce(right(brought_by::text,2),'-')||':'||level,',' order by user_id)
   from public.attendees where plan_id=n.id) is distinct from '02:pending:-:1,10:pending:02:2,11:pending:02:2' then
  raise exception 'Carried: %', (select string_agg(right(user_id::text,2)||':'||response||':'||coalesce(right(brought_by::text,2),'-')||':'||level,',' order by user_id)
   from public.attendees where plan_id=n.id);
 end if;
 perform pg_temp.co2_check(pg_temp.co2_allowance(n.id,'02')='1,2,0,1,false','02 on the next occurrence: '||pg_temp.co2_allowance(n.id,'02'));
 perform set_config('co2.next',n.id::text,true);
end $$;
set local role authenticated;
select pg_temp.co2_as('02');
select public.respond(current_setting('co2.next')::uuid,'accepted',1);
select pg_temp.co2_refused($$select public.invite_contacts(current_setting('co2.next')::uuid,jsonb_build_array(pg_temp.co2_user('06')))$$,
 '42501','Not allowed to bring people here');
rollback;

-- Slice 16: deletion (local only: the deletion lifecycle is not on the hosted project). set_plan_circle(2,2). 02
-- brings 06 and sends 10 a link; 01 removes 02. 02 asks to delete their account: nobody's row says 02 brought them,
-- 02's removal record goes, and 02's link still answers, with no bringer and its level.
select to_regprocedure('private.request_account_deletion(uuid,uuid,uuid,text)') is not null as co2_deletion \gset
\if :co2_deletion
begin;
select pg_temp.co2_cast();
set local role authenticated;
select pg_temp.co2_as('01');
select public.set_plan_circle(pg_temp.co2p(),2::smallint,2::smallint);
select pg_temp.co2_as('02');
select public.invite_contacts(pg_temp.co2p(),jsonb_build_array(pg_temp.co2_user('06'),pg_temp.co2_number('10','A')));
select pg_temp.co2_as('01');
select public.remove_guest(pg_temp.co2p(),pg_temp.co2('02'));
reset role;
insert into auth.sessions(id,user_id,created_at) values ('f6200000-0000-4000-8000-000000000002',pg_temp.co2('02'),now());
select private.request_account_deletion(pg_temp.co2('02'),'f6200000-0000-4000-8000-000000000002','f6300000-0000-4000-8000-000000000002',repeat('c',64));
do $$ begin
 if exists(select 1 from public.attendees where brought_by=pg_temp.co2('02')) or exists(select 1 from private.phone_invitations where brought_by=pg_temp.co2('02')) then
  raise exception 'A row still says 02 brought them';
 end if;
 if exists(select 1 from private.plan_removals where user_id=pg_temp.co2('02')) then raise exception '02''s removal record stayed'; end if;
 if (select (brought_by,level) from public.attendees where plan_id=pg_temp.co2p() and user_id=pg_temp.co2('06')) is distinct from (null::uuid,2::smallint) then
  raise exception '06 lost their level';
 end if;
end $$;
set local role authenticated;
select pg_temp.co2_as('10');
select public.answer_phone_invitation(repeat('A',22),'Lia L','accepted','2026-10');
reset role;
do $$ begin
 if (select (response,brought_by,level) from public.attendees where plan_id=pg_temp.co2p() and user_id=pg_temp.co2('10'))
   is distinct from ('accepted'::text,null::uuid,2::smallint) then
  raise exception '02''s link did not answer as expected';
 end if;
end $$;
rollback;
\endif

-- Slice 17: the rollback, rehearsed (C-R16). While the chat migrations are applied it refuses and changes nothing.
-- Without them it runs: the circle columns go, the roll it restores is the follow-ups' (it carries a guest who said
-- Can't go after Going), and the guarded request_account_deletion, where it exists, is the connections body again.
-- The full rehearsal of every object is 20261111130000_circles_of_trust.after.sql's, in hosted-baseline mode.
\set circles_rollback `cat :'resbite_repo'/supabase/rollback/20261111130000_circles_of_trust.rollback.sql`
select to_regclass('public.messages') is not null as co2_chat \gset
\if :co2_chat
begin;
create temporary table co2_rollback_script on commit drop as select :'circles_rollback'::text as script;
do $$ begin
 begin
  execute (select script from co2_rollback_script);
  raise exception 'The circles rollback ran while chat is applied';
 exception when raise_exception then
  if sqlerrm is distinct from 'Roll back the chat migrations before the circles-of-trust rollback' then raise; end if;
 end;
 if to_regclass('private.plan_removals') is null or to_regprocedure('public.set_plan_circle(uuid,smallint,smallint)') is null
 or not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.plans'::regclass and attname='bring_invites' and not attisdropped) then
  raise exception 'The refused rollback changed something';
 end if;
end $$;
rollback;
\else
begin;
:circles_rollback
do $$ declare v_next uuid; begin
 if exists(select 1 from pg_catalog.pg_attribute where attrelid='public.plans'::regclass and attname='bring_invites' and not attisdropped) then
  raise exception 'plans.bring_invites is still there';
 end if;
 if to_regprocedure('private.request_account_deletion(uuid,uuid,uuid,text)') is not null
 and pg_catalog.pg_get_functiondef('private.request_account_deletion(uuid,uuid,uuid,text)'::regprocedure) like '%brought_by%' then
  raise exception 'request_account_deletion still clears brought_by';
 end if;
 -- The roll it restored carries 02, who said Can't go after Going.
 insert into auth.users(id,email,email_confirmed_at) values
  ('f6000000-0000-4000-8000-000000000001','co2-owner@resbite-test.invalid',now()),
  ('f6000000-0000-4000-8000-000000000002','co2-going@resbite-test.invalid',now());
 insert into private.tester_roster(email) values ('co2-owner@resbite-test.invalid'),('co2-going@resbite-test.invalid');
 insert into public.profiles(id,display_name) values ('f6000000-0000-4000-8000-000000000001','Ana Host'),('f6000000-0000-4000-8000-000000000002','Pedro P');
 insert into private.app_sessions(user_id) values ('f6000000-0000-4000-8000-000000000002');
 insert into public.plans(id,owner_id,title,starts_at,ends_at,time_zone,place_label,categories,repeat_weeks) values
  ('f6100000-0000-4000-8000-000000000003','f6000000-0000-4000-8000-000000000001','Rolled quiz',now()-interval '3 hours',now()-interval '1 hour',
   'UTC','Pub',array['community'],1);
 insert into public.attendees(plan_id,user_id,response) values
  ('f6100000-0000-4000-8000-000000000003','f6000000-0000-4000-8000-000000000002','withdrawn');
 perform private.roll_repeating_plans();
 select id into v_next from public.plans where repeats_from='f6100000-0000-4000-8000-000000000003';
 if v_next is null or not exists(select 1 from public.attendees where plan_id=v_next and user_id='f6000000-0000-4000-8000-000000000002') then
  raise exception 'The restored roll left out a guest who said Can''t go after Going';
 end if;
end $$;
rollback;
\endif

drop function pg_temp.co2_cast(), pg_temp.co2_allowance(uuid,text), pg_temp.co2_used(text), pg_temp.co2_refused(text,text,text),
 pg_temp.co2_check(boolean,text), pg_temp.co2_kinds(jsonb), pg_temp.co2_as(text), pg_temp.co2_number(text,text), pg_temp.co2_user(text),
 pg_temp.co2_phone(text), pg_temp.co2p(), pg_temp.co2(text);
