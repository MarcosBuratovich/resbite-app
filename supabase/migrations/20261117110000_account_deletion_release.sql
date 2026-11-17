-- Account deletion release (spec C2; decisions D-4, D-19, D-20, UGC-15, AS-R1, AS-R2 and AS-R3). Every account can
-- delete itself in the app with a fresh proof, suspended accounts too (D-19). Banned, web-only and under-18 accounts are
-- deleted by the owner with supabase/ops/delete-account.sql, which runs the same lifecycle (AS-R3). There is one request
-- path (D-4): request_account_deletion closes and erases the account in one transaction. A legal hold (UGC-15) runs only
-- the close step and parks the job as held until the hold is lifted. A deleted host's group chat stops (D-20). An
-- account's suspension moves to the suspension history (AS-R1), and the reports it filed lose only its name (AS-R2).
--
-- Hosted-compatible. Two functions exist on hosted and are redefined from their hosted bodies, with only the lines
-- named in their comments changed; grants are unchanged (create or replace keeps them):
-- private.require_tester() from 20260917190517_resbite_private_tester_foundation.sql, and
-- private.deletion_pending(uuid) from 20261022120000_gi2_guest_accounts.sql. Everything else is new on hosted.
--
-- It replaces the deletion half of the never-apply files 20260918001316_account_deletion_lifecycle.sql,
-- 20260923152943_deletion_receipt_retention.sql, 20260929125858_deletion_intent_reservations.sql and
-- 20261022120001_gi2_local_delivery_and_deletion.sql. The local replay still runs them first, so every statement here
-- also runs cleanly after them: if not exists, create or replace, and named constraints dropped and added again.
--
-- Rollback (hosted only): supabase/rollback/20261117110000_account_deletion_release.rollback.sql.

-- 1. The jobs, the legal hold, the suspension history, the September keys and the account's lock.

-- The deletion jobs: the September table (20260918001316_account_deletion_lifecycle.sql:2-13), made here on hosted.
-- A job may also be held (UGC-15): a legal hold parks it after the close step. The status the person sees still reads
-- queued.
create table if not exists private.account_deletion_jobs (
 request_id uuid primary key,
 user_id uuid not null unique,
 recovery_hash bytea not null,
 status text not null default 'queued' check(status in ('queued','processing','complete')),
 requested_at timestamptz not null default now(),
 completed_at timestamptz,
 next_attempt_at timestamptz not null default now(),
 attempts integer not null default 0,
 lease_id uuid,
 lease_until timestamptz
);
alter table private.account_deletion_jobs drop constraint account_deletion_jobs_status_check;
alter table private.account_deletion_jobs add constraint account_deletion_jobs_status_check
 check (status in ('held','queued','processing','complete'));
alter table private.account_deletion_jobs enable row level security;
revoke all on private.account_deletion_jobs from public, anon, authenticated, service_role;
create index if not exists account_deletion_pending_idx on private.account_deletion_jobs(next_attempt_at) where status<>'complete';
create index if not exists account_deletion_completed_idx on private.account_deletion_jobs(completed_at) where status='complete';

-- The objects shared with plan 6 (docs/superpowers/plans/2026-11-17-asr-6-retention-and-team-scripts.md, "Shared with
-- plan 2"), in its DDL word for word. This file runs first, on hosted and in the local replay, so it makes them; plan 6's
-- guarded DDL then finds them in place. Each is made only where absent and carries this file's marker when it is made
-- here, so each plan's rollback drops only its own.
-- A legal hold names an account or a series. For deletion it is account-scoped (UGC-15): a hold not lifted keeps the
-- account's files and Auth user until it is lifted. A series hold is for plan 6's retention jobs.
-- The suspension history keeps a suspension after it ends: lifted, or the account deleted (AS-R1). Plan 6 purges it 12
-- months after ended_at.
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
  comment on table private.legal_holds is 'resbite 20261117110000';
 end if;
 -- private.account_held(p_user uuid) returns boolean: a hold not lifted names the account (false for null).
 if pg_catalog.to_regprocedure('private.account_held(uuid)') is null then
  create function private.account_held(p_user uuid) returns boolean language sql stable security definer set search_path = '' as $fn$
   select exists(select 1 from private.legal_holds h where h.user_id = p_user and h.lifted_at is null)
  $fn$;
  comment on function private.account_held(uuid) is 'resbite 20261117110000';
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
  comment on table private.suspension_history is 'resbite 20261117110000';
 end if;
end $migration$;
create index if not exists legal_holds_user_idx on private.legal_holds(user_id) where lifted_at is null;
create index if not exists legal_holds_series_idx on private.legal_holds(series_id) where lifted_at is null;
alter table private.legal_holds enable row level security;
alter table private.suspension_history enable row level security;
revoke all on private.legal_holds, private.suspension_history from public, anon, authenticated, service_role;
revoke all on function private.account_held(uuid) from public, anon, authenticated, service_role;

-- The September keys (20260918001316_account_deletion_lifecycle.sql:18-25), the same statements, so the local replay
-- re-runs them identically. A deleted host's resbites stay for their guests with no organiser, a deleted guest's places
-- go, and a claimed invitation forgets who claimed it.
alter table public.plans alter column owner_id drop not null;
alter table public.plans drop constraint plans_owner_id_fkey;
alter table public.plans add constraint plans_owner_id_fkey foreign key(owner_id) references public.profiles(id) on delete set null;
alter table public.attendees drop constraint attendees_user_id_fkey;
alter table public.attendees add constraint attendees_user_id_fkey foreign key(user_id) references public.profiles(id) on delete cascade;
alter table private.invitations drop constraint invitations_claimed_by_fkey;
alter table private.invitations add constraint invitations_claimed_by_fkey foreign key(claimed_by) references public.profiles(id) on delete set null;

-- The worker RPCs' public wrappers run as service_role and call their private bodies. Hosted lacks this grant; the local
-- lifecycle file (20260918001316) makes it.
grant usage on schema private to service_role;

-- From 20260917190517_resbite_private_tester_foundation.sql:94-98. Two lines change: stable becomes volatile, and
-- "perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,47));" becomes the first line
-- after begin. Every mutation that checks the account then queues behind a deletion of that account, and sees it once
-- the deletion commits. This is 20260918001316_account_deletion_lifecycle.sql:37-42's body.
create or replace function private.require_tester() returns uuid language plpgsql volatile security definer set search_path = '' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,47));
 if not private.eligible() then raise exception 'Verified invited tester required' using errcode='42501'; end if;
 return auth.uid();
end $$;

-- From 20261022120000_gi2_guest_accounts.sql:60-62. One line is added, the second: a deletion job counts as being
-- deleted too. This is 20261022120001_gi2_local_delivery_and_deletion.sql:55-58's body.
create or replace function private.deletion_pending(p_user uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles p where p.id=p_user and p.deletion_requested_at is not null)
 or exists(select 1 from private.account_deletion_jobs j where j.user_id=p_user)
$$;
