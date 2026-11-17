-- Terms acceptance (20261117120000_terms_acceptance.sql; App Store readiness plan 4,
-- docs/superpowers/plans/2026-11-17-asr-4-terms-safety-details.md, Task 1 and Decisions 1 to 4; spec C8): the Terms
-- version the owner publishes (supabase/ops/publish-terms-version.sql, run here from its text), one acceptance record
-- per account and version, account_access_status reporting terms_version and terms_needed, accept_terms, and the
-- sign-up tick, the three invitation answers and the fold writing the record; the fold refusing a held or leaving web
-- account, and clearing the app account's pending number. Nobody is refused anything for a missing
-- acceptance (the grace path, Decision 3). Synthetic identities only (prefix ac); one rolled-back block.
-- Users ac…: 01 host (phone, profile "Host", tick 2026-10, owner of a future plan with the open link B); 02 phone only;
-- 03 email only (an Apple or Google account), no tick; 04 phone, invited by number to 01's plan (code A); 05 a web
-- account (phone, tick, a 2026-12 acceptance by invitation, never used the app, owns nothing); 06 an app account with
-- no acceptance; 07 suspended (a revoked grant); 10 and 11 phone only, no profile. Section 8c's folds: 08 and 12 web
-- accounts (phone, profile, tick, a 2026-12 acceptance); 09 and 13 app accounts with an email and no number, 09 with a
-- number given at Add your number and never confirmed (447700900896), 13 with nothing pending.
begin;
create function pg_temp.ac(p text) returns uuid language sql immutable as $$ select ('ac000000-0000-4000-8000-0000000000'||p)::uuid $$;
create function pg_temp.acp(p text) returns uuid language sql immutable as $$ select ('ac100000-0000-4000-8000-0000000000'||p)::uuid $$;
-- Acting as someone: the claims auth.uid() reads (the role is set apart, with set local role).
create function pg_temp.ac_as(p_user uuid) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role','authenticated')::text,true)
$$;
create function pg_temp.ac_check(p_ok boolean, p_what text) returns void language plpgsql as $$
begin
 if p_ok is not true then raise exception '%', p_what; end if;
end $$;
-- A call that must be refused with exactly this code (and this message, unless it is null). The refusal undoes the
-- call, as a real one would.
create function pg_temp.ac_refused(p_sql text, p_state text, p_message text) returns void language plpgsql as $$
declare v_state text; v_message text;
begin
 begin
  execute p_sql;
 exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_message = message_text;
 end;
 if v_state is distinct from p_state or (p_message is not null and v_message is distinct from p_message) then
  raise exception 'Expected % "%", got % "%": %', p_state, p_message, v_state, v_message, p_sql;
 end if;
end $$;
-- The access check as someone, under the caller's role.
create function pg_temp.ac_status(p_user uuid) returns jsonb language plpgsql as $$
begin
 perform pg_temp.ac_as(p_user);
 return public.account_access_status();
end $$;
-- An account's acceptance records, the superuser's: 'version:how' sorted, '' for none.
create function pg_temp.ac_rows(p_user uuid) returns text language plpgsql stable as $$
begin
 return (select coalesce(string_agg(terms_version||':'||how,',' order by terms_version),'') from private.terms_acceptances where user_id=p_user);
end $$;
-- An owner-run script's rows, run from its text as the current role: a jsonb array, one object per row.
create function pg_temp.ac_run(p_sql text) returns jsonb language plpgsql as $$
declare r record; v jsonb := '[]'::jsonb;
begin
 if coalesce(length(btrim(p_sql)),0)=0 then raise exception 'The script text is empty'; end if;
 for r in execute p_sql loop v := v||jsonb_build_array(to_jsonb(r)); end loop;
 return v;
end $$;
-- The accounts the publish script should count for a version: confirmed, not anonymous, no acceptance of it.
create function pg_temp.ac_to_ask(p_version text) returns setof uuid language plpgsql stable as $$
begin
 return query select u.id from auth.users u where (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)
  and not coalesce(u.is_anonymous,false)
  and not exists(select 1 from private.terms_acceptances a where a.user_id=u.id and a.terms_version=p_version);
end $$;

insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values
 (pg_temp.ac('01'),null,null,'447700900801',now()),
 (pg_temp.ac('02'),null,null,'447700900802',now()),
 (pg_temp.ac('03'),'ac-apple@resbite-test.invalid',now(),null,null),
 (pg_temp.ac('04'),null,null,'447700900804',now()),
 (pg_temp.ac('05'),null,null,'447700900805',now()),
 (pg_temp.ac('06'),null,null,'447700900806',now()),
 (pg_temp.ac('07'),null,null,'447700900807',now()),
 (pg_temp.ac('10'),null,null,'447700900810',now()),
 (pg_temp.ac('11'),null,null,'447700900811',now());
insert into public.profiles(id,display_name) values (pg_temp.ac('01'),'Host'),(pg_temp.ac('05'),'Web'),(pg_temp.ac('06'),'App');
insert into private.age_attestations(user_id,terms_version) values (pg_temp.ac('01'),'2026-10'),(pg_temp.ac('05'),'2026-12');
insert into private.app_sessions(user_id) values (pg_temp.ac('06'));
insert into private.beta_access(user_id,source,revoked_at) values (pg_temp.ac('07'),'maintainer',now());
insert into public.plans(id,owner_id,title,starts_at,time_zone,place_label,area,categories) values
 (pg_temp.acp('01'),pg_temp.ac('01'),'Picnic','2099-06-01 12:00+00','UTC','Secret Park','Riverside',array['community']);
insert into private.plan_links(plan_id,code) values (pg_temp.acp('01'),repeat('B',22));
insert into private.phone_invitations(plan_id,phone,country,code_hash,invited_by) values
 (pg_temp.acp('01'),'447700900804','44',extensions.digest(repeat('A',22),'sha256'),pg_temp.ac('01'));

-- 1. Nothing published: the status has exactly its four keys, no version and nothing needed, for every status.
set local role authenticated;
select set_config('ac.s01',pg_temp.ac_status(pg_temp.ac('01'))::text,true);
select set_config('ac.s07',pg_temp.ac_status(pg_temp.ac('07'))::text,true);
reset role;
select pg_temp.ac_check((select array_agg(k order by k) from jsonb_object_keys(current_setting('ac.s01')::jsonb) k)
 =array['account_id','status','terms_needed','terms_version'],'Nothing published: 01''s status keys were '||current_setting('ac.s01'));
select pg_temp.ac_check(current_setting('ac.s01')::jsonb=jsonb_build_object('account_id',pg_temp.ac('01'),'status','approved',
 'terms_version',null,'terms_needed',false),'Nothing published: 01''s status was '||current_setting('ac.s01'));
select pg_temp.ac_check(current_setting('ac.s07')::jsonb=jsonb_build_object('account_id',pg_temp.ac('07'),'status','access_pending',
 'terms_version',null,'terms_needed',false),'Nothing published: 07''s status was '||current_setting('ac.s07'));
select pg_temp.ac_check(private.terms_version() is null,'Nothing published, but terms_version() is '||coalesce(private.terms_version(),'null'));
select pg_temp.ac_check((select count(*) from private.terms_versions)=0,'The migration published a version');

-- 05's acceptance from the web, three days ago, before the version was published.
insert into private.terms_acceptances(user_id,terms_version,accepted_at,how) values (pg_temp.ac('05'),'2026-12',now()-interval '3 days','invitation');

-- 2. The owner's publish script: it publishes 2026-12 and counts the accounts to ask (01 among them, not 05).
\set ac_script `cat :'resbite_repo'/supabase/ops/publish-terms-version.sql`
select set_config('ac.out',pg_temp.ac_run(:'ac_script')::text,true);
select pg_temp.ac_check(exists(select 1 from pg_temp.ac_to_ask('2026-12') as x(id) where x.id=pg_temp.ac('01'))
 and not exists(select 1 from pg_temp.ac_to_ask('2026-12') as x(id) where x.id=pg_temp.ac('05')),'The rule to count must include 01 and leave out 05');
select pg_temp.ac_check(current_setting('ac.out')::jsonb=jsonb_build_array(jsonb_build_object('published',1,'current_version','2026-12',
 'accounts_to_ask',(select count(*) from pg_temp.ac_to_ask('2026-12')))),'publish-terms-version.sql printed '||current_setting('ac.out'));
