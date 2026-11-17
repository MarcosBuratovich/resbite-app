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
--  (none yet)
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

-- The daily job (schedule-retention.sql). Each purge runs with a limit of 5000 in a block of its own, so one that fails
-- undoes only its own work, warns with its key and SQLSTATE, and reads null; the others still run. It logs the counts
-- and answers them: counts, never ids.
create function private.run_retention() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 v_key text;
 v_count integer;
 v_counts jsonb := '{}'::jsonb;
begin
 foreach v_key in array array['phone_invitations','plan_removals','connection_refusals','connection_requests',
  'notifications','link_opens','closed_reports','suspension_history'] loop
  begin
   execute pg_catalog.format('select private.%I($1)', 'purge_' || v_key) into v_count using 5000;
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
