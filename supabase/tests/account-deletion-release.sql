-- Account deletion release (20261117110000_account_deletion_release.sql, spec C2): the jobs table and its held status,
-- the legal hold and the suspension history shared with plan 6, the September keys, and the two hosted
-- redefinitions (S1); the one request path for every account, its close and erase steps, the hold, the team's script
-- and the replay (S2 to S5); the worker, its two buckets and the hold in the middle of a job (S6); the receipts' 30
-- days (S7). Runs in both modes (supabase/tests/hosted-baseline/tests.txt). Synthetic identities only (prefix dd); one
-- rolled-back block. Users dd000000-0000-4000-8000-0000000000NN, plans dd1…, sessions dd2…, requests dd3…, message
-- client ids dd4….
-- Users dd…: 01 Hana, phone-only, owns three resbites (a one-off tomorrow, a weekly group next week, a one-off that
-- ended yesterday), has a profile photo and a cover, and filed a report about 02; 02 Gus, email; 03 Sam, phone-only
-- and suspended; 04 Ana, anonymous; 05 Hal, phone-only, a guest of Hana's one-off, under a hold not lifted; 06 Ben,
-- email, banned, under a hold lifted yesterday, no session; 07 under no hold and no Auth user (S1 only); 08 Rae, email,
-- no job. 21 to 23 are receipts only, of accounts already gone (S7).
begin;
-- A statement that must be refused with exactly this code, whatever its message (a table's check).
create function pg_temp.dd_refused(p_sql text, p_state text) returns void language plpgsql as $$
declare v_state text;
begin
 begin
  execute p_sql;
 exception when others then
  get stacked diagnostics v_state = returned_sqlstate;
 end;
 if v_state is distinct from p_state then raise exception 'Expected %, got %: %', p_state, v_state, p_sql; end if;
end $$;

-- Ids: a user, a plan, a session, a request and a message's client id, by number.
create function pg_temp.ddu(p_n text) returns uuid language sql immutable as $$ select ('dd000000-0000-4000-8000-0000000000'||p_n)::uuid $$;
create function pg_temp.ddp(p_n text) returns uuid language sql immutable as $$ select ('dd100000-0000-4000-8000-0000000000'||p_n)::uuid $$;
create function pg_temp.dds(p_n text) returns uuid language sql immutable as $$ select ('dd200000-0000-4000-8000-0000000000'||p_n)::uuid $$;
create function pg_temp.ddr(p_n text) returns uuid language sql immutable as $$ select ('dd300000-0000-4000-8000-0000000000'||p_n)::uuid $$;
create function pg_temp.ddm(p_n text) returns uuid language sql immutable as $$ select ('dd400000-0000-4000-8000-0000000000'||p_n)::uuid $$;
-- An owner-run script's rows, run from its text as the current role: a jsonb array, one object per row (chat-safety.sql's
-- s3_run).
create function pg_temp.dd_run(p_sql text) returns jsonb language plpgsql as $$
declare r record; v jsonb := '[]'::jsonb;
begin
 if coalesce(length(btrim(p_sql)),0)=0 then raise exception 'The script text is empty'; end if;
 for r in execute p_sql loop v := v||jsonb_build_array(to_jsonb(r)); end loop;
 return v;
end $$;

-- Holds. user_id has no foreign key: a hold outlives the account, so these need no Auth user.
insert into private.legal_holds(user_id,reason,case_ref,review_on,lifted_at) values
 ('dd000000-0000-4000-8000-000000000005','police','LE-1',current_date+90,null),
 ('dd000000-0000-4000-8000-000000000006','police','LE-2',current_date+90,now()-interval '1 day');

-- The cast for S2 to S5, seeded under the roll's flag, so seeding writes no chat line (chat-groups.sql's e6_cast).
select set_config('resbite.system','roll',false);
insert into auth.users(id,phone,phone_confirmed_at) values
 (pg_temp.ddu('01'),'447700900301',now()),(pg_temp.ddu('03'),'447700900303',now()),(pg_temp.ddu('05'),'447700900305',now());
insert into auth.users(id,email,email_confirmed_at,banned_until) values
 (pg_temp.ddu('02'),'dd-02@resbite-test.invalid',now(),null),
 (pg_temp.ddu('06'),'dd-06@resbite-test.invalid',now(),now()+interval '1 day'),
 (pg_temp.ddu('08'),'dd-08@resbite-test.invalid',now(),null);
-- Ana is anonymous; her confirmed email makes the anonymous line the only one that refuses her.
insert into auth.users(id,email,email_confirmed_at,is_anonymous) values (pg_temp.ddu('04'),'dd-04@resbite-test.invalid',now(),true);
insert into auth.sessions(id,user_id,created_at) values
 (pg_temp.dds('01'),pg_temp.ddu('01'),now()),(pg_temp.dds('11'),pg_temp.ddu('01'),now()-interval '6 minutes'),
 (pg_temp.dds('03'),pg_temp.ddu('03'),now()),(pg_temp.dds('04'),pg_temp.ddu('04'),now()),(pg_temp.dds('05'),pg_temp.ddu('05'),now());
insert into public.profiles(id,display_name,avatar_path) values
 (pg_temp.ddu('01'),'Hana',pg_temp.ddu('01')||'/a.jpg'),(pg_temp.ddu('02'),'Gus',null),(pg_temp.ddu('03'),'Sam',null),
 (pg_temp.ddu('05'),'Hal',null),(pg_temp.ddu('06'),'Ben',null),(pg_temp.ddu('08'),'Rae',null);
-- Hana's files for S6: her profile photo and the one-off's cover. They come before her request: in full mode the local
-- photo guard (20260923152816) refuses a profile-photos write once a job exists.
insert into storage.objects(bucket_id,name) values
 ('profile-photos',pg_temp.ddu('01')||'/a.jpg'),('plan-covers',pg_temp.ddu('01')||'/'||pg_temp.ddp('01')||'/c.jpg');
