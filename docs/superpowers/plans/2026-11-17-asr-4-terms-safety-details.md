# Terms Acceptance, Safety Extension and Optional Details Removal Implementation Plan (App Store readiness, plan 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every account accepts the current Terms of Use once, on the app and the web alike, and the server keeps a record per version; reports gain the three priority reasons and the thanks says when reports are read; the blocked-terms filter covers titles, descriptions, notes to guests, meeting details and display names; and the optional date of birth, second phone, city and interests are gone from the app, the API and Auth metadata.

**Architecture:** Three hosted-compatible migrations, each approved, applied and rolled back on its own. **C8** (`20261117120000_terms_acceptance.sql`) adds a published-versions table and a per-version acceptance record, reports `terms_version` and `terms_needed` in `account_access_status`, adds `accept_terms`, and makes the sign-up tick, the three invitation answers and the fold write the record. **C7** (`20261117121000_safety_extension.sql`) widens the report reasons and puts the chat's blocked-terms match on plans, meeting details and profiles through `BEFORE` triggers that act only on a person's own changed text. **C9** (`20261117122000_optional_details_removal.sql`) erases the stored details and drops the write RPC. The app gets an Accept your Terms screen between Add your number and About you, the new tick wording, the seven report reasons with the review-time line, words for a refused blocked term, and loses Account details. The link site gets the bumped `TERMS_VERSION` fallback and words for a refused name.

**Tech Stack:** PostgreSQL 17 / Supabase (SQL, plpgsql), Expo SDK 57 with expo-router (React Native, TypeScript), node `assert` test scripts (`cd mobile && npm test`), Playwright browser checks against Expo web, the link site's plain ES modules (`links/`).

**Spec:** `docs/superpowers/specs/2026-11-17-app-store-readiness-design.md` (rows SI-7, SI-8, UGC-1, UGC-2, UGC-10; deliverables B2, B7, B11, C7, C8, C9; decisions D-9, D-11) plus `knowledge-base/08-decisions.md`, section "App Store readiness (AS), 17 November 2026" (AS-D1 to AS-D8, AS-R1 to AS-R9; they win where they differ from the spec). The words people see come from `docs/legal/community-rules-short.md` sections 2 and 3, `docs/legal/terms-of-use.md` sections 2.4, 2.5, 10.2, 10.4 and 16.2, and `docs/legal/support.md` "Choosing a reason".

**Branch:** `asr-4-terms-safety`, a worktree branched from `app-store-readiness` and merged back into it in the roadmap's order (`docs/superpowers/plans/2026-11-17-asr-0-roadmap.md`); or `app-store-readiness` itself when nothing else is being built. Tasks 1 to 3 can start at once; Tasks 4 to 7 start after plan 3 (`2026-11-17-asr-3-app-legal-and-content.md`) has merged, and Task 7 needs its Task 8. **Another session has uncommitted edits** in `docs/legal/`, `docs/compliance/` and `qa/app-store-release/`. This plan never edits those paths: stage files by exact path only, never `git add -A` or `git add .`.

**Tasks:** 8. Tasks 1 to 3 are the database (in order). Task 4 needs Task 1's contract, Task 5 needs Task 4, Task 6 needs Task 2's error words, Task 7 needs Task 3. Task 8 is the records and the owner's rollout.

## Global Constraints

- **Hosted steps are owner-run.** Every hosted Supabase, Vercel, EAS, TestFlight or App Store Connect step needs the owner's explicit approval at the time. Hosted migrations are approved by file name and sha256. Never `supabase db push`, never `supabase migration repair --status reverted`, never `supabase db pull`.
- **The apply pattern** (model: the open-beta rollout, `qa/open-beta-2026-11-16/` and `docs/implementation-status.md:3`): a hash-guarded owner script checks the sha256, runs `supabase db query --linked -f` on the file wrapped in `begin;`/`commit;`, then `supabase migration repair --status applied <version> --linked --yes`, with before and after snapshots from `supabase/ops/hosted-fingerprint.sql` and `supabase/ops/hosted-counts.sql`, recorded in `qa/terms-safety-details-2026-11-17/README.md`. The scripts are in this plan's "Rollout (owner-run)" section.
- **Hosted-compatible migrations.** A redefined function copies the HOSTED body: the latest migration in `supabase/tests/hosted-baseline/migrations.txt` that defines it (the "Bases" tables in Tasks 1 and 2), and changes only the named lines. `create or replace` keeps grants. No function this plan redefines is local-only, so no `to_regprocedure` guard is needed. Before the hosted rehearsal, `grep -n 'function private.<name>' supabase/migrations/*.sql` for each base again: if another App Store readiness plan's migration with an earlier timestamp now redefines it, copy that body instead and update the named-line check.
- **Every migration** has a rollback in `supabase/rollback/`, a rehearsal pair `supabase/tests/hosted-baseline/<name>.before.sql` / `.after.sql` (the open-beta shape: capture each redefined body and its `proacl` before; after, prove the body equals the old one with exactly the named replacement and the grant unchanged; run the rollback inside `begin; … rollback;` with `\ir ../../rollback/<file>`; remove fixtures), and a SQL test file in `supabase/tests/`, listed in `supabase/tests/hosted-baseline/tests.txt` after `open-beta.sql`.
- **SQL suite:** `scripts/test-database-docker.sh` (full mode) and `scripts/test-database-docker.sh --hosted-baseline <every candidate built so far, in timestamp order>`. Until the rollout appends them to `migrations.txt`, always name every built candidate: `tests.txt` will hold their tests. That includes the other readiness plans' candidates on the branch, before this plan's: plan 1's `20261117100000_phone_test_mode_retired.sql` and plan 2's `20261117110000_account_deletion_release.sql` whenever they are there and not yet in `migrations.txt`. The commands below that name only this plan's files mean that full list.
- **Hosted order.** These three migrations are applied after plan 2's `20261117110000` and before plan 6's `20261117130000` (roadmap), so the history stays in timestamp order. Their apply script refuses if a version above `20261117122000` is already applied.
- **New database objects:** a new table enables RLS and revokes all from `public, anon, authenticated, service_role`; a new function revokes execute from the same four before any explicit grant; every `security definer` function has `set search_path = ''` (`supabase/tests/security-review.sql:10` enforces it).
- **Synthetic data only.** Test ids use the prefixes `ac` (terms), `ad` (safety), `ae` (details) and `ba`, `bb`, `bc` for the rehearsals, as `xx000000-0000-4000-8000-0000000000NN`; numbers in `447700900xxx`; emails `@resbite-test.invalid`. No secrets, real numbers, real emails, account ids, blocked terms or moderator emails in the repo. Test terms are nonsense words (`zzbadword`, `zz bad`, `zzold`).
- **App code:** before writing app code, read the SDK 57 docs for the expo-router APIs used here (`Stack.Protected`, `Redirect`, `router.replace`) at https://docs.expo.dev/versions/v57.0.0/ (`mobile/AGENTS.md`). This plan changes no Expo config and no native module. Tests are node `assert` scripts listed one by one in `mobile/package.json` `scripts.test`; a new test file is appended there. Run `cd mobile && npm test` and `cd mobile && npm run typecheck`. No `mobile/.env.local`, no service-role key in the app.
- **Link site tests** run inside `cd mobile && npm test` (its last four entries); alone: `cd mobile && node --test ../links/page.test.mjs && node --import tsx ../links/personal-flow.test.mjs`.
- **Copy:** plain British English, short sentences, the curly apostrophe ’ in app and site copy. The public documents are called "Privacy Policy", "Terms of Use", "Support" and "Delete your account" (AS-R5).
- **Shared files with the other readiness plans.** This plan owns `GUEST_COPY`, `TERMS_VERSION` (and its value on the link site), `SAFETY_COPY`, `mobile/app/invite.tsx`, `account-details.tsx`, `RegistrationDetails.tsx` and `registration.ts` (as `docs/superpowers/plans/2026-11-17-asr-3-app-legal-and-content.md` "Sequencing" records).
  - **`SAFETY_COPY.reportsPrivacy` is plan 2's** (`2026-11-17-asr-2-account-deletion.md`, Task 8, AS-R2): this plan leaves that one string alone.
  - **The link site's words are this plan's, its structure plan 5's.** Task 5 sets `PAGE_COPY.tick` and `.terms`, `COPY.tick` in `links/verify-personal.mjs` and `links/verify-open-link.mjs`, and the `TERMS_VERSION` fallback's value; Task 6 adds `nameNotAllowed`. Plan 5 consumes them and owns `TERMS_VERSION_FALLBACK`, `linkedParts`, the notice and the footer. The Vercel variable `TERMS_VERSION` is set once, in plan 5's Rollout R2.
  - **The dead email sign-up is plan 3's** (its Task 8). Task 7 below does not edit `useAuthFlow.ts` or `auth/index.tsx`.
  - **`supabase/tests/phone-accounts.sql`.** Plan 1's Task 5 replaces its first block; find this plan's block (Task 3) by its comment, "A phone-confirmed account awaiting access may save its details", not by line.
  - `2026-11-17-asr-3-app-legal-and-content.md` (B1) owns `TermsLine` (`mobile/src/design/TickRow.tsx:60-108`) and `termsRuns` (in its `src/domain/legal.ts`), which link "Terms of Use" and "Privacy Policy" as whole phrases. This plan does not touch them. Until B1 lands, today's `TermsLine` links the word "Terms" alone in the new line: cosmetic, and no build ships before both.
  - Plan 2 (B3, B6) owns `mobile/app/delete-account.tsx` and the suspended branch of `mobile/app/account.tsx`. Task 7 removes only the Details chip there (`account.tsx:172-179`); if plan 2 has rewritten that branch, remove the chip wherever it now is.
  - `2026-11-17-asr-5-link-site-legal-pages.md` (D1 to D4) turns the fallback in `links/server/lib/options.mjs` into `TERMS_VERSION_FALLBACK` (its L7) and links the site's tick line (its L9, Task 7). If it lands first, Task 5 sets that constant's value instead of the literal. `2026-11-17-asr-1-phone-codes.md` changes `links/assets/personal-flow.mjs:174-175` and `mobile/app/_layout.tsx`: different lines from this plan's.
  - Whichever plan lands second rebases on the first and keeps both changes.
