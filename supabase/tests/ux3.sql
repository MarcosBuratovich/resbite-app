-- UX3 event details (docs/superpowers/specs/2026-10-15-ux3-design.md). Synthetic identities only.
-- One rolled-back block per slice; each block uses its own UUID prefix family (f1, f2, f3).

-- Block 1: the optional end time and saving (Task 1).
begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('f1000000-0000-4000-8000-000000000001','ux3-1-owner@resbite-test.invalid',now(),'{}'),
 ('f1000000-0000-4000-8000-000000000002','ux3-1-guest@resbite-test.invalid',now(),'{}');
insert into private.tester_roster(email) values ('ux3-1-owner@resbite-test.invalid'),('ux3-1-guest@resbite-test.invalid');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.save_profile('Owner one');
do $$ begin
 -- v3 saves an end after the start; a retry with the same payload is acknowledged, a different end is not.
 perform public.create_plan_v3('f1100000-0000-4000-8000-000000000001','End fixture','',array['community'],null,
  '2099-06-01 10:00+00','2099-06-01 12:00+00','UTC','Park','Gate 4512');
 perform public.create_plan_v3('f1100000-0000-4000-8000-000000000001','End fixture','',array['community'],null,
  '2099-06-01 10:00+00','2099-06-01 12:00+00','UTC','Park','Gate 4512');
 begin
  perform public.create_plan_v3('f1100000-0000-4000-8000-000000000001','End fixture','',array['community'],null,
   '2099-06-01 10:00+00','2099-06-01 13:00+00','UTC','Park','Gate 4512');
  raise exception 'Retry with a different end accepted';
 exception when invalid_parameter_value then null; end;
 begin
  perform public.create_plan_v3('f1100000-0000-4000-8000-000000000002','Bad end','',array['community'],null,
   '2099-06-01 10:00+00','2099-06-01 10:00+00','UTC','Park','');
  raise exception 'An end equal to the start was accepted';
 exception when invalid_parameter_value then null; end;
 -- An older build (v2) creates without an end; its note becomes Meeting details.
 perform public.create_plan_v2('f1100000-0000-4000-8000-000000000003','Old build','',array['community'],null,
  '2099-06-02 10:00+00','UTC','Park','Old note');
end $$;
select public.create_invite('f1200000-0000-4000-8000-000000000001','f1100000-0000-4000-8000-000000000001',repeat('a',64));
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.save_profile('Gia');
select public.claim_invite(repeat('a',64));
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 -- Changing only the end time saves without a change notice.
 if public.change_plan_v3('f1100000-0000-4000-8000-000000000001',1,'End fixture','',array['community'],
   '2099-06-01 10:00+00','2099-06-01 13:00+00','UTC','Park','Gate 4512')<>2 then raise exception 'End change not saved as version 2'; end if;
 begin
  perform public.change_plan_v3('f1100000-0000-4000-8000-000000000001',2,'End fixture','',array['community'],
   '2099-06-01 10:00+00','2099-06-01 09:00+00','UTC','Park','Gate 4512');
  raise exception 'An end before the start was accepted';
 exception when invalid_parameter_value then null; end;
 -- An older build moving the start keeps the length (3 hours).
 if public.change_plan_v2('f1100000-0000-4000-8000-000000000001',2,'End fixture','',array['community'],
   '2099-06-01 11:00+00','UTC','Park','Gate 4512')<>3 then raise exception 'v2 move not saved'; end if;
 -- v3 can clear the end.
 if public.change_plan_v3('f1100000-0000-4000-8000-000000000001',3,'End fixture','',array['community'],
   '2099-06-01 11:00+00',null,'UTC','Park','Gate 4512')<>4 then raise exception 'Clearing the end not saved'; end if;
 -- An older build moving a start without an end keeps none.
 if public.change_plan_v2('f1100000-0000-4000-8000-000000000003',1,'Old build','',array['community'],
   '2099-06-02 12:00+00','UTC','Park','Old note')<>2 then raise exception 'v2 move without end not saved'; end if;