insert into private.device_endpoints(token,user_id,platform) values ('dd-device-01',pg_temp.ddu('01'),'ios'),('dd-device-05',pg_temp.ddu('05'),'ios');
-- Hana's three: a one-off tomorrow, a weekly group next week (its chat row a group), a one-off that ended yesterday.
insert into public.plans(id,owner_id,title,starts_at,ends_at,time_zone,place_label,categories,repeat_weeks) values
 (pg_temp.ddp('01'),pg_temp.ddu('01'),'Picnic',now()+interval '1 day',now()+interval '1 day 2 hours','UTC','Park',array['community'],null),
 (pg_temp.ddp('02'),pg_temp.ddu('01'),'Walk',now()+interval '7 days',now()+interval '7 days 2 hours','UTC','Hill',array['community'],1),
 (pg_temp.ddp('03'),pg_temp.ddu('01'),'Past title',now()-interval '1 day 2 hours',now()-interval '1 day','UTC','Hall',array['community'],null);
insert into public.attendees(plan_id,user_id,response) values (pg_temp.ddp('01'),pg_temp.ddu('02'),'accepted'),(pg_temp.ddp('01'),pg_temp.ddu('05'),'accepted');
insert into public.messages(series_id,plan_id,author_id,kind,body,client_id) values
 (pg_temp.ddp('01'),pg_temp.ddp('01'),pg_temp.ddu('01'),'message','Hana one',pg_temp.ddm('01')),
 (pg_temp.ddp('01'),pg_temp.ddp('01'),pg_temp.ddu('01'),'message','Hana two',pg_temp.ddm('02')),
 (pg_temp.ddp('01'),pg_temp.ddp('01'),pg_temp.ddu('05'),'message','Hal here',pg_temp.ddm('05'));
-- A notice queued for Hana, which her deletion takes.
insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key) values (pg_temp.ddp('01'),pg_temp.ddu('01'),'plan_changed','dd-seed:01');
-- Hana's open report about Gus; Gus's open report about Sam, which led to Sam's suspension three days ago (a revoked
-- grant, recorded as suspend-account.sql records it).
with r as (insert into private.reports(reporter_id,target_user_id,series_id,plan_id,about,reason)
 values (pg_temp.ddu('01'),pg_temp.ddu('02'),pg_temp.ddp('01'),pg_temp.ddp('01'),'user','harassment') returning id)
select set_config('dd.report01',(select id::text from r),false);
with r as (insert into private.reports(reporter_id,target_user_id,about,reason)
 values (pg_temp.ddu('02'),pg_temp.ddu('03'),'user','spam') returning id)
select set_config('dd.report03',(select id::text from r),false);
insert into private.beta_access(user_id,source,revoked_at) values (pg_temp.ddu('03'),'maintainer',now()-interval '3 days');
insert into private.suspensions(user_id,report_id,roster,grant_at,at,grant_made)
 values (pg_temp.ddu('03'),current_setting('dd.report03')::bigint,false,now()-interval '3 days',now()-interval '3 days',true);
select set_config('dd.version01',(select version::text from public.plans where id=pg_temp.ddp('01')),false);
select set_config('dd.history',(select count(*)::text from private.suspension_history),false);
select set_config('resbite.system','',false);

-- S1. Tables, keys, the hold and the two hosted redefinitions.

-- S1.1 A job may be held: the status check names 'held' beside the September three. The jobs' two indexes.
do $$ declare v_def text; begin
 select pg_catalog.pg_get_constraintdef(c.oid) into v_def from pg_catalog.pg_constraint c
  where c.conrelid='private.account_deletion_jobs'::regclass and c.conname='account_deletion_jobs_status_check';
 if v_def is null or v_def not like '%''held''%' or v_def not like '%''queued''%' or v_def not like '%''processing''%'
  or v_def not like '%''complete''%' then
  raise exception 'S1.1 The jobs status check is %', v_def;
 end if;
 if pg_catalog.pg_get_indexdef('private.account_deletion_pending_idx'::regclass)
   not like '%ON private.account_deletion_jobs USING btree (next_attempt_at) WHERE (status <> ''complete''::text)'
 or pg_catalog.pg_get_indexdef('private.account_deletion_completed_idx'::regclass)
   not like '%ON private.account_deletion_jobs USING btree (completed_at) WHERE (status = ''complete''::text)' then
  raise exception 'S1.1 The jobs indexes are wrong';
 end if;
 if pg_catalog.pg_get_indexdef('private.legal_holds_user_idx'::regclass)
   not like '%ON private.legal_holds USING btree (user_id) WHERE (lifted_at IS NULL)'
 or pg_catalog.pg_get_indexdef('private.legal_holds_series_idx'::regclass)
   not like '%ON private.legal_holds USING btree (series_id) WHERE (lifted_at IS NULL)' then
  raise exception 'S1.1 The hold indexes are wrong';
 end if;
end $$;

