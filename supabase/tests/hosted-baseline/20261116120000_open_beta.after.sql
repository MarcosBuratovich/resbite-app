-- Rehearsal for 20261116120000_open_beta (hosted-baseline mode only), after the apply. Removes what .before.sql made.
-- 1. Each redefined body is the hosted one with only its named line changed, and every grant is unchanged.
create temporary table ob_edits(signature text, old text, new text);
insert into ob_edits values
 ('private.user_eligible(uuid)',
  $x$    and ((u.email_confirmed_at is not null and exists (select 1 from private.tester_roster r where r.email = lower(u.email) and r.enabled)) or private.has_live_grant(u.id))$x$,
  $x$    and not private.access_suspended(u.id)$x$),
 ('private.join_by_link(text,text,text)',
  $x$ if private.eligible() then return private.claim_plan_link(p_code); end if;$x$,
  $x$ if private.granted_access(v_uid) and private.eligible() then return private.claim_plan_link(p_code); end if;$x$),
 ('private.request_to_join(text,text,text,text)',
  $x$ if not private.eligible() and not exists(select 1 from private.age_attestations where user_id=v_uid) then$x$,
  $x$ if not (private.granted_access(v_uid) and private.eligible()) and not exists(select 1 from private.age_attestations where user_id=v_uid) then$x$),
 ('private.decide_join_request(uuid,uuid,boolean)',
  $x$ if not private.user_eligible(p_user) then$x$,
  $x$ if not (private.granted_access(p_user) and private.user_eligible(p_user)) then$x$),
 ('private.request_account_deletion(uuid,uuid,uuid,text)',
  $x$(exists(select 1 from private.tester_roster r where r.email=lower(u.email) and r.enabled) or private.has_live_grant(u.id))$x$,
  $x$not private.access_suspended(u.id)$x$);
do $$ declare r record; begin
 for r in select f.signature, f.definition, f.grants, e.old, e.new from private.ob_rehearsal_functions f join ob_edits e using (signature) loop
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
 if exists(select 1 from private.ob_rehearsal_functions f where not exists(select 1 from ob_edits e where e.signature=f.signature)) then
  raise exception 'A redefined function had no named line to check';
 end if;
end $$;

-- 2. The helpers exist and no client may call them, suspensions has grant_made; 01 is now eligible, the suspended 02
-- still isn't, the tester still is.
do $$ declare f regprocedure; begin
 foreach f in array array['private.granted_access(uuid)'::regprocedure,'private.access_suspended(uuid)'::regprocedure] loop
  if has_function_privilege('anon',f,'EXECUTE') or has_function_privilege('authenticated',f,'EXECUTE')
   or has_function_privilege('service_role',f,'EXECUTE') then raise exception '% has client grants', f; end if;
 end loop;
 if not exists(select 1 from information_schema.columns where table_schema='private' and table_name='suspensions'
   and column_name='grant_made' and data_type='boolean' and is_nullable='NO' and column_default='false') then
  raise exception 'suspensions.grant_made is missing or not a not-null boolean defaulting to false';
 end if;
 if not private.user_eligible('eb0b0000-0000-4000-8000-000000000001') then raise exception '01 is not eligible after the apply'; end if;
 if private.user_eligible('eb0b0000-0000-4000-8000-000000000002') then raise exception 'The suspended 02 is eligible'; end if;
 if not private.user_eligible('eb0b0000-0000-4000-8000-000000000003') then raise exception 'The roster tester lost access'; end if;
end $$;

-- 3. The rollback restores every body with its grants and drops the helpers and grant_made; 01 waits again.
begin;
\ir ../../rollback/20261116120000_open_beta.rollback.sql
do $$ begin
 if exists(select 1 from private.ob_rehearsal_functions f
   where pg_catalog.pg_get_functiondef(f.signature::regprocedure) is distinct from f.definition
   or (select p.proacl::text from pg_catalog.pg_proc p where p.oid=f.signature::regprocedure) is distinct from f.grants) then
  raise exception 'Rollback did not restore the redefined functions with their grants';
 end if;
 if pg_catalog.to_regprocedure('private.granted_access(uuid)') is not null
   or pg_catalog.to_regprocedure('private.access_suspended(uuid)') is not null then
  raise exception 'Rollback left a helper';
 end if;
 if exists(select 1 from information_schema.columns where table_schema='private' and table_name='suspensions' and column_name='grant_made') then raise exception 'Rollback left suspensions.grant_made'; end if;
 if private.user_eligible('eb0b0000-0000-4000-8000-000000000001') then raise exception '01 is eligible after the rollback'; end if;
end $$;
rollback;

-- 4. Remove the rehearsal fixtures and helpers so later tests start clean.
delete from private.tester_roster where email='ob-rehearsal@resbite-test.invalid';
delete from auth.users where id in ('eb0b0000-0000-4000-8000-000000000001','eb0b0000-0000-4000-8000-000000000002',
 'eb0b0000-0000-4000-8000-000000000003');
drop table private.ob_rehearsal_functions;
drop table ob_edits;
