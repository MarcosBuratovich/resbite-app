-- GI1 event links (docs/superpowers/specs/2026-10-21-gi1-event-links-design.md). Synthetic identities only.
-- One rolled-back block per slice; each block uses its own UUID prefix family (a1, a2, a3).
-- Since open-link approval (20261029120000), joining by the link is a request the organizer approves; these blocks
-- approve where GI1 admitted.

-- Block 1: the link (plan_link, rotate_plan_link) and remove_guest.
begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('a1000000-0000-4000-8000-000000000001','gi1-1-owner@resbite-test.invalid',now(),'{}'),
 ('a1000000-0000-4000-8000-000000000002','gi1-1-guest@resbite-test.invalid',now(),'{}'),
 ('a1000000-0000-4000-8000-000000000003','gi1-1-other@resbite-test.invalid',now(),'{}');
insert into private.tester_roster(email) values ('gi1-1-owner@resbite-test.invalid'),('gi1-1-guest@resbite-test.invalid'),('gi1-1-other@resbite-test.invalid');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.save_profile('Guest one');
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select public.save_profile('Other one');
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.save_profile('Owner one');
create temporary table gi1_codes(name text primary key, code text);
do $$ declare c1 text; c2 text; c3 text; begin
 perform public.create_plan_v3('a1100000-0000-4000-8000-000000000001','Film night','',array['community'],null,
  '2099-06-01 19:30+00','2099-06-01 22:00+00','UTC','Cinema room, 12 Example Street','Ring the top bell',null,null,'Near Old Street');
 perform public.create_plan_v3('a1100000-0000-4000-8000-000000000002','Other night','',array['community'],null,
  '2099-06-02 19:30+00',null,'UTC','Somewhere','');
 -- One link per event: the code is 22 URL-safe characters and stays the same across calls.
 c1 := public.plan_link('a1100000-0000-4000-8000-000000000001');
 if c1 !~ '^[A-Za-z0-9_-]{22}$' then raise exception 'Bad code shape %', c1; end if;
 if public.plan_link('a1100000-0000-4000-8000-000000000001')<>c1 then raise exception 'plan_link changed between calls'; end if;
 c3 := public.plan_link('a1100000-0000-4000-8000-000000000002');
 if c3=c1 then raise exception 'Two events share a code'; end if;
 -- Turning the link off makes a new one; the old code stops working.
 c2 := public.rotate_plan_link('a1100000-0000-4000-8000-000000000001');
 if c2=c1 or c2 !~ '^[A-Za-z0-9_-]{22}$' then raise exception 'Rotate returned a bad code'; end if;
 if public.plan_link('a1100000-0000-4000-8000-000000000001')<>c2 then raise exception 'plan_link does not return the rotated code'; end if;
 if (public.invitation_page(c1)->>'state')<>'inactive' then raise exception 'Old code still active'; end if;
 if (public.invitation_page(c2)->>'state')<>'open' then raise exception 'New code not open'; end if;
 insert into gi1_codes values('old',c1),('current',c2),('other',c3);
end $$;
-- Only the organizer of an active, future event holds its link.
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 begin perform public.plan_link('a1100000-0000-4000-8000-000000000001'); raise exception 'Guest read the link';
 exception when insufficient_privilege then null; end;
 begin perform public.rotate_plan_link('a1100000-0000-4000-8000-000000000001'); raise exception 'Guest rotated the link';
 exception when insufficient_privilege then null; end;
 begin perform public.remove_guest('a1100000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000003'); raise exception 'Guest removed a guest';
 exception when insufficient_privilege then null; end;
 -- The guest asks through the current link and the organizer approves; the other person joins by a per-person link
 -- shared before GI1.
 if public.claim_plan_link((select code from gi1_codes where name='current'))<>'a1100000-0000-4000-8000-000000000001' then raise exception 'Claim returned the wrong plan'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.decide_join_request('a1100000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002',true);
