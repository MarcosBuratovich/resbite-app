-- Rehearsal checks for 20261111160000_chat_safety (hosted-baseline mode only), after .before.sql recorded what the
-- migration replaces.
-- 1. The five tables (K-S5): private.blocks, reports, moderators, chat_rules_acceptances and blocked_terms each have RLS
-- on, no policy and no privilege for any role, and the reports' id sequence none either. The migration seeds nothing:
-- the five are empty here, blocked_terms and moderators included.
do $$ declare t text; r text; p text; begin
 foreach t in array array['private.blocks','private.reports','private.moderators','private.chat_rules_acceptances','private.blocked_terms'] loop
  if pg_catalog.to_regclass(t) is null
  or not (select relrowsecurity from pg_catalog.pg_class where oid=t::regclass)
  or exists(select 1 from pg_catalog.pg_policy where polrelid=t::regclass) then
   raise exception '% is missing, has no RLS, or has a policy', t;
  end if;
  foreach r in array array['public','anon','authenticated','service_role'] loop
   foreach p in array array['select','insert','update','delete','truncate','references','trigger'] loop
    if has_table_privilege(r,t,p) then raise exception '% has % on %', r, p, t; end if;
   end loop;
  end loop;
 end loop;
 foreach r in array array['public','anon','authenticated','service_role'] loop
  if has_sequence_privilege(r,'private.reports_id_seq','usage') or has_sequence_privilege(r,'private.reports_id_seq','select') then
   raise exception '% may use private.reports_id_seq', r;
  end if;
 end loop;
 if exists(select 1 from private.blocks) or exists(select 1 from private.reports) or exists(select 1 from private.moderators)
 or exists(select 1 from private.chat_rules_acceptances) or exists(select 1 from private.blocked_terms) then
  raise exception 'The migration seeded a chat safety table';
 end if;
end $$;

-- 2. The functions (K-S5). block_user, my_blocks, report_message, report_user and accept_chat_rules, both schemas, only
-- authenticated may call; invited_by, inviter_of, chat_rules_version and report_keep_days no API role may. Each private
-- one is a security definer with an empty search path, and each public one an invoker. The worker's claim, redefined,
-- is still for service_role only. The thirteen bodies redefined here (the deletion request is local-only) keep their
-- grants and no longer read as before.
do $$ declare r text; f text; begin
 foreach f in array array['private.block_user(uuid,boolean)','public.block_user(uuid,boolean)','private.my_blocks()','public.my_blocks()',
   'private.report_message(bigint,text,text)','public.report_message(bigint,text,text)','private.report_user(uuid,uuid,text,text)',
   'public.report_user(uuid,uuid,text,text)','private.accept_chat_rules()','public.accept_chat_rules()'] loop
  if pg_catalog.to_regprocedure(f) is null then raise exception '% is missing', f; end if;
  foreach r in array array['public','anon','service_role'] loop
   if has_function_privilege(r,f,'execute') then raise exception '% may execute %', r, f; end if;
  end loop;
  if not has_function_privilege('authenticated',f,'execute') then raise exception 'authenticated may not execute %', f; end if;
 end loop;
 foreach f in array array['private.invited_by(uuid,uuid)','private.inviter_of(uuid)','private.chat_rules_version()','private.report_keep_days()'] loop
  if pg_catalog.to_regprocedure(f) is null then raise exception '% is missing', f; end if;
  foreach r in array array['public','anon','authenticated','service_role'] loop
   if has_function_privilege(r,f,'execute') then raise exception '% may execute %', r, f; end if;
  end loop;
 end loop;
 foreach f in array array['private.block_user(uuid,boolean)','private.my_blocks()','private.invited_by(uuid,uuid)','private.inviter_of(uuid)',
   'private.report_message(bigint,text,text)','private.report_user(uuid,uuid,text,text)','private.accept_chat_rules()',
   'private.chat_rules_version()','private.report_keep_days()'] loop
  if not (select p.prosecdef and p.proconfig=array['search_path=""'] from pg_catalog.pg_proc p where p.oid=f::regprocedure) then
   raise exception '% is not a security definer with an empty search path', f;
  end if;
 end loop;
 foreach f in array array['public.block_user(uuid,boolean)','public.my_blocks()','public.report_message(bigint,text,text)',
   'public.report_user(uuid,uuid,text,text)','public.accept_chat_rules()'] loop
  if (select p.prosecdef from pg_catalog.pg_proc p where p.oid=f::regprocedure) then raise exception '% is a security definer', f; end if;
 end loop;
 foreach r in array array['public','anon','authenticated'] loop
  if has_function_privilege(r,'public.claim_notification_deliveries(integer)','execute') then
   raise exception '% may execute public.claim_notification_deliveries(integer)', r;
  end if;
 end loop;
 if not has_function_privilege('service_role','public.claim_notification_deliveries(integer)','execute') then
  raise exception 'service_role may not execute public.claim_notification_deliveries(integer)';
 end if;
 if private.chat_rules_version() is distinct from '2026-11' or private.report_keep_days() is distinct from 180 then
  raise exception 'The rules version or the keeping period is not the plan''s';
 end if;
 if exists(select 1 from private.ch3_rehearsal_functions x join pg_catalog.pg_proc p on p.oid=x.signature::regprocedure
   where p.proacl::text is distinct from x.grants or pg_catalog.pg_get_functiondef(p.oid)=x.definition) then
  raise exception 'A redefined function changed its grants, or kept its earlier body: %', (select string_agg(x.signature,', ')
   from private.ch3_rehearsal_functions x join pg_catalog.pg_proc p on p.oid=x.signature::regprocedure
   where p.proacl::text is distinct from x.grants or pg_catalog.pg_get_functiondef(p.oid)=x.definition);
 end if;
