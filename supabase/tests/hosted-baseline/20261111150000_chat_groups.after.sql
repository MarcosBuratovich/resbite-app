-- Rehearsal checks for 20261111150000_chat_groups (hosted-baseline mode only).
-- 1. The backfill (G-B7). Every rolled series is a group, the one-off is not. The three stopped ones have a stop time:
-- (a) and (b) their current occurrence's end (no later than now), (c), cancelled ahead of its date, the time of the
-- migration (its end is ahead). So (a), long finished, comes out closed; (b) is open until its end + 48 hours; (c) is
-- open for 48 hours from the migration. (d) runs on: no stop time, no close time, open. (e) keeps plan 1's close.
do $$ declare v_end timestamptz; begin
 if exists(select 1 from public.chats where series_id in ('e6200000-0000-4000-8000-000000000001','e6200000-0000-4000-8000-000000000003',
   'e6200000-0000-4000-8000-000000000005','e6200000-0000-4000-8000-000000000007') and not is_group)
 or (select is_group from public.chats where series_id='e6200000-0000-4000-8000-000000000009') then
  raise exception 'The backfill did not make every rolled series a group, or made the one-off one';
 end if;
 -- (a) Long finished: closed.
 select ends_at into v_end from public.plans where id='e6200000-0000-4000-8000-000000000002';
 if (select stopped_at from public.chats where series_id='e6200000-0000-4000-8000-000000000001') is distinct from v_end
 or private.chat_open('e6200000-0000-4000-8000-000000000001') is not false
 or private.chat_closes_at('e6200000-0000-4000-8000-000000000001') is distinct from v_end+interval '48 hours' then
  raise exception '(a) is not stopped at its end, or not closed';
 end if;
 -- (b) Stopped by Edit an hour after its end: open until the end + 48 hours.
 select ends_at into v_end from public.plans where id='e6200000-0000-4000-8000-000000000004';
 if (select stopped_at from public.chats where series_id='e6200000-0000-4000-8000-000000000003') is distinct from v_end
 or private.chat_open('e6200000-0000-4000-8000-000000000003') is not true
 or private.chat_closes_at('e6200000-0000-4000-8000-000000000003') is distinct from v_end+interval '48 hours' then
  raise exception '(b) is not stopped at its end, or does not close 48 hours after it';
 end if;
 -- (c) Cancelled ahead of its date: open for 48 hours from the migration.
 if abs(extract(epoch from (select stopped_at from public.chats where series_id='e6200000-0000-4000-8000-000000000005')-now()))>=60
 or private.chat_open('e6200000-0000-4000-8000-000000000005') is not true
 or abs(extract(epoch from private.chat_closes_at('e6200000-0000-4000-8000-000000000005')-(now()+interval '48 hours')))>=60 then
  raise exception '(c) is not stopped at the migration, or does not close 48 hours after it';
 end if;
 -- (d) Running; (e) a one-off.
 if (select stopped_at from public.chats where series_id='e6200000-0000-4000-8000-000000000007') is not null
 or private.group_stopped('e6200000-0000-4000-8000-000000000007') or private.chat_closes_at('e6200000-0000-4000-8000-000000000007') is not null
 or private.chat_open('e6200000-0000-4000-8000-000000000007') is not true then
  raise exception '(d) is not running';
 end if;
 if (select stopped_at from public.chats where series_id='e6200000-0000-4000-8000-000000000009') is not null
 or private.chat_closes_at('e6200000-0000-4000-8000-000000000009') is distinct from
  (select ends_at+interval '48 hours' from public.plans where id='e6200000-0000-4000-8000-000000000009')
 or private.chat_open('e6200000-0000-4000-8000-000000000009') is not true then
  raise exception '(e) does not keep plan 1''s close';
 end if;
end $$;

