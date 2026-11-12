-- Rehearsal checks for 20261111140000_chat_core (hosted-baseline mode only).
-- 1. The apply. The backfill gave each series from before the migration one chat row, not a group, with nothing
-- written; the weekly series' second occurrence has no row of its own. The four tables exist with RLS on and no
-- policy, and no role (public included) may select, insert, update or delete on them, nor use the messages' id
-- sequence: the app reads only through functions (K-S5). The indexes are as the plan names them, the two added in
-- review (the announcements' partial one and the outbox's message one) included.
do $$ declare t text; r text; p text; begin
 if (select count(*) from public.chats where series_id in ('c4100000-0000-4000-8000-000000000001','c4100000-0000-4000-8000-000000000002'))<>2
 or exists(select 1 from public.chats where series_id='c4100000-0000-4000-8000-000000000003') then
  raise exception 'The backfill did not give each series exactly one chat row';
 end if;
 if exists(select 1 from public.chats where series_id in ('c4100000-0000-4000-8000-000000000001','c4100000-0000-4000-8000-000000000002')
   and (is_group or last_message_id is not null or last_message_at is not null or pinned_message_id is not null or message_count<>0)) then
  raise exception 'A backfilled chat row is a group, or not empty';
 end if;
 foreach t in array array['public.messages','public.chats','public.chat_reads','public.chat_mutes'] loop
  if pg_catalog.to_regclass(t) is null then raise exception '% does not exist', t; end if;
  if not (select relrowsecurity from pg_catalog.pg_class where oid=t::regclass)
  or exists(select 1 from pg_catalog.pg_policy where polrelid=t::regclass) then
   raise exception '% has no RLS, or a policy', t;
  end if;
  foreach r in array array['public','anon','authenticated','service_role'] loop
   foreach p in array array['select','insert','update','delete'] loop
    if has_table_privilege(r,t,p) then raise exception '% has % on %', r, p, t; end if;
   end loop;
  end loop;
 end loop;
 foreach r in array array['public','anon','authenticated','service_role'] loop
  foreach p in array array['usage','select','update'] loop
   if has_sequence_privilege(r,'public.messages_id_seq',p) then raise exception '% has % on the messages'' id sequence', r, p; end if;
  end loop;
 end loop;
 if (select string_agg(indexname||' '||regexp_replace(indexdef,'^CREATE (UNIQUE )?INDEX \S+ ',''),' | ' order by indexname) from pg_catalog.pg_indexes
   where schemaname='public' and tablename='messages')
  is distinct from 'messages_author_created_idx ON public.messages USING btree (author_id, created_at) | '
   'messages_author_id_client_id_key ON public.messages USING btree (author_id, client_id) | '
   'messages_pkey ON public.messages USING btree (id) | '
   'messages_series_announcements_idx ON public.messages USING btree (series_id, id) WHERE (kind = ''announcement''::text) | '
   'messages_series_idx ON public.messages USING btree (series_id, id) | '
   'messages_series_updated_idx ON public.messages USING btree (series_id, updated_at)' then
  raise exception 'The messages indexes are wrong: %', (select string_agg(indexdef,' | ' order by indexname) from pg_catalog.pg_indexes
   where schemaname='public' and tablename='messages');
 end if;
 if (select indexdef from pg_catalog.pg_indexes where schemaname='private' and indexname='notification_outbox_message_idx')
   is distinct from 'CREATE INDEX notification_outbox_message_idx ON private.notification_outbox USING btree (message_id)'
 or (select indexdef from pg_catalog.pg_indexes where schemaname='private' and indexname='notification_outbox_recipient_kind_idx')
   is distinct from 'CREATE INDEX notification_outbox_recipient_kind_idx ON private.notification_outbox USING btree (recipient_id, kind, created_at)' then
  raise exception 'The outbox''s chat indexes are wrong';
 end if;