-- S1.2 The September delete rules: a deleted host's resbites lose their owner, a deleted guest's places go, a claimed
-- invitation forgets who claimed it. owner_id may be null.
do $$ declare v_rule text; begin
 select c.confdeltype::text into v_rule from pg_catalog.pg_constraint c
  where c.conrelid='public.plans'::regclass and c.conname='plans_owner_id_fkey' and c.confrelid='public.profiles'::regclass;
 if v_rule is distinct from 'n' then raise exception 'S1.2 plans_owner_id_fkey deletes with %', v_rule; end if;
 select c.confdeltype::text into v_rule from pg_catalog.pg_constraint c
  where c.conrelid='public.attendees'::regclass and c.conname='attendees_user_id_fkey' and c.confrelid='public.profiles'::regclass;
 if v_rule is distinct from 'c' then raise exception 'S1.2 attendees_user_id_fkey deletes with %', v_rule; end if;
 select c.confdeltype::text into v_rule from pg_catalog.pg_constraint c
  where c.conrelid='private.invitations'::regclass and c.conname='invitations_claimed_by_fkey' and c.confrelid='public.profiles'::regclass;
 if v_rule is distinct from 'n' then raise exception 'S1.2 invitations_claimed_by_fkey deletes with %', v_rule; end if;
 if (select a.attnotnull from pg_catalog.pg_attribute a where a.attrelid='public.plans'::regclass and a.attname='owner_id') then
  raise exception 'S1.2 public.plans.owner_id is still not null';
 end if;
end $$;

-- S1.3 This file made the shared objects, so each carries its marker and its rollback may drop them.
do $$ begin
 if pg_catalog.obj_description('private.legal_holds'::regclass,'pg_class') is distinct from 'resbite 20261117110000'
 or pg_catalog.obj_description('private.suspension_history'::regclass,'pg_class') is distinct from 'resbite 20261117110000'
 or pg_catalog.obj_description('private.account_held(uuid)'::regprocedure,'pg_proc') is distinct from 'resbite 20261117110000' then
  raise exception 'S1.3 A shared object lacks this file''s marker';
 end if;
end $$;

-- S1.4 No API role touches the three tables or asks whether an account is held. RLS is on. service_role may enter the
-- private schema, so the worker RPCs' wrappers reach their bodies.
do $$ declare r text; t text; begin
 foreach r in array array['anon','authenticated','service_role'] loop
  foreach t in array array['private.legal_holds','private.suspension_history','private.account_deletion_jobs'] loop
   if pg_catalog.has_table_privilege(r,t,'SELECT,INSERT,UPDATE,DELETE') then raise exception 'S1.4 % may use %', r, t; end if;
  end loop;
  if pg_catalog.has_function_privilege(r,'private.account_held(uuid)','EXECUTE') then
   raise exception 'S1.4 % may execute account_held', r;
  end if;
 end loop;
 if exists(select 1 from pg_catalog.pg_class c where c.oid in ('private.legal_holds'::regclass,
   'private.suspension_history'::regclass,'private.account_deletion_jobs'::regclass) and not c.relrowsecurity) then
  raise exception 'S1.4 A table lacks RLS';
 end if;
 if not pg_catalog.has_schema_privilege('service_role','private','USAGE') then raise exception 'S1.4 service_role lacks the private schema'; end if;
end $$;

-- S1.5 A hold not lifted names the account. A lifted hold, no hold and null are not held. A hold names exactly one of an
-- account or a series, for a known reason and a plain case reference.
do $$ begin
 if not private.account_held('dd000000-0000-4000-8000-000000000005') then raise exception 'S1.5 05 is not held'; end if;
 if private.account_held('dd000000-0000-4000-8000-000000000006') then raise exception 'S1.5 06 is held after the lift'; end if;
 if private.account_held('dd000000-0000-4000-8000-000000000007') then raise exception 'S1.5 07 is held with no hold'; end if;
 if private.account_held(null) is distinct from false then raise exception 'S1.5 null is not false'; end if;
end $$;
select pg_temp.dd_refused($$insert into private.legal_holds(user_id,series_id,reason,case_ref,review_on)
 values ('dd000000-0000-4000-8000-000000000007','dd100000-0000-4000-8000-000000000001','police','LE-3',current_date+90)$$,'23514');
select pg_temp.dd_refused($$insert into private.legal_holds(reason,case_ref,review_on) values ('police','LE-3',current_date+90)$$,'23514');
select pg_temp.dd_refused($$insert into private.legal_holds(user_id,reason,case_ref,review_on)
 values ('dd000000-0000-4000-8000-000000000007','other','LE-3',current_date+90)$$,'23514');
select pg_temp.dd_refused($$insert into private.legal_holds(user_id,reason,case_ref,review_on)
 values ('dd000000-0000-4000-8000-000000000007','police','a b',current_date+90)$$,'23514');

-- S1.6 A deletion job counts as being deleted, as the profile's mark does.
do $$ begin
 if private.deletion_pending('dd000000-0000-4000-8000-000000000007') then raise exception 'S1.6 07 is pending with no job'; end if;
 insert into private.account_deletion_jobs(request_id,user_id,recovery_hash)
  values ('dd300000-0000-4000-8000-000000000007','dd000000-0000-4000-8000-000000000007',pg_catalog.sha256('dd-07'::bytea));
 if not private.deletion_pending('dd000000-0000-4000-8000-000000000007') then raise exception 'S1.6 07''s job is not pending'; end if;
end $$;

-- S1.7 require_tester takes the account's lock (hashtextextended of the uuid, 47) and is no longer stable.
do $$ declare v_def text := pg_catalog.pg_get_functiondef('private.require_tester()'::regprocedure); begin
 if strpos(v_def,'hashtextextended(auth.uid()::text,47)')=0 then raise exception 'S1.7 require_tester takes no lock: %', v_def; end if;
 if strpos(v_def,'STABLE')>0 then raise exception 'S1.7 require_tester is still stable: %', v_def; end if;
end $$;

-- S2. Requests: the one path (D-4), a fresh session of this user, a confirmed email or phone, not anonymous (D-19).

-- S2.1 No app client may ask: only the Edge function, as service_role.
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.ddu('01'),'role','authenticated')::text,true);
select pg_temp.dd_refused(format('select public.request_account_deletion(%L,%L,%L,%L)',pg_temp.ddu('01'),pg_temp.dds('01'),
 pg_temp.ddr('01'),repeat('a',64)),'42501');
