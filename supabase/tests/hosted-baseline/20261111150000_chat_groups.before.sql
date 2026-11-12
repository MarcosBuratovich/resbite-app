-- Rehearsal for 20261111150000_chat_groups (hosted-baseline mode only), run after chat core's migration (and its own
-- rehearsal); .after.sql removes everything here.
-- 1. Series from before the migration (G-B7), inserted directly, as the hosted project holds them: three rolled series
-- that have stopped, each of two occurrences, the second rolled from the first (series_id and repeats_from set):
--   (a) 'Rehearsal choir' (e62…01, 02): the current occurrence cancelled with its repeat off ("Cancel this and stop
--       repeating"), its end 10 days ago: long finished;
--   (b) 'Rehearsal swim' (e62…03, 04): the current occurrence stopped by Edit (active, its repeat off), its end 1 hour
--       ago;
--   (c) 'Rehearsal chess' (e62…05, 06): the current occurrence cancelled with its repeat off, its start 3 days ahead;
-- and two that have not: (d) 'Rehearsal run' (e62…07, 08), rolled and still weekly; (e) 'Rehearsal lunch' (e62…09), a
-- one-off. Chat core's trigger gives each series its chats row. Their owner may use the app through a live grant
-- (no roster row: the harness checks the roster is empty at the end), so only the stop time decides each close.
insert into auth.users(id,email,email_confirmed_at) values ('e6000000-0000-4000-8000-0000000000a1','g2-rehearsal@resbite-test.invalid',now());
insert into public.profiles(id,display_name) values ('e6000000-0000-4000-8000-0000000000a1','Rehearsal host');
insert into private.beta_access(user_id,source) values ('e6000000-0000-4000-8000-0000000000a1','link');
insert into public.plans(id,owner_id,title,starts_at,ends_at,time_zone,place_label,categories,status,repeat_weeks) values
 ('e6200000-0000-4000-8000-000000000001','e6000000-0000-4000-8000-0000000000a1','Rehearsal choir',
  now()-interval '17 days 2 hours',now()-interval '17 days','UTC','Hall',array['community'],'active',1),
 ('e6200000-0000-4000-8000-000000000003','e6000000-0000-4000-8000-0000000000a1','Rehearsal swim',
  now()-interval '7 days 3 hours',now()-interval '7 days 1 hour','UTC','Pool',array['physical'],'active',1),
 ('e6200000-0000-4000-8000-000000000005','e6000000-0000-4000-8000-0000000000a1','Rehearsal chess',
  now()-interval '4 days 2 hours',now()-interval '4 days','UTC','Club',array['community'],'active',1),
 ('e6200000-0000-4000-8000-000000000007','e6000000-0000-4000-8000-0000000000a1','Rehearsal run',
  now()-interval '6 days 1 hour',now()-interval '6 days','UTC','Park',array['physical'],'active',1),
 ('e6200000-0000-4000-8000-000000000009','e6000000-0000-4000-8000-0000000000a1','Rehearsal lunch',
  now()+interval '2 days',now()+interval '2 days 2 hours','UTC','Cafe',array['community'],'active',null);
insert into public.plans(id,owner_id,title,starts_at,ends_at,time_zone,place_label,categories,status,repeat_weeks,series_id,repeats_from) values
 ('e6200000-0000-4000-8000-000000000002','e6000000-0000-4000-8000-0000000000a1','Rehearsal choir',
  now()-interval '10 days 2 hours',now()-interval '10 days','UTC','Hall',array['community'],'cancelled',null,
  'e6200000-0000-4000-8000-000000000001','e6200000-0000-4000-8000-000000000001'),
 ('e6200000-0000-4000-8000-000000000004','e6000000-0000-4000-8000-0000000000a1','Rehearsal swim',
  now()-interval '3 hours',now()-interval '1 hour','UTC','Pool',array['physical'],'active',null,
  'e6200000-0000-4000-8000-000000000003','e6200000-0000-4000-8000-000000000003'),
 ('e6200000-0000-4000-8000-000000000006','e6000000-0000-4000-8000-0000000000a1','Rehearsal chess',
  now()+interval '3 days',now()+interval '3 days 2 hours','UTC','Club',array['community'],'cancelled',null,
  'e6200000-0000-4000-8000-000000000005','e6200000-0000-4000-8000-000000000005'),
 ('e6200000-0000-4000-8000-000000000008','e6000000-0000-4000-8000-0000000000a1','Rehearsal run',
  now()+interval '1 day',now()+interval '1 day 1 hour','UTC','Park',array['physical'],'active',1,
  'e6200000-0000-4000-8000-000000000007','e6200000-0000-4000-8000-000000000007');

-- 2. What the migration redefines, as it stands, with its grants, so .after.sql can prove the apply keeps each one's
-- grants and the rollback restores each exactly: chat core's nine (section 1's four, then section 2's line triggers,
-- the eligibility, the row and the overview), the creating-a-resbite can_see_guests, the follow-ups request_connection
-- and the circles roll.
create table private.ch2_rehearsal_functions as
 select f as signature, pg_catalog.pg_get_functiondef(f::regprocedure) as definition,
  (select p.proacl::text from pg_catalog.pg_proc p where p.oid=f::regprocedure) as grants
 from unnest(array['private.chat_member(uuid,uuid)','private.chat_closes_at(uuid)','private.chat_open(uuid)','private.chat_summary(uuid)',
  'private.attendees_chat_lines()','private.plans_chat_lines()','private.notification_recipient_eligible(bigint)',
  'private.chat_row(public.messages,uuid)','private.can_see_guests(uuid)','private.request_connection(uuid,uuid)',
  'private.roll_repeating_plans()','private.my_chat_overview()']) f;
