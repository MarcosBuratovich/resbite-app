# Retention and Team Scripts Implementation Plan (App Store readiness plan 6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every period in the retention schedule is enforced by a daily job that a legal hold pauses. A non-user who objects is never invited by number again. The team can suspend by account id, lift a suspension, take down a photo, a cover or a resbite's words, export one person's data and set or lift a legal hold, all from owner-run scripts. The three Auth emails carry the company footer, and the weekly roll job is scheduled.

**Architecture:** One hosted-compatible migration, `supabase/migrations/20261117130000_retention_and_team_tools.sql`, in five sections: (1) the legal hold, the lifted-suspension history and the retention helpers; (2) row purges and `private.run_retention()`; (3) series purges (chats and plans), web-only and unconfirmed accounts, and the one-off leftovers; (4) the do-not-invite list and `invite_contacts`; (5) orphan profile photos (carried from the local September file) and replaced covers, with "remove now" helpers. A pg_cron script runs the purges daily and calls `cleanup-profile-photos`, which now cleans photos and covers, every 10 minutes. Twelve owner-run SQL scripts in `supabase/ops/` cover C6. The app learns one new invite answer. The three Auth templates get the footer. Hosted steps are a final owner-run section.

**Tech Stack:** PostgreSQL 17 (Supabase), plpgsql, pgcrypto (`extensions.hmac`, `extensions.digest`), Supabase Vault, pg_cron and pg_net (hosted only); Deno Edge Functions in TypeScript (node:test through tsx); Expo SDK 57 / React Native in TypeScript (node:test through tsx); Playwright for the email render check.

**Spec:** `docs/superpowers/specs/2026-11-17-app-store-readiness-design.md` (workstream C rows C3, C4, C6 and C13; decisions D-8, D-19, D-21, D-23; section 6 steps 8, 12, 14 and 15) plus `knowledge-base/08-decisions.md`, section "App Store readiness (AS), 17 November 2026" (AS-D1, AS-D3, AS-D8, AS-R1, AS-R3, AS-R4, AS-R6, AS-R7), which overrides the spec where they differ. The detailed requirements are in the internal records this plan makes true: `docs/compliance/retention-schedule.md` (every table), `docs/compliance/data-requests.md` sections 4.3, 5, 6 and 10.2, `docs/compliance/law-enforcement-requests.md` section 11, `docs/compliance/legitimate-interests.md` LI-4, and `docs/legal/privacy-notice.md` section 10 ("Your right to object").

**Branch:** `asr-6-retention`, cut from `app-store-readiness` after plan 2's migration (its Tasks 1 to 4) has merged, and merged back in the roadmap's order (`docs/superpowers/plans/2026-11-17-asr-0-roadmap.md`); or `app-store-readiness` itself when nothing else is being built. Task 8 needs plan 4's Task 1 merged. Tasks 10 and 11 may start at once. Commit and push are allowed; merging to `main` is the owner's choice.

**Tasks:** 12, then the owner-run rollout. Tasks 1 to 5 build the one migration in order. Task 6 needs Task 5. Tasks 7 and 8 need Tasks 1 to 5. Task 9 needs Tasks 1 to 8. Tasks 10 and 11 stand alone. Task 12 comes last.

## Global Constraints

