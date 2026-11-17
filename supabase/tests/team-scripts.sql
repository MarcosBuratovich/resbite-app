-- The team's owner-run scripts (App Store readiness plan 6: docs/superpowers/plans/2026-11-17-asr-6-retention-and-team-scripts.md;
-- spec C6). Each script is read as text (\set with a backtick sed that swaps its one literal, as chat-safety.sql reads
-- suspend-account.sql) and run as one statement through pg_temp.r7_run, which answers its rows as a jsonb array and
-- keeps the column names, in order, in r7.columns. Slice 1 (Task 7): suspend-account-by-id.sql revokes a grant (made,
-- revoked, when the account had none), records it with the report given, and changes nothing run again;
-- lift-suspension.sql moves the record to private.suspension_history and puts back only what the suspension changed,
-- so an earlier ban stays. Slice 2 (Task 7): set-legal-hold.sql sets a hold on one account or one series, never both;
-- legal-holds.sql, read-only, lists the holds not lifted, by review date; lift-legal-hold.sql lifts one once. Slice 3
-- (Task 7): remove-profile-photo.sql and remove-resbite-content.sql take content down and queue its file, but keep the
-- file under a hold. Each script, unedited, changes nothing. No script of slices 1 to 3 prints an email or a number.
-- Slice 4 (Task 8): export-account.sql, read-only, prints one person's data (docs/compliance/data-requests.md sections 5
-- and 6): their own words, no id but their own, other people's numbers only as endings, and never a reporter, another
-- person's words, or a block or refusal of them; every list is [] when empty. export-number.sql, read-only, prints what
-- is held about a number that is not a user's (section 5.9).
-- Synthetic identities only: ids a7000000-0000-4000-8000-0000000000NN through pg_temp.a7(text); emails
-- r7-NN@resbite-test.invalid; numbers 4477009007NN (an account's NN is its user number; 98 and 99 are no one's). One
-- rolled-back block.
-- Users a7…: 01 Ana, no grant (slice 1); 02 Ben, banned a month ago (a revoked grant); 03 Eve, held, then lifted (slice
-- 2); 04 Fay, whose photo is removed (slice 3); 05 Gil, hosts the weekly 51, whose next occurrence 52 shares its cover
-- C1; 06 Cal, a live grant, reported by 07 Dee; 08 Hal, held in slice 3, whose photo is removed and whose one-off 53,
-- with its cover C3, is taken down. Series a7…55 is named by a hold (no plan: a hold names a series id). Slice 4 has
-- its own cast (10 to 14, resbites 60 to 63), told where it is seeded.
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

-- Slice 4 (Task 8): the data export (A16). It runs after nothing_printed: an export holds the person's own email and
-- number.

-- The cast, seeded under the roll's flag. 10 Ivo, with a number and an email, two sign-in methods, a session, a photo,
-- a cover, a push registration, a grant from a link, a lifted suspension and a deletion request, is a moderator. Ivo
-- hosts the one-off Picnic (60), with guests 11 Jo (going) and 12 Kit (maybe), co-hosted by 14 Mo, with meeting
-- details, a link and an invitation by number to 447700900799, who is not a user. In its chat Ivo wrote a message, an
-- announcement and a message the team removed, and Jo and Kit wrote one each; one system line names Ivo, one only Jo.
-- Ivo goes to Jo's weekly Board games (61), brought by Mo and invited through Ivo's number, co-hosts it, and muted it
-- and its chat; its series keeps 799's number, removed. Ivo asked to join Kit's Quiz (62), whose invitation to Ivo's
-- number Kit took back. Ivo was removed from Kit's past Run (63), by account and by number, and had left it. Mo asked
-- Ivo to connect, at 61, and they are connected. Jo reported Ivo's removed message ("he shouted"); Ivo reported Kit.
-- Ivo asked Jo to connect, at the Picnic, and Jo answered "Not now"; Kit blocked Ivo, and then Ivo asked Kit, which the
-- block turns into Kit's refusal of Ivo. Both go through the app's own functions, as the person who acts, so the rows
-- are stored as the app stores them: in private.connection_refusals, from_user asked and was refused, to_user refused
-- (20261110120000_connections.sql's table comment, decline_connection; 20261111160000_chat_safety.sql's
-- request_connection). Jo answered Kit's invitation to 799 at the Quiz when 799 was Jo's number: Jo's, not 799's
-- holder's. Ivo has a push about Jo's answer, and Jo one from Ivo. 13 Lu has an account and a profile, nothing else.
-- Ivo's deletion request is made last: the app refuses an account being deleted.
select set_config('resbite.system','roll',true);
insert into auth.users(id,phone,phone_confirmed_at,email,email_confirmed_at,raw_user_meta_data,created_at,last_sign_in_at) values
 (pg_temp.a7('10'),'447700900710',now()-interval '200 days','r7-10@resbite-test.invalid',now()-interval '100 days',
  '{"display_name": "Ivo"}',now()-interval '200 days',now()-interval '1 day'),
 (pg_temp.a7('11'),'447700900711',now(),'r7-11@resbite-test.invalid',now(),'{"display_name": "Jo"}',now(),now());
