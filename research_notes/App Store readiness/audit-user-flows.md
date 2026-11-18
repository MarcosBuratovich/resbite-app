# App Store readiness: audit of user-facing flows

17 November 2026. Read-only audit of `main` at `db8a221` (clean tree). Nothing hosted was touched: the hosted state below is read from the repo's records only.

## How to read this

- **Status:** Complete, Partial or Missing, for the flow as the app stands on `main`.
- **Hosted:** LIVE means the backend it needs is recorded as applied on the hosted project. LOCAL ONLY means the code exists in the repo but the records show it is not applied or not deployed. UNKNOWN means the repo has no record either way.
- **Severity:** Blocker (App Review will reject, or a legal or security duty is unmet), High, Medium, Low.
- Hosted state comes from `supabase/tests/hosted-baseline/migrations.txt`, `docs/implementation-status.md` and the `qa/*/README.md` rollout records. Where they disagree, the newest dated record wins. For example, `docs/implementation-status.md:15-19` still says chat is "built, not hosted", but `migrations.txt:27-29` and `qa/chat-release/README.md:860-869` record chat core, groups and safety as applied on 12–13 November 2026.
- Requirements are cited to primary sources at the end. Anything not confirmed from a primary source in this session is marked UNVERIFIED.

## Hosted baseline in one view

**Migrations applied on hosted** (`supabase/tests/hosted-baseline/migrations.txt:3-29`): the foundation, access status, registration details, catalogue, avatars, custom events, covers, UX2 rules, UX3 details, GI1 links, GI2 guest accounts, phone accounts, contact invitations, open-link approval, push delivery, phone key, creating a resbite, connections (three files), chat core, chat groups, chat safety and the open beta.

**Migrations that exist locally but are NOT on hosted** (absent from `migrations.txt`):
- `20260918001316_account_deletion_lifecycle.sql`
- `20260923152816_orphan_profile_photo_cleanup.sql`
- `20260923152943_deletion_receipt_retention.sql`
- `20260929125858_deletion_intent_reservations.sql`
- `20261022120001_gi2_local_delivery_and_deletion.sql`
- `20260918001308_notification_delivery_preparation.sql`, `20261014130000_ux2_notification_wording.sql`, `20261015130000_ux3_note_delivery.sql` (replaced by push delivery and never to be applied: `docs/implementation-status.md:719`)

**Edge functions with a deployment record:** `deliver-notifications` (version 5, 13 November 2026, `qa/chat-release/README.md:867`) and `fold-phone-account` (28 October 2026, `qa/contact-invites-2026-10-28/README.md:54`). **No deployment record** for `delete-account`, `cleanup-account`, `cleanup-profile-photos` or `purge-deletion-receipts`.

**Settings recorded:** Realtime public access off (`qa/chat-release/README.md:868`); one moderator, 37 blocked terms (`qa/chat-release/README.md:869`); support address not set and backup moderator not named (`qa/chat-release/README.md:863`, `:869`).

## Summary

| # | Flow | Status | Hosted | Severity | Main gap |
|---|---|---|---|---|---|
| 1 | Phone code sign-up and sign-in | Partial | LIVE, in test mode | **Blocker** | 000000 opens any account; no SMS is ever sent |
| 1 | Sign in with Apple, Google, email | Partial | LIVE (Apple provider setting UNKNOWN) | High | New accounts made this way never see the 18+ and terms tick |
| 1 | 18+ and terms tick | Partial | LIVE (recorded, not enforced) | High | No terms or privacy document; tick not enforced by the server |
| 2 | Privacy policy and terms links | **Missing** | n/a | **Blocker** | No documents exist; no link in Profile or Data & privacy; URL variables unset |
| 3 | Account deletion in the app | **Missing** (built, switched off) | LOCAL ONLY | **Blocker** | Not live; screen says "development build"; phone-only and web-only accounts excluded; no Apple token revocation |
| 4 | UGC safety (Guideline 1.2) | Partial | LIVE | **Blocker** until the address is set | Contact address unset; one moderator; queue only in the SQL editor |
| 5 | Permissions | Mostly complete | n/a | Low | Location and motion strings declared for a feature the app never uses |
| 6 | Data rights, contact, complaints | **Missing** (partly) | n/a | High | No export, no contact route, no complaints process (UK law since 19 June 2026) |
| 7 | Content App Review may reject | Partial | n/a | **Blocker** | Wellness tab of sample data; beta, test and development wording |
| 8 | Link web site | Partial | LIVE (deployed site version UNKNOWN) | High | No privacy notice; test-mode codes; no deletion route for web accounts |

---

## 1. Sign-up and sign-in

### 1a. Phone number and six-digit code

**Status: Partial. Hosted: LIVE in test mode. Severity: Blocker.**

What exists:
- Sign-up and sign-in by number and code: `mobile/app/auth/phone.tsx:19-136`. The landing's "Get started" goes to the introduction, then sign-up; "I have an account" opens phone sign-in (`mobile/app/index.tsx:57-71`).
- Every account must have a verified number before it can use the app: `mobile/src/domain/accountRoute.ts:10-13`, enforced at `mobile/app/account.tsx:67-75`, with "Add your number" as the only way on (`mobile/app/add-phone.tsx:15`).