end $$;

-- 3. The outbox's kind check is chat core's thirteen kinds and report_filed, in that order.
do $$ begin
 if (select pg_catalog.pg_get_constraintdef(c.oid) from pg_catalog.pg_constraint c
   where c.conrelid='private.notification_outbox'::regclass and c.conname='notification_outbox_kind_check')
  is distinct from replace((select kind_check from private.ch3_rehearsal_outbox),'''announcement''::text]',
   '''announcement''::text, ''report_filed''::text]') then
  raise exception 'The kind check is not chat core''s thirteen kinds and report_filed';
 end if;
end $$;

-- 4. The rollback, rehearsed and undone (G-N11; the plan's Task 2, Step 4), in a transaction that ends in rollback, as
-- 20261110120000_connections.after.sql does. Seeded first: a block, a report, a moderator, an acceptance, a blocked term
-- and a report_filed notice with a delivery. Each body it restores is what .before.sql recorded (pg_get_functiondef,
-- with the same grants), and running that body's statement from its source migration again, as create or replace (chat
-- core and the connections made some with create function), changes nothing: chat core's for its seven (cut from its
-- file as chat.sql's ch_source does), plan 2's for chat_summary, request_connection, notification_recipient_eligible
-- and my_chat_overview (its own statement, never chat core's), the connections', the circles' and the phone_key's for
-- one each. The five tables, the functions this file made and every report_filed notice are gone, and the kind check is
-- what .before.sql recorded. Then plan 2's rollback, which refuses while private.blocks exists, runs.
begin;
create function pg_temp.ch3_source(p_text text, p_from text, p_to text) returns text language plpgsql immutable as $fn$
declare v_start integer := position(p_from in p_text); v_len integer;
begin
 if v_start=0 then raise exception 'Not in the source: %', p_from; end if;
 v_len := position(p_to in substring(p_text from v_start));
 if v_len=0 then raise exception 'No % after %', p_to, p_from; end if;
 return regexp_replace(substring(p_text from v_start for v_len+length(p_to)-1),'^create function ','create or replace function ');
end $fn$;
\set ch3_core `cat :'resbite_repo'/supabase/migrations/20261111140000_chat_core.sql`
\set ch3_groups `cat :'resbite_repo'/supabase/migrations/20261111150000_chat_groups.sql`
\set ch3_connections `cat :'resbite_repo'/supabase/migrations/20261110120000_connections.sql`
\set ch3_circles `cat :'resbite_repo'/supabase/migrations/20261111130000_circles_of_trust.sql`
\set ch3_phone_key `cat :'resbite_repo'/supabase/migrations/20261030130000_phone_key.sql`
create temporary table ch3_sources on commit drop as select x.signature, x.source from (values
 ('private.chat_messages(uuid,bigint,integer)',pg_temp.ch3_source(:'ch3_core','create function private.chat_messages(','$$;')),
 ('private.chat_messages_since(uuid,bigint,timestamp with time zone)',pg_temp.ch3_source(:'ch3_core','create function private.chat_messages_since(','$$;')),
 ('private.send_message(uuid,text,uuid)',pg_temp.ch3_source(:'ch3_core','create function private.send_message(','$$;')),
 ('private.send_announcement(uuid,text,text,uuid)',pg_temp.ch3_source(:'ch3_core','create function private.send_announcement(','$$;')),
 ('public.claim_notification_deliveries(integer)',pg_temp.ch3_source(:'ch3_core','create or replace function public.claim_notification_deliveries(','$$;')),
 ('private.request_account_deletion(uuid,uuid,uuid,text)',pg_temp.ch3_source(:'ch3_core','create or replace function private.request_account_deletion(','$$;')),
 ('private.fold_web_account(uuid,uuid)',pg_temp.ch3_source(:'ch3_core','create or replace function private.fold_web_account(','$$;')),
 ('private.chat_summary(uuid)',pg_temp.ch3_source(:'ch3_groups','create or replace function private.chat_summary(','$$;')),
 ('private.request_connection(uuid,uuid)',pg_temp.ch3_source(:'ch3_groups','create or replace function private.request_connection(','$$;')),
 ('private.notification_recipient_eligible(bigint)',pg_temp.ch3_source(:'ch3_groups','create or replace function private.notification_recipient_eligible(','$$;')),
 ('private.my_chat_overview()',pg_temp.ch3_source(:'ch3_groups','create or replace function private.my_chat_overview(','$$;')),
 ('private.plan_connection_states(uuid)',pg_temp.ch3_source(:'ch3_connections','create function private.plan_connection_states(','$$;')),
 ('private.invite_contacts(uuid,jsonb)',pg_temp.ch3_source(:'ch3_circles','create or replace function private.invite_contacts(','$$;')),
 ('private.contacts_on_resbite(text[])',pg_temp.ch3_source(:'ch3_phone_key','create or replace function private.contacts_on_resbite(','$$;'))) x(signature,source);
insert into private.blocks(blocker_id,blocked_id) values ('e7800000-0000-4000-8000-000000000002','e7800000-0000-4000-8000-000000000001');
insert into private.reports(reporter_id,target_user_id,series_id,plan_id,about,reason) values ('e7800000-0000-4000-8000-000000000002',
 'e7800000-0000-4000-8000-000000000001','e7810000-0000-4000-8000-000000000001','e7810000-0000-4000-8000-000000000001','user','spam');
insert into private.moderators(user_id) values ('e7800000-0000-4000-8000-000000000001');
insert into private.chat_rules_acceptances(user_id,version) values ('e7800000-0000-4000-8000-000000000002',private.chat_rules_version());
insert into private.blocked_terms(term) values ('zzbadword');
insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key) values
 ('e7810000-0000-4000-8000-000000000001','e7800000-0000-4000-8000-000000000001','report_filed','s3:rehearsal');
