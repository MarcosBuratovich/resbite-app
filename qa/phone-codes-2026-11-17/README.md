# Phone codes: release runbook (17 November 2026)

- **Spec:** [the App Store readiness gap analysis](../../docs/superpowers/specs/2026-11-17-app-store-readiness-design.md): rows SI-1, WEB-4, OPS-5, OPS-9 and PRV-7; deliverables C1, C11, B12, B16, D5, D6, D10, F5 and F14; section 6, steps 11 and 21. The owner's decisions AS-D5 (Twilio through the Send SMS hook; test mode and the `000000` swap end in the same sitting; the CAPTCHA vendor open) and AS-D8 (the section 5 retention table) are in the [decision log](../../knowledge-base/08-decisions.md), under "App Store readiness (AS)". This plan's own calls are PC-1 to PC-8 there.
- **Plan:** [App Store readiness plan 1, phone codes](../../docs/superpowers/plans/2026-11-17-asr-1-phone-codes.md). The [roadmap](../../docs/superpowers/plans/2026-11-17-asr-0-roadmap.md) calls this runbook's sittings H1 (sitting 1), H3 (sitting 2) and H12 (sitting 3). The [release runbook](../app-store-release/README.md) ticks its step 11 from sitting 1 and its step 21 from sitting 3.
- **Code:** branch `asr-1-phone-codes`, from `app-store-readiness` at `af836ee`:
  - `6e95f7e` the Send SMS hook (Task 1);
  - `42e0be1` the `send-sms` function, the sweep of Twilio's message records and its schedule (Task 2);
  - `5d69dfe` the app sends the code as typed (Task 3);
  - `81b83f3` a fix to the open-link browser check, which was already failing before Task 4 (it changes no served file);
  - `417de28` the link site sends the code as typed (Task 4);
  - `c07332b` the switch-off and review scripts, and the migration that retires test mode (Task 5);
  - this record and the pointers to it (Task 6).
- **Nothing here is applied.** No function is deployed, no secret or Vault entry is set, no Auth or Twilio setting is changed, no SQL has run on the hosted project, and nothing is deployed to Vercel, EAS or TestFlight, until "Applied" says otherwise. Every step below needs the owner's explicit approval when it is done.
- **CAPTCHA** (plan Tasks 7 to 9; B16 and D10) is blocked until the owner picks the vendor (AS-D5). Sitting 3 is written here so the order is whole. It is not built.

## What is built

- **Task 1, the Send SMS hook** (`supabase/functions/_shared/sms-hook.ts`). Auth calls the hook with each sign-in code. The hook checks Auth's Standard Webhooks signature: HMAC-SHA256 over `id.timestamp.body` with Web Crypto, a 5-minute window, any of several `v1,` signatures (separated by spaces, or by a comma and a space), and any of several secrets split on `|` for rotation. An account with a confirmed number (`user.phone` with `phone_confirmed_at`) is texted on that number, even when a stale `user.new_phone` is left over; only an account with no confirmed number is texted on the number being added (`user.new_phone`) when there is one. It texts the stored digits with a `+`, never folded to the phone key, so an Argentine `549…` number stays `549…`. The text is `Your Resbite code is 123456. It expires in 10 minutes. Do not share it.`, one GSM-7 segment. It posts to Twilio's Messages API through the Messaging Service, with an API key and `ValidityPeriod=600`, waits 3 seconds, and answers Auth as Decision 5 says, never asking Auth to retry. Each call logs one line: an outcome word, an HTTP status and Twilio's numeric code, never a number, a code, the text or a body from Twilio. 22 tests at Task 1 (26 in the file after Task 2's router test and the final review's fixes, below), including the specification's published vector.
- **Task 2, the `send-sms` function and the sweep** (`supabase/functions/send-sms/index.ts`, `supabase/functions/_shared/sms-records.ts`, `supabase/functions/send-sms/README.md`, `supabase/ops/schedule-sms-records-sweep.sql`). One function with two routes: a path ending in `/sweep` goes to the sweep, anything else to the hook. It reads six secrets by name and holds no database credential. The sweep needs a bearer secret of 32 characters or more. It lists the account's message records (at most 10 pages of 100) and deletes each one whose status is final and that is over 24 hours old. A record in flight, a day old or less, or with a date it can't read is kept, and a failed list deletes nothing. The owner-run schedule script makes the pg_cron job `sms-records-sweep` at `17 3 * * *`; it reads `sms_sweep_url` and `sms_sweep_secret` from Vault. 11 more tests, among them the entry point's wiring with `Deno` stubbed.
- **Task 3, the app** (`mobile/src/services/phoneCode.ts`, `mobile/src/services/phoneFold.ts`, their tests, `mobile/scripts/verify-phone.mjs`, `mobile/scripts/verify-contact-invites.mjs`). The app sends the code as typed. `exchangeTestCode` is gone from `PhoneCodeDeps` and `FoldClientDeps`, with `TEST_CODE` and the swap, so `000000` is checked like any code and refused with "That code doesn’t match. Try again.". Only the hook's own words reach the screen (a refusal, as written); since the final review, any other Auth message, `hook_timeout` and the other `hook_*` codes included, reads as "Check your connection and try again.". It ships only in a build made after sitting 1 (Order, below).
- **Task 4, the link site** (`links/assets/personal.js`, `links/assets/personal-flow.mjs`, `links/personal-flow.test.mjs`, `links/verify-personal.mjs`, `links/verify-open-link.mjs`). `/r/` and `/i/` post the code as typed and never call `exchange_test_code`; `isTestCode` is gone. Tests pin the code words (six digits, ten minutes) and that a refusal from the hook reaches the page as written; since the final review, only the hook's own words do, and any other Auth message, every `hook_*` code included, reads as the connection copy. The site deploys in sitting 1 (step 8).
- **Task 5, the switch-off and the retirement** (`supabase/ops/phone-test-mode-off.sql`, `supabase/ops/phone-test-mode-review.sql`, `supabase/migrations/20261117100000_phone_test_mode_retired.sql`, its rollback, its rehearsal pair and `supabase/tests/phone-test-mode-retired.sql`).
  - The off script turns test mode off, empties `private.test_codes`, deletes every refresh token and session, and prints counts only. It doesn't touch the log.
  - The review is read-only: one result for the SQL editor, in three parts (`log`, `exchanged`, `identity`), with its window from 28 October 2026 00:00 UTC.
  - The migration drops five objects. Its rollback recreates them empty, with test mode off, and refuses while any of them exists.
  - The old tests of the dropped objects are gone. The harness gained `auth.refresh_tokens` and `auth.identities` stubs.
