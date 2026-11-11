-- Rehearsal for 20261111130000_circles_of_trust (hosted-baseline mode only); .after.sql removes everything here.
-- 1. The nine functions the migration redefines that exist on the hosted project (request_account_deletion does not:
-- the deletion lifecycle is local-only), with their grants, as they stand, so .after.sql can prove the apply keeps
-- the grants and the rollback restores all nine exactly.
create table private.co2_rehearsal_functions as
 select f as signature, pg_catalog.pg_get_functiondef(f::regprocedure) as definition,
  (select p.proacl::text from pg_catalog.pg_proc p where p.oid=f::regprocedure) as grants
 from unnest(array['private.invite_contacts(uuid,jsonb)','private.answer_phone_invitation(text,text,text,text)',
  'private.personal_invitation_page(text)','private.revoke_phone_invitation(uuid,text)','private.plan_phone_invitations(uuid)',
  'private.remove_guest(uuid,uuid)','private.decide_join_request(uuid,uuid,boolean)','private.roll_repeating_plans()',
  'public.claim_notification_deliveries(integer)']) f;
alter table private.co2_rehearsal_functions enable row level security;

-- 2. A resbite, a guest and a host's link from before the migration, so .after.sql sees what the new columns say about
-- existing rows (no roster row: the harness checks the roster is empty at the end).
insert into auth.users(id,phone,phone_confirmed_at) values
 ('c2000000-0000-4000-8000-000000000001','447700900881',now()),
 ('c2000000-0000-4000-8000-000000000002','447700900882',now());
insert into public.profiles(id,display_name) values
 ('c2000000-0000-4000-8000-000000000001','Rehearsal host'),('c2000000-0000-4000-8000-000000000002','Rehearsal guest');
insert into public.plans(id,owner_id,title,starts_at,ends_at,time_zone,place_label,categories) values
 ('c2100000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','Rehearsal games',
  '2099-09-04 19:00+00','2099-09-04 22:00+00','UTC','Kitchen',array['community']);
insert into public.attendees(plan_id,user_id,response) values
 ('c2100000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000002','accepted');
insert into private.phone_invitations(plan_id,phone,country,code_hash,invited_by) values
 ('c2100000-0000-4000-8000-000000000001','447700900883','44',extensions.digest(repeat('R',22),'sha256'),'c2000000-0000-4000-8000-000000000001');

-- 3. The pre-state: no circle, no bringer, no removals, none of the seven new functions; the roll is the follow-ups'
-- (it carries every guest).
do $$ begin
 if (select count(*) from private.co2_rehearsal_functions where definition is not null)<>9 then
  raise exception 'A function to redefine is missing';
 end if;
 if exists(select 1 from pg_catalog.pg_attribute where not attisdropped and (
   (attrelid='public.plans'::regclass and attname in ('bring_invites','bring_levels'))
   or (attrelid='public.attendees'::regclass and attname in ('brought_by','level'))
   or (attrelid='private.phone_invitations'::regclass and attname in ('brought_by','level')))) then
  raise exception 'A circle column exists before the migration';
 end if;
 if pg_catalog.to_regclass('private.plan_removals') is not null then raise exception 'plan_removals exists before the migration'; end if;
 if exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')
   and p.proname in ('set_plan_circle','bring_allowance','my_bring_allowance','plan_bringers','plan_brought_invitations',
    'revoke_brought_invitation','withdraw_brought_invitation')) then
  raise exception 'A new function exists before the migration';
 end if;
 if (select definition from private.co2_rehearsal_functions where signature='private.roll_repeating_plans()') like '%response<>''withdrawn''%' then
  raise exception 'The roll is not the follow-ups one: apply 20261111120000_connections_follow_ups first';
 end if;
end $$;
