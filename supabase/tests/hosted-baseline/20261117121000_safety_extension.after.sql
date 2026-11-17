-- Rehearsal for 20261117121000_safety_extension (hosted-baseline mode only), after the apply. Removes what .before.sql
-- made.
-- 1. Each redefined body is the hosted one with only its named line changed, and every grant is unchanged.
create temporary table bb_edits(signature text, old text, new text);
insert into bb_edits values
 ('private.report_message(bigint,text,text)',
  $x$ if p_reason is null or p_reason not in ('harassment','spam','inappropriate','other')$x$,
  $x$ if p_reason is null or p_reason not in ('illegal','child_safety','intimate_image','harassment','spam','inappropriate','other')$x$),
 ('private.report_user(uuid,uuid,text,text)',
  $x$ if p_reason is null or p_reason not in ('harassment','spam','inappropriate','other')$x$,
  $x$ if p_reason is null or p_reason not in ('illegal','child_safety','intimate_image','harassment','spam','inappropriate','other')$x$);
do $$ declare r record; begin
 for r in select f.signature, f.definition, f.grants, e.old, e.new from private.bb_rehearsal_functions f join bb_edits e using (signature) loop
  if (length(r.definition)-length(replace(r.definition,r.old,'')))/length(r.old)<>1 then
   raise exception '% had % copies of the line to change', r.signature, (length(r.definition)-length(replace(r.definition,r.old,'')))/length(r.old);
  end if;
  if pg_catalog.pg_get_functiondef(r.signature::regprocedure) is distinct from replace(r.definition,r.old,r.new) then
   raise exception '% changed more than its named line', r.signature;
  end if;
  if (select p.proacl::text from pg_catalog.pg_proc p where p.oid=r.signature::regprocedure) is distinct from r.grants then
   raise exception '% lost or gained a grant', r.signature;
  end if;
 end loop;
 if exists(select 1 from private.bb_rehearsal_functions f where not exists(select 1 from bb_edits e where e.signature=f.signature))
   or (select count(*) from private.bb_rehearsal_functions)<>2 then
  raise exception 'A redefined function had no named line to check';
 end if;
end $$;

