# Retention and team tools: rollout runbook (17 November 2026)

- **Spec:** [the App Store readiness gap analysis](../../docs/superpowers/specs/2026-11-17-app-store-readiness-design.md): workstream C rows C3, C4, C6 and C13; decisions D-8, D-19, D-21 and D-23; section 6, steps 8, 12, 14 and 15. The owner's decisions and the rulings (AS-D1, AS-D3, AS-D8, AS-R1, AS-R3, AS-R4, AS-R6, AS-R7) are in the [decision log](../../knowledge-base/08-decisions.md), under "App Store readiness (AS)". This plan's own calls are AS-P6-1 to AS-P6-13 there.
- **Plan:** [App Store readiness plan 6, retention and team scripts](../../docs/superpowers/plans/2026-11-17-asr-6-retention-and-team-scripts.md). The [roadmap](../../docs/superpowers/plans/2026-11-17-asr-0-roadmap.md) calls R1 to R7 its sitting H6, R8 its sitting H0 and R9 its sitting H8. The [release runbook](../app-store-release/README.md) ticks its step 14 C3 line from R1 to R7, its step 12 roll job line from R8 and its step 15 from R9.
- **Code:** branch `asr-6-retention`, from `app-store-readiness` at `4c79b98`, which already holds this plan's Tasks 10 and 11:
  - `0a50584` Invite people names who can't be invited by link (Task 10);
  - `a55c1f8` the Auth emails lose the private-test line and gain the company footer (Task 11);
  - `bc8651b` the legal hold and the retention helpers (Task 1);
  - `c93a0b3` the row purges and the daily run (Task 2);
  - `39baa81` and `31b9e0c` chats, plans, web-only and unconfirmed accounts, the roster and the legacy invitations, and their review fixes (Task 3);
  - `430262a` the do-not-invite list (Task 4);
  - `e807c80` orphan photos, replaced covers and the takedown helpers (Task 5);
  - `1e52d0f` the clean-up worker removes orphan covers too (Task 6);
  - `04bd854` suspend by id, lift, legal holds and takedown scripts (Task 7);
  - `0713b1c` and `ff0e5cb` the two exports, and their review fixes (Task 8);
  - `700f172` the schedule, the rollback and the hosted-baseline rehearsal (Task 9);
  - this record and the pointers to it (Task 12).
- **Nothing here is applied.** No SQL has run on the hosted project. No function is deployed, no secret or Vault entry is set, no job is scheduled and no Auth template is pasted, until "Applied" says otherwise. Every step below needs the owner's explicit approval when it is done.

## What is built