select pg_temp.ac_check((select array_agg(version) from private.terms_versions)=array['2026-12'],'publish-terms-version.sql did not publish 2026-12 alone');
-- Run again: nothing published, still one row.
select set_config('ac.out',pg_temp.ac_run(:'ac_script')::text,true);
select pg_temp.ac_check(current_setting('ac.out')::jsonb=jsonb_build_array(jsonb_build_object('published',0,'current_version','2026-12',
 'accounts_to_ask',(select count(*) from pg_temp.ac_to_ask('2026-12')))),'publish-terms-version.sql run again printed '||current_setting('ac.out'));
select pg_temp.ac_check((select count(*) from private.terms_versions)=1,'publish-terms-version.sql run again added a row');
-- A literal that isn't YYYY-MM fails on the table's check and adds nothing.
\set ac_bad `sed -e "s/(values ('2026-12'))/(values ('YYYY-MM'))/" :'resbite_repo'/supabase/ops/publish-terms-version.sql`
select pg_temp.ac_check(position($q$(values ('YYYY-MM'))$q$ in :'ac_bad')>0,'The sed found no version literal to change');
select pg_temp.ac_refused(:'ac_bad','23514',null);
select pg_temp.ac_check((select count(*) from private.terms_versions)=1,'A malformed version left a row');

-- 3. Published: everyone without an acceptance of 2026-12 is asked, a suspended account too; nobody loses access.
set local role authenticated;
select set_config('ac.s01',pg_temp.ac_status(pg_temp.ac('01'))::text,true);
select set_config('ac.s07',pg_temp.ac_status(pg_temp.ac('07'))::text,true);
select set_config('ac.s05',pg_temp.ac_status(pg_temp.ac('05'))::text,true);
reset role;
select pg_temp.ac_check(current_setting('ac.s01')::jsonb=jsonb_build_object('account_id',pg_temp.ac('01'),'status','approved',
 'terms_version','2026-12','terms_needed',true),'Published: 01''s status was '||current_setting('ac.s01'));
select pg_temp.ac_check(current_setting('ac.s07')::jsonb=jsonb_build_object('account_id',pg_temp.ac('07'),'status','access_pending',
 'terms_version','2026-12','terms_needed',true),'Published: 07''s status was '||current_setting('ac.s07'));
select pg_temp.ac_check(current_setting('ac.s05')::jsonb->'terms_needed'='false'::jsonb,'05 accepted 2026-12 on the web but is asked: '||current_setting('ac.s05'));
select pg_temp.ac_check(private.user_eligible(pg_temp.ac('01')) and private.terms_needed(pg_temp.ac('01')),
 'Grace path: 01 must stay eligible while its acceptance is needed');

-- 4. accept_terms: only the current version; once per version; the first tick stays the first.
set local role authenticated;
select pg_temp.ac_as(pg_temp.ac('01'));
select pg_temp.ac_refused($q$select public.accept_terms('2026-11')$q$,'22023','Terms changed');
select pg_temp.ac_refused($q$select public.accept_terms(null)$q$,'22023','Terms changed');
reset role;
select pg_temp.ac_check(pg_temp.ac_rows(pg_temp.ac('01'))='','A refused accept_terms recorded '||pg_temp.ac_rows(pg_temp.ac('01')));
set local role authenticated;
select pg_temp.ac_as(pg_temp.ac('01'));
select public.accept_terms('2026-12');
reset role;
select pg_temp.ac_check(pg_temp.ac_rows(pg_temp.ac('01'))='2026-12:terms_screen','01 after accept_terms: '||pg_temp.ac_rows(pg_temp.ac('01')));
select pg_temp.ac_check((select terms_version from private.age_attestations where user_id=pg_temp.ac('01'))='2026-10','accept_terms changed 01''s first tick');
select pg_temp.ac_check(not private.terms_needed(pg_temp.ac('01')),'01 still needs to accept after accept_terms');
set local role authenticated;
select pg_temp.ac_as(pg_temp.ac('01'));
select public.accept_terms('2026-12');
select set_config('ac.s01',pg_temp.ac_status(pg_temp.ac('01'))::text,true);
reset role;
select pg_temp.ac_check((select count(*) from private.terms_acceptances where user_id=pg_temp.ac('01'))=1,'accept_terms again added a row');
select pg_temp.ac_check(current_setting('ac.s01')::jsonb->'terms_needed'='false'::jsonb,'01''s status after accepting: '||current_setting('ac.s01'));
-- An account with no tick yet (an Apple or Google sign-in): accept_terms records the tick too.
set local role authenticated;
select pg_temp.ac_as(pg_temp.ac('03'));
select public.accept_terms('2026-12');
reset role;
select pg_temp.ac_check((select terms_version from private.age_attestations where user_id=pg_temp.ac('03'))='2026-12'
 and pg_temp.ac_rows(pg_temp.ac('03'))='2026-12:terms_screen','03 after accept_terms: '||pg_temp.ac_rows(pg_temp.ac('03')));