reset role;
select set_config('request.jwt.claims','',true);

-- S2.2 A session that isn't there, one made six minutes ago (refreshed, not fresh), and an anonymous account are refused.
set local role service_role;
select pg_temp.dd_refused(format('select public.request_account_deletion(%L,%L,%L,%L)',pg_temp.ddu('01'),pg_temp.dds('99'),
 pg_temp.ddr('01'),repeat('a',64)),'42501');
select pg_temp.dd_refused(format('select public.request_account_deletion(%L,%L,%L,%L)',pg_temp.ddu('01'),pg_temp.dds('11'),
 pg_temp.ddr('01'),repeat('a',64)),'42501');
select pg_temp.dd_refused(format('select public.request_account_deletion(%L,%L,%L,%L)',pg_temp.ddu('04'),pg_temp.dds('04'),
 pg_temp.ddr('04'),repeat('a',64)),'42501');

-- S2.3 Hana, phone-only, with her fresh session: accepted, and the answer is exactly the request and queued.
do $$ declare v jsonb; begin
 v := public.request_account_deletion(pg_temp.ddu('01'),pg_temp.dds('01'),pg_temp.ddr('01'),repeat('a',64));
 if v is distinct from '{"requestId":"dd300000-0000-4000-8000-000000000001","status":"queued"}'::jsonb then
  raise exception 'S2.3 Hana''s request answered %', v;
 end if;
end $$;

-- S2.4 The same call again answers the same.
do $$ declare v jsonb; begin
 v := public.request_account_deletion(pg_temp.ddu('01'),pg_temp.dds('01'),pg_temp.ddr('01'),repeat('a',64));
 if v is distinct from '{"requestId":"dd300000-0000-4000-8000-000000000001","status":"queued"}'::jsonb then
  raise exception 'S2.4 Hana''s request again answered %', v;
 end if;
end $$;

-- S2.5 Another request for an account that already has one is refused.
do $$ begin
 begin
  perform public.request_account_deletion(pg_temp.ddu('01'),pg_temp.dds('01'),pg_temp.ddr('09'),repeat('a',64));
  raise exception 'S2.5 A second request for Hana was accepted';
 exception when invalid_parameter_value then
  if sqlerrm is distinct from 'Deletion already requested' then raise; end if;
 end;
end $$;

-- S2.6 (Review Focus 1) A retry after the proof has gone stale returns the accepted request: never "Fresh
-- authentication required", never a second request.
reset role;
update auth.sessions set created_at=now()-interval '1 hour' where id=pg_temp.dds('01');
set local role service_role;
do $$ declare v jsonb; begin
 v := public.request_account_deletion(pg_temp.ddu('01'),pg_temp.dds('01'),pg_temp.ddr('01'),repeat('a',64));
 if v is distinct from '{"requestId":"dd300000-0000-4000-8000-000000000001","status":"queued"}'::jsonb then
  raise exception 'S2.6 Hana''s retry with a stale proof answered %', v;
 end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from private.account_deletion_jobs where user_id=pg_temp.ddu('01'))<>1 then
  raise exception 'S2.6 Hana has more than one job';
 end if;
end $$;

-- S2.7 (D-19) A suspended account may delete itself.
set local role service_role;
do $$ declare v jsonb; begin
 v := public.request_account_deletion(pg_temp.ddu('03'),pg_temp.dds('03'),pg_temp.ddr('03'),repeat('c',64));
 if v->>'status' is distinct from 'queued' or v->>'requestId' is distinct from pg_temp.ddr('03')::text then
  raise exception 'S2.7 Sam''s request answered %', v;
 end if;
end $$;
reset role;

-- S3. The effects on Hana (D-20, ASR2-6, AS-R2).

-- S3.1 The one-off tomorrow is cancelled, one version on, and Gus is told once. Hana is told nothing.
do $$ begin
 if (select (status,version) from public.plans where id=pg_temp.ddp('01'))
   is distinct from ('cancelled'::text,current_setting('dd.version01')::integer+1) then
  raise exception 'S3.1 The one-off is %', (select (status,version) from public.plans where id=pg_temp.ddp('01'));
 end if;
 if (select array_agg(dedupe_key) from private.notification_outbox where kind='plan_cancelled' and recipient_id=pg_temp.ddu('02'))
   is distinct from array['deletion:dd300000-0000-4000-8000-000000000001:dd100000-0000-4000-8000-000000000001:dd000000-0000-4000-8000-000000000002'] then
  raise exception 'S3.1 Gus''s cancellation notices are %',
   (select array_agg(dedupe_key) from private.notification_outbox where kind='plan_cancelled' and recipient_id=pg_temp.ddu('02'));
 end if;
 if exists(select 1 from private.notification_outbox where recipient_id=pg_temp.ddu('01')) then
  raise exception 'S3.1 A notice is queued for Hana';
 end if;
end $$;

-- S3.2 The weekly group is cancelled, and its chat stops now (ASR2-6): it closes 48 hours later.
do $$ declare v_stopped timestamptz; begin
 select stopped_at into v_stopped from public.chats where series_id=pg_temp.ddp('02');
 if (select status from public.plans where id=pg_temp.ddp('02')) is distinct from 'cancelled' then
  raise exception 'S3.2 The weekly group is not cancelled';
 end if;
 if v_stopped is null or not (select is_group from public.chats where series_id=pg_temp.ddp('02')) then
  raise exception 'S3.2 The group''s chat did not stop';
 end if;
 if private.chat_closes_at(pg_temp.ddp('02')) is distinct from v_stopped+interval '48 hours' then
  raise exception 'S3.2 The group''s chat closes at %, stopped at %', private.chat_closes_at(pg_temp.ddp('02')), v_stopped;
 end if;