-- 2. The objects (K-S5). chats.stopped_at is a nullable timestamptz. series_leaves has RLS on, no policy and no
-- privilege for any role. The two triggers are on their tables. Every function this file makes or redefines is a
-- security definer with an empty search path: series_is_group and leave_series (both) only authenticated may call; the
-- others nobody but the database, and the eleven redefined ones keep their grants and no longer read as before.
do $$ declare r text; p text; f text; begin
 if (select format_type(a.atttypid,a.atttypmod)||' '||a.attnotnull::text from pg_catalog.pg_attribute a
   where a.attrelid='public.chats'::regclass and a.attname='stopped_at' and not a.attisdropped) is distinct from 'timestamp with time zone false' then
  raise exception 'chats.stopped_at is not a nullable timestamptz';
 end if;
 if pg_catalog.to_regclass('private.series_leaves') is null
 or not (select relrowsecurity from pg_catalog.pg_class where oid='private.series_leaves'::regclass)
 or exists(select 1 from pg_catalog.pg_policy where polrelid='private.series_leaves'::regclass) then
  raise exception 'series_leaves is missing, has no RLS, or has a policy';
 end if;
 foreach r in array array['public','anon','authenticated','service_role'] loop
  foreach p in array array['select','insert','update','delete'] loop
   if has_table_privilege(r,'private.series_leaves',p) then raise exception '% has % on series_leaves', r, p; end if;
  end loop;
 end loop;
 if (select count(*) from pg_catalog.pg_trigger where (tgname,tgrelid,tgfoid) in (('plans_group_flag','public.plans'::regclass,'private.plans_group_flag()'::regprocedure),
   ('attendees_clear_leave','public.attendees'::regclass,'private.attendees_clear_leave()'::regprocedure)))<>2 then
  raise exception 'A group trigger is missing';
 end if;
 foreach f in array array['private.series_is_group(uuid)','private.group_stopped(uuid)','private.chat_hide_line(bigint)','private.plans_group_flag()',
   'private.attendees_clear_leave()','private.leave_series(uuid)','private.chat_place_hidden(uuid,uuid)']
   ||array(select signature from private.ch2_rehearsal_functions) loop
  if not (select p.prosecdef and p.proconfig=array['search_path=""'] from pg_catalog.pg_proc p where p.oid=f::regprocedure) then
   raise exception '% is not a security definer with an empty search path', f;
  end if;
 end loop;
 foreach f in array array['private.series_is_group(uuid)','public.series_is_group(uuid)','private.leave_series(uuid)','public.leave_series(uuid)'] loop
  foreach r in array array['public','anon','service_role'] loop
   if has_function_privilege(r,f,'execute') then raise exception '% may execute %', r, f; end if;
  end loop;
  if not has_function_privilege('authenticated',f,'execute') then raise exception 'authenticated may not execute %', f; end if;
 end loop;
 foreach f in array array['private.group_stopped(uuid)','private.chat_hide_line(bigint)','private.plans_group_flag()','private.attendees_clear_leave()',
   'private.chat_place_hidden(uuid,uuid)'] loop
  foreach r in array array['public','anon','authenticated','service_role'] loop
   if has_function_privilege(r,f,'execute') then raise exception '% may execute %', r, f; end if;
  end loop;
 end loop;
 if exists(select 1 from private.ch2_rehearsal_functions x join pg_catalog.pg_proc p on p.oid=x.signature::regprocedure
   where p.proacl::text is distinct from x.grants or pg_catalog.pg_get_functiondef(p.oid)=x.definition) then
  raise exception 'A redefined function changed its grants, or kept chat core''s body: %', (select string_agg(x.signature,', ')
   from private.ch2_rehearsal_functions x join pg_catalog.pg_proc p on p.oid=x.signature::regprocedure
   where p.proacl::text is distinct from x.grants or pg_catalog.pg_get_functiondef(p.oid)=x.definition);
 end if;
end $$;

