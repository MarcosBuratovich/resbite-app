-- Rollback for 20261117121000_safety_extension.sql: drops the three blocked-words triggers (on public.plans,
-- public.plan_meeting_details and public.profiles), their three functions and private.holds_blocked_term, puts back the
-- two hosted bodies it replaced (report_message and report_user, from 20261111160000_chat_safety.sql) and the
-- four-reason check on private.reports. Grants on the two are unchanged throughout (create or replace keeps them).
-- What people notice:
--   - the blocked-terms filter falls back to chat only (messages and announcements): a title, description, note to
--     guests, meeting details or name holding a listed term saves again;
--   - a new report can give only harassment, spam, inappropriate or other: a build that offers the three new reasons
--     has them refused with 23514 'Invalid report' (roll the app back first, or with this file);
--   - reports already stored with a new reason are kept and readable: open-reports.sql still lists them (any reason
--     sorts). While any exists, the four-reason check is added NOT VALID, with a notice saying how many. Postgres still
--     checks it on every write of such a row, so close-report.sql, purge-closed-reports.sql's clearing and a fold that
--     moves one are refused (23514) until its reason is changed by hand to one of the four (other).
-- Roll back in reverse order only: 20261117122000 (C9), then this one, then 20261117120000 (C8). It refuses (42501) if
-- either body is not this migration's (a later migration redefined it: run that one's rollback first). If it stops
-- with "deadlock detected", nothing has changed: run it again.
do $$ declare f text; begin
 foreach f in array array['report_message(bigint,text,text)','report_user(uuid,uuid,text,text)'] loop
  if pg_catalog.to_regprocedure('private.'||f) is null then raise exception 'private.% is missing', f; end if;
  if pg_catalog.pg_get_functiondef(('private.'||f)::regprocedure) not like '%''intimate_image''%' then
   raise exception 'private.% is not the safety extension body: run the rollbacks of every later migration first', f using errcode='42501';
  end if;
 end loop;
end $$;

-- 1. The filter on titles, notes, meeting details and names.
drop trigger plans_refuse_blocked_words on public.plans;
drop trigger plan_meeting_details_refuse_blocked_words on public.plan_meeting_details;
drop trigger profiles_refuse_blocked_words on public.profiles;
drop function private.refuse_blocked_plan_words();
drop function private.refuse_blocked_meeting_words();
drop function private.refuse_blocked_name();
drop function private.holds_blocked_term(text);

-- 2. The 20261111160000_chat_safety.sql bodies.
create or replace function private.report_message(p_id bigint, p_reason text, p_details text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_msg public.messages; v_id bigint;
begin
 if p_reason is null or p_reason not in ('harassment','spam','inappropriate','other')
  or (p_details is not null and pg_catalog.char_length(p_details) > 500) then
  raise exception 'Invalid report' using errcode='23514';
 end if;
 select * into v_msg from public.messages m where m.id = p_id;
 if v_msg.id is null or v_msg.kind not in ('message','announcement') or v_msg.state <> 'sent' or v_msg.author_id is null
  or v_msg.author_id = v_uid or not (private.chat_member(v_msg.series_id, v_uid)
   or private.is_host(v_msg.plan_id, v_uid)
   or exists (select 1 from public.attendees a where a.plan_id = v_msg.plan_id and a.user_id = v_uid
    and (private.chat_is_group(v_msg.series_id) or a.response in ('accepted','maybe')))
   or exists (select 1 from private.series_leaves l where l.series_id = v_msg.series_id and l.user_id = v_uid and l.left_at > v_msg.created_at)
   or (v_msg.kind = 'announcement'
    and exists (select 1 from private.announcement_audience(v_msg.series_id, v_msg.audience) as r(id) where r.id = v_uid))) then
  raise exception 'Report unavailable' using errcode='22023';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text, 47));
 if exists (select 1 from private.reports r where r.reporter_id = v_uid and r.message_id = p_id) then return; end if;
 if (select count(*) from private.reports r where r.reporter_id = v_uid and r.created_at > now() - interval '24 hours') >= 20 then
  raise exception 'Report limit' using errcode='22023';
 end if;
 perform 1 from public.plans p where p.id = v_msg.plan_id for key share;
 insert into private.reports(reporter_id, target_user_id, message_id, series_id, plan_id, about, reason, details, frozen_body, frozen_author)
 values (v_uid, v_msg.author_id, v_msg.id, v_msg.series_id, v_msg.plan_id, 'message', p_reason, p_details, v_msg.body, v_msg.author_id)
 on conflict do nothing returning id into v_id;
 if v_id is null then return; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('report_filed', 0));
 insert into private.notification_outbox(plan_id, recipient_id, kind, dedupe_key)
 select v_msg.plan_id, m.user_id, 'report_filed', 'report:'||v_id||':'||m.user_id
 from private.moderators m
 where m.user_id <> v_uid and m.user_id <> v_msg.author_id
  and not exists (select 1 from private.notification_outbox o where o.recipient_id = m.user_id and o.kind = 'report_filed'
   and o.created_at > now() - interval '10 minutes')
 on conflict do nothing;
