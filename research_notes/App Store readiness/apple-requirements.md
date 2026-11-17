# Apple's requirements for the first App Store submission

Research date: 17 November 2026. Scope: a free, iPhone-only social-planning app with accounts, contacts-based invitations, chat, connections and groups, rated 18+, first distributed from the UK.

**Method.** Every requirement below is taken from an Apple primary source (App Review Guidelines, App Store Connect Help, Apple Developer documentation and news, Human Interface Guidelines) or from official vendor documentation (Expo, Supabase). Each one has an id, what is required, the source URL, a gate, and the state of the repository with file:line evidence. The hosted state comes from the repository's own records (`supabase/tests/hosted-baseline/migrations.txt`, `docs/implementation-status.md`, `qa/`), not from the hosted project. Anything I could not confirm from a primary source is marked **UNVERIFIED**.

**Versions read.** App Review Guidelines "Last Updated: October 16, 2026" (changes that day: 1.2 clarified, new 2.3.14 and 2.5.19, Section 5 clarified). Source: https://developer.apple.com/news/?id=92th7e5i

**Gates.**
- **submission-blocker**: App Store Connect refuses the upload or the submission, or App Review is very likely to reject.
- **legal-must**: Apple's page says the law requires it (or it is a legal duty Apple points to).
- **should**: Apple guidance or a known review risk. Not a hard refusal, but expect questions or a rejection.
- **nice**: optional, improves the listing or future-proofs.

---

## 0. Summary: what stops the submission today

| Id | Blocker | State in the repo |
|---|---|---|
| APL-23, APL-24 | In-app account deletion must work, for every account type | Switched off in the build; the deletion migrations are not on the hosted project; phone-only accounts can't delete at all |
| APL-29, APL-30, APL-41 | Privacy policy: a document, a public URL, a link inside the app and in App Store Connect | No policy text in the repo; the only in-app link is the sign-up tick, and only when an unset variable is set |
| APL-4, APL-8, APL-42 | Published contact details: in the app (1.2) and on a Support URL with real contact information | `EXPO_PUBLIC_SUPPORT_ADDRESS` is not set; no support page recorded |
| APL-9 | Data security: phone codes in test mode accept 000000 for any number | Test mode is on (decision CI-D13) |
| APL-10 | No placeholder, sample or beta content | Wellness tab shows sample figures; "Resbite is in beta"; "development build"; a guest without a name shows as "Tester" |
| APL-11, APL-12 | A demo account that signs in without an SMS, and full review notes for a first submission | The draft notes cover only chat and say "invitation-only", which is no longer true |
| APL-48 | App Privacy answers | Not yet entered (nothing in the repo records them) |
| APL-50, APL-51 | Age rating questionnaire, overridden to 18+ | Not yet answered (nothing in the repo records it) |
| APL-56 | EU Digital Services Act trader status | Not yet declared (nothing in the repo records it) |

Already met: Sign in with Apple beside Google (APL-19), report and block and a blocked-terms filter live on the hosted project (APL-1 to APL-3), export compliance key (APL-57), scene life cycle (APL-62), app icon (APL-63), Xcode 26 builds already accepted by TestFlight (APL-58).

---

## 1. Safety and user-generated content (Guidelines 1.2, 1.5, 1.6)

Guideline 1.2 now says it covers "social media, user-generated content platforms, and AI content creation apps". The October 2026 update adds that developers who "fail to implement appropriate safeguards or fail to remediate identified violations after notice may be considered in violation of the Developer Code of Conduct". Resbite's chat, announcements, titles, notes, names, profile photos and cover photos are all user content.
Source: https://developer.apple.com/app-store/review/guidelines/#user-generated-content and https://developer.apple.com/news/?id=vvzx6cul

### APL-1 · A filter for objectionable material
- **Required.** "A method for filtering objectionable material from being posted to the app."
- **Source.** https://developer.apple.com/app-store/review/guidelines/#user-generated-content
- **Gate.** submission-blocker
- **State.** Met for chat messages and announcements. `20261111160000_chat_safety.sql` is on the hosted project (`supabase/tests/hosted-baseline/migrations.txt`). A blocked-terms list of 37 terms was set on 13 November 2026 (`qa/chat-release/README.md:869`). Titles, notes to guests and names are not checked (`qa/chat-release/README.md:126`). See APL-6.

### APL-2 · Report offensive content, with timely responses
- **Required.** "A mechanism to report offensive content and timely responses to concerns."
- **Source.** https://developer.apple.com/app-store/review/guidelines/#user-generated-content
- **Gate.** submission-blocker
- **State.** Built and live. Report from a message, a person, the chat menu, an unanswered invitation and Connections (`qa/chat-release/app-store-review-notes.md` text block; `mobile/src/design/ReportSheet.tsx`). Each report pushes the moderators. One moderator is set (`qa/chat-release/README.md:869`).

### APL-3 · Block abusive users
- **Required.** "The ability to block abusive users from the service."
- **Source.** https://developer.apple.com/app-store/review/guidelines/#user-generated-content
- **Gate.** submission-blocker
- **State.** Built and live. A block hides the person's messages and pushes and ends any connection; Blocked people lists them (`mobile/app/blocked-people.tsx`; `mobile/app/data-privacy.tsx`). The team can suspend an account (`supabase/ops/suspend-account.sql`).

### APL-4 · Published contact information, inside the app
- **Required.** "Published contact information so users can easily reach you."
- **Source.** https://developer.apple.com/app-store/review/guidelines/#user-generated-content
- **Gate.** submission-blocker
- **State.** Not met. The Contact topic and a report's thanks show an address only when the build has `EXPO_PUBLIC_SUPPORT_ADDRESS` (`mobile/app/data-privacy.tsx:28`, `mobile/src/design/ReportSheet.tsx:69`). It is not set: `mobile/.env.example:11-14` says "App Store submission waits for it", and the release record says "The support address: not yet (5b open; App Review waits)" (`qa/chat-release/README.md:864`). Because `EXPO_PUBLIC_*` values are fixed at build time, the address must be set before the App Store build (`qa/chat-release/README.md:331`).

### APL-5 · Act on reports within 24 hours, with cover when the owner is away
- **Required.** App Review's rejection letters for 1.2 have asked apps to "act on objectionable content reports within 24 hours by removing the content and ejecting the user". **UNVERIFIED** as guideline text: the current guideline says only "timely responses". The 24-hour wording is quoted from rejection letters in developer forum threads, not an Apple document.
- **Source.** https://developer.apple.com/app-store/review/guidelines/#user-generated-content ; forum quotes, e.g. https://developer.apple.com/forums/thread/116703 (UNVERIFIED)
- **Gate.** should
- **State.** The draft review notes promise "We check the reports queue every day, and remove offending content and suspend the accounts responsible within 24 hours" (`qa/chat-release/app-store-review-notes.md`, "HOW WE ACT ON REPORTS"). Only the owner reads the queue; the backup reader (R-Q4) is not named and is marked release-blocking (`qa/chat-release/README.md:367`, `:869`).

### APL-6 · Cover every user-content surface, including images
- **Required.** 1.2 says "It is your responsibility to remove content that violates this guideline, your terms of service, or your community standards." Apple's October 2026 note says content moderation now explicitly covers nonconsensual intimate imagery, "content that apps must proactively prevent and remove".
- **Source.** https://developer.apple.com/app-store/review/guidelines/#user-generated-content ; https://developer.apple.com/news/?id=vvzx6cul
- **Gate.** should
- **State.** Gaps. The filter skips titles, notes to guests and names (`qa/chat-release/README.md:126`). Profile and cover photos are shared with other people, but the team's scripts can remove a message only: `supabase/ops/` holds `remove-reported-message.sql` and no script to remove a photo, title or name. Suspension is the only lever for an image today.