insert into private.notification_deliveries(outbox_id,token,endpoint_updated_at)
 select id,'ExpoPushToken[s3rehearsal]',now() from private.notification_outbox where dedupe_key='s3:rehearsal';
\set ch3_groups_rollback `cat :'resbite_repo'/supabase/rollback/20261111150000_chat_groups.rollback.sql`
create temporary table ch3_texts on commit drop as select :'ch3_groups_rollback'::text as groups_rollback;
do $$ begin
 if (select count(*) from ch3_sources s join private.ch3_rehearsal_functions f using (signature) where s.source like 'create or replace function %')
  <>(select count(*) from private.ch3_rehearsal_functions) then
  raise exception 'A body to restore has no source';
 end if;
 -- Plan 2's rollback refuses while this plan is applied, and its refusal changes nothing.
 if coalesce(length(btrim((select groups_rollback from ch3_texts))),0)=0 then raise exception 'The chat groups rollback text is empty'; end if;
 begin
  execute (select groups_rollback from ch3_texts);
  raise exception 'The chat groups rollback ran while chat plan 3 is applied';
 exception when raise_exception then
  if sqlerrm is distinct from 'Run the chat safety rollback before the chat groups rollback' then raise; end if;
 end;
 if pg_catalog.to_regclass('private.series_leaves') is null or pg_catalog.to_regclass('private.blocks') is null then
  raise exception 'The refused chat groups rollback changed something';
 end if;