Test mode (decision CI-D13, `knowledge-base/08-decisions.md:391`) is still on, as far as every record shows:
- The switch defaults to on: `private.phone_mode.test_mode boolean not null default true` (`supabase/migrations/20261027120000_phone_accounts.sql:13-18`).
- The Send SMS hook stores the code and sends nothing while test mode is on (`supabase/migrations/20261030130000_phone_key.sql:26-47`).
- `public.exchange_test_code` returns the real stored code to anyone who sends `000000` for a number whose code was "sent" in the last ten minutes (`supabase/migrations/20261030130000_phone_key.sql:52-71`). It is granted to `anon` and `authenticated` (`supabase/migrations/20261027120000_phone_accounts.sql:97-98`).
- The app swaps `000000` for the real code before verifying (`mobile/src/services/phoneCode.ts:18`, `:68`, `:85-89`). So does the link web site (`links/assets/personal.js:446`).
- The phone runbook records `test_mode = true` (`qa/phone-accounts-2026-10-27/README.md:45`). Its switch-off step (`qa/phone-accounts-2026-10-27/README.md:90-120`) has no completion record anywhere in `qa/` or `docs/`.
- The open-beta snapshot of 16 November 2026 still holds 5 stored test codes and 35 test-mode log rows (`qa/open-beta-2026-11-16/hosted-counts-after.json`, rows `private.test_codes` and `private.test_mode_log`). So the hook is active and phone sign-in is on.

What this means today:
1. **Account takeover.** Anyone who knows a person's number can sign in to that person's account. They ask for a code on sign-in, type 000000, and the server hands back the real code. The runbook says this in plain words: "anyone who knew a number could sign into its account with 000000" (`qa/phone-accounts-2026-10-27/README.md:90`). With the open beta, any account can now hold chats, plans and invitations, so this is a live security risk (UK GDPR Article 32, security of processing; UNVERIFIED, not re-read this session).
2. **No real person can sign up.** No SMS is sent, but the screen says "We sent a 6-digit code to …" (`mobile/src/domain/phoneCopy.ts:14`). A member of the public who does not know 000000 is stuck at the code step. App Review would hit the same wall unless the review notes give a way in (Guideline 2.1).
3. **Switching test mode off without an SMS provider breaks sign-up.** The hook then answers 503 "Text messages aren't set up yet." (`supabase/migrations/20261030130000_phone_key.sql:35-37`), and since a number is mandatory, no new account can get past Add your number.

Missing:
- A real SMS provider behind the hook (see `reports/Phone messaging providers.md`), then the runbook's switch-off sitting: test mode off, codes emptied, every session revoked, the log and identities reviewed (`qa/phone-accounts-2026-10-27/README.md:90-120`).
- A sign-in route for App Review that does not depend on test mode. Options: a Supabase Auth test number with a fixed code, or an email and password review account. UNVERIFIED: the exact Supabase dashboard option was not checked this session.
- Removal of the `000000` swap from the app and the link site once test mode is off (it does nothing in live mode, but it is test-only code in a release build).

### 1b. Sign in with Apple, Google, and email and password

**Status: Partial. Hosted: LIVE (Google recorded as enabled; the Apple provider setting has no completion record). Severity: High.**

What exists:
- Apple and Google chips on phone sign-in only (`mobile/app/auth/phone.tsx:123-131`), and on email sign-in (`mobile/app/auth/index.tsx:223-228`). Apple shows only where it is available (iOS).
- Email and password sign-in, reset and confirmation: `mobile/app/auth/index.tsx:19-262`. Email sign-up now redirects to the phone screen (`mobile/app/auth/index.tsx:50`).
- Google enabled and accepted on the iPhone (`docs/implementation-status.md:252`). The Apple provider "on with client id …" is listed as an owner step (`docs/implementation-status.md:587`) with no record that it was done. Apple sign-in on the iPhone is part of a check list (`docs/implementation-status.md:603`) with no result recorded.
- Guideline 4.8: the app offers Google sign-in, so it must also offer an equivalent privacy-focused login. Sign in with Apple meets this on iOS.

Gaps:
- **The 18+ and terms tick is skipped.** The tick appears only on phone sign-up (`mobile/app/auth/phone.tsx:99-112`). A new person who taps "Continue with Apple" or "Continue with Google" on a sign-in screen gets an account with no tick. They then pass Add your number (`mobile/app/add-phone.tsx:56-84`, no tick) and About you (no tick). The tick is recorded only for a phone sign-up (`mobile/src/state/usePhoneVerification.ts:160`). The server does not require it either: `private.user_eligible` checks confirmation, suspension, ban and deletion only (`supabase/migrations/20261116120000_open_beta.sql:40-48`). The open-beta snapshot shows 4 age attestations (`qa/open-beta-2026-11-16/hosted-counts-after.json`), against 14 confirmed accounts (`docs/implementation-status.md:3`).
- **A number is required after Sign in with Apple** (CI-D8, `knowledge-base/08-decisions.md:386`). Guideline 5.1.1(v) allows personal information that is "directly relevant to the core functionality". Friends find and invite each other by number (`mobile/src/domain/phoneCopy.ts:30`), so there is a case. But a reviewer may see a demand for a phone number straight after a privacy-focused Apple login as defeating 4.8's purpose. The review notes should explain why the number is needed. This is a review risk, not a rule found in the guideline text.
- The "About access" sheet on email sign-in says "Private Resbite test · access is opened by invitation." (`mobile/app/auth/index.tsx:257-259`). That is wrong since the open beta and reads as test wording (section 7).

### 1c. The 18+ and terms tick

**Status: Partial. Hosted: LIVE (recorded once per account). Severity: High.**