end $$;

-- S3.3 The one that ended stays, with its title and place removed.
do $$ begin
 if (select (status,title,place_label) from public.plans where id=pg_temp.ddp('03'))
   is distinct from ('active'::text,'Resbite'::text,'Meeting place removed'::text) then
  raise exception 'S3.3 The past one-off is %', (select (status,title,place_label) from public.plans where id=pg_temp.ddp('03'));
 end if;
end $$;

-- S3.4 Hana's profile is a deleted member's.
do $$ begin
 if (select (display_name,avatar_path is null,deletion_requested_at is not null) from public.profiles where id=pg_temp.ddu('01'))
   is distinct from ('Deleted member'::text,true,true) then
  raise exception 'S3.4 Hana''s profile is %', (select (display_name,avatar_path,deletion_requested_at) from public.profiles where id=pg_temp.ddu('01'));
 end if;
end $$;

-- S3.5 Her two messages lose their words and their author, and read deleted.
do $$ begin
 if (select count(*) from public.messages where client_id in (pg_temp.ddm('01'),pg_temp.ddm('02'))
   and body is null and author_id is null and state='deleted')<>2 then
  raise exception 'S3.5 Hana''s messages kept something';
 end if;
end $$;

-- S3.6 (AS-R2) Her report about Gus stays, without her name.
do $$ begin
 if (select (reporter_id is null,target_user_id) from private.reports where id=current_setting('dd.report01')::bigint)
   is distinct from (true,pg_temp.ddu('02')) then
  raise exception 'S3.6 Hana''s report is gone or still names her';
 end if;
end $$;

-- S3.7 No device, no notice and no guest row of hers is left.
do $$ begin
 if exists(select 1 from private.device_endpoints where user_id=pg_temp.ddu('01'))
 or exists(select 1 from private.notification_outbox where recipient_id=pg_temp.ddu('01'))
 or exists(select 1 from public.attendees where user_id=pg_temp.ddu('01')) then
  raise exception 'S3.7 A device, a notice or a guest row of Hana''s stayed';
 end if;
end $$;

-- S3.8 Her old token reads nothing and writes nothing.
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.ddu('01'),'role','authenticated')::text,true);
do $$ begin
 if (select count(*) from public.plans)<>0 then raise exception 'S3.8 Hana''s old token still reads plans'; end if;
end $$;
select pg_temp.dd_refused($$select public.save_profile('Back')$$,'42501');
reset role;
select set_config('request.jwt.claims','',true);

-- S4. Suspension (AS-R1): the record moves to the history, without the account.

-- S4.1 Sam's suspension is gone; the history keeps its report and its dates, and no link to him.
do $$ begin
 if exists(select 1 from private.suspensions where user_id=pg_temp.ddu('03')) then raise exception 'S4.1 Sam''s suspension stayed'; end if;
 if (select count(*) from private.suspension_history)<>current_setting('dd.history')::integer+1 then
  raise exception 'S4.1 The history has % new rows', (select count(*) from private.suspension_history)-current_setting('dd.history')::integer;
 end if;
 if not exists(select 1 from private.suspension_history where user_id is null and report_id=current_setting('dd.report03')::bigint
   and suspended_at=now()-interval '3 days' and ended_at=now() and how='account_deleted') then
  raise exception 'S4.1 The history row is %', (select array_agg(h) from private.suspension_history h);
 end if;
end $$;

-- S4.2 The history row outlives the Auth user.
delete from auth.users where id=pg_temp.ddu('03');
do $$ begin
 if not exists(select 1 from private.suspension_history where report_id=current_setting('dd.report03')::bigint and how='account_deleted') then
  raise exception 'S4.2 Sam''s history row went with his Auth user';
 end if;
end $$;

-- S5. The hold, the team's script and the replay.

-- S5.1 (UGC-15) Hal is under a hold: his request is accepted and reads queued, but the job is held.
set local role service_role;
do $$ declare v jsonb; begin
 v := public.request_account_deletion(pg_temp.ddu('05'),pg_temp.dds('05'),pg_temp.ddr('05'),repeat('e',64));
 if v is distinct from jsonb_build_object('requestId',pg_temp.ddr('05'),'status','queued') then
  raise exception 'S5.1 Hal''s request answered %', v;
 end if;
 if public.account_deletion_status(pg_temp.ddr('05'),repeat('e',64))->>'status' is distinct from 'queued' then
  raise exception 'S5.1 Hal''s status reads %', public.account_deletion_status(pg_temp.ddr('05'),repeat('e',64));
 end if;
end $$;
reset role;
do $$ begin
 if (select status from private.account_deletion_jobs where request_id=pg_temp.ddr('05')) is distinct from 'held' then
  raise exception 'S5.1 Hal''s job is %', (select status from private.account_deletion_jobs where request_id=pg_temp.ddr('05'));
 end if;
end $$;

-- S5.2 Only the close step ran: his name and his words stay, his devices and notices go, and he may not use the app.
do $$ begin
 if (select display_name from public.profiles where id=pg_temp.ddu('05')) is distinct from 'Hal' then raise exception 'S5.2 Hal''s name changed'; end if;
 if (select body from public.messages where client_id=pg_temp.ddm('05')) is distinct from 'Hal here' then raise exception 'S5.2 Hal''s message changed'; end if;
 if exists(select 1 from private.device_endpoints where user_id=pg_temp.ddu('05')) then raise exception 'S5.2 Hal''s device stayed'; end if;
 if exists(select 1 from private.notification_outbox where recipient_id=pg_temp.ddu('05')) then raise exception 'S5.2 A notice is queued for Hal'; end if;
 if private.user_eligible(pg_temp.ddu('05')) then raise exception 'S5.2 Hal may still use the app'; end if;
