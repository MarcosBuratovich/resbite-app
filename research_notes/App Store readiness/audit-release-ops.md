# App Store readiness: release and operations audit

17 November 2026. This audit asks one question: is Resbite ready, in release and operations terms, for its first public App Store submission?

**Method.** I read the repo's records only. That covers `docs/implementation-status.md`, every `qa/*/README.md` runbook, the roadmap, the decision log, `supabase/tests/hosted-baseline/migrations.txt`, the migrations and functions, and the mobile config. I had no hosted access: no Supabase, Vercel, EAS, TestFlight or App Store Connect. Where I infer hosted state from row-count snapshots, I say so. Apple, UK statute and vendor requirements come from primary sources, listed at the end. Anything I could not confirm is marked **UNVERIFIED**.

**What I left out on purpose.** Hosted project refs, Apple team ids, EAS project ids, Vercel deployment ids, email addresses and phone numbers. They are in the repo where needed.

## Verdict

**Not ready to submit.** Four things would get the app rejected or break the law on day one:

1. **Account deletion is not live.** The app says "Account deletion is not enabled in this development build". Apple requires in-app deletion for any app that creates accounts (guideline 5.1.1(v)).
2. **Phone codes are in test mode on the hosted project.** `000000` signs in as any number. On a public app, anyone who knows someone's number can take over their account.
3. **There is no privacy policy, no terms and no support page.** App Store Connect requires a privacy policy URL and a support URL. The app needs a privacy policy link too.
4. **There is no support address.** The app's own runbook blocks App Review until `EXPO_PUBLIC_SUPPORT_ADDRESS` is set, and no backup moderator has been named.

Behind these sit a dozen high items: the App Store listing, the Wellness tab's sample figures, the roll job for weekly groups, the chat device checks, data-subject request and breach handling, and the Online Safety Act records.

The good news: chat safety (report, block, chat rules, blocked terms, a moderator push, the reports queue) is live on the hosted project. Push delivery is live. Realtime public access is off. The build toolchain (Expo SDK 57 on Xcode 26.6) meets Apple's current upload rule.

---

## 1. What is live on the hosted project, and what is not

### 1.1 Migrations

The repo has 33 migrations (`supabase/migrations/`). The hosted baseline lists 25 as applied (`supabase/tests/hosted-baseline/migrations.txt:3-27`), the last being `20261116120000_open_beta.sql` (line 27). Comparing the two lists leaves **eight local-only migrations**:

| Migration | Status | Must it go to hosted? | App Review depends on it? |
|---|---|---|---|
| `20260918001308_notification_delivery_preparation` | Superseded by `20261030120000_push_delivery` | **Never apply** (`qa/push-notifications-2026-10-30/README.md:85`; `docs/implementation-status.md:719`) | No |
| `20260918001316_account_deletion_lifecycle` | Local only | Yes, for deletion | **Yes, deletion** |
| `20260923152816_orphan_profile_photo_cleanup` | Local only | Yes, for photo retention | Indirectly (retention promises) |
| `20260923152943_deletion_receipt_retention` | Local only | Yes, with deletion | **Yes, deletion** |
| `20260929125858_deletion_intent_reservations` | Local only. Still requires a roster row and a confirmed email (`:32`). Predates connections, circles and chat (roadmap `:109`) | Yes, after rework | **Yes, deletion** |
| `20261014130000_ux2_notification_wording` | Superseded by push delivery | **Never apply** | No |
| `20261015130000_ux3_note_delivery` | Superseded by push delivery | **Never apply** | No |
| `20261022120001_gi2_local_delivery_and_deletion` | Local only. Must be split before the deletion milestone: its `notification_recipient_eligible` would bring back the email-only audience (`qa/push-notifications-2026-10-30/README.md:86`) | Its deletion half only | **Yes, deletion** |

**Records drift.** The top summaries of `docs/implementation-status.md` still say follow-ups and circles are "awaiting rollout" (lines 11, 13) and the chat plans are "built, not hosted" (lines 15-19). The runbooks say otherwise. Follow-ups, circles and the three chat migrations were applied on 12 November 2026 (`qa/connections-follow-ups-2026-11-11/README.md:263-269`; `qa/circles-of-trust-2026-11-10/README.md:356-362`; `qa/chat-release/README.md:860-869`). The baseline agrees. The status file should be corrected so nobody plans from it.

### 1.2 Edge functions

| Function | State | Evidence |
|---|---|---|
| `deliver-notifications` | **Live**, released (`DELIVERY_RELEASE_APPROVED = true`, `supabase/functions/deliver-notifications/index.ts:9`). Redeployed 13 Nov 2026 as version 5, `verify_jwt` false. A cron job calls it every minute | `qa/chat-release/README.md:867`; `supabase/functions/deliver-notifications/README.md:3` |
| `fold-phone-account` | **Live**, released (`supabase/functions/_shared/fold-release.ts:4`). Redeployed 29 Oct as version 5 | `qa/phone-key-2026-10-29/README.md:99` |
| `delete-account` | **Not deployed.** Source gate off (`supabase/functions/_shared/deletion-release.ts:4`) | `supabase/functions/delete-account/README.md:1-3` |
| `cleanup-account` | **Not deployed.** Same gate | `supabase/functions/delete-account/README.md:15-19` |
| `purge-deletion-receipts` | **Not deployed.** Gate off (`deletion-release.ts:8`) | `supabase/README.md:60` |
| `cleanup-profile-photos` | **Not deployed.** Gate off (`supabase/functions/cleanup-profile-photos/index.ts:9`) | `supabase/README.md:60-62` |

