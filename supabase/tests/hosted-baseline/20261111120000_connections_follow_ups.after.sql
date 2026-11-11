-- Rehearsal checks for 20261111120000_connections_follow_ups (hosted-baseline mode only).
-- 1. The apply: the roll is the one .before.sql recorded but for the withdrawn filter; request_connection gives its
-- notice a detail; the detail check keeps every earlier value and takes the three for a request only; both functions
-- keep their grants (no API role may run the roll; signed-in accounts may ask); the apply wrote no rows.
do $$ declare r text; begin
 if pg_catalog.pg_get_functiondef('private.roll_repeating_plans()'::regprocedure) is distinct from
   replace((select definition from private.cf_rehearsal_functions where signature='private.roll_repeating_plans()'),
    'where plan_id=p.id and response<>''withdrawn'' and private.used_app(user_id)','where plan_id=p.id and private.used_app(user_id)') then
  raise exception 'The roll changed more, or less, than the withdrawn filter';
 end if;
 if pg_catalog.pg_get_functiondef('private.request_connection(uuid,uuid)'::regprocedure)
   not like '%into v_detail from public.plans p where p.id=p_plan;%insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id,created_at,detail)%,v_at,v_detail)%' then
  raise exception 'request_connection does not give its notice a detail';
 end if;
 if (select pg_catalog.pg_get_constraintdef(oid) from pg_catalog.pg_constraint
   where conrelid='private.notification_outbox'::regclass and conname='notification_outbox_detail_check')
   not like '%detail IS NULL%''plan_changed''%''time''%''place''%''time_place''%''rsvp''%''accepted''%''maybe''%''declined''%''withdrawn''%''invited''%''again''%''connection_request''%''going''%''invited''%''met''%' then
  raise exception 'The detail check is wrong: %', (select pg_catalog.pg_get_constraintdef(oid) from pg_catalog.pg_constraint
   where conrelid='private.notification_outbox'::regclass and conname='notification_outbox_detail_check');
 end if;
 if exists(select 1 from private.cf_rehearsal_functions f
   where (select p.proacl::text from pg_catalog.pg_proc p where p.oid=f.signature::regprocedure) is distinct from f.grants) then
  raise exception 'A redefined function''s grants changed';
 end if;
 foreach r in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(r,'private.roll_repeating_plans()','execute') then raise exception '% may run the roll', r; end if;
 end loop;
 if not has_function_privilege('authenticated','private.request_connection(uuid,uuid)','execute')
 or has_function_privilege('anon','private.request_connection(uuid,uuid)','execute')
 or (select prosecdef from pg_catalog.pg_proc where oid='private.request_connection(uuid,uuid)'::regprocedure) is not true
 or (select prosecdef from pg_catalog.pg_proc where oid='private.roll_repeating_plans()'::regprocedure) is not true then
  raise exception 'request_connection or the roll lost its grants or its definer';
 end if;
 if exists(select 1 from private.notification_outbox where kind='connection_request' and detail is not null) then
  raise exception 'The apply wrote rows';
 end if;
end $$;
-- 2. The rollback, rehearsed and undone. Seed what it deletes (a request notice with a detail) and what it keeps (one
-- with none, from before the migration, and a repeat's invitation), try its guard (it refuses once the connections
-- rollback or the creating-a-resbite rollback has run; each function, renamed, stands in), then run it: the notice
-- with a detail is gone, the other two stay, and the detail check and both functions, with their grants, are the ones
-- .before.sql recorded.
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('cf000000-0000-4000-8000-000000000001','follow-ups-rehearsal-a@resbite-test.invalid',now()),
 ('cf000000-0000-4000-8000-000000000002','follow-ups-rehearsal-b@resbite-test.invalid',now());
insert into public.profiles(id,display_name) values
 ('cf000000-0000-4000-8000-000000000001','Rehearsal A'),('cf000000-0000-4000-8000-000000000002','Rehearsal B');
