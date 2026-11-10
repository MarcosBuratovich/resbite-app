-- Rehearsal checks for 20261110120000_connections (hosted-baseline mode only).
-- 1. The two tables, with row security and no policies; the outbox takes the two new kinds and keeps the earlier ones;
-- the apply wrote no rows.
do $$ begin
 if pg_catalog.to_regclass('public.connections') is null or pg_catalog.to_regclass('private.connection_refusals') is null then
  raise exception 'The connection tables are missing';
 end if;
 if not (select relrowsecurity from pg_catalog.pg_class where oid='public.connections'::regclass)
 or not (select relrowsecurity from pg_catalog.pg_class where oid='private.connection_refusals'::regclass) then
  raise exception 'A connection table has no row security';
 end if;
 if exists(select 1 from pg_catalog.pg_policies where schemaname in ('public','private') and tablename in ('connections','connection_refusals')) then
  raise exception 'A connection table has a policy';
 end if;
 if (select pg_catalog.pg_get_constraintdef(oid) from pg_catalog.pg_constraint where conname='notification_outbox_kind_check')
   not like '%''invitation''%''rsvp''%''plan_changed''%''plan_cancelled''%''guest_note''%''invited''%''join_request''%''join_approved''%''admin_added''%''connection_request''%''connection_accepted''%' then
  raise exception 'The outbox kind check is wrong: %', (select pg_catalog.pg_get_constraintdef(oid) from pg_catalog.pg_constraint where conname='notification_outbox_kind_check');
 end if;
 if exists(select 1 from public.connections) or exists(select 1 from private.connection_refusals)
 or exists(select 1 from private.notification_outbox where kind in ('connection_request','connection_accepted')) then
  raise exception 'The apply wrote rows';
 end if;
end $$;
-- 2. Grants: the five calls, private bodies (definers) and public wrappers, for signed-in accounts only; the pair helper
-- and both tables for nobody.
do $$ declare s text; f text; r text; begin
 foreach s in array array['private.','public.'] loop
  foreach f in array array['request_connection(uuid,uuid)','accept_connection(uuid)','decline_connection(uuid)',
   'cancel_connection_request(uuid)','remove_connection(uuid)'] loop
   if not has_function_privilege('authenticated',s||f,'execute') or has_function_privilege('anon',s||f,'execute')
   or has_function_privilege('service_role',s||f,'execute') then raise exception '% grants wrong', s||f; end if;
   if (select prosecdef from pg_catalog.pg_proc where oid=(s||f)::regprocedure) is distinct from (s='private.') then
    raise exception '% definer wrong', s||f;
   end if;
  end loop;
 end loop;
 foreach r in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(r,'private.pair(uuid,uuid)','execute') then raise exception '% may call pair', r; end if;
  if has_table_privilege(r,'private.connection_refusals','select,insert,update,delete') then raise exception '% may touch connection_refusals', r; end if;
  if has_table_privilege(r,'public.connections','select,insert,update,delete,truncate') then raise exception '% may touch connections', r; end if;
 end loop;
end $$;
-- 3. The rollback, rehearsed and undone. Seed what it deletes (a pair, a refusal and the two notices), try its guard (it
-- refuses once the creating-a-resbite rollback has run; plan_admins, renamed, stands in), then run it: the tables, the
-- functions and the connection notices are gone, the kind check is the one .before.sql recorded, and the plan stays.
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('cc000000-0000-4000-8000-000000000001','connections-rehearsal-a@resbite-test.invalid',now()),
 ('cc000000-0000-4000-8000-000000000002','connections-rehearsal-b@resbite-test.invalid',now());
insert into public.profiles(id,display_name) values
 ('cc000000-0000-4000-8000-000000000001','Rehearsal A'),('cc000000-0000-4000-8000-000000000002','Rehearsal B');
insert into public.plans(id,owner_id,title,starts_at,ends_at,time_zone,place_label,categories) values
 ('cd000000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000001','Rehearsal supper',
  now()+interval '1 day',now()+interval '1 day 2 hours','UTC','Kitchen',array['community']);
insert into public.connections(user_a,user_b,state,requested_by,series_id,accepted_at) values
 ('cc000000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000002','connected','cc000000-0000-4000-8000-000000000001',
  'cd000000-0000-4000-8000-000000000001',now());
insert into private.connection_refusals(series_id,from_user,to_user) values
 ('cd000000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000002','cc000000-0000-4000-8000-000000000001');
insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id) values
 ('cd000000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000002','connection_request','connections-rehearsal:request','cc000000-0000-4000-8000-000000000001'),
 ('cd000000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000001','connection_accepted','connections-rehearsal:accepted','cc000000-0000-4000-8000-000000000002');
\set co_rehearsal_rollback `cat :'resbite_repo'/supabase/rollback/20261110120000_connections.rollback.sql`
create temporary table co_rehearsal_scripts on commit drop as select :'co_rehearsal_rollback'::text as rollback;
do $$ begin
 if coalesce(length(btrim((select rollback from co_rehearsal_scripts))),0)=0 then raise exception 'The rollback text is empty'; end if;
 alter table public.plan_admins rename to co_rehearsal_admins;
 begin
  execute (select rollback from co_rehearsal_scripts);
  raise exception 'The connections rollback ran after the creating-a-resbite rollback';
 exception when raise_exception then
  if sqlerrm is distinct from 'Run the connections rollback before the creating-a-resbite rollback' then raise; end if;
 end;
 alter table public.co_rehearsal_admins rename to plan_admins;
 if not exists(select 1 from public.connections) or not exists(select 1 from private.notification_outbox where kind='connection_request') then
  raise exception 'The refused rollback changed something';
 end if;
end $$;
\ir ../../rollback/20261110120000_connections.rollback.sql
do $$ begin
 if pg_catalog.to_regclass('public.connections') is not null or pg_catalog.to_regclass('private.connection_refusals') is not null then
  raise exception 'Rollback left a connection table';
 end if;
 if exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
   where n.nspname in ('public','private') and p.proname in ('request_connection','accept_connection','decline_connection',
    'cancel_connection_request','remove_connection','pair')) then
  raise exception 'Rollback left a connection function';
 end if;
 if exists(select 1 from private.notification_outbox where kind in ('connection_request','connection_accepted')) then
  raise exception 'Rollback left the connection notices';
 end if;
 if (select pg_catalog.pg_get_constraintdef(oid) from pg_catalog.pg_constraint where conname='notification_outbox_kind_check')
   is distinct from (select definition from private.co_rehearsal_kind_check) then
  raise exception 'Rollback did not restore the outbox kind check';
 end if;
 if not exists(select 1 from public.plans where id='cd000000-0000-4000-8000-000000000001') then raise exception 'Rollback lost the plan'; end if;
end $$;
rollback;
-- 4. Remove the rehearsal helper so later tests start clean.
drop table private.co_rehearsal_kind_check;
