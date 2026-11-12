-- Rehearsal for 20261111140000_chat_core (hosted-baseline mode only); .after.sql removes everything here.
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

-- 2. Realtime, as the runbook's before-check asserts it on the hosted project (K-S5), here against the stub
-- (supabase/tests/local/bootstrap.sql): realtime.send(jsonb,text,text,boolean) resolves, realtime.messages has the
-- columns extension and topic, and no policy exists in the realtime schema yet.
do $$ begin
 if pg_catalog.to_regprocedure('realtime.send(jsonb,text,text,boolean)') is null then
  raise exception 'realtime.send(jsonb,text,text,boolean) does not resolve';
 end if;
 if (select count(*) from information_schema.columns where table_schema='realtime' and table_name='messages'
   and column_name in ('extension','topic'))<>2 then
  raise exception 'realtime.messages has no extension or no topic column';
 end if;
 if exists(select 1 from pg_catalog.pg_policies where schemaname='realtime') then
  raise exception 'A policy exists in the realtime schema before the migration';
 end if;
end $$;

-- 3. What the migration changes and the rollback puts back, as it stands, so .after.sql can prove the apply keeps the
-- grants and the rollback restores each exactly: the three functions it redefines that exist on the hosted project
-- (request_account_deletion does not: the deletion lifecycle is local-only), with their grants; the outbox's kind check,
-- columns and indexes; and the triggers of the three tables the chat's line triggers go on.
create table private.ch1_rehearsal_functions as
 select f as signature, pg_catalog.pg_get_functiondef(f::regprocedure) as definition,
  (select p.proacl::text from pg_catalog.pg_proc p where p.oid=f::regprocedure) as grants
 from unnest(array['private.notification_recipient_eligible(bigint)','public.claim_notification_deliveries(integer)',
  'public.finish_notification_delivery(uuid,uuid,text,text,integer)']) f;
alter table private.ch1_rehearsal_functions enable row level security;
create table private.ch1_rehearsal_outbox as
 select (select pg_catalog.pg_get_constraintdef(c.oid) from pg_catalog.pg_constraint c
   where c.conrelid='private.notification_outbox'::regclass and c.conname='notification_outbox_kind_check') as kind_check,
  (select string_agg(a.attname||' '||pg_catalog.format_type(a.atttypid,a.atttypmod),',' order by a.attnum) from pg_catalog.pg_attribute a
   where a.attrelid='private.notification_outbox'::regclass and a.attnum>0 and not a.attisdropped) as columns,
  (select string_agg(i.indexdef,' | ' order by i.indexname) from pg_catalog.pg_indexes i
   where i.schemaname='private' and i.tablename='notification_outbox') as indexes;
alter table private.ch1_rehearsal_outbox enable row level security;
create table private.ch1_rehearsal_triggers as
 select t.tgrelid::regclass::text as tbl, t.tgname, pg_catalog.pg_get_triggerdef(t.oid) as definition from pg_catalog.pg_trigger t
 where t.tgrelid in ('public.plans'::regclass,'public.attendees'::regclass,'public.plan_admins'::regclass) and not t.tgisinternal;
alter table private.ch1_rehearsal_triggers enable row level security;

-- 4. The pre-state: the circles migration is applied (the chat's first names are its helper's, the claim names a
-- bringer), the outcome is push_delivery's (no 'deferred'), the notice audience is connections' (no chat kinds), and
-- none of the four tables, the new functions or the chat's triggers exist yet; request_account_deletion does not exist.
do $$ begin
 if pg_catalog.to_regprocedure('private.first_name(text)') is null then
  raise exception 'private.first_name is missing: apply 20261111130000_circles_of_trust first';
 end if;
 if (select count(*) from private.ch1_rehearsal_functions where definition is not null and grants is not null)<>3 then
  raise exception 'A function to redefine is missing';
 end if;
 if (select definition from private.ch1_rehearsal_functions where signature='public.claim_notification_deliveries(integer)') not like '%brought_by_name%'
 or (select definition from private.ch1_rehearsal_functions where signature='public.finish_notification_delivery(uuid,uuid,text,text,integer)') like '%deferred%'
 or (select definition from private.ch1_rehearsal_functions where signature='private.notification_recipient_eligible(bigint)') not like '%connection_request%'
 or (select definition from private.ch1_rehearsal_functions where signature='private.notification_recipient_eligible(bigint)') like '%chat_message%' then
  raise exception 'The claim is not the circles one, the outcome not push_delivery''s, or the notice audience not connections''';
 end if;
 if (select kind_check from private.ch1_rehearsal_outbox) like '%chat_message%'
 or (select columns from private.ch1_rehearsal_outbox) like '%message_id%' then
  raise exception 'The outbox already knows chat';
 end if;
 if exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname in ('messages','chats','chat_reads','chat_mutes')) then
  raise exception 'A chat table exists before the migration';
 end if;
 if exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')
   and p.proname in ('current_occurrence','chat_member','chat_members','chat_closes_at','chat_open','chat_is_group','announcement_audience',
    'chat_first_name','chat_row','chat_names','messages_touch','plans_chat_row','chat_summary','chat_messages','chat_messages_since',
    'my_chat_overview','messages_chat_stats','chat_body','send_message','send_announcement','delete_message','remove_message','mark_chat_read',
    'set_chat_mute','chat_system_line','chat_lines_off','attendees_chat_lines','plans_chat_lines','plan_admins_chat_lines','messages_signal',
    'can_listen')) then
  raise exception 'A chat function exists before the migration';
 end if;
 if exists(select 1 from private.ch1_rehearsal_triggers where tgname in ('plans_chat_row','plans_chat_lines','attendees_chat_lines','plan_admins_chat_lines')) then
  raise exception 'A chat trigger exists before the migration';
 end if;
 if pg_catalog.to_regprocedure('private.request_account_deletion(uuid,uuid,uuid,text)') is not null then
  raise exception 'request_account_deletion exists on the hosted baseline';
 end if;
end $$;