- **Commit and push to the branch are allowed.** Merging to `main` is the owner's choice.

## Decisions this plan makes

1. **The current Terms version lives on the server, published by an owner script** (`private.terms_versions`, `supabase/ops/publish-terms-version.sql`), not fixed in a migration. The migration publishes nothing, so nobody is asked until the owner publishes, on the day `/terms` goes live and the build with the accept screen is out (README rule 5 in `docs/legal/README.md`).
2. **One row per account and version** in `private.terms_acceptances(user_id, terms_version, accepted_at, how)`, `how` one of `sign_up`, `terms_screen`, `invitation`, `legacy` ("when and how", Privacy Policy section 3.1). Existing `private.age_attestations` rows are copied as `legacy`. `age_attestations` stays the first 18+ tick, written once.
3. **Grace path for old accounts (spec C8 "optionally require it in eligibility").** Acceptance is not required by `private.user_eligible` or any server function. `user_eligible` also decides other people's experience (a host's links, pushes, the weekly roll), and builds before this one cannot show the screen. Only the app gate asks, once, on builds from this plan on; old builds keep working until replaced.
4. **The gate applies to `approved` accounts with a verified phone,** after Add your number and before About you. A suspended account (`access_pending`) sees its own screen. The accept screen sends the version the server reports. The sign-up tick, when flushed, records the server's current version when it knows one, else `TERMS_VERSION`, so a new phone account is never asked twice.
5. **`TERMS_VERSION` becomes `"2026-12"`** in the app, as the link site's fallback and in the publish script: the proposed default of placeholder 2 in `docs/legal/README.md` (AS-D8). If the owner names another value before the build, change all three in one commit.
6. **The tick reads "I’m 18 or over and I accept the Terms of Use."** with the line under it "Read the Terms of Use. Our Privacy Policy explains how we use your data." A checkbox's label cannot hold a link for VoiceOver (`TickRow.tsx:7-11`), so the line carries both links, which B1's `TermsLine` matches as whole phrases. The link site's copy stays equal to the app's (`links/personal-flow.test.mjs:161-162`), so Task 5 sets it too. VoiceOver hint: "Confirms you’re 18 or over and accept the Terms of Use." The screen's words are `community-rules-short.md` section 3's text for version 1.0.
7. **Report reasons, in this order:** Illegal or dangerous, Child safety, Intimate image shared without consent, Harassment, Spam, Not appropriate, Something else; stored as `illegal`, `child_safety`, `intimate_image`, `harassment`, `spam`, `inappropriate`, `other`. `open-reports.sql` lists open reports with `child_safety`, then `intimate_image`, then `illegal`, then the rest, each oldest first (`docs/compliance/moderation-standard.md` section 4 step 3).
8. **The report thanks gains the line "We review reports every day."** (AS-R9), after "Thanks. The Resbite team will look at it." and before the contact line.
9. **The filter on non-chat text is three `BEFORE` triggers**: `public.plans` (`title`, `description`, `guest_note`), `public.plan_meeting_details` (`note`) and `public.profiles` (`display_name`). Each acts only on a person's own write (`auth.uid()` not null) and only on a value that changes, so text written before a term was listed never blocks an unrelated edit, and the roll, the deletion, the fold and the owner's scripts are never refused. The match is the chat's, unchanged. The refusal is `22023 'Not allowed'`, as in chat. Cover descriptions, places and areas stay unchecked (the spec's list; Open points).
10. **Refusal words.** App, a name: "That name includes a word Resbite doesn’t allow. Try another." App, a resbite's text or a note: "That includes a word Resbite doesn’t allow. Change it and try again." Web, a name: the same name line.
11. **Optional details (D-9, AS-D8): removed.** Account details held only the four fields, so the screen goes with its Profile row and the suspended screen's Details chip; the dead sign-up details code goes (plan 3's Task 8); `save_registration_details` is dropped in both schemas; the `registration_details` and `registration_details_version` keys are erased from Auth metadata. Old builds' Account details save then shows their existing "Account details could not be saved." line.
12. **Three migrations,** so each can be approved and rolled back alone: C8 `20261117120000`, C7 `20261117121000`, C9 `20261117122000`.

## Review Focus

1. **A new phone account that just ticked is asked again.** Expected: the sign-up tick is recorded for the server's current version before the account's first gate, and the next screen is About you, never the accept screen. Tests: Task 4 (`afterTick`, `flushAttestation` with a server version), Task 5 (browser, sign-up scenario).
2. **The app's `TERMS_VERSION` differs from the published version, or the owner publishes while someone reads the screen.** Expected: no loop. The screen sends the server's version; a stale one is refused with `Terms changed`, the screen says so, re-reads and asks again. Tests: Task 1 (`accept_terms` refuses anything but the current version), Task 5 (unit and browser).
3. **Text written before a word joined the list.** Expected: changing the time of a resbite whose title holds it, re-saving the same meeting details or the same name, all still save; the weekly roll, a deletion and the fold never fail on it. Test: Task 2.
4. **Someone on the web whose name holds a blocked word.** Expected: the page says the name can't be used, not "This invitation is no longer active.", and nothing is stored: no profile, no guest row. Tests: Task 2 (SQL), Task 6 (`rpcError`).
5. **An account with a kept invitation, or a suspended account, meets the Terms gate.** Expected: the invitation survives the accept screen and opens after Continue; a suspended account sees its own screen, never the accept screen. Tests: Task 4 (`accountGate`), Task 5 (browser, kept-invitation scenario).

---

### Task 1: C8 migration: versioned Terms acceptance

**Files:**
- Create: `supabase/migrations/20261117120000_terms_acceptance.sql`, `supabase/rollback/20261117120000_terms_acceptance.rollback.sql`, `supabase/tests/hosted-baseline/20261117120000_terms_acceptance.before.sql`, `supabase/tests/hosted-baseline/20261117120000_terms_acceptance.after.sql`, `supabase/tests/terms-acceptance.sql`, `supabase/ops/publish-terms-version.sql`
- Modify: `supabase/tests/hosted-baseline/tests.txt` (append `terms-acceptance.sql` after `open-beta.sql`), `supabase/README.md:20` (the `account_access_status` line) and `:107` (the `attest_age` line)

**Interfaces:**
- Consumes (hosted bodies, copied byte for byte except the named line):

  | Function | Base (latest in `migrations.txt`) | Named line (exactly one copy in the body) | Becomes |
  |---|---|---|---|
  | `private.account_access_status()` | `20261027120000_phone_accounts.sql:123-146` | ` return jsonb_build_object('account_id',v_uid,'status',v_status);` | ` return jsonb_build_object('account_id',v_uid,'status',v_status,'terms_version',private.terms_version(),'terms_needed',private.terms_needed(v_uid));` |
  | `private.attest_age(text)` | `20261027120000_phone_accounts.sql:324-335` | `  on conflict (user_id) do nothing;` | the same line, then ` perform private.note_terms(v_uid,p_terms_version,'sign_up');` |
  | `private.join_by_link(text,text,text)` | `20261116120000_open_beta.sql:52-98` | ` perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text,47));` | the same line, then ` perform private.note_terms(v_uid,p_terms_version,'invitation');` |
  | `private.request_to_join(text,text,text,text)` | `20261116120000_open_beta.sql:102-146` | the same lock line | the same two lines |
  | `private.answer_phone_invitation(text,text,text,text)` | `20261111130000_circles_of_trust.sql:461-540` | the same lock line | the same two lines |
  | `private.fold_web_account(uuid,uuid)` | `20261111160000_chat_safety.sql:1323-1444` | ` delete from private.age_attestations where user_id=p_from;` | the same line, then ` insert into private.terms_acceptances(user_id,terms_version,accepted_at,how) select p_into,terms_version,accepted_at,how from private.terms_acceptances where user_id=p_from on conflict do nothing;` and ` delete from private.terms_acceptances where user_id=p_from;` |

