-- Disposable local database only. No provider requests. Always rolls back.
begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
('91000000-0000-4000-8000-000000000001','push1@resbite-test.invalid',now(),'{}'),
('91000000-0000-4000-8000-000000000002','push2@resbite-test.invalid',now(),'{}');
insert into private.tester_roster(email) values('push1@resbite-test.invalid'),('push2@resbite-test.invalid');
insert into public.profiles(id,display_name) values('91000000-0000-4000-8000-000000000001','Synthetic'),('91000000-0000-4000-8000-000000000002','Other');
insert into public.activities(id,title,description,category,artwork_key,source_ids,published,categories) values('push-fixture','Synthetic','Synthetic','Creative','synthetic',array['test'],true,array['creative']);
insert into public.plans(id,owner_id,activity_id,starts_at,time_zone,place_label) values('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','push-fixture',now()+interval '1 day','UTC','Synthetic');
insert into private.device_endpoints(token,user_id,platform) values('ExpoPushToken[synthetic]','91000000-0000-4000-8000-000000000001','ios');
insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key) values('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','rsvp','synthetic-push-1');
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare generation timestamptz; begin
 select updated_at into generation from private.device_endpoints where token='ExpoPushToken[synthetic]';
 perform public.register_device('ExpoPushToken[synthetic]','ios');
 if (select updated_at from private.device_endpoints where token='ExpoPushToken[synthetic]')<>generation then raise exception 'Identical registration changed binding generation';end if;
end $$;
set local role authenticated;
do $$ begin
 begin perform public.claim_notification_deliveries();raise exception 'Authenticated worker invocation allowed';exception when insufficient_privilege then null;end;
 begin perform 1 from private.notification_deliveries;raise exception 'Delivery ledger exposed';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$ declare jobs jsonb; j jsonb; d uuid; lease uuid;begin
 jobs:=public.claim_notification_deliveries();
 if jsonb_array_length(jobs)<>1 then raise exception 'Expected one job';end if;
 j:=jobs->0; d:=(j->>'id')::uuid;lease:=(j->>'lease_id')::uuid;
 if not public.validate_notification_delivery(d,lease) then raise exception 'Valid send fenced';end if;
 if public.claim_notification_deliveries()<>'[]'::jsonb then raise exception 'Duplicate concurrent claim';end if;
 perform public.finish_notification_delivery(d,gen_random_uuid(),'received');
 if (select state from private.notification_deliveries where id=d)<>'sending' then raise exception 'Stale lease mutated delivery';end if;
 perform public.finish_notification_delivery(d,lease,'ticket','synthetic-ticket',900);
 update private.notification_deliveries set next_attempt_at=now() where id=d;
 jobs:=public.claim_notification_deliveries();j:=jobs->0;lease:=(j->>'lease_id')::uuid;
 if j->>'ticket_id'<>'synthetic-ticket' then raise exception 'Ticket lost on retry';end if;
 -- Reassignment fences an already claimed worker and late invalid receipt cannot delete new binding.
 update private.device_endpoints set user_id='91000000-0000-4000-8000-000000000002',updated_at=now()+interval '1 second';
 if public.validate_notification_delivery(d,lease) then raise exception 'Rebound endpoint send allowed';end if;
 perform public.finish_notification_delivery(d,lease,'invalid');
 if not exists(select 1 from private.device_endpoints) then raise exception 'Late receipt deleted new binding';end if;
 if (select delivered_at from private.notification_outbox where dedupe_key='synthetic-push-1') is null then raise exception 'Terminal event not complete';end if;
end $$;
-- Unknown/crashed sends become terminal, do not generate duplicate provider requests.
update private.device_endpoints set user_id='91000000-0000-4000-8000-000000000001',updated_at=clock_timestamp();
insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key) values('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','rsvp','synthetic-push-2');
select public.claim_notification_deliveries();
update private.notification_deliveries set lease_until=now()-interval '1 second' where state='sending';
do $$ begin
 if public.claim_notification_deliveries()<>'[]'::jsonb then raise exception 'Crashed send retried';end if;
 if not exists(select 1 from private.notification_deliveries where state='unknown') then raise exception 'Unknown state not retained';end if;