end $$;
-- 2. Realtime and the grants (K-S5, K-S6, K-N13, H34). realtime.messages has exactly one policy, chat_members_listen,
-- for reading, to authenticated: a broadcast on the topic being checked, through can_listen, exactly; no policy writes. The ten public calls and their private bodies are for
-- signed-in accounts only (the wrappers are no definers); can_listen too, and nothing else of the migration's is for
-- any role; every private function of it is a definer with an empty search path. The seven triggers are in place. The
-- four redefined functions kept their grants (the worker's, nobody's for the audience, the fold's).
do $$ declare f text; r text; begin
 if (select count(*) from pg_catalog.pg_policies where schemaname='realtime')<>1
 or not exists(select 1 from pg_catalog.pg_policies where schemaname='realtime' and tablename='messages' and policyname='chat_members_listen'
   and cmd='SELECT' and permissive='PERMISSIVE' and roles='{authenticated}'::name[] and with_check is null
   and regexp_replace(qual,'\s+',' ','g')='((extension = ''broadcast''::text) AND (topic = ( SELECT realtime.topic() AS topic)) AND '
    'private.can_listen(( SELECT realtime.topic() AS topic)))') then
  raise exception 'realtime.messages does not have exactly the one policy';
 end if;
 foreach f in array array['chat_summary(uuid)','chat_messages(uuid,bigint,integer)','chat_messages_since(uuid,bigint,timestamptz)',
   'my_chat_overview()','send_message(uuid,text,uuid)','send_announcement(uuid,text,text,uuid)','delete_message(bigint)',
   'remove_message(bigint)','mark_chat_read(uuid,bigint)','set_chat_mute(uuid,boolean)'] loop
  if not has_function_privilege('authenticated','public.'||f,'execute') or not has_function_privilege('authenticated','private.'||f,'execute') then
   raise exception 'authenticated may not call public.% or its body', f;
  end if;
  foreach r in array array['public','anon','service_role'] loop
   if has_function_privilege(r,'public.'||f,'execute') or has_function_privilege(r,'private.'||f,'execute') then
    raise exception '% may call public.% or its body', r, f;
   end if;
  end loop;
  if (select prosecdef from pg_catalog.pg_proc where oid=('public.'||f)::regprocedure) then raise exception 'public.% is a definer', f; end if;
 end loop;
 foreach f in array array['messages_touch()','plans_chat_row()','current_occurrence(uuid)','chat_member(uuid,uuid)','chat_members(uuid)',
   'chat_closes_at(uuid)','chat_open(uuid)','chat_is_group(uuid)','announcement_audience(uuid,text)','chat_first_name(uuid)',
   'chat_row(public.messages,uuid)','chat_names(jsonb)','messages_chat_stats()','chat_body(text)','chat_system_line(uuid,text,jsonb)',
   'chat_lines_off()','attendees_chat_lines()','plans_chat_lines()','plan_admins_chat_lines()','messages_signal()','can_listen(text)'] loop
  foreach r in array array['public','anon','authenticated','service_role'] loop
   if has_function_privilege(r,'private.'||f,'execute') is distinct from (r='authenticated' and f='can_listen(text)') then
    raise exception 'private.% has the wrong grant for %', f, r;
   end if;
  end loop;
 end loop;
 if exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='private'
   and p.proname in ('messages_touch','plans_chat_row','current_occurrence','chat_member','chat_members','chat_closes_at','chat_open',
    'chat_is_group','announcement_audience','chat_first_name','chat_row','chat_names','chat_summary','chat_messages','chat_messages_since',
    'my_chat_overview','messages_chat_stats','chat_body','send_message','send_announcement','delete_message','remove_message','mark_chat_read',
    'set_chat_mute','chat_system_line','chat_lines_off','attendees_chat_lines','plans_chat_lines','plan_admins_chat_lines','messages_signal',
    'can_listen')
   and not (p.prosecdef and p.proconfig=array['search_path=""'])) then
  raise exception 'A private chat function is not a definer with an empty search path';
 end if;
 if (select count(*) from pg_catalog.pg_trigger t where not t.tgisinternal and (t.tgrelid,t.tgname) in (('public.messages'::regclass,'messages_touch'),
   ('public.messages'::regclass,'messages_chat_stats'),('public.messages'::regclass,'messages_signal'),('public.plans'::regclass,'plans_chat_row'),
   ('public.plans'::regclass,'plans_chat_lines'),('public.attendees'::regclass,'attendees_chat_lines'),('public.plan_admins'::regclass,'plan_admins_chat_lines')))<>7 then
  raise exception 'A chat trigger is missing';
 end if;
 if exists(select 1 from private.ch1_rehearsal_functions f
   where (select p.proacl::text from pg_catalog.pg_proc p where p.oid=f.signature::regprocedure) is distinct from f.grants) then
  raise exception 'A redefined function''s grants changed';
 end if;
end $$;

