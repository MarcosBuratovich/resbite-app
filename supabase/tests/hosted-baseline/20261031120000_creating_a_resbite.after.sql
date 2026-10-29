-- Rehearsal checks for 20261031120000_creating_a_resbite (hosted-baseline mode only).
-- 1. Against the fingerprint .before.sql took: the migration removed nothing, redefined exactly the 27 functions it
-- says and the two outbox checks, and added only the admins, the mutes, the plans columns, the repeat objects and the
-- functions it names (changed nothing else, every grant and the private schema's included).
do $$ declare v_added text[]; v_removed text[]; v_changed text[]; v_expected text[];
begin
 v_expected := array['constraint private.notification_outbox notification_outbox_detail_check',
  'constraint private.notification_outbox notification_outbox_kind_check']
  || array(select 'definition private.'||f from unnest(array['answer_phone_invitation(text,text,text,text)',
   'can_read_meeting_details(uuid)','can_see_guests(uuid)','change_join_answer(uuid,text)',
   'change_plan_v3(uuid,integer,text,text,text[],timestamp with time zone,timestamp with time zone,text,text,text,boolean,boolean,text)',
   'check_invited_number(text,text)','claim_invite(text)','claim_plan_link(text)','create_invite(uuid,uuid,text,text)',
   'invitation_page(text)','invite_contacts(uuid,jsonb)','join_by_link(text,text,text)','my_join_requests()','notification_recipient_eligible(bigint)',
   'personal_invitation_page(text)','plan_join_requests(uuid)','plan_phone_invitations(uuid)','remove_guest(uuid,uuid)',
   'request_join(uuid,private.plan_links,public.plans,text)','request_to_join(text,text,text,text)','require_link_owner(uuid)',
   'respond(uuid,text,integer)','revoke_invite(uuid)','revoke_phone_invitation(uuid,text)','set_guest_note(uuid,text)','set_plan_cover_description(uuid,text,bigint)',
   'set_plan_cover_if_current(uuid,text,text,bigint)']) f);
 select coalesce(array_agg(n.name order by n.name),'{}') into v_added from private.cr_rehearsal_snapshot() n
  where not exists(select 1 from private.cr_rehearsal_baseline b where b.name=n.name);
 select coalesce(array_agg(b.name order by b.name),'{}') into v_removed from private.cr_rehearsal_baseline b
  where not exists(select 1 from private.cr_rehearsal_snapshot() n where n.name=b.name);
 select coalesce(array_agg(b.name order by b.name),'{}') into v_changed from private.cr_rehearsal_baseline b
  join private.cr_rehearsal_snapshot() n on n.name=b.name where b.definition is distinct from n.definition;
 if v_removed<>'{}' then raise exception 'The apply removed %', v_removed; end if;
 if v_changed is distinct from array(select e from unnest(v_expected) e order by e) then
  raise exception 'The apply changed % (expected %)', v_changed, v_expected;
 end if;
 -- Everything added belongs to the admins, the mutes, the four plans columns, the repeat objects or the new functions
 -- (each with its grants).
 select coalesce(array_agg(a order by a),'{}') into v_added from unnest(v_added) a
  where a !~ '^(column|constraint|index|relation|policy|trigger) (public\.)?(plan_admins|plan_mutes)'
   and a !~ '^column public\.plans\.(place_tbd|repeat_weeks|series_id|repeats_from)$'
   and a !~ '^constraint public\.plans plans_(place_tbd_valid|repeats_from_fkey|repeat_weeks_check)$'
   and a !~ '^(index|relation) public\.plans_(repeats_from_key|series_idx)$'
   and a !~ '^trigger public\.plans plans_default_series$'
   and a !~ '^(definition|grants) (private|public)\.(appoint_admin|remove_admin|set_plan_mute|plan_people_counts|create_plan_v4|change_plan_v4|plan_end|is_host|host_ids|next_occurrence|roll_repeating_plans|plans_default_series)\(';
 if v_added<>'{}' then raise exception 'The apply added unexpected objects: %', v_added; end if;
 -- The storage policies: the three cover ones changed, no other.
 if (select array_agg(p.policyname::text order by p.policyname::text) from (
   (select policyname, cmd, roles::text, qual, with_check from pg_catalog.pg_policies where schemaname='storage' and tablename='objects'
    except select policyname, cmd, roles, qual, with_check from private.cr_rehearsal_policies)
   union all
   (select policyname, cmd, roles, qual, with_check from private.cr_rehearsal_policies
    except select policyname, cmd, roles::text, qual, with_check from pg_catalog.pg_policies where schemaname='storage' and tablename='objects')) p)
  is distinct from array['resbite_cover_insert','resbite_cover_insert','resbite_cover_read','resbite_cover_read','resbite_cover_update','resbite_cover_update'] then
  raise exception 'The apply changed storage policies other than the three cover ones';
 end if;
end $$;
-- 2. The columns, the tables, the functions and the series the migration backfilled for the seeded plan.
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
   'private.plan_people_counts(uuid)'::regprocedure,
   'private.create_plan_v4(uuid,text,text,text[],text,timestamptz,timestamptz,text,text,boolean,smallint,text,double precision,double precision,text)'::regprocedure,
   'public.change_plan_v4(uuid,integer,text,text,text[],timestamptz,timestamptz,text,text,boolean,smallint,text,text,boolean,boolean)'::regprocedure)
   and not prosecdef and proname in ('is_host','host_ids','next_occurrence','create_plan_v4','plan_people_counts')) then
  raise exception 'A private body is not a definer';
 end if;
