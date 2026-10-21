-- GI2 rollback on the full local schema (not on the hosted baseline): the hosted rollback, then its local-only
-- companion, remove every GI2 object and put back the pre-GI2 local definitions and grants. Synthetic identities
-- only (prefix b6); one rolled-back block, so nothing persists.
begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('b6000000-0000-4000-8000-000000000001','gi2-rollback-owner@resbite-test.invalid',now(),'{}'),
 ('b6000000-0000-4000-8000-000000000002','gi2-rollback-guest@resbite-test.invalid',now(),'{}');
insert into auth.sessions(id,user_id,created_at) values ('b6200000-0000-4000-8000-000000000002','b6000000-0000-4000-8000-000000000002',now());
insert into private.tester_roster(email) values ('gi2-rollback-owner@resbite-test.invalid');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b6000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.save_profile('Owner');
create temporary table gi2_rollback_codes(name text primary key, code text);
do $$ begin
 perform public.create_plan_v3('b6100000-0000-4000-8000-000000000001','Quiz night','',array['community'],null,
  '2099-09-01 19:00+00',null,'UTC','The hall','');
 insert into gi2_rollback_codes values('one',public.plan_link('b6100000-0000-4000-8000-000000000001'));
end $$;
-- A link-made guest, approved through the grant.
select set_config('request.jwt.claims','{"sub":"b6000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if public.join_by_link((select code from gi2_rollback_codes where name='one'),'Rollback Guest','2026-10')<>'b6100000-0000-4000-8000-000000000001' then raise exception 'Join returned another plan'; end if;
 if public.account_access_status()->>'status'<>'approved' then raise exception 'Guest not approved after joining'; end if;
end $$;
reset role;
insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key) values
 ('b6100000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000002','plan_changed','gi2-rollback:guest');
-- The GI2 definitions are in place, so the checks after the rollback compare against a real change.
do $$ begin
 if pg_catalog.pg_get_functiondef('private.eligible()'::regprocedure) not like '%user_eligible%'
 or pg_catalog.pg_get_functiondef('private.notification_recipient_eligible(bigint)'::regprocedure) not like '%has_live_grant%'
 or pg_catalog.pg_get_functiondef('private.request_account_deletion(uuid,uuid,uuid,text)'::regprocedure) not like '%has_live_grant%'
 or pg_catalog.pg_get_functiondef('private.prepare_deletion_intent(uuid,uuid,uuid,text,text)'::regprocedure) not like '%has_live_grant%' then
  raise exception 'GI2 definitions not in place';
 end if;
 if has_function_privilege('service_role','public.request_account_deletion(uuid,uuid,uuid,text)','execute') then
  raise exception 'GI2 left service_role on the raw deletion wrapper';
 end if;
 if not private.notification_recipient_eligible((select id from private.notification_outbox where dedupe_key='gi2-rollback:guest')) then
  raise exception 'Grant holder not notified before the rollback';
 end if;
