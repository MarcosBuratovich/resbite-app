-- GI2 guest accounts (docs/superpowers/specs/2026-10-21-gi2-guest-accounts-design.md). Synthetic identities only.
-- One rolled-back block per slice; each block uses its own UUID prefix family (b1, b2, …).

-- Block 1: the grant and the join.
begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,is_anonymous,banned_until) values
 ('b1000000-0000-4000-8000-000000000001','gi2-1-owner@resbite-test.invalid',now(),'{}',false,null),
 ('b1000000-0000-4000-8000-000000000002','gi2-1-guest@resbite-test.invalid',now(),'{}',false,null),
 ('b1000000-0000-4000-8000-000000000003','gi2-1-revoked@resbite-test.invalid',now(),'{}',false,null),
 ('b1000000-0000-4000-8000-000000000004','gi2-1-unconfirmed@resbite-test.invalid',null,'{}',false,null),
 ('b1000000-0000-4000-8000-000000000005','gi2-1-refused@resbite-test.invalid',now(),'{}',false,null),
 ('b1000000-0000-4000-8000-000000000006',null,now(),'{}',true,null),
 ('b1000000-0000-4000-8000-000000000007','gi2-1-banned@resbite-test.invalid',now(),'{}',false,'2099-01-01 00:00+00'),
 ('b1000000-0000-4000-8000-000000000008','gi2-1-leaving@resbite-test.invalid',now(),'{}',false,null);
insert into private.tester_roster(email) values ('gi2-1-owner@resbite-test.invalid');
insert into public.profiles(id,display_name,deletion_requested_at) values ('b1000000-0000-4000-8000-000000000008','Leaving',now());
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.save_profile('Owner');
create temporary table gi2_codes(name text primary key, code text);
do $$ begin
 perform public.create_plan_v3('b1100000-0000-4000-8000-000000000001','Film night','',array['community'],null,
  '2099-06-01 19:30+00',null,'UTC','Cinema room, 12 Example Street','');
 insert into gi2_codes values('one',public.plan_link('b1100000-0000-4000-8000-000000000001'));
end $$;
-- A confirmed account with no roster row and no profile is not approved until it joins through a live link.
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare id uuid; begin
 if public.account_access_status()->>'status'<>'access_pending' then raise exception 'Guest approved before joining'; end if;
 id := public.join_by_link((select code from gi2_codes where name='one'),'Guest Two','2026-10');
 if id<>'b1100000-0000-4000-8000-000000000001' then raise exception 'Join returned the wrong plan'; end if;
 if public.account_access_status()->>'status'<>'approved' then raise exception 'Guest not approved after joining'; end if;
end $$;
reset role;
-- One transaction wrote the tick, the grant, the profile, the attendance and the organizer's notice.
do $$ declare v_link uuid := (select id from private.plan_links where code=(select code from gi2_codes where name='one')); begin
 if (select count(*) from private.beta_access where user_id='b1000000-0000-4000-8000-000000000002' and source='link' and plan_link_id=v_link and revoked_at is null and granted_at is not null)<>1 then raise exception 'One live grant from the link expected'; end if;
 if (select count(*) from private.age_attestations where user_id='b1000000-0000-4000-8000-000000000002' and terms_version='2026-10' and method='tick' and confirmed_at is not null)<>1 then raise exception 'One attestation expected'; end if;
 if (select display_name from public.profiles where id='b1000000-0000-4000-8000-000000000002') is distinct from 'Guest Two' then raise exception 'Profile not created with the name'; end if;
 if (select response from public.attendees where plan_id='b1100000-0000-4000-8000-000000000001' and user_id='b1000000-0000-4000-8000-000000000002') is distinct from 'pending' then raise exception 'Guest not pending on the event'; end if;
 if (select count(*) from private.notification_outbox where plan_id='b1100000-0000-4000-8000-000000000001' and kind='invitation'
  and recipient_id='b1000000-0000-4000-8000-000000000001' and actor_id='b1000000-0000-4000-8000-000000000002'
  and dedupe_key='link:'||v_link||':b1000000-0000-4000-8000-000000000002')<>1 then raise exception 'One invitation notice to the organizer expected'; end if;
