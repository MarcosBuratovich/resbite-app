-- Rehearsal for 20261110120000_connections (hosted-baseline mode only); .after.sql removes everything here.
-- 1. The outbox kind check as it stands, so .after.sql can prove the rollback restores it exactly.
create table private.co_rehearsal_kind_check as
 select pg_catalog.pg_get_constraintdef(oid) as definition from pg_catalog.pg_constraint
 where conrelid='private.notification_outbox'::regclass and conname='notification_outbox_kind_check';
alter table private.co_rehearsal_kind_check enable row level security;

-- 2. The pre-state: none of the migration's tables, functions or outbox kinds exist.
do $$ begin
 if pg_catalog.to_regclass('public.connections') is not null or pg_catalog.to_regclass('private.connection_refusals') is not null then
  raise exception 'The connection tables exist before the migration';
 end if;
 if pg_catalog.to_regprocedure('public.request_connection(uuid,uuid)') is not null
 or pg_catalog.to_regprocedure('private.request_connection(uuid,uuid)') is not null
 or pg_catalog.to_regprocedure('private.pair(uuid,uuid)') is not null then
  raise exception 'A connection function exists before the migration';
 end if;
 if (select definition from private.co_rehearsal_kind_check) like '%connection%' then
  raise exception 'The outbox kind check already allows the connection kinds';
 end if;
end $$;
