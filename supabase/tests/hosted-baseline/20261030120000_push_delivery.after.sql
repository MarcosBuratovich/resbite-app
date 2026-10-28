-- Rehearsal checks for 20261030120000_push_delivery (hosted-baseline mode only).
-- 1. Against the fingerprint: the migration added exactly the delivery ledger (with its columns, indexes and
-- constraints), the outbox's expanded_at, a comment on the outbox's delivered_at and six functions (unregister_device's
-- private body and its public façade among them); redefined exactly
-- register_device() and fold_web_account() (public.register_device() is replaced with the same text, and every grant
-- it repeats comes out as it was); removed nothing; changed nothing else (every grant and the private schema's
-- included) and wrote no rows.
do $$ declare v_fns text[] := array['private.notification_recipient_eligible(bigint)',
  'public.claim_notification_deliveries(integer)','public.validate_notification_delivery(uuid,uuid)',
  'public.finish_notification_delivery(uuid,uuid,text,text,integer)','private.unregister_device(text)',
  'public.unregister_device(text)'];
 v_columns text[] := array['id','outbox_id','token','endpoint_updated_at','state','attempts','next_attempt_at',
  'lease_id','lease_until','ticket_id','ticket_created_at'];
 v_added text[]; v_removed text[]; v_changed text[]; v_expected text[];
begin
 v_expected := array['relation private.notification_deliveries','relation private.notification_deliveries_pkey',
  'relation private.notification_deliveries_outbox_id_token_key','relation private.notification_deliveries_due_idx',
  'index private.notification_deliveries_pkey','index private.notification_deliveries_outbox_id_token_key',
  'index private.notification_deliveries_due_idx',
  'constraint private.notification_deliveries notification_deliveries_pkey',
  'constraint private.notification_deliveries notification_deliveries_outbox_id_fkey',
  'constraint private.notification_deliveries notification_deliveries_outbox_id_token_key',
  'constraint private.notification_deliveries notification_deliveries_state_check',
  'column private.notification_outbox.expanded_at','comment column delivered_at of table private.notification_outbox']
  || array(select 'column private.notification_deliveries.'||c from unnest(v_columns) c)
  || array(select 'definition '||f from unnest(v_fns) f) || array(select 'grants '||f from unnest(v_fns) f);
 select coalesce(array_agg(n.name order by n.name),'{}') into v_added from private.push_rehearsal_snapshot() n
  where not exists(select 1 from private.push_rehearsal_baseline b where b.name=n.name);
 select coalesce(array_agg(b.name order by b.name),'{}') into v_removed from private.push_rehearsal_baseline b
  where not exists(select 1 from private.push_rehearsal_snapshot() n where n.name=b.name);
 select coalesce(array_agg(b.name order by b.name),'{}') into v_changed from private.push_rehearsal_baseline b
  join private.push_rehearsal_snapshot() n on n.name=b.name where b.definition is distinct from n.definition;
 if v_added is distinct from array(select e from unnest(v_expected) e order by e) then
  raise exception 'The apply added %', v_added;
 end if;
 if v_removed<>'{}' then raise exception 'The apply removed %', v_removed; end if;
 if v_changed is distinct from array['definition private.fold_web_account(uuid,uuid)','definition private.register_device(text,text)'] then
  raise exception 'The apply changed %', v_changed;
 end if;
 select coalesce(array_agg(n.name order by n.name),'{}') into v_changed from private.push_rehearsal_snapshot() n
  where (n.name='definition private.register_device(text,text)'
    and (n.definition like '%require_tester%' or n.definition not like '%(ExponentPushToken|ExpoPushToken)%'
     or n.definition not like '%private.deletion_pending(v_uid)%'))
  or (n.name='definition private.fold_web_account(uuid,uuid)'
    and n.definition not like '%update private.notification_outbox set actor_id=p_into where actor_id=p_from and delivered_at is null;%')
  or (n.name='column private.notification_outbox.expanded_at' and n.definition not like 'timestamp with time zone notnull=f default= %')
  or (n.name='comment column delivered_at of table private.notification_outbox' and n.definition<>'Worker processing finished '
    ||'across all endpoints; not a guarantee of delivery or reading. Inspect delivery ledger outcomes.');
 if v_changed<>'{}' then raise exception 'Not the migration''s register_device, fold, expanded_at or comment: %', v_changed; end if;
 if exists(select 1 from private.notification_deliveries) or exists(select 1 from private.notification_outbox where expanded_at is not null)
 or exists((select what, row from private.push_rehearsal_rows) except (select 'device', to_jsonb(e) from private.device_endpoints e
   union all select 'notice', to_jsonb(o)-'expanded_at' from private.notification_outbox o))
 or exists((select 'device', to_jsonb(e) from private.device_endpoints e
   union all select 'notice', to_jsonb(o)-'expanded_at' from private.notification_outbox o) except (select what, row from private.push_rehearsal_rows)) then
  raise exception 'The apply wrote rows';
 end if;
