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
 exception when insufficient_privilege then if sqlerrm<>'Active plan host required' then raise exception 'Wrong message: %', sqlerrm; end if; end;
 begin perform public.invite_contacts('e1100000-0000-4000-8000-000000000001', jsonb_build_array(jsonb_build_object('phone','447700900699','country','44','code',repeat('L',22))));
  raise exception 'Invited to an ended plan';
 exception when insufficient_privilege then if sqlerrm<>'Active plan host required' then raise exception 'Wrong message: %', sqlerrm; end if; end;
 begin perform public.decide_join_request('e1100000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000007',true); raise exception 'Decided on an ended plan';
 exception when insufficient_privilege then if sqlerrm<>'Active plan host required' then raise exception 'Wrong message: %', sqlerrm; end if; end;
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

-- Slice 2: admins (CR-D8, CR-D15). The owner appoints Going guests; an admin does everything a host does except appoint
-- or remove admins. Users: 01 owner, 02 admin (appointed), 03 a Maybe guest, 04 a plain guest, 05 a second admin,
-- 06 a phone-only requester, 07 a guest an admin removes.
begin;
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values
 ('e1000000-0000-4000-8000-000000000001','cr1-owner@resbite-test.invalid',now(),null,null),
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

-- A plain guest is not a host.
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin
 begin perform public.plan_link('e1100000-0000-4000-8000-000000000003'); raise exception 'A plain guest read the link';
 exception when insufficient_privilege then if sqlerrm<>'Active plan host required' then raise exception 'Wrong message: %', sqlerrm; end if; end;
 begin perform public.invite_contacts('e1100000-0000-4000-8000-000000000003', jsonb_build_array(jsonb_build_object('phone','447700900699','country','44','code',repeat('L',22))));
  raise exception 'A plain guest invited'; exception when insufficient_privilege then null; end;
 begin perform public.remove_guest('e1100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000007'); raise exception 'A plain guest removed a guest';
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

-- The admin answers Can't go: the role ends with the answer.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.respond('e1100000-0000-4000-8000-000000000003','declined',2);
do $$ begin
 begin perform public.plan_link('e1100000-0000-4000-8000-000000000003'); raise exception 'A declined admin still reads the link';
 exception when insufficient_privilege then if sqlerrm<>'Active plan host required' then raise exception 'Wrong message: %', sqlerrm; end if; end;
end $$;
reset role;
do $$ begin
 if exists(select 1 from public.plan_admins where user_id='e1000000-0000-4000-8000-000000000002') then raise exception 'The declined admin kept the role'; end if;
end $$;
rollback;
