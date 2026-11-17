# Account Deletion Release Implementation Plan (App Store readiness, plan 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every Resbite account can delete itself in the app, with a fresh proof that fits how it signs in. Suspended accounts can too. Web-only, banned and under-18 accounts are deleted by an owner-run script that runs the same lifecycle. Deletion finishes within 30 days, usually minutes. It revokes Sign in with Apple, respects a legal hold, keeps what the documents say it keeps, and can be replayed after a backup restore.

**Architecture:** One hosted-compatible migration, `20261117110000_account_deletion_release.sql`. It brings the September deletion lifecycle up to date and splits it in two: a **close** step (the request row, cancellations, no more pushes) and an **erase** step (everything else). A legal hold runs only the close step and parks the job until the hold is lifted. `delete-account` stops using the throwing ledger path and calls `request_account_deletion` directly (D-4). It then revokes the Apple tokens with the authorisation code from the app's Apple re-authentication. The cleanup worker removes profile photos and covers, then the Auth user. A daily job purges receipts 30 days after completion. In the app, Delete account gains a phone-code proof and new copy, and the suspended screen gains Delete account and the support address. A written restore procedure replays deletions from a receipts export, which keeps the restore fence.

**Tech Stack:** PostgreSQL 17 / Supabase (plpgsql migrations, pg_cron, pg_net, Vault). Deno Edge Functions, tested under Node 22 with the tsx loader. Expo SDK 57 / React Native with expo-router and `expo-apple-authentication` 57. Tests use `node:test` and Playwright browser scripts.

**Spec:** `docs/superpowers/specs/2026-11-17-app-store-readiness-design.md`: section 2 (blocker 1); rows DEL-1 to DEL-8 and UGC-15; workstream B3 and B6; C2 (with its local-only files table); D8; decisions D-4, D-19 and D-20; section 6 phase 3 step 13. Also `knowledge-base/08-decisions.md`, section "App Store readiness (AS), 17 November 2026": AS-D3, AS-D8, AS-R1, AS-R2 and AS-R3. Where these differ from the spec, they win. The public promise is `docs/legal/delete-account.md`. The internal procedures are `docs/compliance/data-requests.md` section 8, `law-enforcement-requests.md` section 11 and `retention-schedule.md`.

**Branch:** `asr-2-account-deletion`, cut from `app-store-readiness` and merged back into it in the roadmap's order (`docs/superpowers/plans/2026-11-17-asr-0-roadmap.md`); or `app-store-readiness` itself when no other plan is being built at the same time. Commit and push as you go. Merging to `main` is the owner's choice.

**Tasks:** 9, then **Rollout (owner-run)**.

---

## Global Constraints

- **Hosted is owner-run.** Every hosted Supabase, Vercel, EAS, TestFlight or App Store Connect step needs the owner's explicit approval at the time. Migrations are approved by file name and sha256.
- **Never run** `supabase db push`, `supabase migration repair --status reverted` or `supabase db pull`.
- **The apply pattern:** a hash-guarded owner script runs the file with `supabase db query --linked -f` inside `begin;`/`commit;`. Then it runs `supabase migration repair --status applied 20261117110000 --linked --yes`. Snapshots come before and after, with `supabase/ops/hosted-fingerprint.sql` and `supabase/ops/hosted-counts.sql`. Each sitting is recorded in `qa/account-deletion-2026-11-17/README.md`. The model is the open beta: `supabase/migrations/20261116120000_open_beta.sql`, its rollback, its rehearsal and `qa/open-beta-2026-11-16/`.
- **Migration timestamps:** this plan owns `20261117110000` to `20261117119999` and uses only `20261117110000`. On hosted it is applied after plan 1's `20261117100000` (the test-mode retirement) and before plan 4's `20261117120000` to `20261117122000` and plan 6's `20261117130000`, so the history stays in timestamp order (roadmap).
- **Hosted-compatible migration:**
  - A function that exists on hosted is redefined from its **hosted** body, which is the latest file in `supabase/tests/hosted-baseline/migrations.txt` that defines it. Only the lines this plan names change.
  - There are two such functions. `private.require_tester()` comes from `20260917190517_resbite_private_tester_foundation.sql:94-98`. `private.deletion_pending(uuid)` comes from `20261022120000_gi2_guest_accounts.sql:60-62`.
  - Everything else the migration makes is new on hosted. It already exists locally, from the never-apply September files, so the migration must also run cleanly after them in full mode. Use `create table if not exists`, `create index if not exists`, `create or replace function`, drop-and-re-add of named constraints, and `drop function if exists`.
  - The migration needs a rollback in `supabase/rollback/`, a hosted-baseline rehearsal (`.before.sql`/`.after.sql`) and a SQL test file listed in `tests.txt`.
- **Test commands:**
  - SQL, full mode: `bash scripts/test-database-docker.sh`.
  - SQL, hosted-baseline mode: `bash scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261117110000_account_deletion_release.sql`. Name the candidate: bare, this mode fails by design until the file is live. `tests.txt` assumes every pending candidate is applied (`supabase/README.md`, "Hosted-baseline commands"), so whenever another readiness plan's migration is on the branch and not yet in `migrations.txt`, pass it too, every candidate in timestamp order (for example plan 1's `supabase/migrations/20261117100000_phone_test_mode_retired.sql` before this one). Every hosted-baseline command below means that full list.
  - Edge: `node --import ./mobile/node_modules/tsx/dist/loader.mjs --test supabase/functions/_shared/*.test.ts`, from the repository root. Linux Node has no TypeScript stripping, so `--experimental-transform-types` fails here.
  - App: `cd mobile && npm test` and `cd mobile && npm run typecheck`.
  - Linux gotchas, from the dev box notes: `mobile/expo-env.d.ts` must exist for the typecheck. `src/services/nativeImports.test.ts` may fail on the case-sensitive `ios/next` path, which is a known issue and not this plan's.
- **No secrets, real phone numbers, real people's emails or account ids in the repo.**
  - Fixtures use `4477009003xx` numbers, `*.invalid` emails and synthetic uuids.
  - The Apple `.p8` key, the worker secrets and any account id the owner types go only into private files outside the repo, the SQL editor's copy or function secrets.
  - Never create `mobile/.env.local`. No service-role key in the app.
- **Public contacts (AS-D3):** `privacy@resbite.com` for deletion and data, `support@resbite.com` for everything else. The support address in the app comes from `EXPO_PUBLIC_SUPPORT_ADDRESS`, as `mobile/app/data-privacy.tsx:28` reads it.
- **Copy:** plain British English in short sentences, with the curly apostrophe ’ as the app's strings already use it.
  - The public documents are called "Privacy Policy", "Terms of Use", "Support" and "Delete your account".
  - The promise is "within 30 days", usually a few minutes.
  - No "beta", "development build", "this build" or internal note may face a user.
- **The source gates** in `supabase/functions/_shared/deletion-release.ts` stay `false` in Tasks 1 to 9. They are flipped only in Rollout step 5, with the owner's approval (spec C2 approval list).
- **Other sessions' changes.** If `git status` shows changes you didn't make (for example in `docs/legal/` or `docs/compliance/`), another session is working. Never stage them. Ask before touching those files.
- **Commits** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Expo:** checked against https://docs.expo.dev/versions/v57.0.0/sdk/apple-authentication/. `AppleAuthenticationCredential.authorizationCode` is `string | null`, short-lived and one per sign-in. This plan changes no native module, no plugin and no `app.json`.

## Shared with the other readiness plans

These plans were written at the same time (`docs/superpowers/plans/2026-11-17-asr-*.md`). Whichever lands second rebases on the first and keeps both changes.
- **Plan 6 (C3, C6, retention and team scripts).** This plan creates the objects plan 6 shares, in plan 6's exact shape and only where absent: `private.legal_holds`, `private.account_held(uuid)` and `private.suspension_history`. It also creates the photo guard trigger plan 6 consumes. Plan 6 consumes from here:
  - `private.account_deletion_jobs` (`user_id`, `status`);
  - `private.guard_photo_write()` with `resbite_photo_write_guard`;
  - `private.operator_account_deletion(p_user uuid) returns jsonb` (AS-R3).

  Its migration runs after this one (`20261117130000`), so **this plan owns** `private.legal_holds` (with the partial indexes `legal_holds_user_idx` and `legal_holds_series_idx`), `private.account_held(uuid)` and `private.suspension_history`; plan 6's guarded DDL is word for word the same and finds them in place. Plan 6 also takes this plan's `guard_photo_write()` body as its base. Cross-checked by the controller on 17 November 2026: the names and shapes match.
  - **The photo worker's source gate.** Plan 6 flips `PHOTO_CLEANUP_RELEASE_APPROVED` in `cleanup-profile-photos/index.ts` at its rollout, so Task 6's `deletion-release.test.ts` checks that entry only while its own gate is false (below).
- **Plan 3 (B1, B4, B5).** It owns `mobile/app/data-privacy.tsx` (full rewrite), `mobile/src/domain/legal.ts` (with `PRIVACY_ADDRESS`), and the Data & privacy part of `mobile/scripts/verify-deletion.mjs` (`:37-38`, `:232-282`). This plan owns `delete-account.tsx`, the suspended branch of `account.tsx`, `accountDeletion.ts`, `accountDeletionFlow.ts`, the deletion part of `verify-deletion.mjs` and the taken-number line (B6). Plan 3's release-wording test lists this plan's three files in `B3_REWRITES` until this plan rewrites them (Task 8). Plan 3's release check (its Task 2) requires `EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED=true` in a production build, which this plan's Rollout step 8 sets.
- **Plan 4 (B2, B7, B11, C7, C8, C9).** It removes the Details chip at `account.tsx:172-179`. This plan adds a Delete account chip beside it. Plan 4 owns `SAFETY_COPY`; this plan changes only its `reportsPrivacy` string (AS-R2, Task 8). Plan 4's accept-terms screen links to `/delete-account`, so its build needs this plan's deletion live.
- **Plan 1 (C1, B12, B16).** It removes `exchangeTestCode` and adds `captchaToken` to `PhoneCodeDeps`. This plan's phone proof follows the type as it stands (Task 7). The deletion phone code needs C1 live to arrive by SMS.
- **Plan 5 (D1, D8).** Its contact form's "Delete my web-only or banned account" topic goes to privacy@resbite.com, where `supabase/ops/delete-account.sql` (Task 2) finishes the request.

## Decisions this plan makes

Record them in `knowledge-base/08-decisions.md` in Task 9, as ASR2-1 to ASR2-10.

- **ASR2-1 (D-4): one request path.**
  - `delete-account` calls `request_account_deletion`, which runs the whole close-and-erase lifecycle in one transaction.
  - The independent ledger and the prepare/activate split are retired. The TypeScript modules go: `deletion-admission.ts`, `deletion-ledger.ts`, `deletion-ledger-storage.ts` and their tests.
  - The local-only SQL objects from the never-apply files stay in the local replay, unused: `prepare_deletion_intent`, `activate_deletion_intent` and `deletion_intent_reservations`. Nothing calls them, and they never reach hosted. This keeps `deletion-intent.sql` and `gi2-rollback.sql` meaningful without rewriting them.
  - The restore fence is kept by the written restore procedure (Task 9).
- **ASR2-2: the proof follows how the account signs in.**
  - Apple linked: Apple, which is also the only way to get the code for revocation.
  - Otherwise, an email or Google account: an email code, with "Use my password instead" when it has the `email` provider.
  - Otherwise, a verified phone: an SMS code.
  - Otherwise: email `privacy@resbite.com`.
  - The server accepts `password` and `otp` for every account (Supabase records an SMS code as `otp`). It accepts `oauth` whenever the providers include `apple`. Until now it accepted `oauth` only for Apple-only accounts.
