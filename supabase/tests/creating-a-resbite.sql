-- Creating a resbite (docs/superpowers/specs/2026-10-28-creating-a-resbite-design.md, CR-D14): a resbite accepts changes
-- until its END time, not its start. Synthetic identities only (prefix e1); one rolled-back block per slice.
-- Users e1…: 01 organizer (roster), 02 pending guest (roster), 03 per-person link guest (roster), 04 and 05 roster
-- guests who use the event link, 06 and 07 phone-only requesters (07 stays waiting), 08 a phone-only requester who asks
-- after the end, 09 and 10 phone-invited numbers, 12 and 13 new phone accounts that join by the link.

-- Slice 1: the end is the boundary.
begin;
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values
 ('e1000000-0000-4000-8000-000000000001','cr1-owner@resbite-test.invalid',now(),null,null),
 ('e1000000-0000-4000-8000-000000000002','cr1-guest-a@resbite-test.invalid',now(),null,null),
 ('e1000000-0000-4000-8000-000000000003','cr1-guest-b@resbite-test.invalid',now(),null,null),
 ('e1000000-0000-4000-8000-000000000004','cr1-guest-c@resbite-test.invalid',now(),null,null),
 ('e1000000-0000-4000-8000-000000000005','cr1-guest-d@resbite-test.invalid',now(),null,null),
 ('e1000000-0000-4000-8000-000000000006',null,null,'447700900606',now()),
 ('e1000000-0000-4000-8000-000000000007',null,null,'447700900607',now()),
 ('e1000000-0000-4000-8000-000000000008',null,null,'447700900608',now()),
 ('e1000000-0000-4000-8000-000000000009',null,null,'447700900609',now()),
 ('e1000000-0000-4000-8000-000000000010',null,null,'447700900610',now()),
 ('e1000000-0000-4000-8000-000000000012',null,null,'447700900612',now()),
 ('e1000000-0000-4000-8000-000000000013',null,null,'447700900613',now());
insert into private.tester_roster(email) values ('cr1-owner@resbite-test.invalid'),('cr1-guest-a@resbite-test.invalid'),
 ('cr1-guest-b@resbite-test.invalid'),('cr1-guest-c@resbite-test.invalid'),('cr1-guest-d@resbite-test.invalid');
insert into public.profiles(id,display_name) values
 ('e1000000-0000-4000-8000-000000000001','Owner'),('e1000000-0000-4000-8000-000000000002','Guest A'),
 ('e1000000-0000-4000-8000-000000000003','Guest B'),('e1000000-0000-4000-8000-000000000004','Guest C'),
 ('e1000000-0000-4000-8000-000000000005','Guest D'),('e1000000-0000-4000-8000-000000000006','Requester six'),
 ('e1000000-0000-4000-8000-000000000007','Requester seven'),('e1000000-0000-4000-8000-000000000008','Requester eight');
insert into private.age_attestations(user_id,terms_version)
 select ('e1000000-0000-4000-8000-0000000000'||n)::uuid,'2026-09' from unnest(array['06','07','08']) n;

-- The helper: the end, or the start when there is none.
do $$ begin
 if private.plan_end('2026-10-30 19:00+00',null)<>'2026-10-30 19:00+00'::timestamptz then raise exception 'plan_end without an end is not the start'; end if;
 if private.plan_end('2026-10-30 19:00+00','2026-10-30 22:00+00')<>'2026-10-30 22:00+00'::timestamptz then raise exception 'plan_end with an end is not the end'; end if;
end $$;

-- Plans start in the future so create_plan_v3 accepts them; the test then moves them into the past.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.create_plan_v3('e1100000-0000-4000-8000-000000000001','Running night','',array['community'],null,
 '2099-06-01 19:00+00','2099-06-01 22:00+00','UTC','Park','');
select public.create_plan_v3('e1100000-0000-4000-8000-000000000002','Old night','',array['community'],null,
 '2099-06-02 19:00+00',null,'UTC','Park','');
reset role;
-- running: started an hour ago, ends in an hour. old: no end, started ten minutes ago.
update public.plans set starts_at=now()-interval '1 hour', ends_at=now()+interval '1 hour' where id='e1100000-0000-4000-8000-000000000001';
update public.plans set starts_at=now()-interval '10 minutes' where id='e1100000-0000-4000-8000-000000000002';
insert into public.attendees(plan_id,user_id) values
 ('e1100000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002'),
 ('e1100000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000002');
create temporary table cr1_codes(name text primary key, code text, id bigint);
grant select, insert on cr1_codes to anon, authenticated;

-- Running: every action the start used to close still works until the end.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare c text; r jsonb; begin
 c := public.plan_link('e1100000-0000-4000-8000-000000000001');
 insert into cr1_codes(name,code) values('link',c);
 -- Changing the place keeps the stored start, which is in the past; the notice is queued.
 if public.change_plan_v3('e1100000-0000-4000-8000-000000000001',1,'Running night','',array['community'],
  (select starts_at from public.plans where id='e1100000-0000-4000-8000-000000000001'),
  (select ends_at from public.plans where id='e1100000-0000-4000-8000-000000000001'),'UTC','Other park','')<>2 then raise exception 'Running plan not changed'; end if;
 -- A different start still has to be in the future.
 begin perform public.change_plan_v3('e1100000-0000-4000-8000-000000000001',2,'Running night','',array['community'],
   now()-interval '2 hours',now()+interval '1 hour','UTC','Other park','');
  raise exception 'A new start in the past was accepted';
 exception when invalid_parameter_value then if sqlerrm<>'Invalid future schedule' then raise exception 'Wrong message: %', sqlerrm; end if; end;
 r := public.invite_contacts('e1100000-0000-4000-8000-000000000001', jsonb_build_array(
  jsonb_build_object('phone','447700900609','country','44','code',repeat('J',22)),
  jsonb_build_object('phone','447700900610','country','44','code',repeat('K',22))));
 if r->0->>'kind'<>'link' then raise exception 'Link expected: %', r; end if;
 perform public.create_invite('e1200000-0000-4000-8000-000000000001','e1100000-0000-4000-8000-000000000001',repeat('a',64));
 perform public.create_invite('e1200000-0000-4000-8000-000000000002','e1100000-0000-4000-8000-000000000001',repeat('b',64));
 perform public.revoke_invite('e1200000-0000-4000-8000-000000000002');
 if public.set_plan_cover_description('e1100000-0000-4000-8000-000000000001','',0)->>'cover_revision' is null then raise exception 'Cover description not set'; end if;
 if public.set_plan_cover_if_current('e1100000-0000-4000-8000-000000000001',null,null,0)->>'cover_revision' is null then raise exception 'Cover not set'; end if;
end $$;
-- Storage: the owner can upload a cover until the end.
do $$ begin
 insert into storage.objects(bucket_id,name) values('plan-covers','e1000000-0000-4000-8000-000000000001/e1100000-0000-4000-8000-000000000001/a.jpg');
end $$;
-- The pending guest answers.
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if public.respond('e1100000-0000-4000-8000-000000000001','accepted',1) is null then raise exception 'respond returned nothing'; end if;
end $$;
-- A per-person link, the event link and two requests.
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select public.claim_invite(repeat('a',64));
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin
 if public.claim_plan_link((select code from cr1_codes where name='link'))<>'e1100000-0000-4000-8000-000000000001' then raise exception 'claim_plan_link returned the wrong plan'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000006","role":"authenticated"}',true);
select public.request_to_join((select code from cr1_codes where name='link'),null,'accepted',null);
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000007","role":"authenticated"}',true);
select public.request_to_join((select code from cr1_codes where name='link'),null,'maybe',null);
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin
 if not exists(select 1 from jsonb_array_elements(public.my_join_requests()) e where e->>'plan_id'='e1100000-0000-4000-8000-000000000001') then raise exception 'Waiting request missing from my_join_requests while running'; end if;
 if public.change_join_answer('e1100000-0000-4000-8000-000000000001','maybe')->>'response'<>'maybe' then raise exception 'change_join_answer failed while running'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000012","role":"authenticated"}',true);
do $$ begin
 if public.join_by_link((select code from cr1_codes where name='link'),'Newcomer','2026-10') is distinct from 'e1100000-0000-4000-8000-000000000001'::uuid then raise exception 'join_by_link failed while running'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 if jsonb_array_length(public.plan_join_requests('e1100000-0000-4000-8000-000000000001'))<>4 then raise exception 'Four waiting requests expected'; end if;
 perform public.decide_join_request('e1100000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000006',true);
end $$;
-- The invited numbers: the personal page is open, the typed number is checked, the invited person answers.
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ begin
 if (public.invitation_page((select code from cr1_codes where name='link'))->>'state')<>'open' then raise exception 'invitation_page not open while running'; end if;
 if (public.personal_invitation_page(repeat('J',22))->>'state')<>'open' then raise exception 'personal_invitation_page not open while running'; end if;
 if not public.check_invited_number(repeat('J',22),'447700900609') then raise exception 'Invited number not accepted while running'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000009","role":"authenticated"}',true);
do $$ begin
 if public.answer_phone_invitation(repeat('J',22),'Invitee nine','accepted','2026-10')->>'response'<>'accepted' then raise exception 'answer_phone_invitation failed while running'; end if;
end $$;
-- The waiting request of 07 has a notice for the organizer; while running the notice goes out.
reset role;
do $$ begin
 if (select count(*) from private.notification_outbox where plan_id='e1100000-0000-4000-8000-000000000001' and kind='plan_changed' and recipient_id='e1000000-0000-4000-8000-000000000002')<>1 then raise exception 'plan_changed not queued for the pending guest'; end if;
end $$;
do $$ declare o bigint; begin
 select id into o from private.notification_outbox where plan_id='e1100000-0000-4000-8000-000000000001' and kind='join_request' and actor_id='e1000000-0000-4000-8000-000000000007';
 if o is null then raise exception 'No join_request notice for the waiting request'; end if;
 insert into cr1_codes(name,id) values('notice',o);
 if not private.notification_recipient_eligible(o) then raise exception 'Notice for a waiting request not eligible while running'; end if;
end $$;

-- Ended: the same plan, its end a minute ago. Everything refuses as it did after the old start.
update public.plans set ends_at=now()-interval '1 minute' where id='e1100000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 begin perform public.change_plan_v3('e1100000-0000-4000-8000-000000000001',2,'Running night','',array['community'],
   (select starts_at from public.plans where id='e1100000-0000-4000-8000-000000000001'),(select ends_at from public.plans where id='e1100000-0000-4000-8000-000000000001'),'UTC','Third park','');
  raise exception 'Ended plan changed';
 exception when invalid_parameter_value then if sqlerrm<>'Plan unavailable' then raise exception 'Wrong message: %', sqlerrm; end if; end;
 begin perform public.plan_link('e1100000-0000-4000-8000-000000000001'); raise exception 'Link read on an ended plan';
 exception when insufficient_privilege then if sqlerrm<>'Active plan owner required' then raise exception 'Wrong message: %', sqlerrm; end if; end;
 begin perform public.invite_contacts('e1100000-0000-4000-8000-000000000001', jsonb_build_array(jsonb_build_object('phone','447700900699','country','44','code',repeat('L',22))));
  raise exception 'Invited to an ended plan';
 exception when insufficient_privilege then if sqlerrm<>'Active plan owner required' then raise exception 'Wrong message: %', sqlerrm; end if; end;
 begin perform public.decide_join_request('e1100000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000007',true); raise exception 'Decided on an ended plan';
 exception when insufficient_privilege then if sqlerrm<>'Active plan owner required' then raise exception 'Wrong message: %', sqlerrm; end if; end;
 begin perform public.create_invite('e1200000-0000-4000-8000-000000000003','e1100000-0000-4000-8000-000000000001',repeat('c',64)); raise exception 'Invite created on an ended plan';
 exception when invalid_parameter_value then if sqlerrm<>'Plan unavailable' then raise exception 'Wrong message: %', sqlerrm; end if; end;
 begin perform public.revoke_invite('e1200000-0000-4000-8000-000000000001'); raise exception 'Invite revoked on an ended plan';
 exception when insufficient_privilege then if sqlerrm<>'Active plan owner required' then raise exception 'Wrong message: %', sqlerrm; end if; end;
 begin perform public.set_plan_cover_description('e1100000-0000-4000-8000-000000000001','',0); raise exception 'Cover description set on an ended plan';
 exception when invalid_parameter_value then if sqlerrm<>'Plan unavailable' then raise exception 'Wrong message: %', sqlerrm; end if; end;
 begin perform public.set_plan_cover_if_current('e1100000-0000-4000-8000-000000000001',null,null,0); raise exception 'Cover set on an ended plan';
 exception when invalid_parameter_value then if sqlerrm<>'Plan unavailable' then raise exception 'Wrong message: %', sqlerrm; end if; end;
 -- Nobody is waiting to be approved once it has ended.
 if public.plan_join_requests('e1100000-0000-4000-8000-000000000001')<>'[]'::jsonb then raise exception 'plan_join_requests lists requests after the end'; end if;
 -- The storage policies close at the end: the insert is refused (the folder is the owner's, the plan is not open).
 begin insert into storage.objects(bucket_id,name) values('plan-covers','e1000000-0000-4000-8000-000000000001/e1100000-0000-4000-8000-000000000001/b.jpg');
  raise exception 'Cover uploaded to an ended plan';
 exception when insufficient_privilege then if sqlerrm not like 'new row violates row-level security policy%' then raise exception 'Wrong message: %', sqlerrm; end if; end;
end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 begin perform public.respond('e1100000-0000-4000-8000-000000000001','declined',2); raise exception 'Ended plan answered';
 exception when invalid_parameter_value then if sqlerrm<>'Plan unavailable' then raise exception 'Wrong message: %', sqlerrm; end if; end;
end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
do $$ begin
 begin perform public.claim_plan_link((select code from cr1_codes where name='link')); raise exception 'Ended plan claimed';
 exception when insufficient_privilege then if sqlerrm<>'Invitation unavailable' then raise exception 'Wrong message: %', sqlerrm; end if; end;
end $$;
-- An unrevoked token, claimed once already by user 03, is refused after the end all the same.
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 begin perform public.claim_invite(repeat('a',64)); raise exception 'Ended plan claimed by invite';
 exception when insufficient_privilege then if sqlerrm<>'Invitation unavailable' then raise exception 'Wrong message: %', sqlerrm; end if; end;
end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin
 if exists(select 1 from jsonb_array_elements(public.my_join_requests()) e where e->>'plan_id'='e1100000-0000-4000-8000-000000000001') then raise exception 'my_join_requests lists a request after the end'; end if;
 begin perform public.change_join_answer('e1100000-0000-4000-8000-000000000001','declined'); raise exception 'Answer changed after the end';
 exception when insufficient_privilege then if sqlerrm<>'Invitation unavailable' then raise exception 'Wrong message: %', sqlerrm; end if; end;
end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000008","role":"authenticated"}',true);
do $$ begin
 begin perform public.request_to_join((select code from cr1_codes where name='link'),null,'accepted',null); raise exception 'Ended plan requested';
 exception when insufficient_privilege then if sqlerrm<>'Invitation unavailable' then raise exception 'Wrong message: %', sqlerrm; end if; end;
end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000013","role":"authenticated"}',true);
do $$ begin
 begin perform public.join_by_link((select code from cr1_codes where name='link'),'Newcomer','2026-10'); raise exception 'Ended plan joined';
 exception when insufficient_privilege then if sqlerrm<>'Invitation unavailable' then raise exception 'Wrong message: %', sqlerrm; end if; end;
end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000010","role":"authenticated"}',true);
do $$ begin
 begin perform public.answer_phone_invitation(repeat('K',22),'Invitee ten','accepted','2026-10'); raise exception 'Ended plan answered by number';
 exception when insufficient_privilege then if sqlerrm<>'Invitation unavailable' then raise exception 'Wrong message: %', sqlerrm; end if; end;
end $$;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ begin
 if (public.invitation_page((select code from cr1_codes where name='link'))->>'state')<>'happened' then raise exception 'invitation_page not happened after the end'; end if;
 if (public.personal_invitation_page(repeat('K',22))->>'state')<>'happened' then raise exception 'personal_invitation_page not happened after the end'; end if;
 if public.check_invited_number(repeat('K',22),'447700900610') then raise exception 'Number checked after the end'; end if;
end $$;
reset role;
do $$ begin
 if private.notification_recipient_eligible((select id from cr1_codes where name='notice')) then raise exception 'Notice for a request eligible after the end'; end if;
 -- The policies call the helper.
 if (select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname in ('resbite_cover_insert','resbite_cover_update')
   and with_check like '%plan_end%')<>2 then raise exception 'Both cover policies should call plan_end'; end if;
 if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='resbite_cover_update' and qual like '%plan_end%')
  then raise exception 'The cover update policy should call plan_end in its using clause'; end if;