- **Hosted steps are owner-run** and each needs the owner's explicit approval at the time: Supabase (SQL, migration history, functions, secrets, Vault, cron, Auth templates), Vercel, EAS, TestFlight and App Store Connect. The migration is approved by file name and sha256. Never `supabase db push`, never `supabase migration repair --status reverted`, never `supabase db pull`. The apply pattern is the open beta's (`supabase/migrations/20261116120000_open_beta.sql`, its rollback in `supabase/rollback/`, its rehearsal pair in `supabase/tests/hosted-baseline/`, and the hash-guarded script shape in `qa/chat-release/README.md:430-452`): a script that checks the sha256, runs `supabase db query --linked -f` on the file wrapped in `begin;`/`commit;` with a guard first, then `supabase migration repair --status applied 20261117130000 --linked --yes`, with before and after snapshots from `supabase/ops/hosted-fingerprint.sql` and `supabase/ops/hosted-counts.sql`, recorded in `qa/retention-and-team-tools-2026-11-17/README.md`.
- **Hosted-compatible migration.** A redefined function copies the body of its latest definition among the files that run before this one on hosted (the last file in `supabase/tests/hosted-baseline/migrations.txt` that defines it, or a pending candidate before this one, such as plan 2's) and changes only the lines this plan names. Objects that may already exist (shared with plan 2, or carried from the local-only `20260923152816_orphan_profile_photo_cleanup.sql`) are made under `pg_catalog.to_regprocedure` or `to_regclass` guards or with `if not exists`, so the file runs on the hosted baseline and in the full local replay. Each object this migration creates gets `comment on … is 'resbite 20261117130000'`, so the rollback drops only its own.
- **Every migration change has a rollback, a rehearsal and tests:** `supabase/rollback/20261117130000_retention_and_team_tools.rollback.sql`; `supabase/tests/hosted-baseline/20261117130000_retention_and_team_tools.before.sql` and `.after.sql`; `supabase/tests/retention.sql` and `supabase/tests/team-scripts.sql`. Read `supabase/README.md` first.
- **Locks and grants.** A new table: row security on, no policy, `revoke all` from `public, anon, authenticated, service_role`. A new function: `revoke all` from the same four before any grant. Purge functions get no grant (pg_cron runs them as `postgres`). Only the `public` worker wrappers are granted, to `service_role` alone.
- **A legal hold pauses deletion** of the records it names, and nothing else. Every purge, both workers and both removal scripts skip held records. A hold names an account or a series. A series is "under hold" when it is named, or when a held account owns one of its occurrences, has a guest row on one, or wrote in its chat.
- **Counts, never ids, in logs.** `run_retention` logs and returns counts only. Ops scripts print ids and counts at most, never a phone number or an email. The export is the one exception: its output holds the person's own data and goes outside the repo.
- **Ops scripts** are plain SQL for the dashboard SQL editor, or `supabase db query --linked -f` on a private copy outside the repo. Each has one literal at the top to edit, in the copy only, runs as one statement, and uses no psql meta-commands. Logic that needs locks or several steps lives in a migration function that the script calls once.
- **Never write secrets, real phone numbers, emails of real people or account ids into the repo.** Fixtures use `447700900xxx` (Ofcom's drama range) and `@resbite-test.invalid`. Never create `mobile/.env.local`. No service-role key in the app. The do-not-invite key is made inside the database and never leaves it. Blocked terms and moderator emails never go in the repo.
- **Copy** in the app and the emails: plain British English, short sentences, the apostrophe as ’ (U+2019) in app copy. The public documents are called "Privacy Policy", "Terms of Use", "Support" and "Delete your account".
- **Commands.** SQL: `./scripts/test-database-docker.sh` (full) and `./scripts/test-database-docker.sh --hosted-baseline <candidates…>`. App: `cd mobile && npm test` and `cd mobile && npx tsc --noEmit` (the suite is node:test through tsx, not jest). Worker: `node --import ./mobile/node_modules/tsx/dist/loader.mjs --test supabase/functions/_shared/*.test.ts` from the repo root. Templates: `node --test supabase/templates/templates.test.mjs`.
- **Expo SDK 57** (`mobile/package.json:20`). This plan changes no Expo config and no native module; the app change is TypeScript only.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Shared with plan 2 (the deletion release, C2)

Plan 2 was written at the same time and was not visible when this plan was written. So this plan defines the legal hold itself, as the task allowed, with guarded DDL that changes nothing where an identical object already exists. **Cross-checked on 17 November 2026 (roadmap `docs/superpowers/plans/2026-11-17-asr-0-roadmap.md`):** plan 2 (`2026-11-17-asr-2-account-deletion.md`, Task 1) uses exactly these names and shapes, word for word, with the partial indexes named `legal_holds_user_idx` and `legal_holds_series_idx`. Plan 2's migration (`20261117110000`) runs first, on hosted and in the local replay, so **plan 2 owns `private.legal_holds`, `private.account_held(uuid)` and `private.suspension_history`**; this plan's guarded DDL (same index names) finds them in place and makes only `private.series_held(uuid)`. Its rollback drops only what carries its own comment marker.

Defined here, created only where absent, marked with the comment:

```sql
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
-- private.account_held(p_user uuid) returns boolean: a hold not lifted names the account (false for null).
-- private.series_held(p_series uuid) returns boolean: a hold not lifted names the series (false for null).
create table if not exists private.suspension_history (
 id bigint generated always as identity primary key,
 user_id uuid null,          -- null once the account is deleted (AS-R1)
 report_id bigint null,
 suspended_at timestamptz not null,
 ended_at timestamptz not null,
 how text not null check (how in ('lifted','account_deleted'))
);
```

Plan 2 uses them: its deletion checks `private.account_held` before erasing, and, for an account deleted while suspended (AS-R1), moves the `private.suspensions` row into `private.suspension_history` with `user_id` null, `how` `'account_deleted'` and `ended_at` the deletion time. This plan purges `suspension_history` 12 months after `ended_at`.

Consumed from plan 2, whose migration runs before this one:
- `private.account_deletion_jobs` with `user_id` and `status`, from `20260918001316_account_deletion_lifecycle.sql` as plan 2 reworks it;
- `private.guard_photo_write()` and the trigger `resbite_photo_write_guard` on `storage.objects` (`20260918001316_account_deletion_lifecycle.sql:134-142`);
- `private.operator_account_deletion(p_user uuid) returns jsonb`: AS-R3's owner-run route as a function, which queues the same deletion as the in-app request for an account that cannot sign in.

Where plan 2 already carries `20260923152816_orphan_profile_photo_cleanup.sql`, Task 5 copies plan 2's bodies as its bases and adds only its named lines.

## Decisions this plan makes

1. **The legal hold lives here** (above), with a hold per account or per series, a reason code from `law-enforcement-requests.md` section 11.2, a case reference and a review date. A hold reaches a series' context: what a held person hosted, joined or wrote in stays whole.
2. **An answered phone invitation stays until 30 days after its resbite ends.** The personal link lets the person change their answer until the end (`answer_phone_invitation`, `supabase/migrations/20261111130000_circles_of_trust.sql:469-470`), and once answered the number belongs to the person's own account. A revoked row goes at the next run. This is the code reading of "until answered or revoked" (D-8), recorded in the schedule by Task 12.
3. **When a series ends.** `private.series_end(series)` is null while the roll can still add an occurrence (its current occurrence keeps a repeat rule and the group has not stopped with its chat closed, the roll's own rules at `supabase/migrations/20261111150000_chat_groups.sql:422-440`); otherwise it is the current occurrence's end. A running weekly group is never purged as a whole.
4. **Every purge checks the hold**, including stores the schedule marks "—". That is a superset of the schedule, and Task 12 updates its "Hold" column.
5. **A lifted suspension leaves `private.suspensions`** and moves to `private.suspension_history` for 12 months, as the existing undo deletes the row. So `supabase/ops/suspend-account.sql` stays unchanged and a later suspension starts a fresh row.
6. **The do-not-invite key is in Vault** (`invite_objection_key`), made inside the database by the first objection with 32 random bytes, and never displayed. `invite_contacts` reads it only when the list holds an entry, so nothing changes until the first objection.
7. **The host sees "Can’t be invited by link: Ana".** `invite_contacts` answers a new kind, `'unavailable'`, for a listed number that would have taken the link path, and stores nothing for it. A user who holds that number is still invited in the app (LI-4). Builds before this one show "Check your connection and try again." for a batch holding such a number (Known gaps).
8. **Covers ride the photo worker.** `cleanup-profile-photos` cleans `profile-photos`, then `plan-covers`: one deploy, one secret, one schedule. A cover is orphaned when no plan's `cover_path` names it, and it waits 7 days observed, as photos do.
9. **Takedown.** `remove-profile-photo.sql` and `remove-resbite-content.sql` hide at once and queue the file for the next worker run (within 10 minutes), which meets the 48-hour standard (D-21). Under a hold they hide and keep the file ("hide and preserve", `law-enforcement-requests.md` section 11.3).
10. **The tester roster and the legacy invitations are emptied once, in the migration**, after every disabled roster row becomes a revoked grant, so nobody suspended that way gets back in. `private.phone_rewrites` waits for the C12 decision (an owner step).
11. **Web-only accounts (AS-R4).** The job queues plan 2's operator deletion for an account with a profile, a confirmed phone, no email, no app session, more than 12 months old and with no resbite in the last 12 months. An Auth user that never confirmed anything and has no profile goes after 30 days.
12. **The export** is one owner-run script that prints `export` (the JSON to send) and `files` (the Storage paths to download). The JSON holds no id but the person's own, numbers only as their last two digits, the person's own messages only, and never a reporter or a hidden choice about the person (`data-requests.md` sections 5 and 6).
13. **The email footer** names Resbite Ltd, the company number, the registered office, support@resbite.com and links the Privacy Policy. It has no VAT line while the VAT placeholder is open. The templates are pasted only once `/privacy` is live.

## Review Focus

1. **A legal hold on a person.** Expected: every purge, both workers and both removal scripts leave that person's records and every series they hosted, joined or wrote in untouched. Once the hold is lifted, the next run takes what is overdue. Tests: Tasks 2, 3, 5 and 7, each with a held twin, and Task 2's lift-then-run check.
2. **A weekly group that keeps rolling.** Expected: none of its occurrences, guests or removal records go, however old its first occurrence is. Only messages older than 12 months go, and the chat's count, last line and pin stay right after. Test: Task 3.
3. **A host invites a listed number among others.** Expected: that one reads "Can’t be invited by link", the others are invited as before, nothing is stored for it, and a person on Resbite with that number is still invited in the app. Tests: Tasks 4 and 10.
4. **An export for someone who reported and was reported, wrote in a shared chat, and was blocked and refused.** Expected: their own words are there. No other person's words, no reporter, no block or refusal of them, no id but their own, and other people's numbers only as endings. Test: Task 8.
5. **A cover shared by several occurrences, or re-attached after removal.** Expected: removal clears it from every occurrence and queues the file once. Re-attaching a retired path is refused with "Cover retired; choose a new photo". A cover any occurrence still uses is never observed. Tests: Tasks 5 and 7.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `supabase/migrations/20261117130000_retention_and_team_tools.sql` | Create | The one migration, sections 1 to 5 |
| `supabase/rollback/20261117130000_retention_and_team_tools.rollback.sql` | Create | Undo, section 5 first |
| `supabase/tests/hosted-baseline/20261117130000_retention_and_team_tools.before.sql`, `.after.sql` | Create | Rehearsal on the hosted baseline |
| `supabase/tests/retention.sql` | Create | Migration tests, slices 1 to 5 |
| `supabase/tests/team-scripts.sql` | Create | Tests of the C6 scripts and the export |
| `supabase/tests/local/bootstrap.sql` | Modify | Harness: `auth.users` dates, `auth.identities`, session columns, a Vault stub |
| `supabase/ops/schedule-retention.sql` | Create | The two cron jobs |
| `supabase/ops/suspend-account-by-id.sql`, `lift-suspension.sql` | Create | Suspend by account id; lift after appeal |
| `supabase/ops/set-legal-hold.sql`, `lift-legal-hold.sql`, `legal-holds.sql` | Create | The hold register in the database |
| `supabase/ops/remove-profile-photo.sql`, `remove-resbite-content.sql` | Create | Takedown |
| `supabase/ops/export-account.sql`, `export-number.sql` | Create | Data requests (A16) |
| `supabase/ops/object-number.sql`, `withdraw-objection.sql` | Create | The do-not-invite list (D-23) |
| `supabase/functions/_shared/profile-photo-cleanup.ts`, `profile-photo-cleanup-gateway.ts`, `profile-photo-cleanup.test.ts` | Modify | Photos and covers; the `held` answer |
| `supabase/functions/cleanup-profile-photos/index.ts` | Modify | Two targets; its source gate flips only at rollout R5, in an owner-approved commit |
| `mobile/src/services/contactInvites.ts`, `contactInvites.test.ts`, `mobile/src/state/useContactInvites.ts`, `mobile/src/design/ContactPicker.tsx`, `mobile/src/domain/inviteCopy.ts`, `inviteCopy.test.ts` | Modify | The `unavailable` answer on Invite people |
| `supabase/templates/confirmation.html`, `email-code.html`, `recovery.html`, their `.previous.html`, `README.md` | Modify | C13 |
| `supabase/templates/templates.test.mjs` | Create | Static template checks |
| `mobile/scripts/verify-emails.mjs`, `mobile/package.json` | Modify | The render check allows the privacy link; the suite runs the template test |
| `qa/retention-and-team-tools-2026-11-17/README.md` | Create | Rollout runbook with hashes and scripts |
| `docs/compliance/retention-schedule.md`, `data-requests.md`, `law-enforcement-requests.md`, `supabase/README.md`, `qa/app-store-release/README.md`, `docs/implementation-status.md`, `knowledge-base/08-decisions.md` | Modify | Records |

---

### Task 1: Harness stubs and migration section 1 (the legal hold and the helpers)

**Files:**
- Modify: `supabase/tests/local/bootstrap.sql:9-10` (the two `auth` tables), and append a Vault stub
- Create: `supabase/migrations/20261117130000_retention_and_team_tools.sql` (header and section 1)
- Create: `supabase/rollback/20261117130000_retention_and_team_tools.rollback.sql` (section 1's undo, at the bottom; later tasks add theirs above it)
- Test: `supabase/tests/retention.sql` (slice 1)

**Interfaces:**
- Consumes: `private.current_occurrence(p_series uuid) returns public.plans` (`supabase/migrations/20261111140000_chat_core.sql:122-127`); `private.plan_end(timestamptz, timestamptz)` (`20261031120000_creating_a_resbite.sql:47-49`); `private.group_stopped(uuid)` (`20261111150000_chat_groups.sql:72-76`); `private.chat_open(uuid)` (`:225-229`).
- Produces:
  - Harness: `auth.users` gains `created_at timestamptz not null default now()` and `last_sign_in_at timestamptz`; `auth.sessions` gains `updated_at timestamptz`, `user_agent text`, `ip inet`; `auth.identities` has the columns `id uuid primary key default gen_random_uuid(), provider_id text, user_id uuid not null references auth.users(id) on delete cascade, identity_data jsonb not null default '{}', provider text not null, last_sign_in_at timestamptz, created_at timestamptz not null default now(), email text`. Plan 1 (`docs/superpowers/plans/2026-11-17-asr-1-phone-codes.md`, Task 5) adds `auth.refresh_tokens` and, unless this task has, this same full `auth.identities` shape (aligned by the cross-plan review): whichever lands first makes it, and the other adds nothing. If an older, narrower `auth.identities` line is there, add only the missing columns. Then schema `vault` with table `vault.secrets(id uuid primary key default gen_random_uuid(), name text unique, description text not null default '', secret text not null, created_at timestamptz not null default now())`, view `vault.decrypted_secrets(id, name, description, decrypted_secret, created_at)` over it, and `vault.create_secret(new_secret text, new_name text default null, new_description text default '') returns uuid`. The hosted Vault has the same first three parameters.
  - `private.legal_holds`, `private.account_held(uuid)`, `private.series_held(uuid)` and `private.suspension_history`, exactly as "Shared with plan 2" gives them, each made only when absent, with partial indexes `legal_holds_user_idx` on `(user_id)` and `legal_holds_series_idx` on `(series_id)`, both `where lifted_at is null` (plan 2's names). Both functions: `language sql stable security definer set search_path = ''`.
  - `private.series_under_hold(p_series uuid) returns boolean`: `private.series_held(p_series)`, or a held account owns an occurrence of the series, has a guest row on one, or authored a `public.messages` row in it.
  - `private.series_end(p_series uuid) returns timestamptz`: Decision 3. Null for a series with no plan.
  - No API role may execute any of the four, or touch either table.

- [ ] **Step 1: Write the harness change and the failing slice 1**

  Bootstrap: the edits above, nothing else. `supabase/tests/hosted-baseline/20261030130000_phone_key.before.sql:18` already skips its own `auth.identities` stand-in when one exists. If plan 1 has already added a Vault stub, keep one, with the columns above.

  `supabase/tests/retention.sql` opens with the header comment (what it tests; synthetic ids `a6000000-0000-4000-8000-0000000000NN` through `pg_temp.a6(text)`, emails `r6-…@resbite-test.invalid`, numbers `4477009006NN`), `begin;`, the helpers `pg_temp.r6_check(p_ok boolean, p_what text)` (raises `p_what` when not true) and `pg_temp.r6_refused(p_sql text, p_state text)` (as `pg_temp.s3_refused_state`, `supabase/tests/chat-safety.sql:798-806`), and ends with `rollback;`. Fixtures follow `supabase/tests/open-beta.sql:7-26`. Slice 1 checks:

  ```sql
  -- holds_locked
  r6_check(not has_table_privilege(r,'private.legal_holds','select,insert,update,delete')
           and not has_table_privilege(r,'private.suspension_history','select,insert,update,delete'), …)  -- for each of anon, authenticated, service_role
  r6_check(not has_function_privilege(r,f,'execute'), …)  -- each of the four functions, for each role
  -- hold_scope: a hold on account 01 (reason 'police', case 'LE-2026-001', review_on current_date+90)
  r6_check(private.account_held(a6('01')) and not private.account_held(a6('02')) and not private.account_held(null), 'account hold')
  -- after update … set lifted_at=now(): account_held(01) is false; a hold on series S1: series_held(S1) true
  r6_refused($$insert into private.legal_holds(user_id,series_id,reason,case_ref,review_on) values (…both…)$$,'23514')
  r6_refused($$insert into private.legal_holds(user_id,reason,case_ref,review_on) values (…,'other',…)$$,'23514')
  -- series_under_hold_reaches_context: one-off S2 owned by 02, guest 03; 04 wrote a message in S2
  --   no hold: false; hold on 03: true; lift, hold on 04: true; lift, hold on 02: true
  -- series_end
  --   one-off ended 2 days ago: = its ends_at; weekly (repeat_weeks 1) current occurrence active: null
  --   weekly whose current occurrence has repeat_weeks null and ended 3 days ago: = that end; unknown uuid: null
  ```

- [ ] **Step 2: Run it and see it fail**

  Run: `./scripts/test-database-docker.sh`
  Expected: FAIL at slice 1 (`relation "private.legal_holds" does not exist` or the first check), since the migration is not written.

- [ ] **Step 3: Write the migration's header and section 1**

  Header comment: what the migration does (one line per section), that it is hosted-compatible and needs plan 2's migration first, the rollback's path, and the bases list (filled in by later tasks). Section 1 makes the shared objects inside one `do $migration$ … $migration$` block that creates each only when `to_regclass`/`to_regprocedure` finds nothing, and comments what it made. Then `series_under_hold` and `series_end`, their revokes and comments.

  Rollback, section 1 (bottom of the file): drop `series_end` and `series_under_hold`; drop `account_held`, `series_held`, `legal_holds` and `suspension_history` only when `pg_catalog.obj_description` reads `resbite 20261117130000`.

- [ ] **Step 4: Run it and see it pass**

  Run: `./scripts/test-database-docker.sh`
  Expected: `PASS: retention.sql`, every other line still PASS, and the last line `PASS: disposable SQL assertions (full); synthetic roster empty. …`.

- [ ] **Step 5: Commit**

  ```bash
  git add supabase/tests/local/bootstrap.sql supabase/migrations/20261117130000_retention_and_team_tools.sql \
    supabase/rollback/20261117130000_retention_and_team_tools.rollback.sql supabase/tests/retention.sql
  git commit -m "Retention plan 6: the legal hold and the retention helpers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

### Task 2: Section 2, the row purges and `run_retention`

**Files:**
- Modify: `supabase/migrations/20261117130000_retention_and_team_tools.sql` (section 2), the rollback (section 2's undo)
- Test: `supabase/tests/retention.sql` (slice 2)

**Interfaces:**
- Consumes: Task 1's four functions; `private.report_keep_days()` (`20261111160000_chat_safety.sql:840`); `private.deletion_pending(uuid)`; the tables at `20261028120000_contact_invitations.sql:12-26` (`phone_invitations`, with `brought_by` and `level` from circles), `20261111130000_circles_of_trust.sql:45-51` (`plan_removals`), `20261110120000_connections.sql:11-23` and `:35-42` (`connections`, `connection_refusals`), `20260917190517_resbite_private_tester_foundation.sql:72-81` with `20261030120000_push_delivery.sql:19-33` (the outbox and its delivery rows, `on delete cascade`), `20261022120000_gi2_guest_accounts.sql:138-143` (`link_opens`), `20261111160000_chat_safety.sql:763-786` (`reports`).
- Produces, each `(p_limit integer default 5000) returns integer`, plpgsql, `security definer set search_path = ''`, no grant, deleting at most `p_limit` rows and returning how many it deleted or changed:
  - `private.purge_phone_invitations`: a row with `revoked_at` set, or whose plan's `private.plan_end(starts_at, ends_at) + interval '30 days' < now()` (Decision 2). Skips a row whose plan's series is under hold, or whose `invited_by`, `brought_by` or `user_id` is held.
  - `private.purge_plan_removals`: a row whose series has no plan left; or whose `private.series_end(series_id)` plus 30 days (a one-off: one plan, `repeat_weeks` null) or plus 90 days (any other series) is past. Skips a series under hold and a held `user_id`.
  - `private.purge_connection_refusals`: `refused_at < now() - interval '12 months'`. Skips a held `from_user` or `to_user`.
  - `private.purge_connection_requests`: `public.connections` with `state = 'requested'` and `created_at < now() - interval '90 days'`. Skips a held `user_a` or `user_b`.
  - `private.purge_notifications`: outbox rows with `coalesce(delivered_at, created_at) < now() - interval '30 days'`, except an `'invited'` row whose recipient still has a `'pending'` guest row on that plan (DI-09). Skips a held `recipient_id` or `actor_id`. Delivery rows go by cascade.
  - `private.purge_link_opens`: `opened_at < now() - interval '12 months'`. No hold check: a row identifies nobody.
  - `private.purge_closed_reports`: the two steps of `supabase/ops/purge-closed-reports.sql:9-19` (delete what is due; forget `target_user_id` and `frozen_author` on the other closed reports whose account is gone or leaving), skipping a report whose `reporter_id`, `target_user_id` or `frozen_author` is held or whose `series_id` is held. Returns deleted plus cleared.
  - `private.purge_suspension_history`: `ended_at < now() - interval '12 months'`. Skips a held `user_id`.
  - `private.run_retention() returns jsonb`, plpgsql, definer, no grant: runs each purge with `p_limit` 5000 inside its own `begin … exception when others` block; a failure raises `warning 'resbite retention: % failed (%)'` with the key and `sqlstate`, and gives that key JSON `null`. It ends with `raise log 'resbite retention: %'` and returns `{"phone_invitations": n, "plan_removals": n, "connection_refusals": n, "connection_requests": n, "notifications": n, "link_opens": n, "closed_reports": n, "suspension_history": n}`. Task 3 adds four keys.

- [ ] **Step 1: Write the failing slice 2**

  One fixture set, then each purge called directly. Each line is an `r6_check`:

  ```sql
  -- grants: no API role may execute any purge or run_retention
  -- phone_invitations (host 01; non-user numbers 447700900601…605)
  --   revoked row on a future plan: gone; unanswered row on a plan ended 31 days ago: gone
  --   answered row on a plan ended 29 days ago: kept; row on a plan ended 31 days ago invited by held 05: kept
  --   lift 05's hold, call again: that row is gone (the lift-then-run check)
  -- plan_removals
  --   number row on a one-off ended 31 days ago: gone; ended 29 days ago: kept
  --   weekly series, current occurrence repeat_weeks null and ended 60 days ago: kept; ended 91 days ago: gone
  --   a row whose series has no plan: gone; a row on a series held by series_id: kept
  -- connection_refusals: 13 months old: gone; 11 months: kept; 13 months with a held to_user: kept
  -- connection_requests: requested 91 days ago: gone; requested 89 days: kept; connected 2 years ago: kept
  -- notifications
  --   'rsvp' delivered 31 days ago: gone, with its delivery row
  --   'invited' created 31 days ago, recipient still 'pending' on that plan: kept; recipient 'accepted': gone
  --   a row 31 days old whose recipient is held: kept
  -- link_opens: opened 13 months ago: gone; 11 months: kept
  -- closed reports: closed 181 days ago: gone; 179 days: kept; open since 2 years: kept
  --   closed 181 days with a held target: kept; closed 10 days about a leaving profile: target and frozen_author null
  -- suspension_history: ended 13 months ago: gone; 11 months: kept
  -- bounds: two due link opens and purge_link_opens(1) returns 1 and leaves one
  -- run_retention(): returns exactly the eight keys, each a number (jsonb_typeof 'number')
  ```

- [ ] **Step 2: Run it and see it fail**

  Run: `./scripts/test-database-docker.sh`
  Expected: FAIL in slice 2 with `function private.purge_phone_invitations(integer) does not exist`.

- [ ] **Step 3: Write section 2 and its undo**

  The nine functions with their revokes and comments. Undo: drop the nine.

- [ ] **Step 4: Run it and see it pass**

  Run: `./scripts/test-database-docker.sh`
  Expected: `PASS: retention.sql` and the final PASS line.

- [ ] **Step 5: Commit**

  ```bash
  git add supabase/migrations/20261117130000_retention_and_team_tools.sql \
    supabase/rollback/20261117130000_retention_and_team_tools.rollback.sql supabase/tests/retention.sql
  git commit -m "Retention plan 6: the row purges and the daily run" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

### Task 3: Section 3, chats and plans, web-only and unconfirmed accounts, the one-off leftovers

**Files:**
- Modify: the migration (section 3), the rollback (section 3's undo)
- Test: `supabase/tests/retention.sql` (slice 3)

**Interfaces:**
- Consumes: Task 1's helpers; `private.chat_is_group(uuid)` (`20261111140000_chat_core.sql:172-174`); `private.chat_closes_at(uuid)` (`20261111150000_chat_groups.sql:211-219`); the newest-row rule of `private.chat_hide_line` (`:51-66`: the newest row that is not a `'system'` row in state `'deleted'`); `private.used_app(uuid)` (`20261027120000_phone_accounts.sql:317-319`); plan 2's `private.operator_account_deletion(uuid)`.
- Produces:
  - `private.purge_chats(p_limit integer default 5000) returns integer` (messages deleted). First it locks each affected `public.chats` row `for update` in `series_id` order, before any message row (H28, as `request_account_deletion` does, `20261116120000_open_beta.sql:258-264`).
    - **A one-off** (not a group) whose `coalesce(private.chat_closes_at(s), private.plan_end(c.starts_at, c.ends_at) + interval '48 hours') + interval '90 days' < now()`, `c` its current occurrence: its messages, `public.chat_reads` and `public.chat_mutes` go, and its `public.chats` row becomes `message_count 0`, `last_message_id`, `last_message_at` and `pinned_message_id` null.
    - **A group:** messages with `created_at < now() - interval '12 months'` go. Then `message_count` is the count of `state = 'sent'` messages and announcements left; `last_message_id` and `last_message_at` are the newest row left by `chat_hide_line`'s rule; `pinned_message_id` is null when its message is gone. Every older announcement is older still, so null is right.
    - Skips a series under hold. A report's `message_id` goes null by its foreign key, and its frozen words stay.
  - `private.purge_plans(p_limit integer default 200) returns integer` (plans deleted; the limit counts series). For each series whose `series_end + interval '12 months' < now()` and is not under hold: `delete from public.plans where series_id = s` in one statement, so `repeats_from` never blocks it, and the cascade takes guests, meeting details, co-hosts, join requests, links and their opens, phone invitations, messages and outbox rows. Then `public.plan_mutes`, `private.series_leaves`, `public.chat_reads`, `public.chat_mutes` and the `public.chats` row of `s`. Cover files become orphans for Task 5's worker.
  - `private.dormant_web_accounts(p_limit integer default 100) returns setof uuid` (Decision 11): a profile; `auth.users.email` null; `phone_confirmed_at` set; `not private.used_app(id)`; `not private.deletion_pending(id)`; not held; `created_at < now() - interval '12 months'`; and in the last 12 months no owned plan, no guest row on a plan whose `plan_end` is later than `now() - interval '12 months'`, no join request made, and no phone invitation answered.
  - `private.purge_web_accounts(p_limit integer default 100) returns integer`: for each dormant account, `execute 'select private.operator_account_deletion($1)' using id`. When `pg_catalog.to_regprocedure('private.operator_account_deletion(uuid)')` is null it raises `55000 'Operator deletion missing'`, so the run shows `null` for the key and a warning, never a silent skip.
  - `private.purge_unconfirmed_accounts(p_limit integer default 5000) returns integer`: deletes `auth.users` rows with `email_confirmed_at` and `phone_confirmed_at` both null, `not coalesce(is_anonymous, false)`, `created_at < now() - interval '30 days'`, no profile, and not held.
  - `run_retention` gains `"plans"`, `"chats"`, `"web_accounts"` and `"unconfirmed_accounts"`. It runs `plans` first, then `chats`, then Task 2's eight in their order, then the two account purges.
  - **One-off data steps**, at the end of section 3, not functions:
    1. For every `private.tester_roster` row with `enabled = false` whose email belongs to an Auth user: `insert into private.beta_access(user_id, source, revoked_at) values (u.id, 'maintainer', now()) on conflict (user_id) do update set revoked_at = coalesce(private.beta_access.revoked_at, now())`. On that user's `private.suspensions` row with `roster = true`, set `roster = false`, `grant_at` to the grant's `revoked_at`, and `grant_made = true` only when no grant row existed before. So the undo at `supabase/ops/suspend-account.sql:37-49` still restores exactly what the suspension changed.
    2. `delete from private.tester_roster;`
    3. `delete from private.invitations;`

    Nothing else changes: `private.access_suspended` (`20261116120000_open_beta.sql:24-30`) still reads the empty roster, and `suspend-account.sql` stays as it is.

- [ ] **Step 1: Write the failing slice 3**

  ```sql
  -- chats, one-off: closed 91 days ago (ended 93 days + 48 h): messages, reads, mutes gone; chats row 0/null/null/null;
  --   a report on one of its messages keeps frozen_body and has message_id null
  --   closed 89 days ago: all kept; closed 91 days ago with a message by held 07: all kept
  -- chats, group (weekly, running): a message 13 months old gone, 11 months kept;
  --   message_count = (select count(*) … state='sent' and kind in ('message','announcement'));
  --   an announcement 13 months old that was pinned: pinned_message_id null; last_message_id = newest row left
  -- plans: one-off ended 13 months ago: plan, guests, meeting details, phone invitations, messages, outbox,
  --   plan_mutes, series_leaves, chat_reads, chat_mutes and the chats row all gone
  --   one-off ended 11 months ago: kept; weekly whose first occurrence ended 13 months ago and still rolls
  --   (owner eligible, repeat_weeks 1): every occurrence kept; one-off ended 13 months ago with held guest 03: kept
  -- dormant_web_accounts: returns web account 10 (created 13 months ago, guest on a plan ended 13 months ago)
  --   not 11 (guest on a plan ended 11 months ago), not 12 (app_sessions row), not 13 (an email),
  --   not 14 (held), not 15 (created 11 months ago)
  -- purge_web_accounts: when to_regprocedure('private.operator_account_deletion(uuid)') is null at the slice's start,
  --   it raises 55000 'Operator deletion missing'; then (or when it exists) a stub is created inside the transaction only
  --   if it is still missing, recording its argument in a temp table; after purge_web_accounts(): 10 was passed to the
  --   stub, or private.deletion_pending(a6('10')) is true (plan 2's real function)
  -- unconfirmed: no profile, nothing confirmed, 31 days old: gone; 29 days: kept; phone confirmed 31 days, no profile:
  --   kept; anonymous 31 days: kept; held 31 days: kept
  -- run_retention(): exactly twelve keys
  ```

  The one-off data steps ran at migration time on empty tables. Task 9's rehearsal tests them on fixtures.

- [ ] **Step 2: Run it and see it fail**

  Run: `./scripts/test-database-docker.sh`
  Expected: FAIL in slice 3 with `function private.purge_chats(integer) does not exist`.

- [ ] **Step 3: Write section 3 and its undo**

  Undo: drop the five functions (`run_retention` goes with section 2's undo). Add the note that the rollback restores neither the roster rows nor the legacy invitations.

- [ ] **Step 4: Run it and see it pass**

  Run: `./scripts/test-database-docker.sh`
  Expected: `PASS: retention.sql`, `PASS: photo-cleanup.sql`, `PASS: open-beta.sql`, and the final line reading `synthetic roster empty`.

- [ ] **Step 5: Commit**

  ```bash
  git add supabase/migrations/20261117130000_retention_and_team_tools.sql \
    supabase/rollback/20261117130000_retention_and_team_tools.rollback.sql supabase/tests/retention.sql
  git commit -m "Retention plan 6: chats, plans, web-only and unconfirmed accounts, the roster and legacy invitations" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

### Task 4: Section 4, the do-not-invite list

**Files:**
- Modify: the migration (section 4), the rollback (section 4's undo)
- Create: `supabase/ops/object-number.sql`, `supabase/ops/withdraw-objection.sql`
- Test: `supabase/tests/retention.sql` (slice 4)

**Interfaces:**
- Consumes: `private.phone_key(text)` (`20261030130000_phone_key.sql:12-14`); the base body of `private.invite_contacts(uuid, jsonb)`, today `supabase/migrations/20261111160000_chat_safety.sql:580-723` (sha256 of that file `f8cfb5a62783528636aae2b8c461f150f8ae8f0553219d42b4b991bf66f2a2b2`); the Task 1 Vault stub.
- Produces:
  - `private.invite_objections (key_hash bytea primary key, objected_at timestamptz not null default now())`. No number, no name, no inviter.
  - `private.objection_key_hash(p_phone text) returns bytea`: `extensions.hmac(private.phone_key(p_phone), <secret>, 'sha256')`, the secret read from `vault.decrypted_secrets` where `name = 'invite_objection_key'`. Raises `55000 'Objection key missing'` when there is none. plpgsql, stable, definer, no grant.
  - `private.ensure_objection_key() returns boolean`: when there is no secret, `vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'invite_objection_key', 'Keyed hash for the do-not-invite list')`, and returns true; otherwise false. No grant.
  - `private.number_objected(p_phone text) returns boolean`: false at once when `private.invite_objections` is empty (Vault is not read); otherwise whether `objection_key_hash(p_phone)` is listed. No grant.
  - `private.record_objection(p_phone text) returns jsonb`: refuses `22023 'Invalid number'` unless `private.phone_key(p_phone) ~ '^[1-9][0-9]{6,14}$'`; calls `ensure_objection_key()`; inserts the hash `on conflict do nothing`; deletes every `private.phone_invitations` row and every `private.plan_removals` number row with that key, for every host, except rows under hold (the plan's series under hold, or a held `invited_by` or `brought_by`). Returns `{"already_listed": bool, "invitations_deleted": n, "removals_deleted": n, "held_kept": n}`. No grant.
  - `private.withdraw_objection(p_phone text) returns boolean`: deletes the entry and returns whether one was deleted. No grant.
  - `private.invite_contacts` redefined, `create or replace` (its grants and the `public` wrapper unchanged), with **one named edit** to the phone branch's choice (chat_safety.sql:701-702):

    old:
    ```
        else
         v_kind := 'link';
    ```
    new:
    ```
        elsif private.number_objected(v_phone) then
         v_kind := 'unavailable';
        else
         v_kind := 'link';
    ```
    A listed number that would have taken the link path answers `'unavailable'`: no phone invitation row, no guest row, no notice. The `'self'`, `'already'` and `'app'` answers come first and are unchanged, so a Resbite user with that number is still invited in the app (LI-4).
  - `supabase/ops/object-number.sql`: header (owner-run; only after the phone check in `docs/compliance/data-requests.md` section 4.3 passed; the number goes in the editor's copy only; run it again a minute later if a host was inviting at that moment, since it also deletes what arrived; reply with template R9), then `with input(phone) as (values ('447700900000')) select private.record_objection(i.phone) as result from input i;`.
  - `supabase/ops/withdraw-objection.sql`: the same shape over `private.withdraw_objection`, printing `removed`.

- [ ] **Step 1: Write the failing slice 4**

  ```sql
  -- empty list: delete from vault.secrets where name='invite_objection_key'; host 01 invites a non-user number
  --   447700900611 with a well-formed code: kind 'link' (the call never needed the key)
  -- object-number.sql, run as text with its literal swapped by sed (chat-safety.sql:1165 shows the shape), for
  --   447700900612, which has invitations on two hosts' plans and a removal row, one invitation on a held series:
  --   result = {"already_listed": false, "invitations_deleted": 1, "removals_deleted": 1, "held_kept": 1}
  --   exactly one vault secret named invite_objection_key; exactly one invite_objections row;
  --   its key_hash <> extensions.digest('447700900612','sha256') and position('447700900612'::bytea in key_hash) = 0
  --   run again: already_listed true, nothing deleted, still one row and one secret
  -- after: host 01 invites [447700900612, 447700900613]:
  --   [{"phone":"447700900612","kind":"unavailable"},{"phone":"447700900613","kind":"link"}];
  --   no phone_invitations row for 447700900612; a guest row and notice for neither
  -- a user 20 (confirmed phone 447700900614, used the app) whose number is listed: host invites it: kind 'app'
  -- withdraw-objection.sql for 447700900612: removed true; the host invites it again: kind 'link'
  -- grants: no API role on invite_objections or the five functions; public.invite_contacts still executable
  --   by authenticated only
  -- record_objection('12'): refused 22023
  ```

- [ ] **Step 2: Run it and see it fail**

  Run: `./scripts/test-database-docker.sh`
  Expected: FAIL in slice 4, at the first `'unavailable'` check or with `function private.record_objection(text) does not exist`.

- [ ] **Step 3: Write section 4, its undo and the two scripts**

  Undo: restore `private.invite_contacts` to its base body verbatim (`create or replace`, which keeps the grants), then drop the five functions and the table. The rollback also refuses, changing nothing, while `private.invite_objections` holds a row: an objection must not silently stop working. The undo's message says to export and empty the list first, by hand, with the owner's approval.

- [ ] **Step 4: Run it and see it pass**

  Run: `./scripts/test-database-docker.sh`
  Expected: `PASS: retention.sql`, `PASS: contact-invitations.sql`, `PASS: circles-of-trust.sql`, `PASS: chat-safety.sql`, and the final line.

- [ ] **Step 5: Commit**

  ```bash
  git add supabase/migrations/20261117130000_retention_and_team_tools.sql supabase/rollback/20261117130000_retention_and_team_tools.rollback.sql \
    supabase/tests/retention.sql supabase/ops/object-number.sql supabase/ops/withdraw-objection.sql
  git commit -m "Retention plan 6: the do-not-invite list" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

### Task 5: Section 5, orphan profile photos and replaced covers

**Files:**
- Modify: the migration (section 5), the rollback (section 5's undo, at the top)
- Test: `supabase/tests/retention.sql` (slice 5); `supabase/tests/photo-cleanup.sql` must pass unchanged

**Interfaces:**
- Consumes: the bases, in order of preference, from plan 2's migration where it defines them, otherwise `supabase/migrations/20260923152816_orphan_profile_photo_cleanup.sql`: tables `:4-26`, `private.guard_photo_write()` `:32-56`, `private.guard_profile_photo_reference()` and its trigger `:58-71`, `private.claim_orphan_profile_photos(integer)` `:81-131`, `private.prepare_orphan_profile_photo(uuid,uuid)` `:133-146`, `private.finish_orphan_profile_photo(uuid,uuid,boolean)` `:148-160`, `private.prune_profile_photo_cleanup()` `:165-187`, and the wrappers and grants `:189-194`. Plan 2's `private.account_deletion_jobs` and trigger `resbite_photo_write_guard`. The cover schema at `supabase/migrations/20261007200000_plan_covers.sql:5-7` (paths `<owner id>/<plan id>/<name>.jpg`, `:44`). The account lock: `pg_advisory_xact_lock(hashtextextended(<account id>::text, 47))`.
- Produces:
  - **Photos, carried.** The two tables `if not exists`; the functions `create or replace` from their bases; trigger `resbite_profile_photo_reference_guard` re-created (`drop trigger if exists` first); trigger `resbite_photo_write_guard` created only when absent. The `resbite_avatar_read` policy is already the hosted one (`20260924150135_avatar_revision_compare_and_swap.sql:65-69`) and is not touched. Named changes:
    - `private.guard_photo_write()`: when its base lacks them, the retired-path lines of `20260923152816:48-51`.
    - `claim_orphan_profile_photos`: in discovery and in the candidate loop, `and not private.account_held(<user id>)`. An observed job of a held account stays as it is.
    - `prepare_orphan_profile_photo`: after the `'account-deletion'` check, returns `{"action": "held"}` when `private.account_held(v_job.user_id)`.
  - `private.retire_profile_photo_now(p_user uuid, p_path text) returns boolean`: under the account lock, when `p_path` starts with `p_user::text || '/'`, no profile has it as `avatar_path`, the object exists and the account is not held, it inserts the retired fence and a job with `status 'queued'` and `next_attempt_at now()` (on conflict on `path_hash`, re-queued unless complete), and returns true. Otherwise it returns false. No grant.
  - `private.remove_profile_photo(p_user uuid) returns jsonb`: under the account lock, reads `avatar_path`, sets it to null, then calls `retire_profile_photo_now`. Returns `{"detached": bool, "queued": bool, "held": bool}`. No grant.
  - **Covers, new.** `private.plan_cover_retired_paths (path_hash bytea primary key, owner_id uuid not null)` and `private.plan_cover_cleanup_jobs`, with the photo jobs table's columns and checks, `owner_id` in place of `user_id`, and the same two indexes.
  - `private.guard_plan_cover_reference()` and trigger `plans_retired_cover_guard before insert or update of cover_path on public.plans`. BEFORE triggers fire in name order, so it runs after `plans_redact_deleting_owner` and before `plans_track_cover_revision`. When `new.cover_path` is not null, it takes the lock of its first path segment, refuses a retired path with `42501 'Cover retired; choose a new photo'`, and deletes `'observed'` jobs for the new path and, on update, the old one.
  - `private.claim_orphan_plan_covers(p_limit integer default 5) returns jsonb`: the photo claim's protocol over bucket `'plan-covers'`. A candidate's name matches `^[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9-]+\.jpg$`; no plan has it as `cover_path`; the owner folder's account has no deletion job and is not held; and the series of the plan named by the second segment, while that plan exists, is not under hold. It waits 7 days observed and returns `[{"jobId", "userId" (the owner folder's id), "leaseId", "attempts"}]`.
  - `private.prepare_orphan_plan_cover(p_job uuid, p_lease uuid) returns jsonb` (`absent`, `account-deletion`, `held` or `{"action":"delete","path":…}`), `private.finish_orphan_plan_cover(p_job uuid, p_lease uuid, p_complete boolean) returns boolean`, and `private.prune_plan_cover_cleanup() returns integer` (completed jobs older than 30 days; the fences of an owner whose Auth user and every object under their folder are gone). Each mirrors its photo twin.
  - `private.retire_plan_cover_now(p_path text) returns boolean`: as the photo one, for a cover no plan references.
  - `private.remove_resbite_content(p_plan uuid, p_title boolean, p_description boolean, p_notes boolean, p_cover boolean) returns jsonb`: locks every occurrence of `p_plan`'s series `for update` in id order, then on each:
    - `p_title`: `title = 'Resbite'`;
    - `p_description`: `description = ''`;
    - `p_notes`: `note = ''`, `guest_note = ''`, `guest_note_at = null`, `has_meeting_details = false` and `private.forget_meeting_details(id)` (`20261015120000_ux3_event_details.sql:38`);
    - `p_cover`: `cover_path = null`, `cover_description = ''`;
    - `version = version + 1` on each occurrence it changed.

    Each distinct cover path removed is passed to `retire_plan_cover_now`, unless the series is under hold, when the file is kept. Returns `{"occurrences": n, "covers_queued": n, "held": bool}`. No grant.
  - `public` invoker wrappers for the four cover worker functions, executable by `service_role` only, as `:189-194` does for photos.

- [ ] **Step 1: Write the failing slice 5**

  ```sql
  -- grants: the eight photo and cover wrappers execute for service_role only; the private ones and the four
  --   remove and retire functions for nobody
  -- covers: owner 01's weekly series with two occurrences sharing cover C1; object C2 in 01's folder, attached nowhere
  --   claim_orphan_plan_covers(5) = '[]' and C2 is observed, C1 is not (still referenced)
  --   set C2's job observed_at 8 days back: claim returns one job for C2 with userId 01; its retired fence exists
  --   prepare: {"action":"delete","path":C2}; finish(…, true) while the object exists raises 22023
  --   delete the storage.objects row (the simulated HTTP), finish(…, true) = true, the job is complete
  --   update public.plans set cover_path = C2 …: refused 42501 'Cover retired; choose a new photo'
  -- held owner 02 with orphan C3: not observed; a job claimed for 03's C4 before a hold on 03: prepare = {"action":"held"}
  -- retire_plan_cover_now(C5) for an unreferenced C5: true, and claim returns it at once
  -- remove_resbite_content(occurrence 1, true, false, true, true): both occurrences read 'Resbite', no cover,
  --   no meeting details, version + 1; C1 queued once (covers_queued 1); on a held series: content cleared,
  --   covers_queued 0, held true, no job
  -- photos: remove_profile_photo(04) = {"detached": true, "queued": true, "held": false}; avatar_path null; claim
  --   returns 04's job at once; held 05: {"detached": true, "queued": false, "held": true}; 05's other orphan photo
  --   is never observed
  ```

- [ ] **Step 2: Run it and see it fail**

  Run: `./scripts/test-database-docker.sh`
  Expected: FAIL in slice 5 with `function public.claim_orphan_plan_covers(integer) does not exist`.

- [ ] **Step 3: Write section 5 and its undo**

  Undo, at the top of the rollback: drop the cover trigger, functions and tables, and the four remove and retire functions. For the photo objects: when this migration created them (comment marker), drop them; otherwise restore each body to its base verbatim. A cover fence that survived would stop no one, so it goes with its table. Name the bases in the header of the migration.

- [ ] **Step 4: Run it and see it pass**

  Run: `./scripts/test-database-docker.sh`
  Expected: `PASS: retention.sql`, `PASS: photo-cleanup.sql`, `PASS: plan-covers.sql`, `PASS: creating-a-resbite.sql`, the photo-cleanup concurrency script passing, and the final line.

- [ ] **Step 5: Commit**

  ```bash
  git add supabase/migrations/20261117130000_retention_and_team_tools.sql \
    supabase/rollback/20261117130000_retention_and_team_tools.rollback.sql supabase/tests/retention.sql
  git commit -m "Retention plan 6: orphan photos, replaced covers and the takedown helpers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

### Task 6: The worker cleans photos and covers

**Files:**
- Modify: `supabase/functions/_shared/profile-photo-cleanup.ts:7-9` (the action type), `:31-36` (the deferral branch), `:58-75` (the handler)
- Modify: `supabase/functions/_shared/profile-photo-cleanup-gateway.ts:4-31`
- Modify: `supabase/functions/cleanup-profile-photos/index.ts:7-16`
- Test: `supabase/functions/_shared/profile-photo-cleanup.test.ts`

**Interfaces:**
- Consumes: Task 5's RPC names.
- Produces:
  - `PhotoCleanupAction` gains `{ action: "held" }`, handled like `"account-deletion"`: `finish(job, false)` and `deferred++`, with no Storage call.
  - `export type CleanupTarget = { bucket: "profile-photos" | "plan-covers"; prune: string; claim: string; prepare: string; finish: string }`.
  - `export const PROFILE_PHOTOS: CleanupTarget = { bucket: "profile-photos", prune: "prune_profile_photo_cleanup", claim: "claim_orphan_profile_photos", prepare: "prepare_orphan_profile_photo", finish: "finish_orphan_profile_photo" }` and `export const PLAN_COVERS: CleanupTarget = { bucket: "plan-covers", prune: "prune_plan_cover_cleanup", claim: "claim_orphan_plan_covers", prepare: "prepare_orphan_plan_cover", finish: "finish_orphan_plan_cover" }`.
  - `profilePhotoCleanupGateway(url: string, serviceKey: string, fetcher: typeof fetch = fetch, target: CleanupTarget = PROFILE_PHOTOS): PhotoCleanupGateway`, with every RPC name and the Storage path taken from `target`.
  - `export async function cleanupStoredImages(gateways: readonly PhotoCleanupGateway[]): Promise<{ claimed: number; complete: number; retry: number; deferred: number }>`: `cleanupProfilePhotos` on each in order, summed.
  - `createPhotoCleanupHandler(gateway: PhotoCleanupGateway | readonly PhotoCleanupGateway[], enabled: boolean, secret: string)`, which runs `cleanupStoredImages` on the list.
  - `index.ts`: `const PHOTO_CLEANUP_RELEASE_APPROVED` **stays `false` in this task**. It is a release gate, flipped only in an owner-approved commit at rollout step R5, as plan 2 flips its deletion gates (spec C2's "gate-flip commits"). The comment above it gains: the retention review is done (D-8 adopted by AS-D8), and the hosted race acceptance is R6, behind `PROFILE_PHOTO_CLEANUP_ENABLED`. It serves `[profilePhotoCleanupGateway(…, PROFILE_PHOTOS), profilePhotoCleanupGateway(…, PLAN_COVERS)]`.

- [ ] **Step 1: Write the failing tests**

  ```ts
  test("a held job is deferred without touching storage", async () => {
    const { gateway, calls } = fixture({ prepare: async () => ({ action: "held" }) });
    assert.deepEqual(await cleanupProfilePhotos(gateway), { claimed: 1, complete: 0, retry: 0, deferred: 1 });
    assert.deepEqual(calls, ["prune", "claim", "prepare", "finish:false"]);
  });
  test("the cover target calls the cover RPCs and removes from plan-covers", async () => {
    // a recording fetcher: the URLs and methods, in order
    // expect /rest/v1/rpc/prune_plan_cover_cleanup, /rest/v1/rpc/claim_orphan_plan_covers {"p_limit":5}, …,
    // and DELETE /storage/v1/object/plan-covers with body {"prefixes":["<owner>/<plan>/c.jpg"]}
  });
  test("the handler runs photos, then covers, and sums the two", async () => {
    // two fixtures; response JSON {claimed: 2, complete: 2, retry: 0, deferred: 0}; calls photos' before covers'
  });
  test("both targets are served, and the source gate is a literal the rollout flips", async () => {
    // read ../cleanup-profile-photos/index.ts as text: matches /PHOTO_CLEANUP_RELEASE_APPROVED = (true|false);/ (plan 2's
    // deletion-release.test.ts reads the same literal and checks the entry is inert while it is false), and contains
    // "PROFILE_PHOTOS" and "PLAN_COVERS"
  });
  ```

- [ ] **Step 2: Run them and see them fail**

  Run: `node --import ./mobile/node_modules/tsx/dist/loader.mjs --test supabase/functions/_shared/profile-photo-cleanup.test.ts`
  Expected: FAIL: `PLAN_COVERS` is not exported, and the held case counts a retry.

- [ ] **Step 3: Implement the five changes above**

- [ ] **Step 4: Run every worker test and see them pass**

  Run: `node --import ./mobile/node_modules/tsx/dist/loader.mjs --test supabase/functions/_shared/*.test.ts`
  Expected: every test passes, the eight existing photo tests included.

- [ ] **Step 5: Commit**

  ```bash
  git add supabase/functions/_shared/profile-photo-cleanup.ts supabase/functions/_shared/profile-photo-cleanup-gateway.ts \
    supabase/functions/_shared/profile-photo-cleanup.test.ts supabase/functions/cleanup-profile-photos/index.ts
  git commit -m "Retention plan 6: the clean-up worker removes orphan covers too" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

### Task 7: The team's suspension, hold and removal scripts (C6)

**Files:**
- Create: `supabase/ops/suspend-account-by-id.sql`, `lift-suspension.sql`, `set-legal-hold.sql`, `lift-legal-hold.sql`, `legal-holds.sql`, `remove-profile-photo.sql`, `remove-resbite-content.sql`
- Test: `supabase/tests/team-scripts.sql` (slices 1 to 3; synthetic ids `a7000000-…`, numbers `4477009007NN`)

**Interfaces:**
- Consumes: `private.suspensions` (`20261111160000_chat_safety.sql:794-801`, with `grant_made` from the open beta); `suspend-account.sql:15-30` for the shape and `:37-49` for the undo's grant restoration; Task 1's holds and history; Task 5's `remove_profile_photo` and `remove_resbite_content`.
- Produces. Each header says what it does, what to edit, what it prints, and its link to the procedure (`moderation-standard.md`, `law-enforcement-requests.md` section 11):
  - `suspend-account-by-id.sql`: `with input(user_id, report_id) as (values ('00000000-0000-0000-0000-000000000000'::uuid, null::bigint))`. The same effect as `suspend-account.sql` without its roster step, for an account found any way (AS-R6: the uploader of an intimate image is suspended at once). A revoked grant, recorded in `private.suspensions` (`report_id` as given, `grant_made` when the account had no grant). Prints `account`, `grants_revoked`. Run again, it changes nothing and prints `grants_revoked 0`. The header adds the owner's step: ban the account in the Auth dashboard when the case needs it.
  - `lift-suspension.sql`: input `user_id`. In one statement it deletes the `private.suspensions` row, inserts it into `private.suspension_history` (`suspended_at = at`, `ended_at = now()`, `how 'lifted'`, `report_id`), and puts the grant back exactly as the undo does: a revoked grant that the suspension revoked becomes live again, and a grant it made is deleted. Prints `lifted`, `grants_restored`. The header says to lift any Auth ban in the dashboard too, and that the error undo inside `suspend-account.sql` stays for a suspension made by mistake, which leaves no record.
  - `set-legal-hold.sql`: `with input(user_id, series_id, reason, case_ref, review_on) as (values (null::uuid, null::uuid, 'police', 'LE-2026-000', current_date + 90))`. Exactly one of the two ids. Prints `id, user_id, series_id, reason, case_ref, review_on, set_at`. The header names the reasons and says the backup moderator may set one only in a CSEA or intimate image case (`team-access.md`).
  - `lift-legal-hold.sql`: input `id`. Sets `lifted_at` on a hold not yet lifted, and prints the row. It prints nothing for a hold already lifted.
  - `legal-holds.sql`: read-only. The holds not lifted: `id`, `scope` (`'account'` or `'series'`), `held_id`, `reason`, `case_ref`, `set_at`, `review_on`, and `review_due` (`review_on <= current_date`), ordered by `review_on, id`.
  - `remove-profile-photo.sql`: input `user_id`. Prints `private.remove_profile_photo(user_id)`.
  - `remove-resbite-content.sql`: input `(plan_id, title, description, notes, cover)`, the four booleans defaulting to true in the literal. Prints `private.remove_resbite_content(…)`.

- [ ] **Step 1: Write the failing team-scripts.sql slices 1 to 3**

  Each script is read with `\set` and a backtick `sed` swapping its one literal, then run with a `pg_temp.r7_run(text) returns jsonb` (as `pg_temp.s3_run`, `supabase/tests/chat-safety.sql:846-852`). `legal-holds.sql` runs read-only (as `pg_temp.s3_run_read_only`, `:854-`).

  ```sql
  -- slice 1, suspension: suspend-account-by-id.sql for 01 (no grant before):
  --   [{"account": 01, "grants_revoked": 1}]; private.user_eligible(01) false; suspensions row report_id null, grant_made true
  --   run again: grants_revoked 0, still one row
  --   lift-suspension.sql for 01: [{"lifted": 1, "grants_restored": 1}]; user_eligible(01) true; no suspensions row;
  --   one suspension_history row for 01, how 'lifted', ended_at = now(); no beta_access row for 01 (the grant it made went)
  --   02 with an earlier ban (revoked grant): suspend, then lift: 02 still not eligible (the earlier ban stays)
  -- slice 2, holds: set-legal-hold.sql for account 03, reason 'nca': one row printed, private.account_held(03) true
  --   legal-holds.sql: lists it, scope 'account', review_due false; read-only (no write)
  --   lift-legal-hold.sql: lifted_at set; account_held(03) false; run again: no row printed
  --   the literal with both ids: refused 23514
  -- slice 3, removals: remove-profile-photo.sql for 04: {"detached": true, "queued": true, "held": false}
  --   remove-resbite-content.sql on a two-occurrence weekly series: {"occurrences": 2, "covers_queued": 1, "held": false}
  -- every script's printed text: no '@' and no '4477009007' (no email, no number)
  ```

- [ ] **Step 2: Run them and see them fail**

  Run: `./scripts/test-database-docker.sh`
  Expected: FAIL in `team-scripts.sql` (the `cat` of a missing script gives empty text: "The script text is empty").

- [ ] **Step 3: Write the seven scripts**

- [ ] **Step 4: Run and see them pass**

  Run: `./scripts/test-database-docker.sh`
  Expected: `PASS: team-scripts.sql`, `PASS: chat-safety.sql` (it still runs `suspend-account.sql`, unchanged), and the final line.

- [ ] **Step 5: Commit**

  ```bash
  git add supabase/ops/suspend-account-by-id.sql supabase/ops/lift-suspension.sql supabase/ops/set-legal-hold.sql \
    supabase/ops/lift-legal-hold.sql supabase/ops/legal-holds.sql supabase/ops/remove-profile-photo.sql \
    supabase/ops/remove-resbite-content.sql supabase/tests/team-scripts.sql
  git commit -m "Retention plan 6: suspend by id, lift, legal holds and takedown scripts" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

### Task 8: The data export scripts (A16)

**Files:**
- Create: `supabase/ops/export-account.sql`, `supabase/ops/export-number.sql`
- Test: `supabase/tests/team-scripts.sql` (slice 4)

**Interfaces:**
- Consumes: the tables in `docs/compliance/data-requests.md` section 5; plan 2's `private.account_deletion_jobs.status`; plan 4's `private.terms_acceptances(user_id, terms_version, accepted_at, how)` (`20261117120000_terms_acceptance.sql`, `docs/superpowers/plans/2026-11-17-asr-4-terms-safety-details.md`, Decision 2), so build this task once plan 4's migration is on the branch; Task 1's `suspension_history`; Task 4's `number_objected`.
- Produces:
  - `export-account.sql`. The header says: owner-run after the identity check (section 4); copy the file to a private folder outside the repo, put the account id in the copy, run `supabase db query --linked -o json -f <copy> > <outside the repo>/export.json`, never save the output in the repo, and delete our copy 30 days after sending (section 7). It is one `select` with an input literal, returning one row of two columns:
    - `export jsonb`, with these keys. Each array is `[]` when empty, never null. Each resbite is named by its title and start, never by an id, and other people by their `display_name` only:

      | Key | From (section 5) | Leaves out |
      |---|---|---|
      | `account` | `auth.users`: id, phone, email, created_at, last_sign_in_at, email_confirmed_at, phone_confirmed_at, banned_until, metadata display_name, any `registration_details` | password, tokens |
      | `sign_in_methods` | `auth.identities`: provider, created_at, email | provider ids, tokens |
      | `sessions` | `auth.sessions`: created_at, updated_at, user_agent, ip | tokens |
      | `profile` | `public.profiles`: display_name, created_at, deletion_requested_at | `avatar_revision` |
      | `age_and_terms`, `terms_accepted`, `chat_rules`, `app_sessions`, `access_grants`, `moderator`, `contact_lookups` | `age_attestations`, `terms_acceptances` (version, accepted_at, how), `chat_rules_acceptances`, `app_sessions`, `beta_access`, `moderators`, `lookup_usage` | link ids |
      | `suspensions` | `suspensions.at`; `suspension_history` suspended_at, ended_at, how | `report_id` |
      | `push_registrations` | `device_endpoints`: platform, updated_at, token as its first four and last four characters | the full token |
      | `deletion_request` | `account_deletion_jobs.status` | `recovery_hash`, request id |
      | `resbites_hosted` | `plans` they own: title, description, categories, starts_at, ends_at, time_zone, place_label, area, note, guest_note, cover_description, status, repeat_weeks, created_at; meeting details; `guests: [{name, answer}]` | latitude, longitude, guests' ids and numbers |
      | `attending`, `co_hosting`, `join_requests`, `removed_from`, `groups_left`, `mutes` | `attendees` (answer, level, the bringer's name), `plan_admins`, `join_requests`, `plan_removals` (by id or their number key), `series_leaves`, `plan_mutes` and `chat_mutes` | ids |
      | `invitations_sent` | `phone_invitations` where they are `invited_by` or `brought_by`: title, country, `number_ending` (last two digits), sent, answered, revoked, level | full numbers |
      | `invitations_received` | `phone_invitations` with their `user_id` or number key: title, start, the host's name, sent, answered, revoked | inviter id and number |
      | `links` | `plan_links` of their plans: created, revoked | the code |
      | `messages` | `public.messages` they wrote, kind `message` or `announcement`: title, kind, audience, body (null when deleted or removed), state, created_at | other people's messages |
      | `chat_events` | system lines whose `payload` names them: title, event, created_at | the payload, other ids |
      | `read_positions` | `chat_reads`: title, and the `created_at` of the message at `last_read_id` | message ids |
      | `connections` | `connections`: the other person's name, state, `asked_by_you`, the met-at title, asked, accepted | ids |
      | `refusals_made`, `blocks_made` | `connection_refusals` `from_user` and `blocks` `blocker_id`: name, title, time | **every row about them** (section 6.2) |
      | `reports_filed` | `reports` by them: reason, details, created, status, the reported person's name, `frozen_body` | `review_note` |
      | `reports_about_you` | `reports` with them as `target_user_id` or `frozen_author`: reason, created, status, action, and `frozen_body` only where `frozen_author` is them | **the reporter**, the reporter's `details`, `review_note` (section 6.1; the owner adds a summary by hand where it is safe) |
      | `notifications` | outbox rows to them: kind, title, queued, delivered, the actor's name, detail | the actor id, ticket ids |
    - `files jsonb`: `{"profile_photos": [names under "<id>/"], "covers": [names under "<id>/"]}`, kept apart because cover paths hold resbite ids. The owner downloads these from Storage for the archive.
  - `export-number.sql`, for a person who is not a user (section 5.9). Input: the number. Prints `export jsonb`: `invitations` (title, start, the host's name, sent, answered, revoked), `removals` (title, since), and `on_do_not_invite_list` (`private.number_objected`). Matching is by `private.phone_key`.

- [ ] **Step 1: Write the failing slice 4**

  Fixture: person 10, who hosts a one-off with guests 11 and 12; writes a message in it; is reported by 11 (details "he shouted") with a frozen copy of their words; reported 12; was blocked by 12; was refused by 11 ("Not now"); has a push registration and an invitation they sent to 447700900799.

  ```sql
  -- export-account.sql for 10 (run as text, literal swapped):
  --   every uuid in export::text equals 10's id:
  --     not exists(select 1 from regexp_matches(export::text,'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}','g') m(x) where m.x[1] <> a7('10')::text)
  --   export->'messages' holds 10's own body; export::text holds neither 11's nor 12's message bodies
  --   export->'reports_about_you'->0 has no key 'reporter' and no 'details', and export::text does not contain 'he shouted'
  --   export::text contains no name of a person who blocked or refused 10 in any blocks/refusals key:
  --     export->'refusals_made' = '[]' and export->'blocks_made' = '[]'
  --   export->'invitations_sent'->0->>'number_ending' = '99', and export::text does not contain '447700900799'
  --   export->'push_registrations'->0->>'token' is 4 characters, '…', 4 characters
  --   export->'terms_accepted'->0->>'terms_version' is the fixture's version (plan 4's table)
  --   files->'profile_photos' lists 10's photo object
  -- export-account.sql for a person with nothing (13): every array key is '[]', none null
  -- export-number.sql for 447700900799: one invitation, with the host's name; on_do_not_invite_list false
  ```

- [ ] **Step 2: Run it and see it fail**

  Run: `./scripts/test-database-docker.sh`
  Expected: FAIL in slice 4, "The script text is empty".

- [ ] **Step 3: Write the two scripts**

- [ ] **Step 4: Run it and see it pass**

  Run: `./scripts/test-database-docker.sh`
  Expected: `PASS: team-scripts.sql` and the final line.

- [ ] **Step 5: Commit**

  ```bash
  git add supabase/ops/export-account.sql supabase/ops/export-number.sql supabase/tests/team-scripts.sql
  git commit -m "Retention plan 6: export one account's data, and a non-user's number" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

### Task 9: The schedule, the complete rollback and the hosted-baseline rehearsal

**Files:**
- Create: `supabase/ops/schedule-retention.sql`
- Modify: `supabase/rollback/20261117130000_retention_and_team_tools.rollback.sql` (header and guard)
- Create: `supabase/tests/hosted-baseline/20261117130000_retention_and_team_tools.before.sql`, `.after.sql`

**Interfaces:**
- Consumes: everything above; the shape of `supabase/ops/schedule-deliver-notifications.sql` and of the open-beta rehearsal pair.
- Produces:
  - `schedule-retention.sql`, owner-run, not in any test list (no pg_cron or pg_net locally). Header as `schedule-deliver-notifications.sql:1-24`: prerequisites (this migration applied; `cleanup-profile-photos` deployed; Vault secrets `profile_photo_cleanup_url` and `profile_photo_cleanup_secret`), and how to undo it. Body: `create extension if not exists pg_cron with schema pg_catalog; create extension if not exists pg_net with schema extensions;`. For each job, first `select cron.unschedule(jobid) from cron.job where jobname = …`, then:
    - `retention-purge`, `'47 3 * * *'` (plan 1's `sms-records-sweep` takes `'17 3 * * *'`): `select private.run_retention();`
    - `cleanup-images`, `'*/10 * * * *'`: `net.http_post` to the URL in Vault, with `Authorization: Bearer` and the Vault secret, body `'{}'`, `timeout_milliseconds := 60000`.
  - The rollback, complete:
    - Header: what it undoes, that it runs before plan 2's rollback, and that it restores no deleted rows (purges, roster, legacy invitations).
    - Guards first, raising and changing nothing: while `cron.job` (when `to_regclass('cron.job')` resolves) holds `retention-purge` or `cleanup-images` ("Unschedule the retention jobs first"), and while `private.invite_objections` holds a row (Task 4).
  - `before.sql`:
    - Refuses unless `private.account_deletion_jobs` exists ("Pass plan 2's migration as an earlier candidate").
    - Snapshots `private.invite_contacts(uuid,jsonb)` and, where they exist, the five photo functions, with their definitions and ACLs, into `private.r6_rehearsal_functions`.
    - Fixtures, kept: account `ea6…01` with email `r6-disabled@resbite-test.invalid` and a disabled roster row, suspended by `suspend-account.sql`'s shape (`roster true`, no grant); account `ea6…02` with an enabled roster row; one legacy `private.invitations` row; a phone invitation.
    - Asserts the pre-state: `private.invite_objections` absent, `private.run_retention()` absent, three roster rows, one legacy invitation.
  - `after.sql`:
    1. `invite_contacts` equals its snapshot with Task 4's one named edit, the old text found exactly once, its ACL unchanged (the open beta's loop, `20261116120000_open_beta.after.sql:21-35`).
    2. Grants: the eight `public` worker wrappers for `service_role` only; every other new function for no API role; every new table locked.
    3. The data steps: `private.tester_roster` empty; `ea6…01` has a revoked grant and is not `private.user_eligible`; its suspension row has `roster false`, `grant_at` its grant's `revoked_at` and `grant_made true`; `ea6…02` is eligible; `private.invitations` empty.
    4. `\ir ../retention.sql` and `\ir ../team-scripts.sql`: both suites on the hosted baseline.
    5. In `begin; … rollback;`: `\ir` the rollback, then check that every snapshot body and ACL is restored, and that the new tables and functions are gone, the shared ones only where this file made them.
    6. Remove the fixtures and the snapshot table.

- [ ] **Step 1: Write the rehearsal pair (it fails until the rollback is complete)**

- [ ] **Step 2: Run the rehearsal and see it fail**

  Run: `./scripts/test-database-docker.sh --hosted-baseline <every pending candidate before 20261117130000, in timestamp order, at least plan 2's deletion release> supabase/migrations/20261117130000_retention_and_team_tools.sql`
  Expected: FAIL at the rollback check in `after.sql` until the rollback's header and guards are written. Without plan 2's candidate, the run stops at "Pass plan 2's migration as an earlier candidate".

- [ ] **Step 3: Write `schedule-retention.sql` and complete the rollback**

- [ ] **Step 4: Run both modes and see them pass**

  Run: `./scripts/test-database-docker.sh --hosted-baseline <the same candidates> supabase/migrations/20261117130000_retention_and_team_tools.sql`
  Expected: `PASS: 20261117130000_retention_and_team_tools applies on the hosted baseline`, then every `tests.txt` line PASS, and the final line.

  Run: `./scripts/test-database-docker.sh`
  Expected: every line PASS and the final line.

  Run: `sha256sum supabase/migrations/20261117130000_retention_and_team_tools.sql supabase/rollback/20261117130000_retention_and_team_tools.rollback.sql supabase/ops/schedule-retention.sql supabase/ops/schedule-roll-repeating-plans.sql`
  Expected: four hashes, the last `3a8202877260008723648dc4723b36aedb6d772f809b2552997765773040d74e`. Keep them for Task 12.

- [ ] **Step 5: Commit**

  ```bash
  git add supabase/ops/schedule-retention.sql supabase/rollback/20261117130000_retention_and_team_tools.rollback.sql \
    supabase/tests/hosted-baseline/20261117130000_retention_and_team_tools.before.sql \
    supabase/tests/hosted-baseline/20261117130000_retention_and_team_tools.after.sql
  git commit -m "Retention plan 6: the schedule, the rollback and the hosted-baseline rehearsal" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

### Task 10: Invite people says who can't be invited by link

**Files:**
- Modify: `mobile/src/services/contactInvites.ts:4` (`InviteKind`), `:67` (`kinds`)
- Modify: `mobile/src/state/useContactInvites.ts:34` (`Outcome`), `:304` (its start value), `:310-321` (the phone results)
- Modify: `mobile/src/design/ContactPicker.tsx:238-240` (`SendStep`)
- Modify: `mobile/src/domain/inviteCopy.ts:63` (beside `alreadyInvited`)
- Test: `mobile/src/services/contactInvites.test.ts`, `mobile/src/domain/inviteCopy.test.ts`

**Interfaces:**
- Consumes: Task 4's `'unavailable'` answer, which the server gives only for a `{phone}` item.
- Produces:
  - `InviteKind = "app" | "link" | "self" | "already" | "unavailable"`, and `kinds` accepts it.
  - `Outcome = { inApp: string[]; already: string[]; unavailable: string[]; links: Sendable[] }`. On `"unavailable"`, the hook removes that number's stored code (`inviteCodeStore.remove(scope, planId, n.e164)`, as for `"self"`) and pushes `n.name` into `out.unavailable`.
  - `INVITE_COPY.cannotInvite = "Can’t be invited by link"`. `SendStep` shows, after the already line, in the same muted style, `` `${T.cannotInvite}: ${outcome.unavailable.join(", ")}` `` when the list is not empty.

- [ ] **Step 1: Write the failing tests**

  ```ts
  // contactInvites.test.ts
  test("invite accepts 'unavailable' for a number on the do-not-invite list", async () => {
    const { gw } = gateway(() => ({ data: [{ phone: "447700900201", kind: "unavailable" }], error: null }));
    assert.deepEqual(await gw.invite("p", [{ phone: "447700900201", country: "44", code: "c".repeat(22) }]),
      [{ phone: "447700900201", kind: "unavailable" }]);
  });
  // inviteCopy.test.ts
  test("a number that can't be invited by link says so with a curly apostrophe", () => {
    assert.equal(INVITE_COPY.cannotInvite, "Can’t be invited by link");
  });
  ```

- [ ] **Step 2: Run them and see them fail**

  Run: `cd mobile && node --import tsx src/services/contactInvites.test.ts && node --import tsx src/domain/inviteCopy.test.ts`
  Expected: FAIL. The first rejects with "Check your connection and try again."; the second reads `undefined`.

- [ ] **Step 3: Implement the four changes**

- [ ] **Step 4: Run the suite and the typecheck**

  Run: `cd mobile && npm test && npx tsc --noEmit`
  Expected: every test passes; tsc prints nothing.

- [ ] **Step 5: Commit**

  ```bash
  git add mobile/src/services/contactInvites.ts mobile/src/services/contactInvites.test.ts mobile/src/state/useContactInvites.ts \
    mobile/src/design/ContactPicker.tsx mobile/src/domain/inviteCopy.ts mobile/src/domain/inviteCopy.test.ts
  git commit -m "Retention plan 6: Invite people names who can't be invited by link" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

### Task 11: The Auth email templates (C13)

**Files:**
- Modify: `supabase/templates/confirmation.previous.html`, `email-code.previous.html`, `recovery.previous.html` (each replaced by today's body of its template: the rollback copy for this paste)
- Modify: `supabase/templates/confirmation.html:24` (delete the line), and the footer cell of `confirmation.html`, `email-code.html` and `recovery.html` (after the "A little time. A real connection." paragraph)
- Modify: `supabase/templates/README.md` (a new section)
- Create: `supabase/templates/templates.test.mjs`
- Modify: `mobile/scripts/verify-emails.mjs:24-25`; `mobile/package.json:68` (append the template test to `test`)

**Interfaces:**
- Produces: two paragraphs, the same in all three files, inside the footer `<td>`, after its last paragraph:

  ```html
  <p style="margin:12px 0 0;">Resbite Ltd. Registered in England and Wales, company number 12450334. Registered office: 86-90 Paul Street, London EC2A 4NE, United Kingdom.</p>
  <p style="margin:8px 0 0;">Help: support@resbite.com · <a href="https://link.resbite.com/privacy" style="color:#245F60;text-decoration:underline;">Privacy Policy</a></p>
  ```

  The address stays plain text, so the render check's link rule holds.

- [ ] **Step 1: Write the failing template test**

  ```js
  // supabase/templates/templates.test.mjs (node:test, reads the three files next to it)
  for (const name of ["confirmation", "email-code", "recovery"]) {
    test(`${name} carries the company footer and the Privacy Policy link`, () => {
      // contains "Resbite Ltd", "company number 12450334", "86-90 Paul Street, London EC2A 4NE",
      // "support@resbite.com" and href="https://link.resbite.com/privacy" exactly once
    });
    test(`${name} says nothing about a private test or testers`, () => {
      // !/private test|tester/i
    });
    test(`${name} keeps its placeholders`, () => {
      // {{ .X }} set: confirmation [ConfirmationURL, Token], recovery [ConfirmationURL], email-code [Token]
    });
  }
  ```

- [ ] **Step 2: Run it and see it fail**

  Run: `node --test supabase/templates/templates.test.mjs`
  Expected: FAIL. No file has the footer, and `confirmation` matches "private test".

- [ ] **Step 3: Copy the three bodies to their `.previous.html`, then edit the templates, the render check and the README**

  `verify-emails.mjs:24` becomes `name==='email-code'?1:3`. `:25` accepts a link that starts with `https://example.invalid/auth/verify?` or equals `https://link.resbite.com/privacy`, and at most one of the latter. The README section, "App Store readiness, 17 November 2026", says: the private-test line is gone; the footer was added; the `.previous.html` files now hold the September bodies for rollback; the files are pasted at rollout step R9, after `/privacy` is live; and there is no VAT line until the placeholder is settled.

- [ ] **Step 4: Run the checks**

  Run: `node --test supabase/templates/templates.test.mjs && cd mobile && npm test`
  Expected: all pass. Then, with Chrome or Chromium available headless, run `cd mobile && RESBITE_QA_BROWSER=chromium node scripts/verify-emails.mjs`. Expected: "Three email templates passed token, link and 320/600px layout checks." If no browser is installed on this machine, record that and run it on the Mac.

- [ ] **Step 5: Commit**

  ```bash
  git add supabase/templates mobile/scripts/verify-emails.mjs mobile/package.json
  git commit -m "Retention plan 6: Auth emails lose the private-test line and gain the company footer" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

### Task 12: The rollout runbook and the records

**Files:**
- Create: `qa/retention-and-team-tools-2026-11-17/README.md`
- Modify: `docs/compliance/retention-schedule.md`, `docs/compliance/data-requests.md` (sections 5, 8.4 and 10.2, and the build table at section 15), `docs/compliance/law-enforcement-requests.md` (sections 11.2 and 11.5), `supabase/README.md` (a new section), `qa/app-store-release/README.md` (four lines, found by their text: "Photo clean-up (C3)", today `:77`; "the deletion and retention jobs (names set by C2 and C3)", `:83`; "C3, retention jobs", `:153`; "The removal scripts work on a test photo", `:255`. Other plans edit this file too, so find each line by its words), `docs/implementation-status.md` (a dated entry at the top), `knowledge-base/08-decisions.md` (this plan's 13 decisions under the AS section)

**Interfaces:**
- Consumes: Task 9's four hashes; the rollout below.
- Produces:
  - The runbook: the hash table (migration, rollback, `schedule-retention.sql`, `schedule-roll-repeating-plans.sql`, and every new ops script); the rehearsal command; the rollout steps R1 to R12 below, with their scripts; an empty "Applied" section; and the rollback steps. No names, numbers or account ids.
  - `retention-schedule.md`:
    - each row this plan builds reads "Local only — C3" or "Local only — C6" (20261117130000) in "Built?", and "Pauses" in "Hold" wherever a purge checks it;
    - row 4 (`phone_invitations`) gains Decision 2's code note;
    - section 15 names `set-legal-hold.sql`, `lift-legal-hold.sql` and `legal-holds.sql`;
    - section 17's C3 and C6 rows list what is built;
    - section 7's code note says lifts go to `private.suspension_history`.
  - `data-requests.md`:
    - section 5 names `export-account.sql` and `export-number.sql`;
    - sections 8.4 and 10.2 name the removal scripts, `object-number.sql` and `withdraw-objection.sql`, closing the open points at 10.2 step 3 and in the section 15 table.
  - `law-enforcement-requests.md` sections 11.2 and 11.5 name the three hold scripts.
  - The release runbook:
    - the "Photo clean-up (C3)" line stays, and adds the two Vault names `profile_photo_cleanup_url` and `profile_photo_cleanup_secret`;
    - the scheduled-jobs line names `retention-purge` and `cleanup-images`;
    - the "C3, retention jobs" line points to this runbook;
    - the removal check names `remove-profile-photo.sql` and `remove-resbite-content.sql`.
  - `08-decisions.md` takes Decisions 1 to 13, one line each, as AS-P6-1 to AS-P6-13, under "*Plan 6 (retention and team tools), <date> (assistant's calls; the owner may change them):*" (the naming the roadmap gives every plan's calls; "AS-6" would read as AS-D6).

- [ ] **Step 1: Write the runbook and the record edits**

- [ ] **Step 2: Stage the files and check that nothing private went in**

  Run: `git add <the files above> && git diff --cached -U0 | grep -P '^\+' | grep -P -i '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[A-Za-z0-9._%+-]+@(?!resbite\.com|resbite-test\.invalid)[A-Za-z0-9.-]+'`
  Expected: no output, or only the `00000000-0000-0000-0000-000000000000` placeholder.

- [ ] **Step 3: Run every suite once more**

  Run: `./scripts/test-database-docker.sh && node --import ./mobile/node_modules/tsx/dist/loader.mjs --test supabase/functions/_shared/*.test.ts && node --test supabase/templates/templates.test.mjs && (cd mobile && npm test && npx tsc --noEmit)`
  Expected: all pass.

- [ ] **Step 4: Commit and push** (the files were staged in Step 2; if `git status` showed changes to these files that this task did not make, another session is editing them: ask before staging)

  ```bash
  git commit -m "Retention plan 6: the rollout runbook and the records" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  git push -u origin HEAD   # the plan's branch, or app-store-readiness
  ```

---

## Rollout (owner-run)

Every step needs the owner's approval at the time. Recompute each hash (`sha256sum <file>`) before asking, approve by file name and hash, and stop if a hash differs. The scripts below go into `qa/retention-and-team-tools-2026-11-17/README.md`, and the owner copies them to `~/`. Each `D` folder is `qa/retention-and-team-tools-2026-11-17`. Record every step under "Applied", with no names, numbers or account ids.

**R1. Prerequisites.**
- Plan 2's deletion release is live on hosted: its migration is in `migrations.txt`, and `cleanup-account` is deployed and scheduled.
- Plan 4's three migrations are live (`20261117120000` to `20261117122000` in `migrations.txt`): `export-account.sql` reads `private.terms_acceptances`, and this file's timestamp must stay the last applied (roadmap).
- The retention schedule has been through the solicitor (D-12), or the owner accepts the D-8 defaults (AS-D8).
- The hosted-baseline rehearsal (Task 9) passed on the commit being applied.

**R2. Before, read-only** (`! bash ~/asr6-before.sh`). This takes `hosted-before.json`, `hosted-counts-before.json` and `hosted-storage-policies-before.json` into `D`, as the chat runbook's step 1 does (`qa/chat-release/README.md:381-383`), then checks:

```bash
supabase db query --linked "select has_table_privilege('postgres','auth.users','delete') as may_delete_auth_users, has_table_privilege('postgres','storage.objects','trigger') as may_trigger_storage_objects, pg_catalog.to_regclass('vault.decrypted_secrets') is not null as vault, pg_catalog.to_regclass('private.account_deletion_jobs') is not null as deletion_release_live"
supabase db query --linked "select count(*) filter (where enabled) as roster_enabled, count(*) filter (where not enabled) as roster_disabled, (select count(*) from private.invitations) as legacy_invitations, (select count(*) from private.phone_rewrites) as phone_rewrites from private.tester_roster"
supabase db query --linked "select tgname from pg_catalog.pg_trigger where tgrelid = 'storage.objects'::regclass and not tgisinternal order by 1"
supabase db query --linked "select jobname from cron.job order by 1"
```

All four flags in the first query must be true. If `may_delete_auth_users` is false, the unconfirmed-account purge will report `null`; record it and decide before R5. Never print row contents.

**R3. Apply** (the owner approves `20261117130000_retention_and_team_tools.sql` by name and sha256). Run `! bash ~/asr6-apply.sh`:

```bash
#!/bin/bash
set -euo pipefail
cd "${REPO:-$HOME/dev/resbite-app}"
D=qa/retention-and-team-tools-2026-11-17
F=supabase/migrations/20261117130000_retention_and_team_tools.sql
echo "<sha256 from the runbook>  $F" | sha256sum -c -
GUARD="if pg_catalog.to_regclass('private.account_deletion_jobs') is null then raise exception 'The deletion release is not applied: run its runbook first'; end if;
 if pg_catalog.to_regclass('private.invite_objections') is not null then raise exception 'The retention migration is already applied'; end if;
 if exists (select 1 from supabase_migrations.schema_migrations where version > '20261117130000') then raise exception 'A later migration is applied: timestamps must follow the apply order (roadmap)'; end if;"
mkdir -p /tmp/asr6
{ echo 'begin;'; echo "do \$\$ begin $GUARD end \$\$;"; cat "$F"; echo; echo 'commit;'; } > /tmp/asr6/apply.sql
supabase db query --linked -f /tmp/asr6/apply.sql
supabase migration repair --status applied 20261117130000 --linked --yes
supabase db query --linked "select count(*) as applied, max(version) as latest from supabase_migrations.schema_migrations"
supabase db query --linked -f supabase/ops/hosted-fingerprint.sql -o json > "$D/hosted-after.json"
supabase db query --linked -f supabase/ops/hosted-counts.sql -o json > "$D/hosted-counts-after.json"
supabase db query --linked -o json "select policyname, cmd, qual, with_check from pg_policies where schemaname = 'storage' order by policyname" > "$D/hosted-storage-policies-after.json"
supabase db query --linked "select tgname from pg_catalog.pg_trigger where tgrelid in ('storage.objects'::regclass, 'public.plans'::regclass, 'public.profiles'::regclass) and not tgisinternal order by 1"
```

- If the apply succeeded and only the repair failed, run the repair alone, then the last six lines.
- Then run the advisors through the Supabase MCP server, read-only, into `D/hosted-advisors-after.json`.
- Compare the fingerprint with a local replay of `migrations.txt` plus this file. Expect only this migration's objects added or changed.
- Append `20261117130000_retention_and_team_tools.sql   20261117130000` to `supabase/tests/hosted-baseline/migrations.txt`, and `retention.sql` and `team-scripts.sql` to `tests.txt`.
- Run `./scripts/test-database-docker.sh --hosted-baseline` with no candidates, and commit.

**R4. Dry run of the first purge** (approval). Run `! bash ~/asr6-dry-run.sh`. It runs `begin; select private.run_retention(); rollback;` through `supabase db query --linked -f`. Read the twelve counts and check none is unexpectedly large. Nothing is kept.

**R5. Worker.**
0. **[approval] Flip the source gate** (as plan 2's Rollout step 5 flips its deletion gates). Set `PHOTO_CLEANUP_RELEASE_APPROVED = true` in `supabase/functions/cleanup-profile-photos/index.ts`, run the Edge tests (`node --import ./mobile/node_modules/tsx/dist/loader.mjs --test supabase/functions/_shared/*.test.ts` → `# fail 0`; plan 2's `deletion-release.test.ts` then skips this entry's inert check, because its gate is no longer false), commit and push. Deploy from that commit. `PROFILE_PHOTO_CLEANUP_ENABLED` stays `false` until R6.
1. With approval, deploy: `supabase functions deploy cleanup-profile-photos --no-verify-jwt --project-ref ewcsgvhuojxdpaspwsrx`.
2. Run `! bash ~/asr6-worker-secrets.sh`. It makes `S=$(openssl rand -hex 32)` and never prints it. It sets `PROFILE_PHOTO_CLEANUP_SECRET="$S"` and `PROFILE_PHOTO_CLEANUP_ENABLED=false` with `supabase secrets set --project-ref ewcsgvhuojxdpaspwsrx`. It creates or updates the Vault secrets `profile_photo_cleanup_secret` (`$S`) and `profile_photo_cleanup_url` (`https://ewcsgvhuojxdpaspwsrx.supabase.co/functions/v1/cleanup-profile-photos`).
3. A POST without the secret answers 503 ("Photo cleanup disabled").

**R6. Worker acceptance with a disposable account** (approval; `qa/photo-cleanup-readiness.md` prerequisite 4).
1. On the current build, a disposable account sets a profile photo and a cover on a disposable resbite.
2. In the SQL editor, run `remove-profile-photo.sql` and `remove-resbite-content.sql` (cover only) for them. Each prints `queued true`, or `covers_queued 1`.
3. Set `PROFILE_PHOTO_CLEANUP_ENABLED=true`. POST to the function once with the bearer secret, from a script that reads it from Vault and does not print it. Expect `complete` 2.
4. Both objects are gone from Storage. Re-attaching the old cover path is refused. The account's other photos are untouched.
5. Delete the disposable account through plan 2's route.

**R7. Schedule** (the owner approves `supabase/ops/schedule-retention.sql` by sha256).
1. Run `! bash -c 'echo "<sha256>  supabase/ops/schedule-retention.sql" | sha256sum -c - && supabase db query --linked -f supabase/ops/schedule-retention.sql'`.
2. Check `select jobname, schedule, username from cron.job where jobname in ('retention-purge','cleanup-images')`. `username` must be `postgres`. If it isn't, unschedule both and paste the file into the SQL editor.
3. The next day, the "Roll job check" section of `qa/app-store-release/README.md` (`~/asr-jobs.sh`) shows both jobs active with no failures. `retention-purge` runs daily; its counts are in the Postgres logs ("resbite retention:").
4. **Stop running `supabase/ops/purge-closed-reports.sql` by hand** (`moderation-standard.md` section 4, step 6).

**R8. Roll job (C4)** (the owner approves `supabase/ops/schedule-roll-repeating-plans.sql` by sha256 `3a8202877260008723648dc4723b36aedb6d772f809b2552997765773040d74e`, `qa/creating-a-resbite-2026-10-31/README.md:30`; release runbook step 12). This is independent of R1 to R7 and may run first.
1. Run `! bash -c 'echo "3a8202877260008723648dc4723b36aedb6d772f809b2552997765773040d74e  supabase/ops/schedule-roll-repeating-plans.sql" | sha256sum -c - && supabase db query --linked -f supabase/ops/schedule-roll-repeating-plans.sql'`.
2. Then the role check and the run check from `qa/creating-a-resbite-2026-10-31/README.md:81-110`: `username` is `postgres`, and the runs succeed. A weekly test group gets its next occurrence.
3. Record it in that runbook's "Applied" and in this one.

**R9. Auth templates (C13)** (approval), only after `https://link.resbite.com/privacy` is live (release runbook step 16).
1. For each of Confirm sign up, Magic link or OTP, and Reset password, compare the dashboard's current body with its `.previous.html`. If they differ, replace the `.previous.html` with the dashboard's body in a commit first.
2. Paste the new `confirmation.html`, `email-code.html` and `recovery.html`. Subjects are unchanged.
3. Check the rendered preview. Send one confirmation to a disposable address the owner controls.
4. Record each file's sha256.

**R10. First objection.** Nothing to set up: the first `object-number.sql` run creates the Vault key inside the database. Run it only after the phone check in `data-requests.md` section 4.3.

**R11. `private.phone_rewrites`.** After the C12 decision (run or retire the Argentine rewrite), with approval: `delete from private.phone_rewrites;` in the SQL editor. Record the count, never rows.

**R12. Records.** Fill in "Applied". Tick the release runbook's step 14 C3 line and step 12's roll job line. Add the status entry.

**Rollback** (approval, before plan 2's rollback):
1. Unschedule `retention-purge` and `cleanup-images` (`select cron.unschedule(jobid) from cron.job where jobname in ('retention-purge','cleanup-images');`).
2. Set `PROFILE_PHOTO_CLEANUP_ENABLED=false`.
3. Export and empty `private.invite_objections` only if the owner decides to; until then the rollback refuses.
4. Run `supabase/rollback/20261117130000_retention_and_team_tools.rollback.sql`, after checking its sha256, wrapped in `begin;`/`commit;` through `supabase db query --linked -f`, as R3 does. The migration history is left as it is (never `migration repair --status reverted`). Record the rollback under "Applied", as `qa/creating-a-resbite-2026-10-31/README.md` "Rollback" does.
5. Deleted rows are not restored: purged records, the roster and the legacy invitations.

## Known gaps and open points

1. **Plan 2's names** (the "Shared with plan 2" section): confirmed equal by the cross-plan review of 17 November 2026; plan 2 owns the shared objects.
2. **Old builds and `'unavailable'`.** A build before Task 10 shows "Check your connection and try again." for a whole batch that holds a listed number, and invites none of it. Objections open with the site's notices, and the 1.0 build carries Task 10. Record it in the release notes for testers.
3. **An objection at the moment a host invites** can leave one new invitation. Running `object-number.sql` again removes it (its header says so).
4. **Plan ordering.** Task 8 reads plan 4's `private.terms_acceptances`, and the rehearsal passes every earlier pending candidate (plan 1's `20261117100000`, plan 2's, plan 4's `20261117120000` to `20261117122000`) before this file.
5. **VAT.** Add a VAT line to the footer if Resbite Ltd is VAT-registered, as a new template change.
6. **Hosted privileges** (`delete` on `auth.users`, `trigger` on `storage.objects`) are checked read-only at R2. The local harness cannot prove them.