insert into auth.users(id,phone,phone_confirmed_at) select pg_temp.a7(n),'4477009007'||n,now() from unnest(array['12','13','14']) n;
insert into auth.identities(user_id,provider_id,provider,identity_data,email,created_at) values
 (pg_temp.a7('10'),pg_temp.a7('98')::text,'phone',jsonb_build_object('sub',pg_temp.a7('98')),null,now()-interval '200 days'),
 (pg_temp.a7('10'),pg_temp.a7('98')::text,'email',jsonb_build_object('sub',pg_temp.a7('98')),'r7-10@resbite-test.invalid',
  now()-interval '100 days');
insert into auth.sessions(id,user_id,created_at,updated_at,user_agent,ip) values
 (pg_temp.a7('97'),pg_temp.a7('10'),now()-interval '2 days',now()-interval '1 hour','Resbite/1.0 (iPhone; iOS 18.1)','192.0.2.10');
insert into public.profiles(id,display_name) values
 (pg_temp.a7('11'),'Jo'),(pg_temp.a7('12'),'Kit'),(pg_temp.a7('13'),'Lu'),(pg_temp.a7('14'),'Mo');
insert into public.profiles(id,display_name,avatar_path) values (pg_temp.a7('10'),'Ivo',pg_temp.r7_photo('10','a'));
insert into storage.objects(bucket_id,name) values
 ('profile-photos',pg_temp.r7_photo('10','a')),('profile-photos',pg_temp.r7_photo('11','a')),
 ('plan-covers',pg_temp.r7_cover('10','60','c6')),('plan-covers',pg_temp.r7_cover('11','61','c7'));
insert into private.age_attestations(user_id,terms_version) values (pg_temp.a7('10'),'2026-11');
insert into private.terms_acceptances(user_id,terms_version,accepted_at,how) values
 (pg_temp.a7('10'),'2026-11',now()-interval '200 days','sign_up');
insert into private.chat_rules_acceptances(user_id,version) values (pg_temp.a7('10'),'2026-11');
insert into private.app_sessions(user_id,first_at,last_at) values (pg_temp.a7('10'),now()-interval '200 days',now()-interval '1 day');
insert into private.moderators(user_id) values (pg_temp.a7('10'));
insert into private.lookup_usage(user_id,day,count) values (pg_temp.a7('10'),current_date,3);
insert into private.device_endpoints(token,user_id,platform) values ('ExponentPushToken[r7abcdefghijklmnop]',pg_temp.a7('10'),'ios');
insert into public.plans(id,owner_id,title,description,starts_at,ends_at,time_zone,place_label,area,categories,repeat_weeks,
 guest_note,guest_note_at,has_meeting_details,cover_path,cover_description) values
 (pg_temp.a7('60'),pg_temp.a7('10'),'Picnic','Lunch on the grass',now()+interval '3 days',now()+interval '3 days 2 hours',
  'Europe/London','Victoria Park','Hackney',array['natural'],null,'Bring a hat',now(),true,pg_temp.r7_cover('10','60','c6'),
  'A rug on grass'),
 (pg_temp.a7('61'),pg_temp.a7('11'),'Board games','',now()+interval '5 days',now()+interval '5 days 3 hours','Europe/London',
  'Cafe','',array['intellectual'],1,'',null,false,null,''),
 (pg_temp.a7('62'),pg_temp.a7('12'),'Quiz','',now()+interval '6 days',null,'Europe/London','The Crown','',array['intellectual'],
  null,'',null,false,null,''),
 (pg_temp.a7('63'),pg_temp.a7('12'),'Run','',now()-interval '10 days',now()-interval '10 days'+interval '1 hour','Europe/London',
  'Park','',array['physical'],null,'',null,false,null,'');
insert into public.plan_meeting_details(plan_id,note) values (pg_temp.a7('60'),'Gate B, by the oak');
insert into private.plan_links(id,plan_id,code) values
 (pg_temp.a7('70'),pg_temp.a7('60'),'r7LinkCodeForPicnic000'),(pg_temp.a7('72'),pg_temp.a7('62'),'r7LinkCodeForQuiz00000');
insert into private.beta_access(user_id,source,plan_link_id,granted_at) values
 (pg_temp.a7('10'),'link',pg_temp.a7('70'),now()-interval '200 days');
insert into public.attendees(plan_id,user_id,response) values
 (pg_temp.a7('60'),pg_temp.a7('11'),'accepted'),(pg_temp.a7('60'),pg_temp.a7('12'),'maybe');
insert into public.attendees(plan_id,user_id,response,brought_by,level) values
 (pg_temp.a7('61'),pg_temp.a7('10'),'accepted',pg_temp.a7('14'),2);
insert into public.plan_admins(plan_id,user_id,appointed_by) values
 (pg_temp.a7('61'),pg_temp.a7('10'),pg_temp.a7('11')),(pg_temp.a7('60'),pg_temp.a7('14'),pg_temp.a7('10'));
insert into private.join_requests(plan_id,user_id,plan_link_id,response) values
 (pg_temp.a7('62'),pg_temp.a7('10'),pg_temp.a7('72'),'accepted');