end $$;

-- Old: no end, started ten minutes ago. Answers have closed, but the note window (start + 1 hour) is still open.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 begin perform public.respond('e1100000-0000-4000-8000-000000000002','accepted',1); raise exception 'Old plan answered';
 exception when invalid_parameter_value then if sqlerrm<>'Plan unavailable' then raise exception 'Wrong message: %', sqlerrm; end if; end;
end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 if public.set_guest_note('e1100000-0000-4000-8000-000000000002','Bring a coat')->>'guest_note'<>'Bring a coat' then raise exception 'Owner could not write the note'; end if;
end $$;
rollback;

-- Slice 2: admins (CR-D8, CR-D15). The owner appoints Going guests who use the app; an admin does everything a host
-- does except appoint or remove admins, or remove the owner. Users: 01 owner (with a confirmed number), 02 admin
-- (appointed), 03 a Maybe guest, 04 a plain guest, 05 a second admin, 06 a phone-only requester, 07 a Going guest who
-- has never used the app, whom an admin removes. 01, 02, 05, 06 and 08 have used the app; 03, 04 and 07 have not.
begin;
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values
 ('e1000000-0000-4000-8000-000000000001','cr1-owner@resbite-test.invalid',now(),'447700900601',now()),
 ('e1000000-0000-4000-8000-000000000002','cr1-guest-a@resbite-test.invalid',now(),null,null),
 ('e1000000-0000-4000-8000-000000000003','cr1-guest-b@resbite-test.invalid',now(),null,null),
 ('e1000000-0000-4000-8000-000000000004','cr1-guest-c@resbite-test.invalid',now(),null,null),
 ('e1000000-0000-4000-8000-000000000005','cr1-guest-d@resbite-test.invalid',now(),null,null),
 ('e1000000-0000-4000-8000-000000000006',null,null,'447700900606',now()),
 ('e1000000-0000-4000-8000-000000000007','cr1-guest-e@resbite-test.invalid',now(),null,null);
insert into private.tester_roster(email) values ('cr1-owner@resbite-test.invalid'),('cr1-guest-a@resbite-test.invalid'),
 ('cr1-guest-b@resbite-test.invalid'),('cr1-guest-c@resbite-test.invalid'),('cr1-guest-d@resbite-test.invalid'),('cr1-guest-e@resbite-test.invalid');
insert into public.profiles(id,display_name) values
 ('e1000000-0000-4000-8000-000000000001','Owner'),('e1000000-0000-4000-8000-000000000002','Admin A'),
 ('e1000000-0000-4000-8000-000000000003','Guest B'),('e1000000-0000-4000-8000-000000000004','Guest C'),
 ('e1000000-0000-4000-8000-000000000005','Admin D'),('e1000000-0000-4000-8000-000000000006','Requester six'),
 ('e1000000-0000-4000-8000-000000000007','Guest E');
insert into private.age_attestations(user_id,terms_version) values ('e1000000-0000-4000-8000-000000000006','2026-09');
insert into private.app_sessions(user_id) select ('e1000000-0000-4000-8000-0000000000'||n)::uuid from unnest(array['01','02','05','06']) n;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.create_plan_v3('e1100000-0000-4000-8000-000000000003','Admin night','',array['community'],null,
 '2099-06-03 19:00+00','2099-06-03 22:00+00','UTC','Park','');
reset role;
insert into public.attendees(plan_id,user_id,response) values
 ('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000002','accepted'),
 ('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000003','maybe'),
 ('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000004','accepted'),
 ('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000005','accepted'),
 ('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000007','accepted');
create temporary table cr1_codes(name text primary key, code text, id bigint);
grant select, insert on cr1_codes to anon, authenticated;

-- The functions are for signed-in people only.
do $$ begin
 if has_function_privilege('anon','public.appoint_admin(uuid,uuid)','execute') or has_function_privilege('anon','public.remove_admin(uuid,uuid)','execute')
  then raise exception 'anon can execute the admin functions'; end if;
 if not has_function_privilege('authenticated','public.appoint_admin(uuid,uuid)','execute') or not has_function_privilege('authenticated','public.remove_admin(uuid,uuid)','execute')
  then raise exception 'authenticated cannot execute the admin functions'; end if;
 if has_table_privilege('authenticated','public.plan_admins','insert') or has_table_privilege('authenticated','public.plan_admins','delete')
  then raise exception 'clients can write plan_admins'; end if;
end $$;

-- Appointing: Going guests only, by the owner only.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 perform public.appoint_admin('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000002');
 perform public.appoint_admin('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000002');
 begin perform public.appoint_admin('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000003'); raise exception 'A Maybe guest was appointed';
 exception when invalid_parameter_value then if sqlerrm<>'Only a guest who is going can be an admin' then raise exception 'Wrong message: %', sqlerrm; end if; end;
 -- Going, but never used the app: an admin hosts from the app.
 begin perform public.appoint_admin('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000007'); raise exception 'A guest who never used the app was appointed';
 exception when invalid_parameter_value then if sqlerrm<>'Only a guest who uses the app can be an admin' then raise exception 'Wrong message: %', sqlerrm; end if; end;
 begin perform public.appoint_admin('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000001'); raise exception 'The owner appointed themself';
 exception when invalid_parameter_value then null; end;
 begin perform public.appoint_admin('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000099'); raise exception 'A stranger was appointed';
 exception when invalid_parameter_value then null; end;
 -- The owner and the admin can read the roster of admins; a stranger cannot.
 if (select count(*) from public.plan_admins where plan_id='e1100000-0000-4000-8000-000000000003')<>1 then raise exception 'Owner should read one admin row'; end if;
end $$;
reset role;
do $$ declare r record; begin
 if (select count(*) from public.plan_admins where plan_id='e1100000-0000-4000-8000-000000000003' and user_id='e1000000-0000-4000-8000-000000000002'
   and appointed_by='e1000000-0000-4000-8000-000000000001')<>1 then raise exception 'plan_admins row missing'; end if;
 select * into r from private.notification_outbox where plan_id='e1100000-0000-4000-8000-000000000003' and kind='admin_added';
 if not found or r.recipient_id<>'e1000000-0000-4000-8000-000000000002' or r.actor_id<>'e1000000-0000-4000-8000-000000000001' or r.detail is not null then
  raise exception 'admin_added notice wrong: %', r; end if;
 if (select count(*) from private.notification_outbox where plan_id='e1100000-0000-4000-8000-000000000003' and kind='admin_added')<>1 then raise exception 'One admin_added notice expected'; end if;
 if not private.is_host('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000001')
  or not private.is_host('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000002')
  or private.is_host('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000004') then raise exception 'is_host wrong'; end if;
 if (select array_agg(h) from private.host_ids('e1100000-0000-4000-8000-000000000003') h)<>array['e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002']::uuid[]
  then raise exception 'host_ids should be the owner then the admins'; end if;
end $$;

-- An admin cannot appoint or remove admins.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 begin perform public.appoint_admin('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000004'); raise exception 'An admin appointed an admin';
 exception when insufficient_privilege then if sqlerrm<>'Owner required' then raise exception 'Wrong message: %', sqlerrm; end if; end;
 begin perform public.remove_admin('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000002'); raise exception 'An admin removed an admin';
 exception when insufficient_privilege then if sqlerrm<>'Owner required' then raise exception 'Wrong message: %', sqlerrm; end if; end;
end $$;

-- A revoked invitation ends an admin role: no ghost host. Users 21 (invited by phone) and 22 (invited by link) are
-- Going admins; 23 is a pending invitee; 24 is an admin the owner removes.
reset role;
insert into auth.users(id,email,email_confirmed_at) values
 ('e1000000-0000-4000-8000-000000000021','cr1-ghost-a@resbite-test.invalid',now()),
 ('e1000000-0000-4000-8000-000000000022','cr1-ghost-b@resbite-test.invalid',now()),
 ('e1000000-0000-4000-8000-000000000023','cr1-ghost-c@resbite-test.invalid',now()),
 ('e1000000-0000-4000-8000-000000000024','cr1-ghost-d@resbite-test.invalid',now());
insert into public.profiles(id,display_name) values
 ('e1000000-0000-4000-8000-000000000021','Ghost A'),('e1000000-0000-4000-8000-000000000022','Ghost B'),
 ('e1000000-0000-4000-8000-000000000023','Pending C'),('e1000000-0000-4000-8000-000000000024','Admin D');
insert into public.attendees(plan_id,user_id,response) values
 ('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000021','accepted'),
 ('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000022','accepted'),
 ('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000023','pending'),
 ('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000024','accepted');
insert into public.plan_admins(plan_id,user_id,appointed_by) values
 ('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000021','e1000000-0000-4000-8000-000000000001'),
 ('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000022','e1000000-0000-4000-8000-000000000001'),
 ('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000024','e1000000-0000-4000-8000-000000000001');
insert into private.phone_invitations(plan_id,code_hash,phone,country,invited_by,user_id)
 values('e1100000-0000-4000-8000-000000000003',extensions.digest(repeat('G',22),'sha256'),'447700900621','44','e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000021');
insert into private.invitations(id,plan_id,token_hash,claimed_by)
 values('e1200000-0000-4000-8000-000000000022','e1100000-0000-4000-8000-000000000003',extensions.digest('ghost-b','sha256'),'e1000000-0000-4000-8000-000000000022');
do $$ begin
 if not private.is_host('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000021')
  or not private.is_host('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000022') then raise exception 'The new admins should be hosts'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.revoke_phone_invitation('e1100000-0000-4000-8000-000000000003','447700900621');
select public.revoke_invite('e1200000-0000-4000-8000-000000000022');
-- The owner takes a role back from an admin who remains.
select public.remove_admin('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000024');
reset role;
do $$ declare u text; begin
 foreach u in array array['e1000000-0000-4000-8000-000000000021','e1000000-0000-4000-8000-000000000022'] loop
  if exists(select 1 from public.attendees where plan_id='e1100000-0000-4000-8000-000000000003' and user_id=u::uuid) then raise exception 'The revoked guest % is still a guest', u; end if;
  if exists(select 1 from public.plan_admins where plan_id='e1100000-0000-4000-8000-000000000003' and user_id=u::uuid) then raise exception 'The revoked guest % kept the admin role', u; end if;
  if private.is_host('e1100000-0000-4000-8000-000000000003',u::uuid) then raise exception 'The revoked guest % is still a host', u; end if;
  if u::uuid in (select private.host_ids('e1100000-0000-4000-8000-000000000003')) then raise exception 'host_ids still lists %', u; end if;
 end loop;
 -- remove_admin works: the guest stays, the role goes; a pending invitee and a stranger were never hosts.
 if exists(select 1 from public.plan_admins where plan_id='e1100000-0000-4000-8000-000000000003' and user_id='e1000000-0000-4000-8000-000000000024')
  or private.is_host('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000024')
  or not exists(select 1 from public.attendees where plan_id='e1100000-0000-4000-8000-000000000003' and user_id='e1000000-0000-4000-8000-000000000024')
  then raise exception 'remove_admin should end the role and keep the guest'; end if;
 if private.is_host('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000023')
  or private.is_host('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000099') then raise exception 'A pending invitee or a stranger is a host'; end if;
 if (select array_agg(h) from private.host_ids('e1100000-0000-4000-8000-000000000003') h)<>array['e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002']::uuid[]
  then raise exception 'host_ids should be the owner and the remaining admin'; end if;
 -- Defence in depth: an admin row without a guest row (or a withdrawn one) is not a host.
 insert into public.plan_admins(plan_id,user_id,appointed_by) values('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000023','e1000000-0000-4000-8000-000000000001');
 update public.attendees set response='withdrawn' where plan_id='e1100000-0000-4000-8000-000000000003' and user_id='e1000000-0000-4000-8000-000000000023';
 if private.is_host('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000023')
  or 'e1000000-0000-4000-8000-000000000023'::uuid in (select private.host_ids('e1100000-0000-4000-8000-000000000003')) then raise exception 'A withdrawn guest with a stray admin row is a host'; end if;
 delete from public.plan_admins where plan_id='e1100000-0000-4000-8000-000000000003' and user_id='e1000000-0000-4000-8000-000000000023';