-- 5. The sign-up tick records the version it was given; once.
set local role authenticated;
select pg_temp.ac_as(pg_temp.ac('02'));
select public.attest_age('2026-12');
select public.attest_age('2026-12');
select pg_temp.ac_refused($q$select public.attest_age('1.0')$q$,'22023','Age confirmation required');
reset role;
select pg_temp.ac_check((select array_agg(terms_version) from private.age_attestations where user_id=pg_temp.ac('02'))=array['2026-12']
 and pg_temp.ac_rows(pg_temp.ac('02'))='2026-12:sign_up','02 after attest_age: '||pg_temp.ac_rows(pg_temp.ac('02')));

-- 6. The three invitation answers record the version they were given; a call without one records nothing.
set local role authenticated;
select pg_temp.ac_as(pg_temp.ac('10'));
select public.request_to_join(repeat('B',22),'Cal','accepted','2026-12');
reset role;
select pg_temp.ac_check((select display_name from public.profiles where id=pg_temp.ac('10'))='Cal'
 and exists(select 1 from private.age_attestations where user_id=pg_temp.ac('10'))
 and pg_temp.ac_rows(pg_temp.ac('10'))='2026-12:invitation','10 after request_to_join: '||pg_temp.ac_rows(pg_temp.ac('10')));
set local role authenticated;
select pg_temp.ac_as(pg_temp.ac('10'));
select public.request_to_join(repeat('B',22),'Cal','accepted',null);
reset role;
select pg_temp.ac_check(pg_temp.ac_rows(pg_temp.ac('10'))='2026-12:invitation','10 after asking again without a version: '||pg_temp.ac_rows(pg_temp.ac('10')));
set local role authenticated;
select pg_temp.ac_as(pg_temp.ac('04'));
select public.answer_phone_invitation(repeat('A',22),'Dee','accepted','2026-12');
select pg_temp.ac_as(pg_temp.ac('11'));
select public.join_by_link(repeat('B',22),'Eve','2026-12');
reset role;
select pg_temp.ac_check(pg_temp.ac_rows(pg_temp.ac('04'))='2026-12:invitation','04 after answer_phone_invitation: '||pg_temp.ac_rows(pg_temp.ac('04')));
select pg_temp.ac_check(pg_temp.ac_rows(pg_temp.ac('11'))='2026-12:invitation','11 after join_by_link: '||pg_temp.ac_rows(pg_temp.ac('11')));
-- A refused call records nothing.
set local role authenticated;
select pg_temp.ac_as(pg_temp.ac('11'));
select pg_temp.ac_refused(format('select public.request_to_join(%L,%L,%L,%L)',repeat('Z',22),'Eve','accepted','2027-01'),'42501','Invitation unavailable');
reset role;
select pg_temp.ac_check(pg_temp.ac_rows(pg_temp.ac('11'))='2026-12:invitation','A refused request_to_join recorded: '||pg_temp.ac_rows(pg_temp.ac('11')));

-- 7. A version published for tomorrow isn't current yet.
insert into private.terms_versions(version,published_at) values ('2027-01',now()+interval '1 day');
select pg_temp.ac_check(private.terms_version()='2026-12','A version published for tomorrow is current: '||coalesce(private.terms_version(),'null'));