insert into private.plan_removals(series_id,user_id,removed_at) values (pg_temp.a7('63'),pg_temp.a7('10'),now()-interval '9 days');
insert into private.plan_removals(series_id,phone,removed_at) values
 (pg_temp.a7('63'),'447700900710',now()-interval '9 days'),(pg_temp.a7('61'),'447700900799',now()-interval '1 day');
insert into private.series_leaves(series_id,user_id,left_at) values (pg_temp.a7('63'),pg_temp.a7('10'),now()-interval '8 days');
insert into public.plan_mutes(series_id,user_id) values (pg_temp.a7('61'),pg_temp.a7('10'));
insert into public.chat_mutes(series_id,user_id) values (pg_temp.a7('61'),pg_temp.a7('10'));
insert into private.phone_invitations(plan_id,phone,country,invited_by,code_hash) values
 (pg_temp.a7('60'),'447700900799','44',pg_temp.a7('10'),extensions.digest('r7-code-799','sha256'));
insert into private.phone_invitations(plan_id,phone,country,invited_by,brought_by,user_id,answered_at,level) values
 (pg_temp.a7('61'),'447700900710','44',pg_temp.a7('11'),pg_temp.a7('14'),pg_temp.a7('10'),now()-interval '1 day',2);
insert into private.phone_invitations(plan_id,phone,country,invited_by,revoked_at) values
 (pg_temp.a7('62'),'447700900710','44',pg_temp.a7('12'),now());
-- Mo answered an invitation to Ivo's number before it was Ivo's (data-requests.md section 4.4): Mo's, not Ivo's.
insert into private.phone_invitations(plan_id,phone,country,invited_by,user_id,answered_at) values
 (pg_temp.a7('63'),'447700900710','44',pg_temp.a7('12'),pg_temp.a7('14'),now()-interval '11 days');
-- Jo answered an invitation to 799 when it was Jo's number: an account's (answer_phone_invitation needs one signed in
-- with that number), so not 799's holder's now.
insert into private.phone_invitations(plan_id,phone,country,invited_by,user_id,answered_at) values
 (pg_temp.a7('62'),'447700900799','44',pg_temp.a7('12'),pg_temp.a7('11'),now()-interval '20 days');
insert into public.messages(series_id,plan_id,author_id,kind,body) values
 (pg_temp.a7('60'),pg_temp.a7('60'),pg_temp.a7('10'),'message','Bring snacks please');
insert into public.messages(series_id,plan_id,author_id,kind,body,state) values
 (pg_temp.a7('60'),pg_temp.a7('60'),pg_temp.a7('10'),'message','STOP BEING LATE','removed') returning id as r7_removed \gset
insert into public.messages(series_id,plan_id,author_id,kind,audience,body) values
 (pg_temp.a7('60'),pg_temp.a7('60'),pg_temp.a7('10'),'announcement','everyone','Moved to noon');
insert into public.messages(series_id,plan_id,author_id,kind,body) values
 (pg_temp.a7('60'),pg_temp.a7('60'),pg_temp.a7('11'),'message','I will bring cake') returning id as r7_cake \gset
insert into public.messages(series_id,plan_id,author_id,kind,body) values
 (pg_temp.a7('60'),pg_temp.a7('60'),pg_temp.a7('12'),'message','See you at noon');
insert into public.messages(series_id,plan_id,kind,event,payload) values
 (pg_temp.a7('60'),pg_temp.a7('60'),'system','changed',jsonb_build_object('actor',pg_temp.a7('10'))),
 (pg_temp.a7('60'),pg_temp.a7('60'),'system','joined',jsonb_build_object('actor',pg_temp.a7('11'),'user',pg_temp.a7('11')));
insert into public.chat_reads(series_id,user_id,last_read_id) values (pg_temp.a7('60'),pg_temp.a7('10'),:r7_cake);
insert into public.connections(user_a,user_b,state,requested_by,series_id,created_at,accepted_at) values
 (pg_temp.a7('10'),pg_temp.a7('14'),'connected',pg_temp.a7('14'),pg_temp.a7('61'),now()-interval '3 days',now()-interval '2 days');
-- Ivo asks Jo, at the Picnic, and Jo answers "Not now" (decline_connection stores from_user Ivo, to_user Jo). Kit
-- blocks Ivo; Ivo then asks Kit, which reads to Ivo as sent and is stored as Kit's refusal of Ivo (from_user Ivo,
-- to_user Kit). Both rows are about Ivo: neither may reach Ivo's export.
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.a7('10'),'role','authenticated')::text,true);
select pg_temp.r7_check(private.request_connection(pg_temp.a7('11'),pg_temp.a7('60')) = 'requested',
 'The cast: Ivo''s request to Jo was not sent');
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.a7('11'),'role','authenticated')::text,true);
select private.decline_connection(pg_temp.a7('10'));
insert into private.blocks(blocker_id,blocked_id) values (pg_temp.a7('12'),pg_temp.a7('10'));
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.a7('10'),'role','authenticated')::text,true);
select pg_temp.r7_check(private.request_connection(pg_temp.a7('12'),pg_temp.a7('60')) = 'requested',
 'The cast: Ivo''s request to Kit did not look sent');
