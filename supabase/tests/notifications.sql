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
