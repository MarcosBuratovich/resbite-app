# App Store readiness: the roadmap for plans 1 to 6

**What this is.** The order in which the six App Store readiness plans are built, merged and rolled out, what each needs first, which can run at the same time, the hosted sittings with what each needs approved, the owner's work outside the repository, and the critical path to the first submission. It comes from the cross-plan review of 17 November 2026, which also fixed the conflicts listed at the end in the plans themselves.

**Sources.** The gap analysis `docs/superpowers/specs/2026-11-17-app-store-readiness-design.md` (sections 2, 4, 5 and 6); the owner's answers and rulings in `knowledge-base/08-decisions.md`, section "App Store readiness (AS), 17 November 2026" (AS-D1 to AS-D8, AS-R1 to AS-R9), which win where they differ; the release runbook `qa/app-store-release/README.md` (steps 11 to 30); the documents in `docs/legal/` and `docs/compliance/`.

**Status on 17 November 2026.** Nothing in the plans is built or applied. The plans, this roadmap and the documents updated to rulings AS-D1 to AS-R9 are committed on `app-store-readiness`, so the precondition "the documents are committed" (hard dependency 8) is met.

## House rules every plan carries

- Every hosted Supabase, Vercel, EAS, TestFlight or App Store Connect step is owner-run, with the owner's explicit approval at the time. Migrations and owner scripts are approved by file name and sha256.
- Never `supabase db push`, never `supabase migration repair --status reverted`, never `supabase db pull`.
- A migration is applied by a hash-guarded owner script: `supabase db query --linked -f` on the file inside `begin;`/`commit;`, then `supabase migration repair --status applied <version> --linked --yes`, with `supabase/ops/hosted-fingerprint.sql` and `hosted-counts.sql` snapshots before and after, recorded in the plan's `qa/<topic>/README.md`. The model is the open beta (`qa/open-beta-2026-11-16/`).
- Every migration copies the hosted body of any function it redefines and changes only named lines, guards local-only objects with `to_regprocedure`/`to_regclass`, and has a rollback, a hosted-baseline rehearsal (`.before.sql`/`.after.sql`) and a SQL test.
- No secrets, real numbers, real people's emails, account ids, blocked terms or moderator emails in the repository. No `mobile/.env.local`. No service-role key in the app.
- Commit and push to the branches freely. Merging to `main` is the owner's choice.

---

## 1. The plans

| # | Plan | Covers | Migrations | Branch |
|---|---|---|---|---|
| 1 | `2026-11-17-asr-1-phone-codes.md` | C1, C11, B12, D5, D6, F5, F14; CAPTCHA B16 and D10 (Tasks 7 to 9, blocked on AS-D5) | `20261117100000_phone_test_mode_retired.sql` | `asr-1-phone-codes` |
| 2 | `2026-11-17-asr-2-account-deletion.md` | C2, B3, B6, D8's script, DEL-1 to DEL-8, UGC-15, AS-R1 to AS-R3 | `20261117110000_account_deletion_release.sql` | `asr-2-account-deletion` |
| 3 | `2026-11-17-asr-3-app-legal-and-content.md` | B1, B4, B5, B8, B9, B10, B11 (dead sign-up code), B13, B14, A25 | none | `asr-3-app-legal` |
| 4 | `2026-11-17-asr-4-terms-safety-details.md` | C7, C8, C9, B2, B7, B11 (Account details), AS-R9, the chat rules link | `20261117120000_terms_acceptance.sql`, `20261117121000_safety_extension.sql`, `20261117122000_optional_details_removal.sql` | `asr-4-terms-safety` |
| 5 | `2026-11-17-asr-5-link-site-legal-pages.md` | D1, D2, D3, D4, D7, D9, the contact form | none | `asr-5-link-site-legal` |
| 6 | `2026-11-17-asr-6-retention-and-team-scripts.md` | C3, C4, C6, C13, AS-R4, AS-R6, D-23 | `20261117130000_retention_and_team_tools.sql` | `asr-6-retention` |