end $$;
set local role authenticated;

-- A plain guest is not a host.
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin
 begin perform public.plan_link('e1100000-0000-4000-8000-000000000003'); raise exception 'A plain guest read the link';
 exception when insufficient_privilege then if sqlerrm<>'Active plan owner required' then raise exception 'Wrong message: %', sqlerrm; end if; end;
 begin perform public.invite_contacts('e1100000-0000-4000-8000-000000000003', jsonb_build_array(jsonb_build_object('phone','447700900699','country','44','code',repeat('L',22))));
  raise exception 'A plain guest invited'; exception when insufficient_privilege then null; end;
 begin perform public.remove_guest('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000007'); raise exception 'A plain guest removed a guest';
 exception when insufficient_privilege then null; end;
 begin perform public.change_plan_v3('e1100000-0000-4000-8000-000000000003',1,'Admin night','',array['community'],'2099-06-03 19:00+00','2099-06-03 22:00+00','UTC','Other park','');
  raise exception 'A plain guest changed the plan'; exception when insufficient_privilege then null; end;
 begin perform public.decide_join_request('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000006',true); raise exception 'A plain guest decided a request';
 exception when insufficient_privilege then null; end;
 begin perform public.plan_phone_invitations('e1100000-0000-4000-8000-000000000003'); raise exception 'A plain guest listed invitations';
 exception when insufficient_privilege then null; end;
 begin perform public.plan_join_requests('e1100000-0000-4000-8000-000000000003'); raise exception 'A plain guest listed requests';
 exception when insufficient_privilege then null; end;
 begin perform public.set_guest_note('e1100000-0000-4000-8000-000000000003','Hello'); raise exception 'A plain guest wrote the note';
 exception when insufficient_privilege then null; end;
 begin perform public.set_plan_cover_description('e1100000-0000-4000-8000-000000000003','',0); raise exception 'A plain guest set the cover description';
 exception when insufficient_privilege then null; end;
 begin insert into storage.objects(bucket_id,name) values('plan-covers','e1000000-0000-4000-8000-000000000001/e1100000-0000-4000-8000-000000000003/x.jpg');
  raise exception 'A plain guest uploaded a cover'; exception when insufficient_privilege then null; end;
end $$;

-- A person asks to join through the link (the owner reads it first): both hosts get the join_request notice.
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into cr1_codes(name,code) select 'link', public.plan_link('e1100000-0000-4000-8000-000000000003');
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000006","role":"authenticated"}',true);
select public.request_to_join((select code from cr1_codes where name='link'),null,'accepted',null);
reset role;
do $$ begin
 if (select count(*) from private.notification_outbox where plan_id='e1100000-0000-4000-8000-000000000003' and kind='join_request'
   and actor_id='e1000000-0000-4000-8000-000000000006' and recipient_id in ('e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002'))<>2
  then raise exception 'join_request should reach the owner and the admin'; end if;
end $$;

-- The admin does what a host does.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 if public.plan_link('e1100000-0000-4000-8000-000000000003')<>(select code from cr1_codes where name='link') then raise exception 'The admin sees another link'; end if;
 if public.change_plan_v3('e1100000-0000-4000-8000-000000000003',1,'Admin night','',array['community'],'2099-06-03 19:00+00','2099-06-03 22:00+00','UTC','New park','')<>2
  then raise exception 'The admin could not change the place'; end if;
 r := public.invite_contacts('e1100000-0000-4000-8000-000000000003', jsonb_build_array(jsonb_build_object('phone','447700900609','country','44','code',repeat('J',22))));
 if jsonb_array_length(r)<>1 then raise exception 'The admin could not invite'; end if;
 if jsonb_array_length(public.plan_phone_invitations('e1100000-0000-4000-8000-000000000003'))<>1 then raise exception 'The admin should list the invitation'; end if;
 if jsonb_array_length(public.plan_join_requests('e1100000-0000-4000-8000-000000000003'))<>1 then raise exception 'The admin should list the waiting request'; end if;
 perform public.decide_join_request('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000006',true);
 if not exists(select 1 from public.attendees where plan_id='e1100000-0000-4000-8000-000000000003' and user_id='e1000000-0000-4000-8000-000000000006')
  then raise exception 'The admin could not approve'; end if;
 perform public.revoke_phone_invitation('e1100000-0000-4000-8000-000000000003','447700900609');
 perform public.remove_guest('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000007');
 if exists(select 1 from public.attendees where plan_id='e1100000-0000-4000-8000-000000000003' and user_id='e1000000-0000-4000-8000-000000000007')
  then raise exception 'The admin could not remove a guest'; end if;
 if public.set_guest_note('e1100000-0000-4000-8000-000000000003','Bring a coat')->>'guest_note'<>'Bring a coat' then raise exception 'The admin could not write the note'; end if;
 -- The organizer is never a guest: their number is 'already' for an admin, and an admin cannot remove them.
 r := public.invite_contacts('e1100000-0000-4000-8000-000000000003', jsonb_build_array(jsonb_build_object('phone','447700900601','country','44','code',repeat('N',22))));
 if r->0->>'kind' is distinct from 'already' then raise exception 'The organizer''s number should be already for an admin: %', r; end if;
 begin perform public.remove_guest('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000001'); raise exception 'An admin removed the organizer';
 exception when insufficient_privilege then if sqlerrm<>'The organizer cannot be removed' then raise exception 'Wrong message: %', sqlerrm; end if; end;
 -- The cover: the object stays in the owner's folder, the uploader is the admin.
 insert into storage.objects(bucket_id,name) values('plan-covers','e1000000-0000-4000-8000-000000000001/e1100000-0000-4000-8000-000000000003/a.jpg');
 if public.set_plan_cover_if_current('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000001/e1100000-0000-4000-8000-000000000003/a.jpg',null,0)->>'cover_revision' is null
  then raise exception 'The admin could not set the cover'; end if;
 if public.set_plan_cover_description('e1100000-0000-4000-8000-000000000003','A park',1)->>'cover_description'<>'A park' then raise exception 'The admin could not describe the cover'; end if;
 -- Not into the admin's own folder.
 begin insert into storage.objects(bucket_id,name) values('plan-covers','e1000000-0000-4000-8000-000000000002/e1100000-0000-4000-8000-000000000003/b.jpg');
  raise exception 'A cover went into the admin folder'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if exists(select 1 from public.attendees where plan_id='e1100000-0000-4000-8000-000000000003' and user_id='e1000000-0000-4000-8000-000000000001')
  or exists(select 1 from private.notification_outbox where plan_id='e1100000-0000-4000-8000-000000000003' and kind='invited' and recipient_id='e1000000-0000-4000-8000-000000000001')
  or exists(select 1 from private.phone_invitations where plan_id='e1100000-0000-4000-8000-000000000003' and phone='447700900601')
  then raise exception 'The admin made the organizer a guest'; end if;
 -- The admin's note reached the owner and the guests; the admin was the actor, so not the admin.
 if (select count(*) from private.notification_outbox where plan_id='e1100000-0000-4000-8000-000000000003' and kind='guest_note' and recipient_id='e1000000-0000-4000-8000-000000000001')<>1
  then raise exception 'The owner should get the admin''s note notice'; end if;
 if exists(select 1 from private.notification_outbox where plan_id='e1100000-0000-4000-8000-000000000003' and kind='guest_note' and recipient_id='e1000000-0000-4000-8000-000000000002')
  then raise exception 'The admin should not be told of their own note'; end if;
 if (select count(*) from private.notification_outbox where plan_id='e1100000-0000-4000-8000-000000000003' and kind='guest_note' and recipient_id='e1000000-0000-4000-8000-000000000004')<>1
  then raise exception 'The guest should get the note notice'; end if;
end $$;

-- A guest's reply reaches the owner and the admin; the admin's own reply reaches the owner only.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select public.respond('e1100000-0000-4000-8000-000000000003','maybe',1);
reset role;
do $$ declare o bigint; begin
 if (select count(*) from private.notification_outbox where plan_id='e1100000-0000-4000-8000-000000000003' and kind='rsvp' and actor_id='e1000000-0000-4000-8000-000000000004'
   and recipient_id in ('e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002'))<>2 then raise exception 'rsvp should reach the owner and the admin'; end if;
 select id into o from private.notification_outbox where plan_id='e1100000-0000-4000-8000-000000000003' and kind='rsvp' and actor_id='e1000000-0000-4000-8000-000000000004'
  and recipient_id='e1000000-0000-4000-8000-000000000002';
 if not private.notification_recipient_eligible(o) then raise exception 'The admin''s rsvp notice should be eligible'; end if;
 -- Demoted (the inner block is undone): still a Going guest, no longer told of answers.
 begin
  delete from public.plan_admins where plan_id='e1100000-0000-4000-8000-000000000003' and user_id='e1000000-0000-4000-8000-000000000002';
  if (select response from public.attendees where plan_id='e1100000-0000-4000-8000-000000000003' and user_id='e1000000-0000-4000-8000-000000000002')<>'accepted'
   then raise exception 'The demoted admin should still be going'; end if;
  if private.notification_recipient_eligible(o) then raise exception 'An rsvp notice to a demoted admin is eligible'; end if;
  raise exception 'cr1-undo';
 exception when raise_exception then if sqlerrm<>'cr1-undo' then raise; end if; end;
 if not private.notification_recipient_eligible(o) then raise exception 'The demotion was not undone'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.respond('e1100000-0000-4000-8000-000000000003','maybe',1);
reset role;
do $$ begin
 if (select count(*) from private.notification_outbox where plan_id='e1100000-0000-4000-8000-000000000003' and kind='rsvp' and actor_id='e1000000-0000-4000-8000-000000000002')<>1
  or not exists(select 1 from private.notification_outbox where plan_id='e1100000-0000-4000-8000-000000000003' and kind='rsvp' and actor_id='e1000000-0000-4000-8000-000000000002' and recipient_id='e1000000-0000-4000-8000-000000000001')
  then raise exception 'The admin''s reply should reach the owner only'; end if;
end $$;

-- A guest who joins by a personal link: both hosts are told (the invitation notice).
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.create_invite('e1200000-0000-4000-8000-000000000011','e1100000-0000-4000-8000-000000000003',repeat('d',64));
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000007","role":"authenticated"}',true);
select public.claim_invite(repeat('d',64));
reset role;
do $$ begin
 if (select count(*) from private.notification_outbox where plan_id='e1100000-0000-4000-8000-000000000003' and kind='invitation' and actor_id='e1000000-0000-4000-8000-000000000007'
   and recipient_id in ('e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002'))<>2 then raise exception 'invitation should reach the owner and the admin'; end if;
end $$;

-- remove_guest on an admin removes the admin row (the second admin).
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.appoint_admin('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000005');
-- An admin cannot remove another admin.
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 begin perform public.remove_guest('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000005'); raise exception 'An admin removed an admin';
 exception when insufficient_privilege then if sqlerrm<>'Owner required' then raise exception 'Wrong message: %', sqlerrm; end if; end;
 if not exists(select 1 from public.plan_admins where plan_id='e1100000-0000-4000-8000-000000000003' and user_id='e1000000-0000-4000-8000-000000000005') then raise exception 'The admin row went anyway'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.remove_guest('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000005');
reset role;
do $$ begin
 if exists(select 1 from public.plan_admins where plan_id='e1100000-0000-4000-8000-000000000003' and user_id='e1000000-0000-4000-8000-000000000005')
  then raise exception 'remove_guest left the admin row'; end if;
end $$;

-- remove_admin: the owner takes the role back, with no notice, and the guest stays on the event.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.appoint_admin('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000006');
select public.remove_admin('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000006');
reset role;
do $$ begin
 if exists(select 1 from public.plan_admins where user_id='e1000000-0000-4000-8000-000000000006') then raise exception 'remove_admin left the row'; end if;
 if not exists(select 1 from public.attendees where plan_id='e1100000-0000-4000-8000-000000000003' and user_id='e1000000-0000-4000-8000-000000000006') then raise exception 'remove_admin removed the guest'; end if;
 if (select count(*) from private.notification_outbox where kind='admin_added' and recipient_id='e1000000-0000-4000-8000-000000000006')<>1
  then raise exception 'remove_admin should queue nothing more'; end if;
end $$;

