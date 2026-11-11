-- Rehearsal for 20261111140000_chat_core (hosted-baseline mode only); .after.sql removes everything here. Task 3
-- completes both files (the Realtime checks against the stub, the function grants, the rollback).
-- 1. A one-off and a weekly series of two occurrences from before the migration, so .after.sql sees the backfill give
-- each series one chat row (no roster row: the harness checks the roster is empty at the end).
insert into auth.users(id) values ('c4000000-0000-4000-8000-000000000001');
insert into public.profiles(id,display_name) values ('c4000000-0000-4000-8000-000000000001','Rehearsal host');
insert into public.plans(id,owner_id,title,starts_at,ends_at,time_zone,place_label,categories,repeat_weeks) values
 ('c4100000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','Rehearsal dinner',
  '2099-10-01 19:00+00','2099-10-01 22:00+00','UTC','Kitchen',array['community'],null),
 ('c4100000-0000-4000-8000-000000000002','c4000000-0000-4000-8000-000000000001','Rehearsal run',
  '2099-10-02 07:00+00','2099-10-02 08:00+00','UTC','Park',array['physical'],1);
insert into public.plans(id,owner_id,title,starts_at,ends_at,time_zone,place_label,categories,repeat_weeks,series_id,repeats_from) values
 ('c4100000-0000-4000-8000-000000000003','c4000000-0000-4000-8000-000000000001','Rehearsal run',
  '2099-10-09 07:00+00','2099-10-09 08:00+00','UTC','Park',array['physical'],1,
  'c4100000-0000-4000-8000-000000000002','c4100000-0000-4000-8000-000000000002');

-- 2. The pre-state: the circles migration is applied (the chat's first names are its helper's), and none of the four
-- tables, the new functions or the trigger exists yet.
do $$ begin
 if pg_catalog.to_regprocedure('private.first_name(text)') is null then
  raise exception 'private.first_name is missing: apply 20261111130000_circles_of_trust first';
 end if;
 if exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname in ('messages','chats','chat_reads','chat_mutes')) then
  raise exception 'A chat table exists before the migration';
 end if;
 if exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')
   and p.proname in ('current_occurrence','chat_member','chat_members','chat_closes_at','chat_open','chat_is_group','announcement_audience',
    'chat_first_name','chat_row','chat_names','messages_touch','plans_chat_row','chat_summary','chat_messages','chat_messages_since',
    'my_chat_overview')) then
  raise exception 'A chat function exists before the migration';
 end if;
 if exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.plans'::regclass and tgname='plans_chat_row') then
  raise exception 'The chat row trigger exists before the migration';
 end if;
end $$;
