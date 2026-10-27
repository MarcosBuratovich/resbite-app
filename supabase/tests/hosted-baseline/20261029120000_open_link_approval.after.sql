-- Rehearsal checks for 20261029120000_open_link_approval (hosted-baseline mode only).
-- 1. Against the fingerprint: the migration added exactly its table (with its indexes and constraints) and thirteen
-- functions, redefined exactly claim_plan_link(), join_by_link(), fold_web_account(), the outbox kind check and the
-- grant-source check, removed nothing, changed nothing else (every grant and the private schema's included) and wrote
-- no rows.
do $$ declare v_fns text[] := array['private.request_join(uuid,private.plan_links,public.plans,text)',
  'private.request_to_join(text,text,text,text)','public.request_to_join(text,text,text,text)',
  'private.my_join_request(text)','public.my_join_request(text)','private.my_join_requests()','public.my_join_requests()',
  'private.change_join_answer(uuid,text)','public.change_join_answer(uuid,text)',
  'private.plan_join_requests(uuid)','public.plan_join_requests(uuid)',
  'private.decide_join_request(uuid,uuid,boolean)','public.decide_join_request(uuid,uuid,boolean)'];
 v_added text[]; v_removed text[]; v_changed text[]; v_expected text[];
begin
 v_expected := array['relation private.join_requests','relation private.join_requests_pkey',
  'relation private.join_requests_user_idx','relation private.join_requests_plan_link_idx',
  'constraint private.join_requests join_requests_pkey','constraint private.join_requests join_requests_plan_id_fkey',
  'constraint private.join_requests join_requests_user_id_fkey','constraint private.join_requests join_requests_plan_link_id_fkey',
  'constraint private.join_requests join_requests_response_check','constraint private.join_requests join_requests_status_check']
  || array(select 'definition '||f from unnest(v_fns) f) || array(select 'grants '||f from unnest(v_fns) f);
 select coalesce(array_agg(n.name order by n.name),'{}') into v_added from private.approval_rehearsal_snapshot() n
  where not exists(select 1 from private.approval_rehearsal_baseline b where b.name=n.name);
 select coalesce(array_agg(b.name order by b.name),'{}') into v_removed from private.approval_rehearsal_baseline b
  where not exists(select 1 from private.approval_rehearsal_snapshot() n where n.name=b.name);
 select coalesce(array_agg(b.name order by b.name),'{}') into v_changed from private.approval_rehearsal_baseline b
  join private.approval_rehearsal_snapshot() n on n.name=b.name where b.definition is distinct from n.definition;
 if v_added is distinct from array(select e from unnest(v_expected) e order by e) then
  raise exception 'The apply added %', v_added;
 end if;
 if v_removed<>'{}' then raise exception 'The apply removed %', v_removed; end if;
 if v_changed is distinct from array(select e from unnest(array['constraint private.beta_access beta_access_source_check',
  'constraint private.notification_outbox notification_outbox_kind_check','definition private.claim_plan_link(text)',
  'definition private.fold_web_account(uuid,uuid)','definition private.join_by_link(text,text,text)']) e order by e) then
  raise exception 'The apply changed %', v_changed;
 end if;
 select coalesce(array_agg(n.name order by n.name),'{}') into v_changed from private.approval_rehearsal_snapshot() n
  where (n.name='constraint private.notification_outbox notification_outbox_kind_check'
    and (n.definition not like '%''invited''%' or n.definition not like '%''join_request''%' or n.definition not like '%''join_approved''%'))
  or (n.name='constraint private.beta_access beta_access_source_check'
    and (n.definition not like '%''invitation''%' or n.definition not like '%''approval''%'))
  or (n.name in ('definition private.claim_plan_link(text)','definition private.join_by_link(text,text,text)')
    and (n.definition not like '%perform private.request_join(v_uid,v_link,v_plan,''pending'');%'
     or n.definition like '%insert into public.attendees%' or n.definition like '%insert into private.beta_access%'))
  or (n.name='definition private.fold_web_account(uuid,uuid)' and n.definition not like '%update private.join_requests set user_id=p_into%');
 if v_changed<>'{}' then raise exception 'Redefinitions without the request kinds, the approval source or the requests: %', v_changed; end if;
 if exists(select 1 from private.join_requests) or exists(select 1 from private.notification_outbox where kind in ('join_request','join_approved'))
 or exists(select 1 from private.beta_access where source='approval') then
  raise exception 'The apply wrote rows';
 end if;
end $$;
-- 2. Grants: the table and request_join() for nobody; asking, the caller's own requests, changing the answer, the
-- host's list and the decision for signed-in accounts only, as private definers behind public invokers.
do $$ declare r text; s text; f text; begin
 foreach r in array array['anon','authenticated','service_role'] loop
  if has_table_privilege(r,'private.join_requests','select,insert,update,delete') then raise exception '% may use join_requests', r; end if;
  if has_function_privilege(r,'private.request_join(uuid,private.plan_links,public.plans,text)','execute') then
   raise exception '% may call request_join', r;
  end if;
 end loop;
 if not (select relrowsecurity from pg_catalog.pg_class where oid='private.join_requests'::regclass)
 or not (select prosecdef from pg_catalog.pg_proc where oid='private.request_join(uuid,private.plan_links,public.plans,text)'::regprocedure) then
  raise exception 'join_requests without row security or request_join not a definer';
 end if;
 foreach s in array array['private.','public.'] loop
  foreach f in array array['request_to_join(text,text,text,text)','my_join_request(text)','my_join_requests()',
   'change_join_answer(uuid,text)','plan_join_requests(uuid)','decide_join_request(uuid,uuid,boolean)'] loop
   if not has_function_privilege('authenticated',s||f,'execute') or has_function_privilege('anon',s||f,'execute')
   or has_function_privilege('service_role',s||f,'execute') then raise exception '% grants wrong', s||f; end if;
   if (select prosecdef from pg_catalog.pg_proc where oid=(s||f)::regprocedure) is distinct from (s='private.') then
    raise exception '% has the wrong security', s||f;
   end if;
  end loop;
 end loop;
end $$;
-- 3. Ana asks on the web; Bea asks too; Cal's old build joins by link and then picks an answer; the tester's old
-- build claims the link; Dee asks; the link guest already on the event gets 'already'. The host sees five waiting,
-- approves Ana and Bea and declines Dee, and Bea is then banned. Cal and the tester are still waiting. The rollback
-- restores every fingerprint entry exactly, deletes the requests with their table and the request and approval
-- notices, and turns the approval grants into link grants (Bea's ban stays a ban); approved guests keep their places
-- and their access, and the restored bodies admit straight from the link again. Rehearsed, then undone.
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"cc000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if public.request_to_join(repeat('R',22),'Rehearsal Ana','accepted','2026-10')->>'state' is distinct from 'waiting' then
  raise exception 'Ana not waiting';
 end if;
end $$;
select set_config('request.jwt.claims','{"sub":"cc000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 if public.request_to_join(repeat('R',22),'Rehearsal Bea','maybe','2026-10')->>'state' is distinct from 'waiting' then
  raise exception 'Bea not waiting';
 end if;
end $$;
select set_config('request.jwt.claims','{"sub":"cc000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin
 if public.join_by_link(repeat('R',22),'Rehearsal Cal','2026-10') is distinct from 'cd000000-0000-4000-8000-000000000001'::uuid then
  raise exception 'Old join_by_link did not return the plan';
 end if;
 perform public.change_join_answer('cd000000-0000-4000-8000-000000000001','accepted');
 if public.my_join_requests()->0->>'status' is distinct from 'waiting'
 or public.my_join_request(repeat('R',22))->'request'->>'response' is distinct from 'accepted' then
  raise exception 'Cal''s request wrong';
 end if;
end $$;
select set_config('request.jwt.claims','{"sub":"cc000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
do $$ begin
 if public.claim_plan_link(repeat('R',22)) is distinct from 'cd000000-0000-4000-8000-000000000001'::uuid then
  raise exception 'Old claim_plan_link did not return the plan';
 end if;
end $$;
select set_config('request.jwt.claims','{"sub":"cc000000-0000-4000-8000-000000000006","role":"authenticated"}',true);
do $$ begin
 if public.request_to_join(repeat('R',22),'Rehearsal Dee','accepted','2026-10')->>'state' is distinct from 'waiting' then
  raise exception 'Dee not waiting';
 end if;
end $$;
select set_config('request.jwt.claims','{"sub":"cc000000-0000-4000-8000-000000000007","role":"authenticated"}',true);
do $$ begin
 if public.request_to_join(repeat('R',22),null,'maybe',null)->>'state' is distinct from 'already' then
  raise exception 'The link guest was turned into a request';
 end if;
end $$;
select set_config('request.jwt.claims','{"sub":"cc000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 if jsonb_array_length(public.plan_join_requests('cd000000-0000-4000-8000-000000000001'))<>5 then raise exception 'Host list wrong'; end if;
 if public.decide_join_request('cd000000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000002',true)->>'status'<>'approved'
 or public.decide_join_request('cd000000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000003',true)->>'status'<>'approved'
 or public.decide_join_request('cd000000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000006',false)->>'status'<>'declined' then
  raise exception 'Decisions wrong';
 end if;
end $$;
reset role;
update private.beta_access set revoked_at=now() where user_id='cc000000-0000-4000-8000-000000000003';
do $$ begin
 if (select count(*) from private.join_requests where plan_id='cd000000-0000-4000-8000-000000000001')<>5
 or (select count(*) from private.notification_outbox where kind='join_request')<>5
 or (select count(*) from private.notification_outbox where kind='join_approved')<>2
 or (select count(*) from private.beta_access where source='approval' and revoked_at is null)<>1
 or (select count(*) from private.beta_access where source='approval' and revoked_at is not null)<>1
 or (select count(*) from public.attendees where plan_id='cd000000-0000-4000-8000-000000000001')<>3
 or not private.user_eligible('cc000000-0000-4000-8000-000000000002') or private.user_eligible('cc000000-0000-4000-8000-000000000003') then
  raise exception 'Rehearsal data missing before the rollback';
 end if;
end $$;
\ir ../../rollback/20261029120000_open_link_approval.rollback.sql
do $$ declare item record; begin
 for item in
  select coalesce(b.name,n.name) as name, b.definition as before, n.definition as after
  from private.approval_rehearsal_baseline b full join private.approval_rehearsal_snapshot() n on n.name=b.name
 loop
  if item.before is distinct from item.after then raise exception 'Rollback did not restore %', item.name; end if;
 end loop;
 if pg_catalog.to_regclass('private.join_requests') is not null then raise exception 'join_requests survived the rollback'; end if;
 -- The request and approval notices are gone; the earlier notice stays.
 if exists(select 1 from private.notification_outbox where kind not in ('invitation','rsvp','plan_changed','plan_cancelled','guest_note','invited'))
 or (select count(*) from private.notification_outbox where plan_id='cd000000-0000-4000-8000-000000000001')<>1
 or not exists(select 1 from private.notification_outbox where dedupe_key='approval-rehearsal:link-guest') then
  raise exception 'Rollback deleted the wrong notices';
 end if;
 -- Ana's live approval grant is a live link grant on the same link; Bea's ban is a revoked link grant; the
 -- maintainer and link grants stay; nobody else got one.
 if not exists(select 1 from private.beta_access where user_id='cc000000-0000-4000-8000-000000000002' and source='link'
     and revoked_at is null and plan_link_id='ce000000-0000-4000-8000-000000000001')
 or not exists(select 1 from private.beta_access where user_id='cc000000-0000-4000-8000-000000000003' and source='link'
     and revoked_at is not null and plan_link_id='ce000000-0000-4000-8000-000000000001')
 or (select count(*) from private.beta_access where user_id in ('cc000000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000005')
     and source='maintainer' and revoked_at is null)<>2
 or not exists(select 1 from private.beta_access where user_id='cc000000-0000-4000-8000-000000000007' and source='link' and revoked_at is null)
 or exists(select 1 from private.beta_access where user_id in ('cc000000-0000-4000-8000-000000000004','cc000000-0000-4000-8000-000000000006'))
 or exists(select 1 from private.beta_access where source not in ('link','maintainer','invitation')) then
  raise exception 'Rollback changed the wrong grants';
 end if;
 -- Approved guests keep their places and answers (Bea too, as a banned link guest would); Ana keeps her access and
 -- Bea stays out. Waiting and declined people have no place; everyone keeps the name and tick they gave.
 if (select response from public.attendees where plan_id='cd000000-0000-4000-8000-000000000001' and user_id='cc000000-0000-4000-8000-000000000002')
    is distinct from 'accepted'
 or (select response from public.attendees where plan_id='cd000000-0000-4000-8000-000000000001' and user_id='cc000000-0000-4000-8000-000000000003')
    is distinct from 'maybe'
 or (select count(*) from public.attendees where plan_id='cd000000-0000-4000-8000-000000000001')<>3 then
  raise exception 'Rollback changed the places';
 end if;
 if not private.user_eligible('cc000000-0000-4000-8000-000000000002') or private.user_eligible('cc000000-0000-4000-8000-000000000003') then
  raise exception 'Rollback changed who gets in';
 end if;
 if (select count(*) from public.profiles where id in ('cc000000-0000-4000-8000-000000000002','cc000000-0000-4000-8000-000000000003',
     'cc000000-0000-4000-8000-000000000004','cc000000-0000-4000-8000-000000000006'))<>4
 or (select count(*) from private.age_attestations where terms_version='2026-10' and user_id in ('cc000000-0000-4000-8000-000000000002',
     'cc000000-0000-4000-8000-000000000003','cc000000-0000-4000-8000-000000000004','cc000000-0000-4000-8000-000000000006'))<>4 then
  raise exception 'Rollback lost a name or a tick';
 end if;
end $$;
-- The restored bodies admit straight from the link again: the waiting tester claims it and is on the event, the
-- declined Dee joins by it with a link grant, and the banned Bea is still refused.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"cc000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
do $$ begin perform public.claim_plan_link(repeat('R',22)); end $$;
select set_config('request.jwt.claims','{"sub":"cc000000-0000-4000-8000-000000000006","role":"authenticated"}',true);
do $$ begin perform public.join_by_link(repeat('R',22),null,null); end $$;
select set_config('request.jwt.claims','{"sub":"cc000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 perform public.join_by_link(repeat('R',22),null,null);
 raise exception 'The banned guest joined by the link';
exception when insufficient_privilege then null;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from public.attendees where plan_id='cd000000-0000-4000-8000-000000000001' and user_id='cc000000-0000-4000-8000-000000000005')
 or not exists(select 1 from public.attendees where plan_id='cd000000-0000-4000-8000-000000000001' and user_id='cc000000-0000-4000-8000-000000000006')
 or not exists(select 1 from private.beta_access where user_id='cc000000-0000-4000-8000-000000000006' and source='link' and revoked_at is null)
 or (select count(*) from private.notification_outbox where kind='invitation' and dedupe_key like 'link:ce000000-0000-4000-8000-000000000001:%')<>2 then
  raise exception 'The restored bodies did not admit from the link';
 end if;
end $$;
-- The restored fold works without requests: Dee's web account folds into the email account, place and grant.
set local role service_role;
do $$ begin
 if public.fold_web_account('cc000000-0000-4000-8000-000000000006','cc000000-0000-4000-8000-000000000008')<>'{"moved_attendees":1}'::jsonb then
  raise exception 'Fold wrong';
 end if;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from public.attendees where plan_id='cd000000-0000-4000-8000-000000000001' and user_id='cc000000-0000-4000-8000-000000000008')
 or not private.user_eligible('cc000000-0000-4000-8000-000000000008') then
  raise exception 'The fold did not move the place or the grant';
 end if;
end $$;
rollback;
-- 4. Remove the seed and the rehearsal helpers so later tests start clean.
delete from public.plans where id='cd000000-0000-4000-8000-000000000001';
delete from auth.users where id in ('cc000000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000002',
 'cc000000-0000-4000-8000-000000000003','cc000000-0000-4000-8000-000000000004','cc000000-0000-4000-8000-000000000005',
 'cc000000-0000-4000-8000-000000000006','cc000000-0000-4000-8000-000000000007','cc000000-0000-4000-8000-000000000008');
drop table private.approval_rehearsal_baseline;
drop function private.approval_rehearsal_snapshot();
