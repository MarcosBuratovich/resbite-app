-- Rehearsal for 20261111160000_chat_safety (hosted-baseline mode only), run after chat groups' migration (and its own
-- rehearsal); .after.sql removes everything here.
-- 1. A host and a guest (live grants, no roster row: the harness checks the roster is empty at the end) and a one-off of
-- the host's with the guest Going, for the rows .after.sql gives the rollback to take: a block, a report, a moderator,
-- an acceptance, a blocked term and a report_filed notice with a delivery. Chat core's triggers give the plan its chat.
insert into auth.users(id,email,email_confirmed_at) values
 ('e7800000-0000-4000-8000-000000000001','s3-rehearsal-01@resbite-test.invalid',now()),
 ('e7800000-0000-4000-8000-000000000002','s3-rehearsal-02@resbite-test.invalid',now());
insert into public.profiles(id,display_name) values
 ('e7800000-0000-4000-8000-000000000001','Rehearsal host'),('e7800000-0000-4000-8000-000000000002','Rehearsal guest');
insert into private.beta_access(user_id,source) values
 ('e7800000-0000-4000-8000-000000000001','maintainer'),('e7800000-0000-4000-8000-000000000002','maintainer');
insert into public.plans(id,owner_id,title,starts_at,ends_at,time_zone,place_label,categories) values
 ('e7810000-0000-4000-8000-000000000001','e7800000-0000-4000-8000-000000000001','Rehearsal picnic',now()+interval '1 day',
  now()+interval '1 day 2 hours','UTC','Lawn',array['community']);
insert into public.attendees(plan_id,user_id,response) values
 ('e7810000-0000-4000-8000-000000000001','e7800000-0000-4000-8000-000000000002','accepted');

-- 2. What the migration redefines, as it stands, with its grants, so .after.sql can prove the apply keeps each one's
-- grants and the rollback restores each exactly: the fourteen bodies of the plan's Bases table that exist here (the
-- deletion request does not: the deletion lifecycle is local-only, so thirteen), and the outbox's kind check.
create table private.ch3_rehearsal_functions as
 select f as signature, pg_catalog.pg_get_functiondef(f::regprocedure) as definition,
  (select p.proacl::text from pg_catalog.pg_proc p where p.oid=f::regprocedure) as grants
 from unnest(array['private.chat_summary(uuid)','private.request_connection(uuid,uuid)','private.notification_recipient_eligible(bigint)',
  'private.my_chat_overview()','private.chat_messages(uuid,bigint,integer)','private.chat_messages_since(uuid,bigint,timestamp with time zone)',
  'private.send_message(uuid,text,uuid)','private.send_announcement(uuid,text,text,uuid)','public.claim_notification_deliveries(integer)',
  'private.request_account_deletion(uuid,uuid,uuid,text)','private.fold_web_account(uuid,uuid)','private.plan_connection_states(uuid)',
  'private.invite_contacts(uuid,jsonb)','private.contacts_on_resbite(text[])']) f
 where pg_catalog.to_regprocedure(f) is not null;
alter table private.ch3_rehearsal_functions enable row level security;
create table private.ch3_rehearsal_outbox as
 select pg_catalog.pg_get_constraintdef(c.oid) as kind_check from pg_catalog.pg_constraint c
 where c.conrelid='private.notification_outbox'::regclass and c.conname='notification_outbox_kind_check';
alter table private.ch3_rehearsal_outbox enable row level security;

-- 3. The pre-state: chat groups is applied (its leave records exist); every body to redefine is there; none of the six
-- tables exists, nor any function the migration makes; the kind check has chat core's thirteen kinds, no report_filed.
do $$ begin
 if pg_catalog.to_regclass('private.series_leaves') is null then
  raise exception 'Chat groups is not applied: apply 20261111150000_chat_groups first';
 end if;
 if (select count(*) from private.ch3_rehearsal_functions where definition is not null and grants is not null)
  <>(case when pg_catalog.to_regprocedure('private.request_account_deletion(uuid,uuid,uuid,text)') is null then 13 else 14 end) then
  raise exception 'A function to redefine is missing';
 end if;
 if pg_catalog.to_regclass('private.blocks') is not null or pg_catalog.to_regclass('private.reports') is not null
 or pg_catalog.to_regclass('private.moderators') is not null or pg_catalog.to_regclass('private.chat_rules_acceptances') is not null
 or pg_catalog.to_regclass('private.blocked_terms') is not null or pg_catalog.to_regclass('private.suspensions') is not null then
  raise exception 'A chat safety table exists before the migration';
 end if;
 if exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')
   and p.proname in ('block_user','my_blocks','report_message','report_user','accept_chat_rules','chat_rules_version','report_keep_days',
    'invited_by','inviter_of')) then
  raise exception 'A chat safety function exists before the migration';
 end if;
 if (select count(*) from private.ch3_rehearsal_outbox)<>1 or (select kind_check from private.ch3_rehearsal_outbox) like '%report_filed%'
 or (select kind_check from private.ch3_rehearsal_outbox) not like '%''announcement''::text%' then
  raise exception 'The outbox''s kind check is not chat core''s';
 end if;
end $$;