Each branch is cut from `app-store-readiness` and merged back into it (not into `main`) in the order of section 4. When only one plan is being built, it may work on `app-store-readiness` directly.

## 2. Who owns what is shared

Where two plans touch the same thing, one owns it and the other consumes it through the named interface. Each plan states the same in its own "Shared" notes or Interfaces.

| Shared thing | Owner | Consumers and the interface |
|---|---|---|
| `private.legal_holds` (indexes `legal_holds_user_idx`, `legal_holds_series_idx`), `private.account_held(uuid)`, `private.suspension_history` | Plan 2 (Task 1; its migration is earlier) | Plan 6 (Task 1): the same DDL word for word, made only where absent, so it finds them in place. Plan 6 makes only `private.series_held(uuid)`. |
| `private.account_deletion_jobs`, `private.operator_account_deletion(uuid)`, `private.guard_photo_write()` with `resbite_photo_write_guard` | Plan 2 | Plan 6: its web-only purge calls `operator_account_deletion`; its Task 5 takes plan 2's `guard_photo_write()` body as its base and adds the retired-path lines. |
| `private.purge_completed_deletion_receipts` and the photo-cleanup fences | Plan 2 (a `to_regclass` branch) | Plan 6 creates `private.profile_photo_cleanup_jobs` on hosted, which turns plan 2's fenced branch on. |
| `cleanup-profile-photos`'s source gate `PHOTO_CLEANUP_RELEASE_APPROVED` | Plan 6 (flipped only at its rollout R5, in an owner-approved commit) | Plan 2's `deletion-release.test.ts` reads that literal and checks the entry is inert only while it is `false`. |
| `private.terms_acceptances`, `private.terms_version()` | Plan 4 (C8) | Plan 6's `export-account.sql` (its Task 8). |
| Plan 4's six redefinitions (`account_access_status`, `attest_age`, `join_by_link`, `request_to_join`, `answer_phone_invitation`, `fold_web_account`), the two report functions and `reports_reason_check` | Plan 4 | No other plan redefines them. Plan 4 copies the hosted bodies; it re-checks before its rehearsal that no earlier AS migration has redefined them. |
| `private.invite_contacts` | Plan 6 (one named edit) | No other plan redefines it. |
| `private.require_tester()`, `private.deletion_pending(uuid)` | Plan 2 | No other plan redefines them. |
| `PhoneCodeDeps` (`exchangeTestCode` out, `captchaToken` in) | Plan 1 | Plan 2's `phoneProofDeps` (Task 7) follows the type as it stands. |
| The dead email sign-up in `useAuthFlow.ts` and `auth/index.tsx` | Plan 3 (Task 8) | Plan 4's Task 7 no longer edits those files and starts after plan 3's Task 8. Plan 1's Task 9 finds the remaining Auth calls by name. |
| `PRIVACY_ADDRESS` | Plan 3 (`mobile/src/domain/legal.ts`) | Plan 2's `deletion.ts` re-exports it (or declares it until plan 3 lands, which turns it into a re-export). |
| `LEGAL_URLS`, `ExternalLink`, `termsRuns`, `TermsLine` | Plan 3 | Plan 4's accept screen uses `TermsLine`; plan 4's chat rules link uses `ExternalLink` and `LEGAL_URLS.communityRules`. |
| `SAFETY_COPY` | Plan 4 | Plan 2 changes only `reportsPrivacy` (AS-R2). Plan 3 shows `reportsPrivacy` and `blocksPrivacy` by reference. |
| `GUEST_COPY`, `TERMS_VERSION`, and on the site `PAGE_COPY.tick`, `.terms`, `nameNotAllowed` and the fallback's value | Plan 4 (Tasks 5 and 6) | Plan 5 consumes them and links the phrases (`linkedParts`). |
| The site's structure: `pageOptions(code, env, mode)`, `TERMS_VERSION_FALLBACK`, `generate.mjs` modes and copy list, the page shells, the footer | Plan 5 | Plan 1's CAPTCHA Tasks 7 and 8 build on them after plan 5 merges. |
| `ios.privacyManifests`, `src/domain/licences.json`, the release check | Plan 3 | Plan 1's Task 9 regenerates the licences and adds the WebView's required reasons. Plan 2's Rollout step 8 sets the deletion flag the release check requires. |
| `delete-account.tsx`, the suspended branch of `account.tsx`, `accountDeletion*.ts`, the taken-number line | Plan 2 | Plan 4 removes only the Details chip from `account.tsx`; plan 3 lists the deletion files as wording-scan exceptions until plan 2 rewrites them. |
| `mobile/app/data-privacy.tsx` | Plan 3 | No other plan edits it. |
| The `auth.identities` and `auth.refresh_tokens` harness stubs (`supabase/tests/local/bootstrap.sql`) | Whichever of plans 1 and 6 lands first, in one shared shape | The other adds nothing. |
| The Vercel variable `TERMS_VERSION` | Plan 5 (R2) | Plan 4's rollout step 5 only checks it. |

