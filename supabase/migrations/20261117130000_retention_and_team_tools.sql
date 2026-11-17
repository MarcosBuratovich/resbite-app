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
