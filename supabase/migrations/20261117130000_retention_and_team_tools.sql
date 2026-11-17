-- Retention and team tools (App Store readiness plan 6,
-- docs/superpowers/plans/2026-11-17-asr-6-retention-and-team-scripts.md; spec C3, C4 and C6). Every period in
-- docs/compliance/retention-schedule.md is enforced by a daily job that a legal hold pauses, and the team's owner-run
-- scripts (supabase/ops/) call what is here.
-- In five sections:
--  1. The legal hold, the lifted-suspension history and the retention helpers (series_under_hold, series_end).
--  2. Row purges and private.run_retention(), the daily job.
--  3. Series purges (chats and plans), web-only and unconfirmed accounts, and the one-off leftovers.
--  4. The do-not-invite list and invite_contacts.
--  5. Orphan profile photos and replaced covers, with the "remove now" helpers.
--
-- Hosted-compatible. It needs plan 2's 20261117110000_account_deletion_release.sql first (on hosted and in the local
-- replay), which makes private.legal_holds, private.account_held(uuid) and private.suspension_history: section 1 finds
-- them in place and makes only private.series_held(uuid). An object that may already exist (shared with plan 2, or
-- carried from the local-only 20260923152816_orphan_profile_photo_cleanup.sql) is made under a to_regclass or
-- to_regprocedure guard, or with if not exists, so this file runs on the hosted baseline and in the full local replay.
-- Every object this file makes carries the comment 'resbite 20261117130000', so the rollback drops only its own.
--
-- Bases. A redefined function copies the body of its latest definition among the files that run before this one on
-- hosted, and changes only the lines its comment names:
--  - private.invite_contacts(uuid, jsonb) (section 4): 20261111160000_chat_safety.sql:580-723 (that file's sha256
--    f8cfb5a62783528636aae2b8c461f150f8ae8f0553219d42b4b991bf66f2a2b2); no pending candidate before this one redefines it.
--
-- Rollback (hosted only): supabase/rollback/20261117130000_retention_and_team_tools.rollback.sql.

-- 1. The legal hold, the lifted-suspension history and the retention helpers.

