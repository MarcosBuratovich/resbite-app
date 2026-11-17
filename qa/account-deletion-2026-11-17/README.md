# Account deletion: release runbook (17 November 2026)

- **Spec:** [the App Store readiness gap analysis](../../docs/superpowers/specs/2026-11-17-app-store-readiness-design.md): section 2 (blocker 1); rows DEL-1 to DEL-8 and UGC-15; workstreams B3 and B6; C2; D8; decisions D-4, D-19 and D-20; section 6, phase 3, step 13. The owner's decisions AS-D3 and AS-D8, and the calls AS-R1 to AS-R3, are in the [decision log](../../knowledge-base/08-decisions.md), under "App Store readiness (AS)". This plan's own calls are ASR2-1 to ASR2-10 there.
- **Plan:** [App Store readiness plan 2, account deletion](../../docs/superpowers/plans/2026-11-17-asr-2-account-deletion.md). The public promise is [`docs/legal/delete-account.md`](../../docs/legal/delete-account.md). The internal procedures are [`docs/compliance/data-requests.md`](../../docs/compliance/data-requests.md) section 8, [`law-enforcement-requests.md`](../../docs/compliance/law-enforcement-requests.md) section 11 and [`retention-schedule.md`](../../docs/compliance/retention-schedule.md). A restore follows [`qa/deletion-restore-procedure.md`](../deletion-restore-procedure.md).
- **Code:** branch `asr-2-account-deletion`. Tasks 1 to 6 were merged into `app-store-readiness` at `54e202b`; Tasks 7 to 9 follow on this branch.
- **Nothing here is applied.** No SQL has run on the hosted project, no function is deployed, no secret, Vault entry or schedule is set, no source gate is open, no EAS variable is set and no build is made, until "Applied" says otherwise. Every step below needs the owner's explicit approval when it is done.
- **This record holds no names, numbers, emails or account ids**, and never will. Ids stay in the SQL editor's copy. "Applied" records dates, counts and `true` or `false` only.

## What is built

- **Task 1** (`7e14722`), the tables and the hosted redefinitions, in [`supabase/migrations/20261117110000_account_deletion_release.sql`](../../supabase/migrations/20261117110000_account_deletion_release.sql):
  - `private.account_deletion_jobs`, one receipt per account, with the status `held` beside `queued`, `processing` and `complete`;
  - the objects shared with plan 6, made here where absent and marked `resbite 20261117110000`: `private.legal_holds` (with its two partial indexes), `private.account_held(uuid)` and `private.suspension_history`;
  - the three September foreign keys: a deleted host's resbites lose their owner, a deleted guest's places go, a claimed invitation forgets who claimed it;
  - the two hosted redefinitions, from their hosted bodies: `private.require_tester()` takes the account's lock, and `private.deletion_pending(uuid)` counts a job.
  - The behaviour test [`supabase/tests/account-deletion-release.sql`](../../supabase/tests/account-deletion-release.sql) runs in both modes and is listed in [`tests.txt`](../../supabase/tests/hosted-baseline/tests.txt).
- **Task 2** (`1b040a0`), one request path for every account (D-4, D-19, D-20, UGC-15, AS-R1 to AS-R3):
  - `request_account_deletion` asks only for a fresh session of this user, a confirmed email or phone, and an account that isn't anonymous. An existing request answers first, so a retry with a stale proof gets its receipt back (Review Focus 1).
  - The close step (the job, the cancellations with their pushes, no more devices or notices) and the erase step (everything else) run in one transaction. Under a legal hold only the close step runs and the job is `held`, which every answer reads as `queued`.
  - Two deletions are serialised by one advisory lock (ASR2-5). A deleted host's group chats stop (ASR2-6). The suspension moves to the history without the account (AS-R1), and the reports the person filed stay without their id (AS-R2).
  - `private.operator_account_deletion(uuid)` and the owner script [`supabase/ops/delete-account.sql`](../../supabase/ops/delete-account.sql) delete banned, web-only and under-18 accounts with the same lifecycle (AS-R3). `private.replay_account_deletion(uuid, uuid, bytea)` is the replay after a restore.
  - The race script [`supabase/tests/local/account-deletion-concurrency.sh`](../../supabase/tests/local/account-deletion-concurrency.sh) (full mode), and the release's facts in `deletion.sql`, `security-review.sql`, `gi2.sql`, `gi2-rollback.sql`, `chat-groups.sql` and [`supabase/ops/suspend-account.sql`](../../supabase/ops/suspend-account.sql)'s comment.
