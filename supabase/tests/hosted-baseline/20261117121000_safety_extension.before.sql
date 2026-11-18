-- Rehearsal for 20261117121000_safety_extension (hosted-baseline mode only); .after.sql removes everything here.
-- 1. The two functions the migration redefines, with their grants, as they stand, so .after.sql can prove the apply
-- changes only the line it names and keeps the grants, and that the rollback restores them exactly. A missing one
-- fails here (the cast to regprocedure).
create table private.bb_rehearsal_functions as
 select f as signature, pg_catalog.pg_get_functiondef(f::regprocedure) as definition,
  (select p.proacl::text from pg_catalog.pg_proc p where p.oid=f::regprocedure) as grants
 from unnest(array['private.report_message(bigint,text,text)','private.report_user(uuid,uuid,text,text)']) f;
alter table private.bb_rehearsal_functions enable row level security;

-- 2. The pre-state: the reports' check names exactly the four reasons; neither the match, its three guards nor their
-- triggers exist.
do $$ begin
 if (select count(*) from private.bb_rehearsal_functions where definition is not null and grants is not null)<>2 then
  raise exception 'A function to redefine is missing or has no grants';
 end if;
 if (select pg_catalog.pg_get_constraintdef(c.oid) from pg_catalog.pg_constraint c
   where c.conrelid='private.reports'::regclass and c.conname='reports_reason_check' and c.convalidated)
   is distinct from 'CHECK ((reason = ANY (ARRAY[''harassment''::text, ''spam''::text, ''inappropriate''::text, ''other''::text])))' then
  raise exception 'reports_reason_check is not the four reasons: %', (select pg_catalog.pg_get_constraintdef(c.oid)
   from pg_catalog.pg_constraint c where c.conrelid='private.reports'::regclass and c.conname='reports_reason_check');
 end if;
 if pg_catalog.to_regprocedure('private.holds_blocked_term(text)') is not null
   or pg_catalog.to_regprocedure('private.refuse_blocked_plan_words()') is not null
   or pg_catalog.to_regprocedure('private.refuse_blocked_meeting_words()') is not null
   or pg_catalog.to_regprocedure('private.refuse_blocked_name()') is not null then
  raise exception 'The match or a guard already exists';
 end if;
 if exists(select 1 from pg_catalog.pg_trigger t where t.tgname in ('plans_refuse_blocked_words','plan_meeting_details_refuse_blocked_words',
   'profiles_refuse_blocked_words')) then
  raise exception 'A blocked-words trigger already exists';
 end if;
 if exists(select 1 from private.bb_rehearsal_functions where definition like '%intimate_image%') then
  raise exception 'A report function already takes the new reasons';
 end if;
end $$;
