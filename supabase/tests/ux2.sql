-- UX2 rules (docs/superpowers/specs/2026-10-14-ux2-design.md). Synthetic identities only.
-- One rolled-back block per slice; each block uses its own UUID prefix family.

-- Block 1: Maybe and the notification record (Task 1).
begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('e1000000-0000-4000-8000-000000000001','ux2-1-owner@resbite-test.invalid',now(),'{}'),
 ('e1000000-0000-4000-8000-000000000002','ux2-1-guest@resbite-test.invalid',now(),'{}'),
 ('e1000000-0000-4000-8000-000000000003','ux2-1-actor@resbite-test.invalid',now(),'{}');
insert into private.tester_roster(email) values
 ('ux2-1-owner@resbite-test.invalid'),('ux2-1-guest@resbite-test.invalid'),('ux2-1-actor@resbite-test.invalid');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.save_profile('Owner one');
select public.create_plan_v2('e1100000-0000-4000-8000-000000000001','Maybe fixture','',array['community'],null,'2099-06-01 10:00+00','UTC','Park','');
select public.create_invite('e1200000-0000-4000-8000-000000000001','e1100000-0000-4000-8000-000000000001',repeat('1',64));
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.save_profile('Sam');
select public.claim_invite(repeat('1',64));
do $$ begin
 -- Maybe is an answer; the version rules are unchanged.
 if public.respond('e1100000-0000-4000-8000-000000000001','maybe',1)<>2 then raise exception 'Maybe not saved as version 2'; end if;
 if public.respond('e1100000-0000-4000-8000-000000000001','maybe',1)<>2 then raise exception 'Lost-reply retry of Maybe not acknowledged'; end if;
 begin perform public.respond('e1100000-0000-4000-8000-000000000001','accepted',1); raise exception 'Stale answer accepted'; exception when serialization_failure then null; end;
 begin perform public.respond('e1100000-0000-4000-8000-000000000001','pending',2); raise exception 'Pending accepted as an answer'; exception when invalid_parameter_value then null; end;
 begin perform public.respond('e1100000-0000-4000-8000-000000000001','perhaps',2); raise exception 'Unknown answer accepted'; exception when invalid_parameter_value then null; end;
 if public.respond('e1100000-0000-4000-8000-000000000001','accepted',2)<>3 then raise exception 'Maybe to Going failed'; end if;
 if public.respond('e1100000-0000-4000-8000-000000000001','withdrawn',3)<>4 then raise exception 'Going to withdrawn failed'; end if;
end $$;
reset role;
do $$ begin
 if (select response from public.attendees where plan_id='e1100000-0000-4000-8000-000000000001')<>'withdrawn' then raise exception 'Answer not stored'; end if;
 -- Each answer notifies the organizer and records who answered and what.
 if (select string_agg(detail,',' order by id) from private.notification_outbox
     where plan_id='e1100000-0000-4000-8000-000000000001' and kind='rsvp'
       and recipient_id='e1000000-0000-4000-8000-000000000001'
       and actor_id='e1000000-0000-4000-8000-000000000002')<>'maybe,accepted,withdrawn' then
  raise exception 'RSVP notices do not record actor and answer';
 end if;
 -- A claim records the person claiming.
 if not exists(select 1 from private.notification_outbox where plan_id='e1100000-0000-4000-8000-000000000001'
   and kind='invitation' and actor_id='e1000000-0000-4000-8000-000000000002' and detail is null) then
  raise exception 'Claim notice does not record the claimer';
 end if;
 -- The detail must fit the kind.
 begin
  insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,detail)
  values('e1100000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','rsvp','ux2-bad-1','time');
  raise exception 'RSVP notice accepted a change detail';
 exception when check_violation then null; end;
 begin
  insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,detail)
  values('e1100000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','plan_cancelled','ux2-bad-2','time');
  raise exception 'Cancel notice accepted a detail';
 exception when check_violation then null; end;
 -- Rows without actor or detail (as queued before UX2) stay valid.
 insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key)
 values('e1100000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','rsvp','ux2-legacy-1');
 -- Removing the actor's profile keeps the notice and forgets the actor.
 insert into public.profiles(id,display_name) values('e1000000-0000-4000-8000-000000000003','Actor');
 insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id,detail)
 values('e1100000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','rsvp','ux2-actor-1','e1000000-0000-4000-8000-000000000003','maybe');
 delete from public.profiles where id='e1000000-0000-4000-8000-000000000003';
 if (select actor_id from private.notification_outbox where dedupe_key='ux2-actor-1') is not null then raise exception 'Deleted actor kept'; end if;
 -- The stored answer list itself.
 begin
  update public.attendees set response='perhaps' where plan_id='e1100000-0000-4000-8000-000000000001';
  raise exception 'Unknown stored answer accepted';
 exception when check_violation then null; end;
end $$;
rollback;