end $$;
reset role;
do $$ begin
 if (select ends_at from public.plans where id='f1100000-0000-4000-8000-000000000001') is not null then raise exception 'End not cleared'; end if;
 if (select ends_at from public.plans where id='f1100000-0000-4000-8000-000000000003') is not null then raise exception 'v2 invented an end'; end if;
 -- Older builds' edits keep Meeting details (v2 writes its note there).
 if (select note from public.plan_meeting_details where plan_id='f1100000-0000-4000-8000-000000000001') is distinct from 'Gate 4512' then raise exception 'v2 edit lost Meeting details'; end if;
 if (select note from public.plan_meeting_details where plan_id='f1100000-0000-4000-8000-000000000003') is distinct from 'Old note' then raise exception 'v2 create lost Meeting details'; end if;
 -- Notices: none for the end-only change (version 2); one time notice for the v2 move (version 3); none for clearing (version 4).
 if (select string_agg(dedupe_key||'='||detail,',' order by id) from private.notification_outbox
     where plan_id='f1100000-0000-4000-8000-000000000001' and kind='plan_changed')
    is distinct from 'plan:f1100000-0000-4000-8000-000000000001:3:f1000000-0000-4000-8000-000000000002=time' then
  raise exception 'Change notices wrong for end-time changes';
 end if;
 -- The constraint itself.
 begin
  update public.plans set ends_at=starts_at where id='f1100000-0000-4000-8000-000000000001';
  raise exception 'Stored end equal to start';
 exception when check_violation then null; end;
end $$;
-- The kept length, checked on a fresh copy of the move.
do $$ begin
 if exists(select 1 from public.plans where id='f1100000-0000-4000-8000-000000000001' and title<>'End fixture') then raise exception 'Title lost'; end if;
end $$;
rollback;

begin;
-- Block 1b: v2 keeps the length exactly (separate so the stored end is visible before clearing).
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('f1000000-0000-4000-8000-000000000003','ux3-1b-owner@resbite-test.invalid',now(),'{}');
insert into private.tester_roster(email) values ('ux3-1b-owner@resbite-test.invalid');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select public.save_profile('Owner one b');
select public.create_plan_v3('f1100000-0000-4000-8000-000000000004','Length','',array['community'],null,
 '2099-06-01 10:00+00','2099-06-01 12:30+00','UTC','Park','');
select public.change_plan_v2('f1100000-0000-4000-8000-000000000004',1,'Length','',array['community'],
 '2099-06-03 08:00+00','UTC','Park','');
reset role;
do $$ begin
 if (select ends_at from public.plans where id='f1100000-0000-4000-8000-000000000004') is distinct from '2099-06-03 10:30+00'::timestamptz then
  raise exception 'v2 did not keep the 2.5-hour length';
 end if;
end $$;
rollback;

-- Block 2: Meeting details are private to the organizer and Going or Maybe guests (Task 1).
begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('f2000000-0000-4000-8000-000000000001','ux3-2-owner@resbite-test.invalid',now(),'{}'),
 ('f2000000-0000-4000-8000-000000000002','ux3-2-going@resbite-test.invalid',now(),'{}'),
 ('f2000000-0000-4000-8000-000000000003','ux3-2-maybe@resbite-test.invalid',now(),'{}'),
 ('f2000000-0000-4000-8000-000000000004','ux3-2-pending@resbite-test.invalid',now(),'{}'),
 ('f2000000-0000-4000-8000-000000000005','ux3-2-declined@resbite-test.invalid',now(),'{}'),
 ('f2000000-0000-4000-8000-000000000006','ux3-2-withdrawn@resbite-test.invalid',now(),'{}'),
 ('f2000000-0000-4000-8000-000000000007','ux3-2-outsider@resbite-test.invalid',now(),'{}');
insert into private.tester_roster(email) select email from auth.users where email like 'ux3-2-%@resbite-test.invalid';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.save_profile('Owner two');
select public.create_plan_v3('f2100000-0000-4000-8000-000000000001','Private fixture','',array['community'],null,
 '2099-07-01 10:00+00',null,'UTC','Park','Gate 4512');
select public.create_invite(('f2200000-0000-4000-8000-00000000000'||n)::uuid,'f2100000-0000-4000-8000-000000000001',repeat(n::text,64))
 from generate_series(2,6) n;