- Text: label "I'm 18 or over"; sub-line "I agree to the Terms and Privacy Policy."; helper "Resbite is for people aged 18 and over." (`mobile/src/domain/guestAccount.ts:13-15`).
- Terms version recorded: `2026-10` (`mobile/src/domain/guestAccount.ts:4`), sent with `attest_age` (`mobile/src/services/phoneAccount.ts:18-21`) and with link joins (`mobile/app/invite.tsx:215-218`). The link site defaults to the same version (`links/server/lib/options.mjs:16`).
- "Terms" and "Privacy Policy" become links only when `EXPO_PUBLIC_TERMS_URL` and `EXPO_PUBLIC_PRIVACY_URL` are set at build time; otherwise they are plain words (`mobile/src/design/TickRow.tsx:60-70`). Neither variable is in `mobile/.env.example`, and the GI2 rollout lists setting them as an owner step with no record that it was done (`docs/implementation-status.md:587`).
- **No terms or privacy document exists in the repo for the app.** The only legal texts are an archived website policy, terms and cookie policy from December 2020, extracted from an old website snapshot (`knowledge-base/audit/extracted-text/S0913--website-privacy-policy.txt`, `…-terms-conditions.txt`, `…-cookie-policy.txt`). They cover a website, cite the EU GDPR, and name a legal entity that differs from the organisation recorded for the Supabase project (`docs/implementation-status.md:30`). Open question Q13 ("Define minimum data, visibility, contact handling, deletion and retention … These rules are still to be written") is still open (`knowledge-base/05-open-questions.md`, Recorded answers, Q13).
- So people tick "I agree to the Terms and Privacy Policy" and the app records version `2026-10` of documents that do not exist.

Missing: written Terms (with the chat rules and a zero-tolerance line for abuse) and a Privacy Policy; hosted URLs for both; the two variables set in EAS production before the build; the tick on every path that creates an account (Apple, Google, email), or a server-side check before first use; a decision on what `2026-10` means once real documents are published (a new version string, and asking existing accounts to agree again).

Minor: the optional date of birth accepts any date from 1900 to today, with no check against the 18+ rule (`mobile/src/domain/registration.ts:35-45`). Someone can tick "I'm 18 or over" and enter a date that says they are 12.

---

## 2. Links to a privacy policy and terms

**Status: Missing. Severity: Blocker.**

Guideline 5.1.1(i): every app must link to its privacy policy in App Store Connect and inside the app "in an easily accessible manner". The policy must say what is collected and how it is used, cover third parties, and explain retention, deletion and how to revoke consent.

| Place | What is there | Evidence |
|---|---|---|
| Sign-up tick | "Terms" and "Privacy Policy" as plain words unless the URL variables are set | `mobile/src/design/TickRow.tsx:60-70` |
| Sign-in screens | Nothing | `mobile/app/auth/phone.tsx:123-131`, `mobile/app/auth/index.tsx:229-256` |
| Profile | Rows: Connections, People and lists, Account details, Notifications, Data & privacy, Sign out. No Privacy Policy or Terms row | `mobile/app/(tabs)/profile.tsx:167-216` |
| Data & privacy | In-app topics only (On this device, Account & shared plans, Chat messages, Preview & samples, Contact when set), Blocked people, Delete account. No link to a policy or terms | `mobile/app/data-privacy.tsx:49-166` |
| Link web site | Terms and privacy links only inside the tick line, only if `TERMS_URL` and `PRIVACY_URL` are set on Vercel (both optional, default empty). No footer, no policy page | `links/server/lib/options.mjs:16-18`, `links/assets/personal.js:84-110`, `links/generate.mjs:106` |
| Site root | `/` redirects to an external marketing site that is not in this repo | `links/generate.mjs:85` |

Missing: the two documents, hosted at stable HTTPS addresses; a "Privacy Policy" and a "Terms" row in Profile or Data & privacy; links on the sign-in screens and on every link-site page; the Privacy Policy URL and a Support URL in App Store Connect (the runbook already notes the Support URL must be a web page, not an email: `qa/chat-release/README.md:714`).

---

## 3. Account deletion from inside the app

**Status: Missing (built, switched off). Hosted: LOCAL ONLY. Severity: Blocker.**

Guideline 5.1.1(v) and Apple's account-deletion page: an app that lets people create an account must let them start deleting it in the app. Deactivation alone is not enough. Email or support flows should not be required outside regulated industries. Apps that support Sign in with Apple should revoke the user's tokens through the Sign in with Apple REST API.

The path as built:
1. Profile → Data & privacy → Delete account (`mobile/app/data-privacy.tsx:158-166`). Easy to find: this part is fine.
2. The screen (`mobile/app/delete-account.tsx`): confirm it's you (email code, password, or Apple again for Apple-only accounts, `:170-232`), type DELETE (`:233-247`), then Permanently delete (`:248-299`). A recovery receipt on the device lets the person check progress (`:309-337`), also from the landing screen (`mobile/app/index.tsx:74-83`).
3. The app calls the `delete-account` Edge function (`mobile/src/services/accountDeletion.ts:71`), which runs the deletion gateway through the independent ledger (`supabase/functions/delete-account/README.md:59-61`).
4. The server blocks access, redacts the profile, cancels owned future plans, revokes links, deletes attendance and endpoints, and queues a worker that removes photos and then the Auth user (`supabase/functions/delete-account/README.md:9-17`).

