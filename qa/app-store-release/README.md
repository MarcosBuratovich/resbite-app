# App Store release runbook: Resbite 1.0

- **Owner:** the owner.
- **Version:** 1.0 (draft).
- **Date:** 17 November 2026.
- **Next review:** after the 1.0 release; then before every App Store release, and at least every six months (next by 17 May 2027).
- **Purpose:** every step from the hosted sittings to the Manual release of Resbite 1.0, as one checklist (gap analysis F12, section 6 phases 3 to 7).
- **Review:** an operational record for the owner, not a public document. The documents it publishes (A1 to A6) go to a UK solicitor first (decision D-12). Step 16 waits for that review.
- **Gap analysis:** `docs/superpowers/specs/2026-11-17-app-store-readiness-design.md`. Step numbers 11 to 30 are its section 6 numbers. Row ids (SI-1, OPS-1 …) and deliverables (A1, B3, C2 …) are its ids.
- **Companions:** the [App Store Connect pack](app-store-connect-pack.md) and the [review notes](app-store-review-notes.md).

**Nothing in this runbook has been done.** Every step marked **[approval]** needs the owner's explicit approval at the time it is done: the hosted Supabase project and dashboard, Vercel, EAS, TestFlight, App Store Connect and the Apple and Google developer consoles. Everything else is local work or a check.

## Placeholders to fill