- Produces (Task 4 and the rollout rely on these names):
  - table `private.terms_versions(version text primary key check (version ~ '^[0-9]{4}-[0-9]{2}$'), published_at timestamptz not null default now())`; the migration inserts no row.
  - table `private.terms_acceptances(user_id uuid not null references auth.users(id) on delete cascade, terms_version text not null check (terms_version ~ '^[0-9]{4}-[0-9]{2}$'), accepted_at timestamptz not null default now(), how text not null check (how in ('sign_up','terms_screen','invitation','legacy')), primary key (user_id, terms_version))`; backfilled from `private.age_attestations` as `(user_id, terms_version, confirmed_at, 'legacy')`.
  - `private.terms_version() returns text`, stable definer: the greatest `version` whose `published_at <= now()`; null when none.
  - `private.terms_needed(p_user uuid) returns boolean`, stable definer: `terms_version()` is not null and `p_user` has no row for it.
  - `private.note_terms(p_user uuid, p_version text, p_how text) returns void`, definer: inserts `(p_user, p_version, p_how)` on conflict nothing, only when `p_user` is not null and `p_version ~ '^[0-9]{4}-[0-9]{2}$'`; otherwise nothing.
  - `private.accept_terms(p_terms_version text) returns void` and `public.accept_terms(p_terms_version text) returns void` (invoker wrapper), executable by `authenticated` only. Refuses `42501 'Sign-in required'` without an Auth user; refuses `22023 'Terms changed'` when `p_terms_version` is null or not `private.terms_version()`; takes the caller's lock (`hashtextextended(uid,47)`); inserts `age_attestations(uid, p_terms_version)` on conflict `(user_id)` nothing; `note_terms(uid, p_terms_version, 'terms_screen')`.
  - `account_access_status()` returns exactly the keys `account_id`, `status`, `terms_version` (text or null), `terms_needed` (boolean), for every status.
  - `supabase/ops/publish-terms-version.sql`: OWNER-RUN, NOT A MIGRATION, one statement in the shape of `supabase/ops/close-report.sql` (a header, then `with input(version) as (values ('2026-12'))`, the one literal to edit, set by Decision 5). It inserts the version only when it is greater than every published one, and prints one row: `published` (1 or 0), `current_version` (the inserted version, else `private.terms_version()`) and `accounts_to_ask` (confirmed, non-anonymous Auth users with no acceptance of `current_version`): numbers only. Run again, it prints `published` 0 and changes nothing. A literal that isn't `YYYY-MM` fails on the table's check.

- [ ] **Step 1: Write the failing SQL test `supabase/tests/terms-acceptance.sql`** (one `begin; … rollback;`; helpers `pg_temp.ac(p)` for ids and `pg_temp.ac_as(uid)` setting `request.jwt.claims`, as `supabase/tests/chat-safety.sql:25-37` does). Cast: 01 host, phone-confirmed, profile "Host", attestation `2026-10`, owner of a future plan (as `supabase/tests/open-beta.sql:26-27`); 02 phone-confirmed, nothing else; 03 email-confirmed (an Apple or Google account), no attestation; 04 phone-confirmed, invited by number to 01's plan (fixture as `supabase/tests/contact-invitations.sql:235-239`, code `repeat('A',22)`); 05 a web account (attestation, a `2026-12` acceptance with `how 'invitation'`, no app session, owns nothing); 06 an app account with no acceptance; 07 suspended (a revoked grant, as `supabase/tests/open-beta.sql:24`); 10 and 11 phone-confirmed, no profile; one open link on 01's plan (`repeat('B',22)`, as `open-beta.sql:28`). Assertions:

```sql
-- Nothing published: account_access_status() as 01 has exactly the keys account_id,status,terms_needed,terms_version;
--   terms_version null, terms_needed false. private.terms_version() is null.
-- publish-terms-version.sql, read with \set ac_script `cat :'resbite_repo'/supabase/ops/publish-terms-version.sql`
--   and run through a helper like chat-safety.sql:846-852: one row in terms_versions, '2026-12'; it prints published 1,
--   current_version '2026-12', and accounts_to_ask equal to a count by the same rule computed in the test, a count that
--   includes 01 and leaves out 05 (it has a 2026-12 row). Run again: published 0, still one row. With the literal
--   changed to 'YYYY-MM' by sed (as chat-safety.sql:1165 edits close-report.sql): check_violation, still one row.
-- Status as 01: terms_version '2026-12', terms_needed true. As 07 (suspended): status access_pending, terms_needed true.
-- Grace (Decision 3): private.user_eligible(01) is true while terms_needed(01) is true.
-- accept_terms as 01 with '2026-11', and with null: 22023 'Terms changed', no row.
-- accept_terms as 01 with '2026-12': one row (01,'2026-12','terms_screen'); age_attestations for 01 still '2026-10';
--   terms_needed false. Again: no error, still one row.
-- accept_terms as 03 with '2026-12': age_attestations row '2026-12' and a 'terms_screen' row.
-- attest_age as 02 with '2026-12': age_attestations '2026-12' and a 'sign_up' row; again: one row each.
--   attest_age as 02 with '1.0': 22023 'Age confirmation required' (unchanged).
-- request_to_join as 10 (repeat('B',22), 'Cal', 'accepted', '2026-12'): a profile 'Cal', an attestation and an
--   'invitation' row. As 10 again with p_terms_version null: no error, no new row.
-- answer_phone_invitation as 04 (repeat('A',22), 'Dee', 'accepted', '2026-12'): an 'invitation' row.
-- join_by_link as 11 (repeat('B',22), 'Eve', '2026-12'): an 'invitation' row.
-- A refused call records nothing: request_to_join as 11 with an unknown code and '2027-01' raises 42501
--   'Invitation unavailable' (caught in a subtransaction), and 11 has no '2027-01' row.
-- A version published for tomorrow (insert published_at now()+interval '1 day'): terms_version() still '2026-12'.
-- fold_web_account(05, 06): 06 has (2026-12, 'invitation', 05's accepted_at); 05 has no row. In a savepoint, with 06
--   given a ('2026-12','terms_screen') row first, the fold leaves 06's row reading 'terms_screen'.
-- Deleting 02's auth.users row deletes its terms rows.
-- Grants: public.accept_terms(text) and private.accept_terms(text) executable by authenticated, not anon or
--   service_role; terms_version(), terms_needed(uuid), note_terms(uuid,text,text) by no API role; neither table has a
--   grant for anon, authenticated or service_role, and both have RLS on.
```

- [ ] **Step 2: Run** `scripts/test-database-docker.sh` → FAIL at the first assertion (`account_access_status` has no `terms_version` key).
- [ ] **Step 3: Implement the migration, the publish script and the README lines.** Header comment in the style of `20261116120000_open_beta.sql:1-12`: what changes, the bases, the rollback path, the grace path. Order: tables, backfill, helpers, `accept_terms`, then the six redefinitions with `create or replace`. README line 20 lists the four keys; line 107 says `attest_age` also records the version.
- [ ] **Step 4: Write the rehearsal and the rollback.**
  - `before.sql`: capture the six bodies and `proacl` in `private.ba_rehearsal_functions` (as `20261116120000_open_beta.before.sql:4-11`); assert neither table exists and `accept_terms` doesn't; insert fixtures ba…01 (attestation `2026-10`) and ba…02 (attestation `2026-11`).
  - `after.sql`: each body is the captured one with exactly its named replacement, grant unchanged (the `ob_edits` loop of `20261116120000_open_beta.after.sql:1-40`); the backfill made two `legacy` rows with `accepted_at = confirmed_at`; `terms_versions` is empty; new objects and grants as in Step 1; inside `begin; \ir ../../rollback/20261117120000_terms_acceptance.rollback.sql … rollback;` every body and grant is restored and neither table nor any new function remains; then delete the fixtures and drop the capture table.
  - Rollback: a guard refuses (`42501`) unless every one of the six bodies is this migration's (`account_access_status` contains `terms_needed`, `fold_web_account` contains `private.terms_acceptances`, the other four contain `private.note_terms(`), with the message "run the rollbacks of every later migration first"; then the six base bodies byte for byte (`create or replace`); then drop `public.accept_terms`, `private.accept_terms`, `private.note_terms`, `private.terms_needed`, `private.terms_version`, `private.terms_acceptances`, `private.terms_versions`. Header: it loses every per-version record and published version; `age_attestations` is untouched; roll back in reverse order only (C9, C7, then this), and before `20261116120000_open_beta.rollback.sql`, whose guard would not notice this migration's lines.