Why it does not work today:
- **Three switches, all off.** The app needs `EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED=true` (`mobile/src/services/accountDeletion.ts:11-12`); `.env.example` says keep it disabled. The function needs `ACCOUNT_DELETION_RELEASE_APPROVED`, which is `false` in source (`supabase/functions/_shared/deletion-release.ts:4`, read at `supabase/functions/delete-account/index.ts:8`), plus a server variable.
- **The database side is not on hosted.** The lifecycle, receipt retention, reservations and the GI2 companion are all absent from `migrations.txt` (see the baseline above). `request_account_deletion` does not exist on hosted (`qa/chat-release/README.md:106`). No deployment record exists for `delete-account` or `cleanup-account`.
- **The recovery ledger is unfinished:** no destination, key custody, inventory proof, restore replay or retention approval (`qa/deletion-recovery-ledger.md:24-36`, `:52-58`). The retention proposal is "Proposed … not activated" (`qa/b0-retention-proposal.md:3`).
- **What a person sees today:** "Account deletion is not enabled in this development build. Its server setup and recovery checks must be completed before it can be switched on." (`mobile/app/delete-account.tsx:159-168`). The "What happens" sheet adds "… its availability in this build. Backup retention and restore handling must also be verified before deletion is switched on." (`mobile/app/delete-account.tsx:355-360`). Both are developer wording in a user screen, and together they show App Review that deletion does not work.
- **Phone-only accounts are shut out twice** (OB-D5, `knowledge-base/08-decisions.md:776`). The form needs an email: `available = accountDeletionEnabled && !preview && !!accountId && !!email` (`mobile/app/delete-account.tsx:67-68`). The server needs a confirmed email, and the local-only `prepare_deletion_intent` and `activate_deletion_intent` still need a roster row or a grant (`qa/deletion-recovery-ledger.md:62-64`; `supabase/migrations/20261116120000_open_beta.sql:11-13`). Phone sign-up is now the main way in (`mobile/app/auth/index.tsx:50`), so most new accounts could never delete, even with every switch on. Proving it's you for a phone account would also need a real SMS code (section 1a).
- **Web-only accounts** (made on the link site to answer an invitation) have no app and no deletion route at all. With no support address set, they have no route of any kind.
- **Sign in with Apple token revocation is not built.** A search of `supabase/functions`, `mobile/src` and `mobile/app` finds no call to Apple's revoke endpoint. The GI2 record lists it as deferred: "Apple token revocation on deletion" (`docs/implementation-status.md:615`).
- **The local lifecycle is out of date** with connections, circles and chat: `activate_deletion_intent` writes chat lines and skips the newer clean-up steps (`docs/superpowers/plans/2026-11-11-roadmap-connections-groups-chat.md:108-109`). Two deletions at once can deadlock in chat groups (`qa/chat-release/README.md`, Known gaps, chat groups).

What is deleted and what is kept (as designed, once live):
- Deleted: profile, private photo, sign-in account, attendance, invitations revoked, device endpoints and outbox rows, local groups and drafts, blocks both ways, reports the person filed, chat-rules acceptances, moderator row, the text of their chat messages (`mobile/app/delete-account.tsx:339-354`; `qa/chat-release/README.md:127`; `supabase/functions/delete-account/README.md:15`).
- Kept: other people's cancelled plan records with a neutral organiser; reports about the person (with frozen words) until closed, then 180 days (`qa/chat-release/README.md:122-123`); minimal deletion receipts for 30 days after cleanup (proposed, `qa/b0-retention-proposal.md:15`); backups, which "are not erased instantly" (`mobile/app/delete-account.tsx:351-353`). Apple asks apps to tell people what is kept and how long deletion takes; the screen says some of this but gives no time frame.

Missing (the deletion release): the hosted lifecycle brought up to date with connections, circles and chat; OB-D5's two fixes (no roster or grant check, and phone or email proof); a phone-account proof (SMS code); Apple token revocation; the ledger decisions or an owner-approved simpler recovery stance; the function deployed and both source and server switches on; the user wording rewritten without "development build"; a stated time to complete; a route for web-only accounts.

---

## 4. User-generated content safety (Guideline 1.2)

**Status: Partial. Hosted: LIVE. Severity: Blocker until the contact address is set; High for the rest.**

Guideline 1.2 needs four things: a filter, reporting with timely responses, blocking, and published contact information.

| Requirement | State | Hosted | Evidence |
|---|---|---|---|
| Chat rules agreed before a first message or announcement | Complete | LIVE (rules version `2026-11`) | Copy: `mobile/src/domain/safetyCopy.ts:52-54`; sheet: `mobile/app/chat.tsx:1090`, `:1579`; server: `supabase/migrations/20261111160000_chat_safety.sql:811-857`; applied: `qa/chat-release/README.md:866` |
| Blocked-terms filter | Partial | LIVE, 37 terms | Messages and announcements only; titles, notes, names and photos are not checked (`qa/chat-release/README.md:126`); list set 13 Nov (`qa/chat-release/README.md:869`) |
| Report a message | Complete | LIVE | Long-press and VoiceOver action: `mobile/app/chat.tsx:1013-1019`; `report_message`: `mobile/src/services/safety.ts:169` |
| Report a person | Complete | LIVE | Chat person sheet `mobile/app/chat.tsx:881`; people list `mobile/app/guests.tsx:385`; resbite page `mobile/app/event.tsx:549`; invitation card `mobile/app/(tabs)/plans.tsx:576`; Connections `mobile/app/connections.tsx:254` |
| Report an invitation | Partial | LIVE | No "report this resbite" object. From an unanswered invitation a person reports the message, the announcer, the inviter or the host (`qa/chat-release/app-store-review-notes.md:27`). A plan's title, description or cover photo cannot be reported as such |
| Block and unblock | Complete | LIVE | Block confirm in each place above; Blocked people with Unblock: `mobile/app/blocked-people.tsx:15-33`; server `private.blocks`: `supabase/migrations/20261111160000_chat_safety.sql:26` |
| Moderator notification | Complete | LIVE | "A new report is waiting." `supabase/functions/_shared/notification-copy.ts:167-171`; sender v5 deployed (`qa/chat-release/README.md:867`) |
| Reports queue and actions | Partial | LIVE | SQL editor scripts only, no screen (`supabase/ops/open-reports.sql`, `close-report.sql`, `remove-reported-message.sql`, `suspend-account.sql`; duty: `qa/chat-release/README.md:827-858`) |
| Moderators | Partial | LIVE, 1 moderator | Owner alone; backup reader R-Q4 not named (`qa/chat-release/README.md:863`, `:869`) |
| Contact address after a report and in Data & privacy | **Missing** | n/a (build variable) | Shown only when `EXPO_PUBLIC_SUPPORT_ADDRESS` holds an address (`mobile/src/design/ReportSheet.tsx:69`, `mobile/app/data-privacy.tsx:28`, `:138-147`); "not yet (5b open; App Review waits)" (`qa/chat-release/README.md:863`) |

