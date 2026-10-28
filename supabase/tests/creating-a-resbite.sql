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
 exception when insufficient_privilege then null; end;
 begin perform public.invite_contacts('e1100000-0000-4000-8000-000000000001', jsonb_build_array(jsonb_build_object('phone','447700900699','country','44','code',repeat('L',22))));
  raise exception 'Invited to an ended plan';
 exception when insufficient_privilege then null; end;
 begin perform public.decide_join_request('e1100000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000007',true); raise exception 'Decided on an ended plan';
 exception when insufficient_privilege then null; end;
 begin perform public.create_invite('e1200000-0000-4000-8000-000000000003','e1100000-0000-4000-8000-000000000001',repeat('c',64)); raise exception 'Invite created on an ended plan';
 exception when invalid_parameter_value then if sqlerrm<>'Plan unavailable' then raise exception 'Wrong message: %', sqlerrm; end if; end;
 begin perform public.revoke_invite('e1200000-0000-4000-8000-000000000001'); raise exception 'Invite revoked on an ended plan';
 exception when insufficient_privilege then null; end;
 begin perform public.set_plan_cover_description('e1100000-0000-4000-8000-000000000001','',0); raise exception 'Cover description set on an ended plan';
 exception when invalid_parameter_value then if sqlerrm<>'Plan unavailable' then raise exception 'Wrong message: %', sqlerrm; end if; end;
 begin perform public.set_plan_cover_if_current('e1100000-0000-4000-8000-000000000001',null,null,0); raise exception 'Cover set on an ended plan';
 exception when invalid_parameter_value then if sqlerrm<>'Plan unavailable' then raise exception 'Wrong message: %', sqlerrm; end if; end;
 -- Nobody is waiting to be approved once it has ended.
 if public.plan_join_requests('e1100000-0000-4000-8000-000000000001')<>'[]'::jsonb then raise exception 'plan_join_requests lists requests after the end'; end if;
 -- The storage policies close at the end: the insert is refused (the folder is the owner's, the plan is not open).
 begin insert into storage.objects(bucket_id,name) values('plan-covers','e1000000-0000-4000-8000-000000000001/e1100000-0000-4000-8000-000000000001/b.jpg');
  raise exception 'Cover uploaded to an ended plan';
 exception when insufficient_privilege then null; end;
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
 begin perform public.claim_invite(repeat('b',64)); raise exception 'Ended plan claimed by invite';
 exception when insufficient_privilege then null; end;
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