-- Can't go through the invited number ends the role too (08 is invited by number before they have an account).
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.invite_contacts('e1100000-0000-4000-8000-000000000003', jsonb_build_array(jsonb_build_object('phone','447700900608','country','44','code',repeat('M',22))));
reset role;
insert into auth.users(id,phone,phone_confirmed_at) values ('e1000000-0000-4000-8000-000000000008','447700900608',now());
insert into public.profiles(id,display_name) values ('e1000000-0000-4000-8000-000000000008','Invitee eight');
insert into private.age_attestations(user_id,terms_version) values ('e1000000-0000-4000-8000-000000000008','2026-09');
insert into private.app_sessions(user_id) values ('e1000000-0000-4000-8000-000000000008');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000008","role":"authenticated"}',true);
select public.answer_phone_invitation(repeat('M',22),null,'accepted','2026-10');
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.appoint_admin('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000008');
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000008","role":"authenticated"}',true);
select public.plan_link('e1100000-0000-4000-8000-000000000003');
select public.answer_phone_invitation(repeat('M',22),null,'declined','2026-10');
do $$ begin
 begin perform public.plan_link('e1100000-0000-4000-8000-000000000003'); raise exception 'A declined phone admin still reads the link';
 exception when insufficient_privilege then if sqlerrm<>'Active plan owner required' then raise exception 'Wrong message: %', sqlerrm; end if; end;
end $$;
reset role;
do $$ begin
 if exists(select 1 from public.plan_admins where user_id='e1000000-0000-4000-8000-000000000008') then raise exception 'Declining by number kept the role'; end if;
end $$;

