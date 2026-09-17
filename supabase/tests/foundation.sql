-- Execute as postgres, only against a disposable/internal-test project. Always rolls back.
begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('10000000-0000-4000-8000-000000000001','owner@resbite-test.invalid',now(),'{}'),
 ('10000000-0000-4000-8000-000000000002','invitee@resbite-test.invalid',now(),'{}'),
 ('10000000-0000-4000-8000-000000000003','outsider@resbite-test.invalid',now(),'{"tester":true}'),
 ('10000000-0000-4000-8000-000000000004','unverified@resbite-test.invalid',null,'{"email_verified":true}'),
 ('10000000-0000-4000-8000-000000000005','other@resbite-test.invalid',now(),'{}');
insert into private.tester_roster(email) values('owner@resbite-test.invalid'),('invitee@resbite-test.invalid'),('unverified@resbite-test.invalid'),('other@resbite-test.invalid');
insert into public.activities values('test-only','Test activity','Synthetic fixture','Creative','test-only',array['test'],true);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 if (select count(*) from public.activities)<>0 then raise exception 'Non-roster catalogue exposed'; end if;
 begin perform public.save_profile('Outsider'); raise exception 'Non-roster mutation allowed'; exception when insufficient_privilege then null; end;
 begin perform 1 from private.tester_roster; raise exception 'Roster exposed'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin
 begin perform public.save_profile('Unverified'); raise exception 'Unverified allowed via metadata'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.save_profile('Owner');
select public.create_plan('20000000-0000-4000-8000-000000000001','test-only',now()+interval '1 day','Europe/London','Park');
-- Idempotent same-payload retry.
select public.create_plan('20000000-0000-4000-8000-000000000001','test-only',now()+interval '1 day','Europe/London','Park');
select public.create_invite('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',repeat('a',64),'invitee@resbite-test.invalid');
select public.create_invite('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001',repeat('b',64));
do $$ begin
 begin update public.plans set owner_id='10000000-0000-4000-8000-000000000002'; raise exception 'Direct plan write allowed'; exception when insufficient_privilege then null; end;
 begin insert into public.attendees(plan_id,user_id) values('20000000-0000-4000-8000-000000000001',auth.uid()); raise exception 'Direct attendee write allowed'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select public.save_profile('Other');
do $$ begin
 if (select count(*) from public.plans)<>0 then raise exception 'Uninvited tester read plan'; end if;
 if (select count(*) from public.profiles)<>1 then raise exception 'Unrelated profile exposed'; end if;
 begin perform public.claim_invite(repeat('a',64)); raise exception 'Email binding bypassed'; exception when insufficient_privilege then null; end;
 begin perform public.respond('20000000-0000-4000-8000-000000000001','accepted',1); raise exception 'Uninvited RSVP allowed'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.save_profile('Invitee');
select public.claim_invite(repeat('a',64));
select public.claim_invite(repeat('a',64));
select public.respond('20000000-0000-4000-8000-000000000001','accepted',1);
select public.respond('20000000-0000-4000-8000-000000000001','accepted',1);
do $$ begin
 if (select count(*) from public.attendees)<>1 then raise exception 'Duplicate claim created attendee'; end if;
 if (select version from public.attendees)<>2 then raise exception 'Retry changed version'; end if;
 if (select count(*) from public.plans)<>1 then raise exception 'Invitee cannot read plan'; end if;
 begin perform public.respond('20000000-0000-4000-8000-000000000001','declined',1); raise exception 'Stale write allowed'; exception when serialization_failure then null; end;
 begin perform public.change_plan('20000000-0000-4000-8000-000000000001',1,now()+interval '2 days','Europe/London','Other','',false); raise exception 'Nonowner edit allowed'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
do $$ begin
 begin perform public.claim_invite(repeat('a',64)); raise exception 'Claimed token forwarded'; exception when insufficient_privilege then null; end;
end $$;
select public.claim_invite(repeat('b',64));
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.revoke_invite('30000000-0000-4000-8000-000000000002');
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
do $$ begin
 if (select count(*) from public.plans)<>0 then raise exception 'Revoked attendee retained read'; end if;
 begin perform public.claim_invite(repeat('b',64)); raise exception 'Revoked token claimed'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.change_plan('20000000-0000-4000-8000-000000000001',1,null,null,null,null,true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 begin perform public.respond('20000000-0000-4000-8000-000000000001','declined',2); raise exception 'Cancelled plan RSVP allowed'; exception when invalid_parameter_value then null; end;
end $$;
reset role;
update public.profiles set deletion_requested_at=now() where id='10000000-0000-4000-8000-000000000002';
set local role authenticated;
do $$ begin
 if (select count(*) from public.plans)<>0 then raise exception 'Deleted user can read'; end if;
 begin perform public.save_profile('Reactivated'); raise exception 'Deleted user reactivated'; exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
 begin perform public.save_profile('Anonymous'); raise exception 'Anon RPC allowed'; exception when insufficient_privilege then null; end;
 begin perform 1 from public.activities; raise exception 'Anon read allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if (select count(*) from private.notification_outbox where kind='rsvp' and plan_id='20000000-0000-4000-8000-000000000001')<>1 then raise exception 'Duplicate RSVP push enqueued'; end if;
end $$;
rollback;
select 'Foundation security and lifecycle assertions passed; fixtures rolled back' as result;