end $$;
-- Joining again returns the event and rewrites nothing: the first name and the first tick stay.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if public.join_by_link((select code from gi2_codes where name='one'),'Other Name','2027-01')<>'b1100000-0000-4000-8000-000000000001' then raise exception 'Second join returned another plan'; end if;
 -- The grant works wherever the roster did: the event reads through RLS and the guest can answer.
 if (select count(*) from public.plans where id='b1100000-0000-4000-8000-000000000001')<>1 then raise exception 'Guest cannot read the event'; end if;
 perform public.respond('b1100000-0000-4000-8000-000000000001','accepted',(select version from public.attendees
  where plan_id='b1100000-0000-4000-8000-000000000001' and user_id='b1000000-0000-4000-8000-000000000002'));
 if (select response from public.attendees where plan_id='b1100000-0000-4000-8000-000000000001' and user_id='b1000000-0000-4000-8000-000000000002')<>'accepted' then raise exception 'Answer not saved'; end if;
end $$;
reset role;
do $$ begin
 if (select display_name from public.profiles where id='b1000000-0000-4000-8000-000000000002')<>'Guest Two' then raise exception 'A later join rewrote the name'; end if;
 if (select terms_version from private.age_attestations where user_id='b1000000-0000-4000-8000-000000000002')<>'2026-10' then raise exception 'A later join rewrote the tick'; end if;
 if (select count(*) from private.beta_access where user_id='b1000000-0000-4000-8000-000000000002')<>1 then raise exception 'A later join added a grant'; end if;
 if (select count(*) from private.notification_outbox where plan_id='b1100000-0000-4000-8000-000000000001' and kind='invitation')<>1 then raise exception 'A later join notified again'; end if;
end $$;
-- The grant stands in for the roster row only: a grant holder who is banned, anonymous or leaving is not approved.
update auth.users set banned_until='2099-01-01 00:00+00' where id='b1000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if public.account_access_status()->>'status'='approved' then raise exception 'A banned grant holder is approved'; end if;
end $$;
reset role;
update auth.users set banned_until=null,is_anonymous=true where id='b1000000-0000-4000-8000-000000000002';
set local role authenticated;
do $$ begin
 if public.account_access_status()->>'status'='approved' then raise exception 'An anonymous grant holder is approved'; end if;
end $$;
reset role;
update auth.users set is_anonymous=false where id='b1000000-0000-4000-8000-000000000002';
update public.profiles set deletion_requested_at=now() where id='b1000000-0000-4000-8000-000000000002';
set local role authenticated;
do $$ begin
 if public.account_access_status()->>'status'='approved' then raise exception 'A leaving grant holder is approved'; end if;
end $$;
reset role;
update public.profiles set deletion_requested_at=null where id='b1000000-0000-4000-8000-000000000002';
-- With the local-only deletion lifecycle (20261022120001), a grant holder with a deletion request is not approved either.
do $$ begin
 if to_regclass('private.account_deletion_jobs') is not null then
  insert into private.account_deletion_jobs(request_id,user_id,recovery_hash)
  values ('b1900000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000002',extensions.digest('gi2-1-guest','sha256'));
 end if;
end $$;
set local role authenticated;
do $$ begin
 if to_regclass('private.account_deletion_jobs') is not null and public.account_access_status()->>'status'='approved' then
  raise exception 'A grant holder with a deletion request is approved';
 end if;
end $$;
reset role;
do $$ begin
 if to_regclass('private.account_deletion_jobs') is not null then
  delete from private.account_deletion_jobs where user_id='b1000000-0000-4000-8000-000000000002';
 end if;
end $$;
-- A revoked grant is the owner's ban: no link lifts it.
insert into private.beta_access(user_id,source,revoked_at) values ('b1000000-0000-4000-8000-000000000003','link',now());
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 begin perform public.join_by_link((select code from gi2_codes where name='one'),'Banned','2026-10'); raise exception 'A revoked grant joined';
 exception when others then if sqlstate<>'42501' or sqlerrm<>'Invitation unavailable' then raise; end if; end;