-- Withdrawing ends it as well (04 is made a Going guest and an admin directly).
update public.attendees set response='accepted' where plan_id='e1100000-0000-4000-8000-000000000003' and user_id='e1000000-0000-4000-8000-000000000004';
insert into public.plan_admins(plan_id,user_id,appointed_by) values('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000004','e1000000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select public.respond('e1100000-0000-4000-8000-000000000003','withdrawn',2);
reset role;
do $$ begin
 if exists(select 1 from public.plan_admins where user_id='e1000000-0000-4000-8000-000000000004') then raise exception 'Withdrawing kept the role'; end if;
end $$;

-- Deleting an account that is an admin (or appointed one) removes the rows instead of failing.
insert into public.plan_admins(plan_id,user_id,appointed_by) values('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000004','e1000000-0000-4000-8000-000000000001');
delete from public.attendees where user_id='e1000000-0000-4000-8000-000000000004';
delete from public.profiles where id='e1000000-0000-4000-8000-000000000004';
do $$ begin
 if exists(select 1 from public.plan_admins where user_id='e1000000-0000-4000-8000-000000000004') then raise exception 'The admin row outlived the profile'; end if;
end $$;

-- The admin answers Can't go: the role ends with the answer.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.respond('e1100000-0000-4000-8000-000000000003','declined',2);
do $$ begin
 begin perform public.plan_link('e1100000-0000-4000-8000-000000000003'); raise exception 'A declined admin still reads the link';
 exception when insufficient_privilege then if sqlerrm<>'Active plan owner required' then raise exception 'Wrong message: %', sqlerrm; end if; end;
end $$;
reset role;
do $$ begin
 if exists(select 1 from public.plan_admins where user_id='e1000000-0000-4000-8000-000000000002') then raise exception 'The declined admin kept the role'; end if;
end $$;

-- An admin may remove themself: their guest row and their admin row go (06, appointed again).
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.appoint_admin('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000006');
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000006","role":"authenticated"}',true);
select public.remove_guest('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000006');
reset role;
do $$ begin
 if exists(select 1 from public.plan_admins where plan_id='e1100000-0000-4000-8000-000000000003' and user_id='e1000000-0000-4000-8000-000000000006')
  or exists(select 1 from public.attendees where plan_id='e1100000-0000-4000-8000-000000000003' and user_id='e1000000-0000-4000-8000-000000000006')
  then raise exception 'The admin could not remove themself'; end if;
end $$;
rollback;

-- Slice 3: plans v4 (CR-D6, CR-P9, CR-D16, CR-D15, CR-P17, CR-P18). Users: 01 owner, 02 admin, 03 Going guest, 04 pending
-- guest, 05 declined guest, 06 Maybe guest, 07 a plain stranger.
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('e1000000-0000-4000-8000-000000000001','cr1-owner@resbite-test.invalid',now()),
 ('e1000000-0000-4000-8000-000000000002','cr1-guest-a@resbite-test.invalid',now()),
 ('e1000000-0000-4000-8000-000000000003','cr1-guest-b@resbite-test.invalid',now()),
 ('e1000000-0000-4000-8000-000000000004','cr1-guest-c@resbite-test.invalid',now()),
 ('e1000000-0000-4000-8000-000000000005','cr1-guest-d@resbite-test.invalid',now()),
 ('e1000000-0000-4000-8000-000000000006','cr1-guest-e@resbite-test.invalid',now());
insert into private.tester_roster(email) values ('cr1-owner@resbite-test.invalid'),('cr1-guest-a@resbite-test.invalid'),
 ('cr1-guest-b@resbite-test.invalid'),('cr1-guest-c@resbite-test.invalid'),('cr1-guest-d@resbite-test.invalid'),('cr1-guest-e@resbite-test.invalid');
insert into public.profiles(id,display_name) values
 ('e1000000-0000-4000-8000-000000000001','Owner'),('e1000000-0000-4000-8000-000000000002','Admin A'),
 ('e1000000-0000-4000-8000-000000000003','Guest B'),('e1000000-0000-4000-8000-000000000004','Guest C'),
 ('e1000000-0000-4000-8000-000000000005','Guest D'),('e1000000-0000-4000-8000-000000000006','Guest E');

-- Creating.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 begin perform public.create_plan_v4('e1100000-0000-4000-8000-000000000010','No end','',array['community'],null,'2099-06-04 19:00+00',null,'UTC','Park',false,null,'');
  raise exception 'A plan without an end was created';
 exception when invalid_parameter_value then if sqlerrm<>'End time required' then raise exception 'Wrong message: %', sqlerrm; end if; end;
 begin perform public.create_plan_v4('e1100000-0000-4000-8000-000000000010','Long','',array['community'],null,'2099-06-04 19:00+00','2099-06-07 19:00+00','UTC','Park',false,null,'');
  raise exception 'A three day plan was created';
 exception when invalid_parameter_value then if sqlerrm<>'Invalid end time' then raise exception 'Wrong message: %', sqlerrm; end if; end;
 begin perform public.create_plan_v4('e1100000-0000-4000-8000-000000000010','Backwards','',array['community'],null,'2099-06-04 19:00+00','2099-06-04 19:00+00','UTC','Park',false,null,'');
  raise exception 'An empty plan was created';
 exception when invalid_parameter_value then if sqlerrm<>'Invalid end time' then raise exception 'Wrong message: %', sqlerrm; end if; end;
 begin perform public.create_plan_v4('e1100000-0000-4000-8000-000000000010','Past','',array['community'],null,'2020-06-04 19:00+00','2020-06-04 21:00+00','UTC','Park',false,null,'');
  raise exception 'A plan in the past was created';
 exception when invalid_parameter_value then if sqlerrm<>'Invalid future schedule' then raise exception 'Wrong message: %', sqlerrm; end if; end;
 begin perform public.create_plan_v4('e1100000-0000-4000-8000-000000000010','Three','',array['community'],null,'2099-06-04 19:00+00','2099-06-04 22:00+00','UTC','Park',false,3::smallint,'');
  raise exception 'Repeat 3 was accepted';
 exception when invalid_parameter_value then null; end;
 -- To be decided: the label is fixed, the place is empty.
 if public.create_plan_v4('e1100000-0000-4000-8000-000000000011','Place later','',array['community'],null,'2099-06-04 19:00+00','2099-06-04 22:00+00','UTC','',true,1::smallint,'',51.5,-0.1)
  <>'e1100000-0000-4000-8000-000000000011'::uuid then raise exception 'Wrong id'; end if;
 if public.create_plan_v4('e1100000-0000-4000-8000-000000000011','Place later','',array['community'],null,'2099-06-04 19:00+00','2099-06-04 22:00+00','UTC','',true,1::smallint,'',51.5,-0.1)
  <>'e1100000-0000-4000-8000-000000000011'::uuid then raise exception 'The retry returned another id'; end if;
 begin perform public.create_plan_v4('e1100000-0000-4000-8000-000000000011','Place later','',array['community'],null,'2099-06-04 19:00+00','2099-06-04 22:00+00','UTC','',true,2::smallint,'',51.5,-0.1);
  raise exception 'A changed retry was accepted';
 exception when invalid_parameter_value then if sqlerrm<>'Creation identifier already used' then raise exception 'Wrong message: %', sqlerrm; end if; end;
 begin perform public.create_plan_v4('e1100000-0000-4000-8000-000000000011','Place later','',array['community'],null,'2099-06-04 19:00+00','2099-06-04 21:00+00','UTC','',true,1::smallint,'',51.5,-0.1);
  raise exception 'A retry with another end was accepted';
 exception when invalid_parameter_value then if sqlerrm<>'Creation identifier already used' then raise exception 'Wrong message: %', sqlerrm; end if; end;
 perform public.create_plan_v4('e1100000-0000-4000-8000-000000000012','Repeats','',array['community'],null,'2099-06-04 19:00+00','2099-06-04 22:00+00','UTC','Park',false,2::smallint,'bring a coat');
 perform public.create_plan_v4('e1100000-0000-4000-8000-000000000013','Repeats too','',array['community'],null,'2099-06-05 19:00+00','2099-06-05 22:00+00','UTC','Park',false,1::smallint,'');
 perform public.create_plan_v4('e1100000-0000-4000-8000-000000000014','Running','',array['community'],null,'2099-06-06 19:00+00','2099-06-06 22:00+00','UTC','Park',false,null,'');
end $$;
reset role;
do $$ declare p public.plans; begin
 select * into p from public.plans where id='e1100000-0000-4000-8000-000000000011';
 if p.place_label<>'To be decided' or not p.place_tbd or p.series_id<>p.id or p.repeats_from is not null or p.latitude is not null or p.longitude is not null or p.repeat_weeks<>1
  then raise exception 'Wrong To be decided row: %', to_jsonb(p); end if;
 if (select series_id from public.plans where id='e1100000-0000-4000-8000-000000000012')<>'e1100000-0000-4000-8000-000000000012'::uuid then raise exception 'series_id is not the id'; end if;
 if (select note from public.plan_meeting_details where plan_id='e1100000-0000-4000-8000-000000000012')<>'bring a coat' then raise exception 'The note was lost'; end if;
 if not has_function_privilege('authenticated','public.create_plan_v4(uuid,text,text,text[],text,timestamptz,timestamptz,text,text,boolean,smallint,text,double precision,double precision,text)','execute')
  or has_function_privilege('anon','public.create_plan_v4(uuid,text,text,text[],text,timestamptz,timestamptz,text,text,boolean,smallint,text,double precision,double precision,text)','execute')
  or not has_function_privilege('authenticated','public.change_plan_v4(uuid,integer,text,text,text[],timestamptz,timestamptz,text,text,boolean,smallint,text,text,boolean,boolean)','execute')
  or has_function_privilege('anon','public.change_plan_v4(uuid,integer,text,text,text[],timestamptz,timestamptz,text,text,boolean,smallint,text,text,boolean,boolean)','execute')
  then raise exception 'Wrong grants on the v4 functions'; end if;
end $$;

-- Roster for the notices: 02 admin (Going), 03 Going, 04 pending, 05 declined, 06 Maybe.
insert into public.attendees(plan_id,user_id,response)
 select p,u,r from unnest(array['e1100000-0000-4000-8000-000000000012','e1100000-0000-4000-8000-000000000013','e1100000-0000-4000-8000-000000000014']::uuid[]) p,
 (values ('e1000000-0000-4000-8000-000000000002'::uuid,'accepted'),('e1000000-0000-4000-8000-000000000003','accepted'),('e1000000-0000-4000-8000-000000000004','pending'),
  ('e1000000-0000-4000-8000-000000000005','declined'),('e1000000-0000-4000-8000-000000000006','maybe')) g(u,r);
insert into public.plan_admins(plan_id,user_id,appointed_by)
 select p,'e1000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000001'
 from unnest(array['e1100000-0000-4000-8000-000000000012','e1100000-0000-4000-8000-000000000013','e1100000-0000-4000-8000-000000000014']::uuid[]) p;

-- plan_admins: a pending guest lists none, a Going guest sees the admin.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin
 if (select count(*) from public.plan_admins where plan_id='e1100000-0000-4000-8000-000000000012')<>0 then raise exception 'A pending guest lists the admins'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 if (select count(*) from public.plan_admins where plan_id='e1100000-0000-4000-8000-000000000012')<>1 then raise exception 'A Going guest should see the admin'; end if;
end $$;
-- A guest is not a host.
do $$ begin
 begin perform public.change_plan_v4('e1100000-0000-4000-8000-000000000012',1,'Repeats','',array['community'],'2099-06-04 19:00+00','2099-06-04 22:00+00','UTC','Park',false,2::smallint,'','');
  raise exception 'A guest changed the plan';
 exception when insufficient_privilege then if sqlerrm<>'Host required' then raise exception 'Wrong message: %', sqlerrm; end if; end;
 begin perform public.change_plan_v4('e1100000-0000-4000-8000-000000000012',1,null,null,null,null,null,null,null,null,null,null,null,true);
  raise exception 'A guest cancelled the plan';
 exception when insufficient_privilege then if sqlerrm<>'Host required' then raise exception 'Wrong message: %', sqlerrm; end if; end;
end $$;

-- The admin moves the place: the owner and the guests who may come hear of it, the admin and the declined guest do not.
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if public.change_plan_v4('e1100000-0000-4000-8000-000000000012',1,'Repeats','',array['community'],'2099-06-04 19:00+00','2099-06-04 22:00+00','UTC','New park',false,2::smallint,'bring a coat','')<>2
  then raise exception 'The admin could not change the place'; end if;
 begin perform public.change_plan_v4('e1100000-0000-4000-8000-000000000012',1,'Repeats','',array['community'],'2099-06-04 19:00+00','2099-06-04 22:00+00','UTC','Again',false,2::smallint,'','');
  raise exception 'A stale version was accepted';
 exception when serialization_failure then null; end;
 begin perform public.change_plan_v4('e1100000-0000-4000-8000-000000000012',2,'Repeats','',array['community'],'2099-06-04 19:00+00',null,'UTC','Again',false,2::smallint,'','');
  raise exception 'An edit without an end was accepted';
 exception when invalid_parameter_value then if sqlerrm<>'End time required' then raise exception 'Wrong message: %', sqlerrm; end if; end;
 begin perform public.change_plan_v4('e1100000-0000-4000-8000-000000000012',2,'Repeats','',array['community'],'2099-06-04 19:00+00','2099-06-07 19:00+00','UTC','Again',false,2::smallint,'','');
  raise exception 'A three day end was accepted';
 exception when invalid_parameter_value then if sqlerrm<>'Invalid end time' then raise exception 'Wrong message: %', sqlerrm; end if; end;
 begin perform public.change_plan_v4('e1100000-0000-4000-8000-000000000012',2,'Repeats','',array['community'],'2099-06-04 19:00+00','2099-06-04 22:00+00','UTC','Again',false,3::smallint,'','');
  raise exception 'Repeat 3 was accepted';
 exception when invalid_parameter_value then null; end;
end $$;
reset role;
do $$ declare d text; begin
 for d in select unnest(array['e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000004','e1000000-0000-4000-8000-000000000006']) loop
  if (select count(*) from private.notification_outbox where plan_id='e1100000-0000-4000-8000-000000000012' and kind='plan_changed' and detail='place' and recipient_id=d::uuid and actor_id='e1000000-0000-4000-8000-000000000002')<>1
   then raise exception 'Recipient % was not told of the place', d; end if;
 end loop;
 if exists(select 1 from private.notification_outbox where plan_id='e1100000-0000-4000-8000-000000000012' and kind='plan_changed' and recipient_id in ('e1000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000005'))
  then raise exception 'The admin or the declined guest was told'; end if;
 if (select count(*) from private.notification_outbox where plan_id='e1100000-0000-4000-8000-000000000012' and kind='plan_changed')<>4 then raise exception 'Wrong number of change notices'; end if;
end $$;

-- The owner changes only the repeat: nothing is sent. Title, note and end alone send nothing either.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.change_plan_v4('e1100000-0000-4000-8000-000000000012',2,'Repeats','',array['community'],'2099-06-04 19:00+00','2099-06-04 22:00+00','UTC','New park',false,1::smallint,'bring a coat','');
select public.change_plan_v4('e1100000-0000-4000-8000-000000000012',3,'Renamed','More',array['community','creative'],'2099-06-04 19:00+00','2099-06-04 22:00+00','UTC','New park',false,1::smallint,'a note','Soho');
reset role;
do $$ begin
 if (select count(*) from private.notification_outbox where plan_id='e1100000-0000-4000-8000-000000000012')<>4 then raise exception 'A repeat-only or text-only change sent a notice'; end if;
 if (select repeat_weeks from public.plans where id='e1100000-0000-4000-8000-000000000012')<>1 then raise exception 'The repeat did not change'; end if;
 if (select version from public.plans where id='e1100000-0000-4000-8000-000000000012')<>4 then raise exception 'Version not bumped'; end if;
end $$;
-- A new end alone is a time change (v4): the same recipients as a start change are told, with detail 'time'.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.change_plan_v4('e1100000-0000-4000-8000-000000000012',4,'Renamed','More',array['community','creative'],'2099-06-04 19:00+00','2099-06-04 23:00+00','UTC','New park',false,1::smallint,'a note','Soho');
reset role;
do $$ declare d text; begin
 for d in select unnest(array['e1000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000004','e1000000-0000-4000-8000-000000000006']) loop
  if (select count(*) from private.notification_outbox where plan_id='e1100000-0000-4000-8000-000000000012' and kind='plan_changed' and detail='time' and recipient_id=d::uuid)<>1
   then raise exception 'Recipient % was not told of the new end', d; end if;
 end loop;
 if exists(select 1 from private.notification_outbox where plan_id='e1100000-0000-4000-8000-000000000012' and kind='plan_changed' and detail='time' and recipient_id in ('e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000005'))
  then raise exception 'The owner or the declined guest was told of the end'; end if;
end $$;
-- Setting the place to be decided is a place change; the admin hears of it from the owner too.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.change_plan_v4('e1100000-0000-4000-8000-000000000012',5,'Renamed','More',array['community','creative'],'2099-06-04 19:00+00','2099-06-04 23:00+00','UTC','',true,1::smallint,'a note','Soho');
select public.change_plan_v4('e1100000-0000-4000-8000-000000000012',6,'Renamed','More',array['community','creative'],'2099-06-04 20:00+00','2099-06-04 23:00+00','UTC','Cafe',false,1::smallint,'a note','Soho');
reset role;
do $$ begin
 if (select place_label||place_tbd::text from public.plans where id='e1100000-0000-4000-8000-000000000012')<>'Cafefalse' then raise exception 'Place not stored'; end if;
 if (select count(*) from private.notification_outbox where plan_id='e1100000-0000-4000-8000-000000000012' and kind='plan_changed' and recipient_id='e1000000-0000-4000-8000-000000000002' and detail='place')<>1
  then raise exception 'The admin should be told of the to-be-decided place'; end if;
 if (select count(*) from private.notification_outbox where plan_id='e1100000-0000-4000-8000-000000000012' and kind='plan_changed' and recipient_id='e1000000-0000-4000-8000-000000000002' and detail='time_place')<>1
  then raise exception 'The admin should be told of the time and place'; end if;
 if (select count(*) from private.notification_outbox where plan_id='e1100000-0000-4000-8000-000000000012' and kind='plan_changed' and recipient_id='e1000000-0000-4000-8000-000000000001')<>1
  then raise exception 'The owner got a notice of their own change'; end if;
end $$;

-- The old build (v3) saving a To be decided plan stores a real place and clears the flag; the table refuses the mix.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.change_plan_v4('e1100000-0000-4000-8000-000000000013',1,'Repeats too','',array['community'],'2099-06-05 19:00+00','2099-06-05 22:00+00','UTC','',true,1::smallint,'','');
do $$ begin
 if (select place_tbd from public.plans where id='e1100000-0000-4000-8000-000000000013') is not true then raise exception 'The plan is not To be decided'; end if;
 if public.change_plan_v3('e1100000-0000-4000-8000-000000000013',2,'Repeats too','',array['community'],'2099-06-05 19:00+00','2099-06-05 22:00+00','UTC','Real park','')<>3 then raise exception 'v3 did not save'; end if;
end $$;
reset role;
do $$ begin
 if (select place_label||place_tbd::text from public.plans where id='e1100000-0000-4000-8000-000000000013')<>'Real parkfalse' then raise exception 'v3 left the flag on a real place'; end if;
 begin update public.plans set place_tbd=true where id='e1100000-0000-4000-8000-000000000013';
  raise exception 'To be decided with a real label was stored';
 exception when check_violation then null; end;
end $$;

-- Cancelling: the admin with stop-repeating ends the series; without it the repeat stays.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.change_plan_v4('e1100000-0000-4000-8000-000000000012',7,null,null,null,null,null,null,null,null,null,null,null,true,true);
select public.change_plan_v4('e1100000-0000-4000-8000-000000000013',3,null,null,null,null,null,null,null,null,null,null,null,true);
reset role;
do $$ declare d text; begin
 if (select status||coalesce(repeat_weeks::text,'-') from public.plans where id='e1100000-0000-4000-8000-000000000012')<>'cancelled-' then raise exception 'Stop repeating did not clear the repeat'; end if;
 if (select status||repeat_weeks::text from public.plans where id='e1100000-0000-4000-8000-000000000013')<>'cancelled1' then raise exception 'A plain cancel changed the repeat'; end if;
 for d in select unnest(array['e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000004','e1000000-0000-4000-8000-000000000005','e1000000-0000-4000-8000-000000000006']) loop
  if (select count(*) from private.notification_outbox where plan_id='e1100000-0000-4000-8000-000000000012' and kind='plan_cancelled' and recipient_id=d::uuid)<>1
   then raise exception 'Recipient % was not told of the cancellation', d; end if;
 end loop;
 if exists(select 1 from private.notification_outbox where plan_id in ('e1100000-0000-4000-8000-000000000012','e1100000-0000-4000-8000-000000000013') and kind='plan_cancelled' and recipient_id='e1000000-0000-4000-8000-000000000002')
  then raise exception 'The admin was told of their own cancellation'; end if;
 if (select count(*) from private.notification_outbox where plan_id='e1100000-0000-4000-8000-000000000013' and kind='plan_cancelled')<>5 then raise exception 'Wrong number of cancel notices'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 begin perform public.change_plan_v4('e1100000-0000-4000-8000-000000000012',8,'Repeats','',array['community'],'2099-06-04 19:00+00','2099-06-04 22:00+00','UTC','Park',false,null,'','');
  raise exception 'A cancelled plan was changed';
 exception when invalid_parameter_value then if sqlerrm<>'Plan unavailable' then raise exception 'Wrong message: %', sqlerrm; end if; end;
end $$;
reset role;

-- A running plan (started an hour ago): the same start with a later end is fine, an end in the past is not.
update public.plans set starts_at=now()-interval '1 hour', ends_at=now()+interval '1 hour' where id='e1100000-0000-4000-8000-000000000014';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare s timestamptz := (select starts_at from public.plans where id='e1100000-0000-4000-8000-000000000014'); begin
 if public.change_plan_v4('e1100000-0000-4000-8000-000000000014',1,'Running','',array['community'],s,now()+interval '2 hours','UTC','Park',false,null,'','')<>2
  then raise exception 'A running plan could not get a later end'; end if;
 begin perform public.change_plan_v4('e1100000-0000-4000-8000-000000000014',2,'Running','',array['community'],s,now()-interval '5 minutes','UTC','Park',false,null,'','');
  raise exception 'A running plan was given an end in the past';
 exception when invalid_parameter_value then if sqlerrm<>'Plan unavailable' then raise exception 'Wrong message: %', sqlerrm; end if; end;
 begin perform public.change_plan_v4('e1100000-0000-4000-8000-000000000014',2,'Running','',array['community'],s,null,'UTC','Park',false,null,'','');
  raise exception 'A running plan was given no end';
 exception when invalid_parameter_value then if sqlerrm<>'End time required' then raise exception 'Wrong message: %', sqlerrm; end if; end;
 -- The old build: v3 with no end, or an end in the past, on a running plan.
 begin perform public.change_plan_v3('e1100000-0000-4000-8000-000000000014',2,'Running','',array['community'],s,null,'UTC','Park','');
  raise exception 'v3 closed a running plan with no end';
 exception when invalid_parameter_value then if sqlerrm<>'Plan unavailable' then raise exception 'Wrong message: %', sqlerrm; end if; end;
 begin perform public.change_plan_v3('e1100000-0000-4000-8000-000000000014',2,'Running','',array['community'],s,now()-interval '5 minutes','UTC','Park','');
  raise exception 'v3 ended a running plan in the past';
 exception when invalid_parameter_value then if sqlerrm<>'Plan unavailable' then raise exception 'Wrong message: %', sqlerrm; end if; end;
 if public.change_plan_v3('e1100000-0000-4000-8000-000000000014',2,'Running','',array['community'],s,now()+interval '3 hours','UTC','Park','')<>3
  then raise exception 'v3 could not extend a running plan'; end if;
 -- The meeting details: a text sets them, a null note leaves them as they are, an empty one removes them.
 perform public.change_plan_v4('e1100000-0000-4000-8000-000000000014',3,'Running','',array['community'],s,now()+interval '3 hours','UTC','Park',false,null,'Door code 1234','');
 if (select note from public.plan_meeting_details where plan_id='e1100000-0000-4000-8000-000000000014') is distinct from 'Door code 1234' then raise exception 'The meeting details were not set'; end if;
 if public.change_plan_v4('e1100000-0000-4000-8000-000000000014',4,'Running','',array['community'],s,now()+interval '3 hours','UTC','Other park',false,null,null,'')<>5
  then raise exception 'A change with a null note failed'; end if;
 if (select note from public.plan_meeting_details where plan_id='e1100000-0000-4000-8000-000000000014') is distinct from 'Door code 1234'
  or not (select has_meeting_details from public.plans where id='e1100000-0000-4000-8000-000000000014')
  or (select place_label from public.plans where id='e1100000-0000-4000-8000-000000000014')<>'Other park'
  then raise exception 'A null note changed the meeting details'; end if;
 perform public.change_plan_v4('e1100000-0000-4000-8000-000000000014',5,'Running','',array['community'],s,now()+interval '3 hours','UTC','Other park',false,null,'','');
 if exists(select 1 from public.plan_meeting_details where plan_id='e1100000-0000-4000-8000-000000000014')
  or (select has_meeting_details from public.plans where id='e1100000-0000-4000-8000-000000000014') then raise exception 'An empty note did not remove the meeting details'; end if;
end $$;
reset role;

-- A cover path is never built from a missing owner. The column is nullable only where the deletion migration is applied,
-- so the check runs only there (the hosted baseline keeps it NOT NULL).
do $$ begin
 if (select is_nullable from information_schema.columns where table_schema='public' and table_name='plans' and column_name='owner_id')='YES' then
  update public.plans set owner_id=null where id='e1100000-0000-4000-8000-000000000014';
  insert into storage.objects(bucket_id,name) values('plan-covers','x/e1100000-0000-4000-8000-000000000014/a.jpg');
  set local role authenticated;
  perform set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
  begin perform public.set_plan_cover_if_current('e1100000-0000-4000-8000-000000000014','x/e1100000-0000-4000-8000-000000000014/a.jpg',null,0);
   raise exception 'A cover was set on a plan with no owner';
  exception when insufficient_privilege then if sqlerrm<>'Own uploaded cover required' then raise exception 'Wrong message: %', sqlerrm; end if; end;
  reset role;
 end if;
end $$;
rollback;

-- Slice 4: mutes (CR-D9, CR-P7, CR-P24). Users: 01 owner, 02 a Going guest, 03 another Going guest, 04 a stranger.
begin;
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values
 ('e1000000-0000-4000-8000-000000000001','cr1-owner@resbite-test.invalid',now(),null,null),
 ('e1000000-0000-4000-8000-000000000002','cr1-guest-a@resbite-test.invalid',now(),null,null),
 ('e1000000-0000-4000-8000-000000000003','cr1-guest-b@resbite-test.invalid',now(),null,null),
 ('e1000000-0000-4000-8000-000000000004','cr1-guest-c@resbite-test.invalid',now(),null,null);
insert into private.tester_roster(email) values ('cr1-owner@resbite-test.invalid'),('cr1-guest-a@resbite-test.invalid'),
 ('cr1-guest-b@resbite-test.invalid'),('cr1-guest-c@resbite-test.invalid');
insert into public.profiles(id,display_name) values
 ('e1000000-0000-4000-8000-000000000001','Owner'),('e1000000-0000-4000-8000-000000000002','Guest A'),
 ('e1000000-0000-4000-8000-000000000003','Guest B'),('e1000000-0000-4000-8000-000000000004','Stranger');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.create_plan_v3('e1100000-0000-4000-8000-000000000020','Mute night','',array['community'],null,
 '2099-06-06 19:00+00','2099-06-06 22:00+00','UTC','Park','');
reset role;
insert into public.attendees(plan_id,user_id,response) values
 ('e1100000-0000-4000-8000-000000000020','e1000000-0000-4000-8000-000000000002','accepted'),
 ('e1100000-0000-4000-8000-000000000020','e1000000-0000-4000-8000-000000000003','accepted');

do $$ begin
 if has_function_privilege('anon','public.set_plan_mute(uuid,boolean)','execute') then raise exception 'anon can execute set_plan_mute'; end if;
 if not has_function_privilege('authenticated','public.set_plan_mute(uuid,boolean)','execute') then raise exception 'authenticated cannot execute set_plan_mute'; end if;
 if has_table_privilege('authenticated','public.plan_mutes','insert') or has_table_privilege('authenticated','public.plan_mutes','update')
  or has_table_privilege('authenticated','public.plan_mutes','delete') then raise exception 'Clients can write plan_mutes directly'; end if;
end $$;

-- A stranger cannot mute.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin
 begin perform public.set_plan_mute('e1100000-0000-4000-8000-000000000020',true);
  raise exception 'A stranger muted the plan';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Before the mute: fresh notices to the guest and the owner are eligible.
insert into private.notification_outbox(plan_id,recipient_id,kind,actor_id,dedupe_key) values
 ('e1100000-0000-4000-8000-000000000020','e1000000-0000-4000-8000-000000000002','plan_changed','e1000000-0000-4000-8000-000000000001','cr1-mute-a'),
 ('e1100000-0000-4000-8000-000000000020','e1000000-0000-4000-8000-000000000001','rsvp','e1000000-0000-4000-8000-000000000002','cr1-mute-b'),
 ('e1100000-0000-4000-8000-000000000020','e1000000-0000-4000-8000-000000000003','plan_changed','e1000000-0000-4000-8000-000000000001','cr1-mute-c');
do $$ begin
 if not private.notification_recipient_eligible((select id from private.notification_outbox where dedupe_key='cr1-mute-a'))
  or not private.notification_recipient_eligible((select id from private.notification_outbox where dedupe_key='cr1-mute-b'))
  then raise exception 'Notices were not eligible before any mute'; end if;
end $$;

-- A Going guest mutes: true, one row, and their notices stop.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if public.set_plan_mute('e1100000-0000-4000-8000-000000000020',true) is not true then raise exception 'mute did not return true'; end if;
 if public.set_plan_mute('e1100000-0000-4000-8000-000000000020',true) is not true then raise exception 'a second mute did not return true'; end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from public.plan_mutes where user_id='e1000000-0000-4000-8000-000000000002'
   and series_id=(select series_id from public.plans where id='e1100000-0000-4000-8000-000000000020'))<>1 then raise exception 'Expected one mute row'; end if;
 if private.notification_recipient_eligible((select id from private.notification_outbox where dedupe_key='cr1-mute-a')) then raise exception 'plan_changed to a muted guest is eligible'; end if;
 if not private.notification_recipient_eligible((select id from private.notification_outbox where dedupe_key='cr1-mute-c')) then raise exception 'The mute silenced another guest'; end if;