Further gaps:
- **Contact information is not published.** Without the address, the report thanks says only "Thanks. The Resbite team will look at it." (`mobile/src/domain/safetyCopy.ts:18`, `:117-118`), and Data & privacy has no Contact topic. The review notes still carry the placeholder "[the support address]" (`qa/chat-release/app-store-review-notes.md:36`). The runbook itself says submission is blocked until it is set (`qa/chat-release/README.md:359`).
- **The 24-hour promise rests on one person.** The review notes promise "remove offending content and suspend the accounts responsible within 24 hours" (`qa/chat-release/app-store-review-notes.md:33`). Only the owner reads the queue, and only from the SQL editor.
- **Suspension needs a report.** `suspend-account.sql` takes a report id (`supabase/ops/suspend-account.sql:14-15`). There is no script to suspend an account the team finds by other means. The Auth ban is a separate manual step (`qa/chat-release/README.md:839`). A suspended person can sign up again with another number; nothing stops that.
- **A suspended person has no way to appeal.** The waiting screen says "If you think this is a mistake, contact the Resbite team." (`mobile/app/account.tsx:128-136`) but shows no address.
- **A guest a host removed cannot report that host in the app** (`qa/chat-release/README.md`, Known gaps, chat safety); the runbook relies on the support address for this.
- **No Terms with a zero-tolerance clause.** The chat rules say "people who break them can lose their account" (`mobile/src/domain/safetyCopy.ts:54`), but there are no Terms to point to (section 1c). App Review rejection messages for 1.2 commonly ask for terms with "no tolerance for objectionable content or abusive users". UNVERIFIED: that wording comes from rejection practice, not the guideline text read this session.
- **Photos are user-generated content too.** Profile photos and resbite covers are shown to others with no filter and no direct report; only the person can be reported.
- **Stale review-notes wording.** The notes open "Resbite is an invitation-only app" (`qa/chat-release/app-store-review-notes.md:14`). Since the open beta anyone can sign up.

UK law (UNVERIFIED in detail: Ofcom pages returned 403 this session; the points come from Ofcom search results): Resbite's chat makes it a user-to-user service under the Online Safety Act 2023. Every such service must do an illegal content risk assessment, have reporting and complaints routes, and name an accountable person. A self-declared 18+ tick is not "highly effective age assurance", so the service cannot conclude that children cannot access it, and the children's access assessment moves to its second stage. None of these records exist in the repo.

---

## 5. Permissions

**Status: Mostly complete. Severity: Low.**

| Permission | When the prompt appears | Purpose string (`mobile/app.json`) | When denied |
|---|---|---|---|
| Contacts | Only when the person taps "Choose contacts" on Invite people (`mobile/src/design/ContactPicker.tsx:107`; first page requests: `mobile/src/state/useContactInvites.ts:157`) | "Choose contacts to invite to your Resbite plans." (`:69`) | Message, a Settings button and manual entry by number (`mobile/src/design/ContactPicker.tsx:69-76`, `:85`, `:109-111`; `mobile/src/services/contacts.ts:19-20`). iOS limited access supported with "Allow more" (`mobile/src/design/ContactPicker.tsx:116-119`). Only picked numbers are sent to the server (`mobile/src/state/useContactInvites.ts:268-286`) |
| Location | **Never.** `expo-location` is installed (`mobile/package.json:36`) and its plugin is configured (`mobile/app.json:57-65`), but no file imports it | "Use your location when choosing where to meet." (`:60`); motion: "Resbite doesn't use motion or fitness data…" (`:63`) | n/a |
| Photos | On "Add photo" or a cover; uses the system picker (`mobile/src/services/photo.ts:56`), which on iOS needs no library permission. UNVERIFIED for Expo 57 | "Choose a photo for your profile or for a resbite's cover." (`:49`) | Picker cancel changes nothing |
| Notifications | After an in-app ask, "Get notified?", in context: a chat's first open, the waiting screen, and others (`mobile/src/design/NotificationAsk.tsx:8-25`; `mobile/app/chat.tsx:191`; `mobile/app/waiting.tsx:51`); reminders ask when first set (`mobile/src/services/reminders.ts:86-88`) | n/a (iOS has no purpose string for notifications) | Notification settings shows the state and opens Settings on tap (`mobile/app/notifications.tsx:120-131`, `:239`) |
| Calendar | "Add to calendar" opens iPhone's own event form (`mobile/src/services/calendar.ts:47`) | "Resbite doesn't read your calendar…" (`:75`); reminders string "doesn't use your reminders" (`:76`) | n/a |