### 1.3 Hosted settings on record

- **Realtime "Allow public access": off** since 13 Nov 2026 (`qa/chat-release/README.md:868`).
- **Moderators: 1** (the owner). **Blocked terms: 37.** The gate passed (`qa/chat-release/README.md:869`).
- **Phone test mode: on.** `private.phone_mode.test_mode = true` (`qa/phone-accounts-2026-10-27/README.md:45`). The 16 Nov counts show it in use: `private.test_codes` 5, `private.test_mode_log` 35 (`qa/open-beta-2026-11-16/hosted-counts-after.json`). *That it is in use is my inference from the counts.*
- **Leaked-password protection: on** since 29 Sep (`docs/implementation-status.md:302`).
- **Backups:** Supabase Pro, seven daily backups, point-in-time recovery off, as read on 23 Sep (`qa/b0-retention-proposal.md:22`). Not re-checked since.
- **Cron jobs:** only `deliver-notifications` existed on 12 Nov (`qa/chat-release/README.md:864`, "job `deliver-notifications` only").

### 1.4 What App Review depends on

- **Deletion:** none of it is hosted. This is the biggest gap (section 4.5).
- **Safety:** live on hosted. Still open: the support address (step 5b), the backup reader (R-Q4), the build (step 6), the review set-up (step 6a) and the chat safety device checks (step 7) (`qa/chat-release/README.md:308-322`, `:860-871`).
- **Notifications:** the sender is live. The app side (APNs key in EAS, `EXPO_PUBLIC_PUSH_ENABLED=true`) has no record of being done (`qa/push-notifications-2026-10-30/README.md:63`, `:117`). The 16 Nov counts show 5 device endpoints and 19 deliveries, which suggests a push-enabled build exists. *Inference, not on record.*

---

## 2. Build configuration

### 2.1 `mobile/app.json`