### APL-7 · Terms with community rules that people accept
- **Required.** Rejection letters for 1.2 have asked for terms (an EULA) that make clear there is "no tolerance for objectionable content or abusive users". **UNVERIFIED** as guideline text (same forum source as APL-5). The guideline itself refers to "your terms of service, or your community standards".
- **Source.** https://developer.apple.com/app-store/review/guidelines/#user-generated-content ; https://developer.apple.com/forums/thread/116703 (UNVERIFIED)
- **Gate.** should
- **State.** Partly met. Sign-up has an "I agree to the Terms and Privacy Policy." tick (`mobile/src/domain/guestAccount.ts:14`). Chat has a rules sheet before the first message ("Be kind. No harassment, hate, threats or spam…", in the draft notes). There is no Terms document in the repo, and the link appears only when `EXPO_PUBLIC_TERMS_URL` is set (`mobile/src/design/TickRow.tsx:60-65`).

### APL-8 · Developer information and a working Support URL
- **Required.** Guideline 1.5: "Make sure your app and its Support URL include an easy way to contact you… Failure to include accurate and up-to-date contact information… may violate the law in some countries or regions." App Store Connect: the Support URL "must lead to actual contact information (legal address, email address, telephone number), as may be required by local law".
- **Source.** https://developer.apple.com/app-store/review/guidelines/#developer-information ; https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information
- **Gate.** submission-blocker (field required) and legal-must (contact details "as may be required by local law")
- **State.** Not met. No support page is recorded. The link site serves only `/invite`, `/r/*`, `/i/*` and the association file, and redirects `/` (`docs/implementation-status.md:491`).

### APL-9 · Data security: turn phone-code test mode off
- **Required.** Guideline 1.6: "Apps should implement appropriate security measures to ensure proper handling of user information… and prevent its unauthorized use, disclosure, or access by third parties."
- **Source.** https://developer.apple.com/app-store/review/guidelines/#data-security
- **Gate.** submission-blocker (and a legal duty under data-protection law, covered by the legal research)
- **State.** Not met. Decision CI-D13: "every code step accepts 000000 for any number, with no SMS sent" (`knowledge-base/08-decisions.md:391`). The server swaps 000000 for the stored code "for any number" while `private.phone_mode.test_mode` is true (`docs/implementation-status.md:628`). Anyone who knows a phone number can sign in to that phone account. Turning it off needs a real SMS sender and the switch-off steps in `qa/phone-accounts-2026-10-27/README.md` (step 7, per `docs/implementation-status.md:628`).

---

## 2. Completeness, betas and accurate metadata (Guidelines 2.1–2.5, 4.2)

### APL-10 · A final build with no placeholder, sample or beta content
- **Required.** 2.1(a): submissions "should be final versions with all necessary metadata and fully functional URLs included; placeholder text, empty websites, and other temporary content should be scrubbed before submission." 2.2: "Demos, betas, and trial versions of your app don't belong on the App Store – use TestFlight instead." 2.3: metadata must "accurately reflect the app's core experience".
- **Source.** https://developer.apple.com/app-store/review/guidelines/#app-completeness ; https://developer.apple.com/app-store/review/guidelines/#beta-testing ; https://developer.apple.com/app-store/review/guidelines/#accurate-metadata
- **Gate.** submission-blocker
- **State.** Not met. Found in release builds:
  - A whole tab of sample data. The Wellness tab is always in the tab bar (`mobile/app/(tabs)/_layout.tsx:46-51`) and shows "Sample data" with made-up minutes (`mobile/app/(tabs)/wellness.tsx:14-33`). If kept, it also adds "Health or wellness topics" to the age questionnaire (APL-50).
  - "Resbite is in beta. This page describes the current build." (`mobile/app/data-privacy.tsx:170`).
  - A "Preview & samples" topic: "Wellness figures are fictional, and there is no wellness tracking." (`mobile/app/data-privacy.tsx:128-136`).
  - "Account deletion is not enabled in this development build…" (`mobile/app/delete-account.tsx:166`). See APL-23.
  - A guest with no profile name is shown as "Tester" (`mobile/src/services/rsvp.ts:77`, used at `:118`).
  - Out-of-date privacy wording: "Phone numbers entered here are not verified and do not enable SMS sign-in" (`mobile/app/data-privacy.tsx:87`), which contradicts the phone accounts now required.
- **Fine.** The "Preview" chip and preview mode are reachable only in development builds: the entry is wrapped in `__DEV__` (`mobile/app/index.tsx:83-90`) and `PreviewNotice` renders nothing outside preview (`mobile/src/design/Chrome.tsx:13`).

