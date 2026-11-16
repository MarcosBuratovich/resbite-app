-- Open beta (20261116120000_open_beta.sql): any confirmed account may use the app; only the owner's suspension (a
-- revoked grant or a disabled roster row), an Auth ban, an anonymous session or leaving keeps one out. The resbite's own
-- approval for answers through the event link is unchanged. Synthetic identities only (prefix e7); one rolled-back block.
-- Users e7…: 01 host (phone only, nothing else), 02 Ana (phone only, new), 03 Ben (email only, new), 04 unconfirmed
-- phone, 05 suspended by a revoked grant, 06 suspended by a disabled roster row, 07 banned in Auth, 08 anonymous,
-- 09 an old roster tester with no 18+ tick, 10 Cal (phone only, new), 11 leaving.
begin;
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at,banned_until,is_anonymous) values
 ('e7000000-0000-4000-8000-000000000001',null,null,'447700900701',now(),null,false),
 ('e7000000-0000-4000-8000-000000000002',null,null,'447700900702',now(),null,false),
 ('e7000000-0000-4000-8000-000000000003','ob-ben@resbite-test.invalid',now(),null,null,null,false),
 ('e7000000-0000-4000-8000-000000000004',null,null,'447700900704',null,null,false),
 ('e7000000-0000-4000-8000-000000000005',null,null,'447700900705',now(),null,false),
 ('e7000000-0000-4000-8000-000000000006','ob-disabled@resbite-test.invalid',now(),null,null,null,false),
 ('e7000000-0000-4000-8000-000000000007',null,null,'447700900707',now(),'2099-01-01 00:00+00',false),
 ('e7000000-0000-4000-8000-000000000008',null,null,null,null,null,true),
 ('e7000000-0000-4000-8000-000000000009','ob-tester@resbite-test.invalid',now(),null,null,null,false),
 ('e7000000-0000-4000-8000-000000000010',null,null,'447700900710',now(),null,false),
 ('e7000000-0000-4000-8000-000000000011',null,null,'447700900711',now(),null,false);
insert into public.profiles(id,display_name) values
 ('e7000000-0000-4000-8000-000000000001','Host'),('e7000000-0000-4000-8000-000000000009','Tester');
insert into public.profiles(id,display_name,deletion_requested_at) values ('e7000000-0000-4000-8000-000000000011','Leaving',now());
insert into private.age_attestations(user_id,terms_version) values ('e7000000-0000-4000-8000-000000000001','2026-10');
insert into private.beta_access(user_id,source,revoked_at) values ('e7000000-0000-4000-8000-000000000005','maintainer',now());
insert into private.tester_roster(email,enabled) values ('ob-disabled@resbite-test.invalid',false),('ob-tester@resbite-test.invalid',true);
insert into public.plans(id,owner_id,title,starts_at,time_zone,place_label,area,categories) values
 ('e7100000-0000-4000-8000-000000000001','e7000000-0000-4000-8000-000000000001','Picnic','2099-06-01 12:00+00','UTC','Secret Park','Riverside',array['community']);
insert into private.plan_links(plan_id,code) values ('e7100000-0000-4000-8000-000000000001',repeat('E',22));

-- 1. Who may use the app, and what the access check says.
create function pg_temp.ob_status(p_uid uuid) returns text language plpgsql as $$
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_uid,'role','authenticated')::text,true);
 return public.account_access_status()->>'status';
end $$;
do $$ declare pairs text[] := array['01:approved','02:approved','03:approved','04:unconfirmed','05:access_pending',
  '06:access_pending','07:access_pending','08:access_pending','09:approved','10:approved','11:access_pending'];
 p text; uid uuid; got text; eligible boolean;
begin
 foreach p in array pairs loop
  uid := ('e7000000-0000-4000-8000-0000000000'||split_part(p,':',1))::uuid;
  got := pg_temp.ob_status(uid);
  if got is distinct from split_part(p,':',2) then raise exception 'Account % status %, expected %', split_part(p,':',1), got, split_part(p,':',2); end if;
  eligible := private.user_eligible(uid);
  if eligible is distinct from (split_part(p,':',2)='approved') then raise exception 'Account % user_eligible %', split_part(p,':',1), eligible; end if;
 end loop;
end $$;
select set_config('request.jwt.claims','{}',true);