-- 2. The reports' check names the seven reasons and is validated.
do $$ begin
 if (select pg_catalog.pg_get_constraintdef(c.oid) from pg_catalog.pg_constraint c
   where c.conrelid='private.reports'::regclass and c.conname='reports_reason_check' and c.convalidated)
   is distinct from 'CHECK ((reason = ANY (ARRAY[''illegal''::text, ''child_safety''::text, ''intimate_image''::text, ''harassment''::text, '
    '''spam''::text, ''inappropriate''::text, ''other''::text])))' then
  raise exception 'reports_reason_check after the apply: %', (select pg_catalog.pg_get_constraintdef(c.oid)
   from pg_catalog.pg_constraint c where c.conrelid='private.reports'::regclass and c.conname='reports_reason_check');
 end if;
end $$;

-- 3. The match and its three guards: definers with an empty search path, executable by no API role; the three
-- triggers, each BEFORE, for each row, on its watched columns.
do $$ declare f regprocedure; r text; begin
 foreach f in array array['private.holds_blocked_term(text)'::regprocedure,'private.refuse_blocked_plan_words()'::regprocedure,
   'private.refuse_blocked_meeting_words()'::regprocedure,'private.refuse_blocked_name()'::regprocedure] loop
  foreach r in array array['anon','authenticated','service_role'] loop
   if has_function_privilege(r,f,'EXECUTE') then raise exception '% is executable by %', f, r; end if;
  end loop;
  if not (select p.prosecdef and 'search_path=""'=any(p.proconfig) from pg_catalog.pg_proc p where p.oid=f) then
   raise exception '% is not a definer with an empty search path', f;
  end if;
 end loop;
 if (select array_agg(pg_catalog.pg_get_triggerdef(t.oid) order by t.tgname) from pg_catalog.pg_trigger t
   where t.tgname in ('plans_refuse_blocked_words','plan_meeting_details_refuse_blocked_words','profiles_refuse_blocked_words'))
   is distinct from array[
    'CREATE TRIGGER plan_meeting_details_refuse_blocked_words BEFORE INSERT OR UPDATE OF note ON public.plan_meeting_details FOR EACH ROW EXECUTE FUNCTION private.refuse_blocked_meeting_words()',
    'CREATE TRIGGER plans_refuse_blocked_words BEFORE INSERT OR UPDATE OF title, description, guest_note ON public.plans FOR EACH ROW EXECUTE FUNCTION private.refuse_blocked_plan_words()',
    'CREATE TRIGGER profiles_refuse_blocked_words BEFORE INSERT OR UPDATE OF display_name ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.refuse_blocked_name()'] then
  raise exception 'The blocked-words triggers are %', (select array_agg(pg_catalog.pg_get_triggerdef(t.oid) order by t.tgname) from pg_catalog.pg_trigger t
   where t.tgname in ('plans_refuse_blocked_words','plan_meeting_details_refuse_blocked_words','profiles_refuse_blocked_words'));
 end if;
end $$;

-- 4. The rollback's guard: with one body put back as a later migration might leave it, the rollback refuses and changes
-- nothing (it runs from its text; the harness passes the repository's path as resbite_repo).
\set bb_rollback `cat :'resbite_repo'/supabase/rollback/20261117121000_safety_extension.rollback.sql`
create temporary table bb_rehearsal_scripts as select :'bb_rollback'::text as rollback;
begin;
do $$ declare v_message text; begin
 if coalesce(length(btrim((select rollback from bb_rehearsal_scripts))),0)=0 then raise exception 'The rollback text is empty'; end if;
 execute (select definition from private.bb_rehearsal_functions where signature='private.report_user(uuid,uuid,text,text)');
 begin
  execute (select rollback from bb_rehearsal_scripts);
  raise exception 'The rollback ran over a body that is not this migration''s';
 exception when insufficient_privilege then
  get stacked diagnostics v_message = message_text;
  if v_message is distinct from 'private.report_user(uuid,uuid,text,text) is not the safety extension body: run the rollbacks of every later migration first' then
   raise;
  end if;
 end;
 if pg_catalog.to_regprocedure('private.holds_blocked_term(text)') is null
   or not exists(select 1 from pg_catalog.pg_trigger where tgname='plans_refuse_blocked_words') then
  raise exception 'The refused rollback dropped the filter';
 end if;
end $$;
rollback;

-- 5. The rollback restores both bodies with their grants, drops the triggers, the guards and the match, and restores
-- the four-reason check, validated (no report gives a new reason here).
begin;
\ir ../../rollback/20261117121000_safety_extension.rollback.sql
do $$ begin
 if exists(select 1 from private.bb_rehearsal_functions f
   where pg_catalog.pg_get_functiondef(f.signature::regprocedure) is distinct from f.definition
   or (select p.proacl::text from pg_catalog.pg_proc p where p.oid=f.signature::regprocedure) is distinct from f.grants) then
  raise exception 'Rollback did not restore the redefined functions with their grants';
 end if;
 if exists(select 1 from pg_catalog.pg_trigger t where t.tgname in ('plans_refuse_blocked_words','plan_meeting_details_refuse_blocked_words',
   'profiles_refuse_blocked_words')) then
  raise exception 'Rollback left a blocked-words trigger';
 end if;
 if pg_catalog.to_regprocedure('private.holds_blocked_term(text)') is not null
   or pg_catalog.to_regprocedure('private.refuse_blocked_plan_words()') is not null
   or pg_catalog.to_regprocedure('private.refuse_blocked_meeting_words()') is not null
   or pg_catalog.to_regprocedure('private.refuse_blocked_name()') is not null then
  raise exception 'Rollback left the match or a guard';
 end if;
 if (select pg_catalog.pg_get_constraintdef(c.oid) from pg_catalog.pg_constraint c
   where c.conrelid='private.reports'::regclass and c.conname='reports_reason_check' and c.convalidated)
   is distinct from 'CHECK ((reason = ANY (ARRAY[''harassment''::text, ''spam''::text, ''inappropriate''::text, ''other''::text])))' then
  raise exception 'Rollback did not restore the validated four-reason check: %', (select pg_catalog.pg_get_constraintdef(c.oid)
   from pg_catalog.pg_constraint c where c.conrelid='private.reports'::regclass and c.conname='reports_reason_check');
 end if;
end $$;
rollback;

-- 6. With a report that gives a new reason, the rollback keeps it and adds the four-reason check NOT VALID.
begin;
insert into private.reports(reporter_id,target_user_id,about,reason,details) values (null,null,'user','illegal','bb: kept by the rollback');
\ir ../../rollback/20261117121000_safety_extension.rollback.sql
do $$ begin
 if (select (pg_catalog.pg_get_constraintdef(c.oid),c.convalidated) from pg_catalog.pg_constraint c
   where c.conrelid='private.reports'::regclass and c.conname='reports_reason_check')
   is distinct from ('CHECK ((reason = ANY (ARRAY[''harassment''::text, ''spam''::text, ''inappropriate''::text, ''other''::text]))) NOT VALID'::text,false) then
  raise exception 'Rollback with a new reason stored: %', (select (pg_catalog.pg_get_constraintdef(c.oid),c.convalidated)::text
   from pg_catalog.pg_constraint c where c.conrelid='private.reports'::regclass and c.conname='reports_reason_check');
 end if;
 if (select count(*) from private.reports where reason='illegal' and details='bb: kept by the rollback')<>1 then
  raise exception 'Rollback did not keep the report with a new reason';
 end if;
end $$;
rollback;

-- 7. Remove the rehearsal helpers so later tests start clean.
drop table private.bb_rehearsal_functions;
drop table bb_edits;
drop table bb_rehearsal_scripts;