end $$;

-- S5.3 (AS-R3) The team deletes a banned account, with the same lifecycle (his hold was lifted, so the erase step runs
-- at once); an account that isn't there is refused. The call and the job's read are separate statements: one statement
-- would read the jobs with the snapshot taken before the call inserted his.
do $$ declare v jsonb; begin
 v := private.operator_account_deletion(pg_temp.ddu('06'));
 if v->>'status' is distinct from 'queued' or not exists(select 1 from private.account_deletion_jobs where user_id=pg_temp.ddu('06'))
 or (select display_name from public.profiles where id=pg_temp.ddu('06')) is distinct from 'Deleted member' then
  raise exception 'S5.3 Ben''s deletion answered %', v;
 end if;
end $$;
select pg_temp.dd_refused(format('select private.operator_account_deletion(%L)',pg_temp.ddu('99')),'22023');

-- S5.4 The replay after a restore: the original request and hash, so the saved receipt still resolves. Then present,
-- and gone for an account that isn't there.
do $$ begin
 if private.replay_account_deletion(pg_temp.ddu('08'),pg_temp.ddr('08'),extensions.digest(repeat('b',64),'sha256')) is distinct from 'replayed' then
  raise exception 'S5.4 Rae''s replay did not replay';
 end if;
 if private.account_deletion_status(pg_temp.ddr('08'),repeat('b',64))->>'status' is distinct from 'queued' then
  raise exception 'S5.4 Rae''s receipt does not resolve';
 end if;
 if private.replay_account_deletion(pg_temp.ddu('08'),pg_temp.ddr('08'),extensions.digest(repeat('b',64),'sha256')) is distinct from 'present' then
  raise exception 'S5.4 Rae''s second replay is not present';
 end if;
 if private.replay_account_deletion(pg_temp.ddu('99'),pg_temp.ddr('99'),extensions.digest(repeat('b',64),'sha256')) is distinct from 'gone' then
  raise exception 'S5.4 A replay for no account is not gone';
 end if;
end $$;

-- S5.5 supabase/ops/delete-account.sql, run as the owner pastes it with an account id: twice is safe (Rae's replayed
-- job comes back, no second job), and an account that isn't there is refused.
\set dd_script `sed -e 's/00000000-0000-0000-0000-000000000000/dd000000-0000-4000-8000-000000000008/' :'resbite_repo'/supabase/ops/delete-account.sql`
\set dd_script99 `sed -e 's/00000000-0000-0000-0000-000000000000/dd000000-0000-4000-8000-000000000099/' :'resbite_repo'/supabase/ops/delete-account.sql`
select set_config('dd.out',pg_temp.dd_run(:'dd_script')::text,true);
do $$ declare v jsonb := current_setting('dd.out')::jsonb; begin
 if jsonb_array_length(v)<>1 or v->0->'request'->>'requestId' is distinct from pg_temp.ddr('08')::text then
  raise exception 'S5.5 delete-account.sql answered %', v;
 end if;
 if (select count(*) from private.account_deletion_jobs where user_id=pg_temp.ddu('08'))<>1 then
  raise exception 'S5.5 delete-account.sql made a second job';
 end if;
end $$;
select pg_temp.dd_refused(:'dd_script99','22023');

-- S5.6 The steps are the database's own; service_role may ask and check, as the Edge function does.
do $$ declare r text; f text; begin
 foreach r in array array['anon','authenticated','service_role'] loop
  foreach f in array array['private.queue_account_deletion(uuid,uuid,bytea)','private.close_account(uuid,uuid)',
    'private.erase_account(uuid)','private.operator_account_deletion(uuid)','private.replay_account_deletion(uuid,uuid,bytea)'] loop
   if pg_catalog.has_function_privilege(r,f,'EXECUTE') then raise exception 'S5.6 % may execute %', r, f; end if;
  end loop;
 end loop;
 foreach f in array array['private.request_account_deletion(uuid,uuid,uuid,text)','public.request_account_deletion(uuid,uuid,uuid,text)',
   'private.account_deletion_status(uuid,text)','public.account_deletion_status(uuid,text)'] loop
  if not pg_catalog.has_function_privilege('service_role',f,'EXECUTE') then raise exception 'S5.6 service_role may not execute %', f; end if;
  if pg_catalog.has_function_privilege('anon',f,'EXECUTE') or pg_catalog.has_function_privilege('authenticated',f,'EXECUTE') then
   raise exception 'S5.6 An app client may execute %', f;
  end if;
 end loop;
end $$;

-- S6. The worker (ASR2-9): both buckets under the account's folder, then the Auth user; a hold stops it (UGC-15).

-- S6.0 A late upload can't land in a deleting account: Hana's token, which still names her, may not write a profile
-- photo. The photo guard runs require_tester in both modes. On hosted this file makes the guard and its trigger, with
-- its marker; the local replay keeps 20260923152816's stronger body, unmarked.
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.ddu('01'),'role','authenticated')::text,true);
select pg_temp.dd_refused(format('insert into storage.objects(bucket_id,name) values (%L,%L)','profile-photos',
 pg_temp.ddu('01')||'/late.jpg'),'42501');