Gaps:
- **Location is declared but never used.** The "where to meet" string promises a feature that does not exist. Guideline 5.1.1(iii) asks apps to request only data relevant to core functions. Remove `expo-location` and its plugin, or build the feature. A code comment refers to "Use my location" (`mobile/src/domain/eventView.ts:192`) and a field comment says "The app does not set them yet" (`mobile/src/domain/plans.ts:28`).
- The contacts string does not say that the numbers picked are checked on Resbite's server and kept for invitations. Data & privacy explains it (`mobile/app/data-privacy.tsx:61-65`); the purpose string and the privacy policy should say it too.
- No App Tracking Transparency prompt is needed: there is no analytics, advertising or crash SDK in `mobile/package.json` dependencies.
- The Android manifest lists location and write-contacts permissions (`mobile/app.json:22-27`). This does not affect the iOS submission.

---

## 6. Data rights, contact and complaints

**Status: Missing in part. Severity: High.**

| Right (UK GDPR) | In the app today | Evidence |
|---|---|---|
| See (access) | Partly. A person can see their profile, account details, plans, chats and Blocked people. No copy of everything held, and no way to ask for one | No export anywhere in `mobile/app` or `mobile/src` |
| Correct | Partly. Name and photo in Profile (`mobile/app/(tabs)/profile.tsx:31-54`, `:89-121`); date of birth, optional phone, city and interests in Account details (`mobile/app/account-details.tsx:213-290`). **The verified phone number and the sign-in email cannot be changed** in the app | No change-number or change-email flow (`mobile/app/add-phone.tsx` is only for accounts without a number) |
| Export (portability) | Missing | none |
| Delete | Missing (section 3) | `mobile/app/delete-account.tsx:159-168` |
| Object or restrict | Partly: mute, leave a group, block; no route to ask for more | |
| Contact the operator | **Missing.** The Contact topic exists only if the address is set at build time | `mobile/app/data-privacy.tsx:28`, `:138-147` |
| Complain | **Missing.** No complaints route in the app or on the link site. The suspended-account screen says "contact the Resbite team" with no address | `mobile/app/account.tsx:133-135` |

Why it matters now:
- Since **19 June 2026** UK controllers must let people make data protection complaints directly to them, acknowledge each one within 30 days and take appropriate steps to respond (Data (Use and Access) Act 2025, section 103; gov.uk factsheet). Resbite has no route for this.
- The Online Safety Act's complaints duties apply to the chat as well (section 4).
- Apple does not require an export, but the privacy policy must say how to request deletion and revoke consent (Guideline 5.1.1(i)).

**Data & privacy text is out of date or wrong in places** (UK GDPR transparency; Articles 12–13, UNVERIFIED this session):
- "Unfinished plan drafts are kept separately for your account…" (`mobile/app/data-privacy.tsx:71-75`). Drafts were removed (`docs/implementation-status.md:755`).
- "Phone numbers entered here are not verified and do not enable SMS sign-in." (`mobile/app/data-privacy.tsx:87-88`). Every account now signs in with a verified number. The sentence refers to the separate optional phone field in Account details (`mobile/src/design/RegistrationDetails.tsx:141`), which is confusing next to the required verified number.
- "Anyone with an event's link can join it while the link is on." (`mobile/app/data-privacy.tsx:104`). Since open-link approval, the host approves each request (`docs/implementation-status.md:697`).
- "Previous uploads remain in private storage until file cleanup is enabled." (`mobile/app/data-privacy.tsx:99-101`). Orphan-photo cleanup is local only (baseline above), so replaced photos are kept with no end date.
- "Review account deletion's availability in this build under Delete account." (`mobile/app/data-privacy.tsx:121-122`).
- The page does not mention: push tokens and device endpoints; the phone numbers of contacts the person invites (kept by the server for the invitation); the outside services involved (sign-in, email, push, web hosting); where data is stored; retention periods; the age rule. These belong in the privacy policy, with a short in-app summary.

Retention gaps that a privacy policy must cover (no approved schedule; Q13 open):
- Link opens: no retention, pruned by hand (`docs/implementation-status.md:593`).
- Notification outbox: one row per recipient per chat message, no clean-up yet (`qa/chat-release/README.md`, Known gaps, K-N11).
- Test-mode log and stored codes (`supabase/migrations/20261027120000_phone_accounts.sql:33-41`).
- Replaced photos and covers (above).
- Closed reports: 180 days (`qa/chat-release/README.md:123`), which is decided.

---

## 7. Content App Review may reject

**Status: Partial. Severity: Blocker (Wellness) and High (wording).**

Guideline 2.1: placeholder text and other temporary content should be removed before submission. Guideline 2.2: demos and betas belong on TestFlight, not the App Store.