**Names that are the same everywhere.** The Terms version: `TERMS_VERSION` in the app (`mobile/src/domain/guestAccount.ts`), `TERMS_VERSION_FALLBACK` and the Vercel variable `TERMS_VERSION` on the site, `private.terms_version()` and the literal in `supabase/ops/publish-terms-version.sql` on the server: one value (`2026-12` unless the owner names another), changed in one commit. The legal URLs: `https://link.resbite.com/privacy`, `/terms`, `/terms#community-rules`, `/support`, `/delete-account`. The legal hold: `private.legal_holds`, `account_held`, `series_held`. The inboxes: support@resbite.com and privacy@resbite.com. Each plan names its own decision records in `knowledge-base/08-decisions.md`: PC-1 to PC-8 (plan 1), ASR2-1 to ASR2-10 (plan 2), AS-P3-n (plan 3), AS-P4-1 to AS-P4-6 (plan 4), AS-P6-1 to AS-P6-13 (plan 6); plan 5's L1 to L11 stay in its plan and record.

**Cron jobs.** `sms-records-sweep` at `17 3 * * *` (plan 1), `cleanup-account` every 5 minutes and `purge-deletion-receipts` at `32 3 * * *` (plan 2), `retention-purge` at `47 3 * * *` and `cleanup-images` every 10 minutes (plan 6), `roll-repeating-plans` (C4, existing script).

## 3. Migration order on hosted

The timestamps follow the order the migrations are applied. Each apply script refuses when a later AS version is already applied.

| Order | File | Sitting | Needs before |
|---|---|---|---|
| 1 | `20261117100000_phone_test_mode_retired.sql` (plan 1) | H3 | H1 done; BR-2026-001 complete; the C11 record shows the HTTPS hook |
| 2 | `20261117110000_account_deletion_release.sql` (plan 2) | H4 | Plan 2 merged; the Apple `.p8` key |
| 3 | `20261117120000_terms_acceptance.sql` (plan 4) | H5 | Plan 4 merged |
| 4 | `20261117121000_safety_extension.sql` (plan 4) | H5 | the one above |
| 5 | `20261117122000_optional_details_removal.sql` (plan 4) | H5 | the one above |
| 6 | `20261117130000_retention_and_team_tools.sql` (plan 6) | H6 | H4 and H5 applied |

- **If BR-2026-001 is still open when H4 is ready,** plan 1 renames its file (with its rollback, rehearsal pair and `tests.txt` line) to a free timestamp after the last applied AS version, before its hash is approved. Nothing else depends on it.
- **Rollbacks run in the reverse order** (6, 5, 4, 3, 2, 1), then the open beta's. Each plan's rollback says so and refuses where the data would be lost.
- **Hosted-baseline runs pass every AS candidate on the branch that is not yet in `migrations.txt`, in timestamp order** (`supabase/README.md`, "Hosted-baseline commands"), because `tests.txt` assumes them applied. Plans 1, 2 and 4 add their tests to `tests.txt` when they are built; plan 6 adds its two at its R3 (its rehearsal runs them through `\ir`). Append to `tests.txt` and `migrations.txt` in timestamp order.

