-- Rehearsal for 20261111120000_connections_follow_ups (hosted-baseline mode only); .after.sql removes everything here.
-- 1. The outbox detail check and the two functions the migration redefines, with their grants, as they stand, so
-- .after.sql can prove the apply keeps the grants and the rollback restores all three exactly.
create table private.cf_rehearsal_detail_check as
 select pg_catalog.pg_get_constraintdef(oid) as definition from pg_catalog.pg_constraint
 where conrelid='private.notification_outbox'::regclass and conname='notification_outbox_detail_check';
alter table private.cf_rehearsal_detail_check enable row level security;
create table private.cf_rehearsal_functions as
 select f as signature, pg_catalog.pg_get_functiondef(f::regprocedure) as definition,
  (select p.proacl::text from pg_catalog.pg_proc p where p.oid=f::regprocedure) as grants
 from unnest(array['private.roll_repeating_plans()','private.request_connection(uuid,uuid)']) f;
alter table private.cf_rehearsal_functions enable row level security;

-- 2. The pre-state: the roll leaves out the guests who withdrew, a request's notice has no detail, and the detail check
-- knows no connection kind.
do $$ begin
 if (select count(*) from private.cf_rehearsal_detail_check)<>1 or (select count(*) from private.cf_rehearsal_functions)<>2 then
  raise exception 'The detail check or a function to redefine is missing';
 end if;
 if (select definition from private.cf_rehearsal_functions where signature='private.roll_repeating_plans()')
   not like '%where plan_id=p.id and response<>''withdrawn'' and private.used_app(user_id)%' then
  raise exception 'The roll already carries the guests who withdrew';
 end if;
 if (select definition from private.cf_rehearsal_functions where signature='private.request_connection(uuid,uuid)') like '%detail%' then
  raise exception 'request_connection already gives its notice a detail';
 end if;
 if (select definition from private.cf_rehearsal_detail_check) like '%connection%' then
  raise exception 'The detail check already knows a connection kind';
 end if;
end $$;