end $$;
-- Account scoped cleanup, including after deletion requested.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.unregister_device('ExpoPushToken[synthetic]');
reset role;
do $$ begin if not exists(select 1 from private.device_endpoints) then raise exception 'Removed other account endpoint';end if;end $$;
update public.profiles set deletion_requested_at=now() where id='91000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.unregister_device('ExpoPushToken[synthetic]');
reset role;
do $$ begin if exists(select 1 from private.device_endpoints) then raise exception 'Own cleanup failed';end if;end $$;
rollback;
-- UX2: what the sender may say, and the send-time audience (20261014130000_ux2_notification_wording).
begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('95000000-0000-4000-8000-000000000001','ux2w-owner@resbite-test.invalid',now(),'{}'),
 ('95000000-0000-4000-8000-000000000002','ux2w-guest@resbite-test.invalid',now(),'{}');
insert into private.tester_roster(email) values('ux2w-owner@resbite-test.invalid'),('ux2w-guest@resbite-test.invalid');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"95000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.save_profile('Alex');
select public.create_plan_v2('95100000-0000-4000-8000-000000000001','Picnic in the park','Secret description',array['natural'],null,'2099-10-17 09:00+00','Europe/London','Secret café','Secret note');
select public.create_invite('95200000-0000-4000-8000-000000000001','95100000-0000-4000-8000-000000000001',repeat('c',64));
select set_config('request.jwt.claims','{"sub":"95000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.save_profile('Sam');
select public.claim_invite(repeat('c',64));
select public.respond('95100000-0000-4000-8000-000000000001','maybe',1);
reset role;
insert into private.device_endpoints(token,user_id,platform) values('ExpoPushToken[ux2owner]','95000000-0000-4000-8000-000000000001','ios');
do $$ declare jobs jsonb; rsvp jsonb; joined jsonb; begin
 jobs := public.claim_notification_deliveries();
 select j into rsvp from jsonb_array_elements(jobs) j where j->>'kind'='rsvp';
 select j into joined from jsonb_array_elements(jobs) j where j->>'kind'='invitation';
 if rsvp->>'detail'<>'maybe' or rsvp->>'actor_name'<>'Sam' or rsvp->>'title'<>'Picnic in the park'
    or rsvp->>'time_zone'<>'Europe/London' or (rsvp->>'starts_at')::timestamptz<>'2099-10-17 09:00+00' then
  raise exception 'RSVP job lacks wording inputs: %', rsvp;
 end if;
 if joined->>'actor_name'<>'Sam' or joined ? 'detail' and joined->>'detail' is not null then raise exception 'Invitation job wrong: %', joined; end if;
 if jobs::text like '%Secret%' then raise exception 'A job carries the place, note or description'; end if;
 if rsvp ? 'place_label' or rsvp ? 'note' or rsvp ? 'description' or rsvp ? 'cover_description' then raise exception 'A job names a private field'; end if;
end $$;
-- A deleted actor is never named.
insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id,detail)
 values('95100000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001','rsvp','ux2w-deleted','95000000-0000-4000-8000-000000000002','accepted');
update public.profiles set deletion_requested_at=now() where id='95000000-0000-4000-8000-000000000002';
do $$ declare j jsonb; begin
 select x into j from jsonb_array_elements(public.claim_notification_deliveries()) x where x->>'outbox_id'=(select id::text from private.notification_outbox where dedupe_key='ux2w-deleted');
 if j is null or j->>'actor_name' is not null then raise exception 'Deleted actor named or job missing: %', j; end if;
end $$;
update public.profiles set deletion_requested_at=null where id='95000000-0000-4000-8000-000000000002';
-- The send-time audience: a change notice reaches Sam only while Sam may still come.
insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id,detail)
 values('95100000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000002','plan_changed','ux2w-change','95000000-0000-4000-8000-000000000001','time');
do $$ declare o bigint := (select id from private.notification_outbox where dedupe_key='ux2w-change'); begin
 if not private.notification_recipient_eligible(o) then raise exception 'Maybe guest not eligible for a change notice'; end if;
 update public.attendees set response='declined' where user_id='95000000-0000-4000-8000-000000000002';
 if private.notification_recipient_eligible(o) then raise exception 'Declined guest still eligible for a change notice'; end if;
 update public.attendees set response='pending' where user_id='95000000-0000-4000-8000-000000000002';
 if not private.notification_recipient_eligible(o) then raise exception 'Unanswered guest not eligible for a change notice'; end if;
end $$;
-- A cancellation still reaches someone who said Can't make it.
insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id)
 values('95100000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000002','plan_cancelled','ux2w-cancel','95000000-0000-4000-8000-000000000001');
update public.attendees set response='declined' where user_id='95000000-0000-4000-8000-000000000002';
do $$ begin
 if not private.notification_recipient_eligible((select id from private.notification_outbox where dedupe_key='ux2w-cancel')) then raise exception 'Declined guest not told about the cancellation'; end if;
end $$;
rollback;