select set_config('request.jwt.claims','',true);
select pg_temp.r7_check((select jsonb_agg(jsonb_build_array(r.from_user,r.to_user,r.hidden,r.refused_at) order by r.to_user)
  from private.connection_refusals r where r.series_id = pg_temp.a7('60'))
  = jsonb_build_array(jsonb_build_array(pg_temp.a7('10'),pg_temp.a7('11'),false,now()),
   jsonb_build_array(pg_temp.a7('10'),pg_temp.a7('12'),false,now()))
 and not exists(select 1 from public.connections c where pg_temp.a7('10') in (c.user_a,c.user_b)
  and pg_temp.a7('14') not in (c.user_a,c.user_b)),
 'The cast: the refusals of Ivo, by Jo and by Kit''s block, read '
  ||coalesce((select jsonb_agg(to_jsonb(r))::text from private.connection_refusals r),'none'));
insert into private.reports(reporter_id,target_user_id,message_id,series_id,plan_id,about,reason,details,frozen_body,
 frozen_author,status,reviewed_at,review_note,action) values
 (pg_temp.a7('11'),pg_temp.a7('10'),:r7_removed,pg_temp.a7('60'),pg_temp.a7('60'),'message','harassment','he shouted',
  'STOP BEING LATE',pg_temp.a7('10'),'actioned',now(),'Jo was upset','message_removed') returning id as r7_about_ivo \gset
insert into private.reports(reporter_id,target_user_id,series_id,plan_id,about,reason,details,status,reviewed_at,review_note,
 action) values
 (pg_temp.a7('10'),pg_temp.a7('12'),pg_temp.a7('60'),pg_temp.a7('60'),'user','spam','keeps posting links','reviewed',now(),
  'Kit warned once','none');
insert into private.suspension_history(user_id,report_id,suspended_at,ended_at,how) values
 (pg_temp.a7('10'),:r7_about_ivo,now()-interval '90 days',now()-interval '60 days','lifted');
insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id,detail,delivered_at) values
 (pg_temp.a7('60'),pg_temp.a7('10'),'rsvp','r7:rsvp:10',pg_temp.a7('11'),'accepted',now());
insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id) values
 (pg_temp.a7('60'),pg_temp.a7('11'),'invitation','r7:invitation:11',pg_temp.a7('10'));
update public.profiles set deletion_requested_at=now() where id=pg_temp.a7('10');
insert into private.account_deletion_jobs(request_id,user_id,recovery_hash) values
 (pg_temp.a7('96'),pg_temp.a7('10'),extensions.digest('r7-recovery','sha256'));
select set_config('resbite.system','',true);

-- Each export, run read-only from the script's text with the literal swapped, keyed by who it is for: one row, the
-- columns export and files.
create temporary table r7_export(who text primary key, export jsonb not null, files jsonb not null) on commit drop;
create function pg_temp.r7_export_as(p_who text, p_script text, p_sql text) returns void language plpgsql as $$
declare v jsonb := pg_temp.r7_run_read_only(p_script, p_sql); c text := current_setting('r7.columns');
 v_want text := case when p_script = 'export-number.sql' then 'export' else 'export,files' end;
begin
 if jsonb_array_length(v) <> 1 or c <> v_want then
  raise exception '% for % printed % rows, columns %', p_script, p_who, jsonb_array_length(v), c;
 end if;
 insert into pg_temp.r7_export(who,export,files) values (p_who, v->0->'export', coalesce(v->0->'files','{}'::jsonb));
end $$;
create function pg_temp.r7_e(p_who text) returns jsonb language sql stable as $$
 select x.export from pg_temp.r7_export x where x.who = p_who $$;
create function pg_temp.r7_f(p_who text) returns jsonb language sql stable as $$
 select x.files from pg_temp.r7_export x where x.who = p_who $$;
-- Whether every id in a text is this one (none at all, for null), every cast number this one, every cast email this one.
create function pg_temp.r7_only_id(p_text text, p_id uuid) returns boolean language sql immutable as $$
 select not exists(select 1 from regexp_matches(p_text,'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}','g') m(x)
  where m.x[1] is distinct from p_id::text) $$;
create function pg_temp.r7_only_number(p_text text, p_number text) returns boolean language sql immutable as $$
 select not exists(select 1 from regexp_matches(p_text,'4477009007[0-9]{2}','g') m(x) where m.x[1] is distinct from p_number) $$;
create function pg_temp.r7_only_email(p_text text, p_email text) returns boolean language sql immutable as $$
 select not exists(select 1 from regexp_matches(p_text,'r7-[0-9]{2}@resbite-test\.invalid','g') m(x)
  where m.x[1] is distinct from p_email) $$;
