-- Rehearsal checks for 20261111140000_chat_core (hosted-baseline mode only). Task 3 adds the Realtime policy, the
-- function grants and the rollback.
-- 1. The apply. The backfill gave each series from before the migration one chat row, not a group, with nothing
-- written; the weekly series' second occurrence has no row of its own. The four tables exist with RLS on and no
-- policy, and no API role may select, insert, update or delete on them: the app reads only through functions (K-S5).
do $$ declare t text; r text; p text; begin
 if (select count(*) from public.chats where series_id in ('c4100000-0000-4000-8000-000000000001','c4100000-0000-4000-8000-000000000002'))<>2
 or exists(select 1 from public.chats where series_id='c4100000-0000-4000-8000-000000000003') then
  raise exception 'The backfill did not give each series exactly one chat row';
 end if;
 if exists(select 1 from public.chats where series_id in ('c4100000-0000-4000-8000-000000000001','c4100000-0000-4000-8000-000000000002')
   and (is_group or last_message_id is not null or last_message_at is not null or pinned_message_id is not null or message_count<>0)) then
  raise exception 'A backfilled chat row is a group, or not empty';
 end if;
 foreach t in array array['public.messages','public.chats','public.chat_reads','public.chat_mutes'] loop
  if pg_catalog.to_regclass(t) is null then raise exception '% does not exist', t; end if;
  if not (select relrowsecurity from pg_catalog.pg_class where oid=t::regclass)
  or exists(select 1 from pg_catalog.pg_policy where polrelid=t::regclass) then
   raise exception '% has no RLS, or a policy', t;
  end if;
  foreach r in array array['anon','authenticated','service_role'] loop
   foreach p in array array['select','insert','update','delete'] loop
    if has_table_privilege(r,t,p) then raise exception '% has % on %', r, p, t; end if;
   end loop;
  end loop;
 end loop;
end $$;

-- 2. Remove the rehearsal's rows so later tests start clean.
delete from public.chats where series_id in ('c4100000-0000-4000-8000-000000000001','c4100000-0000-4000-8000-000000000002');
delete from public.plans where id in ('c4100000-0000-4000-8000-000000000001','c4100000-0000-4000-8000-000000000002',
 'c4100000-0000-4000-8000-000000000003');
delete from public.profiles where id='c4000000-0000-4000-8000-000000000001';
delete from auth.users where id='c4000000-0000-4000-8000-000000000001';