-- The objects shared with plan 2 (docs/superpowers/plans/2026-11-17-asr-6-retention-and-team-scripts.md, "Shared with
-- plan 2"), in its DDL word for word. Plan 2's file runs first and has made the hold, account_held and the history, so
-- this block finds them in place; each is made here only where absent, with this file's marker. series_held is this
-- file's own. A hold names an account or a series (Decision 1), with a reason code from
-- docs/compliance/law-enforcement-requests.md section 11.2, a case reference and a review date; it pauses deletion of
-- what it names, and nothing else. A lifted suspension moves to the history (Decision 5); section 2 purges it 12 months
-- after ended_at.
do $migration$ begin
 if pg_catalog.to_regclass('private.legal_holds') is null then
  create table if not exists private.legal_holds (
   id bigint generated always as identity primary key,
   user_id uuid null,          -- no foreign key: a hold outlives the account
   series_id uuid null,
   reason text not null check (reason in ('csea','intimate_image','threat','police','nca','ofcom','coroner','court','claim')),
   case_ref text not null check (case_ref ~ '^[A-Za-z0-9-]{1,40}$'),
   review_on date not null,
   set_at timestamptz not null default now(),
   lifted_at timestamptz null,
   check ((user_id is null) <> (series_id is null))
  );
  comment on table private.legal_holds is 'resbite 20261117130000';
 end if;
 -- private.account_held(p_user uuid) returns boolean: a hold not lifted names the account (false for null).
 if pg_catalog.to_regprocedure('private.account_held(uuid)') is null then
  create function private.account_held(p_user uuid) returns boolean language sql stable security definer set search_path = '' as $fn$
   select exists(select 1 from private.legal_holds h where h.user_id = p_user and h.lifted_at is null)
  $fn$;
  comment on function private.account_held(uuid) is 'resbite 20261117130000';
 end if;
 -- private.series_held(p_series uuid) returns boolean: a hold not lifted names the series (false for null).
 if pg_catalog.to_regprocedure('private.series_held(uuid)') is null then
  create function private.series_held(p_series uuid) returns boolean language sql stable security definer set search_path = '' as $fn$
   select exists(select 1 from private.legal_holds h where h.series_id = p_series and h.lifted_at is null)
  $fn$;
  comment on function private.series_held(uuid) is 'resbite 20261117130000';
 end if;
 if pg_catalog.to_regclass('private.suspension_history') is null then
  create table if not exists private.suspension_history (
   id bigint generated always as identity primary key,
   user_id uuid null,          -- null once the account is deleted (AS-R1)
   report_id bigint null,
   suspended_at timestamptz not null,
   ended_at timestamptz not null,
   how text not null check (how in ('lifted','account_deleted'))
  );
  comment on table private.suspension_history is 'resbite 20261117130000';
 end if;
end $migration$;
-- Plan 2's index names, so these find its indexes in place.
create index if not exists legal_holds_user_idx on private.legal_holds(user_id) where lifted_at is null;
create index if not exists legal_holds_series_idx on private.legal_holds(series_id) where lifted_at is null;
alter table private.legal_holds enable row level security;
alter table private.suspension_history enable row level security;
revoke all on private.legal_holds, private.suspension_history from public, anon, authenticated, service_role;
revoke all on function private.account_held(uuid), private.series_held(uuid) from public, anon, authenticated, service_role;

-- Whether a series is under hold (Decision 1, Review Focus 1): a hold not lifted names the series, or names an account
-- that owns one of its occurrences, has a guest row on one, or wrote in its chat. What a held person hosted, joined or
-- wrote in stays whole: every purge and both workers skip it. account_held's rule, read from the holds' side so the few
-- holds not lifted drive the search (each probe is by index: plans by series, attendees by plan and user, messages by
-- author). False for null and for a series that does not exist. The database's own: no role may call it.
create function private.series_under_hold(p_series uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select private.series_held(p_series) or exists (
  select 1 from private.legal_holds h
  where h.user_id is not null and h.lifted_at is null and (
   exists (select 1 from public.plans p where p.series_id = p_series and p.owner_id = h.user_id)
   or exists (select 1 from public.plans p join public.attendees a on a.plan_id = p.id
    where p.series_id = p_series and a.user_id = h.user_id)
   or exists (select 1 from public.messages m where m.series_id = p_series and m.author_id = h.user_id)))
$$;
revoke all on function private.series_under_hold(uuid) from public, anon, authenticated, service_role;
comment on function private.series_under_hold(uuid) is 'resbite 20261117130000';

-- When a series ends (Decision 3). Null while the roll can still add an occurrence: its current occurrence keeps a
-- repeat rule, and the group has not stopped with its chat closed (the roll's own rules,
-- 20261111150000_chat_groups.sql:422-440: an owner who may no longer use the app stops it, and a stopped group whose chat
-- has closed is finished). Otherwise the current occurrence's end, cancelled or not. So a running weekly group is never
-- purged as a whole. Null for a series with no plan. The database's own: no role may call it.
create function private.series_end(p_series uuid) returns timestamptz language sql stable security definer set search_path = '' as $$
 select case
  when c.id is null then null
  when c.repeat_weeks is not null and not (private.group_stopped(p_series) and not private.chat_open(p_series)) then null
  else private.plan_end(c.starts_at, c.ends_at) end
 from private.current_occurrence(p_series) c
$$;
revoke all on function private.series_end(uuid) from public, anon, authenticated, service_role;
comment on function private.series_end(uuid) is 'resbite 20261117130000';

-- 2. Row purges and private.run_retention().

-- Each purge deletes what docs/compliance/retention-schedule.md says is due, at most p_limit rows a call, and answers
-- how many it deleted (or changed). It skips a record a legal hold keeps (Decision 4: every purge checks the hold, even
-- where the schedule marks "—"), so once the hold is lifted, the next run takes what is overdue. Each picks its rows
-- with for update skip locked: a row another transaction is changing waits for the next run, and a row changed since
-- the purge's snapshot is checked again as it now stands (a revoked invitation sent again, a request just accepted).
-- The database's own: no grant, pg_cron runs them as postgres (schedule-retention.sql), through run_retention.

-- An invitation by number (Decision 2, D-8): revoked, or 30 days after its resbite ends. An answered one stays until
-- then, since the personal link lets its answerer change their answer until the end. Kept while its resbite's series
-- is under hold, or while the account that sent it, brought it or answered it is held.
create function private.purge_phone_invitations(p_limit integer default 5000) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
 with candidates as (
  select i.id from private.phone_invitations i join public.plans p on p.id = i.plan_id
  where (i.revoked_at is not null or private.plan_end(p.starts_at, p.ends_at) + interval '30 days' < now())
   and not private.account_held(i.invited_by) and not private.account_held(i.brought_by)
   and not private.account_held(i.user_id) and not private.series_under_hold(p.series_id)
  limit p_limit for update of i skip locked
 ), removed as (
  delete from private.phone_invitations i using candidates c where i.id = c.id returning 1
 ) select count(*) into v_count from removed;
 return v_count;
end $$;
revoke all on function private.purge_phone_invitations(integer) from public, anon, authenticated, service_role;
comment on function private.purge_phone_invitations(integer) is 'resbite 20261117130000';

-- A removal record, by number or account (D-8): 30 days after a one-off (one plan, no repeat) ends, 90 days after any
-- other series ends (series_end: never while a group still rolls), and at once when the series has no plan left. Kept
-- while its series is under hold or its account is held. The table has no key: a row is taken by its ctid, in the one
-- statement that found it.
create function private.purge_plan_removals(p_limit integer default 5000) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
 with candidates as (
  select r.ctid as row_id from private.plan_removals r
  cross join lateral (select count(*) as plans, count(p.repeat_weeks) as repeating from public.plans p
   where p.series_id = r.series_id) s
  where (s.plans = 0 or private.series_end(r.series_id)
    + case when s.plans = 1 and s.repeating = 0 then interval '30 days' else interval '90 days' end < now())
   and not private.account_held(r.user_id) and not private.series_under_hold(r.series_id)
  limit p_limit for update of r skip locked
 ), removed as (
  delete from private.plan_removals r using candidates c where r.ctid = c.row_id returning 1
 ) select count(*) into v_count from removed;
 return v_count;
end $$;
revoke all on function private.purge_plan_removals(integer) from public, anon, authenticated, service_role;
comment on function private.purge_plan_removals(integer) is 'resbite 20261117130000';

-- A "Not now" or a removal between two people (D-8): 12 months after it was made. Kept while either account is held.
create function private.purge_connection_refusals(p_limit integer default 5000) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
 with candidates as (
  select f.series_id, f.from_user, f.to_user from private.connection_refusals f
  where f.refused_at < now() - interval '12 months'
   and not private.account_held(f.from_user) and not private.account_held(f.to_user)
  limit p_limit for update of f skip locked
 ), removed as (
  delete from private.connection_refusals f using candidates c
  where f.series_id = c.series_id and f.from_user = c.from_user and f.to_user = c.to_user returning 1
 ) select count(*) into v_count from removed;
 return v_count;
end $$;
revoke all on function private.purge_connection_refusals(integer) from public, anon, authenticated, service_role;
comment on function private.purge_connection_refusals(integer) is 'resbite 20261117130000';

-- A connection request nobody answered (D-8): 90 days after it was made. A connection is never touched. Kept while
-- either account is held. The pair's functions lock the row (for update) before they change it, so a request being
-- accepted is either skipped here or found gone there.
create function private.purge_connection_requests(p_limit integer default 5000) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
 with candidates as (
  select c.user_a, c.user_b from public.connections c
  where c.state = 'requested' and c.created_at < now() - interval '90 days'
   and not private.account_held(c.user_a) and not private.account_held(c.user_b)
  limit p_limit for update of c skip locked
 ), removed as (
  delete from public.connections c using candidates d where c.user_a = d.user_a and c.user_b = d.user_b returning 1
 ) select count(*) into v_count from removed;
 return v_count;
end $$;
revoke all on function private.purge_connection_requests(integer) from public, anon, authenticated, service_role;
comment on function private.purge_connection_requests(integer) is 'resbite 20261117130000';

-- A notice (D-8): 30 days after it was sent, or made when it never was. An 'invited' notice stays while its recipient
-- still has a 'pending' guest row on that plan, because the block rule reads it (DI-09). Kept while its recipient or
-- its actor is held. Its delivery rows go with it (on delete cascade).
create function private.purge_notifications(p_limit integer default 5000) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
 with candidates as (
  select o.id from private.notification_outbox o
  where coalesce(o.delivered_at, o.created_at) < now() - interval '30 days'
   and not (o.kind = 'invited' and exists (select 1 from public.attendees a
    where a.plan_id = o.plan_id and a.user_id = o.recipient_id and a.response = 'pending'))
   and not private.account_held(o.recipient_id) and not private.account_held(o.actor_id)
  limit p_limit for update of o skip locked
 ), removed as (
  delete from private.notification_outbox o using candidates c where o.id = c.id returning 1
 ) select count(*) into v_count from removed;
 return v_count;
end $$;
revoke all on function private.purge_notifications(integer) from public, anon, authenticated, service_role;
comment on function private.purge_notifications(integer) is 'resbite 20261117130000';

-- A link open (GI2-D9): 12 months after it. No hold check: a row identifies nobody.
create function private.purge_link_opens(p_limit integer default 5000) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
 with candidates as (
  select o.id from private.link_opens o where o.opened_at < now() - interval '12 months'
  limit p_limit for update of o skip locked
 ), removed as (
  delete from private.link_opens o using candidates c where o.id = c.id returning 1
 ) select count(*) into v_count from removed;
 return v_count;
end $$;
revoke all on function private.purge_link_opens(integer) from public, anon, authenticated, service_role;
comment on function private.purge_link_opens(integer) is 'resbite 20261117130000';

-- Closed reports: supabase/ops/purge-closed-reports.sql's two steps, which this job replaces (retention-schedule.md,
-- section 7). First it deletes each report closed more than report_keep_days() (180) days ago; then, on the other closed reports,
-- it forgets whom they were about (target_user_id and frozen_author) when that account has no profile any more or is
-- being deleted. Open reports are never touched. It skips a report whose reporter, target or frozen author is held, or
-- whose series is named by a hold. p_limit bounds both steps together; it answers deleted plus cleared.
create function private.purge_closed_reports(p_limit integer default 5000) returns integer
language plpgsql security definer set search_path = '' as $$
declare
 v_cutoff timestamptz := now() - pg_catalog.make_interval(days => private.report_keep_days());
 v_deleted integer;
 v_cleared integer;
begin
 with candidates as (
  select r.id from private.reports r
  where r.status <> 'open' and r.reviewed_at < v_cutoff
   and not private.account_held(r.reporter_id) and not private.account_held(r.target_user_id)
   and not private.account_held(r.frozen_author) and not private.series_held(r.series_id)
  limit p_limit for update of r skip locked
 ), removed as (
  delete from private.reports r using candidates c where r.id = c.id returning 1
 ) select count(*) into v_deleted from removed;
 with candidates as (
  select r.id from private.reports r
  where r.status <> 'open' and (r.reviewed_at < v_cutoff) is not true
   and ((r.target_user_id is not null
     and (not exists (select 1 from public.profiles x where x.id = r.target_user_id) or private.deletion_pending(r.target_user_id)))
    or (r.frozen_author is not null
     and (not exists (select 1 from public.profiles x where x.id = r.frozen_author) or private.deletion_pending(r.frozen_author))))
   and not private.account_held(r.reporter_id) and not private.account_held(r.target_user_id)
   and not private.account_held(r.frozen_author) and not private.series_held(r.series_id)
  limit p_limit - v_deleted for update of r skip locked
 ), cleared as (
  update private.reports r set target_user_id = null, frozen_author = null from candidates c where r.id = c.id returning 1
 ) select count(*) into v_cleared from cleared;
 return v_deleted + v_cleared;
end $$;
revoke all on function private.purge_closed_reports(integer) from public, anon, authenticated, service_role;
comment on function private.purge_closed_reports(integer) is 'resbite 20261117130000';

-- A lifted or deleted account's suspension (D-8, AS-R1): 12 months after it ended. Kept while its account is held.
create function private.purge_suspension_history(p_limit integer default 5000) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
 with candidates as (
  select h.id from private.suspension_history h
  where h.ended_at < now() - interval '12 months' and not private.account_held(h.user_id)
  limit p_limit for update of h skip locked
 ), removed as (
  delete from private.suspension_history h using candidates c where h.id = c.id returning 1
 ) select count(*) into v_count from removed;
 return v_count;
end $$;
revoke all on function private.purge_suspension_history(integer) from public, anon, authenticated, service_role;
comment on function private.purge_suspension_history(integer) is 'resbite 20261117130000';

-- The daily job (schedule-retention.sql). Section 3's series purges run first (plans, then chats), so a series that
-- goes takes its records with it, then this section's eight, then section 3's two account purges. Each purge runs with
-- its own default limit (5000; plans 200 series, web accounts 100) in a block of its own, so one that fails undoes only
-- its own work, warns with its key and SQLSTATE, and reads null; the others still run. It logs the counts and answers
-- them: counts, never ids.
create function private.run_retention() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 v_key text;
 v_count integer;
 v_counts jsonb := '{}'::jsonb;
begin
 foreach v_key in array array['plans','chats','phone_invitations','plan_removals','connection_refusals','connection_requests',
  'notifications','link_opens','closed_reports','suspension_history','web_accounts','unconfirmed_accounts'] loop
  begin
   execute pg_catalog.format('select private.%I()', 'purge_' || v_key) into v_count;
   v_counts := v_counts || pg_catalog.jsonb_build_object(v_key, v_count);
  exception when others then
   raise warning 'resbite retention: % failed (%)', v_key, sqlstate;
   v_counts := v_counts || pg_catalog.jsonb_build_object(v_key, null);
  end;
 end loop;
 raise log 'resbite retention: %', v_counts;
 return v_counts;
end $$;
revoke all on function private.run_retention() from public, anon, authenticated, service_role;
comment on function private.run_retention() is 'resbite 20261117130000';

-- 3. Series purges (chats and plans), web-only and unconfirmed accounts, and the one-off leftovers.

-- A chat (D-8, CH-P15). A one-off's messages, reads and mutes go 90 days after its chat closed (48 hours after its end;
-- a cancelled one, which closes at once, 48 hours after its end too), and its row reads empty. A group's chat runs as
-- long as its series, so its messages go one by one 12 months after they were written. Kept while the series is under
-- hold (Decision 1). First it locks each chat row it will change, in series order, before any message row, as the
-- account deletion and the stats trigger take them (H28, 20261116120000_open_beta.sql:258-264), so it never deadlocks
-- with them. Then it deletes at most p_limit messages (one another transaction holds waits for the next run) and puts
-- each chat row's figures right by the stats trigger's and chat_hide_line's rules (20261111140000_chat_core.sql:394-418,
-- 20261111150000_chat_groups.sql:51-66), which a delete never fires: message_count is the messages and announcements
-- still sent; the last line is the newest row left that is not a hidden system line, with its time, or none; the pin
-- goes when its announcement went (every older one is older still, so went too). A report on a message that went keeps
-- its frozen words (its message_id goes null by its key); a chat notice goes with its message (on delete cascade). At
-- most p_limit chats a call; it answers how many messages it deleted. The database's own: no grant.
create function private.purge_chats(p_limit integer default 5000) returns integer
language plpgsql security definer set search_path = '' as $$
declare
 v_cutoff timestamptz := now() - interval '12 months';
 v_series uuid[];
 v_count integer;
