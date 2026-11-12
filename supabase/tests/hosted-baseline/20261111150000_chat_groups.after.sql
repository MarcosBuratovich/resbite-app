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
-- security definer with an empty search path: series_is_group (both) only authenticated may call; the others nobody but
-- the database, and the four redefined ones keep chat core's grants and no longer read as chat core's.
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
   'private.attendees_clear_leave()','private.chat_member(uuid,uuid)','private.chat_closes_at(uuid)','private.chat_open(uuid)','private.chat_summary(uuid)'] loop
  if not (select p.prosecdef and p.proconfig=array['search_path=""'] from pg_catalog.pg_proc p where p.oid=f::regprocedure) then
   raise exception '% is not a security definer with an empty search path', f;
  end if;
 end loop;
 foreach f in array array['private.series_is_group(uuid)','public.series_is_group(uuid)'] loop
  foreach r in array array['public','anon','service_role'] loop
   if has_function_privilege(r,f,'execute') then raise exception '% may execute %', r, f; end if;
  end loop;
  if not has_function_privilege('authenticated',f,'execute') then raise exception 'authenticated may not execute %', f; end if;
 end loop;
 foreach f in array array['private.group_stopped(uuid)','private.chat_hide_line(bigint)','private.plans_group_flag()','private.attendees_clear_leave()'] loop
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

-- 3. Remove the rehearsal's rows and records so later tests start clean: the chats rows by series (chats has no key to
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