alter table private.ch2_rehearsal_functions enable row level security;

-- 3. The pre-state: chat core is applied and this file's objects are not; each series has exactly one chats row, none a
-- group; the summary says stopped false (chat core's body); the owner may use the app.
do $$ begin
 if pg_catalog.to_regclass('public.chats') is null or pg_catalog.to_regprocedure('private.chat_is_group(uuid)') is null then
  raise exception 'Chat core is not applied: apply 20261111140000_chat_core first';
 end if;
 if (select count(*) from private.ch2_rehearsal_functions where definition is not null and grants is not null)<>12 then
  raise exception 'A function to redefine is missing';
 end if;
 if (select definition from private.ch2_rehearsal_functions where signature='private.chat_summary(uuid)') not like '%''stopped'', false,%'
 or (select definition from private.ch2_rehearsal_functions where signature='private.chat_member(uuid,uuid)') like '%series_leaves%' then
  raise exception 'The summary or the membership is not chat core''s';
 end if;
 if pg_catalog.to_regclass('private.series_leaves') is not null
 or exists(select 1 from pg_catalog.pg_attribute where attrelid='public.chats'::regclass and attname='stopped_at' and not attisdropped)
 or exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')
   and p.proname in ('series_is_group','group_stopped','chat_hide_line','plans_group_flag','attendees_clear_leave','leave_series','chat_place_hidden'))
 or exists(select 1 from pg_catalog.pg_trigger where tgname in ('plans_group_flag','attendees_clear_leave')) then
  raise exception 'A chat groups object exists before the migration';
 end if;
 if (select count(*) from public.chats where series_id in ('e6200000-0000-4000-8000-000000000001','e6200000-0000-4000-8000-000000000003',
   'e6200000-0000-4000-8000-000000000005','e6200000-0000-4000-8000-000000000007','e6200000-0000-4000-8000-000000000009') and not is_group)<>5
 or exists(select 1 from public.chats where series_id in ('e6200000-0000-4000-8000-000000000002','e6200000-0000-4000-8000-000000000004',
   'e6200000-0000-4000-8000-000000000006','e6200000-0000-4000-8000-000000000008')) then
  raise exception 'The rehearsal series do not have one chats row each, not a group';
 end if;
 if not private.user_eligible('e6000000-0000-4000-8000-0000000000a1') then
  raise exception 'The rehearsal host may not use the app';
 end if;
end $$;
