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

-- Block 2: change notices only for a new time or place, to people who may still come (Task 2).
begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('e2000000-0000-4000-8000-000000000001','ux2-2-owner@resbite-test.invalid',now(),'{}'),
 ('e2000000-0000-4000-8000-000000000002','ux2-2-going@resbite-test.invalid',now(),'{}'),
 ('e2000000-0000-4000-8000-000000000003','ux2-2-maybe@resbite-test.invalid',now(),'{}'),
 ('e2000000-0000-4000-8000-000000000004','ux2-2-pending@resbite-test.invalid',now(),'{}'),
 ('e2000000-0000-4000-8000-000000000005','ux2-2-declined@resbite-test.invalid',now(),'{}'),
 ('e2000000-0000-4000-8000-000000000006','ux2-2-withdrawn@resbite-test.invalid',now(),'{}');
insert into private.tester_roster(email) values
 ('ux2-2-owner@resbite-test.invalid'),('ux2-2-going@resbite-test.invalid'),('ux2-2-maybe@resbite-test.invalid'),
 ('ux2-2-pending@resbite-test.invalid'),('ux2-2-declined@resbite-test.invalid'),('ux2-2-withdrawn@resbite-test.invalid');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.save_profile('Owner two');
select public.create_plan_v2('e2100000-0000-4000-8000-000000000001','Picnic','Bring a rug',array['natural'],null,'2099-06-01 10:00+00','UTC','Park','Gate B');
select public.create_invite('e2200000-0000-4000-8000-000000000002','e2100000-0000-4000-8000-000000000001',repeat('2',64));
select public.create_invite('e2200000-0000-4000-8000-000000000003','e2100000-0000-4000-8000-000000000001',repeat('3',64));
select public.create_invite('e2200000-0000-4000-8000-000000000004','e2100000-0000-4000-8000-000000000001',repeat('4',64));
select public.create_invite('e2200000-0000-4000-8000-000000000005','e2100000-0000-4000-8000-000000000001',repeat('5',64));
select public.create_invite('e2200000-0000-4000-8000-000000000006','e2100000-0000-4000-8000-000000000001',repeat('6',64));
select set_config('request.jwt.claims','{"sub":"e2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.save_profile('Going'); select public.claim_invite(repeat('2',64));
select public.respond('e2100000-0000-4000-8000-000000000001','accepted',1);
select set_config('request.jwt.claims','{"sub":"e2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select public.save_profile('Maybe'); select public.claim_invite(repeat('3',64));
select public.respond('e2100000-0000-4000-8000-000000000001','maybe',1);
select set_config('request.jwt.claims','{"sub":"e2000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select public.save_profile('Pending'); select public.claim_invite(repeat('4',64));
select set_config('request.jwt.claims','{"sub":"e2000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select public.save_profile('Declined'); select public.claim_invite(repeat('5',64));
select public.respond('e2100000-0000-4000-8000-000000000001','declined',1);
select set_config('request.jwt.claims','{"sub":"e2000000-0000-4000-8000-000000000006","role":"authenticated"}',true);
select public.save_profile('Withdrawn'); select public.claim_invite(repeat('6',64));
select public.respond('e2100000-0000-4000-8000-000000000001','accepted',1);
select public.respond('e2100000-0000-4000-8000-000000000001','withdrawn',2);
select set_config('request.jwt.claims','{"sub":"e2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
-- v2: name, description, vibe and note only; the same instant and the same place padded with spaces.
select public.change_plan_v2('e2100000-0000-4000-8000-000000000001',1,'Big picnic','Bring two rugs',array['natural','community'],'2099-06-01 12:00+02','UTC','  Park ','Gate C');
reset role;
do $$ begin
 if exists(select 1 from private.notification_outbox where kind='plan_changed' and plan_id='e2100000-0000-4000-8000-000000000001') then raise exception 'A text-only edit notified someone'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
-- v3: same instant, another time zone. The shown time moves, so it is a time change.
select public.change_plan_v2('e2100000-0000-4000-8000-000000000001',2,'Big picnic','Bring two rugs',array['natural','community'],'2099-06-01 10:00+00','Europe/London','Park','Gate C');
-- v4: new place only.
select public.change_plan_v2('e2100000-0000-4000-8000-000000000001',3,'Big picnic','Bring two rugs',array['natural','community'],'2099-06-01 10:00+00','Europe/London','Lake','Gate C');
-- v5: new time and new place.
select public.change_plan_v2('e2100000-0000-4000-8000-000000000001',4,'Big picnic','Bring two rugs',array['natural','community'],'2099-06-02 10:00+00','Europe/London','Hill','Gate C');
reset role;
do $$ declare v integer; d text; begin
 for v, d in select * from (values (3,'time'),(4,'place'),(5,'time_place')) as t(v,d) loop
  -- Going, Maybe and not-yet-answered invitees only; never the organizer, never Can't make it.
  if (select string_agg(recipient_id::text,',' order by recipient_id) from private.notification_outbox
      where kind='plan_changed' and dedupe_key like 'plan:e2100000-0000-4000-8000-000000000001:'||v||':%'
        and detail=d and actor_id='e2000000-0000-4000-8000-000000000001')
     is distinct from 'e2000000-0000-4000-8000-000000000002,e2000000-0000-4000-8000-000000000003,e2000000-0000-4000-8000-000000000004' then
   raise exception 'Version % did not notify exactly Going, Maybe and Pending with detail %', v, d;
  end if;
 end loop;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
-- The old edit function is switched off.
do $$ begin
 begin perform public.change_plan('e2100000-0000-4000-8000-000000000001',5,'2099-06-03 10:00+00','UTC','Elsewhere','',false); raise exception 'Old edit function still callable'; exception when insufficient_privilege then null; end;
end $$;
-- v6: cancel tells every invitee, whatever they answered.
select public.change_plan_v2('e2100000-0000-4000-8000-000000000001',5,null,null,null,null,null,null,null,true);
reset role;
do $$ begin
 if (select count(*) from private.notification_outbox where kind='plan_cancelled' and plan_id='e2100000-0000-4000-8000-000000000001'
     and actor_id='e2000000-0000-4000-8000-000000000001' and detail is null)<>5 then raise exception 'Cancel did not notify all five invitees'; end if;
 if has_function_privilege('authenticated','public.change_plan(uuid,integer,timestamptz,text,text,text,boolean)','execute')
    or has_function_privilege('authenticated','private.change_plan(uuid,integer,timestamptz,text,text,text,boolean)','execute') then
  raise exception 'Old edit function still granted';
 end if;
 if not has_function_privilege('authenticated','public.change_plan_v2(uuid,integer,text,text,text[],timestamptz,text,text,text,boolean)','execute') then raise exception 'change_plan_v2 lost its grant'; end if;
 if not (select prosecdef from pg_proc where oid='private.change_plan_v2(uuid,integer,text,text,text[],timestamptz,text,text,text,boolean)'::regprocedure) then raise exception 'change_plan_v2 lost definer rights'; end if;
end $$;
rollback;

-- Block 3: the guest list, names and profile photos after answering (Task 3).
begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('e3000000-0000-4000-8000-000000000001','ux2-3-owner@resbite-test.invalid',now(),'{}'),
 ('e3000000-0000-4000-8000-000000000002','ux2-3-ana@resbite-test.invalid',now(),'{}'),
 ('e3000000-0000-4000-8000-000000000003','ux2-3-ben@resbite-test.invalid',now(),'{}'),
 ('e3000000-0000-4000-8000-000000000004','ux2-3-cy@resbite-test.invalid',now(),'{}'),
 ('e3000000-0000-4000-8000-000000000005','ux2-3-outsider@resbite-test.invalid',now(),'{}');
insert into private.tester_roster(email) values
 ('ux2-3-owner@resbite-test.invalid'),('ux2-3-ana@resbite-test.invalid'),('ux2-3-ben@resbite-test.invalid'),
 ('ux2-3-cy@resbite-test.invalid'),('ux2-3-outsider@resbite-test.invalid');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e3000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.save_profile('Owner three');
select public.create_plan_v2('e3100000-0000-4000-8000-000000000001','Board games','',array['community'],null,'2099-06-01 10:00+00','UTC','Games room','');
select public.create_invite('e3200000-0000-4000-8000-000000000002','e3100000-0000-4000-8000-000000000001',repeat('7',64));
select public.create_invite('e3200000-0000-4000-8000-000000000003','e3100000-0000-4000-8000-000000000001',repeat('8',64));
select public.create_invite('e3200000-0000-4000-8000-000000000004','e3100000-0000-4000-8000-000000000001',repeat('9',64));
select set_config('request.jwt.claims','{"sub":"e3000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.save_profile('Ana'); select public.claim_invite(repeat('7',64));
select set_config('request.jwt.claims','{"sub":"e3000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select public.save_profile('Ben'); select public.claim_invite(repeat('8',64));
select public.respond('e3100000-0000-4000-8000-000000000001','accepted',1);
select set_config('request.jwt.claims','{"sub":"e3000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select public.save_profile('Cy'); select public.claim_invite(repeat('9',64));
select set_config('request.jwt.claims','{"sub":"e3000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select public.save_profile('Outsider');
reset role;
-- Ben has a profile photo.
insert into storage.objects(bucket_id,name,owner) values
 ('profile-photos','e3000000-0000-4000-8000-000000000003/ben.jpg','e3000000-0000-4000-8000-000000000003');
update public.profiles set avatar_path='e3000000-0000-4000-8000-000000000003/ben.jpg' where id='e3000000-0000-4000-8000-000000000003';
set local role authenticated;
-- Ana has not answered: the organizer and herself only, by every route.
select set_config('request.jwt.claims','{"sub":"e3000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if (select count(*) from public.plans)<>1 then raise exception 'Unanswered invitee lost the event'; end if;
 if (select string_agg(user_id::text,',') from public.attendees)<>'e3000000-0000-4000-8000-000000000002' then raise exception 'Unanswered invitee sees other guests'; end if;
 if exists(select 1 from public.attendees where user_id='e3000000-0000-4000-8000-000000000003') then raise exception 'Unanswered invitee found a guest by id'; end if;
 if (select string_agg(display_name,',' order by display_name) from public.profiles)<>'Ana,Owner three' then raise exception 'Unanswered invitee sees other names'; end if;
 if exists(select 1 from storage.objects where bucket_id='profile-photos' and name='e3000000-0000-4000-8000-000000000003/ben.jpg') then raise exception 'Unanswered invitee sees a guest photo'; end if;
end $$;
-- Any answer opens the list, Can't make it included.
select public.respond('e3100000-0000-4000-8000-000000000001','declined',1);
do $$ begin
 if (select count(*) from public.attendees)<>3 then raise exception 'Answered invitee does not see the guest list'; end if;
 if (select string_agg(display_name,',' order by display_name) from public.profiles)<>'Ana,Ben,Cy,Owner three' then raise exception 'Answered invitee does not see guest names'; end if;
 if not exists(select 1 from storage.objects where bucket_id='profile-photos' and name='e3000000-0000-4000-8000-000000000003/ben.jpg') then raise exception 'Answered invitee cannot see a guest photo'; end if;
end $$;
-- Cy has not answered: still only herself and the organizer, although others have.
select set_config('request.jwt.claims','{"sub":"e3000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin
 if (select count(*) from public.attendees)<>1 then raise exception 'Unanswered invitee sees answered guests'; end if;
 if (select string_agg(display_name,',' order by display_name) from public.profiles)<>'Cy,Owner three' then raise exception 'Unanswered invitee sees answered names'; end if;
end $$;
select public.respond('e3100000-0000-4000-8000-000000000001','maybe',1);
do $$ begin
 if (select count(*) from public.attendees)<>3 then raise exception 'Maybe does not open the guest list'; end if;
end $$;
-- Ben backs out after Going: still answered.
select set_config('request.jwt.claims','{"sub":"e3000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select public.respond('e3100000-0000-4000-8000-000000000001','withdrawn',2);
do $$ begin
 if (select count(*) from public.attendees)<>3 then raise exception 'Withdrawn guest lost the list'; end if;
end $$;
-- The organizer always sees everyone; an outsider sees nothing.
select set_config('request.jwt.claims','{"sub":"e3000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 if (select count(*) from public.attendees)<>3 then raise exception 'Organizer does not see every guest'; end if;
 if (select count(*) from public.profiles)<>4 then raise exception 'Organizer does not see every guest name'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"e3000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
do $$ begin
 if exists(select 1 from public.attendees) or exists(select 1 from public.plans) then raise exception 'Outsider sees the event'; end if;
 if (select count(*) from public.profiles)<>1 then raise exception 'Outsider sees other names'; end if;
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','private.can_see_guests(uuid)','execute') then raise exception 'anon can execute can_see_guests'; end if;
 if not has_function_privilege('authenticated','private.can_see_guests(uuid)','execute') then raise exception 'Policies cannot call can_see_guests'; end if;
 if not (select prosecdef from pg_proc where oid='private.can_see_guests(uuid)'::regprocedure) then raise exception 'can_see_guests is not a definer'; end if;
 if not (select prosecdef from pg_proc where oid='private.can_read_profile(uuid)'::regprocedure) then raise exception 'can_read_profile lost definer rights'; end if;
end $$;
rollback;