end $$;

-- The owner mutes too: an rsvp notice to the muted owner is not eligible.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.set_plan_mute('e1100000-0000-4000-8000-000000000020',true);
reset role;
do $$ begin
 if private.notification_recipient_eligible((select id from private.notification_outbox where dedupe_key='cr1-mute-b')) then raise exception 'rsvp to a muted owner is eligible'; end if;
end $$;

-- Each person reads only their own row.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if (select count(*) from public.plan_mutes)<>1 or (select user_id from public.plan_mutes)<>'e1000000-0000-4000-8000-000000000002'
  then raise exception 'The guest did not see exactly their own mute'; end if;
 if exists(select 1 from public.plan_mutes where user_id='e1000000-0000-4000-8000-000000000001') then raise exception 'The guest saw the owner''s mute'; end if;
end $$;

-- Unmute: true, the row goes, and notices flow again.
do $$ begin
 if public.set_plan_mute('e1100000-0000-4000-8000-000000000020',false) is not false then raise exception 'unmute did not return false'; end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from public.plan_mutes where user_id='e1000000-0000-4000-8000-000000000002') then raise exception 'Unmute left the row'; end if;
 if not exists(select 1 from public.plan_mutes where user_id='e1000000-0000-4000-8000-000000000001') then raise exception 'Unmute removed the owner''s row'; end if;
 if not private.notification_recipient_eligible((select id from private.notification_outbox where dedupe_key='cr1-mute-a')) then raise exception 'Notice still blocked after unmute'; end if;
end $$;
rollback;

-- Slice 5: repeats (CR-D16, CR-P22 to CR-P26). Users: 01 owner, 02 admin (Going), 03 a Going guest who mutes, 04 a
-- Can't-go guest, 05 a pending guest, 06 a guest who withdrew, 07 a guest invited to the next occurrence only, 08 a
-- stranger, 09 an organizer who is leaving, 10 a Going guest who never used the app (they answered on the web), 11 a
-- Maybe guest who is leaving. The roll uses the real now(), so its checks are relative to it.
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('e1000000-0000-4000-8000-000000000001','cr1-owner@resbite-test.invalid',now()),
 ('e1000000-0000-4000-8000-000000000002','cr1-guest-a@resbite-test.invalid',now()),
 ('e1000000-0000-4000-8000-000000000003','cr1-guest-b@resbite-test.invalid',now()),
 ('e1000000-0000-4000-8000-000000000004','cr1-guest-c@resbite-test.invalid',now()),
 ('e1000000-0000-4000-8000-000000000005','cr1-guest-d@resbite-test.invalid',now()),
 ('e1000000-0000-4000-8000-000000000006','cr1-guest-e@resbite-test.invalid',now()),
 ('e1000000-0000-4000-8000-000000000007','cr1-guest-f@resbite-test.invalid',now()),
 ('e1000000-0000-4000-8000-000000000008','cr1-stranger@resbite-test.invalid',now()),
 ('e1000000-0000-4000-8000-000000000009','cr1-leaving@resbite-test.invalid',now()),
 ('e1000000-0000-4000-8000-000000000010','cr1-web-only@resbite-test.invalid',now()),
 ('e1000000-0000-4000-8000-000000000011','cr1-leaving-guest@resbite-test.invalid',now());
insert into private.tester_roster(email) values ('cr1-owner@resbite-test.invalid'),('cr1-guest-a@resbite-test.invalid'),
 ('cr1-guest-b@resbite-test.invalid'),('cr1-guest-c@resbite-test.invalid'),('cr1-guest-d@resbite-test.invalid'),
 ('cr1-guest-e@resbite-test.invalid'),('cr1-guest-f@resbite-test.invalid'),('cr1-stranger@resbite-test.invalid'),
 ('cr1-leaving@resbite-test.invalid'),('cr1-web-only@resbite-test.invalid'),('cr1-leaving-guest@resbite-test.invalid');
insert into public.profiles(id,display_name) values
 ('e1000000-0000-4000-8000-000000000001','Owner'),('e1000000-0000-4000-8000-000000000002','Admin A'),
 ('e1000000-0000-4000-8000-000000000003','Guest B'),('e1000000-0000-4000-8000-000000000004','Guest C'),
 ('e1000000-0000-4000-8000-000000000005','Guest D'),('e1000000-0000-4000-8000-000000000006','Guest E'),
 ('e1000000-0000-4000-8000-000000000007','Guest F'),('e1000000-0000-4000-8000-000000000008','Stranger'),
 ('e1000000-0000-4000-8000-000000000009','Leaving organizer'),('e1000000-0000-4000-8000-000000000010','Web only');
insert into public.profiles(id,display_name,deletion_requested_at) values ('e1000000-0000-4000-8000-000000000011','Leaving guest',now());
-- Everyone but 10 has used the app (11 too, before asking to leave).
insert into private.app_sessions(user_id) select ('e1000000-0000-4000-8000-0000000000'||n)::uuid
 from unnest(array['01','02','03','04','05','06','07','08','09','11']) n;

-- The next occurrence keeps the local time across the clock changes (Europe/London goes back on 25 Oct 2026 and
-- forward on 28 Mar 2027); with no change in between it is exactly 7 or 14 days on.
do $$ begin
 if private.next_occurrence('2026-10-22 18:00+00','Europe/London',1)<>'2026-10-29 19:00+00'::timestamptz
  then raise exception 'Across the October change: %', private.next_occurrence('2026-10-22 18:00+00','Europe/London',1); end if;
 if private.next_occurrence('2027-03-25 19:00+00','Europe/London',1)<>'2027-04-01 18:00+00'::timestamptz
  then raise exception 'Across the March change: %', private.next_occurrence('2027-03-25 19:00+00','Europe/London',1); end if;
 if private.next_occurrence('2026-10-22 18:00+00','Europe/London',2)<>'2026-11-05 19:00+00'::timestamptz
  or private.next_occurrence('2027-03-25 19:00+00','Europe/London',2)<>'2027-04-08 18:00+00'::timestamptz
  then raise exception 'Two weeks across a clock change moved the local time'; end if;
 if private.next_occurrence('2026-06-04 18:00+00','Europe/London',1)<>'2026-06-11 18:00+00'::timestamptz
  or private.next_occurrence('2026-06-04 18:00+00','Europe/London',2)<>'2026-06-18 18:00+00'::timestamptz
  then raise exception 'Without a clock change the next is not 7 or 14 days on'; end if;
 if private.next_occurrence(null,'Europe/London',1) is not null then raise exception 'A missing end gained one'; end if;
end $$;

-- Only the database runs the roll (pg_cron, as postgres): no API role may execute either function.
do $$ declare r text; begin
 foreach r in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(r,'private.roll_repeating_plans()','execute') or has_function_privilege(r,'private.next_occurrence(timestamptz,text,integer)','execute')
   then raise exception '% can execute the roll or its helper', r; end if;
 end loop;
end $$;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ begin
 begin perform private.roll_repeating_plans(); raise exception 'anon ran the roll';
 exception when insufficient_privilege then null; end;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 begin perform private.roll_repeating_plans(); raise exception 'authenticated ran the roll';
 exception when insufficient_privilege then null; end;
end $$;

-- The plans, all made in the future as the app makes them; the test then moves some into the past.
-- 30 weekly on Thursdays 19:00 to 22:00 London (rolls after it ends); 31 every two weeks, place to be decided (cancelled
-- just this once); 32 cancelled with stop repeating; 33 Doesn't repeat after an edit; 34 ended 30 days ago; 35 an old
-- plan with no end; 36 the leaving organizer's; 37 Sundays 01:30 to 02:15 London, the week before the clocks go forward
-- on 29 Mar 2099 (cancelled just this once).
select public.create_plan_v4('e1100000-0000-4000-8000-000000000030','Board game night','Bring a game',array['community'],null,
 '2099-06-04 18:00+00','2099-06-04 21:00+00','Europe/London','Park',false,1::smallint,'Ring the bell',51.5,-0.1,'Soho');
select public.create_plan_v4('e1100000-0000-4000-8000-000000000031','Quiz','',array['community'],null,
 '2099-06-11 18:00+00','2099-06-11 21:00+00','Europe/London','',true,2::smallint,'');
select public.create_plan_v4('e1100000-0000-4000-8000-000000000032','Stopped','',array['community'],null,
 '2099-06-11 18:00+00','2099-06-11 21:00+00','Europe/London','Park',false,1::smallint,'');
select public.create_plan_v4('e1100000-0000-4000-8000-000000000033','No longer repeats','',array['community'],null,
 '2099-06-11 18:00+00','2099-06-11 21:00+00','Europe/London','Park',false,1::smallint,'');
select public.create_plan_v4('e1100000-0000-4000-8000-000000000034','Long ago','',array['community'],null,
 '2099-06-04 18:00+00','2099-06-04 20:00+00','UTC','Park',false,1::smallint,'');
select public.create_plan_v4('e1100000-0000-4000-8000-000000000035','No end','',array['community'],null,
 '2099-06-04 18:00+00','2099-06-04 20:00+00','UTC','Park',false,1::smallint,'');
select public.create_plan_v4('e1100000-0000-4000-8000-000000000037','Late night','',array['community'],null,
 '2099-03-22 01:30+00','2099-03-22 02:15+00','Europe/London','Park',false,1::smallint,'');
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000009","role":"authenticated"}',true);
select public.create_plan_v4('e1100000-0000-4000-8000-000000000036','Leaving','',array['community'],null,
 '2099-06-04 18:00+00','2099-06-04 20:00+00','UTC','Park',false,1::smallint,'');
reset role;