- **Task 3** (`9f43539`), the worker and the receipts (ASR2-9, ASR2-10):
  - `claim_account_deletions` resumes held jobs once their hold is lifted, and never claims a held account (Review Focus 2). `deletion_storage_objects` lists both buckets under the account's folder and refuses a held account. `finish_account_deletion` completes a job only when the Auth user, the profile and both folders are gone (Review Focus 5).
  - The photo guard `private.guard_photo_write()` and its trigger `resbite_photo_write_guard` on `storage.objects` keep a late upload out of a deleting account.
  - `purge_completed_deletion_receipts` removes a complete receipt 30 days after completion, never while a hold names the account or a file of it is left.
  - The owner script [`supabase/ops/schedule-account-deletion.sql`](../../supabase/ops/schedule-account-deletion.sql): `cleanup-account` every five minutes, `purge-deletion-receipts` daily at 03:32 UTC.
- **Task 4** (`82b5949`), the rollback [`supabase/rollback/20261117110000_account_deletion_release.rollback.sql`](../../supabase/rollback/20261117110000_account_deletion_release.rollback.sql) (hosted only), the rehearsal [`.before.sql`](../../supabase/tests/hosted-baseline/20261117110000_account_deletion_release.before.sql) and [`.after.sql`](../../supabase/tests/hosted-baseline/20261117110000_account_deletion_release.after.sql), and the release section of [`supabase/README.md`](../../supabase/README.md).
- **Task 5** (`e2883ae`), Sign in with Apple revocation, [`supabase/functions/_shared/apple-revocation.ts`](../../supabase/functions/_shared/apple-revocation.ts) and its test: `/auth/token` with the authorisation code, then `/auth/revoke`, each with a 5-second timeout, best effort (ASR2-8).
- **Task 6** (`7ca9376`), the Edge functions (D-4):
  - [`delete-account`](../../supabase/functions/delete-account/index.ts) calls `request_account_deletion` directly, accepts the proof that fits the account (ASR2-2), and revokes Apple after the deletion and the Supabase logout. The gateway lists and removes both buckets for `cleanup-account`.
  - The ledger modules are gone (`deletion-admission.ts`, `deletion-ledger.ts`, `deletion-ledger-storage.ts` and their tests; [`qa/deletion-recovery-ledger.md`](../deletion-recovery-ledger.md), "Retired").
  - [`deletion-release.test.ts`](../../supabase/functions/_shared/deletion-release.test.ts) passes whichever way the gates stand. The gates in [`deletion-release.ts`](../../supabase/functions/_shared/deletion-release.ts) stay `false` until step 5.
  - The READMEs of [`delete-account`](../../supabase/functions/delete-account/README.md) and [`purge-deletion-receipts`](../../supabase/functions/purge-deletion-receipts/README.md).
- **Task 7** (`be3bab6`), the app's deletion model:
  - [`mobile/src/domain/deletion.ts`](../../mobile/src/domain/deletion.ts): the copy, the proof rule (Apple, else an email code or the password, else an SMS code, else privacy@resbite.com), the number to text (`deletionPhone`, the sign-in form, Review Focus 3) and the status lines;
  - [`appleSignIn.ts`](../../mobile/src/services/appleSignIn.ts) returns Apple's authorisation code; [`accountDeletionFlow.ts`](../../mobile/src/services/accountDeletionFlow.ts) and [`accountDeletion.ts`](../../mobile/src/services/accountDeletion.ts) carry the phone proof and send the code with the request, never saving it.
- **Task 8** (`c916456`), the screens:
  - [`mobile/app/delete-account.tsx`](../../mobile/app/delete-account.tsx): Delete account for every account type, the 30-day promise and the new "What happens" sheet;
  - [`mobile/app/account.tsx`](../../mobile/app/account.tsx): the suspended screen shows the support address and **Delete account** (D-19, B6);
  - `SAFETY_COPY.reportsPrivacy` (AS-R2), the taken-number line (B6), [`mobile/scripts/verify-deletion.mjs`](../../mobile/scripts/verify-deletion.mjs) and the flag's comment in `mobile/.env.example`.
