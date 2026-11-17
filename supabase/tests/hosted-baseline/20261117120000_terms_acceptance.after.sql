-- Rehearsal for 20261117120000_terms_acceptance (hosted-baseline mode only), after the apply. Removes what .before.sql
-- made.
-- 1. Each redefined body is the hosted one with only its named lines changed, applied in order (the fold has two: the
-- hold and deletion refusal after the used-the-app check, and the acceptances after the tick's delete), and every grant
-- is unchanged. Each old string occurs exactly once in the snapshot.
create temporary table ba_edits(signature text, step integer, old text, new text);
insert into ba_edits values
 ('private.account_access_status()',1,
  $x$ return jsonb_build_object('account_id',v_uid,'status',v_status);$x$,
  $x$ return jsonb_build_object('account_id',v_uid,'status',v_status,'terms_version',private.terms_version(),'terms_needed',private.terms_needed(v_uid));$x$),
 ('private.attest_age(text)',1,
  $x$  on conflict (user_id) do nothing;$x$,
  $x$  on conflict (user_id) do nothing;
 perform private.note_terms(v_uid,p_terms_version,'sign_up');$x$),
 ('private.join_by_link(text,text,text)',1,
  $x$ perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text,47));$x$,
  $x$ perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text,47));
 perform private.note_terms(v_uid,p_terms_version,'invitation');$x$),
 ('private.request_to_join(text,text,text,text)',1,
  $x$ perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text,47));$x$,
  $x$ perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text,47));
 perform private.note_terms(v_uid,p_terms_version,'invitation');$x$),
 ('private.answer_phone_invitation(text,text,text,text)',1,
  $x$ perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text,47));$x$,
  $x$ perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text,47));
 perform private.note_terms(v_uid,p_terms_version,'invitation');$x$),
 ('private.fold_web_account(uuid,uuid)',1,
  $x$ if private.used_app(p_from) then raise exception 'The account has used the app' using errcode='22023'; end if;$x$,
  $x$ if private.used_app(p_from) then raise exception 'The account has used the app' using errcode='22023'; end if;
 if private.account_held(p_from) or private.deletion_pending(p_from) then raise exception 'The account cannot be folded' using errcode='22023'; end if;$x$),
 ('private.fold_web_account(uuid,uuid)',2,
  $x$ delete from private.age_attestations where user_id=p_from;$x$,
  $x$ delete from private.age_attestations where user_id=p_from;
 insert into private.terms_acceptances(user_id,terms_version,accepted_at,how) select p_into,terms_version,accepted_at,how from private.terms_acceptances where user_id=p_from on conflict do nothing;
 delete from private.terms_acceptances where user_id=p_from;$x$);
do $$ declare r record; x record; v_expected text; begin
 for r in select f.signature, f.definition, f.grants from private.ba_rehearsal_functions f loop
  v_expected := r.definition;
  for x in select a.old, a.new from ba_edits a where a.signature=r.signature order by a.step loop
   if (length(r.definition)-length(replace(r.definition,x.old,'')))/length(x.old)<>1 then
    raise exception '% had % copies of a line to change', r.signature, (length(r.definition)-length(replace(r.definition,x.old,'')))/length(x.old);
   end if;
   v_expected := replace(v_expected,x.old,x.new);
  end loop;
  if pg_catalog.pg_get_functiondef(r.signature::regprocedure) is distinct from v_expected then
   raise exception '% changed more than its named lines', r.signature;
  end if;
  if (select p.proacl::text from pg_catalog.pg_proc p where p.oid=r.signature::regprocedure) is distinct from r.grants then
   raise exception '% lost or gained a grant', r.signature;
  end if;
 end loop;
 if exists(select 1 from private.ba_rehearsal_functions f where not exists(select 1 from ba_edits e where e.signature=f.signature))
   or (select count(*) from private.ba_rehearsal_functions)<>6 then
  raise exception 'A redefined function had no named line to check';
 end if;
end $$;

-- 2. The backfill: every 18+ tick is a legacy acceptance of its version at its time (01 and 02 here, the only ticks on
-- the baseline); nothing else. No version is published.
do $$ begin
 if (select array_agg((user_id,terms_version,accepted_at,how)::text order by user_id) from private.terms_acceptances)
   is distinct from array[('ba000000-0000-4000-8000-000000000001'::uuid,'2026-10'::text,'2026-10-20 10:00+00'::timestamptz,'legacy'::text)::text,
    ('ba000000-0000-4000-8000-000000000002'::uuid,'2026-11'::text,'2026-11-02 09:30+00'::timestamptz,'legacy'::text)::text] then
  raise exception 'The backfill made %', (select array_agg((user_id,terms_version,accepted_at,how)::text order by user_id) from private.terms_acceptances);
 end if;
 if (select count(*) from private.terms_acceptances)<>(select count(*) from private.age_attestations)
   or exists(select 1 from private.age_attestations a where not exists(select 1 from private.terms_acceptances t
    where t.user_id=a.user_id and t.terms_version=a.terms_version and t.accepted_at=a.confirmed_at and t.how='legacy')) then
  raise exception 'A tick has no legacy acceptance';
 end if;
 if exists(select 1 from private.terms_versions) then raise exception 'The migration published a version'; end if;
end $$;