end $$;
-- 2. Grants: the ledger and the audience check for nobody; the worker's claim, check and outcome for the service role
-- only; registering and unregistering a device for signed-in accounts, never anon.
do $$ declare r text; f text; begin
 foreach r in array array['anon','authenticated','service_role'] loop
  if has_table_privilege(r,'private.notification_deliveries','select,insert,update,delete') then raise exception '% may use the ledger', r; end if;
  if has_function_privilege(r,'private.notification_recipient_eligible(bigint)','execute') then
   raise exception '% may call notification_recipient_eligible', r;
  end if;
 end loop;
 if not (select relrowsecurity from pg_catalog.pg_class where oid='private.notification_deliveries'::regclass) then
  raise exception 'The ledger has no row security';
 end if;
 foreach f in array array['public.claim_notification_deliveries(integer)','public.validate_notification_delivery(uuid,uuid)',
  'public.finish_notification_delivery(uuid,uuid,text,text,integer)'] loop
  if not has_function_privilege('service_role',f,'execute') or has_function_privilege('anon',f,'execute')
  or has_function_privilege('authenticated',f,'execute') then raise exception '% grants wrong', f; end if;
 end loop;
 foreach f in array array['private.register_device(text,text)','public.register_device(text,text)',
  'private.unregister_device(text)','public.unregister_device(text)'] loop
  if not has_function_privilege('authenticated',f,'execute') or has_function_privilege('anon',f,'execute') then
   raise exception '% grants wrong', f;
  end if;
 end loop;
 -- The house pattern: the private body a definer with an empty search path, the public façade an invoker.
 if not (select prosecdef and proconfig @> array['search_path=""'] from pg_catalog.pg_proc
   where oid='private.unregister_device(text)'::regprocedure)
 or (select prosecdef from pg_catalog.pg_proc where oid='public.unregister_device(text)'::regprocedure) then
  raise exception 'unregister_device is not a private definer behind an invoker façade';
 end if;
end $$;
-- 3. Ana asks to join and, while she waits, registers her phone (the migration's rule: the foundation's
-- body refused anyone without access); Hana registers hers. The worker expands Gil's answer and Ana's request to Hana's
-- phone: the answer is received, the request gets a ticket and stays unsent. Hana approves Ana (an unsent, unexpanded
-- notice to her) and Kit asks on the web (another). The open-link rollback, tried first, refuses and changes nothing:
-- its text is there, and its push guard comes before anything it drops, updates or deletes.
-- The push rollback restores every fingerprint entry exactly and deletes the ledger with its rows and expanded_at;
-- every device stays as it was, Ana's and Hana's included, and every notice stays as it was, the three unsent ones
-- unsent. The restored bodies are the earlier ones again. Then the open-link rollback runs, in the documented order,
-- and goes through. Rehearsed, then undone.
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"da000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 if public.request_to_join(repeat('P',22),'Rehearsal Ana','accepted','2026-10')->>'state' is distinct from 'waiting' then
  raise exception 'Ana not waiting';
 end if;
 perform public.register_device('ExpoPushToken[push-rehearsal-ana]','android');