### APL-11 · A demo account with full access, and the back end switched on
- **Required.** 2.1(a): "include demo account info (and turn on your back-end service!) if your app includes a login." App Store Connect: the demo account "is used during the App Review process and must not expire". App Review Help: "Enter a username and password that work at the time of submission… If your app requires an authentication code in addition to or instead of login credentials, include it in the Notes field in advance. Without it, a call may be required to continue the review."
- **Source.** https://developer.apple.com/app-store/review/guidelines/#app-completeness ; https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information ; https://developer.apple.com/help/app-review/before-submitting-for-review/complete-review
- **Gate.** submission-blocker
- **State.** Not ready. Every account needs a verified phone (`mobile/src/domain/accountRoute.ts:11`). Once test mode is off (APL-9), a reviewer cannot receive a real SMS. Options: an email-and-password review account that already has a verified phone, so sign-in asks for no code; or a fixed test number with a fixed code ("To test phone sign-in without sending SMS, add test phone numbers with fixed codes", https://supabase.com/docs/guides/auth/phone-login). The review account must also be able to delete itself (APL-23) without losing the review data, so plan a second account or say in the notes how to test deletion. The runbook's step 6a seeds a weekly group and a pending invitation (`qa/chat-release/README.md:320`).

### APL-12 · Review notes written for a first submission
- **Required.** 2.3.1(a): "All new features, functionality, and product changes must be described with specificity in the Notes for Review section… (generic descriptions will be rejected)". App Review Help, for new apps: "Describe your app's concept and business model"; list the "Devices and OS versions tested"; list the "External services and platforms" (for example "authentication services"); describe "Regional differences"; "Incomplete submissions will be rejected." The Notes field holds up to 4,000 bytes.
- **Source.** https://developer.apple.com/app-store/review/guidelines/#accurate-metadata ; https://developer.apple.com/help/app-review/before-submitting-for-review/complete-review ; https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information
- **Gate.** submission-blocker
- **State.** Draft exists for chat only (`qa/chat-release/app-store-review-notes.md`). It opens "Resbite is an invitation-only app" (`:14`), which is out of date since the open beta (any confirmed account may use the app, `docs/implementation-status.md:3`). Missing: the whole app's concept, that it is free with no purchases, devices tested, external services (Supabase, Expo push, Apple and Google sign-in, the email sender, the link site), how to reach Delete account, why a phone number is required (APL-21), and where test mode or flags differ.

### APL-13 · No hidden, dormant or undocumented features
- **Required.** New 2.5.19: "Don't include any hidden, dormant, or undocumented features in your app; your app's functionality should be clear to end users and App Review."
- **Source.** https://developer.apple.com/app-store/review/guidelines/ (2.5.19) ; https://developer.apple.com/news/?id=vvzx6cul
- **Gate.** should
- **State.** Features are switched by build variables: `EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED` (off in `mobile/.env.example:5`) and `EXPO_PUBLIC_PUSH_ENABLED` (`mobile/.env.example:7-8`). The App Store build should ship with deletion on and the review notes should describe anything switched off. The server-side test mode (APL-9) must be off.

### APL-14 · Screenshots that show the app in use, with fictional people
- **Required.** 2.3.3: "Screenshots should show the app in use, and not merely the title art, login page, or splash screen." 2.3.9: "display fictional account information instead of data from a real person." 2.3.8: screenshots and icons must suit a 4+ audience even if the app is rated higher. App Store Connect: at least one iPhone screenshot ("iPhone with Dynamic Island (medium display)", or the large size, which is scaled down), up to 10, `.jpeg`/`.jpg`/`.png`, no alpha. Accepted sizes include 1320 × 2868 and 1290 × 2796 (large) and 1206 × 2622 and 1179 × 2556 (medium). No iPad screenshots are needed if the app doesn't run on iPad as an iPad app.
- **Source.** https://developer.apple.com/app-store/review/guidelines/#accurate-metadata ; https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications
- **Gate.** submission-blocker (screenshots are required)
- **State.** Not made. The app is iPhone only (`mobile/app.json:11`). The QA personas (Ana, Pedro, Clara…) suit fictional data. Do not screenshot the Wellness tab (APL-10).

### APL-15 · Name, subtitle, keywords and description rules
- **Required.** Name 2–30 characters (2.3.7; App Store Connect), subtitle up to 30 characters, keywords up to 100 bytes (each over two characters, no other apps' or companies' names), description up to 4,000 characters in plain text, promotional text up to 170 characters. 2.3.7: no "trademarked terms, popular app names, pricing information, or other irrelevant phrases". 2.3.10: no names or imagery of other mobile platforms. "What's New" is not shown for the first version.
- **Source.** https://developer.apple.com/app-store/review/guidelines/#accurate-metadata ; https://developer.apple.com/help/app-store-connect/reference/app-information/app-information ; https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information
- **Gate.** submission-blocker (description and keywords are required)
- **State.** The app's name is "Resbite" (`mobile/app.json:3`), within limits. Copy not written. Mentioning WhatsApp as a way to send invitations is not another platform, but keep it out of the keywords.

### APL-16 · Minimum functionality
- **Required.** 4.2: "features, content, and UI that elevate it beyond a repackaged website… If your App doesn't provide some sort of lasting entertainment value or adequate utility, it may not be accepted."
- **Source.** https://developer.apple.com/app-store/review/guidelines/#minimum-functionality
- **Gate.** submission-blocker
- **State.** Met. Native plan creation, contacts invitations, RSVPs, chat, connections, groups, push and calendar features (`mobile/app/`).

### APL-17 · iPhone apps should run on iPad
- **Required.** 2.4.1: "iPhone apps should run on iPad whenever possible."
- **Source.** https://developer.apple.com/app-store/review/guidelines/ (2.4.1)
- **Gate.** should
- **State.** `supportsTablet: false` (`mobile/app.json:11`), so iPads run it in iPhone compatibility mode. App Review may open it on an iPad. Check sign-in, contacts and chat in that mode before submitting.

### APL-18 · Runs on the currently shipping iOS
- **Required.** 2.5.1: "Apps may only use public APIs and must run on the currently shipping OS."
- **Source.** https://developer.apple.com/app-store/review/guidelines/ (2.5.1)
- **Gate.** should
- **State.** The owner's iPhone runs iOS 27 (`docs/implementation-status.md:34`). Test the App Store build on the newest iOS before submitting.

---

## 3. Sign-in (Guideline 4.8, Sign in with Apple HIG, 5.1.1(v))

### APL-19 · Sign in with Apple as an equivalent option to Google
- **Required.** 4.8: apps that use a third-party login such as Google Sign-In "must also offer as an equivalent option another login service" that limits data to name and email, lets people keep their email private, and does not collect interactions for advertising without consent. Sign in with Apple meets this.
- **Source.** https://developer.apple.com/app-store/review/guidelines/#login-services
- **Gate.** submission-blocker
- **State.** Met. "Continue with Apple" sits beside "Continue with Google" on the same screen (`mobile/app/auth/index.tsx:225-226`). The capability is on (`mobile/app.json:14`).

### APL-20 · The custom Apple button must follow Apple's rules
- **Required.** HIG: "App Review evaluates all custom Sign in with Apple buttons." "Use only the logo artwork downloaded from Apple Design Resources; never create a custom Apple logo." Titles only "Sign in with Apple", "Sign up with Apple" or "Continue with Apple". Logo and title "must be either black or white"; the background "needs to remain black or white". Minimum 140 × 30 pt. "Make a Sign in with Apple button no smaller than other sign-in buttons."
- **Source.** https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple
- **Gate.** should (rejection risk)
- **State.** At risk. The button is a generic `Chip` (`mobile/app/auth/index.tsx:225`, neutral tint by default, `mobile/src/design/kit.tsx`), and the logo path comes from Simple Icons, not Apple Design Resources (`mobile/src/design/AppleMark.tsx:4-6`). The title is allowed. Use `AppleAuthenticationButton` from `expo-apple-authentication`, or a black/white button with Apple's artwork.

### APL-21 · Ask only for data you need after Sign in with Apple, and say why
- **Required.** HIG: "minimize your requests for data as people set up an account… describing why you need additional data"; "Clarify whether the additional data you request is required or just recommended"; "don't delay the experience by asking for information that isn't required." 5.1.1(v): "Apps may not require users to enter personal information to function, except when directly relevant to the core functionality of the app or required by law."
- **Source.** https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple ; https://developer.apple.com/app-store/review/guidelines/#data-collection-and-storage
- **Gate.** should
- **State.** A verified phone is required after any sign-in (`mobile/src/domain/accountRoute.ts:11`). It is core: invitations are tied to the invitee's phone number (decision CI-D2, `knowledge-base/08-decisions.md:380`). Explain this on the Add your number screen and in the review notes (APL-12).

### APL-22 · Third-party sign-in inside the app, not the default browser
- **Required.** Apple's account-deletion FAQ: "linking out to the default web browser to sign in or register an account provides a poor user experience and isn't appropriate, per App Review Guideline 4."
- **Source.** https://developer.apple.com/support/offering-account-deletion-in-your-app/
- **Gate.** should
- **State.** Met. Google uses an in-app authentication session (`mobile/src/state/useAuthFlow.ts:241-247`, `WebBrowser.openAuthSessionAsync`).

---

## 4. Account deletion (Guideline 5.1.1(v) and Apple's deletion guidance)

### APL-23 · People can start account deletion inside the app
- **Required.** 5.1.1(v): "If your app supports account creation, you must also offer account deletion within the app." Apple: "Offer to delete the entire account record, along with associated personal data… only offering to temporarily deactivate or disable an account is insufficient." "Make the account deletion option easy to find in your app."
- **Source.** https://developer.apple.com/app-store/review/guidelines/#data-collection-and-storage ; https://developer.apple.com/support/offering-account-deletion-in-your-app/
- **Gate.** submission-blocker
- **State.** Not met.
  - The screen exists and is easy to find: Profile → Privacy → Delete account (`mobile/app/(tabs)/profile.tsx:205`, `mobile/app/data-privacy.tsx:160-164`).
  - It is switched off: `available` needs `accountDeletionEnabled` (`mobile/app/delete-account.tsx:67-68`), which needs `EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED === "true"` (`mobile/src/services/accountDeletion.ts:11-12`), set to `false` in `mobile/.env.example:5`. A reviewer sees "Account deletion is not enabled in this development build" (`mobile/app/delete-account.tsx:166`).
  - The server side is not live. These local migrations are not in the hosted list: `20260918001316_account_deletion_lifecycle.sql`, `20260923152943_deletion_receipt_retention.sql`, `20260929125858_deletion_intent_reservations.sql`, `20261022120001_gi2_local_delivery_and_deletion.sql`, `20260923152816_orphan_profile_photo_cleanup.sql` (compare `supabase/migrations/` with `supabase/tests/hosted-baseline/migrations.txt`).
  - The recovery-ledger sequence is unfinished (`qa/deletion-recovery-ledger.md:21-32`).

### APL-24 · Deletion works for every kind of account
- **Required.** Apple: "Everyone should be able to delete their accounts, regardless of where they're located." "People should have the option to delete automatically generated accounts (sometimes called 'guest' accounts)." Verification is allowed, "such as by entering a code from an email or phone number already associated with the account", but "apps that make it unnecessarily difficult for someone to delete their account will not pass review."
- **Source.** https://developer.apple.com/support/offering-account-deletion-in-your-app/
- **Gate.** submission-blocker
- **State.** Not met for phone-only accounts. The screen needs an email (`mobile/app/delete-account.tsx:67-68`, `!!email`). Decision OB-D5: "deletion requests still need a confirmed email" and the local functions still need a roster row or a grant (`knowledge-base/08-decisions.md:776`). The ledger repeats it: "phone-only accounts can't request deletion. Both must change before deletion is switched on (an App Review requirement)" (`qa/deletion-recovery-ledger.md:64`). Phone sign-up is the main path (`mobile/app/auth/index.tsx:50`), so most new accounts would be stuck. A phone code is an allowed confirmation. Apple-only accounts confirm by signing in with Apple again (`mobile/app/delete-account.tsx:60-62`), which is fine. Web accounts made on the link site must also be deletable (they fold into app accounts; check the fold path).

### APL-25 · Tell people how long it takes, what is kept, and confirm when done
- **Required.** "If the deletion request will take additional time to complete, let them know… If you're legally required to retain some user information, let people know what information will and won't be retained." "Inform the person how long it will take to delete the account and provide a confirmation when the deletion is complete." Shared user content is included: "This includes user-generated content that's shared with others, such as photos, videos, text posts, and reviews."
- **Source.** https://developer.apple.com/support/offering-account-deletion-in-your-app/
- **Gate.** submission-blocker
- **State.** Built, not live. The screen has a "What happens" sheet (`mobile/app/delete-account.tsx:148-157`, `:339`), a receipt and status messages (`:134-139`). The privacy page says deleting an account removes the text of your messages "as cleanup finishes" (`mobile/app/data-privacy.tsx:117-123`). Old profile photos "remain in private storage until file cleanup is enabled" (`mobile/app/data-privacy.tsx:99-100`); the cleanup migration is not hosted. State a time (for example "within 30 days") and keep the backups wording accurate.

### APL-26 · No support-flow barriers
- **Required.** "Apps not operating in highly regulated industries should not require people to make a phone call, send an email, use a chat support flow, or go through other support flows."
- **Source.** https://developer.apple.com/support/offering-account-deletion-in-your-app/
- **Gate.** submission-blocker
- **State.** The designed flow is fully in the app. It meets this once APL-23 and APL-24 are done.

### APL-27 · Revoke Sign in with Apple tokens when an account is deleted
- **Required.** "Apps that support Sign in with Apple should use the Sign in with Apple REST API to revoke user tokens." The endpoint is `POST https://appleid.apple.com/auth/revoke` with `client_id`, a `client_secret` JWT signed with the Sign in with Apple key, and the user's `token` (refresh or access token). "If you don't have either token for the user, you can generate tokens when validating an authorization code."
- **Source.** https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion/ ; https://developer.apple.com/documentation/signinwithapplerestapi/revoke-tokens
- **Gate.** should (Apple's wording is "should"; treat it as high priority)
- **State.** Not built. The app throws away Apple's authorization code: it returns only `identityToken`, `email` and `fullName` (`mobile/src/services/appleSignIn.ts:72`), so no refresh token can ever be obtained. The deletion gateway's `revoke` signs the user out of Supabase only (`supabase/functions/_shared/account-deletion-gateway.ts:81-82`). Supabase's Apple guide does not mention token revocation (https://supabase.com/docs/guides/auth/social-login/auth-apple). Needed: send the authorization code to a server function at sign-in (or at deletion, by asking for a fresh Apple sign-in, which the flow already does), exchange it at `https://appleid.apple.com/auth/token`, then call `/auth/revoke` during deletion.

### APL-28 · Handle Sign in with Apple server-to-server notifications
- **Required.** "Use server-to-server notification endpoints to process changes for Sign in with Apple accounts." Events: `email-disabled`, `email-enabled`, `consent-revoked` ("their credentials become invalid") and the account-deletion event (the page lists it as `account-deleted`; older material says `account-delete`, so accept both). Payloads are JWS signed by Apple. The endpoint needs TLS 1.2 or later and is registered in Certificates, Identifiers & Profiles.
- **Source.** https://developer.apple.com/support/offering-account-deletion-in-your-app/ ; https://developer.apple.com/documentation/signinwithapple/processing-changes-for-sign-in-with-apple-accounts ; https://developer.apple.com/help/account/configure-app-capabilities/enabling-server-to-server-notifications
- **Gate.** should
- **State.** Not built. Supabase: "At this time Supabase Auth does not support Server-to-Server notification endpoints, so you should leave that setting blank" (https://supabase.com/docs/guides/auth/social-login/auth-apple). It would need its own Edge Function. On `consent-revoked`, end the person's sessions; on account deletion, treat it as a sign-out and start or mark the account's cleanup.

---

## 5. Privacy inside the app (Guidelines 5.1.1, 5.1.2, 4.5.4, 5.1.5)

### APL-29 · A privacy policy link inside the app, easy to reach
- **Required.** 5.1.1(i): "All apps must include a link to their privacy policy in the App Store Connect metadata field and within the app in an easily accessible manner."
- **Source.** https://developer.apple.com/app-store/review/guidelines/#data-collection-and-storage
- **Gate.** submission-blocker
- **State.** Not met. The only link is in the sign-up tick, and only when `EXPO_PUBLIC_PRIVACY_URL` is set; otherwise the words are plain text (`mobile/src/design/TickRow.tsx:60-65`). The variable is still the owner's to set (`docs/implementation-status.md:587`). The Privacy screen (`mobile/app/data-privacy.tsx`) has no link to the policy. Add "Privacy Policy" and "Terms" rows to Profile → Privacy, visible without signing in too (for example on the welcome screen).

### APL-30 · What the privacy policy must say
- **Required.** 5.1.1(i): the policy must "identify what data, if any, the app/service collects, how it collects that data, and all uses of that data"; "confirm that any third party with whom an app shares user data… will provide the same or equal protection"; "explain its data retention/deletion policies and describe how a user can revoke consent and/or request deletion of the user's data." 5.1.2(i): "You must clearly disclose where personal data will be shared with third parties, including with third-party AI."
- **Source.** https://developer.apple.com/app-store/review/guidelines/#data-collection-and-storage ; https://developer.apple.com/app-store/review/guidelines/#data-use-and-sharing
- **Gate.** submission-blocker (and legal-must under UK/EU data-protection law, covered elsewhere)
- **State.** No policy text exists in the repo (searched `docs`, `knowledge-base`, `qa`, `links`, `reports`). It must cover: account data (name, email, phone, optional date of birth, city, interests, photo), invitees' phone numbers the user picks, chat messages and reports, push tokens, link-open counts, the link site's phone-code check, retention (reports and blocks: `SAFETY_COPY` in `mobile/src/domain/safetyCopy.ts`), and the processors (hosting and auth, push delivery, Apple and Google sign-in, the email sender, the link-site host).

### APL-31 · Consent, and an easy way to withdraw it
- **Required.** 5.1.1(ii): "Apps that collect user or usage data must secure user consent for the collection… Apps must also provide the customer with an easily accessible and understandable way to withdraw consent." Apps that rely on GDPR legitimate interests "must comply with all terms of that law".
- **Source.** https://developer.apple.com/app-store/review/guidelines/#data-collection-and-storage
- **Gate.** should
- **State.** Partly met. Terms tick at sign-up (`mobile/src/domain/guestAccount.ts:13-14`); permission prompts for contacts, photos and notifications; Notification settings (`mobile/app/notifications.tsx`). Withdrawal of everything depends on account deletion (APL-23).

### APL-32 · Purpose strings that clearly and completely describe the use
- **Required.** 5.1.1(ii): "Ensure your purpose strings clearly and completely describe your use of the data."
- **Source.** https://developer.apple.com/app-store/review/guidelines/#data-collection-and-storage
- **Gate.** should
- **State.** Mostly fine, two gaps:
  - Contacts: "Choose contacts to invite to your Resbite plans." (`mobile/app.json:69`). It doesn't say the numbers you pick are checked with Resbite's server to see who already uses it (`mobile/src/state/useContactInvites.ts:268-286`, `mobile/src/services/contactInvites.ts:109-118`). Suggest: "Choose contacts to invite. Resbite checks only the numbers you pick to see who already uses it."
  - Location and motion strings are declared (`mobile/app.json:58-63`) for a library the app never imports (no `expo-location` import in `mobile/app` or `mobile/src`). See APL-40.

### APL-33 · Data minimisation: prefer the system contact picker
- **Required.** 5.1.1(iii): "Apps should only request access to data relevant to the core functionality… Where possible, use the out-of-process picker or a share sheet rather than requesting full access to protected resources like Photos or Contacts."
- **Source.** https://developer.apple.com/app-store/review/guidelines/#data-collection-and-storage
- **Gate.** should
- **State.** The app asks for Contacts access and reads names, emails and phones in pages (`mobile/src/services/contacts.ts:116-128`), with iOS's limited-access picker to add more (`:130`). Photos use the system picker (no camera or microphone, `mobile/app.json:47-53`). Consider the system contact picker, or at least avoid reading emails, which the invite flow doesn't need.

### APL-34 · Respect permission choices and offer an alternative
- **Required.** 5.1.1(iv): "Where possible, provide alternative solutions for users who don't grant consent." 5.1.2(i): "Your app may not require users to enable system functionalities (such as push notifications, location services, tracking) in order to access functionality".
- **Source.** https://developer.apple.com/app-store/review/guidelines/#data-collection-and-storage ; https://developer.apple.com/app-store/review/guidelines/#data-use-and-sharing
- **Gate.** should
- **State.** Met. Numbers can be typed by hand (`mobile/src/state/useContactInvites.ts:73`, `:239`); push is optional behind one "Get notified?" ask (`mobile/src/domain/notifications.ts:104`).

### APL-35 · Contacts: no contact database, individual choice, no "Select all", show the message
- **Required.** 5.1.2(iv): "Do not use information from Contacts… to build a contact database for your own use or for sale/distribution to third parties." 5.1.2(v): "Do not contact people using information collected via a user's Contacts… except at the explicit initiative of that user on an individualized basis; do not include a Select All option or default the selection of all contacts. You must provide the user with a clear description of how the message will appear to the recipient before sending it."
- **Source.** https://developer.apple.com/app-store/review/guidelines/#data-use-and-sharing
- **Gate.** submission-blocker (the rule) — state: met
- **State.** Met. People are picked one by one; no "Select all" exists (searched `mobile/app`, `mobile/src`). Invitations open WhatsApp or Messages with the text filled in, so the user sees and sends it (`mobile/src/domain/contactInvites.ts:219-223`). Only picked numbers go to the server (`mobile/src/state/useContactInvites.ts:268-276`). The server keeps invitees' numbers for phone invitations; set and state a retention period for numbers of people who never join (privacy policy, APL-30).

### APL-36 · Third parties and "explicit permission" before sharing
- **Required.** 5.1.2(i): "you may not use, transmit, or share someone's personal data without first obtaining their permission… You must clearly disclose where personal data will be shared with third parties… and obtain explicit permission before doing so."
- **Source.** https://developer.apple.com/app-store/review/guidelines/#data-use-and-sharing
- **Gate.** legal-must ("Unless otherwise permitted by law")
- **State.** No analytics or ad SDKs (`mobile/package.json` dependencies). Processors still receive data (hosting, push, sign-in, email). Name them in the policy (APL-30).

### APL-37 · Push notifications: optional, not for marketing, not sensitive
- **Required.** 4.5.4: "Push Notifications must not be required for the app to function, and should not be used to send sensitive personal or confidential information. Push Notifications should not be used for promotions or direct marketing purposes unless customers have explicitly opted in… and you provide a method in your app for a user to opt out."
- **Source.** https://developer.apple.com/app-store/review/guidelines/ (4.5.4)
- **Gate.** submission-blocker (the rule) — state: met
- **State.** Met. Pushes are for invitations, replies, chat and reports, not marketing. Chat pushes carry the message text (`supabase/functions/_shared/notification-copy.ts:159-174`). That is normal for chat, but a "hide message previews" setting is worth considering. Notification settings exist (`mobile/app/notifications.tsx`).

### APL-38 · No tracking, so no App Tracking Transparency prompt
- **Required.** ATT permission is needed only to "track" (link data with other companies' data for targeted ads or ad measurement, or share it with data brokers) or to read the advertising identifier.
- **Source.** https://developer.apple.com/app-store/user-privacy-and-data-use/
- **Gate.** submission-blocker (the rule) — state: met
- **State.** Met. No ad or analytics SDKs (`mobile/package.json`). Answer "No" to tracking in App Privacy (APL-48).

### APL-39 · Regulated fields
- **Required.** 5.1.1(ix): apps in "highly regulated fields (such as banking and financial services, healthcare, gambling, legal cannabis use, air travel and crypto exchanges)" should be submitted by a legal entity.
- **Source.** https://developer.apple.com/app-store/review/guidelines/#data-collection-and-storage
- **Gate.** nice (not applicable)
- **State.** Not applicable. No payments, health data or gambling. The sample Wellness tab tracks nothing (APL-10).

### APL-40 · Location: remove what isn't used
- **Required.** 5.1.5: "Use Location Services in your app only when it is directly relevant to the features and services provided by the app… obtain consent before collecting, transmitting, or using location data."
- **Source.** https://developer.apple.com/app-store/review/guidelines/ (5.1.5)
- **Gate.** nice
- **State.** The app never asks for location: `expo-location` is configured (`mobile/app.json:57-65`) and installed (`mobile/package.json`) but not imported. Removing it drops two purpose strings and the odd motion string ("Resbite doesn't use motion or fitness data…", `mobile/app.json:63`). Places are typed by the host and opened in Apple Maps (`mobile/src/domain/eventView.ts:191-196`).

---

## 6. App Store Connect: app information and version fields

### APL-41 · Privacy Policy URL
- **Required.** "Required for iOS and macOS apps." "A privacy policy URL is required for all apps."
- **Source.** https://developer.apple.com/help/app-store-connect/reference/app-information/app-information ; https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy
- **Gate.** submission-blocker
- **State.** Not set. The link site's tests assume `https://www.resbite.com/privacy` (`links/page.test.mjs:181`). Whether that page exists was not checked (no product-name fetches allowed): **UNVERIFIED**. It must be public and working (2.1(a): "fully functional URLs").

### APL-42 · Support URL with real contact details
- **Required.** "This URL must lead to actual contact information (legal address, email address, telephone number), as may be required by local law… This property is required."
- **Source.** https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information
- **Gate.** submission-blocker and legal-must
- **State.** Not set. See APL-8.

### APL-43 · Required app information fields
- **Required.** Name, primary language, bundle ID, SKU, primary category, content rights, age rating, copyright ("preceded by the year the rights were obtained"). Content Rights: "Apps that contain, show, or access third-party content must have all the necessary rights to that content". The bundle ID can't change after a build is uploaded.
- **Source.** https://developer.apple.com/help/app-store-connect/reference/app-information/app-information ; https://developer.apple.com/help/app-store-connect/reference/app-information/required-localizable-and-editable-properties ; https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information
- **Gate.** submission-blocker
- **State.** Bundle ID `com.resbite.app` (`mobile/app.json:12`) already used for TestFlight. Category, content rights and copyright not recorded. For Content Rights: the app shows user content and its own illustrations and fonts (licence files recorded, `docs/implementation-status.md:26`). The Terms should grant Resbite the rights it needs over user content. How App Review treats user content under this question is **UNVERIFIED**.

### APL-44 · App Review contact information
- **Required.** Name, email and phone for App Review; the phone "in international format, including a plus sign (+)". The Before You Submit list: "Update your contact information in case App Review needs to reach you."
- **Source.** https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information ; https://developer.apple.com/app-store/review/guidelines/ (Before You Submit)
- **Gate.** submission-blocker
- **State.** Not recorded (and must not be recorded in the repo).

### APL-45 · Marketing URL and Privacy Choices URL
- **Required.** Optional. The Privacy Choices URL is "a webpage where users can access their data, request deletion, or make changes".
- **Source.** https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information ; https://developer.apple.com/app-store/app-privacy-details/
- **Gate.** nice
- **State.** Not set. A web page for deletion requests and data access would also help people who no longer have the app.

### APL-46 · Version number
- **Required.** None for the value itself.
- **Source.** https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information
- **Gate.** nice
- **State.** `"version": "0.1.0"` (`mobile/app.json:6`). A 1.0.0 first release avoids looking like a beta (2.2). Build numbers are remote and auto-increment (`mobile/eas.json`).

### APL-47 · Territories
- **Required.** Not a rule by itself, but territory choice decides which age laws (APL-52, APL-53) and EU rules (APL-56) apply.
- **Source.** https://developer.apple.com/news/?id=f5zj08ey ; https://developer.apple.com/news/?id=sg176nne ; https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements
- **Gate.** should
- **State.** Not decided. The beta's testers are UK and Europe. Starting with the UK (and the EU once the trader details are in) avoids the US state age laws until Declared Age Range is built.

---

## 7. App Privacy ("nutrition label")

### APL-48 · Complete the App Privacy answers, including SDKs
- **Required.** "You'll need to provide information about your app's privacy practices, including the practices of third-party partners whose code you integrate into your app… This information is required to submit new apps and app updates." "Collect" means sending data off the device so that you can access it "for a period longer than what is necessary to service the transmitted request in real time". Personal data is "linked to the user" unless de-identified before collection.
- **Source.** https://developer.apple.com/app-store/app-privacy-details/ ; https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy
- **Gate.** submission-blocker
- **State.** Not entered. A proposed starting point from the code (all **linked to the user**, purpose **App Functionality**, **not used for tracking**):

| Apple data type | What Resbite collects | Evidence |
|---|---|---|
| Contact Info: Name | Display name | `mobile/app/about-you.tsx` |
| Contact Info: Email Address | Account email (email, Google, Apple sign-in) | `mobile/app/auth/index.tsx` |
| Contact Info: Phone Number | Verified phone (required) | `mobile/src/domain/accountRoute.ts:11` |
| Contacts | Phone numbers of contacts the user picks (looked up, and stored for invitations) | `mobile/src/services/contactInvites.ts:109-131` |
| User Content: Photos or Videos | Profile photo, cover photos | `mobile/app.json:49`; `mobile/app/data-privacy.tsx:97-101` |
| User Content: Emails or Text Messages | Chat messages and announcements (sender, recipients, contents) | `mobile/app/chat.tsx` |
| User Content: Other User Content | Resbite titles, notes, places, replies, guest notes, reports | `mobile/app/arrange.tsx`, `mobile/src/design/ReportSheet.tsx` |
| Identifiers: User ID | Account id | Supabase auth |
| Identifiers: Device ID | Push token (a device-level id) | `mobile/src/services/pushDevice.ts` |
| Usage Data: Product Interaction | App-session record; link-open counts | `mobile/src/services/phoneAccount.ts:15`; `mobile/app/data-privacy.tsx:107-110` |
| Other Data | Optional date of birth, city, interests | `mobile/app/data-privacy.tsx:84-88` |

  Classification notes (**UNVERIFIED**, judgement calls): whether chat belongs under "Emails or Text Messages" or "Other User Content" (declaring both is safest); whether a push token counts as "Device ID"; whether a typed city is "Coarse Location" or "Other Data". The app sends no crash or analytics data, and no location. Tracking: No.

### APL-49 · Keep the answers accurate
- **Required.** "You're responsible for keeping your responses accurate and up to date. If your practices change, update your responses in App Store Connect." 2.3 includes "privacy information" in accurate metadata.
- **Source.** https://developer.apple.com/app-store/app-privacy-details/ ; https://developer.apple.com/app-store/review/guidelines/#accurate-metadata
- **Gate.** should
- **State.** Add an App Privacy check to each release runbook in `qa/`.

---

## 8. Age rating and age laws

Since 31 January 2026 the App Store uses the ratings 4+, 9+, 13+, 16+ and 18+, and every app must answer the updated questionnaire. Source: https://developer.apple.com/news/upcoming-requirements/

### APL-50 · Answer the new age-rating questionnaire honestly
- **Required.** 2.3.6: "Answer the age rating questions in App Store Connect honestly." The questionnaire covers In-App Controls (Parental Controls, Age Assurance), Capabilities (Unrestricted Web Access, User-Generated Content, Social Media, Social Media Disabled for Users Under 13, Messaging and Chat, Advertising), Mature Themes, Medical or Wellness (including "Health or Wellness Topics"), Sexuality or Nudity, Violence, and Chance-Based Activities. "Social media" sits at 13+; "Unrestricted web access" at 16+.
- **Source.** https://developer.apple.com/app-store/review/guidelines/#accurate-metadata ; https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions ; https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating
- **Gate.** submission-blocker ("This property is required")
- **State.** Not answered. Resbite has user-generated content, messaging and chat, and social features (connections, groups). It has no ads and no embedded browser. Whether a self-declared "I'm 18 or over" tick counts as "Age Assurance" is **UNVERIFIED**. If the Wellness tab stays, "Health or Wellness Topics" applies (APL-10).

### APL-51 · Override the rating to 18+
- **Required.** "If your app has a EULA with minimum age requirements that exceed the rating that Apple calculated, you must override to a rating that adheres to the requirements." Choose "Override to Higher Age Rating".
- **Source.** https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating
- **Gate.** submission-blocker
- **State.** Resbite is "for people aged 18 and over" (`mobile/src/domain/guestAccount.ts:13-15`). The calculated rating will likely be lower, so override to 18+.

### APL-52 · 18+ downloads in Australia, Brazil and Singapore
- **Required.** "Starting February 24, 2026, Apple will block users in Australia, Brazil, and Singapore from downloading apps rated 18+ unless they have been confirmed to be adults through reasonable methods… developers may have separate obligations to independently confirm that their users are adults."
- **Source.** https://developer.apple.com/news/?id=f5zj08ey
- **Gate.** legal-must (applies if distributed there)
- **State.** Not decided (APL-47).

### APL-53 · US state age laws: Texas, Utah, Louisiana
- **Required.** Texas SB 2420 applies to new Apple Accounts from 4 June 2026, after an injunction was lifted: age assurance and parental consent for minors, and developers "can request age category data… through the Declared Age Range API" and use the Significant Change API (PermissionKit). Utah from 6 May 2026 and Louisiana from 1 July 2026 share age categories with apps through the Declared Age Range API. Apple: "In regions where legally required, you need to check the age of the people using your app with the Declared Age Range API."
- **Source.** https://developer.apple.com/news/?id=sg176nne ; https://developer.apple.com/news/?id=8jzbigf4 ; https://developer.apple.com/news/?id=f5zj08ey ; https://developer.apple.com/support/age-assurance/
- **Gate.** legal-must (applies if distributed in the United States)
- **State.** Not built. No Declared Age Range use in `mobile/`. Either leave the US out at launch or build it. The current legal status of each law should be checked with counsel; Apple's own posts show Texas was paused (23 December 2025) and then resumed (3 June 2026).

### APL-54 · Developers own their age restrictions
- **Required.** "Yes, developers are responsible for their own age restrictions." The Declared Age Range API is available worldwide on iOS 26 and later.
- **Source.** https://developer.apple.com/support/age-assurance/ ; https://developer.apple.com/news/?id=8jzbigf4
- **Gate.** should
- **State.** The only gate is the self-declared tick (`mobile/src/domain/guestAccount.ts:13`), recorded once per account (`supabase/migrations/20261027120000_phone_accounts.sql:324-335`). Calling Declared Age Range where available would strengthen the 18+ rule. UK-specific age-assurance duties are outside Apple's pages and belong to the legal research.

---

## 9. Licence agreement (EULA)

### APL-55 · Apple's standard EULA, or a custom one that meets the minimum terms
- **Required.** "Apple provides a standard EULA… If you don't provide a custom EULA, the standard EULA is applied to your app and the license agreement link isn't shown on your App Store product page." A custom EULA is plain text, per region, and must meet Apple's minimum terms: it is between the developer and the user, not Apple; the developer is responsible for maintenance and support, warranty, product claims and IP claims; it states "your name, address, and contact details (phone and email)"; Apple is a third-party beneficiary.
- **Source.** https://developer.apple.com/help/app-store-connect/manage-app-information/provide-a-custom-license-agreement ; https://www.apple.com/legal/internet-services/itunes/appstore/dev/minterms/ ; https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
- **Gate.** should
- **State.** No custom EULA. The standard EULA has no community rules for user content, so Resbite's own Terms must carry them (APL-7). Simplest: keep Apple's standard EULA in App Store Connect, and publish Resbite Terms of Use linked in the app and in the description. If a custom EULA is used instead, it must include the minimum terms.

---

## 10. EU Digital Services Act trader status

### APL-56 · Declare trader status before EU distribution
- **Required.** "You'll be asked to disclose whether or not you're a trader under the European Union's Digital Services Act (DSA) in order to distribute apps in the EU." "Even if you don't distribute apps in the EU, you'll still need to declare a trader status." Organisations: the D-U-N-S address shows automatically, plus a phone number and email address, both verified, published on EU product pages. Non-traders: EU consumers are told consumer-protection rights won't apply. Apps without trader status are removed from the EU App Store until it is provided (since 17 February 2025).
- **Source.** https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements ; https://developer.apple.com/news/upcoming-requirements/
- **Gate.** submission-blocker (asked at submission) and legal-must (if trading in the EU)
- **State.** Not recorded. A company running the app is very likely a trader. The phone and email shown must be ones the company is happy to publish.

---

## 11. Export compliance (encryption)

### APL-57 · Declare encryption use
- **Required.** "Set the value to NO if your app—including any third-party libraries it links against—doesn't use encryption, or if it only uses forms of encryption that are exempt… Typically, the use of encryption that's built into the operating system—for example, when your app makes HTTPS connections using URLSession—is exempt." France has its own controls for secure storage and communications apps.
- **Source.** https://developer.apple.com/documentation/security/complying-with-encryption-export-regulations ; https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance
- **Gate.** submission-blocker (the question must be answered) — state: met
- **State.** Met. `ITSAppUsesNonExemptEncryption: false` (`mobile/app.json:16`). The app uses HTTPS, the Keychain (`expo-secure-store`) and hashing (`expo-crypto`), all through the OS. No custom cryptography.

---

## 12. Technical requirements

### APL-58 · Build with Xcode 26 and the iOS 26 SDK, targeting iOS 13 or later
- **Required.** "Since April 28, 2026: Apps uploaded to App Store Connect must be built with Xcode 26 or later using an SDK for iOS 26." "Since September 9, 2026: iOS and iPadOS apps… must target iOS 13 or later."
- **Source.** https://developer.apple.com/news/upcoming-requirements/
- **Gate.** submission-blocker — state: likely met
- **State.** Likely met. TestFlight uploads face the same check, and TestFlight builds were accepted in October 2026 (`docs/implementation-status.md:489`). `mobile/eas.json` pins no image, so EAS picks the default for Expo SDK 57 (`mobile/package.json`: `expo` 57.0.23). Confirm the Xcode version in the production build log. No date for a later Xcode 27 requirement was published on the page (**UNVERIFIED** when it comes; historically each spring).

### APL-59 · Approved reasons for required-reason APIs
- **Required.** "Starting May 1, 2024, apps that don't describe their use of required reason API in their privacy manifest file aren't accepted by App Store Connect." This includes third-party SDKs.
- **Source.** https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api ; https://developer.apple.com/news/upcoming-requirements/
- **Gate.** submission-blocker — state: likely met
- **State.** SDK manifests found in `mobile/node_modules`: React Native (FileTimestamp C617.1, UserDefaults CA92.1, SystemBootTime 35F9.1), RCT-Folly, boost, glog, `expo-file-system` (FileTimestamp 0A2A.1/3B52.1, DiskSpace E174.1/85F4.1), `expo-application` (C617.1), `expo-constants` and `expo-notifications` (CA92.1), AsyncStorage (C617.1). Expo warns: "Apple does not correctly parse all the PrivacyInfo files included by static CocoaPods dependencies", so add the reasons to `ios.privacyManifests` in `mobile/app.json` (not present today). Apple emails missing reasons "within a few minutes of submitting" (https://docs.expo.dev/guides/apple-privacy/). Check past TestFlight upload emails for ITMS-91053.

### APL-60 · Privacy manifests and signatures for listed SDKs
- **Required.** "You must include the privacy manifest for any SDK listed… Signatures are also required in these cases where the listed SDKs are used as binary dependencies." The list includes `hermes`, `SDWebImage`, `GoogleSignIn`, `AppAuth` and others.
- **Source.** https://developer.apple.com/support/third-party-SDK-requirements/
- **Gate.** submission-blocker — state: likely met, **UNVERIFIED** for Hermes
- **State.** Of the listed SDKs, only `hermes` is used (React Native's engine; Google sign-in goes through Supabase OAuth, not the GoogleSignIn SDK, `mobile/src/state/useAuthFlow.ts:241`). No Hermes manifest is in `node_modules`; it arrives as a prebuilt binary at pod install. Accepted TestFlight uploads suggest it passes. Confirm with Xcode's privacy report on an archive or with the upload emails.

### APL-61 · The app's own privacy manifest
- **Required.** A privacy manifest records `NSPrivacyTracking`, `NSPrivacyTrackingDomains`, `NSPrivacyCollectedDataTypes` and `NSPrivacyAccessedAPITypes`. Expo writes it from `expo.ios.privacyManifests`.
- **Source.** https://developer.apple.com/documentation/bundleresources/privacy-manifest-files ; https://docs.expo.dev/guides/apple-privacy/
- **Gate.** should
- **State.** No `privacyManifests` key in `mobile/app.json`. Add one with `NSPrivacyTracking: false`, the collected data types matching APL-48, and the API reasons from APL-59.

### APL-62 · Scene-based life cycle
- **Required.** "In the next major release following iOS 26, UIScene lifecycle will be required when building with the latest SDK; otherwise, your app won't launch."
- **Source.** https://developer.apple.com/documentation/technotes/tn3187-migrating-to-the-uikit-scene-based-life-cycle
- **Gate.** submission-blocker (once building with the iOS 27 SDK) — state: met
- **State.** Met. `enableSceneSupport: true` (`mobile/app.json:80-86`).

### APL-63 · App icon
- **Required.** A 1024 × 1024 App Store icon without transparency (screenshots and icons "can't include alpha channels", and 2.3.8 asks icons to suit 4+).
- **Source.** https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications ; https://developer.apple.com/app-store/review/guidelines/#accurate-metadata
- **Gate.** submission-blocker — state: met
- **State.** Met. `mobile/assets/brand/resbite-icon.png` is 1024 × 1024 RGB with no alpha (checked with `file`).

### APL-64 · Register the email sender with Apple's private relay
- **Required.** "To send emails to users with private email addresses, you must register your outbound emails or email domains and use Sender Policy Framework (SPF) to authenticate your outbound emails."
- **Source.** https://developer.apple.com/documentation/signinwithapple/communicating-using-the-private-email-relay-service
- **Gate.** should
- **State.** Not recorded. The only mention is that Apple's relay "may not deliver" deletion codes (`docs/superpowers/specs/2026-10-21-gi2-guest-accounts-design.md:47`). Register the confirmation-email domain so messages to `privaterelay.appleid.com` addresses arrive.

### APL-65 · Sign in with Apple keys for server calls
- **Required.** The revoke and token endpoints need a `client_secret` JWT signed with the Sign in with Apple private key. Supabase notes "Apple requires you to generate a new secret key every 6 months" for its web OAuth secret.
- **Source.** https://developer.apple.com/documentation/signinwithapplerestapi/revoke-tokens ; https://supabase.com/docs/guides/auth/social-login/auth-apple
- **Gate.** should (needed for APL-27)
- **State.** Not built. A server function can mint a short-lived JWT from the `.p8` key per call, which avoids the six-month rotation. The key must stay in server secrets only.

---

## 13. Accessibility

### APL-66 · Accessibility Nutrition Labels
- **Required.** "Providing these labels will be voluntary to start… over time, you'll be required to share accessibility support details to submit new apps and app updates." Features: VoiceOver, Voice Control, Larger Text, Dark Interface, Differentiate Without Color Alone, Sufficient Contrast, Reduced Motion, Captions, Audio Descriptions. A feature can be claimed only if all common tasks work with it.
- **Source.** https://developer.apple.com/help/app-store-connect/manage-app-accessibility/overview-of-accessibility-nutrition-labels/
- **Gate.** nice
- **State.** Larger Text and Reduced Motion have been checked in parts (`docs/implementation-status.md:28`); VoiceOver on device is unverified there. The app is light-only (`mobile/app.json:8`), so Dark Interface would be "not supported".

---

## 14. Open questions and unverified points

1. **Territories at launch.** UK only, UK and EU, or worldwide? This decides APL-52, APL-53 and APL-56.
2. **Developer account type.** Organisation or individual decides what the DSA shows on EU product pages and the seller name. The public phone and email must be chosen.
3. **Wellness tab.** Remove it for the App Store build, or make it real? Keeping sample data is a likely 2.1 rejection.
4. **SMS provider and the reviewer's sign-in.** Test mode must end before release (APL-9), which needs a live SMS sender. Which demo-account route (email account with a verified phone, or a fixed test number) will App Review use?
5. **Hermes privacy manifest and signature** (APL-60). UNVERIFIED; confirm with an Xcode privacy report or past upload emails.
6. **App Privacy classifications** (APL-48): chat as "Emails or Text Messages"; push token as "Device ID"; city and date of birth. UNVERIFIED judgement calls.
7. **The 24-hour standard and the "zero tolerance" terms** (APL-5, APL-7). Seen only in rejection letters quoted on Apple's forums, not in the guideline text. UNVERIFIED.
8. **"Age Assurance" in the questionnaire.** Whether a self-declared tick counts. UNVERIFIED.
9. **Public legal pages.** Whether the marketing site already serves privacy and terms pages was not checked (no product-name fetches). UNVERIFIED.
10. **Account-deletion event name** in Sign in with Apple notifications: the current page shows `account-deleted`; accept both spellings.
11. **Next Xcode minimum.** No date published for an Xcode 27 / iOS 27 SDK requirement as of 17 November 2026.

---

## 15. Sources

Apple, App Review
- App Review Guidelines (last updated 16 October 2026): https://developer.apple.com/app-store/review/guidelines/
- Guideline changes, 16 October 2026: https://developer.apple.com/news/?id=92th7e5i
- Nonconsensual imagery and bait-and-switch update: https://developer.apple.com/news/?id=vvzx6cul
- Providing information for a complete review: https://developer.apple.com/help/app-review/before-submitting-for-review/complete-review
- Offering account deletion in your app: https://developer.apple.com/support/offering-account-deletion-in-your-app/
- 5.1.1(v) account deletion reference: https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion/

Apple, App Store Connect Help
- App information: https://developer.apple.com/help/app-store-connect/reference/app-information/app-information
- Platform version information: https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information
- Required, localisable and editable properties: https://developer.apple.com/help/app-store-connect/reference/app-information/required-localizable-and-editable-properties
- Screenshot specifications: https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications
- Manage app privacy: https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy
- Age ratings values and definitions: https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions
- Set an app age rating: https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating
- Custom licence agreement: https://developer.apple.com/help/app-store-connect/manage-app-information/provide-a-custom-license-agreement
- DSA trader requirements: https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements
- Export compliance overview: https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance
- Accessibility Nutrition Labels: https://developer.apple.com/help/app-store-connect/manage-app-accessibility/overview-of-accessibility-nutrition-labels/

Apple, privacy and documentation
- App privacy details: https://developer.apple.com/app-store/app-privacy-details/
- User privacy and data use (tracking): https://developer.apple.com/app-store/user-privacy-and-data-use/
- Privacy manifest files: https://developer.apple.com/documentation/bundleresources/privacy-manifest-files
- Required reason API: https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api
- Third-party SDK requirements: https://developer.apple.com/support/third-party-SDK-requirements/
- Encryption export regulations: https://developer.apple.com/documentation/security/complying-with-encryption-export-regulations
- TN3187 scene life cycle: https://developer.apple.com/documentation/technotes/tn3187-migrating-to-the-uikit-scene-based-life-cycle
- Upcoming requirements: https://developer.apple.com/news/upcoming-requirements/

Apple, Sign in with Apple
- HIG, Sign in with Apple: https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple
- Revoke tokens: https://developer.apple.com/documentation/signinwithapplerestapi/revoke-tokens
- Server-to-server notifications: https://developer.apple.com/documentation/signinwithapple/processing-changes-for-sign-in-with-apple-accounts
- Enabling server-to-server notifications: https://developer.apple.com/help/account/configure-app-capabilities/enabling-server-to-server-notifications
- Private email relay: https://developer.apple.com/documentation/signinwithapple/communicating-using-the-private-email-relay-service

Apple, age assurance
- Age assurance Q&A: https://developer.apple.com/support/age-assurance/
- Brazil, Australia, Singapore, Utah, Louisiana (24 February 2026): https://developer.apple.com/news/?id=f5zj08ey
- Texas paused (23 December 2025): https://developer.apple.com/news/?id=8jzbigf4
- Texas resumed (3 June 2026): https://developer.apple.com/news/?id=sg176nne
- Texas first notice (4 November 2025): https://developer.apple.com/news/?id=2ezb6jhj

Apple, legal
- Standard EULA: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
- Minimum terms for a custom EULA: https://www.apple.com/legal/internet-services/itunes/appstore/dev/minterms/

Vendors
- Expo, Apple privacy manifests: https://docs.expo.dev/guides/apple-privacy/
- Supabase, Login with Apple: https://supabase.com/docs/guides/auth/social-login/auth-apple
- Supabase, Phone login (test numbers): https://supabase.com/docs/guides/auth/phone-login

Forum material used only where marked UNVERIFIED
- https://developer.apple.com/forums/thread/116703
