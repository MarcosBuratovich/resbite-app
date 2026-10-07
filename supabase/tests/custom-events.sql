-- Custom events (CE1). Synthetic identities only; every change rolls back.
begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('a1000000-0000-4000-8000-000000000001','ce-owner@resbite-test.invalid',now(),'{}'),
 ('a1000000-0000-4000-8000-000000000002','ce-invitee@resbite-test.invalid',now(),'{}'),
 ('a1000000-0000-4000-8000-000000000003','ce-outsider@resbite-test.invalid',now(),'{}');
insert into private.tester_roster(email) values
 ('ce-owner@resbite-test.invalid'),('ce-invitee@resbite-test.invalid'),('ce-outsider@resbite-test.invalid');
insert into public.activities(id,title,description,category,artwork_key,source_ids,published,categories) values
 ('ce-idea','Idea fixture','Synthetic','Creative','painting',array['fixture'],true,array['creative','mindful']),
 ('ce-draft','Draft idea','Synthetic','Creative','painting',array['fixture'],false,null);
-- A published idea always has valid categories; an unpublished draft may not yet.
do $$ begin
 begin
  insert into public.activities(id,title,description,category,artwork_key,source_ids,published) values('ce-bad','Bad','Bad','Creative','painting',array['fixture'],true);
  raise exception 'Published idea without categories accepted';
 exception when check_violation then null; end;
 begin
  update public.activities set categories=array['creative','creative'] where id='ce-idea';
  raise exception 'Duplicate idea category accepted';
 exception when check_violation then null; end;
end $$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.save_profile('Owner');
-- From scratch: no idea, title trimmed, categories kept in the organizer's order.
select public.create_plan_v2('a2000000-0000-4000-8000-000000000001','  Dinner at Mario''s  ','Pasta night',array['community','uplifting'],null,now()+interval '1 day','Europe/London','Mario''s','Bring wine');
-- An identical retry returns the same event.
select public.create_plan_v2('a2000000-0000-4000-8000-000000000001','  Dinner at Mario''s  ','Pasta night',array['community','uplifting'],null,now()+interval '1 day','Europe/London','Mario''s','Bring wine');
do $$ begin
 if (select title from public.plans where id='a2000000-0000-4000-8000-000000000001')<>'Dinner at Mario''s' then raise exception 'Title not trimmed'; end if;
 if (select categories from public.plans where id='a2000000-0000-4000-8000-000000000001')<>array['community','uplifting'] then raise exception 'Category order lost'; end if;
 if (select activity_id from public.plans where id='a2000000-0000-4000-8000-000000000001') is not null then raise exception 'Scratch event linked to an idea'; end if;
 if (select count(*) from public.plans)<>1 then raise exception 'Retry duplicated the event'; end if;
 begin
  perform public.create_plan_v2('a2000000-0000-4000-8000-000000000001','Something else','Pasta night',array['community','uplifting'],null,now()+interval '1 day','Europe/London','Mario''s','Bring wine');
  raise exception 'Changed retry accepted';
 exception when invalid_parameter_value then null; end;