-- 30's people: an admin who is Going, a Going guest, a Can't-go guest, a pending guest, one who withdrew, a Going guest
-- who never used the app and a Maybe guest who is leaving. The Going guest mutes it. A cover photo with a description
-- and a note to guests.
insert into public.attendees(plan_id,user_id,response) values
 ('e1100000-0000-4000-8000-000000000030','e1000000-0000-4000-8000-000000000002','accepted'),
 ('e1100000-0000-4000-8000-000000000030','e1000000-0000-4000-8000-000000000003','accepted'),
 ('e1100000-0000-4000-8000-000000000030','e1000000-0000-4000-8000-000000000004','declined'),
 ('e1100000-0000-4000-8000-000000000030','e1000000-0000-4000-8000-000000000005','pending'),
 ('e1100000-0000-4000-8000-000000000030','e1000000-0000-4000-8000-000000000006','withdrawn'),
 ('e1100000-0000-4000-8000-000000000030','e1000000-0000-4000-8000-000000000010','accepted'),
 ('e1100000-0000-4000-8000-000000000030','e1000000-0000-4000-8000-000000000011','maybe');
insert into public.plan_admins(plan_id,user_id,appointed_by,appointed_at) values
 ('e1100000-0000-4000-8000-000000000030','e1000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000001',now()-interval '20 days');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select public.set_plan_mute('e1100000-0000-4000-8000-000000000030',true);
reset role;
insert into storage.objects(bucket_id,name) values('plan-covers','e1000000-0000-4000-8000-000000000001/e1100000-0000-4000-8000-000000000030/a.jpg');
update public.plans set cover_path='e1000000-0000-4000-8000-000000000001/e1100000-0000-4000-8000-000000000030/a.jpg' where id='e1100000-0000-4000-8000-000000000030';
update public.plans set cover_description='The board',guest_note='Doors at seven',guest_note_at=now()-interval '9 days' where id='e1100000-0000-4000-8000-000000000030';
-- Last week: the Thursday a week before the latest Thursday (today counts), 19:00 to 22:00 London.
do $$ declare d date := (now() at time zone 'Europe/London')::date; begin
 d := d-((extract(isodow from d)::int-4+7)%7)-7;
 update public.plans set starts_at=(d+time '19:00') at time zone 'Europe/London',ends_at=(d+time '22:00') at time zone 'Europe/London'
  where id='e1100000-0000-4000-8000-000000000030';
end $$;

-- The roll: one plan has ended, so one next occurrence.
do $$ declare o public.plans; n public.plans; begin
 if private.roll_repeating_plans()<>1 then raise exception 'Expected exactly one plan rolled'; end if;
 select * into o from public.plans where id='e1100000-0000-4000-8000-000000000030';
 select * into n from public.plans where repeats_from='e1100000-0000-4000-8000-000000000030';
 if not found then raise exception 'No next occurrence'; end if;
 if n.id=o.id or n.series_id<>o.series_id or n.series_id<>'e1100000-0000-4000-8000-000000000030'::uuid then raise exception 'Wrong series: %', to_jsonb(n); end if;
 -- Thursday, 19:00 to 22:00 London.
 if (n.starts_at at time zone 'Europe/London')::time<>'19:00' or (n.ends_at at time zone 'Europe/London')::time<>'22:00'
  then raise exception 'Not 19:00 to 22:00 London: % to %', n.starts_at, n.ends_at; end if;
 if extract(dow from n.starts_at at time zone 'Europe/London')<>4 then raise exception 'Not a Thursday: %', n.starts_at; end if;
 -- The first occurrence after now: it has not ended, the one a week before it has, and it is at most a week away. It
 -- starts in the future, unless this runs on a Thursday evening in London, when it is the one under way.
 if n.ends_at<=now() then raise exception 'The next occurrence has already ended: %', n.ends_at; end if;
 if private.next_occurrence(n.ends_at,'Europe/London',-1)>now() then raise exception 'Not the first occurrence after now: %', n.starts_at; end if;
 if n.starts_at<=now() and extract(dow from now() at time zone 'Europe/London')<>4 then raise exception 'The next occurrence starts in the past: %', n.starts_at; end if;
 if n.starts_at>now()+interval '7 days' then raise exception 'The next occurrence is more than a week away: %', n.starts_at; end if;
 -- The details carry; the counters start again.
 if n.owner_id<>o.owner_id or n.activity_id is not null or n.title<>'Board game night' or n.description<>'Bring a game' or n.categories<>array['community']
  or n.time_zone<>'Europe/London' or n.place_label<>'Park' or n.place_tbd or n.latitude<>51.5 or n.longitude<>-0.1 or n.area<>'Soho'
  or n.guest_note<>'Doors at seven' or n.guest_note_at<>o.guest_note_at or n.cover_path<>o.cover_path or n.cover_description<>'The board'
  or n.cover_revision<>0 or not n.has_meeting_details or n.repeat_weeks<>1 or n.status<>'active' or n.version<>1
  then raise exception 'Wrong copy: %', to_jsonb(n); end if;
 if (select note from public.plan_meeting_details where plan_id=n.id) is distinct from 'Ring the bell' then raise exception 'Meeting details not carried'; end if;
 if (select count(*) from public.plan_admins where plan_id=n.id and user_id='e1000000-0000-4000-8000-000000000002'
   and appointed_by='e1000000-0000-4000-8000-000000000001' and appointed_at=now())<>1
  or (select count(*) from public.plan_admins where plan_id=n.id)<>1 then raise exception 'The admin did not carry'; end if;
 -- Everyone who uses the app and didn't withdraw, the admin among them, asked again; not the guest who only answered on
 -- the web, nor the one who is leaving.
 if (select array_agg(user_id order by user_id) from public.attendees where plan_id=n.id)<>array['e1000000-0000-4000-8000-000000000002',
   'e1000000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000004','e1000000-0000-4000-8000-000000000005']::uuid[]
  then raise exception 'Wrong people carried'; end if;
 if exists(select 1 from public.attendees where plan_id=n.id and user_id in ('e1000000-0000-4000-8000-000000000010','e1000000-0000-4000-8000-000000000011'))
  or exists(select 1 from private.notification_outbox where plan_id=n.id and recipient_id in ('e1000000-0000-4000-8000-000000000010','e1000000-0000-4000-8000-000000000011'))
  then raise exception 'A web-only or leaving guest was carried or told'; end if;
 if exists(select 1 from public.attendees where plan_id=n.id and (response<>'pending' or version<>1)) then raise exception 'Replies did not start empty'; end if;
 -- The invitation push: one each for the three guests; none for the admin or the owner.
 if (select array_agg(recipient_id order by recipient_id) from private.notification_outbox where plan_id=n.id)<>array[
   'e1000000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000004','e1000000-0000-4000-8000-000000000005']::uuid[]
  then raise exception 'Wrong recipients'; end if;
 if exists(select 1 from private.notification_outbox where plan_id=n.id and (kind<>'invited' or detail is distinct from 'again'
   or actor_id<>'e1000000-0000-4000-8000-000000000001' or dedupe_key<>'invited:'||n.id||':'||recipient_id))
  then raise exception 'Wrong invitation rows'; end if;
 -- The mute is on the series, so it carries.
 if private.notification_recipient_eligible((select id from private.notification_outbox where plan_id=n.id and recipient_id='e1000000-0000-4000-8000-000000000003'))
  then raise exception 'The muted guest would be told'; end if;
 if not private.notification_recipient_eligible((select id from private.notification_outbox where plan_id=n.id and recipient_id='e1000000-0000-4000-8000-000000000004'))
  or not private.notification_recipient_eligible((select id from private.notification_outbox where plan_id=n.id and recipient_id='e1000000-0000-4000-8000-000000000005'))
  then raise exception 'An unmuted guest would not be told'; end if;
 -- This occurrence keeps its own people and replies.
 if o.status<>'active' or o.repeats_from is not null or (select count(*) from public.attendees where plan_id=o.id and response<>'pending')<>6
  then raise exception 'The ended occurrence changed'; end if;
end $$;

-- Again: nothing more, still one next.
do $$ begin
 if private.roll_repeating_plans()<>0 then raise exception 'A second roll created something'; end if;
 if (select count(*) from public.plans where series_id='e1100000-0000-4000-8000-000000000030')<>2 then raise exception 'More than one next occurrence'; end if;
end $$;

-- On the next occurrence the carried admin's own reply is pending, yet as a host they read the meeting details (which
-- the editor saves back) and see the guests; a pending guest still sees only themself and no details.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare n uuid := (select id from public.plans where repeats_from='e1100000-0000-4000-8000-000000000030'); begin
 if n is null then raise exception 'The carried admin cannot read the next occurrence'; end if;
 if (select response from public.attendees where plan_id=n and user_id='e1000000-0000-4000-8000-000000000002') is distinct from 'pending'
  then raise exception 'The carried admin should still be pending'; end if;
 if (select note from public.plan_meeting_details where plan_id=n) is distinct from 'Ring the bell' then raise exception 'The carried admin cannot read the meeting details'; end if;
 if (select count(*) from public.attendees where plan_id=n)<>4 then raise exception 'The carried admin does not see the guests'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
do $$ declare n uuid := (select id from public.plans where repeats_from='e1100000-0000-4000-8000-000000000030'); begin
 if n is null then raise exception 'The pending guest cannot read the next occurrence'; end if;
 if exists(select 1 from public.plan_meeting_details where plan_id=n) then raise exception 'A pending guest reads the meeting details'; end if;
 if (select count(*) from public.attendees where plan_id=n)<>1 then raise exception 'A pending guest sees the other guests'; end if;
end $$;
reset role;

-- The next occurrence shares the photo: a guest invited to it only (07) reads the object in 30's folder; a guest of
-- both reads it; a stranger does not.
insert into public.attendees(plan_id,user_id) select id,'e1000000-0000-4000-8000-000000000007' from public.plans where repeats_from='e1100000-0000-4000-8000-000000000030';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000007","role":"authenticated"}',true);
do $$ begin
 if (select count(*) from storage.objects where bucket_id='plan-covers' and name='e1000000-0000-4000-8000-000000000001/e1100000-0000-4000-8000-000000000030/a.jpg')<>1
  then raise exception 'A guest of the next occurrence cannot read its cover'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 if (select count(*) from storage.objects where bucket_id='plan-covers')<>1 then raise exception 'A guest of both cannot read the cover'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000008","role":"authenticated"}',true);
do $$ begin
 if exists(select 1 from storage.objects where bucket_id='plan-covers') then raise exception 'A stranger reads the cover'; end if;
end $$;