end $$;
-- Signed out, unconfirmed, anonymous, banned or leaving accounts are refused before anything else.
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
do $$ begin
 begin perform public.join_by_link((select code from gi2_codes where name='one'),'Nobody','2026-10'); raise exception 'No session joined';
 exception when others then if sqlstate<>'42501' or sqlerrm<>'Sign-in required' then raise; end if; end;
end $$;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin
 begin perform public.join_by_link((select code from gi2_codes where name='one'),'Unconfirmed','2026-10'); raise exception 'Unconfirmed account joined';
 exception when others then if sqlstate<>'42501' or sqlerrm<>'Sign-in required' then raise; end if; end;
end $$;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}',true);
do $$ begin
 begin perform public.join_by_link((select code from gi2_codes where name='one'),'Anonymous','2026-10'); raise exception 'Anonymous account joined';
 exception when others then if sqlstate<>'42501' or sqlerrm<>'Sign-in required' then raise; end if; end;
end $$;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000007","role":"authenticated"}',true);
do $$ begin
 begin perform public.join_by_link((select code from gi2_codes where name='one'),'Banned','2026-10'); raise exception 'Banned account joined';
 exception when others then if sqlstate<>'42501' or sqlerrm<>'Sign-in required' then raise; end if; end;
end $$;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000008","role":"authenticated"}',true);
do $$ begin
 begin perform public.join_by_link((select code from gi2_codes where name='one'),'Leaving','2026-10'); raise exception 'Leaving account joined';
 exception when others then if sqlstate<>'42501' or sqlerrm<>'Sign-in required' then raise; end if; end;
end $$;
-- An account with a deletion request but no profile is refused too. The deletion lifecycle is local-only
-- (20261022120001), so the hosted-baseline run skips this.
reset role;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('b1000000-0000-4000-8000-00000000000b','gi2-1-deleting@resbite-test.invalid',now(),'{}');
do $$ begin
 if to_regclass('private.account_deletion_jobs') is not null then
  insert into private.account_deletion_jobs(request_id,user_id,recovery_hash)
  values ('b1900000-0000-4000-8000-00000000000b','b1000000-0000-4000-8000-00000000000b',extensions.digest('gi2-1-deleting','sha256'));
 end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-00000000000b","role":"authenticated"}',true);
do $$ begin
 if to_regclass('private.account_deletion_jobs') is not null then
  begin perform public.join_by_link((select code from gi2_codes where name='one'),'Deleting','2026-10'); raise exception 'An account with a deletion request joined';
  exception when others then if sqlstate<>'42501' or sqlerrm<>'Sign-in required' then raise; end if; end;
 end if;
end $$;
-- A new account must give a name and the tick; bad codes are refused like a turned-off link.
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
do $$ begin
 begin perform public.join_by_link((select code from gi2_codes where name='one'),'','2026-10'); raise exception 'Empty name accepted';
 exception when others then if sqlstate<>'22023' or sqlerrm<>'Name required' then raise; end if; end;
 begin perform public.join_by_link((select code from gi2_codes where name='one'),'   ','2026-10'); raise exception 'Blank name accepted';
 exception when others then if sqlstate<>'22023' or sqlerrm<>'Name required' then raise; end if; end;
 begin perform public.join_by_link((select code from gi2_codes where name='one'),null,'2026-10'); raise exception 'Null name accepted';
 exception when others then if sqlstate<>'22023' or sqlerrm<>'Name required' then raise; end if; end;
 begin perform public.join_by_link((select code from gi2_codes where name='one'),repeat('x',81),'2026-10'); raise exception '81-character name accepted';
 exception when others then if sqlstate<>'22023' or sqlerrm<>'Name required' then raise; end if; end;
 begin perform public.join_by_link((select code from gi2_codes where name='one'),'Guest Five',''); raise exception 'Missing tick accepted';
 exception when others then if sqlstate<>'22023' or sqlerrm<>'Age confirmation required' then raise; end if; end;
 begin perform public.join_by_link((select code from gi2_codes where name='one'),'Guest Five',null); raise exception 'Null tick accepted';
 exception when others then if sqlstate<>'22023' or sqlerrm<>'Age confirmation required' then raise; end if; end;
 begin perform public.join_by_link((select code from gi2_codes where name='one'),'Guest Five','2026-1'); raise exception 'Malformed terms version accepted';
 exception when others then if sqlstate<>'22023' or sqlerrm<>'Age confirmation required' then raise; end if; end;
 begin perform public.join_by_link('short','Guest Five','2026-10'); raise exception 'Malformed code joined';
 exception when others then if sqlstate<>'42501' or sqlerrm<>'Invitation unavailable' then raise; end if; end;
 begin perform public.join_by_link(null,'Guest Five','2026-10'); raise exception 'Null code joined';
 exception when others then if sqlstate<>'42501' or sqlerrm<>'Invitation unavailable' then raise; end if; end;
 begin perform public.join_by_link('AAAAAAAAAAAAAAAAAAAAAA','Guest Five','2026-10'); raise exception 'Unknown code joined';
 exception when others then if sqlstate<>'42501' or sqlerrm<>'Invitation unavailable' then raise; end if; end;
 if public.account_access_status()->>'status'<>'access_pending' then raise exception 'A refused join approved the account'; end if;