begin
 select coalesce(pg_catalog.array_agg(d.series_id order by d.series_id), '{}') into v_series from (
  select ch.series_id from public.chats ch cross join lateral private.current_occurrence(ch.series_id) c
  where case when private.chat_is_group(ch.series_id)
    then exists (select 1 from public.messages m where m.series_id = ch.series_id and m.created_at < v_cutoff)
    else coalesce(private.chat_closes_at(ch.series_id), private.plan_end(c.starts_at, c.ends_at) + interval '48 hours')
      + interval '90 days' < now()
     and (exists (select 1 from public.messages m where m.series_id = ch.series_id)
      or exists (select 1 from public.chat_reads r where r.series_id = ch.series_id)
      or exists (select 1 from public.chat_mutes u where u.series_id = ch.series_id)) end
   and not private.series_under_hold(ch.series_id)
  order by ch.series_id limit p_limit
  for update of ch
 ) d;
 with candidates as (
  select m.id from public.messages m join public.chats ch on ch.series_id = m.series_id
  where m.series_id = any(v_series) and (not ch.is_group or m.created_at < v_cutoff)
  limit p_limit for update of m skip locked
 ), removed as (
  delete from public.messages m using candidates c where m.id = c.id returning 1
 ) select count(*) into v_count from removed;
 delete from public.chat_reads r using public.chats ch
 where ch.series_id = r.series_id and r.series_id = any(v_series) and not ch.is_group;
 delete from public.chat_mutes u using public.chats ch
 where ch.series_id = u.series_id and u.series_id = any(v_series) and not ch.is_group;
 update public.chats ch set
  message_count = (select count(*) from public.messages m
   where m.series_id = ch.series_id and m.kind in ('message','announcement') and m.state = 'sent'),
  (last_message_id, last_message_at) = (select m.id, m.created_at from public.messages m
   where m.series_id = ch.series_id and not (m.kind = 'system' and m.state = 'deleted') order by m.id desc limit 1),
  pinned_message_id = case when exists (select 1 from public.messages m where m.id = ch.pinned_message_id)
   then ch.pinned_message_id end
 where ch.series_id = any(v_series);
 return v_count;