-- 3. The rollback, rehearsed and undone (K-N9, NOTE 4, NOTE 5). Seed what it removes: a guest's joined line (the
-- trigger's), a message and an announcement with their notices (one with a delivery), a read and a mute, beside an
-- ordinary notice. Try its guard: it refuses while chat plan 2 is applied (a private.series_leaves table stands in), and
-- a refusal changes nothing. Then run it: the four functions, with their grants, the outbox's kind check, columns and
-- indexes, and the triggers of plans, attendees and plan_admins are what .before.sql recorded; the Realtime policy, the
-- four tables, the new functions and the chat notices are gone; request_account_deletion still does not exist; the
-- resbites, the guest and the ordinary notice stay.
begin;
insert into auth.users(id,email,email_confirmed_at) values ('c4000000-0000-4000-8000-000000000002','chat-rehearsal-guest@resbite-test.invalid',now());
insert into public.profiles(id,display_name) values ('c4000000-0000-4000-8000-000000000002','Rehearsal guest');
insert into private.beta_access(user_id,source) values ('c4000000-0000-4000-8000-000000000001','maintainer'),('c4000000-0000-4000-8000-000000000002','maintainer');
update auth.users set email='chat-rehearsal-host@resbite-test.invalid', email_confirmed_at=now() where id='c4000000-0000-4000-8000-000000000001';
insert into public.attendees(plan_id,user_id,response) values ('c4100000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000002','accepted');
do $$ begin
 perform set_config('request.jwt.claims','{"sub":"c4000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
 perform public.send_message('c4100000-0000-4000-8000-000000000001','See you there',gen_random_uuid());
 perform set_config('request.jwt.claims','{"sub":"c4000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
 perform public.send_announcement('c4100000-0000-4000-8000-000000000001','Bring a blanket','everyone',gen_random_uuid());
 perform set_config('request.jwt.claims','',true);
end $$;
insert into private.notification_deliveries(outbox_id,token,endpoint_updated_at)
 select o.id,'ExpoPushToken[c4]',now() from private.notification_outbox o where o.plan_id='c4100000-0000-4000-8000-000000000001' and o.kind='chat_message';
insert into public.chat_reads(series_id,user_id,last_read_id)
 select 'c4100000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000002',max(id) from public.messages
 where series_id='c4100000-0000-4000-8000-000000000001';
insert into public.chat_mutes(series_id,user_id) values ('c4100000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000002');
insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key) values
 ('c4100000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000002','plan_changed','ch1-rehearsal:changed');
do $$ begin
 if (select string_agg(kind||':'||coalesce(event,'-'),',' order by id) from public.messages where series_id='c4100000-0000-4000-8000-000000000001')
   is distinct from 'system:joined,message:-,announcement:-'
 or (select string_agg(kind,',' order by kind) from private.notification_outbox where plan_id='c4100000-0000-4000-8000-000000000001')
   is distinct from 'announcement,chat_message,plan_changed'
 or not exists(select 1 from private.notification_deliveries where token='ExpoPushToken[c4]')
 or not exists(select 1 from realtime.messages where topic='chat:c4100000-0000-4000-8000-000000000001') then
  raise exception 'The rehearsal''s chat is not as seeded';
 end if;
end $$;
\set ch1_rehearsal_rollback `cat :'resbite_repo'/supabase/rollback/20261111140000_chat_core.rollback.sql`
create temporary table ch1_rehearsal_scripts on commit drop as select :'ch1_rehearsal_rollback'::text as rollback;
do $$ begin
 if coalesce(length(btrim((select rollback from ch1_rehearsal_scripts))),0)=0 then raise exception 'The rollback text is empty'; end if;
 create table private.series_leaves(id integer);
 begin
  execute (select rollback from ch1_rehearsal_scripts);
  raise exception 'The chat core rollback ran while chat plan 2 is applied';
 exception when raise_exception then
  if sqlerrm is distinct from 'Run the chat groups rollback before the chat core rollback' then raise; end if;
 end;
 drop table private.series_leaves;
 if pg_catalog.to_regclass('public.messages') is null or not exists(select 1 from pg_catalog.pg_policies where schemaname='realtime')
 or pg_catalog.to_regprocedure('private.can_listen(text)') is null
 or not exists(select 1 from private.notification_outbox where kind='chat_message') then
  raise exception 'A refusal changed something';
 end if;
end $$;
\ir ../../rollback/20261111140000_chat_core.rollback.sql
do $$ begin
 if exists(select 1 from private.ch1_rehearsal_functions f
   where pg_catalog.pg_get_functiondef(f.signature::regprocedure) is distinct from f.definition
   or (select p.proacl::text from pg_catalog.pg_proc p where p.oid=f.signature::regprocedure) is distinct from f.grants) then
  raise exception 'Rollback did not restore %', (select string_agg(f.signature,', ') from private.ch1_rehearsal_functions f
   where pg_catalog.pg_get_functiondef(f.signature::regprocedure) is distinct from f.definition
   or (select p.proacl::text from pg_catalog.pg_proc p where p.oid=f.signature::regprocedure) is distinct from f.grants);
 end if;
 if (select pg_catalog.pg_get_constraintdef(c.oid) from pg_catalog.pg_constraint c
   where c.conrelid='private.notification_outbox'::regclass and c.conname='notification_outbox_kind_check') is distinct from (select kind_check from private.ch1_rehearsal_outbox)
 or (select string_agg(a.attname||' '||pg_catalog.format_type(a.atttypid,a.atttypmod),',' order by a.attnum) from pg_catalog.pg_attribute a
   where a.attrelid='private.notification_outbox'::regclass and a.attnum>0 and not a.attisdropped) is distinct from (select columns from private.ch1_rehearsal_outbox)
 or (select string_agg(i.indexdef,' | ' order by i.indexname) from pg_catalog.pg_indexes i
   where i.schemaname='private' and i.tablename='notification_outbox') is distinct from (select indexes from private.ch1_rehearsal_outbox) then
  raise exception 'Rollback did not restore the outbox''s kind check, columns or indexes';
 end if;
 if (select string_agg(x.d,' | ' order by x.d) from (select t.tgrelid::regclass::text||' '||t.tgname||' '||pg_catalog.pg_get_triggerdef(t.oid) as d
   from pg_catalog.pg_trigger t where t.tgrelid in ('public.plans'::regclass,'public.attendees'::regclass,'public.plan_admins'::regclass) and not t.tgisinternal) x)
  is distinct from (select string_agg(x.d,' | ' order by x.d) from (select tbl||' '||tgname||' '||definition as d from private.ch1_rehearsal_triggers) x) then
  raise exception 'Rollback did not leave the triggers as they were';
 end if;
 if exists(select 1 from pg_catalog.pg_policies where schemaname='realtime') then raise exception 'Rollback left the Realtime policy'; end if;
 if exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname in ('messages','chats','chat_reads','chat_mutes','messages_id_seq')) then
  raise exception 'Rollback left a chat table';
 end if;
 if exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')
   and p.proname in ('current_occurrence','chat_member','chat_members','chat_closes_at','chat_open','chat_is_group','announcement_audience',
    'chat_first_name','chat_row','chat_names','messages_touch','plans_chat_row','chat_summary','chat_messages','chat_messages_since',
    'my_chat_overview','messages_chat_stats','chat_body','send_message','send_announcement','delete_message','remove_message','mark_chat_read',
    'set_chat_mute','chat_system_line','chat_lines_off','attendees_chat_lines','plans_chat_lines','plan_admins_chat_lines','messages_signal',
    'can_listen')) then
  raise exception 'Rollback left a chat function';
 end if;
 if exists(select 1 from private.notification_outbox where kind in ('chat_message','announcement'))
 or exists(select 1 from private.notification_deliveries where token='ExpoPushToken[c4]')
 or not exists(select 1 from private.notification_outbox where dedupe_key='ch1-rehearsal:changed') then
  raise exception 'Rollback kept a chat notice, or lost another';
 end if;
 if pg_catalog.to_regprocedure('private.request_account_deletion(uuid,uuid,uuid,text)') is not null then
  raise exception 'Rollback created request_account_deletion';
 end if;
 if (select count(*) from public.plans where id in ('c4100000-0000-4000-8000-000000000001','c4100000-0000-4000-8000-000000000002',
   'c4100000-0000-4000-8000-000000000003'))<>3
 or not exists(select 1 from public.attendees where plan_id='c4100000-0000-4000-8000-000000000001' and user_id='c4000000-0000-4000-8000-000000000002') then
  raise exception 'Rollback lost a resbite or its guest';
 end if;
end $$;
rollback;

-- 4. Remove the rehearsal's rows and records so later tests start clean.
delete from public.chats where series_id in ('c4100000-0000-4000-8000-000000000001','c4100000-0000-4000-8000-000000000002');
delete from public.plans where id in ('c4100000-0000-4000-8000-000000000001','c4100000-0000-4000-8000-000000000002',
 'c4100000-0000-4000-8000-000000000003');
delete from public.profiles where id='c4000000-0000-4000-8000-000000000001';
delete from auth.users where id='c4000000-0000-4000-8000-000000000001';
drop table private.ch1_rehearsal_functions, private.ch1_rehearsal_outbox, private.ch1_rehearsal_triggers;