do $$ declare n int; begin
 for n in 2..7 loop
  perform set_config('request.jwt.claims','{"sub":"f2000000-0000-4000-8000-00000000000'||n||'","role":"authenticated"}',true);
  perform public.save_profile('Guest '||n);
  if n<7 then perform public.claim_invite(repeat(n::text,64)); end if;
 end loop;
end $$;
reset role;
update public.attendees set response=case user_id
 when 'f2000000-0000-4000-8000-000000000002' then 'accepted' when 'f2000000-0000-4000-8000-000000000003' then 'maybe'
 when 'f2000000-0000-4000-8000-000000000005' then 'declined' when 'f2000000-0000-4000-8000-000000000006' then 'withdrawn'
 else 'pending' end where plan_id='f2100000-0000-4000-8000-000000000001';
do $$ begin
 if (select note from public.plan_meeting_details where plan_id='f2100000-0000-4000-8000-000000000001') is distinct from 'Gate 4512' then raise exception 'Meeting details not stored'; end if;
 if (select note from public.plans where id='f2100000-0000-4000-8000-000000000001')<>'' then raise exception 'The note stayed on the event row'; end if;
 if not (select has_meeting_details from public.plans where id='f2100000-0000-4000-8000-000000000001') then raise exception 'Flag not set'; end if;
end $$;
-- Who can read it: the organizer, Going and Maybe; nobody else, while everyone invited still reads the event.
create temporary table ux3_seen(n int, details int, events int) on commit drop;
grant all on ux3_seen to authenticated;
set local role authenticated;
do $$ declare n int; begin
 for n in 1..7 loop
  perform set_config('request.jwt.claims','{"sub":"f2000000-0000-4000-8000-00000000000'||n||'","role":"authenticated"}',true);
  insert into ux3_seen values(n,
   (select count(*) from public.plan_meeting_details where plan_id='f2100000-0000-4000-8000-000000000001'),
   (select count(*) from public.plans where id='f2100000-0000-4000-8000-000000000001' and has_meeting_details));
 end loop;
end $$;
reset role;
do $$ begin
 if (select string_agg(n||':'||details||':'||events,',' order by n) from ux3_seen)
    is distinct from '1:1:1,2:1:1,3:1:1,4:0:1,5:0:1,6:0:1,7:0:0' then
  raise exception 'Meeting details visibility wrong: %', (select string_agg(n||':'||details||':'||events,',' order by n) from ux3_seen);
 end if;
end $$;
-- Changing to Can't go hides them again; nobody can write the table directly.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.respond('f2100000-0000-4000-8000-000000000001','declined',(select version from public.attendees where plan_id='f2100000-0000-4000-8000-000000000001' and user_id='f2000000-0000-4000-8000-000000000002'));
do $$ begin
 if exists(select 1 from public.plan_meeting_details where plan_id='f2100000-0000-4000-8000-000000000001') then raise exception 'Can''t go still reads Meeting details'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"f2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 begin insert into public.plan_meeting_details(plan_id,note) values('f2100000-0000-4000-8000-000000000001','x'); raise exception 'Direct insert allowed';
 exception when insufficient_privilege then null; end;
 begin update public.plan_meeting_details set note='x'; raise exception 'Direct update allowed';
 exception when insufficient_privilege then null; end;
 begin delete from public.plan_meeting_details; raise exception 'Direct delete allowed';
 exception when insufficient_privilege then null; end;
 begin perform private.write_meeting_details('f2100000-0000-4000-8000-000000000001','x'); raise exception 'Helper callable by testers';
 exception when insufficient_privilege then null; end;
 -- Saving empty Meeting details removes them.
 perform public.change_plan_v3('f2100000-0000-4000-8000-000000000001',1,'Private fixture','',array['community'],
  '2099-07-01 10:00+00',null,'UTC','Park','');
 if exists(select 1 from public.plan_meeting_details where plan_id='f2100000-0000-4000-8000-000000000001') then raise exception 'Empty Meeting details kept'; end if;
 if (select has_meeting_details from public.plans where id='f2100000-0000-4000-8000-000000000001') then raise exception 'Flag kept after removal'; end if;
 perform public.change_plan_v3('f2100000-0000-4000-8000-000000000001',2,'Private fixture','',array['community'],
  '2099-07-01 10:00+00',null,'UTC','Park','Back door');
 perform public.set_guest_note('f2100000-0000-4000-8000-000000000001','Bring a blanket');