end $$;
revoke all on function private.purge_chats(integer) from public, anon, authenticated, service_role;
comment on function private.purge_chats(integer) is 'resbite 20261117130000';

-- A resbite (D-8): its whole series goes 12 months after the series ends (series_end, Decision 3: never while a group
-- still rolls), unless the series is under hold. Every occurrence goes in one statement, so repeats_from never blocks
-- it, and the keys take the rest: guests, meeting details, co-hosts, join requests, links and their opens, invitations
-- by number and the legacy ones, messages (a report keeps its frozen words) and notices. Then the series' own rows:
-- its mutes, leaves, chat reads and chat mutes, and its chat row. Its removal records go in the same run (section 2's
-- purge_plan_removals takes those of a series with no plan), and its cover files are orphans for the photo worker
-- (section 5). Only a series whose every occurrence ended more than 12 months ago is looked at: the current occurrence
-- is the latest, so this leaves out nothing that is due, and a series stays while any occurrence of it ended in the
-- last 12 months. Each series is taken on its own: its plan rows in id order, then
-- its chat row, as the account deletion and the roll take them (plan, then chat, then message: H28), without waiting
-- (nowait), so a series another transaction is changing waits for the next run; under those locks it is checked again.
-- At most p_limit series a call; it answers how many plans it deleted (every occurrence of each series it took). The
-- database's own: no grant.
create function private.purge_plans(p_limit integer default 200) returns integer
language plpgsql security definer set search_path = '' as $$
declare
 v_series uuid;
 v_rows integer;
 v_count integer := 0;
