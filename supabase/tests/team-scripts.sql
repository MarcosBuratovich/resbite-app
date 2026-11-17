-- The team's owner-run scripts (App Store readiness plan 6: docs/superpowers/plans/2026-11-17-asr-6-retention-and-team-scripts.md;
-- spec C6). Each script is read as text (\set with a backtick sed that swaps its one literal, as chat-safety.sql reads
-- suspend-account.sql) and run as one statement through pg_temp.r7_run, which answers its rows as a jsonb array and
-- keeps the column names, in order, in r7.columns. Slice 1 (Task 7): suspend-account-by-id.sql revokes a grant (made,
-- revoked, when the account had none), records it with the report given, and changes nothing run again;
-- lift-suspension.sql moves the record to private.suspension_history and puts back only what the suspension changed,
-- so an earlier ban stays. Slice 2 (Task 7): set-legal-hold.sql sets a hold on one account or one series, never both;
-- legal-holds.sql, read-only, lists the holds not lifted, by review date; lift-legal-hold.sql lifts one once. Slice 3
-- (Task 7): remove-profile-photo.sql and remove-resbite-content.sql take content down and queue its file, but keep the
-- file under a hold. Each script, unedited, changes nothing. No script prints an email or a number.
-- Synthetic identities only: ids a7000000-0000-4000-8000-0000000000NN through pg_temp.a7(text); emails
-- r7-NN@resbite-test.invalid; numbers 4477009007NN (an account's NN is its user number). One rolled-back block.
-- Users a7…: 01 Ana, no grant (slice 1); 02 Ben, banned a month ago (a revoked grant); 03 Eve, held, then lifted (slice
-- 2); 04 Fay, whose photo is removed (slice 3); 05 Gil, hosts the weekly 51, whose next occurrence 52 shares its cover
-- C1; 06 Cal, a live grant, reported by 07 Dee; 08 Hal, held in slice 3, whose photo is removed and whose one-off 53,
-- with its cover C3, is taken down. Series a7…55 is named by a hold (no plan: a hold names a series id).
begin;
-- A check that must hold: raises p_what when p_ok is not true (false or null).
create function pg_temp.r7_check(p_ok boolean, p_what text) returns void language plpgsql as $$
begin
 if p_ok is not true then raise exception '%', p_what; end if;
end $$;
-- A statement that must be refused with exactly this code, whatever its message (a table's check).
create function pg_temp.r7_refused(p_sql text, p_state text) returns void language plpgsql as $$
declare v_state text;
begin
 begin
  execute p_sql;
 exception when others then
  get stacked diagnostics v_state = returned_sqlstate;
 end;
 if v_state is distinct from p_state then raise exception 'Expected %, got %: %', p_state, coalesce(v_state,'no error'), p_sql; end if;
end $$;
-- An id by number.
create function pg_temp.a7(p_n text) returns uuid language sql immutable as $$ select ('a7000000-0000-4000-8000-0000000000'||p_n)::uuid $$;
-- Every script's printed rows, to check at the end that none holds an email or a number.
create temporary table r7_printed(script text not null, out jsonb not null) on commit drop;
-- An owner-run script's rows, run from its text as the current role: {"rows": a jsonb array, one object per row,
-- "columns": the first row's column names, in order}. A script that is more than one statement, or holds a psql
-- meta-command, can't run this way.
create function pg_temp.r7_exec(p_sql text) returns jsonb language plpgsql as $$
declare r record; v jsonb := '[]'::jsonb; c text;
begin
 if coalesce(length(btrim(p_sql)),0)=0 then raise exception 'The script text is empty'; end if;
 for r in execute p_sql loop
  v := v||jsonb_build_array(to_jsonb(r));
  if c is null then
   select string_agg(k.name,',' order by k.n) into c from json_object_keys(to_json(r)) with ordinality as k(name,n);
  end if;
 end loop;
 return jsonb_build_object('rows',v,'columns',coalesce(c,''));
end $$;
-- Run a script: its rows (r7_exec's), recorded in r7_printed under p_name; its column names in r7.columns.
create function pg_temp.r7_run(p_name text, p_sql text) returns jsonb language plpgsql as $$
declare v jsonb := pg_temp.r7_exec(p_sql);
begin
 perform set_config('r7.columns',v->>'columns',true);
 insert into pg_temp.r7_printed(script,out) values (p_name,v->'rows');
 return v->'rows';
end $$;
-- The same in a read-only subtransaction, undone after: a script that writes anything fails with 25006 (chat-safety.sql's
-- s3_run_read_only).
create function pg_temp.r7_run_read_only(p_name text, p_sql text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
 begin
  perform set_config('transaction_read_only','on',true);
  v := pg_temp.r7_exec(p_sql);
  raise exception 'r7: the read-only run is over';
 exception when raise_exception then
  if sqlerrm is distinct from 'r7: the read-only run is over' then raise; end if;
 end;
 perform set_config('r7.columns',v->>'columns',true);
 insert into pg_temp.r7_printed(script,out) values (p_name,v->'rows');
 return v->'rows';
end $$;
-- A cover's path, <owner>/<plan>/<name>.jpg, and a profile photo's, <account>/<name>.jpg.
create function pg_temp.r7_cover(p_owner text, p_plan text, p_name text) returns text language sql immutable as $$
 select pg_temp.a7(p_owner)::text||'/'||pg_temp.a7(p_plan)::text||'/'||p_name||'.jpg' $$;
create function pg_temp.r7_photo(p_user text, p_name text) returns text language sql immutable as $$
 select pg_temp.a7(p_user)::text||'/'||p_name||'.jpg' $$;

-- The cast and the files, seeded under the roll's flag, so seeding writes no chat line (chat-groups.sql's e6_cast).
select set_config('resbite.system','roll',true);
insert into auth.users(id,phone,phone_confirmed_at)
 select pg_temp.a7(n),'4477009007'||n,now() from unnest(array['01','02','03','04','05','08']) n;
insert into auth.users(id,email,email_confirmed_at)
 select pg_temp.a7(n),'r7-'||n||'@resbite-test.invalid',now() from unnest(array['06','07']) n;
insert into public.profiles(id,display_name) values
 (pg_temp.a7('01'),'Ana'),(pg_temp.a7('02'),'Ben'),(pg_temp.a7('03'),'Eve'),(pg_temp.a7('05'),'Gil'),(pg_temp.a7('06'),'Cal'),
 (pg_temp.a7('07'),'Dee');
insert into public.profiles(id,display_name,avatar_path) values
 (pg_temp.a7('04'),'Fay',pg_temp.r7_photo('04','a')),(pg_temp.a7('08'),'Hal',pg_temp.r7_photo('08','a'));
insert into private.beta_access(user_id,source,granted_at,revoked_at) values
 (pg_temp.a7('02'),'link',now()-interval '60 days',now()-interval '30 days'),(pg_temp.a7('06'),'link',now()-interval '60 days',null);
insert into storage.objects(bucket_id,name) values
 ('plan-covers',pg_temp.r7_cover('05','51','c1')),('plan-covers',pg_temp.r7_cover('08','53','c3')),
 ('profile-photos',pg_temp.r7_photo('04','a')),('profile-photos',pg_temp.r7_photo('08','a'));
insert into public.plans(id,owner_id,title,description,starts_at,ends_at,time_zone,place_label,categories,repeat_weeks,
 guest_note,guest_note_at,has_meeting_details,cover_path) values
 (pg_temp.a7('51'),pg_temp.a7('05'),'Swim','Lake swim',now()-interval '6 days 2 hours',now()-interval '6 days','UTC','Lake',
  array['physical'],1,'Bring a towel',now(),false,pg_temp.r7_cover('05','51','c1')),
 (pg_temp.a7('53'),pg_temp.a7('08'),'Talk','A talk',now()+interval '7 days',now()+interval '7 days 2 hours','UTC','Hall',
  array['intellectual'],null,'Doors at six',now(),false,pg_temp.r7_cover('08','53','c3'));
insert into public.plans(id,owner_id,title,description,starts_at,ends_at,time_zone,place_label,categories,repeat_weeks,
 guest_note,guest_note_at,has_meeting_details,cover_path,series_id,repeats_from) values
 (pg_temp.a7('52'),pg_temp.a7('05'),'Swim','Lake swim',now()+interval '1 day',now()+interval '1 day 2 hours','UTC','Lake',
  array['physical'],1,'Bring a towel',now(),false,pg_temp.r7_cover('05','51','c1'),pg_temp.a7('51'),pg_temp.a7('51'));
select set_config('resbite.system','',true);
-- 07's open report about 06, the one 06's suspension comes from.
insert into private.reports(reporter_id,target_user_id,about,reason) values (pg_temp.a7('07'),pg_temp.a7('06'),'user','harassment')
 returning id as r7_rid \gset
select pg_temp.r7_check(private.user_eligible(pg_temp.a7('01')) and private.user_eligible(pg_temp.a7('06'))
 and not private.user_eligible(pg_temp.a7('02')), 'The cast: 01 or 06 may not use the app, or 02 may');

-- Slice 1 (Task 7): suspend by account id, and lift after an appeal.

-- suspend_by_id: unedited, the script finds no account and changes nothing. On 01, who has no grant, it records a
-- revoked grant: 01 may no longer use the app, and private.suspensions records it, with no report, grant_made true. Run
-- again, it revokes nothing and the record stays as it was.
\set r7_script `cat :'resbite_repo'/supabase/ops/suspend-account-by-id.sql`
select set_config('r7.out',pg_temp.r7_run('suspend-account-by-id.sql',:'r7_script')::text,true);
select pg_temp.r7_check(current_setting('r7.out')::jsonb = jsonb_build_array(jsonb_build_object('account',null,'grants_revoked',0))
 and current_setting('r7.columns') = 'account,grants_revoked'
 and not exists(select 1 from private.suspensions s where s.user_id::text like 'a7000000-%'),
 'suspend_by_id: the unedited script answered '||current_setting('r7.out'));
\set r7_script `sed -e "s/('00000000-0000-0000-0000-000000000000'::uuid, null::bigint)/('a7000000-0000-4000-8000-000000000001'::uuid, null::bigint)/" :'resbite_repo'/supabase/ops/suspend-account-by-id.sql`
select set_config('r7.out',pg_temp.r7_run('suspend-account-by-id.sql',:'r7_script')::text,true);
select pg_temp.r7_check(current_setting('r7.out')::jsonb = jsonb_build_array(jsonb_build_object('account',pg_temp.a7('01'),'grants_revoked',1))
 and not private.user_eligible(pg_temp.a7('01'))
 and (select (source,revoked_at) from private.beta_access where user_id=pg_temp.a7('01')) is not distinct from ('maintainer'::text,now())
 and (select (report_id,roster,grant_at,at,grant_made) from private.suspensions where user_id=pg_temp.a7('01'))
  is not distinct from (null::bigint,false,now(),now(),true),
 'suspend_by_id: on 01 it answered '||current_setting('r7.out'));
select set_config('r7.out',pg_temp.r7_run('suspend-account-by-id.sql',:'r7_script')::text,true);
select pg_temp.r7_check(current_setting('r7.out')::jsonb = jsonb_build_array(jsonb_build_object('account',pg_temp.a7('01'),'grants_revoked',0))
 and (select count(*) from private.suspensions where user_id=pg_temp.a7('01')) = 1
 and (select (report_id,roster,grant_at,at,grant_made) from private.suspensions where user_id=pg_temp.a7('01'))
  is not distinct from (null::bigint,false,now(),now(),true),
 'suspend_by_id: run again on 01 it answered '||current_setting('r7.out'));

-- suspension_lifted: unedited, the lift finds nothing. On 01, suspended 20 days ago, it deletes the record and keeps it
-- in the history (how 'lifted', from the time it was made to now), and deletes the grant the suspension made: 01 may use
-- the app again and has no grant.
\set r7_script `cat :'resbite_repo'/supabase/ops/lift-suspension.sql`
select set_config('r7.out',pg_temp.r7_run('lift-suspension.sql',:'r7_script')::text,true);
select pg_temp.r7_check(current_setting('r7.out')::jsonb = jsonb_build_array(jsonb_build_object('lifted',0,'grants_restored',0))
 and current_setting('r7.columns') = 'lifted,grants_restored'
 and not exists(select 1 from private.suspension_history h where h.user_id::text like 'a7000000-%'),
 'suspension_lifted: the unedited script answered '||current_setting('r7.out'));
update private.suspensions set at=now()-interval '20 days' where user_id=pg_temp.a7('01');
\set r7_script `sed -e "s/('00000000-0000-0000-0000-000000000000'::uuid)/('a7000000-0000-4000-8000-000000000001'::uuid)/" :'resbite_repo'/supabase/ops/lift-suspension.sql`
select set_config('r7.out',pg_temp.r7_run('lift-suspension.sql',:'r7_script')::text,true);
select pg_temp.r7_check(current_setting('r7.out')::jsonb = jsonb_build_array(jsonb_build_object('lifted',1,'grants_restored',1))
 and private.user_eligible(pg_temp.a7('01'))
 and not exists(select 1 from private.suspensions where user_id=pg_temp.a7('01'))
 and not exists(select 1 from private.beta_access where user_id=pg_temp.a7('01'))
 and (select count(*) from private.suspension_history where user_id=pg_temp.a7('01')) = 1
 and (select (report_id,suspended_at,ended_at,how) from private.suspension_history where user_id=pg_temp.a7('01'))
  is not distinct from (null::bigint,now()-interval '20 days',now(),'lifted'::text),
 'suspension_lifted: on 01 it answered '||current_setting('r7.out'));
select set_config('r7.out',pg_temp.r7_run('lift-suspension.sql',:'r7_script')::text,true);
select pg_temp.r7_check(current_setting('r7.out')::jsonb = jsonb_build_array(jsonb_build_object('lifted',0,'grants_restored',0))
 and (select count(*) from private.suspension_history where user_id=pg_temp.a7('01')) = 1,
 'suspension_lifted: run again on 01 it answered '||current_setting('r7.out'));

-- earlier_ban_stays: 02, banned a month ago, is suspended (nothing revoked, nothing recorded) and lifted (nothing
-- lifted, nothing restored): 02 still may not use the app, the month-old revocation kept.
\set r7_script `sed -e "s/('00000000-0000-0000-0000-000000000000'::uuid, null::bigint)/('a7000000-0000-4000-8000-000000000002'::uuid, null::bigint)/" :'resbite_repo'/supabase/ops/suspend-account-by-id.sql`
select set_config('r7.out',pg_temp.r7_run('suspend-account-by-id.sql',:'r7_script')::text,true);
\set r7_script `sed -e "s/('00000000-0000-0000-0000-000000000000'::uuid)/('a7000000-0000-4000-8000-000000000002'::uuid)/" :'resbite_repo'/supabase/ops/lift-suspension.sql`
select set_config('r7.out2',pg_temp.r7_run('lift-suspension.sql',:'r7_script')::text,true);
select pg_temp.r7_check(current_setting('r7.out')::jsonb = jsonb_build_array(jsonb_build_object('account',pg_temp.a7('02'),'grants_revoked',0))
 and current_setting('r7.out2')::jsonb = jsonb_build_array(jsonb_build_object('lifted',0,'grants_restored',0))
 and not private.user_eligible(pg_temp.a7('02'))
 and (select revoked_at from private.beta_access where user_id=pg_temp.a7('02')) = now()-interval '30 days'
 and not exists(select 1 from private.suspensions where user_id=pg_temp.a7('02'))
 and not exists(select 1 from private.suspension_history where user_id=pg_temp.a7('02')),
 'earlier_ban_stays: on 02 they answered '||current_setting('r7.out')||' '||current_setting('r7.out2'));

-- grant_comes_back: 06, with a live grant, is suspended on 07's report: the grant is revoked and the record keeps the
-- report. The lift makes the same grant live again, and the history keeps the report.
\set r7_script `sed -e "s/('00000000-0000-0000-0000-000000000000'::uuid, null::bigint)/('a7000000-0000-4000-8000-000000000006'::uuid, :r7_rid::bigint)/" :'resbite_repo'/supabase/ops/suspend-account-by-id.sql`
select set_config('r7.out',pg_temp.r7_run('suspend-account-by-id.sql',:'r7_script')::text,true);
select pg_temp.r7_check(current_setting('r7.out')::jsonb = jsonb_build_array(jsonb_build_object('account',pg_temp.a7('06'),'grants_revoked',1))
 and not private.user_eligible(pg_temp.a7('06'))
 and (select (source,revoked_at) from private.beta_access where user_id=pg_temp.a7('06')) is not distinct from ('link'::text,now())
 and (select (report_id,roster,grant_at,grant_made) from private.suspensions where user_id=pg_temp.a7('06'))
  is not distinct from (:r7_rid::bigint,false,now(),false),
 'grant_comes_back: the suspension of 06 answered '||current_setting('r7.out'));
\set r7_script `sed -e "s/('00000000-0000-0000-0000-000000000000'::uuid)/('a7000000-0000-4000-8000-000000000006'::uuid)/" :'resbite_repo'/supabase/ops/lift-suspension.sql`
select set_config('r7.out',pg_temp.r7_run('lift-suspension.sql',:'r7_script')::text,true);
select pg_temp.r7_check(current_setting('r7.out')::jsonb = jsonb_build_array(jsonb_build_object('lifted',1,'grants_restored',1))
 and private.user_eligible(pg_temp.a7('06'))
 and (select (source,granted_at,revoked_at) from private.beta_access where user_id=pg_temp.a7('06'))
  is not distinct from ('link'::text,now()-interval '60 days',null::timestamptz)
 and (select (report_id,ended_at,how) from private.suspension_history where user_id=pg_temp.a7('06'))
  is not distinct from (:r7_rid::bigint,now(),'lifted'::text),
 'grant_comes_back: the lift for 06 answered '||current_setting('r7.out'));

-- Slice 2 (Task 7): the legal hold scripts.

-- hold_set: unedited, the script names neither id and is refused (23514), as is a copy that names both. On 03, for the
-- NCA, it prints the hold, and 03 is held. A hold on series 55, due for review today, is set the same way; a hold
-- lifted yesterday stays lifted.
\set r7_script `cat :'resbite_repo'/supabase/ops/set-legal-hold.sql`
select pg_temp.r7_refused(:'r7_script','23514');
\set r7_script `sed -e "s/(null::uuid, null::uuid, 'police', 'LE-2026-000', current_date + 90)/('a7000000-0000-4000-8000-000000000003'::uuid, 'a7000000-0000-4000-8000-000000000055'::uuid, 'police', 'LE-2026-099', current_date + 90)/" :'resbite_repo'/supabase/ops/set-legal-hold.sql`
select pg_temp.r7_refused(:'r7_script','23514');
select pg_temp.r7_check(not exists(select 1 from private.legal_holds), 'hold_set: a refused copy set a hold');
\set r7_script `sed -e "s/(null::uuid, null::uuid, 'police', 'LE-2026-000', current_date + 90)/('a7000000-0000-4000-8000-000000000003'::uuid, null::uuid, 'nca', 'NCA-2026-003', current_date + 90)/" :'resbite_repo'/supabase/ops/set-legal-hold.sql`
select set_config('r7.out',pg_temp.r7_run('set-legal-hold.sql',:'r7_script')::text,true);
select h.id as r7_hold from private.legal_holds h where h.user_id=pg_temp.a7('03') and h.lifted_at is null \gset
select pg_temp.r7_check(current_setting('r7.out')::jsonb = jsonb_build_array(jsonb_build_object('id',:r7_hold::bigint,
  'user_id',pg_temp.a7('03'),'series_id',null,'reason','nca','case_ref','NCA-2026-003','review_on',current_date+90,'set_at',now()))
 and current_setting('r7.columns') = 'id,user_id,series_id,reason,case_ref,review_on,set_at'
 and private.account_held(pg_temp.a7('03')) and (select count(*) from private.legal_holds) = 1,
 'hold_set: on 03 it answered '||current_setting('r7.out'));
\set r7_script `sed -e "s/(null::uuid, null::uuid, 'police', 'LE-2026-000', current_date + 90)/(null::uuid, 'a7000000-0000-4000-8000-000000000055'::uuid, 'court', 'CT-2026-055', current_date)/" :'resbite_repo'/supabase/ops/set-legal-hold.sql`
select set_config('r7.out',pg_temp.r7_run('set-legal-hold.sql',:'r7_script')::text,true);
select h.id as r7_series_hold from private.legal_holds h where h.series_id=pg_temp.a7('55') and h.lifted_at is null \gset
select pg_temp.r7_check(jsonb_array_length(current_setting('r7.out')::jsonb) = 1 and private.series_held(pg_temp.a7('55')),
 'hold_set: on series 55 it answered '||current_setting('r7.out'));
insert into private.legal_holds(user_id,reason,case_ref,review_on,set_at,lifted_at) values
 (pg_temp.a7('07'),'claim','CL-2026-007',current_date+30,now()-interval '60 days',now()-interval '1 day');

-- holds_listed: legal-holds.sql, read-only, lists the two holds not lifted, the series' first (its review is due), with
-- what each holds; not the lifted one.
\set r7_script `cat :'resbite_repo'/supabase/ops/legal-holds.sql`
select set_config('r7.out',pg_temp.r7_run_read_only('legal-holds.sql',:'r7_script')::text,true);
select pg_temp.r7_check(current_setting('r7.out')::jsonb = jsonb_build_array(
  jsonb_build_object('id',:r7_series_hold::bigint,'scope','series','held_id',pg_temp.a7('55'),'reason','court','case_ref','CT-2026-055',
   'set_at',now(),'review_on',current_date,'review_due',true),
  jsonb_build_object('id',:r7_hold::bigint,'scope','account','held_id',pg_temp.a7('03'),'reason','nca','case_ref','NCA-2026-003',
   'set_at',now(),'review_on',current_date+90,'review_due',false))
 and current_setting('r7.columns') = 'id,scope,held_id,reason,case_ref,set_at,review_on,review_due',
 'holds_listed: legal-holds.sql answered '||current_setting('r7.out'));

-- hold_lifted: unedited, the lift finds no hold. On 03's hold it sets lifted_at and prints the hold: 03 is no longer
-- held. Run again, it prints nothing. The series hold stays.
\set r7_script `cat :'resbite_repo'/supabase/ops/lift-legal-hold.sql`
select set_config('r7.out',pg_temp.r7_run('lift-legal-hold.sql',:'r7_script')::text,true);
select pg_temp.r7_check(current_setting('r7.out')::jsonb = '[]'::jsonb, 'hold_lifted: the unedited script answered '||current_setting('r7.out'));
\set r7_script `sed -e "s/(values (0::bigint))/(values (:r7_hold::bigint))/" :'resbite_repo'/supabase/ops/lift-legal-hold.sql`
select set_config('r7.out',pg_temp.r7_run('lift-legal-hold.sql',:'r7_script')::text,true);
select pg_temp.r7_check(current_setting('r7.out')::jsonb = jsonb_build_array(jsonb_build_object('id',:r7_hold::bigint,
  'user_id',pg_temp.a7('03'),'series_id',null,'reason','nca','case_ref','NCA-2026-003','review_on',current_date+90,'set_at',now(),
  'lifted_at',now()))
 and current_setting('r7.columns') = 'id,user_id,series_id,reason,case_ref,review_on,set_at,lifted_at'
 and not private.account_held(pg_temp.a7('03')) and private.series_held(pg_temp.a7('55'))
 and (select lifted_at from private.legal_holds where id=:r7_hold::bigint) = now(),
 'hold_lifted: on 03''s hold it answered '||current_setting('r7.out'));
select set_config('r7.out',pg_temp.r7_run('lift-legal-hold.sql',:'r7_script')::text,true);
select pg_temp.r7_check(current_setting('r7.out')::jsonb = '[]'::jsonb, 'hold_lifted: run again it answered '||current_setting('r7.out'));

-- Slice 3 (Task 7): the takedown scripts.

-- photo_removed: unedited, the script finds no photo. On 04, the photo comes off the profile and its file is queued.
-- 08 is held (set with set-legal-hold.sql, as the procedure says, before the removal): the photo comes off, and the
-- file is kept, not retired or queued ("hide and preserve").
\set r7_script `cat :'resbite_repo'/supabase/ops/remove-profile-photo.sql`
select set_config('r7.out',pg_temp.r7_run('remove-profile-photo.sql',:'r7_script')::text,true);
select pg_temp.r7_check(current_setting('r7.out')::jsonb = '[{"result": {"detached": false, "queued": false, "held": false}}]'::jsonb
 and current_setting('r7.columns') = 'result',
 'photo_removed: the unedited script answered '||current_setting('r7.out'));
\set r7_script `sed -e "s/('00000000-0000-0000-0000-000000000000'::uuid)/('a7000000-0000-4000-8000-000000000004'::uuid)/" :'resbite_repo'/supabase/ops/remove-profile-photo.sql`
select set_config('r7.out',pg_temp.r7_run('remove-profile-photo.sql',:'r7_script')::text,true);
select pg_temp.r7_check(current_setting('r7.out')::jsonb = '[{"result": {"detached": true, "queued": true, "held": false}}]'::jsonb
 and (select p.avatar_path is null from public.profiles p where p.id=pg_temp.a7('04'))
 and (select j.status from private.profile_photo_cleanup_jobs j where j.path=pg_temp.r7_photo('04','a')) = 'queued',
 'photo_removed: on 04 it answered '||current_setting('r7.out'));
\set r7_script `sed -e "s/(null::uuid, null::uuid, 'police', 'LE-2026-000', current_date + 90)/('a7000000-0000-4000-8000-000000000008'::uuid, null::uuid, 'intimate_image', 'MOD-2026-008', current_date + 90)/" :'resbite_repo'/supabase/ops/set-legal-hold.sql`
select set_config('r7.out',pg_temp.r7_run('set-legal-hold.sql',:'r7_script')::text,true);
\set r7_script `sed -e "s/('00000000-0000-0000-0000-000000000000'::uuid)/('a7000000-0000-4000-8000-000000000008'::uuid)/" :'resbite_repo'/supabase/ops/remove-profile-photo.sql`
select set_config('r7.out',pg_temp.r7_run('remove-profile-photo.sql',:'r7_script')::text,true);
select pg_temp.r7_check(current_setting('r7.out')::jsonb = '[{"result": {"detached": true, "queued": false, "held": true}}]'::jsonb
 and private.account_held(pg_temp.a7('08'))
 and (select p.avatar_path is null from public.profiles p where p.id=pg_temp.a7('08'))
 and not exists(select 1 from private.profile_photo_cleanup_jobs j where j.path=pg_temp.r7_photo('08','a'))
 and not exists(select 1 from private.profile_photo_retired_paths r where r.user_id=pg_temp.a7('08'))
 and exists(select 1 from storage.objects o where o.bucket_id='profile-photos' and o.name=pg_temp.r7_photo('08','a')),
 'photo_removed: on 08, held, it answered '||current_setting('r7.out'));

-- resbite_content_removed: unedited, the script is refused (P0002, no such resbite). On the weekly 51 (title, notes
-- and cover; the description kept), both occurrences read 'Resbite', with no cover and no guest note, the description
-- kept, and C1, which both used, is queued once. On 08's one-off 53 (08 is held) the content goes, but C3 is kept.
\set r7_script `cat :'resbite_repo'/supabase/ops/remove-resbite-content.sql`
select pg_temp.r7_refused(:'r7_script','P0002');
\set r7_script `sed -e "s/('00000000-0000-0000-0000-000000000000'::uuid, true, true, true, true)/('a7000000-0000-4000-8000-000000000051'::uuid, true, false, true, true)/" :'resbite_repo'/supabase/ops/remove-resbite-content.sql`
select set_config('r7.out',pg_temp.r7_run('remove-resbite-content.sql',:'r7_script')::text,true);
select pg_temp.r7_check(current_setting('r7.out')::jsonb = '[{"result": {"occurrences": 2, "covers_queued": 1, "held": false}}]'::jsonb
 and current_setting('r7.columns') = 'result'
 and (select count(*) from public.plans p where p.series_id=pg_temp.a7('51') and p.title='Resbite' and p.description='Lake swim'
   and p.cover_path is null and p.guest_note='') = 2
 and (select count(*) from private.plan_cover_cleanup_jobs j where j.path=pg_temp.r7_cover('05','51','c1') and j.status='queued') = 1,
 'resbite_content_removed: on 51 it answered '||current_setting('r7.out'));
\set r7_script `sed -e "s/('00000000-0000-0000-0000-000000000000'::uuid, true, true, true, true)/('a7000000-0000-4000-8000-000000000053'::uuid, true, true, true, true)/" :'resbite_repo'/supabase/ops/remove-resbite-content.sql`
select set_config('r7.out',pg_temp.r7_run('remove-resbite-content.sql',:'r7_script')::text,true);
select pg_temp.r7_check(current_setting('r7.out')::jsonb = '[{"result": {"occurrences": 1, "covers_queued": 0, "held": true}}]'::jsonb
 and (select p.title='Resbite' and p.description='' and p.cover_path is null and p.guest_note='' from public.plans p where p.id=pg_temp.a7('53'))
 and not exists(select 1 from private.plan_cover_cleanup_jobs j where j.path=pg_temp.r7_cover('08','53','c3'))
 and not exists(select 1 from private.plan_cover_retired_paths r where r.path_hash=extensions.digest(pg_temp.r7_cover('08','53','c3'),'sha256'))
 and exists(select 1 from storage.objects o where o.bucket_id='plan-covers' and o.name=pg_temp.r7_cover('08','53','c3')),
 'resbite_content_removed: on 53, whose host is held, it answered '||current_setting('r7.out'));

-- nothing_printed: each of the seven scripts above ran, and none printed an email or a number (ids and counts only).
select pg_temp.r7_check((select count(distinct script) from pg_temp.r7_printed) = 7
 and not exists(select 1 from pg_temp.r7_printed p where strpos(p.out::text,'@') > 0 or strpos(p.out::text,'4477009007') > 0),
 'nothing_printed: a script printed an email or a number, or did not run: '
  ||(select string_agg(p.script||' '||p.out::text,'; ') from pg_temp.r7_printed p));

rollback;