end $$;
reset role;
-- Nothing was written for anyone who was refused.
do $$ begin
 if exists(select 1 from private.beta_access where user_id in ('b1000000-0000-4000-8000-000000000004','b1000000-0000-4000-8000-000000000005',
  'b1000000-0000-4000-8000-000000000006','b1000000-0000-4000-8000-000000000007','b1000000-0000-4000-8000-000000000008',
  'b1000000-0000-4000-8000-00000000000b')) then raise exception 'A refused join made a grant'; end if;
 if (select count(*) from private.beta_access where user_id='b1000000-0000-4000-8000-000000000003' and revoked_at is not null)<>1
  or (select count(*) from private.beta_access where user_id='b1000000-0000-4000-8000-000000000003')<>1 then raise exception 'The revoked grant changed'; end if;
 if exists(select 1 from private.age_attestations where user_id<>'b1000000-0000-4000-8000-000000000002') then raise exception 'A refused join stored a tick'; end if;
 if exists(select 1 from public.profiles where id in ('b1000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000004',
  'b1000000-0000-4000-8000-000000000005','b1000000-0000-4000-8000-000000000006','b1000000-0000-4000-8000-000000000007',
  'b1000000-0000-4000-8000-00000000000b')) then raise exception 'A refused join made a profile'; end if;
 if (select display_name from public.profiles where id='b1000000-0000-4000-8000-000000000008')<>'Leaving' then raise exception 'A refused join renamed a profile'; end if;
 if exists(select 1 from public.attendees where user_id<>'b1000000-0000-4000-8000-000000000002') then raise exception 'A refused join added a guest'; end if;
 if exists(select 1 from private.notification_outbox where actor_id<>'b1000000-0000-4000-8000-000000000002') then raise exception 'A refused join notified the organizer'; end if;
end $$;
-- An account that already has a profile (a former tester) keeps its name: none is needed, and the one sent is ignored.
-- An account whose tick is already stored keeps the first one: none is needed.
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('b1000000-0000-4000-8000-000000000009','gi2-1-former@resbite-test.invalid',now(),'{}'),
 ('b1000000-0000-4000-8000-00000000000a','gi2-1-ticked@resbite-test.invalid',now(),'{}');
insert into public.profiles(id,display_name) values ('b1000000-0000-4000-8000-000000000009','Former Tester');
insert into private.age_attestations(user_id,terms_version) values ('b1000000-0000-4000-8000-00000000000a','2025-01');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000009","role":"authenticated"}',true);
do $$ begin
 if public.join_by_link((select code from gi2_codes where name='one'),'','2026-10')<>'b1100000-0000-4000-8000-000000000001' then raise exception 'Former tester join returned another plan'; end if;
 if public.account_access_status()->>'status'<>'approved' then raise exception 'Former tester not approved after joining'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-00000000000a","role":"authenticated"}',true);
do $$ begin
 if public.join_by_link((select code from gi2_codes where name='one'),'Ticked','')<>'b1100000-0000-4000-8000-000000000001' then raise exception 'Already-ticked join returned another plan'; end if;