end $$;
\ir ../rollback/20261022120000_gi2_guest_accounts.rollback.sql
\ir ../rollback/20261022120001_gi2_local_delivery_and_deletion.rollback.sql
do $$ declare f text; begin
 -- Every GI2 object is gone.
 if to_regclass('private.beta_access') is not null
    or to_regclass('private.age_attestations') is not null
    or to_regclass('private.link_opens') is not null
    or to_regprocedure('private.has_live_grant(uuid)') is not null
    or to_regprocedure('private.user_eligible(uuid)') is not null
    or to_regprocedure('private.deletion_pending(uuid)') is not null
    or to_regprocedure('private.join_by_link(text,text,text)') is not null
    or to_regprocedure('public.join_by_link(text,text,text)') is not null
    or to_regprocedure('public.note_link_open(text)') is not null then
  raise exception 'Rollback left GI2 objects';
 end if;
 -- The four restored bodies are the pre-GI2 roster-only ones: nothing of GI2 left, the roster join back.
 foreach f in array array['private.eligible()','private.notification_recipient_eligible(bigint)',
  'private.request_account_deletion(uuid,uuid,uuid,text)','private.prepare_deletion_intent(uuid,uuid,uuid,text,text)'] loop
  if pg_catalog.pg_get_functiondef(f::regprocedure) like '%has_live_grant%'
  or pg_catalog.pg_get_functiondef(f::regprocedure) like '%beta_access%'
  or pg_catalog.pg_get_functiondef(f::regprocedure) like '%user_eligible%' then
   raise exception 'Rollback left GI2 in %', f;
  end if;
  if pg_catalog.pg_get_functiondef(f::regprocedure) not like '%join private.tester_roster r on r.email%' then
   raise exception 'Rollback did not restore the roster join in %', f;
  end if;
 end loop;
 -- eligible() is the local deletion-aware body (20260918001316), not the hosted foundation one.
 if pg_catalog.pg_get_functiondef('private.eligible()'::regprocedure) not like '%account_deletion_jobs%' then
  raise exception 'Rollback left the hosted eligible() on the local schema';
 end if;
 -- The grants are the pre-GI2 ones: service_role may call the raw deletion RPC and its wrapper again, and the
 -- deletion functions stay closed to app clients.
 if not has_function_privilege('service_role','public.request_account_deletion(uuid,uuid,uuid,text)','execute')
 or not has_function_privilege('service_role','private.request_account_deletion(uuid,uuid,uuid,text)','execute')
 or not has_function_privilege('service_role','private.prepare_deletion_intent(uuid,uuid,uuid,text,text)','execute') then
  raise exception 'Rollback did not restore service_role''s deletion grants';
 end if;
 if has_function_privilege('authenticated','public.request_account_deletion(uuid,uuid,uuid,text)','execute')
 or has_function_privilege('authenticated','private.request_account_deletion(uuid,uuid,uuid,text)','execute')
 or has_function_privilege('authenticated','private.prepare_deletion_intent(uuid,uuid,uuid,text,text)','execute')
 or has_function_privilege('authenticated','private.notification_recipient_eligible(bigint)','execute')
 or has_function_privilege('anon','public.request_account_deletion(uuid,uuid,uuid,text)','execute') then
  raise exception 'Rollback opened a deletion or delivery function to app clients';
 end if;
 -- The restored bodies behave as before GI2: the link-made guest is neither notified nor able to delete.
 if private.notification_recipient_eligible((select id from private.notification_outbox where dedupe_key='gi2-rollback:guest')) then
  raise exception 'Link-made guest still notified after the rollback';
 end if;
 begin
  perform private.prepare_deletion_intent('b6000000-0000-4000-8000-000000000002','b6200000-0000-4000-8000-000000000002','b6300000-0000-4000-8000-000000000002',repeat('a',64),'fixture-project');
  raise exception 'Link-made guest prepared a deletion after the rollback';
 exception when insufficient_privilege then if sqlerrm<>'Fresh eligible authentication required' then raise; end if; end;
 begin
  perform private.request_account_deletion('b6000000-0000-4000-8000-000000000002','b6200000-0000-4000-8000-000000000002','b6400000-0000-4000-8000-000000000002',repeat('b',64));
  raise exception 'Link-made guest requested a deletion after the rollback';
 exception when insufficient_privilege then if sqlerrm<>'Fresh eligible authentication required' then raise; end if; end;
 -- The guest keeps the profile and the place on the event; the roster is unchanged.
 if (select response from public.attendees where plan_id='b6100000-0000-4000-8000-000000000001' and user_id='b6000000-0000-4000-8000-000000000002') is distinct from 'pending' then
  raise exception 'Rollback lost the guest';
 end if;
 if (select count(*) from private.tester_roster where email like 'gi2-rollback-%')<>1 then raise exception 'Rollback changed the roster'; end if;
end $$;
-- The roster tester is still approved; the link-made guest is not.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b6000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 if public.account_access_status()->>'status'<>'approved' then raise exception 'Roster tester lost access in the rollback'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"b6000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if public.account_access_status()->>'status'='approved' then raise exception 'Link-made guest still approved after the rollback'; end if;
end $$;
reset role;
rollback;