insert into public.plans(id,owner_id,title,starts_at,ends_at,time_zone,place_label,categories) values
 ('cf100000-0000-4000-8000-000000000001','cf000000-0000-4000-8000-000000000001','Rehearsal supper',
  now()+interval '1 day',now()+interval '1 day 2 hours','UTC','Kitchen',array['community']);
insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id,detail) values
 ('cf100000-0000-4000-8000-000000000001','cf000000-0000-4000-8000-000000000002','connection_request','cf-rehearsal:going',
  'cf000000-0000-4000-8000-000000000001','going'),
 ('cf100000-0000-4000-8000-000000000001','cf000000-0000-4000-8000-000000000001','connection_request','cf-rehearsal:none',
  'cf000000-0000-4000-8000-000000000002',null),
 ('cf100000-0000-4000-8000-000000000001','cf000000-0000-4000-8000-000000000002','invited','cf-rehearsal:again',
  'cf000000-0000-4000-8000-000000000001','again');
\set cf_rehearsal_rollback `cat :'resbite_repo'/supabase/rollback/20261111120000_connections_follow_ups.rollback.sql`
create temporary table cf_rehearsal_scripts on commit drop as select :'cf_rehearsal_rollback'::text as rollback;
do $$ declare f text; begin
 if coalesce(length(btrim((select rollback from cf_rehearsal_scripts))),0)=0 then raise exception 'The rollback text is empty'; end if;
 foreach f in array array['request_connection(uuid,uuid)','roll_repeating_plans()'] loop
  execute 'alter function private.'||f||' rename to cf_rehearsal_renamed';
  begin
   execute (select rollback from cf_rehearsal_scripts);
   raise exception 'The follow-ups rollback ran with private.% gone', f;
  exception when raise_exception then
   if sqlerrm is distinct from 'Run the connections follow-ups rollback before the connections and creating-a-resbite rollbacks' then raise; end if;
  end;
  execute 'alter function private.cf_rehearsal_renamed'||substring(f from '\(.*\)$')||' rename to '||substring(f from '^[a-z_]+');
 end loop;
 if (select count(*) from private.notification_outbox where dedupe_key like 'cf-rehearsal:%')<>3 then
  raise exception 'The refused rollback changed something';
 end if;
end $$;
\ir ../../rollback/20261111120000_connections_follow_ups.rollback.sql
do $$ begin
 if (select string_agg(dedupe_key,',' order by dedupe_key) from private.notification_outbox where dedupe_key like 'cf-rehearsal:%')
   is distinct from 'cf-rehearsal:again,cf-rehearsal:none' then
  raise exception 'The rollback deleted the wrong notices: %', (select string_agg(dedupe_key,',' order by dedupe_key)
   from private.notification_outbox where dedupe_key like 'cf-rehearsal:%');
 end if;
 if (select pg_catalog.pg_get_constraintdef(oid) from pg_catalog.pg_constraint
   where conrelid='private.notification_outbox'::regclass and conname='notification_outbox_detail_check')
   is distinct from (select definition from private.cf_rehearsal_detail_check) then
  raise exception 'Rollback did not restore the detail check';
 end if;
 if exists(select 1 from private.cf_rehearsal_functions f
   where pg_catalog.pg_get_functiondef(f.signature::regprocedure) is distinct from f.definition
   or (select p.proacl::text from pg_catalog.pg_proc p where p.oid=f.signature::regprocedure) is distinct from f.grants) then
  raise exception 'Rollback did not restore the roll and request_connection with their grants';
 end if;
 if not exists(select 1 from public.plans where id='cf100000-0000-4000-8000-000000000001') then raise exception 'Rollback lost the plan'; end if;
end $$;
rollback;
-- 3. Remove the rehearsal helpers so later tests start clean.
drop table private.cf_rehearsal_detail_check;
drop table private.cf_rehearsal_functions;
