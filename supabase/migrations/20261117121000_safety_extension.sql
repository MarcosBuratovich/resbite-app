-- Safety extension (App Store readiness plan 4, docs/superpowers/plans/2026-11-17-asr-4-terms-safety-details.md,
-- Task 2, Decisions 7 and 9; spec docs/superpowers/specs/2026-11-17-app-store-readiness-design.md, C7). Two changes:
--  - A report may give three priority reasons, illegal, child_safety and intimate_image (the app's "Illegal or
--    dangerous", "Child safety" and "Intimate image shared without consent"), beside harassment, spam, inappropriate
--    and other. supabase/ops/open-reports.sql lists them first (docs/compliance/moderation-standard.md section 4,
--    step 3).
--  - The chat's blocked-terms match (private.send_message's) also guards a resbite's title, description and note to
--    guests (public.plans), its meeting details (public.plan_meeting_details) and a person's name (public.profiles),
--    through BEFORE triggers. Each acts only on a person's own write (auth.uid() not null) and only on a value that
--    changes, so text written before a term was listed never blocks an unrelated edit, and the roll, the fold and the
--    owner's scripts are never refused. A match is 22023 'Not allowed', as in chat. Cover descriptions, places and
--    areas stay unchecked (the spec's list).
--
-- Hosted-compatible. Each redefined body is the hosted one (the file named above it: the latest in
-- supabase/tests/hosted-baseline/migrations.txt that defines it) with only the line named in its comment changed;
-- grants are unchanged (create or replace keeps them). Rollback:
-- supabase/rollback/20261117121000_safety_extension.rollback.sql (the filter falls back to chat only; reports with a
-- new reason are kept and readable).

-- 1. The seven reasons. Every report stored so far gives one of the four, so the new check is validated.
alter table private.reports drop constraint reports_reason_check;
alter table private.reports add constraint reports_reason_check
 check (reason in ('illegal','child_safety','intimate_image','harassment','spam','inappropriate','other'));

-- 2. Reporting a message, or a person, takes the same seven.
-- From 20261111160000_chat_safety.sql: only the reason line changed.
create or replace function private.report_message(p_id bigint, p_reason text, p_details text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_msg public.messages; v_id bigint;
begin
 if p_reason is null or p_reason not in ('illegal','child_safety','intimate_image','harassment','spam','inappropriate','other')
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

-- From 20261111160000_chat_safety.sql: only the reason line changed.
create or replace function private.report_user(p_user uuid, p_series uuid, p_reason text, p_details text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_plan uuid; v_member boolean; v_id bigint;
begin
 if p_reason is null or p_reason not in ('illegal','child_safety','intimate_image','harassment','spam','inappropriate','other')
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

-- 3. The match, as send_message has it (20261111160000_chat_safety.sql, its blocked-terms check, copied): a listed
-- term as a whole word, in any case; a space in a term is any run of the blanks chat_body trims. An empty text, or
-- none, holds no term. A text over 16,000 bytes (the most chat_body lets through) is not matched, so no write makes the
-- match slow: every field guarded here is far shorter (at most 2,000 characters), and its own check refuses a longer
-- one after the trigger. The database's own: no role may call it.
create function private.holds_blocked_term(p_text text) returns boolean language sql stable security definer set search_path = '' as $$
 select p_text is not null and p_text <> '' and pg_catalog.octet_length(p_text) <= 16000 and exists (select 1 from private.blocked_terms t
  where p_text ~* ('\m' || replace(t.term, ' ', '[\s\u0085\u00a0\u115f\u1680\u2000-\u200c\u2028\u2029\u202f\u205f\u2060\u2800\u3000\u3164\ufeff\uffa0]+') || '\M'))
$$;
revoke all on function private.holds_blocked_term(text) from public, anon, authenticated, service_role;

-- 4. The guards. Each lets the database's own writes through at once: no person's claims (the weekly roll, the fold,
-- the owner's scripts). A new row is checked in every column watched; an update only in the columns whose
-- value it changes, so a term listed after the text was written never blocks an edit of something else, and a
-- deleting owner's text, blanked first by plans_redact_deleting_owner, is checked as blanked. An upsert that repeats
-- the stored meeting details (write_meeting_details) or name (save_profile) meets its BEFORE INSERT trigger first, so
-- that check skips a value equal to the stored row's. The database's own: no role may call them.
create function private.refuse_blocked_plan_words() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null then return new; end if;
 if tg_op = 'INSERT' then
  if private.holds_blocked_term(new.title) or private.holds_blocked_term(new.description) or private.holds_blocked_term(new.guest_note) then
   raise exception 'Not allowed' using errcode='22023';
  end if;
 else
  if (new.title is distinct from old.title and private.holds_blocked_term(new.title))
   or (new.description is distinct from old.description and private.holds_blocked_term(new.description))
   or (new.guest_note is distinct from old.guest_note and private.holds_blocked_term(new.guest_note)) then
   raise exception 'Not allowed' using errcode='22023';
  end if;
 end if;
 return new;
end $$;
create function private.refuse_blocked_meeting_words() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null then return new; end if;
 if tg_op = 'INSERT' then
  if not exists (select 1 from public.plan_meeting_details d where d.plan_id = new.plan_id and d.note = new.note)
   and private.holds_blocked_term(new.note) then
   raise exception 'Not allowed' using errcode='22023';
  end if;
 else
  if new.note is distinct from old.note and private.holds_blocked_term(new.note) then
   raise exception 'Not allowed' using errcode='22023';
  end if;
 end if;
 return new;
end $$;
create function private.refuse_blocked_name() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null then return new; end if;
 if tg_op = 'INSERT' then
  if not exists (select 1 from public.profiles p where p.id = new.id and p.display_name = new.display_name)
   and private.holds_blocked_term(new.display_name) then
   raise exception 'Not allowed' using errcode='22023';
  end if;
 else
  if new.display_name is distinct from old.display_name and private.holds_blocked_term(new.display_name) then
   raise exception 'Not allowed' using errcode='22023';
  end if;
 end if;
 return new;
end $$;
revoke all on function private.refuse_blocked_plan_words(), private.refuse_blocked_meeting_words(), private.refuse_blocked_name()
 from public, anon, authenticated, service_role;

-- 5. The triggers. BEFORE triggers fire in name order: plans_refuse_blocked_words runs after
-- plans_redact_deleting_owner.
create trigger plans_refuse_blocked_words before insert or update of title, description, guest_note on public.plans
 for each row execute function private.refuse_blocked_plan_words();
create trigger plan_meeting_details_refuse_blocked_words before insert or update of note on public.plan_meeting_details
 for each row execute function private.refuse_blocked_meeting_words();
create trigger profiles_refuse_blocked_words before insert or update of display_name on public.profiles
 for each row execute function private.refuse_blocked_name();