select public.create_invite('a1200000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001',repeat('b',64));
select public.create_invite('a1200000-0000-4000-8000-000000000002','a1100000-0000-4000-8000-000000000001',repeat('c',64));
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select public.claim_invite(repeat('b',64));
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 if (select count(*) from public.attendees where plan_id='a1100000-0000-4000-8000-000000000001')<>2 then raise exception 'Two guests expected'; end if;
 -- Removing a guest takes them off the event and turns off their per-person links; the organizer stays.
 perform public.remove_guest('a1100000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002');
 perform public.remove_guest('a1100000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000003');
 if exists(select 1 from public.attendees where plan_id='a1100000-0000-4000-8000-000000000001') then raise exception 'Guest not removed'; end if;
 -- A stranger is a no-op; the organizer cannot be removed.
 perform public.remove_guest('a1100000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002');
 begin perform public.remove_guest('a1100000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001'); raise exception 'Organizer removed';
 exception when invalid_parameter_value then null; end;
end $$;
reset role;
do $$ begin
 if exists(select 1 from private.invitations where plan_id='a1100000-0000-4000-8000-000000000001' and claimed_by='a1000000-0000-4000-8000-000000000003' and revoked_at is null) then raise exception 'Removed guest keeps a working per-person link'; end if;
 -- Nobody reads the links table; after cancellation or the start, the organizer can no longer manage the link.
 if (select count(*) from private.plan_links where plan_id='a1100000-0000-4000-8000-000000000001')<>2 then raise exception 'Two link rows expected'; end if;
 -- The unclaimed per-person link shared before GI1 is still open; turning the event link off closes it too.
 if (select revoked_at from private.invitations where id='a1200000-0000-4000-8000-000000000002') is not null then raise exception 'Unclaimed invitation revoked early'; end if;
 update public.plans set status='cancelled' where id='a1100000-0000-4000-8000-000000000002';
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.rotate_plan_link('a1100000-0000-4000-8000-000000000001');
do $$ begin
 begin perform public.plan_link('a1100000-0000-4000-8000-000000000002'); raise exception 'Link read on a cancelled event';
 exception when insufficient_privilege then null; end;

end $$;
reset role;
do $$ begin
 if (select revoked_at from private.invitations where id='a1200000-0000-4000-8000-000000000002') is null then raise exception 'Turning the link off left an unclaimed per-person link open'; end if;
end $$;
rollback;

-- Block 2: the public read for the web page.
begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('a2000000-0000-4000-8000-000000000001','gi1-2-owner@resbite-test.invalid',now(),'{}'),
 ('a2000000-0000-4000-8000-000000000002','gi1-2-going@resbite-test.invalid',now(),'{}'),
 ('a2000000-0000-4000-8000-000000000003','gi1-2-maybe@resbite-test.invalid',now(),'{}');