end $$;
-- Signed out, nobody can call the join; nobody but the database reads the new tables.
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ begin
 begin perform public.join_by_link('AAAAAAAAAAAAAAAAAAAAAA','Anon','2026-10'); raise exception 'Anonymous role joined';
 exception when insufficient_privilege then if sqlerrm<>'permission denied for function join_by_link' then raise; end if; end;
 begin perform private.user_eligible('b1000000-0000-4000-8000-000000000002'); raise exception 'Anonymous role called user_eligible';
 exception when insufficient_privilege then null; end;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 begin perform 1 from private.beta_access; raise exception 'A client read the grants';
 exception when insufficient_privilege then null; end;
 begin perform 1 from private.age_attestations; raise exception 'A client read the attestations';
 exception when insufficient_privilege then null; end;
 begin perform private.has_live_grant('b1000000-0000-4000-8000-000000000002'); raise exception 'A client called has_live_grant';
 exception when insufficient_privilege then null; end;
 begin perform private.deletion_pending('b1000000-0000-4000-8000-000000000002'); raise exception 'A client called deletion_pending';
 exception when insufficient_privilege then null; end;
 begin perform private.user_eligible('b1000000-0000-4000-8000-000000000001'); raise exception 'A client called user_eligible';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if (select display_name from public.profiles where id='b1000000-0000-4000-8000-000000000009')<>'Former Tester' then raise exception 'Join renamed an existing profile'; end if;
 if not exists(select 1 from private.beta_access where user_id='b1000000-0000-4000-8000-000000000009' and revoked_at is null)
 or not exists(select 1 from private.age_attestations where user_id='b1000000-0000-4000-8000-000000000009' and terms_version='2026-10') then raise exception 'Former tester has no grant or tick'; end if;
 if (select count(*) from private.age_attestations where user_id='b1000000-0000-4000-8000-00000000000a' and terms_version='2025-01')<>1 then raise exception 'Join replaced a stored tick'; end if;
 if (select display_name from public.profiles where id='b1000000-0000-4000-8000-00000000000a') is distinct from 'Ticked'
 or not exists(select 1 from private.beta_access where user_id='b1000000-0000-4000-8000-00000000000a' and revoked_at is null) then raise exception 'Already-ticked account not joined'; end if;
 if has_function_privilege('anon','public.join_by_link(text,text,text)','execute') or has_function_privilege('service_role','public.join_by_link(text,text,text)','execute')
 or has_function_privilege('anon','private.join_by_link(text,text,text)','execute') or has_function_privilege('service_role','private.join_by_link(text,text,text)','execute')
 or not has_function_privilege('authenticated','public.join_by_link(text,text,text)','execute') then raise exception 'join_by_link grants wrong'; end if;
 if has_function_privilege('anon','private.deletion_pending(uuid)','execute') or has_function_privilege('authenticated','private.deletion_pending(uuid)','execute') then raise exception 'deletion_pending exposed'; end if;
 if has_function_privilege('anon','private.user_eligible(uuid)','execute') or has_function_privilege('authenticated','private.user_eligible(uuid)','execute') then raise exception 'user_eligible exposed'; end if;
 -- The tables hold only what they say.
 begin insert into private.beta_access(user_id,source) values ('b1000000-0000-4000-8000-000000000005','roster'); raise exception 'Unknown grant source accepted';
 exception when check_violation then null; end;
 begin insert into private.age_attestations(user_id,terms_version) values ('b1000000-0000-4000-8000-000000000005','2026-1'); raise exception 'Malformed terms version stored';
 exception when check_violation then null; end;
 begin insert into private.age_attestations(user_id,terms_version,method) values ('b1000000-0000-4000-8000-000000000005','2026-10','birthday'); raise exception 'Unknown method stored';
 exception when check_violation then null; end;
end $$;
rollback;

-- Block 2: the link must be live; eligible users take GI1's path; notifications reach grant holders.
begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('b2000000-0000-4000-8000-000000000001','gi2-2-owner@resbite-test.invalid',now(),'{}'),
 ('b2000000-0000-4000-8000-000000000002','gi2-2-tester@resbite-test.invalid',now(),'{}'),
 ('b2000000-0000-4000-8000-000000000003','gi2-2-guest@resbite-test.invalid',now(),'{}'),
 ('b2000000-0000-4000-8000-000000000004','gi2-2-late@resbite-test.invalid',now(),'{}'),
 ('b2000000-0000-4000-8000-000000000005','gi2-2-outsider@resbite-test.invalid',now(),'{}');
