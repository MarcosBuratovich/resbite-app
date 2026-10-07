-- Claiming an invitation notifies the organizer, not the claimer. Synthetic identities only; every change rolls back.
begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('a5000000-0000-4000-8000-000000000001','cn-owner@resbite-test.invalid',now(),'{}'),
 ('a5000000-0000-4000-8000-000000000002','cn-invitee@resbite-test.invalid',now(),'{}');
insert into private.tester_roster(email) values
 ('cn-owner@resbite-test.invalid'),('cn-invitee@resbite-test.invalid');

-- Privileges are unchanged: signed-in testers only.
do $$ begin
 if has_function_privilege('anon','public.claim_invite(text)','execute') then raise exception 'anon can execute claim_invite'; end if;
 if not has_function_privilege('authenticated','public.claim_invite(text)','execute') then raise exception 'authenticated cannot execute claim_invite'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a5000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.save_profile('Owner');
select public.create_plan_v2('a5100000-0000-4000-8000-000000000001','Claim fixture','',array['community'],null,now()+interval '1 day','UTC','Park','');
select public.create_invite('a5200000-0000-4000-8000-000000000001','a5100000-0000-4000-8000-000000000001',repeat('e',64));
-- An owner cannot claim their own invitation.
do $$ begin
 begin perform public.claim_invite(repeat('e',64)); raise exception 'Owner claimed own invitation'; exception when invalid_parameter_value then null; end;
end $$;

select set_config('request.jwt.claims','{"sub":"a5000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.save_profile('Invitee');
do $$ begin
 if public.claim_invite(repeat('e',64))<>'a5100000-0000-4000-8000-000000000001' then raise exception 'Claim returned the wrong plan'; end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from private.notification_outbox where kind='invitation' and dedupe_key='invite:a5200000-0000-4000-8000-000000000001')<>1 then raise exception 'Expected exactly one invitation notification'; end if;
 if not exists(select 1 from private.notification_outbox where dedupe_key='invite:a5200000-0000-4000-8000-000000000001' and plan_id='a5100000-0000-4000-8000-000000000001' and recipient_id='a5000000-0000-4000-8000-000000000001') then raise exception 'Organizer not notified of the claim'; end if;
 if exists(select 1 from private.notification_outbox where plan_id='a5100000-0000-4000-8000-000000000001' and recipient_id='a5000000-0000-4000-8000-000000000002') then raise exception 'Claimer notified of own claim'; end if;
 if not exists(select 1 from public.attendees where plan_id='a5100000-0000-4000-8000-000000000001' and user_id='a5000000-0000-4000-8000-000000000002') then raise exception 'Attendee row missing'; end if;
end $$;

-- Claiming again returns the plan and adds nothing.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a5000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if public.claim_invite(repeat('e',64))<>'a5100000-0000-4000-8000-000000000001' then raise exception 'Repeat claim returned the wrong plan'; end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from private.notification_outbox where plan_id='a5100000-0000-4000-8000-000000000001' and kind='invitation')<>1 then raise exception 'Repeat claim added a notification'; end if;
 if (select count(*) from public.attendees where plan_id='a5100000-0000-4000-8000-000000000001' and user_id='a5000000-0000-4000-8000-000000000002')<>1 then raise exception 'Repeat claim changed attendees'; end if;
end $$;
rollback;