-- 8. The fold refuses (22023, as for an account that used the app) a web account that a legal hold names, or one that
-- is being deleted (a deletion job): the handler then answers 409 and deletes no Auth user. Nothing moves: the web
-- account keeps its records, its tick and its profile, and the app account gains none (the review's cross-cutting #8).
do $$ declare v_step text;
begin
 foreach v_step in array array['held','leaving'] loop
  if v_step='held' then
   insert into private.legal_holds(user_id,reason,case_ref,review_on) values (pg_temp.ac('05'),'police','AC-HOLD-1',current_date+90);
  else
   delete from private.legal_holds where case_ref='AC-HOLD-1';
   insert into private.account_deletion_jobs(request_id,user_id,recovery_hash)
    values (gen_random_uuid(),pg_temp.ac('05'),extensions.digest('ac-leaving','sha256'));
  end if;
  perform pg_temp.ac_refused(format('select private.fold_web_account(%L,%L)',pg_temp.ac('05'),pg_temp.ac('06')),'22023',
   'The account cannot be folded');
  perform pg_temp.ac_check(pg_temp.ac_rows(pg_temp.ac('05'))='2026-12:invitation' and pg_temp.ac_rows(pg_temp.ac('06'))=''
   and exists(select 1 from public.profiles where id=pg_temp.ac('05') and display_name='Web')
   and (select display_name from public.profiles where id=pg_temp.ac('06'))='App'
   and exists(select 1 from private.age_attestations where user_id=pg_temp.ac('05'))
   and not exists(select 1 from private.age_attestations where user_id=pg_temp.ac('06')),
   'The fold moved something from a '||v_step||' web account: 05 '||pg_temp.ac_rows(pg_temp.ac('05'))||', 06 '||pg_temp.ac_rows(pg_temp.ac('06')));
 end loop;
 delete from private.account_deletion_jobs where user_id=pg_temp.ac('05');
end $$;

-- 8b. The fold: the web account's records move to the app account, which keeps its own for the same version.
savepoint ac_own;
insert into private.terms_acceptances(user_id,terms_version,how) values (pg_temp.ac('06'),'2026-12','terms_screen');
select private.fold_web_account(pg_temp.ac('05'),pg_temp.ac('06'));
select pg_temp.ac_check(pg_temp.ac_rows(pg_temp.ac('06'))='2026-12:terms_screen' and pg_temp.ac_rows(pg_temp.ac('05'))='',
 'The fold replaced 06''s own acceptance: '||pg_temp.ac_rows(pg_temp.ac('06')));
rollback to savepoint ac_own;
select private.fold_web_account(pg_temp.ac('05'),pg_temp.ac('06'));
select pg_temp.ac_check((select (terms_version,how,accepted_at) from private.terms_acceptances where user_id=pg_temp.ac('06'))
 =('2026-12'::text,'invitation'::text,now()-interval '3 days'),'06 after the fold: '||pg_temp.ac_rows(pg_temp.ac('06')));
select pg_temp.ac_check(pg_temp.ac_rows(pg_temp.ac('05'))='','05 kept a record after the fold: '||pg_temp.ac_rows(pg_temp.ac('05')));

-- 8c. The fold clears the app account's pending number: Auth's phone_change, its code and when it was sent, set as Auth
-- leaves them when nothing is pending. The handler's later Admin API call sets the web account's number and leaves a
-- pending change, and the Send SMS hook texts no code to an account with a confirmed number and a different pending
-- one. 09 sent a code to a mistyped number on Add your number, then typed the number of its web account 08. 13 has
-- nothing pending, and the fold leaves its Auth row as it was, not even rewritten (its ctid).
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at,phone_change,phone_change_token,phone_change_sent_at) values
 (pg_temp.ac('08'),null,null,'447700900808',now(),'','',null),
 (pg_temp.ac('09'),'ac-09@resbite-test.invalid',now(),null,null,'447700900896','ac-token-09',now()-interval '10 minutes'),
 (pg_temp.ac('12'),null,null,'447700900812',now(),'','',null),
 (pg_temp.ac('13'),'ac-13@resbite-test.invalid',now(),null,null,'','',null);
insert into public.profiles(id,display_name) values (pg_temp.ac('08'),'Fern'),(pg_temp.ac('12'),'Gale'),(pg_temp.ac('13'),'Ash');
insert into private.age_attestations(user_id,terms_version) values (pg_temp.ac('08'),'2026-12'),(pg_temp.ac('12'),'2026-12');
insert into private.terms_acceptances(user_id,terms_version,how) values
 (pg_temp.ac('08'),'2026-12','invitation'),(pg_temp.ac('12'),'2026-12','invitation');