- **One hosted-compatible migration,** `supabase/migrations/20261117130000_retention_and_team_tools.sql`, in five sections. It needs plan 2's `20261117110000_account_deletion_release.sql` first, on hosted and in the local replay. Every object it makes carries the comment `resbite 20261117130000`, so its rollback drops only its own.
  1. **The legal hold.** Plan 2 owns `private.legal_holds`, `private.account_held(uuid)` and `private.suspension_history`. This file's guarded DDL finds them in place and makes only `private.series_held(uuid)`, plus `private.series_under_hold(uuid)` (a series is under hold when it is named, or when a held account owns one of its occurrences, has a guest row on one, wrote in its chat, was removed from it, left it, asked to join one of its occurrences, or sent, brought or answered an invitation by number to one), `private.account_in_held_series(uuid)` (the same rule from the account's side: whether any series the account is part of in one of those ways is under hold) and `private.series_end(uuid)` (null while a group still rolls).
  2. **Eight row purges and the daily run.** Invitations by number, removal records, connection refusals, unanswered connection requests, notices, link opens, closed reports (the two steps of `purge-closed-reports.sql`) and the suspension history. `private.run_retention()` runs every purge in a block of its own and answers thirteen counts, never ids: `plans`, `chats`, `phone_invitations`, `plan_removals`, `connection_refusals`, `connection_requests`, `notifications`, `link_opens`, `closed_reports`, `suspension_history`, `pending_phone_changes`, `web_accounts` and `unconfirmed_accounts`. Closed reports are kept while their series is under hold, as every series-scoped purge does. A purge that fails reads `null` and warns with its SQLSTATE; the others still run.
  3. **Series purges and accounts.** `purge_chats` (a one-off's chat 90 days after it closed; a group's messages one by one after 12 months, with the chat's count, last line and pin put right) and `purge_plans` (a whole series 12 months after it ends, never while a group still rolls). `purge_web_accounts` queues plan 2's `private.operator_account_deletion` for each web-only account with no resbite in 12 months (AS-R4), with or without a profile (the link site makes the account when a person confirms their number, and the profile only with their first answer), but never one that is part of a series under hold. It only tries the deletions' lock and each account's lock: while an in-app deletion holds the deletions' lock it refuses with 55P03, the key reads `null`, and the next day's run takes the accounts, so the run never deadlocks with a deletion. `purge_unconfirmed_accounts` deletes an Auth user that confirmed nothing after 30 days. `purge_pending_phone_changes` clears a number given at Add your number and never confirmed (`auth.users.phone_change`, its code and when it was sent) 30 days after its code was sent, unless the account is held (privacy notice section 7). **Once, as data steps:** every disabled tester-roster row of an Auth user becomes a revoked grant, then `private.tester_roster` and `private.invitations` are emptied.
  4. **The do-not-invite list.** `private.invite_objections` holds each objecting number's keyed hash (HMAC-SHA256 under the Vault secret `invite_objection_key`, made inside the database by the first objection and never shown). `invite_contacts` answers `'unavailable'` for a listed number that would have taken the link path, and stores nothing for it. A Resbite user who holds that number is still invited in the app (LI-4).
  5. **Photos and covers.** The orphan photo clean-up of the local-only `20260923152816_orphan_profile_photo_cleanup.sql`, carried here, with held accounts skipped. Its twin for `plan-covers`: a cover no plan names waits 7 days observed, then goes. A retired cover can't be attached again ("Cover retired; choose a new photo"). And the "remove now" helpers the takedown scripts call.
- **The worker.** `cleanup-profile-photos` cleans `profile-photos`, then `plan-covers`: one deploy, one secret, one schedule. It answers `held` and keeps the file for a held account. Its source gate `PHOTO_CLEANUP_RELEASE_APPROVED` is still `false`. It flips only at R5, in an owner-approved commit.
- **Twelve owner-run scripts** in `supabase/ops/`, not migrations and not in any test list. `supabase/tests/team-scripts.sql` runs nine of them as text, and `supabase/tests/retention.sql` the two do-not-invite scripts; the schedule cannot run locally (no pg_cron or pg_net):
  - `schedule-retention.sql`: the jobs `retention-purge` (`47 3 * * *`, `private.run_retention()`) and `cleanup-images` (`*/10 * * * *`, the worker, through pg_net with the Vault secrets `profile_photo_cleanup_url` and `profile_photo_cleanup_secret`);
  - `suspend-account-by-id.sql` and `lift-suspension.sql` (a lift moves the record to `private.suspension_history` for 12 months);
  - `set-legal-hold.sql`, `lift-legal-hold.sql` and `legal-holds.sql`;
  - `remove-profile-photo.sql` and `remove-resbite-content.sql` (hide at once, file gone at the worker's next run; under a hold, hide and preserve);
  - `export-account.sql` and `export-number.sql` (data requests, A16);
  - `object-number.sql` and `withdraw-objection.sql` (D-23).
- **The app** (Task 10). Invite people reads "Can’t be invited by link: Ana" for a listed number. It ships in the next build.
- **The Auth emails** (Task 11). `confirmation.html`, `email-code.html` and `recovery.html` lose the private-test line and carry the company footer with a link to the Privacy Policy. Checked by `supabase/templates/templates.test.mjs` and `mobile/scripts/verify-emails.mjs`.
- **Tests.** `supabase/tests/retention.sql` (the migration, slices 1 to 5) and `supabase/tests/team-scripts.sql` (the scripts and the exports), in full mode. In the hosted-baseline rehearsal, `.after.sql` runs both with `\ir`.
- The details are in `supabase/README.md`, "Retention and team tools (C3, C6)".

## Files and hashes

| File | sha256 |
| --- | --- |
| `supabase/migrations/20261117130000_retention_and_team_tools.sql` (R3) | `edab496127254d25341c747cc04fcd89c6af7ef175f72fb39b32a7b9c086473e` |
| `supabase/rollback/20261117130000_retention_and_team_tools.rollback.sql` (Rollback) | `59a251b1ff4130663ec780c2710511b0ab8e45b9937184ca23ca3561e3858f25` |
| `supabase/ops/schedule-retention.sql` (R7) | `9420d45bd1f9ad8f818d577a6964265e14c542e76e54f02622436f58e86f4491` |
| `supabase/ops/schedule-roll-repeating-plans.sql` (R8; unchanged, `qa/creating-a-resbite-2026-10-31/README.md:30`) | `3a8202877260008723648dc4723b36aedb6d772f809b2552997765773040d74e` |
| `supabase/ops/suspend-account-by-id.sql` | `61aea0f1e9e1c8a61d4c7da7248599dee61d314554bee533be35e0c8c1722247` |
| `supabase/ops/lift-suspension.sql` | `1b638a31e2b89b4560e7be3bbe2ec1dfb5831074c171b9bed10f57e3a43f1387` |
| `supabase/ops/set-legal-hold.sql` | `4b2a8d9fd0c080b522ab57a063051724c3c366258491b31467384d7132fb3f7a` |
| `supabase/ops/lift-legal-hold.sql` | `d03cad62fc2daf9050676e31f5d406715a928dc525c26a482860668cb939e2cc` |
| `supabase/ops/legal-holds.sql` | `aa3fb40f2e29857ccc10dd65bbd8e4993f4d2fd8660d85c8b081bc574e794949` |
| `supabase/ops/remove-profile-photo.sql` (R6) | `39c751f1bfa82bddb36fe9cd7f22ddaa7e84fa4613ceba8e848db7ceb3dd729a` |
| `supabase/ops/remove-resbite-content.sql` (R6) | `7049f20df5a09b8b27e9377d517d1e563da57aa58437bd9275b961fe4e63ad99` |
| `supabase/ops/export-account.sql` | `eef24639824c2cecd55225d08d30ddb8570ceb71a3868df37f48fcff619dcf35` |
| `supabase/ops/export-number.sql` | `f3bba85a58cfe92bbc74446f791b6f65216cc09c7590c32e2d7d8084a6aec10f` |
| `supabase/ops/object-number.sql` (R10) | `afa44ed775cc7b2a7a3d1cc295cec022f17f7c7d49599b33bffa0f08e970315b` |
| `supabase/ops/withdraw-objection.sql` | `c8e573cf33b2787802839ec1ae6e6d1225287bbc1a6d7bd24f8011694cd1452b` |
| `supabase/functions/_shared/profile-photo-cleanup.ts` (R5) | `de2c4dd90a4e9f5cf6471557cf81ef59ea47be47a01c57362103f759513d6b6b` |
| `supabase/functions/_shared/profile-photo-cleanup-gateway.ts` (R5) | `6dc9fd24e5f885f08b1f528063eeff1593d859074cf56b9b4351e2a8f07d5b73` |
| `supabase/functions/cleanup-profile-photos/index.ts` (gate `false`; R5.0 changes it, so its hash is taken again at the gate-flip commit and recorded under "Applied") | `0ed9c0c6de85e224f0180cbd264b0e3fc78e5c18681c8d29c5b9799490ba0709` |
| `supabase/templates/confirmation.html` (R9) | `83996ad6afb37c459dd700606b0ca0f63ce5c231a09d12ab3093774a16031fec` |
| `supabase/templates/email-code.html` (R9) | `80c00c57fe89e045f34eef84cae13178420fa8e6e6cced660e18be3049530f39` |
| `supabase/templates/recovery.html` (R9) | `dff70afde0b413bc7e057389b4bfe8e1c3d9db466322276dabd544324fe89beb` |
| `supabase/tests/hosted-baseline/20261117130000_retention_and_team_tools.before.sql` (the rehearsal) | `c625eca418fde224f8ff651862d99504a7f6f3045835573a13f1ff5ff52625e2` |
| `supabase/tests/hosted-baseline/20261117130000_retention_and_team_tools.after.sql` (the rehearsal) | `8efa2fd23d1c770880b48566fc9db4356bd6dd5f4cd81e03dcd9832ed726d9bc` |
| `supabase/ops/hosted-fingerprint.sql` (unchanged) | `0778c53f98bc1cbdcee82487651dabc3fa246674a5d0efa1d6502e7746819a00` |
| `supabase/ops/hosted-counts.sql` (unchanged) | `15fe76aecba6bb5104d8795338c1ecaee9bd07ec9a2a9b7aba728e2bdae8c4a0` |

From `sha256sum` at this record's commit. Recompute before asking for approval (`sha256sum <file>`). Approve by file name and hash, and stop if a hash differs.

- **Files copied by hand** (the eleven team scripts, pasted into the SQL editor or, for the two exports, copied to a private folder outside the repo, and the three templates) are checked by eye: compare the file's `sha256sum` with this table before copying it. The migration, the rollback, the two schedules and the worker's files are checked by the scripts below.
- **A review fix after this commit** to any file above changes its hash. Take the new one from `sha256sum` at the commit being applied, and correct this table in the same commit.

## Checks made locally

- **The rehearsal on the hosted baseline,** with every pending AS candidate before this one, in timestamp order:

  ```
  ./scripts/test-database-docker.sh --hosted-baseline \
    supabase/migrations/20261117100000_phone_test_mode_retired.sql \
    supabase/migrations/20261117110000_account_deletion_release.sql \
    supabase/migrations/20261117120000_terms_acceptance.sql \
    supabase/migrations/20261117121000_safety_extension.sql \
    supabase/migrations/20261117122000_optional_details_removal.sql \
    supabase/migrations/20261117130000_retention_and_team_tools.sql
  ```

  (`./scripts/test-database.sh` with the same arguments on the Mac.) Once a candidate's line is in `supabase/tests/hosted-baseline/migrations.txt`, leave it out. Without plan 2's file, `.before.sql` refuses with "Pass plan 2's migration as an earlier candidate".
  - `.before.sql` snapshots `invite_contacts` and the photo functions where they exist, with their grants, and the whole catalogue of `public` and `private`. It seeds a disabled roster row with an account, an enabled one with a resbite, one with no account, a legacy invitation and an invitation by number, and checks the state before.
  - `.after.sql` checks that `invite_contacts` and plan 2's write guard changed in exactly their named lines with their grants kept; that exactly 46 functions and 5 tables are new, each with this file's marker, and that only the 8 worker wrappers and their 8 private bodies are executable by `service_role`, and nothing by `anon`, `authenticated` or `public`; and that the roster and legacy invitations are empty, with the disabled account still kept out. It runs `retention.sql` and `team-scripts.sql`. Then, inside a transaction it rolls back, it checks the rollback refuses while `retention-purge` or `cleanup-images` is scheduled and while the do-not-invite list holds a row, runs it, and compares the whole catalogue with `.before.sql`'s.
- **Full mode,** `./scripts/test-database-docker.sh`: every SQL file, `retention.sql` and `team-scripts.sql` among them, and every concurrency script.
- **Worker:** `node --import ./mobile/node_modules/tsx/dist/loader.mjs --test supabase/functions/_shared/*.test.ts`. **Templates:** `node --test supabase/templates/templates.test.mjs`. **App:** `cd mobile && npm test && npx tsc --noEmit`.
- **Results on 17 November 2026,** at `700f172` (Tasks 1 to 11; Task 12 changes documents only), run again for this record:
  - the rehearsal above: exit 0, 36 PASS lines (the six candidates, every `tests.txt` file and the final line);
  - full mode: exit 0, 72 PASS lines (every SQL file, `retention.sql` and `team-scripts.sql` among them, every concurrency line and the final line);
  - the worker suite: 138 of 138; the templates: 9 of 9; the app: `npm test` exit 0 (1,304 tests, none failed) and `npx tsc --noEmit` exit 0.
- **After the final review's SQL fixes (lane S, 17 November 2026),** on branch `asr-6-retention`: the wider `series_under_hold` and `account_in_held_series`, closed reports kept while their series is under hold, the web-only purge with no profile needed and no account of a held series, its tried locks, `purge_pending_phone_changes`, the fold's refusal (plan 4's file), the uncommented storage trigger (plans 2 and 6) and the export's `phone_change`. Each test was seen to fail before its fix.
  - the rehearsal above: exit 0, 38 PASS lines (the six candidates, the 31 files of `tests.txt` and the final line);
  - full mode: exit 0, 73 PASS lines, the new race `retention-deletion-concurrency.sh` among them;
  - a throwaway cluster with `storage.objects` owned by a NOINHERIT role and the applying role granted every privilege on it: creating the trigger works, `comment on trigger` and `drop trigger` fail with "must be owner of relation objects", and `drop function private.guard_photo_write() cascade` removes the trigger.
- **Lane S2 (17 November 2026):** `retention.sql` slice 3 pins `account_in_held_series`' leave and bringer ties: two more web accounts tied to the held b4 only, Ora (46) by a `series_leaves` row and Rex (47) as the bringer of an invitation by number, neither dormant nor queued by `purge_web_accounts` or `run_retention`. Against scratch copies outside the worktree, one with the `series_leaves` branch removed and one with the invitation match narrowed to `i.user_id`, the dormant check fails for Ora and for Rex in turn, and, with the earlier checks relaxed so each is reached, so do the two queued checks. Both runs here: the same exit 0, 38 and 73 PASS lines.
- **Not provable locally** (Known gaps, 6): `delete` and `update` on `auth.users` and `trigger` on `storage.objects` for the applying role. R2 reads them on hosted, read-only. Neither plan comments or drops a trigger on `storage.objects` directly any more: both need that table's owner, which the applying role is not on Supabase. The rollback drops the write guard with `cascade` instead, which needs only the function's owner; that was rehearsed locally with a role that has every privilege on `storage.objects` but does not own it (the final review's account-deletion #1). pg_cron and pg_net are not in the harness, so `schedule-retention.sql` has never run; the rollback's cron guard was tested against a stand-in `cron.job` table.

## Rollout (owner-run)

Every step needs the owner's approval at the time.

- Recompute each hash (`sha256sum <file>`) before asking, approve by file name and hash, and stop if a hash differs.
- Each script is written into the home directory from its block below, read by the owner, and run with `! bash ~/<name>.sh`.
- Each runs from `${REPO:-$HOME/dev/resbite-app}` at the merged commit. `D` is `qa/retention-and-team-tools-2026-11-17`.
- None prints a secret, a phone number, an email or an account id. Ids go into the SQL editor's copy only.
- Record every step under "Applied", with dates and counts, never names, numbers or account ids.

### R1. Prerequisites

- **Plan 2's deletion release is live on hosted:** its migration is in `supabase/tests/hosted-baseline/migrations.txt`, and `cleanup-account` is deployed and scheduled (`qa/account-deletion-2026-11-17/`; release runbook step 13).
- **Plan 4's three migrations are live** (`20261117120000` to `20261117122000` in `migrations.txt`). `export-account.sql` reads `private.terms_acceptances`, and this file's timestamp must stay the last applied (roadmap).
- **The retention schedule has been through the solicitor** (D-12), or the owner accepts the D-8 defaults (AS-D8).
- **The hosted-baseline rehearsal** ("Checks made locally") passed on the commit being applied.

### R2. Before, read-only

Run `! bash ~/asr6-before.sh`. It takes the three snapshots into `D`, as the chat runbook's step 1 does (`qa/chat-release/README.md:381-383`), then reads what the apply needs:

```bash
#!/bin/bash
# Read-only: the before snapshots and what the retention migration needs (retention and team tools, R2).
# Prints booleans, counts and names only: never a row's contents.
set -euo pipefail
cd "${REPO:-$HOME/dev/resbite-app}"
D=qa/retention-and-team-tools-2026-11-17
supabase db query --linked -f supabase/ops/hosted-fingerprint.sql -o json > "$D/hosted-before.json"
supabase db query --linked -f supabase/ops/hosted-counts.sql -o json > "$D/hosted-counts-before.json"
supabase db query --linked -o json "select policyname, cmd, qual, with_check from pg_policies where schemaname = 'storage' order by policyname" > "$D/hosted-storage-policies-before.json"
supabase db query --linked "select count(*) as applied, max(version) as latest from supabase_migrations.schema_migrations"
supabase db query --linked "select has_table_privilege('postgres','auth.users','delete') as may_delete_auth_users, has_table_privilege('postgres','auth.users','update') as may_update_auth_users, has_table_privilege('postgres','storage.objects','trigger') as may_trigger_storage_objects, pg_catalog.to_regclass('vault.decrypted_secrets') is not null as vault, pg_catalog.to_regclass('private.account_deletion_jobs') is not null as deletion_release_live, pg_catalog.to_regclass('auth.one_time_tokens') is not null as one_time_tokens"
supabase db query --linked "select count(*) filter (where enabled) as roster_enabled, count(*) filter (where not enabled) as roster_disabled, (select count(*) from private.invitations) as legacy_invitations, (select count(*) from private.phone_rewrites) as phone_rewrites from private.tester_roster"
supabase db query --linked "select tgname from pg_catalog.pg_trigger where tgrelid = 'storage.objects'::regclass and not tgisinternal order by 1"
supabase db query --linked "select jobname from cron.job order by 1"
```

- **The history line** reads `latest` `20261117122000` (plan 4's last), with the count plan 4's "Applied" recorded. Anything later: stop (timestamps must follow the apply order).
- **All five flags true.** If `may_delete_auth_users` is false, the unconfirmed-account purge will read `null` at every run; if `may_update_auth_users` is false, so will the purge of numbers never confirmed (`pending_phone_changes`): record either and decide before R5. Any other flag false: stop. Record `one_time_tokens` too (Known gaps, 8).
- **The roster line:** record the four counts. R3 empties the roster and the legacy invitations; `phone_rewrites` waits for R11.
- **The triggers on `storage.objects`:** plan 2's `resbite_photo_write_guard` is listed, among Storage's own. Record the list. The apply finds plan 2's trigger in place and adds none there.
- **The jobs:** no `retention-purge` and no `cleanup-images`. Record the list.
- **The fingerprint** matches a local replay of `migrations.txt`, by `(kind, name)`, with only the known `acl` differences (hosted's default `service_role` grants, as in the open-beta and chat records). Stop if anything else differs.
- If the CLI's role is refused a `private`, `cron` or `vault` read, paste that query into the SQL editor. It is read-only there too. Never print row contents.

### R3. Apply

The owner approves `20261117130000_retention_and_team_tools.sql` by name and sha256 (above). Never `supabase db push`: it would also push the local-only files. Run `! bash ~/asr6-apply.sh`:

```bash
#!/bin/bash
# The retention migration (retention and team tools, R3). Only after the owner approves the file by name and sha256.
set -euo pipefail
cd "${REPO:-$HOME/dev/resbite-app}"
D=qa/retention-and-team-tools-2026-11-17
F=supabase/migrations/20261117130000_retention_and_team_tools.sql
echo "edab496127254d25341c747cc04fcd89c6af7ef175f72fb39b32a7b9c086473e  $F" | sha256sum -c -
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

- The script stops before applying if the hash differs.
- Everything runs in one transaction, the guard first. Without the deletion release, a second run or a later version in the history, the guard refuses and changes nothing. Any other error rolls all of it back, and the script stops before the history repair.
- **If the apply succeeded and only the repair failed,** run the repair alone (`supabase migration repair --status applied 20261117130000 --linked --yes`), then the script's last five lines, from the history query on.
- **The history line:** one more row than in R2, `latest` `20261117130000`.
- **The triggers:** new are `plans_retired_cover_guard` on `public.plans` and `resbite_profile_photo_reference_guard` on `public.profiles`. `resbite_photo_write_guard` on `storage.objects` is as before.
- **The counts:** `private.tester_roster` and `private.invitations` read 0. `private.beta_access` grows by at most R2's `roster_disabled` (a disabled roster row with no grant becomes a revoked one). The five new tables read 0. Every other table keeps its count, give or take live use.
- **The storage policies** are unchanged.
- **Then the advisors,** through the Supabase MCP server, read-only, into `D/hosted-advisors-after.json` (the owner approves the read). No new WARN or ERROR is expected: every new table has row security on with no policy, and no new function is executable by `anon` or `authenticated`. Likely INFO: "RLS enabled, no policy" on the five new tables, and unused-index notices for their indexes. Stop and compare if anything else appears.
- **Compare the fingerprint** with a local replay of `migrations.txt` plus this file. Expect only this migration's objects added or changed: 46 new functions with their grants, the 5 new tables (`invite_objections`, `profile_photo_retired_paths`, `profile_photo_cleanup_jobs`, `plan_cover_retired_paths`, `plan_cover_cleanup_jobs`) with their indexes, the two triggers above, and two changed bodies with their grants kept (`private.invite_contacts`, plan 2's `private.guard_photo_write`). Nothing removed.
- **Then, in a commit:** append `20261117130000_retention_and_team_tools.sql   20261117130000` to `supabase/tests/hosted-baseline/migrations.txt`, and `retention.sql` and `team-scripts.sql` to `tests.txt`. Run `./scripts/test-database-docker.sh --hosted-baseline` with no candidates. Expect all PASS.

### R4. Dry run of the first purge

With approval. Run `! bash ~/asr6-dry-run.sh`:

```bash
#!/bin/bash
# The first daily purge, rolled back (retention and team tools, R4). Prints the thirteen counts and keeps nothing.
set -euo pipefail
cd "${REPO:-$HOME/dev/resbite-app}"
mkdir -p /tmp/asr6
{ echo 'begin;'; echo 'select private.run_retention() as counts;'; echo 'rollback;'; } > /tmp/asr6/dry-run.sql
supabase db query --linked -f /tmp/asr6/dry-run.sql
```

- **Read the thirteen counts** and check none is unexpectedly large. Compare each with `D/hosted-counts-after.json`: a purge never takes more than its table holds, and on a project this young most should be small or 0.
- **`web_accounts`** is the number of accounts the first run would queue for deletion (AS-R4), and **`unconfirmed_accounts`** the number of Auth users it would delete. Read both twice. **`pending_phone_changes`** is the number of accounts whose number given and never confirmed it would clear. `web_accounts` reads `null` with `55P03` if an in-app deletion happened to hold the deletions' lock at that moment: run the dry run again.
- **A `null`** means that purge failed and the rest ran. Its warning ("resbite retention: <key> failed (<SQLSTATE>)") is in the Postgres logs. `unconfirmed_accounts` reads `null` if R2's `may_delete_auth_users` was false. Decide before R7.
- **Nothing is kept.** The `rollback` undoes every delete, the queued deletions and their notices. The only trace is one "resbite retention:" log line with the counts.
- If the CLI's role may not execute `private.run_retention()` (permission denied), paste the three lines into the SQL editor instead, which runs as `postgres`.

### R5. Worker

0. **[approval] Flip the source gate** (as plan 2's Rollout step 5 flips its deletion gates).
   - Set `PHOTO_CLEANUP_RELEASE_APPROVED = true` in `supabase/functions/cleanup-profile-photos/index.ts`.
   - Run the Edge tests: `node --import ./mobile/node_modules/tsx/dist/loader.mjs --test supabase/functions/_shared/*.test.ts` → `# fail 0`. Plan 2's `deletion-release.test.ts` then skips this entry's inert check, because its gate is no longer false.
   - Commit and push. Record the commit and `index.ts`'s new sha256 under "Applied".
   - Deploy from that commit. `PROFILE_PHOTO_CLEANUP_ENABLED` stays `false` until R6.
1. **[approval] Deploy,** `! bash ~/asr6-worker-deploy.sh`:

   ```bash
   #!/bin/bash
   # Deploy cleanup-profile-photos (retention and team tools, R5 step 1), from the gate-flip commit only.
   set -euo pipefail
   cd "${REPO:-$HOME/dev/resbite-app}"
   sha256sum -c - <<EOF
   de2c4dd90a4e9f5cf6471557cf81ef59ea47be47a01c57362103f759513d6b6b  supabase/functions/_shared/profile-photo-cleanup.ts
   6dc9fd24e5f885f08b1f528063eeff1593d859074cf56b9b4351e2a8f07d5b73  supabase/functions/_shared/profile-photo-cleanup-gateway.ts
   <index.ts sha256 at the gate-flip commit, from "Applied">  supabase/functions/cleanup-profile-photos/index.ts
   EOF
   grep -q '^const PHOTO_CLEANUP_RELEASE_APPROVED = true;$' supabase/functions/cleanup-profile-photos/index.ts || { echo "The source gate is not flipped: R5 step 0 first" >&2; exit 1; }
   supabase functions deploy cleanup-profile-photos --no-verify-jwt --project-ref ewcsgvhuojxdpaspwsrx
   ```

   - The script stops before deploying if a hash differs or the gate still reads false.
   - In the dashboard, the function's JWT verification reads off.
2. **[approval] Secrets and Vault,** `! bash ~/asr6-worker-secrets.sh`. It makes the secret and never prints it:

   ```bash
   #!/bin/bash
   # The photo worker's secret, its switch (off) and the two Vault entries (retention and team tools, R5 step 2).
   # The secret is made here and goes only to the function secrets and to Vault. Prints names and lengths only.
   set -euo pipefail
   cd "${REPO:-$HOME/dev/resbite-app}"
   REF=ewcsgvhuojxdpaspwsrx
   URL="https://$REF.supabase.co/functions/v1/cleanup-profile-photos"
   umask 077; T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
   S="$(openssl rand -hex 32)"
   printf 'PROFILE_PHOTO_CLEANUP_SECRET=%s\nPROFILE_PHOTO_CLEANUP_ENABLED=false\n' "$S" > "$T/env"
   supabase secrets set --env-file "$T/env" --project-ref "$REF"
   cat > "$T/vault.sql" <<EOF
   do \$\$
   declare v_id uuid;
   begin
    select id into v_id from vault.secrets where name = 'profile_photo_cleanup_secret';
    if v_id is null then perform vault.create_secret('$S', 'profile_photo_cleanup_secret');
    else perform vault.update_secret(v_id, '$S'); end if;
    select id into v_id from vault.secrets where name = 'profile_photo_cleanup_url';
    if v_id is null then perform vault.create_secret('$URL', 'profile_photo_cleanup_url');
    else perform vault.update_secret(v_id, '$URL'); end if;
   end \$\$;
   EOF
   supabase db query --linked -f "$T/vault.sql"
   supabase secrets list --project-ref "$REF" | grep -E 'PROFILE_PHOTO_CLEANUP_(SECRET|ENABLED)' | cut -d'|' -f1
   supabase db query --linked "select name, length(decrypted_secret) as characters from vault.decrypted_secrets where name in ('profile_photo_cleanup_secret', 'profile_photo_cleanup_url') order by name"
   ```

   - **Expected:** the two secret names; then `profile_photo_cleanup_secret | 64` and `profile_photo_cleanup_url | 76`.
   - Running it again makes a new secret and overwrites both places, so the two never differ. If the Vault step fails, run the whole script again: a failed statement can reach the Postgres log with its text, and the new run replaces that secret.
   - If the CLI's role is refused `vault`, stop and add both entries in Dashboard → Project Settings → Vault instead, after running the script's first part for the function secrets.
3. **Check it refuses while off:** `curl -s -X POST "https://ewcsgvhuojxdpaspwsrx.supabase.co/functions/v1/cleanup-profile-photos"; echo` answers 503, `{"error":"Photo cleanup disabled"}`. A gateway error instead (a missing authorization header, an invalid JWT) means JWT checking is on: deploy again with `--no-verify-jwt`.

### R6. Worker acceptance with a disposable account

With approval (`qa/photo-cleanup-readiness.md`, prerequisite 4). Disposable accounts only.

1. On the current build, a disposable account sets a profile photo, then a cover on a disposable resbite.
2. In the SQL editor, after the hash check by eye, run `remove-profile-photo.sql` (the account's id) and `remove-resbite-content.sql` (the resbite's id, cover only: title, description and notes set to false), in the editor's copy only. They print `queued` true, and `covers_queued` 1.
3. **[approval]** `supabase secrets set PROFILE_PHOTO_CLEANUP_ENABLED=true --project-ref ewcsgvhuojxdpaspwsrx`. Then POST to the function once with the bearer secret, `! bash ~/asr6-worker-run.sh`, which reads it from Vault and does not print it:

   ```bash
   #!/bin/bash
   # One run of the photo and cover clean-up (retention and team tools, R6 step 3). Reads the bearer secret from Vault
   # into a private file, never prints it, and prints the worker's counts.
   set -euo pipefail
   cd "${REPO:-$HOME/dev/resbite-app}"
   REF=ewcsgvhuojxdpaspwsrx
   umask 077; T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
   supabase db query --linked -o json "select decrypted_secret as s from vault.decrypted_secrets where name = 'profile_photo_cleanup_secret'" > "$T/secret.json"
   node -e 'const fs = require("fs"); const r = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); const row = (Array.isArray(r) ? r : r.rows || [])[0]; if (!row || !row.s) { console.error("No profile_photo_cleanup_secret in Vault"); process.exit(1); } fs.writeFileSync(process.argv[2], "Authorization: Bearer " + row.s + "\n");' "$T/secret.json" "$T/auth"
   curl -s -X POST -H @"$T/auth" -H 'Content-Type: application/json' -d '{}' "https://$REF.supabase.co/functions/v1/cleanup-profile-photos"; echo
   ```

   - **Expected:** `{"claimed":2,"complete":2,"retry":0,"deferred":0}`. A queued file goes at once; it does not wait the 7 days.
   - `401` means the function's secret and Vault's differ: run R5 step 2 again.
   - From this run on, the worker also observes the orphan photos and covers already in Storage, a bounded number a run. Each goes 7 days after it was first observed, unless it is attached again or a hold keeps it.
4. **Check:**
   - Both objects are gone from Storage (the dashboard's Storage browser, or a count over `storage.objects` by the two paths, in the editor's copy only, reads 0).
   - Re-attaching the old cover path is refused: `begin; update public.plans set cover_path = '<the old path>' where id = '<the resbite id>'; rollback;` fails with 42501 "Cover retired; choose a new photo".
   - The account's other photos are untouched.
5. Delete the disposable account through plan 2's route (in the app, or `supabase/ops/delete-account.sql`).

`PROFILE_PHOTO_CLEANUP_ENABLED` stays `true` from here: the schedule (R7) calls the worker.

### R7. Schedule

The owner approves `supabase/ops/schedule-retention.sql` by sha256 (above). Only after R5 and R6: the job calls the worker with the Vault secrets.

1. Run:

   ```
   ! bash -c 'cd "${REPO:-$HOME/dev/resbite-app}" && echo "9420d45bd1f9ad8f818d577a6964265e14c542e76e54f02622436f58e86f4491  supabase/ops/schedule-retention.sql" | sha256sum -c - && supabase db query --linked -f supabase/ops/schedule-retention.sql'
   ```

2. **Check the jobs' role:** `select jobname, schedule, username from cron.job where jobname in ('retention-purge','cleanup-images');`.
   - **Expected:** `cleanup-images | */10 * * * * | postgres` and `retention-purge | 47 3 * * * | postgres`.
   - `username` must be `postgres`: pg_cron runs a job as the role that scheduled it, and no API role may execute `private.run_retention()`. If it isn't, unschedule both (`select cron.unschedule(jobid) from cron.job where jobname in ('retention-purge','cleanup-images');`) and paste the file into the SQL editor, then check again.
3. **The next day,** the "Roll job check" section of `qa/app-store-release/README.md` (`~/asr-jobs.sh`) shows both jobs active with no failures:
   - `cleanup-images`: `last_run` within 10 minutes, `failed_last_day` 0. A `succeeded` run only means the call was queued; the function's log shows the counts.
   - `retention-purge`: runs daily; `failed_last_day` 0. Its counts are in the Postgres logs ("resbite retention:"), and a failed purge's warning beside them.
4. **Stop running `supabase/ops/purge-closed-reports.sql` by hand** (`docs/compliance/moderation-standard.md` section 4, step 6). The job replaces it and respects holds.

### R8. Roll job (C4)

The owner approves `supabase/ops/schedule-roll-repeating-plans.sql` by sha256 `3a8202877260008723648dc4723b36aedb6d772f809b2552997765773040d74e` (`qa/creating-a-resbite-2026-10-31/README.md:30`; release runbook step 12). This is independent of R1 to R7 and may run first.

1. Run:

   ```
   ! bash -c 'cd "${REPO:-$HOME/dev/resbite-app}" && echo "3a8202877260008723648dc4723b36aedb6d772f809b2552997765773040d74e  supabase/ops/schedule-roll-repeating-plans.sql" | sha256sum -c - && supabase db query --linked -f supabase/ops/schedule-roll-repeating-plans.sql'
   ```

2. Then the role check and the run check from `qa/creating-a-resbite-2026-10-31/README.md`, step 7 (`:89-105`): `username` is `postgres`, and the runs succeed. A weekly test group gets its next occurrence.
3. Record it in that runbook's "Applied" and in this one.

### R9. Auth templates (C13)

With approval, only after `https://link.resbite.com/privacy` is live (release runbook step 16).

1. For each of Confirm sign up, Magic link or OTP, and Reset password, compare the dashboard's current body with its `.previous.html`. If they differ, replace the `.previous.html` with the dashboard's body in a commit first.
2. Paste the new `confirmation.html`, `email-code.html` and `recovery.html`, after the hash check by eye. Subjects are unchanged.
3. Check the rendered preview. Send one confirmation to a disposable address the owner controls.
4. Record each file's sha256.

### R10. First objection

Nothing to set up: the first `object-number.sql` run creates the Vault key `invite_objection_key` inside the database. Run it only after the phone check in `docs/compliance/data-requests.md` section 4.3. It prints counts only; record that an objection was made and the date, never the number.

### R11. `private.phone_rewrites`

After the C12 decision (run or retire the Argentine rewrite), with approval: `delete from private.phone_rewrites;` in the SQL editor. Record the count, never rows.

### R12. Records

- Fill in "Applied".
- Tick the release runbook's step 14 C3 line and step 12's roll job line.
- Add the status entry to `docs/implementation-status.md`.

## Applied

Nothing has been applied yet. Add a dated entry for each step: what was done, the file names and sha256 where there are any, the counts and the result. Never a name, number, email or account id.

## Rollback

With approval, **before plan 2's rollback**, if that is undone too: this file builds on what plan 2 made, and plan 2's rollback refuses while a hold or a suspension history row is left.

1. **Unschedule both jobs:** `select cron.unschedule(jobid) from cron.job where jobname in ('retention-purge','cleanup-images');`. The rollback refuses while either is scheduled ("Unschedule the retention jobs first", 55000).
2. **Turn the worker off:** `supabase secrets set PROFILE_PHOTO_CLEANUP_ENABLED=false --project-ref ewcsgvhuojxdpaspwsrx`. It then answers 503.
3. **The do-not-invite list.** Export and empty `private.invite_objections` only if the owner decides to. Until then the rollback refuses, changing nothing.
4. **Run the rollback** after checking its sha256, wrapped in `begin;`/`commit;` through `supabase db query --linked -f`, as R3 does. `! bash ~/asr6-rollback.sh`:

   ```bash
   #!/bin/bash
   # Roll back the retention migration (retention and team tools, Rollback step 4). Only with the owner's approval,
   # after steps 1 to 3.
   set -euo pipefail
   cd "${REPO:-$HOME/dev/resbite-app}"
   D=qa/retention-and-team-tools-2026-11-17
   F=supabase/rollback/20261117130000_retention_and_team_tools.rollback.sql
   echo "59a251b1ff4130663ec780c2710511b0ab8e45b9937184ca23ca3561e3858f25  $F" | sha256sum -c -
   mkdir -p /tmp/asr6
   { echo 'begin;'; cat "$F"; echo; echo 'commit;'; } > /tmp/asr6/rollback.sql
   supabase db query --linked -f /tmp/asr6/rollback.sql
   supabase db query --linked -f supabase/ops/hosted-fingerprint.sql -o json > "$D/hosted-after-rollback.json"
   supabase db query --linked -f supabase/ops/hosted-counts.sql -o json > "$D/hosted-counts-after-rollback.json"
   ```

   - The script stops before running anything if the hash differs. A refusal changes nothing.
   - `hosted-after-rollback.json` should equal `hosted-before.json` (R2) by definition, apart from anything applied since, as the rehearsal proved locally.
   - The migration history is left as it is: never `supabase migration repair --status reverted`.
   - Record the rollback under "Applied", as `qa/creating-a-resbite-2026-10-31/README.md` "Rollback" does.
5. **Deleted rows are not restored:** purged records, the Auth users the runs removed, the accounts they queued for deletion, the roster and the legacy invitations. Each disabled roster row stays the revoked grant it became. The list's key `invite_objection_key` stays in Vault.
6. The worker stays deployed and does nothing while `PROFILE_PHOTO_CLEANUP_ENABLED` is false. Its RPCs are gone, so it must not be switched on again until the migration is.

## Known gaps and open points

1. **Plan 2's names** ("Shared with plan 2" in the plan): confirmed equal by the cross-plan review of 17 November 2026. Plan 2 owns the shared objects.
2. **Old builds and `'unavailable'`.** A build before Task 10 shows "Check your connection and try again." for a whole batch that holds a listed number, and invites none of it. Objections open with the site's notices, and the 1.0 build carries Task 10. Record it in the release notes for testers.
3. **An objection at the moment a host invites** can leave one new invitation. Running `object-number.sql` again removes it (its header says so).
4. **Plan ordering.** `export-account.sql` reads plan 4's `private.terms_acceptances`, and the rehearsal passes every earlier pending candidate (plan 1's `20261117100000`, plan 2's, plan 4's `20261117120000` to `20261117122000`) before this file.
5. **VAT.** Add a VAT line to the email footer if Resbite Ltd is VAT-registered, as a new template change.
6. **Hosted privileges** (`delete` and `update` on `auth.users`, `trigger` on `storage.objects`) are checked read-only at R2. The local harness cannot prove them: it runs every migration as a superuser, who passes every ownership check.
7. **A lifted hold's row** in `private.legal_holds` (plan 2's table) has no period yet and no purge. `docs/compliance/retention-schedule.md` section 7 proposes 24 months after the lift, with the hold register; a later migration adds the purge once the owner agrees. The row holds an account or series id, a reason code, a case reference and dates.
8. **A number never confirmed may also sit in `auth.one_time_tokens`.** Recent Supabase Auth versions keep each pending code in `auth.one_time_tokens`, with the number it was sent to in `relates_to` (token type `phone_change_token`), until the code is used or replaced. `purge_pending_phone_changes` clears only the three `auth.users` columns, which the local harness has; it does not touch that table, whose shape and grants on hosted are unverified. R2 records whether the table exists. If it does, a later migration should also delete the account's `phone_change_token` rows in the same purge, or the privacy notice section 7 should say where the number stays.
9. **A series hold does not pause another person's own deletion (ASR2-4), and that is the owner's decision.** The retention jobs now keep everything a held series holds, the web-only account purge included. But a guest or host of a held series who deletes their own account in the app, or whom the team deletes, is still erased at once: their messages lose their words, the host's resbites lose their title, description and place, and the cleanup worker removes their cover files. Only an account hold pauses that. Option 1 is to make deletion wait for any series hold the account is part of (a `private.deletion_held(uuid)` read by the queue, both claim filters and the storage listing). Option 2 is to keep ASR2-4 and say in `docs/compliance/retention-schedule.md` section 15 and `law-enforcement-requests.md` sections 11.2 and 11.3 that the team must also hold every account whose words or meeting details must be kept. `set-legal-hold.sql`'s comment (lines 12-14) currently promises option 1. The documents are lane C's; the decision is the owner's, with the solicitor (Art 17(3)(e)).
10. **The harness runs every migration as a superuser**, so an owner-only statement on `storage.objects` or `auth.users` passes locally and fails on hosted. Making `storage.objects` belong to another role in `supabase/tests/local/bootstrap.sql` would not change that (a superuser passes every ownership check whatever the owner); catching it needs the candidates applied as a non-superuser role, a larger change not made here. The rolled-back trigger check in plan 2's runbook (step 1) covers the one owner-sensitive statement left.

## Sources

- Plan: `docs/superpowers/plans/2026-11-17-asr-6-retention-and-team-scripts.md` (Decisions 1 to 13, Rollout, Known gaps).
- Roadmap: `docs/superpowers/plans/2026-11-17-asr-0-roadmap.md` (H0, H6, H8; the apply order; the cron names).
- The apply pattern: `supabase/migrations/20261116120000_open_beta.sql`, its rollback and rehearsal pair, and the hash-guarded script of `qa/chat-release/README.md:430-452`.
- Release runbook: `qa/app-store-release/README.md` (steps 12, 14, 15 and 16; the roll job check).
- Records this plan makes true: `docs/compliance/retention-schedule.md`, `docs/compliance/data-requests.md` (sections 4.3, 5, 8.4, 10.2 and 15), `docs/compliance/law-enforcement-requests.md` (section 11), `docs/compliance/legitimate-interests.md` (LI-4), `docs/legal/privacy-notice.md` (section 10).
