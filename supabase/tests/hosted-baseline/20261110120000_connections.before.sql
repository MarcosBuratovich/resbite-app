-- Rehearsal for 20261110120000_connections (hosted-baseline mode only); .after.sql removes everything here.
-- 1. The outbox kind check as it stands, so .after.sql can prove the rollback restores it exactly.
create table private.co_rehearsal_kind_check as
 select pg_catalog.pg_get_constraintdef(oid) as definition from pg_catalog.pg_constraint
 where conrelid='private.notification_outbox'::regclass and conname='notification_outbox_kind_check';
alter table private.co_rehearsal_kind_check enable row level security;
-- The profile read rule as it stands, for the same proof.
create table private.co_rehearsal_profile_rule as
 select pg_catalog.pg_get_functiondef('private.can_read_profile(uuid)'::regprocedure) as definition;
alter table private.co_rehearsal_profile_rule enable row level security;
-- And the two functions the migration redefines.
create table private.co_rehearsal_functions as
 select f as signature, pg_catalog.pg_get_functiondef(f::regprocedure) as definition
 from unnest(array['private.invite_contacts(uuid,jsonb)','private.notification_recipient_eligible(bigint)']) f;
alter table private.co_rehearsal_functions enable row level security;

-- 2. The pre-state: none of the migration's tables, functions or outbox kinds exist, the two functions it redefines know
-- nothing of connections, and request_account_deletion does not exist (the deletion lifecycle is local-only), so it
-- redefines none.
do $$ begin
 if pg_catalog.to_regclass('public.connections') is not null or pg_catalog.to_regclass('private.connection_refusals') is not null then
  raise exception 'The connection tables exist before the migration';
 end if;
 if pg_catalog.to_regprocedure('public.request_connection(uuid,uuid)') is not null
 or pg_catalog.to_regprocedure('private.request_connection(uuid,uuid)') is not null
 or pg_catalog.to_regprocedure('private.pair(uuid,uuid)') is not null
 or pg_catalog.to_regprocedure('public.my_connections()') is not null
 or pg_catalog.to_regprocedure('public.plan_connection_states(uuid)') is not null then
  raise exception 'A connection function exists before the migration';
 end if;
 if (select definition from private.co_rehearsal_kind_check) like '%connection%' then
  raise exception 'The outbox kind check already allows the connection kinds';
 end if;
 if (select definition from private.co_rehearsal_profile_rule) like '%connections%' then
  raise exception 'can_read_profile already reads the pairs';
 end if;
 if (select definition from private.co_rehearsal_functions where signature='private.invite_contacts(uuid,jsonb)') like '%Not a connection%'
 or (select definition from private.co_rehearsal_functions where signature='private.notification_recipient_eligible(bigint)') like '%connection_request%' then
  raise exception 'invite_contacts or notification_recipient_eligible already knows connections';
 end if;
 if pg_catalog.to_regprocedure('private.request_account_deletion(uuid,uuid,uuid,text)') is not null then
  raise exception 'request_account_deletion exists on the hosted baseline';
 end if;
end $$;