end $$;
select set_config('request.jwt.claims','{"sub":"da000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin perform public.register_device('ExpoPushToken[push-rehearsal-hana]','ios'); end $$;
reset role;
set local role service_role;
do $$ declare v_jobs jsonb; v_job jsonb; begin
 v_jobs := public.claim_notification_deliveries(25);
 if jsonb_array_length(v_jobs)<>2 or (select array_agg(j->>'kind' order by j->>'kind') from jsonb_array_elements(v_jobs) j)<>array['join_request','rsvp']
 or exists(select 1 from jsonb_array_elements(v_jobs) j where j->>'token'<>'ExpoPushToken[push-rehearsal-hana]') then
  raise exception 'Claim wrong: %', v_jobs;
 end if;
 for v_job in select j from jsonb_array_elements(v_jobs) j loop
  if v_job->>'kind'='rsvp' then
   perform public.finish_notification_delivery((v_job->>'id')::uuid,(v_job->>'lease_id')::uuid,'received');
  else
   perform public.finish_notification_delivery((v_job->>'id')::uuid,(v_job->>'lease_id')::uuid,'ticket','push-rehearsal-ticket');
  end if;
 end loop;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"da000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 if public.decide_join_request('db000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000003',true)->>'status'<>'approved' then
  raise exception 'Approval wrong';
 end if;
end $$;
select set_config('request.jwt.claims','{"sub":"da000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
do $$ begin
 if public.request_to_join(repeat('P',22),'Rehearsal Kit','maybe','2026-10')->>'state' is distinct from 'waiting' then
  raise exception 'Kit not waiting';
 end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from private.notification_deliveries where state='received')<>1
 or (select count(*) from private.notification_deliveries where state='ticket')<>1
 or (select count(*) from private.notification_deliveries)<>2
 or (select count(*) from private.notification_outbox where plan_id='db000000-0000-4000-8000-000000000001')<>4
 or (select count(*) from private.notification_outbox where plan_id='db000000-0000-4000-8000-000000000001' and expanded_at is not null)<>2
 or (select count(*) from private.notification_outbox where plan_id='db000000-0000-4000-8000-000000000001' and delivered_at is null)<>3
 or (select delivered_at from private.notification_outbox where dedupe_key='push-rehearsal:gil-rsvp') is null
 or (select count(*) from private.device_endpoints where user_id in ('da000000-0000-4000-8000-000000000001',
     'da000000-0000-4000-8000-000000000002','da000000-0000-4000-8000-000000000003'))<>3 then
  raise exception 'Rehearsal data missing before the rollback';
 end if;
end $$;
-- The open-link rollback, tried now, while push delivery is installed, stops at its guard with its message and changes
-- nothing. The whole file runs as text (the harness passes the repository's path as resbite_repo); every fingerprint
-- entry and every request, notice, ledger row and grant is compared before and after.
\set push_rehearsal_open_link `cat :'resbite_repo'/supabase/rollback/20261029120000_open_link_approval.rollback.sql`
create temporary table push_rehearsal_open_link on commit drop as select :'push_rehearsal_open_link'::text as script;
-- The text is that rollback with its push guard, and the guard's DO block comes before its first drop, update or
-- delete (its comments left out: they mention all three). Refusing first is what leaves everything as it was.
do $check$ declare v_code text; v_do integer; v_guard integer; v_end integer; v_first integer;
begin
 if coalesce(length(btrim((select script from push_rehearsal_open_link))),0)=0 then
  raise exception 'The open-link rollback text is empty';
 end if;
 v_code := regexp_replace((select script from push_rehearsal_open_link),'--[^\n]*','','g');
 v_do := strpos(v_code,'do $$ begin');
 v_guard := strpos(v_code,'if to_regclass(''private.notification_deliveries'') is not null then raise exception '
  ||'''Run the push delivery rollback (20261030120000) first''; end if;');
 v_end := strpos(v_code,'end $$;');
 v_first := regexp_instr(v_code,'\m(drop|update|delete)\M',1,1,0,'i');
 if v_guard=0 then raise exception 'The open-link rollback has no push guard'; end if;
 if v_do=0 or v_end=0 or v_first=0 or not (v_do<v_guard and v_guard<v_end and v_end<v_first) then
  raise exception 'The open-link rollback''s push guard is not in a DO block before its first change (do %, guard %, end %, change %)',
   v_do, v_guard, v_end, v_first;
 end if;
end $check$;
create temporary table push_rehearsal_before_open_link on commit drop as
 select name, definition from private.push_rehearsal_snapshot()
 union all select 'request', to_jsonb(j)::text from private.join_requests j
 union all select 'notice', to_jsonb(o)::text from private.notification_outbox o
 union all select 'delivery', to_jsonb(d)::text from private.notification_deliveries d
 union all select 'grant', to_jsonb(b)::text from private.beta_access b;
do $$ begin
 execute (select script from push_rehearsal_open_link);
 raise exception 'The open-link rollback ran while push delivery was installed';
exception when raise_exception then
 if sqlerrm is distinct from 'Run the push delivery rollback (20261030120000) first' then raise; end if;
end $$;
create temporary table push_rehearsal_after_open_link on commit drop as
 select name, definition from private.push_rehearsal_snapshot()
 union all select 'request', to_jsonb(j)::text from private.join_requests j
 union all select 'notice', to_jsonb(o)::text from private.notification_outbox o
 union all select 'delivery', to_jsonb(d)::text from private.notification_deliveries d
 union all select 'grant', to_jsonb(b)::text from private.beta_access b;
do $$ begin
 if exists(select * from push_rehearsal_before_open_link except select * from push_rehearsal_after_open_link)
 or exists(select * from push_rehearsal_after_open_link except select * from push_rehearsal_before_open_link)
 or (select count(*) from push_rehearsal_before_open_link)<>(select count(*) from push_rehearsal_after_open_link) then
  raise exception 'The refused open-link rollback changed something';
 end if;
end $$;
-- Every device and notice as it is now (kept outside both schemas, so not in the fingerprint), the notices without the
-- column the rollback drops, to compare after it.
create temporary table push_rehearsal_kept on commit drop as
 select 'device' as what, to_jsonb(e) as row from private.device_endpoints e
 union all select 'notice', to_jsonb(o)-'expanded_at' from private.notification_outbox o;
\ir ../../rollback/20261030120000_push_delivery.rollback.sql
do $$ declare item record; begin
 for item in
  select coalesce(b.name,n.name) as name, b.definition as before, n.definition as after
  from private.push_rehearsal_baseline b full join private.push_rehearsal_snapshot() n on n.name=b.name
 loop
  if item.before is distinct from item.after then raise exception 'Rollback did not restore %', item.name; end if;
 end loop;
 if pg_catalog.to_regclass('private.notification_deliveries') is not null then raise exception 'The ledger survived the rollback'; end if;
 if exists(select 1 from pg_catalog.pg_attribute where attrelid='private.notification_outbox'::regclass and attname='expanded_at'
   and not attisdropped) then
  raise exception 'expanded_at survived the rollback';
 end if;
 -- Every device stays as it was: Gil's from before the migration, and Ana's and Hana's registered under it, with their
 -- accounts, platforms and times. Every notice stays as it was: Gil's answer delivered, the request with a ticket, the
 -- approval and Kit's request unsent.
 if exists((select what, row from push_rehearsal_kept) except (select 'device', to_jsonb(e) from private.device_endpoints e
   union all select 'notice', to_jsonb(o) from private.notification_outbox o))
 or exists((select 'device', to_jsonb(e) from private.device_endpoints e
   union all select 'notice', to_jsonb(o) from private.notification_outbox o) except (select what, row from push_rehearsal_kept)) then
  raise exception 'Rollback changed a device or a notice';
 end if;
 if not exists(select 1 from private.device_endpoints where token='ExpoPushToken[push-rehearsal-ana]'
   and user_id='da000000-0000-4000-8000-000000000003' and platform='android')
 or not exists(select 1 from private.device_endpoints where token='ExpoPushToken[push-rehearsal-hana]'
   and user_id='da000000-0000-4000-8000-000000000001' and platform='ios')
 or (select count(*) from private.notification_outbox where plan_id='db000000-0000-4000-8000-000000000001' and delivered_at is null)<>3 then
  raise exception 'Rollback lost a registered device or an unsent notice';
 end if;
end $$;
-- The restored register_device is the foundation's: Kit, waiting without access, is refused again, and Hana's
-- account registers a token the migration's pattern refuses.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"da000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
do $$ begin
 perform public.register_device('ExpoPushToken[push-rehearsal-kit]','ios');
 raise exception 'Kit registered a device without access';
exception when insufficient_privilege then null;
end $$;
select set_config('request.jwt.claims','{"sub":"da000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin perform public.register_device('push-rehearsal-legacy','ios'); end $$;
reset role;
-- The restored fold is plan 3's: Kit's web account folds into Ola's app account with his request, and his unsent
-- notice isn't carried: it loses its actor with his profile, as before the migration.
set local role service_role;
do $$ begin
 if public.fold_web_account('da000000-0000-4000-8000-000000000005','da000000-0000-4000-8000-000000000004')<>'{"moved_attendees":0}'::jsonb then
  raise exception 'Fold wrong';
 end if;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from private.device_endpoints where token='push-rehearsal-legacy' and user_id='da000000-0000-4000-8000-000000000001')
 or exists(select 1 from private.device_endpoints where token='ExpoPushToken[push-rehearsal-kit]') then
  raise exception 'The restored register_device is not the foundation''s';
 end if;
 if not exists(select 1 from private.join_requests where plan_id='db000000-0000-4000-8000-000000000001'
   and user_id='da000000-0000-4000-8000-000000000004' and status='waiting')
 or exists(select 1 from private.notification_outbox where actor_id='da000000-0000-4000-8000-000000000004')
 or (select count(*) from private.notification_outbox where plan_id='db000000-0000-4000-8000-000000000001'
   and kind='join_request' and actor_id is null)<>1 then
  raise exception 'The restored fold is not plan 3''s';
 end if;
end $$;
-- Now the open-link rollback, in the documented order (after the push rollback): it goes through, and what it removes
-- is gone.
\ir ../../rollback/20261029120000_open_link_approval.rollback.sql
do $$ begin
 if pg_catalog.to_regclass('private.join_requests') is not null
 or pg_catalog.to_regprocedure('public.request_to_join(text,text,text,text)') is not null
 or pg_catalog.to_regprocedure('public.decide_join_request(uuid,uuid,boolean)') is not null
 or pg_catalog.to_regprocedure('public.my_join_requests()') is not null
 or exists(select 1 from private.notification_outbox where kind in ('join_request','join_approved'))
 or exists(select 1 from private.beta_access where source='approval') then
  raise exception 'The open-link rollback after the push rollback did not go through';
 end if;
end $$;
rollback;
-- 4. Remove the seed and the rehearsal helpers so later tests start clean.
delete from public.plans where id='db000000-0000-4000-8000-000000000001';
delete from auth.users where id in ('da000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000002',
 'da000000-0000-4000-8000-000000000003','da000000-0000-4000-8000-000000000004','da000000-0000-4000-8000-000000000005');
drop table private.push_rehearsal_rows;
drop table private.push_rehearsal_baseline;
drop function private.push_rehearsal_snapshot();