| Key | Value | Status |
|---|---|---|
| Bundle id | `com.resbite.app` (`:12`) | OK. Android keeps `com.resbite.preview` (`:21`). Out of scope, but the mismatch will matter for Android. |
| Marketing version | `0.1.0` (`:6`) | Allowed. A public `1.0.0` is the norm. Owner's choice. Low. |
| Build number | Remote, auto-increment (`mobile/eas.json:2`, `:6`) | OK. |
| `supportsTablet` | `false` (`:11`) | OK. iPhone screenshots only ([Apple screenshot specs](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)). |
| `associatedDomains` | `applinks:link.resbite.com` (`:13`) | OK. The link site serves the Apple file for `/invite` and `/r/*` (`qa/contact-invites-2026-10-28/README.md:58`). `/i/` does not open the app (a known limit, `:75`). |
| `usesAppleSignIn` | `true` (`:14`) | OK. Meets guideline 4.8 alongside Google. Token revocation on deletion is missing (section 4.5). |
| Export compliance | `ITSAppUsesNonExemptEncryption: false` (`:16`) | OK. The app uses HTTPS and hashing only. |
| `LSApplicationQueriesSchemes` | `["whatsapp"]` (`:17`) | OK. |
| Photos usage text | `:49` | OK. Camera and microphone are off (`:50-51`). |
| Location usage text | When in use only (`:60-62`) | OK. |
| `NSMotionUsageDescription` | "Resbite doesn't use motion or fitness data… the app never asks" (`:63`) | Low risk. The plugin writes a default motion string if none is given (`node_modules/expo-location/plugin/build/withLocation.js:11`, `:114`). The honest wording is better than the default. |
| Contacts usage text | `:69` | OK. |
| Calendar and Reminders usage text | Both say the app does not use them (`:75-76`) | Low risk. Same reason as motion: the plugin writes the keys (`node_modules/expo-calendar/plugin/build/withCalendar.js:10-12`). |
| Notifications | `expo-notifications` plugin, default mode | `aps-environment` defaults to `development` (`node_modules/expo-notifications/plugin/build/withNotificationsIOS.js:9-12`). App Store signing normally swaps in the production value. Check that pushes arrive on the App Store build. Low. |
| Scene support | `enableSceneSupport: true` (`:84`) | OK. Expo says this is needed for iOS 27 launches on Xcode 27 images ([Expo build infrastructure](https://docs.expo.dev/build-reference/infrastructure/)). |
| Privacy manifest | No `ios.privacyManifests` in app.json | Probably OK. Expo packages ship their own `PrivacyInfo.xcprivacy` (for example `node_modules/expo-notifications/ios/PrivacyInfo.xcprivacy`). Expo's guidance is to add reasons to app.json if Apple's email after an upload lists missing ones ([Expo: Apple privacy](https://docs.expo.dev/guides/apple-privacy/)). **UNVERIFIED** whether earlier TestFlight uploads drew such an email. Low. |
| Tracking | No `NSUserTrackingUsageDescription` | OK. The owner says there are no ads and no tracking (session memory, 17 Nov). |

### 2.2 `mobile/eas.json`

- Production profile: `autoIncrement: true`, `environment: "production"` (`:6`). Submit profile empty (`:9`). OK.
- No `image` is set, so EAS picks `auto`. For SDK 57 the `sdk-57` image is Xcode 26.6 ([Expo build infrastructure](https://docs.expo.dev/build-reference/infrastructure/)).

### 2.3 SDK and Apple's upload rules

- **Expo 57.0.23, React Native 0.86.3** (`mobile/package.json:20`, `:47`).
- **Apple, since 28 April 2026:** "Apps uploaded to App Store Connect must be built with Xcode 26 or later using an SDK for iOS 26…" **Since 9 September 2026:** apps "must target iOS 13 or later" ([Apple upcoming requirements](https://developer.apple.com/news/upcoming-requirements/)).
- **Verdict: met.** SDK 57's default image uses Xcode 26.6. React Native's minimum iOS is well above 13. Apple lists no newer upload rule as of 17 Nov 2026. SDK 58 is out (Xcode 27.1), but nothing requires it yet.

### 2.4 Build-time variables (names only)

`EXPO_PUBLIC_*` values are fixed when the bundle is built (`qa/chat-release/README.md:701`). Every one must be right in the EAS production environment before the submission build.

| Variable | Used at | Needed value for launch | On record |
|---|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | `mobile/src/services/accountDeletion.ts:13-14` and the client | Hosted URL | Set at UX2 (`qa/ux2-2026-10-14/README.md:116-117`) |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | as above | Publishable key | Set at UX2 |
| `EXPO_PUBLIC_PUSH_ENABLED` | `mobile/src/services/pushDevice.ts:21` | `true` | **Not recorded** (`qa/push-notifications-2026-10-30/README.md:117`) |
| `EXPO_PUBLIC_INVITATION_ORIGIN` | `mobile/app/+native-intent.tsx:9` | `https://link.resbite.com` | **Not recorded** (`qa/contact-invites-2026-10-28/README.md:64`) |
| `EXPO_PUBLIC_SUPPORT_ADDRESS` | `mobile/app/data-privacy.tsx:28`; `mobile/src/design/ReportSheet.tsx:69` | The support inbox | **Not set** (`qa/chat-release/README.md:863`) |
| `EXPO_PUBLIC_TERMS_URL` | `mobile/src/design/TickRow.tsx:60` | The published Terms | **Not set.** No document exists (`docs/implementation-status.md:587`) |
| `EXPO_PUBLIC_PRIVACY_URL` | `mobile/src/design/TickRow.tsx:61` | The published privacy policy | **Not set.** No document exists |
| `EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED` | `mobile/src/services/accountDeletion.ts:11-12` | `true`, only once deletion is live | Off. It must stay off until the server side is ready |

`mobile/.env.example` lists six of these (lines 1, 2, 5, 8, 10, 14). It does not list `EXPO_PUBLIC_TERMS_URL` or `EXPO_PUBLIC_PRIVACY_URL`.

The privacy policy link exists only in the sign-up tick, and only when the variable is set (`mobile/src/design/TickRow.tsx:60-70`). Guideline 5.1.1(i) wants it "within the app in an easily accessible manner" ([App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)). Data & privacy should link to it too. The privacy and legal audits own the details.

### 2.5 TestFlight builds on record

The last build on record is **build 8**, on 16 Oct 2026 (git `d0a3803`). The roadmap's Phase 0 build is not recorded as done (`docs/superpowers/plans/2026-11-11-roadmap-connections-groups-chat.md:23`), and neither are the chat runbook's step 6 build (`qa/chat-release/README.md:699`) or the creating-a-resbite build (`qa/creating-a-resbite-2026-10-31/README.md:116`).

The 16 Nov counts show 7 chat messages, 2 chat-rules acceptances and 5 device endpoints (`qa/open-beta-2026-11-16/hosted-counts-after.json`). So a chat-capable, push-enabled build is probably in testers' hands. **Inference, not recorded.** The submission needs a recorded build: its number, its commit and the EAS variable values it was built with.

### 2.6 Production build contents that would fail review

- **The Wellness tab shows sample figures to every signed-in user.** It carries a "Sample data" chip (`mobile/app/(tabs)/wellness.tsx:33`), and its sheet says "These are example numbers for design review" (`:63-67`). The tab is in the production tab bar (`mobile/app/(tabs)/_layout.tsx:46-52`). Guideline 2.1(a): "placeholder text, empty websites, and other temporary content should be scrubbed before submission". **High.** Hide the tab, or replace it with real data.
- **The PreviewNotice is not a problem.** Preview mode only exists in development builds (`mobile/app/index.tsx:84`, `__DEV__`), so the chip never shows on an App Store build.
- **The deletion screen says "development build"** (`mobile/app/delete-account.tsx:166`). Fixed by section 4.5.

---

## 3. App Store Connect material

| Item | Exists? | Evidence and notes |
|---|---|---|
| App record and bundle id | Yes | TestFlight builds were uploaded under `com.resbite.app` (`qa/ux2-2026-10-14/README.md:96`, `:118-119`). |
| Notes for App Review | **Draft** | `qa/chat-release/app-store-review-notes.md:13-37`. Needs a rewrite for a first submission: (a) "This version adds a chat" (`:14`) reads wrongly when there is no earlier version; (b) "invitation-only app" (`:14`) is no longer true since the open beta (OB-D1, `knowledge-base/08-decisions.md:772`); (c) there is nothing on account deletion, which reviewers check; (d) phone sign-in and SMS are not explained; (e) three placeholders are unfilled (`:3`). The "24 hours" promise (`:33`) needs the backup reader. |
| Review account plan | **Draft** | `qa/chat-release/README.md:707-716`. It says the account's "email is on the tester roster" (`:709`). The roster no longer decides access since OB-D1. The account still needs a confirmed phone and a name. Reviewers may delete the account, so plan to recreate it. |
| Sign-in information | No | Goes into App Store Connect only (`:710`). |
| Screenshots | **None** | At least one set for iPhone with Dynamic Island, plus a large-display set; at most 10 per size; no iPad set ([Apple screenshot specs](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)). Guideline 2.3.9 asks for fictional account information in screenshots. |
| Name, subtitle, description, keywords, promotional text, category | **None** in the repo | — |
| Support URL | **None** | App Store Connect needs a web page, not an email (`qa/chat-release/README.md:714`). `link.resbite.com/` redirects to `www.resbite.com` (`qa/contact-invites-2026-10-28/README.md:58`), and that site had no terms or privacy page on 28 Oct (same line). **UNVERIFIED** whether it has a support page now. Guideline 1.5 requires accurate contact information. |
| Privacy policy URL | **None** | Required in App Store Connect and in the app ([guideline 5.1.1(i)](https://developer.apple.com/app-store/review/guidelines/); [App privacy details](https://developer.apple.com/app-store/app-privacy-details/)). The only policy in the repo is the 2020 website text (`knowledge-base/audit/extracted-text/S0913--website-privacy-policy.txt`). |
| Age rating answers | **None** | The new questionnaire has applied since 31 Jan 2026 ([Apple upcoming requirements](https://developer.apple.com/news/upcoming-requirements/)). Resbite's honest answers (messaging and chat, user-generated content) score 4+ ([Apple age ratings](https://developer.apple.com/help/app-store-connect/reference/age-ratings-values-and-definitions/)). **But the terms say 18+**, and Apple says: "If your app has a EULA with minimum age requirements that exceed the rating that Apple calculated, you must override to a rating that adheres to the requirements" ([Set an app age rating](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/)). So **override to 18+**. |
| App Privacy answers | **None** | Required for new apps; covers third-party SDKs too ([App privacy details](https://developer.apple.com/app-store/app-privacy-details/)). From the code, the data types are at least: name, email, phone number; contacts (looked up against Resbite); photos (profile and cover); other user content (titles, descriptions, notes); text messages (chat); user ID and device ID (push token); coarse or precise location if the location picker sends coordinates; product interaction (link opens, GI2-D9, `knowledge-base/08-decisions.md:342`). All are for app functionality, none for tracking. The privacy audit should confirm the list. |
| Export compliance | In the binary | `ITSAppUsesNonExemptEncryption: false` (`mobile/app.json:16`). |
| Price and availability | Owner's answer | Free; UK only (session memory, 17 Nov 2026). Not in the repo. UK only means no EU trader status for now, which Apple requires only for the EU ([Apple upcoming requirements](https://developer.apple.com/news/upcoming-requirements/)). |
| Seller name | **Open** | The owner wants Resbite Ltd as the seller (session memory). That needs an Apple Developer Program **organisation** membership. **UNVERIFIED** which kind the current team is. |
| External TestFlight | **Unrecorded** | The link page's "Get the app" points at a TestFlight invitation (P6, `knowledge-base/08-decisions.md:298`), which suggests a public link, and so a passed TestFlight App Review. Not recorded. |

---

## 4. Operations

### 4.1 Moderation and the reports queue

- **Built and live.** Reports (20 per account per day, `supabase/migrations/20261111160000_chat_safety.sql:1133`), blocks, the chat rules, blocked terms, and the moderators' push "A new report is waiting." The daily read is `supabase/ops/open-reports.sql`. Closed reports are deleted after 180 days (`:840-842`). There are scripts to remove a message, suspend, close and purge. The runbook duty is in `qa/chat-release/README.md:827-858`.
- **One moderator, the owner** (`qa/chat-release/README.md:869`). **No backup reader** (R-Q4). The runbook makes R-Q4 release-blocking for submission (`:367`, `:715`; `knowledge-base/08-decisions.md:749`).
- **No moderation screen.** Moderators work in the hosted SQL editor (`qa/chat-release/README.md:360`). So each moderator needs dashboard access, which only the owner can grant. Fine at beta scale; it does not scale to a public launch.
- **Coverage gaps against guideline 1.2** ("a method for filtering objectionable material", "a mechanism to report offensive content", [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)):
  - Blocked terms check messages and announcements only. Titles, notes to guests and names are not checked (`qa/chat-release/app-store-review-notes.md:7`).
  - There is no "Report this resbite" for a title or cover photo (CH-S14, `knowledge-base/08-decisions.md:734`). Reporting the host covers it indirectly.
  - A guest a host removed cannot report that host in the app (`qa/chat-release/README.md:1031`). The support address covers it, and there is none yet.
- **Status: High.** Needs the backup reader named and added to `moderators.sql`. Medium for the coverage gaps.

### 4.2 Suspending an account

- `supabase/ops/suspend-account.sql` records a revoked grant, so it still works after the open beta (`:5-8`; OB-D2, `knowledge-base/08-decisions.md:773`). The owner then bans the account in Auth by hand (`qa/chat-release/README.md:839`). There is an undo.
- **Gap:** it takes a **report id** only (`supabase/ops/suspend-account.sql:14`). There is no way to suspend someone reported by email, or for something no in-app report covers (a title, a cover photo, a removed guest's complaint), without writing new SQL. Medium.

### 4.3 Support inbox and contact

- **Not set up.** `EXPO_PUBLIC_SUPPORT_ADDRESS` is unset (`qa/chat-release/README.md:863`). Without it, Data & privacy shows no Contact topic (`mobile/app/data-privacy.tsx:28`), and a report's thanks shows no address (`mobile/src/design/ReportSheet.tsx:69`).
- The suspended-account screen says "contact the Resbite team" with no way to do so (`mobile/app/account.tsx:134`). So does the taken-number message (`mobile/src/domain/phoneCopy.ts:33`).
- The owner has chosen role addresses for support and privacy and will create the inboxes (session memory, 17 Nov). They are not in the repo yet.
- **Blocker.** The runbook blocks the build and the submission on it (`qa/chat-release/README.md:695-697`, `:713`).

### 4.4 Data-subject requests (access, rectification, erasure, objection, complaints)

- **No process and no tooling in the repo.** No runbook, no script to export a person's data, no log of requests. I searched `docs/`, `qa/`, `knowledge-base/`, `supabase/` and `reports/` for subject access, DSAR, ROPA, DPIA and breach terms. They appear only in the phone-messaging research.
- **What the law asks.** Respond within one month (UK GDPR Art. 12(3)). Since the Data (Use and Access) Act 2025, the clock may pause while waiting for information from the requester, and searches need only be "reasonable and proportionate" (s.78) ([gov.uk DUAA factsheet](https://www.gov.uk/government/publications/data-use-and-access-act-2025-factsheets/data-use-and-access-act-factsheet-uk-gdpr-and-dpa); [ICO subject access guide](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/subject-access-requests/a-guide-to-subject-access/)). The Act also adds a duty to take data protection complaints, for example by an electronic form, and to acknowledge them within 30 days (new DPA 2018 s.164A, DUAA s.103, [legislation.gov.uk](https://www.legislation.gov.uk/ukpga/2025/18/section/103)). **UNVERIFIED:** the commencement date of s.103 and of the Art. 12A time-limit changes.
- **Needed:** a privacy inbox; a short runbook (identity check, the one-month clock, what to export from which tables, how to answer); an export script for the SQL editor, in the style of the ops scripts; a complaints route. **High.**

### 4.5 Account deletion (the operations side)

- **App:** the full flow is built but switched off (`mobile/src/services/accountDeletion.ts:11-12`). It shows "not enabled in this development build" (`mobile/app/delete-account.tsx:166`). It also needs an email on the session (`:67-68`), so **phone-only accounts can never delete**.
- **Server:** three gates are off: the source constant (`supabase/functions/_shared/deletion-release.ts:4`), the server variable, and the app variable (`supabase/functions/delete-account/README.md:3`). Four migrations and two functions are not on hosted (section 1).
- **OB-D5 is confirmed.** `request_account_deletion` still needs a confirmed email (`supabase/migrations/20261116120000_open_beta.sql:224`). `prepare_deletion_intent` still needs a roster row and a confirmed email (`supabase/migrations/20260929125858_deletion_intent_reservations.sql:32`). See `qa/deletion-recovery-ledger.md:64` and `knowledge-base/08-decisions.md:776`.
- **Out of date with chat.** `activate_deletion_intent` predates connections, circles and chat. It writes chat lines and keeps messages (`docs/superpowers/plans/2026-11-11-roadmap-connections-groups-chat.md:109`). Two deletions at once can deadlock on groups (`qa/chat-release/README.md:1017`).
- **No Sign in with Apple token revocation.** It is deferred (`docs/implementation-status.md:615`), and no code calls Apple's revoke endpoint (searched `supabase/functions`, `mobile/src`, `mobile/app`). Apple: "Apps that support Sign in with Apple should use the Sign in with Apple REST API to revoke user tokens" ([Offering account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/)).
- **The self-imposed gate.** Release needs an independent, encrypted deletion ledger in a separate project, a restore rehearsal and approved retention (`qa/deletion-recovery-ledger.md:21-32`; `qa/b0-retention-proposal.md:28-43`). None of that exists yet. **This is a design choice, not an Apple rule.** Apple allows a manual process: "If your process for account deletion is manual or otherwise takes a reasonable amount of time to complete, this is acceptable. Inform the person how long it will take… and provide a confirmation when the deletion is complete" ([Offering account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/)). Email-only deletion is not acceptable for a non-regulated app (same page).
- **Owner decision needed.** Either finish the full lifecycle, or ship a simpler first version: an in-app request that blocks access at once, a stated completion time, an owner runbook to finish it, and a confirmation. Both need hosted migrations and owner approval.
- **Blocker.**

### 4.6 Breach response

- **No runbook.** Nobody is named, there is no template and no breach log.
- **The law:** notify the ICO "without undue delay and, where feasible, not later than 72 hours" after becoming aware, unless the breach is unlikely to risk people's rights; document every breach (UK GDPR Art. 33(1), 33(5)) ([legislation.gov.uk Art. 33](https://www.legislation.gov.uk/eur/2016/679/article/33); [ICO breach guide](https://ico.org.uk/for-organisations/report-a-breach/personal-data-breach/personal-data-breaches-a-guide/)). The live fetch of the article returned no body; the wording is from search extracts of those pages.
- **Known exposures that would be breaches if used:** test mode (4.7); the worker secret held briefly in `net.http_request_queue` (`qa/push-notifications-2026-10-30/README.md:115`).
- **High.**

### 4.7 SMS provider and phone test mode

- **No paid SMS** (CI-D10, `knowledge-base/08-decisions.md:388`). **Test mode is on:** every code step accepts `000000` for any number (CI-D13, `:391`; `docs/implementation-status.md:628`). The web invitation flow uses it too (`qa/contact-invites-2026-10-28/README.md:70`).
- **Why it blocks launch.** The runbook says it plainly: "anyone who knew a number could sign into its account with 000000" (`qa/phone-accounts-2026-10-27/README.md:90`). Since the open beta, any confirmed account may use the app. On a public build, anyone could also register someone else's number, show as "On Resbite" in friends' contacts, and receive their invitations. The anonymous-callable `exchange_test_code` is one of the 10 standing advisor WARNs (`qa/creating-a-resbite-2026-10-31/README.md:114`).
- **What switching off takes** (`qa/phone-accounts-2026-10-27/README.md:90-128`): a provider behind the Send SMS hook, then in one sitting: test mode off, stored codes emptied, every session revoked, and the log and new identities reviewed.
- **Provider research is done.** UK codes cost about 4 to 6 US cents. SMS pumping is the main cost risk, so rate limits and CAPTCHA are needed (`reports/Phone messaging providers.md:5`, `:30-40`). The SMS-sent rate limit was to be raised "for testing" (`qa/phone-accounts-2026-10-27/README.md:62`). It must come back down.
- **Blocker.**

### 4.8 Push sender

- **Live.** The cron job runs every minute (`supabase/ops/schedule-deliver-notifications.sql:33`) with a 10-second timeout (`:44`). The sender is version 5 (`qa/chat-release/README.md:867`).
- **Throughput:** about 25 jobs a minute (`qa/push-notifications-2026-10-30/README.md:132`). The first claim takes 25, later claims take 10 within a 5-second budget (`supabase/functions/_shared/notification-engine.ts:138`, `:154`). Enough for the beta, but thin for a public launch with busy chats. The runbook's step 8 throughput check has not been run (`qa/chat-release/README.md:808`).
- **App side unrecorded:** the APNs key in EAS and `EXPO_PUBLIC_PUSH_ENABLED` (section 2.4).
- **Low to medium.**

### 4.9 Scheduled jobs (roll, cleanup, retention)

| Job | State | Evidence |
|---|---|---|
| `deliver-notifications` | Live, every minute | above |
| `roll-repeating-plans` (weekly groups) | **Not created** | `qa/creating-a-resbite-2026-10-31/README.md:116`. On 12 Nov only `deliver-notifications` existed (`qa/chat-release/README.md:864`). Its preconditions (follow-ups live, a build with the screens) now appear met. **Without it, a weekly group never gets next week's resbite**, and "weekly groups" is a headline feature. **High.** |
| Account cleanup, receipt purge, orphan photo cleanup | Not deployed, gated off | section 1.2 |
| `link_opens` pruning | Manual, through the SQL tool (`docs/implementation-status.md:593`) | No schedule |
| Closed reports purge | Manual, when the daily read shows `due` (`qa/chat-release/README.md:841`) | Acceptable while someone reads daily |
| Outbox retention | None (K-N11, `qa/chat-release/README.md:1007`; roadmap `:107`) | Grows by one row per recipient per message |
| Phone numbers of people not on Resbite | No retention rule | The SMS research asks for one (`reports/Phone messaging providers.md:5`) |

The beta milestone asked for a retention schedule "before a wider cohort" (`docs/milestones/2026-09-23-expanded-private-beta.md:208`). None is approved. **Medium** (the storage-limitation principle; the privacy policy will have to state the periods).

### 4.10 Monitoring and alerts

- **None.** There is no crash or error reporting in the app (no Sentry or similar in `mobile/package.json:14-54`). There is no alert on cron failures or queue age; the sender's runs are checked by hand (`qa/connections-2026-11-10/README.md:91`). Supabase logs last seven days on Pro (`qa/b0-retention-proposal.md:24`).
- The beta plan itself asked for "sanitized error reporting, queue failure visibility, cost/usage checks, restore procedures" (`docs/milestones/2026-09-23-expanded-private-beta.md:210`).
- **Medium.** Not an App Store rule. But a public launch with a 24-hour moderation promise needs at least a failure alert on the sender and the roll job.

### 4.11 Backups and restore

- Pro daily backups for seven days; point-in-time recovery off; database backups do not include Storage file contents (`qa/b0-retention-proposal.md:22-23`). So profile and cover photos have no backup.
- **No restore has ever been rehearsed.** The restore gate (keep the app closed and replay deletions after a restore) is design only (`qa/b0-retention-proposal.md:28-32`).
- **Medium.** Decide whether to turn on point-in-time recovery for launch (a cost decision), and rehearse one restore into a scratch project.

### 4.12 Rate limits and abuse controls

| Control | State | Evidence |
|---|---|---|
| Reports | 20 per account per day | `supabase/migrations/20261111160000_chat_safety.sql:1133` |
| Moderator push | at most 1 per 10 minutes each | CH-S16, `knowledge-base/08-decisions.md:736` |
| Contact lookup and invites | 500 numbers per day per host | `docs/implementation-status.md:664` |
| Link opens | 60 a minute per link | `docs/implementation-status.md:573` |
| Email sends | 60 seconds per user (SMTP) | `docs/implementation-status.md:213` |
| Leaked passwords | Blocked | `docs/implementation-status.md:302` |
| Vercel firewall on `/r/*` | Exists | `qa/open-link-approval-2026-10-29/README.md:74` |
| Vercel firewall on `/i/*` | **Not done** | `qa/contact-invites-2026-10-28/README.md:62` |
| SMS sends | Raised for testing; to be restored | `qa/phone-accounts-2026-10-27/README.md:62` |
| CAPTCHA on Auth | **None** on record | — |
| Push endpoints per account | **No cap** | `qa/push-notifications-2026-10-30/README.md:127` |

**Medium.** CAPTCHA and SMS limits become high once paid SMS starts.

### 4.13 The link site (`link.resbite.com`)

- **Live.** Last production deploy on 13 Nov 2026 (`qa/circles-of-trust-2026-11-10/README.md:363`). It serves the Apple app-site file, `/r/` and `/i/` pages and the image route.
- **Launch changes needed:**
  - `APP_STORE_URL` still points at the TestFlight invitation, and `APP_STORE_ID` is empty, so there is no smart banner (P6, `knowledge-base/08-decisions.md:298`).
  - `TERMS_URL` and `PRIVACY_URL` are unset (`qa/contact-invites-2026-10-28/README.md:58`).
  - `TERMS_VERSION` defaults to `2026-10` (same line). People have ticked "I agree to the Terms and Privacy Policy" against a version that has no document. Decide whether to re-ask once the documents exist.
  - The `/i/*` firewall rule.
- **Phone-key side effect.** The 13 Nov deploy carried the phone-key page. The phone-key runbook meant the page, the build and the rewrite script for older Argentine accounts to go out minutes apart. The script is still recorded as not run (`qa/phone-key-2026-10-29/README.md:101`; roadmap `:27`). **Low.** The launch is UK only, but existing Argentine testers could end up with two accounts.
- A natural home for the support, privacy and terms pages, if `www.resbite.com` is not used.

### 4.14 Online Safety Act records (UK)

- Chat between users makes Resbite a user-to-user service. It has been live to UK testers since 13 Nov.
- **What the Act asks:**
  - an illegal content risk assessment within three months of starting as such a service, kept up to date;
  - a children's access assessment, with its outcome recorded;
  - a children's risk assessment if children are likely to use the service.

  A self-declared 18+ tick is not "highly effective age assurance", so the children's access assessment must look at whether children are likely to use the service. Sources: Online Safety Act 2023 Sch. 3 ([legislation.gov.uk](https://www.legislation.gov.uk/ukpga/2023/50/schedule/3)) and Ofcom guidance, read through search extracts only, since ofcom.org.uk refused automated reads ([Ofcom compliance guide](https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/guide-for-services); [Ofcom March 2026 bulletin](https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/online-safety-industry-bulletins/online-safety-industry-bulletin-march-2026)). **Partly UNVERIFIED.**
- **None of these records is in the repo.** The legal audit owns the content. Operations owns keeping them and reviewing them at least yearly. **High.**

---

## 5. Knowledge-base items that block launch

| Item | What it says | Why it blocks |
|---|---|---|
| D22 | "No calendar deadline or public App Store launch was selected." (`knowledge-base/08-decisions.md:115`) | The owner's 17 Nov request supersedes it (session memory). Record a decision for the public launch, UK only, free. |
| Q13 | Data rules "are still to be written" (`knowledge-base/05-open-questions.md:68`; `knowledge-base/08-decisions.md:66`) | The privacy policy, retention and deletion all depend on them. |
| Retention schedule | "Before a wider cohort, agree the beta retention schedule, backup/log retention, report-evidence lifetime, moderation process and service budget." (`docs/milestones/2026-09-23-expanded-private-beta.md:208`); also `:280` | Not agreed. The proposal is unapproved (`qa/b0-retention-proposal.md:3`). |
| Minimum age | The milestone says "no minimum age is yet approved" (`docs/milestones/2026-09-23-expanded-private-beta.md:272`). GI2-D3 built an 18+ tick (`knowledge-base/08-decisions.md:336`) | Record 18+ as the decision. It drives the age rating override and the OSA assessment. |
| OB-D5 | Deletion functions still need a roster row or grant and a confirmed email (`knowledge-base/08-decisions.md:776`) | Deletion cannot ship until changed. |
| CI-D10, CI-D13 | No paid SMS; test mode for any number (`knowledge-base/08-decisions.md:388`, `:391`) | Must be reversed for a public release. |
| R-Q4 | A backup reader is release-blocking (`knowledge-base/08-decisions.md:749`) | Not named. |
| Support address | Default none, and the release waits (`knowledge-base/08-decisions.md:741`) | Not set. |
| G-B4(d) | The Terms document is "the owner's" and `TERMS_VERSION` stays as is until the App Store submission (roadmap `:88`; `knowledge-base/08-decisions.md:728`) | No Terms exist. The chat rules promise that rule-breakers "can lose their account", which the Terms should back. |
| Roll job | Hold until Phase 1 is live (roadmap `:30`, `:83`) | Phase 1 is live. The job can now be created. |
| Stephen | "What to tell Stephen. Five departures…" (roadmap `:92`) | Not a launch blocker; listed for completeness. |

`knowledge-base/05-open-questions.md` is historical (line 3). Its open items are covered above.

---

## 6. Steps that need the owner's explicit approval

Nothing below has been done by this audit. Each step needs the owner's approval when it is run. Hosted SQL is approved by file name and sha256, never with `supabase db push` (roadmap `:97-99`).

**Supabase (hosted project and dashboard)**

1. The deletion migrations, once reworked: the lifecycle, receipt retention, intent reservations (with the OB-D5 and chat changes), the split GI2 companion, and the orphan-photo cleanup if retention needs it. Each by name and sha256, with before and after snapshots.
2. Deploy `delete-account` and `cleanup-account` (and `purge-deletion-receipts` and `cleanup-profile-photos` if used), with their secrets and the source-gate commits.
3. A cron schedule for the deletion cleanup worker.
4. Sign in with Apple token revocation: an Apple private key as a function secret, and a deploy.
5. Turn off phone test mode, empty the codes, revoke all sessions and review the log (`qa/phone-accounts-2026-10-27/README.md:90-128`).
6. Auth dashboard: connect the SMS provider through the hook; restore the SMS rate limit; CAPTCHA; confirm OTP length and expiry, manual linking and the Apple provider (all unrecorded).
7. Create the `roll-repeating-plans` cron job (`qa/creating-a-resbite-2026-10-31/README.md:79-105`).
8. Add the backup moderator with `moderators.sql` in the SQL editor. Each moderator needs dashboard access.
9. Run the phone-key rewrite script for older Argentine accounts (`qa/phone-key-2026-10-29/README.md:101`).
10. Turn on point-in-time recovery, if chosen (a cost).
11. Any retention purge jobs that come out of the approved schedule.
12. Run the advisors after each change, through the MCP server (`qa/chat-release/README.md:339`).

**Vercel (link site)**

13. Set `TERMS_URL`, `PRIVACY_URL`, `APP_STORE_URL` (the App Store link) and `APP_STORE_ID`. Decide whether to bump `TERMS_VERSION`. Then regenerate and redeploy.
14. Add the firewall rate limit on `/i/*`.
15. If the support, privacy and terms pages live on this site, deploy them.

**EAS and Apple Developer**

16. Set `EXPO_PUBLIC_SUPPORT_ADDRESS`, `EXPO_PUBLIC_TERMS_URL` and `EXPO_PUBLIC_PRIVACY_URL`. Confirm `EXPO_PUBLIC_PUSH_ENABLED=true` and `EXPO_PUBLIC_INVITATION_ORIGIN`. Set `EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED=true` only once deletion is live.
17. Confirm the APNs key is in EAS credentials.
18. The submission build (`npx eas build --platform ios --profile production`), after every variable above, then `eas submit`.
19. Confirm or change the Apple Developer Program membership to an organisation, if Resbite Ltd is to be the seller.

**App Store Connect**

20. App information: name, subtitle, category, privacy policy URL, support URL, age rating questionnaire **with the override to 18+**, App Privacy answers, price (free), availability (United Kingdom).
21. Version page: screenshots, description, keywords, promotional text, the review notes (rewritten), sign-in information for the review account.
22. Release the build to TestFlight testers (the chat runbook's step 6), then submit for review (step 6a).

**Inboxes and documents (outside the repo)**

23. Create the support and privacy inboxes. Publish the privacy policy, terms and support page. Write down the ROPA, DPIA, OSA risk assessments and breach log, where the legal audit says they are needed.

---

## 7. Suggested order

1. **Decisions:** the deletion approach; the SMS provider and budget; the backup reader; the Wellness tab; 18+ recorded; the retention schedule; the seller account.
2. **Documents and inboxes:** privacy policy, terms, support page; support and privacy inboxes. These unblock the EAS and Vercel variables.
3. **Code:** deletion (with OB-D5, the chat steps and Apple revocation); remove or replace the Wellness sample; a privacy policy link in Data & privacy; the review-notes rewrite; an export script and the DSAR, breach and complaints runbooks; alerts on the sender and roll jobs.
4. **Hosted, one sitting each, with approval:** the SMS provider and test mode off; the deletion migrations and functions; the roll job; the backup moderator.
5. **Link site redeploy**, then the **submission build**, then the chat device checks (step 7) on that build.
6. **App Store Connect** entries, then submit.
7. **Fix the records drift** in `docs/implementation-status.md` (lines 11-19).

---

## Sources

Apple
- Upcoming requirements (Xcode 26 since 28 Apr 2026; iOS 13 target since 9 Sep 2026; age rating answers by 31 Jan 2026; EU trader status): https://developer.apple.com/news/upcoming-requirements/
- App Review Guidelines (1.2, 1.5, 2.1, 2.3, 4.8, 5.1.1): https://developer.apple.com/app-store/review/guidelines/
- Offering account deletion in your app: https://developer.apple.com/support/offering-account-deletion-in-your-app/
- App privacy details: https://developer.apple.com/app-store/app-privacy-details/
- Age ratings values and definitions: https://developer.apple.com/help/app-store-connect/reference/age-ratings-values-and-definitions/
- Set an app age rating (override; minimum-age EULAs): https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/
- Screenshot specifications: https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/
- Invite external testers: https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers/

Expo
- Build infrastructure (SDK 57 image, Xcode 26.6): https://docs.expo.dev/build-reference/infrastructure/
- Apple privacy manifests: https://docs.expo.dev/guides/apple-privacy/

UK law and regulators
- UK GDPR Art. 33 (breach notification): https://www.legislation.gov.uk/eur/2016/679/article/33
- ICO, personal data breaches: https://ico.org.uk/for-organisations/report-a-breach/personal-data-breach/personal-data-breaches-a-guide/
- ICO, subject access guide: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/subject-access-requests/a-guide-to-subject-access/
- gov.uk, DUAA factsheet (UK GDPR and DPA): https://www.gov.uk/government/publications/data-use-and-access-act-2025-factsheets/data-use-and-access-act-factsheet-uk-gdpr-and-dpa
- DUAA 2025 s.103 (complaints): https://www.legislation.gov.uk/ukpga/2025/18/section/103
- DUAA 2025 s.78 (reasonable and proportionate searches): https://www.legislation.gov.uk/ukpga/2025/18/section/78
- Online Safety Act 2023, Schedule 3: https://www.legislation.gov.uk/ukpga/2023/50/schedule/3
- Ofcom, compliance guide for services (search extract only; automated read refused): https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/guide-for-services
- Ofcom, March 2026 industry bulletin (search extract only): https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/online-safety-industry-bulletins/online-safety-industry-bulletin-march-2026

**UNVERIFIED in this audit:** the commencement dates of DUAA s.103 and Art. 12A; Ofcom's exact current wording on the three-month timing and on self-declaration (Ofcom blocked reads); the live text of UK GDPR articles (legislation.gov.uk returned empty pages to the fetch tool); every hosted value not recorded in the repo (Auth settings, EAS variables and credentials, TestFlight builds after build 8, external testing, the developer account type).