- [ ] **Step 5: Run both modes** → PASS.
  - `scripts/test-database-docker.sh` → the last line reads `PASS: disposable SQL assertions (full); synthetic roster empty. …`, and `PASS: terms-acceptance.sql` appears.
  - `scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261117120000_terms_acceptance.sql` → `PASS: 20261117120000_terms_acceptance applies on the hosted baseline`, then `PASS: <name> (hosted baseline)` for every file in `tests.txt` (25 today; more if another readiness plan has added its own).
  - Record `sha256sum` of the migration, the rollback and `publish-terms-version.sql`.
- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261117120000_terms_acceptance.sql supabase/rollback/20261117120000_terms_acceptance.rollback.sql supabase/tests/hosted-baseline/20261117120000_terms_acceptance.before.sql supabase/tests/hosted-baseline/20261117120000_terms_acceptance.after.sql supabase/tests/terms-acceptance.sql supabase/tests/hosted-baseline/tests.txt supabase/ops/publish-terms-version.sql supabase/README.md
git commit -m "Terms acceptance: a record per version, the status reports it, and accept_terms"
```

### Task 2: C7 migration: report reasons and the wider blocked-terms filter

**Files:**
- Create: `supabase/migrations/20261117121000_safety_extension.sql`, `supabase/rollback/20261117121000_safety_extension.rollback.sql`, `supabase/tests/hosted-baseline/20261117121000_safety_extension.before.sql`, `supabase/tests/hosted-baseline/20261117121000_safety_extension.after.sql`, `supabase/tests/safety-extension.sql`
- Modify: `supabase/ops/open-reports.sql` (header line 10 lists the seven values; the `order by` at line 53), `supabase/tests/hosted-baseline/tests.txt` (append `safety-extension.sql`), `supabase/README.md` (one line under the chat safety contract: the reasons and the filter's surfaces)

**Interfaces:**
- Consumes (hosted bodies, `20261111160000_chat_safety.sql`):

  | Function | Base | Named line | Becomes |
  |---|---|---|---|
  | `private.report_message(bigint,text,text)` | `:1112-1149` | ` if p_reason is null or p_reason not in ('harassment','spam','inappropriate','other')` | ` if p_reason is null or p_reason not in ('illegal','child_safety','intimate_image','harassment','spam','inappropriate','other')` |
  | `private.report_user(uuid,uuid,text,text)` | `:1172-1225` | the same line | the same replacement |

  - the constraint `reports_reason_check` on `private.reports` (`:771`);
  - the blocked-terms match of `private.send_message` (`:999-1001`): copy the `~*` expression from `:1000` byte for byte (its `\uXXXX` escapes stay escapes), with `v_body` renamed `p_text`. Never retype it.
- Produces:
  - `reports_reason_check` admits exactly `illegal, child_safety, intimate_image, harassment, spam, inappropriate, other`.
  - `private.holds_blocked_term(p_text text) returns boolean`, stable definer, no API grant: true when `p_text` is not empty, is at most 16,000 bytes (`octet_length`) and matches a listed term by the pattern above.
  - trigger functions `private.refuse_blocked_plan_words()`, `private.refuse_blocked_meeting_words()`, `private.refuse_blocked_name()`, definer, no API grant. Each returns `new` at once when `auth.uid()` is null. On `INSERT` it checks every watched column; on `UPDATE` only the columns whose value changed (separate branches on `tg_op`, never reading `old` on an insert). On `INSERT` into `plan_meeting_details` or `profiles` it skips a value equal to the stored row's (an upsert repeating it). A match raises `22023 'Not allowed'`.
  - triggers `plans_refuse_blocked_words` (`before insert or update of title, description, guest_note on public.plans`), `plan_meeting_details_refuse_blocked_words` (`before insert or update of note on public.plan_meeting_details`), `profiles_refuse_blocked_words` (`before insert or update of display_name on public.profiles`), each `for each row`. By name, the plans trigger runs after `plans_redact_deleting_owner`.
  - `open-reports.sql` keeps its ten columns; its `report` rows sort by `case r.reason when 'child_safety' then 0 when 'intimate_image' then 1 when 'illegal' then 2 else 3 end`, then `created_at`, `id`.

- [ ] **Step 1: Write the failing SQL test `supabase/tests/safety-extension.sql`.** Cast: 01 host (profile "Host"), 02 Going guest ("Guest"), 03 a profile named "Zzold Sam", 05 phone-confirmed with no profile; 01's one-off plan "Picnic" with meeting details "Gate B", and 01's plan "Board zzold night" with meeting details "Meet at zzold gate"; a message by 02 in the Picnic chat (inserted by hand, as `chat-safety.sql` does); an open link on Picnic (`repeat('C',22)`). Then the terms `zzbadword`, `zz bad` and `zzold` are inserted into `private.blocked_terms`.

```sql
-- Reasons: as 01, report_message on 02's message with 'intimate_image': a row with that reason. report_user about 02
--   on the Picnic series with 'child_safety', then (after closing that one by hand) 'illegal': rows with those reasons.
--   report_message with 'rude': 23514 'Invalid report' (unchanged). A direct insert with reason 'rude':
--   check_violation; with each of the seven: allowed (in a savepoint).
-- Plans, as 01: create_plan_v4 with title 'zzbadword picnic': 22023 'Not allowed', no plan row. With description
--   'Bring ZZBADWORD': the same. With title 'zzbadwords night': created (whole words only).
--   change_plan_v4 on Picnic with description 'a zz' || E'\n' || 'bad b': 'Not allowed', version unchanged.
--   change_plan_v4 on Picnic with meeting details 'zzbadword at the gate': 'Not allowed'; the details still 'Gate B'.
--   set_guest_note on Picnic with 'zzbadword': 'Not allowed'; guest_note still ''.
-- Profiles: save_profile as 02 with 'Zzbadword': 'Not allowed'; display_name still 'Guest'.
--   request_to_join as 05 (repeat('C',22), 'zzbadword', 'accepted', '2026-12'): 'Not allowed'; 05 has no profile, no
--   guest row and no join request.
-- Written before the term was listed (Review Focus 3): change_plan_v4 as 01 on "Board zzold night" moving only the
--   start, with the same title and the same meeting details: saved, version + 1. save_profile as 03 with 'Zzold Sam':
--   saved.
-- System writes: with request.jwt.claims cleared, as postgres, update Picnic's title to 'zzbadword' and insert a
--   profile 'zzbadword' for 05: both succeed (no person's write). Undo in a savepoint.
-- holds_blocked_term(repeat('zzbadword ', 2000)) is false (over 16,000 bytes); holds_blocked_term('') and (null) false.
-- open-reports.sql (run through read-only helpers like chat-safety.sql:846-865): add four open reports by hand,
--   created an hour apart, oldest first: harassment, illegal, child_safety, intimate_image. Its report rows list every
--   open child_safety report, then intimate_image, then illegal, then the rest, each group oldest first (compared with
--   the same order computed from private.reports), and its columns are still
--   item,id,created_at,reason,details,frozen_body,reporter_name,target_name,resbite_title,resbite_date.
-- Grants: holds_blocked_term and the three trigger functions executable by no API role; the three triggers exist.
```

- [ ] **Step 2: Run** `scripts/test-database-docker.sh` → FAIL (the first `intimate_image` report: `23514 'Invalid report'`).
- [ ] **Step 3: Implement** the migration (constraint dropped and added by name, the two redefinitions, the helper, the trigger functions, the triggers), the `open-reports.sql` order and header, and the README line. `chat-safety.sql`'s daily-read assertions (`:1557-1592`) still pass: all their reports are tier 3.
- [ ] **Step 4: Write the rehearsal and the rollback.**
  - `before.sql`: capture the two bodies with `proacl`; assert `pg_get_constraintdef` of `reports_reason_check` names exactly the four old values; assert none of the four new functions or three triggers exists.
  - `after.sql`: the named replacements and grants (as Task 1); the constraint names seven values; the triggers and functions exist with no API grant; the rollback (in `begin … rollback`) restores both bodies, drops the triggers and functions and restores the four-value constraint, validated; a second `begin … rollback` inserts a report with reason `illegal` (reporter null, `about 'user'`), runs the rollback, and finds the constraint `NOT VALID` and the row still there.
  - Rollback: guard (both bodies contain `'intimate_image'`, else refuse as Task 1); drop the three triggers and four functions; restore the two bodies; drop the constraint and add the four-value one, adding it `not valid` (with a `raise notice` of the count) when any report already uses a new reason. Header: the filter falls back to chat only; reports with a new reason are kept and readable.
- [ ] **Step 5: Run both modes** with both candidates (`--hosted-baseline supabase/migrations/20261117120000_terms_acceptance.sql supabase/migrations/20261117121000_safety_extension.sql`) → PASS, every file in `tests.txt` in hosted mode (26 today). Record the two `sha256sum`s and the new one of `open-reports.sql`.
- [ ] **Step 6: Commit** the files above: `"Safety extension: three priority report reasons and the blocked-terms filter on titles, notes, meeting details and names"`

### Task 3: C9 migration: erase the optional details and retire their write path

**Files:**
- Create: `supabase/migrations/20261117122000_optional_details_removal.sql`, `supabase/rollback/20261117122000_optional_details_removal.rollback.sql`, `supabase/tests/hosted-baseline/20261117122000_optional_details_removal.before.sql`, `supabase/tests/hosted-baseline/20261117122000_optional_details_removal.after.sql`, `supabase/tests/optional-details-removal.sql`
- Modify: `supabase/tests/phone-accounts.sql:212-225` at `83d75eb` (delete the `save_registration_details` block and its comment, found by the comment "A phone-confirmed account awaiting access may save its details": plan 1 shifts the lines), `scripts/test-database.sh:34` (delete the line), `supabase/tests/hosted-baseline/tests.txt` (append `optional-details-removal.sql`), `supabase/README.md:21` (replace with one line: retired by `20261117122000`, and the keys erased) and `:104` (drop `save_registration_details` from the list)
- Delete: `supabase/tests/registration-details.sql`, `supabase/tests/local/registration-details-concurrency.sh`

**Interfaces:**
- Consumes: `private.save_registration_details(jsonb,jsonb)` as hosted (`20261027120000_phone_accounts.sql:150-232`) and `public.save_registration_details(jsonb,jsonb)` with its grants (`20260923150902_atomic_registration_details.sql:88-93`), for the rollback.
- Produces: the migration is re-runnable (the test re-runs it):
  - `update auth.users set raw_user_meta_data = raw_user_meta_data - 'registration_details' - 'registration_details_version' where jsonb_typeof(raw_user_meta_data) = 'object' and raw_user_meta_data ?| array['registration_details','registration_details_version'];`
  - `drop function if exists public.save_registration_details(jsonb,jsonb);` then the same for `private`.

- [ ] **Step 1: Write the failing SQL test `supabase/tests/optional-details-removal.sql`.**

```sql
-- begin; fixtures: ae…01 metadata {"display_name":"Keep","full_name":"Keep Me","registration_details":{"birth_date":
--   "2010-01-01","phone":"+447700900123","city":"London","interests":["Outdoors"]},"registration_details_version":1};
--   ae…02 {"registration_details_version":1}; ae…03 '[]'::jsonb; ae…04 null; ae…05 {"display_name":"Other"}.
-- \ir ../migrations/20261117122000_optional_details_removal.sql (a second run is harmless).
-- 01's metadata is exactly {"display_name":"Keep","full_name":"Keep Me"}; 02's is {}; 03 still '[]'; 04 still null;
--   05 unchanged. No auth.users row has either key.
-- to_regprocedure of both save_registration_details signatures is null; calling public.save_registration_details
--   raises 42883 (undefined_function).
-- rollback;
```

- [ ] **Step 2: Run** `scripts/test-database-docker.sh` → FAIL (the `\ir` target does not exist).
- [ ] **Step 3: Implement** the migration (header: what is erased, why (D-9), that nothing restores it, and that old builds' Account details save fails), delete the two test files, the harness line and the `phone-accounts.sql` block, and update the README.
- [ ] **Step 4: Write the rehearsal and the rollback.**
  - `before.sql`: capture both functions' definitions and `proacl`; fixtures bc…01 (both keys plus `display_name`) and bc…02 (`'[]'`).
  - `after.sql`: bc…01 keeps only `display_name`, bc…02 unchanged; both functions gone; the rollback (in `begin … rollback`) recreates both with the captured definitions and grants; then remove fixtures.
  - Rollback: `create function` both bodies as hosted (the private body from `phone_accounts.sql:150-232` written `create function`, the public wrapper from `atomic_registration_details.sql:88-91`), then the revoke and grant of `:92-93`. Header: erased values cannot be restored; the RPC comes back empty.
- [ ] **Step 5: Run both modes** with all three candidates → PASS, every file in `tests.txt` in hosted mode (27 today), and in full mode no `registration-details` line. Record the two `sha256sum`s.
- [ ] **Step 6: Commit:** `"Optional details: erase them from Auth metadata and retire save_registration_details"`

### Task 4: App: the access status, the Terms gate and the sign-up flush

**Files:**
- Modify: `mobile/src/services/accountAccess.ts` (whole file), `mobile/src/services/accountAccess.test.ts`, `mobile/src/domain/accountRoute.ts:1-13`, `mobile/src/domain/accountRoute.test.ts`, `mobile/src/services/phoneAccount.ts:45-61`, `mobile/src/services/phoneAccount.test.ts`, `mobile/src/state/AccountState.tsx:21-37,86-115,145`, `mobile/app/account.tsx:67-75`, `mobile/app/invite.tsx:57-64`

**Interfaces:**
- Consumes: Task 1's status keys `terms_version`, `terms_needed`.
- Produces:
  - `export type AccountAccess = { status: AccountAccessStatus; termsVersion: string | null; termsNeeded: boolean }`.
  - `decodeAccountAccess(value: unknown, accountId: string): AccountAccess`: the status rules as today; `termsVersion` is `terms_version` when it is a string matching `/^\d{4}-\d{2}$/`, else null; `termsNeeded` is `terms_needed === true && termsVersion !== null`. Missing keys (a server without C8) read as no gate.
  - `readAccountAccess(options, adapter?): Promise<AccountAccess>`.
  - `afterTick(access: AccountAccess, recorded: string | null): AccountAccess`: `termsNeeded` false when `recorded` equals `access.termsVersion`; otherwise unchanged.
  - `flushAttestation(user, d = defaultDeps, serverVersion: string | null = null): Promise<string | null>`: records `serverVersion ?? tick.termsVersion`, returns that version on success, null when nothing was recorded (no tick, another account, a failure that keeps the tick).
  - `AccountGate = "add-phone" | "accept-terms" | "about-you" | null`; `accountGate({ status, phoneVerified, termsNeeded, name, profileReady })`: `add-phone` as today; then `accept-terms` when `status === "approved"` and `termsNeeded`; then `about-you` as today.
  - `gateHref: Record<Exclude<AccountGate, null>, "/add-phone" | "/accept-terms" | "/about-you">`.
  - `useAccount()` gains `termsNeeded: boolean` and `termsVersion: string | null` (blank: false, null). `reviewed` becomes `Boolean(user && phoneVerified(user)) && !termsNeeded`, so the signed-in stack stays shut until acceptance.

- [ ] **Step 1: Write the failing tests.**

```ts
// accountAccess.test.ts: existing tests compare `.status` (`readAccountAccess(...)).status`).
test("the Terms keys are read only when well formed; a server without them asks nothing", () => {
  assert.deepEqual(decodeAccountAccess({ account_id: accountId, status: "approved" }, accountId),
    { status: "approved", termsVersion: null, termsNeeded: false });
  assert.deepEqual(decodeAccountAccess({ account_id: accountId, status: "approved", terms_version: "2026-12", terms_needed: true }, accountId),
    { status: "approved", termsVersion: "2026-12", termsNeeded: true });
  assert.equal(decodeAccountAccess({ account_id: accountId, status: "approved", terms_version: "2026-12", terms_needed: "true" }, accountId).termsNeeded, false);
  assert.deepEqual(decodeAccountAccess({ account_id: accountId, status: "approved", terms_version: "1.0", terms_needed: true }, accountId),
    { status: "approved", termsVersion: null, termsNeeded: false });
});
test("a sign-up tick recorded for the current version closes the gate; any other doesn't", () => {
  const needed = { status: "approved" as const, termsVersion: "2026-12", termsNeeded: true };
  assert.equal(afterTick(needed, "2026-12").termsNeeded, false);
  assert.equal(afterTick(needed, "2026-10").termsNeeded, true);
  assert.equal(afterTick(needed, null).termsNeeded, true);
});
// accountRoute.test.ts: `base` gains termsNeeded: false; existing lines unchanged. New lines:
assert.equal(accountGate({ ...base, termsNeeded: true }), "accept-terms");
assert.equal(accountGate({ ...base, termsNeeded: true, profileReady: true, name: "Sam" }), "accept-terms");
assert.equal(accountGate({ ...base, termsNeeded: true, phoneVerified: false }), "add-phone");
assert.equal(accountGate({ ...base, termsNeeded: true, status: "access_pending", name: "Sam" }), null);
assert.equal(accountGate({ ...base, termsNeeded: true, status: "access_pending" }), "about-you");
assert.deepEqual(gateHref, { "add-phone": "/add-phone", "accept-terms": "/accept-terms", "about-you": "/about-you" });
// phoneAccount.test.ts:
test("flush records the server's current version when it knows one, and says what it recorded", async () => {
  clearAttestation();
  rememberAttestation("2026-12", "+447700900834");
  const good = stub(false);
  assert.equal(await flushAttestation(signedUp, good.d, "2027-01"), "2027-01");
  assert.deepEqual(good.calls, ["2027-01"]);
  rememberAttestation("2026-12", "+447700900834");
  assert.equal(await flushAttestation(signedUp, good.d), "2026-12");
  rememberAttestation("2026-12", "+447700900834");
  assert.equal(await flushAttestation(signedUp, stub(true).d, "2027-01"), null);
  assert.equal(await flushAttestation(someoneElse, good.d, "2027-01"), null);
  assert.equal(await flushAttestation(signedUp, good.d), "2026-12"); // still pending after the failure
});
```

- [ ] **Step 2: Run** `cd mobile && npm test` → FAIL (`afterTick` is not exported).
- [ ] **Step 3: Implement.** In `AccountState.refresh`, after the profile read and before `setSnapshot`, for `approved` and `access_pending` await `flushAttestation(user, undefined, access.termsVersion)` and apply `afterTick`; keep `noteAppSession` as it is; drop the later `void flushAttestation(user)` (`:113`). `account.tsx` passes `termsNeeded` and redirects to `gateHref[gate]`. `invite.tsx:57-64` passes `termsNeeded: account.termsNeeded`.
- [ ] **Step 4: Run** `cd mobile && npm test` → PASS, and `cd mobile && npm run typecheck` → no errors.
- [ ] **Step 5: Commit:** `"Terms gate: the status's Terms keys, the gate after Add your number, and the sign-up tick flushed first"`

### Task 5: App: the accept screen, the tick wording and the bumped version

**Files:**
- Create: `mobile/app/accept-terms.tsx`, `mobile/src/domain/termsCopy.ts`, `mobile/src/domain/termsCopy.test.ts`, `mobile/src/services/termsAcceptance.ts`, `mobile/src/services/termsAcceptance.test.ts`
- Modify: `mobile/src/domain/guestAccount.ts:4,12-15`, `mobile/src/domain/guestAccount.test.ts:52`, `links/assets/personal-flow.mjs:24-25` (`PAGE_COPY.tick` and `.terms` equal to the new `GUEST_COPY` strings, so `links/personal-flow.test.mjs:161-162` keeps passing), `links/verify-open-link.mjs:39` and `links/verify-personal.mjs:43` (the `tick` they look for), `mobile/app/_layout.tsx:133-140` (`<Stack.Screen name="accept-terms" />` after `add-phone`), `mobile/app/auth/phone.tsx:103` and `mobile/app/invite.tsx:244` (`hint={GUEST_COPY.tickHint}`), `mobile/package.json` (append `node --import tsx src/domain/termsCopy.test.ts && node --import tsx src/services/termsAcceptance.test.ts` to `scripts.test`), `links/server/lib/options.mjs:16` (fallback `"2026-12"`), `links/generate.mjs:106` ("(default 2026-12)"), `links/page.test.mjs:174` (expects `"2026-12"`), the checkbox name `"I’m 18 or over"` in `mobile/scripts/verify-registration.mjs:71`, `verify-auth.mjs:105`, `verify-phone.mjs:187`, `verify-open-link-app.mjs:298`, `review-ui.mjs:1009,1011,1098`, and `mobile/scripts/verify-phone.mjs`, `mobile/scripts/verify-account.mjs` (new scenarios below)

**Interfaces:**
- Consumes: `useAccount().termsVersion`, `refresh()`, `gateHref` (Task 4); `public.accept_terms` (Task 1).
- Produces:
  - `TERMS_VERSION = "2026-12"`. `GUEST_COPY.tick` = "I’m 18 or over and I accept the Terms of Use."; `GUEST_COPY.terms` = "Read the Terms of Use. Our Privacy Policy explains how we use your data."; new `GUEST_COPY.tickHint` = "Confirms you’re 18 or over and accept the Terms of Use."; `ageHelper` unchanged.
  - `TERMS_COPY` in `termsCopy.ts`: `heading` "Please accept our Terms"; `intro` "To use Resbite, confirm that you’re 18 or over and accept our Terms of Use. They include our community rules."; `whatsNew` "This is the first full version of our Terms. It sets out our community rules, how we keep Resbite safe, how to complain or appeal, and what happens when you delete your account."; `continue` "Continue"; `deleteAccount` "Delete my account"; `signOut` "Sign out"; `changed` "Our Terms changed while you were reading. Please read them again."; `failed` "That didn’t go through. Check your connection and try again."
  - `acceptTerms(version: string, d?: { acceptTerms(version: string): Promise<void> }): Promise<void>` (the RPC `accept_terms` with `{ p_terms_version }`, throwing `Error(error.message)`), and `termsErrorMessage(e: unknown): { message: string; changed: boolean }`: `Terms changed` → `{ TERMS_COPY.changed, true }`, anything else `{ TERMS_COPY.failed, false }`.
  - `accept-terms.tsx`: heading (`accessibilityRole="header"`, focused with `useFocusOnChange`), `intro`, `whatsNew`, a `TickRow` (label `GUEST_COPY.tick`, hint `GUEST_COPY.tickHint`, child `TermsLine text={GUEST_COPY.terms}`), `GUEST_COPY.ageHelper` while unticked, `ErrorNote`, a large Continue disabled until ticked (hint `ageHelper` while disabled), then a `TextAction` "Delete my account" (`router.push("/delete-account")`) and a "Sign out" chip, as `about-you.tsx:121-132` lays them out. Continue: `acceptTerms(termsVersion)`, then `await refresh()`, then `router.replace("/account")`. On `changed`: untick, show the line, `await refresh()`. Without a session or with `termsVersion` null it redirects to `/account`.

- [ ] **Step 1: Write the failing tests.**

```ts
// termsCopy.test.ts
test("the screen's and the tick's words", () => {
  assert.equal(TERMS_COPY.heading, "Please accept our Terms");
  assert.equal(TERMS_COPY.deleteAccount, "Delete my account");
  assert.equal(GUEST_COPY.tick, "I’m 18 or over and I accept the Terms of Use.");
  assert.equal(GUEST_COPY.terms, "Read the Terms of Use. Our Privacy Policy explains how we use your data.");
  assert.equal(GUEST_COPY.tickHint, "Confirms you’re 18 or over and accept the Terms of Use.");
  // Each document name appears whole in the line, so TermsLine can link it (B1).
  for (const name of ["Terms of Use", "Privacy Policy"]) assert.ok(GUEST_COPY.terms.includes(name));
});
// termsAcceptance.test.ts
test("accept sends the version; a stale version reads as changed, anything else as failed", async () => {
  const sent: string[] = [];
  await acceptTerms("2026-12", { acceptTerms: async (v) => void sent.push(v) });
  assert.deepEqual(sent, ["2026-12"]);
  assert.deepEqual(termsErrorMessage(Error("Terms changed")), { message: TERMS_COPY.changed, changed: true });
  assert.deepEqual(termsErrorMessage(Error("Failed to fetch")), { message: TERMS_COPY.failed, changed: false });
  assert.deepEqual(termsErrorMessage(null), { message: TERMS_COPY.failed, changed: false });
});
// guestAccount.test.ts:52
assert.equal(TERMS_VERSION, "2026-12");
```

- [ ] **Step 2: Run** `cd mobile && npm test` → FAIL (no `termsCopy.ts`).
- [ ] **Step 3: Implement** the files above. `TermsLine` is used as it stands (B1 owns it).
- [ ] **Step 4: Run** `cd mobile && npm test` → PASS (the links tests included), and `npm run typecheck` → no errors.
- [ ] **Step 5: Browser checks.** In `verify-phone.mjs` the fixture's status reply adds `terms_version: "2026-12"` and `terms_needed: state.termsNeeded` (default false), and stubs `/rest/v1/rpc/accept_terms`. New scenarios, at 320 and 390 px:
  - An account with a verified phone, no name, `termsNeeded` true: `/account` shows the heading "Please accept our Terms"; the checkbox "I’m 18 or over and I accept the Terms of Use." is unticked; Continue is disabled with the hint "Resbite is for people aged 18 and over."; after ticking, Continue sends one `accept_terms` with `{ p_terms_version: "2026-12" }`, the fixture sets `termsNeeded` false, and "About you" shows.
  - `accept_terms` answers `400 {code:"22023",message:"Terms changed"}` once: the line "Our Terms changed while you were reading. Please read them again." shows, the box is unticked, and `account_access_status` was read again; a second Continue succeeds.
  - "Delete my account" opens `/delete-account`; Sign out signs out.
  - Phone sign-up with the tick, the status answering `terms_needed: true` until `attest_age` is called: `attest_age` carries `{ p_terms_version: "2026-12" }`, `accept_terms` is never called, and "About you" shows (Review Focus 1).
  - A suspended account (`access_pending`) with `termsNeeded` true sees "Waiting for access", not the accept screen.

  In `verify-account.mjs`, a kept invitation (`resbite.pending-invite`) on an approved account with a profile and `termsNeeded` true: the accept screen first, no `claim_invite` before Continue; after Continue the invitation "Coffee evening" opens and `claim_invite` was called once (Review Focus 5). Run Expo web (`cd mobile && npx expo start --web --port 8081 --clear`, wait for the "Waiting on" line), then `node scripts/verify-phone.mjs`, `node scripts/verify-account.mjs`, `node scripts/verify-auth.mjs`, `node scripts/verify-open-link-app.mjs`, `node scripts/verify-registration.mjs` → each exits 0. Stop Expo by its own PID. The link pages: `cd mobile && node --import tsx ../links/verify-personal.mjs && node --import tsx ../links/verify-open-link.mjs` → both exit 0.
- [ ] **Step 6: Commit:** `"Terms: the accept screen, the one-tick wording and TERMS_VERSION 2026-12, app and link site"`

### Task 6: App and site: the seven reasons, the review time and the refusal words

**Files:**
- Modify: `mobile/src/domain/safetyCopy.ts:13-18,46-47,52-55,116-118`, `mobile/src/domain/safetyCopy.test.ts:32-38,69-75,129-135`, `mobile/src/design/ChatRulesSheet.tsx:3,54` (the community rules link, after plan 3's Task 1 has merged), `mobile/src/domain/plans.ts:213` (a branch before the generic `22023`), `mobile/src/domain/plans.test.ts`, `mobile/src/services/guestNote.ts:4,34-37`, `mobile/src/services/guestNote.test.ts`, `mobile/src/services/profile.ts:55-64`, `mobile/scripts/verify-chat.mjs:2193` (and a 320 px check), `mobile/scripts/verify-profile.mjs:74-77` (a refusal scenario), `links/assets/personal-flow.mjs:19-81,85-88,338-346`, `links/personal-flow.test.mjs:318-325`

**Interfaces:**
- Consumes: Task 2's values and `22023 'Not allowed'`.
- Produces:
  - `SAFETY_COPY.reasons` = `{ illegal: "Illegal or dangerous", child_safety: "Child safety", intimate_image: "Intimate image shared without consent", harassment: "Harassment", spam: "Spam", inappropriate: "Not appropriate", other: "Something else" }` in this key order (the radios follow it, `ReportSheet.tsx:22`).
  - `SAFETY_COPY.reviewTime` = "We review reports every day."; `thanksLines(address)` = `[thanks, reviewTime]`, plus the contact line when there is an address.
  - `SAFETY_COPY.nameNotAllowed` = "That name includes a word Resbite doesn’t allow. Try another."; `SAFETY_COPY.textNotAllowed` = "That includes a word Resbite doesn’t allow. Change it and try again."; `wordsRefused(e: unknown): boolean`, true for an object with `code` "22023" and `message` "Not allowed".
  - `writePlan` throws `PlanSaveError(SAFETY_COPY.textNotAllowed)` (not uncertain) for `wordsRefused`; the guest-note writer throws `Error(SAFETY_COPY.textNotAllowed)` for it; `saveProfile` throws `Error(SAFETY_COPY.nameNotAllowed)` for it.
  - Site: `PAGE_COPY.nameNotAllowed` = "That name includes a word Resbite doesn’t allow. Try another."; `"nameNotAllowed"` in `ERROR_KEYS`; `rpcError` returns it for `22023` with message exactly "Not allowed", checked before the `unavailable` fallback.
  - **The community rules link** (`docs/legal/community-rules-short.md` section 1, "If the owner keeps the current text", and section 5): `SAFETY_COPY.rulesLink` = "Read the full community rules". `ChatRulesSheet` renders, right after `<Copy>{SAFETY_COPY.rules}</Copy>`, plan 3's `<ExternalLink title={SAFETY_COPY.rulesLink} url={LEGAL_URLS.communityRules} />` (`mobile/src/design/LegalLinks.tsx`, `mobile/src/domain/legal.ts`), which opens `https://link.resbite.com/terms#community-rules` outside the app. `SAFETY_COPY.rules` and `private.chat_rules_version()` stay as they are (`2026-11`), so the Terms' quote (section 9.2) stays true and nobody is asked again; adopting the document's recommended new text is the owner's choice (Open points).

- [ ] **Step 1: Write the failing tests.**

```ts
// safetyCopy.test.ts (replacing :32-34 and :129-131)
assert.deepEqual(Object.keys(S.reasons), ["illegal", "child_safety", "intimate_image", "harassment", "spam", "inappropriate", "other"]);
assert.equal(S.reasons.intimate_image, "Intimate image shared without consent");
assert.deepEqual(thanksLines(null), ["Thanks. The Resbite team will look at it.", "We review reports every day."]);
assert.equal(thanksLines("help@x.example").length, 3);
assert.equal(wordsRefused({ code: "22023", message: "Not allowed" }), true);
assert.equal(wordsRefused({ code: "22023", message: "Chat closed" }), false);
assert.equal(wordsRefused(null), false);
// the chat rules (:69-75 keeps S.rules exactly as today) and their link; readFileSync from node:fs
assert.equal(S.rulesLink, "Read the full community rules");
const sheet = readFileSync(new URL("../design/ChatRulesSheet.tsx", import.meta.url), "utf8");
assert.ok(sheet.includes("SAFETY_COPY.rulesLink") && sheet.includes("LEGAL_URLS.communityRules") && sheet.includes("<ExternalLink"));
// plans.test.ts (gateway, plan and details are the file's own fixtures, :47 and :263)
test("a blocked word is said as such and the save is certain", async () => {
  const write: PlanWrite = { id: plan.id, activityId: null, details };
  const g = gateway({ create: async () => { throw { code: "22023", message: "Not allowed" }; } });
  await assert.rejects(writePlan(g, write), (e: unknown) =>
    e instanceof PlanSaveError && e.message === "That includes a word Resbite doesn’t allow. Change it and try again." && !e.uncertain);
});
// guestNote.test.ts
test("a blocked word in the note is said as such, not as an ended resbite", async () => {
  const write = createGuestNoteWriter(async () => ({ data: null, error: { code: "22023", message: "Not allowed" } }));
  await assert.rejects(write("p", "zz"), /includes a word Resbite doesn’t allow/);
});
// links/personal-flow.test.mjs
assert.equal(rpcError(400, { code: "22023", message: "Not allowed" }), "nameNotAllowed");
assert.equal(errorText("nameNotAllowed", "Ana"), "That name includes a word Resbite doesn’t allow. Try another.");
```

- [ ] **Step 2: Run** `cd mobile && npm test` → FAIL (the reasons' keys).
- [ ] **Step 3: Implement.** `ReportSheet.tsx` needs no change: its radios and thanks come from `SAFETY_COPY`.
- [ ] **Step 4: Run** `cd mobile && npm test` → PASS; `npm run typecheck` → no errors.
- [ ] **Step 5: Browser checks.** In `verify-chat.mjs`, where the rules sheet opens before a first message, the link "Read the full community rules" is visible, at least 44 px tall, and a click records `https://link.resbite.com/terms#community-rules` through the `window.open` recorder plan 3's `verify-legal.mjs` uses (react-native-web's `Linking.openURL` calls `window.open`). `verify-chat.mjs:2193` expects the seven labels in order; at 320 px with the page zoomed to 200 % (as the script's other Larger Text checks do), the "Intimate image shared without consent" radio's text is wholly inside the sheet's width and Send report scrolls into view and is clickable; the thanks shows "We review reports every day." under the first line. `verify-profile.mjs`: `save_profile` answering `400 {code:"22023",message:"Not allowed"}` shows "That name includes a word Resbite doesn’t allow. Try another." and keeps the typed name. With Expo web running as in Task 5: `node scripts/verify-chat.mjs`, `node scripts/verify-profile.mjs`, `node scripts/verify-connections.mjs`, `node scripts/verify-event.mjs` → each exits 0.
- [ ] **Step 6: Commit:** `"Reports: seven reasons, the review time in the thanks, and words for a blocked term, app and link site"`

### Task 7: App: remove the optional details

**Files:**
- Delete: `mobile/app/account-details.tsx`, `mobile/src/design/RegistrationDetails.tsx`, `mobile/src/domain/registration.ts`, `mobile/src/domain/registration.test.ts`
- **Needs plan 3's Task 8** (`2026-11-17-asr-3-app-legal-and-content.md`), which removes the register branch from `useAuthFlow.ts` and `auth/index.tsx` and every import they take from `registration.ts`. Before Step 1, `grep -n "registration\|RegistrationDetails\|setDetails" mobile/src/state/useAuthFlow.ts mobile/app/auth/index.tsx` must print nothing; otherwise stop and ask the controller. This task does not edit those two files.
- Modify: `mobile/src/services/accountDetails.ts` (keep only `accountDetailsAdapter(accessToken)` with `read`; delete `saveAccountDetails`, `update` and the `registration` imports), `mobile/src/services/accountDetails.test.ts` (keep one test, below), `mobile/src/state/useProfile.ts:8,102-110` (the fallback name is `nameFromSession(account.user ?? session?.user ?? null, null) ?? ""`), `mobile/app/(tabs)/profile.tsx:184-192` (delete the row), `mobile/app/account.tsx:5,27-34,172-179` (delete the Details chip and its comment), `mobile/app/_layout.tsx:135` (delete the screen), `mobile/package.json` (remove `node --import tsx src/domain/registration.test.ts && `), `mobile/scripts/verify-account.mjs:94-114,179-248` (delete the RPC stub and the details steps)

**Interfaces:**
- Consumes: Task 3 (the RPC is gone on the server).
- Produces: `accountDetailsAdapter(accessToken: string): { read(signal: AbortSignal): Promise<User> }`, unchanged for `AccountState.tsx:90`. Nothing in `mobile/app` or `mobile/src` mentions `registration_details`, `birth_date`, `save_registration_details` or `RegistrationDetails`.

- [ ] **Step 1: Write the failing check.** Replace `accountDetails.test.ts` with:

```ts
test("the read sends the captured bearer token and refuses a reply without an id", async () => {
  // fetch stubbed: records the Authorization header; first reply { id: "u1" }, second {}.
  assert.equal((await accountDetailsAdapter("tok").read(new AbortController().signal)).id, "u1");
  assert.equal(seen[0], "Bearer tok");
  await assert.rejects(accountDetailsAdapter("tok").read(new AbortController().signal), /could not be verified/);
  assert.equal("update" in accountDetailsAdapter("tok"), false);
});
```

  and add to the end of `mobile/scripts/verify-account.mjs`'s first loop: the Profile tab has no "Account details" row (`expect(page.getByText("Account details", { exact: true })).toHaveCount(0)`), and `requests` never contains `/rest/v1/rpc/save_registration_details`.
- [ ] **Step 2: Run** `cd mobile && npm test` → FAIL (`update` still exists).
- [ ] **Step 3: Implement** the deletions and edits.
- [ ] **Step 4: Verify.** `cd mobile && npm test` → PASS; `npm run typecheck` → no errors; `grep -rn "registration_details\|birth_date\|save_registration_details\|RegistrationDetails\|account-details" mobile/app mobile/src` → no output. With Expo web running: `node scripts/verify-account.mjs`, `node scripts/verify-profile.mjs`, `node scripts/verify-auth.mjs` → each exits 0.
- [ ] **Step 5: Commit:** `"Optional details: remove Account details and the write path from the app"`

### Task 8: Records and the rollout runbook

**Files:**
- Create: `qa/terms-safety-details-2026-11-17/README.md`
- Modify: `knowledge-base/08-decisions.md` (append AS-P4-1 to AS-P4-6 at the end of the AS section; the AS-R series stays the documents' rulings, and every readiness plan names its own calls: PC-n, ASR2-n, AS-P3-n, AS-P4-n, AS-P6-n), `docs/implementation-status.md` (one paragraph after line 3: built on the branch, not live, the three files and hashes, what the owner runs)

**Interfaces:**
- Consumes: the five `sha256sum`s from Tasks 1 to 3 (three migrations, `publish-terms-version.sql`, `open-reports.sql`) and the rollbacks' hashes.
- Produces: the runbook holding the "Rollout (owner-run)" scripts below verbatim, with the real hashes in place of `<sha256 of …>`, and an empty "Applied" section.

- [ ] **Step 1: Write the decisions.** One line each, in the AS section's style, under "*Plan 4 (Terms, safety and details), <date> (assistant's calls; the owner may change them):*": AS-P4-1 the version is published by the owner script (Decision 1); AS-P4-2 the per-version record and `how` (Decision 2); AS-P4-3 the grace path (Decision 3) and the gate's place (Decision 4); AS-P4-4 the tick wording with "Read the Terms of Use." (Decision 6); AS-P4-5 the filter's triggers, people's own changed text only (Decision 9); AS-P4-6 Account details removed whole (Decision 11).
- [ ] **Step 2: Write the runbook** from the section below, then check it: `grep -c "supabase db push" qa/terms-safety-details-2026-11-17/README.md` prints `1` (the one "Never" line); no email, phone number or account id appears (`grep -nE "@|447[0-9]{9}|[0-9a-f]{8}-[0-9a-f]{4}" qa/terms-safety-details-2026-11-17/README.md` → no output).
- [ ] **Step 3: Final run of everything:** `scripts/test-database-docker.sh` → full PASS; the three-candidate hosted-baseline run → PASS for every file in `tests.txt`; `cd mobile && npm run check` → PASS (expect the one known Linux failure in `nativeImports.test.ts` only if it already fails on `app-store-readiness`; compare first).
- [ ] **Step 4: Commit and push:** `"Terms, safety and details: decisions, status and the rollout runbook"`; `git push -u origin HEAD` (the plan's branch, or `app-store-readiness`).

---

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
   supabase db query --linked "do \$\$ begin if exists (select 1 from supabase_migrations.schema_migrations where version > '20261117122000') then raise exception 'A later migration is already applied: timestamps must follow the apply order (roadmap)'; end if; end \$\$;"
   apply() {
     local v="$1" f="supabase/migrations/$1_$2.sql" h="$3"
     echo "$h  $f" | sha256sum -c -
     { echo 'begin;'; cat "$f"; echo; echo 'commit;'; } > "/tmp/asr4/$v.sql"
     supabase db query --linked -f "/tmp/asr4/$v.sql"
     supabase migration repair --status applied "$v" --linked --yes
   }
   apply 20261117120000 terms_acceptance <sha256 of 20261117120000_terms_acceptance.sql>
   apply 20261117121000 safety_extension <sha256 of 20261117121000_safety_extension.sql>
   apply 20261117122000 optional_details_removal <sha256 of 20261117122000_optional_details_removal.sql>
   supabase db query --linked "select count(*) as applied, max(version) as latest from supabase_migrations.schema_migrations"
   ```

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

## Open points

- **Chat rules text.** `docs/legal/community-rules-short.md` section 1 recommends a new chat rules text with `private.chat_rules_version()` bumped in C7. Task 6 builds the part both of the document's options need, the "Read the full community rules" link, and keeps today's text and version, which the Terms (section 9.2) quote. If the owner adopts the new text, add one redefinition of `private.chat_rules_version()` (returning `'2026-12'`, base `20261111160000_chat_safety.sql:836-838`) to C7 before its hash is approved, the new `SAFETY_COPY.rules` string and its test, and the Terms' quote in section 9.2 changes with it (the documents session).
- **The tick's second line** ("Read the Terms of Use. Our Privacy Policy explains how we use your data.") adds "Read the Terms of Use." to `community-rules-short.md` section 2's text (Decision 6). The session editing `docs/legal/` should match the document to it, or name other words.
- **The link site's tick line** takes the new words in Task 5, but `links/assets/personal.js:107-110` still splits it on "Terms" and "Privacy Policy", so "Terms" alone is linked until the link-site plan's Task 7 (`linkedParts`). The site is not deployed between the two.
- **Cover descriptions, places and areas** are not filtered (the spec's list). The Terms' section 10.2 lists the same five surfaces, so the documents stay true.
- **Old builds and the gate.** Builds before this plan never show the accept screen (Decision 3). If the owner wants the server to refuse accounts that haven't accepted after a date, that is a later migration on `private.user_eligible`, with its effect on hosts' links and the weekly roll weighed first.
- **`TERMS_VERSION` value.** `2026-12` is the proposed default (Decision 5); the owner's final value goes into three places in one commit before the build.
