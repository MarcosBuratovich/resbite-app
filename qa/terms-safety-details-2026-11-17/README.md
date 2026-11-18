# Terms, safety and details: release runbook (17 November 2026)

- **Spec:** [the App Store readiness gap analysis](../../docs/superpowers/specs/2026-11-17-app-store-readiness-design.md): rows SI-7, SI-8, UGC-1, UGC-2 and UGC-10; deliverables B2, B7, B11, C7, C8 and C9; decisions D-9 and D-11. The owner's AS-D8 (every account accepts the new Terms once; the optional details are removed) and the call AS-R9 (the report thanks states the review time) are in the [decision log](../../knowledge-base/08-decisions.md), under "App Store readiness (AS)". This plan's own calls are AS-P4-1 to AS-P4-6 there.
- **Plan:** [App Store readiness plan 4, Terms, safety and details](../../docs/superpowers/plans/2026-11-17-asr-4-terms-safety-details.md). The [roadmap](../../docs/superpowers/plans/2026-11-17-asr-0-roadmap.md) calls steps 1 to 4 below sitting H5 (release runbook step 14), step 6 part of H10 (the submission build) and step 7 H11.
- **Code:** Tasks 1 to 3 were merged into `app-store-readiness` at `1dd8c02`; Tasks 4 to 8 are on branch `asr-4-terms-safety`, from `app-store-readiness` at `4c79b98`:
  - `b89d22d` C8, versioned Terms acceptance (Task 1);
  - `49ce74a` C7, the report reasons and the wider blocked-terms filter (Task 2);
  - `9ee1736` C9, the optional details erased and their write path retired (Task 3);
  - `5bfe026` the access status's Terms keys, the gate after Add your number and the sign-up tick flushed first (Task 4);
  - `e1b738f` and `9d64d06` the accept screen, the one-tick wording and `TERMS_VERSION` `2026-12`, app and link site (Task 5 and its review fixes);
  - `b6490d2` the seven reasons, the review time in the thanks and the words for a blocked term, app and link site (Task 6);
  - `a20d8a8` Account details removed from the app (Task 7);
  - this record, the decisions and the status paragraph (Task 8).
- **Nothing here is applied.** No SQL has run on the hosted project, no Terms version is published, and nothing is deployed to Vercel, EAS or TestFlight, until "Applied" says otherwise. Every step below needs the owner's explicit approval when it is done.

## What is built