- **Task 6, this record**, and the pointers to it in the release runbook, the phone-accounts runbook, the breach response runbook, `supabase/README.md`, `docs/implementation-status.md` and the decision log.

**The plan's decisions, one line each.** Decision 14, CAPTCHA, waits with Tasks 7 to 9.

1. An HTTP hook through an Edge Function, not the Postgres hook with `pg_net`: 5 seconds instead of 2, Twilio's answer is seen, the keys are function secrets, and it can be tested under Node.
2. Our own Standard Webhooks check with Web Crypto, not the `esm.sh` library: no remote import at deploy time, and tested with the specification's vector.
3. Twilio through a Messaging Service (sender "Resbite") with an API key, not the account's Auth Token; `ValidityPeriod=600`; Twilio's US region (`api.twilio.com`).
4. The text is `Your Resbite code is 123456. It expires in 10 minutes. Do not share it.`: one GSM-7 segment, with no apostrophe.
5. What Auth hears: sent, `200 {}`; a number Twilio refuses, `200` with `http_code 422` "We can’t text this number. Check it, or use another number."; busy, down or slow (3 seconds), `200` with `http_code 503` and no `retry-after`, so Auth never retries and never texts twice; anything else, `500`; a malformed event, `200` with `http_code 400`; a bad signature, `401`. The app and the site show only the hook's own words; any other Auth message, every `hook_*` code included, reads as "Check your connection and try again.". (Changed after the final review: it was `503` with `retry-after: 1` and 4 seconds.)
6. No source-gate constant on `send-sms`: it acts only on calls Auth signs, and the switch is the dashboard hook.
7. A daily sweep at 03:17 UTC deletes Twilio's message records once they are final and over 24 hours old. Not status callbacks.
8. One sitting, in this order: the HTTP hook, a real code proven, then test mode off. Never the reverse.
9. The switch-off is an ops script, not a migration: test mode off, the stored codes emptied, every session ended.
10. The review stays in the SQL editor, read-only, from 28 October 2026 00:00 UTC. The repo records counts and the decision only.
11. The retiring migration drops `public.exchange_test_code`, `public.send_sms_hook`, `private.test_codes`, `private.test_mode_log` and `private.phone_mode` once BR-2026-001 is recorded. `private.phone_digits` stays.
12. Its rollback never reopens test mode: the five objects come back empty, with test mode false.
13. The Auth and Twilio settings that guard paid SMS are set and recorded in the C11 record, below.

## Files and hashes

| File | sha256 |
| --- | --- |
| `supabase/functions/send-sms/index.ts` (step 2) | `503930848088f05e45747f3bf8e320ab9060823b8518ebd355e7062cf68cdaff` |
| `supabase/functions/_shared/sms-hook.ts` (step 2) | `66cab35907963554a9870b88d0eeac796231038105ed4395818d36e5419d72be` |
| `supabase/functions/_shared/sms-records.ts` (step 2) | `80a6bb871867c9d40aab4da8a564e3470541f2314290afaad8edbb2af636cad5` |
| `supabase/ops/phone-test-mode-off.sql` (step 5) | `868f42730eef93d0991f7a635a6ba666e383c974df18b6fc156aa807d1b908e3` |
| `supabase/ops/phone-test-mode-review.sql` (step 6, the SQL editor) | `91e315f8f18747fd3cd07e3b5c18be3382b901bac60f3d9a3e98c524b1aa1020` |
| `supabase/ops/schedule-sms-records-sweep.sql` (step 11) | `20b5a681aa06d7f6a1ffa814b64a18f99dd6aa0ff300e8a34a14067cb67cc64a` |
| `supabase/migrations/20261117100000_phone_test_mode_retired.sql` (step 13) | `f96ce801453c9df0fd908b2cf5cc37bad3261e6dc308b385fd9c0d714259d7eb` |
| `supabase/rollback/20261117100000_phone_test_mode_retired.rollback.sql` (Rollback) | `0d979e6350fef0353281b37131c3a74fe59bb1a86b53017cb1ca9c44d190416f` |
| `supabase/tests/hosted-baseline/20261117100000_phone_test_mode_retired.before.sql` (the rehearsal) | `22e09eeb841b034fbc670a68e61db470f89ebbcec2dc09594eda7681231caecb` |
| `supabase/tests/hosted-baseline/20261117100000_phone_test_mode_retired.after.sql` (the rehearsal) | `51e3df53d374a45c7d00c77c9da7a2d92d0dc0dd4e5067ad89e1f6d128f61951` |
| `supabase/migrations/20261027120000_phone_accounts.sql` (live; the rollback copies its tables, row-level security, revokes and grants) | `208f399152d394460941272ffdeffaa1189883ff251ed37d77a3ab69367f5ddc` |
| `supabase/migrations/20261030130000_phone_key.sql` (live; the rollback copies its two function bodies) | `d7cf188f6b63d14453a2b34d6c8c85838ed196d7a06e01e3bd94c66ae0a14667` |
| `supabase/ops/hosted-fingerprint.sql` (unchanged) | `0778c53f98bc1cbdcee82487651dabc3fa246674a5d0efa1d6502e7746819a00` |
| `supabase/ops/hosted-counts.sql` (unchanged) | `15fe76aecba6bb5104d8795338c1ecaee9bd07ec9a2a9b7aba728e2bdae8c4a0` |

From `sha256sum` at this record's commit. Recompute before asking for approval (`sha256sum <file>`). Approve by file name and hash, and stop if a hash differs.