Reachable in a release build:
- **Wellness tab: sample data only.** One of four tabs (`mobile/app/(tabs)/_layout.tsx:46-52`). It shows invented minutes per category (`mobile/src/domain/accountCopy.ts:56`), a "Sample data" chip (`mobile/app/(tabs)/wellness.tsx:33`) and "These are example numbers for design review. They do not track your activity or measure health." (`mobile/app/(tabs)/wellness.tsx:63-67`). Data & privacy repeats "Wellness figures are fictional, and there is no wellness tracking." (`mobile/app/data-privacy.tsx:127-137`). A whole tab of design-review content is very likely a 2.1 rejection. Hide or remove the tab for the first release.
- **"Development build" and "this build" wording:** `mobile/app/delete-account.tsx:166`, `:357`; `mobile/app/data-privacy.tsx:121-122`; thrown errors that can reach the screen through the delete action, "Account deletion is unavailable in this build." (`mobile/src/services/accountDeletion.ts:33`, `mobile/src/services/accountDeletionFlow.ts:41`) and "Sign in with Apple is unavailable in this build." (`mobile/src/services/accountDeletionFlow.ts:66`).
- **"Private Resbite test · access is opened by invitation."** in the About access sheet (`mobile/app/auth/index.tsx:258`).
- **"Resbite is in beta. This page describes the current build."** (`mobile/app/data-privacy.tsx:170`).
- **"Tester" as the name for a guest with no name**, shown in the people list, the chat and invitations (`mobile/src/services/rsvp.ts:77`, used at `mobile/app/guests.tsx:151`, `mobile/app/chat.tsx:222`, `mobile/app/invitations.tsx:188`).
- **Notifications "not active yet".** If the production build is made without `EXPO_PUBLIC_PUSH_ENABLED=true`, Notification settings says "Updates aren't active yet" and "This build does not send plan or RSVP notifications…" (`mobile/src/domain/notifications.ts:19-21`, `:40`). Whether the variable is set in EAS production is UNKNOWN; the push runbook lists it as a step (`qa/push-notifications-2026-10-30/README.md:117`).
- **"Isn't switched on yet"** for folding a web invitation into an account (`mobile/src/domain/phoneCopy.ts:38`). The fold function is deployed and released (`qa/contact-invites-2026-10-28/README.md:54`), so this shows only if it fails with 404 or 503.
- **Test-only code paths:** the `000000` swap in the app and on the link site (section 1a).

Correctly kept out of release builds:
- The Kit screen redirects home unless `__DEV__` (`mobile/app/kit.tsx:51`).
- "Preview the design" is shown only when `__DEV__` (`mobile/app/index.tsx:84-104`), and it is the only place that turns preview on. So `PreviewNotice` (`mobile/src/design/Chrome.tsx:10-13`) and the preview-only line "Activity content approved for the owner-only beta." (`mobile/app/activity/[id].tsx:83`) cannot show in a release build.
- The device mirror and the web keyboard check are `__DEV__` only (`mobile/src/services/deviceMirror.ts:27`, `mobile/app/chat.tsx:103`).
- No dead buttons found outside the Kit screen (`mobile/app/kit.tsx:159`).

Other review items:
- App version `0.1.0` (`mobile/app.json:6`). Allowed, but a 0.x number can read as pre-release.
- The weekly group and the second resbite named in the review notes, and the review account, must be set up first (`qa/chat-release/app-store-review-notes.md:17-18`).

---

## 8. The link web site (`links/`)

**Status: Partial. Hosted: LIVE on Vercel (which version is deployed, and which Vercel variables are set, is UNKNOWN). Severity: High.**

Pages (`links/generate.mjs:76-85`):
- `/invite`: static page for the older invitation links.
- `/r/<code>`: an event link. Open: the open-link steps (number, code, name, answer, then waiting for the host). Closed: "cancelled", "already happened" or "no longer active" (`links/server/lib/render.mjs:129-136`).
- `/i/<code>`: a personal invitation to one number. It shows the event, the host, and "This invitation is for a +{code} number ending ••{ending}" (`docs/implementation-status.md:748`).
- `/r/<code>/image`, `/i/<code>/image`: preview images.
- `/` redirects to an external marketing site not in this repo (`links/generate.mjs:85`).
- Pages are `noindex, nofollow` (`links/server/lib/render.mjs:16`, `:111`) and carry a strict CSP.

What a non-user sees and gives: the event title, time, host's name and cover picture; then they type their number, tick 18+ and terms, enter a code, give a name and an answer (`links/assets/personal-flow.mjs:19-81`). This creates a web-only account with a verified number (`docs/implementation-status.md:665`). The session is kept in the browser's `localStorage` until the event starts (`links/assets/personal-flow.mjs:381-391`).

Gaps:
- **No privacy notice at the point of collection.** The pages collect a phone number and a name and create an account, but show no operator name, no contact, and no privacy text. The only privacy link is inside the tick line, and only if `PRIVACY_URL` is set; it defaults to empty (`links/server/lib/options.mjs:18`). UK GDPR Article 13 requires this information when data is collected (UNVERIFIED this session).
- **Phone verification uses test mode.** The page says "Type the number {host} invited. We'll text it a code." and "Code sent" (`links/assets/personal-flow.mjs:23`, `:33-34`), but no text is sent. The page swaps `000000` for the stored code (`links/assets/personal.js:446`; `links/assets/personal-flow.mjs:175`). A real invitee cannot get in; someone who knows the trick and the number can.
- **No deletion or contact route for web-only accounts.** They have no app, and the site has no contact or deletion link.
- **The browser session is stored on the device** (`localStorage`). This is probably "strictly necessary" under PECR regulation 6, so no consent banner is needed, but the privacy notice should say it (UNVERIFIED this session).
- **No Smart App Banner or App Store link until the app is listed:** the banner needs `APP_STORE_ID`, and "Get Resbite" needs `APP_STORE_URL` (`links/server/lib/render.mjs:87-92`; `links/generate.mjs:106`). Both must be set on Vercel after approval.
- **The associated-domain file lists `/invite` and `/r/*` only** (`links/generate.mjs:42-45`); `/i/*` is web-only by design (`links/generate.mjs:81`).

---

## What to do, in order