-- The 33 keys of an export: every one is a list ([] when empty, never null) but account and profile (objects) and
-- moderator (true or false).
create function pg_temp.r7_export_keys_ok(p_export jsonb) returns boolean language sql immutable as $$
 select (select count(*) from jsonb_object_keys(p_export)) = 33
  and p_export ?& array['account','sign_in_methods','sessions','profile','age_and_terms','terms_accepted','chat_rules',
   'app_sessions','access_grants','moderator','contact_lookups','suspensions','push_registrations','deletion_request',
   'resbites_hosted','attending','co_hosting','join_requests','removed_from','groups_left','mutes','invitations_sent',
   'invitations_received','links','messages','chat_events','read_positions','connections','refusals_made','blocks_made',
   'reports_filed','reports_about_you','notifications']
  and jsonb_typeof(p_export->'moderator') = 'boolean'
  and (select count(*) from jsonb_each(p_export) e where jsonb_typeof(e.value) = 'array') = 30
  and (select bool_and(jsonb_typeof(e.value) = 'array') from jsonb_each(p_export) e
   where e.key not in ('account','profile','moderator')) $$;

\set r7_script `sed -e "s/('00000000-0000-0000-0000-000000000000'::uuid)/('a7000000-0000-4000-8000-000000000010'::uuid)/" :'resbite_repo'/supabase/ops/export-account.sql`
select pg_temp.r7_export_as('10','export-account.sql',:'r7_script');

-- export_ids: Ivo's export holds no id but Ivo's, no number but Ivo's own (799's only as its ending), no email but
-- Ivo's, no link code, no full push token, no recovery hash, no cover path and no Storage path.
select pg_temp.r7_check(pg_temp.r7_only_id(e::text,pg_temp.a7('10'))
 and pg_temp.r7_only_number(e::text,'447700900710') and strpos(e::text,'447700900799') = 0
 and pg_temp.r7_only_email(e::text,'r7-10@resbite-test.invalid')
 and strpos(e::text,'r7LinkCode') = 0 and strpos(e::text,'ExponentPushToken') = 0 and strpos(e::text,'.jpg') = 0,
 'export_ids: Ivo''s export holds another id, number, email, code or path: '||e::text)
from (select pg_temp.r7_e('10') as e) x;

-- export_account: the 33 keys; the account as Auth holds it (no password, no token, no registration_details when there
-- are none); each sign-in method and session without its ids; the profile; the ticks, grants and lookups without link
-- ids; moderator true; the suspension without its report; the token shortened; the deletion request without its id
-- or hash.
select pg_temp.r7_check(pg_temp.r7_export_keys_ok(e)
 and e->'account' = jsonb_build_object('id',pg_temp.a7('10'),'phone','447700900710','email','r7-10@resbite-test.invalid',
  'created_at',now()-interval '200 days','last_sign_in_at',now()-interval '1 day','email_confirmed_at',now()-interval '100 days',
  'phone_confirmed_at',now()-interval '200 days','banned_until',null,'display_name','Ivo')
 and e->'sign_in_methods' = jsonb_build_array(
  jsonb_build_object('provider','phone','created_at',now()-interval '200 days','email',null),
  jsonb_build_object('provider','email','created_at',now()-interval '100 days','email','r7-10@resbite-test.invalid'))
 and e->'sessions' = jsonb_build_array(jsonb_build_object('created_at',now()-interval '2 days','updated_at',now()-interval '1 hour',
  'user_agent','Resbite/1.0 (iPhone; iOS 18.1)','ip','192.0.2.10'))
 and e->'profile' = jsonb_build_object('display_name','Ivo','created_at',now(),'deletion_requested_at',now())
 and e->'age_and_terms' = jsonb_build_array(jsonb_build_object('confirmed_at',now(),'terms_version','2026-11','method','tick'))
 and e->'terms_accepted'->0->>'terms_version' = '2026-11'
 and e->'terms_accepted' = jsonb_build_array(jsonb_build_object('terms_version','2026-11','accepted_at',now()-interval '200 days',
  'how','sign_up'))
 and e->'chat_rules' = jsonb_build_array(jsonb_build_object('version','2026-11','accepted_at',now()))
 and e->'app_sessions' = jsonb_build_array(jsonb_build_object('first_at',now()-interval '200 days','last_at',now()-interval '1 day'))
 and e->'access_grants' = jsonb_build_array(jsonb_build_object('source','link','granted_at',now()-interval '200 days',
  'revoked_at',null))
 and e->'moderator' = 'true'::jsonb
 and e->'contact_lookups' = jsonb_build_array(jsonb_build_object('day',current_date,'count',3))
 and e->'suspensions' = jsonb_build_array(jsonb_build_object('suspended_at',now()-interval '90 days',
  'ended_at',now()-interval '60 days','how','lifted'))
 and e->'push_registrations'->0->>'token' ~ '^.{4}….{4}$'
 and e->'push_registrations' = jsonb_build_array(jsonb_build_object('platform','ios','updated_at',now(),'token','Expo…nop]'))
 and e->'deletion_request' = jsonb_build_array(jsonb_build_object('status','queued','requested_at',now(),'completed_at',null)),
 'export_account: Ivo''s account, ticks or records read '||e::text)
from (select pg_temp.r7_e('10') as e) x;