- **C8, `20261117120000_terms_acceptance.sql` (Task 1).**
  - Two private tables, row-level security on and no API grant. `private.terms_versions` holds the versions the owner publishes. `private.terms_acceptances` holds one row per account and version, with `accepted_at` and `how` (`sign_up`, `terms_screen`, `invitation` or `legacy`). Every 18+ tick in `private.age_attestations` is copied as `legacy`. The migration publishes no version.
  - `account_access_status()` also reports `terms_version` (the current published version, or null) and `terms_needed`.
  - `accept_terms(text)` records the accept screen. It refuses `22023 'Terms changed'` for anything but the current version, null included.
  - The sign-up tick (`attest_age`), the three invitation answers (`join_by_link`, `request_to_join`, `answer_phone_invitation`) and the fold (`fold_web_account`) write the record too.
  - The fold also refuses (`22023 'The account cannot be folded'`, which `fold-phone-account` answers as 409, deleting nothing) a web account that a legal hold names or that is being deleted: otherwise its records would move to an account no hold names and the handler would delete the held Auth user (the final review's cross-cutting #8). It reads plan 2's `private.account_held`, and `private.deletion_pending` as plan 2 redefines it (reading `private.account_deletion_jobs`), so plan 2's `20261117110000` must be applied first, as the roadmap orders: plpgsql binds names only when the fold runs, so without plan 2 C8 would apply and every fold would then fail with 42883 (no `private.account_held`). Step 2's opening check refuses with "Apply plan 2 first" and changes nothing.
  - The fold also clears the app account's pending number (`auth.users.phone_change`, `phone_change_token` and `phone_change_sent_at`, set to `''`, `''` and null, only where a number is pending; lane S2). Someone on Add your number who first sent a code to a mistyped number, then typed the number their web account holds, is folded with that change still pending. The handler's later Admin API call sets the web account's number and leaves `phone_change` alone, and the Send SMS hook refuses every code to an account with a confirmed number and a different pending one, so that account could otherwise never get a code by text again. The fold writes `auth.users` from its definer as C9 does at its apply, so C9's apply also proves the privilege on hosted. The rehearsal pins the fold's three named edits.
  - No server function requires acceptance (AS-P4-3): `private.user_eligible` is untouched.
  - `supabase/ops/publish-terms-version.sql` is the owner's publish script (step 7), with the literal `2026-12`. It adds a version only when it is later than every one already there, and prints `published`, `current_version` and `accounts_to_ask`, numbers only.
- **C7, `20261117121000_safety_extension.sql` (Task 2).**
  - `private.reports.reports_reason_check` admits seven reasons: `illegal`, `child_safety`, `intimate_image`, `harassment`, `spam`, `inappropriate`, `other`. `report_message` and `report_user` accept them.
  - `private.holds_blocked_term(text)` is the chat's match, unchanged. Three `BEFORE` triggers use it: `plans_refuse_blocked_words` (title, description, note to guests), `plan_meeting_details_refuse_blocked_words` (note) and `profiles_refuse_blocked_words` (display name). Each acts only on a person's own write and only on a value that changes, and refuses with `22023 'Not allowed'` (AS-P4-5).
  - `supabase/ops/open-reports.sql` lists open reports with `child_safety` first, then `intimate_image`, then `illegal`, then the rest, each oldest first.
- **C9, `20261117122000_optional_details_removal.sql` (Task 3).** It erases the `registration_details` and `registration_details_version` keys from every account's Auth metadata (object metadata only) and drops `save_registration_details(jsonb,jsonb)` in both schemas. It is re-runnable. Nothing restores the erased values.
- **Each migration** has a rollback in `supabase/rollback/`, a rehearsal pair in `supabase/tests/hosted-baseline/` and a SQL test (`terms-acceptance.sql`, `safety-extension.sql`, `optional-details-removal.sql`), listed in `tests.txt`.
- **The app (Tasks 4 to 7).**
  - An Accept your Terms screen (`mobile/app/accept-terms.tsx`) between Add your number and About you, for an `approved` account with a verified phone whose status says `terms_needed`. It sends the version the server reports. On `Terms changed` it says so, re-reads and asks again. A suspended account sees its own screen.
  - The sign-up tick is flushed before the account's first gate and records the server's version when it knows one, so a new account is not asked twice.
  - The tick reads "I’m 18 or over and I accept the Terms of Use.", with "Read the Terms of Use. Our Privacy Policy explains how we use your data." under it and the VoiceOver hint "Confirms you’re 18 or over and accept the Terms of Use." `TERMS_VERSION` is `2026-12`.
  - The report sheet offers the seven reasons, and the thanks adds "We review reports every day.". A refused blocked term reads "That name includes a word Resbite doesn’t allow. Try another." for a name, or "That includes a word Resbite doesn’t allow. Change it and try again." for a resbite's text or a note. The chat rules sheet links the full community rules.
  - Account details, its Profile row and the suspended screen's Details chip are gone, with `registration.ts`, `RegistrationDetails.tsx` and the `save_registration_details` call.
- **The link site (Tasks 5 and 6).** The tick has the app's words, the `TERMS_VERSION` fallback in `links/server/lib/options.mjs` is `2026-12`, and a name refused for a blocked term reads the app's name line, not "This invitation is no longer active.".

## Files and hashes

| File | sha256 |
| --- | --- |
| `supabase/migrations/20261117120000_terms_acceptance.sql` (C8, step 2) | `f122ff3300a615d5a95d2b69f3de0f334e7e864aea034e0f5000ca2f59cbc86d` |
| `supabase/migrations/20261117121000_safety_extension.sql` (C7, step 2) | `a2ac35ac4a72b99ebddf83981f888d4c5b2fd8d7d7fd85ee151f50a83c3e702c` |
| `supabase/migrations/20261117122000_optional_details_removal.sql` (C9, step 2) | `91a32bcba8857d95cecea9ebe26981714c3f530eaefad4fd372d27450445b8a2` |
| `supabase/ops/publish-terms-version.sql` (step 7, the SQL editor) | `f86832b0ae4a7e15bb4164ca840bdfa04f85915fe9df45b274ac68d85d8dc36e` |
| `supabase/ops/open-reports.sql` (the moderators' read-only list, changed by C7's task) | `1ea5b8f0fb20bbf2e98b92020f4ce38c099795ebd524ef1d8fefb0b6cf1d5557` |
| `supabase/rollback/20261117120000_terms_acceptance.rollback.sql` (Rollback) | `5547aa5aa2a7d278e445666360979e2dbe9c6e989aafae735df11c84ec5bee77` |
| `supabase/rollback/20261117121000_safety_extension.rollback.sql` (Rollback) | `c3134e653ef984b67972af9116de1696a54f51fd3d835b0a2231ef6b0cbfb9f7` |
| `supabase/rollback/20261117122000_optional_details_removal.rollback.sql` (Rollback) | `50c19f38bb8f27a8e47d042e7a15248c766351f38092acf869b0a8650251b1ec` |
| `supabase/tests/hosted-baseline/20261117120000_terms_acceptance.before.sql` (the rehearsal) | `e54260a2dbb559c431ea614bd449cccdb2eaf95e37802ccb6650c26409fa66fb` |
| `supabase/tests/hosted-baseline/20261117120000_terms_acceptance.after.sql` (the rehearsal) | `510b68dd9882687bc8334f58b49cc5e13979b930783611a136518336135d3db8` |
| `supabase/tests/hosted-baseline/20261117121000_safety_extension.before.sql` (the rehearsal) | `2924481d345d8333a813f841f459310c27e604c6dcb1b8d13042c4fb075f50e9` |
| `supabase/tests/hosted-baseline/20261117121000_safety_extension.after.sql` (the rehearsal) | `f7c7f5da6876cef4c5ad7b9307794b0cc878d3078504ab87c6a90ac59d897d70` |
| `supabase/tests/hosted-baseline/20261117122000_optional_details_removal.before.sql` (the rehearsal) | `f5bbe2672961a17fe8f23756d707d6e36689c6f58a571ac7ee3be9f6ffc132e7` |
| `supabase/tests/hosted-baseline/20261117122000_optional_details_removal.after.sql` (the rehearsal) | `acb540826f1df979866cce61222484406a27cbae81980663f7c607a28249b34e` |
| `supabase/ops/hosted-fingerprint.sql` (unchanged) | `0778c53f98bc1cbdcee82487651dabc3fa246674a5d0efa1d6502e7746819a00` |
| `supabase/ops/hosted-counts.sql` (unchanged) | `15fe76aecba6bb5104d8795338c1ecaee9bd07ec9a2a9b7aba728e2bdae8c4a0` |

From `sha256sum` at this record's commit. Recompute before asking for approval (`sha256sum <file>`). Approve by file name and hash, and stop if a hash differs.

- **The publish script is pasted into the SQL editor**, so its hash is checked by eye: compare the file's `sha256sum` with this table before copying it, and check the literal (`2026-12`) in the editor's copy. Every other file is checked by its script.
- **The bases.** C8 and C7 redefine eight functions, each from the latest migration in `supabase/tests/hosted-baseline/migrations.txt` that defines it. Before asking for approval, check that no readiness migration with an earlier timestamp (plan 1's `20261117100000`, plan 2's `20261117110000`) now redefines one:

  ```bash
  for f in account_access_status attest_age join_by_link request_to_join answer_phone_invitation fold_web_account report_message report_user; do echo "$f: $(grep -l -E "create (or replace )?function private\.$f\(" supabase/migrations/*.sql | sort | tail -2 | xargs -n1 basename | tr '\n' ' ')"; done
  ```

  At this record's commit it prints the base, then the plan 4 file, for each:

  ```
  account_access_status: 20261027120000_phone_accounts.sql 20261117120000_terms_acceptance.sql
  attest_age: 20261027120000_phone_accounts.sql 20261117120000_terms_acceptance.sql
  join_by_link: 20261116120000_open_beta.sql 20261117120000_terms_acceptance.sql
  request_to_join: 20261116120000_open_beta.sql 20261117120000_terms_acceptance.sql
  answer_phone_invitation: 20261111130000_circles_of_trust.sql 20261117120000_terms_acceptance.sql
  fold_web_account: 20261111160000_chat_safety.sql 20261117120000_terms_acceptance.sql
  report_message: 20261111160000_chat_safety.sql 20261117121000_safety_extension.sql
  report_user: 20261111160000_chat_safety.sql 20261117121000_safety_extension.sql
  ```

  If another file appears between them, stop: the plan 4 body must copy that file's body, and its rehearsal's named-line check changes with it (plan Global Constraints).

## Checks made locally (17 November 2026)

At `a20d8a8` (Tasks 1 to 7). Task 8 changes documents only.

- **Full mode**, `bash scripts/test-database-docker.sh`: exit 0, 70 PASS lines (36 SQL files, 33 concurrency lines and the final line), among them `terms-acceptance.sql`, `safety-extension.sql`, `optional-details-removal.sql` and `account-access.sql`.
- **The hosted baseline with every readiness candidate built so far**, in timestamp order (plan 1's and plan 2's first, as the roadmap applies them):

  ```bash
  bash scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261117100000_phone_test_mode_retired.sql supabase/migrations/20261117110000_account_deletion_release.sql supabase/migrations/20261117120000_terms_acceptance.sql supabase/migrations/20261117121000_safety_extension.sql supabase/migrations/20261117122000_optional_details_removal.sql
  ```

  Exit 0, 35 PASS lines: the five candidates, each with its rehearsal pair (before, the file, after, and the rollback inside a transaction it rolls back), the 29 files of `tests.txt` and the final line. C7's rehearsal runs its rollback with one `illegal` report stored, so the run prints that rollback's notice ("1 report(s) give a reason this rollback removes…"): expected.
  - Until step 4 adds the three files to `migrations.txt`, a hosted-baseline run must name them: `tests.txt` already lists their tests.
  - After the final review's SQL fixes (lane S, 17 November 2026; the fold's refusal of a held or deleting web account), with plan 6's candidate too: exit 0, 38 PASS lines. Full mode: exit 0, 73 PASS lines.
  - After lane S2's (17 November 2026; the fold's clearing of a pending number, with its third named edit in the rehearsal), the same: exit 0, 38 PASS lines, and full mode exit 0, 73 PASS lines.