select set_config('request.jwt.claims','',true);
do $$ declare v_def text; v_made_here boolean; begin
 if pg_catalog.to_regprocedure('private.guard_photo_write()') is null
 or not exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid='storage.objects'::regclass
   and t.tgname='resbite_photo_write_guard' and t.tgfoid='private.guard_photo_write()'::regprocedure) then
  raise exception 'S6.0 The photo guard is not on storage.objects';
 end if;
 v_def := pg_catalog.pg_get_functiondef('private.guard_photo_write()'::regprocedure);
 v_made_here := strpos(v_def,'Photo account unavailable')=0;
 if (pg_catalog.obj_description('private.guard_photo_write()'::regprocedure,'pg_proc') is not distinct from 'resbite 20261117110000')
   is distinct from v_made_here
 or ((select pg_catalog.obj_description(t.oid,'pg_trigger') from pg_catalog.pg_trigger t
    where t.tgrelid='storage.objects'::regclass and t.tgname='resbite_photo_write_guard') is not distinct from 'resbite 20261117110000')
   is distinct from v_made_here then
  raise exception 'S6.0 The photo guard''s marker does not say who made it (made here: %)', v_made_here;
 end if;
end $$;

-- S6.1 The worker claims Hana's job, not Hal's (held). A live lease isn't claimed again.
set local role service_role;
do $$ declare v jsonb; begin
 v := public.claim_account_deletions(5);
 if not exists(select 1 from jsonb_array_elements(v) e where e->>'userId'=pg_temp.ddu('01')::text
   and e->>'requestId'=pg_temp.ddr('01')::text and e->>'leaseId' is not null and (e->>'attempts')::integer=1) then
  raise exception 'S6.1 Hana''s job was not claimed: %', v;
 end if;
 if exists(select 1 from jsonb_array_elements(v) e where e->>'userId'=pg_temp.ddu('05')::text) then
  raise exception 'S6.1 Hal''s held job was claimed: %', v;
 end if;
 perform set_config('dd.lease01',(select e->>'leaseId' from jsonb_array_elements(v) e where e->>'userId'=pg_temp.ddu('01')::text),false);
 v := public.claim_account_deletions(5);
 if exists(select 1 from jsonb_array_elements(v) e where e->>'userId'=pg_temp.ddu('01')::text) then
  raise exception 'S6.1 Hana''s live lease was claimed again: %', v;
 end if;
end $$;

-- S6.2 Her files in both buckets, by bucket then name.
do $$ declare v jsonb; begin
 v := public.deletion_storage_objects(pg_temp.ddr('01'),current_setting('dd.lease01')::uuid);
 if v is distinct from jsonb_build_array(
   jsonb_build_object('bucket','plan-covers','name',pg_temp.ddu('01')||'/'||pg_temp.ddp('01')||'/c.jpg'),
   jsonb_build_object('bucket','profile-photos','name',pg_temp.ddu('01')||'/a.jpg')) then
  raise exception 'S6.2 Hana''s files are %', v;
 end if;
end $$;
reset role;

-- S6.3 (Review Focus 2) A hold set after the request was accepted, here in the middle of Hana's claimed job: the
-- worker may not list her files, and once her lease has passed it doesn't claim her again. Undone after.
savepoint dd_s63;
insert into private.legal_holds(user_id,reason,case_ref,review_on) values (pg_temp.ddu('01'),'police','LE-4',current_date+90);
set local role service_role;
do $$ begin
 begin
  perform public.deletion_storage_objects(pg_temp.ddr('01'),current_setting('dd.lease01')::uuid);
  raise exception 'S6.3 The worker listed a held account''s files';
 exception when insufficient_privilege then
  if sqlerrm is distinct from 'Deletion on hold' then raise; end if;
 end;
end $$;
reset role;
update private.account_deletion_jobs set lease_until=now()-interval '1 second' where request_id=pg_temp.ddr('01');
set local role service_role;
do $$ declare v jsonb; begin
 v := public.claim_account_deletions(5);
 if exists(select 1 from jsonb_array_elements(v) e where e->>'userId'=pg_temp.ddu('01')::text) then
  raise exception 'S6.3 Hana''s job was claimed under a hold: %', v;
 end if;
end $$;
reset role;
rollback to savepoint dd_s63;

-- S6.4 Hal's hold is lifted: the worker runs the erase step it parked (his name and his words go) and claims his job.
update private.legal_holds set lifted_at=now() where user_id=pg_temp.ddu('05') and lifted_at is null;
set local role service_role;
do $$ declare v jsonb; begin
 v := public.claim_account_deletions(5);
 if not exists(select 1 from jsonb_array_elements(v) e where e->>'userId'=pg_temp.ddu('05')::text
   and e->>'requestId'=pg_temp.ddr('05')::text and e->>'leaseId' is not null) then
  raise exception 'S6.4 Hal''s job was not claimed: %', v;
 end if;
 perform set_config('dd.lease05',(select e->>'leaseId' from jsonb_array_elements(v) e where e->>'userId'=pg_temp.ddu('05')::text),false);
end $$;
reset role;
do $$ begin
 if (select display_name from public.profiles where id=pg_temp.ddu('05')) is distinct from 'Deleted member' then
  raise exception 'S6.4 Hal''s name is %', (select display_name from public.profiles where id=pg_temp.ddu('05'));
 end if;
 if not exists(select 1 from public.messages where client_id=pg_temp.ddm('05') and body is null and author_id is null) then
  raise exception 'S6.4 Hal''s message kept its words';
 end if;
 if (select status from private.account_deletion_jobs where request_id=pg_temp.ddr('05')) is distinct from 'processing' then
  raise exception 'S6.4 Hal''s job is %', (select status from private.account_deletion_jobs where request_id=pg_temp.ddr('05'));
 end if;
end $$;

-- S6.5 Hana's job completes only once her files and her Auth user are gone. Her resbites stay, with no organiser.
set local role service_role;
do $$ begin
 begin
  perform public.finish_account_deletion(pg_temp.ddr('01'),current_setting('dd.lease01')::uuid,true);
  raise exception 'S6.5 Hana''s job completed with her files and Auth user still there';
 exception when invalid_parameter_value then
  if sqlerrm is distinct from 'Cleanup still pending' then raise; end if;
 end;