end $$;

create or replace function private.report_user(p_user uuid, p_series uuid, p_reason text, p_details text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_plan uuid; v_member boolean; v_id bigint;
begin
 if p_reason is null or p_reason not in ('harassment','spam','inappropriate','other')
  or (p_details is not null and pg_catalog.char_length(p_details) > 500) then
  raise exception 'Invalid report' using errcode='23514';
 end if;
 if p_user is not null and p_series is not null and p_user <> v_uid then
  select p.id into v_plan from public.plans p
  where p.series_id = p_series
   and ((private.can_see_guests(p.id) and (p.owner_id = p_user
      or exists (select 1 from public.plan_admins pa where pa.plan_id = p.id and pa.user_id = p_user)
      or exists (select 1 from public.attendees a where a.plan_id = p.id and a.user_id = p_user)))
    or (exists (select 1 from public.attendees a where a.plan_id = p.id and a.user_id = v_uid)
     and (p.owner_id = p_user or private.invited_by(p.id, p_user))))
  order by p.starts_at desc, p.id desc limit 1;
  if v_plan is null then
   v_member := private.chat_member(p_series, v_uid);
   select m.plan_id into v_plan from public.messages m
   where m.series_id = p_series and m.author_id = p_user and m.kind in ('message','announcement')
    and (v_member or (m.kind = 'announcement' and m.state = 'sent'
     and exists (select 1 from private.announcement_audience(p_series, m.audience) as r(id) where r.id = v_uid)))
   order by m.id desc limit 1;
  end if;
  if v_plan is null and exists (select 1 from public.connections c
    where (c.user_a, c.user_b) = (least(v_uid, p_user), greatest(v_uid, p_user))
     and c.state = 'requested' and c.requested_by = p_user and c.series_id = p_series) then
   v_plan := (private.current_occurrence(p_series)).id;
  end if;
 end if;
 if v_plan is null then raise exception 'Report unavailable' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text, 47));
 if exists (select 1 from private.reports r where r.reporter_id = v_uid and r.about = 'user' and r.target_user_id = p_user
   and r.series_id = p_series and r.status = 'open') then
  return;
 end if;
 if (select count(*) from private.reports r where r.reporter_id = v_uid and r.created_at > now() - interval '24 hours') >= 20 then
  raise exception 'Report limit' using errcode='22023';
 end if;
 perform 1 from public.plans p where p.id = v_plan for key share;
 insert into private.reports(reporter_id, target_user_id, series_id, plan_id, about, reason, details)
 values (v_uid, p_user, p_series, v_plan, 'user', p_reason, p_details)
 on conflict do nothing returning id into v_id;
 if v_id is null then return; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('report_filed', 0));
 insert into private.notification_outbox(plan_id, recipient_id, kind, dedupe_key)
 select v_plan, m.user_id, 'report_filed', 'report:'||v_id||':'||m.user_id
 from private.moderators m
 where m.user_id <> v_uid and m.user_id <> p_user
  and not exists (select 1 from private.notification_outbox o where o.recipient_id = m.user_id and o.kind = 'report_filed'
   and o.created_at > now() - interval '10 minutes')
 on conflict do nothing;
end $$;

-- 3. The four-reason check. The drop holds the table's lock to the end, so the count sees every report, and none is
-- added between the count and the check.
alter table private.reports drop constraint reports_reason_check;
do $$ declare v_kept integer; begin
 select count(*) into v_kept from private.reports where reason not in ('harassment','spam','inappropriate','other');
 if v_kept = 0 then
  alter table private.reports add constraint reports_reason_check check (reason in ('harassment','spam','inappropriate','other'));
 else
  raise notice '% report(s) give a reason this rollback removes: they are kept, and the four-reason check is added not valid', v_kept;
  alter table private.reports add constraint reports_reason_check check (reason in ('harassment','spam','inappropriate','other')) not valid;
 end if;
end $$;