-- export_taking_part: the Picnic Ivo hosts, with its meeting details and its guests by name and answer (no place
-- coordinates, no cover path); Board games, where Mo brought Ivo; both co-hostings; the request to join the Quiz; the
-- two removals from the Run, by account and by number; leaving it; both mutes. Each resbite by its title and start.
select pg_temp.r7_check(e->'resbites_hosted' = jsonb_build_array(jsonb_build_object('title','Picnic',
  'description','Lunch on the grass','categories',jsonb_build_array('natural'),'starts_at',now()+interval '3 days',
  'ends_at',now()+interval '3 days 2 hours','time_zone','Europe/London','place_label','Victoria Park','area','Hackney','note','',
  'guest_note','Bring a hat','guest_note_at',now(),'cover_description','A rug on grass','status','active','repeat_weeks',null,
  'bring_invites',0,'bring_levels',1,'created_at',now(),'meeting_details','Gate B, by the oak',
  'guests',jsonb_build_array(jsonb_build_object('name','Jo','answer','accepted'),jsonb_build_object('name','Kit','answer','maybe'))))
 and e->'attending' = jsonb_build_array(jsonb_build_object('title','Board games','starts_at',now()+interval '5 days',
  'answer','accepted','answered_at',now(),'level',2,'brought_by','Mo'))
 and e->'co_hosting' @> jsonb_build_array(
  jsonb_build_object('title','Board games','starts_at',now()+interval '5 days','co_host','Ivo','appointed_by','Jo','appointed_at',now()),
  jsonb_build_object('title','Picnic','starts_at',now()+interval '3 days','co_host','Mo','appointed_by','Ivo','appointed_at',now()))
 and jsonb_array_length(e->'co_hosting') = 2
 and e->'join_requests' = jsonb_build_array(jsonb_build_object('title','Quiz','starts_at',now()+interval '6 days',
  'answer','accepted','status','waiting','asked_at',now(),'decided_at',null))
 and e->'removed_from' = jsonb_build_array(
  jsonb_build_object('title','Run','starts_at',now()-interval '10 days','removed_at',now()-interval '9 days'),
  jsonb_build_object('title','Run','starts_at',now()-interval '10 days','removed_at',now()-interval '9 days'))
 and e->'groups_left' = jsonb_build_array(jsonb_build_object('title','Run','starts_at',now()-interval '10 days',
  'left_at',now()-interval '8 days'))
 and e->'mutes' @> jsonb_build_array(
  jsonb_build_object('title','Board games','starts_at',now()+interval '5 days','what','resbite','muted_at',now()),
  jsonb_build_object('title','Board games','starts_at',now()+interval '5 days','what','chat','muted_at',now()))
 and jsonb_array_length(e->'mutes') = 2,
 'export_taking_part: Ivo''s resbites read '||e::text)
from (select pg_temp.r7_e('10') as e) x;

-- export_invitations: the one Ivo sent, to 799 by its ending; the two to Ivo (by account, answered; by number, taken
-- back), each with its host's name, and not the one Mo answered; Picnic's link, without its code.
select pg_temp.r7_check(e->'invitations_sent'->0->>'number_ending' = '99'
 and e->'invitations_sent' = jsonb_build_array(jsonb_build_object('title','Picnic','starts_at',now()+interval '3 days',
  'country','44','number_ending','99','sent_at',now(),'answered_at',null,'revoked_at',null,'level',1))
 and e->'invitations_received' @> jsonb_build_array(
  jsonb_build_object('title','Board games','starts_at',now()+interval '5 days','host','Jo','sent_at',now(),
   'answered_at',now()-interval '1 day','revoked_at',null),
  jsonb_build_object('title','Quiz','starts_at',now()+interval '6 days','host','Kit','sent_at',now(),'answered_at',null,
   'revoked_at',now()))
 and jsonb_array_length(e->'invitations_received') = 2
 and e->'links' = jsonb_build_array(jsonb_build_object('title','Picnic','starts_at',now()+interval '3 days','created_at',now(),
  'revoked_at',null)),
 'export_invitations: Ivo''s invitations read '||e::text)
from (select pg_temp.r7_e('10') as e) x;

-- export_chat: Ivo's own three messages (the removed one without its words), no one else's; the system line that names
-- Ivo, without its payload, not the one that names only Jo; where Ivo has read to, by the time of the message.
select pg_temp.r7_check(e->'messages' @> jsonb_build_array(
  jsonb_build_object('title','Picnic','starts_at',now()+interval '3 days','kind','message','audience',null,
   'body','Bring snacks please','state','sent'),
  jsonb_build_object('title','Picnic','kind','announcement','audience','everyone','body','Moved to noon','state','sent'),
  jsonb_build_object('title','Picnic','kind','message','body',null,'state','removed'))
 and jsonb_array_length(e->'messages') = 3
 and (select bool_and(m ?& array['title','starts_at','kind','audience','body','state','created_at'] and (select count(*) from jsonb_object_keys(m)) = 7)
  from jsonb_array_elements(e->'messages') m)
 and strpos((e->'messages')::text,'STOP BEING LATE') = 0
 and strpos(e::text,'I will bring cake') = 0 and strpos(e::text,'See you at noon') = 0
 and e->'chat_events' = jsonb_build_array(jsonb_build_object('title','Picnic','starts_at',now()+interval '3 days',
  'event','changed','created_at',(select m.created_at from public.messages m where m.event = 'changed' and m.series_id = pg_temp.a7('60'))))
 and e->'read_positions' = jsonb_build_array(jsonb_build_object('title','Picnic','starts_at',now()+interval '3 days',
  'last_read_at',(select m.created_at from public.messages m where m.id = :r7_cake))),
 'export_chat: Ivo''s chat read '||e::text)