insert into private.tester_roster(email) values ('gi2-2-owner@resbite-test.invalid'),('gi2-2-tester@resbite-test.invalid');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.save_profile('Tester');
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.save_profile('Owner');
create temporary table gi2_codes(name text primary key, code text);
do $$ begin
 perform public.create_plan_v3('b2100000-0000-4000-8000-000000000001','Picnic','',array['community'],null,
  '2099-07-01 12:00+00',null,'UTC','The park','');
 perform public.create_plan_v3('b2100000-0000-4000-8000-000000000002','Quiz','',array['community'],null,
  '2099-07-02 19:00+00',null,'UTC','The pub','');
 insert into gi2_codes values('one',public.plan_link('b2100000-0000-4000-8000-000000000001')),('dead',public.plan_link('b2100000-0000-4000-8000-000000000002'));
 insert into gi2_codes values('two',public.rotate_plan_link('b2100000-0000-4000-8000-000000000002'));
end $$;
-- A turned-off link grants nothing.
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 begin perform public.join_by_link((select code from gi2_codes where name='dead'),'Guest Three','2026-10'); raise exception 'Joined by a turned-off link';
 exception when others then if sqlstate<>'42501' or sqlerrm<>'Invitation unavailable' then raise; end if; end;
end $$;
-- A cancelled event's live link grants nothing.
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.change_plan_v3('b2100000-0000-4000-8000-000000000001',1,'Picnic','',array['community'],'2099-07-01 12:00+00',null,'UTC','The park','',true);
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 begin perform public.join_by_link((select code from gi2_codes where name='one'),'Guest Three','2026-10'); raise exception 'Joined a cancelled event';
 exception when others then if sqlstate<>'42501' or sqlerrm<>'Invitation unavailable' then raise; end if; end;
end $$;
reset role;
do $$ begin
 if exists(select 1 from private.beta_access where user_id='b2000000-0000-4000-8000-000000000003')
 or exists(select 1 from private.age_attestations where user_id='b2000000-0000-4000-8000-000000000003')
 or exists(select 1 from public.profiles where id='b2000000-0000-4000-8000-000000000003')
 or exists(select 1 from public.attendees where user_id='b2000000-0000-4000-8000-000000000003')
 or exists(select 1 from private.notification_outbox where kind='invitation' and actor_id='b2000000-0000-4000-8000-000000000003') then raise exception 'A dead link wrote something'; end if;
end $$;
-- A fresh event: the guest joins (the name is trimmed); a roster tester takes GI1's path and gets no grant or tick.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 perform public.create_plan_v3('b2100000-0000-4000-8000-000000000003','Dinner','',array['community'],null,
  '2099-07-03 19:00+00',null,'UTC','My flat','');
 insert into gi2_codes values('three',public.plan_link('b2100000-0000-4000-8000-000000000003'));
end $$;
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 if public.join_by_link((select code from gi2_codes where name='three'),'  Guest Three ','2026-10')<>'b2100000-0000-4000-8000-000000000003' then raise exception 'Guest join returned another plan'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if public.join_by_link((select code from gi2_codes where name='three'),'ignored','ignored')<>'b2100000-0000-4000-8000-000000000003' then raise exception 'Tester join returned another plan'; end if;
end $$;
reset role;
do $$ begin
 if (select display_name from public.profiles where id='b2000000-0000-4000-8000-000000000003')<>'Guest Three' then raise exception 'Name not trimmed'; end if;
 if not exists(select 1 from private.beta_access where user_id='b2000000-0000-4000-8000-000000000003' and revoked_at is null) then raise exception 'Guest has no grant'; end if;
 if exists(select 1 from private.beta_access where user_id='b2000000-0000-4000-8000-000000000002')
 or exists(select 1 from private.age_attestations where user_id='b2000000-0000-4000-8000-000000000002') then raise exception 'The tester path wrote a grant or a tick'; end if;
 if (select display_name from public.profiles where id='b2000000-0000-4000-8000-000000000002')<>'Tester' then raise exception 'The tester path renamed the tester'; end if;
 if (select response from public.attendees where plan_id='b2100000-0000-4000-8000-000000000003' and user_id='b2000000-0000-4000-8000-000000000002') is distinct from 'pending' then raise exception 'Tester not on the event'; end if;
 -- Once the event has started, only people already on it get it back.
 update public.plans set starts_at=now()-interval '1 hour' where id='b2100000-0000-4000-8000-000000000003';
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin
 begin perform public.join_by_link((select code from gi2_codes where name='three'),'Late Guest','2026-10'); raise exception 'Joined a started event';
 exception when others then if sqlstate<>'42501' or sqlerrm<>'Invitation unavailable' then raise; end if; end;