- **The app**, `cd mobile && npm run check` (the typecheck, the whole `npm test` chain with the link site's tests, and content validation): exit 0, 1,306 tests, none failed.
- **Browser checks**, headless Chrome on Expo web and the link site with each script's own fixtures, run by Tasks 5 to 7:
  - PASS: `verify-phone.mjs` (the accept screen at 320 and 390 px, a stale version refused, re-read and asked again, the sign-up path straight to About you, and a suspended account never shown it), `verify-account.mjs` (a kept invitation waits behind Accept your Terms and opens after Continue; no Account details row and no details write), `verify-auth.mjs`, `verify-open-link-app.mjs`, `verify-registration.mjs`, `review-ui.mjs`, `verify-chat.mjs` (the seven reasons in order, "We review reports every day." under the thanks, at 320 px with 200 % text, and the full community rules link), `verify-connections.mjs`; on the link site, `links/verify-personal.mjs` and `links/verify-open-link.mjs`.
  - `verify-profile.mjs` passed its name half (a refused name keeps the typed name and says the name line) and `verify-event.mjs` passed every scenario but "admin cover". Their photo steps are deferred to integration (Known gaps, 14).
- **The scripts in "Rollout (owner-run)", rehearsed as printed here.** Each block was taken from this file, with its indentation removed, and run through a stand-in for the CLI that sends each query to a local replay in a throwaway `postgres:17` container. The replay held `migrations.txt` and plan 1's and plan 2's candidates. The stand-in history table held their 27 versions, and the Auth stub gained the hosted `created_at` column. The snapshots were CSV rather than JSON. The fixtures were seven synthetic accounts: two with an 18+ tick, five with details keys (one with a birth date that isn't a date), one with array metadata, one anonymous, and one phone identity with no details.
  - `asr4-before.sh`: `27 | 20261117110000`; `attestations` 2; `with_details` 5, `under_18_at_sign_up` 2, `under_18_today` 1; `identities_with_details` 0; `hosted-before.json` 557 rows.
  - `asr4-apply.sh` with a later version (`20261117130000`) in the history: refused with "A later migration is already applied", nothing created. With C8 changed by one line: stopped at its hash, nothing created.
  - `asr4-apply.sh`: the three hashes `OK`, then `30 | 20261117122000`. Run again: stopped at C8 (`relation "terms_versions" already exists`), with the fingerprint and the history unchanged.
  - `asr4-apply.sh`'s opening check, after lane S2 added plan 2's (17 November 2026): the block taken as above, up to and including that check, run through the same kind of stand-in against a throwaway cluster holding only a history table and an empty `private` schema. "Apply plan 2 first", exit 1, with neither `private.account_held(uuid)` nor `private.account_deletion_jobs`, with the table alone, and with the function alone; `DO`, exit 0, with both; "A later migration is already applied", exit 1, with both and `20261117130000` in the history. The rest of the script is unchanged.
  - `asr4-after.sh`: `2 | 2 | 0` (attestations, legacy rows, published), `with_details` 0, and the three trigger names. The fingerprint changes were exactly step 3's list, plus the two new tables' six constraints and two indexes. Only the two new tables were added to the row counts.
  - Step 4: with the five lines (plan 1's, plan 2's and these three) appended to a scratch copy of `migrations.txt`, `scripts/test-database.sh --hosted-baseline` with no candidate gave 30 PASS lines (the 29 tests and the final line).
  - The publish script: `1 | 2026-12 | 3`, then run again `0 | 2026-12 | 3` (three confirmed, non-anonymous accounts).
  - `asr4-rollback.sh` refused, changing nothing, with no argument, with `c8 c9`, `c7 c7` and `c10`, with `c7` while C9 was applied, and with `c8` while C7 was applied. `c9` rolled back C9; a second `c9` was refused (42723). `c7 c8` then rolled back the rest: `hosted-after-rollback.json` equal to `hosted-before.json`, the history still `30 | 20261117122000`, and `age_attestations` untouched.

## Order, and what the builds in people's hands see

- **C8** changes nothing anyone sees until step 7. Builds before this plan read only `account_id` and `status` from the access status (`mobile/src/services/accountAccess.ts` at `4c79b98`) and ignore the two new keys. After step 7, only builds from this plan show the accept screen (AS-P4-3).
- **C7** refuses a blocked term in a title, description, note to guests, meeting details or name on every build. Older builds word that refusal as their generic save error; this plan's build says the words. Older builds offer four report reasons, all still accepted.
- **C9** stops Account details saving on builds before Task 7. On the code at `4c79b98`, the failed call is caught, the re-read doesn't match (the reviewed marker is erased too), and the screen normally shows "Save could not be confirmed. Your changes are kept; try Save again to check." (C9's header names "Account details could not be saved.", the adapter's line, which that screen doesn't show.) Tell TestFlight testers first, or apply C9 when the new build is out (roadmap H5).
- **The link site** takes the new tick words and the `2026-12` fallback only with plan 5's production deploy (step 5), never earlier.
- **Publishing the version** (step 7) waits for `/terms` with Terms of Use 1.0 and the build from step 6 on TestFlight.

## Rollout (owner-run)

Every step below needs the owner's explicit approval at the time. **Never `supabase db push`**: it would also push the local-only files. Never `migration repair --status reverted`, never `db pull`. The assistant writes each script into the home directory from the block in its step; the owner reads it and runs it with `! bash ~/<name>.sh` from the checkout the rollout uses (`REPO`, default `~/dev/resbite-app`, at the merged commit). None prints a secret, a phone number, an email or an account id.

**Order.** 1 before snapshot and counts → 2 the three migrations (C8, C7, C9) → 3 after snapshot and advisors → 4 baseline records → later, separately: 5 the link-site deploy, 6 the EAS build, 7 publishing the Terms version. C9 breaks Account details on builds made before Task 7; tell TestFlight testers, or apply C9 when the new build is out. C7 refuses blocked terms on every build; old builds word that refusal as their generic save error.

1. **Before snapshot and counts** (read-only), `~/asr4-before.sh`:

   ```bash
   #!/bin/bash
   # Read-only: before snapshot and the counts this sitting needs (App Store readiness plan 4, step 1).
   set -euo pipefail
   cd "${REPO:-$HOME/dev/resbite-app}"
   D=qa/terms-safety-details-2026-11-17
   supabase db query --linked -f supabase/ops/hosted-fingerprint.sql -o json > "$D/hosted-before.json"
   supabase db query --linked -f supabase/ops/hosted-counts.sql -o json > "$D/hosted-counts-before.json"
   supabase db query --linked "select count(*) as applied, max(version) as latest from supabase_migrations.schema_migrations"
   supabase db query --linked "select count(*) as attestations from private.age_attestations"
   supabase db query --linked "select count(*) filter (where u.raw_user_meta_data ?| array['registration_details','registration_details_version']) as with_details, count(*) filter (where case when (u.raw_user_meta_data->'registration_details'->>'birth_date') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (u.raw_user_meta_data->'registration_details'->>'birth_date')::date > (u.created_at - interval '18 years')::date else false end) as under_18_at_sign_up, count(*) filter (where case when (u.raw_user_meta_data->'registration_details'->>'birth_date') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (u.raw_user_meta_data->'registration_details'->>'birth_date')::date > (current_date - interval '18 years')::date else false end) as under_18_today from auth.users u where jsonb_typeof(u.raw_user_meta_data) = 'object'"
   supabase db query --linked "select count(*) as identities_with_details from auth.identities where identity_data ? 'registration_details'"
   ```

   - Compare `hosted-before.json` with a local replay of `migrations.txt` (every file it lists that day; 25 when this plan was written): identical by definition apart from the known `acl` differences (`qa/connections-follow-ups-2026-11-11/README.md:134`; confirm their number against the open-beta `hosted-after.json` before approving). Stop if anything else differs.
   - History: as many rows as `migrations.txt` lists, the latest being its last version. In the roadmap's order that is `27 | 20261117110000` (plan 1's retirement and plan 2's deletion release went first). Stop if the latest is above `20261117122000`.
   - `under_18_at_sign_up` is the number `docs/compliance/childrens-access-assessment.md` placeholder 2 asks for (a count only, never who). Hand it to the owner for that record.
   - `identities_with_details` must be `0`. If not, stop: C9 erases only `auth.users` metadata.

2. **The three migrations** (approved by file name and sha256), `~/asr4-apply.sh`:

   ```bash
   #!/bin/bash
   # App Store readiness plan 4: C8, C7, C9, each in its own transaction, each recorded. Stops at the first failure.
   set -euo pipefail
   cd "${REPO:-$HOME/dev/resbite-app}"
   mkdir -p /tmp/asr4
   GUARD="if pg_catalog.to_regprocedure('private.account_held(uuid)') is null or pg_catalog.to_regclass('private.account_deletion_jobs') is null then raise exception 'Apply plan 2 first'; end if;
    if exists (select 1 from supabase_migrations.schema_migrations where version > '20261117122000') then raise exception 'A later migration is already applied: timestamps must follow the apply order (roadmap)'; end if;"
   supabase db query --linked "do \$\$ begin $GUARD end \$\$;"
   apply() {
     local v="$1" f="supabase/migrations/$1_$2.sql" h="$3"
     echo "$h  $f" | sha256sum -c -
     { echo 'begin;'; cat "$f"; echo; echo 'commit;'; } > "/tmp/asr4/$v.sql"
     supabase db query --linked -f "/tmp/asr4/$v.sql"
     supabase migration repair --status applied "$v" --linked --yes
   }
   apply 20261117120000 terms_acceptance f122ff3300a615d5a95d2b69f3de0f334e7e864aea034e0f5000ca2f59cbc86d
   apply 20261117121000 safety_extension a2ac35ac4a72b99ebddf83981f888d4c5b2fd8d7d7fd85ee151f50a83c3e702c
   apply 20261117122000 optional_details_removal 91a32bcba8857d95cecea9ebe26981714c3f530eaefad4fd372d27450445b8a2
   supabase db query --linked "select count(*) as applied, max(version) as latest from supabase_migrations.schema_migrations"
   ```

   - Without plan 2's deletion release (`private.account_held(uuid)` and `private.account_deletion_jobs`), the opening check refuses with "Apply plan 2 first" before anything runs: the fold calls plan 2's `private.account_held`, and would otherwise apply and then fail at every call (42883).
   - A hash mismatch stops before anything runs. An error rolls back that file only and stops before its repair; the earlier files stay applied and recorded. Re-run only the remaining `apply` lines.
   - If an apply succeeded and only its repair failed, run that repair line alone. A second apply of C8 or C7 fails at its first `create table` or `create function` and changes nothing; C9 is re-runnable.
   - History after: three rows more, latest `20261117122000`.
   - If the CLI's role is refused the `update auth.users` in C9, that file's transaction rolls back whole; stop and ask before anything else.

3. **After snapshot and advisors**, `~/asr4-after.sh`:

   ```bash
   #!/bin/bash
   # Read-only: after snapshot and checks (App Store readiness plan 4, step 3).
   set -euo pipefail
   cd "${REPO:-$HOME/dev/resbite-app}"
   D=qa/terms-safety-details-2026-11-17
   supabase db query --linked -f supabase/ops/hosted-fingerprint.sql -o json > "$D/hosted-after.json"
   supabase db query --linked -f supabase/ops/hosted-counts.sql -o json > "$D/hosted-counts-after.json"
   supabase db query --linked "select (select count(*) from private.age_attestations) as attestations, (select count(*) from private.terms_acceptances where how = 'legacy') as legacy_rows, (select count(*) from private.terms_versions) as published"
   supabase db query --linked "select count(*) as with_details from auth.users where jsonb_typeof(raw_user_meta_data) = 'object' and raw_user_meta_data ?| array['registration_details','registration_details_version']"
   supabase db query --linked "select tgname from pg_trigger where tgname like '%refuse_blocked_words' order by 1"
   ```

   - `hosted-after.json` matches a local replay of `migrations.txt` plus the three files. Expected changes: tables `private.terms_versions` and `private.terms_acceptances` added; functions added `private.terms_version()`, `private.terms_needed(uuid)`, `private.note_terms(uuid,text,text)`, `private.accept_terms(text)`, `public.accept_terms(text)`, `private.holds_blocked_term(text)`, `private.refuse_blocked_plan_words()`, `private.refuse_blocked_meeting_words()`, `private.refuse_blocked_name()`; functions changed (grants unchanged) `private.account_access_status()`, `private.attest_age(text)`, `private.join_by_link(text,text,text)`, `private.request_to_join(text,text,text,text)`, `private.answer_phone_invitation(text,text,text,text)`, `private.fold_web_account(uuid,uuid)`, `private.report_message(bigint,text,text)`, `private.report_user(uuid,uuid,text,text)`; constraint changed `private.reports.reports_reason_check`; three triggers added; functions removed `private.save_registration_details(jsonb,jsonb)` and `public.save_registration_details(jsonb,jsonb)`. Stop for anything else.
   - `legacy_rows` equals `attestations`; `published` is `0` (nobody is asked yet); `with_details` is `0`; the three trigger names print.
   - Row counts: unchanged except the two new tables.
   - **Advisors** (the assistant, through the Supabase MCP server, after the owner approves the read) into `$D/hosted-advisors-after.json`. Expected: no new WARN or ERROR; two new INFO "RLS enabled, no policy" for the private tables, as for the earlier private tables.

4. **Baseline records** (local, no approval needed): append to `supabase/tests/hosted-baseline/migrations.txt`

   ```
   20261117120000_terms_acceptance.sql                    20261117120000
   20261117121000_safety_extension.sql                    20261117121000
   20261117122000_optional_details_removal.sql            20261117122000
   ```

   then `scripts/test-database-docker.sh --hosted-baseline` with no candidate → PASS for every file in `tests.txt`. Record the sitting under "Applied" in the runbook and in `docs/implementation-status.md`; commit and push.

5. **Link site deploy** (Vercel, approved at the time): this is plan 5's production deploy (its R2 to R6), never an earlier one, so the new tick wording and the `2026-12` fallback go live with `/terms`. Plan 5's R2 sets the Vercel variable `TERMS_VERSION` to the same value as the app's constant; this step only checks it. Check on a test invitation that a name holding a blocked term is refused with the new line.

6. **EAS build** (approved at the time; the submission build, F12): carries the accept screen, `TERMS_VERSION` `2026-12`, the seven reasons and the removal of Account details. Device checks: Apple sign-in → Add your number → the accept screen → About you; VoiceOver reads the tick with its hint and both links; the report sheet at the largest text size.

7. **Publish the Terms version** (SQL editor, approved by the sha256 of `supabase/ops/publish-terms-version.sql`): only once `/terms` carries Terms of Use 1.0 (plan 5's R6) and the build from step 6 is on TestFlight, before the device checks (release runbook step 22), so they see the accept screen and the review account accepts once before submission (roadmap). The literal must equal the app's `TERMS_VERSION` and the Vercel `TERMS_VERSION`. It prints `current_version` and `accounts_to_ask`; record both numbers in the runbook. From then on, every account on the new build is asked once.

**Rollback** (approved by sha256 at the time): reverse order only, C9, then C7, then C8, each with the same wrapper as step 2 but `supabase/rollback/<file>` and no repair. Never `migration repair --status reverted`: the history rows stay, as earlier rollbacks left theirs. Remove the three lines from `migrations.txt`. C9's rollback brings the RPC back but not the erased values. C8's rollback loses every per-version record and published version; run it before the open-beta rollback, whose guard would not notice it.

### The rollback script

The Rollback paragraph above as a script, `~/asr4-rollback.sh`. It takes the migrations to roll back, newest first: `c9`; `c9 c7`; `c9 c7 c8`; or, once the newer ones are rolled back, `c7` or `c8` alone (for example `! bash ~/asr4-rollback.sh c9 c7 c8`).

```bash
#!/bin/bash
# App Store readiness plan 4: roll back C9, C7 and C8, newest first, each in its own transaction, with no migration
# repair (the history rows stay). Only with the owner's approval. Arguments: the ones to roll back, newest first.
set -euo pipefail
cd "${REPO:-$HOME/dev/resbite-app}"
D=qa/terms-safety-details-2026-11-17
last=0
for a; do
  case "$a" in c9) r=1 ;; c7) r=2 ;; c8) r=3 ;; *) echo "Unknown: $a (name c9, c7 or c8)"; exit 1 ;; esac
  [ "$r" -gt "$last" ] || { echo 'Newest first only: c9, then c7, then c8'; exit 1; }
  last=$r
done
[ "$last" -gt 0 ] || { echo 'Name what to roll back, newest first: c9, c7, c8'; exit 1; }
mkdir -p /tmp/asr4
rollback() {
  local v="$1" f="supabase/rollback/$1_$2.rollback.sql" h="$3"
  echo "$h  $f" | sha256sum -c -
  { echo 'begin;'; cat "$f"; echo; echo 'commit;'; } > "/tmp/asr4/$v.rollback.sql"
  supabase db query --linked -f "/tmp/asr4/$v.rollback.sql"
}
for a; do
  case "$a" in
    c9) rollback 20261117122000 optional_details_removal 50c19f38bb8f27a8e47d042e7a15248c766351f38092acf869b0a8650251b1ec ;;
    c7) supabase db query --linked "do \$\$ begin if to_regprocedure('private.save_registration_details(jsonb,jsonb)') is null then raise exception 'C9 is still applied: roll it back first'; end if; end \$\$;"
        rollback 20261117121000 safety_extension c3134e653ef984b67972af9116de1696a54f51fd3d835b0a2231ef6b0cbfb9f7 ;;
    c8) supabase db query --linked "do \$\$ begin if to_regprocedure('private.holds_blocked_term(text)') is not null then raise exception 'C7 is still applied: roll it back first'; end if; end \$\$;"
        rollback 20261117120000 terms_acceptance 5547aa5aa2a7d278e445666360979e2dbe9c6e989aafae735df11c84ec5bee77 ;;
  esac
done
supabase db query --linked -f supabase/ops/hosted-fingerprint.sql -o json > "$D/hosted-after-rollback.json"
supabase db query --linked "select count(*) as applied, max(version) as latest from supabase_migrations.schema_migrations"
```

- A hash mismatch, an unknown name or the wrong order stops before that file runs. The C7 and C8 lines first check that the newer migration's objects are gone (C9's RPC back, C7's match function gone), so `c7` alone is refused while C9 is still applied.
- Each rollback file refuses, changing nothing, when its migration isn't there or a later migration redefined its bodies (42723 for C9, 42501 for C7 and C8): run that later migration's rollback first. There is no history check, because a rolled-back migration's history row stays.
- After all three, `hosted-after-rollback.json` equals `hosted-before.json`, apart from one case: when a report already gives one of the three new reasons, C7's rollback adds the four-reason check `NOT VALID` (with a notice of how many). Postgres still checks it on every write of such a row, so closing or purging one is refused until its reason is changed by hand to `other` (the rollback's header).
- The history line is the same as step 2's last line (in the roadmap's order `30 | 20261117122000`). Then remove the three lines from `migrations.txt` if step 4 added them.
- A later migration that redefines one of these bodies is rolled back before them; each rollback file refuses otherwise. The open-beta rollback, if ever, runs only after C8's.