insert into private.tester_roster(email) values ('gi1-2-owner@resbite-test.invalid'),('gi1-2-going@resbite-test.invalid'),('gi1-2-maybe@resbite-test.invalid');
insert into public.activities(id,title,description,category,artwork_key,source_ids,published,categories) values ('gi1-film','Film','','Creative','gi1-film',array[]::text[],true,array['community']);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.save_profile('Ana Secretname');
select set_config('request.jwt.claims','{"sub":"a2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select public.save_profile('Tom Secretname');
select set_config('request.jwt.claims','{"sub":"a2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.save_profile('Stephen');
create temporary table gi1_codes(name text primary key, code text);
grant select on gi1_codes to anon;
do $$ begin
 perform public.create_plan_v3('a2100000-0000-4000-8000-000000000001','Film night: Paddington 2','Secret description',array['community'],'gi1-film',
  '2099-10-23 18:30+00','2099-10-23 21:00+00','Europe/London','Cinema room, 12 Secret Street','Gate code 4512',null,null,'Near Old Street, London');
 perform public.create_plan_v3('a2100000-0000-4000-8000-000000000002','Plain night','',array['community'],null,
  '2099-10-24 18:30+00',null,'UTC','Somewhere secret','');
 perform public.set_guest_note('a2100000-0000-4000-8000-000000000001','Secret note to guests');
 insert into gi1_codes values('film',public.plan_link('a2100000-0000-4000-8000-000000000001')),('plain',public.plan_link('a2100000-0000-4000-8000-000000000002'));
end $$;
-- Two guests ask, the organizer approves them; one says Going, the other Maybe.
select set_config('request.jwt.claims','{"sub":"a2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.claim_plan_link((select code from gi1_codes where name='film'));
select set_config('request.jwt.claims','{"sub":"a2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select public.claim_plan_link((select code from gi1_codes where name='film'));
select set_config('request.jwt.claims','{"sub":"a2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.decide_join_request('a2100000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002',true);
select public.decide_join_request('a2100000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"a2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.respond('a2100000-0000-4000-8000-000000000001','accepted',(select version from public.attendees where plan_id='a2100000-0000-4000-8000-000000000001' and user_id='a2000000-0000-4000-8000-000000000002'));
select set_config('request.jwt.claims','{"sub":"a2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select public.respond('a2100000-0000-4000-8000-000000000001','maybe',(select version from public.attendees where plan_id='a2100000-0000-4000-8000-000000000001' and user_id='a2000000-0000-4000-8000-000000000003'));
-- The page reads without a session.
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ declare p jsonb; begin
 p := public.invitation_page((select code from gi1_codes where name='film'));
 if p->>'state'<>'open' then raise exception 'Open event not open: %', p; end if;
 if p->>'host'<>'Stephen' or p->>'title'<>'Film night: Paddington 2' or p->>'area'<>'Near Old Street, London' then raise exception 'Basics wrong: %', p; end if;
 if (p->>'starts_at')::timestamptz<>'2099-10-23 18:30+00' or (p->>'ends_at')::timestamptz<>'2099-10-23 21:00+00' or p->>'time_zone'<>'Europe/London' then raise exception 'Times wrong: %', p; end if;
 -- Going counts Going only, never Maybe; the image is the activity's illustration when there is no cover.
 if (p->>'going')::int<>1 then raise exception 'Going count wrong: %', p; end if;
 if p->'image'<>'{"kind":"activity","ref":"gi1-film"}'::jsonb then raise exception 'Image wrong: %', p; end if;
 -- Nothing private leaves: no place, Meeting details, note, description or names.
 if p::text ~ 'Secret' or p::text ~ '4512' or p::text ~ 'Cinema' or p::text ~ 'Ana' or p::text ~ 'Tom' then raise exception 'Private text in the page read: %', p; end if;
 if (select count(*) from jsonb_object_keys(p))<>9 then raise exception 'Unexpected keys: %', p; end if;
 -- An event with no activity and no cover shows the mark; no area gives an empty string.
 p := public.invitation_page((select code from gi1_codes where name='plain'));
 if p->'image'<>'{"kind":"mark","ref":""}'::jsonb or p->>'area'<>'' or (p->>'going')::int<>0 or p->'ends_at'<>'null'::jsonb then raise exception 'Plain page wrong: %', p; end if;
 -- Unknown, malformed and empty codes are inactive and say nothing else.
 if public.invitation_page('AAAAAAAAAAAAAAAAAAAAAA')<>'{"state":"inactive"}'::jsonb then raise exception 'Unknown code leaked something'; end if;
 if public.invitation_page('short')<>'{"state":"inactive"}'::jsonb or public.invitation_page(null)<>'{"state":"inactive"}'::jsonb or public.invitation_page(repeat('x',23))<>'{"state":"inactive"}'::jsonb then raise exception 'Malformed code not inactive'; end if;
 -- Signed out, nobody can join or read the link functions.
 begin perform public.claim_plan_link((select code from gi1_codes where name='film')); raise exception 'Anonymous claim accepted';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
-- A cover photo wins over the illustration; cancelled and past events keep only the host and title.
update public.plans set cover_path='covers/a2100000-0000-4000-8000-000000000001/1.jpg' where id='a2100000-0000-4000-8000-000000000001';
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ declare p jsonb; begin
 p := public.invitation_page((select code from gi1_codes where name='film'));
 if p->'image'<>'{"kind":"cover","ref":"covers/a2100000-0000-4000-8000-000000000001/1.jpg"}'::jsonb then raise exception 'Cover not preferred: %', p; end if;
end $$;
reset role;
update public.plans set status='cancelled' where id='a2100000-0000-4000-8000-000000000001';
update public.plans set starts_at=now()-interval '1 minute' where id='a2100000-0000-4000-8000-000000000002';
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ declare p jsonb; begin
 p := public.invitation_page((select code from gi1_codes where name='film'));
 if p<>'{"state":"cancelled","host":"Stephen","title":"Film night: Paddington 2"}'::jsonb then raise exception 'Cancelled page wrong: %', p; end if;
 p := public.invitation_page((select code from gi1_codes where name='plain'));
 if p<>'{"state":"happened","host":"Stephen","title":"Plain night"}'::jsonb then raise exception 'Past page wrong: %', p; end if;
end $$;
rollback;

-- Block 3: joining by the link, and the area through the save functions.
begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('a3000000-0000-4000-8000-000000000001','gi1-3-owner@resbite-test.invalid',now(),'{}'),
 ('a3000000-0000-4000-8000-000000000002','gi1-3-guest@resbite-test.invalid',now(),'{}'),
 ('a3000000-0000-4000-8000-000000000003','gi1-3-other@resbite-test.invalid',now(),'{}'),
 ('a3000000-0000-4000-8000-000000000004','gi1-3-fresh@resbite-test.invalid',now(),'{}');
insert into private.tester_roster(email) values ('gi1-3-owner@resbite-test.invalid'),('gi1-3-guest@resbite-test.invalid'),
 ('gi1-3-other@resbite-test.invalid'),('gi1-3-fresh@resbite-test.invalid');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a3000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.save_profile('Guest three');
select set_config('request.jwt.claims','{"sub":"a3000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select public.save_profile('Other three');
select set_config('request.jwt.claims','{"sub":"a3000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select public.save_profile('Fresh three');
select set_config('request.jwt.claims','{"sub":"a3000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.save_profile('Owner three');
create temporary table gi1_codes(name text primary key, code text);
do $$ declare v integer; begin
 -- The area is trimmed on the way in; a retry of the same creation is acknowledged.
 perform public.create_plan_v3('a3100000-0000-4000-8000-000000000001','Area fixture','',array['community'],null,
  '2099-07-01 10:00+00',null,'UTC','Park','',null,null,'  Near Old Street  ');
 perform public.create_plan_v3('a3100000-0000-4000-8000-000000000001','Area fixture','',array['community'],null,
  '2099-07-01 10:00+00',null,'UTC','Park','',null,null,'  Near Old Street  ');
 if (select area from public.plans where id='a3100000-0000-4000-8000-000000000001')<>'Near Old Street' then raise exception 'Area not saved trimmed'; end if;
 -- A create without the argument (builds up to 8) has no area.
 perform public.create_plan_v3('a3100000-0000-4000-8000-000000000002','No area','',array['community'],null,'2099-07-02 10:00+00',null,'UTC','Park','');
 if (select area from public.plans where id='a3100000-0000-4000-8000-000000000002')<>'' then raise exception 'Area not empty by default'; end if;
 -- Editing: null leaves the area alone (old builds), text sets it, '' clears it; v2 never touches it.
 v := public.change_plan_v3('a3100000-0000-4000-8000-000000000001',1,'Area fixture','',array['community'],'2099-07-01 10:00+00',null,'UTC','Park','');
 if (select area from public.plans where id='a3100000-0000-4000-8000-000000000001')<>'Near Old Street' then raise exception 'Edit without the argument changed the area'; end if;
 v := public.change_plan_v2('a3100000-0000-4000-8000-000000000001',v,'Area fixture v2','',array['community'],'2099-07-01 10:00+00','UTC','Park','');
 if (select area from public.plans where id='a3100000-0000-4000-8000-000000000001')<>'Near Old Street' then raise exception 'v2 edit changed the area'; end if;
 v := public.change_plan_v3('a3100000-0000-4000-8000-000000000001',v,'Area fixture','',array['community'],'2099-07-01 10:00+00',null,'UTC','Park','',false,'Shoreditch ');
 if (select area from public.plans where id='a3100000-0000-4000-8000-000000000001')<>'Shoreditch' then raise exception 'Edit did not set the area'; end if;
 v := public.change_plan_v3('a3100000-0000-4000-8000-000000000001',v,'Area fixture','',array['community'],'2099-07-01 10:00+00',null,'UTC','Park','',false,'');
 if (select area from public.plans where id='a3100000-0000-4000-8000-000000000001')<>'' then raise exception 'Edit did not clear the area'; end if;
 begin
  v := public.change_plan_v3('a3100000-0000-4000-8000-000000000001',v,'Area fixture','',array['community'],'2099-07-01 10:00+00',null,'UTC','Park','',false,repeat('x',81));
  raise exception 'An 81-character area was accepted';
 exception when check_violation then null; end;
 insert into gi1_codes values('one',public.plan_link('a3100000-0000-4000-8000-000000000001')),('two',public.plan_link('a3100000-0000-4000-8000-000000000002'));
 -- The organizer opening their own link gets the event back: no attendee row, no notice.
 if public.claim_plan_link((select code from gi1_codes where name='one'))<>'a3100000-0000-4000-8000-000000000001' then raise exception 'Organizer did not get their event'; end if;
 if exists(select 1 from public.attendees where plan_id='a3100000-0000-4000-8000-000000000001') then raise exception 'Organizer became an attendee'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"a3000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare id uuid; begin
 -- Asking: a waiting request, not answered yet, one notice to the organizer; asking again adds nothing.
 id := public.claim_plan_link((select code from gi1_codes where name='one'));
 if id<>'a3100000-0000-4000-8000-000000000001' then raise exception 'Wrong plan joined'; end if;
 if public.claim_plan_link((select code from gi1_codes where name='one'))<>id then raise exception 'Second join differs'; end if;
 -- Unknown or malformed codes are refused like a revoked link.
 begin perform public.claim_plan_link('AAAAAAAAAAAAAAAAAAAAAA'); raise exception 'Unknown code joined';
 exception when insufficient_privilege then null; end;
 begin perform public.claim_plan_link('nope'); raise exception 'Malformed code joined';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if (select status||'|'||response from private.join_requests where plan_id='a3100000-0000-4000-8000-000000000001' and user_id='a3000000-0000-4000-8000-000000000002')
  is distinct from 'waiting|pending' then raise exception 'Not waiting after asking'; end if;
 if exists(select 1 from public.attendees where plan_id='a3100000-0000-4000-8000-000000000001') then raise exception 'Asking put someone on the event'; end if;
end $$;
set local role authenticated;
-- The organizer approves, then turns the link off. They still get their event back from the old code.
select set_config('request.jwt.claims','{"sub":"a3000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 perform public.decide_join_request('a3100000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000002',true);
 insert into gi1_codes values('one-new',public.rotate_plan_link('a3100000-0000-4000-8000-000000000001'));
 if public.claim_plan_link((select code from gi1_codes where name='one'))<>'a3100000-0000-4000-8000-000000000001' then raise exception 'Organizer refused by the turned-off link'; end if;
end $$;
-- Someone already on the event gets it back from the turned-off link, and nothing is added.
select set_config('request.jwt.claims','{"sub":"a3000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if public.claim_plan_link((select code from gi1_codes where name='one'))<>'a3100000-0000-4000-8000-000000000001' then raise exception 'Attendee refused by the turned-off link'; end if;
end $$;
-- Anyone else is refused by the turned-off link.
select set_config('request.jwt.claims','{"sub":"a3000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 begin perform public.claim_plan_link((select code from gi1_codes where name='one')); raise exception 'Joined by a turned-off link';
 exception when insufficient_privilege then null; end;
end $$;
-- A fresh guest asks through the new link as before: not answered yet, one notice; the organizer approves.
select set_config('request.jwt.claims','{"sub":"a3000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ declare id uuid; begin
 id := public.claim_plan_link((select code from gi1_codes where name='one-new'));
 if id<>'a3100000-0000-4000-8000-000000000001' then raise exception 'Wrong plan joined by the new link'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"a3000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.decide_join_request('a3100000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000004',true);
reset role;
do $$ begin
 if (select response from public.attendees where plan_id='a3100000-0000-4000-8000-000000000001' and user_id='a3000000-0000-4000-8000-000000000004') is distinct from 'pending' then raise exception 'Fresh guest not pending'; end if;
 if (select count(*) from private.notification_outbox where plan_id='a3100000-0000-4000-8000-000000000001' and kind='join_request' and recipient_id='a3000000-0000-4000-8000-000000000001' and actor_id='a3000000-0000-4000-8000-000000000002')<>1 then raise exception 'One request notice expected'; end if;
 if (select count(*) from private.notification_outbox where plan_id='a3100000-0000-4000-8000-000000000001' and kind='join_request' and recipient_id='a3000000-0000-4000-8000-000000000001' and actor_id='a3000000-0000-4000-8000-000000000004')<>1 then raise exception 'One request notice expected for the fresh guest'; end if;
 if exists(select 1 from public.attendees where plan_id='a3100000-0000-4000-8000-000000000001' and user_id='a3000000-0000-4000-8000-000000000003')
  or exists(select 1 from private.join_requests where plan_id='a3100000-0000-4000-8000-000000000001' and user_id='a3000000-0000-4000-8000-000000000003') then raise exception 'A refused claim added a guest'; end if;
 if (select count(*) from public.attendees where plan_id='a3100000-0000-4000-8000-000000000001')<>2 then raise exception 'Two guests expected'; end if;
 -- Once the event starts or is cancelled, the link no longer lets anyone new join.
 update public.plans set starts_at=now()-interval '1 minute' where id='a3100000-0000-4000-8000-000000000001';
 update public.plans set status='cancelled' where id='a3100000-0000-4000-8000-000000000002';
end $$;
set local role authenticated;
-- Someone already on the event still gets it back after the start, from the current link and the old one.
select set_config('request.jwt.claims','{"sub":"a3000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if public.claim_plan_link((select code from gi1_codes where name='one-new'))<>'a3100000-0000-4000-8000-000000000001' then raise exception 'Attendee refused after the start'; end if;
 if public.claim_plan_link((select code from gi1_codes where name='one'))<>'a3100000-0000-4000-8000-000000000001' then raise exception 'Attendee refused by the old link after the start'; end if;
 begin perform public.claim_plan_link((select code from gi1_codes where name='two')); raise exception 'Joined a cancelled event';
 exception when insufficient_privilege then null; end;
end $$;
-- Someone who hasn't joined is refused once the event starts or is cancelled.
select set_config('request.jwt.claims','{"sub":"a3000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 begin perform public.claim_plan_link((select code from gi1_codes where name='one-new')); raise exception 'Joined a started event';
 exception when insufficient_privilege then null; end;
 begin perform public.claim_plan_link((select code from gi1_codes where name='two')); raise exception 'Joined a cancelled event';
 exception when insufficient_privilege then null; end;
end $$;
-- The organizer gets their event back after the start or a cancellation.
select set_config('request.jwt.claims','{"sub":"a3000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 if public.claim_plan_link((select code from gi1_codes where name='one-new'))<>'a3100000-0000-4000-8000-000000000001' then raise exception 'Organizer refused after the start'; end if;
 if public.claim_plan_link((select code from gi1_codes where name='two'))<>'a3100000-0000-4000-8000-000000000002' then raise exception 'Organizer refused after cancelling'; end if;
end $$;
reset role;
-- Account deletion's redaction blanks the area with the other organizer-written text.
do $$ begin
 update public.plans set area='Near Old Street', status='active', starts_at='2099-07-01 10:00+00' where id='a3100000-0000-4000-8000-000000000001';
 update public.profiles set deletion_requested_at=now() where id='a3000000-0000-4000-8000-000000000001';
 update public.plans set status='cancelled' where id='a3100000-0000-4000-8000-000000000001';
 if (select area from public.plans where id='a3100000-0000-4000-8000-000000000001')<>'' then raise exception 'Redaction kept the area'; end if;
 update public.profiles set deletion_requested_at=null where id='a3000000-0000-4000-8000-000000000001';
end $$;
rollback;