end $$;
reset role;
delete from storage.objects where name like 'dd000000-0000-4000-8000-000000000001/%';
delete from auth.users where id=pg_temp.ddu('01');
set local role service_role;
do $$ begin
 if not public.finish_account_deletion(pg_temp.ddr('01'),current_setting('dd.lease01')::uuid,true) then
  raise exception 'S6.5 Hana''s job did not complete';
 end if;
end $$;
reset role;
do $$ begin
 if (select (status,completed_at is not null,lease_id is null) from private.account_deletion_jobs where request_id=pg_temp.ddr('01'))
   is distinct from ('complete'::text,true,true) then
  raise exception 'S6.5 Hana''s job is %', (select (status,completed_at,lease_id) from private.account_deletion_jobs where request_id=pg_temp.ddr('01'));
 end if;
 if (select count(*) from public.plans where id in (pg_temp.ddp('01'),pg_temp.ddp('02'),pg_temp.ddp('03')) and owner_id is null)<>3 then
  raise exception 'S6.5 A resbite of Hana''s went or kept its organiser';
 end if;
end $$;

-- S6.6 (Review Focus 5) A cover file left after Hal's Auth user has gone keeps his job open, so the file is never
-- orphaned with no record.
insert into storage.objects(bucket_id,name) values ('plan-covers',pg_temp.ddu('05')||'/x/c.jpg');
delete from auth.users where id=pg_temp.ddu('05');
do $$ begin
 if exists(select 1 from public.profiles where id=pg_temp.ddu('05')) then raise exception 'S6.6 Hal''s profile outlived his Auth user'; end if;
end $$;
set local role service_role;
do $$ begin
 begin
  perform public.finish_account_deletion(pg_temp.ddr('05'),current_setting('dd.lease05')::uuid,true);
  raise exception 'S6.6 Hal''s job completed with his cover file left';
 exception when invalid_parameter_value then
  if sqlerrm is distinct from 'Cleanup still pending' then raise; end if;
 end;
end $$;
reset role;

-- S7. Receipts (ASR2-10): a complete receipt goes 30 days after completion, but not while a hold names the account
-- or a file of it is left.

-- S7.1 No app client may purge; a batch is 1 to 100.
set local role anon;
select pg_temp.dd_refused('select public.purge_completed_deletion_receipts()','42501');
reset role;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.ddu('02'),'role','authenticated')::text,true);
select pg_temp.dd_refused('select public.purge_completed_deletion_receipts()','42501');
reset role;
select set_config('request.jwt.claims','',true);
set local role service_role;
select pg_temp.dd_refused('select public.purge_completed_deletion_receipts(0)','22023');
reset role;

-- S7.2 Complete receipts of accounts already gone: r1, 31 days old, goes; r2, 29 days old, and r3, 60 days old under a
-- hold not lifted, stay.
insert into private.account_deletion_jobs(request_id,user_id,recovery_hash,status,completed_at) values
 (pg_temp.ddr('21'),pg_temp.ddu('21'),extensions.digest(repeat('1',64),'sha256'),'complete',now()-interval '31 days'),
 (pg_temp.ddr('22'),pg_temp.ddu('22'),extensions.digest(repeat('2',64),'sha256'),'complete',now()-interval '29 days'),
 (pg_temp.ddr('23'),pg_temp.ddu('23'),extensions.digest(repeat('3',64),'sha256'),'complete',now()-interval '60 days');
insert into private.legal_holds(user_id,reason,case_ref,review_on) values (pg_temp.ddu('23'),'court','LE-5',current_date+90);
set local role service_role;
do $$ declare n integer; begin
 n := public.purge_completed_deletion_receipts();
 if n is distinct from 1 then raise exception 'S7.2 The purge removed % receipts', n; end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from private.account_deletion_jobs where request_id=pg_temp.ddr('21')) then
  raise exception 'S7.2 r1 stayed';
 end if;
 if (select count(*) from private.account_deletion_jobs where request_id in (pg_temp.ddr('22'),pg_temp.ddr('23')))<>2 then
  raise exception 'S7.2 r2 or r3 went';
 end if;
end $$;

-- S7.3 r1 no longer resolves; r2 still does.
set local role service_role;
do $$ begin
 if public.account_deletion_status(pg_temp.ddr('21'),repeat('1',64)) is not null then raise exception 'S7.3 r1 still resolves'; end if;
 if public.account_deletion_status(pg_temp.ddr('22'),repeat('2',64))->>'status' is distinct from 'complete' then
  raise exception 'S7.3 r2 does not resolve';
 end if;
end $$;
reset role;

-- S7.4 (Review Focus 5) Hal's receipt, complete 60 days ago, stays while his cover file is left. Once the file has
-- gone, the receipt goes.
update private.account_deletion_jobs set status='complete',completed_at=now()-interval '60 days',lease_id=null,lease_until=null
 where request_id=pg_temp.ddr('05');
set local role service_role;
do $$ declare n integer; begin
 n := public.purge_completed_deletion_receipts();
 if n is distinct from 0 then raise exception 'S7.4 The purge removed % receipts with Hal''s cover left', n; end if;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from private.account_deletion_jobs where request_id=pg_temp.ddr('05')) then
  raise exception 'S7.4 Hal''s receipt went with his cover file left';
 end if;
end $$;
delete from storage.objects where name like 'dd000000-0000-4000-8000-000000000005/%';
set local role service_role;
do $$ declare n integer; begin
 n := public.purge_completed_deletion_receipts();
 if n is distinct from 1 then raise exception 'S7.4 The purge removed % receipts once Hal''s cover went', n; end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from private.account_deletion_jobs where request_id=pg_temp.ddr('05')) then
  raise exception 'S7.4 Hal''s receipt stayed once his cover went';
 end if;
end $$;

rollback;