-- 2. A new phone account with no roster row and no grant writes like any account: it saves its profile.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e7000000-0000-4000-8000-000000000010","role":"authenticated"}',true);
do $$ begin perform public.save_profile('Cal'); end $$;
reset role;
do $$ begin
 if (select display_name from public.profiles where id='e7000000-0000-4000-8000-000000000010') is distinct from 'Cal' then
  raise exception 'An open account could not save its profile';
 end if;
end $$;

-- 3. Answering through the event link still waits for the host, and a new account still gives its name and the 18+
-- tick first.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e7000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 begin perform public.request_to_join(repeat('E',22),'Ana','accepted',null); raise exception 'No tick accepted';
 exception when others then if sqlerrm is distinct from 'Age confirmation required' then raise; end if; end;
 r := public.request_to_join(repeat('E',22),' Ana ','accepted','2026-10');
 if r->>'state' is distinct from 'waiting' then raise exception 'Request returned %', r; end if;
end $$;
reset role;
do $$ begin
 if (select status from private.join_requests where plan_id='e7100000-0000-4000-8000-000000000001'
   and user_id='e7000000-0000-4000-8000-000000000002') is distinct from 'waiting' then raise exception 'Waiting request expected'; end if;
 if (select terms_version from private.age_attestations where user_id='e7000000-0000-4000-8000-000000000002') is distinct from '2026-10' then
  raise exception 'Tick expected';
 end if;
 if (select display_name from public.profiles where id='e7000000-0000-4000-8000-000000000002') is distinct from 'Ana' then raise exception 'Profile expected'; end if;
 if exists(select 1 from public.attendees where user_id='e7000000-0000-4000-8000-000000000002') then raise exception 'A request made an attendee'; end if;
end $$;
-- The host approves: Ana is on the resbite, and the approval still records a grant.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e7000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.decide_join_request('e7100000-0000-4000-8000-000000000001','e7000000-0000-4000-8000-000000000002',true);
reset role;
do $$ begin
 if not exists(select 1 from public.attendees where plan_id='e7100000-0000-4000-8000-000000000001'
   and user_id='e7000000-0000-4000-8000-000000000002' and response='accepted') then raise exception 'Approval made no attendee'; end if;
 if (select source from private.beta_access where user_id='e7000000-0000-4000-8000-000000000002' and revoked_at is null) is distinct from 'approval' then
  raise exception 'Approval recorded no grant';
 end if;
end $$;

-- 4. join_by_link (older builds) asks a new account for its name and tick and makes a waiting request.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e7000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 begin perform public.join_by_link(repeat('E',22),null,'2026-10'); raise exception 'No name accepted';
 exception when others then if sqlerrm is distinct from 'Name required' then raise; end if; end;
 begin perform public.join_by_link(repeat('E',22),'Ben',null); raise exception 'No tick accepted';
 exception when others then if sqlerrm is distinct from 'Age confirmation required' then raise; end if; end;
 perform public.join_by_link(repeat('E',22),'Ben','2026-10');
end $$;
reset role;
do $$ begin
 if (select status from private.join_requests where plan_id='e7100000-0000-4000-8000-000000000001'
   and user_id='e7000000-0000-4000-8000-000000000003') is distinct from 'waiting' then raise exception 'join_by_link: waiting request expected'; end if;
 if not exists(select 1 from private.age_attestations where user_id='e7000000-0000-4000-8000-000000000003') then raise exception 'join_by_link: tick expected'; end if;
end $$;

-- 5. An old roster tester with no tick on record is not asked for one.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e7000000-0000-4000-8000-000000000009","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 r := public.request_to_join(repeat('E',22),null,'maybe',null);
 if r->>'state' is distinct from 'waiting' then raise exception 'Tester request returned %', r; end if;
end $$;

-- 6. Suspended, banned and leaving accounts stay out.
do $$ declare u text; begin
 foreach u in array array['05','06','07','11'] loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub','e7000000-0000-4000-8000-0000000000'||u,'role','authenticated')::text,true);
  begin
   perform public.request_to_join(repeat('E',22),'Someone','accepted','2026-10');
   raise exception 'Account % asked to join', u;
  exception when insufficient_privilege then null;
  end;
 end loop;
end $$;
reset role;

-- 7. The helpers are private.
do $$ declare f regprocedure; begin
 foreach f in array array['private.granted_access(uuid)'::regprocedure,'private.access_suspended(uuid)'::regprocedure] loop
  if has_function_privilege('anon',f,'EXECUTE') or has_function_privilege('authenticated',f,'EXECUTE')
   or has_function_privilege('service_role',f,'EXECUTE') then raise exception '% has client grants', f; end if;
 end loop;
end $$;
rollback;