| # | Placeholder | Step |
|---|---|---|
| 1 | [[OWNER: Twilio monthly budget and spend alert — proposed: about USD 60 a month at 1,000 codes: Twilio lists UK text messages at USD 0.056 a segment (pricing page, November 2026), plus any carrier fees, and a sender number from USD 1.15 a month if an alphanumeric sender name is not used]] | 11 |
| 2 | [[OWNER: Twilio's region and transfer safeguard, to confirm when Resbite Ltd's account accepts Twilio's Data Protection Addendum — proposed: the United States, Twilio's main processing location, under the UK–US data bridge (Twilio Inc. states it takes part in the UK Extension to the EU–US Data Privacy Framework; check the live listing), with the UK Addendum to the EU Standard Contractual Clauses in Twilio's addendum as the fallback; Twilio's Ireland region (IE1) also offers messaging]] | 11 |
| 3 | [[OWNER: how long Twilio keeps message records — proposed: the Send SMS hook deletes each message record through Twilio's API once its delivery status is final, and Twilio says a deleted message's text can stay in its backups for up to 30 days, so state "up to 31 days after sending"; Twilio's Message Redaction setting is offered only with its Editions packages]] | 11 |
| 4 | [[OWNER: CAPTCHA vendor — proposed: Cloudflare Turnstile or hCaptcha]] | 21 |
| 5 | [[OWNER: the backup moderator's identity — the owner names one backup (decision AS-D6); recorded only in the signed team access agreement kept outside the repo; the repo records only that a backup is named, and the date — proposed: at the Supabase Developer role with MFA, named before the 1.0 submission]] | 12 |
| 6 | [[OWNER: effective date — proposed: the day the pages go live on link.resbite.com, after the solicitor's review and before the version 1.0 submission]] | 16 |
| 7 | [[OWNER: the Terms version string for Terms of Use 1.0 — proposed: the year and month the Terms take effect, in the "YYYY-MM" form the database accepts, for example "2026-12"; it must differ from today's "2026-10"]] | 16, 19 |
| 8 | [[OWNER: VAT number, or delete if not VAT-registered]] | 16 (the site footer check) |

## Before you start

Phases 0 to 2 of the gap analysis are done when every box below is ticked. Do not start step 11 before.

- [ ] **Decisions recorded** in `knowledge-base/08-decisions.md` (A19): public launch, 18+, UK only, the deletion approach (D-4), deletion while suspended (D-19), a host's groups (D-20), Twilio as the SMS provider and test mode off (D-3, AS-D5), retention (D-8), the Terms version (D-11) and the Manual release (D-24).
- [ ] **The Apple question asked** (D-16, ASC-17): is the UK a region where developers must use Declared Age Range? Ask Apple Developer Support or the solicitor. Record the answer before step 25.
- [ ] **Public documents drafted** (A1 to A6, A20, A25) and **reviewed by the solicitor** (D-12, AS-D7). The questions in `docs/legal/README.md`, "Questions for the solicitor", are answered, among them D-5's contact means, D-22's Article 10 condition and UGC-10's commencement.
- [ ] **Internal records drafted** (A8 to A18, A22 to A24). A24 is signed before the backup moderator gets any access.
- [ ] **App changes** B1 to B14 and B16 merged to `main`, with tests passing, including B1's release test that fails without the support address and the URLs.
- [ ] **Site changes** D1 to D3, D7, D9 and D10 merged.
- [ ] **Backend files** C2 (with the rewired entry point and the legal hold), C3 and C6 to C9 written, each with a rollback, and tested on a local replay. The C13 template files are changed. The C1 hook path is written.
- [ ] **The app's Terms version** (`mobile/src/domain/guestAccount.ts`, B2) is bumped to placeholder 7, the same string step 16 sets on Vercel.

## House rules

- **Every hosted step is approved by file name and sha256, at the time.** Apply SQL with `supabase db query --linked -f` inside `begin;` and `commit;`, then `supabase migration repair --status applied <version>`.
- **Never run `supabase db push`.** It would also apply the never-apply files (gap analysis, workstream C).
- **Snapshots around every sitting.** Take them with `supabase/ops/hosted-fingerprint.sql` and `supabase/ops/hosted-counts.sql`, into this folder, before and after. Then read the advisors. Append each applied migration to `supabase/tests/hosted-baseline/migrations.txt`, and keep its rollback in `supabase/rollback/`.
- **Owner-run scripts.** As in the chat runbook, the assistant writes a short script into the home directory. The owner reads it and runs it with `! bash ~/<name>.sh`. The SQL editor's scripts (`supabase/ops/`) are pasted into the hosted SQL editor, with their one literal edited there only.
- **No personal data in this file or the repo.** No names, phone numbers, emails or account ids. Record that a thing was done, its date and its counts. Request, breach and law-enforcement logs live outside the repo.
- **Record every step** under "Applied", with its date.

## Names this runbook uses (never values)

### EAS production environment (`mobile/`, `npx eas env:list --environment production`)

`EXPO_PUBLIC_*` values are fixed into the bundle when it is built. A value set or changed after a build needs a new build.

| Variable | What it must hold for 1.0 | Read at |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | The hosted project's URL | the Supabase client |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The hosted publishable key | the Supabase client |
| `EXPO_PUBLIC_SUPPORT_ADDRESS` | The support inbox (F1): one `@`, a dot after it, no space | `mobile/app/data-privacy.tsx:28`; `mobile/src/design/ReportSheet.tsx:69`; the suspended and taken-number screens (B6) |
| `EXPO_PUBLIC_TERMS_URL` | Optional. Unset, the app uses https://link.resbite.com/terms and /privacy; set only if the pages move (an https link) | `mobile/src/design/TickRow.tsx`; B1's legal links |
| `EXPO_PUBLIC_PRIVACY_URL` | Optional. Unset, the app uses https://link.resbite.com/terms and /privacy; set only if the pages move (an https link) | as above |
| `EXPO_PUBLIC_PUSH_ENABLED` | On (the string `true`) | `mobile/src/services/pushDevice.ts:21` |
| `EXPO_PUBLIC_INVITATION_ORIGIN` | The link site's origin | `mobile/app/+native-intent.tsx:9` |
| `EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED` | On (the string `true`), only once C2 is live (step 13) | `mobile/src/services/accountDeletion.ts:11-12` |
| The CAPTCHA site key | The vendor's public site key. Its variable name is set by B16. | B16 |

Record each as "set" or "unset". Never paste the command's output into the repo: it prints plain-text values.

### Vercel (the link site, `links/server/lib/options.mjs`, `links/server/lib/supabase.mjs`)

`LINK_ORIGIN`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (a secret: cover photos only), `TERMS_VERSION`, `TERMS_URL`, `PRIVACY_URL`, `APP_STORE_URL`, `APP_STORE_ID`. Also the contact form's settings (names set by D1) and the CAPTCHA keys (names set by D10).

### Supabase Edge Function secrets

- **Sender (live):** `NOTIFICATION_DELIVERY_ENABLED`, `NOTIFICATION_WORKER_SECRET`, `EXPO_ACCESS_TOKEN`.
- **Deletion (C2):** `ACCOUNT_DELETION_ENABLED`, `ACCOUNT_CLEANUP_SECRET`, `ACCOUNT_RECEIPT_PURGE_ENABLED`, `ACCOUNT_RECEIPT_PURGE_SECRET`, and the Sign in with Apple key for token revocation (names set by C2).
- **Photo clean-up (C3):** `PROFILE_PHOTO_CLEANUP_ENABLED`, `PROFILE_PHOTO_CLEANUP_SECRET`.
- **SMS (C1):** Twilio's credentials and the hook's secret (names set by C1).
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by Supabase.

### Scheduled jobs

`deliver-notifications` (live), `roll-repeating-plans` (step 12), and the deletion and retention jobs (names set by C2 and C3).

---

## Phase 3: hosted sittings, one at a time

Each sitting has before-and-after snapshots, the advisors, and an entry under "Applied".

### Step 11. Twilio and test mode off (C1, D6, D5, F14, F5)

This comes first. The current TestFlight build's `000000` swap does nothing once live mode is on, so the sitting can run before the new build.

- [ ] **[approval]** Open the Twilio account in Resbite Ltd's name (F8), as the owner decided (AS-D5). Choose the region: [[OWNER: Twilio's region and transfer safeguard, to confirm when Resbite Ltd's account accepts Twilio's Data Protection Addendum — proposed: the United States, Twilio's main processing location, under the UK–US data bridge (Twilio Inc. states it takes part in the UK Extension to the EU–US Data Privacy Framework; check the live listing), with the UK Addendum to the EU Standard Contractual Clauses in Twilio's addendum as the fallback; Twilio's Ireland region (IE1) also offers messaging]]. Set tight limits and a spend alert: [[OWNER: Twilio monthly budget and spend alert — proposed: about USD 60 a month at 1,000 codes: Twilio lists UK text messages at USD 0.056 a segment (pricing page, November 2026), plus any carrier fees, and a sender number from USD 1.15 a month if an alphanumeric sender name is not used]]. Accept Twilio's Data Protection Addendum and record it, with the region, in the vendor register (A18, F7) before any number is sent.
- [ ] Set how Twilio's message records are deleted, and record it in A12: [[OWNER: how long Twilio keeps message records — proposed: the Send SMS hook deletes each message record through Twilio's API once its delivery status is final, and Twilio says a deleted message's text can stay in its backups for up to 30 days, so state "up to 31 days after sending"; Twilio's Message Redaction setting is offered only with its Editions packages]].
- [ ] **[approval]** Before snapshot, into this folder.
- [ ] **[approval]** Deploy the hook path from phase 2: either the Edge Function behind an HTTP Send SMS hook, or the Postgres hook body with `pg_net`. Each file is approved by name and sha256. Then set its secrets, by name.
- [ ] **[approval]** **The switch-off sitting**, as written in `qa/phone-accounts-2026-10-27/README.md`, step 7:
  1. test mode off and `private.test_codes` emptied;
  2. every session revoked;
  3. every `exchanged` row of `private.test_mode_log` reviewed against the known testers;
  4. the Auth identities made while test mode was on reviewed too.
  What the review queries show stays in the SQL editor.
- [ ] **Breach log, first entry (F5, A17).** Record the outcome of the review, whatever it finds. If any exchange was not a known tester's, the 72-hour clock for reporting to the Information Commission (ICO, ico.org.uk) runs from that moment. The Information Commission took over the ICO's functions on 30 September 2026 and still uses the name ICO. Follow A17.
- [ ] **[approval]** Auth settings (C11): restore the SMS rate limit to its pre-testing value, and confirm the OTP length and expiry. Record the values.
- [ ] **[approval: Vercel]** Deploy the link site without the `000000` swap and with true code wording (D6). Add the firewall rate limit on `/i/*`, as `/r/*` already has (D5).
- [ ] **Do not switch on CAPTCHA.** It waits until the build and the site send a token (step 21; OPS-9).
- [ ] Check that a real code arrives on the current TestFlight build, using a tester number the owner controls, and on `/r/` and `/i/`. `000000` is now refused.
- [ ] **[approval]** After snapshot and advisors.
- [ ] **[approval]** Later, once the log review is recorded: the migration that drops `public.exchange_test_code`, `private.test_codes` and `private.test_mode_log`, by sha256. Older builds call that function only when someone types `000000` (`mobile/src/services/phoneCode.ts:68`), so real codes keep working on them.

### Step 12. Roll job and backup moderator (C4, C5)

- [ ] **[approval]** **Roll job.** In the SQL editor, run `supabase/ops/schedule-roll-repeating-plans.sql`, sha256 `3a8202877260008723648dc4723b36aedb6d772f809b2552997765773040d74e` (as `qa/creating-a-resbite-2026-10-31/README.md:79-105`). Then run the roll job check below: `roll-repeating-plans` is active and has run.
- [ ] **Before the backup gets access:**
  - A24 is signed (kept outside the repo).
  - MFA is on for the backup's Supabase account and mailbox (F16).
  - The backup has a Resbite account that may use the app, so the moderator push reaches them.
  Backup moderator: [[OWNER: the backup moderator's identity — the owner names one backup (decision AS-D6); recorded only in the signed team access agreement kept outside the repo; the repo records only that a backup is named, and the date — proposed: at the Supabase Developer role with MFA, named before the 1.0 submission]].
- [ ] **[approval]** In the SQL editor, run `supabase/ops/moderators.sql` with the owner's and the backup's emails, in the editor's copy only. Grant dashboard access at the lowest role that can run the moderation scripts (on the Pro plan, Developer, which can read all content; A9 records this).
- [ ] Run the chat runbook's release gate (`ch3-gate.sh`, `qa/chat-release/README.md`, step 5a). It must show `blocked_terms` above 0, `moderators` at least 2, and `moderators_pushed` equal to `moderators`.
- [ ] Record "a backup moderator is named" and the date, never who. This answers the chat runbook's R-Q4.

### Step 13. Deletion release (C2)

- [ ] **[approval]** Each C2 migration, by name and sha256, with snapshots, the advisors, the baseline line and its rollback. Record the September deletion files as never-apply, as C2 says.
- [ ] **[approval]** Deploy `delete-account`, `cleanup-account` and `purge-deletion-receipts`, each with `verify_jwt` false (their handlers authorise each call themselves).
- [ ] **[approval]** Set their secrets by name, including the Sign in with Apple key for token revocation.
- [ ] **[approval]** Commit the source gates in `supabase/functions/_shared/deletion-release.ts` (lines 4 and 8) set to true, then redeploy.
- [ ] **[approval]** Schedule the clean-up worker and the receipt purge (job names set by C2).
- [ ] The written restore procedure (D-4, F11) is in place.
- [ ] **End-to-end test, with disposable accounts only:**
  - [ ] a phone-only account, confirmed with a fresh phone code;
  - [ ] an email-and-password account, confirmed with its password (the review accounts need this route; pack, open point 7);
  - [ ] an Apple-only account, confirmed with Apple; its Apple tokens are revoked at Apple;
  - [ ] a Google account;
  - [ ] a suspended account can still delete (D-19), and its suspension record stays with the user id cleared and the reason and dates kept (AS-R1);
  - [ ] an account with an open report it filed: the report stays, with the reporter id cleared (AS-R2);
  - [ ] a host with future resbites: they are cancelled and guests are told (D-20);
  - [ ] under a legal hold, the request is accepted and the held records wait;
  - [ ] two members of one group deleting at once, with no deadlock (`qa/chat-release/README.md:1017`);
  - [ ] the screen states the time frame and confirms when deletion is done; the receipt has no internal notes.
- [ ] The app's `EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED` goes on only in the build after this sitting (step 19).

### Step 14. Terms acceptance, safety extension, optional details, retention (C8, C7, C9, C3)

Each migration is approved by name and sha256, with snapshots, the advisors, the baseline line and its rollback.

- [ ] **[approval]** **C8, versioned Terms acceptance.** An account without the current version reads "acceptance needed". `answer_phone_invitation` records the version the link site sends.
- [ ] **[approval]** **C7, safety extension.** The reasons `illegal`, `child_safety` and `intimate_image` are accepted. The blocked-terms check refuses a listed term in a title, description, note to guests, meeting details and display name.
- [ ] **[approval]** **C9, optional details removed.** `registration_details` is cleared from Auth metadata, and the write path is retired. The current TestFlight build's Account details can then no longer save those four fields; tell the testers.
- [ ] **[approval]** **C3, retention jobs.** The purge functions and their schedule, including web-only accounts with no resbite in 12 months and code requests never confirmed after 30 days (AS-R4). Each respects the legal hold. Deploy `cleanup-profile-photos` with its two secrets.

### Step 15. Auth email templates and Auth settings (C13, C11, F13)

- [ ] **[approval]** Paste the changed `supabase/templates/confirmation.html`, `email-code.html` and `recovery.html` into the Auth dashboard's email templates. Record each file's sha256. The "private test" line is gone, and each carries the company footer.
- [ ] **[approval]** Confirm and record these settings:
  - the Apple provider is on (SI-3);
  - the Google provider is on;
  - the OTP length and expiry;
  - manual linking;
  - the SMS rate limit;
  - CAPTCHA still off.
- [ ] **[approval: Google Cloud console]** Publish the Google app and verify its brand (SI-12), so Google's consent screen shows Resbite. If Google asks for the privacy policy on the verified domain, finish this after step 16.
- [ ] **[approval: Apple Developer]** Register the email sending domain with Apple's private email relay, and check SPF (SI-10).

## Phase 4: the link site

### Step 16. Legal pages, footer and notices (D1 to D3, D7, D9, D4)

- [ ] The solicitor-reviewed texts are final. Effective date: [[OWNER: effective date — proposed: the day the pages go live on link.resbite.com, after the solicitor's review and before the version 1.0 submission]]. Terms version: [[OWNER: the Terms version string for Terms of Use 1.0 — proposed: the year and month the Terms take effect, in the "YYYY-MM" form the database accepts, for example "2026-12"; it must differ from today's "2026-10"]].
- [ ] **The inboxes exist first** (step 18, F1). `/support` must never publish an address nobody reads, and its contact form delivers to the support inbox.
- [ ] **[approval: Vercel]** Deploy D1 to D3, D7 and D9, with the contact form.
- [ ] **[approval: Vercel]** Set `TERMS_URL`, `PRIVACY_URL` and the bumped `TERMS_VERSION` (placeholder 7, the same string as the app). Record what `APP_STORE_URL` holds now (the repo does not say).
- [ ] **Checks:**
  - [ ] `https://link.resbite.com/privacy`, `/terms`, `/support` and `/delete-account` load over HTTPS without sign-in, and show the final texts with their effective date and version.
  - [ ] Every page's footer shows: Resbite Ltd, a private limited company registered in England and Wales, company number 12450334, registered office 86-90 Paul Street, London EC2A 4NE, United Kingdom, [[OWNER: VAT number, or delete if not VAT-registered]], support@resbite.com, privacy@resbite.com, and the legal links.
  - [ ] `/support` offers the contact form, the report route for people who are not users (including "an intimate image of me"), complaints and appeals, and the route for third-party legal complaints.
  - [ ] A test message through the form reaches the support inbox.
  - [ ] `/r/` and `/i/` show the short notice beside the number field. `/i/` shows the right-to-object statement on its own line.
  - [ ] The Content Security Policy is still `script-src 'self'`, with no third-party script.
  - [ ] The function region, and the plan and log period, are recorded (D7).
  - [ ] `/invite` no longer says "private testing" (D9).
  - [ ] An answer on `/i/` records the new Terms version.

### Step 17. Marketing site check (F18)

- [ ] The site that `link.resbite.com/` redirects to runs no analytics without consent and no longer shows the 2020 policy. Otherwise, point its legal links at `/privacy` and `/terms`.
- [ ] Decide the Marketing URL (pack, section 4).

## Phase 5: inboxes, build and CAPTCHA

### Step 18. Inboxes, fee, agreements, accounts, membership, MFA (F1, F6 to F9, F16)

- [ ] **[approval]** **Inboxes (F1).** support@resbite.com and privacy@resbite.com, watched every working day. A signature with the company particulars on every reply (DOC-7). The mailbox provider in the vendor register with its data processing terms. Send a test to each and answer it.
- [ ] **ICO fee (F6).** Confirm that the data protection fee is paid for Resbite Ltd at the right tier (tier 1 is £52), or pay it.
- [ ] **Processor agreements (F7).** Supabase, Vercel, Expo, Resend, Twilio, the CAPTCHA vendor, the mailbox provider and the log tool, each recorded in A18.
- [ ] **[approval]** **Accounts in Resbite Ltd's name (F8).** Supabase, Vercel, Expo, Apple Developer, Resend, Twilio, the Google Cloud project, GitHub, the mailbox and the domain registrar and DNS.
- [ ] **[approval: Apple Developer]** **Organisation membership (F9, ASC-15).** The App Store shows the membership's legal entity as the seller. It must read Resbite Ltd, which needs an organisation membership with a D-U-N-S number. Start this early: how long Apple takes is not on record.
- [ ] **MFA everywhere (F16).** Supabase, Vercel, Expo, Apple, Google Cloud, Resend, GitHub and both inboxes.

### Step 19. EAS variables and push credentials

- [ ] **[approval: EAS]** Set every variable in the EAS table above, in the production environment. `EXPO_PUBLIC_SUPPORT_ADDRESS` is plain-text visibility, since the app shows it to everyone.
- [ ] From `mobile/`, run `npx eas env:list --environment production`. Every name is listed. Record "set" for each, never a value.
- [ ] The app's Terms version (B2) matches Vercel's `TERMS_VERSION`.
- [ ] **[approval: EAS]** Confirm the APNs key is in the iOS production credentials (`npx eas credentials`). Record "confirmed", not the key id.

### Step 20. The production build (E12)

- [ ] `mobile/app.json` reads version `1.0.0` and has `ios.privacyManifests` (B13).
- [ ] **[approval: EAS / TestFlight]** From `mobile/`, at the merged commit on `main`: `npx eas build --platform ios --profile production`, then `npx eas submit --platform ios --profile production`.
- [ ] The build log shows `PASS release check: …` from the `eas-build-post-install` hook.
- [ ] Record in the release record: the build number (EAS increments it remotely), the commit, the date, and the Xcode version from the build log (Xcode 26 or later; CON-7).
- [ ] Read Apple's email after the upload. Record any ITMS warning, for example missing required-reason entries (ITMS-91053) or a missing SDK manifest (ITMS-91061), and fix it before step 25.
- [ ] TestFlight: internal testers install it first. Tell external testers to update before step 21, since sign-in on older builds may fail once CAPTCHA is on.

### Step 21. CAPTCHA on (D10, C11, F14; OPS-9)

- [ ] **[approval: Vercel]** Deploy the site's CAPTCHA (D10). The CSP is widened only for the vendor's script and frame hosts: [[OWNER: CAPTCHA vendor — proposed: Cloudflare Turnstile or hCaptcha]].
- [ ] **[approval: Supabase]** Switch CAPTCHA on in Auth, with the vendor's secret. Record it.
- [ ] Check that sign-in still works on the new build (phone code, email and password, Apple, Google) and on `/r/` and `/i/`. Whether Supabase's setting also covers phone code requests is UNVERIFIED; this check settles it.

### Step 22. Device checks on the build (F12)

Run on the step 20 build, installed from TestFlight. Record each result under "Applied", with no names, numbers or ids. Use test accounts and the QA personas only.

**Build and configuration**
- [ ] Settings → Resbite and the app show version 1.0.0.
- [ ] **The Xcode privacy report** (APL-60, PRV-16). Xcode makes it from an archive, not from the `.ipa`. On the Mac, archive the same commit in Xcode, then choose Organizer → Generate Privacy Report. Hermes and every SDK manifest are listed, and the app's own manifest matches the pack's section 6. If no archive is made, rely on step 20's upload email, and record which was used.

**Sign-in and account**
- [ ] A real SMS arrives for phone sign-up and sign-in. The screen's "We sent a 6-digit code" is true. `000000` is refused.
- [ ] Sign in with Apple works on this build (SI-3). It uses Apple's own black or white button, no smaller than the others (B9).
- [ ] Google sign-in shows the Resbite brand on Google's consent screen (SI-12).
- [ ] Email and password sign-in asks for no code when the account's number is verified.
- [ ] After Apple or Google sign-in, Add your number shows "Your friends find and invite you by your number." (B10).

**Terms and age**
- [ ] A new phone sign-up records the new Terms version.
- [ ] An Apple or Google sign-up, and an existing account without the new version, see the 18+ and Terms screen once (B2, C8).
- [ ] An answer on `/i/` records the same version.

**Deletion** (B3, C2)
- [ ] Profile → Data & privacy → Delete account, for each account type, on this build.
- [ ] The "What happens" sheet and the receipt state the time frame, say what is kept and what happens to shared content and a host's resbites, and contain no internal notes.
- [ ] The screen confirms completion.
- [ ] A suspended account sees Delete account and the support address (B6).

**Safety**
- [ ] The chat runbook's step 7, "Chat safety (plan 3)", passes on this build (`qa/chat-release/README.md`).
- [ ] The three new report reasons send and reach the queue (B7, C7).
- [ ] After a report, the thanks says "We review reports every day." and shows the support address (B7, AS-R9).
- [ ] A listed term is refused in a title and in a display name (C7).
- [ ] The removal scripts work on a test photo, title and cover (C6).
- [ ] The owner-run deletion script deletes a test account that cannot use the app as the app's deletion does, with the cancellations and the receipt (C6, AS-R3).

**Content and wording** (B4, CON-1, CON-2)
- [ ] There is no Wellness tab and no "Preview & samples" topic.
- [ ] Nowhere does the app say "beta", "development build", "this build", "Tester" or "private test". A guest with no name shows as "Guest".
- [ ] Push is on, so the "This build does not send…" lines never show.

**Legal and contact** (B1, B5, B14, A25)
- [ ] The About and legal group opens the live Privacy Policy, Terms, Support and company details, and the Licences screen shows the notices.
- [ ] The welcome and sign-in screens link the Privacy Policy and the Terms. The 18+ tick's links work.
- [ ] Data & privacy matches the Privacy Policy.
- [ ] Community rules opens `/terms#community-rules`.
- [ ] "Request a copy of my data" opens a pre-filled email to privacy@resbite.com.
- [ ] support@resbite.com shows in Data & privacy → Contact, after a report, on the suspended screen and in the taken-number line.

**Permissions** (B8)
- [ ] No location prompt ever appears, and Settings → Resbite lists no Location.
- [ ] The contacts prompt reads "Choose contacts to invite. Resbite checks only the numbers you pick to see who already uses it."
- [ ] Refusing contacts still lets you type a number.

**Push and groups**
- [ ] With the app closed, invitation, answer, chat and announcement pushes arrive. This is the App Store signing check for `aps-environment` (RO-15).
- [ ] A weekly test group gets its next occurrence from the roll job (C4).

**Devices and accessibility** (CON-5, CON-9)
- [ ] The main flows pass on the newest iOS (the owner's iPhone).
- [ ] The main flows pass on an iPad in iPhone compatibility mode: sign-in, contacts, chat, deletion. If no iPad is at hand, use the iPad Simulator on the Mac with a build of the same commit, and record that.
- [ ] VoiceOver passes on the main flows: sign-in, create, invite, answer, chat, report, block, delete.
- [ ] At the largest Larger Text, nothing is clipped at 320 points.

**Throughput** (OPS-6)
- [ ] The chat runbook's step 8 query, during a busy test hour: `waiting` under 100, `oldest_wait` under 2 minutes.

**App Privacy** (APL-49)
- [ ] The pack's App Privacy answers, the build's privacy manifest and the Privacy Policy agree.

## Phase 6: App Store Connect

### Step 23. Review accounts (E7, SI-2)

- [ ] **[approval]** Create R1, R2 and H1 as the pack's section 12 says. The email accounts are made in the Supabase dashboard (Authentication → Users → Add user → Create new user, with Auto Confirm ticked), because the app no longer has email sign-up (`mobile/app/auth/index.tsx:50`).
- [ ] Sign in to each on the submission build. Add its number with a real code, and set its name. R1 and R2 accept the Terms on the way.
- [ ] Seed the weekly group, the one-off and the connection request, as Ana (pack, 12.3).
- [ ] Run the pack's checks in 12.4.

### Step 24. Enter the pack (E1 to E11)

- [ ] **[approval: App Store Connect]** Enter every field in the [pack](app-store-connect-pack.md):
  - app information, pricing and availability (UK only, free);
  - App Privacy, with both URLs;
  - the age rating questionnaire with the 18+ override and the two new declarations;
  - the listing copy, the URLs and the copyright;
  - the screenshots;
  - App Review Information, with the [review notes](app-store-review-notes.md) filled in App Store Connect only;
  - the trader status;
  - **Version release: Manual**.
- [ ] Choose the step 20 build.

### Step 25. Submit

- [ ] The Apple question (D-16, ASC-17) has an answer on record.
- [ ] **[approval: App Store Connect]** Submit for review. Record the date.
- [ ] Watch App Store Connect's messages and the review contact's email and phone until the decision.

## Phase 7: after approval

### Step 26. Go-live checklist, then release

The app waits in "Pending Developer Release". Release it only when every box is ticked on the same day.

- [ ] **Inboxes answered.** A test message to support@resbite.com and to privacy@resbite.com is answered today. The `/support` form delivers.
- [ ] **Backup moderator on.** `ch3-gate.sh` shows `moderators` at least 2, with `moderators_pushed` equal. The owner and the backup agree who reads the queue in the first week. Today's `supabase/ops/open-reports.sql` read is done, and every open report is handled.
- [ ] **Roll job checked.** The roll job check shows `roll-repeating-plans` active, run in the last 10 minutes, and no failures in the last day. The review group shows next week's occurrence.
- [ ] **Sender healthy.** `deliver-notifications` ran in the last 2 minutes. The chat runbook's step 8 query shows `waiting` under 100.
- [ ] **Deletion running.** The C2 clean-up job ran recently and no deletion job is stuck.
- [ ] **Documents live.** The legal pages show the solicitor-approved texts, with the effective date. The Terms version is the same on Vercel and in the build.
- [ ] **SMS.** A real code arrives. The spend alert and the rate limit are as recorded.
- [ ] **CAPTCHA** is on, and sign-in works.
- [ ] **[approval: App Store Connect]** Release this version. Record the date.

### Step 27. App Store link on the site (D4, WEB-6)

- [ ] **[approval: Vercel]** Set `APP_STORE_URL` to the app's App Store link (App Store Connect → App Information → View on App Store) and `APP_STORE_ID` to the app's Apple ID number. Redeploy.
- [ ] Check that an event page on `/r/` shows the smart app banner and that "Get the app" opens the App Store.

### Step 28. Alerts and restore rehearsal (F10, F11)

- [ ] **[approval]** Failure and queue-age alerts for the push sender, the roll job and the deletion worker.
- [ ] **[approval]** Rehearse a restore into a scratch project, using the deletion replay from C2. Decide on point-in-time recovery (D-15).
- [ ] **After release:**
  - Test an 18+ download from a UK Apple account that has not confirmed its age, before relying on Apple's check (ASC-17).
  - Run the chat runbook's step 8 during the first busy public hour.

### Step 29. Later work

None of this blocks 1.0:
- Apple's server-to-server notifications (C10).
- The "hide message previews" setting (D-13).
- "Report this resbite" (D-17).
- Change-number and change-email flows (SI-9).
- The system contact picker.
- Hand-over of a host's group to an admin (D-20).
- Accessibility Nutrition Labels.
- The Argentine rewrite decision (C12).
- The yearly reviews (F15).
- Paid features: if they come in a later version, users are told first and any extra terms are shown before they pay, and the Paid Applications agreement is signed first.

### Step 30. Records (F13)

- [ ] Fix the stale summary at the top of `docs/implementation-status.md`.
- [ ] Record the release in the decisions log (A19).
- [ ] At every later release, check the App Privacy answers again (APL-49).

---

## Roll job check

Read-only. Names, times and counts only. Run with `! bash ~/asr-jobs.sh`:

```bash
#!/bin/bash
# Read-only: each scheduled job, whether it is active, when it last ran, and its failures in the last day.
set -euo pipefail
cd "${REPO:-$HOME/dev/resbite-app}"
supabase db query --linked "select j.jobname, j.schedule, j.active, max(d.start_time) as last_run, count(*) filter (where d.status = 'failed' and d.start_time > now() - interval '1 day') as failed_last_day from cron.job j left join cron.job_run_details d on d.jobid = j.jobid group by j.jobname, j.schedule, j.active order by j.jobname"
```

- `roll-repeating-plans`: schedule `*/5 * * * *`, active, `last_run` within 10 minutes, `failed_last_day` 0.
- `deliver-notifications`: active, `last_run` within 2 minutes, `failed_last_day` 0.

## If App Review rejects the app

1. Read Apple's message in App Store Connect, and answer within the thread.
2. **Metadata only** (copy, screenshots, the age or privacy answers, the notes): fix it in App Store Connect and resubmit the same build.
3. **The build:** fix it on a branch, merge it, and repeat steps 19 to 22 for whatever changed. Any `EXPO_PUBLIC_*` change needs a new build.
4. **Sign-in or review data:** run the pack's 12.4 checks, then answer with the path.
5. If we disagree with a decision, appeal to the App Review Board.
6. Record each round under "Applied".

## Release record

Fill in as the steps run. No secrets and no personal data.

| Item | Value |
|---|---|
| Commit on `main` | |
| Build number | |
| Version | 1.0.0 |
| SKU (from App Store Connect) | |
| Xcode version (build log) | |
| EAS variables set (names) | |
| APNs key confirmed | |
| Upload warnings (ITMS) | |
| Privacy report source (archive or upload email) | |
| Device checks passed (date) | |
| Review accounts checked (date) | |
| Pack entered (date) | |
| Submitted (date) | |
| Approved (date) | |
| Released (date) | |
| `APP_STORE_URL` and `APP_STORE_ID` set (date) | |

## Applied

Nothing has been applied yet. Add a dated entry for each step: what was done, the file names and sha256 where there are any, the counts, and the result. Never a name, number, email or account id.

## Sources

- Gap analysis: `docs/superpowers/specs/2026-11-17-app-store-readiness-design.md`, sections 4 (workstreams C, D, E, F), 5 (decisions and retention) and 6 (order of work).
- Release audit: `research_notes/App Store readiness/audit-release-ops.md` (EAS variables, jobs, functions, approval steps).
- Chat runbook: `qa/chat-release/README.md` (steps 5a, 6a, 7, 8; the reports queue).
- Phone accounts runbook: `qa/phone-accounts-2026-10-27/README.md`, step 7 (test mode off).
- Creating a resbite runbook: `qa/creating-a-resbite-2026-10-31/README.md` (the roll job).
- Apple, platform version information (version release options, App Review Information): https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information