end $$;
-- 3. Grants: the roll for nobody (the cron job runs it as postgres); the admin, mute, people-count and v4 functions for
-- signed-in accounts only, never anon.
do $$ declare r text; f text; begin
 foreach r in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(r,'private.roll_repeating_plans()','execute') then raise exception '% may run the roll', r; end if;
  if has_function_privilege(r,'private.next_occurrence(timestamptz,text,integer)','execute') then raise exception '% may call next_occurrence', r; end if;
  if has_function_privilege(r,'private.is_host(uuid,uuid)','execute') or has_function_privilege(r,'private.host_ids(uuid)','execute') then
   raise exception '% may call the host helpers', r;
  end if;
 end loop;
 foreach f in array array['public.appoint_admin(uuid,uuid)','public.remove_admin(uuid,uuid)','public.set_plan_mute(uuid,boolean)',
  'public.plan_people_counts(uuid)','private.plan_people_counts(uuid)',
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
-- 4. The outbox accepts the new values and still refuses others; the cover policies are in place.
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
-- 5. The running event is open now: the public page counts from the end, and says happened once the end has passed.
do $$ begin
 if public.invitation_page(repeat('C',22))->>'state' is distinct from 'open' then
  raise exception 'The public page does not say open while the event runs: %', public.invitation_page(repeat('C',22));
 end if;
 if not (public.invitation_page(repeat('C',22)) ? 'place_tbd') or not (public.invitation_page(repeat('C',22)) ? 'repeat_weeks') then
  raise exception 'The open page does not carry place_tbd and repeat_weeks';
 end if;
 update public.plans set starts_at=now()-interval '3 hours',ends_at=now()-interval '1 hour' where id='df000000-0000-4000-8000-000000000001';
 if public.invitation_page(repeat('C',22))->>'state' is distinct from 'happened' then
  raise exception 'The public page does not say happened once the end has passed: %', public.invitation_page(repeat('C',22));
 end if;
 update public.plans set starts_at=now()-interval '1 hour',ends_at=now()+interval '1 hour' where id='df000000-0000-4000-8000-000000000001';
end $$;
-- 6. The rollback, rehearsed and undone. Seed what it deletes (an admin appointed, a mute, the two outbox rows it clears,
-- a repeat rule), try the guards (it refuses after the phone-key, push or open-link rollback has run, and the phone-key and
-- push rollbacks refuse while this migration is in place), then run it: every fingerprint entry and every cover policy is
-- back, the seeded plan stays, and what the migration added is gone.
begin;
insert into auth.users(id,email,email_confirmed_at) values ('de000000-0000-4000-8000-000000000002','creating-rehearsal-guest@resbite-test.invalid',now());
insert into public.profiles(id,display_name) values ('de000000-0000-4000-8000-000000000002','Rehearsal guest');
insert into public.attendees(plan_id,user_id,response) values ('df000000-0000-4000-8000-000000000001','de000000-0000-4000-8000-000000000002','accepted');
insert into public.plan_admins(plan_id,user_id,appointed_by) values ('df000000-0000-4000-8000-000000000001','de000000-0000-4000-8000-000000000002','de000000-0000-4000-8000-000000000001');
insert into public.plan_mutes(series_id,user_id) values ('df000000-0000-4000-8000-000000000001','de000000-0000-4000-8000-000000000002');
update public.plans set repeat_weeks=1 where id='df000000-0000-4000-8000-000000000001';
insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id) values
 ('df000000-0000-4000-8000-000000000001','de000000-0000-4000-8000-000000000002','admin_added','creating-rehearsal:admin','de000000-0000-4000-8000-000000000001');
insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id,detail) values
 ('df000000-0000-4000-8000-000000000001','de000000-0000-4000-8000-000000000002','invited','creating-rehearsal:again','de000000-0000-4000-8000-000000000001','again');
