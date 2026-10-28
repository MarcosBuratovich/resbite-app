-- Rehearsal checks for 20261031120000_creating_a_resbite (hosted-baseline mode only).
-- 1. The columns, the tables, the functions and the series the migration backfilled for the seeded plan.
do $$ begin
 if (select count(*) from information_schema.columns where table_schema='public' and table_name='plans'
   and column_name in ('place_tbd','repeat_weeks','series_id','repeats_from'))<>4 then
  raise exception 'The plans columns are missing';
 end if;
 if (select series_id from public.plans where id='df000000-0000-4000-8000-000000000001')<>'df000000-0000-4000-8000-000000000001'
 or (select place_tbd from public.plans where id='df000000-0000-4000-8000-000000000001')
 or (select repeat_weeks from public.plans where id='df000000-0000-4000-8000-000000000001') is not null
 or (select repeats_from from public.plans where id='df000000-0000-4000-8000-000000000001') is not null then
  raise exception 'The seeded plan was not backfilled into its own series';
 end if;
 if pg_catalog.to_regclass('public.plan_admins') is null or pg_catalog.to_regclass('public.plan_mutes') is null
 or not (select relrowsecurity from pg_catalog.pg_class where oid='public.plan_admins'::regclass)
 or not (select relrowsecurity from pg_catalog.pg_class where oid='public.plan_mutes'::regclass) then
  raise exception 'Admins or mutes are missing, or have no row security';
 end if;
 if exists(select 1 from public.plan_admins) or exists(select 1 from public.plan_mutes) then
  raise exception 'The migration wrote admins or mutes';
 end if;
 if exists(select 1 from pg_catalog.pg_proc where oid in (
   'private.plan_end(timestamptz,timestamptz)'::regprocedure,'private.is_host(uuid,uuid)'::regprocedure,
   'private.host_ids(uuid)'::regprocedure,'private.next_occurrence(timestamptz,text,integer)'::regprocedure,
   'private.create_plan_v4(uuid,text,text,text[],text,timestamptz,timestamptz,text,text,boolean,smallint,text,double precision,double precision,text)'::regprocedure,
   'public.change_plan_v4(uuid,integer,text,text,text[],timestamptz,timestamptz,text,text,boolean,smallint,text,text,boolean,boolean)'::regprocedure)
   and not prosecdef and proname in ('is_host','host_ids','next_occurrence','create_plan_v4')) then
  raise exception 'A private body is not a definer';
 end if;
end $$;
-- 2. Grants: the roll for nobody (the cron job runs it as postgres); the admin, mute and v4 functions for signed-in
-- accounts only, never anon.
do $$ declare r text; f text; begin
 foreach r in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(r,'private.roll_repeating_plans()','execute') then raise exception '% may run the roll', r; end if;
  if has_function_privilege(r,'private.next_occurrence(timestamptz,text,integer)','execute') then raise exception '% may call next_occurrence', r; end if;
  if has_function_privilege(r,'private.is_host(uuid,uuid)','execute') or has_function_privilege(r,'private.host_ids(uuid)','execute') then
   raise exception '% may call the host helpers', r;
  end if;
 end loop;
 foreach f in array array['public.appoint_admin(uuid,uuid)','public.remove_admin(uuid,uuid)','public.set_plan_mute(uuid,boolean)',
  'public.create_plan_v4(uuid,text,text,text[],text,timestamptz,timestamptz,text,text,boolean,smallint,text,double precision,double precision,text)',
  'public.change_plan_v4(uuid,integer,text,text,text[],timestamptz,timestamptz,text,text,boolean,smallint,text,text,boolean,boolean)']
 loop
  if not has_function_privilege('authenticated',f,'execute') or has_function_privilege('anon',f,'execute') then
   raise exception '% grants wrong', f;
  end if;
 end loop;
 if not has_function_privilege('authenticated','private.plan_end(timestamptz,timestamptz)','execute')
 or has_function_privilege('anon','private.plan_end(timestamptz,timestamptz)','execute') then
  raise exception 'plan_end grants wrong';
 end if;
end $$;
-- 3. The outbox accepts the new values and still refuses others; the cover policies are in place.
do $$ begin
 if (select pg_catalog.pg_get_constraintdef(oid) from pg_catalog.pg_constraint where conname='notification_outbox_kind_check') not like '%admin_added%'
 or (select pg_catalog.pg_get_constraintdef(oid) from pg_catalog.pg_constraint where conname='notification_outbox_detail_check') not like '%again%' then
  raise exception 'The outbox checks do not allow the new values';
 end if;
 begin
  insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,detail)
   values('df000000-0000-4000-8000-000000000001','de000000-0000-4000-8000-000000000001','invited','creating-rehearsal:bad','sideways');
  raise exception 'The detail check accepted a stray value';
 exception when check_violation then null; end;
 if (select count(*) from pg_catalog.pg_policies where schemaname='storage' and tablename='objects'
   and policyname in ('resbite_cover_insert','resbite_cover_update','resbite_cover_read'))<>3
 or not exists(select 1 from pg_catalog.pg_policies where schemaname='storage' and policyname='resbite_cover_read' and qual like '%cover_path%') then
  raise exception 'The cover policies are missing';
 end if;
end $$;
-- 4. The running event is open now: the public page counts from the end.
do $$ begin
 if public.invitation_page(repeat('C',22))->>'state' is distinct from 'open' then
  raise exception 'The public page does not say open while the event runs: %', public.invitation_page(repeat('C',22));
 end if;
 if not (public.invitation_page(repeat('C',22)) ? 'place_tbd') or not (public.invitation_page(repeat('C',22)) ? 'repeat_weeks') then
  raise exception 'The open page does not carry place_tbd and repeat_weeks';
 end if;
end $$;
-- 5. Remove the seed so later tests start clean.
delete from public.plans where id='df000000-0000-4000-8000-000000000001';
delete from auth.users where id='de000000-0000-4000-8000-000000000001';