insert into private.app_sessions(user_id) values (pg_temp.ac('09')),(pg_temp.ac('13'));
create temporary table ac_before13 as select u.ctid as at, u::text as row from auth.users u where u.id=pg_temp.ac('13');
select private.fold_web_account(pg_temp.ac('08'),pg_temp.ac('09'));
select private.fold_web_account(pg_temp.ac('12'),pg_temp.ac('13'));
select pg_temp.ac_check((select phone_change='' and phone_change_token='' and phone_change_sent_at is null from auth.users where id=pg_temp.ac('09')),
 'The fold left 09''s pending number: '||(select coalesce(phone_change,'null')||' '||coalesce(phone_change_token,'null')||' '
  ||coalesce(phone_change_sent_at::text,'null') from auth.users where id=pg_temp.ac('09')));
select pg_temp.ac_check(pg_temp.ac_rows(pg_temp.ac('09'))='2026-12:invitation' and pg_temp.ac_rows(pg_temp.ac('08'))=''
 and (select display_name from public.profiles where id=pg_temp.ac('09'))='Fern' and not exists(select 1 from public.profiles where id=pg_temp.ac('08'))
 and exists(select 1 from private.age_attestations where user_id=pg_temp.ac('09') and terms_version='2026-12')
 and not exists(select 1 from private.age_attestations where user_id=pg_temp.ac('08'))
 and (select email='ac-09@resbite-test.invalid' and phone is null from auth.users where id=pg_temp.ac('09')),
 'The fold into 09 did not move 08''s records, or changed 09''s Auth row beyond its pending number: 09 '||pg_temp.ac_rows(pg_temp.ac('09')));
select pg_temp.ac_check((select u.ctid=b.at and u::text=b.row from auth.users u, ac_before13 b where u.id=pg_temp.ac('13')),
 'The fold wrote 13''s Auth row, which had nothing pending');
select pg_temp.ac_check(pg_temp.ac_rows(pg_temp.ac('13'))='2026-12:invitation' and pg_temp.ac_rows(pg_temp.ac('12'))=''
 and (select display_name from public.profiles where id=pg_temp.ac('13'))='Ash' and not exists(select 1 from public.profiles where id=pg_temp.ac('12'))
 and exists(select 1 from private.age_attestations where user_id=pg_temp.ac('13') and terms_version='2026-12'),
 'The fold into 13 did not move 12''s records: 13 '||pg_temp.ac_rows(pg_temp.ac('13')));

-- 9. A deleted account's records go with it.
delete from auth.users where id=pg_temp.ac('02');
select pg_temp.ac_check(not exists(select 1 from private.terms_acceptances where user_id=pg_temp.ac('02')),'02''s records outlived the account');

-- 10. Grants: accept_terms for signed-in accounts only; the helpers and the tables for no API role; RLS on.
do $$ declare f regprocedure; r text; t regclass; p text; begin
 foreach f in array array['public.accept_terms(text)'::regprocedure,'private.accept_terms(text)'::regprocedure] loop
  perform pg_temp.ac_check(has_function_privilege('authenticated',f,'EXECUTE'),f||' is not executable by authenticated');
  perform pg_temp.ac_check(not has_function_privilege('anon',f,'EXECUTE') and not has_function_privilege('service_role',f,'EXECUTE'),
   f||' is executable by anon or service_role');
 end loop;
 foreach f in array array['private.terms_version()'::regprocedure,'private.terms_needed(uuid)'::regprocedure,
   'private.note_terms(uuid,text,text)'::regprocedure] loop
  foreach r in array array['anon','authenticated','service_role'] loop
   perform pg_temp.ac_check(not has_function_privilege(r,f,'EXECUTE'),f||' is executable by '||r);
  end loop;
 end loop;
 foreach t in array array['private.terms_versions'::regclass,'private.terms_acceptances'::regclass] loop
  perform pg_temp.ac_check((select relrowsecurity from pg_catalog.pg_class where oid=t),t||' has no RLS');
  foreach r in array array['anon','authenticated','service_role'] loop
   foreach p in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
    perform pg_temp.ac_check(not has_table_privilege(r,t,p),t||' grants '||p||' to '||r);
   end loop;
  end loop;
 end loop;
end $$;
rollback;