- **ASR2-3 (D-19): suspended accounts may delete in the app.** The SQL no longer asks for "not suspended", a confirmed email, a roster row or a grant. It asks only for a fresh session of this user, a confirmed email or phone, and an account that isn't anonymous. Banned, web-only and under-18 accounts go through `supabase/ops/delete-account.sql` (AS-R3).
- **ASR2-4 (UGC-15): for deletion, a legal hold is account-scoped:** a `private.legal_holds` row naming the user, with no lift time, read by `private.account_held` (plan 6's shared object).
  - A held request is still accepted. It writes the job as `held`, cancels the host's future resbites with their pushes, and deletes the account's devices and queued notices. Sessions are revoked by the Edge function as usual.
  - Everything else waits. The status the person sees reads `queued`, so it never tips anyone off.
  - Once the hold is lifted, the worker's claim runs the erase step.
  - A hold set after acceptance stops photo, cover and Auth removal. A series hold (`series_id`) is for C3's retention jobs; it does not affect deletion.
- **ASR2-5 (GR2, `qa/chat-release/README.md:1017`): two deletions are serialised** by one transaction advisory lock, `hashtextextended('account_deletion',0)`. The lock is taken after the account's own lock and before any row lock. The parked fix ("take every chat row in one sorted pass first") would take a chat row before the plans. That inverts `send_message`'s order (the plan for key share, then the chat row through the stats trigger) and would deadlock against it.
- **ASR2-6 (GR4 M-1, D-20): a deleted host's group chat stops.** In the erase step's ordered chat pass, every group chat of a series the person owns gets `stopped_at = now()` where it is null. A cancelled group then closes 48 hours later (`private.chat_closes_at`).
- **ASR2-7 (AS-R1, AS-R2).**
  - The erase step moves the account's `private.suspensions` row into `private.suspension_history`: `user_id` null, the same `report_id`, `suspended_at` the row's `at`, `ended_at` now, and `how 'account_deleted'`. That keeps the reason and the dates and drops the link, as plan 6's lifts do. C3 (plan 6) purges it 12 months after `ended_at`.
  - The erase step clears `reporter_id` on the reports the person filed instead of deleting them. The reports' `on delete cascade` stays, because the erase clears the id first.
- **ASR2-8 (DEL-4): Apple revocation happens at request time** and is best effort.
  - The steps are `/auth/token` with the authorisation code, then `/auth/revoke` on the refresh token.
  - Each call has a 5-second timeout, and the order is the deletion, then the Supabase logout, then Apple.
  - A failure never fails the deletion. The code is used only when the verified proof's providers include `apple`.
- **ASR2-9: cleanup removes both buckets under the account's folder,** `profile-photos/<uid>/` and `plan-covers/<uid>/`, then the Auth user. A job completes only when both are empty. Replaced covers of live accounts stay C3's job.
- **ASR2-10: receipts and restore.**
  - `purge-deletion-receipts` (Edge, daily cron) removes complete receipts 30 days after completion. It skips held accounts and anything with an object left.
  - Where the photo-cleanup tables exist (the local replay today, and hosted once C3 brings them), it also waits for their fences, through a `to_regclass` branch.
  - The restore procedure exports receipts from the live database before a restore. It replays them with the original request id and hash, so the person's saved receipt still resolves. The procedure states its limit: if the live database can't be read, deletions made after the backup can't be replayed. That is the accepted cost of D-4.

## Review Focus

These are the five failure modes most likely to bite a real person that the spec implies but does not test. Each has its test in the owning task.

1. **A retry after the proof has gone stale.** A person whose reply was lost reopens Delete account ten minutes later. The retry must return the accepted request, never "Fresh authentication required", and never start a second request. Task 2, `S2.6`.
2. **A legal hold set after the request was accepted**, for example by the police the next morning. The worker must leave the files and the Auth account alone, even in the middle of a claimed job. Task 3, `S6.3` and `S6.4`.
3. **An Argentine phone account.** Auth stores the key `54…` or the `549…` form, and the deletion code must go to the number sign-in uses (`phoneSendForm`). Otherwise the account gets "No Resbite account uses this number". Task 7, `deletionPhone sends to the sign-in form of the number`.
4. **Two hosts deleting at the same moment** who each wrote in the other's Edit-stopped group (GR2). Both must complete with no `40P01`. Task 2, `account-deletion-concurrency.sh` case (1).
5. **A cover file left after the Auth account is gone.** The job must stay open and the receipt must not be purged, so the file is never orphaned with no record. Task 3, `S6.6` and `S7.4`.

---

## File Structure

**Database (`supabase/`)**
- Create `migrations/20261117110000_account_deletion_release.sql`. It contains:
  - the tables: `account_deletion_jobs` (status `held`), and the objects shared with plan 6 (`legal_holds`, `account_held`, `suspension_history`);
  - the three September foreign keys;
  - the two hosted redefinitions;
  - the lifecycle functions, the worker RPCs and the receipt purge.
- Create `rollback/20261117110000_account_deletion_release.rollback.sql`, for hosted only.
- Create `tests/hosted-baseline/20261117110000_account_deletion_release.before.sql` and `.after.sql`, the rehearsal.
- Create `tests/account-deletion-release.sql`, the behaviour test, run in both modes.
- Create `tests/local/account-deletion-concurrency.sh`, full mode only.
- Modify `tests/hosted-baseline/tests.txt` (add the new test), `scripts/test-database.sh` (run the new concurrency script), `tests/deletion.sql`, `tests/security-review.sql`, `tests/gi2-rollback.sql` and `tests/chat-groups.sql` slice 2j (each to the release's facts).
- Create the owner scripts in `ops/`:
  - `delete-account.sql` (AS-R3);
  - `export-deletion-receipts.sql` and `replay-deletions.sql` (restore);
  - `schedule-account-deletion.sql` (cron).
- Modify `ops/suspend-account.sql` (its comment on the Auth ban).
- Modify `README.md` (a release section and the never-apply list).

**Edge Functions (`supabase/functions/`)**
- Create `_shared/apple-revocation.ts` and its test.
- Modify:
  - `_shared/account-deletion.ts` (proof rule, Apple code, two buckets);
  - `_shared/account-deletion-gateway.ts` (direct RPC, `revokeApple`, storage objects);
  - `_shared/account-deletion.test.ts`;
  - `_shared/deletion-release.test.ts` (gate-agnostic);
  - `delete-account/index.ts`;
  - `delete-account/README.md`;
  - `purge-deletion-receipts/README.md`.
- Delete `_shared/deletion-admission.ts`, `_shared/deletion-admission.test.ts`, `_shared/deletion-ledger.ts`, `_shared/deletion-ledger.test.ts`, `_shared/deletion-ledger-storage.ts` and `_shared/deletion-ledger-storage.test.ts`.

**App (`mobile/`)**
- Create `src/domain/deletion.ts` and `src/domain/deletion.test.ts`, with the copy, the proof rule, the phone to text and the status lines.
- Modify:
  - `src/services/appleSignIn.ts` and its test (the authorisation code);
  - `src/services/accountDeletionFlow.ts` and its test (proof, Apple code, phone deps);
  - `src/services/accountDeletion.ts` (phone proof, the Apple code to the request);
  - `src/domain/accountCopy.ts` and its test (suspended lines);
  - `src/domain/safetyCopy.ts` and its test (`reportsPrivacy`, AS-R2);
  - `app/delete-account.tsx`;
  - `app/account.tsx` (the suspended branch);
  - `src/domain/phoneCopy.ts` and `src/services/phoneCode.test.ts` (the taken-number line, B6);
  - `scripts/verify-deletion.mjs` (its deletion part, and the `REPORTS` text);
  - `.env.example` (the flag's comment);
  - `package.json` (the `test` script runs `src/domain/deletion.test.ts`).

**Records**
- Create `qa/deletion-restore-procedure.md` and `qa/account-deletion-2026-11-17/README.md`. The second holds the runbook, the owner scripts and the end-to-end test plan.
- Modify `qa/deletion-recovery-ledger.md` (retired by D-4), `docs/compliance/data-requests.md` (section 8.2 names the script) and `knowledge-base/08-decisions.md` (ASR2-1 to ASR2-10).

---

### Task 1: Migration, part 1: tables, keys, the hold and the two hosted redefinitions

**Files:**
- Create: `supabase/migrations/20261117110000_account_deletion_release.sql` (section 1)
- Create: `supabase/tests/account-deletion-release.sql` (section S1)
- Modify: `supabase/tests/hosted-baseline/tests.txt` (append `account-deletion-release.sql` after `open-beta.sql`)

**Interfaces:**
- Consumes: the hosted bodies named in Global Constraints.
- Produces, for Tasks 2 to 4 and C3/C6:
  - `private.account_deletion_jobs`, with the columns of `20260918001316_account_deletion_lifecycle.sql:2-13`. Its check `account_deletion_jobs_status_check` is `status in ('held','queued','processing','complete')`. It has RLS on and every privilege revoked from `public, anon, authenticated`. Indexes: `account_deletion_pending_idx` on `(next_attempt_at) where status<>'complete'`, and `account_deletion_completed_idx` on `(completed_at) where status='complete'`.
  - **The objects shared with plan 6** (`docs/superpowers/plans/2026-11-17-asr-6-retention-and-team-scripts.md`, "Shared with plan 2"). Use plan 6's DDL **word for word**, made only where absent (`create table if not exists`; functions under a `to_regprocedure` guard). Each gets `comment on … is 'resbite 20261117110000'` when this file creates it, so each plan's rollback drops only its own. Plan 6's migration runs after this one and then finds them in place. The objects:
    - `private.legal_holds (id bigint generated always as identity primary key, user_id uuid null, series_id uuid null, reason text not null check (reason in ('csea','intimate_image','threat','police','nca','ofcom','coroner','court','claim')), case_ref text not null check (case_ref ~ '^[A-Za-z0-9-]{1,40}$'), review_on date not null, set_at timestamptz not null default now(), lifted_at timestamptz null, check ((user_id is null) <> (series_id is null)))`. `user_id` has no foreign key, because a hold outlives the account. It has partial indexes `legal_holds_user_idx` on `(user_id)` and `legal_holds_series_idx` on `(series_id)`, both `where lifted_at is null`. RLS is on, and all is revoked from `public, anon, authenticated, service_role`.
    - `private.account_held(p_user uuid) returns boolean`: `language sql stable security definer set search_path = ''`. True when a hold not lifted names the account, and false for null. Execute is revoked from `public, anon, authenticated, service_role`. Plan 6's `series_held(uuid)` is plan 6's to create; nothing here needs it.
    - `private.suspension_history (id bigint generated always as identity primary key, user_id uuid null, report_id bigint null, suspended_at timestamptz not null, ended_at timestamptz not null, how text not null check (how in ('lifted','account_deleted')))`, with RLS on and all revoked from the three API roles. Plan 6 purges it 12 months after `ended_at` (AS-R1).
  - `private.suspensions` is **not** reshaped. The erase step (Task 2) moves an account's row into `suspension_history`.
  - Foreign keys (the September ones, re-run identically on the local replay):
    - `public.plans.owner_id` nullable, with `plans_owner_id_fkey ... on delete set null`;
    - `attendees_user_id_fkey ... on delete cascade`;
    - `private.invitations` `invitations_claimed_by_fkey ... on delete set null`.
  - `grant usage on schema private to service_role`, so the worker RPC wrappers can call their private bodies. Hosted lacks it; the local lifecycle file grants it.
  - `private.require_tester()`: the hosted body with two named changes. `stable` becomes `volatile`, and `perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,47));` becomes the first line after `begin`. That is `20260918001316:37-42`'s body.
  - `private.deletion_pending(uuid)`: the hosted body with one named change, a second line `or exists(select 1 from private.account_deletion_jobs j where j.user_id=p_user)`. That is the GI2 companion's body, `20261022120001:55-58`.

- [ ] **Step 1: Write the failing test, section S1, in `supabase/tests/account-deletion-release.sql`**

The file is one `begin; … rollback;` block in house style: `do $$ … raise exception … $$` checks, synthetic ids with prefix `dd` (users `dd000000-0000-4000-8000-0000000000NN`, plans `dd1…`, sessions `dd2…`, requests `dd3…`). Later tasks add their sections before the closing `rollback;`, and their fixtures to the opening block. Section S1 checks:
- **S1.1** `pg_get_constraintdef` of `account_deletion_jobs_status_check` contains `'held'`.
- **S1.2** The delete rules (`pg_constraint.confdeltype`): `plans_owner_id_fkey` `n`, `attendees_user_id_fkey` `c`, `invitations_claimed_by_fkey` `n`. `public.plans.owner_id` has `attnotnull` false.
- **S1.3** `obj_description('private.legal_holds'::regclass)` and `obj_description('private.suspension_history'::regclass)` each read `resbite 20261117110000` (hosted mode, where this file made them).
- **S1.4** No privilege on `private.legal_holds`, `private.suspension_history` or `private.account_deletion_jobs` for `anon`, `authenticated` or `service_role` (`has_table_privilege` SELECT/INSERT). No execute on `private.account_held(uuid)` for those three.
- **S1.5** With hold rows for users `dd…05` (unlifted, reason `police`, case `LE-1`, `review_on current_date+90`) and `dd…06` (lifted yesterday): `account_held(dd…05)` is true; `dd…06`, `dd…07` and `null` are false. A hold with both ids set, a hold with neither, a reason `other` and a case `a b` each raise `23514`.
- **S1.6** `private.deletion_pending(dd…07)` is false, then true after inserting a job row for `dd…07`.
- **S1.7** `pg_get_functiondef('private.require_tester()'::regprocedure)` contains `hashtextextended(auth.uid()::text,47)` and does not contain `STABLE`.

- [ ] **Step 2: Run it and see it fail**

Run: `bash scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261117110000_account_deletion_release.sql`
Expected: FAIL. The migration file doesn't exist yet (`psql: ... No such file`), or, once it is a stub, S1.1 raises.

- [ ] **Step 3: Write section 1 of the migration**

The header comment, in the open beta's style:
- what the file is (spec C2, D-4, D-19, D-20, UGC-15, AS-R1, AS-R2, AS-R3);
- that it is hosted-compatible, and which two bodies it redefines from which hosted file;
- that it replaces the deletion half of the never-apply files `20260918001316`, `20260923152943`, `20260929125858` and `20261022120001`;
- the rollback path.

Then the objects above, in this order:
1. `account_deletion_jobs`, then its check drop-and-re-add, then the indexes;
2. the shared objects: `legal_holds`, `account_held` and `suspension_history`;
3. the foreign keys;
4. the schema grant;
6. the two redefinitions, each preceded by a comment naming its base file and line and the changed lines.

- [ ] **Step 4: Run both modes and see S1 pass**

Run: `bash scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261117110000_account_deletion_release.sql`
Expected: `PASS: 20261117110000_account_deletion_release applies on the hosted baseline`, then `PASS: account-deletion-release.sql (hosted baseline)` and every other baseline test PASS.

Run: `bash scripts/test-database-docker.sh`
Expected: `PASS: account-deletion-release.sql` and the final `PASS: disposable SQL assertions (full)` line. Section 1 is idempotent over the local lifecycle file.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261117110000_account_deletion_release.sql supabase/tests/account-deletion-release.sql supabase/tests/hosted-baseline/tests.txt
git commit -m "Account deletion release: jobs, legal holds, suspension history and the hosted lock"
```

---

### Task 2: Migration, part 2: the request lifecycle, the team script and the races

**Files:**
- Modify: `supabase/migrations/20261117110000_account_deletion_release.sql` (section 2)
- Modify: `supabase/tests/account-deletion-release.sql` (sections S2 to S5)
- Create: `supabase/ops/delete-account.sql`, `supabase/tests/local/account-deletion-concurrency.sh`
- Modify: `scripts/test-database.sh` (run the new script after `chat-safety-concurrency.sh`), `supabase/ops/suspend-account.sql:10-11` (comment only)
- Modify: `supabase/tests/deletion.sql:23-28`, `supabase/tests/security-review.sql:5-8`, `supabase/tests/gi2-rollback.sql:34-48`, `supabase/tests/chat-groups.sql:1361-1385` (slice 2j, which pins the parked M-1 behaviour)

**Interfaces:**
- Consumes: Task 1's tables, `account_held` and `deletion_pending`.
- Produces:
  - `private.queue_account_deletion(p_user uuid, p_request uuid, p_recovery_hash bytea) returns jsonb`. The caller already holds `hashtextextended(p_user::text,47)`. It returns `{"requestId", "status"}` with the true status (`held` included). It is idempotent per request: the same request and hash return the existing job, and a different one raises `22023 'Deletion already requested'`. No grants.
  - `private.close_account(p_user uuid, p_request uuid) returns void`: the cancellations. No grants.
  - `private.erase_account(p_user uuid) returns void`: the erase step. No grants.
  - `private.request_account_deletion(p_user uuid, p_session uuid, p_request uuid, p_recovery text) returns jsonb` and its `public.` wrapper (`security invoker`). Both are executable by `service_role` only. It answers `{"requestId","status"}` with `held` read as `queued`.
  - `private.account_deletion_status(p_request uuid, p_recovery text) returns jsonb` and its `public.` wrapper, `service_role` only. `held` reads as `queued`.
  - `private.operator_account_deletion(p_user uuid) returns jsonb`: no grants. It takes the user lock and raises `22023 'No such account'` when `auth.users` has no row. If the account already has a job, it returns that job's `{"requestId","status"}`, so running the script twice is safe. Otherwise it queues with a random request id and `extensions.digest(encode(extensions.gen_random_bytes(32),'hex'),'sha256')`, and returns the true status.
  - `private.replay_account_deletion(p_user uuid, p_request uuid, p_recovery_hash bytea) returns text`: no grants. It answers `'gone'` (no Auth user), `'present'` (any job for the user) or `'replayed'`.

**The lifecycle** (the algorithm, from the open beta body `20261116120000_open_beta.sql:208-273`):

```text
request_account_deletion: validate the args as :212-213 → user lock (:214) → existing job? return it (:215-220,
  held read as queued) → session fresh as :223, and auth.users row with (email_confirmed_at or phone_confirmed_at)
  and not is_anonymous, else 42501 'Fresh eligible authentication required' → queue(p_user, p_request, digest(p_recovery))
queue_account_deletion: existing job? same request+hash → return it; else 22023 → pg_advisory_xact_lock(
  hashtextextended('account_deletion',0)) (ASR2-5) → set_config('resbite.system','deletion',true) (:228) →
  held := account_held(p_user) → insert job (status held|queued) → close_account → if held: delete
  device_endpoints and notification_outbox(recipient) of p_user, else erase_account → return {requestId, status}
close_account: :233-239 only (lock the owned plans by id for update; cancel each active future one with version+1 and
  its plan_cancelled notices, dedupe 'deletion:'||request||':'||plan||':'||guest)
erase_account: :230-231 (roster, profile) → the owned-plans loop again with :240-241 only (place, invitations) →
  :243-249 → :253-254 (blocks) → reports: update set reporter_id=null where reporter_id=p_user (AS-R2, replaces :255)
  → :256-257 → suspensions: insert into suspension_history(user_id,report_id,suspended_at,ended_at,how) the row's
  (null, report_id, at, now(), 'account_deleted'), then delete it from suspensions (AS-R1) → the ordered
  chat pass of :263-264 widened to also take every group chat of a series p_user owns, then update those chats
  stopped_at=now() where is_group and stopped_at is null (ASR2-6) → :265-271
```

- [ ] **Step 1: Write the failing tests, sections S2 to S5**

The cast is set up in the file's opening block, seeded under `set_config('resbite.system','roll',false)`, as `chat-groups.sql`'s `pg_temp.e6_cast()` does, so seeding writes no chat line:
- `01` Hana: phone-only (`447700900301`, confirmed, no email). She has a profile, a fresh session `dd2…01` and a device endpoint. She owns:
  - plan `dd1…01`, a one-off tomorrow, with `02` accepted and two messages by `01` in its chat;
  - plan `dd1…02`, a weekly group occurrence next week, with `repeat_weeks 1` and its chat row `is_group`;
  - plan `dd1…03`, a one-off that ended yesterday, titled `Past title` with place `Hall`.
  - She has also filed an open report about `02`.
- `02` Gus: email confirmed.
- `03` Sam: phone-only and suspended. He has a revoked `beta_access` row, a suspension row with a `report_id` (an open report by `02` about `03`) and a fresh session.
- `04` Ana: `is_anonymous`, with a fresh session.
- `05` Hal: phone-only, with a profile, one message in `dd1…01`'s chat (he is a guest there), an unlifted hold, a fresh session and a device endpoint.
- `06` Ben: email confirmed, `banned_until` tomorrow, no session.
- `08` Rae: email confirmed, no job.

S2, requests:
- **S2.1** As `authenticated` (claims `01`), `public.request_account_deletion(...)` raises `42501`.
- **S2.2** As `service_role`, `01` with a session id not in `auth.sessions` raises `42501`. With a session created `now()-interval '6 minutes'` it raises `42501`. `04` raises `42501`.
- **S2.3** `01` with `dd2…01` and request `dd3…01`, `repeat('a',64)` answers exactly `{"requestId":"dd300000-0000-4000-8000-000000000001","status":"queued"}`.
- **S2.4** The same call again answers the same.
- **S2.5** Request `dd3…09` for `01` raises `22023` with message `Deletion already requested`.
- **S2.6** (Review Focus 1) Update `dd2…01`'s `created_at` to `now()-interval '1 hour'`; the S2.3 call answers the same `queued` answer. The count of `01`'s jobs is 1.
- **S2.7** (D-19) `03` answers `queued`.

S3, the effects on `01` (D-20, ASR2-6, AS-R2):
- **S3.1** `dd1…01` is `cancelled` with `version` one higher. Exactly one `plan_cancelled` row goes to `02` with `dedupe_key = 'deletion:dd300000-0000-4000-8000-000000000001:dd100000-0000-4000-8000-000000000001:dd000000-0000-4000-8000-000000000002'`, and none to `01`.
- **S3.2** `dd1…02` is `cancelled`. Its chat's `stopped_at` is not null, and `private.chat_closes_at('dd1…02') = stopped_at + interval '48 hours'`.
- **S3.3** `dd1…03` stays `active`, with title `Resbite` and place `Meeting place removed`.
- **S3.4** `01`'s profile is `Deleted member`, with a null avatar and `deletion_requested_at` set.
- **S3.5** `01`'s two messages have `body` null, `author_id` null and state `deleted`.
- **S3.6** `01`'s report about `02` still exists, with `reporter_id` null.
- **S3.7** `01` has no device endpoint, no outbox row as recipient and no attendee row.
- **S3.8** As `authenticated` with claims `01`, `select count(*) from public.plans` is 0. `public.save_profile('Back')` raises `42501`.

S4, suspension (AS-R1):
- **S4.1** `private.suspensions` has no row for `03`. `private.suspension_history` has exactly one new row with `user_id` null, the report's `report_id`, `suspended_at` equal to the old row's `at`, and `how 'account_deleted'`.
- **S4.2** After `delete from auth.users where id=03`, that history row still exists.

S5, hold, team and replay:
- **S5.1** `05` answers `queued`. The job's status is `held`. `account_deletion_status(dd3…05, repeat('e',64))->>'status'` is `queued`.
- **S5.2** `05`'s profile name is still `Hal` and the message body is unchanged. `05` has no device endpoint. `private.user_eligible(05)` is false.
- **S5.3** `private.operator_account_deletion(06)->>'status'` is `queued` and a job exists. `operator_account_deletion('dd000000-0000-4000-8000-000000000099')` raises `22023`.
- **S5.4** `private.replay_account_deletion(08, 'dd3…08', extensions.digest(repeat('b',64),'sha256'))` is `replayed`, and `account_deletion_status('dd3…08', repeat('b',64))->>'status'` is `queued`. Again, it is `present`. For `dd…99` it is `gone`.
- **S5.5** Run `supabase/ops/delete-account.sql`'s text with `08`'s id substituted for the placeholder. Load it with `\set dd_script \`sed -e 's/00000000-0000-0000-0000-000000000000/<08>/' :'resbite_repo'/supabase/ops/delete-account.sql\`` and run it through a `pg_temp.dd_run(text) returns jsonb` helper, as `chat-safety.sql` runs `suspend-account.sql`. It answers one row whose `request->>'requestId'` is `dd3…08`, the replayed job, and no second job is made. Then run it with `dd…99`: it raises `22023`.
- **S5.6** No execute on `queue_account_deletion`, `close_account`, `erase_account`, `operator_account_deletion` or `replay_account_deletion` for `anon`, `authenticated` or `service_role`. `service_role` may execute both `request_account_deletion` and both `account_deletion_status`.

- [ ] **Step 2: Run them and see them fail**

Run: `bash scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261117110000_account_deletion_release.sql`
Expected: FAIL at S2.1 or S2.3 (`function public.request_account_deletion(...) does not exist` on the baseline).

- [ ] **Step 3: Write section 2 of the migration**

The functions follow the algorithm above.
- Bodies copy the open beta lines named there word for word, apart from the named changes.
- Each function is `security definer set search_path=''`.
- `revoke all ... from public, anon, authenticated` on every new one. Add `service_role` for the five internal ones.
- `grant execute ... to service_role` on the request and status pairs. This reverses the GI2 companion's revoke at `20261022120001:133`.

- [ ] **Step 4: Write `supabase/ops/delete-account.sql`**

Header in `suspend-account.sql`'s style:
- OWNER-RUN, NOT A MIGRATION, AS-R3.
- For web-only, banned and under-18 accounts, after `data-requests.md` section 4's identity check and a legal-hold check.
- Paste it into the SQL editor and put the account id in the editor's copy only.
- It prints the request id. Keep that in the request log, never here.
- To check later: `select status, completed_at from private.account_deletion_jobs where request_id = '<id>'`.
- Never delete the user from the Auth dashboard instead.

The body:

```sql
with input(user_id) as (values ('00000000-0000-0000-0000-000000000000'::uuid))
select private.operator_account_deletion(i.user_id) as request from input i;
```

- [ ] **Step 5: Change the three older tests and the suspend comment**

- `deletion.sql:25-26`: replace the "Retired deletion RPC open to service_role" block with a check that `service_role` **has** execute on `public.request_account_deletion(uuid,uuid,uuid,text)`.
- `security-review.sql:5`: the name list has `deletion_storage_objects` in place of `deletion_photo_paths`, plus `purge_completed_deletion_receipts`. `:7-8`: every listed worker RPC is executable by `service_role`, and the comment says why (D-4).
- `gi2-rollback.sql:37-48`: the pre-state reads `request_account_deletion` like `'%queue_account_deletion%'` in place of `access_suspended`, and `service_role` **has** execute on the public wrapper. The `prepare_deletion_intent` line is unchanged (ASR2-1).
- `chat-groups.sql` slice 2j (`:1361-1385`) pins the parked GR4 M-1 gap, which ASR2-6 closes:
  - The comment says the deletion now writes the stop time.
  - `:1376`: `closes_at` equals `(select stopped_at from public.chats where series_id=pg_temp.e6p('01')) + interval '48 hours'`, and `"open":true` still holds.
  - `:1377-1378`: no line is written, but `stopped_at` is **not** null.
  - `:1382-1384`: the roll leaves `stopped_at` as the deletion wrote it (save it before the roll and compare), and the chat is still open.
- `suspend-account.sql:10-11`: replace "The release runbook adds the owner's own step: ban the account in the Auth dashboard." with "Ban the account in the Auth dashboard only where docs/compliance/moderation-standard.md says so: a banned account can't sign in, so it can't delete itself in the app and is deleted with supabase/ops/delete-account.sql (D-19, AS-R3)."

`deletion.sql:56-62` (the worker part) is Task 3's: until then the local `deletion_photo_paths` and the September `finish_account_deletion` still serve it.

- [ ] **Step 6: Write `supabase/tests/local/account-deletion-concurrency.sh`**

Model it on `chat-groups-concurrency.sh` (the same helpers `wait_for` and `no_deadlock`, and the header style). Ids are prefixed `d3`, and everything it commits is deleted at the end.
- **(1) GR2, three runs.** X and Y each own an Edit-stopped group with a future occurrence. That means `repeat_weeks` null and a chats row with `is_group true`, `stopped_at` set. Each wrote a message in the other's group chat, and they are connected.
  - A holder session locks the X–Y connection row for 2 seconds.
  - X's deletion is started and waits on that row.
  - Y's deletion is started. Assert it waits with `wait_event='advisory'`.
  - Expected: both exit 0, no `40P01` or `deadlock` in either log, and 2 jobs.
- **(2) A deletion racing a send in the host's group.** H owns a weekly group with a future occurrence and G is in its chat.
  - A holder locks the group's chats row (`for update`) for 2 seconds.
  - G's `public.send_message` starts and waits.
  - H's deletion starts and waits on the plan.
  - Expected: no deadlock. G's message is stored with its body. H's job exists, and the chat's `stopped_at` is set.

- [ ] **Step 7: Run both modes and see them pass**

Run: `bash scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261117110000_account_deletion_release.sql`
Expected: every baseline test PASS, `account-deletion-release.sql` among them. The guarded deletion slices of `connections.sql`, `circles-of-trust.sql`, `chat.sql`, `chat-groups.sql` and `chat-safety.sql` now run and still pass.

Run: `bash scripts/test-database-docker.sh`
Expected: all PASS, including `PASS: two account deletions at once ... (3 runs, no deadlock)` and the send race line from the new script, plus every existing concurrency script.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20261117110000_account_deletion_release.sql supabase/tests/account-deletion-release.sql supabase/ops/delete-account.sql supabase/ops/suspend-account.sql supabase/tests/local/account-deletion-concurrency.sh scripts/test-database.sh supabase/tests/deletion.sql supabase/tests/security-review.sql supabase/tests/gi2-rollback.sql supabase/tests/chat-groups.sql
git commit -m "Account deletion release: one request path for every account, legal holds, team deletions and replays"
```

---

### Task 3: Migration, part 3: the worker RPCs, the receipt purge and the cron script

**Files:**
- Modify: `supabase/migrations/20261117110000_account_deletion_release.sql` (section 3)
- Modify: `supabase/tests/account-deletion-release.sql` (sections S6, S7)
- Create: `supabase/ops/schedule-account-deletion.sql`
- Modify: `supabase/tests/deletion.sql:56-62` (the worker part, to the two buckets)

**Interfaces:**
- Consumes: Task 2's `erase_account` and Task 1's `account_held`.
- Produces:
  - `private.claim_account_deletions(p_limit integer default 5) returns jsonb`, with its public wrapper, for `service_role`.
    - First it resumes up to 5 `held` jobs whose user has no active hold, oldest first. For each, it takes the user lock with `pg_try_advisory_xact_lock`, then the `'account_deletion'` lock the same way, skipping the job if either is busy. It sets `resbite.system` to `deletion`, runs `erase_account`, and sets the job to `queued` with `next_attempt_at=now()`.
    - Then it claims like `20260918001316:91-98`, but only `queued` or `processing` jobs whose user has no active hold.
    - It returns the same JSON shape: `requestId`, `userId`, `leaseId`, `attempts`.
  - `private.deletion_storage_objects(p_request uuid, p_lease uuid) returns jsonb`, with its public wrapper, for `service_role`.
    - It checks the lease as `20260918001316:104-105`.
    - It raises `42501 'Deletion on hold'` when the user has an active hold.
    - It returns at most 100 `{"bucket","name"}` from `storage.objects` where `bucket_id in ('profile-photos','plan-covers')` and `name like user_id||'/%'`, ordered by bucket then name.
    - Drop `public.deletion_photo_paths(uuid,uuid)` and `private.deletion_photo_paths(uuid,uuid)` if they exist.
  - `private.finish_account_deletion(p_request uuid, p_lease uuid, p_complete boolean) returns boolean`, with its public wrapper, for `service_role`. It is `20260918001316:111-124`, with the completion check also covering `plan-covers`.
  - `private.guard_photo_write()` and the trigger `resbite_photo_write_guard` on `storage.objects`, as `20260918001316:134-142`. Plan 6 consumes them. Both are created **only where absent**: the function under a `to_regprocedure` guard, and the trigger when `pg_trigger` has no row of that name on `storage.objects`. The full local replay keeps `20260923152816`'s stronger body. Both are commented `resbite 20261117110000` when made here.
  - `private.purge_completed_deletion_receipts(p_limit integer default 100) returns integer`, with its public wrapper, for `service_role`. It is `20260923152943:8-32`'s candidates, with these changes:
    - add `and not private.account_held(j.user_id)`;
    - the storage check covers both buckets;
    - the two photo-cleanup `not exists` lines (`:19-20`) are kept only in an `if pg_catalog.to_regclass('private.profile_photo_cleanup_jobs') is not null then … else … end if` branch (ASR2-10). The statement is written twice, once with them and once without.
- `schedule-account-deletion.sql` schedules `cleanup-account` every 5 minutes (`*/5 * * * *`) and `purge-deletion-receipts` daily (`32 3 * * *`; plan 1's `sms-records-sweep` takes `17 3 * * *` and plan 6's `retention-purge` `47 3 * * *`). It reads the Vault secrets `cleanup_account_url`, `cleanup_account_secret`, `purge_deletion_receipts_url` and `purge_deletion_receipts_secret`.

- [ ] **Step 1: Write the failing tests, sections S6 and S7**

S6, the worker. **S6.0** As `postgres` with `request.jwt.claims` naming `01` (whose job exists), `insert into storage.objects(bucket_id,name) values ('profile-photos','<01>/late.jpg')` raises `42501`. A late upload can't land in a deleting account; the guard runs `require_tester` in both modes. `01`'s request from S2 is used. Add to the opening block, before S2, the objects `profile-photos/<01>/a.jpg` and `plan-covers/<01>/<dd1…01>/c.jpg`. They must come before the request, because in full mode the local-only photo guard (`20260923152816:32-54`) refuses `profile-photos` writes once a job exists.
- **S6.1** `public.claim_account_deletions(5)` (as `service_role`) returns `01`'s job and not `05`'s (held). A second call while the lease is live does not return `01` again.
- **S6.2** `public.deletion_storage_objects(dd3…01, lease)` returns exactly `[{"bucket":"plan-covers","name":"<01>/<dd1…01>/c.jpg"},{"bucket":"profile-photos","name":"<01>/a.jpg"}]`.
- **S6.3** (Review Focus 2) In a savepoint, insert an unlifted hold for `01`. `deletion_storage_objects(dd3…01, lease)` raises `42501`. After the lease time passes (`update … set lease_until=now()-interval '1 second'`), `claim_account_deletions(5)` does not return `01`. Roll back to the savepoint.
- **S6.4** Lift `05`'s hold (`update private.legal_holds set lifted_at=now()`). `claim_account_deletions(5)` returns `05`'s job. `05`'s profile is now `Deleted member`, and its message body is null.
- **S6.5** `finish_account_deletion(dd3…01, lease, true)` raises `22023`. After deleting both objects and `delete from auth.users where id=01`, it returns true. The status is `complete`, and every plan `dd1…01` to `dd1…03` has `owner_id` null.
- **S6.6** (Review Focus 5) For `05`: delete the Auth user but leave a `plan-covers/<05>/x/c.jpg` object. `finish_account_deletion(dd3…05, its lease, true)` raises `22023`.

S7, receipts:
- **S7.1** As `anon` and as `authenticated`, `public.purge_completed_deletion_receipts()` raises `42501`. `purge_completed_deletion_receipts(0)` raises `22023`.
- **S7.2** Insert complete receipts for absent users, with `completed_at` at `now()-31 days` (`r1`), `now()-29 days` (`r2`), and `now()-60 days` with an unlifted hold on its user (`r3`). The purge returns 1, and only `r1` is gone.
- **S7.3** `account_deletion_status(r1's request, its token)` is null.
- **S7.4** (Review Focus 5) `05`'s receipt, set `complete` with `completed_at` at `now()-60 days` while its cover object stays, is not purged.

- [ ] **Step 2: Run them and see them fail**

Run: `bash scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261117110000_account_deletion_release.sql`
Expected: FAIL at S6.1 (`function public.claim_account_deletions(integer) does not exist`).

- [ ] **Step 3: Write section 3 of the migration and the cron script, and change `deletion.sql`'s worker part**

`deletion.sql:60-62`: `public.deletion_storage_objects(...)` has 2 entries, the profile photo and the cover. Delete both objects with `delete from storage.objects where name like '41000000-0000-4000-8000-000000000001/%'`.

Use the bodies and grants as in Interfaces. For the wrappers, revoke from `public, anon, authenticated` and grant to `service_role`.

`schedule-account-deletion.sql` follows `supabase/ops/schedule-deliver-notifications.sql` line for line:
- the OWNER-RUN header;
- its prerequisites: the two functions deployed with `verify_jwt = false`, and the four Vault secrets whose values equal the functions' `ACCOUNT_CLEANUP_SECRET` and `ACCOUNT_RECEIPT_PURGE_SECRET`;
- its undo, `select cron.unschedule('cleanup-account'); select cron.unschedule('purge-deletion-receipts');`;
- an idempotent unschedule, then two `cron.schedule` calls posting `'{}'` with a 10-second timeout.

It is not in any test list.

- [ ] **Step 4: Run both modes and see them pass**

Run: `bash scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261117110000_account_deletion_release.sql`
Expected: all PASS.

Run: `bash scripts/test-database-docker.sh`
Expected: all PASS. That includes `deletion-receipt-retention.sql` and `photo-cleanup.sql`, whose photo fences take the `to_regclass` branch, and `deletion.sql` with this step's change.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261117110000_account_deletion_release.sql supabase/tests/account-deletion-release.sql supabase/ops/schedule-account-deletion.sql supabase/tests/deletion.sql
git commit -m "Account deletion release: covers and photos in cleanup, holds in the worker, 30-day receipts and the schedule"
```

---

### Task 4: The rollback, the hosted-baseline rehearsal and the README

**Files:**
- Create: `supabase/rollback/20261117110000_account_deletion_release.rollback.sql`
- Create: `supabase/tests/hosted-baseline/20261117110000_account_deletion_release.before.sql` and `.after.sql`
- Modify: `supabase/README.md` (append the section "## Account deletion release (C2): local, not deployed")

**Interfaces:**
- Consumes: everything Tasks 1 to 3 made.
- Produces: the rollback for hosted.
  - **Its guard** refuses with `42501 'A deletion has run on this project: roll back by hand'` when any of these hold:
    - `private.account_deletion_jobs` has a row;
    - `private.legal_holds` or `private.suspension_history` has a row;
    - `public.plans` has a row with `owner_id` null.
  - **Otherwise it**, in this order:
    1. drops the six public wrappers and every private function this file created;
    2. restores `require_tester` (foundation body) and `deletion_pending` (GI2 body) with `create or replace`, so their grants are kept;
    3. drops `legal_holds` and `account_deletion_jobs`;
    4. puts back the three foreign keys (no `on delete` rule) and `plans.owner_id not null`;
    5. drops `resbite_photo_write_guard` and `private.guard_photo_write()`, and `legal_holds`, `account_held` and `suspension_history`, each only when its comment reads `resbite 20261117110000`;
    6. `revoke usage on schema private from service_role`.
  - The open beta rollback runs after it. It finds `request_account_deletion` gone and skips it (`20261116120000_open_beta.rollback.sql:9-11`).

- [ ] **Step 1: Write the rehearsal `.before.sql`**

Model it on `20261116120000_open_beta.before.sql`. Fixtures use prefix `ad`.
- Snapshot `require_tester()` and `deletion_pending(uuid)` with their definitions and `proacl` into `private.adr_rehearsal_functions`, with RLS enabled.
- Fixtures:
  - `ad…01` is phone-only, with a profile, a session and a future one-off with `ad…02` as guest;
  - `ad…03` is phone-only and suspended (a revoked `beta_access` row), with a session.
- Pre-state checks:
  - `to_regclass('private.account_deletion_jobs')`, `to_regclass('private.legal_holds')` and `to_regprocedure('private.request_account_deletion(uuid,uuid,uuid,text)')` are null;
  - `plans_owner_id_fkey` and `attendees_user_id_fkey` have `confdeltype` `a`;
  - `to_regclass('private.suspension_history')` is null and no trigger `resbite_photo_write_guard` exists;
  - in a sub-block, `delete from auth.users where id='ad…01'` raises `23503` (`foreign_key_violation`). Today a host with guests can't be removed at all.

- [ ] **Step 2: Write `.after.sql`**

1. **Named edits.**
   - For `require_tester()`, apply in order the replacement of `' STABLE SECURITY DEFINER'` by `' SECURITY DEFINER'`, and the insertion of the lock line after `begin` (as `pg_get_functiondef` prints it).
   - For `deletion_pending(uuid)`, insert the job line.
   - Each old string occurs exactly once in the snapshot. The result equals the live definition, and `proacl` is unchanged. This is the open beta after-file's check, with a list of edits per signature.
2. **New objects and privileges.** As S1.4 and S5.6. `service_role` executes exactly the six public wrappers and their six private bodies.
3. **Behaviour on hosted-shaped data.**
   - `ad…01`'s request as `service_role` answers `queued`, and the one-off is cancelled with one `plan_cancelled` row for `ad…02`.
   - `ad…03` (suspended) answers `queued`.
   - `delete from auth.users where id='ad…01'` now succeeds, and the plan's `owner_id` is null.
4. **The rollback, inside `begin; … rollback;`.**
   - Running `\ir ../../rollback/20261117110000_account_deletion_release.rollback.sql` in a sub-block raises `42501`.
   - Then delete the jobs and the plans with a null owner, and run it again. It succeeds.
   - Each snapshotted function equals its snapshot, with the same `proacl`.
   - `request_account_deletion`, `legal_holds` and `account_deletion_jobs` are gone.
   - The foreign keys read `a` again. `suspension_history`, `account_held` and the photo guard are gone.
5. **Clean-up.** Delete every `ad…` fixture and `drop table private.adr_rehearsal_functions`.

- [ ] **Step 3: Run the rehearsal and see it fail**

Run: `bash scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261117110000_account_deletion_release.sql`
Expected: the before checks pass and the migration applies. Then `.after.sql` fails at its `\ir` of the rollback, because the file doesn't exist yet (`No such file or directory`).

- [ ] **Step 4: Write the rollback file**

Its header lists what is lost and the order: this file first, then the open beta's. The body is as in Interfaces.

- [ ] **Step 5: Run hosted-baseline mode and see it pass**

Run: `bash scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261117110000_account_deletion_release.sql`
Expected: `PASS: 20261117110000_account_deletion_release applies on the hosted baseline`, then every baseline test PASS, and the synthetic roster empty.

- [ ] **Step 6: Write the README section**

In `supabase/README.md`:
- the file, rollback, rehearsal and tests;
- the never-apply list: `20260918001316`, `20260923152943` and `20260929125858`, and the deletion half of `20261022120001` (its push half was already never-apply), each with "replaced by `20261117110000`";
- `20260923152816` (photo cleanup) is for C3;
- the three owner scripts;
- the hosted-baseline command with the candidate.

- [ ] **Step 7: Commit**

```bash
git add supabase/rollback/20261117110000_account_deletion_release.rollback.sql supabase/tests/hosted-baseline/20261117110000_account_deletion_release.before.sql supabase/tests/hosted-baseline/20261117110000_account_deletion_release.after.sql supabase/README.md
git commit -m "Account deletion release: rollback, hosted-baseline rehearsal and README"
```

---

### Task 5: Apple token revocation (Edge)

**Files:**
- Create: `supabase/functions/_shared/apple-revocation.ts`
- Test: `supabase/functions/_shared/apple-revocation.test.ts`

**Interfaces:**
- Produces:

```ts
export type AppleRevocationConfig = { teamId: string; keyId: string; clientId: string; privateKeyPem: string };
export function appleRevocationConfig(get: (name: string) => string | undefined): AppleRevocationConfig | null;
export async function appleClientSecret(config: AppleRevocationConfig, nowSeconds: number): Promise<string>;
export async function revokeAppleAuthorization(
  code: string,
  config: AppleRevocationConfig,
  fetcher?: typeof fetch,
  now?: () => number,
): Promise<"revoked" | "failed">;
```

- `appleRevocationConfig` reads `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_CLIENT_ID` and `APPLE_PRIVATE_KEY`.
  - It returns null unless all four are set, the team and key ids match `/^[A-Z0-9]{10}$/`, the client id matches `/^[A-Za-z0-9.-]{1,255}$/`, and the key contains `-----BEGIN PRIVATE KEY-----`.
  - The literal two characters `\n` in the key are turned into newlines, because a one-line secret is how the owner sets it.
- `appleClientSecret` makes a compact ES256 JWS:
  - header `{"alg":"ES256","kid":keyId}`;
  - claims `{"iss":teamId,"iat":now,"exp":now+300,"aud":"https://appleid.apple.com","sub":clientId}`;
  - the key imported as `pkcs8` / ECDSA P-256 with WebCrypto, and the signature the raw 64-byte `r||s`, base64url.
- `revokeAppleAuthorization`:
  - refuses a `code` not matching `/^[A-Za-z0-9._-]{1,1024}$/` with no network call;
  - POSTs `application/x-www-form-urlencoded` to `https://appleid.apple.com/auth/token` with `client_id`, `client_secret`, `code` and `grant_type=authorization_code`;
  - then to `https://appleid.apple.com/auth/revoke` with `client_id`, `client_secret`, `token` (the `refresh_token`, else the `access_token`) and `token_type_hint` (`refresh_token` or `access_token`);
  - gives each call `AbortSignal.timeout(5000)` and `redirect: "error"`;
  - never throws, logs nothing and reads no error body.

- [ ] **Step 1: Write the failing tests**

```ts
test("config is null until all four values are set, and takes a key with escaped newlines", () => { /* … */ });
// assert.equal(appleRevocationConfig(get({...all, APPLE_KEY_ID: undefined})), null);
// assert.equal(appleRevocationConfig(get({...all, APPLE_TEAM_ID: "short"})), null);
// assert.ok(appleRevocationConfig(get({...all, APPLE_PRIVATE_KEY: pem.replace(/\n/g, "\\n")}))!.privateKeyPem.includes("\n"));
test("the client secret is an ES256 JWT Apple can verify", async () => { /* … */ });
// key from crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"}, true, ["sign","verify"]), exported pkcs8 → PEM;
// header deepEqual {alg:"ES256",kid:"ABCDEFGHIJ"}; claims deepEqual {iss:"TEAMID1234",iat:1000,exp:1300,
// aud:"https://appleid.apple.com",sub:"com.resbite.app"}; crypto.subtle.verify(ECDSA SHA-256, publicKey, sig, data) === true
test("revocation exchanges the code, then revokes the refresh token", async () => { /* … */ });
// fetcher records two calls: [0] url ".../auth/token", form grant_type=authorization_code, code="c.abc-1", client_id;
// [1] url ".../auth/revoke", form token="r-token", token_type_hint="refresh_token"; result "revoked"; both had a signal
test("a refused exchange revokes nothing and answers failed; a thrown fetch answers failed", async () => { /* … */ });
// token endpoint 400 → "failed", 1 call; fetcher throws → "failed"; revoke endpoint 500 → "failed"
test("a code that isn't Apple's shape is refused before any call", async () => { /* … */ });
// for "", "a b", "x".repeat(1025): "failed" and 0 calls
```

- [ ] **Step 2: Run them and see them fail**

Run: `node --import ./mobile/node_modules/tsx/dist/loader.mjs --test supabase/functions/_shared/apple-revocation.test.ts`
Expected: FAIL with `Cannot find module './apple-revocation.ts'`.

- [ ] **Step 3: Implement `apple-revocation.ts`**

Use only WebCrypto, `fetch`, `btoa`, `atob` and `TextEncoder`, so it runs in Deno and Node alike. PEM to DER means stripping the header and footer lines and the whitespace, then `atob`.

- [ ] **Step 4: Run them and see them pass**

Run: `node --import ./mobile/node_modules/tsx/dist/loader.mjs --test supabase/functions/_shared/apple-revocation.test.ts`
Expected: `# pass 5`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/apple-revocation.ts supabase/functions/_shared/apple-revocation.test.ts
git commit -m "Account deletion: revoke Sign in with Apple tokens with the authorisation code"
```

---

### Task 6: The rewired entry point, the two-bucket cleanup and the retired ledger (Edge)

**Files:**
- Modify:
  - `supabase/functions/_shared/account-deletion.ts:11-31` (types), `:34-54` (`freshIdentity`), `:105-112` (body), `:145-159` (request), `:162-201` (cleanup);
  - `supabase/functions/_shared/account-deletion-gateway.ts` (whole file);
  - `supabase/functions/delete-account/index.ts`;
  - `supabase/functions/_shared/account-deletion.test.ts`;
  - `supabase/functions/_shared/deletion-release.test.ts`;
  - `supabase/functions/delete-account/README.md` (rewrite);
  - `supabase/functions/purge-deletion-receipts/README.md` (remove the ledger condition, name the cron).
- Delete: `supabase/functions/_shared/deletion-admission.ts`, `deletion-admission.test.ts`, `deletion-ledger.ts`, `deletion-ledger.test.ts`, `deletion-ledger-storage.ts`, `deletion-ledger-storage.test.ts`.

**Interfaces:**
- Consumes: Task 5's `AppleRevocationConfig`, `appleRevocationConfig` and `revokeAppleAuthorization`, and the SQL wrappers of Tasks 2 and 3.
- Produces:

```ts
export type DeletionGateway = {
  verify: (accessToken: string) => Promise<VerifiedIdentity>;
  request: (userId: string, sessionId: string, requestId: string, recoveryToken: string) => Promise<DeletionStatus>;
  status: (requestId: string, recoveryToken: string) => Promise<DeletionStatus | null>;
  revoke: (accessToken: string) => Promise<void>;
  /** Best effort; resolves whether or not Apple answered. */
  revokeApple: (authorizationCode: string) => Promise<void>;
};
export type DeletionBucket = "profile-photos" | "plan-covers";
export type StoredObject = { bucket: DeletionBucket; name: string };
export type CleanupGateway = {
  claim: () => Promise<DeletionJob[]>;
  storageObjects: (job: DeletionJob) => Promise<StoredObject[]>;
  removeObjects: (bucket: DeletionBucket, names: string[]) => Promise<void>;
  deleteAuth: (userId: string) => Promise<void>;
  finish: (job: DeletionJob, complete: boolean) => Promise<boolean>;
};
export function accountDeletionGateway(
  url: string, serviceKey: string, fetcher?: typeof fetch, apple?: AppleRevocationConfig | null,
): { request: DeletionGateway; cleanup: CleanupGateway };
```

- `freshIdentity`: the methods are `["password","otp"]`, plus `"oauth"` when `providers.includes("apple")` (ASR2-2). The window is unchanged.
- The handler:
  - An optional `appleAuthorizationCode` that is present must be a string matching `/^[A-Za-z0-9._-]{1,1024}$/`, else `400 {"error":"Invalid request"}` before any backend call.
  - After `gateway.request` succeeds: `await gateway.revoke(body.proof).catch(() => {})`. Then, only if a code was sent and `identity.providers.includes("apple")`: `await gateway.revokeApple(code).catch(() => {})`. Then `202`.
- The gateway:
  - `request` POSTs `rpc/request_account_deletion` with `{p_user,p_session,p_request,p_recovery}`. It throws unless the answer's `requestId` equals the request and its status is `queued`, `processing` or `complete`.
  - `revokeApple` is a no-op when `apple` is null.
  - `storageObjects` calls `rpc/deletion_storage_objects`.
  - `removeObjects` sends `DELETE /storage/v1/object/${bucket}` with `{prefixes: names}`.
  - `admission` and `withLedger` are removed.
- `cleanupAccounts`, up to 10 pages per job:
  - Validate the whole page first. Each bucket must be one of the two, and each name must start with `${job.userId}/` and hold no `..`. A bad entry throws before any removal.
  - Then call `removeObjects` once per bucket present.
  - An empty page means exhausted. Then `deleteAuth`, then `finish(true)`.
- `delete-account/index.ts` builds the gateway with `appleRevocationConfig((n) => Deno.env.get(n))` and passes `gateway.request`.

- [ ] **Step 1: Write the failing tests in `account-deletion.test.ts` and `deletion-release.test.ts`**

`account-deletion.test.ts`:
- Rename `oauth` test 3 to "a fresh oauth entry passes for an Apple account that also has a password". `freshIdentity(oauth(["apple","email"]), 1200)` is now true. Google-only stays false (test 2 unchanged).
- Add "a phone account's fresh code (otp) is accepted": `freshIdentity({...identity, providers:["phone"], amr:[{method:"otp",timestamp:1200}]}, 1200) === true`.
- Add "Apple is revoked after the request and the logout, and a failing Apple still answers 202": order `["request","revoke","apple"]`. Then `revokeApple` throws, and the status is 202.
- Add "no Apple call without a code, or for an account without Apple": with `providers:["email"]` and a code, there is no `"apple"` in the order.
- Add "a malformed Apple code is refused before any backend call": `appleAuthorizationCode: 7` and `"a b"` give 400 and 0 verify calls.
- Replace the two cleanup tests with "cleanup removes both buckets under the account before Auth, then completes" (order `["remove:plan-covers","remove:profile-photos","auth","complete"]`) and "an object outside the account's folder or bucket stops the job before anything is removed" (`["avatars","<uid>/x.jpg"]` and `["plan-covers","other/x.jpg"]` each give `retry: 1`, 0 removals, 0 Auth).
- Change the gateway test's last lines: `g.cleanup.removeObjects("plan-covers", [...])` hits `/storage/v1/object/plan-covers`.
- Add "the gateway's request is the direct RPC with the proof's session, and a mismatched answer throws": the fetcher sees `/rest/v1/rpc/request_account_deletion` with `{p_user,p_session,p_request,p_recovery}`, and an answer with another `requestId` rejects.

`deletion-release.test.ts`, gate-agnostic. An entry reads its environment when it loads, so each case imports each entry with its own query string (`../${entry}/index.ts?flags=off`, `?flags=on`), which loads it afresh.
- (a) With `get` answering `undefined` for every `*_ENABLED`, each of the four entries answers 503 and makes 0 network calls.
- (b) For each gate constant that is `false`, the original all-flags-on check still holds for its entries (`delete-account` and `cleanup-account` under `ACCOUNT_DELETION_RELEASE_APPROVED`, `purge-deletion-receipts` under both, and `cleanup-profile-photos` under its own `PHOTO_CLEANUP_RELEASE_APPROVED`, which is not exported: read it from `../cleanup-profile-photos/index.ts` as text, `/PHOTO_CLEANUP_RELEASE_APPROVED = (true|false);/`). This keeps the test green after Rollout step 5's flip and after plan 6's rollout flips the photo worker's gate.

- [ ] **Step 2: Run them and see them fail**

Run: `node --import ./mobile/node_modules/tsx/dist/loader.mjs --test supabase/functions/_shared/account-deletion.test.ts supabase/functions/_shared/deletion-release.test.ts`
Expected: FAIL, because `storageObjects` and `revokeApple` don't exist and `oauth` with `email` is still refused.

- [ ] **Step 3: Implement the handler, gateway and entry point changes; delete the six ledger files**

`git rm` the six files. Nothing else imports them once `account-deletion-gateway.ts` drops `deletion-admission.ts`; check with `grep -rn "deletion-admission\|deletion-ledger" supabase/functions`, which must print nothing.

- [ ] **Step 4: Run every Edge test and see them pass**

Run: `node --import ./mobile/node_modules/tsx/dist/loader.mjs --test supabase/functions/_shared/*.test.ts`
Expected: `# fail 0`. The total is 109, less the ledger, admission and storage tests (21), plus this plan's new ones.

- [ ] **Step 5: Rewrite the two READMEs**

`delete-account/README.md`:
- the actions;
- the proofs per account (ASR2-2);
- the SQL path (no ledger, D-4) and the restore procedure link;
- Apple revocation and its four secrets;
- `ACCOUNT_DELETION_ENABLED`, `ACCOUNT_CLEANUP_SECRET` and `verify_jwt = false` for all three functions;
- the two buckets;
- the cron script;
- the offline tests with the Linux command.

`purge-deletion-receipts/README.md`: the 30-day rule, the hold, the cron script, and that the ledger condition is retired (D-4).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/account-deletion.ts supabase/functions/_shared/account-deletion-gateway.ts supabase/functions/_shared/account-deletion.test.ts supabase/functions/_shared/deletion-release.test.ts supabase/functions/delete-account/index.ts supabase/functions/delete-account/README.md supabase/functions/purge-deletion-receipts/README.md
git status --short supabase/functions   # only these seven and the six deletions (D) from Step 3's git rm
git commit -m "Account deletion: a direct request path, Apple revocation, photo and cover cleanup; the ledger retires (D-4)"
```

---

### Task 7: The app's deletion model: proofs, the phone code and the Apple code

**Files:**
- Create: `mobile/src/domain/deletion.ts`, `mobile/src/domain/deletion.test.ts`
- Modify:
  - `mobile/src/services/appleSignIn.ts:5-9`, `:20-23`, `:52` and `:72`, and its test;
  - `mobile/src/services/accountDeletionFlow.ts:12-37`, `:71` and `:76`, and its test;
  - `mobile/src/services/accountDeletion.ts:35-51` and `:100-201`;
  - `mobile/app/delete-account.tsx:20`, `:60-62` and `:272-289` (the call site only, so the typecheck stays green; Task 8 rewrites the screen);
  - `mobile/package.json` (`test`: add `node --import tsx src/domain/deletion.test.ts` after `accountDeletionFlow.test.ts`).

**Interfaces:**
- Produces, in `deletion.ts` (pure, no React Native import):

```ts
export const PRIVACY_ADDRESS = "privacy@resbite.com";
export type DeletionProof = "apple" | "email" | "phone";
export type DeletionAccount = { providers: readonly string[]; email: string | null; phone: string | null; phoneConfirmed: boolean };
export function deletionProof(a: DeletionAccount): DeletionProof | null;   // ASR2-2's order
export function deletionPhone(a: DeletionAccount): string | null;          // phoneSendForm(a.phone) when confirmed, else null
export function describeDeletionStatus(status: "not_found" | "queued" | "processing" | "complete", signedIn: boolean): string;
export const DELETION_COPY: { /* the strings below */ };
```

`PRIVACY_ADDRESS`: plan 3 (Task 1) owns it, in `mobile/src/domain/legal.ts`. If that file exists when this task runs, import and re-export it from there; otherwise declare it here, and plan 3's Task 1 turns this declaration into a re-export when it lands. The value is `"privacy@resbite.com"` either way.

`DELETION_COPY` (exact copy; Task 8 uses every key):
- `intro`: "Deleting your account closes it straight away, on every device."
- `whatHappens`: "What happens"
- `sheet`, six lines:
  1. "Your access ends straight away, on every device. Your name and photo are removed, and your messages show as “Message deleted”."
  2. "Resbites you host that haven’t happened yet are cancelled, and every guest is told. Weekly groups you host end. Co-hosts don’t take them over."
  3. "You leave every resbite and group you joined. Your connections and blocks end. Reports you made stay with us, without your name, until we’ve dealt with them."
  4. "We finish deleting your account within 30 days. Usually it takes a few minutes. Check here to see when it’s done."
  5. "We keep a few records for a limited time, such as reports about you and a receipt so you can check the deletion. Our Delete your account page explains what we keep and for how long."
  6. "Deleting the app or signing out doesn’t delete your account. Copies other people made can’t be deleted."
- `proveHeading`: "Confirm it’s you"; `typeHeading`: "Type DELETE"; `typeField`: "Type DELETE to confirm"; `cannotUndo`: "Once we accept your request, it can’t be undone."
- `phoneBody(formatted)`: "We’ll text a code to {formatted}."; `emailBody(email)`: "We’ll email a code to {email}."; `appleBody`: "Type DELETE, then confirm with Apple."
- `sendCode`: "Send code"; `phoneCodeField`: "Code from the text"; `emailCodeField`: "Code from the email"; `phoneSent(formatted)`: "We sent a 6-digit code to {formatted}."; `emailSent`: "Check your email for the code."
- `passwordField`: "Current password"; `usePassword`: "Use my password instead"; `useEmailCode`: "Use an email code instead"
- `delete`: "Permanently delete account"; `retry`: "Try again"; `appleHint`: "Signs in with Apple again, then permanently deletes your account."
- `noProof`: "We can’t confirm it’s you in the app. Email privacy@resbite.com and we’ll delete your account for you."
- `unavailable`: "To delete your account, email privacy@resbite.com."
- `preview`: "You’re exploring the design. Preview can’t delete a real account."
- `savedReceipt`: "A deletion request from this iPhone is saved. Check its progress below."; `check`: "Check deletion status"
- `describeDeletionStatus`:
  - `queued` or `processing` → "We’ve accepted your request and closed your account. We finish deleting it within 30 days, usually in a few minutes. Check here to see when it’s done."
  - `complete` → "Your account is deleted. Copies in our backups are gone within 7 days."
  - `not_found`, signed in → "We can’t find a deletion request for this account. Confirm it’s you and try again."
  - `not_found`, not signed in → "We can’t find this request. We keep requests for 30 days after deletion is complete."

- Produces, in `accountDeletionFlow.ts`:
  - `DeletionDependencies.proof: DeletionProof | null` replaces `providers`. Mode `"apple"` iff `proof === "apple"`. A null proof makes `submit` reject with `DELETION_COPY.noProof` and do nothing else.
  - `reauthenticate: () => Promise<DeletionProofSession>`, where `type DeletionProofSession = { accountId: string; accessToken: string; appleAuthorizationCode?: string }`.
  - `request: (receipt: DeletionReceipt, proof: string, appleAuthorizationCode?: string) => Promise<DeletionStatus>`. The flow passes `proof.appleAuthorizationCode` through and never saves it.
  - `appleOnlyAccount` is removed.
  - `phoneProofDeps(client: PhoneProofClient, onSession: (s: { accountId: string; accessToken: string }) => void): PhoneCodeDeps`:
    - `signInWithOtp` and `verifyOtp` go to `client.auth`;
    - `verifyOtp` calls `onSession` only when the answer has no error and holds a session and a user;
    - `updatePhone` rejects;
    - it provides exactly the keys `PhoneCodeDeps` has when this task runs. While the type still has `exchangeTestCode`, it goes through `client.rpc("exchange_test_code", …)` as `phoneCode.ts:85-89` does. Plan 1 (B12) removes that key and the swap; once it has, provide nothing for it, so `git grep exchangeTestCode -- mobile` stays empty. Plan 1 (B16) adds `captchaToken()`; once it has, provide it from the same source the phone sign-in screen uses, and pass it as `options.captchaToken` in `sendDeletionCode`'s email send too. A deletion code is an OTP send, and CAPTCHA covers it once it is switched on;
    - `now` is `Date.now`;
    - `PhoneProofClient` is the structural subset of a Supabase client these use: `auth.signInWithOtp`, `auth.verifyOtp` and `rpc`. The isolated client of `accountDeletion.ts:22-30` fits it.
- Produces, in `accountDeletion.ts`:
  - `sendDeletionPhoneCode(e164: string, assertCurrent: () => void): Promise<number>`. It wraps `sendPhoneCode(phoneProofDeps(isolatedAuth()…), e164, "signin")`, returns `resendAt`, and throws `Error(result.message)`.
  - `deletionFlow` options become `{ accountId; proof: DeletionProof | null; email: string | null; phone: string | null; preview; assertCurrent; credential: DeletionCredential | null; cleanup }`, with `type DeletionCredential = { kind: "password" | "otp"; value: string } | { kind: "sms"; value: string; sentAt: number }`.
  - `reauthenticate` handles `sms` with `verifyPhoneCode(phoneProofDeps(client, capture), phone, value, sentAt, "signin")`, throwing its `message` when not ok.
  - The Apple branch keeps the code from `signInWithApple`.
  - `request` adds `appleAuthorizationCode` to the body only when it is a string.
- `appleSignIn.ts`: `AppleCredential.authorizationCode: string | null`. The ok result is `{ ok: true; name: string | null; authorizationCode: string | null }`, and `requestCredential` maps `credential.authorizationCode`. `useAuthFlow.ts:266` reads only `name`, so nothing else changes.

- [ ] **Step 1: Write the failing tests**

`deletion.test.ts`:
- "the proof follows how the account signs in (ASR2-2)":
  - `["apple"]` gives `apple`; `["apple","email"]` with an email gives `apple`; `["email"]` with an email gives `email`;
  - `["google","phone"]` with an email gives `email`; `["phone"]` confirmed gives `phone`;
  - `["phone"]` with `phoneConfirmed:false` and no email gives `null`; `[]` with nothing gives `null`.
- "deletionPhone sends to the sign-in form of the number" (Review Focus 3): `"447700900301"` gives `"+447700900301"`; `"541122334455"` gives `"+5491122334455"`; `"5491122334455"` gives `"+5491122334455"`; unconfirmed gives `null`.
- "status lines": each of the four `describeDeletionStatus` outputs above, exactly.
- "no copy faces a user with beta or build wording": no `DELETION_COPY` string (flattened, `sheet` included, functions called with `"x"`) matches `/beta|build|development|configured/i`.

`accountDeletionFlow.test.ts`:
- Replace `providers` in the harness with `proof: "email"`.
- Rewrite "the flow picks apple mode…" over proofs: `"email"` and `"phone"` give `credential`; `"apple"` gives `apple`, with the same calls as today.
- Add "a null proof requests nothing": it rejects with `DELETION_COPY.noProof`, and `calls` is `[]`.
- Add "the Apple authorisation code reaches the request and is never saved": `reauthenticate` returns `{…, appleAuthorizationCode: "c.1"}`, the request's third argument is `"c.1"`, and `JSON.stringify(h.receipt())` doesn't contain `"c.1"`.
- Add "phoneProofDeps captures the session only from a successful verification": an error answer gives no capture; `{data:{session:{access_token:"t"},user:{id:"u"}},error:null}` captures `{accountId:"u",accessToken:"t"}`; `updatePhone` rejects.

`appleSignIn.test.ts`: the harness credential gains `authorizationCode: "code-1"`. The success `deepEqual` becomes `{ ok: true, name: "Ana Lima", authorizationCode: "code-1" }`. Add one case with `authorizationCode: null` giving `authorizationCode: null`.

- [ ] **Step 2: Run them and see them fail**

Run: `cd mobile && node --import tsx src/domain/deletion.test.ts && node --import tsx src/services/accountDeletionFlow.test.ts && node --import tsx src/services/appleSignIn.test.ts`
Expected: FAIL with `Cannot find module './deletion'`.

- [ ] **Step 3: Implement `deletion.ts`, the flow, the service and the Apple change**

In `app/delete-account.tsx`, change the call site only:
- import `deletionProof` in place of `appleOnlyAccount` (`:20`);
- compute `proof` from the session (`:60-62`), and `appleAccount = proof === "apple"`;
- pass `proof`, `email: email ?? null` and `phone: null` to `deletionFlow` (`:272-289`).

The screen's look and copy wait for Task 8.

- [ ] **Step 4: Run the app checks**

Run: `cd mobile && npm test && npm run typecheck`
Expected: every test file passes, and the typecheck is clean.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/domain/deletion.ts mobile/src/domain/deletion.test.ts mobile/src/services/accountDeletionFlow.ts mobile/src/services/accountDeletionFlow.test.ts mobile/src/services/accountDeletion.ts mobile/src/services/appleSignIn.ts mobile/src/services/appleSignIn.test.ts mobile/app/delete-account.tsx mobile/package.json
git commit -m "App: deletion proof for every account type, the phone code, and Apple's code for revocation"
```

---

### Task 8: The screens: Delete account, the suspended screen and the taken-number line

**Files:**
- Modify:
  - `mobile/app/delete-account.tsx:5-24`, `:59-68`, `:134-139`, `:149`, `:159-169`, `:172-299`, `:302-307` and `:339-361`;
  - `mobile/app/account.tsx:5`, `:128-136` and `:172-180`;
  - `mobile/src/domain/phoneCopy.ts:31-33` and `mobile/src/services/phoneCode.test.ts` (the taken-number line);
  - `mobile/src/domain/accountCopy.ts` and `accountCopy.test.ts`;
  - `mobile/src/domain/safetyCopy.ts:85-86` and `safetyCopy.test.ts`;
  - `mobile/scripts/verify-deletion.mjs`;
  - `mobile/src/domain/releaseWording.test.ts`, only if plan 3 has created it (its `B3_REWRITES` array).
  - `mobile/.env.example:4`.

**Interfaces:**
- Consumes: Task 7's `deletionProof`, `deletionPhone`, `DELETION_COPY`, `describeDeletionStatus`, `sendDeletionPhoneCode`, `deletionFlow` and `DeletionCredential`.
- Produces:
  - `accountCopy.ts`: `export function suspendedLines(address: string | null): string[]`. It returns `["This account can’t use Resbite at the moment.", address ? \`To ask why, or to appeal, write to ${address}.\` : "If you think this is a mistake, contact the Resbite team."]`. Also `export const SUSPENDED_DELETE = "Delete account"`.
  - `phoneCopy.ts`: `export function takenLine(address: string | null): string`. With an address it returns "This number already belongs to another Resbite account. Use a different number, or write to {address}." Without one it returns today's line. `PHONE_COPY.taken` becomes `takenLine(supportAddress(process.env.EXPO_PUBLIC_SUPPORT_ADDRESS))`, read with dot notation so the build inlines it. `PHONE_CODE_COPY.taken` and `phoneFold.ts` keep reading `PHONE_COPY.taken` (B6, spec row UGC-4).
  - `SAFETY_COPY.reportsPrivacy` (AS-R2): "If you report a message or a person, the Resbite team reads the report and keeps a copy of what was reported, even if the message or that person’s account is deleted. If you delete your account, the reports you sent are kept until the team closes them, without your name. A report is deleted 180 days after the team closes it."

- [ ] **Step 1: Write the failing tests**

- `accountCopy.test.ts`, "the suspended screen gives the support address and keeps its first line": `suspendedLines("support@resbite.com")` deepEquals the two lines with the address; `suspendedLines(null)`'s second line is the fallback.
- `safetyCopy.test.ts`: the existing `reportsPrivacy` assertion (around `:92`) expects the new text exactly.
- `phoneCode.test.ts`, "the taken-number line gives the support address when the build has one (B6)": `takenLine("support@resbite.com")` is exactly the address line, and `takenLine(null)` is "This number already belongs to another Resbite account. Use a different number, or ask the Resbite team for help.". The existing `PHONE_CODE_COPY.taken === PHONE_COPY.taken` check (`:61`) stays.

- [ ] **Step 2: Run them and see them fail**

Run: `cd mobile && node --import tsx src/domain/accountCopy.test.ts && node --import tsx src/domain/safetyCopy.test.ts`
Expected: FAIL (`suspendedLines is not a function`; the `reportsPrivacy` mismatch).

- [ ] **Step 3: Implement the copy and the two screens**

`delete-account.tsx`:
- Build `DeletionAccount` from `session.user`: `app_metadata.providers ?? []`, `email || null`, `phone || null`, `!!phone_confirmed_at`. Then `proof = deletionProof(account)`.
- `available = accountDeletionEnabled && !preview && !!accountId`. The `!!email` condition goes (`:67-68`, DEL-2).
- The status card's line is `DELETION_COPY.intro`.
- The unavailable card (`:159-169`) shows `DELETION_COPY.preview` in preview, else `DELETION_COPY.unavailable`.
- Card 1, "Confirm it’s you", by proof:
  - `phone`: `phoneBody(formatPhone(deletionPhone(account)!))`, a **Send code** button calling `sendDeletionPhoneCode`. On success it stores `sentAt` and shows `phoneSent(…)`; a failure shows the thrown message. Then a `FieldCard` labelled `phoneCodeField` (`one-time-code`, number pad).
  - `email`: `emailBody(email)`, **Send code** (`sendDeletionCode`) and the `emailCodeField`. When the providers include `email`, the `usePassword` / `useEmailCode` switch to the `passwordField`, as today.
  - `apple`: `appleBody`.
  - `null`: `noProof` only. Card 2 and the button are not shown.
- Card 2 uses `typeHeading`, `typeField` and `cannotUndo`.
- The button title is `GUEST_COPY.apple` for Apple, `retry` when a receipt exists, else `delete`. Disabled while restoring, before `DELETE`, or (not Apple) without a credential. The phone proof is also disabled before a code was sent.
- The flow call passes `proof`, `email`, `phone: deletionPhone(account)` and `credential` (`sms` with `sentAt` for the phone).
- Status lines come from `describeDeletionStatus(value, !!session)`.
- The saved-receipt line is `savedReceipt`, and **Check deletion status** is `check`.
- The "What happens" sheet renders `DELETION_COPY.sheet` as six `Copy` paragraphs. That replaces `:340-360` and with it the internal notes at `:137` and `:356-360` (DEL-3).

`account.tsx`, while `status === "access_pending"`:
- Render `suspendedLines(contact?.address ?? null)`, where `contact = supportContact(process.env.EXPO_PUBLIC_SUPPORT_ADDRESS)` is read at module level as `data-privacy.tsx:28` does.
- Add a `Chip` `text={SUSPENDED_DELETE}` with the `Trash2` icon and the hint "Opens Delete account." that pushes `/delete-account`, before the Sign out chip (B6, DEL-7).

`data-privacy.tsx` is plan 3's (B5 rewrites `:1-175`), so this plan doesn't change it. Its old "as cleanup finishes … in this build" line (`:120-122`, spec B3) goes with that rewrite (open point).

If `mobile/src/domain/releaseWording.test.ts` (plan 3) exists, remove `app/delete-account.tsx`, `src/services/accountDeletion.ts` and `src/services/accountDeletionFlow.ts` from its `B3_REWRITES` array. The wording test must then pass with them scanned.

`.env.example:4`: "On only in a build made after the deletion release is live (qa/account-deletion-2026-11-17/README.md)."

- [ ] **Step 4: Update the browser scripts' expected copy and add the phone and Apple-code checks**

`verify-deletion.mjs` (plan 3 owns its Data & privacy part, `:37-38` and `:232-282`; keep to the deletion part):
- Set `REPORTS` to the new `reportsPrivacy`. If plan 3 has already restructured `:37-38`, change only that text.
- Replace `"Deletion immediately closes access."` with `DELETION_COPY.intro`'s text.
- Replace the two "What happens" regexes with `/^Resbites you host that haven’t happened yet are cancelled/` and `/^Deleting the app or signing out doesn’t delete your account\./`.
- Use the new preview line, and the unavailable line `"To delete your account, email privacy@resbite.com."` (exact).
- `"Send verification code"` becomes `"Send code"`.
- `/Your deletion request is accepted/` becomes `/We’ve accepted your request/`.
- `"To confirm it’s you, sign in with Apple again."` becomes `"Type DELETE, then confirm with Apple."`.
- In the request intercept, assert `body.appleAuthorizationCode === "fixture-apple-code"` in the Apple case and `undefined` in the email case.
- Add a phone-only case, before the Apple case, in the same shape:
  - the user has `providers: ["phone"]`, no email and phone `447700900834`;
  - the screen reads "We’ll text a code to +44 7700 900834.";
  - **Send code** sends `/auth/v1/otp` with `phone: "+447700900834"` and `create_user: false`;
  - the code `123456` sends `/auth/v1/verify` with `type: "sms"`;
  - then DELETE and **Permanently delete account** make one request with the proof token;
  - no `/rest/v1/rpc/exchange_test_code` call is made.

- [ ] **Step 5: Run every app check, then the browser script**

Run: `cd mobile && npm test && npm run typecheck`
Expected: all pass, with the typecheck clean.

Then run the browser script in its two modes, as its header says:
1. Run `cd mobile && npx expo start --web --port 8081`, then `node scripts/verify-deletion.mjs`. Expected: every `PASS` line and exit 0.
2. Restart Expo with `EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED=true` and a stand-in `https` `EXPO_PUBLIC_SUPABASE_URL` and key. Run `RESBITE_QA_DELETION_ENABLED=true node scripts/verify-deletion.mjs`. Expected: the email, phone and Apple cases PASS.

Under SSH, the browser runs headless and the Mac forwards 8081.

- [ ] **Step 6: Commit**

```bash
git add mobile/app/delete-account.tsx mobile/app/account.tsx mobile/src/domain/accountCopy.ts mobile/src/domain/accountCopy.test.ts mobile/src/domain/phoneCopy.ts mobile/src/services/phoneCode.test.ts mobile/src/domain/safetyCopy.ts mobile/src/domain/safetyCopy.test.ts mobile/scripts/verify-deletion.mjs mobile/.env.example
# and mobile/src/domain/releaseWording.test.ts if Step 3 changed it
git commit -m "App: Delete account for every account, the 30-day promise, and Delete account on the suspended screen"
```

---

### Task 9: The restore procedure, the release runbook and the records

**Files:**
- Create:
  - `qa/deletion-restore-procedure.md`;
  - `supabase/ops/export-deletion-receipts.sql`, `supabase/ops/replay-deletions.sql`;
  - `qa/account-deletion-2026-11-17/README.md`.
- Modify:
  - `supabase/tests/account-deletion-release.sql` (section S8, the restore scripts);
  - `qa/deletion-recovery-ledger.md` (closing section);
  - `docs/compliance/data-requests.md` (section 8.2's open-point marker);
  - `knowledge-base/08-decisions.md` (ASR2-1 to ASR2-10 under the AS section).

**Interfaces:**
- Consumes: Task 2's `replay_account_deletion`.
- Produces:
  - `export-deletion-receipts.sql`, read-only:
    `select user_id, request_id, encode(recovery_hash,'hex') as recovery_hash, status, requested_at, completed_at from private.account_deletion_jobs order by requested_at;`
    Its header says the owner runs it with `supabase db query --linked -f … -o json > <private folder outside the repo>/receipts.json`.
  - `replay-deletions.sql`, owner-run. The owner pastes that JSON into the editor's copy:
    `with input(j) as (values ('[]'::jsonb)), r as (select private.replay_account_deletion(x.user_id, x.request_id, decode(x.recovery_hash,'hex')) as result from input, jsonb_to_recordset(j) as x(user_id uuid, request_id uuid, recovery_hash text)) select result, count(*) from r group by result order by result;`

- [ ] **Step 1: Write the failing test, section S8**

- **S8.1** Load `export-deletion-receipts.sql` and run it through `pg_temp.dd_run`. It returns at least the jobs made above, with 64-hex `recovery_hash`.
- **S8.2** Take `08`'s exported row and delete `08`'s job (a restore that predates it). Run `replay-deletions.sql`, with sed putting `[<that row>, <a row for dd…99>]` in place of `'[]'`. It answers `[{"result":"gone","count":1},{"result":"replayed","count":1}]`. `account_deletion_status('dd3…08', repeat('b',64))->>'status'` is `queued`.

- [ ] **Step 2: Run it and see it fail**

Run: `bash scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261117110000_account_deletion_release.sql`
Expected: FAIL at S8.1, because the scripts don't exist (`sed: can't read …`).

- [ ] **Step 3: Write the two scripts, then run both modes and see them pass**

Run: `bash scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261117110000_account_deletion_release.sql` and `bash scripts/test-database-docker.sh`
Expected: all PASS.

- [ ] **Step 4: Write `qa/deletion-restore-procedure.md`**

Sections:
1. **Why** (D-4, the promise in `docs/legal/delete-account.md`: "we delete your account again before the service goes back online").
2. **Before a planned or unplanned restore.**
   - Record the decision in the incident log (`docs/compliance/breach-response.md` if data was lost).
   - **Export receipts from the live database** with `export-deletion-receipts.sql` into a private folder outside the repo, and record only the count. Receipts outlive backups (30 days against 7), so the live export covers every backup.
   - Turn the cleanup and purge cron jobs off: `select cron.unschedule('cleanup-account'); select cron.unschedule('purge-deletion-receipts');`.
3. **The fence.** Before the restore, turn the Data API off in the dashboard (Project Settings, Data API), and Realtime too. The dashboard paths are UNVERIFIED: check them at the time. With the Data API off, neither the app nor the workers can read or write. A restored account can't be used before the replay.
4. **Restore** from the dashboard (Database, Backups). Point-in-time recovery is off (D-15).
5. **Replay** with `replay-deletions.sql` and the export. Record the three counts. Then re-run `schedule-account-deletion.sql`.
6. **Reopen.**
   - Turn the Data API and Realtime back on.
   - Watch `select status, count(*) from private.account_deletion_jobs group by status` until every replayed job is `complete` (minutes).
   - The files of accounts deleted before the restore are already gone from Storage. Backups hold metadata, not bytes, so the worker's removal of their metadata is expected.
7. **The limit.** If the live database can't be read, the receipts are lost with it, and deletions made after the backup can't be replayed. Those people's saved receipts read "can't find". Record this in the breach log, and answer each such person through privacy@resbite.com. This is the accepted cost of D-4.
8. **Rehearsal** (F11): into a scratch project with disposable accounts only, before launch and yearly.

- [ ] **Step 5: Write `qa/account-deletion-2026-11-17/README.md`, the runbook**

It has these sections. It holds no names, numbers, emails or ids.
- **What is built**, with links to Tasks 1 to 8's files.
- **Files and hashes**: the migration, rollback, `.before`/`.after` and the four ops scripts. Fill these in with `sha256sum` at rollout; never approve from an old list.
- **Checks made locally**: the four commands with their PASS counts, filled in when run.
- **Order**, and the owner-run scripts of the Rollout section below, each as a `bash` block in the style of `qa/connections-follow-ups-2026-11-11/README.md` steps 1-2:
  - `cd "${REPO:-$HOME/dev/resbite-app}"`;
  - `D=qa/account-deletion-2026-11-17`;
  - `echo "<sha256>  $F" | sha256sum -c -` before any apply.
- **The end-to-end test plan** (below).
- **Rollback.**
- **Applied**, filled in at each sitting.

**The end-to-end test plan.** Use disposable accounts only, never the owner's real account (`qa/b0-retention-proposal.md` step 2). Use a TestFlight build with `EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED=true`, made after the migration and the functions are live. Each account's id stays in the SQL editor's copy, and only counts are written here.
1. **Phone-only (DEL-2).** Sign up with a number the owner controls. Needs C1 live: before C1, a test-mode run with `000000` is recorded as such and repeated after C1. Host a one-off for tomorrow with account 2 as a guest, a weekly group, and a message in each chat. Then Delete account with the SMS code.
   - Expect "We’ve accepted your request…", signed out, and account 2 gets "This resbite was cancelled".
   - The group's chat reads closed 48 hours later.
   - Within 10 minutes the welcome screen's **Check deletion status** reads "Your account is deleted…".
   - In SQL, the counts: 0 `auth.users`, 0 objects under the prefix and 1 receipt `complete`.
2. **Email and password.** Delete with the password, then with an email code on a second account.
3. **Google** (email code to the Google address).
4. **Apple (DEL-4).** Use an Apple ID the owner keeps for tests. Afterwards, iPhone Settings → [name] → Sign-In & Security → Sign in with Apple no longer lists Resbite. Record "removed" or "still listed".
5. **Suspended (D-19, B6).** Suspend a disposable account with `suspend-account.sql`, with no Auth ban. The suspended screen shows the support address and **Delete account**, and deleting works. In SQL, `private.suspensions` has no row for it, and one `private.suspension_history` row has `how 'account_deleted'` and `user_id` null.
6. **Web-only (AS-R3, D8).** Answer an invitation on `link.resbite.com` with a disposable number, then run `delete-account.sql`. The job completes.
7. **Legal hold (UGC-15).** In the SQL editor, insert a hold for a disposable account (reason `police`, case `TEST`), then delete it in the app.
   - The job reads `held` and the app reads accepted. The name stays.
   - Lift the hold (`update private.legal_holds set lifted_at=now() where case_ref='TEST'`). Within 5 minutes the job completes.
   - Delete the hold row afterwards.
8. **The schedule.** `cron.job_run_details` shows `cleanup-account` every 5 minutes with status `succeeded`, and `purge-deletion-receipts` daily answering `{"receiptsPurged":0}`.

- [ ] **Step 6: Update the ledger record, the data-request procedure and the decision log**

- `qa/deletion-recovery-ledger.md`: append "## Retired, 17 November 2026 (D-4, AS-D8)". The independent ledger and the prepare/activate path are retired. The code is removed in the Task 6 commit (name it). The SQL objects stay only in the local replay. The restore fence lives in `qa/deletion-restore-procedure.md`.
- `docs/compliance/data-requests.md` section 8.2: in the bullet that starts "**Run the deletion** for that account with the owner-run deletion script", name the script as `` `supabase/ops/delete-account.sql` ``. Change that bullet's marker "**[needs C6]**" to "**[needs C2 live]**". Find it by that text, not by line. If another session's uncommitted edits are in this file, ask first (Global Constraints).
- `knowledge-base/08-decisions.md`: append "*Calls made by the account deletion plan (17 November 2026).*" with ASR2-1 to ASR2-10, one bullet each, as in this plan.

- [ ] **Step 7: Commit**

```bash
git add qa/deletion-restore-procedure.md qa/account-deletion-2026-11-17/README.md supabase/ops/export-deletion-receipts.sql supabase/ops/replay-deletions.sql supabase/tests/account-deletion-release.sql qa/deletion-recovery-ledger.md docs/compliance/data-requests.md knowledge-base/08-decisions.md
git commit -m "Account deletion: restore by receipt, the release runbook and the end-to-end plan"
git push -u origin HEAD
```

---

## Rollout (owner-run)

Every step needs the owner's explicit approval at the time. The scripts are the runbook's (`qa/account-deletion-2026-11-17/README.md`). The assistant writes each into the home directory, the owner reads it and runs it with `! bash ~/<name>.sh`, and nothing prints a secret, number or id.

Order: steps 1 to 3 (database), then 4 to 7 (secrets, gate flip, functions, schedule), then 8 to 10 (build and tests). C1 (SMS live) should come first for step 10's phone case; the database steps may go ahead of it.

1. **Before snapshot** (read-only), `~/del-before.sh`:
   - `hosted-fingerprint.sql` and `hosted-counts.sql` into `$D/hosted-before.json` and `$D/hosted-counts-before.json`;
   - `select count(*) as applied, max(version) as latest from supabase_migrations.schema_migrations` (expect `26 | 20261117100000`, plan 1's retirement having gone first as the roadmap orders; `25 | 20261116120000` only if the owner chose to run this sitting before it, in which case plan 1 renames its file to a later timestamp). Stop if any version above `20261117110000` is applied;
   - `select to_regclass('private.account_deletion_jobs') is null as absent`;
   - `select count(*) from public.profiles where deletion_requested_at is not null` (expect 0);
   - `select has_table_privilege('storage.objects','TRIGGER') as can_trigger, exists(select 1 from pg_trigger where tgname='resbite_photo_write_guard') as guard` (expect `true | false`). If `can_trigger` is false, stop: the migration would fail and roll itself back at the photo guard.

   Compare the fingerprint with a local replay of `migrations.txt`. Stop on any unexplained difference.
2. **Apply the migration**, approved by file name and sha256: `~/del-apply.sh`.
   - It checks the hash, and refuses if `private.account_deletion_jobs` already exists or if `supabase_migrations.schema_migrations` holds a version above `20261117110000` (timestamps follow the apply order).
   - It wraps `supabase/migrations/20261117110000_account_deletion_release.sql` in `begin;`/`commit;` and runs `supabase db query --linked -f`.
   - Then `supabase migration repair --status applied 20261117110000 --linked --yes`, the history query, and the after snapshots `$D/hosted-after.json` and `$D/hosted-counts-after.json`.
   - If only the repair failed, run it alone.
3. **After checks and advisors.**
   - The fingerprint grows by this file's objects: three tables (`account_deletion_jobs`, `legal_holds`, `suspension_history`), the private and public functions, the photo guard and its trigger, two redefined bodies, the changed constraints and the schema grant. List them in the record.
   - Read the security and performance advisors (owner approves the read).
   - Append `20261117110000_account_deletion_release.sql   20261117110000` to `supabase/tests/hosted-baseline/migrations.txt`.
   - Run `bash scripts/test-database-docker.sh --hosted-baseline` with no candidate. Expect all PASS.
   - Commit the record.
4. **Apple key and function secrets.**
   - The owner creates a Sign in with Apple key in Apple Developer (Keys, with Sign in with Apple on, the primary App ID `com.resbite.app`). Download `AuthKey_<KEYID>.p8` once and keep it outside the repo.
   - Write a private env file outside the repo with:
     - `ACCOUNT_DELETION_ENABLED=true`, `ACCOUNT_RECEIPT_PURGE_ENABLED=true`;
     - `ACCOUNT_CLEANUP_SECRET` and `ACCOUNT_RECEIPT_PURGE_SECRET` (each `openssl rand -hex 32`);
     - `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_CLIENT_ID=com.resbite.app`;
     - `APPLE_PRIVATE_KEY`, the `.p8` as one line with `\n`, for example `awk 'NF{printf "%s\\n",$0}' AuthKey_<KEYID>.p8`.
   - Run `supabase secrets set --env-file <that file>`, then `supabase secrets list`. Names only are shown.
5. **Flip the source gates** (the spec's "gate-flip commits", approved). Set `ACCOUNT_DELETION_RELEASE_APPROVED` and `DELETION_RECEIPT_PURGE_RELEASE_APPROVED` to `true` in `supabase/functions/_shared/deletion-release.ts`. Rewrite its comment to say they were opened by this release (D-4), not by a ledger. Run the Edge tests (`# fail 0`), commit and push.
6. **Deploy the three functions** from that commit: `~/del-deploy.sh`, which runs `supabase functions deploy delete-account --no-verify-jwt`, `supabase functions deploy cleanup-account --no-verify-jwt` and `supabase functions deploy purge-deletion-receipts --no-verify-jwt`.
   - Check: a `POST` to `delete-account` with `{"action":"status","requestId":"<random uuid>","recoveryToken":"<64 zeros>"}` answers 404, not 503.
7. **The schedule.**
   - Create the four Vault secrets: `cleanup_account_url`, `cleanup_account_secret` (equal to `ACCOUNT_CLEANUP_SECRET`), `purge_deletion_receipts_url` and `purge_deletion_receipts_secret`.
   - Run `supabase/ops/schedule-account-deletion.sql` in the SQL editor, approved by sha256.
   - Check `select jobname, schedule from cron.job where jobname in ('cleanup-account','purge-deletion-receipts')`. After 10 minutes, `cron.job_run_details` shows `succeeded`.
8. **EAS.** Set `EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED=true` for the production environment. Check the exact flags with `npx eas env:create --help` at the time, then `npx eas env:list --environment production`. Only after steps 2 to 7.
9. **TestFlight build** with the flag on, as part of the release runbook (F12). Approved separately.
10. **The end-to-end test plan**, from the runbook. Record the outcomes and counts in "Applied". Update `docs/implementation-status.md` with "deletion live". Commit and push.

**Rollback** (approved, in this order):
1. Unschedule both cron jobs.
2. Set `ACCOUNT_DELETION_ENABLED=false` with `supabase secrets set`. The functions answer 503.
3. Only if no deletion has run: run `supabase/rollback/20261117110000_account_deletion_release.rollback.sql` in one transaction with the same hash-guarded pattern. It refuses with 42501 once any job, hold or nulled owner exists; then roll back by hand.

The history row stays. Never run `migration repair --status reverted`.

---

## Self-review (17 November 2026)

- **Spec coverage.**
  - DEL-1 (the entry point, D-4): Tasks 2 and 6.
  - DEL-2 (every account type and the phone proof): Tasks 2, 7 and 8, plus AS-R3 for web-only in Task 2.
  - DEL-3 (30 days, confirmation, copy): Tasks 7 and 8.
  - DEL-4 (Apple): Tasks 5 to 7.
  - DEL-6 (the restore procedure): Task 9.
  - DEL-7 and D-19: Tasks 2 and 8.
  - DEL-8 and D-20: Task 2, with ASR2-6.
  - UGC-15 (the hold flag): Tasks 1 to 3.
  - Receipts: Task 3.
  - AS-R1 and AS-R2: Task 2.
  - AS-R3: Tasks 2 and 9.
  - B6 (the suspended screen and the taken-number line): Task 8.
  - The cron: Tasks 3 and 9, and the Rollout.
  - The e2e plan: Task 9.
  - DEL-5 (Apple server notifications, C10) is out of scope (may follow 1.0).
  - C3 (orphan photos, replaced covers, the 12-month suspension purge) is out of scope, and so are C6's hold script and D1's web form.
- **Names.**
  - `deletion_storage_objects`, `StoredObject` and `removeObjects` are used the same way in Tasks 3 and 6.
  - `appleAuthorizationCode` is the same in Tasks 6 to 8.
  - `DeletionProof`, `deletionPhone` and `DELETION_COPY` keys are the same in Tasks 7 and 8.
  - `account_held`, `legal_holds`, `suspension_history` and `operator_account_deletion` are the same in Tasks 1 to 4, and match plan 6's "Shared with plan 2".
  - `queue_account_deletion`, `close_account` and `erase_account` are the same in Tasks 2 and 3.
- **Review Focus:** all five have tests (S2.6; S6.3/S6.4; `deletionPhone`; concurrency (1); S6.6/S7.4).