- **`sms-hook.ts` changed after this table was made** (the final review's fixes, under "After the final review", below). Its row above, and its line in step 2's `pc-deploy.sh`, still hold the old hash, so `pc-deploy.sh` stops at the hash check until they are updated. Recompute the hash at the commit to be deployed, compare it with the fix report, and write it into both places as part of step 2's approval. The other two function files are unchanged.

- **The two bases.** Both were checked at these hashes before the rollback copied them (Global Constraints of the plan). The rollback's function bodies come from `phone_key.sql` lines 26-47 and 52-71, its tables from `phone_accounts.sql` lines 13-41 and its grants from lines 71-72 and 97-98. The mode row is the one change: it is inserted with test mode false.
- **The review is pasted into the SQL editor**, so its hash is checked by eye: compare the file's `sha256sum` with this table before copying it. Every other file is checked by its script.

## Checks made locally (17 November 2026)

At `c07332b` (Tasks 1 to 5). Task 6 changes documents only.

- **Full mode**, `bash scripts/test-database-docker.sh`: exit 0, 66 PASS lines (33 SQL files, 32 concurrency lines and the final line), among them `phone-accounts.sql`, `phone-key.sql` and `phone-test-mode-retired.sql`.
- **The hosted baseline with the candidate**, `bash scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261117100000_phone_test_mode_retired.sql`: exit 0, 27 PASS lines (the candidate, the 25 files of `tests.txt` and the final line).
  - The before file snapshots the five objects, proves test mode on and the swap working, runs the off script and the review with `\ir`, and checks the state after them: the Postgres hook then refuses with 503 and stores nothing.
  - The after file checks the five objects are gone and `phone_digits` stays. Inside a transaction that it then rolls back, it runs the rollback and compares every definition, grant, column, row-level security flag, ACL and constraint with the snapshot, checks the mode row reads false and `anon`'s `000000` gets null, and checks the rollback refuses while any of the five exists.
  - Until step 14 adds the migration to `migrations.txt`, a hosted-baseline run must name it: `tests.txt` already lists `phone-test-mode-retired.sql`.
- **The edge suite**, `node --import ./mobile/node_modules/tsx/dist/loader.mjs --test supabase/functions/_shared/*.test.ts`: 142 of 142, the 33 `send-sms` tests among them. A strict `tsc` of the five `send-sms` files (from `mobile/`, `npx tsc --ignoreConfig --noEmit --strict --allowImportingTsExtensions --target es2022 --module esnext --moduleResolution bundler --lib es2022,dom,dom.iterable --types node --skipLibCheck` on them): exit 0.
- **The app**, `cd mobile && npm run check` (the typecheck, the whole `npm test` chain with `../links/*.test.mjs`, and content validation): exit 0, 1,215 tests, none failed.
- **The four browser checks**, headless Chrome:
  - `node scripts/verify-phone.mjs` and `node scripts/verify-contact-invites.mjs` on Expo web, at `5d69dfe` (Task 3): PASS. `000000` is refused like any wrong code, the sent code verifies as typed, and any call to `exchange_test_code` fails the run.
  - `node --import tsx ../links/verify-personal.mjs` and `node --import tsx ../links/verify-open-link.mjs`, at `417de28` (Task 4): PASS. On `/i/`, `000000` is checked as typed and refused; on `/r/`, the sent code verifies as typed; any call to `exchange_test_code` fails the run.
  - Tasks 5 and 6 change no app or site code.
- **The scripts of sitting 1, sitting 2 and the rollback, rehearsed** as printed here, through a stand-in for the CLI that sends each query to a local replay of `migrations.txt` in a throwaway `postgres:17` container. Stand-ins took the place of the history table, pg_cron (with the sender's job), pg_net and `vault.secrets`, and the snapshots were CSV rather than JSON; the fixtures were one synthetic test-mode account with a stored code, a log row, a session and a refresh token. `pc-deploy.sh` and `pc-secrets.sh` need the hosted project, so only the deploy script's hash list and the syntax of both were checked.
  - `pc-before.sh`: `25 | 20261116120000`; `test_mode` true, both `may_end_*` true; the job list; `hosted-before.json` equal to the replay's fingerprint, 534 rows.
  - `pc-retire-apply.sh` before the switch-off: "Test mode is still on: run the switch-off first", no snapshot written, the history unchanged.
  - `pc-test-mode-off.sh`: `f | 0 | 0 | 0 | 1`, then `f | 0 | 1`. Run again: "Test mode is already off". With the file changed by one line it stopped at the hash.
  - The review ran read-only. `pc-after.sh`: `hosted-after.json` equal to `hosted-before.json`.
  - `pc-sweep-schedule.sh` with no Vault secret: refused, no job made. With both: `sms-records-sweep | 17 3 * * * | t`; run again, still one job.
  - `pc-retire-apply.sh`: refused with a later version in the history, and with a stored code, each writing no snapshot. Then applied: `26 | 20261117100000`, 534 → 518 rows (16 removed, none added). Run again: "Test mode is already retired", and the before snapshot was kept.
  - `pc-retire-rollback.sh`: the fingerprint equal to `hosted-before-retired.json`; test mode false, both tables empty, `anon`'s `000000` null. Run again: "Test mode objects exist: nothing to roll back".
- **No caller is left.** `git grep -n "exchange_test_code" -- mobile links supabase/functions` prints one line, the site's negative test (`links/personal-flow.test.mjs:354`, `assert.ok(!page.includes("exchange_test_code"))`). The app's negative test names `exchangeTestCode` (`mobile/src/services/phoneCode.test.ts:68`). No app, site or function code calls it.
- **Mutation checks**, on scratch copies, each caught by a test: the 4-second timeout removed, `retry-after` removed, `new_phone` ignored, a `549…` number folded, the window widened to 301 seconds, a number logged, a 31-character sweep secret accepted, a record exactly a day old deleted, the next-page origin check removed (Tasks 1 and 2); the rollback reopening test mode, a grant or a revoke dropped, the off script without its update, its truncate or its session delete, and the migration without one of its drops (Task 5).

## After the final review (17 November 2026)

Fixes on `asr-1-phone-codes` after the final whole-branch review (lane P), on top of `1e970c5`. Nothing here is applied either.

- **No retry, a shorter wait.** A busy, down, slow or unreachable Twilio (429, 5xx, a network error or the timeout) now answers `200` with `{"error":{"http_code":503,"message":"Text messages aren’t available right now. Try again later."}}` and no `retry-after`, and the sender waits 3 seconds, not 4. Supabase's Auth Hooks guide (supabase.com/docs/guides/auth/auth-hooks, "Error handling", HTTP; read 17 November 2026 through the Supabase docs search) retries an HTTP hook only on a `429` or `503` with a non-empty `retry-after`, "up to three retries with a back-off of two seconds", inside "a time budget of 5s for the entire webhook invocation, including retry requests". So after a slow Twilio the old `503` with `retry-after: 1` (at up to 4 seconds) could only end in `hook_timeout`, whose raw words the app and the site showed, and a retry after an abort could text a second code that Auth never saves.
- **Only the hook's words are shown.** The app (`sendPhoneCode`, so the deletion proof's `sendDeletionPhoneCode` too, and the fold's `sendFoldCode`) and the site (`sendError`, `errorText`) show a server message only when it is one of the hook's three `SMS_COPY` lines; tests compare the app's and the site's copies with the hook's. Any other Auth message, and every `hook_*` code (Supabase's Auth error codes list `hook_timeout`, `hook_timeout_after_retry`, `hook_payload_over_size_limit` and `hook_payload_invalid_content_type`), reads as "Check your connection and try again.".
- **A confirmed number wins over a stale `new_phone`.** The hook texts an account's confirmed number (`user.phone` with `phone_confirmed_at`, the app's `phoneVerified`) even when `user.new_phone` is set, so a fold after an unfinished Add your number no longer sends sign-in codes to the number that was never confirmed (Known gaps, 11). An account with no confirmed number is texted on `new_phone` as before, and an invalid one is still refused, never swapped for `user.phone`.
- **Signatures joined by ", ".** The signature list is split on whitespace and a trailing comma is dropped, so a rotation header `v1,<new>, v1,<old>` verifies with either secret. The function must still hold every secret Auth signs with (`send-sms/README.md`, Secrets).
- **Checks** (from the worktree root unless named): the edge suite, 141 of 141 (was 138; `sms-hook.test.ts` 26 tests, was 23); `npx --yes deno@2.1.4 check --no-lock supabase/functions/send-sms/index.ts`, exit 0; `cd mobile && npm run check`, exit 0, 1,337 tests, none failed; the browser checks, headless Chrome: `node --import tsx ../links/verify-personal.mjs` and `node --import tsx ../links/verify-open-link.mjs` PASS, and on Expo web (port 8091, with its own Metro cache) `node scripts/verify-phone.mjs` and `node scripts/verify-contact-invites.mjs` PASS. Each changed behaviour's test was seen failing before its fix.
- **The hook's hash changed** (Files and hashes, above): it must be recomputed and approved again before step 2.