end $$;
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 if public.join_by_link((select code from gi2_codes where name='three'),'Guest Three','2026-10')<>'b2100000-0000-4000-8000-000000000003' then raise exception 'Guest refused after the start'; end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from private.beta_access where user_id='b2000000-0000-4000-8000-000000000004')
 or exists(select 1 from private.age_attestations where user_id='b2000000-0000-4000-8000-000000000004')
 or exists(select 1 from public.profiles where id='b2000000-0000-4000-8000-000000000004')
 or exists(select 1 from public.attendees where user_id='b2000000-0000-4000-8000-000000000004')
 or exists(select 1 from private.notification_outbox where kind='invitation' and actor_id='b2000000-0000-4000-8000-000000000004') then raise exception 'A started event wrote something'; end if;
end $$;
-- Notices reach a live grant holder and the roster tester, not a revoked grant or someone with neither. The
-- sender's check is local-only (20261022120001), so the hosted-baseline run skips these assertions.
insert into public.profiles(id,display_name) values ('b2000000-0000-4000-8000-000000000005','Outsider');
insert into public.attendees(plan_id,user_id) values ('b2100000-0000-4000-8000-000000000003','b2000000-0000-4000-8000-000000000005');
insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key) values
 ('b2100000-0000-4000-8000-000000000003','b2000000-0000-4000-8000-000000000003','plan_changed','gi2-2:guest'),
 ('b2100000-0000-4000-8000-000000000003','b2000000-0000-4000-8000-000000000002','plan_changed','gi2-2:tester'),
 ('b2100000-0000-4000-8000-000000000003','b2000000-0000-4000-8000-000000000005','plan_changed','gi2-2:outsider');
do $$ begin
 if to_regprocedure('private.notification_recipient_eligible(bigint)') is not null then
  if not private.notification_recipient_eligible((select id from private.notification_outbox where dedupe_key='gi2-2:guest')) then raise exception 'A grant holder is not notified'; end if;
  if not private.notification_recipient_eligible((select id from private.notification_outbox where dedupe_key='gi2-2:tester')) then raise exception 'The tester is not notified'; end if;
  if private.notification_recipient_eligible((select id from private.notification_outbox where dedupe_key='gi2-2:outsider')) then raise exception 'Someone with neither roster nor grant is notified'; end if;
 end if;
 update private.beta_access set revoked_at=now() where user_id='b2000000-0000-4000-8000-000000000003';
 if to_regprocedure('private.notification_recipient_eligible(bigint)') is not null then
  if private.notification_recipient_eligible((select id from private.notification_outbox where dedupe_key='gi2-2:guest')) then raise exception 'A revoked grant is still notified'; end if;
 end if;
end $$;
-- A revoked grant counts as absent everywhere, even for someone already on the event.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 if public.account_access_status()->>'status'<>'access_pending' then raise exception 'A revoked grant is still approved'; end if;
 if exists(select 1 from public.plans where id='b2100000-0000-4000-8000-000000000003') then raise exception 'A revoked grant still reads the event'; end if;
 begin perform public.join_by_link((select code from gi2_codes where name='three'),'Guest Three','2026-10'); raise exception 'A revoked grant got the event back';
 exception when others then if sqlstate<>'42501' or sqlerrm<>'Invitation unavailable' then raise; end if; end;