- **Task 9** (this record), the restore: [`supabase/ops/export-deletion-receipts.sql`](../../supabase/ops/export-deletion-receipts.sql), [`supabase/ops/replay-deletions.sql`](../../supabase/ops/replay-deletions.sql) (tested in section S8) and [`qa/deletion-restore-procedure.md`](../deletion-restore-procedure.md); the ledger record's closing section, `data-requests.md` section 8.2, and ASR2-1 to ASR2-10 in the decision log.

## Files and hashes

Fill these in with `sha256sum` at rollout, from the commit the rollout runs from. Never approve from an old list: recompute, compare, and stop if anything differs. Each script below has a `<sha256>` placeholder, which fails its check until it is filled in.

```
sha256sum supabase/migrations/20261117110000_account_deletion_release.sql \
  supabase/rollback/20261117110000_account_deletion_release.rollback.sql \
  supabase/tests/hosted-baseline/20261117110000_account_deletion_release.before.sql \
  supabase/tests/hosted-baseline/20261117110000_account_deletion_release.after.sql \
  supabase/ops/delete-account.sql supabase/ops/export-deletion-receipts.sql \
  supabase/ops/replay-deletions.sql supabase/ops/schedule-account-deletion.sql
```

| File | Used at | sha256 |
| --- | --- | --- |
| `supabase/migrations/20261117110000_account_deletion_release.sql` | step 2 | (at rollout) |
| `supabase/rollback/20261117110000_account_deletion_release.rollback.sql` | Rollback | (at rollout) |
| `supabase/tests/hosted-baseline/20261117110000_account_deletion_release.before.sql` | the rehearsal, local only | (at rollout) |
| `supabase/tests/hosted-baseline/20261117110000_account_deletion_release.after.sql` | the rehearsal, local only | (at rollout) |
| `supabase/ops/delete-account.sql` | test 6, and each request by email (`data-requests.md` section 8.2) | (at rollout) |
| `supabase/ops/export-deletion-receipts.sql` | a restore (`qa/deletion-restore-procedure.md`) | (at rollout) |
| `supabase/ops/replay-deletions.sql` | a restore | (at rollout) |
| `supabase/ops/schedule-account-deletion.sql` | step 7 | (at rollout) |

The SQL editor scripts are checked by eye: compare the file's `sha256sum` with this table before copying it. Every other file is checked by its script.

## Checks made locally

On this branch, on `c916456` with Task 9's changes (the commit that adds this record), 17 November 2026. Fill in again on the commit the rollout runs from.

- **SQL, full mode**, `bash scripts/test-database-docker.sh`: exit 0, 70 PASS lines, among them `account-deletion-release.sql`, `deletion.sql` and every concurrency script (the two deletion races included).
- **SQL, the hosted baseline with every pending AS candidate**, in timestamp order: exit 0, 35 PASS lines (the five candidates apply, the 29 files of `tests.txt` pass, and the final line). `account-deletion-release.sql` passes S1 to S8.

  ```
  bash scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261117100000_phone_test_mode_retired.sql \
    supabase/migrations/20261117110000_account_deletion_release.sql supabase/migrations/20261117120000_terms_acceptance.sql \
    supabase/migrations/20261117121000_safety_extension.sql supabase/migrations/20261117122000_optional_details_removal.sql
  ```

  Name every candidate not yet in `migrations.txt`. Bare, this mode fails by design until they are live.
- **Edge**, from the repository root: 133 of 133, in 11 files.

  ```
  node --import ./mobile/node_modules/tsx/dist/loader.mjs --test supabase/functions/_shared/*.test.ts
  ```