## Order, and why the current TestFlight build keeps working

- **The hook switch** changes nothing the build sees: it still calls `signInWithOtp`, and the code now arrives by text. A typed real code verifies as before.
- **Test mode off:** the build's swap runs only on a typed `000000` (`mobile/src/services/phoneCode.ts:68`); `exchange_test_code` then returns null, the build verifies `000000` as typed, and Auth refuses it as a wrong code. Real codes are untouched. The fold's send and verify (`phoneFold.ts:63`, `:85-86`) behave the same.
- **Every session ends:** the build's next refresh fails, it signs out, and the person signs in again by text code, Apple, Google or password. Web pages ask to confirm the number again (`personal.js`'s `freshSession`, "signedOut").
- **The site deploy** is independent of the build.
- **The retiring migration:** the build calls `exchange_test_code` only on a typed `000000`, which then answers 404 and reads "Check your connection and try again." (Known gaps, 1). Real codes are untouched.
- **CAPTCHA stays off** throughout. Switching it on later locks out builds without Task 9, so release runbook steps 20 and 21 put it after the new build.

(The line numbers are those of the current TestFlight build's code, before Task 3 removed the swap.)

## Service texts (F2, F3, F5)

The Privacy Policy (sections 3.1 and 5.2) and `docs/compliance/data-requests.md` section 4 promise texts to accounts with no email: a suspension notice, an identity-check code, a breach warning, an archive password. `send-sms` sends only sign-in codes.

- The owner sends a service text by hand from Twilio's console, through the same Messaging Service (sender "Resbite").
- The words are GSM-7 only, with no apostrophe, so the text stays one plain segment.
- The number is typed in the console only. It is never written in the repo or a `qa/` record.
- The daily sweep deletes the message record, as it does a code's.
- The request log or the breach log (both outside the repo) records that a text was sent, never the number.

## Rollout (owner-run)

Every step needs the owner's approval at the time.

- Each script is written into the home directory from its block below, read by the owner, and run with `! bash ~/<name>.sh`. The hashes are filled in from "Files and hashes".
- Each runs from `${REPO:-$HOME/dev/resbite-app}` at the merged commit.
- None prints a secret, a number or an account id.
- The advisors are read through the Supabase MCP server once the owner approves.

**Before the sitting (owner, no Supabase change):**

- Tasks 1, 2, 4 and 5 merged where the rollout runs from (the owner's choice). Task 3 rides the next build.
- Twilio: an account in Resbite Ltd's name; the DPA accepted and recorded in `docs/compliance/vendors.md` (F7); a Messaging Service with the alphanumeric sender "Resbite" (and a sender number only if a permitted country needs one); Geo Permissions, the usage trigger, auto-recharge and pumping protection as Decision 13; an API key. Values are typed only into `~/pc-secrets.sh`'s prompts.
- BR-2026-001 opened in the breach log, outside the repo (`docs/compliance/breach-response.md` section 11).

### Sitting 1: SMS on, test mode off (roadmap H1; release runbook step 11)

1. **Before snapshot and checks**, `~/pc-before.sh` (read-only):

   ```bash
   #!/bin/bash
   # Read-only: the before snapshot and what the switch-off needs (phone codes, step 1).
   set -euo pipefail
   cd "${REPO:-$HOME/dev/resbite-app}"
   D=qa/phone-codes-2026-11-17
   supabase db query --linked -f supabase/ops/hosted-fingerprint.sql -o json > "$D/hosted-before.json"
   supabase db query --linked -f supabase/ops/hosted-counts.sql -o json > "$D/hosted-counts-before.json"
   supabase db query --linked "select count(*) as applied, max(version) as latest from supabase_migrations.schema_migrations"
   supabase db query --linked "select (select test_mode from private.phone_mode) as test_mode, (select count(*) from private.test_codes) as stored_codes, (select count(*) from private.test_mode_log) as log_rows, has_table_privilege(current_user, 'auth.sessions', 'delete') as may_end_sessions, has_table_privilege(current_user, 'auth.refresh_tokens', 'delete') as may_end_refresh_tokens"
   supabase db query --linked "select jobname from cron.job order by jobname"
   ```

   - **The history line** reads `25 | 20261116120000` (or the count and latest another AS sitting recorded first).
   - `test_mode` true. Record `stored_codes` and `log_rows`.
   - **Both `may_end_*` true, otherwise stop.** Step 5 can't end the sessions without them.
   - No `sms-records-sweep` job.
   - **The fingerprint** matches a local replay of `migrations.txt`, by `(kind, name)` (534 rows on 17 November 2026), with only the known `acl` differences (hosted's default `service_role` grants, as in the open-beta and chat records). Stop if anything else differs.
   - If the CLI's role is refused a `private` or `cron` read, paste that query into the SQL editor. It is read-only there too.
2. **[approval: the three function files by name and sha256]** Deploy, `~/pc-deploy.sh`:

   ```bash
   #!/bin/bash
   # Deploy send-sms (phone codes, step 2). Only after the owner approves the three files by name and sha256.
   set -euo pipefail
   cd "${REPO:-$HOME/dev/resbite-app}"
   sha256sum -c - <<EOF
   503930848088f05e45747f3bf8e320ab9060823b8518ebd355e7062cf68cdaff  supabase/functions/send-sms/index.ts
   66cab35907963554a9870b88d0eeac796231038105ed4395818d36e5419d72be  supabase/functions/_shared/sms-hook.ts
   80a6bb871867c9d40aab4da8a564e3470541f2314290afaad8edbb2af636cad5  supabase/functions/_shared/sms-records.ts
   EOF
   REF="$(cat supabase/.temp/project-ref)"
   supabase functions deploy send-sms --no-verify-jwt --project-ref "$REF"
   curl -s -X POST -H 'Content-Type: application/json' -d '{}' "https://$REF.supabase.co/functions/v1/send-sms"; echo
   curl -s -X POST "https://$REF.supabase.co/functions/v1/send-sms/sweep"; echo
   ```

   - The script stops before deploying if a hash differs.
   - **Expected:** `{"error":{"http_code":500,"message":"Text messages aren’t available right now. Try again later."}}` from the hook, and `{"error":"unauthorized"}` from the sweep. Both are the function's own answers, so JWT checking is off and both routes refuse strangers.
     - The hook answers 500, not 401, at this step: its secret is set only in step 3, and it checks for a secret before the signature. After step 3 the same call answers `{"error":{"http_code":401,"message":"Invalid signature"}}`.
     - A gateway error instead (a missing authorization header, an invalid JWT) means JWT checking is on: stop, and deploy again with `--no-verify-jwt`.
   - In the dashboard, the function's JWT verification reads off.
3. **[approval]** Dashboard → Authentication → Hooks → Send SMS: type HTTPS, URL `https://<project-ref>.supabase.co/functions/v1/send-sms`; generate the secret and copy it. Then `~/pc-secrets.sh`:

   ```bash
   #!/bin/bash
   # The send-sms secrets (phone codes, step 3). Prompts for each value; prints names only.
   set -euo pipefail
   cd "${REPO:-$HOME/dev/resbite-app}"
   umask 077; T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
   ask() { local v; read -rsp "$1: " v; echo >&2; [ -n "$v" ] || { echo "$1 is empty" >&2; exit 1; }; printf '%s=%s\n' "$1" "$v" >> "$T/env"; }
   for n in SEND_SMS_HOOK_SECRETS TWILIO_ACCOUNT_SID TWILIO_API_KEY_SID TWILIO_API_KEY_SECRET TWILIO_MESSAGING_SERVICE_SID SMS_SWEEP_SECRET; do ask "$n"; done
   grep -q '^SEND_SMS_HOOK_SECRETS=v1,whsec_' "$T/env" || { echo "The hook secret must start v1,whsec_" >&2; exit 1; }
   [ "$(grep '^SMS_SWEEP_SECRET=' "$T/env" | cut -d= -f2- | tr -d '\n' | wc -c)" -ge 32 ] || { echo "SMS_SWEEP_SECRET needs 32 characters or more" >&2; exit 1; }
   REF="$(cat supabase/.temp/project-ref)"
   supabase secrets set --env-file "$T/env" --project-ref "$REF"
   supabase secrets list --project-ref "$REF" | cut -d'|' -f1
   ```

   - The owner generates `SMS_SWEEP_SECRET` in their password manager and keeps it for step 11.
   - **Expected:** the list shows the six names among the function secrets. It prints no value.
   - Then save the hook. If the dashboard shows the secret only after saving, save, then run the script at once: codes fail for that minute.
   - Run step 2's first `curl` again: it now answers `{"error":{"http_code":401,"message":"Invalid signature"}}`.
4. **Prove a real code** on the current TestFlight build with the owner's own number: sign out, sign in by number; a text from "Resbite" arrives with "Your Resbite code is …", and the code signs in.
   - **If no text arrives:** point the hook back to Postgres `public.send_sms_hook` (test mode is still on; nothing else changed), read the function's log lines (the outcome and Twilio's code), and stop.
   - **Read Auth's logs once** (Dashboard → Logs → Auth) for the step's code request: the hook call and how long it took. If a `hook_timeout` or `hook_timeout_after_retry` line appears at any point in the sitting, record its HTTP status and error code under "Applied" (from memory of Auth's source: `422`, `hook_timeout`; UNVERIFIED, Known gaps 2). Whatever the status, the app and the site show "Check your connection and try again." for it.
5. **[approval: by sha256]** Test mode off, `~/pc-test-mode-off.sh`:

   ```bash
   #!/bin/bash
   # Test mode off, the stored codes emptied, every session ended (phone codes, step 5). Only after step 4 passed.
   set -euo pipefail
   cd "${REPO:-$HOME/dev/resbite-app}"
   F=supabase/ops/phone-test-mode-off.sql
   echo "868f42730eef93d0991f7a635a6ba666e383c974df18b6fc156aa807d1b908e3  $F" | sha256sum -c -
   GUARD="if pg_catalog.to_regclass('private.test_codes') is null then raise exception 'Test mode is already retired'; end if;
    if not coalesce((select test_mode from private.phone_mode), false) and not exists (select 1 from private.test_codes) then raise exception 'Test mode is already off'; end if;"
   mkdir -p /tmp/pc
   { echo 'begin;'; echo "do \$\$ begin $GUARD end \$\$;"; cat "$F"; echo; echo 'commit;'; } > /tmp/pc/off.sql
   supabase db query --linked -f /tmp/pc/off.sql
   supabase db query --linked "select coalesce((select test_mode from private.phone_mode), false) as test_mode, (select count(*) from private.test_codes) as stored_codes, (select count(*) from private.test_mode_log) as log_rows"
   ```

   - The script stops before running anything if the hash differs.
   - Everything runs in one transaction, the guard first. A second run refuses with "Test mode is already off" and changes nothing.
   - **Expected:** the file's own row reads `test_mode` false, `codes_left` 0, `sessions_left` 0, `refresh_tokens_left` 0 and `log_rows_kept` as in step 1; then `test_mode` false, `stored_codes` 0 and `log_rows` as in step 1. More log rows only if someone used test mode between steps 1 and 3; step 6 reads them all.
   - Everyone is signed out within the hour (access tokens run to expiry).
6. **The review, in the SQL editor:** compare the file's `sha256sum` with "Files and hashes", paste `supabase/ops/phone-test-mode-review.sql`, and run it. It is one result in three parts (`log`, `exchanged`, `identity`).
   - Compare every `exchanged` and `identity` row with the tester list kept outside the repo, and complete BR-2026-001 by its decision rule (`docs/compliance/breach-response.md` section 11).
   - **If any row is not a known tester's** or a team test account's, the 72-hour clock runs from that moment (`docs/compliance/breach-response.md` sections 5 and 6).
   - What the review shows (numbers, emails, account ids) stays in the SQL editor: never in this file, the repository or a chat.
   - This README records only: rows reviewed, matched, unmatched; identities reviewed, matched, unmatched; the decision.
7. **[approval]** Auth settings and Twilio settings as Decision 13. Fill Observed and Date in the C11 record, below. CAPTCHA stays off.
8. **[approval: Vercel]** Deploy the link site from this plan's own commit: the `asr-1-phone-codes` head, whose `links/` is `main`'s (`db8a221`) plus Task 4 only.
   - Do it as `qa/contact-invites-2026-10-28/README.md:58` did: generate, link, delete the `.env.local` the link writes, preview, then production.
   - **Never from a later `app-store-readiness` head.** It may carry plan 4's new tick wording and `TERMS_VERSION` fallback, or plan 5's pages, which must not go live before the documents are published (plan 5, R0). If plan 5's `generate.mjs` is in the commit after all, build with `--legal=off`, and confirm on the preview that the tick reads as on the live site.
   - On the preview, `curl -s <preview>/personal.js | grep -c exchange_test_code` prints `0`.
   - Record both deployment ids under "Applied": the previous one is the rollback.
   - Add the Vercel firewall rate limit on `/i/*`, beside the one on `/r/*` (D5).
9. **Prove it on the web, and refuse `000000`:** a real code on an open `/r/` link of a test resbite; `000000` refused, as "That code doesn’t match. Try again.", on the app and on the site.
10. **After snapshot**, `~/pc-after.sh` (read-only):

    ```bash
    #!/bin/bash
    # Read-only: the after snapshot of sitting 1 (phone codes, step 10).
    set -euo pipefail
    cd "${REPO:-$HOME/dev/resbite-app}"
    D=qa/phone-codes-2026-11-17
    supabase db query --linked -f supabase/ops/hosted-fingerprint.sql -o json > "$D/hosted-after.json"
    supabase db query --linked -f supabase/ops/hosted-counts.sql -o json > "$D/hosted-counts-after.json"
    supabase db query --linked "select count(*) as applied, max(version) as latest from supabase_migrations.schema_migrations"
    supabase db query --linked "select coalesce((select test_mode from private.phone_mode), false) as test_mode, (select count(*) from private.test_codes) as stored_codes, (select count(*) from private.test_mode_log) as log_rows"
    ```

    - **Expected:** the history line as in step 1; `hosted-after.json` equals `hosted-before.json` (no schema change); `test_mode` false and `stored_codes` 0; in `hosted-counts-after.json`, `private.test_codes` 0 and the other counts different only by live use.
    - Advisors: unchanged.
11. **[approval: by sha256] The sweep's schedule.** Skip this step if the owner fills the Privacy Policy's placeholder 5 another way (Decision 7).
    - Dashboard → Vault: `sms_sweep_url` (`https://<project-ref>.supabase.co/functions/v1/send-sms/sweep`) and `sms_sweep_secret` (step 3's value).
    - Then `~/pc-sweep-schedule.sh`:

      ```bash
      #!/bin/bash
      # The sweep's schedule (phone codes, step 11). Only after the owner approves the file by sha256 and adds the two
      # Vault secrets. Prints a count, the job's name and its schedule: never the URL or the secret.
      set -euo pipefail
      cd "${REPO:-$HOME/dev/resbite-app}"
      F=supabase/ops/schedule-sms-records-sweep.sql
      echo "20b5a681aa06d7f6a1ffa814b64a18f99dd6aa0ff300e8a34a14067cb67cc64a  $F" | sha256sum -c -
      supabase db query --linked "select count(*) as sweep_vault_secrets from vault.secrets where name in ('sms_sweep_url', 'sms_sweep_secret')"
      GUARD="if (select count(*) from vault.secrets where name in ('sms_sweep_url', 'sms_sweep_secret')) <> 2 then raise exception 'Add the Vault secrets sms_sweep_url and sms_sweep_secret first'; end if;"
      mkdir -p /tmp/pc
      { echo 'begin;'; echo "do \$\$ begin $GUARD end \$\$;"; cat "$F"; echo; echo 'commit;'; } > /tmp/pc/sweep.sql
      supabase db query --linked -f /tmp/pc/sweep.sql
      supabase db query --linked "select jobname, schedule, active from cron.job where jobname = 'sms-records-sweep'"
      ```

    - The script stops before running anything if the hash differs.
    - **`sweep_vault_secrets` must read 2.** With any other count the guard refuses ("Add the Vault secrets …"), nothing changes, and the script stops: add the missing secret and run it again.
    - **Expected:** `sms-records-sweep | 17 3 * * * | t`. The file is safe to run again: it removes the job of that name first.
    - If the CLI's role is refused `vault` or `cron`, paste the file into the SQL editor instead, after the same hash check by eye, as its header says.
    - **The next day:** `supabase db query --linked "select d.status, d.start_time from cron.job_run_details d join cron.job j on j.jobid = d.jobid where j.jobname = 'sms-records-sweep' order by d.start_time desc limit 3"` shows a `succeeded` run, and the function's log a `swept` line with its three counts. A `succeeded` run only means the call was queued; the `swept` line is the proof.
12. **Record each step under "Applied"**, with dates and counts only.

### Sitting 2: retire test mode (roadmap H3)

Only once BR-2026-001 is complete and the C11 record shows the HTTPS hook. The roadmap applies this migration before plan 2's `20261117110000`.

13. **[approval: by name and sha256]** `~/pc-retire-apply.sh`, in `ch1-apply.sh`'s shape (`qa/chat-release/README.md`, step 2):

    ```bash
    #!/bin/bash
    # The retiring migration (phone codes, step 13). Only after the owner approves the file by name and sha256, once
    # BR-2026-001 is complete and the C11 record shows the Send SMS hook on HTTPS.
    set -euo pipefail
    cd "${REPO:-$HOME/dev/resbite-app}"
    D=qa/phone-codes-2026-11-17
    F=supabase/migrations/20261117100000_phone_test_mode_retired.sql
    echo "f96ce801453c9df0fd908b2cf5cc37bad3261e6dc308b385fd9c0d714259d7eb  $F" | sha256sum -c -
    GUARD="if pg_catalog.to_regclass('private.test_codes') is null then raise exception 'Test mode is already retired'; end if;
     if coalesce((select test_mode from private.phone_mode), false) then raise exception 'Test mode is still on: run the switch-off first'; end if;
     if exists (select 1 from private.test_codes) then raise exception 'Stored codes remain: run the switch-off first'; end if;
     if exists (select 1 from supabase_migrations.schema_migrations where version > '20261117100000') then raise exception 'A later migration is applied: rename this file first'; end if;"
    supabase db query --linked "do \$\$ begin $GUARD end \$\$"
    supabase db query --linked -f supabase/ops/hosted-fingerprint.sql -o json > "$D/hosted-before-retired.json"
    supabase db query --linked -f supabase/ops/hosted-counts.sql -o json > "$D/hosted-counts-before-retired.json"
    mkdir -p /tmp/pc
    { echo 'begin;'; echo "do \$\$ begin $GUARD end \$\$;"; cat "$F"; echo; echo 'commit;'; } > /tmp/pc/retire.sql
    supabase db query --linked -f /tmp/pc/retire.sql
    supabase migration repair --status applied 20261117100000 --linked --yes
    supabase db query --linked "select count(*) as applied, max(version) as latest from supabase_migrations.schema_migrations"
    supabase db query --linked -f supabase/ops/hosted-fingerprint.sql -o json > "$D/hosted-after-retired.json"
    supabase db query --linked -f supabase/ops/hosted-counts.sql -o json > "$D/hosted-counts-after-retired.json"
    ```

    - The script stops before any change if the hash differs. Never `supabase db push`.
    - The guard runs twice: once on its own, read-only, so a refused run stops before it overwrites the before snapshots; then again inside the apply's one transaction, before the file. Each refusal changes nothing, and the script stops before the history repair:
      - "Test mode is already retired": a second run.
      - "Test mode is still on: run the switch-off first", or "Stored codes remain: run the switch-off first": step 5 hasn't run, or something wrote a code since. Stop and find out why.
      - "A later migration is applied: rename this file first": rename the file, its rollback, its rehearsal pair and its line in `tests.txt` to a free timestamp after the last applied version, rehearse again, and approve the new hash (the plan's Global Constraints).
    - **Expected:** the history line `26 | 20261117100000`.
    - If the apply succeeded and only the repair failed, run the repair alone, from the repository root, then the script's last three lines, for the history and the after snapshots:

      ```
      supabase migration repair --status applied 20261117100000 --linked --yes
      ```

    - **Locks, all brief.** Each drop takes its object's lock. Nothing on hosted calls these objects any more: Auth calls the HTTPS hook, and only a build older than Task 3 calls `exchange_test_code`, on a typed `000000` (Known gaps, 1).
14. **Compare and record.**
    - `hosted-after-retired.json` equals a local replay of `migrations.txt` plus the candidate, by `(kind, name)`, with the same known `acl` differences. From `hosted-before-retired.json`, 16 rows are gone and nothing is added or changed: the 2 functions, the 3 tables, their 8 constraints (3 keys, 5 checks) and their 3 key indexes. On the local replay that is 534 rows before and 518 after.
    - Advisors: the WARN on `public.exchange_test_code` and the INFO lines on the three tables are gone.
    - Append this line to `supabase/tests/hosted-baseline/migrations.txt`:

      ```
      20261117100000_phone_test_mode_retired.sql             20261117100000
      ```

    - Run `bash scripts/test-database-docker.sh --hosted-baseline` with the still-pending AS candidates only (in order) → PASS.
    - A real code still signs in on the app.
    - Record under "Applied", with dates and counts only.

### Sitting 3: CAPTCHA on (roadmap H12; release runbook step 21)

Only after Tasks 7 to 9, the step 20 build and the testers' update. Blocked until the owner picks the vendor (AS-D5).

15. **[approval: Vercel]** Set `CAPTCHA_VENDOR` and `CAPTCHA_SITE_KEY` (a site key allowed for `link.resbite.com`) and deploy. `/captcha` shows the widget; `/r/` and `/i/` show it beside Send code. **[approval: EAS]** `EXPO_PUBLIC_CAPTCHA_URL=https://link.resbite.com/captcha` was set before the step 20 build.
16. **[approval: Supabase]** Auth → CAPTCHA on, with the vendor and its secret key. Check at once: phone sign-up and sign-in, Add your number, email sign-up, password sign-in, password reset, Apple, Google, the fold, and `/r/` and `/i/`.
    - Any path refused: switch CAPTCHA off (instant), record which path, and add the token there.
    - Record the result in the C11 record: the vendor's name, never its secret.

## Auth settings record (C11)

Filled at step 7 (and at step 16 for CAPTCHA). Observed and Date stay empty until the sitting. Values only: never a secret, a key, a SID, a number or an account id.

| Setting | Where | Value for 1.0 | Observed | Date |
| --- | --- | --- | --- | --- |
| Phone provider | Auth → Sign In / Providers → Phone | On | | |
| Enable phone confirmations | Auth → Sign In / Providers → Phone | On (off would confirm a number with no code, so Add your number would prove nothing) | | |
| Send SMS hook | Auth → Hooks → Send SMS | HTTPS, `https://<project-ref>.supabase.co/functions/v1/send-sms`. The secret is never written down | | |
| SMS OTP length | Auth → Sign In / Providers → Phone | 6 (the app's and the site's "6-digit") | | |
| SMS OTP expiry | Auth → Sign In / Providers → Phone | 600 seconds (the app's and the site's 10-minute `CODE_LIFETIME_MS`) | | |
| Interval between codes to one number | Auth settings (the minimum time between code requests) | 60 seconds (the app's and the site's resend delay) | | |
| Rate limit for sending SMS messages | Auth → Rate Limits | 30 an hour (Supabase's default) | | |
| Allow manual linking | Auth → Sign In / Providers | On | | |
| Test phone numbers (fixed codes) | Auth → Sign In / Providers → Phone | None. A listed number signs in with its fixed code, with no text | | |
| Apple provider | Auth → Sign In / Providers → Apple | On (SI-3) | | |
| Google provider | Auth → Sign In / Providers → Google | On; the Google app published with a verified brand (SI-12) | | |
| CAPTCHA | Auth → Attack Protection | Off until release runbook step 21; then the vendor's name, never its secret | | |
| Twilio account holder | Twilio console → Account | Resbite Ltd | | |
| Twilio DPA accepted | Twilio's Data Protection Addendum; `docs/compliance/vendors.md` (F7) | Accepted (the date) | | |
| Twilio region | The API host `send-sms` posts to | United States (`api.twilio.com`). Another region is a change to `send-sms` first | | |
| Messaging Service | Twilio console → Messaging → Services | Sender "Resbite" (alphanumeric); a sender number only if a permitted country needs one | | |
| Geo Permissions | Twilio console → Messaging → Geo permissions | United Kingdom, plus any country the owner names (country names only) | | |
| Usage trigger | Twilio console → Usage triggers | The D-3 budget (the amount; release runbook placeholder 1) | | |
| Auto-recharge | Twilio console → Billing | Off, or capped at the budget | | |
| SMS pumping protection | Twilio console → Messaging settings | On, or "not offered" for Programmable Messaging (UNVERIFIED) | | |
| Twilio API key | Twilio console → API keys | Created (the date). Never its SID | | |

## Known gaps

1. After the retiring migration, a build older than Task 3 shows "Check your connection and try again." when someone types `000000`, and in the one-in-a-million case where a real code is `000000` it fails that attempt; "Send a new code" fixes it.
2. Whether Auth passes the hook's `200`-with-`http_code` words and status through to the client is UNVERIFIED (Decision 5). Supabase's Auth Hooks guide (supabase.com/docs/guides/auth/auth-hooks, "Error handling", read 17 November 2026) documents the `{"error":{"http_code","message"}}` object for Postgres hooks; for HTTP hooks it says only that 200, 202 and 204 proceed, 400 and 403 become a 500, and a `429` or `503` with a non-empty `retry-after` is retried, with one 5-second budget for the whole invocation, retries included; its HTTP Send SMS example returns the same error object. If Auth ignores a `200`'s error, a refused number reads as a connection problem, and a busy Twilio reads as sent (no text arrives; "Send a new code" after a minute). Auth's error codes list `hook_timeout` and `hook_timeout_after_retry` with no HTTP status; their `422` is from memory of Auth's source. Step 4 records what Auth's logs show.
3. A lost day's sweep leaves records until the next run; a run caps at 1,000 records.
4. Tokens issued before step 5 keep working until they expire (an hour by default); they can't be refreshed.
5. Which Auth endpoints Supabase's CAPTCHA covers is UNVERIFIED until step 16.
6. Twilio's SMS pumping protection for Programmable Messaging, and whether Geo Permissions must include countries of existing testers, are the owner's to confirm in the console.

Found while building (Tasks 1 to 5):

7. **A record can live a little over 31 days.** With one run a day and records kept for 24 hours, a record is deleted between 24 and 48 hours after it was sent. With Twilio's 30 days of backups after deletion, the worst case is about 32 days, not the 31 the Privacy Policy's placeholder 5 proposes. The owner's wording for placeholder 5 should allow for it, or the schedule should run twice a day.
8. **The sweep deletes every message record on the Twilio account**, inbound replies such as STOP included: Twilio's list can't be filtered by Messaging Service. Keep the account (or a subaccount) for Resbite's codes and service texts only.
9. **`send-sms` has run on Deno locally, not yet on Supabase's Edge runtime.** On 17 November 2026, on the integration branch: `deno check` (Deno 2.1.4) passes for `send-sms/index.ts`, `delete-account`, `cleanup-account` and `fold-phone-account`; `deno test --unstable-node-globals` runs 32 of the 33 `sms-hook`/`sms-records` tests green (the one left stubs the global `Deno`, which Deno itself forbids, so it is Node-only by design); and `deno run` served the function locally, answering a GET with 405, an unsigned POST with 401 "Invalid signature" and the sweep without a bearer with `{"error":"unauthorized"}`, logging only the route and outcome. Step 2's two calls are its first run on the hosted Edge runtime; step 4 is its first real text.
10. **`/r/` is checked with the sent code only.** The browser check types `000000` on `/i/`; `/r/` shares the same `onVerify`, and a unit test asserts the page holds no `000000` path. Step 9 checks both on the live site.

Found in the final review (17 November 2026):

11. **A folded account keeps Auth's stale pending number.** The fold sets the number through the admin API, which (UNVERIFIED) leaves `auth.users.phone_change` from an earlier Add your number in place. Since the final review the hook ignores it for an account with a confirmed number. Clearing `phone_change`, `phone_change_token` and `phone_change_sent_at` in `private.fold_web_account` would be a later migration, with its own rollback; it is not needed for the fix.

## Rollback

Only with the owner's approval.

- **Before step 5:** point the Auth hook back to Postgres `public.send_sms_hook`. Nothing else changed.
- **After step 5, test mode is off for good.** A Twilio failure means fixing Twilio (keys, Geo Permissions, balance). Reopening test mode (the hook back to Postgres and `update private.phone_mode set test_mode = true`) reopens SI-1's hole for everyone and needs a new breach-log note. It is the owner's decision, not a rollback step.
- **The site:** promote the previous production deployment (its id is under "Applied").
- **The sweep:** `select cron.unschedule('sms-records-sweep');`.
- **CAPTCHA:** switch it off in Auth.
- **The retiring migration:** `~/pc-retire-rollback.sh`, in `ch3-rollback.sh`'s shape (`qa/chat-release/README.md`, "Rollback"):

  ```bash
  #!/bin/bash
  # The retiring migration's rollback (phone codes). Only with the owner's approval. It recreates the five objects
  # empty, with test mode off: it never reopens test mode.
  set -euo pipefail
  cd "${REPO:-$HOME/dev/resbite-app}"
  D=qa/phone-codes-2026-11-17
  F=supabase/rollback/20261117100000_phone_test_mode_retired.rollback.sql
  echo "0d979e6350fef0353281b37131c3a74fe59bb1a86b53017cb1ca9c44d190416f  $F" | sha256sum -c -
  mkdir -p /tmp/pc && { echo 'begin;'; cat "$F"; echo; echo 'commit;'; } > /tmp/pc/retire-rollback.sql
  supabase db query --linked -f /tmp/pc/retire-rollback.sql
  supabase db query --linked -f supabase/ops/hosted-fingerprint.sql -o json > "$D/hosted-after-rollback-retired.json"
  ```

  - The script stops before running anything if the hash differs. The file holds no psql meta-command.
  - It refuses, changing nothing, while any of the five objects exists ("Test mode objects exist: nothing to roll back").
  - `hosted-after-rollback-retired.json` must equal `hosted-before-retired.json`: the fingerprint holds definitions, not rows. The rows don't come back: the mode row reads false, and `private.test_codes` and `private.test_mode_log` are empty, which is why the migration waits for BR-2026-001.
  - The Send SMS hook stays on HTTPS, and test mode stays off.
  - Remove the line from `migrations.txt`. The hosted history row stays, as the earlier rollbacks left theirs. Never run `supabase migration repair --status reverted`.
  - Run it before the rollbacks of `20261030130000_phone_key` and `20261027120000_phone_accounts`, which redefine or drop these objects.

## Applied

Nothing yet.

- Record each step's date and what it showed: counts, `true` or `false`, the history line, the deployment ids and the function's version.
- For step 6, only the counts and the decision: rows reviewed, matched, unmatched; identities reviewed, matched, unmatched; the decision. Never a number, an email, an account id or a tester's name.
- For steps 3 and 11, that the secrets are set, by name. Never a value.

## Not done here

No hosted change, no function deployment, no secret or Vault entry, no schedule, no Auth or Twilio setting, no SQL editor run, no Vercel deployment, no EAS variable and no TestFlight upload.