begin
 for v_series in
  select s.series_id from (
   select p.series_id from public.plans p group by p.series_id
   having max(private.plan_end(p.starts_at, p.ends_at)) < now() - interval '12 months'
  ) s
  where private.series_end(s.series_id) + interval '12 months' < now() and not private.series_under_hold(s.series_id)
  order by s.series_id limit p_limit
 loop
  begin
   perform 1 from public.plans p where p.series_id = v_series order by p.id for update nowait;
   perform 1 from public.chats c where c.series_id = v_series for update nowait;
   continue when (private.series_end(v_series) + interval '12 months' < now()) is not true
    or private.series_under_hold(v_series);
   delete from public.plans p where p.series_id = v_series;
   get diagnostics v_rows = row_count;
   delete from public.plan_mutes m where m.series_id = v_series;
   delete from private.series_leaves l where l.series_id = v_series;
   delete from public.chat_reads r where r.series_id = v_series;
   delete from public.chat_mutes u where u.series_id = v_series;
   delete from public.chats c where c.series_id = v_series;
   v_count := v_count + v_rows;
  exception when lock_not_available then
   null;
  end;
 end loop;
 return v_count;
end $$;
revoke all on function private.purge_plans(integer) from public, anon, authenticated, service_role;
comment on function private.purge_plans(integer) is 'resbite 20261117130000';

-- A web-only account no longer in use (AS-R4, Decision 11): it has a profile, a confirmed number and no email, has
-- never signed into the app (used_app), is neither being deleted nor held, was made more than 12 months ago, and in
-- the last 12 months hosted no resbite (made or ended in them), had no guest row on one that ended in them, asked to
-- join none and answered no invitation by number. At most p_limit, in id order. The database's own: no grant.
create function private.dormant_web_accounts(p_limit integer default 100) returns setof uuid
language sql stable security definer set search_path = '' as $$
 select u.id from auth.users u join public.profiles pr on pr.id = u.id
 where u.email is null and u.phone_confirmed_at is not null
  and not private.used_app(u.id) and not private.deletion_pending(u.id) and not private.account_held(u.id)
  and u.created_at < now() - interval '12 months'
  and not exists (select 1 from public.plans p where p.owner_id = u.id
   and (p.created_at > now() - interval '12 months' or private.plan_end(p.starts_at, p.ends_at) > now() - interval '12 months'))
  and not exists (select 1 from public.attendees a join public.plans p on p.id = a.plan_id
   where a.user_id = u.id and private.plan_end(p.starts_at, p.ends_at) > now() - interval '12 months')
  and not exists (select 1 from private.join_requests j where j.user_id = u.id and j.created_at > now() - interval '12 months')
  and not exists (select 1 from private.phone_invitations i where i.user_id = u.id and i.answered_at > now() - interval '12 months')
 order by u.id limit p_limit
$$;
revoke all on function private.dormant_web_accounts(integer) from public, anon, authenticated, service_role;
comment on function private.dormant_web_accounts(integer) is 'resbite 20261117130000';

-- Each dormant web account is deleted by plan 2's team deletion (private.operator_account_deletion, AS-R3): the app's
-- lifecycle, with the cancellations and the receipt, after which the cleanup-account worker removes its files and Auth
-- user. It is called by name at run time: without plan 2's function this refuses with 55000, so the daily run reads
-- null for the key and warns, and never skips in silence. The deletion sets the deletion's flag (resbite.system) to the
-- end of the transaction; it is put back after each call, so whatever runs after it in the same transaction writes its
-- chat lines as before. It answers how many deletions it queued. The database's own: no grant.
create function private.purge_web_accounts(p_limit integer default 100) returns integer
language plpgsql security definer set search_path = '' as $$
declare
 v_user uuid;
 v_flag text := pg_catalog.current_setting('resbite.system', true);
 v_count integer := 0;
begin
 if pg_catalog.to_regprocedure('private.operator_account_deletion(uuid)') is null then
  raise exception 'Operator deletion missing' using errcode = '55000';
 end if;
 for v_user in select d.id from private.dormant_web_accounts(p_limit) as d(id) loop
  execute 'select private.operator_account_deletion($1)' using v_user;
  perform pg_catalog.set_config('resbite.system', coalesce(v_flag, ''), true);
  v_count := v_count + 1;
 end loop;
 return v_count;
end $$;
revoke all on function private.purge_web_accounts(integer) from public, anon, authenticated, service_role;
comment on function private.purge_web_accounts(integer) is 'resbite 20261117130000';

-- An Auth user that never confirmed anything (AS-R4: a code request never confirmed is kept 30 days): no confirmed
-- email or phone, not anonymous, made more than 30 days ago, with no profile, and not held. It is deleted from
-- auth.users, as the dashboard deletes one, and what refers to it goes by its keys. A row another transaction holds
-- waits for the next run. At most p_limit a call; it answers how many it deleted. The database's own: no grant.
create function private.purge_unconfirmed_accounts(p_limit integer default 5000) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
 with candidates as (
  select u.id from auth.users u
  where u.email_confirmed_at is null and u.phone_confirmed_at is null and not coalesce(u.is_anonymous, false)
   and u.created_at < now() - interval '30 days'
   and not exists (select 1 from public.profiles p where p.id = u.id) and not private.account_held(u.id)
  limit p_limit for update of u skip locked
 ), removed as (
  delete from auth.users u using candidates c where u.id = c.id returning 1
 ) select count(*) into v_count from removed;
 return v_count;
end $$;
revoke all on function private.purge_unconfirmed_accounts(integer) from public, anon, authenticated, service_role;
comment on function private.purge_unconfirmed_accounts(integer) is 'resbite 20261117130000';