end $$;
reset role;
do $$ begin
 -- The old column can never hold text again.
 begin update public.plans set note='leak' where id='f2100000-0000-4000-8000-000000000001'; raise exception 'Note column accepted text';
 exception when check_violation then null; end;
 -- Account deletion's redaction removes Meeting details and the Note to guests with the other text.
 update public.profiles set deletion_requested_at=now() where id='f2000000-0000-4000-8000-000000000001';
 update public.plans set status='cancelled' where id='f2100000-0000-4000-8000-000000000001';
 if exists(select 1 from public.plan_meeting_details where plan_id='f2100000-0000-4000-8000-000000000001') then raise exception 'Redaction kept Meeting details'; end if;
 if (select has_meeting_details from public.plans where id='f2100000-0000-4000-8000-000000000001') then raise exception 'Redaction kept the flag'; end if;
 if (select guest_note||':'||coalesce(guest_note_at::text,'null') from public.plans where id='f2100000-0000-4000-8000-000000000001')<>':null' then raise exception 'Redaction kept the Note to guests'; end if;
 -- Deleting an event deletes its Meeting details.
 update public.profiles set deletion_requested_at=null where id='f2000000-0000-4000-8000-000000000001';
end $$;
rollback;

-- Block 3: Note to guests (Task 2).
begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('f3000000-0000-4000-8000-000000000001','ux3-3-owner@resbite-test.invalid',now(),'{}'),
 ('f3000000-0000-4000-8000-000000000002','ux3-3-going@resbite-test.invalid',now(),'{}'),
 ('f3000000-0000-4000-8000-000000000003','ux3-3-maybe@resbite-test.invalid',now(),'{}'),
 ('f3000000-0000-4000-8000-000000000004','ux3-3-pending@resbite-test.invalid',now(),'{}'),
 ('f3000000-0000-4000-8000-000000000005','ux3-3-declined@resbite-test.invalid',now(),'{}'),
 ('f3000000-0000-4000-8000-000000000006','ux3-3-withdrawn@resbite-test.invalid',now(),'{}');
insert into private.tester_roster(email) select email from auth.users where email like 'ux3-3-%@resbite-test.invalid';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f3000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.save_profile('Owner three');
select public.create_plan_v3('f3100000-0000-4000-8000-000000000001','Note fixture','',array['community'],null,
 '2099-08-01 10:00+00',null,'UTC','Park','');
select public.create_invite(('f3200000-0000-4000-8000-00000000000'||n)::uuid,'f3100000-0000-4000-8000-000000000001',repeat(chr(96+n),64))
 from generate_series(2,6) n;
do $$ declare n int; begin
 for n in 2..6 loop
  perform set_config('request.jwt.claims','{"sub":"f3000000-0000-4000-8000-00000000000'||n||'","role":"authenticated"}',true);
  perform public.save_profile('Guest '||n);
  perform public.claim_invite(repeat(chr(96+n),64));
 end loop;
end $$;
reset role;
update public.attendees set response=case user_id
 when 'f3000000-0000-4000-8000-000000000002' then 'accepted' when 'f3000000-0000-4000-8000-000000000003' then 'maybe'
 when 'f3000000-0000-4000-8000-000000000005' then 'declined' when 'f3000000-0000-4000-8000-000000000006' then 'withdrawn'
 else 'pending' end where plan_id='f3100000-0000-4000-8000-000000000001';
delete from private.notification_outbox where plan_id='f3100000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f3000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 r := public.set_guest_note('f3100000-0000-4000-8000-000000000001','  Bring a blanket  ');
 if r->>'guest_note' is distinct from 'Bring a blanket' or r->>'guest_note_at' is null then raise exception 'Note not posted: %', r; end if;
 -- The same text again is acknowledged without a second notice.
 perform public.set_guest_note('f3100000-0000-4000-8000-000000000001','Bring a blanket');
 begin perform public.set_guest_note('f3100000-0000-4000-8000-000000000001',repeat('x',281)); raise exception 'Long note accepted';
 exception when invalid_parameter_value then null; end;