## Known gaps

From the plan's Open points:

1. **The chat rules text.** `docs/legal/community-rules-short.md` section 1 recommends a new chat rules text with `private.chat_rules_version()` bumped. This plan built the "Read the full community rules" link and kept today's text and version, which the Terms (section 9.2) quote. If the owner adopts the new text, C7 gains one redefinition of `private.chat_rules_version()` before its hash is approved (and this table's hash changes), with the new `SAFETY_COPY.rules` and its test.
2. **The tick's second line** adds "Read the Terms of Use." to `community-rules-short.md` section 2's text. That section's "Build notes" still say `TERMS_VERSION` is `2026-10`. The session editing `docs/legal/` should match both, or name other words.
3. **The link site links "Terms" alone** in the tick line until plan 5's `linkedParts` (its Task 7) lands. The site is not deployed between the two.
4. **Cover descriptions, places and areas** are not filtered (the spec's list). The Terms' section 10.2 lists the same five surfaces.
5. **Old builds never show the accept screen** (AS-P4-3). Refusing accounts that haven't accepted after a date would be a later migration on `private.user_eligible`, with its effect on hosts' links and the weekly roll weighed first.
6. **`TERMS_VERSION` is the proposed `2026-12`.** The owner's final value goes into the app's constant, the link site's fallback and the publish script in one commit before the build, and the Vercel `TERMS_VERSION` matches it.

Found while building (Tasks 1 to 7):

7. **The tick line has a gap before ". Our"** on the accept screen, phone sign-up and the invite tick. Plan 3's `TermsLine` pulls back only a full stop after the last link. The links are right. The fix belongs to plan 3's component.
8. **About you writes the name to Auth metadata** with `supabase.auth.updateUser`, not through `save_profile`, so the profiles trigger doesn't see it there, and a failure reads "Check your connection and try again.". A blocked name there is refused only at a later profile write (in the app, `save_profile` then says the name line; on the web, the answer's refusal does).
9. **The invite screen's tick sends the app's `TERMS_VERSION`**, not the server's. If the owner publishes a value other than `2026-12`, someone who ticks there sees the accept screen once afterwards.
10. **A narrow race can ask a just-signed-up account once.** Two account refreshes would have to overlap during the sign-up tick's call. On the sign-up path only one refresh runs. There is no loop.
11. **`note_terms` records any well-formed version a client sends** with the sign-up tick or an invitation answer, not only published ones. That is by design (a tick before the version is published counts), and an acceptance of an unpublished version gates nothing.
12. **After C7's rollback, reports with a new reason can't be written** (above, "The rollback script").
13. **Records outside this plan still describe the old state:** `qa/chat-release/README.md:361` (titles, notes to guests and names "are not" checked), `docs/compliance/moderation-standard.md` section 4 step 3 ("Until `open-reports.sql` sorts those reasons first…"), and C9's header line named under "Order". The release runbook's step 14 doesn't yet point here.
14. **Browser checks deferred to integration:** the photo half of `mobile/scripts/verify-profile.mjs` and the admin-cover part of `verify-event.mjs`. In the worktree, Metro couldn't serve the lazy `expo-image-picker` chunk through the symlinked `node_modules`. These plan 4 tasks don't change the photo path.

## Applied

Nothing yet.

- Record each step's date and what it showed: the history line, `attestations`, `with_details`, `under_18_at_sign_up` and `under_18_today` (counts only), `identities_with_details`, `legacy_rows`, `published`, the three trigger names, the advisors' new findings, and for step 7 `current_version` and `accounts_to_ask`. Never a number, an email, an account id or a tester's name.
- Steps 5 and 6 are recorded in plan 5's record and the release runbook; note their dates here.

## Not done here

No SQL on the hosted project, no migration repair, no advisors read, no published Terms version, no Vercel deployment or variable, no EAS build and no TestFlight upload.