end $$;
-- From an idea: only published ideas can be used.
select public.create_plan_v2('a2000000-0000-4000-8000-000000000002','Idea fixture','Synthetic',array['creative','mindful'],'ce-idea',now()+interval '2 days','UTC','Studio','');
-- Exactly 80 characters is allowed.
select public.create_plan_v2('a2000000-0000-4000-8000-000000000005',repeat('x',80),'',array['creative'],null,now()+interval '2 days','UTC','Studio','');
do $$ begin
 if (select activity_id from public.plans where id='a2000000-0000-4000-8000-000000000002')<>'ce-idea' then raise exception 'Idea link lost'; end if;
 begin perform public.create_plan_v2('a2000000-0000-4000-8000-000000000003','Draft','',array['creative'],'ce-draft',now()+interval '2 days','UTC','Studio',''); raise exception 'Unpublished idea used'; exception when invalid_parameter_value then null; end;
 -- Field rules match the app (CE-D2, CE-D6).
 begin perform public.create_plan_v2('a2000000-0000-4000-8000-000000000004','   ','',array['creative'],null,now()+interval '1 day','UTC','Park',''); raise exception 'Blank title accepted'; exception when check_violation then null; end;
 begin perform public.create_plan_v2('a2000000-0000-4000-8000-000000000004',repeat('x',81),'',array['creative'],null,now()+interval '1 day','UTC','Park',''); raise exception 'Long title accepted'; exception when check_violation then null; end;
 begin perform public.create_plan_v2('a2000000-0000-4000-8000-000000000004',null,'',array['creative'],null,now()+interval '1 day','UTC','Park',''); raise exception 'Missing title accepted'; exception when not_null_violation then null; end;
 begin perform public.create_plan_v2('a2000000-0000-4000-8000-000000000004','Walk','x'||repeat('y',1000),array['creative'],null,now()+interval '1 day','UTC','Park',''); raise exception 'Long description accepted'; exception when check_violation then null; end;
 begin perform public.create_plan_v2('a2000000-0000-4000-8000-000000000004','Walk','',array[]::text[],null,now()+interval '1 day','UTC','Park',''); raise exception 'No category accepted'; exception when check_violation then null; end;
 begin perform public.create_plan_v2('a2000000-0000-4000-8000-000000000004','Walk','',array['creative','creative'],null,now()+interval '1 day','UTC','Park',''); raise exception 'Repeated category accepted'; exception when check_violation then null; end;
 begin perform public.create_plan_v2('a2000000-0000-4000-8000-000000000004','Walk','',array['creative','mindful','natural'],null,now()+interval '1 day','UTC','Park',''); raise exception 'Three categories accepted'; exception when check_violation then null; end;
 begin perform public.create_plan_v2('a2000000-0000-4000-8000-000000000004','Walk','',array['wellness'],null,now()+interval '1 day','UTC','Park',''); raise exception 'Unknown category accepted'; exception when check_violation then null; end;
 begin perform public.create_plan_v2('a2000000-0000-4000-8000-000000000004','Walk','',array['creative',null],null,now()+interval '1 day','UTC','Park',''); raise exception 'Null category accepted'; exception when check_violation then null; end;
 begin perform public.create_plan_v2('a2000000-0000-4000-8000-000000000004','Walk','',null,null,now()+interval '1 day','UTC','Park',''); raise exception 'Missing categories accepted'; exception when not_null_violation then null; end;
 begin perform public.create_plan_v2('a2000000-0000-4000-8000-000000000004',null,'',array['creative'],'ce-idea',now()+interval '1 day','UTC','Park',''); raise exception 'Idea filled a missing title'; exception when not_null_violation then null; end;
 begin perform public.create_plan_v2('a2000000-0000-4000-8000-000000000004','Walk','',null,'ce-idea',now()+interval '1 day','UTC','Park',''); raise exception 'Idea filled missing categories'; exception when not_null_violation then null; end;
 begin perform public.create_plan_v2('a2000000-0000-4000-8000-000000000004','Walk','',array['creative'],null,now()-interval '1 hour','UTC','Park',''); raise exception 'Past start accepted'; exception when invalid_parameter_value then null; end;
end $$;
-- The legacy create_plan keeps working: title and categories come from its idea.
select public.create_plan('a2000000-0000-4000-8000-000000000006','ce-idea',now()+interval '3 days','UTC','Legacy place');
do $$ begin
 if (select title from public.plans where id='a2000000-0000-4000-8000-000000000006')<>'Idea fixture'
 or (select categories from public.plans where id='a2000000-0000-4000-8000-000000000006')<>array['creative','mindful'] then
  raise exception 'Legacy create not filled from its idea';
 end if;
end $$;