## 4. Build order

### Hard dependencies

1. Plan 3's Task 8 before plan 4's Task 7 (plan 4 deletes `registration.ts`, which the old sign-up imports).
2. Plan 3's Task 1 before plan 4's Task 6 (the chat rules link uses `ExternalLink` and `LEGAL_URLS`).
3. Plan 1's Task 4 and plan 4's Tasks 5 and 6 before plan 5's Tasks 5 to 7 (the same site files; plan 4 owns the words).
4. Plan 2's Tasks 1 to 4 (its migration) before plan 6's Tasks 1 to 5 and 9 (plan 6's rehearsal refuses without it).
5. Plan 4's Task 1 (C8) before plan 6's Task 8 (the export reads `terms_acceptances`).
6. Plan 2's Task 6 (the gate-agnostic `deletion-release.test.ts`) before plan 6's rollout R5 flips the photo worker's gate.
7. Plans 3 and 5 merged, and the CAPTCHA vendor named (AS-D5), before plan 1's Tasks 7 to 9.
8. The documents session has committed `docs/legal/` and `docs/compliance/` before plan 5 starts, and before plans 1 (Task 6), 2 (Task 9) and 6 (Task 12) edit them.

### Waves

| Wave | Built in parallel, each in its own worktree off `app-store-readiness` | Starts when |
|---|---|---|
| 1 | Plan 1, Tasks 1 to 6 · Plan 2, Tasks 1 to 6 · Plan 3, all · Plan 4, Tasks 1 to 3 (SQL only) | Now |
| 1b | Plan 5, Tasks 1 to 4 and 8 · Plan 6, Tasks 10 and 11 | The documents are committed (plan 5); any time (plan 6's app and template tasks) |
| 2 | Plan 2, Tasks 7 to 9 · Plan 4, Tasks 4 to 8 · Plan 6, Tasks 1 to 9 and 12 | Plan 1 merged, so plan 2's Task 7 sees `PhoneCodeDeps` without `exchangeTestCode` (if plan 2 runs first, plan 1's Task 3 also removes the key from plan 2's `phoneProofDeps`); plan 3 merged (plan 4); plan 2's Tasks 1 to 4 merged, and plan 4's Task 1 for plan 6's Task 8 |
| 3 | Plan 5, Tasks 5 to 7 and 9 | Plan 1's Task 4 and plan 4's Tasks 5 and 6 merged |
| 4 | Plan 1, Tasks 7 to 9 (CAPTCHA) | AS-D5 names the vendor; plans 2, 3 and 5 merged |

Keep at most three worktrees with their own `npm install` at a time, and remove each after its merge: per-worktree installs filled the disk on 12 November.

### Merge order into `app-store-readiness`

1. Plan 1, Tasks 1 to 6 (first: sitting H1 needs them).
2. Plan 3.
3. Plan 2.
4. Plan 4.
5. Plan 5.
6. Plan 6.
7. Plan 1, Tasks 7 to 9.

Plans 2 and 3 may swap if plan 2 is ready first. Every other step keeps the hard dependencies above.

**After every merge,** run the whole check on `app-store-readiness`: `bash scripts/test-database-docker.sh`; `bash scripts/test-database-docker.sh --hosted-baseline <every pending AS candidate, in timestamp order>`; `node --import ./mobile/node_modules/tsx/dist/loader.mjs --test supabase/functions/_shared/*.test.ts`; `cd mobile && npm run check` (it runs the link-site tests too); then the browser scripts of the plans just merged (headless, Expo web on port 8081).

**Files several plans change** (expect merge conflicts; keep both sides): `mobile/package.json`'s `test` chain (every plan), `supabase/tests/hosted-baseline/tests.txt`, `supabase/README.md`, `docs/implementation-status.md`, `knowledge-base/08-decisions.md`, `qa/app-store-release/README.md`, `mobile/app/_layout.tsx` (plans 1, 3 and 4), `mobile/src/domain/phoneCopy.ts` (plans 2 and 3, neighbouring lines), `mobile/app/auth/phone.tsx` and `auth/index.tsx` (plans 3 and 4), `mobile/app/account.tsx` (plans 2 and 4), `mobile/scripts/verify-phone.mjs` (plans 1, 3 and 4), `verify-contact-invites.mjs` (plans 1 and 3), `verify-deletion.mjs` (plans 2 and 3), `review-ui.mjs` (plans 3 and 4), `links/assets/personal.js`, `personal-flow.mjs`, `links/verify-personal.mjs` and `verify-open-link.mjs` (plans 1, 4 and 5), `supabase/tests/phone-accounts.sql` (plans 1 and 4), `scripts/test-database.sh` (plans 2 and 4), `supabase/tests/local/bootstrap.sql` (plans 1 and 6).

## 5. Hosted sittings, in order

Each sitting follows its plan's "Rollout (owner-run)" section and its `qa/` runbook, and ticks the release runbook step named. **[approval]** applies to every line.

| # | Sitting | Plan and runbook | What the owner approves | Needs before |
|---|---|---|---|---|
| H0 | **Roll job** (C4, blocker 8) | Plan 6 R8; release step 12 | `supabase/ops/schedule-roll-repeating-plans.sql`, sha256 `3a8202877260008723648dc4723b36aedb6d772f809b2552997765773040d74e` | Nothing: it can run today |
| H1 | **Text-message codes on, test mode off** (C1, D6, D5, F5, F14, C11) | Plan 1 sitting 1, steps 1 to 12; `qa/phone-codes-2026-11-17/`; release step 11 | `send-sms` deploy (three files by sha256); the six function secrets; the Auth Send SMS hook switched to HTTPS; `phone-test-mode-off.sql` by sha256 (only after a real code arrives); Auth and Twilio settings; the link site deployed from plan 1's commit (Vercel preview and production) and the `/i/*` firewall rule; the two Vault secrets and `schedule-sms-records-sweep.sql` by sha256 | Twilio account, DPA, Messaging Service, API key (owner); BR-2026-001 opened; plan 1's Tasks 1, 2, 4 and 5 merged |
| H2 | **Backup moderator** (C5) | Release step 12 | `supabase/ops/moderators.sql` with both emails in the editor's copy only; the backup's dashboard role (Developer) | A24 signed (outside the repo); MFA on the backup's accounts; the backup has a Resbite account |
| H3 | **Retire test mode** | Plan 1 sitting 2, steps 13 and 14 | `20261117100000_phone_test_mode_retired.sql` by name and sha256 | H1; BR-2026-001 complete; the C11 record shows the HTTPS hook |
| H4 | **The deletion release** (C2) | Plan 2 Rollout steps 1 to 7; `qa/account-deletion-2026-11-17/`; release step 13 | `20261117110000_account_deletion_release.sql` by name and sha256; the Apple `.p8` key and the deletion secrets; the gate-flip commit; the three function deploys; the four Vault secrets and `schedule-account-deletion.sql` by sha256 | H3 (timestamp order); plan 2 merged; the Sign in with Apple key created (owner) |
| H5 | **Terms acceptance, safety extension, optional details** (C8, C7, C9) | Plan 4 Rollout steps 1 to 4; `qa/terms-safety-details-2026-11-17/`; release step 14 | The three migrations by name and sha256 | H4; plan 4 merged; TestFlight testers told that Account details stops saving on old builds |
| H6 | **Retention and team tools** (C3, C6) | Plan 6 R1 to R7; `qa/retention-and-team-tools-2026-11-17/`; release step 14 | `20261117130000_retention_and_team_tools.sql` by name and sha256; the dry run; the photo-worker gate-flip commit, its deploy, secrets and Vault entries; the disposable-account acceptance; `schedule-retention.sql` by sha256 | H4 and H5; plan 6 merged |
| H7 | **The legal pages published** (D1 to D4, D7, D9) | Plan 5 R0 to R10; `qa/link-site-legal-2026-11-17/`; release step 16 | The Resend key; the Vercel variables (`RESEND_API_KEY`, `TERMS_URL`, `PRIVACY_URL`, `TERMS_VERSION`); preview, then production with `--legal=final`; the `/api/contact` firewall rule | The solicitor's review done and every `[[OWNER:` placeholder filled (R0); the inboxes live; H1 (real codes) and H6 (the 30-day number purge and the do-not-invite list the notice promises); plans 4 and 5 merged; the final `TERMS_VERSION` |
| H8 | **Auth email templates** (C13) and the Auth settings re-read (C11) | Plan 6 R9; release step 15 | Each template pasted in the dashboard | H7 (`/privacy` live). Step 15 of the release runbook therefore runs after step 16 |
| H9 | **EAS production variables** | Plan 3 R1, plan 2 step 8; release step 19 | `EXPO_PUBLIC_SUPPORT_ADDRESS`, `EXPO_PUBLIC_PUSH_ENABLED=true`, `EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED=true`, `EXPO_PUBLIC_CAPTCHA_URL` only if CAPTCHA ships; `EXPO_PUBLIC_TERMS_URL` and `EXPO_PUBLIC_PRIVACY_URL` left unset; the APNs key confirmed | The support inbox (F1); H4 |
| H10 | **The submission build**, version 1.0.0 | Plan 3 R3, plan 2 step 9, plan 4 step 6; release step 20 | The EAS production build and TestFlight upload; the build log shows `PASS release check` | All app plans merged (1's Task 3, 2, 3, 4, 6's Task 10; 1's Task 9 if CAPTCHA ships); H9 |
| H11 | **Publish the Terms version** | Plan 4 step 7 | `supabase/ops/publish-terms-version.sql` by sha256 | H7 (`/terms` live) and H10 (the build on TestFlight) |
| H12 | **CAPTCHA on** (D10, OPS-9) | Plan 1 sitting 3, steps 15 and 16; release step 21 | Vercel `CAPTCHA_VENDOR` and `CAPTCHA_SITE_KEY` and a deploy; Supabase Auth CAPTCHA with its secret | Only if AS-D5 names the vendor: plan 1's Tasks 7 to 9 shipped in H10, testers updated |
| H13 | **Device checks and the deletion test** (F12) | Plan 2 step 10, plan 3 R4 and R5, plan 4 step 6, plan 6 R6 if not done; release step 22 | Disposable accounts only | H10, H11 (and H12 if it runs) |
| H14 | **App Store Connect and submission** (E1 to E12) | Plan 3 R6; release steps 23 to 25 | Review accounts; the pack entered (App Privacy, age rating 18+, review notes, screenshots, copy, URLs, trader status); Manual release chosen; Submit | H1 (review accounts need real codes), H2 (the review notes' 24-hour promise), H7, H13 |
| H15 | **After approval** | Release steps 26 to 28 | The go-live checklist, then Release; `APP_STORE_URL` and `APP_STORE_ID` on Vercel and a redeploy; alerts and the restore rehearsal | Apple's approval |

Plan 6's R10 (first objection) and R11 (`private.phone_rewrites`, after the C12 decision) run when their case arises.

## 6. The owner's work outside the repository

Start the long ones now; most take days or weeks and none needs the code.

| Task | Needed by | Notes |
|---|---|---|
| **Apple Developer membership as an organisation** for Resbite Ltd (D-U-N-S number), and the app in that account (F9) | H14; likely the longest lead | AS-D1 makes Resbite Ltd the seller |
| **Solicitor's review** of the public documents (AS-D7), with the Art 10 condition (D-22, and A23 if it needs one), the contact means (D-5) and the open questions in `docs/legal/README.md` | H7 | Then fill every `[[OWNER:` placeholder and commit the final documents |
| **Twilio**: account in Resbite Ltd's name, DPA accepted, Messaging Service with the sender "Resbite", Geo Permissions, a usage trigger at the budget, an API key (AS-D5, D-3) | H1 | Recorded in `docs/compliance/vendors.md` |
| **Inboxes** support@resbite.com and privacy@resbite.com on a mailbox provider, watched every working day, with the company particulars in the signature; the provider's DPA (AS-D3, F1) | H7, H9 | The footer, the form and the app name them |
| **Backup moderator** named, A24 signed and kept outside the repo, MFA on (AS-D6) | H2, H14 | The repo records only that a backup is named, and the date |
| **NCA CSEA Industry Reporting Portal**: register Resbite Ltd, owner as Organisation Administrator, add the backup | H14 | `docs/compliance/moderation-standard.md`, placeholder 4; the NCA reviews in working hours only |
| **ICO data protection fee** confirmed or paid (tier 1; F6, D-14) | H14 | |
| **Vendor contracts** (F7): Supabase, Vercel (the plan's DPA), Expo (ask Expo), Resend, Twilio, the CAPTCHA vendor, the mailbox provider, the log tool, Cloudflare's DPA for the DNS account | H7 (the Privacy Policy states them) | Recorded in `docs/compliance/vendors.md` |
| **Vendor accounts in Resbite Ltd's name** (F8): Supabase, Vercel, Expo, Apple, Resend, Twilio, Google Cloud, GitHub, the mailbox, the domain and DNS | H14 | |
| **MFA everywhere** (F16) and the six-monthly access review | H2, H14 | |
| **Sign in with Apple key** (`.p8`) for token revocation | H4 | Plan 2 step 4; never in the repo |
| **Apple's private email relay**: register the sending domain (SI-10, F13) | H14 | So privacy@ can reach relay addresses |
| **Google**: publish the OAuth app with a verified brand (SI-12) | H14 | Recorded in plan 1's C11 record |
| **CAPTCHA vendor** (AS-D5: Turnstile or hCaptcha) | H10 if CAPTCHA ships in 1.0 | If 1.0 ships without it, the documents' bot-check sentences come out before H7 (Privacy Policy 3.11, 5.2 and 9; the OSA assessment) |
| **The Terms version** (default `2026-12`) | Plan 4's Task 5, and H7 | One value in the app, the site and the publish script |
| **Declared Age Range question** to Apple Developer Support or the solicitor (D-16) | H14 | If the UK is a "legally required" region, it becomes 1.0 work |
| **Marketing site check** (F18): no analytics without consent, no 2020 policy, legal links pointing at `/privacy` and `/terms` | H14 | Release step 17 |
| **App Store Connect content**: review contact, screenshots with the QA personas, listing copy, category (E1 to E11) | H14 | The owner approves the copy |
| **The log tool** for request, complaint and breach logs (vendors placeholder 4), and **BR-2026-001** in the breach log | H1 | Logs stay outside the repo |

## 7. The critical path to submission

```
Owner, starting now:  Apple organisation membership ─────────────────────────────────────────────┐
                      Solicitor's review → final documents ──────────────┐                       │
                      Twilio account ─┐   Inboxes ───────────────────────┤                       │
                                      │                                  │                       │
Build:   plan 1 (Tasks 1-6) ─→ H1 ─→ H3                                  │                       │
         plan 2 ───────────────────→ H4 ─→ H5 ─→ H6 ─────────────────────┼─→ H7 ─→ H9 ─→ H10 ─→ H11 ─→ (H12) ─→ H13 ─→ H14 submit
         plan 4 (after plan 3) ──────────↗      ↗                        │
         plan 6 (after plans 2, 4) ────────────↗                         │
         plan 3, plan 5 ─────────────────────────────────────────────────┘
```

In words: **plan 2 → plan 6 → H4 → H5 → H6 → H7 (documents published) → EAS variables → the build → the Terms version published → (CAPTCHA on) → device checks → submit**, with H1 and H3 ahead of H4, plans 3 and 4 merged before the build, and three owner items running alongside that can each hold up the end: the Apple organisation membership, the solicitor's review, and the inboxes. The roll job (H0) and the backup moderator (H2) are short but release-blocking; do them early.

The longest code chain is plan 2 (the largest migration and the Edge rewiring), then plan 6, which needs plan 2's migration and plan 4's C8. Start plan 2 first and keep it moving.

## 8. Fixed by the cross-plan review, and what remains

**Fixed in the plans (17 November 2026).**
1. Migration order: plan 1's retirement is applied before plan 2's release; every apply script refuses a later version already applied; plans 2 and 4 pass every pending AS candidate in hosted-baseline runs (plans 1 and 6 already did).
2. The legal hold and suspension history: plan 2 owns them, plan 6 consumes, with the index names aligned.
3. The photo worker's gate: plan 6 no longer flips it in a build task; it flips at R5 in an owner-approved commit, and plan 2's gate test reads that literal instead of asserting "always off".
4. The dead sign-up code: plan 3 owns it; plan 4's Task 7 waits for plan 3's Task 8 and stops editing `useAuthFlow.ts` and `auth/index.tsx`.
5. The site's tick words and the Terms fallback value: plan 4 owns them; plan 5 consumes them and owns the structure; the Vercel `TERMS_VERSION` is set once (plan 5 R2); the hosting note reads the fallback constant.
6. Plan 1's sitting-1 site deploy comes from plan 1's own commit (or `--legal=off`), so no Terms wording or page goes live before the documents.
7. Plan 1's CAPTCHA tasks build on plan 5's site structure and plan 3's licences, manifest and Data & privacy vendors line, and no longer target the removed `signUp`.
8. The harness's `auth.identities` stub has one shape in plans 1 and 6.
9. `SAFETY_COPY.reportsPrivacy` belongs to plan 2 (AS-R2); plan 3's open point on AS-R2 is closed (the documents already follow it).
10. `PRIVACY_ADDRESS` belongs to plan 3; plan 2 re-exports it. Plan 3's wording-scan exceptions start empty if plan 2 landed first.
11. Plan 3's release check also requires `EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED=true` in a production build (blocker 1).
12. Plan 4's Task 6 adds "Read the full community rules" to the chat rules sheet, which `docs/legal/community-rules-short.md` section 5 needs under either of its options.
13. Plan 1's runbook now says how the team sends the service texts the Privacy Policy and the data-request procedure promise (Twilio's console, by hand).
14. Decision names: plan 4's calls become AS-P4-n (not AS-R10 onwards, which belong to the documents' rulings), plan 6's AS-P6-n.
15. Cron times spread: plan 2's receipt purge moves to `32 3 * * *`.

**Remaining.**
- **Blocked on AS-D5:** CAPTCHA (plan 1's Tasks 7 to 9 and sitting H12). If 1.0 ships without it, the documents' bot-check statements must come out before H7.
- **Owner decisions:** the final Terms version; whether to adopt the recommended new chat rules text (plan 4's open point; the link is built either way); AS-R8 (group chat history) to confirm; the Wellness tab is **removed**, not hidden (ruled 17 November: guideline 2.5.19 forbids dormant features, the effect for people is the same, and git keeps the screen for when real data exists); C12 (the Argentine rewrite, then `private.phone_rewrites`); D-16 (Declared Age Range).
- **Documents:** `docs/legal/community-rules-short.md` section 2's line under the tick now reads as plan 4 builds it ("Read the Terms of Use. Our Privacy Policy explains how we use your data."), done 17 November. The solicitor should confirm plan 6's reading of "until they answer" for invitees' numbers (an answered number stays until 30 days after the resbite, as account data).
- **Not covered by any plan, by design after 1.0:** F10 alerts and the F11 restore rehearsal (release step 28), C10 Apple server notifications, B15 items, the change-number and change-email flows (handled by hand under `data-requests.md` section 9).
- **UNVERIFIED points the rollouts settle:** whether Auth passes the hook's 422 words to the client (plan 1); which Auth endpoints CAPTCHA covers (plan 1); whether a failing `eas-build-post-install` stops the build and whether `tsx` is installed there (plan 3); whether the native libraries' licence texts must be shown in full (plan 3); Apple's privacy-manifest constant spellings (plan 3); the CLI role's rights on `auth.sessions`, `auth.users` and `storage.objects` (plans 1, 4 and 6 check them read-only first).
- **No interim production build** is planned before H4: plan 3's release check refuses one without the deletion flag, on purpose.