reset role;
-- 6. Web payloads: the open pages say whether the place is to be decided and how the plan repeats (30's next occurrence weekly, 31 every other week, place to be decided).
-- 30 has rolled: its next occurrence is the open weekly plan.
insert into private.plan_links(plan_id,code)
 select id,repeat('W',22) from public.plans where repeats_from='e1100000-0000-4000-8000-000000000030';
insert into private.plan_links(plan_id,code) values ('e1100000-0000-4000-8000-000000000031',repeat('V',22));
do $$ declare a jsonb; b jsonb; begin
 a := private.invitation_page(repeat('W',22)); b := private.invitation_page(repeat('V',22));
 if a->>'state'<>'open' or (a->>'repeat_weeks')::int is distinct from 1 or (a->>'place_tbd')::boolean is distinct from false then raise exception 'Weekly plan payload wrong: %', a; end if;
 if (b->>'repeat_weeks')::int is distinct from 2 or (b->>'place_tbd')::boolean is distinct from true then raise exception 'To-be-decided plan payload wrong: %', b; end if;
end $$;
-- A personal invitation carries the same two fields.
insert into private.phone_invitations(plan_id,code_hash,phone,country,invited_by)
 select 'e1100000-0000-4000-8000-000000000031',extensions.digest(repeat('U',22),'sha256'),'447700900611','44','e1000000-0000-4000-8000-000000000001';
do $$ declare c jsonb; begin
 c := private.personal_invitation_page(repeat('U',22));
 if c->>'state'<>'open' or (c->>'repeat_weeks')::int is distinct from 2 or (c->>'place_tbd')::boolean is distinct from true then raise exception 'Personal payload wrong: %', c; end if;
end $$;
set local role authenticated;

-- Cancel just this one (31, 37) rolls; cancel and stop repeating (32) does not; Doesn't repeat on Edit (33) does not.
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.change_plan_v4('e1100000-0000-4000-8000-000000000031',1,null,null,null,null,null,null,null,null,null,null,null,true);
select public.change_plan_v4('e1100000-0000-4000-8000-000000000037',1,null,null,null,null,null,null,null,null,null,null,null,true);
select public.change_plan_v4('e1100000-0000-4000-8000-000000000032',1,null,null,null,null,null,null,null,null,null,null,null,true,true);
select public.change_plan_v4('e1100000-0000-4000-8000-000000000033',1,'No longer repeats','',array['community'],'2099-06-11 18:00+00','2099-06-11 21:00+00',
 'Europe/London','Park',false,null,'','');
reset role;
update public.plans set starts_at=now()-interval '8 days',ends_at=now()-interval '8 days'+interval '2 hours'
 where id in ('e1100000-0000-4000-8000-000000000033','e1100000-0000-4000-8000-000000000036');
-- 34's last occurrence ended 30 days ago; 35, with no end, started ten days ago; 36's organizer is leaving.
update public.plans set starts_at=now()-interval '30 days 2 hours',ends_at=now()-interval '30 days' where id='e1100000-0000-4000-8000-000000000034';
update public.plans set starts_at=now()-interval '10 days',ends_at=null where id='e1100000-0000-4000-8000-000000000035';
update public.profiles set deletion_requested_at=now() where id='e1000000-0000-4000-8000-000000000009';
do $$ declare n public.plans; begin
 if private.roll_repeating_plans()<>4 then raise exception 'Expected four plans rolled (31, 34, 35, 37)'; end if;
 select * into n from public.plans where repeats_from='e1100000-0000-4000-8000-000000000031';
 if not found or n.starts_at<>'2099-06-25 18:00+00' or n.ends_at<>'2099-06-25 21:00+00' or n.status<>'active' or n.repeat_weeks<>2
  or not n.place_tbd or n.place_label<>'To be decided' or n.latitude is not null then raise exception 'Cancel just this one did not roll two weeks on: %', to_jsonb(n); end if;
 if exists(select 1 from public.plans where repeats_from in ('e1100000-0000-4000-8000-000000000032','e1100000-0000-4000-8000-000000000033','e1100000-0000-4000-8000-000000000036'))
  then raise exception 'A stopped, non-repeating or leaving organizer''s plan rolled'; end if;
 -- Catching up: the first occurrence after now, not the one a week after the last.
 select * into n from public.plans where repeats_from='e1100000-0000-4000-8000-000000000034';
 if not found or n.starts_at<=now() or n.starts_at>now()+interval '7 days' or n.ends_at-n.starts_at<>interval '2 hours'
  then raise exception 'The long-ago plan did not catch up: %', to_jsonb(n); end if;
 select * into n from public.plans where repeats_from='e1100000-0000-4000-8000-000000000035';
 if not found or n.ends_at is not null or n.starts_at<=now() or n.starts_at>now()+interval '7 days'
  then raise exception 'The plan with no end did not roll from its start: %', to_jsonb(n); end if;
 -- 01:30 does not exist on 29 Mar 2099 in London, so the start is 01:30 GMT (02:30 BST); 02:15 BST would come before it,
 -- so the end keeps the 45 minutes.
 select * into n from public.plans where repeats_from='e1100000-0000-4000-8000-000000000037';
 if not found or n.starts_at<>'2099-03-29 01:30+00' or n.ends_at<>'2099-03-29 02:15+00'
  then raise exception 'The clock change inverted the next occurrence: %', to_jsonb(n); end if;
end $$;

-- One plan that cannot be rolled does not stop the others: 38's time zone is invalid, 39 is fine. The call rolls 39 only.
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select public.create_plan_v4('e1100000-0000-4000-8000-000000000038','Broken zone','',array['community'],null,
 '2099-06-04 18:00+00','2099-06-04 20:00+00','UTC','Park',false,1::smallint,'');
select public.create_plan_v4('e1100000-0000-4000-8000-000000000039','Fine','',array['community'],null,
 '2099-06-04 18:00+00','2099-06-04 20:00+00','UTC','Park',false,1::smallint,'');
reset role;
update public.plans set starts_at=now()-interval '3 days 2 hours',ends_at=now()-interval '3 days' where id in ('e1100000-0000-4000-8000-000000000038','e1100000-0000-4000-8000-000000000039');
update public.plans set time_zone='Nowhere/Invalid' where id='e1100000-0000-4000-8000-000000000038';
-- The skipped plan's warning is expected; keep the output clean.
set local client_min_messages=error;
do $$ begin
 if private.roll_repeating_plans()<>1 then raise exception 'Expected only the valid plan to roll'; end if;
 if not exists(select 1 from public.plans where repeats_from='e1100000-0000-4000-8000-000000000039') then raise exception 'The valid plan did not roll after the broken one'; end if;
 if exists(select 1 from public.plans where repeats_from='e1100000-0000-4000-8000-000000000038') then raise exception 'The broken plan rolled'; end if;
end $$;
set local client_min_messages=warning;
rollback;

-- Slice 6: the people counts (CR-P4). An invitee who hasn't answered reads only their own guest row (UX-P5), so the
-- page asks plan_people_counts for the numbers. Users: 01 owner, 02 admin (Going), 03 Going, 04 Maybe, 05 Can't go
-- (declined), 06 Can't go after Going (withdrawn), 07 an invitee who hasn't answered, 08 a stranger.
begin;
insert into auth.users(id,email,email_confirmed_at)
 select ('e1000000-0000-4000-8000-0000000000'||n)::uuid,'cr1-count-'||n||'@resbite-test.invalid',now()
 from unnest(array['01','02','03','04','05','06','07','08']) n;
insert into private.tester_roster(email) select 'cr1-count-'||n||'@resbite-test.invalid' from unnest(array['01','02','03','04','05','06','07','08']) n;
insert into public.profiles(id,display_name)
 select ('e1000000-0000-4000-8000-0000000000'||n)::uuid,'Counted '||n from unnest(array['01','02','03','04','05','06','07','08']) n;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.create_plan_v3('e1100000-0000-4000-8000-000000000040','Count night','',array['community'],null,
 '2099-06-08 19:00+00','2099-06-08 22:00+00','UTC','Park','');
reset role;
insert into public.attendees(plan_id,user_id,response) values
 ('e1100000-0000-4000-8000-000000000040','e1000000-0000-4000-8000-000000000002','accepted'),
 ('e1100000-0000-4000-8000-000000000040','e1000000-0000-4000-8000-000000000003','accepted'),
 ('e1100000-0000-4000-8000-000000000040','e1000000-0000-4000-8000-000000000004','maybe'),
 ('e1100000-0000-4000-8000-000000000040','e1000000-0000-4000-8000-000000000005','declined'),
 ('e1100000-0000-4000-8000-000000000040','e1000000-0000-4000-8000-000000000006','withdrawn'),
 ('e1100000-0000-4000-8000-000000000040','e1000000-0000-4000-8000-000000000007','pending');
insert into public.plan_admins(plan_id,user_id,appointed_by) values
 ('e1100000-0000-4000-8000-000000000040','e1000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000001');

-- Signed-in people only.
do $$ begin
 if has_function_privilege('anon','public.plan_people_counts(uuid)','execute') or has_function_privilege('anon','private.plan_people_counts(uuid)','execute')
  then raise exception 'anon can execute plan_people_counts'; end if;
 if not has_function_privilege('authenticated','public.plan_people_counts(uuid)','execute') then raise exception 'authenticated cannot execute plan_people_counts'; end if;
end $$;

-- The invitee who hasn't answered sees only their own guest row, yet reads the counts: two going, one maybe, two can't
-- go (declined and withdrawn alike); their own pending row counts nowhere and the owner has no guest row.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000007","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 if (select count(*) from public.attendees where plan_id='e1100000-0000-4000-8000-000000000040')<>1 then
  raise exception 'The unanswered invitee read more than their own guest row'; end if;
 r := public.plan_people_counts('e1100000-0000-4000-8000-000000000040');
 if r is distinct from '{"going":2,"maybe":1,"cant_go":2}'::jsonb then raise exception 'Counts for the unanswered invitee wrong: %', r; end if;
end $$;
-- The owner, the admin and the guests who answered (any answer) read the same numbers.
do $$ declare v text; r jsonb; begin
 foreach v in array array['01','02','03','04','05','06'] loop
  perform set_config('request.jwt.claims',json_build_object('sub','e1000000-0000-4000-8000-0000000000'||v,'role','authenticated')::text,true);
  r := public.plan_people_counts('e1100000-0000-4000-8000-000000000040');
  if r is distinct from '{"going":2,"maybe":1,"cant_go":2}'::jsonb then raise exception 'Counts for % wrong: %', v, r; end if;
 end loop;
end $$;
-- The counts follow the answers: the invitee answers Going.
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000007","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 perform public.respond('e1100000-0000-4000-8000-000000000040','accepted',1);
 r := public.plan_people_counts('e1100000-0000-4000-8000-000000000040');
 if r is distinct from '{"going":3,"maybe":1,"cant_go":2}'::jsonb then raise exception 'Counts after answering wrong: %', r; end if;
end $$;
-- A stranger is refused, for this plan and for one that doesn't exist.
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000008","role":"authenticated"}',true);
do $$ begin
 begin perform public.plan_people_counts('e1100000-0000-4000-8000-000000000040'); raise exception 'A stranger read the counts';
 exception when insufficient_privilege then if sqlerrm<>'Not invited' then raise exception 'Wrong message: %', sqlerrm; end if; end;
 begin perform public.plan_people_counts('e1100000-0000-4000-8000-000000000099'); raise exception 'A stranger read the counts of a missing plan';
 exception when insufficient_privilege then if sqlerrm<>'Not invited' then raise exception 'Wrong message: %', sqlerrm; end if; end;
end $$;
reset role;
rollback;

-- Slice 7: an admin's cover upload, as Storage makes it (CR-D8). Storage authorises an upload by writing the row it will
-- keep, as the uploader, in a transaction it then rolls back. The app uploads covers with upsert (a retry of a journaled
-- change writes the same name again), and the upsert probe is INSERT ... ON CONFLICT DO UPDATE ... RETURNING *: the
-- insert and update policies, and for the returned (and any conflicting) row the read policy. A plain upload is a bare
-- INSERT. The local storage.objects stand-in gets the real table's unique (bucket_id, name) and updated_at for this slice
-- only. Users: 01 owner, 02 admin (Going), 03 a Going guest, 08 a stranger.
begin;
insert into auth.users(id,email,email_confirmed_at)
 select ('e1000000-0000-4000-8000-0000000000'||n)::uuid,'cr1-cover-'||n||'@resbite-test.invalid',now() from unnest(array['01','02','03','08']) n;
insert into private.tester_roster(email) select 'cr1-cover-'||n||'@resbite-test.invalid' from unnest(array['01','02','03','08']) n;
insert into public.profiles(id,display_name)
 select ('e1000000-0000-4000-8000-0000000000'||n)::uuid,'Cover '||n from unnest(array['01','02','03','08']) n;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.create_plan_v3('e1100000-0000-4000-8000-000000000050','Cover night','',array['community'],null,
 '2099-06-09 19:00+00','2099-06-09 22:00+00','UTC','Park','');
reset role;
insert into public.attendees(plan_id,user_id,response) values
 ('e1100000-0000-4000-8000-000000000050','e1000000-0000-4000-8000-000000000002','accepted'),
 ('e1100000-0000-4000-8000-000000000050','e1000000-0000-4000-8000-000000000003','accepted');
insert into public.plan_admins(plan_id,user_id,appointed_by) values
 ('e1100000-0000-4000-8000-000000000050','e1000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000001');
create unique index cr1_objects_key on storage.objects(bucket_id,name);
alter table storage.objects add column updated_at timestamptz default now();

-- The admin: a new cover into the owner's folder (the upsert probe), the same name again (a retry), and a plain upload.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare r record; begin
 insert into storage.objects(bucket_id,name,owner)
  values('plan-covers','e1000000-0000-4000-8000-000000000001/e1100000-0000-4000-8000-000000000050/f0000000-0000-4000-8000-000000000001.jpg','e1000000-0000-4000-8000-000000000002')
  on conflict (bucket_id,name) do update set updated_at=now() returning * into r;
 if r.name is distinct from 'e1000000-0000-4000-8000-000000000001/e1100000-0000-4000-8000-000000000050/f0000000-0000-4000-8000-000000000001.jpg' then
  raise exception 'The admin''s upload returned %', r.name; end if;
 insert into storage.objects(bucket_id,name,owner)
  values('plan-covers','e1000000-0000-4000-8000-000000000001/e1100000-0000-4000-8000-000000000050/f0000000-0000-4000-8000-000000000001.jpg','e1000000-0000-4000-8000-000000000002')
  on conflict (bucket_id,name) do update set updated_at=now() returning * into r;
 insert into storage.objects(bucket_id,name,owner)
  values('plan-covers','e1000000-0000-4000-8000-000000000001/e1100000-0000-4000-8000-000000000050/f0000000-0000-4000-8000-000000000002.jpg','e1000000-0000-4000-8000-000000000002');
 if (select count(*) from storage.objects where name like 'e1000000-0000-4000-8000-000000000001/e1100000-0000-4000-8000-000000000050/%')<>2 then
  raise exception 'The admin should read the two uploads in the plan''s folder'; end if;
 -- Never into the admin's own folder: the cover policies want the owner's.
 begin
  insert into storage.objects(bucket_id,name,owner)
   values('plan-covers','e1000000-0000-4000-8000-000000000002/e1100000-0000-4000-8000-000000000050/f0000000-0000-4000-8000-000000000003.jpg','e1000000-0000-4000-8000-000000000002')
   on conflict (bucket_id,name) do update set updated_at=now() returning * into r;
  raise exception 'An admin uploaded into their own folder';
 exception when insufficient_privilege then null; end;
end $$;
-- A guest who isn't an admin, and a stranger, can neither upload into the folder nor read what is in it.
do $$ declare v text; r record; begin
 foreach v in array array['03','08'] loop
  perform set_config('request.jwt.claims',json_build_object('sub','e1000000-0000-4000-8000-0000000000'||v,'role','authenticated')::text,true);
  begin
   insert into storage.objects(bucket_id,name,owner)
    values('plan-covers','e1000000-0000-4000-8000-000000000001/e1100000-0000-4000-8000-000000000050/f0000000-0000-4000-8000-000000000004.jpg',('e1000000-0000-4000-8000-0000000000'||v)::uuid)
    on conflict (bucket_id,name) do update set updated_at=now() returning * into r;
   raise exception 'User % uploaded a cover', v;
  exception when insufficient_privilege then null; end;
  if exists(select 1 from storage.objects where name like 'e1000000-0000-4000-8000-000000000001/e1100000-0000-4000-8000-000000000050/%') then
   raise exception 'User % read uploads that are not the cover', v; end if;
 end loop;
end $$;
-- The owner, as before.
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare r record; begin
 insert into storage.objects(bucket_id,name,owner)
  values('plan-covers','e1000000-0000-4000-8000-000000000001/e1100000-0000-4000-8000-000000000050/f0000000-0000-4000-8000-000000000005.jpg','e1000000-0000-4000-8000-000000000001')
  on conflict (bucket_id,name) do update set updated_at=now() returning * into r;
 if (select count(*) from storage.objects where name like 'e1000000-0000-4000-8000-000000000001/e1100000-0000-4000-8000-000000000050/%')<>3 then
  raise exception 'The owner should read the three uploads'; end if;
end $$;
reset role;
rollback;