-- 3. The rollback, rehearsed and undone (G-N11; the plan's Task 2, Step 5), in a transaction that ends in rollback, as
-- 20261110120000_connections.after.sql does. A leave stands for every leave record; the backfill's stop times and group
-- flags are there already. The guard first: while chat plan 3 is applied (a private.blocks table stands in), it refuses
-- with its message and changes nothing. Then it runs. Each body it restores is what .before.sql recorded
-- (pg_get_functiondef, with the same grants), and running that body's statement from its source migration again, as
-- create or replace (chat core made most of its bodies with create function), changes nothing. The leave record, the
-- stop time, the two triggers and the new functions are gone, and the flag stays, false on every chats row. Then the
-- guarded chain runs on (chat core's rollback, lines 34-42): chat core's rollback, whose guard refused while
-- series_leaves existed, then the circles and the connections follow-ups rollbacks; the last checks that the
-- follow-ups' roll and request_connection are its own again (pg_proc.prosrc md5), which this file's restored
-- request_connection must be.
begin;
create function pg_temp.ch2_source(p_text text, p_from text, p_to text) returns text language plpgsql immutable as $fn$
declare v_start integer := position(p_from in p_text); v_len integer;
begin
 if v_start=0 then raise exception 'Not in the source: %', p_from; end if;
 v_len := position(p_to in substring(p_text from v_start));
 if v_len=0 then raise exception 'No % after %', p_to, p_from; end if;
 return regexp_replace(substring(p_text from v_start for v_len+length(p_to)-1),'^create function ','create or replace function ');
end $fn$;
\set ch2_rollback `cat :'resbite_repo'/supabase/rollback/20261111150000_chat_groups.rollback.sql`
\set ch2_core_rollback `cat :'resbite_repo'/supabase/rollback/20261111140000_chat_core.rollback.sql`
\set ch2_circles_rollback `cat :'resbite_repo'/supabase/rollback/20261111130000_circles_of_trust.rollback.sql`
\set ch2_follow_ups_rollback `cat :'resbite_repo'/supabase/rollback/20261111120000_connections_follow_ups.rollback.sql`
\set ch2_core `cat :'resbite_repo'/supabase/migrations/20261111140000_chat_core.sql`
\set ch2_creating `cat :'resbite_repo'/supabase/migrations/20261031120000_creating_a_resbite.sql`
\set ch2_follow_ups `cat :'resbite_repo'/supabase/migrations/20261111120000_connections_follow_ups.sql`
\set ch2_circles `cat :'resbite_repo'/supabase/migrations/20261111130000_circles_of_trust.sql`
create temporary table ch2_texts on commit drop as select :'ch2_rollback'::text as rollback, :'ch2_core_rollback'::text as core_rollback,
 :'ch2_circles_rollback'::text as circles_rollback, :'ch2_follow_ups_rollback'::text as follow_ups_rollback;
-- Each restored body's statement in its source migration.
create temporary table ch2_sources on commit drop as select x.signature, x.source from (values
 ('private.chat_member(uuid,uuid)',pg_temp.ch2_source(:'ch2_core','create function private.chat_member(','$$;')),
 ('private.chat_closes_at(uuid)',pg_temp.ch2_source(:'ch2_core','create function private.chat_closes_at(','$$;')),
 ('private.chat_open(uuid)',pg_temp.ch2_source(:'ch2_core','create function private.chat_open(','$$;')),
 ('private.chat_summary(uuid)',pg_temp.ch2_source(:'ch2_core','create function private.chat_summary(','$$;')),
 ('private.attendees_chat_lines()',pg_temp.ch2_source(:'ch2_core','create function private.attendees_chat_lines(','$$;')),
 ('private.plans_chat_lines()',pg_temp.ch2_source(:'ch2_core','create function private.plans_chat_lines(','$$;')),
 ('private.notification_recipient_eligible(bigint)',pg_temp.ch2_source(:'ch2_core','create or replace function private.notification_recipient_eligible(','$$;')),
 ('private.chat_row(public.messages,uuid)',pg_temp.ch2_source(:'ch2_core','create function private.chat_row(','$$;')),
 ('private.can_see_guests(uuid)',pg_temp.ch2_source(:'ch2_creating','create or replace function private.can_see_guests(','$$;')),
 ('private.request_connection(uuid,uuid)',pg_temp.ch2_source(:'ch2_follow_ups','create or replace function private.request_connection(','$$;')),
 ('private.roll_repeating_plans()',pg_temp.ch2_source(:'ch2_circles','create or replace function private.roll_repeating_plans(','$$;'))) x(signature,source);
insert into private.series_leaves(series_id,user_id) values ('e6200000-0000-4000-8000-000000000007','e6000000-0000-4000-8000-0000000000a1');
do $$ begin
 if coalesce(length(btrim((select rollback from ch2_texts))),0)=0 then raise exception 'The rollback text is empty'; end if;
 if (select count(*) from ch2_sources s join private.ch2_rehearsal_functions f using (signature) where s.source like 'create or replace function %')<>11 then
  raise exception 'A body to restore, or its source, is missing';
 end if;
 if not exists(select 1 from public.chats where is_group) or not exists(select 1 from public.chats where stopped_at is not null) then
  raise exception 'The rehearsal has no group, or no stop time';
 end if;
 create table private.blocks(id integer);
 begin
  execute (select rollback from ch2_texts);
  raise exception 'The chat groups rollback ran while chat plan 3 is applied';
 exception when raise_exception then
  if sqlerrm is distinct from 'Run the chat safety rollback before the chat groups rollback' then raise; end if;
 end;
 drop table private.blocks;
 if pg_catalog.to_regclass('private.series_leaves') is null or not exists(select 1 from private.series_leaves)
 or not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.chats'::regclass and attname='stopped_at' and not attisdropped)
 or (select count(*) from pg_catalog.pg_trigger where tgname in ('plans_group_flag','attendees_clear_leave'))<>2
 or pg_catalog.to_regprocedure('private.chat_place_hidden(uuid,uuid)') is null or pg_catalog.to_regprocedure('public.leave_series(uuid)') is null
 or not exists(select 1 from public.chats where is_group)
 or exists(select 1 from private.ch2_rehearsal_functions f where pg_catalog.pg_get_functiondef(f.signature::regprocedure)=f.definition) then
  raise exception 'A refusal changed something';
 end if;
end $$;
\ir ../../rollback/20261111150000_chat_groups.rollback.sql
do $$ declare f record; v_def text; begin
 for f in select x.signature, x.definition, x.grants, s.source from private.ch2_rehearsal_functions x join ch2_sources s using (signature) loop
  v_def := pg_catalog.pg_get_functiondef(f.signature::regprocedure);
  if v_def is distinct from f.definition then raise exception 'The rollback did not restore % as it was before the migration', f.signature; end if;
  if (select p.proacl::text from pg_catalog.pg_proc p where p.oid=f.signature::regprocedure) is distinct from f.grants then
   raise exception 'The rollback changed the grants of %', f.signature;
  end if;
  execute f.source;
  if pg_catalog.pg_get_functiondef(f.signature::regprocedure) is distinct from v_def then
   raise exception 'The rollback did not restore % as its source migration has it', f.signature;
  end if;
 end loop;
 if pg_catalog.to_regclass('private.series_leaves') is not null
 or exists(select 1 from pg_catalog.pg_attribute where attrelid='public.chats'::regclass and attname='stopped_at' and not attisdropped) then
  raise exception 'The rollback left the leave record or the stop time';
 end if;
 if exists(select 1 from pg_catalog.pg_trigger where tgname in ('plans_group_flag','attendees_clear_leave')) then
  raise exception 'The rollback left a group trigger';
 end if;
 if exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')
   and p.proname in ('leave_series','series_is_group','group_stopped','chat_hide_line','chat_place_hidden','plans_group_flag','attendees_clear_leave')) then
  raise exception 'The rollback left a function: %', (select string_agg(n.nspname||'.'||p.proname,', ') from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')
   and p.proname in ('leave_series','series_is_group','group_stopped','chat_hide_line','chat_place_hidden','plans_group_flag','attendees_clear_leave'));
 end if;
 if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.chats'::regclass and attname='is_group' and not attisdropped)
 or exists(select 1 from public.chats where is_group) or not exists(select 1 from public.chats) then
  raise exception 'The rollback dropped the group flag, or left one true';
 end if;
 -- The chain runs on: chat core's rollback (its guard refused while series_leaves existed), circles', the follow-ups'.
 begin
  execute (select core_rollback from ch2_texts);
 exception when raise_exception then
  raise exception 'The chat core rollback refused after the chat groups rollback: %', sqlerrm;
 end;
 if pg_catalog.to_regclass('public.messages') is not null then raise exception 'The chat core rollback did not run'; end if;
 begin
  execute (select circles_rollback from ch2_texts);
  execute (select follow_ups_rollback from ch2_texts);
 exception when raise_exception then
  raise exception 'The rollbacks after chat core''s refused: %', sqlerrm;
 end;
 if pg_catalog.to_regclass('private.plan_removals') is not null or pg_catalog.to_regprocedure('private.pair_standing(uuid,uuid,uuid)') is not null then
  raise exception 'The circles or the follow-ups rollback did not run';
 end if;
end $$;
rollback;

-- 4. Remove the rehearsal's rows and records so later tests start clean: the chats rows by series (chats has no key to
-- plans), any leave of those series, the plans, the owner (its live grant goes with the account) and the record.
delete from public.chats where series_id in ('e6200000-0000-4000-8000-000000000001','e6200000-0000-4000-8000-000000000003',
 'e6200000-0000-4000-8000-000000000005','e6200000-0000-4000-8000-000000000007','e6200000-0000-4000-8000-000000000009');
delete from private.series_leaves where series_id in ('e6200000-0000-4000-8000-000000000001','e6200000-0000-4000-8000-000000000003',
 'e6200000-0000-4000-8000-000000000005','e6200000-0000-4000-8000-000000000007','e6200000-0000-4000-8000-000000000009');
delete from public.plans where id::text like 'e6200000-0000-4000-8000-00000000000_';
delete from private.beta_access where user_id='e6000000-0000-4000-8000-0000000000a1';
delete from public.profiles where id='e6000000-0000-4000-8000-0000000000a1';
delete from auth.users where id='e6000000-0000-4000-8000-0000000000a1';
drop table private.ch2_rehearsal_functions;