\set cr_rehearsal_rollback `cat :'resbite_repo'/supabase/rollback/20261031120000_creating_a_resbite.rollback.sql`
\set cr_rehearsal_push `cat :'resbite_repo'/supabase/rollback/20261030120000_push_delivery.rollback.sql`
\set cr_rehearsal_pk `cat :'resbite_repo'/supabase/rollback/20261030130000_phone_key.rollback.sql`
create temporary table cr_rehearsal_scripts on commit drop as select :'cr_rehearsal_rollback'::text as rollback, :'cr_rehearsal_push'::text as push, :'cr_rehearsal_pk'::text as pk;
do $$ begin
 if coalesce(length(btrim((select rollback from cr_rehearsal_scripts))),0)=0 or coalesce(length(btrim((select push from cr_rehearsal_scripts))),0)=0
  or coalesce(length(btrim((select pk from cr_rehearsal_scripts))),0)=0 then
  raise exception 'A rollback text is empty';
 end if;
 -- The push rollback refuses while this migration is in place.
 begin
  execute (select push from cr_rehearsal_scripts);
  raise exception 'The push rollback ran while the creating-a-resbite objects exist';
 exception when raise_exception then
  if sqlerrm is distinct from 'Run the creating-a-resbite rollback (20261031120000) first' then raise; end if;
 end;
 -- The phone-key rollback refuses while this migration is in place.
 begin
  execute (select pk from cr_rehearsal_scripts);
  raise exception 'The phone-key rollback ran while the creating-a-resbite objects exist';
 exception when raise_exception then
  if sqlerrm is distinct from 'Run the creating-a-resbite rollback (20261031120000) first' then raise; end if;
 end;
 -- This rollback refuses once the phone-key rollback (its phone_key() stands in, renamed), the push rollback or the
 -- open-link rollback (their tables stand in, renamed) has run.
 alter function private.phone_key(text) rename to cr_rehearsal_phone_key;
 begin
  execute (select rollback from cr_rehearsal_scripts);
  raise exception 'The creating-a-resbite rollback ran after the phone-key rollback';
 exception when raise_exception then
  if sqlerrm is distinct from 'Run the creating-a-resbite rollback before the phone-key rollback' then raise; end if;
 end;
 alter function private.cr_rehearsal_phone_key(text) rename to phone_key;
 alter table private.notification_deliveries rename to cr_rehearsal_deliveries;
 begin
  execute (select rollback from cr_rehearsal_scripts);
  raise exception 'The creating-a-resbite rollback ran after the push rollback';
 exception when raise_exception then
  if sqlerrm is distinct from 'Run the creating-a-resbite rollback before the push delivery rollback' then raise; end if;
 end;
 alter table private.cr_rehearsal_deliveries rename to notification_deliveries;
 alter table private.join_requests rename to cr_rehearsal_requests;
 begin
  execute (select rollback from cr_rehearsal_scripts);
  raise exception 'The creating-a-resbite rollback ran after the open-link rollback';
 exception when raise_exception then
  if sqlerrm is distinct from 'Run the creating-a-resbite rollback before the open-link approval rollback' then raise; end if;
 end;
 alter table private.cr_rehearsal_requests rename to join_requests;
 -- The refusals changed nothing.
 if not exists(select 1 from public.plan_admins) or not exists(select 1 from private.notification_outbox where kind='admin_added') then
  raise exception 'A refused rollback changed something';
 end if;
end $$;
\ir ../../rollback/20261031120000_creating_a_resbite.rollback.sql
do $$ declare item record; begin
 for item in
  select coalesce(b.name,n.name) as name, b.definition as before, n.definition as after
  from private.cr_rehearsal_baseline b full join private.cr_rehearsal_snapshot() n on n.name=b.name
 loop
  if item.before is distinct from item.after then raise exception 'Rollback did not restore %', item.name; end if;
 end loop;
 if exists((select policyname, cmd, roles::text, qual, with_check from pg_catalog.pg_policies where schemaname='storage' and tablename='objects'
    except select policyname, cmd, roles, qual, with_check from private.cr_rehearsal_policies)
  union all (select policyname, cmd, roles, qual, with_check from private.cr_rehearsal_policies
    except select policyname, cmd, roles::text, qual, with_check from pg_catalog.pg_policies where schemaname='storage' and tablename='objects')) then
  raise exception 'Rollback did not restore the storage policies';
 end if;
 if exists(select 1 from private.notification_outbox where kind='admin_added' or detail='again') then
  raise exception 'Rollback left the outbox rows the earlier checks refuse';
 end if;
 if not exists(select 1 from public.plans where id='df000000-0000-4000-8000-000000000001')
 or not exists(select 1 from public.attendees where plan_id='df000000-0000-4000-8000-000000000001' and user_id='de000000-0000-4000-8000-000000000002') then
  raise exception 'Rollback lost the plan or its guest';
 end if;
end $$;
rollback;
-- 7. Remove the seed and the rehearsal helpers so later tests start clean.
delete from public.plans where id='df000000-0000-4000-8000-000000000001';
delete from auth.users where id in ('de000000-0000-4000-8000-000000000001','de000000-0000-4000-8000-000000000002');
drop table private.cr_rehearsal_policies;
drop table private.cr_rehearsal_baseline;
drop function private.cr_rehearsal_snapshot();