- **App**, `cd mobile && npm run check` (the typecheck, every test file with the link site's, and content validation): exit 0, 1,315 tests in 111 files, none failed.
- **Browser** (Task 8): `node scripts/verify-deletion.mjs` on Expo web passed with the flag off and with it on, against a stand-in Supabase URL: the preview, the disabled screen, the email, phone and Apple proofs.

## Order

1. Steps 1 to 3, the database. On hosted this migration goes after plan 1's `20261117100000` and before plan 4's `20261117120000` to `20261117122000` and plan 6's `20261117130000`, so the history stays in timestamp order. It may go ahead of C1 (SMS live).
2. Steps 4 to 7: the secrets, the gate flip, the functions, the schedule. The gates open only in step 5; until then every deletion function answers 503 whatever its secrets say.
3. Steps 8 to 10: the EAS flag, the TestFlight build and the end-to-end tests. C1 should be live first for test 1's SMS code.

## Rollout (owner-run)

Every step needs the owner's explicit approval at the time.

- The assistant writes each script into the home directory from its block below. The owner reads it, fills in its `<sha256>` from "Files and hashes", and runs it with `! bash ~/<name>.sh`.
- Each runs from `${REPO:-$HOME/dev/resbite-app}`, at the commit the rollout runs from.
- None prints a secret, a number or an account id.
- If the CLI's role is refused a `private`, `storage`, `vault` or `cron` read, paste that query into the SQL editor instead. It is read-only there too.

1. **Before snapshot** (read-only), `~/del-before.sh`:

   ```bash
   #!/bin/bash
   # Read-only: the before snapshot and the checks the apply needs (account deletion, step 1).
   set -euo pipefail
   cd "${REPO:-$HOME/dev/resbite-app}"
   D=qa/account-deletion-2026-11-17
   supabase db query --linked -f supabase/ops/hosted-fingerprint.sql -o json > "$D/hosted-before.json"
   supabase db query --linked -f supabase/ops/hosted-counts.sql -o json > "$D/hosted-counts-before.json"
   supabase db query --linked "select count(*) as applied, max(version) as latest from supabase_migrations.schema_migrations"
   supabase db query --linked "select to_regclass('private.account_deletion_jobs') is null as absent"
   supabase db query --linked "select count(*) as marked from public.profiles where deletion_requested_at is not null"
   supabase db query --linked "select has_table_privilege('storage.objects','TRIGGER') as can_trigger, exists(select 1 from pg_trigger where tgname='resbite_photo_write_guard') as guard"
   ```

   - **The history line** reads `26 | 20261117100000`: plan 1's retirement went first, as the roadmap orders. `25 | 20261116120000` only if the owner chose to run this sitting before it, and then plan 1 renames its file to a later timestamp. **Stop if any version above `20261117110000` is applied.**
   - `absent` true. `marked` 0.
   - `can_trigger | guard` reads `true | false`. **If `can_trigger` is false, stop:** the migration would fail at the photo guard and roll itself back.
   - **The fingerprint** matches a local Docker replay of `migrations.txt`, by `(kind, name)`, with only the known `acl` differences (hosted's default `service_role` grants, as in the open-beta and phone-codes records). Stop on any unexplained difference.
2. **[approval: the migration by name and sha256]** Apply, `~/del-apply.sh`:

   ```bash
   #!/bin/bash
   # The account deletion release migration (steps 2 and 3). Only after the owner approves the file by name and sha256.
   set -euo pipefail
   cd "${REPO:-$HOME/dev/resbite-app}"
   D=qa/account-deletion-2026-11-17
   F=supabase/migrations/20261117110000_account_deletion_release.sql
   echo "<sha256>  $F" | sha256sum -c -
   GUARD="if pg_catalog.to_regclass('private.account_deletion_jobs') is not null then raise exception 'private.account_deletion_jobs already exists'; end if;
    if exists (select 1 from supabase_migrations.schema_migrations where version > '20261117110000') then raise exception 'A later migration is applied: rename this file first'; end if;"
   supabase db query --linked "do \$\$ begin $GUARD end \$\$"
   mkdir -p /tmp/del
   { echo 'begin;'; echo "do \$\$ begin $GUARD end \$\$;"; cat "$F"; echo; echo 'commit;'; } > /tmp/del/apply.sql
   supabase db query --linked -f /tmp/del/apply.sql
   supabase migration repair --status applied 20261117110000 --linked --yes
   supabase db query --linked "select count(*) as applied, max(version) as latest from supabase_migrations.schema_migrations"
   supabase db query --linked -f supabase/ops/hosted-fingerprint.sql -o json > "$D/hosted-after.json"
   supabase db query --linked -f supabase/ops/hosted-counts.sql -o json > "$D/hosted-counts-after.json"
   ```

   - The script stops before any change if the hash differs. Never `supabase db push`.
   - The guard runs twice: once on its own, so a refused run stops early, then inside the apply's one transaction, before the file. It refuses if `private.account_deletion_jobs` already exists (a second run) or if the history holds a later version (rename the file, its rollback, its rehearsal pair and its line in `tests.txt` to a free timestamp, rehearse again and approve the new hash).
   - The file runs in one transaction. Any error rolls all of it back, and the script stops before the history repair.
   - **Expected:** the history line one row more, latest `20261117110000`.
   - If the apply succeeded and only the repair failed, run the repair alone, from the repository root, then the script's last three lines:

     ```
     supabase migration repair --status applied 20261117110000 --linked --yes
     ```

3. **After checks and advisors.**
   - `hosted-after.json` against `hosted-before.json`: the fingerprint grows by this file's objects. Three tables (`account_deletion_jobs`, `legal_holds`, `suspension_history`) with their indexes; the private and public functions; the photo guard and its trigger; two redefined bodies (`private.require_tester()`, `private.deletion_pending(uuid)`); the three September keys' constraints, and `plans.owner_id`, which may now be null; and the schema grant to `service_role`. List them in "Applied". Nothing else changes, and every table keeps its row count (the three new ones start empty).
   - **[approval]** The assistant reads the security and performance advisors through the Supabase MCP server, and compares them with the last record's. The three new tables have row-level security on and no policy (closed to API roles), which may show as INFO lines. Every function the file makes sets an empty `search_path`. Stop the rollout for any new WARN or ERROR.
   - Append this line to `supabase/tests/hosted-baseline/migrations.txt`:

     ```
     20261117110000_account_deletion_release.sql            20261117110000
     ```

   - Then run `bash scripts/test-database-docker.sh --hosted-baseline`, naming only the AS candidates still pending (in timestamp order), or none once every one is live. Expect all PASS.
   - Commit the record.
4. **[approval] The Apple key and the function secrets.**
   - The owner creates a Sign in with Apple key in Apple Developer (Keys, with Sign in with Apple on, for the primary App ID `com.resbite.app`), downloads `AuthKey_<KEYID>.p8` once, and keeps it outside the repo.
   - Then `~/del-secrets.sh`. It writes the private env file outside the repo and sets the secrets:

     ```bash
     #!/bin/bash
     # The deletion functions' secrets (account deletion, step 4). Asks for the Apple values; prints names only.
     set -euo pipefail
     cd "${REPO:-$HOME/dev/resbite-app}"
     umask 077
     P="${PRIVATE_DIR:-$HOME/.resbite-private}"; mkdir -p "$P"; E="$P/account-deletion.env"
     [ ! -e "$E" ] || { echo "$E exists: move it away first" >&2; exit 1; }
     read -rp "APPLE_TEAM_ID: " TEAM; read -rp "APPLE_KEY_ID: " KEY; read -rp "Path to the .p8 file: " P8; P8="${P8/#\~/$HOME}"
     [[ "$TEAM" =~ ^[A-Z0-9]{10}$ && "$KEY" =~ ^[A-Z0-9]{10}$ && -s "$P8" ]] || { echo "Check the team id, the key id and the .p8 path" >&2; exit 1; }
     {
       echo "ACCOUNT_DELETION_ENABLED=true"
       echo "ACCOUNT_RECEIPT_PURGE_ENABLED=true"
       echo "ACCOUNT_CLEANUP_SECRET=$(openssl rand -hex 32)"
       echo "ACCOUNT_RECEIPT_PURGE_SECRET=$(openssl rand -hex 32)"
       echo "APPLE_TEAM_ID=$TEAM"
       echo "APPLE_KEY_ID=$KEY"
       echo "APPLE_CLIENT_ID=com.resbite.app"
       printf 'APPLE_PRIVATE_KEY=%s\n' "$(awk 'NF{printf "%s\\n",$0}' "$P8")"
     } > "$E"
     REF="$(cat supabase/.temp/project-ref)"
     supabase secrets set --env-file "$E" --project-ref "$REF"
     supabase secrets list --project-ref "$REF" | cut -d'|' -f1
     ```

   - **Expected:** the list shows the eight names among the function secrets. It prints no value.
   - The env file keeps the two worker secrets for step 7's Vault entries. It stays in the private folder, never in the repo.
5. **[approval: the gate-flip commit]** Flip the source gates: set `ACCOUNT_DELETION_RELEASE_APPROVED` and `DELETION_RECEIPT_PURGE_RELEASE_APPROVED` to `true` in `supabase/functions/_shared/deletion-release.ts`, and rewrite its comment to say they were opened by this release (D-4), not by a ledger. Run the Edge tests (`# fail 0`), then commit and push.
6. **[approval: the deploy, from the step 5 commit]** `~/del-deploy.sh`:

   ```bash
   #!/bin/bash
   # Deploy the three deletion functions (account deletion, step 6), from the gate-flip commit.
   set -euo pipefail
   cd "${REPO:-$HOME/dev/resbite-app}"
   G=supabase/functions/_shared/deletion-release.ts
   [ "$(grep -c '_APPROVED = true;' "$G")" -eq 2 ] || { echo "The source gates are not both open: step 5 first" >&2; exit 1; }
   [ -z "$(git status --porcelain -- supabase/functions)" ] || { echo "supabase/functions has uncommitted changes" >&2; exit 1; }
   git log -1 --format='%h %s'
   REF="$(cat supabase/.temp/project-ref)"
   for f in delete-account cleanup-account purge-deletion-receipts; do supabase functions deploy "$f" --no-verify-jwt --project-ref "$REF"; done
   curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Content-Type: application/json' \
     -d "{\"action\":\"status\",\"requestId\":\"$(uuidgen | tr 'A-Z' 'a-z')\",\"recoveryToken\":\"$(printf '%064d' 0)\"}" \
     "https://$REF.supabase.co/functions/v1/delete-account"
   ```

   - **Expected:** `404`, not `503`: the function is open and the database answers. `503` means a gate or `ACCOUNT_DELETION_ENABLED` is still off.
   - In the dashboard, each function's JWT verification reads off.
7. **[approval: the schedule file by sha256] The schedule.**
   - In the dashboard, create the four Vault secrets: `cleanup_account_url` (`https://<project-ref>.supabase.co/functions/v1/cleanup-account`), `cleanup_account_secret` (equal to `ACCOUNT_CLEANUP_SECRET` in the step 4 file), `purge_deletion_receipts_url` (`https://<project-ref>.supabase.co/functions/v1/purge-deletion-receipts`) and `purge_deletion_receipts_secret` (equal to `ACCOUNT_RECEIPT_PURGE_SECRET`).
   - Compare `sha256sum supabase/ops/schedule-account-deletion.sql` with "Files and hashes", then paste the file into the SQL editor and run it.
   - Check `select jobname, schedule from cron.job where jobname in ('cleanup-account','purge-deletion-receipts')`: `cleanup-account | */5 * * * *` and `purge-deletion-receipts | 32 3 * * *`.
   - After 10 minutes, `select d.status, d.start_time from cron.job_run_details d join cron.job j on j.jobid = d.jobid where j.jobname = 'cleanup-account' order by d.start_time desc limit 3` shows `succeeded`. That only means the call was queued: `select status_code, created from net._http_response order by created desc limit 3` shows `200`.
8. **[approval: EAS]** Set `EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED=true` for the production environment, only after steps 2 to 7. Check the exact flags with `npx eas env:create --help` at the time, then `npx eas env:list --environment production`.
9. **[approval: the build]** The TestFlight build with the flag on, as part of the release runbook (F12, [`qa/app-store-release/README.md`](../app-store-release/README.md)). Approved separately.
10. **The end-to-end test plan**, below. Record the outcomes and counts in "Applied". Update `docs/implementation-status.md` with "deletion live". Commit and push.

## The end-to-end test plan

- **Disposable accounts only**, never the owner's real account ([`qa/b0-retention-proposal.md`](../b0-retention-proposal.md), "Activation sequence", step 2).
- **A TestFlight build with `EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED=true`**, made after the migration and the functions are live.
- Each account's id stays in the SQL editor's copy. Only counts and outcomes are written here.

1. **Phone-only (DEL-2).** Sign up with a number the owner controls. This needs C1 live: before C1, a test-mode run with `000000` is recorded as such and repeated after C1. Host a one-off for tomorrow with account 2 as a guest, and a weekly group, with a message in each chat. Then Delete account with the SMS code.
   - Expect "We’ve accepted your request…", then signed out. Account 2 gets "This resbite was cancelled".
   - The group's chat reads closed 48 hours later.
   - Within 10 minutes, the welcome screen's **Check account deletion**, then **Check deletion status**, reads "Your account is deleted…".
   - In SQL, the counts: 0 `auth.users` for the id, 0 objects under its prefix in `profile-photos` and `plan-covers`, and 1 receipt `complete`.
2. **Email and password.** Delete with the password. Then, on a second account, delete with an email code.
3. **Google**, with the email code sent to the Google address.
4. **Apple (DEL-4).** Use an Apple ID the owner keeps for tests. Afterwards, iPhone Settings → [name] → Sign-In & Security → Sign in with Apple no longer lists Resbite. Record "removed" or "still listed".
5. **Suspended (D-19, B6).** From account 2, report a disposable account, then suspend it with `supabase/ops/suspend-account.sql` (the report's id from `open-reports.sql`), with no Auth ban.
   - The suspended screen shows the support address and **Delete account**, and deleting works.
   - In SQL, `private.suspensions` has no row for it, and one `private.suspension_history` row with its report has `how 'account_deleted'` and `user_id` null.
6. **Web-only (AS-R3, D8).** Answer an invitation on `link.resbite.com` with a disposable number, then run `supabase/ops/delete-account.sql` with that account's id. The job completes.
7. **Legal hold (UGC-15).** In the SQL editor, insert a hold for a disposable account, then delete it in the app:

   ```sql
   insert into private.legal_holds(user_id, reason, case_ref, review_on) values ('<id>', 'police', 'TEST', current_date + 1);
   ```

   - The job reads `held`, and the app reads accepted. The name stays.
   - Lift the hold: `update private.legal_holds set lifted_at = now() where case_ref = 'TEST';`. Within 5 minutes the job completes.
   - Delete the hold row afterwards: `delete from private.legal_holds where case_ref = 'TEST';`.
8. **The schedule.** `cron.job_run_details` shows `cleanup-account` every 5 minutes with status `succeeded`, and `purge-deletion-receipts` daily. The purge's answer in `net._http_response` reads `{"receiptsPurged":0}`.

## Weekly check: stuck deletions

Until the worker's alerts exist (F10, `qa/app-store-release/README.md` Step 28), the owner runs this every week in the SQL editor. A job older than 7 days that is still queued or processing means the 30-day promise is at risk.

```sql
select count(*) filter (where status in ('queued','processing') and requested_at < now() - interval '7 days') as stuck, max(attempts) filter (where status in ('queued','processing')) as max_attempts from private.account_deletion_jobs;
```

Expect `stuck` 0. Held jobs are left out on purpose. If it isn't 0, check the `cleanup-account` runs in `cron.job_run_details` and the function's logs, then fix the cause. Record the result, never an account id.

## Rollback

Only with the owner's approval, in this order:

1. Unschedule both cron jobs:

   ```sql
   select cron.unschedule('cleanup-account'); select cron.unschedule('purge-deletion-receipts');
   ```

2. Set `ACCOUNT_DELETION_ENABLED=false` with `supabase secrets set ACCOUNT_DELETION_ENABLED=false --project-ref <project-ref>`. The three functions answer 503, and nothing is deleted.
3. **Only if no deletion has run:** the rollback file, in one transaction, with the same hash-guarded pattern, `~/del-rollback.sh`:

   ```bash
   #!/bin/bash
   # The account deletion release's rollback. Only with the owner's approval, and only if no deletion has run.
   set -euo pipefail
   cd "${REPO:-$HOME/dev/resbite-app}"
   D=qa/account-deletion-2026-11-17
   F=supabase/rollback/20261117110000_account_deletion_release.rollback.sql
   echo "<sha256>  $F" | sha256sum -c -
   mkdir -p /tmp/del && { echo 'begin;'; cat "$F"; echo; echo 'commit;'; } > /tmp/del/rollback.sql
   supabase db query --linked -f /tmp/del/rollback.sql
   supabase db query --linked -f supabase/ops/hosted-fingerprint.sql -o json > "$D/hosted-after-rollback.json"
   ```

   - It refuses with 42501, changing nothing, once any job, hold, suspension history row or resbite with no owner exists. Then roll back by hand.
   - Roll back plan 6's `20261117130000` first if it is applied.
   - `hosted-after-rollback.json` should equal `hosted-before.json`.
   - Remove the line from `migrations.txt`. The history row stays. Never run `supabase migration repair --status reverted`.

## Applied

Nothing yet.

- Record each step's date and what it showed: counts, `true` or `false`, the history line, the fingerprint's changes, the function versions and the commit deployed.
- For step 4, that the secrets are set, by name. Never a value.
- For the end-to-end tests, each outcome and its counts. Never a number, an email or an account id.

## Not done here

No hosted change, no function deployment, no secret or Vault entry, no schedule, no gate flip, no SQL editor run, no EAS variable and no TestFlight upload.