end $$;
\ir ../../rollback/20261111160000_chat_safety.rollback.sql
do $$ declare f record; v_def text; begin
 for f in select x.signature, x.definition, x.grants, s.source from private.ch3_rehearsal_functions x join ch3_sources s using (signature) loop
  v_def := pg_catalog.pg_get_functiondef(f.signature::regprocedure);
  if v_def is distinct from f.definition then raise exception 'The rollback did not restore % as it was before the migration', f.signature; end if;
  if (select p.proacl::text from pg_catalog.pg_proc p where p.oid=f.signature::regprocedure) is distinct from f.grants then
   raise exception 'The rollback changed the grants of %', f.signature;
  end if;
  if pg_catalog.md5(v_def) is distinct from pg_catalog.md5(f.definition) then raise exception 'md5 of % differs', f.signature; end if;
  execute f.source;
  if pg_catalog.pg_get_functiondef(f.signature::regprocedure) is distinct from v_def then
   raise exception 'The rollback did not restore % as its source migration has it', f.signature;
  end if;
 end loop;
 if pg_catalog.to_regclass('private.blocks') is not null or pg_catalog.to_regclass('private.reports') is not null
 or pg_catalog.to_regclass('private.moderators') is not null or pg_catalog.to_regclass('private.chat_rules_acceptances') is not null
 or pg_catalog.to_regclass('private.blocked_terms') is not null then
  raise exception 'The rollback left a chat safety table';
 end if;
 if exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')
   and p.proname in ('block_user','my_blocks','report_message','report_user','accept_chat_rules','chat_rules_version','report_keep_days',
    'invited_by','inviter_of')) then
  raise exception 'The rollback left a chat safety function';
 end if;
 if exists(select 1 from private.notification_outbox where kind='report_filed')
 or exists(select 1 from private.notification_deliveries where token='ExpoPushToken[s3rehearsal]') then
  raise exception 'The rollback left a report_filed notice or its delivery';
 end if;
 if (select pg_catalog.pg_get_constraintdef(c.oid) from pg_catalog.pg_constraint c
   where c.conrelid='private.notification_outbox'::regclass and c.conname='notification_outbox_kind_check')
  is distinct from (select kind_check from private.ch3_rehearsal_outbox) then
  raise exception 'The rollback did not restore chat core''s kind check';
 end if;
end $$;
-- The chain runs on (G-N11): plan 2's rollback passes its guard now that private.blocks is gone.
\ir ../../rollback/20261111150000_chat_groups.rollback.sql
do $$ begin
 if pg_catalog.to_regclass('private.series_leaves') is not null then raise exception 'The chat groups rollback did not run after this one'; end if;
end $$;
rollback;

-- 5. Remove the rehearsal's rows and records so later tests start clean: the chats row by series (chats has no key to
-- plans), the plan (its guest row, chat lines and notices with it), the two accounts (their grants with them) and the
-- records.
delete from public.chats where series_id='e7810000-0000-4000-8000-000000000001';
delete from public.plans where id='e7810000-0000-4000-8000-000000000001';
delete from private.beta_access where user_id in ('e7800000-0000-4000-8000-000000000001','e7800000-0000-4000-8000-000000000002');
delete from public.profiles where id in ('e7800000-0000-4000-8000-000000000001','e7800000-0000-4000-8000-000000000002');
delete from auth.users where id in ('e7800000-0000-4000-8000-000000000001','e7800000-0000-4000-8000-000000000002');
drop table private.ch3_rehearsal_functions;
drop table private.ch3_rehearsal_outbox;