-- Visibility is unchanged: the invitee reads event text, outsiders and anonymous users read nothing.
select public.create_invite('a3000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001',repeat('c',64));
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.save_profile('Invitee');
select public.claim_invite(repeat('c',64));
do $$ begin
 if (select title||'|'||description from public.plans where id='a2000000-0000-4000-8000-000000000001')<>'Dinner at Mario''s|Pasta night' then raise exception 'Invitee cannot read event text'; end if;
 if (select count(*) from public.plans)<>1 then raise exception 'Invitee sees other events'; end if;
 begin perform public.change_plan_v2('a2000000-0000-4000-8000-000000000001',1,'Hijacked','',array['creative'],now()+interval '1 day','UTC','Elsewhere','',false); raise exception 'Invitee edited the event'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select public.save_profile('Outsider');
do $$ begin
 if exists(select 1 from public.plans) then raise exception 'Outsider read an event'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform 1 from public.plans; raise exception 'Anonymous user read events'; exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Owner edits event text with the version check; RSVPs are not rewritten.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.change_plan_v2('a2000000-0000-4000-8000-000000000001',1,' Dinner & games ','Pasta then cards',array['community'],now()+interval '1 day','Europe/London','Mario''s','Bring wine',false);
do $$ begin
 if (select title||'|'||description||'|'||categories::text||'|'||version from public.plans where id='a2000000-0000-4000-8000-000000000001')<>'Dinner & games|Pasta then cards|{community}|2' then raise exception 'Edit not saved'; end if;
 if (select response from public.attendees where plan_id='a2000000-0000-4000-8000-000000000001')<>'pending' then raise exception 'Edit rewrote the RSVP'; end if;
 begin perform public.change_plan_v2('a2000000-0000-4000-8000-000000000001',1,'Stale','',array['community'],now()+interval '1 day','UTC','X','',false); raise exception 'Stale edit accepted'; exception when serialization_failure then null; end;
 begin perform public.change_plan_v2('a2000000-0000-4000-8000-000000000001',2,'Fine',repeat('d',1001),array['community'],now()+interval '1 day','UTC','X','',false); raise exception 'Invalid edit accepted'; exception when check_violation then null; end;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from private.notification_outbox where plan_id='a2000000-0000-4000-8000-000000000001' and recipient_id='a1000000-0000-4000-8000-000000000002' and kind='plan_changed') then raise exception 'Invitee not told about the edit'; end if;
end $$;

-- The legacy change_plan leaves event text alone; cancelling ignores the other arguments.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.change_plan('a2000000-0000-4000-8000-000000000001',2,now()+interval '1 day','Europe/London','New place','Bring wine',false);
do $$ begin
 if (select title from public.plans where id='a2000000-0000-4000-8000-000000000001')<>'Dinner & games' then raise exception 'Legacy edit lost the title'; end if;
end $$;
select public.change_plan_v2('a2000000-0000-4000-8000-000000000001',3,null,null,null,null,null,null,null,true);
do $$ begin
 if (select status||'|'||title from public.plans where id='a2000000-0000-4000-8000-000000000001')<>'cancelled|Dinner & games' then raise exception 'Cancel failed or changed the title'; end if;
 begin perform public.change_plan_v2('a2000000-0000-4000-8000-000000000001',4,null,null,null,null,null,null,null,true); raise exception 'Cancelled twice'; exception when invalid_parameter_value then null; end;
end $$;
reset role;
do $$ begin
 if exists(select 1 from private.invitations where plan_id='a2000000-0000-4000-8000-000000000001' and revoked_at is null) then raise exception 'Cancel left an open invitation'; end if;
end $$;

-- While an owner's profile is marked for deletion, no update keeps their event text.
update public.profiles set deletion_requested_at=now() where id='a1000000-0000-4000-8000-000000000001';
update public.plans set place_label='Meeting place removed', note='' where owner_id='a1000000-0000-4000-8000-000000000001';
do $$ begin
 if exists(select 1 from public.plans where owner_id='a1000000-0000-4000-8000-000000000001' and (title<>'Resbite' or description<>'')) then raise exception 'Deleting owner event text retained'; end if;
end $$;
rollback;