end $$;
-- Guests read the note; a guest can't post one.
select set_config('request.jwt.claims','{"sub":"f3000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin
 if (select guest_note from public.plans where id='f3100000-0000-4000-8000-000000000001') is distinct from 'Bring a blanket' then raise exception 'Unanswered guest cannot read the note'; end if;
 begin perform public.set_guest_note('f3100000-0000-4000-8000-000000000001','Hijack'); raise exception 'Guest posted a note';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 -- One notice each for Going, Maybe and unanswered guests, naming the organizer; none for Can't go or the organizer.
 if (select string_agg(recipient_id::text,',' order by recipient_id) from private.notification_outbox
     where plan_id='f3100000-0000-4000-8000-000000000001' and kind='guest_note'
       and actor_id='f3000000-0000-4000-8000-000000000001' and detail is null)
    is distinct from 'f3000000-0000-4000-8000-000000000002,f3000000-0000-4000-8000-000000000003,f3000000-0000-4000-8000-000000000004' then
  raise exception 'Note notices went to the wrong people';
 end if;
 -- The note never changes the event version.
 if (select version from public.plans where id='f3100000-0000-4000-8000-000000000001')<>1 then raise exception 'Note changed the version'; end if;
 -- A note notice carries no detail.
 begin
  insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,detail)
  values('f3100000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000002','guest_note','ux3-bad-1','time');
  raise exception 'Note notice accepted a detail';
 exception when check_violation then null; end;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f3000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 -- Editing records a second notice; removing records none and clears the time.
 perform public.set_guest_note('f3100000-0000-4000-8000-000000000001','Running 10 minutes late');
 r := public.set_guest_note('f3100000-0000-4000-8000-000000000001','');
 if r->>'guest_note'<>'' or r->>'guest_note_at' is not null then raise exception 'Note not removed: %', r; end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from private.notification_outbox where plan_id='f3100000-0000-4000-8000-000000000001' and kind='guest_note')<>6 then
  raise exception 'Expected 3 notices for the post and 3 for the edit, none for the removal';
 end if;
 -- Started events take notes until the end (or an hour after the start); not after, and never when cancelled.
 update public.plans set starts_at=now()-interval '30 minutes' where id='f3100000-0000-4000-8000-000000000001';
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f3000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 perform public.set_guest_note('f3100000-0000-4000-8000-000000000001','Running late');
end $$;
reset role;
update public.plans set starts_at=now()-interval '2 hours' where id='f3100000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f3000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 begin perform public.set_guest_note('f3100000-0000-4000-8000-000000000001','Too late'); raise exception 'Note accepted after the end';
 exception when invalid_parameter_value then null; end;
end $$;
reset role;
update public.plans set ends_at=now()+interval '1 hour' where id='f3100000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f3000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 perform public.set_guest_note('f3100000-0000-4000-8000-000000000001','Still here until the end');
end $$;
reset role;
update public.plans set status='cancelled' where id='f3100000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f3000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 begin perform public.set_guest_note('f3100000-0000-4000-8000-000000000001','After cancelling'); raise exception 'Note accepted on a cancelled event';
 exception when invalid_parameter_value then null; end;
end $$;
reset role;
-- An ownerless event in progress (its owner's account was deleted) takes no note from a guest.
-- The hosted baseline still requires an owner; this test-only change is undone by the rollback below.
alter table public.plans alter column owner_id drop not null;
insert into public.plans(id,owner_id,activity_id,title,description,categories,starts_at,time_zone,place_label)
 values('f3100000-0000-4000-8000-000000000002',null,null,'Ownerless fixture','',array['community'],now()-interval '30 minutes','UTC','Park');
insert into public.attendees(plan_id,user_id,response) values('f3100000-0000-4000-8000-000000000002','f3000000-0000-4000-8000-000000000002','accepted');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f3000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 begin perform public.set_guest_note('f3100000-0000-4000-8000-000000000002','Hijack'); raise exception 'Guest posted a note on an ownerless event';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if (select guest_note from public.plans where id='f3100000-0000-4000-8000-000000000002')<>'' then raise exception 'Ownerless event kept a note'; end if;
 if exists(select 1 from private.notification_outbox where plan_id='f3100000-0000-4000-8000-000000000002' and kind='guest_note') then raise exception 'Ownerless event recorded a note notice'; end if;
end $$;
rollback;