from (select pg_temp.r7_e('10') as e) x;

-- export_safety: the connection with Mo; no refusal and no block of Ivo (Jo's "Not now", Kit's block and the refusal
-- it made of Ivo's request), so both lists of Ivo's own are empty, and neither Jo's nor Kit's name is in them; the
-- report Ivo filed, with Ivo's words and Kit's name, not the review note; the report about
-- Ivo, with Ivo's frozen words, and no reporter, no reporter's words, no review note.
select pg_temp.r7_check(e->'connections' = jsonb_build_array(jsonb_build_object('name','Mo','state','connected',
  'asked_by_you',false,'met_at','Board games','met_at_start',now()+interval '5 days','asked_at',now()-interval '3 days',
  'accepted_at',now()-interval '2 days'))
 and e->'refusals_made' = '[]'::jsonb and e->'blocks_made' = '[]'::jsonb
 and e->'reports_filed' = jsonb_build_array(jsonb_build_object('title','Picnic','starts_at',now()+interval '3 days',
  'about','user','reason','spam','details','keeps posting links','created_at',now(),'status','reviewed','reported_person','Kit',
  'frozen_body',null))
 and not (e->'reports_about_you'->0 ?| array['reporter','reporter_id','reporter_name','details','review_note'])
 and e->'reports_about_you' = jsonb_build_array(jsonb_build_object('about','message','reason','harassment','created_at',now(),
  'status','actioned','action','message_removed','frozen_body','STOP BEING LATE'))
 and strpos(e::text,'he shouted') = 0 and strpos(e::text,'Jo was upset') = 0 and strpos(e::text,'Kit warned once') = 0,
 'export_safety: Ivo''s connections or reports read '||e::text)
from (select pg_temp.r7_e('10') as e) x;

-- export_notifications_and_files: the push to Ivo, with Jo's name, not the one to Jo; the photo and the cover under
-- Ivo's folder, not Jo's.
select pg_temp.r7_check(pg_temp.r7_e('10')->'notifications' = jsonb_build_array(jsonb_build_object('kind','rsvp',
  'title','Picnic','starts_at',now()+interval '3 days','queued_at',now(),'delivered_at',now(),'actor','Jo','detail','accepted'))
 and pg_temp.r7_f('10') = jsonb_build_object('profile_photos',jsonb_build_array(pg_temp.r7_photo('10','a')),
  'covers',jsonb_build_array(pg_temp.r7_cover('10','60','c6'))),
 'export_notifications_and_files: Ivo''s pushes or files read '||(pg_temp.r7_e('10')->'notifications')::text||' '
  ||pg_temp.r7_f('10')::text);

-- export_twins: Jo's export has Jo's "Not now" of Ivo and Jo's report with Jo's words and Ivo's frozen ones; Kit's has
-- Kit's block of Ivo, the refusal of Ivo that Kit's block made (stored as Kit's, to_user), and Ivo's report about Kit
-- without Ivo or Ivo's words. Each holds its own id, number and email only (Ivo's number only as its ending).
\set r7_script `sed -e "s/('00000000-0000-0000-0000-000000000000'::uuid)/('a7000000-0000-4000-8000-000000000011'::uuid)/" :'resbite_repo'/supabase/ops/export-account.sql`
select pg_temp.r7_export_as('11','export-account.sql',:'r7_script');
\set r7_script `sed -e "s/('00000000-0000-0000-0000-000000000000'::uuid)/('a7000000-0000-4000-8000-000000000012'::uuid)/" :'resbite_repo'/supabase/ops/export-account.sql`
select pg_temp.r7_export_as('12','export-account.sql',:'r7_script');
select pg_temp.r7_check(pg_temp.r7_only_id(j::text,pg_temp.a7('11')) and pg_temp.r7_only_number(j::text,'447700900711')
 and pg_temp.r7_only_email(j::text,'r7-11@resbite-test.invalid')
 and j->'refusals_made' = jsonb_build_array(jsonb_build_object('name','Ivo','title','Picnic','starts_at',now()+interval '3 days',
  'refused_at',now()))
 and j->'reports_filed' = jsonb_build_array(jsonb_build_object('title','Picnic','starts_at',now()+interval '3 days',
  'about','message','reason','harassment','details','he shouted','created_at',now(),'status','actioned','reported_person','Ivo',
  'frozen_body','STOP BEING LATE'))
 and j->'invitations_sent' = jsonb_build_array(jsonb_build_object('title','Board games','starts_at',now()+interval '5 days',
  'country','44','number_ending','10','sent_at',now(),'answered_at',now()-interval '1 day','revoked_at',null,'level',2))
 and strpos(j::text,'Jo was upset') = 0 and strpos(j::text,'Bring snacks please') = 0
 and pg_temp.r7_only_id(k::text,pg_temp.a7('12')) and pg_temp.r7_only_number(k::text,'447700900712')
 and pg_temp.r7_only_email(k::text,null)
 and k->'blocks_made' = jsonb_build_array(jsonb_build_object('name','Ivo','blocked_at',now()))
 and k->'refusals_made' = jsonb_build_array(jsonb_build_object('name','Ivo','title','Picnic','starts_at',now()+interval '3 days',
  'refused_at',now()))
 and k->'reports_about_you' = jsonb_build_array(jsonb_build_object('about','user','reason','spam','created_at',now(),
  'status','reviewed','action','none','frozen_body',null))
 and strpos(k::text,'keeps posting links') = 0 and strpos(k::text,'Kit warned once') = 0,
 'export_twins: Jo''s or Kit''s export read '||j::text||' '||k::text)
from (select pg_temp.r7_e('11') as j, pg_temp.r7_e('12') as k) x;

-- export_empty: Lu, with nothing but an account and a profile, has every list [] (none null), moderator false, and no
-- files. Unedited, the script finds no account: account and profile null, every list [], no files.
\set r7_script `sed -e "s/('00000000-0000-0000-0000-000000000000'::uuid)/('a7000000-0000-4000-8000-000000000013'::uuid)/" :'resbite_repo'/supabase/ops/export-account.sql`
select pg_temp.r7_export_as('13','export-account.sql',:'r7_script');
\set r7_script `cat :'resbite_repo'/supabase/ops/export-account.sql`
select pg_temp.r7_export_as('unedited','export-account.sql',:'r7_script');
select pg_temp.r7_check(pg_temp.r7_export_keys_ok(e)
 and not exists(select 1 from jsonb_each(e) x where x.value = 'null'::jsonb or (jsonb_typeof(x.value) = 'array' and x.value <> '[]'))
 and e->'moderator' = 'false'::jsonb and e->'account'->>'id' = pg_temp.a7('13')::text
 and e->'profile' = jsonb_build_object('display_name','Lu','created_at',now(),'deletion_requested_at',null)
 and pg_temp.r7_f('13') = '{"profile_photos": [], "covers": []}'::jsonb
 and pg_temp.r7_export_keys_ok(u)
 and not exists(select 1 from jsonb_each(u) x where x.key not in ('account','profile') and (x.value = 'null'::jsonb
  or (jsonb_typeof(x.value) = 'array' and x.value <> '[]')))
 and u->'account' = 'null'::jsonb and u->'profile' = 'null'::jsonb and u->'moderator' = 'false'::jsonb
 and pg_temp.r7_f('unedited') = '{"profile_photos": [], "covers": []}'::jsonb,
 'export_empty: Lu''s or the unedited export read '||e::text||' '||u::text)
from (select pg_temp.r7_e('13') as e, pg_temp.r7_e('unedited') as u) x;

-- export_number: unedited, export-number.sql finds nothing. For 799, written as a person may give it, it prints the
-- invitation, with its host's name, and the removal record of Board games, but not the Quiz invitation Jo's account
-- answered (Jo's, not 799's holder's: data-requests.md section 4.4); 799 is not on the do-not-invite list. No id at
-- all. Once 798 objects, 798 is on the list (and its invitation went with the objection).
\set r7_script `cat :'resbite_repo'/supabase/ops/export-number.sql`
select pg_temp.r7_export_as('number unedited','export-number.sql',:'r7_script');
\set r7_script `sed -e "s/('447700900000')/('+44 7700 900799')/" :'resbite_repo'/supabase/ops/export-number.sql`
select pg_temp.r7_export_as('799','export-number.sql',:'r7_script');
insert into private.phone_invitations(plan_id,phone,country,invited_by) values (pg_temp.a7('60'),'447700900798','44',pg_temp.a7('10'));
select private.record_objection('447700900798');
\set r7_script `sed -e "s/('447700900000')/('447700900798')/" :'resbite_repo'/supabase/ops/export-number.sql`
select pg_temp.r7_export_as('798','export-number.sql',:'r7_script');
select pg_temp.r7_check(pg_temp.r7_e('number unedited') = '{"invitations": [], "removals": [], "on_do_not_invite_list": false}'::jsonb
 and pg_temp.r7_e('799') = jsonb_build_object('invitations',jsonb_build_array(jsonb_build_object('title','Picnic',
   'starts_at',now()+interval '3 days','host','Ivo','sent_at',now(),'answered_at',null,'revoked_at',null)),
  'removals',jsonb_build_array(jsonb_build_object('title','Board games','starts_at',now()+interval '5 days',
   'since',now()-interval '1 day')),
  'on_do_not_invite_list',false)
 and pg_temp.r7_only_id(pg_temp.r7_e('799')::text,null)
 and pg_temp.r7_e('798') = '{"invitations": [], "removals": [], "on_do_not_invite_list": true}'::jsonb,
 'export_number: it printed '||pg_temp.r7_e('number unedited')::text||' '||pg_temp.r7_e('799')::text||' '
  ||pg_temp.r7_e('798')::text);

rollback;