end $$;
-- An organizer dropped from the roster lets nobody in through their link: not themselves, not a new guest. Back
-- on the roster, the same link works again.
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 perform public.create_plan_v3('b2100000-0000-4000-8000-000000000004','Brunch','',array['community'],null,
  '2099-07-04 11:00+00',null,'UTC','The cafe','');
 insert into gi2_codes values('four',public.plan_link('b2100000-0000-4000-8000-000000000004'));
end $$;
reset role;
update private.tester_roster set enabled=false where email='gi2-2-owner@resbite-test.invalid';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 if public.account_access_status()->>'status'<>'access_pending' then raise exception 'Organizer still approved off the roster'; end if;
 begin perform public.join_by_link((select code from gi2_codes where name='four'),'Owner','2026-10'); raise exception 'Organizer let themselves back in';
 exception when others then if sqlstate<>'42501' or sqlerrm<>'Invitation unavailable' then raise; end if; end;
end $$;
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin
 begin perform public.join_by_link((select code from gi2_codes where name='four'),'Late Guest','2026-10'); raise exception 'Joined through a de-provisioned organizer''s link';
 exception when others then if sqlstate<>'42501' or sqlerrm<>'Invitation unavailable' then raise; end if; end;
end $$;
reset role;
do $$ begin
 if exists(select 1 from private.beta_access where user_id in ('b2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000004'))
 or exists(select 1 from private.age_attestations where user_id in ('b2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000004'))
 or exists(select 1 from public.profiles where id='b2000000-0000-4000-8000-000000000004')
 or exists(select 1 from public.attendees where user_id in ('b2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000004'))
 or exists(select 1 from private.notification_outbox where plan_id='b2100000-0000-4000-8000-000000000004') then raise exception 'A de-provisioned organizer''s link wrote something'; end if;
 if (select display_name from public.profiles where id='b2000000-0000-4000-8000-000000000001')<>'Owner' then raise exception 'The refused organizer was renamed'; end if;
end $$;
update private.tester_roster set enabled=true where email='gi2-2-owner@resbite-test.invalid';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin
 if public.join_by_link((select code from gi2_codes where name='four'),'Late Guest','2026-10')<>'b2100000-0000-4000-8000-000000000004' then raise exception 'Join refused after the organizer is back'; end if;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from private.beta_access where user_id='b2000000-0000-4000-8000-000000000004' and revoked_at is null
  and plan_link_id=(select id from private.plan_links where code=(select code from gi2_codes where name='four'))) then raise exception 'No grant after the organizer is back'; end if;
 if (select response from public.attendees where plan_id='b2100000-0000-4000-8000-000000000004' and user_id='b2000000-0000-4000-8000-000000000004') is distinct from 'pending' then raise exception 'Guest not on the event after the organizer is back'; end if;
end $$;
-- A former tester already on the event gets a grant from a new link, and the organizer no second notice.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.join_by_link((select code from gi2_codes where name='four'),'ignored','ignored');
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 insert into gi2_codes values('five',public.rotate_plan_link('b2100000-0000-4000-8000-000000000004'));
end $$;
reset role;
update private.tester_roster set enabled=false where email='gi2-2-tester@resbite-test.invalid';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if public.account_access_status()->>'status'<>'access_pending' then raise exception 'Former tester still approved'; end if;
 if public.join_by_link((select code from gi2_codes where name='five'),'','2026-10')<>'b2100000-0000-4000-8000-000000000004' then raise exception 'Former tester join returned another plan'; end if;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from private.beta_access where user_id='b2000000-0000-4000-8000-000000000002' and revoked_at is null
  and plan_link_id=(select id from private.plan_links where code=(select code from gi2_codes where name='five'))) then raise exception 'Former tester got no grant'; end if;
 if (select count(*) from public.attendees where plan_id='b2100000-0000-4000-8000-000000000004' and user_id='b2000000-0000-4000-8000-000000000002')<>1 then raise exception 'Former tester attendance changed'; end if;
 if (select count(*) from private.notification_outbox where plan_id='b2100000-0000-4000-8000-000000000004' and kind='invitation'
  and actor_id='b2000000-0000-4000-8000-000000000002')<>1 then raise exception 'An existing guest notified the organizer again'; end if;
end $$;
rollback;