-- The one-off leftovers (Decision 10), run once, here, as data steps. Since the open beta the tester roster no longer
-- decides who may use the app (20261116120000_open_beta.sql:1-4), and the legacy invitations gate nothing. A roster
-- row still counts in two ways. A disabled one keeps someone out (private.access_suspended, :24-30). An enabled one
-- keeps an old tester on the old paths (private.granted_access, :15-22): join_by_link claims the place without the
-- 18+ tick, request_to_join does not ask for the tick, and an approval (decide_join_request) records no grant. After
-- this step old testers take the general path like everyone else: they tick 18+ once, and an approval records a
-- grant (this follows from emptying the roster, Decision 10). So first each disabled roster row of an Auth user
-- becomes a revoked grant (one made, already revoked, where the account has none; a live one revoked now; a revoked
-- one left as it was), so nobody suspended that way gets back in. A suspension that disabled that row
-- (private.suspensions, roster true) is rewritten as if it had revoked the grant instead: roster false; grant_at the
-- grant's revoked_at where this step made or revoked the grant, else as it was; grant_made true where this step made
-- the grant, else as it was. So the undo at supabase/ops/suspend-account.sql:37-49 still puts back exactly what the
-- suspension changed: it deletes a grant the suspension made, gives back a live grant it revoked, and leaves an
-- earlier ban alone. Then both tables are emptied. access_suspended still reads the empty roster, and
-- suspend-account.sql stays as it is. The rollback restores neither table. private.phone_rewrites waits for the C12
-- decision (an owner step).
with disabled as (
 select distinct u.id as user_id from private.tester_roster r join auth.users u on r.email = lower(u.email) where not r.enabled
), had as (
 select d.user_id, b.user_id is not null as had_row, b.revoked_at is not null as was_revoked
 from disabled d left join private.beta_access b on b.user_id = d.user_id
), grants as (
 insert into private.beta_access(user_id, source, revoked_at) select d.user_id, 'maintainer', now() from disabled d
 on conflict (user_id) do update set revoked_at = coalesce(private.beta_access.revoked_at, now())
 returning private.beta_access.user_id, private.beta_access.revoked_at
)
update private.suspensions s set roster = false,
 grant_at = case when h.was_revoked then s.grant_at else g.revoked_at end,
 grant_made = s.grant_made or not h.had_row
from grants g join had h on h.user_id = g.user_id
where s.user_id = g.user_id and s.roster;
delete from private.tester_roster;
delete from private.invitations;

-- 4. The do-not-invite list and invite_contacts.

-- The do-not-invite list (D-23, LI-4, docs/compliance/data-requests.md section 10.2): a person who is not a user and
-- objects is never invited by number again. It holds each number's keyed hash, and nothing else: no number, no name, no
-- inviter. An entry stays until the person withdraws the objection (supabase/ops/withdraw-objection.sql). No API role
-- may reach it; the owner-run scripts call the functions below as postgres.
create table private.invite_objections (
 key_hash bytea primary key,
 objected_at timestamptz not null default now()
);
alter table private.invite_objections enable row level security;
revoke all on private.invite_objections from public, anon, authenticated, service_role;
comment on table private.invite_objections is 'resbite 20261117130000';

-- A number's keyed hash (Decision 6): HMAC-SHA256 of its key (phone_key, so both spellings of an Argentine mobile are
-- one entry) under the list's secret, which lives in Vault as invite_objection_key and never leaves the database.
-- Without the secret it refuses with 55000 'Objection key missing'. The database's own: no role may call it.
create function private.objection_key_hash(p_phone text) returns bytea
language plpgsql stable security definer set search_path = '' as $$
declare v_secret text;
begin
 select s.decrypted_secret into v_secret from vault.decrypted_secrets s where s.name = 'invite_objection_key';
 if v_secret is null then
  raise exception 'Objection key missing' using errcode = '55000';
 end if;
 return extensions.hmac(private.phone_key(p_phone), v_secret, 'sha256');
end $$;
revoke all on function private.objection_key_hash(text) from public, anon, authenticated, service_role;
comment on function private.objection_key_hash(text) is 'resbite 20261117130000';

-- The list's secret, made inside the database by the first objection (Decision 6): 32 random bytes, as hex, in Vault.
-- Never displayed. It answers true when it made the secret, false when one was already there. Two first objections at
-- once take turns (a transaction lock), so only one secret is made. The database's own: no role may call it.
create function private.ensure_objection_key() returns boolean
language plpgsql security definer set search_path = '' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('resbite invite_objection_key', 0));
 if exists (select 1 from vault.decrypted_secrets s where s.name = 'invite_objection_key') then
  return false;
 end if;
 perform vault.create_secret(pg_catalog.encode(extensions.gen_random_bytes(32), 'hex'), 'invite_objection_key',
  'Keyed hash for the do-not-invite list');
 return true;
end $$;
revoke all on function private.ensure_objection_key() from public, anon, authenticated, service_role;
comment on function private.ensure_objection_key() is 'resbite 20261117130000';