Blockers before submission:
1. Connect a real SMS provider, then switch test mode off in one sitting, as the runbook says (`qa/phone-accounts-2026-10-27/README.md:90-120`). Remove the `000000` swap from the app and the link site. Set up a review sign-in that does not rely on test mode.
2. Write the Privacy Policy and Terms (Terms with the chat rules and a zero-tolerance clause). Host them. Set `EXPO_PUBLIC_TERMS_URL`, `EXPO_PUBLIC_PRIVACY_URL`, and the link site's `TERMS_URL` and `PRIVACY_URL`. Add Privacy Policy and Terms rows in the app and links on the web pages. Add the Privacy Policy URL and a Support URL in App Store Connect.
3. Ship account deletion: the hosted lifecycle updated for connections, circles and chat; OB-D5's fixes; phone-account proof; Apple token revocation; the function deployed; all switches on; user wording without "development build"; a stated time frame; a route for web-only accounts.
4. Set `EXPO_PUBLIC_SUPPORT_ADDRESS` in EAS production before the build, fill the review notes' placeholders, and fix "invitation-only".
5. Remove or hide the Wellness tab and the "Preview & samples" topic. Remove the beta, test and development wording listed in section 7, and rename the "Tester" fallback.

High:
6. Put the 18+ and terms tick on every path that creates an account, or check it on the server before first use.
7. Add a contact and complaints route (in-app and on the web), with a 30-day acknowledgement process (DUAA s.103). Add a way to ask for a copy of one's data.
8. Name a backup moderator. Write down how reports are handled within 24 hours. Add a way to suspend without a report.
9. Do the Online Safety Act records: illegal content risk assessment, children's access assessment, named accountable person.
10. Rewrite Data & privacy so it matches the app (drafts, phone, link joins, photos, push tokens, invited numbers, outside services, retention).
11. Add a privacy notice and contact line to every link-site page.

Medium and low:
12. Explain in the review notes why a phone number is needed after Sign in with Apple.
13. Remove `expo-location` and its plugin, or build the feature.
14. Agree retention for link opens, the outbox, the test-mode log and replaced photos; switch on photo cleanup.
15. Check the optional date of birth against the 18+ rule, or drop it.
16. Let people change their verified number and sign-in email.

---

## Open questions for the owner

1. Which SMS provider, and when? Nothing about public launch works until this is in place.
2. Who is the legal entity (the data controller) for the app? The 2020 website policy and the Supabase organisation name in the records differ.
3. Is `EXPO_PUBLIC_PUSH_ENABLED=true` set in EAS production?
4. Are `TERMS_URL` and `PRIVACY_URL` set on the Vercel link-site project, and what do they point to?
5. Is the Apple provider switched on in the hosted Auth settings? (The GI2 step has no completion record.)
6. Has `delete-account` ever been deployed to hosted, in any version?
7. Keep the Wellness tab for v1, or hide it until real data exists?
8. For deletion, accept the full independent recovery ledger, or approve a simpler stance (for example, a written restore procedure that re-applies deletions from receipts)?
9. Which App Store age rating? An 18+ app with chat and an alcohol-related idea ("Wine tasting", `docs/implementation-status.md:268`) needs the age questions answered honestly (Guideline 2.3.6).

---

## Sources

Primary sources read this session:
- Apple, App Review Guidelines (1.2, 2.1, 2.2, 2.3.6, 4.8, 5.1.1(i), (iii), (v), (x)): https://developer.apple.com/app-store/review/guidelines/ (no last-updated date shown on the page).
- Apple, Offering account deletion in your app (in-app start, no email or support flows, timing, what is kept, Sign in with Apple token revocation): https://developer.apple.com/support/offering-account-deletion-in-your-app/
- Apple, Sign in with Apple REST API, revoke tokens (linked from the page above): https://developer.apple.com/documentation/signinwithapplerestapi/revoke-tokens
- GOV.UK, Data (Use and Access) Act factsheet: ICO (controllers must let people complain directly, acknowledge within 30 days and take appropriate steps to respond): https://www.gov.uk/government/publications/data-use-and-access-act-2025-factsheets/data-use-and-access-act-factsheet-ico

Primary sources found by search but not fetched (the site refused the request or returned an empty page); the points that rely on them are marked UNVERIFIED:
- ICO, "New data protection complaints law now in force" (June 2026; complaints duty in force 19 June 2026): https://ico.org.uk/about-the-ico/media-centre/news-and-blogs/2026/06/new-data-protection-complaints-law-now-in-force/
- ICO, statement on DUAA commencement (February 2026): https://ico.org.uk/about-the-ico/media-centre/news-and-blogs/2026/02/statement-on-the-commencement-of-the-data-use-and-access-act-duaa/
- The Data (Use and Access) Act 2025 (Commencement No. 6 …) Regulations 2026: https://www.legislation.gov.uk/uksi/2026/82/note/made
- Ofcom, Illegal content duties under the Online Safety Act: https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/illegal-content-duties-under-the-online-safety-act
- Ofcom, Check how to comply with the illegal content rules: https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/check-how-to-comply-with-the-illegal-content-rules
- Ofcom, Illegal content Codes of Practice for user-to-user services (September 2026 version): https://www.ofcom.org.uk/siteassets/resources/documents/online-safety/information-for-industry/illegal-harms/detecting-intimate-image-abuse/illegal-content-codes-of-practice-for-user-to-user-services-9sep2026.pdf?v=425251
- Ofcom, Children's access assessment duties: https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/childrens-access-assessment-duties-under-the-online-safety-act
- Ofcom, Guidance on highly effective age assurance (self-declaration is not age assurance): https://www.ofcom.org.uk/siteassets/resources/documents/consultations/category-1-10-weeks/statement-age-assurance-and-childrens-access/part-3-guidance-on-highly-effective-age-assurance.pdf?v=427202
- UK GDPR Articles 12, 13, 15–17, 20 and 32 and PECR regulation 6 (legislation.gov.uk): not re-read this session. The references above rely on their long-standing text.