-- 3. The new objects and their grants: accept_terms for signed-in accounts only, the helpers and the tables for no API
-- role, RLS on both tables, every new definer with an empty search path. The access check as 01: four keys, nothing
-- published, nothing needed.
do $$ declare f regprocedure; r text; t regclass; p text; v jsonb; begin
 foreach f in array array['public.accept_terms(text)'::regprocedure,'private.accept_terms(text)'::regprocedure] loop
  if not has_function_privilege('authenticated',f,'EXECUTE') then raise exception '% is not executable by authenticated', f; end if;
  if has_function_privilege('anon',f,'EXECUTE') or has_function_privilege('service_role',f,'EXECUTE') then
   raise exception '% is executable by anon or service_role', f;
  end if;
 end loop;
 foreach f in array array['private.terms_version()'::regprocedure,'private.terms_needed(uuid)'::regprocedure,
   'private.note_terms(uuid,text,text)'::regprocedure] loop
  foreach r in array array['anon','authenticated','service_role'] loop
   if has_function_privilege(r,f,'EXECUTE') then raise exception '% is executable by %', f, r; end if;
  end loop;
 end loop;
 foreach f in array array['private.accept_terms(text)'::regprocedure,'private.terms_version()'::regprocedure,
   'private.terms_needed(uuid)'::regprocedure,'private.note_terms(uuid,text,text)'::regprocedure] loop
  if not (select p.prosecdef and 'search_path=""'=any(p.proconfig) from pg_catalog.pg_proc p where p.oid=f) then
   raise exception '% is not a definer with an empty search path', f;
  end if;
 end loop;
 if (select p.prosecdef from pg_catalog.pg_proc p where p.oid='public.accept_terms(text)'::regprocedure) then
  raise exception 'public.accept_terms is a definer';
 end if;
 foreach t in array array['private.terms_versions'::regclass,'private.terms_acceptances'::regclass] loop
  if not (select relrowsecurity from pg_catalog.pg_class where oid=t) then raise exception '% has no RLS', t; end if;
  foreach r in array array['anon','authenticated','service_role'] loop
   foreach p in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
    if has_table_privilege(r,t,p) then raise exception '% grants % to %', t, p, r; end if;
   end loop;
  end loop;
 end loop;
 perform set_config('request.jwt.claims','{"sub":"ba000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
 v := public.account_access_status();
 perform set_config('request.jwt.claims','',true);
 if v is distinct from jsonb_build_object('account_id','ba000000-0000-4000-8000-000000000001'::uuid,'status','approved',
   'terms_version',null,'terms_needed',false) then
  raise exception 'The access check after the apply was %', v;
 end if;
end $$;

-- 4. The rollback's guard: with one body put back as a later migration might leave it, the rollback refuses and changes
-- nothing (it runs from its text; the harness passes the repository's path as resbite_repo).
\set ba_rollback `cat :'resbite_repo'/supabase/rollback/20261117120000_terms_acceptance.rollback.sql`
create temporary table ba_rehearsal_scripts as select :'ba_rollback'::text as rollback;
begin;
do $$ declare v_message text; begin
 if coalesce(length(btrim((select rollback from ba_rehearsal_scripts))),0)=0 then raise exception 'The rollback text is empty'; end if;
 execute (select definition from private.ba_rehearsal_functions where signature='private.fold_web_account(uuid,uuid)');
 begin
  execute (select rollback from ba_rehearsal_scripts);
  raise exception 'The rollback ran over a body that is not this migration''s';
 exception when insufficient_privilege then
  get stacked diagnostics v_message = message_text;
  if v_message is distinct from 'private.fold_web_account(uuid,uuid) is not the terms acceptance body: run the rollbacks of every later migration first' then
   raise;
  end if;
 end;
 if pg_catalog.to_regclass('private.terms_acceptances') is null then raise exception 'The refused rollback dropped a table'; end if;
end $$;
rollback;

-- 5. The rollback restores every body with its grants and drops both tables and the five new functions; the 18+ ticks
-- stay as they were.
begin;
\ir ../../rollback/20261117120000_terms_acceptance.rollback.sql
do $$ begin
 if exists(select 1 from private.ba_rehearsal_functions f
   where pg_catalog.pg_get_functiondef(f.signature::regprocedure) is distinct from f.definition
   or (select p.proacl::text from pg_catalog.pg_proc p where p.oid=f.signature::regprocedure) is distinct from f.grants) then
  raise exception 'Rollback did not restore the redefined functions with their grants';
 end if;
 if pg_catalog.to_regclass('private.terms_versions') is not null or pg_catalog.to_regclass('private.terms_acceptances') is not null then
  raise exception 'Rollback left a terms table';
 end if;
 if pg_catalog.to_regprocedure('public.accept_terms(text)') is not null or pg_catalog.to_regprocedure('private.accept_terms(text)') is not null
   or pg_catalog.to_regprocedure('private.note_terms(uuid,text,text)') is not null or pg_catalog.to_regprocedure('private.terms_needed(uuid)') is not null
   or pg_catalog.to_regprocedure('private.terms_version()') is not null then
  raise exception 'Rollback left accept_terms or a terms helper';
 end if;
 if (select array_agg((user_id,terms_version,confirmed_at)::text order by user_id) from private.age_attestations)
   is distinct from array[('ba000000-0000-4000-8000-000000000001'::uuid,'2026-10'::text,'2026-10-20 10:00+00'::timestamptz)::text,
    ('ba000000-0000-4000-8000-000000000002'::uuid,'2026-11'::text,'2026-11-02 09:30+00'::timestamptz)::text] then
  raise exception 'Rollback changed the 18+ ticks';
 end if;
end $$;
rollback;

-- 6. Remove the rehearsal fixtures and helpers so later tests start clean.
delete from auth.users where id in ('ba000000-0000-4000-8000-000000000001','ba000000-0000-4000-8000-000000000002');
drop table private.ba_rehearsal_functions;
drop table ba_edits;
drop table ba_rehearsal_scripts;