-- Whether a number is on the list. False at once while the list is empty, without reading Vault, so nothing changes
-- for inviting until the first objection (Decision 6). The database's own: no role may call it (invite_contacts, a
-- definer, does).
create function private.number_objected(p_phone text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_hash bytea;
begin
 if not exists (select 1 from private.invite_objections) then
  return false;
 end if;
 v_hash := private.objection_key_hash(p_phone);
 return exists (select 1 from private.invite_objections o where o.key_hash = v_hash);
end $$;
revoke all on function private.number_objected(text) from public, anon, authenticated, service_role;
comment on function private.number_objected(text) is 'resbite 20261117130000';

-- An objection (supabase/ops/object-number.sql, after the phone check in docs/compliance/data-requests.md section
-- 4.3). It refuses 22023 'Invalid number' unless the number's key is an international number; makes the list's
-- secret if there is none; lists the keyed hash (already listed: nothing new); and deletes, for every host, each
-- invitation by number to it and each removal record of it, but those a legal hold keeps: an invitation on a series
-- under hold, or one an account under hold sent, brought or answered (the invitations purge's rule, section 2); a
-- removal on a series under hold, or of an account under hold. It answers {"already_listed", "invitations_deleted",
-- "removals_deleted", "held_kept"}: counts, never the number. An invitation a host sends while this runs is not seen
-- by it, so the script says to run it again a minute later. The database's own: no role may call it.
create function private.record_objection(p_phone text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 v_key text := private.phone_key(p_phone);
 v_listed boolean;
 v_invitations integer;
 v_removals integer;
 v_kept integer;
begin
 if v_key !~ '^[1-9][0-9]{6,14}$' then
  raise exception 'Invalid number' using errcode = '22023';
 end if;
 perform private.ensure_objection_key();
 insert into private.invite_objections(key_hash) values (private.objection_key_hash(v_key)) on conflict do nothing;
 v_listed := not found;
 with removed as (
  delete from private.phone_invitations i using public.plans p
  where p.id = i.plan_id and i.phone = v_key
   and not private.account_held(i.invited_by) and not private.account_held(i.brought_by)
   and not private.account_held(i.user_id) and not private.series_under_hold(p.series_id)
  returning 1
 ) select count(*) into v_invitations from removed;
 with removed as (
  delete from private.plan_removals r
  where r.phone = v_key and not private.account_held(r.user_id) and not private.series_under_hold(r.series_id)
  returning 1
 ) select count(*) into v_removals from removed;
 select (select count(*) from private.phone_invitations i join public.plans p on p.id = i.plan_id
   where i.phone = v_key and (private.account_held(i.invited_by) or private.account_held(i.brought_by)
    or private.account_held(i.user_id) or private.series_under_hold(p.series_id)))
  + (select count(*) from private.plan_removals r
   where r.phone = v_key and (private.account_held(r.user_id) or private.series_under_hold(r.series_id)))
  into v_kept;
 return pg_catalog.jsonb_build_object('already_listed', v_listed, 'invitations_deleted', v_invitations,
  'removals_deleted', v_removals, 'held_kept', v_kept);
end $$;
revoke all on function private.record_objection(text) from public, anon, authenticated, service_role;
comment on function private.record_objection(text) is 'resbite 20261117130000';

-- A withdrawn objection (supabase/ops/withdraw-objection.sql): the number's entry goes, and hosts may invite it by
-- link again. It answers whether an entry went. On an empty list it answers false without reading Vault. The secret
-- stays. The database's own: no role may call it.
create function private.withdraw_objection(p_phone text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
 if not exists (select 1 from private.invite_objections) then
  return false;
 end if;
 delete from private.invite_objections o where o.key_hash = private.objection_key_hash(p_phone);
 get diagnostics v_count = row_count;
 return v_count > 0;
end $$;
revoke all on function private.withdraw_objection(text) from public, anon, authenticated, service_role;
comment on function private.withdraw_objection(text) is 'resbite 20261117130000';

-- invite_contacts: the chat safety body as built (20261111160000_chat_safety.sql:580-723; nothing later redefines it),
-- create or replace, its grants and public wrapper kept, every branch as built. One change, in the phone branch's
-- choice (chat_safety.sql:701-702): a listed number that would have taken the link path answers 'unavailable'
-- (Decision 7): no invitation by number, no guest row, no notice. 'self', 'already' and 'app' come first and are
-- unchanged, so a Resbite user who holds that number is still invited in the app (LI-4).
create or replace function private.invite_contacts(p_plan uuid, p_invites jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_tester(); v_host boolean; v_item jsonb; v_phone text; v_country text; v_code text; v_holder uuid;
 v_kind text; v_out jsonb := '[]'::jsonb; v_user uuid; v_series uuid; v_brought uuid; v_level smallint := 1; v_may boolean;
 v_remaining integer := 0; v_new integer := 0; v_key text; v_live private.phone_invitations; v_open boolean; v_on boolean;
begin
 v_host := private.is_host(p_plan,v_uid);
 if v_host then
  perform private.require_link_owner(p_plan);
 else
  -- Only someone on the resbite gets as far as its row's lock.
  if not exists(select 1 from public.attendees a where a.plan_id=p_plan and a.user_id=v_uid) then
   raise exception 'Not allowed to bring people here' using errcode='42501';
  end if;
  -- The plan's row first, then the allowance.
  select p.status='active' and private.plan_end(p.starts_at,p.ends_at)>now() into v_open from public.plans p where p.id=p_plan for update;
  select a.may_bring, a.level+1, a.remaining, a.level is not null into v_may, v_level, v_remaining, v_on
   from private.bring_allowance(p_plan,v_uid) a;
  if not coalesce(v_open,false) or not coalesce(v_on,false) then
   raise exception 'Not allowed to bring people here' using errcode='42501';
  end if;
  v_may := coalesce(v_may,false);
  v_brought := v_uid;
 end if;
 select series_id into v_series from public.plans where id=p_plan;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text,47));
 if jsonb_typeof(p_invites) is distinct from 'array' or jsonb_array_length(p_invites)>50 then
  raise exception 'Invalid invitations' using errcode='22023';
 end if;
 -- The kind of each item tells the host who is On Resbite, so invitations spend the same daily budget as lookups: the
 -- numbers only, as an item by user looks nothing up.
 perform private.charge_lookup(v_uid,(select count(*)::int from jsonb_array_elements(p_invites) e
  where jsonb_typeof(e.value->'user') is distinct from 'string'));
 for v_item in select value from jsonb_array_elements(p_invites) loop
  if jsonb_typeof(v_item->'user')='string' then
   -- A guest who may not bring sends no in-app invitation.
   if not v_host and not v_may then raise exception 'Not allowed to bring people here' using errcode='42501'; end if;
   if v_item->>'user' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Invalid invitation' using errcode='22023';
   end if;
   v_user := (v_item->>'user')::uuid;
   -- The pair's row is held while the invitation is made: a removal at the same moment goes first or waits.
   perform 1 from public.connections where (user_a,user_b)=(least(v_uid,v_user),greatest(v_uid,v_user)) and state='connected' for share;
   if not found or not private.user_eligible(v_user) or private.deletion_pending(v_user) then
    raise exception 'Not a connection' using errcode='42501';
   end if;
   -- The person's confirmed number: the links to it are invitations of this person.
   v_key := (select nullif(private.phone_key(u.phone),'') from auth.users u where u.id=v_user and u.phone_confirmed_at is not null);
   if v_user=(select owner_id from public.plans where id=p_plan)
    or exists(select 1 from public.attendees where plan_id=p_plan and user_id=v_user) then
    v_kind := 'already';
   else
    if not v_host then
     if exists(select 1 from private.plan_removals r where r.series_id=v_series and (r.user_id=v_user or r.phone=v_key))
      or exists(select 1 from private.join_requests j where j.plan_id=p_plan and j.user_id=v_user and j.status='waiting') then
      raise exception 'Not allowed to bring people here' using errcode='42501';
     end if;
     select * into v_live from private.phone_invitations where plan_id=p_plan and phone=v_key and revoked_at is null;
    end if;
    if not v_host and v_live.id is not null and v_live.brought_by is distinct from v_uid then
     v_kind := 'already';
    else
     if not v_host and v_live.id is null then
      v_new := v_new+1;
      if v_new>v_remaining then raise exception 'No invites left' using errcode='22023'; end if;
     end if;
     v_kind := 'app';
     insert into public.attendees(plan_id,user_id,brought_by,level) values(p_plan,v_user,v_brought,v_level) on conflict do nothing;
     insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id)
      values(p_plan,v_user,'invited','invited:'||p_plan||':'||v_user,v_uid) on conflict do nothing;
     update private.phone_invitations set revoked_at=now(), code_hash=null
      where plan_id=p_plan and phone=v_key and revoked_at is null;
     if v_host then
      delete from private.plan_removals where series_id=v_series and (user_id=v_user or phone=v_key);
     end if;
    end if;
   end if;
   v_out := v_out || jsonb_build_array(jsonb_build_object('user',v_user,'kind',v_kind));
   continue;
  end if;
  if jsonb_typeof(v_item) is distinct from 'object' or jsonb_typeof(v_item->'phone') is distinct from 'string'
   or jsonb_typeof(v_item->'country') is distinct from 'string' or jsonb_typeof(v_item->'code') is distinct from 'string' then
   raise exception 'Invalid invitation' using errcode='22023';
  end if;
  v_phone := private.phone_key(v_item->>'phone');
  v_country := v_item->>'country';
  v_code := v_item->>'code';
  if v_phone !~ '^[1-9][0-9]{6,14}$' or v_country !~ '^[1-9][0-9]{0,2}$' or v_code !~ '^[A-Za-z0-9_-]{22}$' then
   raise exception 'Invalid invitation' using errcode='22023';
  end if;
  select id into v_holder from auth.users where phone = any(private.phone_variants(v_phone)) and phone_confirmed_at is not null
   order by id = v_uid desc, phone <> v_phone desc limit 1;
  if v_holder=v_uid or (v_holder is null and v_phone=(select private.phone_key(phone) from auth.users where id=v_uid)) then
   v_kind := 'self';
  elsif v_holder is not null and (v_holder=(select owner_id from public.plans where id=p_plan)
   or exists(select 1 from public.attendees where plan_id=p_plan and user_id=v_holder)) then
   v_kind := 'already';
  else
   if not v_host then
    if exists(select 1 from private.plan_removals r where r.series_id=v_series and (r.phone=v_phone or r.user_id=v_holder))
     or exists(select 1 from private.join_requests j where j.plan_id=p_plan and j.user_id=v_holder and j.status='waiting') then
     raise exception 'Not allowed to bring people here' using errcode='42501';
    end if;
    select * into v_live from private.phone_invitations where plan_id=p_plan and phone=v_phone and revoked_at is null;
   end if;
   if not v_host and v_live.id is not null and v_live.brought_by is distinct from v_uid then
    v_kind := 'already';
   else
    if not v_host and v_live.id is null then
     if not v_may then raise exception 'Not allowed to bring people here' using errcode='42501'; end if;
     v_new := v_new+1;
     if v_new>v_remaining then raise exception 'No invites left' using errcode='22023'; end if;
    end if;
    if v_holder is not null and private.user_eligible(v_holder) and private.used_app(v_holder)
     and exists(select 1 from public.profiles where id=v_holder)
     and not exists(select 1 from private.blocks b where b.blocker_id=v_holder and b.blocked_id=v_uid) then
     v_kind := 'app';
     insert into public.attendees(plan_id,user_id,brought_by,level) values(p_plan,v_holder,v_brought,v_level) on conflict do nothing;
     insert into private.notification_outbox(plan_id,recipient_id,kind,dedupe_key,actor_id)
      values(p_plan,v_holder,'invited','invited:'||p_plan||':'||v_holder,v_uid) on conflict do nothing;
     update private.phone_invitations set revoked_at=now(), code_hash=null
      where plan_id=p_plan and phone=v_phone and revoked_at is null;
    elsif private.number_objected(v_phone) then
     v_kind := 'unavailable';
    else
     v_kind := 'link';
     insert into private.phone_invitations(plan_id,phone,country,code_hash,invited_by,brought_by,level)
      values(p_plan,v_phone,v_country,extensions.digest(v_code,'sha256'),v_uid,v_brought,v_level)
      on conflict (plan_id,phone) do update set country=excluded.country, code_hash=excluded.code_hash, revoked_at=null,
       user_id=case when private.phone_invitations.revoked_at is null then private.phone_invitations.user_id end,
       answered_at=case when private.phone_invitations.revoked_at is null then private.phone_invitations.answered_at end,
       invited_by=case when private.phone_invitations.revoked_at is null then private.phone_invitations.invited_by else excluded.invited_by end,
       -- A host's link counts from when the host last sent it (CO-R12); a guest's sent again keeps its time.
       created_at=case when private.phone_invitations.revoked_at is null and not v_host then private.phone_invitations.created_at else excluded.created_at end,
       brought_by=excluded.brought_by, level=excluded.level;
    end if;
    if v_host then
     delete from private.plan_removals where series_id=v_series and (phone=v_phone or user_id=v_holder);
    end if;
   end if;
  end if;
  -- A guest who may not bring only sends their own links again.
  if not v_host and not v_may and v_kind in ('self','already') then raise exception 'Not allowed to bring people here' using errcode='42501'; end if;
  v_out := v_out || jsonb_build_array(jsonb_build_object('phone',private.phone_digits(v_item->>'phone'),'kind',v_kind));
 end loop;
 return v_out;
end $$;
